import { useBattleCalculation } from "./useBattleCalculation";
import { trackPointerMovement } from "../../shared/pointerTracking";
import { useBattleRecognition } from "./useBattleRecognition";
import { useLatestEffect, useLatestRequest } from "../../services/useLatestRequest";
import { selectBattleSides } from "../../domain/battleRequests";
import { saveConfigPatch } from "../../services/configSaves";
import { useOptimisticConfig } from "../../services/useOptimisticConfig";
import {
  type PresetGroup,
  type Pet,
  type PickerConfigs,
  type BurstEffectItem,
  type UnitState,
  type TeamOtherBonuses,
  type BattleResult,
  type QuickSkillResult,
  type RequiredPowerResponse,
  type WillpowerResponse,
  type BuffOption,
  type BuffShortcutEntry,
  type EnemyAttackPayload,
  type SkillListResult,
  type ApplySkillBuffsResult,
  BUFF_STATE_FIELDS,
} from "../../services/desktopTypes";
import {
  useState,
  useRef,
  useMemo,
  useEffect,
  useLayoutEffect,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
} from "react";
import { type EnemyAttackSkillResponse } from "../../enemyAttack";
import { desktopApi } from "../../services/desktopApi";

import { beginPluginLongPressDrag, pluginResizeEdges } from "../../pluginLongPressDrag";
import defaultConfigs from "../../../src-tauri/resources/rocodatebase/data/configs.json";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, cursorPosition } from "@tauri-apps/api/window";
import { WEATHER_OPTIONS, DEFAULT_SKILL_CARD_COUNT, SKILL_TYPE_FILTERS } from "../../domain/constants";
import { uiTokenValues } from "../settings/uiTokens";
import {
  type TeamRegionPositions,
  savedTeamRegionPositions,
  type PluginOverlayLayouts,
  savedPluginOverlayLayouts,
  type DetectionRegions,
  savedDetectionRegions,
  type DetectionGroup,
  type CalibrationResult,
  PLUGIN_DENSITY_OPTIONS,
  type DetectionReadoutLayouts,
  savedDetectionReadoutLayouts,
  type DetectionReadoutCoordinateMode,
  savedDetectionReadoutCoordinateMode,
  type RecognitionStatus,
  savedBonusToolPositions,
  savedPluginVisibility,
  type TeamRegionId,
  type TeamRegionPosition,
  defaultPluginOverlayLayout,
  type PluginOverlayLayout,
  type TargetCapture,
  BATTLE_START_IMAGE_KEYS,
  BATTLE_LIVE_IMAGE_KEYS,
  BATTLE_LIVE_HEALTH_KEYS,
  snapToGrid,
  type PluginContentOffset,
  pluginContentStyle,
  withReplayDetectionSizes,
  initialTeamRegionPositions,
  DEFAULT_DETECTION_REGIONS,
  pluginDensityStyle,
  detectionLabel,
  BATTLE_LIVE_NUMBER_KEYS,
  panelState,
} from "../plugin/layout";
import { blankUnit, blankTeamOtherBonuses, type MarkField, type BattleContext, type BonusTool, type BonusToolPositions, unitFromPreset, mergePresetIntoUnit } from "../../domain/unitState";
import {
  usePluginPanelMove,
  traitSummaryAtPoint,
  pluginPanelMoves,
  PluginResizeEdges,
  FloatingTeamPanel,
  TeamActionPanel,
} from "../plugin/PluginPanels";
import { asError } from "../../shared/errors";
import { skillCardSlots } from "../../components/picker/skillPresentation";
import { ResultView, RequiredPowerView, EnemyAttackSkillPanel } from "./Results";
import { useWatchConfiguration, EnemyWatchSkillsPanel } from "../watch/WatchSkills";
import { Roster } from "./Roster";
import { SpeedLine } from "./SpeedLine";
import { TeamTraitEditor } from "../units/UnitEditors";
import { TeamBuffPanel } from "./TeamBuffPanel";
import { TeamSkillCards } from "./SkillCards";
import { SkillOrderPanel } from "./SkillOrderPanel";
import { PickerIcon, EntityLabel } from "../../components/common/EntityLabel";
import { BattleBonusToolPanel } from "./BonusPanels";
import { PickerModal } from "../../components/picker/PickerModal";

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
  const [skillOrderTarget, setSkillOrderTarget] = useState<{ index: number; unit: UnitState } | null>(null);
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
  const [buffShortcutSide, setBuffShortcutSide] = useState<"left" | "right" | null>(null);
  const [buffShortcutEntries, setBuffShortcutEntries] = useState<BuffShortcutEntry[]>([]);
  const [buffShortcutTab, setBuffShortcutTab] = useState<"pet" | "library">("pet");
  const [buffShortcutQuery, setBuffShortcutQuery] = useState("");
  const [buffShortcutElement, setBuffShortcutElement] = useState("");
  const [buffShortcutSkillType, setBuffShortcutSkillType] = useState("");
  const [buffShortcutSelections, setBuffShortcutSelections] = useState<Record<string, number>>({});
  const [buffShortcutLoading, setBuffShortcutLoading] = useState(false);
  const buffShortcutPanelRef = useRef<HTMLElement | null>(null);
  const buffShortcutLayout = overlayLayouts["buff-shortcut"];
  usePluginPanelMove(buffShortcutPanelRef, (position) => updateOverlayLayout("buff-shortcut", position));
  useLayoutEffect(() => {
    const panel = buffShortcutPanelRef.current;
    if (!panel || buffShortcutLayout) return;
    const bounds = panel.getBoundingClientRect();
    defaultOverlayLayoutsRef.current["buff-shortcut"] = { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
  }, [buffShortcutSide, buffShortcutTab]);
  const [openBonusTools, setOpenBonusTools] = useState<Array<{ side: "left" | "right"; tool: BonusTool }>>([]);
  const [bonusToolPositions, setBonusToolPositions] = useState<BonusToolPositions>(() => savedBonusToolPositions(configs));
  const enemyAttackPayloadRef = useRef<EnemyAttackPayload | null>(null);
  const [enemySkillPicker, setEnemySkillPicker] = useState(false);
  const [enemySkillData, setEnemySkillData] = useState<SkillListResult>({ petSkills: [], allSkills: [] });
  const calculationInputKey = JSON.stringify([leftIndex, rightIndex, leftSlots[leftIndex], rightSlots[rightIndex], leftOtherBonuses, rightOtherBonuses, leftAttacks, weather]);
  // These calculations publish to the same results surface; list panels own separate scopes.
  const resultRequests = useLatestRequest(calculationInputKey);
  const quickSkillRequests = useLatestRequest(calculationInputKey, teamSkillCardCount);
  const requiredPowerRequests = useLatestRequest(targetHp);
  const enemyPickerRequests = useLatestRequest(enemyAttackPayloadRef.current);
  const [layoutMessage, setLayoutMessage] = useState("");
  const [targetHwnd, setTargetHwnd] = useState("");
  const [targetStatus, setTargetStatus] = useState("");
  const targetStatusTimerRef = useRef<number | undefined>(undefined);
  const calculateQuickSkillsRef = useRef<() => void>(() => undefined);
  const calculateEnemyAttackSkillsRef = useRef<() => void>(() => undefined);
  const hideQuickSkillResultsRef = useRef<() => void>(() => undefined);
  const alignTraitStacksRef = useRef<() => void>(() => undefined);
  const openSkillOrderRef = useRef<() => void>(() => undefined);
  const [targetAttached, setTargetAttached] = useState(false);
  const [mixedMode, setMixedMode] = useState(false);
  const mixedModeTokenRef = useRef(0);
  const [displayMode, setDisplayMode] = useState<"normal" | "plugin">(
    configs.team_layout?.display_mode === "normal" ? "normal" : "plugin",
  );
  const enemyAttackRequests = useLatestRequest(calculationInputKey, displayMode);
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
  const activeBuffSkillNames = useMemo(() => displayMode === "plugin"
    ? (activeBuffUnit?.skills || []).filter(Boolean)
    : activeBuffSkillName ? [activeBuffSkillName] : [], [displayMode, activeBuffUnit?.skills, activeBuffSkillName]);
  const activeBuffSkillKey = JSON.stringify(activeBuffSkillNames);
  const buffShortcutPetName = buffShortcutSide === "left" ? leftSlots[leftIndex]?.name || "" : buffShortcutSide === "right" ? rightSlots[rightIndex]?.name || "" : "";
  const filteredBuffShortcutEntries = useMemo(() => {
    const query = buffShortcutQuery.trim().toLowerCase();
    return buffShortcutEntries.filter((entry) =>
      (buffShortcutTab === "library" || entry.currentPet)
      && (!query || entry.name.toLowerCase().includes(query) || (entry.description || "").toLowerCase().includes(query) || entry.options.some((option) => option.label.toLowerCase().includes(query)))
      && (!buffShortcutElement || entry.element === buffShortcutElement)
      && (!buffShortcutSkillType || (entry.type === "变化" ? "状态" : entry.type) === buffShortcutSkillType),
    );
  }, [buffShortcutEntries, buffShortcutTab, buffShortcutQuery, buffShortcutElement, buffShortcutSkillType]);

  function openBuffShortcut(side: "left" | "right") {
    setBuffShortcutSide(side);
    setBuffShortcutQuery("");
    setBuffShortcutElement("");
    setBuffShortcutSkillType("");
    setBuffShortcutSelections({});
  }

  function openSkillOrder() {
    if (displayMode !== "plugin") return;
    setSkillOrderTarget((current) => current || { index: leftIndex, unit: leftSlots[leftIndex] });
  }

  function saveSkillOrder(skills: string[]) {
    if (!skillOrderTarget) return;
    const { index, unit } = skillOrderTarget;
    const removed = new Set(unit.skills.filter((name) => name && !skills.includes(name)));
    setLeftSlots((current) => current[index] !== unit ? current
      : current.map((slot, slotIndex) => slotIndex === index ? {
        ...slot, skills,
        current_skill: removed.has(slot.current_skill) ? skills.find(Boolean) || "" : slot.current_skill,
        ...(removed.size ? {
          skill_trigger_stacks: Object.fromEntries(Object.entries(slot.skill_trigger_stacks).filter(([name]) => !removed.has(name))),
          skill_usage_mode_choices: Object.fromEntries(Object.entries(slot.skill_usage_mode_choices).filter(([name]) => !removed.has(name))),
        } : {}),
      } : slot));
    setSkillOrderTarget(null);
  }

  openSkillOrderRef.current = openSkillOrder;

  useEffect(() => {
    setSkillOrderTarget(null);
  }, [displayMode, leftIndex, leftSlots[leftIndex]]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (displayMode !== "plugin" || !event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      if (event.code !== "KeyY" && event.key.toLowerCase() !== "y") return;
      event.preventDefault();
      openSkillOrderRef.current();
    };
    window.addEventListener("keydown", onKeyDown, true);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen("overlay-skill-order", () => openSkillOrderRef.current()).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    }).catch((err) => setError(asError(err)));
    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown, true);
      unlisten?.();
    };
  }, [displayMode]);

  useEffect(() => {
    if (displayMode !== "plugin") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      const key = event.code === "KeyI" ? "i" : event.code === "KeyO" ? "o" : event.key.toLowerCase();
      if (key !== "i" && key !== "o") return;
      event.preventDefault();
      const side = key === "i" ? "left" : "right";
      openBuffShortcut(side);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [displayMode]);

  useLatestEffect((request) => {
    if (!buffShortcutSide) return;

    setBuffShortcutEntries([]);
    setBuffShortcutLoading(true);
    void desktopApi.listBuffSkills({ petQuery: buffShortcutPetName })
      .then((data) => { if (request.isCurrent()) setBuffShortcutEntries(data.items || []); })
      .catch(() => { if (request.isCurrent()) setBuffShortcutEntries([]); })
      .finally(() => { if (request.isCurrent()) setBuffShortcutLoading(false); });
    return;
  }, [buffShortcutSide, buffShortcutPetName]);

  useEffect(() => {
    quickSkillRequests.invalidate();
    setQuickSkillResults(null);
    setQuickCalculationActive(false);
  }, [leftIndex, leftSlots[leftIndex], rightIndex, rightSlots[rightIndex]]);

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
        ...detectionReadoutLayouts.health,
        x: Math.round(healthBounds.left - layerBounds.left),
        y: Math.round(healthBounds.top - layerBounds.top),
      },
      powers: {
        ...detectionReadoutLayouts.powers,
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
        ...current,
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

  const { recognizeDetection, recognizeSkillPowers, targetCanvas, recognizeNumericImages, alignTraitStacks } = useBattleRecognition({
    pets, setLeftSlots, setRightSlots, setLeftIndex, setRightIndex, leftSlots, rightSlots, sameFamily, detectionRoiRefs, ocrTestMode, targetAttached, setDetectionToast, recognitionBusyRef, calibrationSessionRef, setCalibrationResults, cropDetection, setDetectionMessage, calibrationGroupRef, setRecognitionStatus, setDetectedHealth, setDetectedSkillPowers, displayMode, traitAlignmentSnapshotRef, setError, currentBattleSides, weather, patchSlot, leftIndex, teamSkillCardCount, leftAttacks, rightIndex
  });

  function cropDetection(capture: TargetCapture, key: string) {
    const imageDataUrl = capture.regions[key];
    if (!imageDataUrl) throw new Error(`截图没有包含识别区域：${key}`);
    return imageDataUrl;
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

  const { begin: beginOcrConfigSave } = useOptimisticConfig(ocrTestMode, setOcrTestMode);
  const { begin: beginDensityConfigSave } = useOptimisticConfig(pluginDensity, setPluginDensity);

  async function changeOcrTestMode(enabled: boolean) {
    const change = beginOcrConfigSave(enabled);
    try {
      await saveConfigPatch("team_layout", { ocr_test_mode: enabled }, onConfigsChanged);
      if (!change.commit()) return;
      setDetectionMessage(enabled ? "测试模式已开启：识别输入将保存到本地" : "测试模式已关闭");
    } catch (error) {
      if (change.rollback()) setError(asError(error));
    }
  }

  async function changePluginDensity(density: number) {
    const change = beginDensityConfigSave(density);
    try {
      await saveConfigPatch("team_layout", { plugin_density: density }, onConfigsChanged);
      change.commit();
    } catch (error) {
      if (change.rollback()) setError(asError(error));
    }
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
    trackPointerMovement(move);
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
        [id]: { ...current[id], x: start.x + moveEvent.clientX - start.pointerX, y: start.y + moveEvent.clientY - start.pointerY },
      };
      detectionReadoutLayoutsRef.current = next;
      return next;
    });
    trackPointerMovement(move);
  }

  function detectionReadoutStyle(id: keyof DetectionReadoutLayouts): CSSProperties {
    const layout = detectionReadoutLayouts[id];
    const size = { width: layout.width, height: layout.height, ...pluginContentStyle(layout) };
    if (detectionReadoutCoordinateMode === "page") {
      return { ...size, bottom: "auto", left: layout.x, right: "auto", top: layout.y, transform: "none" };
    }
    return id === "health"
      ? { ...size, transform: `translate(${layout.x}px, ${layout.y}px)` }
      : { ...size, transform: `translate(-50%, 0) translate(${layout.x}px, ${layout.y}px)` };
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
    trackPointerMovement(move);
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
        const next = { ...current, [readoutId]: { ...current[readoutId], x: start.x + dx, y: start.y + dy } };
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

  const resizeContextRef = useRef({ regionPositions, overlayLayouts, bonusToolPositions, moveRegion, updateOverlayLayout, detectionReadoutCoordinateMode });
  resizeContextRef.current = { regionPositions, overlayLayouts, bonusToolPositions, moveRegion, updateOverlayLayout, detectionReadoutCoordinateMode };
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
      const { regionPositions, overlayLayouts, bonusToolPositions, moveRegion, updateOverlayLayout, detectionReadoutCoordinateMode } = resizeContextRef.current;
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
      const bonusId = panel.dataset.pluginBonusId;
      const readoutId = panel.dataset.pluginReadout as keyof DetectionReadoutLayouts | undefined;
      const currentLayout: PluginContentOffset | undefined = regionId
        ? regionPositions[regionId]
        : overlayId
          ? overlayLayouts[overlayId] || defaultPluginOverlayLayout(overlayId)
          : bonusId
            ? bonusToolPositions[bonusId]
            : readoutId ? detectionReadoutLayoutsRef.current[readoutId] : undefined;
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
        else if (bonusId) setBonusToolPositions((current) => ({ ...current, [bonusId]: { ...current[bonusId], x, y, width, height, contentX, contentY } }));
        else {
          if (readoutId && readoutStart) {
            const anchored = detectionReadoutCoordinateMode !== "page";
            const next = { ...detectionReadoutLayoutsRef.current, [readoutId]: {
              ...readoutStart,
              x: readoutStart.x + left - start.left + (anchored ? (width - rect.width) * (readoutId === "health" ? 1 : 0.5) : 0),
              y: readoutStart.y + top - start.top + (anchored ? height - rect.height : 0),
              width, height, contentX, contentY,
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

  const modeSaveRequests = useLatestRequest();

  async function changeDisplayMode(nextMode: "normal" | "plugin") {
    const request = modeSaveRequests.start();
    calibrationSessionRef.current += 1;
    calibrationGroupRef.current = null;
    setDetectionGroup(null);
    setDisplayMode(nextMode);
    onDisplayModeChange(nextMode);
    mixedModeTokenRef.current += 1;
    setMixedMode(false);
    setLayoutMessage("");
    const preparation = desktopApi.setOverlayClickThrough(false).catch(() => undefined);
    try {
      const data = await saveConfigPatch("team_layout", { display_mode: nextMode }, onConfigsChanged, { beforeWrite: () => preparation });
      if (!request.isCurrent()) return;
      if (nextMode === "plugin") {
        setRegionPositions(savedTeamRegionPositions(data.configs, teamValues["team-region-width"], teamValues["team-region-height"]));
        setOverlayLayouts(savedPluginOverlayLayouts(data.configs));
        setBonusToolPositions(savedBonusToolPositions(data.configs));
        setDetectionReadoutLayouts(savedDetectionReadoutLayouts(data.configs));
        setDetectionReadoutCoordinateMode(savedDetectionReadoutCoordinateMode(data.configs));
      }
    } catch (err) {
      if (!request.isCurrent()) return;
      setError(asError(err));
    }
  }

  async function saveCurrentLayout() {
    setLayoutMessage("");
    try {
      await saveConfigPatch("team_layout", {
        regions: regionPositions,
        overlays: overlayLayouts,
        bonus_tool_positions: bonusToolPositions,
        detection_regions: detectionRegions,
        detection_readouts: { ...detectionReadoutLayouts, coordinate_space: detectionReadoutCoordinateMode },
      }, onConfigsChanged);
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
    quickSkillRequests.invalidate();
    setEnemyAttackResults(null);
    enemyAttackRequests.invalidate();
    enemyAttackPayloadRef.current = null;
    setEnemyAttackInitialResults(null);
    enemyPickerRequests.invalidate();
    resultRequests.invalidate();
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
      await desktopApi.setOverlayClickThrough(false).catch(() => undefined);
      const response = await desktopApi.attachOverlayTarget(targetHwnd);
      setTargetAttached(response.attached);
      onOverlayAttachmentChange(response.attached);
      setTargetStatus(`已绑定 ${response.hwnd}`);
    } catch (err) {
      showTemporaryTargetStatus(`绑定失败：${asError(err)}`);
    }
  }

  async function detachTargetWindow() {
    setTargetStatus("");
    try {
      mixedModeTokenRef.current += 1;
      await desktopApi.detachOverlayTarget();
      setTargetAttached(false);
      setMixedMode(false);
      onOverlayAttachmentChange(false);
      setTargetStatus("已解除窗口绑定");
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
    await desktopApi.setOverlayClickThrough(false).catch(() => undefined);
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
            await desktopApi.setOverlayClickThrough(false);
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
        await desktopApi.setOverlayClickThrough(ignore);
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
      void desktopApi.setOverlayClickThrough(false).catch(() => undefined);
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
    trackPointerMovement(move, undefined, true);
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

  useLatestEffect((request) => {

    setBuffOptions([]);
    setSelectedBuffOption(0);
    if (!activeBuffSkillNames.length) return;

    void Promise.all(activeBuffSkillNames.map(async (skillName) => {
      try {
        const data = await desktopApi.applySkillBuffs(currentBuffPayload(skillName));
        if (data.skill_name !== skillName) return [];
        return normalizeBuffOptions(data).map((option) => displayMode === "plugin"
          ? { ...option, label: `${skillName} · ${option.label}` }
          : option);
      } catch {
        return [];
      }
    }))
      .then((options) => {
        if (request.isCurrent()) setBuffOptions(options.flat());
      })
      .catch(() => {
        if (request.isCurrent()) setBuffOptions([]);
      });
    return;
  }, [displayMode, activeBuffSkillKey]);

  function setSlot(side: "left" | "right", index: number, state: UnitState) {
    const setter = side === "left" ? setLeftSlots : setRightSlots;
    setter((slots) => slots.map((slot, i) => (i === index ? state : slot)));
  }

  function patchSlot(side: "left" | "right", index: number, partial: Partial<UnitState>) {
    const slots = side === "left" ? leftSlots : rightSlots;
    setSlot(side, index, { ...slots[index], ...partial });
  }

  function openBonusTool(side: "left" | "right", tool: BonusTool) {
    const id = `${side}-${tool}`;
    if (displayMode === "plugin" && !bonusToolPositions[id] && openBonusTools.length
      && !openBonusTools.some((panel) => panel.side === side && panel.tool === tool)) {
      const previous = openBonusTools[openBonusTools.length - 1];
      const position = bonusToolPositions[`${previous.side}-${previous.tool}`]
        || { x: Math.max(8, window.innerWidth - 348), y: 84 };
      setBonusToolPositions((current) => current[id] ? current : {
        ...current,
        [id]: { x: Math.max(8, position.x - 24), y: Math.min(position.y + 24, Math.max(8, window.innerHeight - 48)) },
      });
    }
    setOpenBonusTools((current) => current.some((panel) => panel.side === side && panel.tool === tool)
      ? current.filter((panel) => panel.side !== side || panel.tool !== tool)
      : [...current, { side, tool }]);
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

  function currentBattleSides(attackFromLeft = leftAttacks) {
    return selectBattleSides(leftSlots[leftIndex], rightSlots[rightIndex], leftOtherBonuses, rightOtherBonuses, attackFromLeft);
  }

  const { calculate, calculateQuickSkills, calculateEnemyAttackSkills, openEnemySkillPicker, calculateWillpower, calculateRequiredPower, selectWillpowerElement, applyShortcutBuff, applyBuff } = useBattleCalculation({
    resultRequests, setError, currentBattleSides, weather, setBattleContext, setResults, setWillpower, setRequiredPower, quickSkillRequests, teamSkillCardCount, setQuickSkillResults, setQuickCalculationActive, displayMode, enemyAttackPayloadRef, enemyAttackRequests, targetAttached, calibrationGroupRef, targetCanvas, recognizeNumericImages, cropDetection, setDetectedHealth, setEnemyAttackResults, setEnemyAttackInitialResults, enemyPickerRequests, setEnemySkillData, setEnemySkillPicker, leftAttacks, setSelectedWillpowerElement, requiredPowerRequests, targetHp, normalizeBuffOptions, leftSlots, rightSlots, leftIndex, rightIndex, setLeftSlots, setRightSlots, buffOptions, selectedBuffOption, currentBuffPayload, setBuffOptions, activeBuffSkillName,
  });

  calculateQuickSkillsRef.current = () => void calculateQuickSkills();
  calculateEnemyAttackSkillsRef.current = () => void calculateEnemyAttackSkills();
  alignTraitStacksRef.current = () => void alignTraitStacks();
  hideQuickSkillResultsRef.current = () => {
    setQuickSkillResults(null);
    setQuickCalculationActive(false);
    quickSkillRequests.invalidate();
    setEnemyAttackResults(null);
    enemyAttackRequests.invalidate();
    enemyPickerRequests.invalidate();
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

  const bonusesArmed = (bonuses: TeamOtherBonuses) =>
    bonuses.dedication_power_stacks > 0 ||
    bonuses.dedication_combo_stacks > 0 ||
    bonuses.charge_mark_stacks > 0 ||
    bonuses.charge_mark_triggered ||
    bonuses.wind_mark_triggered ||
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
            <button onClick={() => void recognizeDetection("battleStart")} disabled={!targetAttached}>战斗初 Ctrl+B</button>
            <button onClick={() => void recognizeDetection("battleLive")} disabled={!targetAttached}>战斗内 Ctrl+U</button>
            <button onClick={() => void recognizeSkillPowers()} disabled={!targetAttached}>威力识别 Ctrl+P</button>
            <button onClick={() => void calculateEnemyAttackSkills()}>敌方攻击 Ctrl+K</button>
          </div>
        </details> : null}
        {targetStatus || layoutMessage || detectionMessage ? <span>{targetStatus || layoutMessage || detectionMessage}</span> : null}
      </div>
      <div className="team-layout" style={teamLayoutStyle} onPointerDown={startTeamRegionDrag}>
        {displayMode === "plugin" && recognitionStatus ? <section className="recognition-status-panel" data-overlay-control data-plugin-resizable data-plugin-overlay-id="recognition-status" style={{ left: overlayLayout("recognition-status").x, top: overlayLayout("recognition-status").y, width: overlayLayouts["recognition-status"]?.width, height: overlayLayouts["recognition-status"]?.height, ...pluginContentStyle(overlayLayouts["recognition-status"]) }} onPointerDown={startRecognitionStatusDrag} role="status" aria-live="polite">
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
          <FloatingTeamPanel panelState={panelState(leftSlots[leftIndex]?.trait_triggered || leftSlots[leftIndex]?.trait_stacks > 0)} className="trait-floating-panel team-left-trait" layout={overlayLayout("left-trait")} onLayoutChange={(partial) => updateOverlayLayout("left-trait", partial)}><TeamTraitEditor pluginMode expanded={openPopover.left === "trait"} onExpandedChange={(next) => togglePopover("left", "trait", next)} value={leftSlots[leftIndex]} pets={pets} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onChange={(partial) => patchSlot("left", leftIndex, partial)} /></FloatingTeamPanel>
          <FloatingTeamPanel panelState={panelState(rightSlots[rightIndex]?.trait_triggered || rightSlots[rightIndex]?.trait_stacks > 0)} className="trait-floating-panel team-right-trait" layout={overlayLayout("right-trait")} onLayoutChange={(partial) => updateOverlayLayout("right-trait", partial)}><TeamTraitEditor pluginMode expanded={openPopover.right === "trait"} onExpandedChange={(next) => togglePopover("right", "trait", next)} value={rightSlots[rightIndex]} pets={pets} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onChange={(partial) => patchSlot("right", rightIndex, partial)} /></FloatingTeamPanel>
        </> : null}
        <section className="team-bonus-toolbar team-left-bonus-toolbar" data-panel-state={panelState(bonusesArmed(leftOtherBonuses))} data-overlay-control data-plugin-resizable={displayMode === "plugin" || undefined} aria-label="己方其他加成">
          {displayMode === "plugin" ? <PluginResizeEdges /> : null}
          <button className="bonus-tool-button willpower" onClick={() => void calculateWillpower("left")}>愿力</button>
          {(["dedication", "marks", "thunderstorm"] as const).map((tool) => (
            <button key={tool} className={`bonus-tool-button ${tool}${openBonusTools.some((panel) => panel.side === "left" && panel.tool === tool) ? " active" : ""}`} aria-pressed={openBonusTools.some((panel) => panel.side === "left" && panel.tool === tool)} onClick={() => openBonusTool("left", tool)}>
              {{ dedication: "奉献", marks: "印记", thunderstorm: "雷暴" }[tool]}
            </button>
          ))}
        </section>
        <section className="team-bonus-toolbar team-right-bonus-toolbar" data-panel-state={panelState(bonusesArmed(rightOtherBonuses))} data-overlay-control data-plugin-resizable={displayMode === "plugin" || undefined} aria-label="敌方其他加成">
          {displayMode === "plugin" ? <PluginResizeEdges /> : null}
          <button className="bonus-tool-button willpower" onClick={() => void calculateWillpower(displayMode === "plugin" ? "right" : undefined)}>愿力</button>
          {(["dedication", "marks", "thunderstorm"] as const).map((tool) => (
            <button key={tool} className={`bonus-tool-button ${tool}${openBonusTools.some((panel) => panel.side === "right" && panel.tool === tool) ? " active" : ""}`} aria-pressed={openBonusTools.some((panel) => panel.side === "right" && panel.tool === tool)} onClick={() => openBonusTool("right", tool)}>
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
        {displayMode === "plugin" && buffShortcutSide ? <section ref={buffShortcutPanelRef} className="plugin-buff-shortcut-panel" data-tab={buffShortcutTab} data-overlay-control data-plugin-resizable data-plugin-overlay-id="buff-shortcut" aria-label={`${buffShortcutSide === "left" ? "我方" : "敌方"} buff 技能`} style={buffShortcutLayout ? { left: buffShortcutLayout.x, top: buffShortcutLayout.y, width: buffShortcutLayout.width, height: buffShortcutLayout.height, transform: "none", ...pluginContentStyle(buffShortcutLayout) } : undefined}>
          <PluginResizeEdges />
          <header><strong>{buffShortcutSide === "left" ? "我方" : "敌方"} Buff 技能表</strong><button type="button" aria-label="关闭 Buff 技能表" onClick={() => setBuffShortcutSide(null)}>×</button></header>
          <div className="plugin-buff-shortcut-tools">
            <input className="plugin-buff-shortcut-search" aria-label="检索 Buff 技能" value={buffShortcutQuery} onChange={(event) => setBuffShortcutQuery(event.target.value)} placeholder="搜索名称、描述或 Buff 效果" autoFocus />
            <div className="segmented plugin-buff-shortcut-tabs" role="tablist" aria-label="技能来源">
              <button type="button" role="tab" id="buff-shortcut-pet-tab" aria-controls="buff-shortcut-results" aria-selected={buffShortcutTab === "pet"} className={buffShortcutTab === "pet" ? "active" : ""} onClick={() => setBuffShortcutTab("pet")}>当前精灵技能</button>
              <button type="button" role="tab" id="buff-shortcut-library-tab" aria-controls="buff-shortcut-results" aria-selected={buffShortcutTab === "library"} className={buffShortcutTab === "library" ? "active" : ""} onClick={() => setBuffShortcutTab("library")}>技能库</button>
            </div>
          </div>
          <div className="plugin-buff-shortcut-filters">
            <div className="picker-element-grid" aria-label="属性筛选">
              {elements.map((element) => <button type="button" key={element} className={buffShortcutElement === element ? "active" : ""} aria-pressed={buffShortcutElement === element} aria-label={element} title={element} onClick={() => setBuffShortcutElement((current) => current === element ? "" : element)}><PickerIcon value={element} /></button>)}
            </div>
            <div className="picker-skill-type-grid" aria-label="技能类型筛选">
              {SKILL_TYPE_FILTERS.map((type) => <button type="button" key={type} className={buffShortcutSkillType === type ? "active" : ""} aria-pressed={buffShortcutSkillType === type} aria-label={type} title={type} onClick={() => setBuffShortcutSkillType((current) => current === type ? "" : type)}><PickerIcon value={type} kind="skill-type" /></button>)}
            </div>
          </div>
          <section className="plugin-buff-shortcut-group" role="tabpanel" id="buff-shortcut-results" aria-labelledby={`buff-shortcut-${buffShortcutTab}-tab`}>
            <div className="plugin-buff-shortcut-columns"><span>技能</span><span>Buff 类型</span><span className="plugin-buff-shortcut-actions-heading">操作</span></div>
            <div className="plugin-buff-shortcut-table">
                {buffShortcutLoading ? <p className="muted">正在加载 Buff 技能…</p> : !filteredBuffShortcutEntries.length ? <p className="muted">{buffShortcutQuery.trim() || buffShortcutElement || buffShortcutSkillType ? "没有匹配的技能" : buffShortcutTab === "pet" ? "当前精灵没有可用 Buff 技能" : "没有可用 Buff 技能"}</p> : filteredBuffShortcutEntries.map((entry) => <div className="plugin-buff-shortcut-entry" key={entry.name}>
                  <div className="plugin-buff-shortcut-skill"><EntityLabel kind="skill" value={entry.name} iconOnly imageLoading="lazy" title={entry.name} /><strong title={entry.name}>{entry.name}</strong>{entry.element ? <PickerIcon value={entry.element} imageLoading="lazy" /> : null}{entry.type ? <PickerIcon value={entry.type} kind="skill-type" imageLoading="lazy" /> : null}</div>
                  <select aria-label={`${entry.name} Buff 类型`} title={entry.options[buffShortcutSelections[entry.name] ?? 0]?.label} value={buffShortcutSelections[entry.name] ?? 0} onChange={(event) => setBuffShortcutSelections((current) => ({ ...current, [entry.name]: Number(event.target.value) }))}>{entry.options.map((option, index) => <option key={`${entry.name}-${index}`} value={index}>{option.label}</option>)}</select>
                  <button type="button" className="buff-button" aria-label={`${entry.name}应用`} onClick={() => void applyShortcutBuff(entry.name, false, buffShortcutSide, buffShortcutSelections[entry.name] ?? 0)}>应用</button>
                  <button type="button" className="buff-button" aria-label={`${entry.name}反向`} onClick={() => void applyShortcutBuff(entry.name, true, buffShortcutSide, buffShortcutSelections[entry.name] ?? 0)}>反向</button>
                </div>)}
            </div>
          </section>
        </section> : null}
        <TeamActionPanel pluginMode={displayMode === "plugin"} visibility={pluginVisibility} layout={displayMode === "plugin" ? overlayLayout("action") : undefined} onLayoutChange={(partial) => updateOverlayLayout("action", partial)} leftAttacks={leftAttacks} onToggleDirection={() => setLeftAttacks((value) => !value)} onCalculate={() => void calculate()} onRecognizeBattleLive={() => void recognizeDetection("battleLive")} onRecognizeBattleStart={() => void recognizeDetection("battleStart")} onOpenSelfBuff={() => openBuffShortcut("left")} onOpenEnemyBuff={() => openBuffShortcut("right")} onToggleQuickCalculate={() => quickCalculationActive ? hideQuickSkillResultsRef.current() : calculateQuickSkillsRef.current()} quickCalculationActive={quickCalculationActive} onRecognizeSkillPowers={() => void recognizeSkillPowers()} onCalculateEnemyAttack={() => calculateEnemyAttackSkillsRef.current()} onAlignTraitStacks={() => alignTraitStacksRef.current()} onApplyBuff={() => void applyBuff()} onReverseBuff={() => void applyBuff(undefined, true)} onResetBattle={resetBattle} targetHp={targetHp} onTargetHpChange={setTargetHp} onCalculateRequiredPower={() => void calculateRequiredPower()} buffOptions={buffOptions} selectedBuffOption={selectedBuffOption} onSelectBuffOption={setSelectedBuffOption} />
        {openBonusTools.map(({ side: bonusSide, tool: bonusTool }) => (
          <BattleBonusToolPanel
            key={`${bonusSide}-${bonusTool}`}
            tool={bonusTool}
            pluginMode={displayMode === "plugin"}
            side={bonusSide}
            position={bonusToolPositions[`${bonusSide}-${bonusTool}`] || { x: Math.max(8, window.innerWidth - 348), y: 84 }}
            onPositionChange={(position) => setBonusToolPositions((current) => ({ ...current, [`${bonusSide}-${bonusTool}`]: { ...current[`${bonusSide}-${bonusTool}`], ...position } }))}
            value={bonusSide === "left" ? leftOtherBonuses : rightOtherBonuses}
            burstEffects={burstEffects}
            markFields={bonusSide === "left" ? leftMarkFields : rightMarkFields}
            onMarkFieldsChange={bonusSide === "left" ? setLeftMarkFields : setRightMarkFields}
            onChange={bonusSide === "left"
              ? (partial) => setLeftOtherBonuses((current) => ({ ...current, ...partial }))
              : (partial) => setRightOtherBonuses((current) => ({ ...current, ...partial }))}
            onClose={() => setOpenBonusTools((current) => current.filter((panel) => panel.side !== bonusSide || panel.tool !== bonusTool))}
          />
        ))}
        <ResultView
          results={results}
          error={error}
          context={battleContext}
          willpower={willpower}
          selectedWillpowerElement={selectedWillpowerElement}
          onSelectWillpowerElement={selectWillpowerElement}
          overlayId={displayMode === "plugin" ? "result" : undefined}
          layout={displayMode === "plugin" ? overlayLayouts["result"] : undefined}
          onLayoutChange={displayMode === "plugin" ? (partial) => updateOverlayLayout("result", partial) : undefined}
        />
        {requiredPower ? <RequiredPowerView value={requiredPower} context={battleContext} overlayId={displayMode === "plugin" ? "required-power" : undefined} layout={displayMode === "plugin" ? overlayLayouts["required-power"] : undefined} onLayoutChange={displayMode === "plugin" ? (partial) => updateOverlayLayout("required-power", partial) : undefined} /> : null}
        {enemyAttackResults ? <EnemyAttackSkillPanel value={enemyAttackResults} onBack={enemyAttackInitialResults && enemyAttackResults !== enemyAttackInitialResults ? () => setEnemyAttackResults(enemyAttackInitialResults) : undefined} onPickSkill={() => void openEnemySkillPicker()} onClose={() => { enemyAttackRequests.invalidate(); enemyPickerRequests.invalidate(); setEnemyAttackResults(null); setEnemySkillPicker(false); }} overlayId={displayMode === "plugin" ? "enemy-attack" : undefined} layout={displayMode === "plugin" ? overlayLayouts["enemy-attack"] : undefined} onLayoutChange={displayMode === "plugin" ? (partial) => updateOverlayLayout("enemy-attack", partial) : undefined} /> : null}
      </div>
      {displayMode === "plugin" && skillOrderTarget ? <SkillOrderPanel skills={skillOrderTarget.unit.skills} petName={skillOrderTarget.unit.name} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onSave={saveSkillOrder} onClose={() => setSkillOrderTarget(null)} /> : null}
      {enemySkillPicker ? (
        <PickerModal
          mode="skill" pets={[]} elements={elements} petSkills={enemySkillData.petSkills} allSkills={enemySkillData.allSkills}
          traits={[]} configs={configs} onConfigsChanged={onConfigsChanged}
          onClose={() => { enemyPickerRequests.invalidate(); setEnemySkillPicker(false); }} onPickPet={() => undefined} onPickTrait={() => undefined}
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

export { TeamBattlePage };
