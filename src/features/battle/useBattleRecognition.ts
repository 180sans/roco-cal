import type * as React from "react";
import { type WEATHER_OPTIONS } from "../../domain/constants";
import { type BattleSides, buildBattleUnits } from "../../domain/battleRequests";
import { type Pet, type UnitState } from "../../services/desktopTypes";
import { desktopApi, cachedSkillTriggerInfo } from "../../services/desktopApi";
import { type NumericOcrMode, prepareNumericImage } from "../../numericOcr";
import { findTraitStackMatches, matchTraitStacks } from "../../traitAlignment";
import { type DetectionGroup, type CalibrationResult, type RecognitionStatus, type TargetCapture, BATTLE_START_IMAGE_KEYS, BATTLE_LIVE_IMAGE_KEYS, BATTLE_LIVE_HEALTH_KEYS } from "../plugin/layout";
import { blankUnit } from "../../domain/unitState";
import { asError } from "../../shared/errors";
import { skillCardSlots } from "../../components/picker/skillPresentation";

type BattleRecognitionDependencies = {
  pets: Pet[];
  setLeftSlots: React.Dispatch<React.SetStateAction<UnitState[]>>;
  setRightSlots: React.Dispatch<React.SetStateAction<UnitState[]>>;
  setLeftIndex: React.Dispatch<React.SetStateAction<number>>;
  setRightIndex: React.Dispatch<React.SetStateAction<number>>;
  leftSlots: UnitState[];
  rightSlots: UnitState[];
  sameFamily: (first: Pet, second: Pet) => boolean;
  detectionRoiRefs: React.RefObject<Record<string, HTMLButtonElement | null>>;
  ocrTestMode: boolean;
  targetAttached: boolean;
  setDetectionToast: React.Dispatch<React.SetStateAction<string>>;
  recognitionBusyRef: React.RefObject<boolean>;
  calibrationSessionRef: React.RefObject<number>;
  setCalibrationResults: React.Dispatch<React.SetStateAction<Record<string, CalibrationResult>>>;
  cropDetection: (capture: TargetCapture, key: string) => string;
  setDetectionMessage: React.Dispatch<React.SetStateAction<string>>;
  calibrationGroupRef: React.RefObject<DetectionGroup | null>;
  setRecognitionStatus: React.Dispatch<React.SetStateAction<RecognitionStatus | null>>;
  setDetectedHealth: React.Dispatch<React.SetStateAction<{ enemy: string; self: string; }>>;
  setDetectedSkillPowers: React.Dispatch<React.SetStateAction<string[]>>;
  displayMode: "normal" | "plugin";
  traitAlignmentSnapshotRef: React.RefObject<string>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  currentBattleSides: (attackFromLeft?: boolean) => BattleSides;
  weather: (typeof WEATHER_OPTIONS)[number]["value"];
  patchSlot: (side: "left" | "right", index: number, partial: Partial<UnitState>) => void;
  leftIndex: number;
  teamSkillCardCount: number;
  leftAttacks: boolean;
  rightIndex: number;
};

// Recreate the original render closures; state, effects and refs remain in the page.
function useBattleRecognition(dependencies: BattleRecognitionDependencies) {
  const { pets, setLeftSlots, setRightSlots, setLeftIndex, setRightIndex, leftSlots, rightSlots, sameFamily, detectionRoiRefs, ocrTestMode, targetAttached, setDetectionToast, recognitionBusyRef, calibrationSessionRef, setCalibrationResults, cropDetection, setDetectionMessage, calibrationGroupRef, setRecognitionStatus, setDetectedHealth, setDetectedSkillPowers, displayMode, traitAlignmentSnapshotRef, setError, currentBattleSides, weather, patchSlot, leftIndex, teamSkillCardCount, leftAttacks, rightIndex } = dependencies;

  function petForRecognition(label: string) {
    const normalized = label.trim();
    if (normalized === "361加油蟹" || normalized === "加油蟹") {
      return pets.find((pet) => [pet.label, pet.name, `${pet.id}${pet.name}`].includes("加油蟹（单只海葵的样子）"));
    }
    return pets.find((pet) => [pet.label, pet.name, `${pet.id}${pet.name}`].includes(normalized));
  }

  function applyRecognizedPets(side: "left" | "right", predictions: Array<{ label: string; confidence?: number; topK?: Array<{ label: string; confidence: number }> }>) {
    const recognized = predictions.map((prediction) => petForRecognition(prediction.label)).filter((pet): pet is Pet => Boolean(pet));
    const setter = side === "left" ? setLeftSlots : setRightSlots;
    const setIndex = side === "left" ? setLeftIndex : setRightIndex;
    const visibleSlots = side === "left" ? leftSlots : rightSlots;
    const classifierCandidates = predictions.flatMap((prediction) => prediction.topK || [{ label: prediction.label, confidence: prediction.confidence || 0 }]);
    const hasSixWayCandidate = visibleSlots.every((slot) => slot.name) && classifierCandidates.some((candidate) => Boolean(petForRecognition(candidate.label)));
    if (!recognized.length && !hasSixWayCandidate) return 0;
    const directMatch = recognized.map((pet) => visibleSlots.findIndex((slot) => {
      const current = petForRecognition(slot.name) || pets.find((item) => item.label === slot.name || `${item.id}${item.name}` === slot.name);
      return Boolean(current && sameFamily(current, pet));
    })).find((index) => index >= 0);
    const empty = visibleSlots.findIndex((slot) => !slot.name);
    // Once every slot is occupied, classification must choose one of these
    // six families rather than discarding a non-exact top-1 recognition.
    const sixWayMatch = empty >= 0 ? -1 : visibleSlots.reduce((best, slot, index) => {
      const current = petForRecognition(slot.name) || pets.find((item) => item.label === slot.name || `${item.id}${item.name}` === slot.name);
      if (!current) return best;
      const confidence = classifierCandidates
        .reduce((score, candidate) => {
          const candidatePet = petForRecognition(candidate.label);
          return candidatePet && sameFamily(current, candidatePet) ? Math.max(score, candidate.confidence) : score;
        }, -1);
      return confidence > best.confidence ? { index, confidence } : best;
    }, { index: -1, confidence: -1 }).index;
    const selected = directMatch ?? (empty >= 0 ? empty : sixWayMatch);
    setter((slots) => {
      const next = [...slots];
      for (const pet of recognized) {
        const matching = next.findIndex((slot) => {
          const current = petForRecognition(slot.name) || pets.find((item) => item.label === slot.name || `${item.id}${item.name}` === slot.name);
          return Boolean(current && sameFamily(current, pet));
        });
        if (matching >= 0) continue;
        const openSlot = next.findIndex((slot) => !slot.name);
        if (openSlot >= 0) next[openSlot] = { ...blankUnit(), name: `${pet.id}${pet.name}` };
      }
      return next;
    });
    if (selected >= 0) setIndex(selected);
    return recognized.length || (selected >= 0 ? 1 : 0);
  }

  function logRecognitionTiming(message: string) {
    void desktopApi.recordRecognitionTiming(message).catch(() => undefined);
  }

  function invokeRecognitionTimed<T>(request: () => Promise<T>, stage: string) {
    const started = performance.now();
    return request().then((result) => {
      logRecognitionTiming(`${stage} command round-trip ${(performance.now() - started).toFixed(1)} ms`);
      return result;
    });
  }

  async function targetCanvas() {
    const captureStarted = performance.now();
    const regions = Object.entries(detectionRoiRefs.current).flatMap(([key, element]) => {
      const bounds = element?.getBoundingClientRect();
      if (!bounds || window.innerWidth <= 0 || window.innerHeight <= 0) return [];
      return [{ key, x: bounds.left / window.innerWidth, y: bounds.top / window.innerHeight, right: bounds.right / window.innerWidth, bottom: bounds.bottom / window.innerHeight }];
    });
    const captured = await desktopApi.captureOverlayTarget({
      regions,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    const payloadChars = Object.values(captured.regions).reduce((total, value) => total + value.length, 0);
    logRecognitionTiming(`ROI capture command round-trip ${(performance.now() - captureStarted).toFixed(1)} ms; ${regions.length} regions; ${payloadChars} data URL chars`);
    return captured;
  }

  async function recognizeNumericImages(images: Array<{ key: string; imageDataUrl: string; mode: NumericOcrMode }>) {
    const preprocessingStarted = performance.now();
    const preparedImages = await Promise.all(images.map(async (image) => ({
      ...image,
      imageDataUrl: await prepareNumericImage(image.imageDataUrl),
    })));
    logRecognitionTiming(`numeric image decode + resize/grayscale/PNG ${(performance.now() - preprocessingStarted).toFixed(1)} ms; images ${preparedImages.length}`);
    const inferencePromise = invokeRecognitionTimed(() => desktopApi.recognizeImages(preparedImages), `numeric inference (${preparedImages.length} images)`);
    const [, result] = await Promise.all([saveOcrDebugImages("numeric", preparedImages), inferencePromise]);
    return result;
  }

  async function saveOcrDebugImages(category: string, images: Array<{ key?: string; imageDataUrl: string }>) {
    if (!ocrTestMode) return;
    await desktopApi.saveOcrDebugImages(category, images);
  }

  async function testCalibration(kind: DetectionGroup | "powers") {
    if (!targetAttached) { setDetectionToast("请先绑定目标窗口"); return; }
    if (recognitionBusyRef.current) return;
    recognitionBusyRef.current = true;
    const session = calibrationSessionRef.current;
    const keys: readonly string[] = kind === "battleStart" ? BATTLE_START_IMAGE_KEYS : kind === "battleLive" ? [...BATTLE_LIVE_IMAGE_KEYS, ...BATTLE_LIVE_HEALTH_KEYS] : ["skill1", "skill2", "skill3", "skill4"];
    const completed: Record<string, CalibrationResult> = {};
    const publish = () => {
      if (session === calibrationSessionRef.current) setCalibrationResults((current) => ({ ...current, ...completed }));
    };
    const setItem = (key: string, text: string, success: boolean) => {
      completed[key] = { status: success ? "success" : "failure", text };
      publish();
    };
    setCalibrationResults((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, { status: "loading", text: "识别中…" }])) }));
    try {
      const capture = await targetCanvas();
      const tasks: Array<{ keys: readonly string[]; run: () => Promise<void> }> = [];
      if (kind !== "powers") {
        const imageKeys = kind === "battleStart" ? BATTLE_START_IMAGE_KEYS : BATTLE_LIVE_IMAGE_KEYS;
        tasks.push({ keys: imageKeys, run: async () => {
          const images = imageKeys.map((key) => ({ key, imageDataUrl: cropDetection(capture, key) }));
          const result = await invokeRecognitionTimed(() => desktopApi.classifyImageSamples({ images }), "calibration classifier");
          imageKeys.forEach((key, index) => {
            const label = result.items[index]?.label?.trim();
            setItem(key, label || "识别失败：没有结果", Boolean(label));
          });
        } });
      }
      if (kind === "battleLive") {
        BATTLE_LIVE_HEALTH_KEYS.forEach((key) => tasks.push({ keys: [key], run: async () => {
          const mode = key === "selfHealth" ? "self_health" : "enemy_health";
          const response = await recognizeNumericImages([{ key, imageDataUrl: cropDetection(capture, key), mode }]);
          const raw = response.items[0]?.text?.trim() || "";
          const health = key === "selfHealth" ? raw.match(/^\d+\/\d+$/)?.[0] : raw.match(/(?:100|[1-9]?\d)\s*%?/)?.[0]?.replace(/\s/g, "");
          setItem(key, health || raw || "识别失败：没有结果", Boolean(health));
        } }));
      }
      if (kind === "powers") tasks.push({ keys, run: async () => {
        const response = await recognizeNumericImages(keys.map((key) => ({ key, imageDataUrl: cropDetection(capture, key), mode: "power" })));
        keys.forEach((key, index) => {
          const power = response.items[index]?.text?.trim();
          setItem(key, power || "识别失败：没有结果", Boolean(power && /^\d+$/.test(power)));
        });
      } });
      const outcomes = await Promise.allSettled(tasks.map((task) => task.run()));
      outcomes.forEach((outcome, index) => {
        if (outcome.status === "rejected") tasks[index].keys.forEach((key) => setItem(key, `识别失败：${asError(outcome.reason)}`, false));
      });
    } catch (error) {
      keys.forEach((key) => setItem(key, `识别失败：${asError(error)}`, false));
    } finally {
      if (session === calibrationSessionRef.current) {
        const successCount = Object.values(completed).filter((item) => item.status === "success").length;
        const message = `测试完成：成功 ${successCount}/${keys.length}，失败 ${keys.length - successCount}`;
        setDetectionMessage(message);
        setDetectionToast(message);
      }
      recognitionBusyRef.current = false;
    }
  }

  async function recognizeDetection(group: DetectionGroup) {
    if (calibrationGroupRef.current) {
      if (calibrationGroupRef.current === group) await testCalibration(group);
      else setDetectionToast(`请使用当前校对框的快捷键：${calibrationGroupRef.current === "battleStart" ? "Ctrl+B" : "Ctrl+U / Ctrl+P"}`);
      return;
    }
    const notifyDetection = (message: string) => { setDetectionMessage(message); setDetectionToast(message); };
    if (!targetAttached) { notifyDetection("请先绑定目标窗口"); return; }
    if (recognitionBusyRef.current) return;
    recognitionBusyRef.current = true;
    const updateStatus = (label: string, detail: string, progress: string) => {
      setRecognitionStatus({ label, detail, progress });
      setDetectionMessage(`${label}：${detail}`);
    };
    updateStatus(group === "battleStart" ? "战斗开始识别" : "战斗内识别", "正在截取目标窗口", "准备中");
    const recognitionStarted = performance.now();
    try {
        const capture = await targetCanvas();
      if (group === "battleStart") {
        updateStatus("战斗开始识别", "正在识别敌方队伍图像框", `1/${BATTLE_START_IMAGE_KEYS.length} 组`);
        const images = BATTLE_START_IMAGE_KEYS.map((key) => ({ key, imageDataUrl: cropDetection(capture, key) }));
        const [, result] = await Promise.all([
          saveOcrDebugImages("battle-start", images),
          invokeRecognitionTimed(() => desktopApi.classifyImageSamples({ images }), "battle-start classifier"),
        ]);
        const count = applyRecognizedPets("right", result.items);
        notifyDetection(`战斗开始识别完成：识别 ${count} 只，已导入敌方队伍`);
      } else {
        updateStatus("战斗内识别", "正在并行识别双方精灵和血量", "4 个识别框");
        const images = BATTLE_LIVE_IMAGE_KEYS.map((key) => ({ key, imageDataUrl: cropDetection(capture, key), mode: "text" }));
        const healthImages = BATTLE_LIVE_HEALTH_KEYS.map((key) => {
          const mode = key === "selfHealth" ? "self_health" : "enemy_health";
          return { key, imageDataUrl: cropDetection(capture, key), mode } as const;
        });
        const [imageResult, enemyHealthResult, selfHealthResult] = await Promise.all([
          (async () => {
            const [, result] = await Promise.all([
              saveOcrDebugImages("battle-live-pets", images),
              invokeRecognitionTimed(() => desktopApi.classifyImageSamples({ images }), "battle-live classifier"),
            ]);
            return result;
          })(),
          recognizeNumericImages([healthImages[0]]),
          recognizeNumericImages([healthImages[1]]),
        ]);
        applyRecognizedPets("right", imageResult.items[0] ? [imageResult.items[0]] : []);
        applyRecognizedPets("left", imageResult.items[1] ? [imageResult.items[1]] : []);
        const enemyRaw = enemyHealthResult.items[0]?.text || "";
        const selfRaw = selfHealthResult.items[0]?.text || "";
        const enemy = enemyRaw.match(/(?:100|[1-9]?\d)\s*%?/)?.[0]?.replace(/\s/g, "");
        const self = selfRaw.match(/^\d+\/\d+$/)?.[0];
        setDetectedHealth((current) => ({
          enemy: enemy && Number(enemy.replace("%", "")) <= 100 ? `${enemy.replace("%", "")}%` : (enemyRaw.trim() || "识别失败"),
          self: self || current.self,
        }));
        notifyDetection("战斗内识别完成：已更新双方精灵和血量");
      }
    } catch (error) { notifyDetection(`识别失败：${asError(error)}`); }
    finally {
      logRecognitionTiming(`${group} end-to-end ${(performance.now() - recognitionStarted).toFixed(1)} ms`);
      recognitionBusyRef.current = false;
      setRecognitionStatus(null);
    }
  }

  async function recognizeSkillPowers() {
    if (calibrationGroupRef.current) {
      if (calibrationGroupRef.current === "battleLive") await testCalibration("powers");
      else setDetectionToast("战斗开始框请使用 Ctrl+B 测试");
      return;
    }
    const notifyDetection = (message: string) => { setDetectionMessage(message); setDetectionToast(message); };
    if (!targetAttached) { notifyDetection("请先绑定目标窗口"); return; }
    if (recognitionBusyRef.current) return;
    recognitionBusyRef.current = true;
    const recognitionStarted = performance.now();
    setRecognitionStatus({ label: "技能威力识别", detail: "正在识别 4 个技能威力框", progress: "进行中" });
    try {
      const capture = await targetCanvas();
      const response = await recognizeNumericImages(
        (["skill1", "skill2", "skill3", "skill4"] as const).map((key) => ({ key, imageDataUrl: cropDetection(capture, key), mode: "power" })),
      );
      const powers = response.items.map((item) => item.text.trim() || "识别失败");
      setDetectedSkillPowers(powers);
      const calibrated = await calibratePowerStacks(powers);
      notifyDetection(calibrated ? "技能威力 OCR 识别完成，已自动修正叠层" : "技能威力 OCR 识别完成，未匹配到唯一叠层修正");
    } catch (error) { notifyDetection(`技能威力识别失败：${asError(error)}`); }
    finally {
      logRecognitionTiming(`skill powers end-to-end ${(performance.now() - recognitionStarted).toFixed(1)} ms`);
      recognitionBusyRef.current = false;
      setRecognitionStatus(null);
    }
  }

  async function alignTraitStacks() {
    if (displayMode !== "plugin") return;
    const notify = (message: string) => { setDetectionMessage(message); setDetectionToast(message); };
    if (calibrationGroupRef.current) { notify("请先退出识别框校对，再使用 Ctrl+T 特性对齐"); return; }
    if (!targetAttached) { notify("请先绑定目标窗口"); return; }
    if (recognitionBusyRef.current) { notify("正在识别，请等待完成后再进行特性对齐"); return; }
    const snapshot = traitAlignmentSnapshotRef.current;
    const recognitionStarted = performance.now();
    const checkSnapshot = () => {
      if (snapshot !== traitAlignmentSnapshotRef.current) throw new Error("对齐期间精灵、加成或识别配置已变化，请重新按 Ctrl+T");
    };
    recognitionBusyRef.current = true;
    setError("");
    setRecognitionStatus({ label: "特性对齐", detail: "正在检查特性层数是否影响显示威力", progress: "准备中" });
    try {
      // OCR 框对应我方技能，与伤害计算方向无关；Ctrl+T 只修正我方特性层数。
      const candidatePayload = {
        ...buildBattleUnits(currentBattleSides(true)),
        weather,
        min_stacks: 0,
        max_stacks: 10,
      };
      const candidatesPromise = invokeRecognitionTimed(() => desktopApi.traitPowerCandidates(candidatePayload), "trait alignment candidate calculation (0-10)").then(
        (data) => ({ data }),
        (error: unknown) => ({ error }),
      );
      checkSnapshot();
      setRecognitionStatus({ label: "特性对齐", detail: "正在识别我方技能威力", progress: "OCR 识别中" });
      const capture = await targetCanvas();
      const ocrPromise = recognizeNumericImages(
        (["skill1", "skill2", "skill3", "skill4"] as const).map((key) => ({ key, imageDataUrl: cropDetection(capture, key), mode: "power" })),
      );
      const [candidateResult, response] = await Promise.all([candidatesPromise, ocrPromise]);
      if ("error" in candidateResult) throw candidateResult.error;
      const { data } = candidateResult;
      checkSnapshot();
      const powers = Array.from({ length: 4 }, (_, index) => response.items[index]?.text?.trim() || "识别失败");
      setDetectedSkillPowers(powers);
      const initialMatchStarted = performance.now();
      let matchingStacks = findTraitStackMatches(data, powers);
      logRecognitionTiming(`trait alignment initial candidate matching ${(performance.now() - initialMatchStarted).toFixed(1)} ms`);
      let allCandidates = data;
      if (!data.affectedSkills.length || matchingStacks.length !== 1) {
        const extended = await invokeRecognitionTimed(() => desktopApi.traitPowerCandidates({ ...candidatePayload, min_stacks: 11, max_stacks: 99 }), "trait alignment fallback candidate calculation (11-99)");
        allCandidates = {
          ...data,
          affectedSkills: data.affectedSkills.length ? data.affectedSkills : extended.affectedSkills,
          candidates: [...data.candidates, ...extended.candidates],
        };
        if (!allCandidates.affectedSkills.length) throw new Error("当前特性叠层不影响所携技能的显示威力");
        matchingStacks = findTraitStackMatches(allCandidates, powers);
      }
      const finalMatchStarted = performance.now();
      const stacks = matchTraitStacks(allCandidates, powers);
      logRecognitionTiming(`trait alignment final candidate check ${(performance.now() - finalMatchStarted).toFixed(1)} ms`);
      patchSlot("left", leftIndex, { trait_stacks: stacks });
      notify(`特性对齐完成：${data.traitName}已修正为 ${stacks} 层`);
    } catch (error) {
      const message = `特性对齐失败：${asError(error)}`;
      setError(message);
      notify(message);
    } finally {
      logRecognitionTiming(`trait alignment end-to-end ${(performance.now() - recognitionStarted).toFixed(1)} ms`);
      recognitionBusyRef.current = false;
      setRecognitionStatus(null);
    }
  }

  async function calibratePowerStacks(powerTexts: string[]) {
    const sides = currentBattleSides();
    const { attacker } = sides;
    const nextStacks = { ...attacker.skill_trigger_stacks };
    const trials: Array<{ slot: number; skillName: string; observed: number; trigger: number; count: number; payload: Record<string, unknown> }> = [];
    let applied = false;
    const triggerInfoStarted = performance.now();
    const skillNames = powerTexts.map((rawPower, index) => {
      if (!rawPower.replace(/\D/g, "")) return null;
      const skillName = skillCardSlots(attacker.skills, teamSkillCardCount)[index];
      return skillName || null;
    });
    const triggerInfos = await Promise.all(skillNames.map((skillName) =>
      skillName ? cachedSkillTriggerInfo(skillName) : Promise.resolve(null),
    ));
    logRecognitionTiming(`power stack trigger info lookup ${(performance.now() - triggerInfoStarted).toFixed(1)} ms; skills ${skillNames.filter(Boolean).length}`);
    for (const [index, rawPower] of powerTexts.entries()) {
      const digits = rawPower.replace(/\D/g, "");
      if (!digits) continue;
      const observed = Number(digits);
      const skillName = skillNames[index];
      if (!Number.isFinite(observed) || !skillName) continue;
      const info = triggerInfos[index];
      if (!info) continue;
      for (const trigger of info.stackable) {
        if (!trigger.affects_power) continue;
        for (let count = 0; count <= (trigger.max ?? 10); count += 1) {
          const stacks = [...(attacker.skill_trigger_stacks[skillName] || [])];
          stacks[trigger.index] = count;
          trials.push({ slot: index, skillName, observed, trigger: trigger.index, count, payload: {
            ...buildBattleUnits(sides, { current_skill: skillName, skill_trigger_stacks: { ...attacker.skill_trigger_stacks, [skillName]: stacks } }), skills: [skillName], weather,
          } });
        }
      }
    }
    if (!trials.length) return false;
    const batch = await invokeRecognitionTimed(() => desktopApi.calculateQuickSkillsBatch({ requests: trials.map((trial) => ({ ...trial.payload, powers_only: true })) }), `power stack trial batch (${trials.length} trials)`);
    const matches = new Map<number, { skillName: string; candidates: Array<{ trigger: number; count: number }> }>();
    trials.forEach((trial, index) => {
      if (batch.items[index]?.items[0]?.results.some((result) => Math.round(result.effective_power) === trial.observed)) {
        const match = matches.get(trial.slot) || { skillName: trial.skillName, candidates: [] };
        match.candidates.push({ trigger: trial.trigger, count: trial.count });
        matches.set(trial.slot, match);
      }
    });
    for (const { skillName, candidates } of matches.values()) {
      if (candidates.length !== 1) continue;
      const match = candidates[0];
      const stacks = [...(nextStacks[skillName] || [])];
      stacks[match.trigger] = match.count;
      nextStacks[skillName] = stacks;
      applied = true;
    }
    if (applied) patchSlot(leftAttacks ? "left" : "right", leftAttacks ? leftIndex : rightIndex, { skill_trigger_stacks: nextStacks });
    return applied;
  }

  return { recognizeDetection, recognizeSkillPowers, targetCanvas, recognizeNumericImages, alignTraitStacks };
}

export { useBattleRecognition };
