import { type PickerConfigs } from "../../services/desktopTypes";
import { type CSSProperties } from "react";
import { UI_TOKEN_SPEC, UI_TOKEN_CSS_UNIT, type UiTokenKey } from "./uiTokenSpec";

const UI_TOKEN_DEFAULTS = Object.fromEntries(
  Object.entries(UI_TOKEN_SPEC).map(([key, spec]) => [key, spec.defaultValue]),
) as Record<UiTokenKey, number>;

const PREVIOUS_DEFAULT_WINDOW_SIZE = {
  width: 586,
  height: 774,
} as const;

type UiTokenField = { key: keyof typeof UI_TOKEN_DEFAULTS; label: string; min: number; max: number };

const tokenField = (key: keyof typeof UI_TOKEN_DEFAULTS, label: string): UiTokenField => {
  const { min, max } = UI_TOKEN_SPEC[key];
  return { key, label, min, max };
};

const UI_TOKEN_SECTIONS: Array<{ title: string; fields: UiTokenField[] }> = [
  {
    title: "天气",
    fields: [tokenField("weather-panel-width", "天气外框宽度"), tokenField("weather-panel-height", "天气外框高度"), tokenField("weather-label-font-size", "天气文本大小"), tokenField("weather-select-width", "天气选择框宽度"), tokenField("weather-select-height", "天气选择框高度"), tokenField("weather-select-font-size", "天气选择框文本大小")],
  },
  {
    title: "奉献",
    fields: [tokenField("dedication-button-width", "奉献按钮宽度"), tokenField("dedication-button-height", "奉献按钮高度"), tokenField("dedication-button-font-size", "奉献按钮文本大小"), tokenField("dedication-panel-width", "奉献面板宽度"), tokenField("dedication-panel-height", "奉献面板高度"), tokenField("dedication-label-font-size", "奉献字段文本大小"), tokenField("dedication-input-width", "奉献数值框宽度"), tokenField("dedication-input-height", "奉献数值框高度"), tokenField("dedication-input-font-size", "奉献数值文本大小")],
  },
  {
    title: "印记",
    fields: [tokenField("marks-button-width", "印记按钮宽度"), tokenField("marks-button-height", "印记按钮高度"), tokenField("marks-button-font-size", "印记按钮文本大小"), tokenField("marks-panel-width", "印记面板宽度"), tokenField("marks-panel-height", "印记面板高度"), tokenField("marks-label-font-size", "印记字段文本大小"), tokenField("marks-input-width", "印记数值框宽度"), tokenField("marks-input-height", "印记数值框高度"), tokenField("marks-input-font-size", "印记数值文本大小"), tokenField("marks-add-label-font-size", "新增印记文本大小"), tokenField("marks-add-select-width", "新增印记选择框宽度"), tokenField("marks-add-select-height", "新增印记选择框高度"), tokenField("marks-add-select-font-size", "新增印记选择框文本大小")],
  },
  {
    title: "雷暴",
    fields: [tokenField("thunderstorm-button-width", "雷暴按钮宽度"), tokenField("thunderstorm-button-height", "雷暴按钮高度"), tokenField("thunderstorm-button-font-size", "雷暴按钮文本大小"), tokenField("thunderstorm-panel-width", "雷暴面板宽度"), tokenField("thunderstorm-panel-height", "雷暴面板高度"), tokenField("thunderstorm-label-font-size", "雷暴选项文本大小")],
  },
  {
    title: "区域布局",
    fields: [
      tokenField("team-region-width", "队伍区域宽度"), tokenField("team-region-height", "队伍区域最小高度"),
      tokenField("buff-region-width", "Buff 区域宽度"), tokenField("buff-region-height", "Buff 区域最小高度"),
      tokenField("skill-region-width", "技能区域宽度"), tokenField("skill-region-height", "技能区域最小高度"),
    ],
  },
  {
    title: "队伍配置",
    fields: [
      tokenField("team-slot-count", "每方精灵数量"),
      tokenField("team-skill-card-count", "技能卡数量"),
      tokenField("team-action-frame-width", "操作外框宽度"),
      tokenField("team-action-frame-height", "操作外框高度"),
      tokenField("direction-button-width", "方向按钮宽度"),
      tokenField("direction-button-height", "方向按钮高度"),
      tokenField("direction-button-font-size", "方向按钮文本大小"),
      tokenField("calc-button-width", "计算按钮宽度"),
      tokenField("calc-button-height", "计算按钮高度"),
      tokenField("calc-button-font-size", "计算按钮文本大小"),
      tokenField("buff-button-width", "Buff按钮宽度"),
      tokenField("buff-button-height", "Buff按钮高度"),
      tokenField("buff-button-font-size", "Buff按钮文本大小"),
      tokenField("buff-option-width", "Buff选项宽度"),
    ],
  },
  {
    title: "队伍区域",
    fields: [
      tokenField("team-title-font-size", "队伍标题文本大小"),
      tokenField("import-group-width", "导入分组宽度"), tokenField("import-group-height", "导入分组高度"), tokenField("import-group-font-size", "导入分组文本大小"),
      tokenField("team-pet-width", "队伍精灵宽度"), tokenField("team-pet-height", "队伍精灵高度"), tokenField("team-pet-font-size", "队伍精灵文本大小"),
    ],
  },
  {
    title: "萌化与超进化",
    fields: [
      tokenField("devolution-width", "萌化宽度"), tokenField("devolution-height", "萌化高度"), tokenField("devolution-font-size", "萌化文本大小"), tokenField("devolution-number-font-size", "萌化框内数字大小"),
      tokenField("mega-width", "超进化宽度"), tokenField("mega-height", "超进化高度"), tokenField("mega-font-size", "超进化框内文本大小"),
      tokenField("evolution-reset-width", "萌化与超进化重置宽度"), tokenField("evolution-reset-height", "萌化与超进化重置高度"), tokenField("evolution-reset-font-size", "萌化与超进化重置文本大小"),
    ],
  },
  {
    title: "天分与性格",
    fields: [
      tokenField("iv-width", "天分宽度"), tokenField("iv-height", "天分高度"), tokenField("iv-font-size", "天分文本大小"), tokenField("iv-number-font-size", "天分框内数字大小"),
      tokenField("personality-width", "性格宽度"), tokenField("personality-height", "性格高度"), tokenField("personality-font-size", "性格文本大小"), tokenField("personality-number-font-size", "性格框内文本大小"),
      tokenField("iv-reset-width", "天分与性格重置宽度"), tokenField("iv-reset-height", "天分与性格重置高度"), tokenField("iv-reset-font-size", "天分与性格重置文本大小"),
    ],
  },
  {
    title: "特性",
    fields: [
      tokenField("trait-font-size", "特性文本大小"),
      tokenField("trait-trigger-width", "特性触发宽度"), tokenField("trait-trigger-height", "特性触发高度"), tokenField("trait-trigger-font-size", "特性触发文本大小"),
      tokenField("trait-select-width", "特性选特宽度"), tokenField("trait-select-height", "特性选特高度"), tokenField("trait-select-font-size", "特性选特文本大小"),
      tokenField("trait-stack-width", "特性叠加宽度"), tokenField("trait-stack-height", "特性叠加高度"), tokenField("trait-stack-font-size", "特性叠加文本大小"), tokenField("trait-stack-number-font-size", "特性叠加框内数字大小"),
      tokenField("trait-reset-width", "特性重置宽度"), tokenField("trait-reset-height", "特性重置高度"), tokenField("trait-reset-font-size", "特性重置文本大小"),
    ],
  },
  {
    title: "Buff 区域",
    fields: [
      tokenField("buff-title-font-size", "Buff 标题文本大小"),
      tokenField("buff-width", "Buff 数字框宽度"), tokenField("buff-height", "Buff 数字框高度"), tokenField("buff-font-size", "Buff 文本大小"), tokenField("buff-number-font-size", "Buff 框内数字大小"),
      tokenField("skill-usage-width", "使用+宽度"), tokenField("skill-usage-height", "使用+高度"), tokenField("skill-usage-font-size", "使用+文本大小"), tokenField("skill-usage-number-font-size", "使用+框内数字大小"),
      tokenField("buff-reset-width", "Buff 重置宽度"), tokenField("buff-reset-height", "Buff 重置高度"), tokenField("buff-reset-font-size", "Buff 重置文本大小"),
    ],
  },
  {
    title: "技能区域",
    fields: [
      tokenField("skill-title-font-size", "技能标题文本大小"),
      tokenField("skill-card-width", "技能卡片宽度"), tokenField("skill-card-height", "技能卡片高度"), tokenField("skill-card-font-size", "技能卡片文本大小"),
      tokenField("skill-stack-width", "叠加宽度"), tokenField("skill-stack-height", "叠加高度"), tokenField("skill-stack-font-size", "叠加文本大小"), tokenField("skill-stack-number-font-size", "叠加框内数字大小"),
      tokenField("skill-reset-width", "技能重置宽度"), tokenField("skill-reset-height", "技能重置高度"), tokenField("skill-reset-font-size", "技能重置文本大小"),
    ],
  },
  {
    title: "窗口",
    fields: [
      tokenField("window-width", "窗口宽度"), tokenField("window-height", "窗口高度"),
    ],
  },
];

UI_TOKEN_SECTIONS.push({
  title: "精灵保存：固定文本",
  fields: [
    tokenField("preset-library-title-font-size", "精灵预设文本大小"),
    tokenField("preset-settings-title-font-size", "保存设置文本大小"),
    tokenField("preset-skills-title-font-size", "技能文本大小"),
    tokenField("preset-group-label-font-size", "分组文本大小"),
    tokenField("preset-iv-title-font-size", "天分与性格文本大小"),
    tokenField("preset-trait-summary-font-size", "特性摘要文本大小"),
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
      tokenField(`${key}-font-size` as keyof typeof UI_TOKEN_DEFAULTS, `${label}文本大小`),
      tokenField(`${key}-number-font-size` as keyof typeof UI_TOKEN_DEFAULTS, `${label}框内数字大小`),
      tokenField(`${key}-width` as keyof typeof UI_TOKEN_DEFAULTS, `${label}框宽`),
      tokenField(`${key}-height` as keyof typeof UI_TOKEN_DEFAULTS, `${label}框高`),
    ]),
  });
});

const UI_TOKEN_FIELDS = UI_TOKEN_SECTIONS.flatMap((section) => section.fields);

type UiTokenValues = Record<keyof typeof UI_TOKEN_DEFAULTS, number>;

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
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [`--${key}`, `${value}${UI_TOKEN_SPEC[key as keyof typeof UI_TOKEN_DEFAULTS]?.unit ?? UI_TOKEN_CSS_UNIT}`])) as CSSProperties;
}

function uiTokenStyle(configs: PickerConfigs) {
  return uiTokenStyleFromValues(uiTokenValues(configs));
}

export { uiTokenValues, type UiTokenValues, UI_TOKEN_SECTIONS, UI_TOKEN_DEFAULTS, UI_TOKEN_FIELDS, uiTokenStyleFromValues, uiTokenStyle };
