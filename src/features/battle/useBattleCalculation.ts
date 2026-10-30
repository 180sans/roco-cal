import type * as React from "react";
import { type useLatestRequest } from "../../services/useLatestRequest";
import { type BattleSides, buildBattleUnits } from "../../domain/battleRequests";
import { type WEATHER_OPTIONS } from "../../domain/constants";
import { type BattleResult, type QuickSkillResult, type RequiredPowerResponse, type WillpowerResponse, type BuffOption, type EnemyAttackPayload, type SkillListResult, type ApplySkillBuffsResult, type SkillItem, type WillpowerElementResult, type BuffEffect, type UnitState } from "../../services/desktopTypes";
import { desktopApi, cachedListSkills } from "../../services/desktopApi";
import { type BattleContext, battleContextFromUnits, applyBuffEffect } from "../../domain/unitState";
import { type EnemyAttackSkillResponse, parseEnemyAttackHealth } from "../../enemyAttack";
import { type DetectionGroup, type TargetCapture } from "../plugin/layout";
import { type NumericOcrMode } from "../../numericOcr";
import { asError } from "../../shared/errors";
import { uniqueByOrder } from "./Results";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;
type RequestScope = ReturnType<typeof useLatestRequest>;

type BattleCalculationDependencies = {
  resultRequests: RequestScope;
  setError: Setter<string>;
  currentBattleSides: (attackFromLeft?: boolean) => BattleSides;
  weather: (typeof WEATHER_OPTIONS)[number]["value"];
  setBattleContext: Setter<BattleContext | null>;
  setResults: Setter<BattleResult[]>;
  setWillpower: Setter<WillpowerResponse | null>;
  setRequiredPower: Setter<RequiredPowerResponse | null>;
  quickSkillRequests: RequestScope;
  teamSkillCardCount: number;
  setQuickSkillResults: Setter<QuickSkillResult[] | null>;
  setQuickCalculationActive: Setter<boolean>;
  displayMode: "normal" | "plugin";
  enemyAttackPayloadRef: React.RefObject<EnemyAttackPayload | null>;
  enemyAttackRequests: RequestScope;
  targetAttached: boolean;
  calibrationGroupRef: React.RefObject<DetectionGroup | null>;
  targetCanvas: () => Promise<TargetCapture>;
  recognizeNumericImages: (images: { key: string; imageDataUrl: string; mode: NumericOcrMode }[]) => Promise<{ items: { text: string }[] }>;
  cropDetection: (capture: TargetCapture, key: string) => string;
  setDetectedHealth: Setter<{ enemy: string; self: string }>;
  setEnemyAttackResults: Setter<EnemyAttackSkillResponse | null>;
  setEnemyAttackInitialResults: Setter<EnemyAttackSkillResponse | null>;
  enemyPickerRequests: RequestScope;
  setEnemySkillData: Setter<SkillListResult>;
  setEnemySkillPicker: Setter<boolean>;
  leftAttacks: boolean;
  setSelectedWillpowerElement: Setter<string | null>;
  requiredPowerRequests: RequestScope;
  targetHp: number;
  normalizeBuffOptions: (data: ApplySkillBuffsResult) => BuffOption[];
  leftSlots: UnitState[];
  rightSlots: UnitState[];
  leftIndex: number;
  rightIndex: number;
  setLeftSlots: Setter<UnitState[]>;
  setRightSlots: Setter<UnitState[]>;
  buffOptions: BuffOption[];
  selectedBuffOption: number;
  currentBuffPayload: (skillName?: string) => Parameters<typeof desktopApi.applySkillBuffs>[0];
  setBuffOptions: Setter<BuffOption[]>;
  activeBuffSkillName: string;
};

// Keep the original render closures; the page owns state, effects and request scopes.
export function useBattleCalculation(dependencies: BattleCalculationDependencies) {
  const { resultRequests, setError, currentBattleSides, weather, setBattleContext, setResults, setWillpower, setRequiredPower, quickSkillRequests, teamSkillCardCount, setQuickSkillResults, setQuickCalculationActive, displayMode, enemyAttackPayloadRef, enemyAttackRequests, targetAttached, calibrationGroupRef, targetCanvas, recognizeNumericImages, cropDetection, setDetectedHealth, setEnemyAttackResults, setEnemyAttackInitialResults, enemyPickerRequests, setEnemySkillData, setEnemySkillPicker, leftAttacks, setSelectedWillpowerElement, requiredPowerRequests, targetHp, normalizeBuffOptions, leftSlots, rightSlots, leftIndex, rightIndex, setLeftSlots, setRightSlots, buffOptions, selectedBuffOption, currentBuffPayload, setBuffOptions, activeBuffSkillName } = dependencies;

  async function calculate(skillName?: string) {
    const request = resultRequests.start();
    setError("");
    try {
      const sides = currentBattleSides();
      const { attacker, defender } = sides;
      const data = await desktopApi.calculateBattle({ ...buildBattleUnits(sides, { current_skill: skillName || attacker.current_skill }), weather });
      if (!request.isCurrent()) return;
      setBattleContext(battleContextFromUnits(attacker, defender));
      setResults(data.results);
      setWillpower(null);
      setRequiredPower(null);
    } catch (err) {
      if (!request.isCurrent()) return;
      setError(asError(err));
      setBattleContext(null);
      setResults([]);
    }
  }

  async function calculateQuickSkills() {
    const request = quickSkillRequests.start(resultRequests.start());
    const sides = currentBattleSides();
    const { attacker } = sides;
    const skills = uniqueByOrder(attacker.skills.filter(Boolean)).slice(0, teamSkillCardCount);
    if (!skills.length) {
      setQuickSkillResults(null);
      setQuickCalculationActive(false);
      return;
    }
    setQuickCalculationActive(true);
    setError("");
    try {
      const data = await desktopApi.calculateQuickSkills({
          ...buildBattleUnits(sides),
          skills,
          weather,
        });
      if (!request.isCurrent()) return;
      setQuickSkillResults(data.items);
      setQuickCalculationActive(data.items.length > 0);
      setResults([]);
      setWillpower(null);
      setRequiredPower(null);
      setBattleContext(null);
    } catch (err) {
      if (!request.isCurrent()) return;
      setQuickSkillResults(null);
      setQuickCalculationActive(false);
      setError(asError(err));
    }
  }

  async function calculateEnemyAttackSkills(skillName?: string) {
    if (displayMode !== "plugin") return;
    const payload = skillName ? enemyAttackPayloadRef.current : {
      ...buildBattleUnits(currentBattleSides(false)),
      target_hp: 0,
      weather,
    };
    if (!payload) return;
    const request = enemyAttackRequests.start(resultRequests.start());
    const pending: { health: ReturnType<typeof parseEnemyAttackHealth>; published: EnemyAttackSkillResponse | null } = { health: null, published: null };
    // OCR and damage trials start together. Late/failed OCR never blocks the result.
    void (async () => {
      if (!targetAttached || calibrationGroupRef.current) return;
      const capture = await targetCanvas();
      const response = await recognizeNumericImages([
        { key: "selfHealth", imageDataUrl: cropDetection(capture, "selfHealth"), mode: "self_health" },
        { key: "enemyHealth", imageDataUrl: cropDetection(capture, "enemyHealth"), mode: "enemy_health" },
      ]);
      if (!request.isCurrent()) return;
      const health = parseEnemyAttackHealth(response.items[0]?.text || "");
      pending.health = health;
      const enemy = response.items[1]?.text?.trim().match(/^(100|[1-9]?\d)\s*%?$/)?.[1];
      setDetectedHealth((current) => ({
        self: health ? `${health.current}/${health.maximum}` : "识别失败",
        enemy: enemy != null ? `${enemy}%` : current.enemy,
      }));
      const published = pending.published;
      if (published && health) {
        const updated = { ...published, targetHp: health.current };
        setEnemyAttackResults((current) => current?.groups === published?.groups ? updated : current);
        setEnemyAttackInitialResults((current) => current?.groups === published?.groups ? updated : current);
      }
    })().catch(() => {
      if (request.isCurrent()) setDetectedHealth((current) => ({ ...current, self: "识别失败" }));
    });
    setError("");
    try {
      const data = await desktopApi.calculateEnemyAttackSkills({ ...payload, skill_name: skillName });
      if (!request.isCurrent()) return;
      const published = { ...data, targetHp: pending.health?.current ?? null };
      pending.published = published;
      enemyAttackPayloadRef.current = payload;
      if (!skillName) setEnemyAttackInitialResults(published);
      setEnemyAttackResults(published);
      setQuickSkillResults(null);
      setQuickCalculationActive(false);
      quickSkillRequests.invalidate();
      setResults([]);
      setWillpower(null);
      setRequiredPower(null);
      setBattleContext(null);
    } catch (err) {
      if (!request.isCurrent()) return;
      setEnemyAttackResults(null);
      setError(asError(err));
    }
  }

  async function openEnemySkillPicker() {
    const request = enemyPickerRequests.start();
    const attacker = enemyAttackPayloadRef.current?.attacker;
    if (!attacker) return;
    try {
      const data = await cachedListSkills(attacker.mega_form || attacker.name);
      if (!request.isCurrent()) return;
      const damaging = (skill: SkillItem) => ["物攻", "魔攻"].includes(skill.detail?.type || skill.type || "");
      setEnemySkillData({ petSkills: data.petSkills.filter(damaging), allSkills: data.allSkills.filter(damaging) });
      setEnemySkillPicker(true);
    } catch (err) {
      if (!request.isCurrent()) return;
      setError(asError(err));
    }
  }

  async function calculateWillpower(attackingSide?: "left" | "right") {
    const request = resultRequests.start();
    setError("");
    try {
      const attackFromLeft = attackingSide ? attackingSide === "left" : leftAttacks;
      const sides = currentBattleSides(attackFromLeft);
      const { attacker, defender } = sides;
      const data = await desktopApi.calculateWillpower({ ...buildBattleUnits(sides), weather, restrict_to_bloodline: attackFromLeft });
      if (!request.isCurrent()) return;
      setBattleContext({ ...battleContextFromUnits(attacker, defender), skillName: "愿力", defenderFirst: !attackFromLeft });
      setWillpower(data);
      setRequiredPower(null);
      const initial = data.elements[0];
      setSelectedWillpowerElement(initial?.element || null);
      setResults(initial?.results || []);
    } catch (err) {
      if (!request.isCurrent()) return;
      setError(asError(err));
      setWillpower(null);
      setResults([]);
    }
  }

  async function calculateRequiredPower() {
    const request = requiredPowerRequests.start(resultRequests.start());
    setError("");
    try {
      const sides = currentBattleSides();
      const { attacker, defender } = sides;
      const data = await desktopApi.calculateRequiredPower({ ...buildBattleUnits(sides), weather, target_hp: targetHp });
      if (!request.isCurrent()) return;
      setBattleContext(battleContextFromUnits(defender, attacker));
      setWillpower(null);
      setRequiredPower(data);
      setResults([]);
    } catch (err) {
      if (!request.isCurrent()) return;
      setError(asError(err));
      setRequiredPower(null);
      setResults([]);
    }
  }

  function selectWillpowerElement(element: WillpowerElementResult) {
    setSelectedWillpowerElement(element.element);
    setResults(element.results);
  }

  async function applyShortcutBuff(skillName: string, reverse: boolean, sourceSide: "left" | "right", optionIndex: number) {
    setError("");
    const opponentSide = sourceSide === "left" ? "right" : "left";
    let selectedOption: BuffOption | undefined;
    try {
      const data = await desktopApi.applySkillBuffs({ skill_name: skillName });
      selectedOption = normalizeBuffOptions(data)[optionIndex];
    } catch (err) {
      setError(asError(err));
      return;
    }
    if (!selectedOption) {
      setError("该技能没有可应用的 Buff");
      return;
    }

    const nextLeft = [...leftSlots];
    const nextRight = [...rightSlots];
    const applyTo = (side: "left" | "right", effect: BuffEffect) => {
      if (side === "left") {
        nextLeft[leftIndex] = applyBuffEffect(nextLeft[leftIndex], effect);
      } else {
        nextRight[rightIndex] = applyBuffEffect(nextRight[rightIndex], effect);
      }
    };

    selectedOption.effects.forEach((effect) => {
      const appliedEffect = reverse ? { ...effect, value: -effect.value } : effect;
      if (effect.target === "self" || effect.target === "both") applyTo(sourceSide, appliedEffect);
      if (effect.target === "opponent" || effect.target === "both") applyTo(opponentSide, appliedEffect);
    });
    setLeftSlots(nextLeft);
    setRightSlots(nextRight);
  }

  async function applyBuff(skillName?: string, reverse = false, sourceSide?: "left" | "right", optionIndex = selectedBuffOption) {
    setError("");
    const attackerSide = sourceSide || (leftAttacks ? "left" : "right");
    const opponentSide = attackerSide === "left" ? "right" : "left";
    let selectedOption: BuffOption | undefined;
    if (displayMode === "plugin" && !skillName) {
      selectedOption = buffOptions[optionIndex];
    } else {
      try {
        const data = await desktopApi.applySkillBuffs(currentBuffPayload(skillName));
        const latestOptions = normalizeBuffOptions(data);
        if (displayMode !== "plugin") setBuffOptions(latestOptions);
        selectedOption = latestOptions[optionIndex];
      } catch (err) {
        setError(asError(err));
        return;
      }
    }
    if (!selectedOption) {
      setError(skillName || activeBuffSkillName ? "该技能没有可应用的 Buff" : "请先选择技能");
      return;
    }

    const nextLeft = [...leftSlots];
    const nextRight = [...rightSlots];
    const applyTo = (side: "left" | "right", effect: BuffEffect) => {
      if (side === "left") {
        nextLeft[leftIndex] = applyBuffEffect(nextLeft[leftIndex], effect);
      } else {
        nextRight[rightIndex] = applyBuffEffect(nextRight[rightIndex], effect);
      }
    };

    selectedOption.effects.forEach((effect) => {
      const appliedEffect = reverse ? { ...effect, value: -effect.value } : effect;
      if (effect.target === "self" || effect.target === "both") applyTo(attackerSide, appliedEffect);
      if (effect.target === "opponent" || effect.target === "both") applyTo(opponentSide, appliedEffect);
    });
    setLeftSlots(nextLeft);
    setRightSlots(nextRight);
  }

  return { calculate, calculateQuickSkills, calculateEnemyAttackSkills, openEnemySkillPicker, calculateWillpower, calculateRequiredPower, selectWillpowerElement, applyShortcutBuff, applyBuff };
}
