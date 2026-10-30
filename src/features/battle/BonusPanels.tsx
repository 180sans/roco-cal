import { type TeamOtherBonuses, type BurstEffectItem } from "../../services/desktopTypes";
import { useRef, useEffect, type PointerEvent as ReactPointerEvent } from "react";
import { FieldLabel, NumberInput } from "../../components/common/Controls";
import { TriggerButton, RefreshButton } from "../../components/common/ActionButtons";
import { EntityLabel } from "../../components/common/EntityLabel";
import { type BonusTool, type MarkField, type BonusToolPosition } from "../../domain/unitState";
import { usePluginPanelMove, PluginResizeEdges } from "../plugin/PluginPanels";
import { pluginContentStyle } from "../plugin/layout";

function BurstEffectLabel({ effect }: { effect: BurstEffectItem }) {
  const traitIcons: Record<string, string> = {
    "生物电": "243闪电鳗鱼",
    "电流刺激": "081星光狮（星光能量的样子）",
  };
  if (effect.kind === "skill") return <EntityLabel kind="skill" value={effect.name}>{effect.name}</EntityLabel>;
  const petIcon = effect.kind === "trait" ? traitIcons[effect.name] : undefined;
  return petIcon ? <EntityLabel kind="pet" value={petIcon}>{effect.name}</EntityLabel> : <span>{effect.name}</span>;
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
            <FieldLabel><EntityLabel kind="skill" value="飞断">威力</EntityLabel></FieldLabel>
            <NumberInput value={value.dedication_power_stacks} min={0} max={99} onChange={(dedication_power_stacks) => onChange({ dedication_power_stacks })} />
          </div>
          <div>
            <FieldLabel><EntityLabel kind="skill" value="虫群过境">连击</EntityLabel></FieldLabel>
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
            <FieldLabel>风起印记</FieldLabel>
            <TriggerButton label="先手攻击触发" className={value.wind_mark_triggered ? "compact-button active" : "compact-button"} aria-pressed={value.wind_mark_triggered} onClick={() => onChange({ wind_mark_triggered: !value.wind_mark_triggered })} />
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
          {[...burstEffects].sort((a, b) => ({ skill: 0, trait: 1, mark: 2 }[a.kind] - { skill: 0, trait: 1, mark: 2 }[b.kind])).map((effect) => {
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
                <BurstEffectLabel effect={effect} />
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
          <FieldLabel><EntityLabel kind="skill" value="飞断">威力</EntityLabel></FieldLabel>
          <NumberInput value={value.dedication_power_stacks} min={0} max={99} onChange={(dedication_power_stacks) => onChange({ dedication_power_stacks })} />
        </div>
        <div>
          <FieldLabel><EntityLabel kind="skill" value="虫群过境">连击</EntityLabel></FieldLabel>
          <NumberInput value={value.dedication_combo_stacks} min={0} max={99} onChange={(dedication_combo_stacks) => onChange({ dedication_combo_stacks })} />
        </div>
      </div>
    );
  }

  if (tool === "marks") {
    const markOptions = [
      ["charge", "蓄电印记", "charge_mark_stacks"],
      ["wind", "风起印记", null],
      ["attack", "攻击印记", "attack_mark_stacks"],
      ["momentum", "蓄势印记", "momentum_mark_stacks"],
      ["starfall", "星陨印记", "starfall_mark_stacks"],
    ] as const;
    return (
      <div className="bonus-tool-fields">
        {markOptions.filter(([id]) => markFields.includes(id)).map(([id, label, key]) => {
          const triggerField = id === "charge" ? "charge_mark_triggered" : id === "wind" ? "wind_mark_triggered" : null;
          return <div key={id}>
            <FieldLabel>{label}</FieldLabel>
            {key ? <NumberInput value={value[key]} min={0} max={99} onChange={(stacks) => onChange({ [key]: stacks })} /> : <span aria-hidden="true" />}
            {triggerField ? <TriggerButton label={id === "wind" ? "先手攻击触发" : "触发"} className={value[triggerField] ? "compact-button active" : "compact-button"} aria-pressed={value[triggerField]} onClick={() => onChange({ [triggerField]: !value[triggerField] })} /> : null}
            <button className="compact-button" title="移除印记" aria-label={`移除${label}`} onClick={() => { onChange({ ...(key ? { [key]: 0 } : {}), ...(triggerField ? { [triggerField]: false } : {}) }); onMarkFieldsChange(markFields.filter((field) => field !== id)); }}>x</button>
          </div>;
        })}
        {markFields.length < markOptions.length ? <label className="mark-add-control"><span>新增印记</span><select value="" onChange={(event) => { const next = event.target.value as MarkField; if (next) onMarkFieldsChange([...markFields, next]); }}><option value="">选择印记</option>{markOptions.filter(([id]) => !markFields.includes(id)).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label> : null}
      </div>
    );
  }

  const burstKindOrder = { skill: 0, trait: 1, mark: 2 };
  const orderedBurstEffects = [...burstEffects].sort((a, b) => burstKindOrder[a.kind] - burstKindOrder[b.kind]);
  const firstTraitId = orderedBurstEffects.find((effect) => effect.kind === "trait")?.id;
  return (
    <div className="burst-trigger-checklist">
      {orderedBurstEffects.map((effect) => {
        const checked = value.burst_triggered_effect_ids.includes(effect.id);
        return (
          <label key={effect.id} className={effect.id === firstTraitId ? "check-row burst-trait-start" : "check-row"}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange({
                burst_triggered_effect_ids: checked
                  ? value.burst_triggered_effect_ids.filter((id) => id !== effect.id)
                  : [...value.burst_triggered_effect_ids, effect.id],
              })}
            />
            <BurstEffectLabel effect={effect} />
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
    <section ref={panelRef} className={`bonus-tool-floating ${side}-${tool} ${tool}`} data-overlay-control data-plugin-resizable={pluginMode || undefined} data-plugin-bonus-id={pluginMode ? `${side}-${tool}` : undefined} style={{ left: position.x, top: position.y, ...(pluginMode ? { width: position.width, height: position.height, ...pluginContentStyle(position) } : {}) }}>
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

export { BattleBonusToolPanel };
