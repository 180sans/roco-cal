// Shared desktop request/response contracts, moved unchanged from App.tsx.
export type Pet = {
  id: string;
  name: string;
  label: string;
  elements: string[];
  race?: number;
  hp?: number;
  atk?: number;
  mag?: number;
  def?: number;
  res?: number;
  spd?: number;
  traitName?: string;
  traitEffect?: string;
  isFinal?: boolean;
  evolutionStage?: string;
  nextForms?: string[];
  prevForms?: string[];
  evolutionChain?: string[];
  skillCount: number;
};

export type PresetItem = {
  key: string;
  id: string;
  name: string;
  iv: Record<string, number> | null;
  personality_bouns: string | null;
  personality_down: string | null;
  skills: string[];
  bloodline?: string | null;
  trait_override_query?: string | null;
  trait_triggered?: boolean;
  trait_stacks?: number;
  trait_choices?: Record<string, string>;
  devolution?: number;
  mega?: boolean;
  mega_form?: string | null;
  skillCount: number;
};

export type PresetGroup = {
  name: string;
  items: PresetItem[];
};

export type AppState = {
  summary: {
    petCount: number;
    skillFileCount: number;
    teamCount: number;
    dataDir: string;
  };
  presets: PresetGroup[];
  pets: Pet[];
  elements: string[];
  configs: PickerConfigs;
  burstEffects: BurstEffectItem[];
};

export type PickerConfigs = Record<string, Record<string, unknown>>;

export type ExternalIconCatalog = {
  directory: string;
  groups: Record<"pet" | "skill" | "element" | "skill_type", Record<string, string>>;
};

export type BurstEffectItem = {
  id: string;
  kind: "skill" | "trait" | "mark";
  name: string;
  cost?: number | null;
  element?: string;
  type?: string;
  skill_power?: number | null;
  description: string;
};

export type SkillItem = {
  name: string;
  unlock?: string;
  detail?: {
    name?: string;
    cost?: number;
    element?: string;
    type?: string;
    skill_power?: number | null;
    description?: string;
  } | null;
  skill_power?: number | null;
  cost?: number;
  element?: string;
  type?: string;
  description?: string;
};

export const BUFF_STATE_FIELDS = [
  "phys_atk_buff",
  "mag_atk_buff",
  "phys_def_buff",
  "mag_def_buff",
  "speed_buff",
  "power_multiplier",
  "light_power_buff",
  "power_bonus",
  "combo_plus",
  "combo_mul",
] as const;

export type BuffStateField = (typeof BUFF_STATE_FIELDS)[number];

export type BuffTarget = "self" | "opponent" | "both";

export type BuffEffect = { target: BuffTarget; field: BuffStateField; value: number };

export type BuffOption = { label: string; effects: BuffEffect[] };

export type ApplySkillBuffsResult = { skill_name: string; combo_count: number; options: BuffOption[]; effects: BuffEffect[] };

export type BuffShortcutEntry = { name: string; options: BuffOption[]; currentPet?: boolean; element?: string; type?: string; description?: string };

export type SkillTriggerInfo = {
  skill_name: string;
  element: string;
  description: string;
  has_damage: boolean;
  has_buff: boolean;
  stackable: Array<{ index: number; label: string; max?: number; affects_power: boolean }>;
  usage_mode_options: Array<{ index: number; label: string }>;
};

export type TeamOtherBonuses = {
  dedication_power_stacks: number;
  dedication_combo_stacks: number;
  charge_mark_stacks: number;
  charge_mark_triggered: boolean;
  wind_mark_triggered: boolean;
  attack_mark_stacks: number;
  momentum_mark_stacks: number;
  starfall_mark_stacks: number;
  burst_triggered_effect_ids: string[];
};

export type UnitState = {
  name: string;
  display_name: string;
  bloodline: string;
  devolution: number;
  mega: boolean;
  mega_form: string | null;
  iv: Record<string, number> | null;
  personality_bouns: string | null;
  personality_down: string | null;
  skills: string[];
  current_skill: string;
  skill_trigger_stacks: Record<string, number[]>;
  skill_usage_mode_choices: Record<string, number>;
  usage_time_plus: number;
  phys_atk_buff: number;
  mag_atk_buff: number;
  phys_def_buff: number;
  mag_def_buff: number;
  speed_buff: number;
  power_multiplier: number;
  light_power_buff: number;
  power_bonus: number;
  combo_plus: number;
  combo_mul: number;
  trait_override_query: string | null;
  trait_triggered: boolean;
  trait_stacks: number;
  trait_choices: Record<string, string>;
};

export type BattleResult = {
  skill_name: string;
  case_label: string;
  is_triggered: boolean;
  effective_power: number;
  atk_label: string;
  def_label: string;
  atk_value: number;
  def_value: number;
  damage: number;
  required_power?: number;
  target_hp?: number;
  damage_info?: string | null;
  usage_results?: Array<{ effective_power: number; combo: number | null; damage: number }> | null;
  starfall?: { stacks: number; power: number; damage: number } | null;
  hp_results: Array<{ hp_label: string; hp: number; damage_percent: number }>;
};

export type QuickSkillResult = { skillName: string; displayPower?: number | null; results: BattleResult[] };

export type EnemyAttackPayload = { attacker: UnitState & { other_bonuses: TeamOtherBonuses }; defender: UnitState & { other_bonuses: TeamOtherBonuses }; target_hp: number; weather: string };

export type WillpowerElementResult = { element: string; advantage: number; has_stab: boolean; results: BattleResult[] };

export type WillpowerResponse = { attack_type: "atk" | "mag"; elements: WillpowerElementResult[] };

export type RequiredPowerRow = { attack_type: "物攻" | "魔攻"; attacker_label: string; required_power: number };

export type RequiredPowerResponse = { target_hp: number; rows: RequiredPowerRow[] };

export type SkillListResult = { petSkills: SkillItem[]; allSkills: SkillItem[] };

export type PresetManagerResult = { presets: PresetGroup[]; groupName?: string; presetName?: string };
