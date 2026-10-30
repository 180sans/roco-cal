import { type PickerConfigs } from "../../services/desktopTypes";
import { type CSSProperties } from "react";
import { uiTokenValues } from "../settings/uiTokens";
import { type BonusToolPositions } from "../../domain/unitState";

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

type DetectionReadoutLayouts = Record<"health" | "powers", { x: number; y: number; width?: number; height?: number } & PluginContentOffset>;

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
    health: { x: coordinate(saved?.health?.x), y: coordinate(saved?.health?.y), ...readPluginPanelSize(saved?.health || {}), ...readPluginContentOffset(saved?.health || {}) },
    powers: { x: coordinate(saved?.powers?.x), y: coordinate(saved?.powers?.y), ...readPluginPanelSize(saved?.powers || {}), ...readPluginContentOffset(saved?.powers || {}) },
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

function readPluginPanelSize(values: Record<string, unknown>): { width?: number; height?: number } {
  const width = Number(values.width);
  const height = Number(values.height);
  return {
    ...(Number.isFinite(width) && width > 0 ? { width } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height } : {}),
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
      ? [[id, { x, y, ...readPluginPanelSize(item as Record<string, unknown>), ...readPluginContentOffset(item as Record<string, unknown>) }]] : [];
  }));
}

export { type PluginOverlayLayout, type PluginVisibility, snapToGrid, pluginContentStyle, type PanelState, type TeamRegionPositions, savedTeamRegionPositions, type PluginOverlayLayouts, savedPluginOverlayLayouts, type DetectionRegions, savedDetectionRegions, type DetectionGroup, type CalibrationResult, PLUGIN_DENSITY_OPTIONS, type DetectionReadoutLayouts, savedDetectionReadoutLayouts, type DetectionReadoutCoordinateMode, savedDetectionReadoutCoordinateMode, type RecognitionStatus, savedBonusToolPositions, savedPluginVisibility, type TeamRegionId, type TeamRegionPosition, defaultPluginOverlayLayout, type TargetCapture, BATTLE_START_IMAGE_KEYS, BATTLE_LIVE_IMAGE_KEYS, BATTLE_LIVE_HEALTH_KEYS, type PluginContentOffset, withReplayDetectionSizes, initialTeamRegionPositions, DEFAULT_DETECTION_REGIONS, pluginDensityStyle, detectionLabel, BATTLE_LIVE_NUMBER_KEYS, panelState, PLUGIN_VISIBILITY_GROUPS };
