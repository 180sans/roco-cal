import { type UnitState, type TeamOtherBonuses, type BuffEffect, type PresetItem } from "../services/desktopTypes";

type BattleContext = {
  defenderFirst?: boolean;
  attackerName: string;
  defenderName: string;
  attackerPetName: string;
  defenderPetName: string;
  skillName: string;
  attackerIv: Record<string, number> | null;
  attackerPersonalityBouns: string | null;
  attackerPersonalityDown: string | null;
  defenderIv: Record<string, number> | null;
  defenderPersonalityBouns: string | null;
  defenderPersonalityDown: string | null;
};

type PickerMode = "pet" | "skill" | "trait";

type BonusTool = "dedication" | "marks" | "thunderstorm";

type BonusToolPosition = { x: number; y: number; width?: number; height?: number; contentX?: number; contentY?: number };

type BonusToolPositions = Record<string, BonusToolPosition>;

type MarkField = "charge" | "wind" | "attack" | "momentum" | "starfall";

function blankUnit(): UnitState {
  return {
    name: "",
    display_name: "",
    bloodline: "",
    devolution: 0,
    mega: false,
    mega_form: null,
    iv: null,
    personality_bouns: null,
    personality_down: null,
    skills: [],
    current_skill: "",
    skill_trigger_stacks: {},
    skill_usage_mode_choices: {},
    usage_time_plus: 0,
    phys_atk_buff: 0,
    mag_atk_buff: 0,
    phys_def_buff: 0,
    mag_def_buff: 0,
    speed_buff: 0,
    power_multiplier: 0,
    light_power_buff: 0,
    power_bonus: 0,
    combo_plus: 0,
    combo_mul: 0,
    trait_override_query: null,
    trait_triggered: false,
    trait_stacks: 0,
    trait_choices: {},
  };
}

function blankTeamOtherBonuses(): TeamOtherBonuses {
  return {
    dedication_power_stacks: 0,
    dedication_combo_stacks: 0,
    charge_mark_stacks: 0,
    charge_mark_triggered: false,
    wind_mark_triggered: false,
    attack_mark_stacks: 0,
    momentum_mark_stacks: 0,
    starfall_mark_stacks: 0,
    burst_triggered_effect_ids: [],
  };
}

function applyBuffEffect(unit: UnitState, effect: BuffEffect): UnitState {
  const current = unit[effect.field];
  const nextValue = current + effect.value;
  return { ...unit, [effect.field]: nextValue } as UnitState;
}

// 显示用精灵名：槽位里存的是“编号+名字”，界面只展示名字。
function petNameOnly(value: string | null | undefined) {
  const text = (value || "").trim();
  return text.replace(/^\d+\s*/, "") || text;
}

function unitFromPreset(preset: PresetItem, showPresetName = false): UnitState {
  const skills = preset.skills || [];
  return {
    ...blankUnit(),
    name: `${preset.id}${preset.name}`,
    display_name: showPresetName ? preset.key : "",
    bloodline: preset.bloodline || "",
    iv: preset.iv,
    personality_bouns: preset.personality_bouns,
    personality_down: preset.personality_down,
    trait_override_query: preset.trait_override_query ?? null,
    trait_triggered: Boolean(preset.trait_triggered),
    trait_stacks: preset.trait_stacks ?? 0,
    trait_choices: preset.trait_choices ?? {},
    devolution: preset.devolution ?? 0,
    mega: Boolean(preset.mega),
    mega_form: preset.mega_form ?? null,
    skills,
    current_skill: skills.find(Boolean) || "",
  };
}

function mergePresetIntoUnit(current: UnitState, preset: PresetItem): UnitState {
  // Import only configured preset fields so manually configured slot values survive.
  const next: UnitState = {
    ...current,
    name: `${preset.id}${preset.name}`,
    display_name: preset.key,
  };

  if (preset.iv && Object.keys(preset.iv).length) {
    next.iv = { ...(current.iv || {}), ...preset.iv };
  }
  if (preset.personality_bouns) {
    next.personality_bouns = preset.personality_bouns;
  }
  if (preset.personality_down) {
    next.personality_down = preset.personality_down;
  }
  if (preset.bloodline) {
    next.bloodline = preset.bloodline;
  }

  const skills = preset.skills || [];
  if (skills.some(Boolean)) {
    next.skills = skills;
    next.current_skill = skills.find(Boolean) || "";
    next.skill_trigger_stacks = {};
  }

  if (preset.trait_override_query) {
    next.trait_override_query = preset.trait_override_query;
    next.trait_triggered = Boolean(preset.trait_triggered);
    next.trait_stacks = Math.max(0, preset.trait_stacks || 0);
    next.trait_choices = preset.trait_choices ?? {};
  } else if (preset.trait_triggered || (preset.trait_stacks || 0) > 0) {
    next.trait_triggered = Boolean(preset.trait_triggered);
    next.trait_stacks = Math.max(0, preset.trait_stacks || 0);
    next.trait_choices = preset.trait_choices ?? {};
  }

  if ((preset.devolution || 0) > 0) {
    next.devolution = preset.devolution || 0;
  }
  if (preset.mega_form) {
    next.mega = false;
    next.mega_form = preset.mega_form;
  } else if (preset.mega) {
    next.mega = true;
    next.mega_form = null;
  }

  return next;
}

function updateIv(iv: Record<string, number> | null, stat: string, value: string) {
  const next = { ...(iv || {}) };
  if (!value) {
    delete next[stat];
  } else {
    next[stat] = Number(value);
  }
  return Object.keys(next).length ? next : null;
}

const STAT_ALIASES: Record<string, string> = {
  生命: "hp",
  血量: "hp",
  体力: "hp",
  攻击: "atk",
  物攻: "atk",
  魔攻: "mag",
  防御: "def",
  物防: "def",
  魔抗: "res",
  魔防: "res",
  速度: "spd",
};

function normalizeStat(value: string) {
  const stat = value.trim();
  return STAT_ALIASES[stat] || stat;
}

function parsePersonality(value: string | null) {
  if (!value) return { stat: "", amount: "" };
  const [stat, amount = ""] = value.split(":");
  return { stat: normalizeStat(stat), amount };
}

function buildPersonality(stat: string, amount: string) {
  if (!stat) return null;
  const normalized = normalizeStat(stat);
  return amount.trim() ? `${normalized}:${amount.trim()}` : normalized;
}

function battleContextFromUnits(attacker: UnitState, defender: UnitState): BattleContext {
  return {
    attackerName: petNameOnly(attacker.mega_form || attacker.display_name || attacker.name) || "攻击方",
    defenderName: petNameOnly(defender.mega_form || defender.display_name || defender.name) || "防御方",
    attackerPetName: attacker.mega_form || attacker.name,
    defenderPetName: defender.mega_form || defender.name,
    skillName: attacker.current_skill || attacker.skills.find(Boolean) || "",
    attackerIv: attacker.iv,
    attackerPersonalityBouns: attacker.personality_bouns,
    attackerPersonalityDown: attacker.personality_down,
    defenderIv: defender.iv,
    defenderPersonalityBouns: defender.personality_bouns,
    defenderPersonalityDown: defender.personality_down,
  };
}

export { type BattleContext, parsePersonality, petNameOnly, buildPersonality, updateIv, type PickerMode, type BonusToolPositions, blankUnit, blankTeamOtherBonuses, type MarkField, type BonusTool, unitFromPreset, mergePresetIntoUnit, battleContextFromUnits, applyBuffEffect, type BonusToolPosition };
