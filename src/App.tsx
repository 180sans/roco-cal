import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cursorPosition, getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent, type PointerEventHandler as ReactPointerEventHandler, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ReplayPage } from "./replay/ReplayPage";

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
  "team-action-frame-width": 420,
  "team-action-frame-height": 46,
  "direction-button-width": 34,
  "direction-button-height": 34,
  "direction-button-font-size": 20,
  "calc-button-width": 56,
  "calc-button-height": 34,
  "calc-button-font-size": 12,
  "buff-button-width": 48,
  "buff-button-height": 34,
  "buff-button-font-size": 12,
  "buff-option-width": 100,
  "weather-panel-width": 116, "weather-panel-height": 42, "weather-label-font-size": 12, "weather-select-width": 68, "weather-select-height": 28, "weather-select-font-size": 12,
  "dedication-button-width": 62, "dedication-button-height": 28, "dedication-button-font-size": 12, "dedication-panel-width": 330, "dedication-panel-height": 170, "dedication-label-font-size": 12, "dedication-input-width": 62, "dedication-input-height": 28, "dedication-input-font-size": 12,
  "marks-button-width": 62, "marks-button-height": 28, "marks-button-font-size": 12, "marks-panel-width": 330, "marks-panel-height": 290, "marks-label-font-size": 12, "marks-input-width": 62, "marks-input-height": 28, "marks-input-font-size": 12,
  "marks-add-label-font-size": 12, "marks-add-select-width": 110, "marks-add-select-height": 28, "marks-add-select-font-size": 12,
  "thunderstorm-button-width": 62, "thunderstorm-button-height": 28, "thunderstorm-button-font-size": 12, "thunderstorm-panel-width": 330, "thunderstorm-panel-height": 300, "thunderstorm-label-font-size": 12,
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
    title: "天气",
    fields: [sizeField("weather-panel-width", "天气外框宽度"), sizeField("weather-panel-height", "天气外框高度"), fontField("weather-label-font-size", "天气文本大小"), sizeField("weather-select-width", "天气选择框宽度"), sizeField("weather-select-height", "天气选择框高度"), fontField("weather-select-font-size", "天气选择框文本大小")],
  },
  {
    title: "奉献",
    fields: [sizeField("dedication-button-width", "奉献按钮宽度"), sizeField("dedication-button-height", "奉献按钮高度"), fontField("dedication-button-font-size", "奉献按钮文本大小"), sizeField("dedication-panel-width", "奉献面板宽度"), sizeField("dedication-panel-height", "奉献面板高度"), fontField("dedication-label-font-size", "奉献字段文本大小"), sizeField("dedication-input-width", "奉献数值框宽度"), sizeField("dedication-input-height", "奉献数值框高度"), fontField("dedication-input-font-size", "奉献数值文本大小")],
  },
  {
    title: "印记",
    fields: [sizeField("marks-button-width", "印记按钮宽度"), sizeField("marks-button-height", "印记按钮高度"), fontField("marks-button-font-size", "印记按钮文本大小"), sizeField("marks-panel-width", "印记面板宽度"), sizeField("marks-panel-height", "印记面板高度"), fontField("marks-label-font-size", "印记字段文本大小"), sizeField("marks-input-width", "印记数值框宽度"), sizeField("marks-input-height", "印记数值框高度"), fontField("marks-input-font-size", "印记数值文本大小"), fontField("marks-add-label-font-size", "新增印记文本大小"), sizeField("marks-add-select-width", "新增印记选择框宽度"), sizeField("marks-add-select-height", "新增印记选择框高度"), fontField("marks-add-select-font-size", "新增印记选择框文本大小")],
  },
  {
    title: "雷暴",
    fields: [sizeField("thunderstorm-button-width", "雷暴按钮宽度"), sizeField("thunderstorm-button-height", "雷暴按钮高度"), fontField("thunderstorm-button-font-size", "雷暴按钮文本大小"), sizeField("thunderstorm-panel-width", "雷暴面板宽度"), sizeField("thunderstorm-panel-height", "雷暴面板高度"), fontField("thunderstorm-label-font-size", "雷暴选项文本大小")],
  },
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
type ApplySkillBuffsResult = { skill_name: string; combo_count: number; options: BuffOption[]; effects: BuffEffect[] };
type SkillTriggerInfo = {
  skill_name: string;
  description: string;
  has_damage: boolean;
  has_buff: boolean;
  stackable: Array<{ index: number; label: string; max?: number }>;
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
  required_power?: number;
  target_hp?: number;
  damage_info?: string | null;
  usage_results?: Array<{ effective_power: number; combo: number | null; damage: number }> | null;
  starfall?: { stacks: number; power: number; damage: number } | null;
  hp_results: Array<{ hp_label: string; hp: number; damage_percent: number }>;
};
type QuickSkillResult = { skillName: string; skillPower?: number | null; results: BattleResult[] };
type WillpowerElementResult = { element: string; advantage: number; has_stab: boolean; results: BattleResult[] };
type WillpowerResponse = { attack_type: "atk" | "mag"; elements: WillpowerElementResult[] };
type RequiredPowerRow = { attack_type: "物攻" | "魔攻"; attacker_label: string; required_power: number };
type RequiredPowerResponse = { target_hp: number; rows: RequiredPowerRow[] };

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
type BonusTool = "dedication" | "marks" | "thunderstorm";
type MarkField = "charge" | "attack" | "momentum" | "starfall";
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
  const nextValue = current + effect.value;
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

type SpeedScenario = { label: "速度-" | "速度" | "速度+" | "速度++"; value: number };

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
  const base = Math.floor(level * (raceValue / 100) + 50 * (raceValue / 100) + 10 + 0.5)
    + Math.floor(level * ((effectiveIv / 2) / 100) + 50 * ((effectiveIv / 2) / 100) + 0.5);
  return Math.floor((base * (1 + (personality || 0))) + effort + 0.5);
}

function speedScenarios(value: UnitState, pets: Pet[]): SpeedScenario[] {
  // display_name is a user-defined preset label; calculations must use the pet identity.
  const petName = value.mega_form || value.name;
  const pet = pets.find((item) => item.label === petName || item.name === petName || `${item.id}${item.name}` === petName);
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
  const scenarios = matches.length ? matches : [{
    label: configuredPersonality && configuredPersonality < 0 ? "速度-" : configuredIv && configuredPersonality ? "速度++" : configuredIv ? "速度+" : "速度",
    iv: configuredIv ?? 0,
    personality: configuredPersonality,
  }];
  return scenarios.map((scenario) => ({
    label: scenario.label,
    value: speedValue(pet.spd!, scenario.iv, scenario.personality),
  }));
}

function PluginResizeEdges({ onPointerDown }: { onPointerDown?: ReactPointerEventHandler<HTMLDivElement> }) {
  return <>
    <div className="plugin-resize-edge top" onPointerDown={onPointerDown} />
    <div className="plugin-resize-edge right" onPointerDown={onPointerDown} />
    <div className="plugin-resize-edge bottom" onPointerDown={onPointerDown} />
    <div className="plugin-resize-edge left" onPointerDown={onPointerDown} />
  </>;
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
  pluginMode,
  layout,
  onLayoutChange,
  leftAttacks,
  onToggleDirection,
  onCalculate,
  onApplyBuff,
  onResetBattle,
  targetHp,
  onTargetHpChange,
  onCalculateRequiredPower,
  buffOptions,
  selectedBuffOption,
  onSelectBuffOption,
}: {
  pluginMode: boolean;
  layout?: PluginOverlayLayout;
  onLayoutChange?: (partial: Partial<PluginOverlayLayout>) => void;
  leftAttacks: boolean;
  onToggleDirection: () => void;
  onCalculate: () => void;
  onApplyBuff: () => void;
  onResetBattle: () => void;
  targetHp: number;
  onTargetHpChange: (value: number) => void;
  onCalculateRequiredPower: () => void;
  buffOptions: BuffOption[];
  selectedBuffOption: number;
  onSelectBuffOption: (index: number) => void;
}) {
  const [normalPosition, setNormalPosition] = useState(() => ({
    x: Math.max(8, Math.round(window.innerWidth / 2 - 150)),
    y: 76,
  }));
  const position = pluginMode && layout ? layout : normalPosition;
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  function clampToViewport(x: number, y: number) {
    const panelWidth = panelRef.current?.offsetWidth || 300;
    const panelHeight = panelRef.current?.offsetHeight || 46;
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - panelWidth - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - panelHeight - 8)),
    };
  }

  useEffect(() => {
    const keepVisible = () => {
      if (!pluginMode) setNormalPosition((current) => clampToViewport(current.x, current.y));
    };
    window.addEventListener("resize", keepVisible);
    const observer = new ResizeObserver(keepVisible);
    if (panelRef.current) observer.observe(panelRef.current);
    return () => {
      window.removeEventListener("resize", keepVisible);
      observer.disconnect();
    };
  }, []);

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, select, input")) return;
    event.preventDefault();
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y };
    const move = (moveEvent: PointerEvent) => {
      const start = dragRef.current;
      if (!start) return;
      const next = clampToViewport(
        start.x + moveEvent.clientX - start.pointerX,
        start.y + moveEvent.clientY - start.pointerY,
      );
      if (pluginMode) onLayoutChange?.(next);
      else setNormalPosition(next);
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
    <section ref={panelRef} className={pluginMode ? "team-action-floating" : "team-action-floating normal-team-action"} data-overlay-control data-plugin-resizable={pluginMode || undefined} data-plugin-overlay-id={pluginMode ? "action" : undefined} style={{ left: position.x, top: position.y, width: pluginMode && layout ? layout.width : undefined, height: pluginMode && layout ? layout.height : undefined }} onPointerDown={startDrag}>
      {pluginMode ? <PluginResizeEdges /> : null}
      <div className="team-action-buttons">
        <button className="direction-button" title="切换攻击方向" onClick={onToggleDirection}>
          {leftAttacks ? "→" : "←"}
        </button>
        <button className="calc-button" onClick={onCalculate}>计算</button>
        <button className="calc-button" onClick={onResetBattle}>对局重置</button>
        <input className="required-power-input" aria-label="我方血量" type="number" min="1" value={targetHp || ""} placeholder="我方血量" onChange={(event) => onTargetHpChange(Math.max(0, Number(event.target.value) || 0))} />
        <button className="calc-button" onClick={onCalculateRequiredPower} disabled={!targetHp}>判死</button>
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

type TeamRegionId =
  | "left-roster"
  | "right-roster"
  | "left-bonus-tools"
  | "right-bonus-tools"
  | "left-buff"
  | "right-buff"
  | "left-skills"
  | "right-skills"
  | "weather";

type TeamRegionPosition = { x: number; y: number; zIndex: number; width?: number; height?: number };
type TeamRegionPositions = Record<TeamRegionId, TeamRegionPosition>;
type PluginOverlayLayout = { x: number; y: number; width: number; height: number };
type PluginOverlayLayouts = Record<string, PluginOverlayLayout>;
type DetectionReadoutLayouts = Record<"health" | "powers", { x: number; y: number }>;
type DetectionGroup = "battleStart" | "battleLive";
type NumericOcrMode = "power" | "enemy_health" | "self_health";
type DetectionRegion = { x: number; y: number; width: number; height: number };
type DetectionRegions = Record<string, DetectionRegion>;
type CaptureClientArea = { x: number; y: number; width: number; height: number };
type TargetCapture = { canvas: HTMLCanvasElement; targetClient: CaptureClientArea; overlayClient: CaptureClientArea };
type RecognitionStatus = { label: string; detail: string; progress: string };
const REPLAY_SETTINGS_KEY = "rocodatebase.replay.settings.v1";
const BATTLE_START_IMAGE_KEYS = ["battleStartImage1", "battleStartImage2", "battleStartImage3", "battleStartImage4", "battleStartImage5", "battleStartImage6"] as const;
const BATTLE_LIVE_IMAGE_KEYS = ["enemyImage", "selfImage"] as const;
const BATTLE_LIVE_HEALTH_KEYS = ["enemyHealth", "selfHealth"] as const;
const BATTLE_LIVE_NUMBER_KEYS = ["enemyHealth", "selfHealth", "skill1", "skill2", "skill3", "skill4"] as const;
const DEFAULT_DETECTION_REGIONS: DetectionRegions = {
  battleStartImage1: { x: 10, y: 10, width: 12, height: 18 }, battleStartImage2: { x: 24, y: 10, width: 12, height: 18 }, battleStartImage3: { x: 38, y: 10, width: 12, height: 18 },
  battleStartImage4: { x: 52, y: 10, width: 12, height: 18 }, battleStartImage5: { x: 66, y: 10, width: 12, height: 18 }, battleStartImage6: { x: 80, y: 10, width: 12, height: 18 },
  enemyImage: { x: 15, y: 15, width: 25, height: 35 }, selfImage: { x: 15, y: 50, width: 25, height: 35 },
  enemyHealth: { x: 73, y: 12, width: 16, height: 7 }, selfHealth: { x: 8, y: 76, width: 16, height: 7 },
  skill1: { x: 36, y: 20, width: 16, height: 8 }, skill2: { x: 36, y: 52, width: 16, height: 8 }, skill3: { x: 52, y: 20, width: 16, height: 8 }, skill4: { x: 52, y: 52, width: 16, height: 8 },
};
const detectionLabel = (key: string) => key.startsWith("battleStart") ? `敌方图像 ${Number(key.slice(-1))}` : ({ enemyImage: "敌方当前精灵", selfImage: "我方当前精灵", enemyHealth: "敌方血量", selfHealth: "我方血量", skill1: "技能1", skill2: "技能2", skill3: "技能3", skill4: "技能4" }[key] || key);

function replayDetectionSizes() {
  try {
    const settings = JSON.parse(localStorage.getItem(REPLAY_SETTINGS_KEY) || "") as { regions?: Record<string, DetectionRegion> };
    return settings.regions || {};
  } catch { return {}; }
}

function withReplayDetectionSizes(regions: DetectionRegions): DetectionRegions {
  const replayRegions = replayDetectionSizes();
  const sourceForKey: Record<string, string> = {
    ...Object.fromEntries(BATTLE_START_IMAGE_KEYS.map((key) => [key, "enemyImage"])),
    enemyImage: "enemyImage", selfImage: "selfImage",
    enemyHealth: "enemyHealth", selfHealth: "selfHealth",
  };
  return Object.fromEntries(Object.entries(regions).map(([key, region]) => {
    const source = replayRegions[sourceForKey[key]];
    return [key, source && Number.isFinite(source.width) && Number.isFinite(source.height)
      ? { ...region, width: source.width, height: source.height }
      : region];
  })) as DetectionRegions;
}

function savedDetectionRegions(configs: PickerConfigs): DetectionRegions {
  const saved = (configs.team_layout?.detection_regions as DetectionRegions | undefined) || {};
  return {
    // Replay dimensions are only defaults for a newly created detection box.
    // Never apply them after loading saved positions/sizes.
    ...withReplayDetectionSizes(DEFAULT_DETECTION_REGIONS),
    ...saved,
    ...(saved.skill1 ? {} : saved.enemyDamage ? { skill1: saved.enemyDamage } : {}),
    ...(saved.skill2 ? {} : saved.selfDamage ? { skill2: saved.selfDamage } : {}),
  };
}

function savedDetectionReadoutLayouts(configs: PickerConfigs): DetectionReadoutLayouts {
  const saved = configs.team_layout?.detection_readouts as Partial<DetectionReadoutLayouts> | undefined;
  const coordinate = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    health: { x: coordinate(saved?.health?.x), y: coordinate(saved?.health?.y) },
    powers: { x: coordinate(saved?.powers?.x), y: coordinate(saved?.powers?.y) },
  };
}
const TEAM_REGION_IDS: TeamRegionId[] = [
  "left-roster",
  "right-roster",
  "left-bonus-tools",
  "right-bonus-tools",
  "left-buff",
  "right-buff",
  "left-skills",
  "right-skills",
  "weather",
];

function initialTeamRegionPositions(regionWidth: number, regionHeight: number): TeamRegionPositions {
  const rightX = regionWidth + 8;
  const toolbarY = regionHeight + 8;
  const buffY = toolbarY + 42;
  const skillsY = buffY + 64;
  return {
    "left-roster": { x: 0, y: 0, zIndex: 1 },
    "right-roster": { x: rightX, y: 0, zIndex: 1 },
    "left-bonus-tools": { x: 0, y: toolbarY, zIndex: 1 },
    "right-bonus-tools": { x: rightX, y: toolbarY, zIndex: 1 },
    "left-buff": { x: 0, y: buffY, zIndex: 1 },
    "right-buff": { x: rightX, y: buffY, zIndex: 1 },
    "left-skills": { x: 0, y: skillsY, zIndex: 1 },
    "right-skills": { x: rightX, y: skillsY, zIndex: 1 },
    "weather": { x: rightX + regionWidth + 8, y: 0, zIndex: 2 },
  };
}

function savedTeamRegionPositions(configs: PickerConfigs, regionWidth: number, regionHeight: number): TeamRegionPositions {
  const defaults = initialTeamRegionPositions(regionWidth, regionHeight);
  const saved = configs.team_layout?.regions;
  if (!saved || typeof saved !== "object") return defaults;
  const source = saved as Record<string, unknown>;
  return TEAM_REGION_IDS.reduce((positions, id) => {
    const item = source[id];
    if (!item || typeof item !== "object") return positions;
    const values = item as Record<string, unknown>;
    const x = Number(values.x);
    const y = Number(values.y);
    const zIndex = Number(values.zIndex);
    const width = Number(values.width);
    const height = Number(values.height);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      positions[id] = {
        x: Math.max(0, x),
        y: Math.max(0, y),
        zIndex: Number.isFinite(zIndex) ? Math.max(1, zIndex) : positions[id].zIndex,
        ...(Number.isFinite(width) ? { width: Math.max(72, width) } : {}),
        ...(Number.isFinite(height) ? { height: Math.max(30, height) } : {}),
      };
    }
    return positions;
  }, { ...defaults });
}

function defaultPluginOverlayLayout(id: string): PluginOverlayLayout {
  if (id === "action") {
    return { x: Math.max(8, Math.round(window.innerWidth / 2 - 210)), y: 76, width: 420, height: 48 };
  }
  if (id === "recognition-status") {
    return { x: 18, y: 18, width: 240, height: 70 };
  }
  if (id === "speed-line") {
    return { x: Math.max(8, Math.round(window.innerWidth / 2 - 130)), y: 132, width: 260, height: 86 };
  }
  const isRight = id.includes("right-");
  const isEvolution = id.includes("evolution");
  const skillIndex = Number(id.match(/skill-(\d+)$/)?.[1] || 0);
  return {
    x: isRight ? 520 : 270,
    y: id.includes("skill-") ? 120 + skillIndex * 88 : isEvolution ? 300 : 120,
    width: id.includes("skill-") ? 112 : 154,
    height: id.includes("skill-") ? 78 : 64,
  };
}

function savedPluginOverlayLayouts(configs: PickerConfigs): PluginOverlayLayouts {
  const saved = configs.team_layout?.overlays;
  if (!saved || typeof saved !== "object") return {};
  return Object.fromEntries(Object.entries(saved as Record<string, unknown>).flatMap(([id, item]) => {
    if (!item || typeof item !== "object") return [];
    const values = item as Record<string, unknown>;
    const fallback = defaultPluginOverlayLayout(id);
    const x = Number(values.x);
    const y = Number(values.y);
    const width = Number(values.width);
    const height = Number(values.height);
    return [[id, {
      x: Number.isFinite(x) ? Math.max(0, x) : fallback.x,
      y: Number.isFinite(y) ? Math.max(0, y) : fallback.y,
      width: Number.isFinite(width) ? Math.max(72, width) : fallback.width,
      height: Number.isFinite(height) ? Math.max(28, height) : fallback.height,
    }]];
  }));
}

function TeamBattlePage({
  presets,
  pets,
  elements,
  configs,
  burstEffects,
  weather,
  onWeatherChange,
  onPresetsChanged,
  onConfigsChanged,
  onOverlayAttachmentChange,
  onDisplayModeChange,
}: {
  presets: PresetGroup[];
  pets: Pet[];
  elements: string[];
  configs: PickerConfigs;
  burstEffects: BurstEffectItem[];
  weather: (typeof WEATHER_OPTIONS)[number]["value"];
  onWeatherChange: (weather: (typeof WEATHER_OPTIONS)[number]["value"]) => void;
  onPresetsChanged: (groups: PresetGroup[]) => void;
  onConfigsChanged: (configs: PickerConfigs) => void;
  onOverlayAttachmentChange: (attached: boolean) => void;
  onDisplayModeChange: (mode: "normal" | "plugin") => void;
}) {
  const teamValues = uiTokenValues(configs);
  const teamSlotCount = teamValues["team-slot-count"];
  const teamSkillCardCount = teamValues["team-skill-card-count"];
  const [regionPositions, setRegionPositions] = useState<TeamRegionPositions>(() =>
    savedTeamRegionPositions(configs, teamValues["team-region-width"], teamValues["team-region-height"]),
  );
  const [overlayLayouts, setOverlayLayouts] = useState<PluginOverlayLayouts>(() => savedPluginOverlayLayouts(configs));
  const [detectionRegions, setDetectionRegions] = useState<DetectionRegions>(() => savedDetectionRegions(configs));
  const [detectionGroup, setDetectionGroup] = useState<DetectionGroup | null>(null);
  const [detectionMessage, setDetectionMessage] = useState("");
  const [detectionToast, setDetectionToast] = useState("");
  const [ocrTestMode, setOcrTestMode] = useState(configs.team_layout?.ocr_test_mode === true);
  const [detectedHealth, setDetectedHealth] = useState({ enemy: "-", self: "-" });
  const [detectedSkillPowers, setDetectedSkillPowers] = useState(["-", "-", "-", "-"]);
  const [detectionReadoutLayouts, setDetectionReadoutLayouts] = useState<DetectionReadoutLayouts>(() => savedDetectionReadoutLayouts(configs));
  const [recognitionStatus, setRecognitionStatus] = useState<RecognitionStatus | null>(null);
  const recognitionBusyRef = useRef(false);
  const detectionRegionsRef = useRef(detectionRegions);
  const detectionRoiRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const detectionReadoutLayoutsRef = useRef(detectionReadoutLayouts);
  const [leftSlots, setLeftSlots] = useState<UnitState[]>(() => Array.from({ length: teamSlotCount }, blankUnit));
  const [rightSlots, setRightSlots] = useState<UnitState[]>(() => Array.from({ length: teamSlotCount }, blankUnit));
  const [leftIndex, setLeftIndex] = useState(0);
  const [rightIndex, setRightIndex] = useState(0);
  const [petPicker, setPetPicker] = useState<{ side: "left" | "right"; index: number } | null>(null);
  const [leftAttacks, setLeftAttacks] = useState(true);
  const [leftOtherBonuses, setLeftOtherBonuses] = useState<TeamOtherBonuses>(blankTeamOtherBonuses);
  const [rightOtherBonuses, setRightOtherBonuses] = useState<TeamOtherBonuses>(blankTeamOtherBonuses);
  const [leftMarkFields, setLeftMarkFields] = useState<MarkField[]>([]);
  const [rightMarkFields, setRightMarkFields] = useState<MarkField[]>([]);
  const [results, setResults] = useState<BattleResult[]>([]);
  const [quickSkillResults, setQuickSkillResults] = useState<QuickSkillResult[] | null>(null);
  const [targetHp, setTargetHp] = useState(0);
  const [requiredPower, setRequiredPower] = useState<RequiredPowerResponse | null>(null);
  const [willpower, setWillpower] = useState<WillpowerResponse | null>(null);
  const [selectedWillpowerElement, setSelectedWillpowerElement] = useState<string | null>(null);
  const [battleContext, setBattleContext] = useState<BattleContext | null>(null);
  const [error, setError] = useState("");
  const [buffOptions, setBuffOptions] = useState<BuffOption[]>([]);
  const [selectedBuffOption, setSelectedBuffOption] = useState(0);
  const [bonusTool, setBonusTool] = useState<BonusTool | null>(null);
  const [bonusSide, setBonusSide] = useState<"left" | "right">("left");
  const [layoutMessage, setLayoutMessage] = useState("");
  const [targetHwnd, setTargetHwnd] = useState("");
  const [targetStatus, setTargetStatus] = useState("");
  const targetStatusTimerRef = useRef<number | undefined>(undefined);
  const calculateQuickSkillsRef = useRef<() => void>(() => undefined);
  const hideQuickSkillResultsRef = useRef<() => void>(() => undefined);
  const [targetAttached, setTargetAttached] = useState(false);
  const [mixedMode, setMixedMode] = useState(false);
  const mixedModeTokenRef = useRef(0);
  const [displayMode, setDisplayMode] = useState<"normal" | "plugin">(
    configs.team_layout?.display_mode === "normal" ? "normal" : "plugin",
  );
  const activeBuffUnit = leftAttacks ? leftSlots[leftIndex] : rightSlots[rightIndex];
  const activeBuffOpponent = leftAttacks ? rightSlots[rightIndex] : leftSlots[leftIndex];
  const activeBuffOtherBonuses = leftAttacks ? leftOtherBonuses : rightOtherBonuses;
  const activeBuffOpponentBonuses = leftAttacks ? rightOtherBonuses : leftOtherBonuses;
  const activeBuffSkillName = activeBuffUnit?.current_skill || activeBuffUnit?.skills?.[0] || "";

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 4500);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    detectionRegionsRef.current = detectionRegions;
  }, [detectionRegions]);

  useEffect(() => {
    detectionReadoutLayoutsRef.current = detectionReadoutLayouts;
  }, [detectionReadoutLayouts]);

  function moveRegion(id: TeamRegionId, position: Partial<TeamRegionPosition>) {
    setRegionPositions((current) => ({ ...current, [id]: { ...current[id], ...position } }));
  }

  function showTemporaryTargetStatus(message: string) {
    window.clearTimeout(targetStatusTimerRef.current);
    setTargetStatus(message);
    targetStatusTimerRef.current = window.setTimeout(() => setTargetStatus(""), 4500);
  }

  useEffect(() => () => window.clearTimeout(targetStatusTimerRef.current), []);

  function focusRegion(id: TeamRegionId) {
    setRegionPositions((current) => {
      const topZIndex = Math.max(...Object.values(current).map((item) => item.zIndex), 0) + 1;
      return { ...current, [id]: { ...current[id], zIndex: topZIndex } };
    });
  }

  function overlayLayout(id: string) {
    return overlayLayouts[id] || defaultPluginOverlayLayout(id);
  }

  function updateOverlayLayout(id: string, partial: Partial<PluginOverlayLayout>) {
    setOverlayLayouts((current) => {
      const previous = current[id] || defaultPluginOverlayLayout(id);
      const next = { ...previous, ...partial };
      if (previous.x === next.x && previous.y === next.y && previous.width === next.width && previous.height === next.height) return current;
      return { ...current, [id]: next };
    });
  }

  function sameFamily(first: Pet, second: Pet) {
    const firstForms = new Set([first.label, ...(first.evolutionChain || [])]);
    return [second.label, ...(second.evolutionChain || [])].some((form) => firstForms.has(form));
  }

  function petForRecognition(label: string) {
    const normalized = label.trim();
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

  async function targetCanvas() {
    const captured = await invoke<{ imageDataUrl: string; width: number; height: number; targetClient: CaptureClientArea; overlayClient: CaptureClientArea }>("capture_overlay_target");
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("截图无法读取")); image.src = captured.imageDataUrl; });
    const canvas = document.createElement("canvas");
    canvas.width = captured.width; canvas.height = captured.height;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    return { canvas, targetClient: captured.targetClient, overlayClient: captured.overlayClient } satisfies TargetCapture;
  }

  function cropDetection(capture: TargetCapture, key: string) {
    const crop = document.createElement("canvas");
    const roiBounds = detectionRoiRefs.current[key]?.getBoundingClientRect();
    if (!roiBounds || capture.overlayClient.width <= 0 || capture.overlayClient.height <= 0 || window.innerWidth <= 0 || window.innerHeight <= 0) {
      throw new Error("检测框的实际屏幕边界不可用");
    }
    // The rectangle comes from the element currently drawn on screen. Windows
    // supplies both client-area origins, so an overlay title bar/DPI offset
    // cannot shift the crop vertically.
    const xScale = capture.overlayClient.width / window.innerWidth;
    const yScale = capture.overlayClient.height / window.innerHeight;
    const left = Math.round(capture.overlayClient.x + roiBounds.left * xScale - capture.targetClient.x);
    const top = Math.round(capture.overlayClient.y + roiBounds.top * yScale - capture.targetClient.y);
    const right = Math.round(capture.overlayClient.x + roiBounds.right * xScale - capture.targetClient.x);
    const bottom = Math.round(capture.overlayClient.y + roiBounds.bottom * yScale - capture.targetClient.y);
    const sourceWidth = Math.max(1, right - left);
    const sourceHeight = Math.max(1, bottom - top);
    crop.width = sourceWidth;
    crop.height = sourceHeight;
    const context = crop.getContext("2d");
    if (!context) return crop.toDataURL("image/png");
    context.drawImage(capture.canvas, left, top, sourceWidth, sourceHeight, 0, 0, crop.width, crop.height);
    return crop.toDataURL("image/png");
  }

  async function recognizeNumericImages(images: Array<{ key: string; imageDataUrl: string; mode: NumericOcrMode }>) {
    const preparedImages = await Promise.all(images.map(async (image) => ({
      ...image,
      imageDataUrl: await prepareNumericImage(image.imageDataUrl),
    })));
    await saveOcrDebugImages("numeric", preparedImages);
    return invoke<{ items: Array<{ text: string }> }>("recognize_images", { images: preparedImages });
  }

  async function prepareNumericImage(imageDataUrl: string) {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("数字识别图片无法读取"));
      image.src = imageDataUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth * 2);
    canvas.height = Math.max(1, image.naturalHeight * 2);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("数字识别图片无法处理");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = Math.round(0.299 * pixels.data[index] + 0.587 * pixels.data[index + 1] + 0.114 * pixels.data[index + 2]);
      pixels.data[index] = gray;
      pixels.data[index + 1] = gray;
      pixels.data[index + 2] = gray;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  }

  async function saveOcrDebugImages(category: string, images: Array<{ key?: string; imageDataUrl: string }>) {
    if (!ocrTestMode) return;
    await invoke("save_ocr_debug_images", { category, images });
  }

  async function changeOcrTestMode(enabled: boolean) {
    const previous = ocrTestMode;
    setOcrTestMode(enabled);
    try {
      const result = await invoke<{ configs: PickerConfigs }>("save_picker_config", { payload: { section: "team_layout", values: { ocr_test_mode: enabled } } });
      onConfigsChanged(result.configs);
      setDetectionMessage(enabled ? "测试模式已开启：识别输入将保存到本地" : "测试模式已关闭");
    } catch (error) {
      setOcrTestMode(previous);
      setError(asError(error));
    }
  }

  async function recognizeDetection(group: DetectionGroup) {
    const notifyDetection = (message: string) => { setDetectionMessage(message); setDetectionToast(message); };
    if (!targetAttached) { notifyDetection("请先绑定目标窗口"); return; }
    if (recognitionBusyRef.current) return;
    recognitionBusyRef.current = true;
    const updateStatus = (label: string, detail: string, progress: string) => {
      setRecognitionStatus({ label, detail, progress });
      setDetectionMessage(`${label}：${detail}`);
    };
    updateStatus(group === "battleStart" ? "战斗开始识别" : "战斗内识别", "正在截取目标窗口", "准备中");
    try {
        const capture = await targetCanvas();
      if (group === "battleStart") {
        updateStatus("战斗开始识别", "正在识别敌方队伍图像框", `1/${BATTLE_START_IMAGE_KEYS.length} 组`);
        const images = BATTLE_START_IMAGE_KEYS.map((key) => ({ key, imageDataUrl: cropDetection(capture, key) }));
        await saveOcrDebugImages("battle-start", images);
        const result = await invoke<{ items: Array<{ label: string }> }>("classify_image_samples", { payload: { images } });
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
          (async () => { await saveOcrDebugImages("battle-live-pets", images); return invoke<{ items: Array<{ label: string }> }>("classify_image_samples", { payload: { images } }); })(),
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
      recognitionBusyRef.current = false;
      setRecognitionStatus(null);
    }
  }

  async function recognizeSkillPowers() {
    const notifyDetection = (message: string) => { setDetectionMessage(message); setDetectionToast(message); };
    if (!targetAttached) { notifyDetection("请先绑定目标窗口"); return; }
    if (recognitionBusyRef.current) return;
    recognitionBusyRef.current = true;
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
      recognitionBusyRef.current = false;
      setRecognitionStatus(null);
    }
  }

  async function calibratePowerStacks(powerTexts: string[]) {
    const attacker = leftAttacks ? leftSlots[leftIndex] : rightSlots[rightIndex];
    const defender = leftAttacks ? rightSlots[rightIndex] : leftSlots[leftIndex];
    const otherBonuses = leftAttacks ? leftOtherBonuses : rightOtherBonuses;
    const defenderBonuses = leftAttacks ? rightOtherBonuses : leftOtherBonuses;
    const nextStacks = { ...attacker.skill_trigger_stacks };
    let applied = false;
    for (const [index, rawPower] of powerTexts.entries()) {
      const digits = rawPower.replace(/\D/g, "");
      if (!digits) continue;
      const observed = Number(digits);
      const skillName = skillCardSlots(attacker.skills, teamSkillCardCount)[index];
      if (!Number.isFinite(observed) || !skillName) continue;
      const info = await cachedSkillTriggerInfo(skillName);
      const candidates: Array<{ trigger: number; count: number }> = [];
      for (const trigger of info.stackable) {
        for (let count = 0; count <= (trigger.max ?? 10); count += 1) {
          const stacks = [...(attacker.skill_trigger_stacks[skillName] || [])];
          stacks[trigger.index] = count;
          const data = await invoke<{ items: QuickSkillResult[] }>("calculate_quick_skills", { payload: {
            attacker: { ...attacker, current_skill: skillName, skill_trigger_stacks: { ...attacker.skill_trigger_stacks, [skillName]: stacks }, other_bonuses: otherBonuses },
            defender: { ...defender, other_bonuses: defenderBonuses }, skills: [skillName], weather,
          } });
          if (data.items[0]?.results.some((result) => Math.round(result.effective_power) === observed)) candidates.push({ trigger: trigger.index, count });
        }
      }
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

  useEffect(() => {
    if (!detectionToast) return;
    const timer = window.setTimeout(() => setDetectionToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [detectionToast]);

  function startDetectionDrag(event: ReactPointerEvent<HTMLElement>, key: string) {
    if (!detectionGroup) return;
    event.preventDefault(); event.stopPropagation();
    const region = detectionRegions[key];
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const move = (moveEvent: PointerEvent) => setDetectionRegions((current) => {
      const next = { ...current, [key]: { ...current[key], x: Math.max(0, Math.min(100 - region.width, (moveEvent.clientX - rect.left) / rect.width * 100 - region.width / 2)), y: Math.max(0, Math.min(100 - region.height, (moveEvent.clientY - rect.top) / rect.height * 100 - region.height / 2)) } };
      detectionRegionsRef.current = next;
      return next;
    });
    const stop = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  }

  function startDetectionResize(event: ReactPointerEvent<HTMLElement>, key: string, edges: { left: boolean; right: boolean; top: boolean; bottom: boolean }) {
    event.preventDefault(); event.stopPropagation();
    const region = detectionRegions[key];
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - start.x) / bounds.width * 100;
      const dy = (moveEvent.clientY - start.y) / bounds.height * 100;
      const width = Math.max(1, Math.min(100, region.width + (edges.left ? -dx : edges.right ? dx : 0)));
      const height = Math.max(1, Math.min(100, region.height + (edges.top ? -dy : edges.bottom ? dy : 0)));
      setDetectionRegions((current) => {
        const next = { ...current, [key]: {
        ...current[key],
        width: Math.min(width, 100 - (edges.left ? Math.max(0, region.x + region.width - width) : region.x)),
        height: Math.min(height, 100 - (edges.top ? Math.max(0, region.y + region.height - height) : region.y)),
        x: edges.left ? Math.max(0, region.x + region.width - width) : region.x,
        y: edges.top ? Math.max(0, region.y + region.height - height) : region.y,
        } };
        detectionRegionsRef.current = next;
        return next;
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  }

  function startDetectionPointer(event: ReactPointerEvent<HTMLButtonElement>, key: string) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const edges = {
      left: event.clientX - bounds.left <= 7,
      right: bounds.right - event.clientX <= 7,
      top: event.clientY - bounds.top <= 7,
      bottom: bounds.bottom - event.clientY <= 7,
    };
    if (edges.left || edges.right || edges.top || edges.bottom) startDetectionResize(event, key, edges);
    else startDetectionDrag(event, key);
  }

  function startReadoutDrag(event: ReactPointerEvent<HTMLElement>, id: keyof DetectionReadoutLayouts) {
    if ((event.target as HTMLElement).closest("button, input, select")) return;
    event.preventDefault();
    const start = { pointerX: event.clientX, pointerY: event.clientY, ...detectionReadoutLayouts[id] };
    const move = (moveEvent: PointerEvent) => setDetectionReadoutLayouts((current) => {
      const next = {
        ...current,
        [id]: { x: start.x + moveEvent.clientX - start.pointerX, y: start.y + moveEvent.clientY - start.pointerY },
      };
      detectionReadoutLayoutsRef.current = next;
      return next;
    });
    const stop = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  }

  function startRecognitionStatusDrag(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, input, select")) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { pointerX: event.clientX, pointerY: event.clientY, ...overlayLayout("recognition-status") };
    const move = (moveEvent: PointerEvent) => {
      updateOverlayLayout("recognition-status", {
        x: Math.max(0, start.x + moveEvent.clientX - start.pointerX),
        y: Math.max(0, start.y + moveEvent.clientY - start.pointerY),
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  useEffect(() => {
    if (displayMode !== "plugin") return;
    const startResize = (event: PointerEvent) => {
      const resizeEdge = (event.target as HTMLElement).closest<HTMLElement>(".plugin-resize-edge");
      const panel = resizeEdge?.closest<HTMLElement>("[data-plugin-resizable]");
      if (!resizeEdge || !panel) return;
      const rect = panel.getBoundingClientRect();
      const edges = {
        left: resizeEdge.classList.contains("left"),
        right: resizeEdge.classList.contains("right"),
        top: resizeEdge.classList.contains("top"),
        bottom: resizeEdge.classList.contains("bottom"),
      };
      event.preventDefault();
      event.stopPropagation();
      const regionClasses: Array<[TeamRegionId, string]> = [
        ["left-roster", "team-left-roster"], ["right-roster", "team-right-roster"],
        ["left-bonus-tools", "team-left-bonus-toolbar"], ["right-bonus-tools", "team-right-bonus-toolbar"],
        ["left-buff", "team-left-buff"], ["right-buff", "team-right-buff"], ["weather", "team-weather"],
      ];
      const regionId = regionClasses.find(([, className]) => panel.classList.contains(className))?.[0];
      const explicitOverlayId = panel.dataset.pluginOverlayId;
      const overlayClass = [...panel.classList].find((className) => /^team-(left|right)-(trait|evolution|skill-\d+)$/.test(className));
      const overlayId = explicitOverlayId || overlayClass?.replace("team-", "");
      const saved = regionId ? regionPositions[regionId] : overlayId ? overlayLayout(overlayId) : { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      const start = { pointerX: event.clientX, pointerY: event.clientY, x: saved.x, y: saved.y, width: rect.width, height: rect.height };
      const move = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - start.pointerX;
        const dy = moveEvent.clientY - start.pointerY;
        const width = Math.max(72, start.width + (edges.left ? -dx : edges.right ? dx : 0));
        const height = Math.max(30, start.height + (edges.top ? -dy : edges.bottom ? dy : 0));
        const x = start.x + (edges.left ? start.width - width : 0);
        const y = start.y + (edges.top ? start.height - height : 0);
        if (regionId) moveRegion(regionId, { x, y, width, height });
        else if (overlayId) updateOverlayLayout(overlayId, { x, y, width, height });
        else {
          panel.style.width = `${width}px`;
          panel.style.height = `${height}px`;
        }
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    };
    document.addEventListener("pointerdown", startResize, true);
    return () => document.removeEventListener("pointerdown", startResize, true);
  }, [displayMode, regionPositions, overlayLayouts]);

  async function changeDisplayMode(nextMode: "normal" | "plugin") {
    setDisplayMode(nextMode);
    onDisplayModeChange(nextMode);
    mixedModeTokenRef.current += 1;
    setMixedMode(false);
    setLayoutMessage("");
    await invoke("update_overlay_click_through", { enabled: false }).catch(() => undefined);
    try {
      const data = await invoke<{ configs: PickerConfigs }>("save_picker_config", {
        payload: { section: "team_layout", values: { display_mode: nextMode } },
      });
      onConfigsChanged(data.configs);
      if (nextMode === "plugin") {
        setRegionPositions(savedTeamRegionPositions(data.configs, teamValues["team-region-width"], teamValues["team-region-height"]));
        setOverlayLayouts(savedPluginOverlayLayouts(data.configs));
        setDetectionReadoutLayouts(savedDetectionReadoutLayouts(data.configs));
      }
    } catch (err) {
      setError(asError(err));
    }
  }

  async function saveCurrentLayout() {
    setLayoutMessage("");
    try {
      const data = await invoke<{ configs: PickerConfigs }>("save_picker_config", {
        payload: { section: "team_layout", values: { regions: regionPositions, overlays: overlayLayouts, detection_regions: detectionRegions, detection_readouts: detectionReadoutLayouts } },
      });
      onConfigsChanged(data.configs);
      setLayoutMessage("布局已保存");
    } catch (err) {
      setError(asError(err));
    }
  }

  function syncReplayDetectionSizes() {
    setDetectionRegions((current) => withReplayDetectionSizes(current));
    setLayoutMessage("已同步对局回放检测框尺寸，点击保存布局写入配置");
  }

  function resetLayout() {
    setRegionPositions(initialTeamRegionPositions(teamValues["team-region-width"], teamValues["team-region-height"]));
    setDetectionRegions(DEFAULT_DETECTION_REGIONS);
    setLayoutMessage("已恢复默认布局，点击保存后写入个人配置");
  }

  function resetBattle() {
    setLeftSlots(Array.from({ length: teamSlotCount }, blankUnit));
    setRightSlots(Array.from({ length: teamSlotCount }, blankUnit));
    setLeftIndex(0);
    setRightIndex(0);
    setLeftAttacks(true);
    setLeftOtherBonuses(blankTeamOtherBonuses());
    setRightOtherBonuses(blankTeamOtherBonuses());
    setLeftMarkFields([]);
    setRightMarkFields([]);
    setResults([]);
    setWillpower(null);
    setRequiredPower(null);
    setBattleContext(null);
    setBuffOptions([]);
    setTargetHp(0);
  }

  async function attachTargetWindow() {
    setTargetStatus("");
    try {
      mixedModeTokenRef.current += 1;
      setMixedMode(false);
      setDetectionGroup(null);
      await invoke("update_overlay_click_through", { enabled: false }).catch(() => undefined);
      const response = await invoke<{ attached: boolean; hwnd: string }>("attach_overlay_target", { hwnd: targetHwnd });
      setTargetAttached(response.attached);
      onOverlayAttachmentChange(response.attached);
      setTargetStatus(`已绑定 ${response.hwnd}`);
      window.dispatchEvent(new CustomEvent<boolean>("overlay-topmost-change", { detail: false }));
    } catch (err) {
      showTemporaryTargetStatus(`绑定失败：${asError(err)}`);
    }
  }

  async function detachTargetWindow() {
    setTargetStatus("");
    try {
      mixedModeTokenRef.current += 1;
      await invoke("detach_overlay_target");
      setTargetAttached(false);
      setMixedMode(false);
      onOverlayAttachmentChange(false);
      setTargetStatus("已解除窗口绑定");
      window.dispatchEvent(new CustomEvent<boolean>("overlay-topmost-change", { detail: false }));
    } catch (err) {
      setError(asError(err));
    }
  }

  async function exitMixedMode() {
    mixedModeTokenRef.current += 1;
    setMixedMode(false);
    setDetectionGroup(null);
    await invoke("update_overlay_click_through", { enabled: false }).catch(() => undefined);
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen<boolean>("overlay-attachment-change", ({ payload }) => {
      setTargetAttached(payload);
      if (!payload) {
        setMixedMode(false);
        setTargetStatus("目标窗口已关闭，已恢复普通窗口");
        onOverlayAttachmentChange(false);
      }
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch((err) => setError(asError(err)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onOverlayAttachmentChange]);

  async function toggleMixedMode() {
    const next = !mixedMode;
    try {
      if (next) {
        mixedModeTokenRef.current += 1;
        setMixedMode(true);
      } else {
        await exitMixedMode();
      }
    } catch (err) {
      setMixedMode(false);
      setError(asError(err));
    }
  }

  useEffect(() => {
    if (!mixedMode || !targetAttached || displayMode !== "plugin") return;
    let cancelled = false;
    const token = mixedModeTokenRef.current;
    let lastIgnore: boolean | null = null;
    let syncing = false;
    const syncHitTarget = async () => {
      if (syncing) return;
      if (token !== mixedModeTokenRef.current) return;
      syncing = true;
      try {
        const currentWindow = getCurrentWindow();
        const [cursor, origin, scaleFactor] = await Promise.all([
          cursorPosition(),
          currentWindow.outerPosition(),
          currentWindow.scaleFactor(),
        ]);
        if (cancelled) return;
        const x = (cursor.x - origin.x) / scaleFactor;
        const y = (cursor.y - origin.y) / scaleFactor;
        const element = document.elementFromPoint(x, y);
        const interactive = Boolean(element?.closest("button, input, select, textarea, [data-overlay-control], [role=dialog]"));
        const ignore = !interactive;
        if (token !== mixedModeTokenRef.current || ignore === lastIgnore) return;
        await invoke("update_overlay_click_through", { enabled: ignore });
        if (!cancelled && token === mixedModeTokenRef.current) lastIgnore = ignore;
      } catch (err) {
        if (!cancelled) setError(asError(err));
      } finally {
        syncing = false;
      }
    };
    void syncHitTarget();
    const timer = window.setInterval(() => void syncHitTarget(), 80);
    return () => {
      cancelled = true;
      mixedModeTokenRef.current += 1;
      window.clearInterval(timer);
      // Vite 热更新会卸载此 effect；同时恢复原生窗口交互，避免残留点击穿透。
      void invoke("update_overlay_click_through", { enabled: false }).catch(() => undefined);
    };
  }, [mixedMode, targetAttached, displayMode]);

  useEffect(() => {
    let disposed = false;
    const stops: Array<() => void> = [];
    void Promise.all([
      listen("overlay-battle-start-scan", () => void recognizeDetection("battleStart")),
      listen("overlay-battle-live-scan", () => void recognizeDetection("battleLive")),
      listen("overlay-battle-power-scan", () => void recognizeSkillPowers()),
    ]).then((items) => { if (disposed) items.forEach((stop) => stop()); else stops.push(...items); }).catch((err) => setError(asError(err)));
    return () => { disposed = true; stops.forEach((stop) => stop()); };
  }, [targetAttached, detectionRegions, pets, leftSlots, rightSlots]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen("overlay-force-edit-mode", () => {
      void exitMixedMode();
      setTargetStatus("已退出混合交互");
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    }).catch((err) => setError(asError(err)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (displayMode !== "plugin" || event.key !== "F8") return;
      event.preventDefault();
      void exitMixedMode().catch((err) => setError(asError(err)));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayMode]);

  function startTeamRegionDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (displayMode !== "plugin") return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a")) return;
    if (target.closest("summary") && !target.closest(".team-region-drag-handle")) return;
    const regionClasses: Array<[TeamRegionId, string]> = [
      ["left-roster", "team-left-roster"],
      ["right-roster", "team-right-roster"],
      ["left-bonus-tools", "team-left-bonus-toolbar"],
      ["right-bonus-tools", "team-right-bonus-toolbar"],
      ["left-buff", "team-left-buff"],
      ["right-buff", "team-right-buff"],
      ["left-skills", "team-left-skills"],
      ["right-skills", "team-right-skills"],
      ["weather", "team-weather"],
    ];
    const matched = regionClasses.find(([, className]) => target.closest(`.${className}`));
    if (!matched) return;
    const [id, className] = matched;
    const region = target.closest<HTMLElement>(`.${className}`);
    if (!region) return;
    event.preventDefault();
    focusRegion(id);
    const start = { pointerX: event.clientX, pointerY: event.clientY, x: regionPositions[id].x, y: regionPositions[id].y };
    const workspace = event.currentTarget;
    const move = (moveEvent: PointerEvent) => {
      const nextX = start.x + moveEvent.clientX - start.pointerX;
      const nextY = start.y + moveEvent.clientY - start.pointerY;
      moveRegion(id, {
        x: Math.min(Math.max(0, nextX), Math.max(0, workspace.clientWidth - region.offsetWidth)),
        y: Math.min(Math.max(0, nextY), Math.max(0, workspace.clientHeight - region.offsetHeight)),
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  const regionWidth = (id: TeamRegionId, fallback: string) => regionPositions[id].width ? `${regionPositions[id].width}px` : fallback;
  const regionHeight = (id: TeamRegionId, fallback: string) => regionPositions[id].height ? `${regionPositions[id].height}px` : fallback;
  const teamLayoutStyle = {
    "--left-roster-x": `${regionPositions["left-roster"].x}px`,
    "--left-roster-y": `${regionPositions["left-roster"].y}px`,
    "--left-roster-z": regionPositions["left-roster"].zIndex,
    "--right-roster-x": `${regionPositions["right-roster"].x}px`,
    "--right-roster-y": `${regionPositions["right-roster"].y}px`,
    "--right-roster-z": regionPositions["right-roster"].zIndex,
    "--left-bonus-tools-x": `${regionPositions["left-bonus-tools"].x}px`,
    "--left-bonus-tools-y": `${regionPositions["left-bonus-tools"].y}px`,
    "--left-bonus-tools-z": regionPositions["left-bonus-tools"].zIndex,
    "--right-bonus-tools-x": `${regionPositions["right-bonus-tools"].x}px`,
    "--right-bonus-tools-y": `${regionPositions["right-bonus-tools"].y}px`,
    "--right-bonus-tools-z": regionPositions["right-bonus-tools"].zIndex,
    "--left-buff-x": `${regionPositions["left-buff"].x}px`,
    "--left-buff-y": `${regionPositions["left-buff"].y}px`,
    "--left-buff-z": regionPositions["left-buff"].zIndex,
    "--right-buff-x": `${regionPositions["right-buff"].x}px`,
    "--right-buff-y": `${regionPositions["right-buff"].y}px`,
    "--right-buff-z": regionPositions["right-buff"].zIndex,
    "--left-skills-x": `${regionPositions["left-skills"].x}px`,
    "--left-skills-y": `${regionPositions["left-skills"].y}px`,
    "--left-skills-z": regionPositions["left-skills"].zIndex,
    "--right-skills-x": `${regionPositions["right-skills"].x}px`,
    "--right-skills-y": `${regionPositions["right-skills"].y}px`,
    "--right-skills-z": regionPositions["right-skills"].zIndex,
    "--weather-x": `${regionPositions.weather.x}px`,
    "--weather-y": `${regionPositions.weather.y}px`,
    "--weather-z": regionPositions.weather.zIndex,
    "--left-roster-width": regionWidth("left-roster", "var(--team-region-width)"),
    "--left-roster-height": regionHeight("left-roster", "auto"),
    "--right-roster-width": regionWidth("right-roster", "95px"),
    "--right-roster-height": regionHeight("right-roster", "auto"),
    "--left-bonus-width": regionWidth("left-bonus-tools", "max-content"),
    "--left-bonus-height": regionHeight("left-bonus-tools", "auto"),
    "--right-bonus-width": regionWidth("right-bonus-tools", "max-content"),
    "--right-bonus-height": regionHeight("right-bonus-tools", "auto"),
    "--left-buff-width": regionWidth("left-buff", "var(--buff-region-width)"),
    "--left-buff-height": regionHeight("left-buff", "auto"),
    "--right-buff-width": regionWidth("right-buff", "var(--buff-region-width)"),
    "--right-buff-height": regionHeight("right-buff", "auto"),
    "--weather-width": regionWidth("weather", "var(--weather-panel-width)"),
    "--weather-height": regionHeight("weather", "auto"),
  } as CSSProperties;

  function resizeSlots(count: number) {
    setLeftSlots((slots) => Array.from({ length: count }, (_, index) => slots[index] || blankUnit()));
    setRightSlots((slots) => Array.from({ length: count }, (_, index) => slots[index] || blankUnit()));
    setLeftIndex((index) => Math.min(index, count - 1));
    setRightIndex((index) => Math.min(index, count - 1));
  }

  useEffect(() => {
    resizeSlots(teamSlotCount);
  }, [teamSlotCount]);

  function normalizeBuffOptions(data: ApplySkillBuffsResult): BuffOption[] {
    return (data.options || [])
      .map((option, index) => ({
        label: option.label || `Buff 选项 ${index + 1}`,
        effects: (option.effects || []).filter(
          (effect) => BUFF_STATE_FIELDS.includes(effect.field) && Number.isFinite(Number(effect.value)),
        ),
      }))
      .filter((option) => option.effects.length > 0);
  }

  function currentBuffPayload(skillName = activeBuffSkillName) {
    return {
      skill_name: skillName,
      attacker: { ...activeBuffUnit, current_skill: skillName, other_bonuses: activeBuffOtherBonuses },
      defender: { ...activeBuffOpponent, other_bonuses: activeBuffOpponentBonuses },
    };
  }

  useEffect(() => {
    let cancelled = false;
    setBuffOptions([]);
    setSelectedBuffOption(0);
    if (!activeBuffSkillName) return () => { cancelled = true; };

    void invoke<ApplySkillBuffsResult>("apply_skill_buffs", {
      payload: currentBuffPayload(),
    })
      .then((data) => {
        if (cancelled || data.skill_name !== activeBuffSkillName) return;
        setBuffOptions(normalizeBuffOptions(data));
      })
      .catch(() => {
        if (!cancelled) setBuffOptions([]);
      });
    return () => { cancelled = true; };
  }, [
    activeBuffSkillName,
    activeBuffUnit.combo_plus,
    activeBuffUnit.combo_mul,
    activeBuffUnit.skill_trigger_stacks,
    activeBuffOpponent,
    activeBuffOtherBonuses,
    activeBuffOpponentBonuses,
    leftAttacks,
    leftIndex,
    rightIndex,
  ]);

  function setSlot(side: "left" | "right", index: number, state: UnitState) {
    const setter = side === "left" ? setLeftSlots : setRightSlots;
    setter((slots) => slots.map((slot, i) => (i === index ? state : slot)));
  }

  function patchSlot(side: "left" | "right", index: number, partial: Partial<UnitState>) {
    const slots = side === "left" ? leftSlots : rightSlots;
    setSlot(side, index, { ...slots[index], ...partial });
  }

  function openBonusTool(side: "left" | "right", tool: BonusTool) {
    setBonusSide(side);
    setBonusTool((current) => current === tool && bonusSide === side ? null : tool);
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

  async function calculate(skillName?: string) {
    setError("");
    try {
      const attacker = leftAttacks ? leftSlots[leftIndex] : rightSlots[rightIndex];
      const defender = leftAttacks ? rightSlots[rightIndex] : leftSlots[leftIndex];
      const other_bonuses = leftAttacks ? leftOtherBonuses : rightOtherBonuses;
      const defender_other_bonuses = leftAttacks ? rightOtherBonuses : leftOtherBonuses;
      const data = await invoke<{ results: BattleResult[] }>("calculate_battle", { payload: { attacker: { ...attacker, current_skill: skillName || attacker.current_skill, other_bonuses }, defender: { ...defender, other_bonuses: defender_other_bonuses }, weather } });
      setBattleContext(battleContextFromUnits(attacker, defender));
      setResults(data.results);
      setWillpower(null);
      setRequiredPower(null);
    } catch (err) {
      setError(asError(err));
      setBattleContext(null);
      setResults([]);
    }
  }

  async function calculateQuickSkills() {
    const attacker = leftAttacks ? leftSlots[leftIndex] : rightSlots[rightIndex];
    const defender = leftAttacks ? rightSlots[rightIndex] : leftSlots[leftIndex];
    const otherBonuses = leftAttacks ? leftOtherBonuses : rightOtherBonuses;
    const defenderOtherBonuses = leftAttacks ? rightOtherBonuses : leftOtherBonuses;
    const skills = uniqueByOrder(attacker.skills.filter(Boolean)).slice(0, teamSkillCardCount);
    if (!skills.length) {
      setQuickSkillResults(null);
      return;
    }
    setError("");
    try {
      const data = await invoke<{ items: QuickSkillResult[] }>("calculate_quick_skills", {
        payload: {
          attacker: { ...attacker, other_bonuses: otherBonuses },
          defender: { ...defender, other_bonuses: defenderOtherBonuses },
          skills,
          weather,
        },
      });
      setQuickSkillResults(data.items);
      setResults([]);
      setWillpower(null);
      setRequiredPower(null);
      setBattleContext(null);
    } catch (err) {
      setQuickSkillResults(null);
      setError(asError(err));
    }
  }

  calculateQuickSkillsRef.current = () => void calculateQuickSkills();
  hideQuickSkillResultsRef.current = () => setQuickSkillResults(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen("overlay-quick-calculate", () => calculateQuickSkillsRef.current())
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch((err) => setError(asError(err)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen("overlay-hide-quick-results", () => hideQuickSkillResultsRef.current())
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch((err) => setError(asError(err)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  async function calculateWillpower() {
    setError("");
    try {
      const attacker = leftAttacks ? leftSlots[leftIndex] : rightSlots[rightIndex];
      const defender = leftAttacks ? rightSlots[rightIndex] : leftSlots[leftIndex];
      const other_bonuses = leftAttacks ? leftOtherBonuses : rightOtherBonuses;
      const defender_other_bonuses = leftAttacks ? rightOtherBonuses : leftOtherBonuses;
      const data = await invoke<WillpowerResponse>("calculate_willpower", { payload: { attacker: { ...attacker, other_bonuses }, defender: { ...defender, other_bonuses: defender_other_bonuses }, weather } });
      setBattleContext({ ...battleContextFromUnits(attacker, defender), skillName: "愿力" });
      setWillpower(data);
      setRequiredPower(null);
      const initial = data.elements[0];
      setSelectedWillpowerElement(initial?.element || null);
      setResults(initial?.results || []);
    } catch (err) {
      setError(asError(err));
      setWillpower(null);
      setResults([]);
    }
  }

  async function calculateRequiredPower() {
    setError("");
    try {
      const attacker = leftAttacks ? leftSlots[leftIndex] : rightSlots[rightIndex];
      const defender = leftAttacks ? rightSlots[rightIndex] : leftSlots[leftIndex];
      const other_bonuses = leftAttacks ? leftOtherBonuses : rightOtherBonuses;
      const defender_other_bonuses = leftAttacks ? rightOtherBonuses : leftOtherBonuses;
      const data = await invoke<RequiredPowerResponse>("calculate_required_power", { payload: { attacker: { ...attacker, other_bonuses }, defender: { ...defender, other_bonuses: defender_other_bonuses }, weather, target_hp: targetHp } });
      setBattleContext(battleContextFromUnits(defender, attacker));
      setWillpower(null);
      setRequiredPower(data);
      setResults([]);
    } catch (err) {
      setError(asError(err));
      setRequiredPower(null);
      setResults([]);
    }
  }

  function selectWillpowerElement(element: WillpowerElementResult) {
    setSelectedWillpowerElement(element.element);
    setResults(element.results);
  }

  async function applyBuff(skillName?: string) {
    setError("");
    const attackerSide = leftAttacks ? "left" : "right";
    const opponentSide = leftAttacks ? "right" : "left";
    let selectedOption: BuffOption | undefined;
    try {
      const data = await invoke<ApplySkillBuffsResult>("apply_skill_buffs", {
        payload: currentBuffPayload(skillName),
      });
      const latestOptions = normalizeBuffOptions(data);
      setBuffOptions(latestOptions);
      selectedOption = latestOptions[selectedBuffOption];
    } catch (err) {
      setError(asError(err));
      return;
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
      if (effect.target === "self" || effect.target === "both") applyTo(attackerSide, effect);
      if (effect.target === "opponent" || effect.target === "both") applyTo(opponentSide, effect);
    });
    setLeftSlots(nextLeft);
    setRightSlots(nextRight);
  }

  return (
    <section className={`battle-page ${displayMode === "plugin" ? "plugin-mode immersive-mode" : "normal-mode"}${mixedMode ? " mixed-active" : ""}`}>
      <div className="team-layout-actions" data-overlay-control>
        <div className="team-layout-actions-main">
          <div className="mode-switch" role="group" aria-label="界面模式">
            <button className={displayMode === "normal" ? "active" : ""} onClick={() => void changeDisplayMode("normal")}>常规模式</button>
            <button className={displayMode === "plugin" ? "active" : ""} onClick={() => void changeDisplayMode("plugin")}>插件模式</button>
          </div>
          {displayMode === "plugin" ? <>
            <label className="overlay-target-input">
              <span>目标 HWND</span>
              <input
                value={targetHwnd}
                placeholder="0x00123456"
                onChange={(event) => setTargetHwnd(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void attachTargetWindow();
                }}
              />
            </label>
            <button onClick={() => void attachTargetWindow()} disabled={!targetHwnd.trim()}>绑定窗口</button>
            {targetAttached ? <button onClick={() => void detachTargetWindow()}>解绑窗口</button> : null}
            <button onClick={() => void toggleMixedMode()} disabled={!targetAttached} aria-pressed={mixedMode} className={mixedMode ? "active" : ""}>
              {mixedMode ? "关闭混合" : "混合模式"}
            </button>
          </> : null}
        </div>
        {displayMode === "plugin" ? <details className="team-layout-actions-more">
          <summary>更多</summary>
          <div className="team-layout-actions-more-grid">
            <button onClick={() => void changeOcrTestMode(!ocrTestMode)} aria-pressed={ocrTestMode} className={ocrTestMode ? "active" : ""}>
              {ocrTestMode ? "关闭测试" : "测试模式"}
            </button>
            <button onClick={() => void saveCurrentLayout()}>保存布局</button>
            <button onClick={resetLayout}>恢复默认布局</button>
            <button onClick={syncReplayDetectionSizes}>同步回放框尺寸</button>
            <label className="overlay-target-input">
              <span>天气</span>
              <select value={weather} onChange={(event) => onWeatherChange(event.target.value as (typeof WEATHER_OPTIONS)[number]["value"])}>
                {WEATHER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <button className={detectionGroup === "battleStart" ? "active" : ""} onClick={() => setDetectionGroup((current) => current === "battleStart" ? null : "battleStart")}>战斗开始框</button>
            <button className={detectionGroup === "battleLive" ? "active" : ""} onClick={() => setDetectionGroup((current) => current === "battleLive" ? null : "battleLive")}>战斗内框</button>
            <button onClick={() => void recognizeDetection("battleStart")} disabled={!targetAttached}>开始识别 Ctrl+B</button>
            <button onClick={() => void recognizeDetection("battleLive")} disabled={!targetAttached}>战斗识别 Ctrl+U</button>
            <button onClick={() => void recognizeSkillPowers()} disabled={!targetAttached}>威力识别 Ctrl+P</button>
          </div>
        </details> : null}
        {targetStatus || layoutMessage || detectionMessage ? <span>{targetStatus || layoutMessage || detectionMessage}</span> : null}
      </div>
      <div className="team-layout" style={teamLayoutStyle} onPointerDown={startTeamRegionDrag}>
        {displayMode === "plugin" && detectionToast ? <div className="detection-toast" role="status">{detectionToast}</div> : null}
        {displayMode === "plugin" && recognitionStatus ? <section className="recognition-status-panel" data-overlay-control style={{ left: overlayLayout("recognition-status").x, top: overlayLayout("recognition-status").y }} onPointerDown={startRecognitionStatusDrag} role="status" aria-live="polite">
          <strong>{recognitionStatus.label}</strong>
          <span>{recognitionStatus.detail}</span>
          <small>{recognitionStatus.progress}</small>
        </section> : null}
        {displayMode === "plugin" ? <div className={`detection-calibration ${detectionGroup || "hidden"}`} data-overlay-control>
          {[...BATTLE_START_IMAGE_KEYS, ...BATTLE_LIVE_IMAGE_KEYS, ...BATTLE_LIVE_NUMBER_KEYS].map((key) => {
            const region = detectionRegions[key];
            const visible = (detectionGroup === "battleStart" && BATTLE_START_IMAGE_KEYS.includes(key as typeof BATTLE_START_IMAGE_KEYS[number])) || (detectionGroup === "battleLive" && !BATTLE_START_IMAGE_KEYS.includes(key as typeof BATTLE_START_IMAGE_KEYS[number]));
            return <button key={key} ref={(element) => { detectionRoiRefs.current[key] = element; }} className={`detection-roi ${key.includes("Image") ? "image" : "number"}${visible ? "" : " hidden"}`} style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }} onPointerDown={(event) => startDetectionPointer(event, key)} title={`拖动 ${detectionLabel(key)}；拖动边缘缩放`}><span>{detectionLabel(key)}</span></button>;
          })}
        </div> : null}
        {displayMode === "plugin" ? <>
          <section className="battle-health-readout draggable-readout" data-overlay-control style={{ transform: `translate(${detectionReadoutLayouts.health.x}px, ${detectionReadoutLayouts.health.y}px)` }} onPointerDown={(event) => startReadoutDrag(event, "health")}><span>敌方 HP {detectedHealth.enemy}</span><span>我方 HP {detectedHealth.self}</span></section>
          <section className="battle-power-readout draggable-readout" data-overlay-control style={{ transform: `translate(-50%, 0) translate(${detectionReadoutLayouts.powers.x}px, ${detectionReadoutLayouts.powers.y}px)` }} onPointerDown={(event) => startReadoutDrag(event, "powers")}>{detectedSkillPowers.map((power, index) => <span key={index}>技能{index + 1} {power}</span>)}</section>
        </> : null}
        <Roster pluginMode={displayMode === "plugin"} className="team-left-roster" title="队伍" presets={presets} pets={pets} elements={elements} configs={configs} slots={leftSlots} activeIndex={leftIndex} onConfigsChanged={onConfigsChanged} onImportGroup={(groupName) => importGroup("left", groupName)} onSelect={setLeftIndex} onPatchSlot={(partial) => patchSlot("left", leftIndex, partial)} onPatchSlotAt={(index, partial) => patchSlot("left", index, partial)} onChoose={(index) => { setLeftIndex(index); setPetPicker({ side: "left", index }); }} onClear={(index) => setSlot("left", index, blankUnit())} />
        <Roster pluginMode={displayMode === "plugin"} className="team-right-roster" title="队伍" presets={presets} pets={pets} elements={elements} configs={configs} slots={rightSlots} activeIndex={rightIndex} onConfigsChanged={onConfigsChanged} onImportGroup={(groupName) => importGroup("right", groupName)} onSelect={setRightIndex} onPatchSlot={(partial) => patchSlot("right", rightIndex, partial)} onPatchSlotAt={(index, partial) => patchSlot("right", index, partial)} onChoose={(index) => { setRightIndex(index); setPetPicker({ side: "right", index }); }} onClear={(index) => setSlot("right", index, blankUnit())} />
        {displayMode === "plugin" ? <>
          <SpeedLine left={leftSlots[leftIndex]} right={rightSlots[rightIndex]} pets={pets} layout={overlayLayout("speed-line")} onLayoutChange={(partial) => updateOverlayLayout("speed-line", partial)} />
          <FloatingTeamPanel className="team-left-trait" layout={overlayLayout("left-trait")} onLayoutChange={(partial) => updateOverlayLayout("left-trait", partial)}><TeamTraitEditor value={leftSlots[leftIndex]} pets={pets} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onChange={(partial) => patchSlot("left", leftIndex, partial)} /></FloatingTeamPanel>
          <FloatingTeamPanel className="team-right-trait" layout={overlayLayout("right-trait")} onLayoutChange={(partial) => updateOverlayLayout("right-trait", partial)}><TeamTraitEditor value={rightSlots[rightIndex]} pets={pets} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onChange={(partial) => patchSlot("right", rightIndex, partial)} /></FloatingTeamPanel>
          <FloatingTeamPanel className="team-left-evolution" layout={overlayLayout("left-evolution")} onLayoutChange={(partial) => updateOverlayLayout("left-evolution", partial)}><TeamEvolutionControls value={leftSlots[leftIndex]} pets={pets} onChange={(partial) => patchSlot("left", leftIndex, partial)} /></FloatingTeamPanel>
          <FloatingTeamPanel className="team-right-evolution" layout={overlayLayout("right-evolution")} onLayoutChange={(partial) => updateOverlayLayout("right-evolution", partial)}><TeamEvolutionControls value={rightSlots[rightIndex]} pets={pets} onChange={(partial) => patchSlot("right", rightIndex, partial)} /></FloatingTeamPanel>
        </> : null}
        <section className="team-bonus-toolbar team-left-bonus-toolbar" data-overlay-control data-plugin-resizable={displayMode === "plugin" || undefined} aria-label="己方其他加成">
          {displayMode === "plugin" ? <PluginResizeEdges /> : null}
          <button className="bonus-tool-button willpower" onClick={() => void calculateWillpower()}>愿力</button>
          {(["dedication", "marks", "thunderstorm"] as const).map((tool) => (
            <button key={tool} className={`bonus-tool-button ${tool}${bonusTool === tool && bonusSide === "left" ? " active" : ""}`} aria-pressed={bonusTool === tool && bonusSide === "left"} onClick={() => openBonusTool("left", tool)}>
              {{ dedication: "奉献", marks: "印记", thunderstorm: "雷暴" }[tool]}
            </button>
          ))}
        </section>
        <section className="team-bonus-toolbar team-right-bonus-toolbar" data-overlay-control data-plugin-resizable={displayMode === "plugin" || undefined} aria-label="敌方其他加成">
          {displayMode === "plugin" ? <PluginResizeEdges /> : null}
          <button className="bonus-tool-button willpower" onClick={() => void calculateWillpower()}>愿力</button>
          {(["dedication", "marks", "thunderstorm"] as const).map((tool) => (
            <button key={tool} className={`bonus-tool-button ${tool}${bonusTool === tool && bonusSide === "right" ? " active" : ""}`} aria-pressed={bonusTool === tool && bonusSide === "right"} onClick={() => openBonusTool("right", tool)}>
              {{ dedication: "奉献", marks: "印记", thunderstorm: "雷暴" }[tool]}
            </button>
          ))}
        </section>
        <TeamBuffPanel className="team-left-buff" title="己方 buff" value={leftSlots[leftIndex]} onChange={(partial) => patchSlot("left", leftIndex, partial)} />
        <TeamBuffPanel className="team-right-buff" title="敌方 buff" value={rightSlots[rightIndex]} onChange={(partial) => patchSlot("right", rightIndex, partial)} />
        {displayMode === "plugin" ? <>
          {Array.from({ length: teamSkillCardCount }, (_, skillIndex) => (
            <TeamSkillCards key={`left-skill-${skillIndex}`} pluginMode className={`team-left-skill-${skillIndex}`} title={`技能 ${skillIndex + 1}`} cardCount={teamSkillCardCount} onlyIndex={skillIndex} floating layout={overlayLayout(`left-skill-${skillIndex}`)} onLayoutChange={(partial) => updateOverlayLayout(`left-skill-${skillIndex}`, partial)} value={leftSlots[leftIndex]} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onApplySkill={leftAttacks ? (skill) => void applyBuff(skill) : undefined} quickResult={leftAttacks ? quickSkillResults?.find((item) => item.skillName === skillCardSlots(leftSlots[leftIndex].skills, teamSkillCardCount)[skillIndex]) || null : null} onChange={(partial) => patchSlot("left", leftIndex, partial)} />
          ))}
          {Array.from({ length: teamSkillCardCount }, (_, skillIndex) => (
            <TeamSkillCards key={`right-skill-${skillIndex}`} pluginMode className={`team-right-skill-${skillIndex}`} title={`技能 ${skillIndex + 1}`} cardCount={teamSkillCardCount} onlyIndex={skillIndex} floating layout={overlayLayout(`right-skill-${skillIndex}`)} onLayoutChange={(partial) => updateOverlayLayout(`right-skill-${skillIndex}`, partial)} value={rightSlots[rightIndex]} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onApplySkill={!leftAttacks ? (skill) => void applyBuff(skill) : undefined} quickResult={!leftAttacks ? quickSkillResults?.find((item) => item.skillName === skillCardSlots(rightSlots[rightIndex].skills, teamSkillCardCount)[skillIndex]) || null : null} onChange={(partial) => patchSlot("right", rightIndex, partial)} />
          ))}
        </> : <>
          <TeamSkillCards className="team-left-skills" title="己方技能卡片" cardCount={teamSkillCardCount} value={leftSlots[leftIndex]} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onApplySkill={leftAttacks ? (skill) => void applyBuff(skill) : undefined} onChange={(partial) => patchSlot("left", leftIndex, partial)} />
          <TeamSkillCards className="team-right-skills" title="敌方技能卡片" cardCount={teamSkillCardCount} value={rightSlots[rightIndex]} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onApplySkill={!leftAttacks ? (skill) => void applyBuff(skill) : undefined} onChange={(partial) => patchSlot("right", rightIndex, partial)} />
        </>}
        {displayMode === "plugin" ? <section className="weather-panel team-weather" data-overlay-control data-plugin-resizable aria-label="天气">
          <PluginResizeEdges />
          <label>
            <span className="ui-field-title">天气</span>
            <select value={weather} onChange={(event) => onWeatherChange(event.target.value as (typeof WEATHER_OPTIONS)[number]["value"])}>
              {WEATHER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </section> : null}
      </div>
      <TeamActionPanel pluginMode={displayMode === "plugin"} layout={displayMode === "plugin" ? overlayLayout("action") : undefined} onLayoutChange={(partial) => updateOverlayLayout("action", partial)} leftAttacks={leftAttacks} onToggleDirection={() => setLeftAttacks((value) => !value)} onCalculate={() => void calculate()} onApplyBuff={() => void applyBuff()} onResetBattle={resetBattle} targetHp={targetHp} onTargetHpChange={setTargetHp} onCalculateRequiredPower={() => void calculateRequiredPower()} buffOptions={buffOptions} selectedBuffOption={selectedBuffOption} onSelectBuffOption={setSelectedBuffOption} />
      {bonusTool ? (
        <BattleBonusToolPanel
          tool={bonusTool}
          side={bonusSide}
          value={bonusSide === "left" ? leftOtherBonuses : rightOtherBonuses}
          burstEffects={burstEffects}
          markFields={bonusSide === "left" ? leftMarkFields : rightMarkFields}
          onMarkFieldsChange={bonusSide === "left" ? setLeftMarkFields : setRightMarkFields}
          onChange={bonusSide === "left"
            ? (partial) => setLeftOtherBonuses((current) => ({ ...current, ...partial }))
            : (partial) => setRightOtherBonuses((current) => ({ ...current, ...partial }))}
          onClose={() => setBonusTool(null)}
        />
      ) : null}
      <ResultView
        results={results}
        error={error}
        context={battleContext}
        willpower={willpower}
        selectedWillpowerElement={selectedWillpowerElement}
        onSelectWillpowerElement={selectWillpowerElement}
      />
      {requiredPower ? <RequiredPowerView value={requiredPower} context={battleContext} /> : null}
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
  onlyIndex,
  floating = false,
  layout,
  onLayoutChange,
  pluginMode = false,
  value,
  elements,
  configs,
  onConfigsChanged,
  onApplySkill,
  quickResult,
  onChange,
}: {
  title: string;
  className?: string;
  cardCount: number;
  onlyIndex?: number;
  floating?: boolean;
  layout?: PluginOverlayLayout;
  onLayoutChange?: (partial: Partial<PluginOverlayLayout>) => void;
  pluginMode?: boolean;
  value: UnitState;
  elements: string[];
  configs: PickerConfigs;
  onConfigsChanged: (configs: PickerConfigs) => void;
  onApplySkill?: (skill: string) => void;
  quickResult?: QuickSkillResult | null;
  onChange: (partial: Partial<UnitState>) => void;
}) {
  const cards = (onlyIndex === undefined ? skillCardSlots(value.skills, cardCount) : [skillCardSlots(value.skills, Math.max(cardCount, value.skills.length))[onlyIndex] || ""]).map((name) => (name ? { name } : null));
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [skillData, setSkillData] = useState<SkillListResult>({ petSkills: [], allSkills: [] });
  const panelRef = useRef<HTMLElement | null>(null);
  const suppressCardClickRef = useRef(false);
  const [skillInfo, setSkillInfo] = useState<SkillTriggerInfo | null>(null);
  const currentSkill = value.current_skill || value.skills[0] || "";
  const controlSkill = onlyIndex === undefined ? currentSkill : cards[0]?.name || "";

  function startFloatingDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!floating || (event.target as HTMLElement).closest("button, input, select, textarea")) return;
    event.preventDefault();
    const start = { pointerX: event.clientX, pointerY: event.clientY, ...(layout || defaultPluginOverlayLayout(className)) };
    const move = (moveEvent: PointerEvent) => {
      if (Math.abs(moveEvent.clientX - start.pointerX) > 3 || Math.abs(moveEvent.clientY - start.pointerY) > 3) suppressCardClickRef.current = true;
      onLayoutChange?.({
        x: Math.max(0, start.x + moveEvent.clientX - start.pointerX),
        y: Math.max(0, start.y + moveEvent.clientY - start.pointerY),
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.setTimeout(() => { suppressCardClickRef.current = false; }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  useEffect(() => {
    if (pickerIndex === null) return;
    void cachedListSkills(value.name).then(setSkillData).catch(() => setSkillData({ petSkills: [], allSkills: [] }));
  }, [pickerIndex, value.name]);

  useEffect(() => {
    let cancelled = false;
    setSkillInfo(null);
    if (!controlSkill) return () => { cancelled = true; };
    void cachedSkillTriggerInfo(controlSkill)
      .then((data) => {
        if (!cancelled && data.skill_name === controlSkill) setSkillInfo(data);
      })
      .catch(() => {
        if (!cancelled) setSkillInfo(null);
      });
    return () => { cancelled = true; };
  }, [controlSkill]);

  useEffect(() => {
    if (!floating || !panelRef.current || !onLayoutChange) return;
    const panel = panelRef.current;
    const observer = new ResizeObserver(() => onLayoutChange({ width: panel.offsetWidth, height: panel.offsetHeight }));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [floating, onLayoutChange]);

  function setSkillAt(index: number, skillName: string) {
    const next = skillCardSlots(value.skills, Math.max(cardCount, value.skills.length));
    next[onlyIndex === undefined ? index : onlyIndex] = skillName;
    onChange({
      skills: next.filter(Boolean),
      current_skill: skillName,
    });
  }

  function clearSkillAt(index: number) {
    const next = skillCardSlots(value.skills, Math.max(cardCount, value.skills.length));
    const actualIndex = onlyIndex === undefined ? index : onlyIndex;
    const removed = next[actualIndex];
    next[actualIndex] = "";
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
    <section ref={panelRef} className={`team-skill-panel ${floating ? "skill-card-floating" : ""} ${className}`.trim()} data-overlay-control data-plugin-resizable={floating || undefined} style={floating && layout ? { left: layout.x, top: layout.y, width: layout.width, height: layout.height } : undefined} onPointerDown={floating ? startFloatingDrag : undefined} onClickCapture={(event) => {
      if (!suppressCardClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressCardClickRef.current = false;
    }}>
      {floating ? <PluginResizeEdges /> : null}
      <h2>{title}</h2>
      <TeamSkillCardGrid
        cards={cards}
        emptySkillOffset={onlyIndex || 0}
        currentSkill={value.current_skill}
        onPick={(current_skill) => onChange({ current_skill: value.current_skill === current_skill ? "" : current_skill })}
        onChoose={setPickerIndex}
        onClear={clearSkillAt}
        onApply={onApplySkill}
        pluginMode={pluginMode}
        quickResult={quickResult}
      />
      {pluginMode && quickResult ? <QuickSkillResultDisplay result={quickResult} /> : null}
      {pluginMode && controlSkill ? (
        <div className="plugin-skill-controls">
          {skillInfo?.stackable.map((trigger) => {
            const stacks = value.skill_trigger_stacks[controlSkill] || [];
            const stackCount = stacks[trigger.index] ?? 0;
            return (
              <div className="skill-stack-control" key={trigger.index}>
                <FieldLabel>{skillInfo.stackable.length > 1 ? trigger.label : "叠加"}</FieldLabel>
                <NumberInput
                  value={stackCount}
                  min={0}
                  max={trigger.max ?? 10}
                  onChange={(nextStackCount) => {
                    const nextStacks = [...stacks];
                    nextStacks[trigger.index] = nextStackCount;
                    onChange({ skill_trigger_stacks: { ...value.skill_trigger_stacks, [controlSkill]: nextStacks } });
                  }}
                />
              </div>
            );
          })}
          {skillInfo?.stackable.length ? <button className="compact-button skill-reset-button" onClick={() => onChange({ skill_trigger_stacks: { ...value.skill_trigger_stacks, [controlSkill]: [] } })}>重置</button> : null}
          {skillInfo?.has_buff && onApplySkill ? <button className="compact-button" onClick={() => onApplySkill(controlSkill)}>应用</button> : null}
          {skillInfo && skillInfo.usage_mode_options.length > 1 && value.usage_time_plus > 0 ? (
          <div className="skill-stack-control">
            <FieldLabel>使用强化</FieldLabel>
            <select
              value={value.skill_usage_mode_choices[controlSkill] ?? skillInfo.usage_mode_options[0].index}
              onChange={(event) => onChange({
                skill_usage_mode_choices: {
                  ...value.skill_usage_mode_choices,
                  [controlSkill]: Number(event.target.value),
                },
              })}
            >
              {skillInfo.usage_mode_options.map((option) => <option key={option.index} value={option.index}>{option.label}</option>)}
            </select>
          </div>) : null}
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

function BonusToolContent({
  tool,
  value,
  burstEffects,
  markFields,
  onMarkFieldsChange,
  onChange,
}: {
  tool: BonusTool;
  value: TeamOtherBonuses;
  burstEffects: BurstEffectItem[];
  markFields: MarkField[];
  onMarkFieldsChange: (fields: MarkField[]) => void;
  onChange: (partial: Partial<TeamOtherBonuses>) => void;
}) {
  if (tool === "dedication") {
    return (
      <div className="bonus-tool-fields">
        <div>
          <FieldLabel>威力层数</FieldLabel>
          <NumberInput value={value.dedication_power_stacks} min={0} max={99} onChange={(dedication_power_stacks) => onChange({ dedication_power_stacks })} />
        </div>
        <div>
          <FieldLabel>连击层数</FieldLabel>
          <NumberInput value={value.dedication_combo_stacks} min={0} max={99} onChange={(dedication_combo_stacks) => onChange({ dedication_combo_stacks })} />
        </div>
      </div>
    );
  }

  if (tool === "marks") {
    const markOptions = [
      ["charge", "蓄电印记", "charge_mark_stacks"],
      ["attack", "攻击印记", "attack_mark_stacks"],
      ["momentum", "蓄势印记", "momentum_mark_stacks"],
      ["starfall", "星陨印记", "starfall_mark_stacks"],
    ] as const;
    return (
      <div className="bonus-tool-fields">
        {markOptions.filter(([id]) => markFields.includes(id)).map(([id, label, key]) => <div key={id}><FieldLabel>{label}</FieldLabel><NumberInput value={value[key]} min={0} max={99} onChange={(stacks) => onChange({ [key]: stacks })} />{id === "charge" ? <button className={value.charge_mark_triggered ? "compact-button active" : "compact-button"} aria-pressed={value.charge_mark_triggered} onClick={() => onChange({ charge_mark_triggered: !value.charge_mark_triggered })}>触发</button> : null}<button className="compact-button" title="移除印记" onClick={() => { onChange({ [key]: 0, ...(id === "charge" ? { charge_mark_triggered: false } : {}) }); onMarkFieldsChange(markFields.filter((field) => field !== id)); }}>移除</button></div>)}
        {markFields.length < markOptions.length ? <label className="mark-add-control"><span>新增印记</span><select value="" onChange={(event) => { const next = event.target.value as MarkField; if (next) onMarkFieldsChange([...markFields, next]); }}><option value="">选择印记</option>{markOptions.filter(([id]) => !markFields.includes(id)).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label> : null}
      </div>
    );
  }

  return (
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
  );
}

function BattleBonusToolPanel({
  tool,
  side,
  value,
  burstEffects,
  markFields,
  onMarkFieldsChange,
  onChange,
  onClose,
}: {
  tool: BonusTool;
  side: "left" | "right";
  value: TeamOtherBonuses;
  burstEffects: BurstEffectItem[];
  markFields: MarkField[];
  onMarkFieldsChange: (fields: MarkField[]) => void;
  onChange: (partial: Partial<TeamOtherBonuses>) => void;
  onClose: () => void;
}) {
  const [position, setPosition] = useState(() => ({ x: Math.max(8, window.innerWidth - 348), y: 84 }));
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const title = `${side === "left" ? "己方" : "敌方"}${{ dedication: "奉献", marks: "印记", thunderstorm: "雷暴" }[tool]}`;

  function clampToViewport(x: number, y: number) {
    const width = panelRef.current?.offsetWidth || 330;
    const height = panelRef.current?.offsetHeight || 260;
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)),
    };
  }

  useEffect(() => {
    const keepVisible = () => setPosition((current) => clampToViewport(current.x, current.y));
    window.addEventListener("resize", keepVisible);
    return () => window.removeEventListener("resize", keepVisible);
  }, []);

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y };
    const move = (moveEvent: PointerEvent) => {
      const start = dragRef.current;
      if (start) setPosition(clampToViewport(start.x + moveEvent.clientX - start.pointerX, start.y + moveEvent.clientY - start.pointerY));
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
    <section ref={panelRef} className={`bonus-tool-floating ${tool}`} data-overlay-control style={{ left: position.x, top: position.y }}>
      <header onPointerDown={startDrag}>
        <strong>{title}</strong>
        <button className="icon-button" title="关闭" aria-label="关闭" onClick={onClose}>×</button>
      </header>
      <BonusToolContent tool={tool} value={value} burstEffects={burstEffects} markFields={markFields} onMarkFieldsChange={onMarkFieldsChange} onChange={onChange} />
    </section>
  );
}

function TeamSkillCardGrid({
  cards,
  emptySkillOffset = 0,
  currentSkill,
  onPick,
  onChoose,
  onClear,
  onCalculate,
  onApply,
  pluginMode,
  quickResult,
}: {
  cards: Array<SkillItem | null>;
  emptySkillOffset?: number;
  currentSkill: string;
  onPick: (skill: string) => void;
  onChoose: (index: number) => void;
  onClear: (index: number) => void;
  onCalculate?: (skill: string) => void;
  onApply?: (skill: string) => void;
  pluginMode?: boolean;
  quickResult?: QuickSkillResult | null;
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
            else onChoose(index);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (skill) onPick(skill.name);
            }
          }}
        >
          <strong>{skill?.name || `空技能${emptySkillOffset + index + 1}`}</strong>
          {quickResult && quickResult.skillName === skill?.name && quickResult.skillPower !== null && quickResult.skillPower !== undefined ? <span className="quick-skill-power">威力 {quickResult.skillPower}</span> : null}
          {!pluginMode ? <div className="skill-card-actions">
            <button className="slot-action" onClick={(event) => { event.stopPropagation(); skill ? onClear(index) : onChoose(index); }}>
              {skill ? "取消" : "选择"}
            </button>
          </div> : null}
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
  const [expanded, setExpanded] = useState(false);
  const activeBuffs = [
    ["物攻", value.phys_atk_buff, "%"],
    ["魔攻", value.mag_atk_buff, "%"],
    ["物防", value.phys_def_buff, "%"],
    ["魔防", value.mag_def_buff, "%"],
    ["威力", value.power_multiplier, "%"],
    ["威力", value.power_bonus, ""],
    ["连击", value.combo_plus, ""],
    ["连击倍", value.combo_mul === 1 ? 0 : value.combo_mul, "x"],
    ["使用", value.usage_time_plus, ""],
  ].filter(([, amount]) => Number(amount) !== 0) as Array<[string, number, string]>;
  return (
    <details className={`team-buff-panel ${className}`.trim()} data-overlay-control data-plugin-resizable open={expanded}>
      <PluginResizeEdges />
      <summary onClick={(event) => {
        event.preventDefault();
        if ((event.target as HTMLElement).closest("button, .team-region-drag-handle")) return;
        setExpanded((current) => !current);
      }}>
          <span className="team-buff-summary-title">
          <span className="team-region-drag-handle" title="拖动 Buff 区域" aria-label="拖动 Buff 区域">::</span>
          <span>{title}</span>
          </span>
          {activeBuffs.length ? <span className="buff-summary-values">{activeBuffs.map(([label, amount, suffix]) => `${label}${amount > 0 ? "+" : ""}${amount}${suffix}`).join(" ")}</span> : null}
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
      ? traitRuntime.name
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
          {traitRuntime?.stack_input ? <button className="compact-button trait-reset-button" onClick={() => onChange({ trait_override_query: null, trait_triggered: false, trait_stacks: 0, trait_choices: {} })}>重置</button> : null}
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

function FloatingTeamPanel({ className, layout, onLayoutChange, children }: { className: string; layout: PluginOverlayLayout; onLayoutChange: (partial: Partial<PluginOverlayLayout>) => void; children: ReactNode }) {
  const panelRef = useRef<HTMLElement | null>(null);

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, input, select, textarea")) return;
    event.preventDefault();
    const start = { pointerX: event.clientX, pointerY: event.clientY, ...layout };
    const move = (moveEvent: PointerEvent) => onLayoutChange({
      x: Math.max(0, start.x + moveEvent.clientX - start.pointerX),
      y: Math.max(0, start.y + moveEvent.clientY - start.pointerY),
    });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  useEffect(() => {
    if (!panelRef.current) return;
    const panel = panelRef.current;
    const observer = new ResizeObserver(() => onLayoutChange({ width: panel.offsetWidth, height: panel.offsetHeight }));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [onLayoutChange]);

  return <section ref={panelRef} className={`floating-team-panel ${className}`} data-overlay-control data-plugin-resizable style={{ left: layout.x, top: layout.y, width: layout.width, height: layout.height }} onPointerDown={startDrag}>
    <div className="plugin-drag-zone" aria-label="拖动面板" />
    <PluginResizeEdges />
    {children}
  </section>;
}

function SpeedLine({ left, right, pets, layout, onLayoutChange }: { left: UnitState; right: UnitState; pets: Pet[]; layout: PluginOverlayLayout; onLayoutChange: (partial: Partial<PluginOverlayLayout>) => void }) {
  const leftScenarios = speedScenarios(left, pets);
  const rightScenarios = speedScenarios(right, pets);
  return <FloatingTeamPanel className="speed-line" layout={layout} onLayoutChange={onLayoutChange}>
    <div className="speed-line-title">速度线</div>
    <div className="speed-line-sides">
      <div><strong>{left.display_name || left.name || "己方"}</strong>{leftScenarios.length ? leftScenarios.map((item) => <span key={item.label}>{item.label} {item.value}</span>) : <span>未选择精灵</span>}</div>
      <div><strong>{right.display_name || right.name || "敌方"}</strong>{rightScenarios.length ? rightScenarios.map((item) => <span key={item.label}>{item.label} {item.value}</span>) : <span>未选择精灵</span>}</div>
    </div>
  </FloatingTeamPanel>;
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
  onPatchSlotAt,
  onChoose,
  onClear,
  pluginMode,
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
  onPatchSlotAt: (index: number, partial: Partial<UnitState>) => void;
  onChoose: (index: number) => void;
  onClear: (index: number) => void;
  pluginMode: boolean;
}) {
  const activeSlot = slots[activeIndex] || blankUnit();
  const controlAfterIndex = Math.min(activeIndex % 2 === 0 ? activeIndex + 1 : activeIndex, slots.length - 1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  function openPopover(index: number) {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    setHoveredIndex(index);
  }

  function schedulePopoverClose() {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHoveredIndex(null), 240);
  }

  return (
    <section className={`roster ${className}`.trim()} data-overlay-control data-plugin-resizable={pluginMode || undefined}>
      {pluginMode ? <PluginResizeEdges /> : null}
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
            <div className="slot-cell" onMouseEnter={() => pluginMode && openPopover(index)} onMouseLeave={schedulePopoverClose}>
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
              {pluginMode && hoveredIndex === index && slot.name ? <div className="slot-iv-popover" onMouseEnter={() => openPopover(index)} onMouseLeave={schedulePopoverClose} onPointerDown={(event) => event.stopPropagation()}>
                <TeamIvEditor value={slot} onChange={(partial) => onPatchSlotAt(index, partial)} alwaysOpen />
              </div> : null}
            </div>
            {!pluginMode && index === controlAfterIndex ? (
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

function ResultView({
  results, error, context, willpower, selectedWillpowerElement, onSelectWillpowerElement,
}: {
  results: BattleResult[];
  error: string;
  context: BattleContext | null;
  willpower: WillpowerResponse | null;
  selectedWillpowerElement: string | null;
  onSelectWillpowerElement: (element: WillpowerElementResult) => void;
}) {
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
  const isRequiredPower = results.some((result) => result.required_power !== undefined);
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
      {willpower ? (
        <div className="willpower-result-tabs" aria-label="愿力系别">
          {willpower.elements.map((item) => (
            <button key={item.element} className={selectedWillpowerElement === item.element ? "active" : ""} onClick={() => onSelectWillpowerElement(item)}>
              {item.element}{item.has_stab ? "*" : ""} {item.advantage}x
            </button>
          ))}
        </div>
      ) : null}
      {grouped.map(([caseLabel, caseResults]) => {
        return (
          <section className="result-section" key={caseLabel}>
            <header>
              <strong>{caseLabel}</strong>
              <span>{isRequiredPower ? "所需基础威力" : "最终威力"} {isRequiredPower ? caseResults[0]?.required_power ?? "-" : caseResults[0]?.effective_power ?? "-"}</span>
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
                              {isRequiredPower ? rowResult?.required_power ?? "-" : rowResult?.damage ?? "-"}
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

function RequiredPowerView({ value, context }: { value: RequiredPowerResponse; context: BattleContext | null }) {
  const [visible, setVisible] = useState(true);
  const [position, setPosition] = useState({ x: 80, y: 88 });
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const labels = ["天分加性格++", "天分+", "正常", "减性格-"];
  const physical = value.rows.filter((row) => row.attack_type === "物攻");
  const magical = value.rows.filter((row) => row.attack_type === "魔攻");
  useEffect(() => setVisible(true), [value]);

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y };
    const move = (moveEvent: PointerEvent) => {
      const start = dragRef.current;
      if (!start) return;
      setPosition({ x: Math.max(8, start.x + moveEvent.clientX - start.pointerX), y: Math.max(8, start.y + moveEvent.clientY - start.pointerY) });
    };
    const stop = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  if (!visible) return null;
  return (
    <section className="required-power-panel" style={{ left: position.x, top: position.y }}>
      <header onPointerDown={startDrag}>
        <div>
          <strong>判死所需威力</strong>
          <span>{context?.attackerName || "敌方"} 击杀 {context?.defenderName || "我方"}（{value.target_hp} HP）</span>
        </div>
        <button onClick={() => setVisible(false)}>关闭</button>
      </header>
      <div className="required-power-table">
        <div>敌方攻击档位</div><div>物攻威力</div><div>魔攻威力</div>
        {labels.map((label, index) => (
          <Fragment key={label}>
            <div>{label}</div>
            <div>{physical[index]?.required_power ?? "-"}</div>
            <div>{magical[index]?.required_power ?? "-"}</div>
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function QuickSkillResultDisplay({ result }: { result: QuickSkillResult }) {
  const resultRows = [true, false].map((isTriggered) => result.results.filter((item, index, source) =>
    item.is_triggered === isTriggered
      && source.findIndex((candidate) => candidate.is_triggered === isTriggered
        && candidate.damage === item.damage
        && candidate.hp_results.map(({ damage_percent }) => damage_percent).join("/") === item.hp_results.map(({ damage_percent }) => damage_percent).join("/")) === index,
  )).filter((items) => items.length > 0);
  return <div className="quick-skill-result" aria-label={`${result.skillName} 快捷结果`}>
    {resultRows.map((rows, rowIndex) => <div className="quick-skill-result-row" key={rowIndex}>
      {rows.map((item, index) => <span key={`${item.case_label}-${item.damage}-${index}`}>
        <b>{item.damage}</b>
        <small>{item.hp_results.map(({ damage_percent }) => `${Math.round(damage_percent)}%`).join(" / ")}</small>
      </span>)}
    </div>)}
  </div>;
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
              {configIndex === "team" ? (
                <button
                  className="compact-button"
                  onClick={() => {
                    const nextValues = { ...values };
                    activeSection.fields.forEach(({ key }) => {
                      nextValues[key] = UI_TOKEN_DEFAULTS[key];
                    });
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
            <p className="burst-effect-description"><span>效果描述</span>{effect.description || "暂无描述"}</p>
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
  const [tab, setTab] = useState<"team" | "presets" | "replay" | "settings">("team");
  const [weather, setWeather] = useState<(typeof WEATHER_OPTIONS)[number]["value"]>("none");
  const [data, setData] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [previewUiTokens, setPreviewUiTokens] = useState<UiTokenValues | null>(null);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [overlayAttached, setOverlayAttached] = useState(false);
  const [teamDisplayMode, setTeamDisplayMode] = useState<"normal" | "plugin">("plugin");
  const [fullscreenEnabled, setFullscreenEnabled] = useState(false);

  async function toggleOverlay() {
    const next = !overlayEnabled;
    try {
      const currentWindow = getCurrentWindow();
      await currentWindow.setAlwaysOnTop(next);
      setOverlayEnabled(next);
    } catch (err) {
      setError(asError(err));
    }
  }

  async function toggleFullscreen() {
    const next = !fullscreenEnabled;
    try {
      await getCurrentWindow().setFullscreen(next);
      setFullscreenEnabled(next);
    } catch (err) {
      setError(asError(err));
    }
  }

  function dragWindow(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    void getCurrentWindow().startDragging().catch((err) => setError(asError(err)));
  }

  async function load() {
    setError("");
    try {
      const nextData = await invoke<AppState>("app_state");
      setData(nextData);
      setTeamDisplayMode(nextData.configs.team_layout?.display_mode === "normal" ? "normal" : "plugin");
      setPreviewUiTokens(null);
    } catch (err) {
      setError(asError(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("overlay-attached", overlayAttached);
    return () => document.documentElement.classList.remove("overlay-attached");
  }, [overlayAttached]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<boolean>("overlay-attachment-change", ({ payload }) => setOverlayAttached(payload))
      .then((stop) => { unlisten = stop; })
      .catch((err) => setError(asError(err)));
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const onTopmostChanged = (event: Event) => {
      setOverlayEnabled(Boolean((event as CustomEvent<boolean>).detail));
    };
    window.addEventListener("overlay-topmost-change", onTopmostChanged);
    return () => window.removeEventListener("overlay-topmost-change", onTopmostChanged);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F11") return;
      event.preventDefault();
      void toggleFullscreen();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreenEnabled]);

  const teamConfigs = data && previewUiTokens
    ? { ...data.configs, ui_tokens: { ...(data.configs.ui_tokens || {}), ...previewUiTokens } }
    : data?.configs;

  return (
    <main className={`${tab === "presets" || tab === "replay" ? "app-shell preset-shell" : "app-shell"}${overlayAttached ? " overlay-attached" : ""}`} style={data ? (previewUiTokens ? uiTokenStyleFromValues(previewUiTokens) : uiTokenStyle(data.configs)) : undefined}>
      <header className="app-header overlay-header" onPointerDown={dragWindow}>
        <nav className="tabs">
          <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>队伍面板</button>
          <button className={tab === "presets" ? "active" : ""} onClick={() => setTab("presets")}>精灵保存</button>
          <button className={tab === "replay" ? "active" : ""} onClick={() => setTab("replay")}>对局回放</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>界面配置</button>
          <button onClick={() => void load()}>刷新</button>
        </nav>
        {teamDisplayMode === "plugin" ? <button
          className={overlayEnabled ? "overlay-toggle overlay-header-toggle active" : "overlay-toggle overlay-header-toggle"}
          title={`${overlayEnabled ? "关闭悬浮置顶" : "开启悬浮置顶"}；F11 切换全屏`}
          aria-pressed={overlayEnabled}
          onClick={() => void toggleOverlay()}
        >
          {overlayEnabled ? "取消置顶" : "悬浮置顶"}
        </button> : null}
        {tab === "team" && teamDisplayMode !== "plugin" ? <section className="weather-panel">
            <label>
              <span className="ui-field-title">天气</span>
              <select value={weather} onChange={(event) => setWeather(event.target.value as (typeof WEATHER_OPTIONS)[number]["value"])}>
                {WEATHER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </section>
        : null}
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
              weather={weather}
              onWeatherChange={setWeather}
              onPresetsChanged={(presets) => setData({ ...data, presets })}
              onConfigsChanged={(configs) => setData({ ...data, configs })}
              onOverlayAttachmentChange={setOverlayAttached}
              onDisplayModeChange={setTeamDisplayMode}
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
          <div className="battle-view" hidden={tab !== "replay"}><ReplayPage /></div>
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
