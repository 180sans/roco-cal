import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";

const STATS = ["hp", "atk", "mag", "def", "res", "spd"] as const;
const STAT_LABEL: Record<(typeof STATS)[number], string> = {
  hp: "生命",
  atk: "物攻",
  mag: "魔攻",
  def: "防御",
  res: "魔抗",
  spd: "速度",
};
const IV_OPTIONS = ["", "0", "7", "8", "9", "10"];
const DEFAULT_SKILL_CARD_COUNT = 4;
const UI_TOKEN_DEFAULTS = {
  "window-width": 566,
  "window-height": 640,
  "team-region-width": 238,
  "team-region-height": 310,
  "buff-region-width": 238,
  "buff-region-height": 42,
  "skill-region-width": 238,
  "skill-region-height": 154,
  "team-slot-count": 6,
  "team-skill-card-count": DEFAULT_SKILL_CARD_COUNT,
  "team-action-frame-width": 300,
  "team-action-frame-height": 46,
  "direction-button-width": 34,
  "direction-button-height": 34,
  "direction-button-font-size": 20,
  "calc-button-width": 84,
  "calc-button-height": 34,
  "calc-button-font-size": 12,
  "buff-button-width": 48,
  "buff-button-height": 34,
  "buff-button-font-size": 12,
  "buff-option-width": 100,
  "team-title-font-size": 13,
  "import-group-width": 94,
  "import-group-height": 28,
  "import-group-font-size": 12,
  "team-pet-width": 104,
  "team-pet-height": 36,
  "team-pet-font-size": 12,
  "devolution-width": 64,
  "devolution-height": 30,
  "devolution-font-size": 11,
  "devolution-number-font-size": 11,
  "mega-width": 94,
  "mega-height": 30,
  "mega-font-size": 11,
  "evolution-reset-width": 46,
  "evolution-reset-height": 26,
  "evolution-reset-font-size": 11,
  "iv-width": 52,
  "iv-height": 26,
  "iv-font-size": 11,
  "iv-number-font-size": 11,
  "personality-width": 66,
  "personality-height": 26,
  "personality-font-size": 11,
  "personality-number-font-size": 11,
  "iv-reset-width": 46,
  "iv-reset-height": 26,
  "iv-reset-font-size": 11,
  "trait-font-size": 12,
  "trait-trigger-width": 46,
  "trait-trigger-height": 26,
  "trait-trigger-font-size": 11,
  "trait-select-width": 46,
  "trait-select-height": 26,
  "trait-select-font-size": 11,
  "trait-stack-width": 56,
  "trait-stack-height": 30,
  "trait-stack-font-size": 11,
  "trait-stack-number-font-size": 11,
  "trait-reset-width": 46,
  "trait-reset-height": 26,
  "trait-reset-font-size": 11,
  "buff-title-font-size": 13,
  "buff-width": 64,
  "buff-height": 30,
  "buff-font-size": 11,
  "buff-number-font-size": 11,
  "buff-reset-width": 46,
  "buff-reset-height": 26,
  "buff-reset-font-size": 11,
  "skill-title-font-size": 13,
  "skill-card-width": 104,
  "skill-card-height": 38,
  "skill-card-font-size": 13,
  "skill-stack-width": 56,
  "skill-stack-height": 30,
  "skill-stack-font-size": 11,
  "skill-stack-number-font-size": 11,
  "skill-usage-width": 56,
  "skill-usage-height": 30,
  "skill-usage-font-size": 11,
  "skill-usage-number-font-size": 11,
  "skill-reset-width": 46,
  "skill-reset-height": 26,
  "skill-reset-font-size": 11,
  "preset-new-width": 76, "preset-new-height": 28, "preset-new-font-size": 12, "preset-new-number-font-size": 12,
  "preset-group-width": 120, "preset-group-height": 28, "preset-group-font-size": 12, "preset-group-number-font-size": 12,
  "preset-new-group-width": 120, "preset-new-group-height": 28, "preset-new-group-font-size": 12, "preset-new-group-number-font-size": 12,
  "preset-create-width": 66, "preset-create-height": 28, "preset-create-font-size": 12, "preset-create-number-font-size": 12,
  "preset-list-width": 190, "preset-list-height": 75, "preset-list-font-size": 12, "preset-list-number-font-size": 12,
  "preset-save-width": 76, "preset-save-height": 28, "preset-save-font-size": 12, "preset-save-number-font-size": 12,
  "preset-delete-width": 52, "preset-delete-height": 28, "preset-delete-font-size": 12, "preset-delete-number-font-size": 12,
  "preset-name-width": 210, "preset-name-height": 28, "preset-name-font-size": 12, "preset-name-number-font-size": 12,
  "preset-pet-width": 160, "preset-pet-height": 28, "preset-pet-font-size": 12, "preset-pet-number-font-size": 12,
  "preset-pet-picker-width": 48, "preset-pet-picker-height": 28, "preset-pet-picker-font-size": 12, "preset-pet-picker-number-font-size": 12,
  "preset-skill-width": 104, "preset-skill-height": 38, "preset-skill-font-size": 13, "preset-skill-number-font-size": 12,
  "preset-skill-reset-width": 46, "preset-skill-reset-height": 26, "preset-skill-reset-font-size": 11, "preset-skill-reset-number-font-size": 11,
  "preset-iv-width": 52, "preset-iv-height": 26, "preset-iv-font-size": 11, "preset-iv-number-font-size": 11,
  "preset-iv-reset-width": 46, "preset-iv-reset-height": 26, "preset-iv-reset-font-size": 11, "preset-iv-reset-number-font-size": 11,
  "preset-personality-width": 66, "preset-personality-height": 26, "preset-personality-font-size": 11, "preset-personality-number-font-size": 11,
  "preset-trait-trigger-width": 46, "preset-trait-trigger-height": 26, "preset-trait-trigger-font-size": 11, "preset-trait-trigger-number-font-size": 11,
  "preset-trait-stack-width": 56, "preset-trait-stack-height": 30, "preset-trait-stack-font-size": 11, "preset-trait-stack-number-font-size": 11,
  "preset-trait-select-width": 46, "preset-trait-select-height": 26, "preset-trait-select-font-size": 11, "preset-trait-select-number-font-size": 11,
  "preset-trait-reset-width": 46, "preset-trait-reset-height": 26, "preset-trait-reset-font-size": 11, "preset-trait-reset-number-font-size": 11,
  "preset-devolution-width": 64, "preset-devolution-height": 30, "preset-devolution-font-size": 11, "preset-devolution-number-font-size": 11,
  "preset-evolution-reset-width": 46, "preset-evolution-reset-height": 26, "preset-evolution-reset-font-size": 11, "preset-evolution-reset-number-font-size": 11,
  "preset-mega-width": 110, "preset-mega-height": 30, "preset-mega-font-size": 11, "preset-mega-number-font-size": 11,
  "preset-transfer-select-width": 92, "preset-transfer-select-height": 28, "preset-transfer-select-font-size": 12, "preset-transfer-select-number-font-size": 12,
  "preset-copy-width": 46, "preset-copy-height": 28, "preset-copy-font-size": 12, "preset-copy-number-font-size": 12,
  "preset-move-width": 46, "preset-move-height": 28, "preset-move-font-size": 12, "preset-move-number-font-size": 12,
  "preset-library-title-font-size": 15,
  "preset-settings-title-font-size": 15,
  "preset-skills-title-font-size": 15,
  "preset-group-label-font-size": 12,
  "preset-iv-title-font-size": 12,
  "preset-trait-summary-font-size": 12,
} as const;
const PREVIOUS_DEFAULT_WINDOW_SIZE = {
  width: 586,
  height: 774,
} as const;
type UiTokenField = { key: keyof typeof UI_TOKEN_DEFAULTS; label: string; min: number; max: number };

const sizeField = (key: keyof typeof UI_TOKEN_DEFAULTS, label: string, min = 20, max = 240): UiTokenField => ({ key, label, min, max });
const fontField = (key: keyof typeof UI_TOKEN_DEFAULTS, label: string): UiTokenField => ({ key, label, min: 8, max: 32 });
const UI_TOKEN_SECTIONS: Array<{ title: string; fields: UiTokenField[] }> = [
  {
    title: "区域布局",
    fields: [
      sizeField("team-region-width", "队伍区域宽度", 120, 600), sizeField("team-region-height", "队伍区域最小高度", 40, 900),
      sizeField("buff-region-width", "Buff 区域宽度", 120, 600), sizeField("buff-region-height", "Buff 区域最小高度", 30, 900),
      sizeField("skill-region-width", "技能区域宽度", 120, 600), sizeField("skill-region-height", "技能区域最小高度", 40, 900),
    ],
  },
  {
    title: "队伍配置",
    fields: [
      sizeField("team-slot-count", "每方精灵数量", 1, 24),
      sizeField("team-skill-card-count", "技能卡数量", 1, 8),
      sizeField("team-action-frame-width", "操作外框宽度", 40, 600),
      sizeField("team-action-frame-height", "操作外框高度", 32, 400),
      sizeField("direction-button-width", "方向按钮宽度", 24, 160),
      sizeField("direction-button-height", "方向按钮高度", 24, 100),
      fontField("direction-button-font-size", "方向按钮文本大小"),
      sizeField("calc-button-width", "计算按钮宽度", 60, 240),
      sizeField("calc-button-height", "计算按钮高度", 24, 100),
      fontField("calc-button-font-size", "计算按钮文本大小"),
      sizeField("buff-button-width", "Buff按钮宽度", 36, 240),
      sizeField("buff-button-height", "Buff按钮高度", 24, 100),
      fontField("buff-button-font-size", "Buff按钮文本大小"),
      sizeField("buff-option-width", "Buff选项宽度", 60, 320),
    ],
  },
  {
    title: "队伍区域",
    fields: [
      fontField("team-title-font-size", "队伍标题文本大小"),
      sizeField("import-group-width", "导入分组宽度"), sizeField("import-group-height", "导入分组高度"), fontField("import-group-font-size", "导入分组文本大小"),
      sizeField("team-pet-width", "队伍精灵宽度", 40), sizeField("team-pet-height", "队伍精灵高度", 24), fontField("team-pet-font-size", "队伍精灵文本大小"),
    ],
  },
  {
    title: "萌化与超进化",
    fields: [
      sizeField("devolution-width", "萌化宽度"), sizeField("devolution-height", "萌化高度"), fontField("devolution-font-size", "萌化文本大小"), fontField("devolution-number-font-size", "萌化框内数字大小"),
      sizeField("mega-width", "超进化宽度"), sizeField("mega-height", "超进化高度"), fontField("mega-font-size", "超进化框内文本大小"),
      sizeField("evolution-reset-width", "萌化与超进化重置宽度"), sizeField("evolution-reset-height", "萌化与超进化重置高度"), fontField("evolution-reset-font-size", "萌化与超进化重置文本大小"),
    ],
  },
  {
    title: "天分与性格",
    fields: [
      sizeField("iv-width", "天分宽度"), sizeField("iv-height", "天分高度"), fontField("iv-font-size", "天分文本大小"), fontField("iv-number-font-size", "天分框内数字大小"),
      sizeField("personality-width", "性格宽度"), sizeField("personality-height", "性格高度"), fontField("personality-font-size", "性格文本大小"), fontField("personality-number-font-size", "性格框内文本大小"),
      sizeField("iv-reset-width", "天分与性格重置宽度"), sizeField("iv-reset-height", "天分与性格重置高度"), fontField("iv-reset-font-size", "天分与性格重置文本大小"),
    ],
  },
  {
    title: "特性",
    fields: [
      fontField("trait-font-size", "特性文本大小"),
      sizeField("trait-trigger-width", "特性触发宽度"), sizeField("trait-trigger-height", "特性触发高度"), fontField("trait-trigger-font-size", "特性触发文本大小"),
      sizeField("trait-select-width", "特性选特宽度"), sizeField("trait-select-height", "特性选特高度"), fontField("trait-select-font-size", "特性选特文本大小"),
      sizeField("trait-stack-width", "特性叠加宽度"), sizeField("trait-stack-height", "特性叠加高度"), fontField("trait-stack-font-size", "特性叠加文本大小"), fontField("trait-stack-number-font-size", "特性叠加框内数字大小"),
      sizeField("trait-reset-width", "特性重置宽度"), sizeField("trait-reset-height", "特性重置高度"), fontField("trait-reset-font-size", "特性重置文本大小"),
    ],
  },
  {
    title: "Buff 区域",
    fields: [
      fontField("buff-title-font-size", "Buff 标题文本大小"),
      sizeField("buff-width", "Buff 数字框宽度"), sizeField("buff-height", "Buff 数字框高度"), fontField("buff-font-size", "Buff 文本大小"), fontField("buff-number-font-size", "Buff 框内数字大小"),
      sizeField("skill-usage-width", "使用+宽度"), sizeField("skill-usage-height", "使用+高度"), fontField("skill-usage-font-size", "使用+文本大小"), fontField("skill-usage-number-font-size", "使用+框内数字大小"),
      sizeField("buff-reset-width", "Buff 重置宽度"), sizeField("buff-reset-height", "Buff 重置高度"), fontField("buff-reset-font-size", "Buff 重置文本大小"),
    ],
  },
  {
    title: "技能区域",
    fields: [
      fontField("skill-title-font-size", "技能标题文本大小"),
      sizeField("skill-card-width", "技能卡片宽度", 40), sizeField("skill-card-height", "技能卡片高度", 24), fontField("skill-card-font-size", "技能卡片文本大小"),
      sizeField("skill-stack-width", "叠加宽度"), sizeField("skill-stack-height", "叠加高度"), fontField("skill-stack-font-size", "叠加文本大小"), fontField("skill-stack-number-font-size", "叠加框内数字大小"),
      sizeField("skill-reset-width", "技能重置宽度"), sizeField("skill-reset-height", "技能重置高度"), fontField("skill-reset-font-size", "技能重置文本大小"),
    ],
  },
  {
    title: "窗口",
    fields: [
      sizeField("window-width", "窗口宽度", 283, 1600), sizeField("window-height", "窗口高度", 320, 1600),
    ],
  },
];

UI_TOKEN_SECTIONS.push({
  title: "精灵保存：固定文本",
  fields: [
    fontField("preset-library-title-font-size", "精灵预设文本大小"),
    fontField("preset-settings-title-font-size", "保存设置文本大小"),
    fontField("preset-skills-title-font-size", "技能文本大小"),
    fontField("preset-group-label-font-size", "分组文本大小"),
    fontField("preset-iv-title-font-size", "天分与性格文本大小"),
    fontField("preset-trait-summary-font-size", "特性摘要文本大小"),
  ],
});

const PRESET_CONFIG_AREAS = [
  ["预设列表", [["preset-new", "新建预设"], ["preset-group", "分组框"], ["preset-new-group", "新分组名框"], ["preset-create", "创建分组"], ["preset-list", "预设列表项"]]],
  ["基础信息", [["preset-save", "保存预设"], ["preset-delete", "删除预设"], ["preset-name", "预设名输入框"], ["preset-pet", "精灵输入框"], ["preset-pet-picker", "选宠按钮"]]],
  ["特性", [["preset-trait-trigger", "特性触发"], ["preset-trait-stack", "特性叠加"], ["preset-trait-select", "特性选特"], ["preset-trait-reset", "特性重置"]]],
  ["天分与性格", [["preset-iv", "天分下拉框"], ["preset-iv-reset", "天分与性格重置"], ["preset-personality", "性格下拉框"]]],
  ["萌化与超进化", [["preset-devolution", "萌化控件"], ["preset-evolution-reset", "萌化与超进化重置"], ["preset-mega", "超进化控件"]]],
  ["技能", [["preset-skill", "技能卡片"], ["preset-skill-reset", "技能重置"]]],
  ["目标分组", [["preset-transfer-select", "目标分组框"], ["preset-copy", "复制"], ["preset-move", "移动"]]],
] as const;

PRESET_CONFIG_AREAS.forEach(([area, controls]) => {
  UI_TOKEN_SECTIONS.push({
    title: `精灵保存：${area}`,
    fields: controls.flatMap(([key, label]) => [
      fontField(`${key}-font-size` as keyof typeof UI_TOKEN_DEFAULTS, `${label}文本大小`),
      fontField(`${key}-number-font-size` as keyof typeof UI_TOKEN_DEFAULTS, `${label}框内数字大小`),
      sizeField(`${key}-width` as keyof typeof UI_TOKEN_DEFAULTS, `${label}框宽`),
      sizeField(`${key}-height` as keyof typeof UI_TOKEN_DEFAULTS, `${label}框高`),
    ]),
  });
});
const UI_TOKEN_FIELDS = UI_TOKEN_SECTIONS.flatMap((section) => section.fields);

type UiTokenValues = Record<keyof typeof UI_TOKEN_DEFAULTS, number>;

type Pet = {
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
  evolutionChain?: string[];
  skillCount: number;
};

type PresetItem = {
  key: string;
  id: string;
  name: string;
  iv: Record<string, number> | null;
  personality_bouns: string | null;
  personality_down: string | null;
  skills: string[];
  trait_override_query?: string | null;
  trait_triggered?: boolean;
  trait_stacks?: number;
  trait_choices?: Record<string, string>;
  devolution?: number;
  mega?: boolean;
  mega_form?: string | null;
  skillCount: number;
};

type PresetGroup = {
  name: string;
  items: PresetItem[];
};

type AppState = {
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

type PickerConfigs = Record<string, Record<string, unknown>>;

type BurstEffectItem = {
  id: string;
  kind: "skill" | "trait" | "mark";
  name: string;
  cost?: number | null;
  element?: string;
  type?: string;
  skill_power?: number | null;
  description: string;
};

type SkillItem = {
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

const BUFF_STATE_FIELDS = [
  "phys_atk_buff",
  "mag_atk_buff",
  "phys_def_buff",
  "mag_def_buff",
  "power_multiplier",
  "power_bonus",
  "combo_plus",
  "combo_mul",
] as const;
type BuffStateField = (typeof BUFF_STATE_FIELDS)[number];
type BuffTarget = "self" | "opponent" | "both";
type BuffEffect = { target: BuffTarget; field: BuffStateField; value: number };
type BuffOption = { label: string; effects: BuffEffect[] };
type ApplySkillBuffsResult = { skill_name: string; options: BuffOption[]; effects: BuffEffect[] };
type SkillTriggerInfo = {
  skill_name: string;
  description: string;
  stackable: Array<{ index: number; label: string }>;
  usage_mode_options: Array<{ index: number; label: string }>;
};

type TeamOtherBonuses = {
  dedication_power_stacks: number;
  dedication_combo_stacks: number;
  charge_mark_stacks: number;
  charge_mark_triggered: boolean;
  attack_mark_stacks: number;
  momentum_mark_stacks: number;
  starfall_mark_stacks: number;
  burst_triggered_effect_ids: string[];
};

type UnitState = {
  name: string;
  display_name: string;
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
  power_multiplier: number;
  power_bonus: number;
  combo_plus: number;
  combo_mul: number;
  trait_override_query: string | null;
  trait_triggered: boolean;
  trait_stacks: number;
  trait_choices: Record<string, string>;
};

type BattleResult = {
  skill_name: string;
  case_label: string;
  is_triggered: boolean;
  effective_power: number;
  atk_label: string;
  def_label: string;
  atk_value: number;
  def_value: number;
  damage: number;
  damage_info?: string | null;
  usage_results?: Array<{ effective_power: number; combo: number | null; damage: number }> | null;
  starfall?: { stacks: number; power: number; damage: number } | null;
  hp_results: Array<{ hp_label: string; hp: number; damage_percent: number }>;
};

type BattleContext = {
  attackerName: string;
  defenderName: string;
  skillName: string;
  attackerIv: Record<string, number> | null;
  attackerPersonalityBouns: string | null;
  attackerPersonalityDown: string | null;
  defenderIv: Record<string, number> | null;
  defenderPersonalityBouns: string | null;
  defenderPersonalityDown: string | null;
};

type PickerMode = "pet" | "skill" | "trait";
type SkillListResult = { petSkills: SkillItem[]; allSkills: SkillItem[] };
type PresetManagerResult = { presets: PresetGroup[]; groupName?: string; presetName?: string };

const skillListCache = new Map<string, Promise<SkillListResult>>();
const traitInfoCache = new Map<string, Promise<any>>();
const skillTriggerInfoCache = new Map<string, Promise<SkillTriggerInfo>>();
const WEATHER_OPTIONS = [
  { value: "none", label: "无" },
  { value: "rain", label: "雨天（水）" },
  { value: "sandstorm", label: "沙暴（地）" },
  { value: "snow", label: "雪天（冰）" },
  { value: "thunder", label: "雷鸣（电）" },
] as const;

function petMatchesPickerFilters(pet: Pet, element: string, finalOnly: boolean) {
  return (!element || pet.elements.includes(element)) && (!finalOnly || pet.isFinal);
}

function buildPetLookup(pets: Pet[]) {
  const lookup = new Map<string, Pet>();
  pets.forEach((pet) => {
    [pet.label, `${pet.id}${pet.name}`, pet.name].forEach((key) => {
      if (key && !lookup.has(key)) lookup.set(key, pet);
    });
  });
  return lookup;
}

function petFromPreset(preset: PresetItem, lookup: Map<string, Pet>) {
  return lookup.get(`${preset.id}${preset.name}`) || lookup.get(preset.key) || lookup.get(preset.name);
}

function cachedListSkills(petQuery: string) {
  const key = petQuery || "";
  if (!skillListCache.has(key)) {
    skillListCache.set(key, invoke<SkillListResult>("list_skills", { payload: { petQuery, query: "" } }));
  }
  return skillListCache.get(key)!;
}

function cachedTraitInfo(payload: Record<string, unknown>) {
  const key = JSON.stringify(payload);
  if (!traitInfoCache.has(key)) {
    traitInfoCache.set(key, invoke<any>("trait_info", { payload }));
  }
  return traitInfoCache.get(key)!;
}

function cachedSkillTriggerInfo(skillName: string) {
  if (!skillTriggerInfoCache.has(skillName)) {
    skillTriggerInfoCache.set(skillName, invoke<SkillTriggerInfo>("skill_trigger_info", { payload: { skill_name: skillName } }));
  }
  return skillTriggerInfoCache.get(skillName)!;
}

function blankUnit(): UnitState {
  return {
    name: "",
    display_name: "",
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
    power_multiplier: 0,
    power_bonus: 0,
    combo_plus: 0,
    combo_mul: 1,
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
    attack_mark_stacks: 0,
    momentum_mark_stacks: 0,
    starfall_mark_stacks: 0,
    burst_triggered_effect_ids: [],
  };
}

function applyBuffEffect(unit: UnitState, effect: BuffEffect): UnitState {
  const current = unit[effect.field];
  const nextValue = effect.field === "combo_mul" ? current * effect.value : current + effect.value;
  return { ...unit, [effect.field]: nextValue } as UnitState;
}

function unitFromPreset(preset: PresetItem, showPresetName = false): UnitState {
  const skills = preset.skills || [];
  return {
    ...blankUnit(),
    name: `${preset.id}${preset.name}`,
    display_name: showPresetName ? preset.key : "",
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
    current_skill: skills[0] || "",
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

  const skills = (preset.skills || []).filter(Boolean);
  if (skills.length) {
    next.skills = skills;
    next.current_skill = skills[0];
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

function parsePersonality(value: string | null) {
  if (!value) return { stat: "", amount: "" };
  const [stat, amount = ""] = value.split(":");
  return { stat, amount };
}

function buildPersonality(stat: string, amount: string) {
  if (!stat) return null;
  return amount.trim() ? `${stat}:${amount.trim()}` : stat;
}

function asError(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function battleContextFromUnits(attacker: UnitState, defender: UnitState): BattleContext {
  return {
    attackerName: attacker.mega_form || attacker.display_name || attacker.name || "攻击方",
    defenderName: defender.mega_form || defender.display_name || defender.name || "防御方",
    skillName: attacker.current_skill || attacker.skills[0] || "",
    attackerIv: attacker.iv,
    attackerPersonalityBouns: attacker.personality_bouns,
    attackerPersonalityDown: attacker.personality_down,
    defenderIv: defender.iv,
    defenderPersonalityBouns: defender.personality_bouns,
    defenderPersonalityDown: defender.personality_down,
  };
}

function displayAttackStat(stat: string) {
  return stat === "攻击" ? "物攻" : stat;
}

function configuredAttackSuffix(label: string, context?: BattleContext | null) {
  const statKey = label.includes("魔攻") ? "mag" : "atk";
  const hasTalent = Number(context?.attackerIv?.[statKey] ?? 0) > 0;
  const bouns = parsePersonality(context?.attackerPersonalityBouns ?? null);
  const down = parsePersonality(context?.attackerPersonalityDown ?? null);
  const hasPositivePersonality = bouns.stat === statKey;
  const hasNegativePersonality = down.stat === statKey;

  if (hasNegativePersonality) return "-";
  if (hasTalent && hasPositivePersonality) return "++";
  if (hasTalent) return "+";
  return "";
}

function formatAttackLabel(label: string, context?: BattleContext | null) {
  const stat = label.includes("魔攻") ? "魔攻" : "物攻";
  if (label.startsWith("指定")) return `${stat}${configuredAttackSuffix(label, context)}`;
  if (label.startsWith("加") && label.includes("天分加性格")) return `${stat}++`;
  if (label.startsWith("加") && label.includes("天分")) return `${stat}+`;
  if (label.startsWith("正常")) return stat;
  if (label.startsWith("减")) return `${stat}-`;
  return label.replace("攻击", displayAttackStat("攻击"));
}

function configuredDefenderSuffix(statKey: "hp" | "def" | "res", context?: BattleContext | null) {
  const hasTalent = Number(context?.defenderIv?.[statKey] ?? 0) > 0;
  const bouns = parsePersonality(context?.defenderPersonalityBouns ?? null);
  const down = parsePersonality(context?.defenderPersonalityDown ?? null);
  const hasPositivePersonality = bouns.stat === statKey;
  const hasNegativePersonality = down.stat === statKey;

  if (hasNegativePersonality) return "-";
  if (hasTalent && hasPositivePersonality) return "++";
  if (hasTalent) return "+";
  return "";
}

function formatDefenseLabel(label: string, context?: BattleContext | null) {
  const isMagicDefense = label.includes("魔抗");
  const stat = isMagicDefense ? "魔防" : "物防";
  const statKey = isMagicDefense ? "res" : "def";
  if (label.startsWith("指定")) return `${stat}${configuredDefenderSuffix(statKey, context)}`;
  if (label.startsWith("加") && label.includes("天分加性格")) return `${stat}++`;
  if (label.startsWith("加") && label.includes("天分")) return `${stat}+`;
  if (label.startsWith("正常")) return stat;
  if (label.startsWith("减")) return `${stat}-`;
  return label.replace("魔抗", "魔防").replace("防御", "物防");
}

function formatHpLabel(label: string, context?: BattleContext | null) {
  if (label === "加生命天分加性格") return "生命++";
  if (label === "加生命天分") return "生命+";
  if (label === "正常血量") return "生命";
  if (label === "指定血量") return `生命${configuredDefenderSuffix("hp", context)}`;
  return label;
}

function uniqueByOrder<T>(values: T[]) {
  return Array.from(new Set(values));
}

function resultValueLabels(result: BattleResult) {
  return {
    attack: result.atk_label.includes("魔攻") ? "魔攻" : "物攻",
    defense: result.def_label.includes("魔抗") ? "魔防" : "物防",
  };
}

function ResultSettlement({ result }: { result: BattleResult }) {
  const usageResults = result.usage_results || [];
  const starfallDetail = result.starfall ? (
    <div className="result-detail-line starfall-result">
      <strong>星陨印记</strong>
      <span>层数：{result.starfall.stacks}</span>
      <span>威力：{result.starfall.power}</span>
      <span>追加伤害：{result.starfall.damage}</span>
    </div>
  ) : null;
  if (!usageResults.length) {
    return (
      <>
        <div className="result-detail-line">
          <span>最终伤害：{result.damage}</span>
          <span>结算说明：{result.damage_info || "单段结算"}</span>
        </div>
        {starfallDetail}
      </>
    );
  }

  return (
    <>
      <div className="result-detail-line">
        <span>最终伤害：{result.damage}</span>
        <span>结算说明：使用次数: {usageResults.length}</span>
      </div>
      <div className="usage-result-list">
        {usageResults.map((usageResult, index) => (
          <div className="result-detail-line" key={index}>
            <strong>结果 {index + 1}</strong>
            <span>最终威力：{usageResult.effective_power}</span>
            {usageResult.combo && usageResult.combo > 1 ? <span>连击：{usageResult.combo}</span> : null}
            <span>总伤害：{usageResult.damage}</span>
          </div>
        ))}
      </div>
      {starfallDetail}
    </>
  );
}

function groupResults(results: BattleResult[]) {
  return results.reduce<Record<string, BattleResult[]>>((acc, result) => {
    const key = result.case_label || "基础情况";
    acc[key] ||= [];
    acc[key].push(result);
    return acc;
  }, {});
}

function orderedResultGroups(results: BattleResult[]) {
  return Object.entries(groupResults(results)).sort(([, leftResults], [, rightResults]) => {
    const leftTriggered = leftResults.some((result) => result.is_triggered);
    const rightTriggered = rightResults.some((result) => result.is_triggered);
    return Number(rightTriggered) - Number(leftTriggered);
  });
}

function skillDetail(skill: SkillItem) {
  return skill.detail || skill;
}

function skillMeta(skill: SkillItem) {
  const detail = skillDetail(skill);
  return [
    detail.element || null,
    detail.type || null,
    detail.skill_power !== null && detail.skill_power !== undefined ? `威力 ${detail.skill_power}` : null,
    detail.cost !== undefined ? `费用 ${detail.cost}` : null,
  ].filter(Boolean).join(" / ");
}

function skillText(skill: SkillItem) {
  const detail = skillDetail(skill);
  return skill.unlock || detail.description || skill.description || "";
}

function skillCardSlots(skills: string[], count = DEFAULT_SKILL_CARD_COUNT) {
  return Array.from({ length: count }, (_, index) => skills[index] || "");
}

function FieldLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <label className={`field-label ${className}`.trim()}>{children}</label>;
}

function NumberInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  deferValidation = false,
  className = "",
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  deferValidation?: boolean;
  className?: string;
}) {
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  function changeBy(delta: number) {
    const nextValue = Math.min(max, Math.max(min, value + delta));
    if (deferValidation) {
      setDraftValue(String(nextValue));
      onChange(nextValue);
      return;
    }
    onChange(nextValue);
  }

  function commitDraft() {
    if (!deferValidation) return;
    const nextValue = Number(draftValue);
    if (!draftValue.trim() || !Number.isFinite(nextValue)) {
      setDraftValue(String(value));
      return;
    }
    onChange(nextValue);
  }

  return (
    <div className={`number-input-control ${className}`.trim()}>
      <input
        className="num-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={deferValidation ? draftValue : value}
        onBlur={commitDraft}
        onChange={(event) => {
          if (deferValidation) {
            setDraftValue(event.target.value);
            return;
          }
          onChange(Number(event.target.value));
        }}
        onKeyDown={(event) => {
          if (deferValidation && event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span className="number-stepper">
        <button type="button" aria-label="增加数值" title="增加" onClick={() => changeBy(step)}>▲</button>
        <button type="button" aria-label="减少数值" title="减少" onClick={() => changeBy(-step)}>▼</button>
      </span>
    </div>
  );
}

function megaFormsForPet(name: string, pets: Pet[]) {
  const basePet = pets.find((pet) => pet.label === name || `${pet.id}${pet.name}` === name || pet.name === name);
  if (!basePet) return [];
  return (basePet.nextForms || [])
    .map((label) => pets.find((pet) => pet.label === label))
    .filter((pet): pet is Pet => Boolean(pet && pet.evolutionStage === "mega"));
}

function MegaFormSelect({ value, pets, onChange }: { value: UnitState; pets: Pet[]; onChange: (partial: Partial<UnitState>) => void }) {
  const forms = megaFormsForPet(value.name, pets);
  const selected = forms.some((pet) => pet.label === value.mega_form) ? value.mega_form || "" : "";
  return (
    <select
      aria-label="超进化形态"
      value={selected}
      onChange={(event) => onChange({ mega: false, mega_form: event.target.value || null })}
    >
      <option value="">普通</option>
      {forms.map((pet) => (
        <option key={pet.label} value={pet.label}>{pet.name}</option>
      ))}
    </select>
  );
}

function TeamEvolutionControls({
  value,
  pets,
  onChange,
  className = "",
}: {
  value: UnitState;
  pets: Pet[];
  onChange: (partial: Partial<UnitState>) => void;
  className?: string;
}) {
  return (
    <div className={`slot-evolution-row ${className}`.trim()}>
      <div className="slot-evolution-control slot-devolution-control">
        <FieldLabel>萌化</FieldLabel>
        <NumberInput value={value.devolution} min={0} max={5} onChange={(devolution) => onChange({ devolution })} />
      </div>
      <div className="slot-evolution-control slot-mega-control">
        <MegaFormSelect value={value} pets={pets} onChange={onChange} />
      </div>
      <button className="compact-button evolution-reset-button" onClick={() => onChange({ devolution: 0, mega: false, mega_form: null })}>重置</button>
    </div>
  );
}

function PersonalityEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const parsed = parsePersonality(value);
  return (
    <div className="personality-row">
      <FieldLabel><span className="ui-field-title">{label}</span></FieldLabel>
      <select value={parsed.stat} onChange={(event) => onChange(buildPersonality(event.target.value, ""))}>
        <option value="">无</option>
        {STATS.map((stat) => (
          <option key={stat} value={stat}>
            {STAT_LABEL[stat]}
          </option>
        ))}
      </select>
    </div>
  );
}

function PickerModal({
  mode,
  presets = [],
  preferredGroup = "attackers",
  pets,
  petSkills,
  allSkills,
  traits,
  elements,
  configs,
  onConfigsChanged,
  onClose,
  onPickPreset,
  onPickPet,
  onPickSkill,
  onPickTrait,
}: {
  mode: PickerMode;
  presets?: PresetGroup[];
  preferredGroup?: string;
  pets: Pet[];
  petSkills: SkillItem[];
  allSkills: SkillItem[];
  traits: Pet[];
  elements: string[];
  configs: PickerConfigs;
  onConfigsChanged: (configs: PickerConfigs) => void;
  onClose: () => void;
  onPickPreset?: (preset: PresetItem) => void;
  onPickPet: (pet: Pet) => void;
  onPickSkill: (skill: SkillItem) => void;
  onPickTrait: (pet: Pet) => void;
}) {
  const section = mode === "pet" ? "pet_picker" : mode === "trait" ? "trait_picker" : "skill_picker";
  const config = configs[section] || {};
  const [query, setQuery] = useState("");
  const [element, setElement] = useState((config.element as string) || "");
  const [sortDesc, setSortDesc] = useState(Boolean(config.sort_desc));
  const [finalOnly, setFinalOnly] = useState(Boolean(config.final_only));
  const configuredPetTab = config.active_tab === "preset" || config.active_tab === "library" ? config.active_tab : null;
  const groupConfigKey = `preset_group_${preferredGroup}`;
  const configuredGroupName = typeof config[groupConfigKey] === "string" ? (config[groupConfigKey] as string) : "";
  const [petTab, setPetTab] = useState<"preset" | "library">(
    onPickPreset && presets.length ? configuredPetTab || "preset" : "library",
  );
  const [groupName, setGroupName] = useState(configuredGroupName || preferredGroup);
  const [skillTab, setSkillTab] = useState<"pet" | "library">((config.active_tab as "pet" | "library") || "pet");
  const normalizedQuery = query.trim().toLowerCase();
  const currentGroup = presets.find((group) => group.name === groupName) || presets.find((group) => group.name === preferredGroup) || presets[0];
  const petLookup = useMemo(() => buildPetLookup(pets), [pets]);
  const filteredPresets = (currentGroup?.items || [])
    .filter((preset) => !normalizedQuery || `${preset.id}${preset.name}${preset.key}`.toLowerCase().includes(normalizedQuery))
    .filter((preset) => {
      const pet = petFromPreset(preset, petLookup);
      return !pet || petMatchesPickerFilters(pet, element, finalOnly);
    });
  const sourcePets = mode === "trait" ? traits : pets;
  const petMatchesSearch = (pet: Pet) => {
    const searchable = mode === "trait"
      ? `${pet.id}${pet.name}${pet.traitName || ""}`
      : `${pet.id}${pet.name}`;
    return searchable.toLowerCase().includes(normalizedQuery);
  };
  const matchingEvolutionForms = new Set(
    sourcePets
      .filter((pet) => normalizedQuery && petMatchesSearch(pet))
      .flatMap((pet) => [pet.label, ...(pet.evolutionChain || [])]),
  );
  let evolutionChainExpanded = true;
  while (evolutionChainExpanded) {
    evolutionChainExpanded = false;
    for (const pet of sourcePets) {
      const chainMembers = [pet.label, ...(pet.evolutionChain || [])];
      if (!chainMembers.some((member) => matchingEvolutionForms.has(member))) continue;
      for (const member of chainMembers) {
        if (!matchingEvolutionForms.has(member)) {
          matchingEvolutionForms.add(member);
          evolutionChainExpanded = true;
        }
      }
    }
  }
  const filteredPets = sourcePets
    .filter((pet) => !normalizedQuery || petMatchesSearch(pet) || matchingEvolutionForms.has(pet.label))
    .filter((pet) => petMatchesPickerFilters(pet, element, finalOnly))
    .sort((a, b) => {
      const idA = Number(a.id) || Number.MAX_SAFE_INTEGER;
      const idB = Number(b.id) || Number.MAX_SAFE_INTEGER;
      const result = idA === idB ? a.name.localeCompare(b.name, "zh-Hans-CN") : idA - idB;
      return sortDesc ? -result : result;
    });
  const currentSkillSource = skillTab === "pet" ? petSkills : allSkills;
  const filteredSkills = currentSkillSource
    .filter((skill) => !normalizedQuery || skill.name.toLowerCase().includes(normalizedQuery))
    .filter((skill) => {
      if (!element) return true;
      const detail = skill.detail || skill;
      return detail.element === element;
    });

  async function saveConfig(values: Record<string, unknown>) {
    const data = await invoke<{ configs: PickerConfigs }>("save_picker_config", {
      payload: { section, values },
    });
    onConfigsChanged(data.configs);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="picker-modal compact-picker" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>{mode === "pet" ? "选择精灵" : mode === "skill" ? "选择技能" : "选择特性"}</h2>
          <button onClick={onClose}>关闭</button>
        </header>
        <div className={mode === "pet" ? "picker-tools pet-picker-tools" : "picker-tools"}>
          <div className="picker-tools-main">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索..." />
            {mode === "pet" && onPickPreset && presets.length ? (
              <div className="segmented">
                <button
                  className={petTab === "preset" ? "active" : ""}
                  onClick={() => {
                    setPetTab("preset");
                    void saveConfig({ active_tab: "preset" });
                  }}
                >
                  预设
                </button>
                <button
                  className={petTab === "library" ? "active" : ""}
                  onClick={() => {
                    setPetTab("library");
                    void saveConfig({ active_tab: "library" });
                  }}
                >
                  精灵库
                </button>
              </div>
            ) : null}
            {mode === "skill" ? (
              <div className="segmented">
                <button
                  className={skillTab === "pet" ? "active" : ""}
                  onClick={() => {
                    setSkillTab("pet");
                    void saveConfig({ active_tab: "pet" });
                  }}
                >
                  该精灵技能
                </button>
                <button
                  className={skillTab === "library" ? "active" : ""}
                  onClick={() => {
                    setSkillTab("library");
                    void saveConfig({ active_tab: "library" });
                  }}
                >
                  技能库
                </button>
              </div>
            ) : null}
            <select className="element-filter" value={element} onChange={(event) => setElement(event.target.value)}>
              <option value="">全部属性</option>
              {elements.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            {mode !== "skill" ? (
              <>
                <button
                  className="icon-button"
                  title={sortDesc ? "编号降序" : "编号升序"}
                  onClick={() => {
                    const next = !sortDesc;
                    setSortDesc(next);
                    void saveConfig({ sort_desc: next });
                  }}
                >
                  {sortDesc ? "↓" : "↑"}
                </button>
                <button
                  className={finalOnly ? "filter-toggle active" : "filter-toggle"}
                  onClick={() => {
                    const next = !finalOnly;
                    setFinalOnly(next);
                    void saveConfig({ final_only: next });
                  }}
                >
                  最终形态
                </button>
              </>
            ) : (
              <button onClick={() => void saveConfig({ element })}>保存筛选</button>
            )}
          </div>
          {mode === "pet" && onPickPreset && presets.length ? (
            <div className="picker-tools-sub">
              <FieldLabel>分组</FieldLabel>
              <select value={currentGroup?.name || ""} onChange={(event) => setGroupName(event.target.value)}>
                {presets.map((group) => (
                  <option key={group.name} value={group.name}>{group.name}</option>
                ))}
              </select>
              <button
                onClick={() =>
                  void saveConfig({
                    element,
                    sort_desc: sortDesc,
                    final_only: finalOnly,
                    active_tab: petTab,
                    [groupConfigKey]: groupName,
                  })
                }
              >
                保存配置
              </button>
            </div>
          ) : mode !== "skill" ? (
            <div className="picker-tools-sub">
              <button onClick={() => void saveConfig({ element, sort_desc: sortDesc, final_only: finalOnly })}>
                保存配置
              </button>
            </div>
          ) : null}
        </div>
        <div className="compact-picker-grid">
          {mode === "skill"
            ? filteredSkills.map((skill, index) => (
                <button key={`${skill.name}-${index}`} className="compact-picker-card" onClick={() => onPickSkill(skill)}>
                  <strong>{skill.name}</strong>
                  {skillMeta(skill) ? <span>{skillMeta(skill)}</span> : null}
                  {skillText(skill) ? <em>{skillText(skill)}</em> : null}
                </button>
              ))
            : mode === "pet" && petTab === "preset" && onPickPreset
              ? filteredPresets.map((preset) => (
                  <button key={preset.key} className="compact-picker-card" onClick={() => onPickPreset(preset)}>
                    <strong className="preset-name" title={`${preset.id} ${preset.name}`}>{preset.key}</strong>
                    <span>{preset.id} {preset.name} | {preset.skills?.slice(0, DEFAULT_SKILL_CARD_COUNT).filter(Boolean).join(" / ") || "未保存技能"}</span>
                  </button>
                ))
              : filteredPets.map((pet) => (
                <button
                  key={`${mode}-${pet.label}`}
                  className="compact-picker-card"
                  onClick={() => (mode === "trait" ? onPickTrait(pet) : onPickPet(pet))}
                >
                  <strong>
                    {pet.id} {pet.name}
                  </strong>
                  <span>{pet.elements.join(" / ")}</span>
                  <em>{mode === "trait" ? `${pet.traitName || "-"}：${pet.traitEffect || ""}` : `种族 ${pet.race ?? "-"}，技能 ${pet.skillCount}`}</em>
                </button>
              ))}
        </div>
      </section>
    </div>
  );
}

function TeamActionPanel({
  leftAttacks,
  onToggleDirection,
  onCalculate,
  onApplyBuff,
  buffOptions,
  selectedBuffOption,
  onSelectBuffOption,
}: {
  leftAttacks: boolean;
  onToggleDirection: () => void;
  onCalculate: () => void;
  onApplyBuff: () => void;
  buffOptions: BuffOption[];
  selectedBuffOption: number;
  onSelectBuffOption: (index: number) => void;
}) {
  const [position, setPosition] = useState(() => ({
    x: Math.max(8, Math.round(window.innerWidth / 2 - 150)),
    y: 76,
  }));
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, select")) return;
    event.preventDefault();
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y };
    const move = (moveEvent: PointerEvent) => {
      const start = dragRef.current;
      if (!start) return;
      const panelWidth = panelRef.current?.offsetWidth || 300;
      const panelHeight = panelRef.current?.offsetHeight || 46;
      setPosition({
        x: Math.min(Math.max(8, start.x + moveEvent.clientX - start.pointerX), Math.max(8, window.innerWidth - panelWidth - 8)),
        y: Math.min(Math.max(8, start.y + moveEvent.clientY - start.pointerY), Math.max(8, window.innerHeight - panelHeight - 8)),
      });
    };
    const stop = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  return (
    <section ref={panelRef} className="team-action-floating" style={{ left: position.x, top: position.y }} onPointerDown={startDrag}>
      <div className="team-action-buttons">
        <button className="direction-button" title="切换攻击方向" onClick={onToggleDirection}>
          {leftAttacks ? "→" : "←"}
        </button>
        <button className="calc-button" onClick={onCalculate}>计算</button>
        <select
          className="buff-option-select"
          value={buffOptions.length ? selectedBuffOption : ""}
          disabled={!buffOptions.length}
          onChange={(event) => onSelectBuffOption(Number(event.target.value))}
        >
          {buffOptions.length ? buffOptions.map((option, index) => <option key={`${option.label}-${index}`} value={index}>{option.label}</option>) : <option value="">无可应用 Buff</option>}
        </select>
        <button className="buff-button" onClick={onApplyBuff} disabled={!buffOptions.length}>应用</button>
      </div>
    </section>
  );
}

function TeamBattlePage({
  presets,
  pets,
  elements,
  configs,
  burstEffects,
  onPresetsChanged,
  onConfigsChanged,
}: {
  presets: PresetGroup[];
  pets: Pet[];
  elements: string[];
  configs: PickerConfigs;
  burstEffects: BurstEffectItem[];
  onPresetsChanged: (groups: PresetGroup[]) => void;
  onConfigsChanged: (configs: PickerConfigs) => void;
}) {
  const teamValues = uiTokenValues(configs);
  const teamSlotCount = teamValues["team-slot-count"];
  const teamSkillCardCount = teamValues["team-skill-card-count"];
  const [leftSlots, setLeftSlots] = useState<UnitState[]>(() => Array.from({ length: teamSlotCount }, blankUnit));
  const [rightSlots, setRightSlots] = useState<UnitState[]>(() => Array.from({ length: teamSlotCount }, blankUnit));
  const [leftIndex, setLeftIndex] = useState(0);
  const [rightIndex, setRightIndex] = useState(0);
  const [petPicker, setPetPicker] = useState<{ side: "left" | "right"; index: number } | null>(null);
  const [leftAttacks, setLeftAttacks] = useState(true);
  const [leftOtherBonuses, setLeftOtherBonuses] = useState<TeamOtherBonuses>(blankTeamOtherBonuses);
  const [rightOtherBonuses, setRightOtherBonuses] = useState<TeamOtherBonuses>(blankTeamOtherBonuses);
  const [weather, setWeather] = useState<(typeof WEATHER_OPTIONS)[number]["value"]>("none");
  const [results, setResults] = useState<BattleResult[]>([]);
  const [battleContext, setBattleContext] = useState<BattleContext | null>(null);
  const [error, setError] = useState("");
  const [buffOptions, setBuffOptions] = useState<BuffOption[]>([]);
  const [selectedBuffOption, setSelectedBuffOption] = useState(0);
  const activeBuffUnit = leftAttacks ? leftSlots[leftIndex] : rightSlots[rightIndex];
  const activeBuffSkillName = activeBuffUnit?.current_skill || activeBuffUnit?.skills?.[0] || "";

  function resizeSlots(count: number) {
    setLeftSlots((slots) => Array.from({ length: count }, (_, index) => slots[index] || blankUnit()));
    setRightSlots((slots) => Array.from({ length: count }, (_, index) => slots[index] || blankUnit()));
    setLeftIndex((index) => Math.min(index, count - 1));
    setRightIndex((index) => Math.min(index, count - 1));
  }

  useEffect(() => {
    resizeSlots(teamSlotCount);
  }, [teamSlotCount]);

  useEffect(() => {
    let cancelled = false;
    setBuffOptions([]);
    setSelectedBuffOption(0);
    if (!activeBuffSkillName) return () => { cancelled = true; };

    void invoke<ApplySkillBuffsResult>("apply_skill_buffs", {
      payload: { skill_name: activeBuffSkillName },
    })
      .then((data) => {
        if (cancelled || data.skill_name !== activeBuffSkillName) return;
        const options = (data.options || [])
          .map((option, index) => ({
            label: option.label || `Buff 选项 ${index + 1}`,
            effects: (option.effects || []).filter(
              (effect) => BUFF_STATE_FIELDS.includes(effect.field) && Number.isFinite(Number(effect.value)),
            ),
          }))
          .filter((option) => option.effects.length > 0);
        setBuffOptions(options);
      })
      .catch((err) => {
        if (!cancelled) setError(asError(err));
      });
    return () => { cancelled = true; };
  }, [activeBuffSkillName, leftAttacks, leftIndex, rightIndex]);

  function setSlot(side: "left" | "right", index: number, state: UnitState) {
    const setter = side === "left" ? setLeftSlots : setRightSlots;
    setter((slots) => slots.map((slot, i) => (i === index ? state : slot)));
  }

  function patchSlot(side: "left" | "right", index: number, partial: Partial<UnitState>) {
    const slots = side === "left" ? leftSlots : rightSlots;
    setSlot(side, index, { ...slots[index], ...partial });
  }

  function importGroup(side: "left" | "right", groupName: string) {
    const group = presets.find((item) => item.name === groupName);
    if (!group) return;
    const setter = side === "left" ? setLeftSlots : setRightSlots;
    setter((slots) => slots.map((slot, index) => (index < group.items.length ? mergePresetIntoUnit(slot, group.items[index]) : slot)));
    if (side === "left") {
      setLeftIndex(0);
    } else {
      setRightIndex(0);
    }
  }

  async function calculate() {
    setError("");
    try {
      const attacker = leftAttacks ? leftSlots[leftIndex] : rightSlots[rightIndex];
      const defender = leftAttacks ? rightSlots[rightIndex] : leftSlots[leftIndex];
      const other_bonuses = leftAttacks ? leftOtherBonuses : rightOtherBonuses;
      const defender_other_bonuses = leftAttacks ? rightOtherBonuses : leftOtherBonuses;
      const data = await invoke<{ results: BattleResult[] }>("calculate_battle", { payload: { attacker: { ...attacker, other_bonuses }, defender: { ...defender, other_bonuses: defender_other_bonuses }, weather } });
      setBattleContext(battleContextFromUnits(attacker, defender));
      setResults(data.results);
    } catch (err) {
      setError(asError(err));
      setBattleContext(null);
      setResults([]);
    }
  }

  async function applyBuff() {
    setError("");
    const attackerSide = leftAttacks ? "left" : "right";
    const opponentSide = leftAttacks ? "right" : "left";
    const selectedOption = buffOptions[selectedBuffOption];
    if (!selectedOption) {
      setError(activeBuffSkillName ? "该技能没有可应用的 Buff" : "请先选择技能");
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
      if (effect.target === "self" || effect.target === "both") applyTo(attackerSide, effect);
      if (effect.target === "opponent" || effect.target === "both") applyTo(opponentSide, effect);
    });
    setLeftSlots(nextLeft);
    setRightSlots(nextRight);
  }

  return (
    <section className="battle-page">
      <div className="team-layout">
        <Roster className="team-left-roster" title="己方队伍" presets={presets} pets={pets} elements={elements} configs={configs} slots={leftSlots} activeIndex={leftIndex} onConfigsChanged={onConfigsChanged} onImportGroup={(groupName) => importGroup("left", groupName)} onSelect={setLeftIndex} onPatchSlot={(partial) => patchSlot("left", leftIndex, partial)} onChoose={(index) => { setLeftIndex(index); setPetPicker({ side: "left", index }); }} onClear={(index) => setSlot("left", index, blankUnit())} />
        <Roster className="team-right-roster" title="敌方队伍" presets={presets} pets={pets} elements={elements} configs={configs} slots={rightSlots} activeIndex={rightIndex} onConfigsChanged={onConfigsChanged} onImportGroup={(groupName) => importGroup("right", groupName)} onSelect={setRightIndex} onPatchSlot={(partial) => patchSlot("right", rightIndex, partial)} onChoose={(index) => { setRightIndex(index); setPetPicker({ side: "right", index }); }} onClear={(index) => setSlot("right", index, blankUnit())} />
        <section className="weather-panel">
          <label>
            <span className="ui-field-title">天气</span>
            <select value={weather} onChange={(event) => setWeather(event.target.value as (typeof WEATHER_OPTIONS)[number]["value"])}>
              {WEATHER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </section>
        <TeamBuffPanel className="team-left-buff" title="己方 buff" value={leftSlots[leftIndex]} onChange={(partial) => patchSlot("left", leftIndex, partial)} />
        <TeamBuffPanel className="team-right-buff" title="敌方 buff" value={rightSlots[rightIndex]} onChange={(partial) => patchSlot("right", rightIndex, partial)} />
        <TeamSkillCards className="team-left-skills" title="己方技能卡片" cardCount={teamSkillCardCount} value={leftSlots[leftIndex]} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onChange={(partial) => patchSlot("left", leftIndex, partial)} />
        <TeamSkillCards className="team-right-skills" title="敌方技能卡片" cardCount={teamSkillCardCount} value={rightSlots[rightIndex]} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onChange={(partial) => patchSlot("right", rightIndex, partial)} />
        <TeamOtherBonusPanel className="team-left-other-bonuses" title="己方其他加成" value={leftOtherBonuses} burstEffects={burstEffects} onChange={(partial) => setLeftOtherBonuses((current) => ({ ...current, ...partial }))} />
        <TeamOtherBonusPanel className="team-right-other-bonuses" title="敌方其他加成" value={rightOtherBonuses} burstEffects={burstEffects} onChange={(partial) => setRightOtherBonuses((current) => ({ ...current, ...partial }))} />
      </div>
      <TeamActionPanel leftAttacks={leftAttacks} onToggleDirection={() => setLeftAttacks((value) => !value)} onCalculate={() => void calculate()} onApplyBuff={() => void applyBuff()} buffOptions={buffOptions} selectedBuffOption={selectedBuffOption} onSelectBuffOption={setSelectedBuffOption} />
      <ResultView results={results} error={error} context={battleContext} />
      {petPicker ? (
        <PickerModal
          mode="pet"
          preferredGroup={petPicker.side === "left" ? "attackers" : "defenders"}
          presets={presets}
          pets={pets}
          elements={elements}
          petSkills={[]}
          allSkills={[]}
          traits={[]}
          configs={configs}
          onConfigsChanged={onConfigsChanged}
          onClose={() => setPetPicker(null)}
          onPickPreset={(preset) => {
            setSlot(petPicker.side, petPicker.index, unitFromPreset(preset, true));
            setPetPicker(null);
          }}
          onPickPet={(pet) => {
            setSlot(petPicker.side, petPicker.index, { ...blankUnit(), name: pet.label });
            setPetPicker(null);
          }}
          onPickSkill={() => undefined}
          onPickTrait={() => undefined}
        />
      ) : null}
    </section>
  );
}

function PresetManagerPage({
  presets,
  pets,
  elements,
  configs,
  onPresetsChanged,
  onConfigsChanged,
}: {
  presets: PresetGroup[];
  pets: Pet[];
  elements: string[];
  configs: PickerConfigs;
  onPresetsChanged: (groups: PresetGroup[]) => void;
  onConfigsChanged: (configs: PickerConfigs) => void;
}) {
  const firstGroupName = presets[0]?.name || "attackers";
  const [groupName, setGroupName] = useState(firstGroupName);
  const [targetGroup, setTargetGroup] = useState(firstGroupName);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [presetName, setPresetName] = useState("");
  const [editor, setEditor] = useState<UnitState>(blankUnit());
  const [picker, setPicker] = useState<"pet" | null>(null);
  const [skillPickerIndex, setSkillPickerIndex] = useState<number | null>(null);
  const [skillData, setSkillData] = useState<SkillListResult>({ petSkills: [], allSkills: [] });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const currentGroup = presets.find((group) => group.name === groupName) || presets[0];
  const selectedPreset = currentGroup?.items.find((item) => item.key === selectedKey) || null;

  useEffect(() => {
    if (!presets.some((group) => group.name === groupName)) {
      setGroupName(firstGroupName);
    }
    if (!presets.some((group) => group.name === targetGroup)) {
      setTargetGroup(firstGroupName);
    }
  }, [firstGroupName, groupName, presets, targetGroup]);

  useEffect(() => {
    if (skillPickerIndex === null) return;
    void cachedListSkills(editor.name).then(setSkillData).catch(() => setSkillData({ petSkills: [], allSkills: [] }));
  }, [editor.name, skillPickerIndex]);

  function patchEditor(partial: Partial<UnitState>) {
    setEditor((value) => ({ ...value, ...partial }));
  }

  function selectPreset(preset: PresetItem) {
    setSelectedKey(preset.key);
    setPresetName(preset.key);
    setEditor(unitFromPreset(preset));
    setMessage("");
    setError("");
  }

  function newPreset() {
    setSelectedKey("");
    setPresetName("");
    setEditor(blankUnit());
    setMessage("");
    setError("");
  }

  function setSkillAt(index: number, skillName: string) {
    const next = skillCardSlots(editor.skills, Math.max(DEFAULT_SKILL_CARD_COUNT, editor.skills.length));
    next[index] = skillName;
    patchEditor({ skills: next.filter(Boolean), current_skill: skillName });
  }

  function clearSkillAt(index: number) {
    const next = skillCardSlots(editor.skills, Math.max(DEFAULT_SKILL_CARD_COUNT, editor.skills.length));
    const removed = next[index];
    next[index] = "";
    const skills = next.filter(Boolean);
    patchEditor({ skills, current_skill: editor.current_skill === removed ? skills[0] || "" : editor.current_skill });
  }

  async function runPresetAction(payload: Record<string, unknown>, successMessage: string) {
    setError("");
    try {
      const data = await invoke<PresetManagerResult>("manage_preset", { payload });
      onPresetsChanged(data.presets);
      if (data.groupName) {
        setGroupName(data.groupName);
        setTargetGroup(data.groupName);
      }
      setSelectedKey(data.presetName || "");
      setMessage(successMessage);
    } catch (err) {
      setError(asError(err));
    }
  }

  async function createGroup() {
    const name = newGroupName.trim();
    if (!name) {
      setError("分组名不能为空");
      return;
    }
    await runPresetAction({ action: "create_group", groupName: name }, `已创建分组：${name}`);
    setNewGroupName("");
  }

  async function savePreset() {
    setError("");
    try {
      const data = await invoke<{ presets: PresetGroup[]; presetName: string }>("save_preset", {
        payload: { groupName, presetName, presetKey: selectedKey, state: editor, overwrite: true },
      });
      onPresetsChanged(data.presets);
      setSelectedKey(data.presetName);
      setPresetName(data.presetName);
      setMessage(`已保存：${data.presetName}`);
    } catch (err) {
      setError(asError(err));
    }
  }

  async function copyPreset() {
    if (!selectedPreset) return;
    await runPresetAction(
      { action: "copy_preset", groupName, presetKey: selectedPreset.key, targetGroup, targetName: presetName || selectedPreset.key },
      `已复制到：${targetGroup}`,
    );
  }

  async function movePreset() {
    if (!selectedPreset) return;
    await runPresetAction(
      { action: "move_preset", groupName, presetKey: selectedPreset.key, targetGroup, targetName: presetName || selectedPreset.key },
      `已移动到：${targetGroup}`,
    );
  }

  async function deletePreset() {
    if (!selectedPreset || !window.confirm(`删除预设“${selectedPreset.key}”？`)) return;
    await runPresetAction({ action: "delete_preset", groupName, presetKey: selectedPreset.key }, `已删除：${selectedPreset.key}`);
    newPreset();
  }

  const skillCards = skillCardSlots(editor.skills).map((name) => (name ? { name } : null));

  return (
    <section className="preset-manager-page">
      <aside className="preset-library-panel">
        <header className="preset-manager-header">
          <h2 className="preset-library-title">精灵预设</h2>
          <button className="compact-button preset-new-button" onClick={newPreset}>新建预设</button>
        </header>
        <div className="preset-group-row">
          <FieldLabel className="preset-group-label">分组</FieldLabel>
          <select className="preset-group-control" value={currentGroup?.name || ""} onChange={(event) => { setGroupName(event.target.value); setSelectedKey(""); }}>
            {presets.map((group) => (
              <option key={group.name} value={group.name}>{group.name}</option>
            ))}
          </select>
        </div>
        <div className="preset-create-row">
          <input className="preset-new-group-input" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="新分组名" />
          <button className="preset-create-button" onClick={() => void createGroup()}>创建分组</button>
        </div>
        <div className="preset-list">
          {(currentGroup?.items || []).map((preset) => (
            <button key={preset.key} className={preset.key === selectedKey ? "preset-list-item preset-list-control active" : "preset-list-item preset-list-control"} onClick={() => selectPreset(preset)}>
              <strong>{preset.key}</strong>
              <span>{preset.id} {preset.name}</span>
              <em>{preset.skills?.filter(Boolean).join(" / ") || "未保存技能"}</em>
            </button>
          ))}
        </div>
      </aside>
      <section className="preset-editor-panel">
        <header className="preset-manager-header">
          <h2 className="preset-settings-title">保存设置</h2>
          <div className="header-actions">
            <button className="compact-button preset-save-button" onClick={() => void savePreset()}>保存预设</button>
            <button className="compact-button preset-delete-button" disabled={!selectedPreset} onClick={() => void deletePreset()}>删除</button>
          </div>
        </header>
        <section className="preset-editor-section preset-main-section">
          <FieldLabel className="preset-name-label">
            <span className="ui-field-title preset-section-title">预设名</span>
            <input className="preset-name-input" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="留空则使用精灵名" />
          </FieldLabel>
          <FieldLabel className="preset-pet-label">
            <span className="ui-field-title preset-section-title">精灵</span>
            <div className="preset-pet-row">
              <input className="preset-pet-input" list="pet-options" value={editor.name} onChange={(event) => patchEditor({ name: event.target.value })} placeholder="选择或输入精灵" />
              <button className="preset-pet-picker-button" onClick={() => setPicker("pet")}>选宠</button>
            </div>
          </FieldLabel>
        </section>
        <div className="slot-inline-controls preset-runtime-section">
          <TeamTraitEditor value={editor} pets={pets} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onChange={patchEditor} />
          <TeamIvEditor value={editor} onChange={patchEditor} alwaysOpen />
          <TeamEvolutionControls value={editor} pets={pets} onChange={patchEditor} className="preset-evolution-controls" />
        </div>
        <section className="preset-editor-section">
          <div className="panel-title">
            <h2 className="preset-skills-title">技能</h2>
            <button className="compact-button preset-skill-reset-button" onClick={() => patchEditor({ skills: [], current_skill: "" })}>重置</button>
          </div>
          <TeamSkillCardGrid
            cards={skillCards}
            currentSkill={editor.current_skill}
            onPick={(current_skill) => patchEditor({ current_skill })}
            onChoose={setSkillPickerIndex}
            onClear={clearSkillAt}
          />
        </section>
        <section className="preset-editor-section preset-transfer-section">
          <div className="preset-transfer-target">
            <FieldLabel className="preset-transfer-label"><span className="ui-field-title preset-section-title">目标分组</span></FieldLabel>
            <select className="preset-transfer-select" value={targetGroup} onChange={(event) => setTargetGroup(event.target.value)}>
              {presets.map((group) => (
                <option key={group.name} value={group.name}>{group.name}</option>
              ))}
            </select>
          </div>
          <div className="preset-transfer-actions">
            <button className="preset-copy-button" disabled={!selectedPreset} onClick={() => void copyPreset()}>复制</button>
            <button className="preset-move-button" disabled={!selectedPreset} onClick={() => void movePreset()}>移动</button>
          </div>
        </section>
        {message ? <p className="save-message">{message}</p> : null}
        {error ? <p className="error-text preset-message">错误：{error}</p> : null}
      </section>
      {picker ? (
        <PickerModal
          mode="pet"
          preferredGroup={groupName}
          presets={presets}
          pets={pets}
          elements={elements}
          petSkills={[]}
          allSkills={[]}
          traits={[]}
          configs={configs}
          onConfigsChanged={onConfigsChanged}
          onClose={() => setPicker(null)}
          onPickPreset={(preset) => {
            selectPreset(preset);
            setPicker(null);
          }}
          onPickPet={(pet) => {
            patchEditor({ name: pet.label });
            if (!presetName) setPresetName(`${pet.id}${pet.name}`);
            setPicker(null);
          }}
          onPickSkill={() => undefined}
          onPickTrait={() => undefined}
        />
      ) : null}
      {skillPickerIndex !== null ? (
        <PickerModal
          mode="skill"
          pets={[]}
          elements={elements}
          petSkills={skillData.petSkills}
          allSkills={skillData.allSkills}
          traits={[]}
          configs={configs}
          onConfigsChanged={onConfigsChanged}
          onClose={() => setSkillPickerIndex(null)}
          onPickPet={() => undefined}
          onPickSkill={(skill) => {
            setSkillAt(skillPickerIndex, skill.name);
            setSkillPickerIndex(null);
          }}
          onPickTrait={() => undefined}
        />
      ) : null}
    </section>
  );
}

function TeamSkillCards({
  title,
  className = "",
  cardCount,
  value,
  elements,
  configs,
  onConfigsChanged,
  onChange,
}: {
  title: string;
  className?: string;
  cardCount: number;
  value: UnitState;
  elements: string[];
  configs: PickerConfigs;
  onConfigsChanged: (configs: PickerConfigs) => void;
  onChange: (partial: Partial<UnitState>) => void;
}) {
  const cards = skillCardSlots(value.skills, cardCount).map((name) => (name ? { name } : null));
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [skillData, setSkillData] = useState<SkillListResult>({ petSkills: [], allSkills: [] });
    const [stackableTriggers, setStackableTriggers] = useState<SkillTriggerInfo["stackable"]>([]);
    const [usageModeOptions, setUsageModeOptions] = useState<SkillTriggerInfo["usage_mode_options"]>([]);
  const currentSkill = value.current_skill || value.skills[0] || "";

  useEffect(() => {
    if (pickerIndex === null) return;
    void cachedListSkills(value.name).then(setSkillData).catch(() => setSkillData({ petSkills: [], allSkills: [] }));
  }, [pickerIndex, value.name]);

  useEffect(() => {
    let cancelled = false;
      setStackableTriggers([]);
      setUsageModeOptions([]);
    if (!currentSkill) return () => { cancelled = true; };
    void cachedSkillTriggerInfo(currentSkill)
      .then((data) => {
        if (!cancelled && data.skill_name === currentSkill) {
          setStackableTriggers(data.stackable || []);
          setUsageModeOptions(data.usage_mode_options || []);
        }
      })
      .catch(() => {
          if (!cancelled) setStackableTriggers([]);
          if (!cancelled) setUsageModeOptions([]);
      });
    return () => { cancelled = true; };
  }, [currentSkill]);

  function setSkillAt(index: number, skillName: string) {
    const next = skillCardSlots(value.skills, Math.max(cardCount, value.skills.length));
    next[index] = skillName;
    onChange({
      skills: next.filter(Boolean),
      current_skill: skillName,
    });
  }

  function clearSkillAt(index: number) {
    const next = skillCardSlots(value.skills, Math.max(cardCount, value.skills.length));
    const removed = next[index];
    next[index] = "";
    const skills = next.filter(Boolean);
    onChange({
      skills,
      current_skill: value.current_skill === removed ? skills[0] || "" : value.current_skill,
        skill_trigger_stacks: Object.fromEntries(
          Object.entries(value.skill_trigger_stacks).filter(([skillName]) => skillName !== removed),
        ),
        skill_usage_mode_choices: Object.fromEntries(
          Object.entries(value.skill_usage_mode_choices).filter(([skillName]) => skillName !== removed),
        ),
    });
  }

  return (
    <section className={`team-skill-panel ${className}`.trim()}>
      <h2>{title}</h2>
      <TeamSkillCardGrid
        cards={cards}
        currentSkill={value.current_skill}
        onPick={(current_skill) => onChange({ current_skill })}
        onChoose={setPickerIndex}
        onClear={clearSkillAt}
      />
      {stackableTriggers.length ? (
        <div className="team-skill-inline-controls">
          {stackableTriggers.map((trigger) => {
            const stacks = value.skill_trigger_stacks[currentSkill] || [];
            const stackCount = stacks[trigger.index] ?? 0;
            return (
              <div className="skill-stack-control" key={trigger.index}>
                <FieldLabel>{stackableTriggers.length > 1 ? trigger.label : "叠加"}</FieldLabel>
                <NumberInput
                  value={stackCount}
                  min={0}
                  max={10}
                  onChange={(nextStackCount) => {
                    const nextStacks = [...stacks];
                    nextStacks[trigger.index] = nextStackCount;
                    onChange({ skill_trigger_stacks: { ...value.skill_trigger_stacks, [currentSkill]: nextStacks } });
                  }}
                />
              </div>
            );
          })}
          <button
            className="compact-button skill-reset-button"
            onClick={() => onChange({ skill_trigger_stacks: { ...value.skill_trigger_stacks, [currentSkill]: [] } })}
          >
            重置
          </button>
        </div>
      ) : null}
      {usageModeOptions.length > 1 && value.usage_time_plus > 0 ? (
        <div className="team-skill-inline-controls">
          <div className="skill-stack-control">
            <FieldLabel>使用强化</FieldLabel>
            <select
              value={value.skill_usage_mode_choices[currentSkill] ?? usageModeOptions[0].index}
              onChange={(event) => onChange({
                skill_usage_mode_choices: {
                  ...value.skill_usage_mode_choices,
                  [currentSkill]: Number(event.target.value),
                },
              })}
            >
              {usageModeOptions.map((option) => <option key={option.index} value={option.index}>{option.label}</option>)}
            </select>
          </div>
        </div>
      ) : null}
      {pickerIndex !== null ? (
        <PickerModal
          mode="skill"
          pets={[]}
          elements={elements}
          petSkills={skillData.petSkills}
          allSkills={skillData.allSkills}
          traits={[]}
          configs={configs}
          onConfigsChanged={onConfigsChanged}
          onClose={() => setPickerIndex(null)}
          onPickPet={() => undefined}
          onPickSkill={(skill) => {
            setSkillAt(pickerIndex, skill.name);
            setPickerIndex(null);
          }}
          onPickTrait={() => undefined}
        />
      ) : null}
    </section>
  );
}

function TeamOtherBonusPanel({
  title,
  className = "",
  value,
  burstEffects,
  onChange,
}: {
  title: string;
  className?: string;
  value: TeamOtherBonuses;
  burstEffects: BurstEffectItem[];
  onChange: (partial: Partial<TeamOtherBonuses>) => void;
}) {
  return (
    <details className={`team-other-bonuses ${className}`.trim()}>
      <summary>{title}</summary>
      <details className="other-bonus-category">
        <summary>奉献</summary>
        <div className="other-bonus-controls">
          <div>
            <FieldLabel>威力层数</FieldLabel>
            <NumberInput value={value.dedication_power_stacks} min={0} max={99} onChange={(dedication_power_stacks) => onChange({ dedication_power_stacks })} />
          </div>
          <div>
            <FieldLabel>连击层数</FieldLabel>
            <NumberInput value={value.dedication_combo_stacks} min={0} max={99} onChange={(dedication_combo_stacks) => onChange({ dedication_combo_stacks })} />
          </div>
        </div>
      </details>
      <details className="other-bonus-category">
        <summary>印记</summary>
        <div className="other-bonus-controls">
          <div>
            <FieldLabel>蓄电印记</FieldLabel>
            <NumberInput value={value.charge_mark_stacks} min={0} max={99} onChange={(charge_mark_stacks) => onChange({ charge_mark_stacks })} />
            <button
              className={value.charge_mark_triggered ? "compact-button active" : "compact-button"}
              aria-pressed={value.charge_mark_triggered}
              onClick={() => onChange({ charge_mark_triggered: !value.charge_mark_triggered })}
            >
              迸发触发
            </button>
          </div>
          <div>
            <FieldLabel>攻击印记</FieldLabel>
            <NumberInput value={value.attack_mark_stacks} min={0} max={99} onChange={(attack_mark_stacks) => onChange({ attack_mark_stacks })} />
          </div>
          <div>
            <FieldLabel>蓄势印记</FieldLabel>
            <NumberInput value={value.momentum_mark_stacks} min={0} max={99} onChange={(momentum_mark_stacks) => onChange({ momentum_mark_stacks })} />
          </div>
        </div>
      </details>
      <details className="other-bonus-category">
        <summary>星陨印记</summary>
        <div className="other-bonus-controls">
          <div>
            <FieldLabel>层数</FieldLabel>
            <NumberInput value={value.starfall_mark_stacks} min={0} max={99} onChange={(starfall_mark_stacks) => onChange({ starfall_mark_stacks })} />
          </div>
        </div>
      </details>
      <details className="other-bonus-category">
        <summary>雷暴面板</summary>
        <div className="burst-trigger-checklist">
          {burstEffects.map((effect) => {
            const checked = value.burst_triggered_effect_ids.includes(effect.id);
            return (
              <label key={effect.id} className="check-row">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange({
                    burst_triggered_effect_ids: checked
                      ? value.burst_triggered_effect_ids.filter((id) => id !== effect.id)
                      : [...value.burst_triggered_effect_ids, effect.id],
                  })}
                />
                <span>{effect.name}</span>
              </label>
            );
          })}
        </div>
      </details>
    </details>
  );
}

function TeamSkillCardGrid({
  cards,
  currentSkill,
  onPick,
  onChoose,
  onClear,
}: {
  cards: Array<SkillItem | null>;
  currentSkill: string;
  onPick: (skill: string) => void;
  onChoose: (index: number) => void;
  onClear: (index: number) => void;
}) {
  const cardSkillNames = [...new Set(cards.flatMap((skill) => (skill ? [skill.name] : [])))];
  const cardSkillNamesKey = cardSkillNames.join("\u0000");
  const [skillDescriptions, setSkillDescriptions] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (!cardSkillNames.length) {
      setSkillDescriptions({});
      return () => { cancelled = true; };
    }
    void Promise.all(cardSkillNames.map(async (name) => {
      const data = await cachedSkillTriggerInfo(name);
      return [name, data.description || ""] as const;
    }))
      .then((descriptions) => {
        if (!cancelled) setSkillDescriptions(Object.fromEntries(descriptions));
      })
      .catch(() => {
        if (!cancelled) setSkillDescriptions({});
      });
    return () => { cancelled = true; };
  }, [cardSkillNamesKey]);

  return (
    <div className="skill-card-grid">
      {cards.map((skill, index) => (
        <div
          key={skill ? `${skill.name}-${index}` : `empty-${index}`}
          className={skill?.name === currentSkill ? "skill-card selected team-skill-card" : "skill-card team-skill-card"}
          role="button"
          tabIndex={0}
          title={skill ? [skill.name, skillDescriptions[skill.name]].filter(Boolean).join("\n") : "空技能"}
          onClick={() => {
            if (skill) onPick(skill.name);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (skill) onPick(skill.name);
            }
          }}
        >
          <strong>{skill?.name || "空技能"}</strong>
          <button
            className="slot-action"
            onClick={(event) => {
              event.stopPropagation();
              skill ? onClear(index) : onChoose(index);
            }}
          >
            {skill ? "取消" : "选择"}
          </button>
        </div>
      ))}
    </div>
  );
}

function TeamBuffPanel({
  title,
  className = "",
  value,
  onChange,
}: {
  title: string;
  className?: string;
  value: UnitState;
  onChange: (partial: Partial<UnitState>) => void;
}) {
  return (
    <details className={`team-buff-panel ${className}`.trim()}>
      <summary>
        <span>{title}</span>
        <button
          className="compact-button buff-reset-button"
          onClick={(event) => {
            event.preventDefault();
            onChange({
              phys_atk_buff: 0,
              mag_atk_buff: 0,
              phys_def_buff: 0,
              mag_def_buff: 0,
              power_multiplier: 0,
              power_bonus: 0,
              combo_plus: 0,
              combo_mul: 1,
              usage_time_plus: 0,
            });
          }}
        >
          重置
        </button>
      </summary>
      <div className="buff-grid team-buff-grid">
        <FieldLabel>物攻%</FieldLabel>
        <NumberInput value={value.phys_atk_buff} min={-300} max={300} step={10} onChange={(phys_atk_buff) => onChange({ phys_atk_buff })} />
        <FieldLabel>魔攻%</FieldLabel>
        <NumberInput value={value.mag_atk_buff} min={-300} max={300} step={10} onChange={(mag_atk_buff) => onChange({ mag_atk_buff })} />
        <FieldLabel>物防%</FieldLabel>
        <NumberInput value={value.phys_def_buff} min={-300} max={300} step={10} onChange={(phys_def_buff) => onChange({ phys_def_buff })} />
        <FieldLabel>魔防%</FieldLabel>
        <NumberInput value={value.mag_def_buff} min={-300} max={300} step={10} onChange={(mag_def_buff) => onChange({ mag_def_buff })} />
        <FieldLabel>威力%</FieldLabel>
        <NumberInput value={value.power_multiplier} min={-100} max={1000} step={10} onChange={(power_multiplier) => onChange({ power_multiplier })} />
        <FieldLabel>威力+</FieldLabel>
        <NumberInput value={value.power_bonus} min={-500} max={500} step={10} onChange={(power_bonus) => onChange({ power_bonus })} />
        <FieldLabel>连击+</FieldLabel>
        <NumberInput value={value.combo_plus} min={-20} max={20} onChange={(combo_plus) => onChange({ combo_plus })} />
        <FieldLabel>连击倍</FieldLabel>
        <NumberInput value={value.combo_mul} min={1} max={10} onChange={(combo_mul) => onChange({ combo_mul })} />
        <FieldLabel className="buff-usage-label">使用+</FieldLabel>
        <NumberInput className="buff-usage-input" value={value.usage_time_plus} min={0} max={20} onChange={(usage_time_plus) => onChange({ usage_time_plus })} />
      </div>
    </details>
  );
}

function TeamTraitEditor({
  value,
  pets,
  elements,
  configs,
  onChange,
  onConfigsChanged,
}: {
  value: UnitState;
  pets: Pet[];
  elements: string[];
  configs: PickerConfigs;
  onChange: (partial: Partial<UnitState>) => void;
  onConfigsChanged: (configs: PickerConfigs) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [traitRuntime, setTraitRuntime] = useState<any>(null);
  const [expanded, setExpanded] = useState(false);
  const traitQuery = value.trait_override_query || value.name;
  const selectedMegaForm = value.trait_override_query ? null : value.mega_form;
  const resolveMega = !value.trait_override_query && Boolean(value.mega || selectedMegaForm);

  useEffect(() => {
    if (!traitQuery) {
      setTraitRuntime(null);
      return;
    }
    void cachedTraitInfo({
      query: traitQuery,
      mega: resolveMega,
      megaForm: selectedMegaForm,
      triggered: value.trait_triggered,
      stacks: value.trait_stacks,
      choices: value.trait_choices,
    })
      .then((data) => setTraitRuntime(data.runtime))
      .catch((err) => setTraitRuntime({ error: asError(err) }));
  }, [traitQuery, selectedMegaForm, resolveMega, value.trait_triggered, value.trait_stacks, value.trait_choices]);

  const traitLabel = traitRuntime?.error
    ? "特性读取失败"
    : traitRuntime?.name
      ? `${value.trait_override_query ? "手动特性" : "特性"}：${traitRuntime.name}`
      : "未找到精灵特性";
  const traitDetail = traitRuntime?.error ? traitRuntime.error : traitRuntime?.effect_text || "";
  const traitChoiceLabel = (option: string) => ({ weekend: "周末", workday: "工作日" } as Record<string, string>)[option] || option;

  return (
    <section className="team-slot-section">
      <button className="trait-summary-button compact" onClick={() => setExpanded(!expanded)}>
        <strong className="ui-field-title">{traitLabel}</strong>
        <span>{expanded ? "收起" : "展开"}</span>
      </button>
      <div className="trait-control-grid compact">
        <div className="inline-row trait-status-row">
          {traitRuntime?.triggerable ? (
            <button
              aria-pressed={value.trait_triggered}
              className={value.trait_triggered ? "compact-button trait-trigger-button active" : "compact-button trait-trigger-button"}
              onClick={() => onChange({ trait_triggered: !value.trait_triggered })}
            >
              触发
            </button>
          ) : null}
          {traitRuntime?.stack_input ? (
            <>
              <FieldLabel>叠加</FieldLabel>
              <div className="trait-stack-control">
                <NumberInput value={value.trait_stacks} min={0} max={99} onChange={(trait_stacks) => onChange({ trait_stacks })} />
              </div>
            </>
          ) : null}
          <button className="compact-button trait-reset-button" onClick={() => onChange({ trait_override_query: null, trait_triggered: false, trait_stacks: 0, trait_choices: {} })}>重置</button>
        </div>
        {Object.entries(traitRuntime?.exclusive_choices || {}).map(([groupName, choice]: [string, any]) => (
          <label className="inline-row" key={groupName}>
            <FieldLabel>{groupName === "calendar_day_type" ? "日期" : groupName}</FieldLabel>
            <select
              value={value.trait_choices?.[groupName] || choice.selected}
              onChange={(event) => onChange({ trait_choices: { ...value.trait_choices, [groupName]: event.target.value } })}
            >
              {(choice.options || []).map((option: string) => <option key={option} value={option}>{traitChoiceLabel(option)}</option>)}
            </select>
          </label>
        ))}
      </div>
      {expanded ? (
        <div className="trait-expanded-content">
          <div className="inline-row trait-action-row"><button className="compact-button trait-select-button" onClick={() => setPicker(true)}>选特</button></div>
          {traitDetail ? <p className="trait-text">{traitDetail}</p> : null}
          {traitRuntime?.note ? <p className="muted">{traitRuntime.note}</p> : null}
        </div>
      ) : null}
      {picker ? (
        <PickerModal
          mode="trait"
          pets={pets}
          elements={elements}
          petSkills={[]}
          allSkills={[]}
          traits={pets.filter((pet) => Boolean(pet.traitName))}
          configs={configs}
          onConfigsChanged={onConfigsChanged}
          onClose={() => setPicker(false)}
          onPickPet={() => undefined}
          onPickSkill={() => undefined}
          onPickTrait={(pet) => {
            onChange({ trait_override_query: pet.label });
            setPicker(false);
          }}
        />
      ) : null}
    </section>
  );
}

function TeamIvEditor({
  value,
  onChange,
  alwaysOpen = false,
}: {
  value: UnitState;
  onChange: (partial: Partial<UnitState>) => void;
  alwaysOpen?: boolean;
}) {
  const resetButton = (
    <button
      className="compact-button iv-reset-button"
      onClick={(event) => {
        event.preventDefault();
        onChange({ iv: null, personality_bouns: null, personality_down: null });
      }}
    >
      重置
    </button>
  );
  const editorContent = (
    <>
      <div className="iv-grid">
        {STATS.map((stat) => (
          <label key={stat}>
            <span className="ui-field-title">{STAT_LABEL[stat]}</span>
            <select value={value.iv?.[stat] ?? ""} onChange={(event) => onChange({ iv: updateIv(value.iv, stat, event.target.value) })}>
              {IV_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option || "无"}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="personality-pair">
        <PersonalityEditor label="性格+" value={value.personality_bouns} onChange={(personality_bouns) => onChange({ personality_bouns })} />
        <PersonalityEditor label="性格-" value={value.personality_down} onChange={(personality_down) => onChange({ personality_down })} />
      </div>
    </>
  );

  if (alwaysOpen) {
    return (
      <details className="team-slot-section team-iv-details preset-iv-editor" open>
        <summary>
          <span className="ui-field-title">天分与性格</span>
          {resetButton}
        </summary>
        <div className="iv-editor-content">{editorContent}</div>
      </details>
    );
  }

  return (
    <details className="team-slot-section team-iv-details">
      <summary>
        <span className="ui-field-title">天分与性格</span>
        {resetButton}
      </summary>
      <div className="iv-editor-content">{editorContent}</div>
    </details>
  );
}

function Roster({
  title,
  className = "",
  presets,
  pets,
  elements,
  configs,
  slots,
  activeIndex,
  onConfigsChanged,
  onImportGroup,
  onSelect,
  onPatchSlot,
  onChoose,
  onClear,
}: {
  title: string;
  className?: string;
  presets: PresetGroup[];
  pets: Pet[];
  elements: string[];
  configs: PickerConfigs;
  slots: UnitState[];
  activeIndex: number;
  onConfigsChanged: (configs: PickerConfigs) => void;
  onImportGroup: (groupName: string) => void;
  onSelect: (index: number) => void;
  onPatchSlot: (partial: Partial<UnitState>) => void;
  onChoose: (index: number) => void;
  onClear: (index: number) => void;
}) {
  const activeSlot = slots[activeIndex] || blankUnit();
  const controlAfterIndex = Math.min(activeIndex % 2 === 0 ? activeIndex + 1 : activeIndex, slots.length - 1);

  return (
    <section className={`roster ${className}`.trim()}>
      <header className="roster-header">
        <h2>{title}</h2>
        <select
          className="roster-import-select"
          value=""
          title="导入分组"
          onChange={(event) => {
            if (event.target.value) onImportGroup(event.target.value);
          }}
        >
          <option value="">导入分组</option>
          {presets.map((group) => (
            <option key={group.name} value={group.name}>
              {group.name}
            </option>
          ))}
        </select>
      </header>
      <div className="slot-grid">
        {slots.map((slot, index) => (
          <Fragment key={index}>
            <div className="slot-cell">
              <div
                className={index === activeIndex ? "slot active" : "slot"}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelect(index);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(index);
                  }
                }}
              >
                <strong title={slot.display_name || slot.name || "空槽位"}>{slot.display_name || slot.name || "空槽位"}</strong>
                <button
                  className="slot-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    slot.name ? onClear(index) : onChoose(index);
                  }}
                >
                  {slot.name ? "取消" : "选择"}
                </button>
              </div>
            </div>
            {index === controlAfterIndex ? (
              <div className="slot-inline-controls">
                <TeamTraitEditor value={activeSlot} pets={pets} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onChange={onPatchSlot} />
                <TeamIvEditor value={activeSlot} onChange={onPatchSlot} />
                <TeamEvolutionControls value={activeSlot} pets={pets} onChange={onPatchSlot} />
              </div>
            ) : null}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function ResultView({ results, error, context }: { results: BattleResult[]; error: string; context: BattleContext | null }) {
  const [selected, setSelected] = useState<BattleResult | null>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 80, y: 88 });
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const grouped = orderedResultGroups(results);

  useEffect(() => {
    setSelected(results.find((result) => result.is_triggered) || results[0] || null);
    setVisible(Boolean(results.length));
  }, [results]);

  function startDrag(event: any) {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y };
    const move = (moveEvent: PointerEvent) => {
      const start = dragRef.current;
      if (!start) return;
      setPosition({
        x: Math.max(8, start.x + moveEvent.clientX - start.pointerX),
        y: Math.max(8, start.y + moveEvent.clientY - start.pointerY),
      });
    };
    const stop = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  if (error) return <section className="result-panel error-text">错误：{error}</section>;
  if (!results.length || !visible) return null;
  const summary = selected || results[0];
  const attackerName = context?.attackerName || "攻击方";
  const defenderName = context?.defenderName || "防御方";
  const skillName = context?.skillName || summary.skill_name || "-";
  const showLegacyResultCards = false;
  const showLegacyResultDetail = false;
  return (
    <section className="result-floating" style={{ left: position.x, top: position.y }}>
      <header className="result-floating-header" onPointerDown={startDrag}>
        <div>
          <h2>对战结果</h2>
          <p>
            {attackerName} → {defenderName}，{skillName}
          </p>
        </div>
        <button onClick={() => setVisible(false)}>关闭</button>
      </header>
      {grouped.map(([caseLabel, caseResults]) => {
        return (
          <section className="result-section" key={caseLabel}>
            <header>
              <strong>{caseLabel}</strong>
              <span>最终威力 {caseResults[0]?.effective_power ?? "-"}</span>
            </header>
            {showLegacyResultCards ? (
              <div className="result-cards">
                {caseResults.map((result, index) => (
                  <button key={`${caseLabel}-${index}`} className="result-card" onClick={() => setSelected(selected === result ? null : result)}>
                    <strong>
                      {formatAttackLabel(result.atk_label, context)} vs {formatDefenseLabel(result.def_label, context)}
                    </strong>
                    <span>最终伤害 {result.damage}</span>
                    <em>{result.hp_results.map((item) => `${item.damage_percent}%`).join(" / ")}</em>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="result-matrix-list">
              {uniqueByOrder(caseResults.map((result) => result.atk_label)).map((atkLabel) => {
                const atkResults = caseResults.filter((result) => result.atk_label === atkLabel);
                const defLabels = uniqueByOrder(atkResults.map((result) => result.def_label));
                const hpLabels = uniqueByOrder(atkResults.flatMap((result) => result.hp_results.map((item) => item.hp_label)));
                const selectedInMatrix = selected && atkResults.includes(selected) ? selected : null;
                const selectedLabels = selectedInMatrix ? resultValueLabels(selectedInMatrix) : null;
                return (
                  <Fragment key={`${caseLabel}-${atkLabel}`}>
                    <div
                      className="result-matrix"
                      style={{ gridTemplateColumns: `minmax(58px, 0.8fr) minmax(56px, 0.75fr) repeat(${hpLabels.length}, minmax(48px, 0.65fr))` }}
                    >
                      <div className="result-matrix-corner">{formatAttackLabel(atkLabel, context)}</div>
                      <div className={hpLabels.length ? "result-matrix-header" : "result-matrix-header result-matrix-edge-right"}>伤害</div>
                      {hpLabels.map((hpLabel, hpIndex) => (
                        <div className={hpIndex === hpLabels.length - 1 ? "result-matrix-header result-matrix-edge-right" : "result-matrix-header"} key={hpLabel}>{formatHpLabel(hpLabel, context)}</div>
                      ))}
                      {defLabels.map((defLabel) => {
                        const rowResult = atkResults.find((result) => result.def_label === defLabel);
                        const isSelectedRow = Boolean(rowResult && selected === rowResult);
                        const isLastDefenseRow = defLabel === defLabels[defLabels.length - 1];
                        return (
                          <Fragment key={defLabel}>
                            <button
                              className={[
                                "result-matrix-row-label",
                                isSelectedRow ? "selected" : "",
                                !hpLabels.length ? "result-matrix-edge-right" : "",
                                isLastDefenseRow ? "result-matrix-edge-bottom" : "",
                              ].filter(Boolean).join(" ")}
                              disabled={!rowResult}
                              onClick={() => {
                                if (rowResult) setSelected(selected === rowResult ? null : rowResult);
                              }}
                            >
                              {formatDefenseLabel(defLabel, context)}
                            </button>
                            <button
                              className={[
                                "result-matrix-cell",
                                isSelectedRow ? "selected" : "",
                                !hpLabels.length ? "result-matrix-edge-right" : "",
                                isLastDefenseRow ? "result-matrix-edge-bottom" : "",
                              ].filter(Boolean).join(" ")}
                              disabled={!rowResult}
                              onClick={() => {
                                if (rowResult) setSelected(selected === rowResult ? null : rowResult);
                              }}
                            >
                              {rowResult?.damage ?? "-"}
                            </button>
                            {hpLabels.map((hpLabel, hpIndex) => {
                              const hpResult = rowResult?.hp_results.find((item) => item.hp_label === hpLabel);
                              return (
                                <button
                                  className={[
                                    "result-matrix-cell",
                                    isSelectedRow ? "selected" : "",
                                    hpIndex === hpLabels.length - 1 ? "result-matrix-edge-right" : "",
                                    isLastDefenseRow ? "result-matrix-edge-bottom" : "",
                                  ].filter(Boolean).join(" ")}
                                  key={`${defLabel}-${hpLabel}`}
                                  disabled={!rowResult || !hpResult}
                                  onClick={() => {
                                    if (rowResult) setSelected(selected === rowResult ? null : rowResult);
                                  }}
                                >
                                  {rowResult && hpResult ? `${hpResult.damage_percent}%` : "-"}
                                </button>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </div>
                    {selectedInMatrix && selectedLabels ? (
                      <aside className="result-detail">
                        <div className="result-detail-line">
                          <strong>
                            {formatAttackLabel(selectedInMatrix.atk_label, context)} vs {formatDefenseLabel(selectedInMatrix.def_label, context)}
                          </strong>
                          <span>{selectedLabels.attack}值 {selectedInMatrix.atk_value} | {selectedLabels.defense}值 {selectedInMatrix.def_value}</span>
                        </div>
                        <ResultSettlement result={selectedInMatrix} />
                      </aside>
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
          </section>
        );
      })}
      {showLegacyResultDetail && selected ? (
        <aside className="result-detail">
          <div className="result-detail-line">
            <strong>
              {formatAttackLabel(selected.atk_label, context)} vs {formatDefenseLabel(selected.def_label, context)}
            </strong>
            <span>攻击值 {selected.atk_value} | 防御值 {selected.def_value}</span>
          </div>
          <ResultSettlement result={selected} />
          <div>{selected.hp_results.map((item) => <span key={item.hp_label}>{formatHpLabel(item.hp_label, context)}: {item.damage_percent}%</span>)}</div>
        </aside>
      ) : null}
    </section>
  );
}

function uiTokenValues(configs: PickerConfigs) {
  const saved = configs.ui_tokens || {};
  const hasBuffOptionConfig = Object.prototype.hasOwnProperty.call(saved, "buff-option-width");
  return Object.fromEntries(
    Object.entries(UI_TOKEN_DEFAULTS).map(([key, defaultValue]) => {
      const value = Number(saved[key]);
      if (key === "team-action-frame-width" && !hasBuffOptionConfig && Number.isFinite(value) && value < defaultValue) {
        return [key, defaultValue];
      }
      const isPreviousDefaultWindowSize =
        (key === "window-width" && value === PREVIOUS_DEFAULT_WINDOW_SIZE.width) ||
        (key === "window-height" && value === PREVIOUS_DEFAULT_WINDOW_SIZE.height);
      if (isPreviousDefaultWindowSize) return [key, defaultValue];
      return [key, Number.isFinite(value) && value > 0 ? value : defaultValue];
    }),
  ) as UiTokenValues;
}

function uiTokenStyleFromValues(values: UiTokenValues) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [`--${key}`, `${value}px`])) as CSSProperties;
}

function uiTokenStyle(configs: PickerConfigs) {
  return uiTokenStyleFromValues(uiTokenValues(configs));
}

function InterfaceSettingsPage({
  configs,
  onConfigsChanged,
  onPreviewValues,
  burstEffects,
}: {
  configs: PickerConfigs;
  onConfigsChanged: (configs: PickerConfigs) => void;
  onPreviewValues: (values: UiTokenValues | null) => void;
  burstEffects: BurstEffectItem[];
}) {
  const [values, setValues] = useState(() => uiTokenValues(configs));
  const [message, setMessage] = useState("");
  const [configIndex, setConfigIndex] = useState<"team" | "preset" | "burst">("team");
  const [sectionTitle, setSectionTitle] = useState(() => UI_TOKEN_SECTIONS[0]?.title || "");
  const visibleSections = useMemo(
    () => UI_TOKEN_SECTIONS.filter((section) => configIndex === "preset" ? section.title.startsWith("精灵保存：") : configIndex === "team" ? !section.title.startsWith("精灵保存：") : false),
    [configIndex],
  );
  const activeSection = visibleSections.find((section) => section.title === sectionTitle) || visibleSections[0];
  useEffect(() => {
    setValues(uiTokenValues(configs));
  }, [configs]);

  async function save() {
    try {
      const data = await invoke<{ configs: PickerConfigs }>("save_picker_config", {
        payload: { section: "ui_tokens", values },
      });
      await getCurrentWindow().setSize(new LogicalSize(values["window-width"], values["window-height"]));
      onConfigsChanged(data.configs);
      onPreviewValues(null);
      setMessage("配置已保存");
    } catch (err) {
      setMessage(`保存失败：${asError(err)}`);
    }
  }

  function updateValue(key: keyof typeof UI_TOKEN_DEFAULTS, value: number) {
    const field = UI_TOKEN_FIELDS.find((item) => item.key === key);
    const nextValue = Number.isFinite(value)
      ? Math.min(field?.max ?? value, Math.max(field?.min ?? value, value))
      : values[key];
    const nextValues = { ...values, [key]: nextValue };
    setValues(nextValues);
    setMessage("");
    onPreviewValues(nextValues);
  }

  function switchConfigIndex(nextIndex: "team" | "preset" | "burst") {
    const nextSections = UI_TOKEN_SECTIONS.filter((section) => nextIndex === "preset" ? section.title.startsWith("精灵保存：") : nextIndex === "team" ? !section.title.startsWith("精灵保存：") : false);
    setConfigIndex(nextIndex);
    setSectionTitle(nextSections[0]?.title || "");
  }

  return (
    <section className={`settings-page ${configIndex === "burst" ? "burst-settings-page" : ""}`}>
      <header className="settings-header">
        <h2>界面配置</h2>
        {configIndex !== "burst" ? <button className="compact-button" onClick={() => void save()}>保存配置</button> : null}
      </header>
      <nav className="settings-config-index" aria-label="配置位置">
        <button className={configIndex === "team" ? "active" : ""} onClick={() => switchConfigIndex("team")}>队伍面板</button>
        <button className={configIndex === "preset" ? "active" : ""} onClick={() => switchConfigIndex("preset")}>精灵保存</button>
        <button className={configIndex === "burst" ? "active" : ""} onClick={() => switchConfigIndex("burst")}>雷暴面板</button>
      </nav>
      {configIndex !== "burst" ? <nav className="settings-section-index" aria-label="配置分区">
        <span className="settings-section-index-label">分区</span>
        <div className="settings-section-index-list">
          {visibleSections.map((section) => (
            <button
              key={section.title}
              className={section.title === activeSection?.title ? "active" : ""}
              onClick={() => setSectionTitle(section.title)}
            >
              {section.title.replace("精灵保存：", "")}
            </button>
          ))}
        </div>
      </nav> : null}
      {configIndex === "burst" ? (
        <BurstPanelPage effects={burstEffects} configs={configs} onConfigsChanged={onConfigsChanged} />
      ) : <div className="settings-sections">
        {activeSection ? (
          <section className="settings-token-section" key={activeSection.title}>
            <div className="settings-token-section-header">
              <h3>{activeSection.title}</h3>
              {activeSection.title === "队伍配置" ? (
                <button
                  className="compact-button"
                  onClick={() => {
                    const nextValues = {
                      ...values,
                      "team-slot-count": UI_TOKEN_DEFAULTS["team-slot-count"],
                      "team-skill-card-count": UI_TOKEN_DEFAULTS["team-skill-card-count"],
                      "team-action-frame-width": UI_TOKEN_DEFAULTS["team-action-frame-width"],
                      "team-action-frame-height": UI_TOKEN_DEFAULTS["team-action-frame-height"],
                      "direction-button-width": UI_TOKEN_DEFAULTS["direction-button-width"],
                      "direction-button-height": UI_TOKEN_DEFAULTS["direction-button-height"],
                      "direction-button-font-size": UI_TOKEN_DEFAULTS["direction-button-font-size"],
                      "calc-button-width": UI_TOKEN_DEFAULTS["calc-button-width"],
                      "calc-button-height": UI_TOKEN_DEFAULTS["calc-button-height"],
                      "calc-button-font-size": UI_TOKEN_DEFAULTS["calc-button-font-size"],
                      "buff-button-width": UI_TOKEN_DEFAULTS["buff-button-width"],
                      "buff-button-height": UI_TOKEN_DEFAULTS["buff-button-height"],
                      "buff-button-font-size": UI_TOKEN_DEFAULTS["buff-button-font-size"],
                      "buff-option-width": UI_TOKEN_DEFAULTS["buff-option-width"],
                    };
                    setValues(nextValues);
                    setMessage("");
                    onPreviewValues(nextValues);
                  }}
                >
                  恢复默认
                </button>
              ) : null}
            </div>
            <div className="font-settings-grid">
              {activeSection.fields.map(({ key, label, min, max }) => (
                <label key={key}>
                  <span>{label}</span>
                  <NumberInput value={values[key]} min={min} max={max} deferValidation onChange={(value) => updateValue(key, value)} />
                </label>
              ))}
            </div>
          </section>
        ) : null}
      </div>}
      {configIndex !== "burst" && message ? <p className="save-message">{message}</p> : null}
    </section>
  );
}

function BurstPanelPage({
  effects,
  configs,
  onConfigsChanged,
}: {
  effects: BurstEffectItem[];
  configs: PickerConfigs;
  onConfigsChanged: (configs: PickerConfigs) => void;
}) {
  const savedNotes = (configs.burst_panel?.notes || {}) as Record<string, string>;
  const [notes, setNotes] = useState<Record<string, string>>(savedNotes);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setNotes(savedNotes);
  }, [configs]);

  async function saveNotes(nextNotes: Record<string, string>) {
    try {
      const data = await invoke<{ configs: PickerConfigs }>("save_picker_config", {
        payload: { section: "burst_panel", values: { notes: nextNotes } },
      });
      onConfigsChanged(data.configs);
      setMessage("备注已保存");
    } catch (err) {
      setMessage(`保存失败：${asError(err)}`);
    }
  }

  const skills = effects.filter((effect) => effect.kind === "skill");
  const traits = effects.filter((effect) => effect.kind === "trait");
  const marks = effects.filter((effect) => effect.kind === "mark");
  const renderEffect = (effect: BurstEffectItem) => {
    const isExpanded = expanded === effect.id;
    return (
      <article className={`burst-card ${isExpanded ? "expanded" : ""}`} key={effect.id}>
        <button className="burst-card-summary" onClick={() => setExpanded(isExpanded ? null : effect.id)} aria-expanded={isExpanded}>
          <strong>{effect.name}</strong>
          {effect.kind === "skill" ? (
            <span className="burst-card-stats">
              <span>威力 {effect.skill_power ?? "-"}</span>
              <span>费用 {effect.cost ?? "-"}</span>
              <span>{effect.element} {effect.type}</span>
            </span>
          ) : <span className="burst-card-kind">{effect.kind === "mark" ? "印记" : "特性"}</span>}
          <span className="burst-card-expand">{isExpanded ? "收起" : "展开"}</span>
        </button>
        {isExpanded ? (
          <div className="burst-card-detail">
            <p>{effect.description}</p>
            <label>
              <span>迸发效果备注</span>
              <textarea
                value={notes[effect.id] || ""}
                placeholder="填写迸发效果"
                onChange={(event) => {
                  setNotes({ ...notes, [effect.id]: event.target.value });
                  setMessage("");
                }}
                onBlur={() => void saveNotes(notes)}
              />
            </label>
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <section className="burst-panel-page">
      <header className="burst-panel-header">
        <div>
          <h2>雷暴面板</h2>
          <p>固态迸发效果</p>
        </div>
        {message ? <span className="save-message">{message}</span> : null}
      </header>
      <section className="burst-panel-section">
        <h3>电系技能</h3>
        <div className="burst-card-grid">{skills.map(renderEffect)}</div>
      </section>
      <section className="burst-panel-section">
        <h3>特性</h3>
        <div className="burst-card-grid">{traits.map(renderEffect)}</div>
      </section>
      <section className="burst-panel-section">
        <h3>印记</h3>
        <div className="burst-card-grid">{marks.map(renderEffect)}</div>
      </section>
    </section>
  );
}

function App() {
  const [tab, setTab] = useState<"team" | "presets" | "settings">("team");
  const [data, setData] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [previewUiTokens, setPreviewUiTokens] = useState<UiTokenValues | null>(null);

  async function load() {
    setError("");
    try {
      setData(await invoke<AppState>("app_state"));
      setPreviewUiTokens(null);
    } catch (err) {
      setError(asError(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const teamConfigs = data && previewUiTokens
    ? { ...data.configs, ui_tokens: { ...(data.configs.ui_tokens || {}), ...previewUiTokens } }
    : data?.configs;

  return (
    <main className={tab === "presets" ? "app-shell preset-shell" : "app-shell"} style={data ? (previewUiTokens ? uiTokenStyleFromValues(previewUiTokens) : uiTokenStyle(data.configs)) : undefined}>
      <header className="app-header">
        <nav className="tabs">
          <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>队伍面板</button>
          <button className={tab === "presets" ? "active" : ""} onClick={() => setTab("presets")}>精灵保存</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>界面配置</button>
          <button onClick={() => void load()}>刷新</button>
        </nav>
      </header>
      {error ? <div className="error-banner">{error}</div> : null}
      <datalist id="pet-options">
        {data?.pets.map((pet) => <option key={pet.label} value={pet.label} />)}
      </datalist>
      {data ? (
        <>
          <div className="battle-view" hidden={tab !== "team"}>
            <TeamBattlePage
              presets={data.presets}
              pets={data.pets}
              elements={data.elements}
              configs={teamConfigs || data.configs}
              burstEffects={data.burstEffects}
              onPresetsChanged={(presets) => setData({ ...data, presets })}
              onConfigsChanged={(configs) => setData({ ...data, configs })}
            />
          </div>
          <div className="battle-view" hidden={tab !== "presets"}>
            <PresetManagerPage
              presets={data.presets}
              pets={data.pets}
              elements={data.elements}
              configs={data.configs}
              onPresetsChanged={(presets) => setData({ ...data, presets })}
              onConfigsChanged={(configs) => setData({ ...data, configs })}
            />
          </div>
          <div className="battle-view" hidden={tab !== "settings"}>
            <InterfaceSettingsPage configs={data.configs} onConfigsChanged={(configs) => setData({ ...data, configs })} onPreviewValues={setPreviewUiTokens} burstEffects={data.burstEffects} />
          </div>
        </>
      ) : (
        <section className="loading-panel">正在读取 Python 核心和 JSON 数据...</section>
      )}
    </main>
  );
}

export default App;
