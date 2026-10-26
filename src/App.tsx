import { invoke } from "@tauri-apps/api/core";
import defaultConfigs from "../src-tauri/resources/rocodatebase/data/configs.json";
import { listen } from "@tauri-apps/api/event";
import { cursorPosition, getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { createPortal, flushSync } from "react-dom";
import { createContext, Fragment, type CSSProperties, type PointerEvent as ReactPointerEvent, type PointerEventHandler as ReactPointerEventHandler, type ReactNode, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { prepareNumericImage, type NumericOcrMode } from "./numericOcr";
import { findTraitStackMatches, matchTraitStacks, type TraitPowerCandidates } from "./traitAlignment";
import { beginPluginLongPressDrag, pluginResizeEdges } from "./pluginLongPressDrag";
import { enemyAttackPowerText, enemyAttackRows, parseEnemyAttackHealth, type EnemyAttackSample, type EnemyAttackSkillCell, type EnemyAttackSkillResponse } from "./enemyAttack";
import { WATCH_RULE_OPTIONS, groupWatchedSkills, readWatchConfiguration, watchConfigurationValues, watchSkillMatchesSearch, type WatchConfiguration, type WatchGroup, type WatchRule } from "./watchSkills";

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
const BLOODLINE_OPTIONS = [
  "普通系血脉",
  "草系血脉",
  "火系血脉",
  "水系血脉",
  "光系血脉",
  "地系血脉",
  "冰系血脉",
  "龙系血脉",
  "电系血脉",
  "毒系血脉",
  "虫系血脉",
  "武系血脉",
  "翼系血脉",
  "萌系血脉",
  "幽系血脉",
  "恶系血脉",
  "机械系血脉",
  "幻系血脉",
  "首领血脉",
];
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
  prevForms?: string[];
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
  "speed_buff",
  "power_multiplier",
  "light_power_buff",
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
  element: string;
  description: string;
  has_damage: boolean;
  has_buff: boolean;
  stackable: Array<{ index: number; label: string; max?: number; affects_power: boolean }>;
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
type QuickSkillResult = { skillName: string; displayPower?: number | null; results: BattleResult[] };
type EnemyAttackPayload = { attacker: UnitState & { other_bonuses: TeamOtherBonuses }; defender: UnitState & { other_bonuses: TeamOtherBonuses }; target_hp: number; weather: string };
type WillpowerElementResult = { element: string; advantage: number; has_stab: boolean; results: BattleResult[] };
type WillpowerResponse = { attack_type: "atk" | "mag"; elements: WillpowerElementResult[] };
type RequiredPowerRow = { attack_type: "物攻" | "魔攻"; attacker_label: string; required_power: number };
type RequiredPowerResponse = { target_hp: number; rows: RequiredPowerRow[] };

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
type BonusToolPosition = { x: number; y: number };
type BonusToolPositions = Record<string, BonusToolPosition>;
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
  { value: "blizzard", label: "雪天（冰）" },
  { value: "thunder", label: "雷鸣（电）" },
] as const;
const SKILL_TYPE_FILTERS = ["物攻", "魔攻", "防御", "状态"] as const;
const ELEMENT_ICONS = import.meta.glob<string>("../src-tauri/icons/element/*.png", { eager: true, query: "?url", import: "default" });
const SKILL_TYPE_ICONS = import.meta.glob<string>("../src-tauri/icons/skill_type/*.png", { eager: true, query: "?url", import: "default" });
const SKILL_ICONS = import.meta.glob<string>("../src-tauri/icons/skill/*.png", { eager: true, query: "?url", import: "default" });
const PET_ICONS = import.meta.glob<string>("../src-tauri/icons/pet/*.png", { eager: true, query: "?url", import: "default" });

function normalizePetIconName(value: string) {
  return value.trim().replace(/^0*(\d+)\s*/, "$1");
}

function buildIconLookup(icons: Record<string, string>, normalize = (value: string) => value.trim()) {
  const exact = new Map<string, string>();
  const defaultForms = new Map<string, string>();
  const suffix = "（本来的样子）";
  for (const [path, src] of Object.entries(icons)) {
    const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.png$/, "");
    exact.set(normalize(name), src);
    if (name.endsWith(suffix)) defaultForms.set(normalize(name.slice(0, -suffix.length)), src);
  }
  return { exact, defaultForms };
}

function buildPetIconLookup(icons: Record<string, string>) {
  const { exact, defaultForms } = buildIconLookup(icons, normalizePetIconName);
  const names = new Map<string, string | null>();
  const fallbackNames = new Map<string, string | null>();
  const megaForms = new Map<string, string>();
  const withoutSuffix = (value: string) => value.replace(/(?:（[^）]*）|\([^)]*\))+$/, "");
  for (const [identity, src] of exact) {
    const name = identity.replace(/^\d+/, "");
    names.set(name, names.has(name) ? null : src);
    const base = withoutSuffix(identity);
    if (!megaForms.has(base)) megaForms.set(base, src);
    const baseName = base.replace(/^\d+/, "");
    if (!megaForms.has(baseName)) megaForms.set(baseName, src);
  }
  for (const [identity, src] of defaultForms) {
    const name = identity.replace(/^\d+/, "");
    fallbackNames.set(name, fallbackNames.has(name) ? null : src);
  }
  return (value: string, mega = false) => {
    if (mega) return megaForms.get(withoutSuffix(normalizePetIconName(value)));
    return /^\d/.test(value.trim())
      ? exact.get(normalizePetIconName(value)) || defaultForms.get(normalizePetIconName(value))
      : names.has(value.trim()) ? names.get(value.trim()) || undefined : fallbackNames.get(value.trim()) || undefined;
  };
}

const petIconSource = buildPetIconLookup(PET_ICONS);
const MegaPetIconContext = createContext<ReadonlySet<string>>(new Set());
const skillIconLookup = buildIconLookup(SKILL_ICONS);
const croppedPetIcons = new Map<string, Promise<string>>();
const croppedPetIconUrls = new Map<string, string>();
const loadedIconRatios = new Map<string, number>();

function visibleImageBounds(pixels: Uint8ClampedArray, width: number, height: number) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function croppedPetIconSource(src: string): Promise<string> {
  const cached = croppedPetIcons.get(src);
  if (cached) return cached;
  const result = new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) { resolve(src); return; }
        context.drawImage(image, 0, 0);
        const bounds = visibleImageBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (!bounds || (bounds.width === canvas.width && bounds.height === canvas.height)) { resolve(src); return; }
        const cropped = document.createElement("canvas");
        cropped.width = bounds.width;
        cropped.height = bounds.height;
        const croppedContext = cropped.getContext("2d");
        if (!croppedContext) { resolve(src); return; }
        croppedContext.drawImage(image, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
        resolve(cropped.toDataURL("image/png"));
      } catch {
        resolve(src);
      }
    };
    image.onerror = () => resolve(src);
    image.src = src;
  }).then((url) => {
    croppedPetIconUrls.set(src, url);
    return url;
  });
  croppedPetIcons.set(src, result);
  return result;
}

function ImageLabel({ src, children, iconOnly = false, className = "", imageClassName = "entity-icon", title, trimTransparent = false, hideTextWhileLoading = false, imageLoading = "eager" }: {
  src?: string;
  children: ReactNode;
  iconOnly?: boolean;
  className?: string;
  imageClassName?: string;
  title?: string;
  trimTransparent?: boolean;
  hideTextWhileLoading?: boolean;
  imageLoading?: "eager" | "lazy";
}) {
  const initialDisplaySrc = src && trimTransparent ? croppedPetIconUrls.get(src) || src : src;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(() => initialDisplaySrc && loadedIconRatios.has(initialDisplaySrc) ? src || null : null);
  const [loadedAspectRatio, setLoadedAspectRatio] = useState<{ source: string; ratio: number } | null>(() => {
    const ratio = initialDisplaySrc && trimTransparent && iconOnly ? loadedIconRatios.get(initialDisplaySrc) : undefined;
    return initialDisplaySrc && ratio ? { source: initialDisplaySrc, ratio } : null;
  });
  const [cropped, setCropped] = useState<{ source: string; url: string } | null>(() => {
    const url = src && trimTransparent ? croppedPetIconUrls.get(src) : undefined;
    return src && url ? { source: src, url } : null;
  });
  const [cropReadySrc, setCropReadySrc] = useState<string | null>(null);
  useEffect(() => {
    if (!src || !trimTransparent || cropped?.source === src || (imageLoading === "lazy" && cropReadySrc !== src)) return;
    let cancelled = false;
    void croppedPetIconSource(src).then((url) => {
      if (!cancelled) setCropped({ source: src, url });
    });
    return () => { cancelled = true; };
  }, [src, trimTransparent, imageLoading, cropReadySrc, cropped?.source]);
  if (!src || failedSrc === src) return <>{children}</>;
  const displaySrc = trimTransparent && cropped?.source === src ? cropped.url : src;
  return <span className={`image-label ${className}`.trim()} title={title} data-image-loaded={loadedSrc === src || undefined} style={loadedAspectRatio?.source === displaySrc ? { "--pet-image-aspect-ratio": loadedAspectRatio.ratio } as CSSProperties : undefined}>
    <img className={imageClassName} src={displaySrc} alt="" draggable={false} loading={imageLoading} decoding={imageLoading === "lazy" ? "async" : undefined} onLoad={(event) => {
      if (loadedSrc !== src) setLoadedSrc(src);
      if (trimTransparent && imageLoading === "lazy" && cropped?.source !== src && cropReadySrc !== src) setCropReadySrc(src);
      if (event.currentTarget.naturalHeight > 0) {
        const ratio = event.currentTarget.naturalWidth / event.currentTarget.naturalHeight;
        loadedIconRatios.set(displaySrc, ratio);
        if (trimTransparent && iconOnly && (loadedAspectRatio?.source !== displaySrc || loadedAspectRatio.ratio !== ratio)) {
          setLoadedAspectRatio({ source: displaySrc, ratio });
        }
      }
    }} onError={() => setFailedSrc(src)} />
    {iconOnly && (loadedSrc === src || hideTextWhileLoading) ? <span className="image-label-hidden-text">{children}</span> : <span className="image-label-text">{children}</span>}
  </span>;
}

function EntityLabel({ kind, value, children = value, iconOnly = false, className = "", imageLoading = "eager", title }: {
  kind: "pet" | "skill";
  value: string;
  children?: ReactNode;
  iconOnly?: boolean;
  className?: string;
  imageLoading?: "eager" | "lazy";
  title?: string;
}) {
  const megaPets = useContext(MegaPetIconContext);
  const src = kind === "pet" ? petIconSource(value, megaPets.has(normalizePetIconName(value))) : skillIconLookup.exact.get(value.trim()) || skillIconLookup.defaultForms.get(value.trim());
  return <ImageLabel key={src || value} src={src} iconOnly={iconOnly} className={className} imageClassName={kind === "pet" ? "entity-icon pet-icon" : "entity-icon"} trimTransparent={kind === "pet"} imageLoading={imageLoading} title={title ?? (typeof children === "string" ? children : value)}>{children}</ImageLabel>;
}

function PickerIcon({ value, kind = "element", imageLoading = "eager" }: { value: string; kind?: "element" | "skill-type"; imageLoading?: "eager" | "lazy" }) {
  const src = kind === "element"
    ? ELEMENT_ICONS[`../src-tauri/icons/element/${value.replace(/系$/, "")}.png`]
    : SKILL_TYPE_ICONS[`../src-tauri/icons/skill_type/${value === "变化" ? "状态" : value}.png`];
  return <ImageLabel key={src || value} src={src} iconOnly hideTextWhileLoading imageLoading={imageLoading} imageClassName={`picker-type-icon${kind === "skill-type" ? " skill-type-icon" : ""}`} title={value}>{value}</ImageLabel>;
}

const BUTTON_ICONS = import.meta.glob<string>("../src-tauri/icons/{refresh,trigger}.png", { eager: true, query: "?url", import: "default" });

function ActionIconButton({ icon, label, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: "refresh" | "trigger"; label: string }) {
  const src = BUTTON_ICONS[`../src-tauri/icons/${icon}.png`];
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showIcon = Boolean(src && failedSrc !== src);
  return <button {...props} className={`${showIcon ? `${icon}-button ` : ""}${className}`.trim()} title={label} aria-label={label}>{showIcon ? <img src={src} alt="" draggable={false} onError={() => setFailedSrc(src)} /> : label}</button>;
}

function RefreshButton({ label = "重置", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return <ActionIconButton {...props} icon="refresh" label={label} />;
}

function TriggerButton({ label = "触发", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return <ActionIconButton {...props} icon="trigger" label={label} />;
}

function petMatchesPickerFilters(pet: Pet, elements: string[], finalOnly: boolean) {
  return elements.every((element) => pet.elements.includes(element)) && (!finalOnly || pet.isFinal);
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

function useWatchConfiguration(configs: PickerConfigs, onConfigsChanged: (configs: PickerConfigs) => void, onError: (error: string) => void) {
  const [configuration, setConfiguration] = useState(() => readWatchConfiguration(configs.team_layout));
  const current = useRef(configuration);
  const saved = useRef(configuration);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const pending = useRef(0);
  useEffect(() => {
    if (pending.current) return;
    const next = readWatchConfiguration(configs.team_layout);
    current.current = next;
    saved.current = next;
    setConfiguration(next);
  }, [configs.team_layout]);

  function update(change: (value: WatchConfiguration) => WatchConfiguration) {
    const next = change(current.current);
    current.current = next;
    setConfiguration(next);
    const version = ++revision.current;
    pending.current++;
    const operation = queue.current.then(async () => {
      try {
        const data = await invoke<{ configs: PickerConfigs }>("save_picker_config", {
          payload: { section: "team_layout", values: watchConfigurationValues(next) },
        });
        saved.current = next;
        if (version === revision.current) onConfigsChanged(data.configs);
        return true;
      } catch (error) {
        if (version === revision.current) {
          current.current = saved.current;
          setConfiguration(saved.current);
        }
        onError(asError(error));
        return false;
      } finally {
        pending.current--;
      }
    });
    queue.current = operation.then(() => undefined);
    return operation;
  }
  return [configuration, update] as const;
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

function asError(err: unknown) {
  return err instanceof Error ? err.message : String(err);
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

function skillMeta(skill: SkillItem, imageLoading: "eager" | "lazy" = "eager", part: "all" | "icons" | "numbers" = "all") {
  const detail = skillDetail(skill);
  const numbers = [
    detail.skill_power !== null && detail.skill_power !== undefined ? `威力 ${detail.skill_power}` : null,
    detail.cost !== undefined ? `费用 ${detail.cost}` : null,
  ].filter(Boolean).join(" / ");
  if (!detail.element && !detail.type && !numbers) return null;
  return <span className="picker-card-meta">
    {part !== "numbers" && detail.element ? <PickerIcon value={detail.element} imageLoading={imageLoading} /> : null}
    {part !== "numbers" && detail.type ? <PickerIcon value={detail.type} kind="skill-type" imageLoading={imageLoading} /> : null}
    {part !== "icons" && numbers ? <span>{numbers}</span> : null}
  </span>;
}

function skillText(skill: SkillItem) {
  const detail = skillDetail(skill);
  return [detail.description || skill.description, skill.unlock].filter(Boolean).join("\n");
}

function skillCardSlots(skills: string[], count = DEFAULT_SKILL_CARD_COUNT) {
  return Array.from({ length: count }, (_, index) => skills[index] || "");
}

function FieldLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <label className={`field-label ${className}`.trim()}>{children}</label>;
}

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

function PluginResizeEdges({ onPointerDown }: { onPointerDown?: ReactPointerEventHandler<HTMLDivElement> }) {
  return <>
    <div className="plugin-resize-edge top" data-resize-edge="top" onPointerDown={onPointerDown} />
    <div className="plugin-resize-edge right" data-resize-edge="right" onPointerDown={onPointerDown} />
    <div className="plugin-resize-edge bottom" data-resize-edge="bottom" onPointerDown={onPointerDown} />
    <div className="plugin-resize-edge left" data-resize-edge="left" onPointerDown={onPointerDown} />
  </>;
}

function PluginDragZone() {
  return <div className="plugin-drag-zone" aria-label="拖动面板" />;
}

const pluginPanelMoves = new WeakMap<HTMLElement, (position: { x: number; y: number }) => void>();

function usePluginPanelMove(ref: { current: HTMLElement | null }, onMove: (position: { x: number; y: number }) => void) {
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    pluginPanelMoves.set(panel, onMove);
    return () => { pluginPanelMoves.delete(panel); };
  });
}

function traitSummaryAtPoint(target: HTMLElement, x: number, y: number): HTMLButtonElement | null {
  if (target.closest(".trait-expanded-content, .modal-backdrop")) return null;
  const panel = target.closest<HTMLElement>(".trait-floating-panel");
  const button = panel?.querySelector<HTMLButtonElement>(".trait-summary-button");
  if (!panel || !button) return null;
  const control = target.closest("button, input, select, textarea, [role=button]");
  if (control && control !== button) return null;
  const row = button.getBoundingClientRect();
  const label = button.querySelector("strong")?.getBoundingClientRect() || row;
  const bounds = panel.getBoundingClientRect();
  return x >= Math.min(bounds.left, row.left, label.left)
    && x <= Math.max(bounds.right, row.right, label.right)
    && y >= Math.min(row.top, label.top)
    && y <= Math.max(row.bottom, label.bottom) ? button : null;
}

/* 展开浮层默认向下、向右展开；贴到屏幕边缘时自动翻到另一侧，避免被裁掉。 */
function usePopupPlacement(open: boolean, anchorRef: React.RefObject<HTMLElement | null>, popupRef: React.RefObject<HTMLElement | null>) {
  const [placement, setPlacement] = useState({ up: false, left: false });
  useEffect(() => {
    if (!open) {
      setPlacement({ up: false, left: false });
      return;
    }
    const measure = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const popup = popupRef.current;
      const neededHeight = (popup?.offsetHeight || 240) + 8;
      const neededWidth = (popup?.offsetWidth || 320) + 8;
      setPlacement({
        up: window.innerHeight - rect.bottom < neededHeight && rect.top > neededHeight,
        left: rect.right + neededWidth > window.innerWidth && rect.left - neededWidth > 0,
      });
    };
    measure();
    const timer = window.setTimeout(measure, 0);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, anchorRef, popupRef]);
  return placement;
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

function familyFormsForPet(name: string, pets: Pet[]) {
  const base = pets.find((pet) => [pet.label, `${pet.id}${pet.name}`, pet.name].includes(name));
  if (!base) return [];
  const labels = new Set(base.evolutionChain?.length ? base.evolutionChain : [base.label]);
  const forms = pets.filter((pet) => labels.has(pet.label));
  const byLabel = new Map(forms.map((pet) => [pet.label, pet]));
  const chain = [...labels];
  const chainOrder = new Map(chain.map((label, index) => [label, index]));
  const depths = new Map<string, number>();
  const evolutionDepth = (pet: Pet, visiting = new Set<string>()): number => {
    if (depths.has(pet.label)) return depths.get(pet.label)!;
    if (visiting.has(pet.label)) return 0;
    const ancestors = new Set([...visiting, pet.label]);
    const previous = (pet.prevForms || []).map((label) => byLabel.get(label)).filter((form): form is Pet => Boolean(form));
    const depth = previous.length
      ? 1 + Math.max(...previous.map((form) => evolutionDepth(form, ancestors)))
      : Math.max(0, (Number(pet.evolutionStage) || 1) - 1);
    depths.set(pet.label, depth);
    return depth;
  };
  for (const pet of forms) evolutionDepth(pet);
  return forms.sort((first, second) =>
    Number(first.evolutionStage === "mega") - Number(second.evolutionStage === "mega")
    || depths.get(first.label)! - depths.get(second.label)!
    || (chainOrder.get(first.label) ?? chain.length) - (chainOrder.get(second.label) ?? chain.length),
  );
}

function selectedFamilyForm(value: UnitState, pets: Pet[]) {
  const find = (name: string) => pets.find((pet) => [pet.label, `${pet.id}${pet.name}`, pet.name].includes(name));
  let selected = find(value.mega_form || value.name);
  for (let step = 0; selected && step < value.devolution; step += 1) {
    selected = find(selected.prevForms?.[0] || "") || selected;
  }
  if (selected && value.mega && !value.mega_form) selected = find(selected.nextForms?.[0] || "") || selected;
  return selected;
}

function familyFormPatch(value: UnitState, target: Pet, pets: Pet[]): Partial<UnitState> {
  let current = pets.find((pet) => [pet.label, `${pet.id}${pet.name}`, pet.name].includes(value.name));
  const visited = new Set<string>();
  let devolution = 0;
  // Keep existing devolution semantics for ancestors, including their trait source.
  while (current && !visited.has(current.label)) {
    if (current.label === target.label) return { devolution, mega: false, mega_form: null };
    visited.add(current.label);
    const previous = current.prevForms?.[0];
    current = pets.find((pet) => pet.label === previous);
    devolution += 1;
  }
  return { devolution: 0, mega: false, mega_form: target.label };
}

function FamilyFormSelect({ value, pets, onChange, pluginMode = false }: { value: UnitState; pets: Pet[]; onChange: (partial: Partial<UnitState>) => void; pluginMode?: boolean }) {
  const forms = useMemo(() => familyFormsForPet(value.name, pets), [value.name, pets]);
  const selected = selectedFamilyForm(value, pets);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 240 });
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setOpen(false); }, [value.name, value.devolution, value.mega, value.mega_form]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const up = below < 160 && above > below;
      const maxHeight = Math.max(40, Math.min(240, up ? above : below));
      const height = Math.min(popupRef.current?.offsetHeight || maxHeight, maxHeight);
      const width = popupRef.current?.offsetWidth || rect.width;
      setPosition({ left: Math.max(4, Math.min(rect.left, window.innerWidth - width - 4)), top: up ? rect.top - height - 4 : rect.bottom + 4, maxHeight });
    };
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !popupRef.current?.contains(target)) setOpen(false);
    };
    place();
    const observer = new ResizeObserver(place);
    if (popupRef.current) observer.observe(popupRef.current);
    if (anchorRef.current) observer.observe(anchorRef.current);
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  const choose = (pet: Pet) => {
    onChange(familyFormPatch(value, pet, pets));
    setOpen(false);
    anchorRef.current?.focus();
  };
  const handleKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); anchorRef.current?.focus(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const options = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]") || []);
      const index = options.findIndex((option) => option === document.activeElement);
      const next = index < 0 ? (event.key === "ArrowDown" ? 0 : options.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    }
    if (event.key === "Tab") setOpen(false);
  };
  return <>
    <button ref={anchorRef} type="button" className="family-form-select" aria-label="同进化链精灵形态" aria-haspopup="listbox" aria-expanded={open} disabled={!forms.length} onClick={() => setOpen(!open)} onKeyDown={handleKey}>
      {selected ? <EntityLabel kind="pet" value={selected.label} iconOnly>{selected.name}</EntityLabel> : pluginMode ? "形态" : "选择形态"}<span aria-hidden="true">▾</span>
    </button>
    {open ? createPortal(<div ref={popupRef} className={`family-form-options${document.documentElement.classList.contains("overlay-attached") || anchorRef.current?.closest(".battle-page.immersive-mode") ? " overlay-form-options" : ""}`} role="listbox" aria-label="同进化链精灵形态" data-overlay-control style={position} onKeyDown={handleKey}>
      {forms.map((pet) => <button type="button" role="option" aria-selected={pet.label === selected?.label} key={pet.label} onClick={() => choose(pet)}><EntityLabel kind="pet" value={pet.label} iconOnly>{pet.name}</EntityLabel></button>)}
    </div>, document.body) : null}
  </>;
}

function TeamEvolutionControls({
  value,
  pets,
  onChange,
  className = "",
  pluginMode = false,
}: {
  value: UnitState;
  pets: Pet[];
  onChange: (partial: Partial<UnitState>) => void;
  className?: string;
  pluginMode?: boolean;
}) {
  return (
    <div className={`slot-evolution-row ${className}`.trim()}>
      <div className="slot-evolution-control slot-family-control">
        <FamilyFormSelect value={value} pets={pets} onChange={onChange} pluginMode={pluginMode} />
      </div>
      <RefreshButton className="compact-button evolution-reset-button" onClick={() => onChange({ devolution: 0, mega: false, mega_form: null })} />
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

function PickerCardList({ itemCount, renderItem, initialIndex = -1 }: {
  itemCount: number;
  renderItem: (index: number) => ReactNode;
  initialIndex?: number;
}) {
  const rowHeight = 58;
  const rowStep = rowHeight + 6;
  const rowCount = Math.ceil(itemCount / 2);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState(() => ({
    top: initialIndex >= 0 ? Math.max(0, Math.floor(initialIndex / 2) * rowStep - 120) : 0,
    height: 440,
  }));
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const initialPositionedRef = useRef(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || initialIndex < 0 || initialPositionedRef.current) return;
    initialPositionedRef.current = true;
    list.scrollTop = Math.max(0, Math.floor(initialIndex / 2) * rowStep - (list.clientHeight - rowHeight) / 2);
    setViewport({ top: list.scrollTop, height: list.clientHeight });
  }, [initialIndex]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let frame = 0;
    const measure = () => setViewport({ top: list.scrollTop, height: list.clientHeight });
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(list);
    list.addEventListener("scroll", schedule, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  const firstRow = Math.max(0, Math.min(rowCount, Math.floor(viewport.top / rowStep) - 4));
  const lastRow = Math.min(rowCount, Math.ceil((viewport.top + viewport.height) / rowStep) + 4);
  const rows = Array.from({ length: Math.max(0, lastRow - firstRow) }, (_, index) => firstRow + index);
  if (focusedRow !== null && focusedRow < rowCount && !rows.includes(focusedRow)) rows.push(focusedRow);
  rows.sort((a, b) => a - b);

  return <div className="compact-picker-grid windowed-picker-grid" ref={listRef} onKeyDown={(event) => {
    if (event.key !== "Tab" || event.ctrlKey || event.altKey || event.metaKey) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".compact-picker-card");
    const rowElement = button?.parentElement;
    if (!button || !rowElement?.dataset.pickerRow) return;
    const index = Number(rowElement.dataset.pickerRow) * 2 + Array.from(rowElement.children).indexOf(button);
    const nextIndex = index + (event.shiftKey ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= itemCount) return;
    event.preventDefault();
    const nextRow = Math.floor(nextIndex / 2);
    flushSync(() => setFocusedRow(nextRow));
    listRef.current?.querySelector<HTMLButtonElement>(`[data-picker-row="${nextRow}"] > button:nth-child(${nextIndex % 2 + 1})`)?.focus();
  }} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedRow(null);
  }}>
    <div className="picker-list-space" style={{ height: Math.max(0, rowCount * rowStep - 6) }}>
      {rows.map((row) => <div className="picker-list-row" data-picker-row={row} key={row} style={{ top: row * rowStep }} onFocus={() => setFocusedRow(row)}>
        {renderItem(row * 2)}
        {row * 2 + 1 < itemCount ? renderItem(row * 2 + 1) : null}
      </div>)}
    </div>
  </div>;
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
  initialPetName = "",
  useSavedPetFilters = false,
  onClearPet,
  initialSkillName = "",
  onClearSkill,
  searchSkillDescriptions = false,
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
  initialPetName?: string;
  useSavedPetFilters?: boolean;
  onClearPet?: () => void;
  initialSkillName?: string;
  onClearSkill?: () => void;
  searchSkillDescriptions?: boolean;
}) {
  const section = mode === "pet" ? "pet_picker" : mode === "trait" ? "trait_picker" : "skill_picker";
  const config = configs[section] || {};
  const locateCurrentPet = mode === "pet" && Boolean(initialPetName);
  const locateCurrentSkill = mode === "skill" && Boolean(initialSkillName);
  const initialPet = pets.find((pet) => pet.label === initialPetName || pet.name === initialPetName || `${pet.id}${pet.name}` === initialPetName);
  const [query, setQuery] = useState("");
  const [element, setElement] = useState(locateCurrentSkill || searchSkillDescriptions ? "" : (config.element as string) || "");
  const [petElements, setPetElements] = useState<string[]>(() => {
    if (locateCurrentPet && !useSavedPetFilters) return [];
    const savedElements = Array.isArray(config.selected_elements)
      ? config.selected_elements.filter((value): value is string => typeof value === "string" && Boolean(value))
      : [];
    return (savedElements.length ? savedElements : [(config.element as string) || ""]).filter(Boolean).slice(-2);
  });
  const [skillType, setSkillType] = useState(locateCurrentSkill || searchSkillDescriptions ? "" : (config.skill_type as string) || "");
  const [sortDesc, setSortDesc] = useState(Boolean(config.sort_desc));
  const [finalOnly, setFinalOnly] = useState(locateCurrentPet && !useSavedPetFilters ? false : Boolean(config.final_only));
  const configuredPetTab = config.active_tab === "preset" || config.active_tab === "library" ? config.active_tab : null;
  const groupConfigKey = `preset_group_${preferredGroup}`;
  const configuredGroupName = typeof config[groupConfigKey] === "string" ? (config[groupConfigKey] as string) : "";
  const [petTab, setPetTab] = useState<"preset" | "library">(
    locateCurrentPet && !useSavedPetFilters ? "library" : onPickPreset && presets.length ? configuredPetTab || "preset" : "library",
  );
  const [groupName, setGroupName] = useState(configuredGroupName || preferredGroup);
  const [skillTab, setSkillTab] = useState<"pet" | "library">(locateCurrentSkill ? "pet" : (config.active_tab as "pet" | "library") || "pet");
  const skillTabLocatedRef = useRef(false);
  useEffect(() => {
    if (!locateCurrentSkill || skillTabLocatedRef.current || (!petSkills.length && !allSkills.length)) return;
    skillTabLocatedRef.current = true;
    setSkillTab(petSkills.some((skill) => skill.name === initialSkillName) ? "pet" : "library");
  }, [locateCurrentSkill, initialSkillName, petSkills, allSkills]);
  const normalizedQuery = query.trim().toLowerCase();
  const currentGroup = presets.find((group) => group.name === groupName) || presets.find((group) => group.name === preferredGroup) || presets[0];
  const petLookup = useMemo(() => mode === "pet" && petTab === "preset" ? buildPetLookup(pets) : new Map<string, Pet>(), [pets, mode, petTab]);
  const filteredPresets = useMemo(() => mode === "pet" && petTab === "preset" ? (currentGroup?.items || [])
    .filter((preset) => !normalizedQuery || `${preset.id}${preset.name}${preset.key}`.toLowerCase().includes(normalizedQuery))
    .filter((preset) => {
      const pet = petFromPreset(preset, petLookup);
      return !pet || petMatchesPickerFilters(pet, petElements, finalOnly);
    }) : [], [mode, petTab, currentGroup, normalizedQuery, petLookup, petElements, finalOnly]);
  const sourcePets = mode === "trait" ? traits : pets;
  const filteredPets = useMemo(() => {
    if (mode === "skill" || (mode === "pet" && petTab === "preset")) return [];
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
    while (normalizedQuery && evolutionChainExpanded) {
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
    return sourcePets
      .filter((pet) => !normalizedQuery || petMatchesSearch(pet) || matchingEvolutionForms.has(pet.label))
      .filter((pet) => petMatchesPickerFilters(pet, mode === "pet" ? petElements : element ? [element] : [], finalOnly))
      .sort((a, b) => {
        const idA = Number(a.id) || Number.MAX_SAFE_INTEGER;
        const idB = Number(b.id) || Number.MAX_SAFE_INTEGER;
        const result = idA === idB ? a.name.localeCompare(b.name, "zh-Hans-CN") : idA - idB;
        return sortDesc ? -result : result;
      });
  }, [mode, petTab, sourcePets, normalizedQuery, petElements, element, finalOnly, sortDesc]);
  const currentSkillSource = skillTab === "pet" ? petSkills : allSkills;
  const filteredSkills = useMemo(() => mode === "skill" ? currentSkillSource
    .filter((skill) => !normalizedQuery || (searchSkillDescriptions ? watchSkillMatchesSearch(skill, normalizedQuery) : skill.name.toLowerCase().includes(normalizedQuery)))
    .filter((skill) => {
      if (!element) return true;
      const detail = skill.detail || skill;
      return detail.element === element;
    })
    .filter((skill) => !skillType || skillDetail(skill).type === skillType)
    .sort((a, b) => {
      const rank = (skill: SkillItem) => {
        const index = elements.indexOf(skillDetail(skill).element || "");
        return index < 0 ? elements.length : index;
      };
      return rank(a) - rank(b);
    }) : [], [mode, currentSkillSource, normalizedQuery, element, skillType, skillTab, elements, searchSkillDescriptions]);

  async function saveConfig(values: Record<string, unknown>) {
    const data = await invoke<{ configs: PickerConfigs }>("save_picker_config", {
      payload: { section, values },
    });
    onConfigsChanged(data.configs);
  }

  useLayoutEffect(() => {
    void invoke("update_overlay_click_through", { enabled: false }).catch(() => undefined);
  }, []);

  return createPortal(
    <div data-overlay-control className={`modal-backdrop${mode === "skill" || mode === "pet" ? " skill-picker-backdrop" : ""}${document.documentElement.classList.contains("overlay-attached") ? " overlay-attached-picker" : ""}`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="picker-modal compact-picker" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2>{mode === "pet" ? "选择精灵" : mode === "skill" ? "选择技能" : "选择特性"}</h2>
          <div className="header-actions">
            {mode === "pet" && onClearPet ? <button onClick={onClearPet}>取消当前精灵</button> : null}
            <button className="icon-button" onClick={onClose} aria-label="关闭" title="关闭">×</button>
          </div>
        </header>
        <div className={mode === "pet" ? "picker-tools pet-picker-tools" : "picker-tools"}>
          <div className="picker-tools-main">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchSkillDescriptions ? "搜索技能名称或描述，如：印记" : "搜索..."} />
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
                  aria-pressed={finalOnly}
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
              <>
                <button onClick={() => void saveConfig({ element, skill_type: skillType })}>保存筛选</button>
                {onClearSkill ? <button className="picker-clear-skill" onClick={onClearSkill}>置空</button> : null}
              </>
            )}
          </div>
          <div className={`picker-filter-row${mode === "skill" ? " with-skill-types" : ""}`}>
            <div className="picker-element-grid" aria-label="属性筛选">
              {elements.map((item) => {
                const selected = mode === "pet" ? petElements.includes(item) : element === item;
                return <button
                  key={item}
                  className={selected ? "active" : ""}
                  aria-pressed={selected}
                  aria-label={item}
                  title={item}
                  onClick={() => {
                    if (mode !== "pet") {
                      setElement((current) => current === item ? "" : item);
                      return;
                    }
                    setPetElements((current) => current.includes(item)
                      ? current.filter((value) => value !== item)
                      : [...current.slice(0, 1), item]);
                  }}
                >
                  <PickerIcon value={item} />
                </button>;
              })}
            </div>
            {mode === "skill" ? <div className="picker-skill-type-grid" aria-label="技能类型筛选">
              {SKILL_TYPE_FILTERS.map((item) => <button
                key={item}
                className={skillType === item ? "active" : ""}
                aria-pressed={skillType === item}
                aria-label={item}
                title={item}
                onClick={() => setSkillType((current) => current === item ? "" : item)}
              >
                <PickerIcon value={item} kind="skill-type" />
              </button>)}
            </div> : null}
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
                    element: petElements[0] || "",
                    selected_elements: petElements,
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
              <button onClick={() => void saveConfig({ element: mode === "pet" ? petElements[0] || "" : element, selected_elements: mode === "pet" ? petElements : undefined, sort_desc: sortDesc, final_only: finalOnly })}>
                保存配置
              </button>
            </div>
          ) : null}
        </div>
        <PickerCardList
          itemCount={mode === "skill" ? filteredSkills.length : mode === "pet" && petTab === "preset" && onPickPreset ? filteredPresets.length : filteredPets.length}
          initialIndex={locateCurrentPet ? filteredPets.findIndex((pet) => pet.label === initialPet?.label) : locateCurrentSkill ? filteredSkills.findIndex((skill) => skill.name === initialSkillName) : -1}
          renderItem={(index) => {
            const skill = filteredSkills[index];
            const preset = filteredPresets[index];
            const pet = filteredPets[index];
            return (
          mode === "skill"
            ? (
                <button key={`${skill.name}-${index}`} className="compact-picker-card picker-skill-card" title={[skill.name, skillText(skill)].filter(Boolean).join("\n")} onClick={() => onPickSkill(skill)}>
                  <strong><EntityLabel kind="skill" value={skill.name} imageLoading="lazy" />{skillMeta(skill, "lazy", "icons")}</strong>
                  {skillMeta(skill, "lazy", "numbers")}
                </button>
              )
            : mode === "pet" && petTab === "preset" && onPickPreset
              ? (
                  <button key={preset.key} className="compact-picker-card" onClick={() => onPickPreset(preset)}>
                    <strong className="preset-name" title={`${preset.id} ${preset.name}`}><EntityLabel kind="pet" value={`${preset.id}${preset.name}`} imageLoading="lazy">{preset.key}</EntityLabel></strong>
                    <span>{preset.id} {preset.name} | {(preset.skills || []).slice(0, DEFAULT_SKILL_CARD_COUNT).filter(Boolean).length ? preset.skills.slice(0, DEFAULT_SKILL_CARD_COUNT).filter(Boolean).map((name, index) => <Fragment key={`${name}-${index}`}>{index ? " / " : ""}<EntityLabel kind="skill" value={name} imageLoading="lazy" /></Fragment>) : "未保存技能"}</span>
                  </button>
                )
              : (
                <button
                  key={`${mode}-${pet.label}`}
                  className="compact-picker-card"
                  onClick={() => (mode === "trait" ? onPickTrait(pet) : onPickPet(pet))}
                >
                  <strong>
                    <EntityLabel kind="pet" value={pet.label} imageLoading="lazy">{pet.id} {pet.name}</EntityLabel>
                  </strong>
                  <span className="picker-card-meta">{pet.elements.map((item) => <PickerIcon key={item} value={item} imageLoading="lazy" />)}</span>
                  <em>{mode === "trait" ? `${pet.traitName || "-"}：${pet.traitEffect || ""}` : `种族 ${pet.race ?? "-"}，技能 ${pet.skillCount}`}</em>
                </button>
              )
            );
          }}
        />
      </section>
    </div>,
    document.body,
  );
}

function TeamActionPanel({
  pluginMode,
  layout,
  onLayoutChange,
  leftAttacks,
  onToggleDirection,
  onCalculate,
  onRecognizeBattleLive,
  onRecognizeBattleStart,
  onToggleQuickCalculate,
  quickCalculationActive,
  onRecognizeSkillPowers,
  onCalculateEnemyAttack,
  onAlignTraitStacks,
  onApplyBuff,
  onReverseBuff,
  onResetBattle,
  targetHp,
  onTargetHpChange,
  onCalculateRequiredPower,
  buffOptions,
  selectedBuffOption,
  onSelectBuffOption,
  visibility,
}: {
  pluginMode: boolean;
  layout?: PluginOverlayLayout;
  onLayoutChange?: (partial: Partial<PluginOverlayLayout>) => void;
  leftAttacks: boolean;
  onToggleDirection: () => void;
  onCalculate: () => void;
  onRecognizeBattleLive: () => void;
  onRecognizeBattleStart: () => void;
  onToggleQuickCalculate: () => void;
  quickCalculationActive: boolean;
  onRecognizeSkillPowers: () => void;
  onCalculateEnemyAttack: () => void;
  onAlignTraitStacks: () => void;
  onApplyBuff: () => void;
  onReverseBuff: () => void;
  onResetBattle: () => void;
  targetHp: number;
  onTargetHpChange: (value: number) => void;
  onCalculateRequiredPower: () => void;
  buffOptions: BuffOption[];
  selectedBuffOption: number;
  onSelectBuffOption: (index: number) => void;
  visibility?: PluginVisibility;
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
    const bottomInset = pluginMode ? 0 : 8;
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - panelWidth - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - panelHeight - bottomInset)),
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
    if ((event.target as HTMLElement).closest("button, select, input, textarea, [role=button], summary, .plugin-resize-edge")) return;
    event.preventDefault();
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y };
    const move = (moveEvent: PointerEvent) => {
      const start = dragRef.current;
      if (!start) return;
      const rawX = start.x + moveEvent.clientX - start.pointerX;
      const rawY = start.y + moveEvent.clientY - start.pointerY;
      const next = pluginMode
        ? clampToViewport(snapToGrid(rawX), snapToGrid(rawY))
        : clampToViewport(rawX, rawY);
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
    <section ref={panelRef} className={pluginMode ? "team-action-floating" : "team-action-floating normal-team-action"} data-panel-state="armed" data-overlay-control data-plugin-resizable={pluginMode || undefined} data-plugin-overlay-id={pluginMode ? "action" : undefined} style={{ left: position.x, top: position.y, width: pluginMode && layout ? layout.width : undefined, height: pluginMode && layout ? layout.height : undefined, ...(pluginMode ? pluginContentStyle(layout) : {}) }} onPointerDown={startDrag}>
      {pluginMode ? <PluginResizeEdges /> : null}
      <div className="team-action-buttons">
        {(!pluginMode || visibility?.["action-calculate"] !== false) ? <button className="calc-button" onClick={onCalculate}>计算</button> : null}
        <RefreshButton className="calc-button" label="对局重置" onClick={onResetBattle} />
        {(!pluginMode || visibility?.["action-options"] !== false) ? <select
          className="buff-option-select"
          value={buffOptions.length ? selectedBuffOption : ""}
          disabled={!buffOptions.length}
          onChange={(event) => onSelectBuffOption(Number(event.target.value))}
        >
          {buffOptions.length ? buffOptions.map((option, index) => <option key={`${option.label}-${index}`} value={index}>{option.label}</option>) : <option value="">无可应用 Buff</option>}
        </select> : null}
        {(!pluginMode || visibility?.["action-apply"] !== false) ? <button className="buff-button" onClick={onApplyBuff} disabled={!buffOptions.length}>应用</button> : null}
        {pluginMode && visibility?.["action-reverse"] !== false ? <button className="buff-button" onClick={onReverseBuff} disabled={!buffOptions.length}>反向</button> : null}
      </div>
      {pluginMode ? <div className="team-action-shortcuts">
        <button type="button" title="战斗内识别 Ctrl+U" aria-keyshortcuts="Control+U" onClick={onRecognizeBattleLive}>战斗内识别</button>
        <button type="button" title="战斗开始识别 Ctrl+B" aria-keyshortcuts="Control+B" onClick={onRecognizeBattleStart}>战斗开始识别</button>
        <button type="button" title={quickCalculationActive ? "取消显示计算 Ctrl+D" : "快捷计算 Ctrl+J"} aria-keyshortcuts="Control+J" aria-pressed={quickCalculationActive} onClick={onToggleQuickCalculate}>快捷计算</button>
        <button type="button" title="校对威力 Ctrl+P" aria-keyshortcuts="Control+P" onClick={onRecognizeSkillPowers}>校对威力</button>
        <button type="button" title="判死 Ctrl+K" aria-keyshortcuts="Control+K" onClick={onCalculateEnemyAttack}>判死</button>
        <button type="button" title="校对特性 Ctrl+T" aria-keyshortcuts="Control+T" onClick={onAlignTraitStacks}>校对特性</button>
      </div> : null}
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

type PluginContentOffset = { contentX?: number; contentY?: number };
type TeamRegionPosition = { x: number; y: number; zIndex: number; width?: number; height?: number } & PluginContentOffset;
type TeamRegionPositions = Record<TeamRegionId, TeamRegionPosition>;
type PluginOverlayLayout = { x: number; y: number; width: number; height: number } & PluginContentOffset;
type PluginOverlayLayouts = Record<string, PluginOverlayLayout>;
type DetectionReadoutLayouts = Record<"health" | "powers", { x: number; y: number }>;
type DetectionReadoutCoordinateMode = "viewport-offset" | "page";
type DetectionGroup = "battleStart" | "battleLive";
type CalibrationResult = { status: "pending" | "loading" | "success" | "failure"; text: string };
const PLUGIN_VISIBILITY_GROUPS = [
  { title: "显示框", items: [["weather", "天气框"], ["left-buff", "我方 buff 框"], ["right-buff", "敌方 buff 框"], ["skills", "我方全部技能框"], ["watch", "醒目技能"], ["powers", "技能识别框"], ["health", "血量识别框"], ["speed", "速度框（含速度 buff）"]] },
  ...(["left", "right"] as const).map((side) => ({
    title: `${side === "left" ? "我方" : "敌方"}其他框`,
    items: [[`${side}-other`, "整个其他框"], [`${side}-willpower`, "愿力"], [`${side}-dedication`, "奉献"], [`${side}-marks`, "印记"], [`${side}-thunderstorm`, "雷暴"]],
  })),
  { title: "计算和对局重置框", items: [["action-calculate", "计算"], ["action-options", "Buff 选项"], ["action-apply", "应用"], ["action-reverse", "反向"]] },
];
type PluginVisibility = Record<string, boolean>;
function savedPluginVisibility(configs: PickerConfigs): PluginVisibility {
  const saved = configs.team_layout?.plugin_visibility as Record<string, unknown> | undefined;
  return Object.fromEntries(PLUGIN_VISIBILITY_GROUPS.flatMap((group) => group.items.map(([key]) => [key, saved?.[key] !== false])));
}
type DetectionRegion = { x: number; y: number; width: number; height: number };
type DetectionRegions = Record<string, DetectionRegion>;
type TargetCapture = { regions: Record<string, string> };
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
    skill1: "skill1", skill2: "skill2", skill3: "skill3", skill4: "skill4",
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

function readPluginContentOffset(values: Record<string, unknown>): PluginContentOffset {
  const contentX = Number(values.contentX);
  const contentY = Number(values.contentY);
  return {
    ...(Number.isFinite(contentX) ? { contentX } : {}),
    ...(Number.isFinite(contentY) ? { contentY } : {}),
  };
}

function pluginContentStyle(layout?: PluginContentOffset): CSSProperties {
  return {
    "--plugin-content-x": `${layout?.contentX || 0}px`,
    "--plugin-content-y": `${layout?.contentY || 0}px`,
  } as CSSProperties;
}

function savedDetectionReadoutCoordinateMode(configs: PickerConfigs): DetectionReadoutCoordinateMode {
  const saved = configs.team_layout?.detection_readouts as { coordinate_space?: unknown } | undefined;
  return saved?.coordinate_space === "page" ? "page" : "viewport-offset";
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
        ...(Number.isFinite(width) ? { width: Math.max(1, width) } : {}),
        ...(Number.isFinite(height) ? { height: Math.max(1, height) } : {}),
        ...readPluginContentOffset(values),
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
  if (id === "speed-buffs") {
    const base = defaultPluginOverlayLayout("speed-line");
    return { x: base.x, y: base.y + base.height + 8, width: base.width, height: 96 };
  }
  if (id === "right-watch") {
    return { x: 520, y: 120, width: 148, height: 96 };
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
    const size = {
      width: Number.isFinite(width) ? Math.max(1, width) : fallback.width,
      height: Number.isFinite(height) ? Math.max(1, height) : fallback.height,
    };
    return [[id, {
      x: Number.isFinite(x) ? Math.max(0, x) : fallback.x,
      y: Number.isFinite(y) ? Math.max(0, y) : fallback.y,
      ...size,
      ...readPluginContentOffset(values),
    }]];
  }));
}

/** 插件运行态的静默/唤醒三态：面板当前是否携带有效数值。 */
type PanelState = "idle" | "armed";

function panelState(armed: boolean): PanelState {
  return armed ? "armed" : "idle";
}

/** 插件模式拖拽的吸附网格，单位 px。 */
const OVERLAY_GRID = 8;
const snapToGrid = (value: number) => Math.round(value / OVERLAY_GRID) * OVERLAY_GRID;

/** D. 插件模式独立密度档。常规模式始终 100%。 */
const PLUGIN_DENSITY_OPTIONS = [
  { value: 1, label: "密度 100%" },
  { value: 0.9, label: "密度 90%" },
  { value: 0.8, label: "密度 80%" },
  { value: 0.7, label: "密度 70%" },
];

/**
 * 把 ui_tokens 按倍率缩放后重新声明一遍。CSS 自定义属性会继承，
 * 所以在 .battle-page.plugin-mode 上重新定义即可覆盖整棵子树，
 * 无需改动 ui-tokens.css / styles.css 里约 200 处消费点。
 */
function pluginDensityStyle(configs: PickerConfigs, density: number): CSSProperties | undefined {
  if (density === 1) return undefined;
  const values = uiTokenValues(configs);
  return Object.fromEntries(
    Object.entries(values)
      // 窗口尺寸由 Rust 建窗时读取，不参与界面密度。
      .filter(([key]) => key !== "window-width" && key !== "window-height")
      .map(([key, value]) => {
        const floor = key.endsWith("-font-size") ? 8 : 1;
        return [`--${key}`, `${Math.max(floor, Math.round(value * density))}px`];
      }),
  ) as CSSProperties;
}

function savedBonusToolPositions(configs: PickerConfigs): BonusToolPositions {
  const saved = configs.team_layout?.bonus_tool_positions;
  if (!saved || typeof saved !== "object") return {};
  return Object.fromEntries(Object.entries(saved).flatMap(([id, item]) => {
    if (!item || typeof item !== "object") return [];
    const { x, y } = item as Record<string, unknown>;
    return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
      ? [[id, { x, y }]] : [];
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
  const defaultOverlayLayoutsRef = useRef<PluginOverlayLayouts>({});
  const [detectionRegions, setDetectionRegions] = useState<DetectionRegions>(() => savedDetectionRegions(configs));
  const [detectionGroup, setDetectionGroup] = useState<DetectionGroup | null>(null);
  const [calibrationResults, setCalibrationResults] = useState<Record<string, CalibrationResult>>({});
  const calibrationGroupRef = useRef<DetectionGroup | null>(null);
  const calibrationSessionRef = useRef(0);
  const [detectionMessage, setDetectionMessage] = useState("");
  const [detectionToast, setDetectionToast] = useState("");
  const [ocrTestMode, setOcrTestMode] = useState(configs.team_layout?.ocr_test_mode === true);
  const [pluginDensity, setPluginDensity] = useState(() => {
    const saved = Number(configs.team_layout?.plugin_density);
    return PLUGIN_DENSITY_OPTIONS.some((option) => option.value === saved) ? saved : 1;
  });
  const [detectedHealth, setDetectedHealth] = useState({ enemy: "-", self: "-" });
  const [detectedSkillPowers, setDetectedSkillPowers] = useState(["-", "-", "-", "-"]);
  const [detectionReadoutLayouts, setDetectionReadoutLayouts] = useState<DetectionReadoutLayouts>(() => savedDetectionReadoutLayouts(configs));
  const [detectionReadoutCoordinateMode, setDetectionReadoutCoordinateMode] = useState<DetectionReadoutCoordinateMode>(() => savedDetectionReadoutCoordinateMode(configs));
  const [recognitionStatus, setRecognitionStatus] = useState<RecognitionStatus | null>(null);
  const recognitionBusyRef = useRef(false);
  const detectionRegionsRef = useRef(detectionRegions);
  const detectionRoiRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const detectionReadoutLayoutsRef = useRef(detectionReadoutLayouts);
  const detectionReadoutLayerRef = useRef<HTMLDivElement | null>(null);
  const detectionReadoutRefs = useRef<Record<keyof DetectionReadoutLayouts, HTMLElement | null>>({ health: null, powers: null });
  const [leftSlots, setLeftSlots] = useState<UnitState[]>(() => Array.from({ length: teamSlotCount }, blankUnit));
  const [rightSlots, setRightSlots] = useState<UnitState[]>(() => Array.from({ length: teamSlotCount }, blankUnit));
  const [leftIndex, setLeftIndex] = useState(0);
  const [rightIndex, setRightIndex] = useState(0);
  const [leftGroupName, setLeftGroupName] = useState("");
  const [petPicker, setPetPicker] = useState<{ side: "left" | "right"; index: number } | null>(null);
  const [leftAttacks, setLeftAttacks] = useState(true);
  const [leftOtherBonuses, setLeftOtherBonuses] = useState<TeamOtherBonuses>(blankTeamOtherBonuses);
  const [rightOtherBonuses, setRightOtherBonuses] = useState<TeamOtherBonuses>(blankTeamOtherBonuses);
  const [leftMarkFields, setLeftMarkFields] = useState<MarkField[]>([]);
  const [rightMarkFields, setRightMarkFields] = useState<MarkField[]>([]);
  const [results, setResults] = useState<BattleResult[]>([]);
  const [quickSkillResults, setQuickSkillResults] = useState<QuickSkillResult[] | null>(null);
  const [quickCalculationActive, setQuickCalculationActive] = useState(false);
  const quickSkillRequestRef = useRef(0);
  const [enemyAttackResults, setEnemyAttackResults] = useState<EnemyAttackSkillResponse | null>(null);
  const [enemyAttackInitialResults, setEnemyAttackInitialResults] = useState<EnemyAttackSkillResponse | null>(null);
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
  const [bonusToolPositions, setBonusToolPositions] = useState<BonusToolPositions>(() => savedBonusToolPositions(configs));
  const enemyAttackPayloadRef = useRef<EnemyAttackPayload | null>(null);
  const enemyAttackRequestRef = useRef(0);
  const [enemySkillPicker, setEnemySkillPicker] = useState(false);
  const [enemySkillData, setEnemySkillData] = useState<SkillListResult>({ petSkills: [], allSkills: [] });
  const [layoutMessage, setLayoutMessage] = useState("");
  const [targetHwnd, setTargetHwnd] = useState("");
  const [targetStatus, setTargetStatus] = useState("");
  const targetStatusTimerRef = useRef<number | undefined>(undefined);
  const calculateQuickSkillsRef = useRef<() => void>(() => undefined);
  const calculateEnemyAttackSkillsRef = useRef<() => void>(() => undefined);
  const hideQuickSkillResultsRef = useRef<() => void>(() => undefined);
  const alignTraitStacksRef = useRef<() => void>(() => undefined);
  const [targetAttached, setTargetAttached] = useState(false);
  const [mixedMode, setMixedMode] = useState(false);
  const mixedModeTokenRef = useRef(0);
  const [displayMode, setDisplayMode] = useState<"normal" | "plugin">(
    configs.team_layout?.display_mode === "normal" ? "normal" : "plugin",
  );
  const pluginVisibility = savedPluginVisibility(configs);
  const traitAlignmentSnapshotRef = useRef("");
  traitAlignmentSnapshotRef.current = JSON.stringify([leftIndex, rightIndex, leftSlots[leftIndex], rightSlots[rightIndex], leftOtherBonuses, rightOtherBonuses, weather, displayMode, targetAttached, targetHwnd, detectionRegions, detectionGroup]);
  const calibrationActive = displayMode === "plugin" && detectionGroup !== null;
  calibrationGroupRef.current = calibrationActive ? detectionGroup : null;
  const [openPopover, setOpenPopover] = useState<{ left: string | null; right: string | null }>({ left: null, right: null });
  // 运行态工具条默认收起，靠顶部把手召回（解绑窗口 / 天气 / 保存布局等无热键）。
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const activeBuffUnit = leftAttacks ? leftSlots[leftIndex] : rightSlots[rightIndex];
  const activeBuffSkillName = activeBuffUnit?.current_skill || activeBuffUnit?.skills?.[0] || "";

  useEffect(() => {
    quickSkillRequestRef.current += 1;
    setQuickSkillResults(null);
    setQuickCalculationActive(false);
  }, [rightIndex, rightSlots[rightIndex]]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 4500);
    return () => window.clearTimeout(timer);
  }, [error]);

  // 退出混合模式时收起运行态工具条。
  useEffect(() => {
    if (displayMode !== "plugin" || !mixedMode) setToolbarOpen(false);
  }, [displayMode, mixedMode]);

  useEffect(() => {
    detectionRegionsRef.current = detectionRegions;
  }, [detectionRegions]);

  useEffect(() => {
    detectionReadoutLayoutsRef.current = detectionReadoutLayouts;
  }, [detectionReadoutLayouts]);

  // 旧版识别结果框保存的是「右/下边距偏移」。首次进入新坐标层时，
  // 先读取它们当前的实际像素位置，再转换为稳定的左上角坐标。
  useLayoutEffect(() => {
    if (displayMode !== "plugin" || detectionReadoutCoordinateMode !== "viewport-offset") return;
    const layer = detectionReadoutLayerRef.current;
    const health = detectionReadoutRefs.current.health;
    const powers = detectionReadoutRefs.current.powers;
    if (!layer || !health || !powers) return;
    const layerBounds = layer.getBoundingClientRect();
    const healthBounds = health.getBoundingClientRect();
    const powersBounds = powers.getBoundingClientRect();
    if (layerBounds.width <= 0 || layerBounds.height <= 0 || healthBounds.width <= 0 || powersBounds.width <= 0) return;
    const next = {
      health: {
        x: Math.round(healthBounds.left - layerBounds.left),
        y: Math.round(healthBounds.top - layerBounds.top),
      },
      powers: {
        x: Math.round(powersBounds.left - layerBounds.left),
        y: Math.round(powersBounds.top - layerBounds.top),
      },
    };
    detectionReadoutLayoutsRef.current = next;
    setDetectionReadoutLayouts(next);
    setDetectionReadoutCoordinateMode("page");
  }, [displayMode, detectionReadoutCoordinateMode]);

  // 页面坐标是相对于结果框层的坐标。旧配置可能来自旧的 team-layout，
  // 其 y 值会落在当前窗口底部之外；首次加载时把它限制在当前可视区域内。
  useLayoutEffect(() => {
    if (displayMode !== "plugin" || detectionReadoutCoordinateMode !== "page") return;
    const layer = detectionReadoutLayerRef.current;
    const health = detectionReadoutRefs.current.health;
    const powers = detectionReadoutRefs.current.powers;
    if (!layer || !health || !powers) return;

    const layerBounds = layer.getBoundingClientRect();
    if (layerBounds.width <= 0 || layerBounds.height <= 0) return;
    const minX = 8;
    const minY = 8;
    const visibleRight = Math.max(layerBounds.left + minX, window.innerWidth - minX);
    const visibleBottom = Math.max(layerBounds.top + minY, window.innerHeight - minX);
    const clampReadout = (id: keyof DetectionReadoutLayouts, element: HTMLElement) => {
      const current = detectionReadoutLayouts[id];
      const bounds = element.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const maxX = Math.max(minX, visibleRight - layerBounds.left - width);
      const maxY = Math.max(minY, visibleBottom - layerBounds.top - height);
      return {
        x: Math.min(Math.max(minX, current.x), maxX),
        y: Math.min(Math.max(minY, current.y), maxY),
      };
    };
    const next = {
      health: clampReadout("health", health),
      powers: clampReadout("powers", powers),
    };
    if (next.health.x === detectionReadoutLayouts.health.x && next.health.y === detectionReadoutLayouts.health.y
      && next.powers.x === detectionReadoutLayouts.powers.x && next.powers.y === detectionReadoutLayouts.powers.y) return;
    detectionReadoutLayoutsRef.current = next;
    setDetectionReadoutLayouts(next);
  }, [displayMode, detectionReadoutCoordinateMode, targetAttached, detectionReadoutLayouts]);

  function moveRegion(id: TeamRegionId, position: Partial<TeamRegionPosition>) {
    setRegionPositions((current) => ({ ...current, [id]: { ...current[id], ...position } }));
  }

  function showTemporaryTargetStatus(message: string) {
    window.clearTimeout(targetStatusTimerRef.current);
    setTargetStatus(message);
    targetStatusTimerRef.current = window.setTimeout(() => setTargetStatus(""), 4500);
  }

  useEffect(() => () => window.clearTimeout(targetStatusTimerRef.current), []);

  function togglePopover(side: "left" | "right", id: string, next: boolean) {
    setOpenPopover((current) => ({ ...current, [side]: next ? id : current[side] === id ? null : current[side] }));
  }

  // 展开的浮层：Esc 或点击浮层与触发控件之外的任何位置都收起。
  useEffect(() => {
    if (!openPopover.left && !openPopover.right) return;
    const close = () => setOpenPopover({ left: null, right: null });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && traitSummaryAtPoint(target, event.clientX, event.clientY)) return;
      if (target?.closest(".trait-expanded-content, .team-buff-grid, .trait-summary-button, .team-buff-panel summary, .modal-backdrop")) return;
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [openPopover.left, openPopover.right]);

  function focusRegion(id: TeamRegionId) {
    setRegionPositions((current) => {
      const topZIndex = Math.max(...Object.values(current).map((item) => item.zIndex), 0) + 1;
      return { ...current, [id]: { ...current[id], zIndex: topZIndex } };
    });
  }

  function overlayLayout(id: string) {
    if (id === "speed-buffs" && !overlayLayouts[id] && !defaultOverlayLayoutsRef.current[id]) {
      // 速度增益默认贴在速度线面板正下方，与速度线保持明显间隔。
      const base = overlayLayouts["speed-line"]
        || defaultOverlayLayoutsRef.current["speed-line"]
        || (defaultOverlayLayoutsRef.current["speed-line"] = defaultPluginOverlayLayout("speed-line"));
      defaultOverlayLayoutsRef.current[id] = { x: base.x, y: base.y + base.height + 8, width: base.width, height: 96 };
    }
    const defaultLayout = defaultOverlayLayoutsRef.current[id] || (defaultOverlayLayoutsRef.current[id] = defaultPluginOverlayLayout(id));
    return overlayLayouts[id] || defaultLayout;
  }

  function updateOverlayLayout(id: string, partial: Partial<PluginOverlayLayout>, syncSkillSize = true) {
    setOverlayLayouts((current) => {
      const nextLayouts = { ...current };
      let changed = false;
      const applyTo = (targetId: string, patch: Partial<PluginOverlayLayout>) => {
        const previous = nextLayouts[targetId] || defaultOverlayLayoutsRef.current[targetId] || (defaultOverlayLayoutsRef.current[targetId] = defaultPluginOverlayLayout(targetId));
        const next = { ...previous, ...patch };
        if (
          previous.x === next.x && previous.y === next.y
          && previous.width === next.width && previous.height === next.height
          && previous.contentX === next.contentX && previous.contentY === next.contentY
        ) return;
        nextLayouts[targetId] = next;
        changed = true;
      };
      applyTo(id, partial);

      // 同一侧的四个技能框尺寸联动，宽度和高度一起跟随。
      const skillMatch = /^(left|right)-skill-(\d+)$/.exec(id);
      if (syncSkillSize && skillMatch && (partial.width !== undefined || partial.height !== undefined)) {
        const sync: Partial<PluginOverlayLayout> = {};
        if (partial.width !== undefined) sync.width = partial.width;
        if (partial.height !== undefined) sync.height = partial.height;
        for (let other = 0; other < pluginSkillCardCount; other += 1) {
          const otherId = `${skillMatch[1]}-skill-${other}`;
          if (otherId !== id) applyTo(otherId, sync);
        }
      }

      return changed ? nextLayouts : current;
    });
  }

  function sameFamily(first: Pet, second: Pet) {
    const firstForms = new Set([first.label, ...(first.evolutionChain || [])]);
    return [second.label, ...(second.evolutionChain || [])].some((form) => firstForms.has(form));
  }

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
    void invoke("record_recognition_timing", { message }).catch(() => undefined);
  }

  function invokeRecognitionTimed<T>(command: string, args: Record<string, unknown>, stage: string) {
    const started = performance.now();
    return invoke<T>(command, args).then((result) => {
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
    const captured = await invoke<{ regions: Record<string, string> }>("capture_overlay_target", {
      regions,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    const payloadChars = Object.values(captured.regions).reduce((total, value) => total + value.length, 0);
    logRecognitionTiming(`ROI capture command round-trip ${(performance.now() - captureStarted).toFixed(1)} ms; ${regions.length} regions; ${payloadChars} data URL chars`);
    return captured;
  }

  function cropDetection(capture: TargetCapture, key: string) {
    const imageDataUrl = capture.regions[key];
    if (!imageDataUrl) throw new Error(`截图没有包含识别区域：${key}`);
    return imageDataUrl;
  }

  async function recognizeNumericImages(images: Array<{ key: string; imageDataUrl: string; mode: NumericOcrMode }>) {
    const preprocessingStarted = performance.now();
    const preparedImages = await Promise.all(images.map(async (image) => ({
      ...image,
      imageDataUrl: await prepareNumericImage(image.imageDataUrl),
    })));
    logRecognitionTiming(`numeric image decode + resize/grayscale/PNG ${(performance.now() - preprocessingStarted).toFixed(1)} ms; images ${preparedImages.length}`);
    const inferencePromise = invokeRecognitionTimed<{ items: Array<{ text: string }> }>("recognize_images", { images: preparedImages }, `numeric inference (${preparedImages.length} images)`);
    const [, result] = await Promise.all([saveOcrDebugImages("numeric", preparedImages), inferencePromise]);
    return result;
  }

  async function saveOcrDebugImages(category: string, images: Array<{ key?: string; imageDataUrl: string }>) {
    if (!ocrTestMode) return;
    await invoke("save_ocr_debug_images", { category, images });
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
          const result = await invokeRecognitionTimed<{ items: Array<{ label: string }> }>("classify_image_samples", { payload: { images } }, "calibration classifier");
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

  function toggleCalibration(group: DetectionGroup) {
    if (!calibrationGroupRef.current && recognitionBusyRef.current) {
      setDetectionToast("正在识别，请等待完成后进入校对");
      return;
    }
    const next = detectionGroup === group ? null : group;
    calibrationSessionRef.current += 1;
    calibrationGroupRef.current = next;
    setDetectionGroup(next);
    setDetectionToast("");
    setDetectionMessage("");
    setCalibrationResults(next ? Object.fromEntries((next === "battleStart" ? BATTLE_START_IMAGE_KEYS : [...BATTLE_LIVE_IMAGE_KEYS, ...BATTLE_LIVE_HEALTH_KEYS, ...(["skill1", "skill2", "skill3", "skill4"] as const)]).map((key) => [key, { status: "pending", text: "等待测试" }])) : {});
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

  async function changePluginDensity(density: number) {
    const previous = pluginDensity;
    setPluginDensity(density);
    try {
      const result = await invoke<{ configs: PickerConfigs }>("save_picker_config", { payload: { section: "team_layout", values: { plugin_density: density } } });
      onConfigsChanged(result.configs);
    } catch (error) {
      setPluginDensity(previous);
      setError(asError(error));
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
          invokeRecognitionTimed<{ items: Array<{ label: string }> }>("classify_image_samples", { payload: { images } }, "battle-start classifier"),
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
              invokeRecognitionTimed<{ items: Array<{ label: string }> }>("classify_image_samples", { payload: { images } }, "battle-live classifier"),
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
        attacker: { ...leftSlots[leftIndex], other_bonuses: leftOtherBonuses },
        defender: { ...rightSlots[rightIndex], other_bonuses: rightOtherBonuses },
        weather,
        min_stacks: 0,
        max_stacks: 10,
      };
      const candidatesPromise = invokeRecognitionTimed<TraitPowerCandidates>("trait_power_candidates", { payload: candidatePayload }, "trait alignment candidate calculation (0-10)").then(
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
        const extended = await invokeRecognitionTimed<TraitPowerCandidates>("trait_power_candidates", {
          payload: { ...candidatePayload, min_stacks: 11, max_stacks: 99 },
        }, "trait alignment fallback candidate calculation (11-99)");
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
    const attacker = leftAttacks ? leftSlots[leftIndex] : rightSlots[rightIndex];
    const defender = leftAttacks ? rightSlots[rightIndex] : leftSlots[leftIndex];
    const otherBonuses = leftAttacks ? leftOtherBonuses : rightOtherBonuses;
    const defenderBonuses = leftAttacks ? rightOtherBonuses : leftOtherBonuses;
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
            attacker: { ...attacker, current_skill: skillName, skill_trigger_stacks: { ...attacker.skill_trigger_stacks, [skillName]: stacks }, other_bonuses: otherBonuses },
            defender: { ...defender, other_bonuses: defenderBonuses }, skills: [skillName], weather,
          } });
        }
      }
    }
    if (!trials.length) return false;
    const batch = await invokeRecognitionTimed<{ items: Array<{ items: QuickSkillResult[] }> }>("calculate_quick_skills_batch", { payload: { requests: trials.map((trial) => ({ ...trial.payload, powers_only: true })) } }, `power stack trial batch (${trials.length} trials)`);
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

  useEffect(() => {
    if (!detectionToast) return;
    const timer = window.setTimeout(() => setDetectionToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [detectionToast]);

  const detectionGestureRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => detectionGestureRef.current?.(), []);
  function startDetectionDrag(event: ReactPointerEvent<HTMLElement>, key: string) {
    if (!detectionGroup) return;
    const region = detectionRegions[key];
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    detectionGestureRef.current?.();
    detectionGestureRef.current = beginPluginLongPressDrag(event.nativeEvent, event.currentTarget, (dx, dy) => setDetectionRegions((current) => {
      const next = { ...current, [key]: { ...current[key], x: Math.max(0, Math.min(100 - region.width, region.x + dx / rect.width * 100)), y: Math.max(0, Math.min(100 - region.height, region.y + dy / rect.height * 100)) } };
      detectionRegionsRef.current = next;
      return next;
    }));
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
    if (event.button !== 0 || !event.isPrimary) return;
    detectionGestureRef.current?.();
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

  function detectionReadoutStyle(id: keyof DetectionReadoutLayouts): CSSProperties {
    const layout = detectionReadoutLayouts[id];
    if (detectionReadoutCoordinateMode === "page") {
      return { bottom: "auto", left: layout.x, right: "auto", top: layout.y, transform: "none" };
    }
    return id === "health"
      ? { transform: `translate(${layout.x}px, ${layout.y}px)` }
      : { transform: `translate(-50%, 0) translate(${layout.x}px, ${layout.y}px)` };
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

  const pluginDragStartRef = useRef<(event: PointerEvent, panel: HTMLElement) => (() => void) | undefined>(() => undefined);
  pluginDragStartRef.current = (event, panel) => {
    const localMove = pluginPanelMoves.get(panel);
    if (localMove) {
      const rect = panel.getBoundingClientRect();
      const parent = getComputedStyle(panel).position !== "fixed" && panel.offsetParent instanceof HTMLElement ? panel.offsetParent.getBoundingClientRect() : null;
      const start = { x: rect.left - (parent?.left || 0), y: rect.top - (parent?.top || 0) };
      return beginPluginLongPressDrag(event, panel, (dx, dy) => localMove({ x: Math.max(0, start.x + dx), y: Math.max(0, start.y + dy) }));
    }
    const readoutId = panel.dataset.pluginReadout as keyof DetectionReadoutLayouts | undefined;
    if (readoutId) {
      const start = detectionReadoutLayouts[readoutId];
      return beginPluginLongPressDrag(event, panel, (dx, dy) => setDetectionReadoutLayouts((current) => {
        const next = { ...current, [readoutId]: { x: start.x + dx, y: start.y + dy } };
        detectionReadoutLayoutsRef.current = next;
        return next;
      }));
    }
    const regionClasses: Array<[TeamRegionId, string]> = [
      ["left-roster", "team-left-roster"], ["right-roster", "team-right-roster"],
      ["left-bonus-tools", "team-left-bonus-toolbar"], ["right-bonus-tools", "team-right-bonus-toolbar"],
      ["left-buff", "team-left-buff"], ["right-buff", "team-right-buff"], ["weather", "team-weather"],
    ];
    const regionId = regionClasses.find(([, name]) => panel.classList.contains(name))?.[0];
    const overlayClass = [...panel.classList].find((name) => /^team-(left|right)-(trait|evolution|skill-\d+)$/.test(name));
    const overlayId = panel.dataset.pluginOverlayId || overlayClass?.replace("team-", "");
    const start = regionId ? regionPositions[regionId] : overlayId ? overlayLayout(overlayId) : undefined;
    if (!start) return;
    const bounds = panel.getBoundingClientRect();
    const workspace = panel.closest(".team-layout")?.getBoundingClientRect();
    return beginPluginLongPressDrag(event, panel, (dx, dy) => {
      let x = snapToGrid(start.x + dx);
      let y = snapToGrid(start.y + dy);
      if (regionId) {
        if (regionId === "left-buff" || regionId === "right-buff") {
          x = start.x + Math.min(Math.max(-bounds.left, dx), window.innerWidth - bounds.right);
          y = start.y + Math.min(Math.max(-bounds.top, dy), window.innerHeight - bounds.bottom);
        } else if (workspace) {
          const isBonusToolbar = regionId === "left-bonus-tools" || regionId === "right-bonus-tools";
          const minX = start.x + (isBonusToolbar ? 0 : workspace.left) - bounds.left;
          const maxX = start.x + (isBonusToolbar ? window.innerWidth : workspace.right) - bounds.right;
          const minY = start.y + workspace.top - bounds.top;
          const maxY = start.y + workspace.bottom - bounds.bottom;
          x = Math.min(Math.max(minX, x), Math.max(minX, maxX));
          y = Math.min(Math.max(minY, y), Math.max(minY, maxY));
        }
        moveRegion(regionId, { x, y });
      } else if (overlayId) {
        if (overlayId === "action") {
          x = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - panel.offsetWidth - 8));
          y = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - panel.offsetHeight));
        } else {
          x = Math.max(0, x);
          y = Math.max(0, y);
        }
        updateOverlayLayout(overlayId, { x, y }, false);
      }
    }, regionId ? () => focusRegion(regionId) : undefined);
  };

  useEffect(() => {
    if (displayMode !== "plugin") return;
    let cleanupGesture: (() => void) | undefined;
    const start = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      cleanupGesture?.();
      cleanupGesture = undefined;
      const path = event.composedPath();
      if (path.some((node) => node instanceof HTMLElement && node.matches(".modal-backdrop, .trait-expanded-content, .team-buff-grid, .slot-iv-popover, .plugin-resize-edge"))) return;
      const panel = path.find((node): node is HTMLElement => node instanceof HTMLElement && node.matches("[data-plugin-resizable]"));
      if (!panel) return;
      if (pluginResizeEdges(panel.getBoundingClientRect(), event.clientX, event.clientY)) return;
      cleanupGesture = pluginDragStartRef.current(event, panel);
    };
    document.addEventListener("pointerdown", start, true);
    return () => {
      document.removeEventListener("pointerdown", start, true);
      cleanupGesture?.();
    };
  }, [displayMode]);

  const resizeContextRef = useRef({ regionPositions, overlayLayouts, moveRegion, updateOverlayLayout, detectionReadoutCoordinateMode });
  resizeContextRef.current = { regionPositions, overlayLayouts, moveRegion, updateOverlayLayout, detectionReadoutCoordinateMode };
  useEffect(() => {
    if (displayMode !== "plugin") return;
    let cleanupResize: (() => void) | undefined;
    let cleanupResizeClick: (() => void) | undefined;
    const startResize = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      cleanupResize?.();
      cleanupResizeClick?.();
      const path = event.composedPath();
      if (path.some((node) => node instanceof HTMLElement && node.matches(".modal-backdrop, .trait-expanded-content, .team-buff-grid, .slot-iv-popover"))) return;
      const resizeEdge = path.find((node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains("plugin-resize-edge"));
      const panel = resizeEdge?.closest<HTMLElement>("[data-plugin-resizable]")
        || path.find((node): node is HTMLElement => node instanceof HTMLElement && node.matches("[data-plugin-resizable]"));
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const edges = pluginResizeEdges(rect, event.clientX, event.clientY);
      if (!edges) return;
      const { regionPositions, overlayLayouts, moveRegion, updateOverlayLayout, detectionReadoutCoordinateMode } = resizeContextRef.current;
      event.preventDefault();
      event.stopImmediatePropagation();
      try { panel.setPointerCapture(event.pointerId); } catch { return; }
      panel.dataset.pluginResizing = "true";
      let clickTimer: number | undefined;
      const clearResizeClick = () => {
        window.clearTimeout(clickTimer);
        document.removeEventListener("click", suppressResizeClick, true);
        if (cleanupResizeClick === clearResizeClick) cleanupResizeClick = undefined;
      };
      const suppressResizeClick = (click: MouseEvent) => {
        if (click.detail === 0 || !panel.contains(click.target as Node)) return;
        click.preventDefault();
        click.stopImmediatePropagation();
        clearResizeClick();
      };
      cleanupResizeClick = clearResizeClick;
      document.addEventListener("click", suppressResizeClick, true);
      const regionClasses: Array<[TeamRegionId, string]> = [
        ["left-roster", "team-left-roster"], ["right-roster", "team-right-roster"],
        ["left-bonus-tools", "team-left-bonus-toolbar"], ["right-bonus-tools", "team-right-bonus-toolbar"],
        ["left-buff", "team-left-buff"], ["right-buff", "team-right-buff"], ["weather", "team-weather"],
      ];
      const regionId = regionClasses.find(([, className]) => panel.classList.contains(className))?.[0];
      const explicitOverlayId = panel.dataset.pluginOverlayId;
      const overlayClass = [...panel.classList].find((className) => /^team-(left|right)-(trait|evolution|skill-\d+)$/.test(className));
      const overlayId = explicitOverlayId || overlayClass?.replace("team-", "");
      const currentLayout: PluginContentOffset | undefined = regionId
        ? regionPositions[regionId]
        : overlayId
          ? overlayLayouts[overlayId] || defaultPluginOverlayLayout(overlayId)
          : undefined;
      const panelStyle = getComputedStyle(panel);
      const parentRect = panel.offsetParent instanceof HTMLElement && panelStyle.position !== "fixed"
        ? panel.offsetParent.getBoundingClientRect()
        : null;
      const coordinateOffset = parentRect ? { x: parentRect.left, y: parentRect.top } : { x: 0, y: 0 };
      const start = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: rect.left - coordinateOffset.x,
        right: rect.right - coordinateOffset.x,
        top: rect.top - coordinateOffset.y,
        bottom: rect.bottom - coordinateOffset.y,
        contentX: currentLayout?.contentX ?? (Number.parseFloat(panelStyle.getPropertyValue("--plugin-content-x")) || 0),
        contentY: currentLayout?.contentY ?? (Number.parseFloat(panelStyle.getPropertyValue("--plugin-content-y")) || 0),
      };
      const readoutId = panel.dataset.pluginReadout as keyof DetectionReadoutLayouts | undefined;
      const readoutStart = readoutId ? detectionReadoutLayoutsRef.current[readoutId] : undefined;
      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== event.pointerId) return;
        moveEvent.preventDefault();
        const dx = moveEvent.clientX - start.pointerX;
        const dy = moveEvent.clientY - start.pointerY;
        let left = start.left;
        let right = start.right;
        let top = start.top;
        let bottom = start.bottom;
        if (edges.left) left = Math.min(start.right - 1, start.left + dx);
        if (edges.right) right = Math.max(start.left + 1, start.right + dx);
        if (edges.top) top = Math.min(start.bottom - 1, start.top + dy);
        if (edges.bottom) bottom = Math.max(start.top + 1, start.bottom + dy);
        const x = left;
        const y = top;
        const width = right - left;
        const height = bottom - top;
        const contentX = edges.left ? start.contentX - (left - start.left) : start.contentX;
        const contentY = edges.top ? start.contentY - (top - start.top) : start.contentY;
        if (regionId) moveRegion(regionId, { x, y, width, height, contentX, contentY });
        else if (overlayId) updateOverlayLayout(overlayId, { x, y, width, height, contentX, contentY });
        else {
          if (readoutId && readoutStart) {
            const anchored = detectionReadoutCoordinateMode !== "page";
            const next = { ...detectionReadoutLayoutsRef.current, [readoutId]: {
              x: readoutStart.x + left - start.left + (anchored ? (width - rect.width) * (readoutId === "health" ? 1 : 0.5) : 0),
              y: readoutStart.y + top - start.top + (anchored ? height - rect.height : 0),
            } };
            detectionReadoutLayoutsRef.current = next;
            setDetectionReadoutLayouts(next);
          } else pluginPanelMoves.get(panel)?.({ x, y });
          panel.style.width = `${width}px`;
          panel.style.height = `${height}px`;
          panel.style.setProperty("--plugin-content-x", `${contentX}px`);
          panel.style.setProperty("--plugin-content-y", `${contentY}px`);
        }
      };
      const stop = (end?: PointerEvent) => {
        if (end && end.pointerId !== event.pointerId) return;
        delete panel.dataset.pluginResizing;
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", stop, true);
        window.removeEventListener("pointercancel", stop, true);
        window.removeEventListener("blur", cancel);
        panel.removeEventListener("lostpointercapture", lostCapture);
        if (panel.hasPointerCapture(event.pointerId)) panel.releasePointerCapture(event.pointerId);
        if (end?.type === "pointerup") clickTimer = window.setTimeout(clearResizeClick, 500);
        else clearResizeClick();
        cleanupResize = undefined;
      };
      const cancel = () => stop();
      const lostCapture = (end: PointerEvent) => { if (end.target === panel) stop(end); };
      cleanupResize = cancel;
      window.addEventListener("pointermove", move, { passive: false, capture: true });
      window.addEventListener("pointerup", stop, true);
      window.addEventListener("pointercancel", stop, true);
      window.addEventListener("blur", cancel);
      panel.addEventListener("lostpointercapture", lostCapture);
    };
    document.addEventListener("pointerdown", startResize, true);
    return () => { document.removeEventListener("pointerdown", startResize, true); cleanupResize?.(); cleanupResizeClick?.(); };
  }, [displayMode]);

  async function changeDisplayMode(nextMode: "normal" | "plugin") {
    calibrationSessionRef.current += 1;
    calibrationGroupRef.current = null;
    setDetectionGroup(null);
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
        setBonusToolPositions(savedBonusToolPositions(data.configs));
        setDetectionReadoutLayouts(savedDetectionReadoutLayouts(data.configs));
        setDetectionReadoutCoordinateMode(savedDetectionReadoutCoordinateMode(data.configs));
      }
    } catch (err) {
      setError(asError(err));
    }
  }

  async function saveCurrentLayout() {
    setLayoutMessage("");
    try {
      const data = await invoke<{ configs: PickerConfigs }>("save_picker_config", {
        payload: {
          section: "team_layout",
          values: {
            regions: regionPositions,
            overlays: overlayLayouts,
            bonus_tool_positions: bonusToolPositions,
            detection_regions: detectionRegions,
            detection_readouts: { ...detectionReadoutLayouts, coordinate_space: "page" },
          },
        },
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
    if (displayMode === "plugin") {
      setRegionPositions(savedTeamRegionPositions(defaultConfigs, teamValues["team-region-width"], teamValues["team-region-height"]));
      setOverlayLayouts(savedPluginOverlayLayouts(defaultConfigs));
      setBonusToolPositions(savedBonusToolPositions(defaultConfigs));
      setDetectionRegions(savedDetectionRegions(defaultConfigs));
      setDetectionReadoutLayouts(savedDetectionReadoutLayouts(defaultConfigs));
      setDetectionReadoutCoordinateMode(savedDetectionReadoutCoordinateMode(defaultConfigs));
      setLayoutMessage("已恢复默认布局，点击保存后写入个人配置");
      return;
    }
    setRegionPositions(initialTeamRegionPositions(teamValues["team-region-width"], teamValues["team-region-height"]));
    setOverlayLayouts({});
    setBonusToolPositions({});
    setDetectionRegions(DEFAULT_DETECTION_REGIONS);
    setDetectionReadoutLayouts({ health: { x: 0, y: 0 }, powers: { x: 0, y: 0 } });
    setDetectionReadoutCoordinateMode("viewport-offset");
    setLayoutMessage("已恢复默认布局，点击保存后写入个人配置");
  }

  function resetBattle() {
    const group = presets.find((item) => item.name === leftGroupName);
    setLeftSlots(Array.from({ length: teamSlotCount }, (_, index) => group?.items[index] ? unitFromPreset(group.items[index], true) : blankUnit()));
    setRightSlots(Array.from({ length: teamSlotCount }, blankUnit));
    setLeftIndex(0);
    setRightIndex(0);
    setLeftAttacks(true);
    setLeftOtherBonuses(blankTeamOtherBonuses());
    setRightOtherBonuses(blankTeamOtherBonuses());
    setResults([]);
    setQuickSkillResults(null);
    setQuickCalculationActive(false);
    quickSkillRequestRef.current += 1;
    setEnemyAttackResults(null);
    enemyAttackRequestRef.current += 1;
    enemyAttackPayloadRef.current = null;
    setEnemyAttackInitialResults(null);
    setEnemySkillPicker(false);
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
      calibrationSessionRef.current += 1;
      calibrationGroupRef.current = null;
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
    calibrationSessionRef.current += 1;
    calibrationGroupRef.current = null;
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
    let pointerActive = false;
    const syncHitTarget = async () => {
      if (syncing) return;
      if (token !== mixedModeTokenRef.current) return;
      // Keep the overlay interactive for the whole drag. Otherwise moving a
      // panel changes the element under the cursor and the 80ms hit-test can
      // turn click-through on in the middle of the gesture.
      if (pointerActive) return;
      syncing = true;
      try {
        if (document.querySelector(".modal-backdrop[data-overlay-control]")) {
          if (lastIgnore !== false) {
            await invoke("update_overlay_click_through", { enabled: false });
            if (!cancelled && token === mixedModeTokenRef.current) lastIgnore = false;
          }
          return;
        }
        const currentWindow = getCurrentWindow();
        const [cursor, origin, scaleFactor] = await Promise.all([
          cursorPosition(),
          currentWindow.innerPosition(),
          currentWindow.scaleFactor(),
        ]);
        if (cancelled) return;
        const x = (cursor.x - origin.x) / scaleFactor;
        const y = (cursor.y - origin.y) / scaleFactor;
        const element = document.elementFromPoint(x, y);
        // A plugin panel is an interactive region as a whole: its headers,
        // empty space, drag handles, and controls must all receive events.
        const interactive = Boolean(element?.closest(
          "[data-overlay-control], button, input, select, textarea, summary, [role=button], [role=dialog], [contenteditable=true]",
        ));
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
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-overlay-control]")) pointerActive = true;
    };
    const onPointerEnd = () => {
      if (!pointerActive) return;
      pointerActive = false;
      void syncHitTarget();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerEnd, true);
    document.addEventListener("pointercancel", onPointerEnd, true);
    void syncHitTarget();
    const timer = window.setInterval(() => void syncHitTarget(), 80);
    return () => {
      cancelled = true;
      mixedModeTokenRef.current += 1;
      window.clearInterval(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerEnd, true);
      document.removeEventListener("pointercancel", onPointerEnd, true);
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
    if (target.closest("button, input, select, textarea, a, [role=button], .plugin-resize-edge")) return;
    // 展开浮层是面板的子节点，但在视觉上是独立层，不应触发面板拖动。
    if (target.closest(".trait-expanded-content, .team-buff-grid")) return;
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
    const workspaceBounds = workspace.getBoundingClientRect();
    const regionBounds = region.getBoundingClientRect();
    const isBonusToolbar = id === "left-bonus-tools" || id === "right-bonus-tools";
    const minX = start.x + (isBonusToolbar ? 0 : workspaceBounds.left) - regionBounds.left;
    const maxX = start.x + (isBonusToolbar ? window.innerWidth : workspaceBounds.right) - regionBounds.right;
    const minY = start.y + workspaceBounds.top - regionBounds.top;
    const maxY = start.y + workspaceBounds.bottom - regionBounds.bottom;
    const move = (moveEvent: PointerEvent) => {
      const nextX = snapToGrid(start.x + moveEvent.clientX - start.pointerX);
      const nextY = snapToGrid(start.y + moveEvent.clientY - start.pointerY);
      moveRegion(id, {
        x: Math.min(Math.max(minX, nextX), Math.max(minX, maxX)),
        y: Math.min(Math.max(minY, nextY), Math.max(minY, maxY)),
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
  const regionContentVars = (id: TeamRegionId, prefix: string) => ({
    [`--${prefix}-content-x`]: `${regionPositions[id].contentX || 0}px`,
    [`--${prefix}-content-y`]: `${regionPositions[id].contentY || 0}px`,
  });
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
    ...regionContentVars("left-roster", "left-roster"),
    ...regionContentVars("right-roster", "right-roster"),
    ...regionContentVars("left-bonus-tools", "left-bonus"),
    ...regionContentVars("right-bonus-tools", "right-bonus"),
    ...regionContentVars("left-buff", "left-buff"),
    ...regionContentVars("right-buff", "right-buff"),
    ...regionContentVars("left-skills", "left-skills"),
    ...regionContentVars("right-skills", "right-skills"),
    ...regionContentVars("weather", "weather"),
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
  }, [activeBuffSkillName]);

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
      setLeftGroupName(groupName);
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
    const request = ++quickSkillRequestRef.current;
    const attacker = leftAttacks ? leftSlots[leftIndex] : rightSlots[rightIndex];
    const defender = leftAttacks ? rightSlots[rightIndex] : leftSlots[leftIndex];
    const otherBonuses = leftAttacks ? leftOtherBonuses : rightOtherBonuses;
    const defenderOtherBonuses = leftAttacks ? rightOtherBonuses : leftOtherBonuses;
    const skills = uniqueByOrder(attacker.skills.filter(Boolean)).slice(0, teamSkillCardCount);
    if (!skills.length) {
      setQuickSkillResults(null);
      setQuickCalculationActive(false);
      return;
    }
    setQuickCalculationActive(true);
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
      if (request !== quickSkillRequestRef.current) return;
      setQuickSkillResults(data.items);
      setQuickCalculationActive(data.items.length > 0);
      setResults([]);
      setWillpower(null);
      setRequiredPower(null);
      setBattleContext(null);
    } catch (err) {
      if (request !== quickSkillRequestRef.current) return;
      setQuickSkillResults(null);
      setQuickCalculationActive(false);
      setError(asError(err));
    }
  }

  async function calculateEnemyAttackSkills(skillName?: string) {
    if (displayMode !== "plugin") return;
    const attacker = rightSlots[rightIndex];
    const defender = leftSlots[leftIndex];
    const payload = skillName ? enemyAttackPayloadRef.current : {
      attacker: { ...attacker, other_bonuses: rightOtherBonuses },
      defender: { ...defender, other_bonuses: leftOtherBonuses },
      target_hp: 0,
      weather,
    };
    if (!payload) return;
    const request = ++enemyAttackRequestRef.current;
    const pending: { health: ReturnType<typeof parseEnemyAttackHealth>; published: EnemyAttackSkillResponse | null } = { health: null, published: null };
    // OCR and damage trials start together. Late/failed OCR never blocks the result.
    void (async () => {
      if (!targetAttached || calibrationGroupRef.current) return;
      const capture = await targetCanvas();
      const response = await recognizeNumericImages([
        { key: "selfHealth", imageDataUrl: cropDetection(capture, "selfHealth"), mode: "self_health" },
        { key: "enemyHealth", imageDataUrl: cropDetection(capture, "enemyHealth"), mode: "enemy_health" },
      ]);
      if (request !== enemyAttackRequestRef.current) return;
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
      if (request === enemyAttackRequestRef.current) setDetectedHealth((current) => ({ ...current, self: "识别失败" }));
    });
    setError("");
    try {
      const data = await invoke<EnemyAttackSkillResponse>("calculate_enemy_attack_skills", {
        payload: { ...payload, skill_name: skillName },
      });
      if (request !== enemyAttackRequestRef.current) return;
      const published = { ...data, targetHp: pending.health?.current ?? null };
      pending.published = published;
      enemyAttackPayloadRef.current = payload;
      if (!skillName) setEnemyAttackInitialResults(published);
      setEnemyAttackResults(published);
      setQuickSkillResults(null);
      setQuickCalculationActive(false);
      quickSkillRequestRef.current += 1;
      setResults([]);
      setWillpower(null);
      setRequiredPower(null);
      setBattleContext(null);
    } catch (err) {
      if (request !== enemyAttackRequestRef.current) return;
      setEnemyAttackResults(null);
      setError(asError(err));
    }
  }

  async function openEnemySkillPicker() {
    const attacker = enemyAttackPayloadRef.current?.attacker;
    if (!attacker) return;
    try {
      const data = await cachedListSkills(attacker.mega_form || attacker.name);
      const damaging = (skill: SkillItem) => ["物攻", "魔攻"].includes(skill.detail?.type || skill.type || "");
      setEnemySkillData({ petSkills: data.petSkills.filter(damaging), allSkills: data.allSkills.filter(damaging) });
      setEnemySkillPicker(true);
    } catch (err) {
      setError(asError(err));
    }
  }

  calculateQuickSkillsRef.current = () => void calculateQuickSkills();
  calculateEnemyAttackSkillsRef.current = () => void calculateEnemyAttackSkills();
  alignTraitStacksRef.current = () => void alignTraitStacks();
  hideQuickSkillResultsRef.current = () => {
    setQuickSkillResults(null);
    setQuickCalculationActive(false);
    quickSkillRequestRef.current += 1;
    setEnemyAttackResults(null);
    enemyAttackRequestRef.current += 1;
    setEnemySkillPicker(false);
  };

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
    void listen("overlay-enemy-attack-calculate", () => calculateEnemyAttackSkillsRef.current())
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
    void listen("overlay-trait-align", () => alignTraitStacksRef.current())
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

  async function calculateWillpower(attackingSide?: "left" | "right") {
    setError("");
    try {
      const attackFromLeft = attackingSide ? attackingSide === "left" : leftAttacks;
      const attacker = attackFromLeft ? leftSlots[leftIndex] : rightSlots[rightIndex];
      const defender = attackFromLeft ? rightSlots[rightIndex] : leftSlots[leftIndex];
      const other_bonuses = attackFromLeft ? leftOtherBonuses : rightOtherBonuses;
      const defender_other_bonuses = attackFromLeft ? rightOtherBonuses : leftOtherBonuses;
      const data = await invoke<WillpowerResponse>("calculate_willpower", { payload: { attacker: { ...attacker, other_bonuses }, defender: { ...defender, other_bonuses: defender_other_bonuses }, weather, restrict_to_bloodline: attackFromLeft } });
      setBattleContext({ ...battleContextFromUnits(attacker, defender), skillName: "愿力", defenderFirst: !attackFromLeft });
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

  async function applyBuff(skillName?: string, reverse = false) {
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
      const appliedEffect = reverse ? { ...effect, value: -effect.value } : effect;
      if (effect.target === "self" || effect.target === "both") applyTo(attackerSide, appliedEffect);
      if (effect.target === "opponent" || effect.target === "both") applyTo(opponentSide, appliedEffect);
    });
    setLeftSlots(nextLeft);
    setRightSlots(nextRight);
  }

  const bonusesArmed = (bonuses: TeamOtherBonuses) =>
    bonuses.dedication_power_stacks > 0 ||
    bonuses.dedication_combo_stacks > 0 ||
    bonuses.charge_mark_stacks > 0 ||
    bonuses.charge_mark_triggered ||
    bonuses.attack_mark_stacks > 0 ||
    bonuses.momentum_mark_stacks > 0 ||
    bonuses.starfall_mark_stacks > 0 ||
    bonuses.burst_triggered_effect_ids.length > 0;

  const pluginUnattached = displayMode === "plugin" && !targetAttached;
  const pluginSkillCardCount = Math.max(DEFAULT_SKILL_CARD_COUNT, teamSkillCardCount);
  const leftPluginSkillSlots = skillCardSlots(leftSlots[leftIndex].skills, pluginSkillCardCount);
  const rightPluginSkillSlots = skillCardSlots(rightSlots[rightIndex].skills, pluginSkillCardCount);
  const [watchConfiguration, updateWatchConfiguration] = useWatchConfiguration(configs, onConfigsChanged, setError);

  return (
    <section
      className={`battle-page ${displayMode === "plugin" ? "plugin-mode immersive-mode" : "normal-mode"}${calibrationActive ? " calibration-active" : ""}${pluginUnattached ? " plugin-unattached" : ""}${mixedMode ? " mixed-active" : ""}${mixedMode && toolbarOpen ? " toolbar-open" : ""}`}
      data-plugin-hidden={Object.keys(pluginVisibility).filter((key) => !pluginVisibility[key]).join(" ")}
      style={displayMode === "plugin" ? pluginDensityStyle(configs, pluginDensity) : undefined}
    >
      {displayMode === "plugin" && mixedMode ? (
        <button
          className="overlay-toolbar-handle"
          data-overlay-control
          aria-expanded={toolbarOpen}
          title={toolbarOpen ? "收起工具条" : "展开工具条"}
          onClick={() => setToolbarOpen((current) => !current)}
        >
          {toolbarOpen ? "▲" : "▼"}
        </button>
      ) : null}
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
              <span>密度</span>
              <select value={pluginDensity} onChange={(event) => void changePluginDensity(Number(event.target.value))}>
                {PLUGIN_DENSITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <button className={detectionGroup === "battleStart" ? "active" : ""} onClick={() => toggleCalibration("battleStart")}>战斗开始框</button>
            <button className={detectionGroup === "battleLive" ? "active" : ""} onClick={() => toggleCalibration("battleLive")}>战斗内框</button>
            <button onClick={() => void recognizeDetection("battleStart")} disabled={!targetAttached}>开始识别 Ctrl+B</button>
            <button onClick={() => void recognizeDetection("battleLive")} disabled={!targetAttached}>战斗识别 Ctrl+U</button>
            <button onClick={() => void recognizeSkillPowers()} disabled={!targetAttached}>威力识别 Ctrl+P</button>
            <button onClick={() => void calculateEnemyAttackSkills()}>敌方攻击 Ctrl+K</button>
          </div>
        </details> : null}
        {targetStatus || layoutMessage || detectionMessage ? <span>{targetStatus || layoutMessage || detectionMessage}</span> : null}
      </div>
      <div className="team-layout" style={teamLayoutStyle} onPointerDown={startTeamRegionDrag}>
        {displayMode === "plugin" && recognitionStatus ? <section className="recognition-status-panel" data-overlay-control data-plugin-resizable data-plugin-overlay-id="recognition-status" style={{ left: overlayLayout("recognition-status").x, top: overlayLayout("recognition-status").y, width: overlayLayouts["recognition-status"]?.width, height: overlayLayouts["recognition-status"]?.height }} onPointerDown={startRecognitionStatusDrag} role="status" aria-live="polite">
          <PluginResizeEdges />
          <strong>{recognitionStatus.label}</strong>
          <span>{recognitionStatus.detail}</span>
          <small>{recognitionStatus.progress}</small>
        </section> : null}
        {displayMode === "plugin" ? <div ref={detectionReadoutLayerRef} className="plugin-readout-layer" data-overlay-control>
          <section ref={(element) => { detectionReadoutRefs.current.health = element; }} className="battle-health-readout draggable-readout" data-overlay-control data-plugin-resizable data-plugin-readout="health" style={detectionReadoutStyle("health")} onPointerDown={(event) => startReadoutDrag(event, "health")}><PluginResizeEdges /><span>我方 HP {detectedHealth.self}</span><span>敌方 HP {detectedHealth.enemy}</span></section>
          <section ref={(element) => { detectionReadoutRefs.current.powers = element; }} className="battle-power-readout draggable-readout" data-overlay-control data-plugin-resizable data-plugin-readout="powers" style={detectionReadoutStyle("powers")} onPointerDown={(event) => startReadoutDrag(event, "powers")}><PluginResizeEdges />{detectedSkillPowers.map((power, index) => <span key={index}>技能{index + 1} {power}</span>)}</section>
        </div> : null}
        {displayMode === "plugin" && detectionToast ? <div className="detection-toast" role="status">{detectionToast}</div> : null}
        {calibrationActive ? <section className="calibration-results" data-overlay-control aria-live="polite">
          <header><strong>{detectionGroup === "battleStart" ? "战斗开始校对" : "战斗内校对"}</strong><button onClick={() => toggleCalibration(detectionGroup!)}>退出校对</button></header>
          <p>{detectionGroup === "battleStart" ? "Ctrl+B 测试精灵框" : "Ctrl+U 测试精灵和血量 · Ctrl+P 测试技能威力"}</p>
          <p>成功 {Object.values(calibrationResults).filter((item) => item.status === "success").length}/{Object.keys(calibrationResults).length} · 失败 {Object.values(calibrationResults).filter((item) => item.status === "failure").length}</p>
          <div className="calibration-result-grid">
            {Object.entries(calibrationResults).map(([key, item]) => <div key={key} className={`calibration-result ${item.status}`}><strong>{detectionLabel(key)}</strong><span>{item.status === "failure" ? `失败：${item.text}` : item.text}</span></div>)}
          </div>
        </section> : null}
        {displayMode === "plugin" ? <div className={`detection-calibration ${detectionGroup || "hidden"}`} data-overlay-control>
          {[...BATTLE_START_IMAGE_KEYS, ...BATTLE_LIVE_IMAGE_KEYS, ...BATTLE_LIVE_NUMBER_KEYS].map((key) => {
            const region = detectionRegions[key];
            const visible = (detectionGroup === "battleStart" && BATTLE_START_IMAGE_KEYS.includes(key as typeof BATTLE_START_IMAGE_KEYS[number])) || (detectionGroup === "battleLive" && !BATTLE_START_IMAGE_KEYS.includes(key as typeof BATTLE_START_IMAGE_KEYS[number]));
            return <button key={key} ref={(element) => { detectionRoiRefs.current[key] = element; }} className={`detection-roi ${key.includes("Image") ? "image" : "number"}${visible ? "" : " hidden"}`} style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }} onPointerDown={(event) => startDetectionPointer(event, key)} title={`长按中心移动 ${detectionLabel(key)}；拖动边缘缩放`}><span>{detectionLabel(key)}</span></button>;
          })}
        </div> : null}
        <Roster selectedGroup={leftGroupName} panelState={panelState(leftSlots.some((slot) => Boolean(slot.name)))} pluginMode={displayMode === "plugin"} className="team-left-roster" title="队伍" presets={presets} pets={pets} elements={elements} configs={configs} slots={leftSlots} activeIndex={leftIndex} onConfigsChanged={onConfigsChanged} onImportGroup={(groupName) => importGroup("left", groupName)} onSelect={setLeftIndex} onPatchSlot={(partial) => patchSlot("left", leftIndex, partial)} onPatchSlotAt={(index, partial) => patchSlot("left", index, partial)} onChoose={(index) => { setLeftIndex(index); setPetPicker({ side: "left", index }); }} />
        <Roster panelState={panelState(rightSlots.some((slot) => Boolean(slot.name)))} pluginMode={displayMode === "plugin"} className="team-right-roster" title="队伍" presets={presets} pets={pets} elements={elements} configs={configs} slots={rightSlots} activeIndex={rightIndex} onConfigsChanged={onConfigsChanged} onImportGroup={(groupName) => importGroup("right", groupName)} onSelect={setRightIndex} onPatchSlot={(partial) => patchSlot("right", rightIndex, partial)} onPatchSlotAt={(index, partial) => patchSlot("right", index, partial)} onChoose={(index) => { setRightIndex(index); setPetPicker({ side: "right", index }); }} />
        {displayMode === "plugin" ? <>
          <SpeedLine
            left={leftSlots[leftIndex]}
            right={rightSlots[rightIndex]}
            pets={pets}
            weather={weather}
            layout={overlayLayout("speed-line")}
            buffLayout={overlayLayout("speed-buffs")}
            onLayoutChange={(partial) => updateOverlayLayout("speed-line", partial)}
            onBuffLayoutChange={(partial) => updateOverlayLayout("speed-buffs", partial)}
            onChangeLeft={(partial) => patchSlot("left", leftIndex, partial)}
            onChangeRight={(partial) => patchSlot("right", rightIndex, partial)}
          />
          <FloatingTeamPanel panelState={panelState(leftSlots[leftIndex]?.trait_triggered || leftSlots[leftIndex]?.trait_stacks > 0)} className="trait-floating-panel team-left-trait" layout={overlayLayout("left-trait")} onLayoutChange={(partial) => updateOverlayLayout("left-trait", partial)}><TeamTraitEditor expanded={openPopover.left === "trait"} onExpandedChange={(next) => togglePopover("left", "trait", next)} value={leftSlots[leftIndex]} pets={pets} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onChange={(partial) => patchSlot("left", leftIndex, partial)} /></FloatingTeamPanel>
          <FloatingTeamPanel panelState={panelState(rightSlots[rightIndex]?.trait_triggered || rightSlots[rightIndex]?.trait_stacks > 0)} className="trait-floating-panel team-right-trait" layout={overlayLayout("right-trait")} onLayoutChange={(partial) => updateOverlayLayout("right-trait", partial)}><TeamTraitEditor expanded={openPopover.right === "trait"} onExpandedChange={(next) => togglePopover("right", "trait", next)} value={rightSlots[rightIndex]} pets={pets} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onChange={(partial) => patchSlot("right", rightIndex, partial)} /></FloatingTeamPanel>
          <FloatingTeamPanel panelState={panelState(leftSlots[leftIndex]?.devolution > 0 || Boolean(leftSlots[leftIndex]?.mega || leftSlots[leftIndex]?.mega_form))} className="team-left-evolution" layout={overlayLayout("left-evolution")} onLayoutChange={(partial) => updateOverlayLayout("left-evolution", partial)}><TeamEvolutionControls pluginMode value={leftSlots[leftIndex]} pets={pets} onChange={(partial) => patchSlot("left", leftIndex, partial)} /></FloatingTeamPanel>
          <FloatingTeamPanel panelState={panelState(rightSlots[rightIndex]?.devolution > 0 || Boolean(rightSlots[rightIndex]?.mega || rightSlots[rightIndex]?.mega_form))} className="team-right-evolution" layout={overlayLayout("right-evolution")} onLayoutChange={(partial) => updateOverlayLayout("right-evolution", partial)}><TeamEvolutionControls pluginMode value={rightSlots[rightIndex]} pets={pets} onChange={(partial) => patchSlot("right", rightIndex, partial)} /></FloatingTeamPanel>
        </> : null}
        <section className="team-bonus-toolbar team-left-bonus-toolbar" data-panel-state={panelState(bonusesArmed(leftOtherBonuses))} data-overlay-control data-plugin-resizable={displayMode === "plugin" || undefined} aria-label="己方其他加成">
          {displayMode === "plugin" ? <PluginResizeEdges /> : null}
          <button className="bonus-tool-button willpower" onClick={() => void calculateWillpower(displayMode === "plugin" ? "left" : undefined)}>愿力</button>
          {(["dedication", "marks", "thunderstorm"] as const).map((tool) => (
            <button key={tool} className={`bonus-tool-button ${tool}${bonusTool === tool && bonusSide === "left" ? " active" : ""}`} aria-pressed={bonusTool === tool && bonusSide === "left"} onClick={() => openBonusTool("left", tool)}>
              {{ dedication: "奉献", marks: "印记", thunderstorm: "雷暴" }[tool]}
            </button>
          ))}
        </section>
        <section className="team-bonus-toolbar team-right-bonus-toolbar" data-panel-state={panelState(bonusesArmed(rightOtherBonuses))} data-overlay-control data-plugin-resizable={displayMode === "plugin" || undefined} aria-label="敌方其他加成">
          {displayMode === "plugin" ? <PluginResizeEdges /> : null}
          <button className="bonus-tool-button willpower" onClick={() => void calculateWillpower(displayMode === "plugin" ? "right" : undefined)}>愿力</button>
          {(["dedication", "marks", "thunderstorm"] as const).map((tool) => (
            <button key={tool} className={`bonus-tool-button ${tool}${bonusTool === tool && bonusSide === "right" ? " active" : ""}`} aria-pressed={bonusTool === tool && bonusSide === "right"} onClick={() => openBonusTool("right", tool)}>
              {{ dedication: "奉献", marks: "印记", thunderstorm: "雷暴" }[tool]}
            </button>
          ))}
        </section>
        <TeamBuffPanel className="team-left-buff" title={displayMode === "plugin" ? "buff" : "己方 buff"} expanded={displayMode === "plugin" ? openPopover.left === "buff" : undefined} onExpandedChange={(next) => togglePopover("left", "buff", next)} onMove={(delta) => moveRegion("left-buff", { x: regionPositions["left-buff"].x + delta.x, y: regionPositions["left-buff"].y + delta.y })} value={leftSlots[leftIndex]} onChange={(partial) => patchSlot("left", leftIndex, partial)} />
        <TeamBuffPanel className="team-right-buff" title={displayMode === "plugin" ? "buff" : "敌方 buff"} expanded={displayMode === "plugin" ? openPopover.right === "buff" : undefined} onExpandedChange={(next) => togglePopover("right", "buff", next)} onMove={(delta) => moveRegion("right-buff", { x: regionPositions["right-buff"].x + delta.x, y: regionPositions["right-buff"].y + delta.y })} value={rightSlots[rightIndex]} onChange={(partial) => patchSlot("right", rightIndex, partial)} />
        {displayMode === "plugin" ? <>
          {Array.from({ length: pluginSkillCardCount }, (_, skillIndex) => (
            <TeamSkillCards key={`left-skill-${skillIndex}`} panelState={panelState(Boolean(leftPluginSkillSlots[skillIndex]))} pluginMode className={`team-left-skill-${skillIndex}`} title={`技能 ${skillIndex + 1}`} cardCount={pluginSkillCardCount} onlyIndex={skillIndex} floating layout={overlayLayout(`left-skill-${skillIndex}`)} onLayoutChange={(partial) => updateOverlayLayout(`left-skill-${skillIndex}`, partial, false)} value={leftSlots[leftIndex]} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onApplySkill={leftAttacks ? (skill) => void applyBuff(skill) : undefined} quickResult={leftAttacks ? quickSkillResults?.find((item) => item.skillName === leftPluginSkillSlots[skillIndex]) || null : null} onChange={(partial) => patchSlot("left", leftIndex, partial)} />
          ))}
          <EnemyWatchSkillsPanel
            key="right-watch"
            layout={overlayLayout("right-watch")}
            onLayoutChange={(partial) => updateOverlayLayout("right-watch", partial)}
            configuration={watchConfiguration}
            onConfigurationChange={updateWatchConfiguration}
            self={leftSlots[leftIndex]}
            enemy={rightSlots[rightIndex]}
          />
        </> : <>
          <TeamSkillCards className="team-left-skills" title="己方技能卡片" cardCount={teamSkillCardCount} value={leftSlots[leftIndex]} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onApplySkill={leftAttacks ? (skill) => void applyBuff(skill) : undefined} onChange={(partial) => patchSlot("left", leftIndex, partial)} />
          <TeamSkillCards className="team-right-skills" title="敌方技能卡片" cardCount={teamSkillCardCount} value={rightSlots[rightIndex]} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onApplySkill={!leftAttacks ? (skill) => void applyBuff(skill) : undefined} onChange={(partial) => patchSlot("right", rightIndex, partial)} />
        </>}
        {displayMode === "plugin" ? <section className="weather-panel team-weather" data-panel-state={panelState(weather !== "none")} data-overlay-control data-plugin-resizable aria-label="天气">
          <PluginResizeEdges />
          <label>
            <select aria-label="天气" value={weather} onChange={(event) => onWeatherChange(event.target.value as (typeof WEATHER_OPTIONS)[number]["value"])}>
              {WEATHER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.value === "none" ? "无天气" : option.label}</option>)}
            </select>
          </label>
        </section> : null}
        <TeamActionPanel pluginMode={displayMode === "plugin"} visibility={pluginVisibility} layout={displayMode === "plugin" ? overlayLayout("action") : undefined} onLayoutChange={(partial) => updateOverlayLayout("action", partial)} leftAttacks={leftAttacks} onToggleDirection={() => setLeftAttacks((value) => !value)} onCalculate={() => void calculate()} onRecognizeBattleLive={() => void recognizeDetection("battleLive")} onRecognizeBattleStart={() => void recognizeDetection("battleStart")} onToggleQuickCalculate={() => quickCalculationActive ? hideQuickSkillResultsRef.current() : calculateQuickSkillsRef.current()} quickCalculationActive={quickCalculationActive} onRecognizeSkillPowers={() => void recognizeSkillPowers()} onCalculateEnemyAttack={() => calculateEnemyAttackSkillsRef.current()} onAlignTraitStacks={() => alignTraitStacksRef.current()} onApplyBuff={() => void applyBuff()} onReverseBuff={() => void applyBuff(undefined, true)} onResetBattle={resetBattle} targetHp={targetHp} onTargetHpChange={setTargetHp} onCalculateRequiredPower={() => void calculateRequiredPower()} buffOptions={buffOptions} selectedBuffOption={selectedBuffOption} onSelectBuffOption={setSelectedBuffOption} />
        {bonusTool ? (
          <BattleBonusToolPanel
            key={`${bonusSide}-${bonusTool}`}
            tool={bonusTool}
            pluginMode={displayMode === "plugin"}
            side={bonusSide}
            position={bonusToolPositions[`${bonusSide}-${bonusTool}`] || { x: Math.max(8, window.innerWidth - 348), y: 84 }}
            onPositionChange={(position) => setBonusToolPositions((current) => ({ ...current, [`${bonusSide}-${bonusTool}`]: position }))}
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
        {enemyAttackResults ? <EnemyAttackSkillPanel value={enemyAttackResults} onBack={enemyAttackInitialResults && enemyAttackResults !== enemyAttackInitialResults ? () => setEnemyAttackResults(enemyAttackInitialResults) : undefined} onPickSkill={() => void openEnemySkillPicker()} onClose={() => { enemyAttackRequestRef.current += 1; setEnemyAttackResults(null); setEnemySkillPicker(false); }} /> : null}
      </div>
      {enemySkillPicker ? (
        <PickerModal
          mode="skill" pets={[]} elements={elements} petSkills={enemySkillData.petSkills} allSkills={enemySkillData.allSkills}
          traits={[]} configs={configs} onConfigsChanged={onConfigsChanged}
          onClose={() => setEnemySkillPicker(false)} onPickPet={() => undefined} onPickTrait={() => undefined}
          onPickSkill={(skill) => { setEnemySkillPicker(false); void calculateEnemyAttackSkills(skill.name); }}
        />
      ) : null}
      {petPicker ? (
        <PickerModal
          mode="pet"
          preferredGroup={petPicker.side === "left" ? "attackers" : "defenders"}
          initialPetName={(petPicker.side === "left" ? leftSlots : rightSlots)[petPicker.index].name}
          useSavedPetFilters={displayMode === "plugin"}
          presets={presets}
          pets={pets}
          elements={elements}
          petSkills={[]}
          allSkills={[]}
          traits={[]}
          configs={configs}
          onConfigsChanged={onConfigsChanged}
          onClose={() => setPetPicker(null)}
          onClearPet={() => {
            setSlot(petPicker.side, petPicker.index, blankUnit());
            setPetPicker(null);
          }}
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
  const [selectedKey, setSelectedKey] = useState("");
  const [presetName, setPresetName] = useState("");
  const [newPresetHint, setNewPresetHint] = useState(false);
  const presetNameInputRef = useRef<HTMLInputElement | null>(null);
  const [editor, setEditor] = useState<UnitState>(blankUnit());
  const [picker, setPicker] = useState<"pet" | null>(null);
  const [skillPickerIndex, setSkillPickerIndex] = useState<number | null>(null);
  const [watchSettingsOpen, setWatchSettingsOpen] = useState(false);
  const [skillData, setSkillData] = useState<SkillListResult>({ petSkills: [], allSkills: [] });
  const [skillDataPetName, setSkillDataPetName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeText, setCodeText] = useState("");
  const [codeGroupName, setCodeGroupName] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMessage, setCodeMessage] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeReport, setCodeReport] = useState<string[]>([]);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<PresetGroup | null>(null);
  const [deleteGroupBusy, setDeleteGroupBusy] = useState(false);

  const currentGroup = presets.find((group) => group.name === groupName) || presets[0];
  const selectedPreset = currentGroup?.items.find((item) => item.key === selectedKey) || null;
  const initialGroupSelectedRef = useRef(false);
  const petLookup = useMemo(() => buildPetLookup(pets), [pets]);

  useEffect(() => {
    if (initialGroupSelectedRef.current) return;
    initialGroupSelectedRef.current = true;
    const firstPreset = currentGroup?.items[0];
    if (firstPreset) selectPreset(firstPreset);
    else newPreset();
  }, [currentGroup]);

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
    let cancelled = false;
    void cachedListSkills(editor.name).then((data) => {
      if (cancelled) return;
      setSkillData(data);
      setSkillDataPetName(editor.name);
    }).catch(() => {
      if (!cancelled) { setSkillData({ petSkills: [], allSkills: [] }); setSkillDataPetName(editor.name); }
    });
    return () => { cancelled = true; };
  }, [editor.name, skillPickerIndex]);

  function defaultBloodlineForPet(name: string) {
    const element = petLookup.get(name)?.elements[0];
    return element ? `${element.replace(/系$/, "")}系血脉` : "";
  }

  function patchEditor(partial: Partial<UnitState>) {
    setEditor((value) => ({
      ...value,
      ...partial,
      ...(partial.name !== undefined && partial.name !== value.name && partial.bloodline === undefined
        ? { bloodline: defaultBloodlineForPet(partial.name) }
        : {}),
    }));
  }

  function selectPreset(preset: PresetItem) {
    setNewPresetHint(false);
    setSelectedKey(preset.key);
    setPresetName(preset.key);
    const unit = unitFromPreset(preset);
    setEditor({ ...unit, bloodline: unit.bloodline || defaultBloodlineForPet(unit.name) });
    setMessage("");
    setError("");
  }

  function newPreset() {
    setNewPresetHint(false);
    setSelectedKey("");
    setPresetName("");
    setEditor(blankUnit());
    setMessage("");
    setError("");
  }

  function selectGroup(name: string) {
    setGroupName(name);
    const firstPreset = presets.find((group) => group.name === name)?.items[0];
    if (firstPreset) selectPreset(firstPreset);
    else newPreset();
  }

  function setSkillAt(index: number, skillName: string) {
    const next = skillCardSlots(editor.skills, Math.max(DEFAULT_SKILL_CARD_COUNT, editor.skills.length));
    next[index] = skillName;
    patchEditor({ skills: next, current_skill: skillName });
  }

  function clearSkillAt(index: number) {
    const next = skillCardSlots(editor.skills, Math.max(DEFAULT_SKILL_CARD_COUNT, editor.skills.length));
    const removed = next[index];
    next[index] = "";
    patchEditor({ skills: next, current_skill: editor.current_skill === removed ? next.find(Boolean) || "" : editor.current_skill });
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
    const name = codeGroupName.trim();
    if (!name) {
      setCodeError("分组名不能为空");
      return;
    }
    setCodeBusy(true);
    setCodeError("");
    setCodeMessage("");
    setCodeReport([]);
    setError("");
    try {
      const data = await invoke<PresetManagerResult>("manage_preset", { payload: { action: "create_group", groupName: name } });
      onPresetsChanged(data.presets);
      if (data.groupName) {
        setGroupName(data.groupName);
        setTargetGroup(data.groupName);
      }
      setSelectedKey(data.presetName || "");
      setMessage(`已创建分组：${name}`);
      setCodeMessage(`已创建分组：${name}`);
    } catch (err) {
      setCodeError(asError(err));
    } finally {
      setCodeBusy(false);
    }
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
      setNewPresetHint(false);
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

  async function deleteGroup() {
    if (!deleteGroupConfirm || deleteGroupBusy) return;
    setError("");
    setDeleteGroupBusy(true);
    try {
      const data = await invoke<PresetManagerResult>("manage_preset", {
        payload: { action: "delete_group", groupName: deleteGroupConfirm.name },
      });
      onPresetsChanged(data.presets);
      setGroupName(data.groupName || "");
      setTargetGroup(data.groupName || "");
      newPreset();
      setMessage(`已删除分组：${deleteGroupConfirm.name}`);
      setDeleteGroupConfirm(null);
    } catch (err) {
      setError(asError(err));
    } finally {
      setDeleteGroupBusy(false);
    }
  }

  function openCreateGroup() {
    setCodeOpen(true);
    setCodeMessage("");
    setCodeError("");
    setCodeReport([]);
  }

  async function importTeamCode(mode: "overwrite" | "create") {
    const target = mode === "create" ? codeGroupName.trim() : groupName;
    if (!codeText.trim()) {
      setCodeError("请先粘贴阵容码");
      return;
    }
    if (!target) {
      setCodeError("请先填写新分组名");
      return;
    }
    if (mode === "overwrite") {
      const count = presets.find((group) => group.name === groupName)?.items.length || 0;
      if (!window.confirm(`将用导入的精灵替换分组“${groupName}”现有的 ${count} 个预设，是否继续？`)) return;
    } else if (presets.some((group) => group.name === target)) {
      if (!window.confirm(`分组“${target}”已存在，导入会替换它的内容，是否继续？`)) return;
    }
    setCodeBusy(true);
    setCodeError("");
    setCodeMessage("");
    setCodeReport([]);
    try {
      const data = await invoke<{ presets: PresetGroup[]; groupName: string; report: string[] }>("import_team_code", {
        payload: { text: codeText, mode, groupName: target },
      });
      onPresetsChanged(data.presets);
      setGroupName(data.groupName);
      setTargetGroup(data.groupName);
      setSelectedKey("");
      setPresetName("");
      setEditor(blankUnit());
      setNewPresetHint(false);
      setMessage(`已导入到分组：${data.groupName}`);
      setCodeMessage(`已导入到分组：${data.groupName}`);
      setCodeReport(data.report || []);
    } catch (err) {
      setCodeError(asError(err));
    } finally {
      setCodeBusy(false);
    }
  }

  const skillCards = skillCardSlots(editor.skills).map((name) => (name ? { name } : null));

  return (
    <section className="preset-manager-page">
      <aside className="preset-library-panel">
        <header className="preset-manager-header">
          <h2 className="preset-library-title">分组</h2>
          <select aria-label="分组" className="preset-group-control" value={currentGroup?.name || ""} onChange={(event) => selectGroup(event.target.value)}>
            {presets.map((group) => (
              <option key={group.name} value={group.name}>{group.name}</option>
            ))}
          </select>
        </header>
        <div className="preset-create-row">
          <button className="compact-button preset-new-button" onClick={() => {
            newPreset();
            setNewPresetHint(true);
            presetNameInputRef.current?.focus();
          }}>新建预设</button>
          <button className="preset-create-button" onClick={openCreateGroup}>创建分组</button>
          <button className="compact-button preset-watch-button" onClick={() => setWatchSettingsOpen(true)}>醒目技能</button>
          <button className="compact-button preset-delete-group-button" disabled={!currentGroup} onClick={() => { setError(""); setDeleteGroupConfirm(currentGroup || null); }}>删除当前分组</button>
        </div>
        <div className="preset-list">
          {(currentGroup?.items || []).map((preset) => (
            <button key={preset.key} className={preset.key === selectedKey ? "preset-list-item preset-list-control active" : "preset-list-item preset-list-control"} onClick={() => selectPreset(preset)}>
              <strong className="preset-card-name" title={preset.key}>{preset.key}</strong>
              <span className="preset-card-body">
                <span className="preset-card-pet">
                  <EntityLabel kind="pet" value={`${preset.id}${preset.name}`} iconOnly>{preset.name}</EntityLabel>
                </span>
                <span className="preset-card-skills">
                  {skillCardSlots(preset.skills || [], DEFAULT_SKILL_CARD_COUNT).map((name, index) => (
                    <span className="preset-card-skill" key={index} title={name || `空技能${index + 1}`}>
                      {name ? <EntityLabel kind="skill" value={name} /> : `空技能${index + 1}`}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <section className="preset-editor-panel">
        <header className="preset-manager-header preset-editor-header">
          <h2 className="preset-settings-title">精灵预设</h2>
          <input ref={presetNameInputRef} aria-label="预设名" className={`preset-name-input${newPresetHint ? " is-new-preset" : ""}`} value={presetName} onChange={(event) => { setPresetName(event.target.value); setNewPresetHint(false); }} placeholder={newPresetHint ? "新键预设" : "留空则使用精灵名"} />
          <div className="header-actions">
            <button className="compact-button preset-save-button" onClick={() => void savePreset()}>保存预设</button>
            <button className="compact-button preset-delete-button" disabled={!selectedPreset} onClick={() => void deletePreset()}>删除</button>
          </div>
        </header>
        <section className="preset-editor-section preset-transfer-section">
          <FieldLabel className="preset-transfer-label"><span className="ui-field-title preset-section-title">目标分组</span></FieldLabel>
          <select className="preset-transfer-select" value={targetGroup} onChange={(event) => setTargetGroup(event.target.value)}>
            {presets.map((group) => (
              <option key={group.name} value={group.name}>{group.name}</option>
            ))}
          </select>
          <button className="preset-copy-button" disabled={!selectedPreset} onClick={() => void copyPreset()}>复制</button>
          <button className="preset-move-button" disabled={!selectedPreset} onClick={() => void movePreset()}>移动</button>
        </section>
        <section className="preset-editor-section preset-main-section">
          <FieldLabel className="preset-pet-label">
            <span className="ui-field-title preset-section-title">精灵</span>
            <div className="preset-pet-row">
              <input className="preset-pet-input" list="pet-options" value={editor.name} onChange={(event) => patchEditor({ name: event.target.value })} placeholder="选择或输入精灵" />
              <button className="preset-pet-picker-button" onClick={() => setPicker("pet")}>选宠</button>
            </div>
          </FieldLabel>
          <FieldLabel className="preset-bloodline-label">
            <span className="ui-field-title preset-section-title">血脉</span>
            <div className="preset-bloodline-row">
              <select className="preset-bloodline-select" value={editor.bloodline || ""} onChange={(event) => patchEditor({ bloodline: event.target.value })}>
                <option value="">无</option>
                {BLOODLINE_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
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
            <RefreshButton className="compact-button preset-skill-reset-button" onClick={() => patchEditor({ skills: [], current_skill: "" })} />
          </div>
          <TeamSkillCardGrid
            cards={skillCards}
            replaceOnChoose
            currentSkill={editor.current_skill}
            onPick={(current_skill) => patchEditor({ current_skill })}
            onChoose={setSkillPickerIndex}
            onClear={clearSkillAt}
          />
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
          key={`${editor.name}-${skillPickerIndex}`}
          mode="skill"
          initialSkillName={editor.skills[skillPickerIndex] || ""}
          onClearSkill={() => {
            clearSkillAt(skillPickerIndex);
            setSkillPickerIndex(null);
          }}
          pets={[]}
          elements={elements}
          petSkills={skillDataPetName === editor.name ? skillData.petSkills : []}
          allSkills={skillDataPetName === editor.name ? skillData.allSkills : []}
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
      {watchSettingsOpen ? <WatchSkillsSettings elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onClose={() => setWatchSettingsOpen(false)} /> : null}
      {deleteGroupConfirm ? createPortal(
        <div data-overlay-control className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !deleteGroupBusy) setDeleteGroupConfirm(null);
        }}>
          <section className="team-code-modal preset-group-delete-modal" role="dialog" aria-modal="true" aria-labelledby="preset-group-delete-title">
            <h2 id="preset-group-delete-title">删除分组</h2>
            <p>删除“{deleteGroupConfirm.name}”分组及其中全部 {deleteGroupConfirm.items.length} 个精灵预设？</p>
            <div className="header-actions">
              <button className="compact-button" disabled={deleteGroupBusy} onClick={() => setDeleteGroupConfirm(null)}>取消</button>
              <button className="compact-button" disabled={deleteGroupBusy} onClick={() => void deleteGroup()}>{deleteGroupBusy ? "删除中…" : "确认删除"}</button>
            </div>
            {error ? <p className="error-text">错误：{error}</p> : null}
          </section>
        </div>,
        document.body,
      ) : null}
      {codeOpen ? createPortal(
        <div
          data-overlay-control
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCodeOpen(false);
          }}
        >
          <section className="team-code-modal preset-create-group-modal" role="dialog" aria-modal="true" aria-labelledby="preset-create-group-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2 id="preset-create-group-title">创建分组</h2>
              <button className="compact-button" onClick={() => setCodeOpen(false)}>关闭</button>
            </header>
            <label className="preset-create-group-field">
              <span>分组名</span>
              <input className="preset-new-group-input" value={codeGroupName} onChange={(event) => setCodeGroupName(event.target.value)} placeholder="新分组名" />
            </label>
            <label className="preset-create-group-field">
              <span>阵容码（可选）</span>
              <textarea
                className="team-code-textarea"
                value={codeText}
                onChange={(event) => setCodeText(event.target.value)}
                placeholder="粘贴游戏里复制的完整内容（包含 # 音速犬：首领血脉、{灼伤、热身} 这类说明行和阵容码那一行）"
              />
            </label>
            <div className="team-code-actions">
              <button className="compact-button" disabled={codeBusy} onClick={() => void (codeText.trim() ? importTeamCode("create") : createGroup())}>{codeBusy ? "处理中…" : "创建分组"}</button>
              <button className="compact-button" disabled={codeBusy} onClick={() => void importTeamCode("overwrite")}>覆盖当前分组</button>
            </div>
            <p className="team-code-hint">只填写分组名可创建空分组；填写阵容码则导入到新分组（同名会覆盖）。覆盖当前分组：用阵容码替换“{groupName}”里现有的全部预设。</p>
            {codeMessage ? <p className="save-message">{codeMessage}</p> : null}
            {codeError ? <p className="error-text preset-message">错误：{codeError}</p> : null}
            {codeReport.length ? (
              <div className="team-code-report">
                <span className="ui-field-title">导入结果</span>
                {codeReport.map((line, index) => <p key={index}>{line}</p>)}
              </div>
            ) : null}
          </section>
        </div>,
        document.body,
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
  panelState: state,
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
  panelState?: PanelState;
}) {
  const cards = (onlyIndex === undefined ? skillCardSlots(value.skills, cardCount) : [skillCardSlots(value.skills, Math.max(cardCount, value.skills.length))[onlyIndex] || ""]).map((name) => (name ? { name } : null));
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [skillData, setSkillData] = useState<SkillListResult>({ petSkills: [], allSkills: [] });
  const panelRef = useRef<HTMLElement | null>(null);
  const [skillInfo, setSkillInfo] = useState<SkillTriggerInfo | null>(null);
  const currentSkill = value.current_skill || value.skills.find(Boolean) || "";
  const controlSkill = onlyIndex === undefined ? currentSkill : cards[0]?.name || "";

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

  // 观察器只在挂载时建立一次；回调走 ref，避免每次渲染重建订阅导致拖拽时尺寸互相回写。
  const layoutChangeRef = useRef(onLayoutChange);
  layoutChangeRef.current = onLayoutChange;
  useEffect(() => {
    if (!floating || !panelRef.current) return;
    const panel = panelRef.current;
    const observer = new ResizeObserver(() => {
      if (panel.dataset.pluginResizing === "true") return;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      if (width <= 0 || height <= 0) return;
      layoutChangeRef.current?.({ width, height });
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [floating]);

  function setSkillAt(index: number, skillName: string) {
    const next = skillCardSlots(value.skills, Math.max(cardCount, value.skills.length));
    next[onlyIndex === undefined ? index : onlyIndex] = skillName;
    onChange({
      skills: next,
      current_skill: skillName,
    });
  }

  function clearSkillAt(index: number) {
    const next = skillCardSlots(value.skills, Math.max(cardCount, value.skills.length));
    const actualIndex = onlyIndex === undefined ? index : onlyIndex;
    const removed = next[actualIndex];
    next[actualIndex] = "";
    const skills = next;
    onChange({
      skills,
      current_skill: value.current_skill === removed ? skills.find(Boolean) || "" : value.current_skill,
        skill_trigger_stacks: Object.fromEntries(
          Object.entries(value.skill_trigger_stacks).filter(([skillName]) => skillName !== removed),
        ),
        skill_usage_mode_choices: Object.fromEntries(
          Object.entries(value.skill_usage_mode_choices).filter(([skillName]) => skillName !== removed),
        ),
    });
  }

  return (
    <section ref={panelRef} className={`team-skill-panel ${floating ? "skill-card-floating" : ""} ${className}`.trim()} data-panel-state={state} data-overlay-control data-plugin-resizable={floating || undefined} style={floating && layout ? { left: layout.x, top: layout.y, width: layout.width, height: layout.height, ...pluginContentStyle(layout) } : undefined}>
      {floating ? <PluginResizeEdges /> : null}
      <div className={floating ? "plugin-panel-content" : undefined}>
        <h2>{title}</h2>
        <TeamSkillCardGrid
          cards={cards}
          emptySkillOffset={onlyIndex ?? 0}
          currentSkill={value.current_skill}
          onPick={(current_skill) => onChange({ current_skill: value.current_skill === current_skill ? "" : current_skill })}
          onChoose={setPickerIndex}
          onClear={clearSkillAt}
          onApply={onApplySkill}
          pluginMode={pluginMode}
          quickResult={quickResult}
        />
        {pluginMode && controlSkill ? (
          <div className="plugin-skill-controls">
          {skillInfo?.stackable.map((trigger) => {
            const stacks = value.skill_trigger_stacks[controlSkill] || [];
            const stackCount = stacks[trigger.index] ?? 0;
            return (
              <div className="skill-stack-control" key={trigger.index}>
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
          {skillInfo?.stackable.length ? <RefreshButton className="compact-button skill-reset-button" onClick={() => onChange({ skill_trigger_stacks: { ...value.skill_trigger_stacks, [controlSkill]: [] } })} /> : null}
          {!pluginMode && skillInfo?.has_buff && onApplySkill ? <button className="compact-button" onClick={() => onApplySkill(controlSkill)}>应用</button> : null}
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
        {pluginMode && quickResult ? <QuickSkillResultDisplay result={quickResult} /> : null}
      </div>
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

function WatchSkillsSettings({ elements, configs, onConfigsChanged, onClose }: {
  elements: string[];
  configs: PickerConfigs;
  onConfigsChanged: (configs: PickerConfigs) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [configuration, update] = useWatchConfiguration(configs, onConfigsChanged, setError);
  const group = configuration.groups.find((item) => item.id === configuration.activeGroupId)!;
  const [groupDraft, setGroupDraft] = useState<WatchGroup>(group);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const draftIsSaved = configuration.groups.some((item) => item.id === groupDraft.id);
  const [newTags, setNewTags] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [tagNameDraft, setTagNameDraft] = useState("");
  useEffect(() => { setGroupDraft(group); setEditingGroupName(false); setSelectedTag(null); setEditingTag(null); setSaveMessage(""); }, [group.id]);
  const tags = [...new Set([...(groupDraft.tags || []), ...groupDraft.rules.flatMap((rule) => rule.tags)])];
  const visibleTags = groupDraft.rules.some((rule) => !rule.tags.length) || !tags.length ? ["", ...tags] : tags;
  const activeTag = selectedTag !== null && visibleTags.includes(selectedTag) ? selectedTag : visibleTags[0];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allSkills, setAllSkills] = useState<SkillItem[]>([]);
  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    void cachedListSkills("").then((data) => { if (!cancelled) setAllSkills(data.allSkills); }).catch((error) => { if (!cancelled) setError(asError(error)); });
    return () => { cancelled = true; };
  }, [pickerOpen]);

  function changeRules(change: (rules: WatchRule[]) => WatchRule[]) {
    setSaveMessage("");
    setGroupDraft((value) => ({ ...value, rules: change(value.rules) }));
  }
  function addRule(kind: WatchRule["kind"], name: string) {
    const tags = activeTag ? [activeTag] : [];
    changeRules((rules) => {
      const existing = rules.find((rule) => rule.kind === kind && (kind !== "skill" || rule.name === name));
      if (existing) return rules.map((rule) => rule.id === existing.id ? { ...rule, name, tags: [...new Set([...rule.tags, ...tags])] } : rule);
      return [...rules, { id: crypto.randomUUID(), kind, name, tags }];
    });
  }
  function addTag() {
    const tag = newTags.trim();
    if (!tag) { setError("请填写标签名"); return; }
    if (tags.includes(tag)) { setError("标签已存在"); return; }
    setError("");
    setSaveMessage("");
    setGroupDraft((value) => ({ ...value, tags: [...new Set([...(value.tags || []), ...value.rules.flatMap((rule) => rule.tags), tag])] }));
    setSelectedTag(tag);
    setNewTags("");
  }
  function renameTag(tag: string) {
    const name = tagNameDraft.trim();
    if (!name) { setError("标签名不能为空"); return; }
    if (name !== tag && tags.includes(name)) { setError("标签已存在"); return; }
    setError("");
    setSaveMessage("");
    setGroupDraft((value) => ({
      ...value,
      tags: [...new Set([...(value.tags || []), ...value.rules.flatMap((rule) => rule.tags), ...(tag ? [] : [name])].map((item) => item === tag ? name : item))],
      rules: value.rules.map((rule) => ({ ...rule, tags: tag ? rule.tags.map((item) => item === tag ? name : item) : rule.tags.length ? rule.tags : [name] })),
    }));
    setSelectedTag(name);
    setEditingTag(null);
  }
  async function saveGroup() {
    const name = groupDraft.name.trim();
    if (!name) { setError("请填写醒目技能分组名"); return; }
    if (configuration.groups.some((item) => item.name === name && item.id !== groupDraft.id)) { setError("醒目技能分组名已存在"); return; }
    setError("");
    setSaveMessage("");
    setSaving(true);
    const next = { ...groupDraft, name };
    setGroupDraft(next);
    const success = await update((value) => ({
      groups: value.groups.some((item) => item.id === next.id)
        ? value.groups.map((item) => item.id === next.id ? next : item)
        : [...value.groups, next],
      activeGroupId: next.id,
    }));
    setSaving(false);
    if (success) {
      setEditingGroupName(false);
      setSaveMessage(`已保存醒目技能分组：${name}`);
    }
  }

  return <>{createPortal(
    <div data-overlay-control className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="team-code-modal preset-watch-modal" role="dialog" aria-modal="true" aria-labelledby="preset-watch-title">
        <header><h2 id="preset-watch-title">醒目技能</h2><button className="compact-button" onClick={onClose}>关闭</button></header>
        <div className="watch-settings-row watch-settings-group">
          <label htmlFor="watch-group-name">分组</label>
          {editingGroupName || !draftIsSaved ? <input id="watch-group-name" aria-label="醒目技能分组名" autoFocus value={groupDraft.name} placeholder="输入分组名" onChange={(event) => {
            setSaveMessage("");
            setGroupDraft((value) => ({ ...value, name: event.target.value }));
          }} onKeyDown={(event) => {
            if (event.key === "Enter" && !saving) void saveGroup();
            if (event.key === "Escape" && draftIsSaved) {
              const saved = configuration.groups.find((item) => item.id === groupDraft.id)!;
              setGroupDraft((value) => ({ ...value, name: saved.name }));
              setEditingGroupName(false);
            }
          }} /> : <select id="watch-group-name" aria-label="醒目技能分组" value={groupDraft.id} disabled={saving} onChange={(event) => {
            const selected = configuration.groups.find((item) => item.id === event.target.value);
            if (!selected) return;
            setGroupDraft(selected);
            setEditingGroupName(false);
            setSelectedTag(null);
            setEditingTag(null);
            setNewTags("");
            setError("");
            setSaveMessage("");
            void update((value) => ({ ...value, activeGroupId: selected.id }));
          }}>
            {configuration.groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>}
          <button className="compact-button" disabled={saving || !draftIsSaved} onClick={() => { setEditingGroupName(true); setSaveMessage(""); }}>重命名</button>
          <button className="compact-button" disabled={saving} onClick={() => void saveGroup()}>{saving ? "保存中…" : "保存"}</button>
          <button className="compact-button" disabled={saving} onClick={() => {
            setError("");
            setGroupDraft({ id: crypto.randomUUID(), name: "", rules: [] });
            setEditingGroupName(true);
            setSelectedTag(null);
            setEditingTag(null);
            setSaveMessage("");
            setNewTags("");
          }}>新建</button>
          <button className="compact-button watch-settings-delete" disabled={saving || configuration.groups.length === 1 || !draftIsSaved} onClick={() => {
            if (!window.confirm(`删除醒目技能分组“${groupDraft.name}”？`)) return;
            update((value) => { const groups = value.groups.filter((item) => item.id !== groupDraft.id); setGroupDraft(groups[0]); return { groups, activeGroupId: groups[0].id }; });
          }}>删除分组</button>
        </div>
        {saveMessage ? <p className="save-message" role="status">{saveMessage}</p> : null}
        <div className="watch-settings-tag-groups">
          {visibleTags.map((tag) => <section className="watch-settings-tag-group" key={`${groupDraft.id}-${tag}`}>
            <div className="watch-settings-tag-header">
              {editingTag === tag ? <>
                <input className="watch-settings-tag-name" aria-label="修改标签名" autoFocus value={tagNameDraft} onChange={(event) => setTagNameDraft(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter") renameTag(tag);
                  if (event.key === "Escape") setEditingTag(null);
                }} />
                <button className="compact-button" title="确认标签名" aria-label="确认标签名" onClick={() => renameTag(tag)}>✓</button>
                <button className="compact-button" title="取消修改标签名" aria-label="取消修改标签名" onClick={() => setEditingTag(null)}>×</button>
              </> : <>
                <button type="button" className={`compact-button watch-settings-tag${tag === activeTag ? " active" : ""}`} aria-pressed={tag === activeTag} onClick={() => setSelectedTag(tag)}>{tag || "未标签"}</button>
                <button className="compact-button watch-settings-tag-edit" title="修改标签名" aria-label={`修改${tag || "未标签"}标签名`} onClick={() => { setEditingTag(tag); setTagNameDraft(tag); }}>✎</button>
              </>}
            </div>
            <div className="watch-settings-rules">
              {groupDraft.rules.filter((rule) => tag ? rule.tags.includes(tag) : !rule.tags.length).map((rule) => <div className="watch-settings-rule" key={rule.id}>
                <span>{rule.kind === "skill" ? <EntityLabel kind="skill" value={rule.name} /> : WATCH_RULE_OPTIONS.find((option) => option.kind === rule.kind)?.label || rule.name}</span>
                <button className="compact-button" aria-label={`从${tag || "未标签"}移除${rule.name}`} onClick={() => changeRules((rules) => rules.flatMap((item) => {
                  if (item.id !== rule.id) return [item];
                  const tags = item.tags.filter((itemTag) => itemTag !== tag);
                  return tags.length ? [{ ...item, tags }] : [];
                }))}>×</button>
              </div>)}
            </div>
          </section>)}
        </div>
        <div className="watch-settings-row watch-settings-add-skills">
          {WATCH_RULE_OPTIONS.map((option) => <button className="compact-button" key={option.kind} onClick={() => addRule(option.kind, option.label)}>{option.label}</button>)}
          <button className="compact-button watch-settings-pick" title="按技能名称或描述搜索" onClick={() => setPickerOpen(true)}>选择</button>
          <div className="watch-settings-new-tag">
            <input aria-label="标签名" value={newTags} onChange={(event) => setNewTags(event.target.value)} placeholder="标签名" onKeyDown={(event) => { if (event.key === "Enter") addTag(); }} />
            <button className="compact-button" onClick={addTag}>新增标签</button>
          </div>
        </div>
        {error ? <p className="error-text">错误：{error}</p> : null}
      </section>
    </div>, document.body,
  )}{pickerOpen ? <PickerModal mode="skill" searchSkillDescriptions pets={[]} elements={elements} petSkills={allSkills} allSkills={allSkills} traits={[]} configs={configs} onConfigsChanged={onConfigsChanged} onClose={() => setPickerOpen(false)} onPickPet={() => undefined} onPickTrait={() => undefined} onPickSkill={(skill) => addRule("skill", skill.name)} /> : null}</>;
}

/* 敌方醒目技能按独立分组中的规则匹配，再按自定义标签归类。 */
function EnemyWatchSkillsPanel({ layout, onLayoutChange, configuration, onConfigurationChange, self, enemy }: {
  layout: PluginOverlayLayout;
  onLayoutChange: (partial: Partial<PluginOverlayLayout>) => void;
  configuration: WatchConfiguration;
  onConfigurationChange: (change: (value: WatchConfiguration) => WatchConfiguration) => void;
  self: UnitState;
  enemy: UnitState;
}) {
  const enemyName = enemy.mega_form || enemy.name;
  const [skillData, setSkillData] = useState<{ name: string; skills: SkillItem[] }>({ name: "", skills: [] });
  const group = configuration.groups.find((item) => item.id === configuration.activeGroupId)!;
  const needsAdvantages = group.rules.some((rule) => rule.kind === "super-effective");
  const defenderKey = JSON.stringify([self.name, self.devolution, self.mega, self.mega_form]);
  const [advantageData, setAdvantageData] = useState<{ key: string; values: Record<string, number> }>({ key: "", values: {} });
  const [advantageError, setAdvantageError] = useState("");
  const [skillError, setSkillError] = useState("");
  const [collapsedTags, setCollapsedTags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSkillError("");
    if (!enemyName) return;
    let cancelled = false;
    void cachedListSkills(enemyName)
      .then((data) => { if (!cancelled) setSkillData({ name: enemyName, skills: data.petSkills }); })
      .catch((error) => { if (!cancelled) { setSkillData({ name: enemyName, skills: [] }); setSkillError(asError(error)); } });
    return () => { cancelled = true; };
  }, [enemyName]);

  useEffect(() => {
    setAdvantageError("");
    if (!needsAdvantages || !self.name) return;
    let cancelled = false;
    void invoke<Record<string, number>>("calculate_watch_advantages", { payload: { defender: { name: self.name, devolution: self.devolution, mega: self.mega, mega_form: self.mega_form } } })
      .then((values) => { if (!cancelled) setAdvantageData({ key: defenderKey, values }); })
      .catch((error) => { if (!cancelled) { setAdvantageData({ key: defenderKey, values: {} }); setAdvantageError(asError(error)); } });
    return () => { cancelled = true; };
  }, [defenderKey, needsAdvantages]);

  const matchedGroups = groupWatchedSkills(group.rules, skillData.name === enemyName ? skillData.skills : [], advantageData.key === defenderKey ? advantageData.values : {}).filter(({ matches }) => matches.length > 0);

  return (
    <FloatingTeamPanel className="watch-skill-panel" overlayId="right-watch" layout={layout} onLayoutChange={onLayoutChange}>
      <div className="watch-skill-title">醒目技能 <select aria-label="插件醒目技能分组" value={group.id} onChange={(event) => onConfigurationChange((value) => ({ ...value, activeGroupId: event.target.value }))}>
        {configuration.groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></div>
      {matchedGroups.map(({ tag, matches }) => {
        const tagKey = JSON.stringify([group.id, tag]);
        const collapsed = Boolean(collapsedTags[tagKey]);
        return <div className="watch-skill-tag-group" key={tag}>
          <button type="button" className="watch-skill-tag" aria-expanded={!collapsed} onClick={() => setCollapsedTags((value) => ({ ...value, [tagKey]: !value[tagKey] }))}>{tag} <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span></button>
          {!collapsed ? <div className="watch-skill-list" onPointerDown={(event) => event.stopPropagation()}>{matches.map(({ skill }) => <div className="watch-skill-item" key={skill.name} title={[skill.name, skillDetail(skill).description || skill.description].filter(Boolean).join("\n")}>
            <span><EntityLabel kind="skill" value={skill.name} /></span>
          </div>)}</div> : null}
        </div>;
      })}
      {!matchedGroups.length ? <div className="watch-skill-empty">无</div> : null}
      {needsAdvantages && self.name && advantageData.key !== defenderKey && !advantageError ? <div className="watch-skill-empty">克制技能计算中…</div> : null}
      {advantageError || skillError ? <div className="error-text">{advantageError || skillError}</div> : null}
    </FloatingTeamPanel>
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
            <TriggerButton
              label="迸发触发"
              className={value.charge_mark_triggered ? "compact-button active" : "compact-button"}
              aria-pressed={value.charge_mark_triggered}
              onClick={() => onChange({ charge_mark_triggered: !value.charge_mark_triggered })}
            />
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
        {markOptions.filter(([id]) => markFields.includes(id)).map(([id, label, key]) => <div key={id}><FieldLabel>{label}</FieldLabel><NumberInput value={value[key]} min={0} max={99} onChange={(stacks) => onChange({ [key]: stacks })} />{id === "charge" ? <TriggerButton className={value.charge_mark_triggered ? "compact-button active" : "compact-button"} aria-pressed={value.charge_mark_triggered} onClick={() => onChange({ charge_mark_triggered: !value.charge_mark_triggered })} /> : null}<button className="compact-button" title="移除印记" aria-label={`移除${label}`} onClick={() => { onChange({ [key]: 0, ...(id === "charge" ? { charge_mark_triggered: false } : {}) }); onMarkFieldsChange(markFields.filter((field) => field !== id)); }}>x</button></div>)}
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
  pluginMode,
  side,
  position,
  onPositionChange,
  value,
  burstEffects,
  markFields,
  onMarkFieldsChange,
  onChange,
  onClose,
}: {
  tool: BonusTool;
  pluginMode: boolean;
  side: "left" | "right";
  position: BonusToolPosition;
  onPositionChange: (position: BonusToolPosition) => void;
  value: TeamOtherBonuses;
  burstEffects: BurstEffectItem[];
  markFields: MarkField[];
  onMarkFieldsChange: (fields: MarkField[]) => void;
  onChange: (partial: Partial<TeamOtherBonuses>) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const title = `${side === "left" ? "己方" : "敌方"}${{ dedication: "奉献", marks: "印记", thunderstorm: "雷暴" }[tool]}`;
  usePluginPanelMove(panelRef, onPositionChange);

  function clampToViewport(x: number, y: number) {
    const width = panelRef.current?.offsetWidth || 330;
    const height = panelRef.current?.offsetHeight || 260;
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)),
    };
  }

  useEffect(() => {
    if (pluginMode) return;
    const keepVisible = () => onPositionChange(clampToViewport(position.x, position.y));
    window.addEventListener("resize", keepVisible);
    return () => window.removeEventListener("resize", keepVisible);
  }, [pluginMode, position.x, position.y, onPositionChange]);

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, input, select, textarea, [role=button], summary")) return;
    event.preventDefault();
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y };
    const move = (moveEvent: PointerEvent) => {
      const start = dragRef.current;
      if (start) onPositionChange(clampToViewport(start.x + moveEvent.clientX - start.pointerX, start.y + moveEvent.clientY - start.pointerY));
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
    <section ref={panelRef} className={`bonus-tool-floating ${side}-${tool} ${tool}`} data-overlay-control data-plugin-resizable={pluginMode || undefined} style={{ left: position.x, top: position.y }}>
      {pluginMode ? <PluginResizeEdges /> : null}
      <header onPointerDown={startDrag}>
        <div className="inline-row">
          <strong>{title}</strong>
          {tool === "dedication" || tool === "thunderstorm" ? <RefreshButton className="compact-button" onClick={() => onChange(tool === "dedication" ? { dedication_power_stacks: 0, dedication_combo_stacks: 0 } : { burst_triggered_effect_ids: [] })} /> : null}
        </div>
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
  replaceOnChoose = false,
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
  replaceOnChoose?: boolean;
}) {
  const cardSkillNames = [...new Set(cards.flatMap((skill) => (skill ? [skill.name] : [])))];
  const cardSkillNamesKey = cardSkillNames.join("\u0000");
  const [skillDetails, setSkillDetails] = useState<Record<string, Pick<SkillTriggerInfo, "description" | "element">>>({});

  useEffect(() => {
    let cancelled = false;
    if (!cardSkillNames.length) {
      setSkillDetails({});
      return () => { cancelled = true; };
    }
    void Promise.all(cardSkillNames.map(async (name) => {
      const data = await cachedSkillTriggerInfo(name);
      return [name, { description: data.description || "", element: data.element || "" }] as const;
    }))
      .then((details) => {
        if (!cancelled) setSkillDetails(Object.fromEntries(details));
      })
      .catch(() => {
        if (!cancelled) setSkillDetails({});
      });
    return () => { cancelled = true; };
  }, [cardSkillNamesKey]);

  return (
    <div className="skill-card-grid">
      {cards.map((skill, index) => {
        const element = skill ? skillDetail(skill).element || skillDetails[skill.name]?.element : undefined;
        const color = element ? ELEMENT_RESULT_COLORS[element] : undefined;
        return (
        <div
          key={skill ? `${skill.name}-${index}` : `empty-${index}`}
          className={`${skill?.name === currentSkill ? "skill-card selected" : "skill-card"} team-skill-card${skill ? "" : " is-empty"}`}
          role="button"
          aria-pressed={Boolean(skill && skill.name === currentSkill)}
          data-skill-element={color ? element : undefined}
          style={color ? { "--skill-element-bg": color, "--skill-element-text": element === "幽" ? "#fff" : "#17212b" } as CSSProperties : undefined}
          tabIndex={0}
          title={skill ? [skill.name, skillDetails[skill.name]?.description].filter(Boolean).join("\n") : "空技能"}
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
          <strong>{skill && !pluginMode ? <EntityLabel kind="skill" value={skill.name} /> : skill?.name || `空技能${emptySkillOffset + index + 1}`}</strong>
          {quickResult && quickResult.skillName === skill?.name && quickResult.displayPower !== null && quickResult.displayPower !== undefined ? <span className="quick-skill-power">{quickResult.displayPower}</span> : null}
          {!pluginMode ? <div className="skill-card-actions">
            <button className="slot-action" onClick={(event) => { event.stopPropagation(); skill && !replaceOnChoose ? onClear(index) : onChoose(index); }}>
              {skill && !replaceOnChoose ? "取消" : "选择"}
            </button>
          </div> : null}
        </div>
        );
      })}
    </div>
  );
}

type BuffFieldKey =
  | "phys_atk_buff"
  | "mag_atk_buff"
  | "phys_def_buff"
  | "mag_def_buff"
  | "power_multiplier"
  | "light_power_buff"
  | "power_bonus"
  | "combo_plus"
  | "combo_mul"
  | "usage_time_plus";

type BuffField = {
  key: BuffFieldKey;
  /** 输入框前的完整标签。 */
  label: string;
  /** 收起态摘要里的短标签。 */
  short: string;
  suffix: string;
  min: number;
  max: number;
  step?: number;
  /** 默认值，非默认即视为生效。连击倍的默认是 1 而不是 0。 */
  base?: number;
  labelClassName?: string;
  inputClassName?: string;
};

const BUFF_GROUPS: Array<{ title: string; fields: BuffField[] }> = [
  { title: "攻击", fields: [
    { key: "phys_atk_buff", label: "物攻%", short: "物攻", suffix: "%", min: -300, max: 300, step: 10 },
    { key: "mag_atk_buff", label: "魔攻%", short: "魔攻", suffix: "%", min: -300, max: 300, step: 10 },
  ] },
  { title: "防御", fields: [
    { key: "phys_def_buff", label: "物防%", short: "物防", suffix: "%", min: -300, max: 300, step: 10 },
    { key: "mag_def_buff", label: "魔防%", short: "魔防", suffix: "%", min: -300, max: 300, step: 10 },
  ] },
  { title: "威力", fields: [
    { key: "power_multiplier", label: "威力%", short: "威力", suffix: "%", min: -100, max: 1000, step: 10 },
    { key: "power_bonus", label: "威力+", short: "威力", suffix: "", min: -500, max: 500, step: 10 },
    { key: "light_power_buff", label: "光威%", short: "光威", suffix: "%", min: 0, max: 1000, step: 10, labelClassName: "buff-light-power-label" },
    { key: "usage_time_plus", label: "使用+", short: "使用", suffix: "", min: 0, max: 20, labelClassName: "buff-usage-label", inputClassName: "buff-usage-input" },
  ] },
  { title: "连击", fields: [
    { key: "combo_plus", label: "连击+", short: "连击", suffix: "", min: -20, max: 20 },
    { key: "combo_mul", label: "连击倍", short: "连击倍", suffix: "x", min: 1, max: 10, base: 1 },
  ] },
];

const BUFF_FIELDS = BUFF_GROUPS.flatMap((group) => group.fields);

const BUFF_RESET = Object.fromEntries(BUFF_FIELDS.map((field) => [field.key, field.base ?? 0])) as Record<BuffFieldKey, number>;

function TeamBuffPanel({
  title,
  className = "",
  value,
  onChange,
  expanded: expandedProp,
  onExpandedChange,
  onMove,
}: {
  title: string;
  className?: string;
  value: UnitState;
  onChange: (partial: Partial<UnitState>) => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onMove?: (delta: { x: number; y: number }) => void;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const suppressSummaryClickRef = useRef(false);
  const panelRef = useRef<HTMLDetailsElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const expanded = expandedProp ?? localExpanded;
  const setExpanded = (next: boolean) => (expandedProp === undefined ? setLocalExpanded(next) : onExpandedChange?.(next));
  const isActive = (field: BuffField) => value[field.key] !== (field.base ?? 0);
  const activeBuffs = BUFF_FIELDS.filter(isActive);
  const popupPlacement = usePopupPlacement(Boolean(expanded), panelRef, popupRef);

  function startSummaryInteraction(event: ReactPointerEvent<HTMLElement>) {
    if (!onMove || (event.target as HTMLElement).closest("button")) return;
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const panelBounds = event.currentTarget.closest<HTMLElement>(".team-buff-panel")?.getBoundingClientRect();
    let moved = false;
    const move = (moveEvent: PointerEvent) => {
      const rawDelta = { x: moveEvent.clientX - startX, y: moveEvent.clientY - startY };
      const delta = panelBounds ? {
        x: Math.min(Math.max(-panelBounds.left, rawDelta.x), window.innerWidth - panelBounds.right),
        y: Math.min(Math.max(-panelBounds.top, rawDelta.y), window.innerHeight - panelBounds.bottom),
      } : rawDelta;
      if (!moved && Math.hypot(delta.x, delta.y) < 4) return;
      moved = true;
      suppressSummaryClickRef.current = true;
      moveEvent.preventDefault();
      onMove(delta);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      if (!moved) suppressSummaryClickRef.current = false;
      window.setTimeout(() => { suppressSummaryClickRef.current = false; }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  return (
    <details ref={panelRef} className={`team-buff-panel ${className}`.trim()} data-panel-state={panelState(activeBuffs.length > 0)} data-popup-flip={popupPlacement.up ? "up" : undefined} data-popup-side={popupPlacement.left ? "left" : undefined} data-overlay-control data-plugin-resizable open={expanded}>
      <PluginResizeEdges />
      <summary onPointerDown={startSummaryInteraction} onClick={(event) => {
        event.preventDefault();
        if (suppressSummaryClickRef.current || (event.target as HTMLElement).closest("button")) return;
        setExpanded(!expanded);
      }}>
          <span className="team-buff-summary-title">
          <span>{title}</span>
          </span>
          {activeBuffs.length ? <span className="buff-summary-values">{activeBuffs.map((field) => <span key={field.key}>{field.short}{value[field.key] > 0 ? "+" : ""}{value[field.key]}{field.suffix}</span>)}</span> : null}
        <RefreshButton
          className="compact-button buff-reset-button"
          onClick={(event) => {
            event.preventDefault();
            onChange(BUFF_RESET);
          }}
        />
      </summary>
      <div ref={popupRef} className="buff-grid team-buff-grid">
        {BUFF_GROUPS.map((group) => (
          <div className="buff-group" key={group.title}>
            <div className="buff-group-fields">
              {group.fields.map((field) => (
                <div className={`buff-field${isActive(field) ? " is-active" : ""}`} key={field.key}>
                  <FieldLabel className={field.labelClassName}>{field.label}</FieldLabel>
                  <NumberInput
                    className={field.inputClassName}
                    value={value[field.key]}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    onChange={(next) => onChange({ [field.key]: next } as Partial<UnitState>)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
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
  expanded: expandedProp,
  onExpandedChange,
}: {
  value: UnitState;
  pets: Pet[];
  elements: string[];
  configs: PickerConfigs;
  onChange: (partial: Partial<UnitState>) => void;
  onConfigsChanged: (configs: PickerConfigs) => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [picker, setPicker] = useState(false);
  const [traitRuntime, setTraitRuntime] = useState<any>(null);
  const [localExpanded, setLocalExpanded] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const expanded = expandedProp ?? localExpanded;
  const setExpanded = (next: boolean) => (expandedProp === undefined ? setLocalExpanded(next) : onExpandedChange?.(next));
  const popupPlacement = usePopupPlacement(Boolean(expanded), sectionRef, popupRef);
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
      : "无";
  const traitDetail = traitRuntime?.error ? traitRuntime.error : traitRuntime?.effect_text || "";
  const traitChoiceLabel = (option: string) => ({ weekend: "周末", workday: "工作日" } as Record<string, string>)[option] || option;

  return (
    <section ref={sectionRef} className="team-slot-section" data-popup-flip={popupPlacement.up ? "up" : undefined} data-popup-side={popupPlacement.left ? "left" : undefined}>
      <button className="trait-summary-button compact" title={traitLabel} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <strong className="ui-field-title">{traitLabel}</strong>
      </button>
      <div className="trait-control-grid compact">
        <div className="inline-row trait-status-row">
          {traitRuntime?.triggerable ? (
            <TriggerButton
              aria-pressed={value.trait_triggered}
              className={value.trait_triggered ? "compact-button trait-trigger-button active" : "compact-button trait-trigger-button"}
              onClick={() => onChange({ trait_triggered: !value.trait_triggered })}
            />
          ) : null}
          {traitRuntime?.stack_input ? (
            <div className="trait-stack-control">
              <NumberInput value={value.trait_stacks} min={0} max={99} onChange={(trait_stacks) => onChange({ trait_stacks })} />
            </div>
          ) : null}
          {traitRuntime?.stack_input ? <RefreshButton className="compact-button trait-reset-button" onClick={() => onChange({ trait_override_query: null, trait_triggered: false, trait_stacks: 0, trait_choices: {} })} /> : null}
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
        <div ref={popupRef} className="trait-expanded-content">
          {traitDetail ? <p className="trait-text">{traitDetail}</p> : null}
          {traitRuntime?.note ? <p className="muted trait-note">{traitRuntime.note}</p> : null}
          <div className="inline-row trait-action-row"><button className="compact-button trait-select-button" onClick={() => setPicker(true)}>选特</button></div>
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
    <RefreshButton
      className="compact-button iv-reset-button"
      onClick={(event) => {
        event.preventDefault();
        onChange({ iv: null, personality_bouns: null, personality_down: null });
      }}
    />
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

function FloatingTeamPanel({ className, overlayId, layout, onLayoutChange, panelState: state, children }: { className: string; overlayId?: string; layout: PluginOverlayLayout; onLayoutChange: (partial: Partial<PluginOverlayLayout>) => void; panelState?: PanelState; children: ReactNode }) {
  const panelRef = useRef<HTMLElement | null>(null);
  const isSpeedLine = className.split(/\s+/).includes("speed-line");
  const speedLineContentWidth = useRef(Math.max(1, layout.width - 18));

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, input, select, textarea, [role=button], summary, .plugin-resize-edge")) return;
    // 展开浮层视觉上是独立层，点它不应拖动宿主面板。
    if ((event.target as HTMLElement).closest(".trait-expanded-content")) return;
    event.preventDefault();
    const start = { pointerX: event.clientX, pointerY: event.clientY, ...layout };
    const move = (moveEvent: PointerEvent) => onLayoutChange({
      x: Math.max(0, snapToGrid(start.x + moveEvent.clientX - start.pointerX)),
      y: Math.max(0, snapToGrid(start.y + moveEvent.clientY - start.pointerY)),
    });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  // 同技能浮层：观察器只建一次，回调走 ref，避免拖拽中反复重建订阅。
  const layoutChangeRef = useRef(onLayoutChange);
  layoutChangeRef.current = onLayoutChange;
  useEffect(() => {
    if (!panelRef.current) return;
    const panel = panelRef.current;
    const observer = new ResizeObserver(() => {
      if (panel.dataset.pluginResizing === "true") return;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      if (width <= 0 || height <= 0) return;
      layoutChangeRef.current({ width, height });
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  return <section ref={panelRef} className={`floating-team-panel ${className}`} data-panel-state={isSpeedLine ? undefined : state} data-overlay-control data-plugin-resizable data-plugin-overlay-id={overlayId} style={{ left: layout.x, top: layout.y, width: layout.width, height: layout.height, ...pluginContentStyle(layout), ...(isSpeedLine ? { "--speed-line-content-width": `${speedLineContentWidth.current}px` } : {}) }} onPointerDown={startDrag} onPointerDownCapture={(event) => {
    const button = traitSummaryAtPoint(event.target as HTMLElement, event.clientX, event.clientY);
    if (!button) return;
    event.stopPropagation();
    button.focus({ preventScroll: true });
  }} onClickCapture={(event) => {
    const button = traitSummaryAtPoint(event.target as HTMLElement, event.clientX, event.clientY);
    if (!button || (event.target as HTMLElement).closest(".trait-summary-button") === button) return;
    event.preventDefault();
    event.stopPropagation();
    button.click();
  }}>
    <div className="plugin-drag-zone" aria-label="拖动面板" />
    <PluginResizeEdges />
    {isSpeedLine ? children : <div className="plugin-panel-content">{children}</div>}
  </section>;
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
  const loadRuntime = (value: UnitState, setter: (runtime: any) => void) => {
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
    }).then((data) => setter(data.runtime)).catch(() => setter(null));
  };
  useEffect(() => loadRuntime(left, setLeftRuntime), [left.name, left.trait_override_query, left.mega, left.mega_form, left.trait_triggered, left.trait_stacks, left.trait_choices]);
  useEffect(() => loadRuntime(right, setRightRuntime), [right.name, right.trait_override_query, right.mega, right.mega_form, right.trait_triggered, right.trait_stacks, right.trait_choices]);
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

function Roster({
  selectedGroup = "",
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
  pluginMode,
  panelState: state,
}: {
  selectedGroup?: string;
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
  pluginMode: boolean;
  panelState?: PanelState;
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
    <section className={`roster ${className}`.trim()} data-panel-state={state} data-overlay-control data-plugin-resizable={pluginMode || undefined}>
      {pluginMode ? <PluginResizeEdges /> : null}
      <header className="roster-header">
        {!pluginMode ? <h2>{title}</h2> : null}
        <select
          className="roster-import-select"
          value={selectedGroup}
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
                className={`${index === activeIndex ? "slot active" : "slot"}${slot.name ? "" : " is-empty"}`}
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
                <strong title={slot.display_name || slot.name || (pluginMode ? "空" : "空槽位")}><EntityLabel kind="pet" value={slot.name} iconOnly={pluginMode} className={pluginMode ? "roster-pet-image" : ""}>{petNameOnly(slot.display_name || slot.name) || (pluginMode ? "空" : "空槽位")}</EntityLabel></strong>
                {slot.name ? <RefreshButton className="slot-action" label="更换" onClick={(event) => { event.stopPropagation(); onChoose(index); }} /> : <button className="slot-action" onClick={(event) => { event.stopPropagation(); onChoose(index); }}>选择</button>}
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
  const panelRef = useRef<HTMLElement | null>(null);
  usePluginPanelMove(panelRef, setPosition);
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const grouped = orderedResultGroups(results);

  useEffect(() => {
    setSelected(results.find((result) => result.is_triggered) || results[0] || null);
    setVisible(Boolean(results.length));
  }, [results]);

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
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
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  if (error) return <section className="result-panel error-text">错误：{error}</section>;
  if (!results.length || !visible) return null;
  const summary = selected || results[0];
  const attackerName = context?.attackerName || "攻击方";
  const defenderName = context?.defenderName || "防御方";
  const skillName = context?.skillName || summary.skill_name || "-";
  const isRequiredPower = results.some((result) => result.required_power !== undefined);
  const defenderFirst = Boolean(willpower && context?.defenderFirst);
  const showLegacyResultCards = false;
  const showLegacyResultDetail = false;
  return (
    <section ref={panelRef} className={`result-floating${willpower ? " has-willpower" : ""}`} data-overlay-control data-plugin-resizable style={{ left: position.x, top: position.y }}>
      <PluginResizeEdges />
      <header className="result-floating-header" onPointerDown={startDrag}>
        <div>
          <h2>对战结果</h2>
          <p>
            <EntityLabel kind="pet" value={context?.attackerPetName || attackerName}>{attackerName}</EntityLabel> → <EntityLabel kind="pet" value={context?.defenderPetName || defenderName}>{defenderName}</EntityLabel>，<EntityLabel kind="skill" value={skillName} />
          </p>
        </div>
        {willpower ? <button className="icon-button" title="关闭" aria-label="关闭" onClick={() => setVisible(false)}>×</button> : <button onClick={() => setVisible(false)}>关闭</button>}
      </header>
      {willpower ? (
        <div className="willpower-result-tabs" aria-label="愿力系别">
          {willpower.elements.map((item) => (
            <button key={item.element} className={selectedWillpowerElement === item.element ? "active" : ""} aria-pressed={selectedWillpowerElement === item.element} aria-label={`${item.element}系愿力${item.has_stab ? "，本系加成" : ""}，${item.advantage}倍`} title={`${item.element}系愿力`} onClick={() => onSelectWillpowerElement(item)}>
              <PickerIcon value={item.element} /><span>{item.has_stab ? "* " : ""}{item.advantage}x</span>
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
              {uniqueByOrder(caseResults.map((result) => defenderFirst ? result.def_label : result.atk_label)).map((groupLabel) => {
                const matrixResults = caseResults.filter((result) => (defenderFirst ? result.def_label : result.atk_label) === groupLabel);
                const rowLabels = uniqueByOrder(matrixResults.map((result) => defenderFirst ? result.atk_label : result.def_label));
                const hpLabels = uniqueByOrder(matrixResults.flatMap((result) => result.hp_results.map((item) => item.hp_label)));
                const selectedInMatrix = selected && matrixResults.includes(selected) ? selected : null;
                const selectedLabels = selectedInMatrix ? resultValueLabels(selectedInMatrix) : null;
                return (
                  <Fragment key={`${caseLabel}-${groupLabel}`}>
                    <div
                      className="result-matrix"
                      style={{ gridTemplateColumns: `minmax(58px, 0.8fr) minmax(56px, 0.75fr) repeat(${hpLabels.length}, minmax(48px, 0.65fr))` }}
                    >
                      <div className="result-matrix-corner">{defenderFirst ? formatDefenseLabel(groupLabel, context) : formatAttackLabel(groupLabel, context)}</div>
                      <div className={hpLabels.length ? "result-matrix-header" : "result-matrix-header result-matrix-edge-right"}>伤害</div>
                      {hpLabels.map((hpLabel, hpIndex) => (
                        <div className={hpIndex === hpLabels.length - 1 ? "result-matrix-header result-matrix-edge-right" : "result-matrix-header"} key={hpLabel}>{formatHpLabel(hpLabel, context)}</div>
                      ))}
                      {rowLabels.map((rowLabel) => {
                        const rowResult = matrixResults.find((result) => (defenderFirst ? result.atk_label : result.def_label) === rowLabel);
                        const isSelectedRow = Boolean(rowResult && selected === rowResult);
                        const isLastRow = rowLabel === rowLabels[rowLabels.length - 1];
                        return (
                          <Fragment key={rowLabel}>
                            <button
                              className={[
                                "result-matrix-row-label",
                                isSelectedRow ? "selected" : "",
                                !hpLabels.length ? "result-matrix-edge-right" : "",
                                isLastRow ? "result-matrix-edge-bottom" : "",
                              ].filter(Boolean).join(" ")}
                              disabled={!rowResult}
                              onClick={() => {
                                if (rowResult) setSelected(selected === rowResult ? null : rowResult);
                              }}
                            >
                              {defenderFirst ? formatAttackLabel(rowLabel, context) : formatDefenseLabel(rowLabel, context)}
                            </button>
                            <button
                              className={[
                                "result-matrix-cell",
                                isSelectedRow ? "selected" : "",
                                !hpLabels.length ? "result-matrix-edge-right" : "",
                                isLastRow ? "result-matrix-edge-bottom" : "",
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
                                    isLastRow ? "result-matrix-edge-bottom" : "",
                                  ].filter(Boolean).join(" ")}
                                  key={`${rowLabel}-${hpLabel}`}
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
  const panelRef = useRef<HTMLElement | null>(null);
  usePluginPanelMove(panelRef, setPosition);
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
    <section ref={panelRef} className="required-power-panel" data-overlay-control data-plugin-resizable style={{ left: position.x, top: position.y }}>
      <PluginResizeEdges />
      <header onPointerDown={startDrag}>
        <div>
          <strong>判死所需威力</strong>
          <span><EntityLabel kind="pet" value={context?.attackerPetName || ""}>{context?.attackerName || "敌方"}</EntityLabel> 击杀 <EntityLabel kind="pet" value={context?.defenderPetName || ""}>{context?.defenderName || "我方"}</EntityLabel>（{value.target_hp} HP）</span>
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
        <b>{item.damage}{item.is_triggered ? "*" : ""}</b>
        <small>{item.hp_results.map(({ damage_percent }) => `${Math.round(damage_percent)}%`).join(" / ")}</small>
      </span>)}
    </div>)}
  </div>;
}

const ELEMENT_RESULT_COLORS: Record<string, string> = {
  "光": "rgb(79, 192, 255)",
  "冰": "rgb(99, 174, 218)",
  "地": "rgb(152, 125, 68)",
  "幻": "rgb(156, 169, 255)",
  "幽": "rgb(148, 70, 236)",
  "恶": "rgb(207, 70, 122)",
  "普通": "rgb(244, 238, 225)",
  "机械": "rgb(36, 185, 163)",
  "武": "rgb(255, 149, 49)",
  "毒": "rgb(186, 98, 224)",
  "水": "rgb(98, 168, 255)",
  "火": "rgb(223, 86, 30)",
  "电": "rgb(229, 202, 0)",
  "翼": "rgb(62, 199, 202)",
  "草": "rgb(78, 188, 115)",
  "萌": "rgb(255, 124, 177)",
  "虫": "rgb(158, 206, 33)",
  "龙": "rgb(232, 74, 96)",
};

function EnemyAttackSkillPanel({ value, onBack, onPickSkill, onClose }: { value: EnemyAttackSkillResponse; onBack?: () => void; onPickSkill: () => void; onClose: () => void }) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  usePluginPanelMove(panelRef, setPosition);
  const dragRef = useRef<{ pointerId: number; pointerX: number; pointerY: number; x: number; y: number } | null>(null);

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    dragRef.current = { pointerId: event.pointerId, pointerX: event.clientX, pointerY: event.clientY, x: rect.left, y: rect.top };
    setPosition({ x: rect.left, y: rect.top });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const start = dragRef.current;
    const panel = panelRef.current;
    if (!start || start.pointerId !== event.pointerId || !panel) return;
    setPosition({
      x: Math.min(Math.max(8, start.x + event.clientX - start.pointerX), Math.max(8, window.innerWidth - panel.offsetWidth - 8)),
      y: Math.min(Math.max(8, start.y + event.clientY - start.pointerY), Math.max(8, window.innerHeight - panel.offsetHeight - 8)),
    });
  }

  function stopDrag(event: ReactPointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function hitExpression(cell: EnemyAttackSkillCell, field: "power" | "damage") {
    const segments = cell.hitSegments || [];
    const total = field === "power" ? cell.totalSkillPower : cell.damage;
    const numberText = (number: number) => Number(number.toFixed(6)).toString();
    const terms = segments.map((segment) => segment[field] == null ? "-" : `${numberText(segment[field]!)}${segment.combo > 1 ? `*${segment.combo}` : ""}`);
    if (field === "damage" && cell.extraDamage) terms.push(numberText(cell.extraDamage));
    return `${terms.join(" + ")}=${total == null ? "-" : numberText(total)}`;
  }

  function powerText(cell: EnemyAttackSkillCell) {
    return cell.hitSegments?.some((segment) => segment.combo > 1) ? hitExpression(cell, "power") : String(cell.skillPower ?? "-");
  }

  function sampleTitle(sample: EnemyAttackSample) {
    if (!sample.cell) return "没有对应攻击档位";
    const label = sample.kind === "base" ? "无叠层" : sample.kind === "middle" ? "中间值" : sample.killed ? "最少击杀层数" : "当前叠层上限内未达到击杀";
    return `${label}；${sample.cell.stackValues.join("/") || 0} 层；威力 ${powerText(sample.cell)}；伤害 ${hitExpression(sample.cell, "damage")}`;
  }

  return (
    <section ref={panelRef} className="enemy-attack-panel" data-overlay-control data-plugin-resizable role="dialog" aria-label="敌方攻击技能结果" style={position ? { left: position.x, top: position.y, transform: "none" } : undefined}>
      <PluginResizeEdges />
      <header className="enemy-attack-panel-header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}>
        {onBack ? <button onClick={onBack} aria-label="返回最初结果" title="返回最初结果">←</button> : null}
        <div>
          <strong>敌方攻击我方</strong>
          <span>当前我方 HP：{value.targetHp ?? "未识别"}{value.targetHp == null && value.maxHp > 0 ? `（最大 ${value.maxHp}）` : ""}</span>
        </div>
        <button onClick={onPickSkill}>选择技能计算</button>
        <button onClick={onClose} aria-label="关闭" title="关闭">×</button>
      </header>
      <div className="enemy-attack-groups">
        {value.groups.length ? value.groups.map((group) => {
          const rows = enemyAttackRows(group, value.targetHp, value.maxHp);
          const tableHeight = 26 + rows.slice(0, 6).reduce((height, skill) => height + (skill.stackable ? 52 : 26) + 2, 0);
          return (
            <section className="enemy-attack-group" key={group.attackType}>
              <div className={`enemy-attack-table${rows.length > 6 ? " is-scrollable" : ""}`} role="table" aria-label={`${group.attackType}技能伤害`} style={{ "--enemy-attack-table-height": `${tableHeight}px` } as CSSProperties}>
                <div className="enemy-attack-grid enemy-attack-grid-heading" role="row">
                  {[group.attackType, "威力", "++", "+", "无"].map((label) => <strong role="columnheader" key={label}>{label}</strong>)}
                </div>
                {rows.map((skill) => {
                  const backgroundColor = ELEMENT_RESULT_COLORS[skill.element] || ELEMENT_RESULT_COLORS["普通"];
                  const skillName = `${skill.skillName}${skill.triggered ? "*" : ""}`;
                  const description = [skillName, skill.description || "暂无描述"].join("\n");
                  return <div className="enemy-attack-grid enemy-attack-row" role="row" key={`${skill.skillName}-${skill.caseLabel}`} style={{ "--enemy-attack-row-height": skill.stackable ? "52px" : "26px" } as CSSProperties}>
                    <div className="enemy-attack-cell enemy-attack-skill-heading" role="cell" style={{ backgroundColor }} title={description}>
                      <strong><EntityLabel kind="skill" value={skill.skillName} title={description}>{skillName}</EntityLabel></strong>
                    </div>
                    <div className="enemy-attack-cell enemy-attack-powers" role="cell" style={{ backgroundColor }}>
                      {Array.from({ length: skill.stackable ? 3 : 1 }, (_, index) => <span key={index} title={skill.columns.map((column) => `${column.label || "无"}：${sampleTitle(column.samples[index])}`).join("\n")}>
                        {enemyAttackPowerText(skill.columns.map((column) => column.samples[index].cell))}
                      </span>)}
                    </div>
                    {skill.columns.map((column) => <div className="enemy-attack-cell" role="cell" key={column.label} style={{ backgroundColor }}>
                      {column.samples.map((sample) => <div className="enemy-attack-sample" key={sample.kind} title={sampleTitle(sample)}>
                        {skill.stackable && sample.cell ? <small>{sample.cell.stackValues.length > 1 ? sample.cell.stackValues.join("/") : sample.cell.stacks}层{sample.kind === "kill" && !sample.killed ? "未达" : ""}</small> : null}
                        <span>{sample.cell?.damage ?? "-"}</span>
                      </div>)}
                    </div>)}
                  </div>;
                })}
              </div>
            </section>
          );
        }) : <p className="enemy-attack-empty">没有可用的攻击技能</p>}
      </div>
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
  const [pluginVisibility, setPluginVisibility] = useState(() => savedPluginVisibility(configs));
  const [message, setMessage] = useState("");
  const [configIndex, setConfigIndex] = useState<"team" | "preset" | "burst" | "plugin">("team");
  const [sectionTitle, setSectionTitle] = useState(() => UI_TOKEN_SECTIONS[0]?.title || "");
  const visibleSections = useMemo(
    () => UI_TOKEN_SECTIONS.filter((section) => configIndex === "preset" ? section.title.startsWith("精灵保存：") : configIndex === "team" ? !section.title.startsWith("精灵保存：") : false),
    [configIndex],
  );
  const activeSection = visibleSections.find((section) => section.title === sectionTitle) || visibleSections[0];
  useEffect(() => {
    setValues(uiTokenValues(configs));
    setPluginVisibility(savedPluginVisibility(configs));
  }, [configs]);

  async function save() {
    try {
      if (configIndex === "plugin") {
        const data = await invoke<{ configs: PickerConfigs }>("save_picker_config", {
          payload: { section: "team_layout", values: { plugin_visibility: pluginVisibility } },
        });
        onConfigsChanged(data.configs);
        setMessage("插件模式显示配置已保存");
        return;
      }
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

  function switchConfigIndex(nextIndex: "team" | "preset" | "burst" | "plugin") {
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
        <button className={configIndex === "plugin" ? "active" : ""} onClick={() => switchConfigIndex("plugin")}>插件模式</button>
      </nav>
      {configIndex !== "burst" && configIndex !== "plugin" ? <nav className="settings-section-index" aria-label="配置分区">
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
      {configIndex === "plugin" ? <div className="plugin-visibility-settings">
        <p>勾选需要显示的框，点击“保存配置”生效。</p>
        <section className="settings-token-section">
          <h3>固定显示</h3>
          {["我方队伍框", "敌方队伍框", "我方萌化框", "敌方萌化框", "我方特性框", "敌方特性框", "计算和对局重置框", "对局重置"].map((label) => <label className="plugin-visibility-option" key={label}><input type="checkbox" checked disabled /><span>{label}（不能关闭）</span></label>)}
        </section>
        {PLUGIN_VISIBILITY_GROUPS.map((group) => <section className="settings-token-section" key={group.title}>
          <h3>{group.title}</h3>
          {group.items.map(([key, label]) => <label className="plugin-visibility-option" key={key}>
            <input type="checkbox" checked={pluginVisibility[key]} onChange={(event) => { setPluginVisibility((current) => ({ ...current, [key]: event.target.checked })); setMessage(""); }} />
            <span>{label}</span>
          </label>)}
        </section>)}
      </div> : configIndex === "burst" ? (
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
          <strong>{effect.kind === "skill" ? <EntityLabel kind="skill" value={effect.name} /> : effect.name}</strong>
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
  const [tab, setTab] = useState<"team" | "presets" | "settings">("team");
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
  const megaPetIcons = useMemo(() => new Set((data?.pets || [])
    .filter((pet) => pet.evolutionStage === "mega")
    .flatMap((pet) => [pet.label, `${pet.id}${pet.name}`, pet.name].map(normalizePetIconName))), [data?.pets]);

  return (
    <MegaPetIconContext.Provider value={megaPetIcons}>
    <main className={`${tab === "presets" ? "app-shell preset-shell" : "app-shell"}${overlayAttached ? " overlay-attached" : ""}`} style={data ? (previewUiTokens ? uiTokenStyleFromValues(previewUiTokens) : uiTokenStyle(data.configs)) : undefined}>
      <header className="app-header overlay-header" onPointerDown={dragWindow}>
        <nav className="tabs">
          <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>队伍面板</button>
          <button className={tab === "presets" ? "active" : ""} onClick={() => setTab("presets")}>精灵保存</button>
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
          <div className="battle-view" hidden={tab !== "settings"}>
            <InterfaceSettingsPage configs={data.configs} onConfigsChanged={(configs) => setData({ ...data, configs })} onPreviewValues={setPreviewUiTokens} burstEffects={data.burstEffects} />
          </div>
        </>
      ) : (
        <section className="loading-panel">正在读取 Python 核心和 JSON 数据...</section>
      )}
    </main>
    </MegaPetIconContext.Provider>
  );
}

export default App;
