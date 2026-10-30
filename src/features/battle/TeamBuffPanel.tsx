import { type UnitState } from "../../services/desktopTypes";
import { useState, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { usePopupPlacement, PluginResizeEdges } from "../plugin/PluginPanels";
import { panelState } from "../plugin/layout";
import { RefreshButton } from "../../components/common/ActionButtons";
import { FieldLabel, NumberInput } from "../../components/common/Controls";

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
  /** 默认值，非默认即视为生效。连击倍是增量 buff，默认值为 0。 */
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
    { key: "combo_mul", label: "连击倍", short: "连击倍", suffix: "", min: 0, max: 10, base: 0 },
  ] },
];

const BUFF_FIELDS = BUFF_GROUPS.flatMap((group) => group.fields);

const BUFF_RESET = Object.fromEntries(BUFF_FIELDS.map((field) => [field.key, field.base ?? 0])) as Record<BuffFieldKey, number>;

function buffSummaryValue(field: BuffField, value: number) {
  const display = field.suffix === "%" ? value / 10 : value;
  return Number(display.toFixed(2)).toString();
}

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
          <span>{title === "buff" ? "B" : title}</span>
          </span>
          {activeBuffs.length ? <span className="buff-summary-values">{activeBuffs.map((field) => <span key={field.key}>{field.short}{buffSummaryValue(field, value[field.key])}</span>)}</span> : null}
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

export { TeamBuffPanel };
