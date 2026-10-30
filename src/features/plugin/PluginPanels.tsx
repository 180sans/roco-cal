import { trackPointerMovement } from "../../shared/pointerTracking";
import {
  type PointerEventHandler as ReactPointerEventHandler,
  useLayoutEffect,
  useState,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { type BuffOption } from "../../services/desktopTypes";
import {
  type PluginOverlayLayout,
  type PluginVisibility,
  snapToGrid,
  pluginContentStyle,
  type PanelState,
} from "./layout";
import { RefreshButton } from "../../components/common/ActionButtons";
import { PLUGIN_SHORTCUTS, savedPluginShortcuts, savedShortcutButtons, shortcutAria, type PluginShortcutBindings, type PluginShortcutButtons } from "../../shared/pluginShortcuts";

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

function TeamActionPanel({
  pluginMode,
  layout,
  onLayoutChange,
  leftAttacks,
  onToggleDirection,
  onCalculate,
  onRecognizeBattleLive,
  onRecognizeBattleStart,
  onOpenSelfBuff,
  onOpenEnemyBuff,
  onToggleQuickCalculate,
  quickCalculationActive,
  onRecognizeSkillPowers,
  onCalculateEnemyAttack,
  onAlignTraitStacks,
  onAdjustSkills,
  shortcuts = savedPluginShortcuts({}),
  shortcutButtons = savedShortcutButtons({}),
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
  onOpenSelfBuff: () => void;
  onOpenEnemyBuff: () => void;
  onToggleQuickCalculate: () => void;
  quickCalculationActive: boolean;
  onRecognizeSkillPowers: () => void;
  onCalculateEnemyAttack: () => void;
  onAlignTraitStacks: () => void;
  onAdjustSkills: () => void;
  shortcuts?: PluginShortcutBindings;
  shortcutButtons?: PluginShortcutButtons;
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
  const shortcutRows = [0, 1].map((row) => PLUGIN_SHORTCUTS.filter((item) => item.row === row && shortcutButtons[item.id] !== false)).filter((buttons) => buttons.length > 0);
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
    trackPointerMovement(move, () => { dragRef.current = null; });
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
      {pluginMode && shortcutRows.length > 0 ? <div className="team-action-shortcuts">
        {shortcutRows.map((buttons) => {
          const handlers: Record<string, () => void> = { "battle-live": onRecognizeBattleLive, "battle-start": onRecognizeBattleStart, "skill-powers": onRecognizeSkillPowers, "trait-align": onAlignTraitStacks, "self-buff": onOpenSelfBuff, "enemy-buff": onOpenEnemyBuff, "enemy-attack": onCalculateEnemyAttack, "skill-order": onAdjustSkills, "quick-calculate": onToggleQuickCalculate };
          return <div className="team-action-shortcut-row" key={buttons[0].row!}>
            {buttons.map((item) => <button key={item.id} type="button" title={`${item.label}${shortcuts[item.id] ? ` ${shortcuts[item.id]}` : ""}`} aria-keyshortcuts={shortcutAria(shortcuts[item.id])} aria-pressed={item.id === "quick-calculate" ? quickCalculationActive : undefined} onClick={handlers[item.id]}>{item.label}</button>)}
          </div>;
        })}
      </div> : null}
    </section>
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
    trackPointerMovement(move);
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

export { FloatingTeamPanel, usePluginPanelMove, PluginResizeEdges, usePopupPlacement, traitSummaryAtPoint, pluginPanelMoves, TeamActionPanel };
