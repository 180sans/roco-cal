import { useLatestEffect } from "../../services/useLatestRequest";
import type { RequestTicket } from "../../services/latestRequest";
import { type UnitState, type Pet } from "../../services/desktopTypes";
import { useState } from "react";
import { cachedTraitInfo } from "../../services/desktopApi";
import { parsePersonality, petNameOnly } from "../../domain/unitState";
import { type PluginOverlayLayout } from "../plugin/layout";
import { EntityLabel } from "../../components/common/EntityLabel";
import { NumberInput } from "../../components/common/Controls";
import { RefreshButton } from "../../components/common/ActionButtons";
import { FloatingTeamPanel } from "../plugin/PluginPanels";

type SpeedScenario = { label: "速度-" | "速度" | "速度+" | "速度++"; value: number };

type SpeedModifiers = { flat: number; percent: number };

function personalityValue(value: string | null, stat: string, direction: 1 | -1) {
  const parsed = parsePersonality(value);
  if (parsed.stat !== stat) return null;
  const amount = Number(parsed.amount);
  return direction * (Number.isFinite(amount) && amount > 0 ? amount : direction > 0 ? 0.2 : 0.1);
}

function speedValue(raceValue: number, iv: number, personality: number | null) {
  const level = 60;
  const star = 5;
  const effort = 10 * star;
  const effectiveIv = iv + iv * star;
  let base = Math.floor(level * (raceValue / 100) + 50 * (raceValue / 100) + 10 + 0.5)
    + Math.floor(level * ((effectiveIv / 2) / 100) + 50 * ((effectiveIv / 2) / 100) + 0.5);
  // Match calc_attr's confirmed exception for original race 105 with zero talent.
  if (raceValue === 105 && iv === 0) base -= 1;
  return Math.floor((base * (1 + (personality || 0))) + effort + 0.5);
}

function speedScenarios(value: UnitState, pets: Pet[], modifiers: SpeedModifiers = { flat: 0, percent: 0 }): SpeedScenario[] {
  // display_name is a user-defined preset label; calculations must use the pet identity.
  const petName = value.mega_form || value.name;
  const findPet = (name: string) => pets.find((item) => item.label === name || item.name === name || `${item.id}${item.name}` === name);
  const findEvolution = (name: string) => findPet(name) || findPet(name.replace(/^\d+/, ""));
  let pet = findPet(petName);
  // Match battle calculation: resolve the selected form, devolution, then legacy mega.
  for (let step = 0; pet && step < value.devolution; step += 1) {
    const previous = pet.prevForms?.[0];
    const previousPet = previous ? findEvolution(previous) : undefined;
    if (!previousPet) break;
    pet = previousPet;
  }
  if (pet && value.mega && !value.mega_form) {
    const next = pet.nextForms?.[0];
    pet = (next ? findEvolution(next) : undefined) || pet;
  }
  if (!pet || typeof pet.spd !== "number") return [];
  const configuredIv = value.iv?.spd;
  const speedPersonality = personalityValue(value.personality_bouns, "spd", 1)
    ?? personalityValue(value.personality_down, "spd", -1);
  // A chosen personality that affects another stat still proves speed has no personality modifier.
  const configuredPersonality = speedPersonality ?? (value.personality_bouns || value.personality_down ? 0 : null);
  const defaults: Array<{ label: SpeedScenario["label"]; iv: number; personality: number | null }> = [
    { label: "速度-", iv: 0, personality: -0.1 },
    { label: "速度", iv: 0, personality: null },
    { label: "速度+", iv: 10, personality: null },
    { label: "速度++", iv: 10, personality: 0.2 },
  ];
  const matches = defaults
    .filter((scenario) =>
      (configuredIv === undefined || (scenario.iv > 0) === (configuredIv > 0))
      && (configuredPersonality === null
        || (configuredPersonality === 0 ? scenario.personality === null : scenario.personality !== null && (scenario.personality > 0) === (configuredPersonality > 0))),
    )
    .map((scenario) => ({
      ...scenario,
      iv: configuredIv ?? scenario.iv,
      personality: configuredPersonality === null ? scenario.personality : configuredPersonality || null,
    }));
  const scenarios: Array<{ label: SpeedScenario["label"]; iv: number; personality: number | null }> = matches.length ? matches : [{
    label: configuredPersonality && configuredPersonality < 0 ? "速度-" : configuredIv && configuredPersonality ? "速度++" : configuredIv ? "速度+" : "速度",
    iv: configuredIv ?? 0,
    personality: configuredPersonality,
  }];
  return scenarios.map((scenario) => ({
    label: scenario.label,
    value: Math.floor((speedValue(pet.spd!, scenario.iv, scenario.personality) + (value.speed_buff || 0) + modifiers.flat) * (1 + modifiers.percent)),
  }));
}

function traitSpeedModifiers(runtime: any, weather: string, recipient: "self" | "opponent"): SpeedModifiers {
  let flat = 0;
  let percent = 0;
  if (!runtime?.active || !Array.isArray(runtime.resolved_effects)) return { flat, percent };
  for (const effect of runtime.resolved_effects) {
    if (effect?.kind !== "stat_buff") continue;
    const stats = Array.isArray(effect.stats) ? effect.stats : [];
    if (!stats.includes("spd")) continue;
    const target = effect.target;
    if (target !== "all" && (recipient === "self" ? target !== "self" && target != null : target !== "opponent")) continue;
    const context = effect.context;
    if (context?.subject === "weather" && effect.context_mode && effect.context_mode !== weather) continue;
    const numeric = Number(effect.value);
    if (!Number.isFinite(numeric)) continue;
    const valueType = effect.value_type === "flat" || effect.value_type === "percent"
      ? effect.value_type
      : Math.abs(numeric) <= 1 ? "percent" : "flat";
    if (valueType === "percent") percent += numeric;
    else flat += numeric;
  }
  return { flat, percent };
}

function addSpeedModifiers(first: SpeedModifiers, second: SpeedModifiers): SpeedModifiers {
  return { flat: first.flat + second.flat, percent: first.percent + second.percent };
}

function SpeedLine({ left, right, pets, weather, layout, buffLayout, onLayoutChange, onBuffLayoutChange, onChangeLeft, onChangeRight }: {
  left: UnitState;
  right: UnitState;
  pets: Pet[];
  weather: string;
  layout: PluginOverlayLayout;
  buffLayout: PluginOverlayLayout;
  onLayoutChange: (partial: Partial<PluginOverlayLayout>) => void;
  onBuffLayoutChange: (partial: Partial<PluginOverlayLayout>) => void;
  onChangeLeft: (partial: Partial<UnitState>) => void;
  onChangeRight: (partial: Partial<UnitState>) => void;
}) {
  const [leftRuntime, setLeftRuntime] = useState<any>(null);
  const [rightRuntime, setRightRuntime] = useState<any>(null);
  const loadRuntime = (value: UnitState, setter: (runtime: any) => void, request: RequestTicket) => {
    const traitQuery = value.trait_override_query || value.name;
    const selectedMegaForm = value.trait_override_query ? null : value.mega_form;
    if (!traitQuery) {
      setter(null);
      return;
    }
    void cachedTraitInfo({
      query: traitQuery,
      mega: !value.trait_override_query && Boolean(value.mega || selectedMegaForm),
      megaForm: selectedMegaForm,
      triggered: value.trait_triggered,
      stacks: value.trait_stacks,
      choices: value.trait_choices,
    }).then((data) => { if (request.isCurrent()) setter(data.runtime); }).catch(() => { if (request.isCurrent()) setter(null); });
  };
  useLatestEffect((request) => loadRuntime(left, setLeftRuntime, request), [left.name, left.trait_override_query, left.mega, left.mega_form, left.trait_triggered, left.trait_stacks, left.trait_choices]);
  useLatestEffect((request) => loadRuntime(right, setRightRuntime, request), [right.name, right.trait_override_query, right.mega, right.mega_form, right.trait_triggered, right.trait_stacks, right.trait_choices]);
  const leftModifiers = addSpeedModifiers(traitSpeedModifiers(leftRuntime, weather, "self"), traitSpeedModifiers(rightRuntime, weather, "opponent"));
  const rightModifiers = addSpeedModifiers(traitSpeedModifiers(rightRuntime, weather, "self"), traitSpeedModifiers(leftRuntime, weather, "opponent"));
  const leftScenarios = speedScenarios(left, pets, leftModifiers);
  const rightScenarios = speedScenarios(right, pets, rightModifiers);
  const sideName = (value: UnitState, fallback: string) => petNameOnly(value.display_name || value.name) || fallback;
  const renderSide = (value: UnitState, scenarios: SpeedScenario[], fallback: string) => (
    <div className="speed-line-side">
      <strong><EntityLabel kind="pet" value={value.name}>{sideName(value, fallback)}</EntityLabel></strong>
      <div className="speed-line-values">
        {scenarios.length
          ? scenarios.map((item) => <span key={item.label}><em>{item.label}</em>{item.value}</span>)
          : <span>未选择精灵</span>}
      </div>
    </div>
  );
  const renderBuffRow = (value: UnitState, modifiers: SpeedModifiers, onChange: (partial: Partial<UnitState>) => void) => {
    const total = Math.round((value.speed_buff || 0) + modifiers.flat);
    const setTotal = (next: number) => onChange({ speed_buff: Math.min(999, Math.max(-999, next)) - modifiers.flat });
    return (
      <div className="speed-buff-row">
        <NumberInput value={total} min={-999} max={999} step={10} onChange={setTotal} />
        <span className="speed-buff-percent">{`${modifiers.percent >= 0 ? "+" : ""}${Math.round(modifiers.percent * 100)}%`}</span>
        <RefreshButton type="button" className="compact-button speed-buff-reset" onClick={() => onChange({ speed_buff: 0 })} />
      </div>
    );
  };
  return <>
    <FloatingTeamPanel className="speed-line" overlayId="speed-line" layout={layout} onLayoutChange={onLayoutChange}>
      <div className="speed-line-sides">
        {renderSide(left, leftScenarios, "己方")}
        {renderSide(right, rightScenarios, "敌方")}
      </div>
    </FloatingTeamPanel>
    <FloatingTeamPanel
      className="speed-line speed-buffs"
      layout={{ ...buffLayout, x: layout.x, y: layout.y + layout.height, width: layout.width }}
      onLayoutChange={(partial) => {
        // 位置完全跟随速度线，只保留宽度与高度两个可调项。
        const next: Partial<PluginOverlayLayout> = {};
        if (partial.width !== undefined) next.width = partial.width;
        if (partial.height !== undefined) next.height = partial.height;
        onBuffLayoutChange(next);
      }}
    >
      <div className="speed-line-buffs">
        {renderBuffRow(left, leftModifiers, onChangeLeft)}
        {renderBuffRow(right, rightModifiers, onChangeRight)}
      </div>
    </FloatingTeamPanel>
  </>;
}

export { SpeedLine };
