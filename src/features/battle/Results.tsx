import {
  type BattleResult,
  type WillpowerResponse,
  type WillpowerElementResult,
  type RequiredPowerResponse,
} from "../../services/desktopTypes";
import {
  useState,
  useRef,
  useEffect,
  type PointerEvent as ReactPointerEvent,
  Fragment,
  type CSSProperties,
} from "react";
import {
  type EnemyAttackSkillResponse,
  type EnemyAttackSkillCell,
  type EnemyAttackSample,
  enemyAttackRows,
  enemyAttackPowerText,
} from "../../enemyAttack";
import { type BattleContext, parsePersonality } from "../../domain/unitState";
import { usePluginPanelMove, PluginResizeEdges } from "../plugin/PluginPanels";
import { type PluginOverlayLayout, pluginContentStyle } from "../plugin/layout";
import { EntityLabel, PickerIcon } from "../../components/common/EntityLabel";
import { ELEMENT_RESULT_COLORS } from "../../domain/constants";

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

function useResultPanelLayout(
  ref: { current: HTMLElement | null },
  layout: PluginOverlayLayout | undefined,
  onLayoutChange: ((partial: Partial<PluginOverlayLayout>) => void) | undefined,
  setLocalPosition: (position: { x: number; y: number }) => void,
) {
  const movePanel = (position: { x: number; y: number }) => {
    const panel = ref.current;
    if (onLayoutChange && panel) {
      onLayoutChange({ ...(!layout ? { width: panel.offsetWidth, height: panel.offsetHeight } : {}), ...position });
    } else setLocalPosition(position);
  };
  usePluginPanelMove(ref, movePanel);
  return movePanel;
}

type ResultPanelLayoutProps = {
  overlayId?: string;
  layout?: PluginOverlayLayout;
  onLayoutChange?: (partial: Partial<PluginOverlayLayout>) => void;
};

function ResultView({
  results, error, context, willpower, selectedWillpowerElement, onSelectWillpowerElement, overlayId, layout, onLayoutChange,
}: {
  results: BattleResult[];
  error: string;
  context: BattleContext | null;
  willpower: WillpowerResponse | null;
  selectedWillpowerElement: string | null;
  onSelectWillpowerElement: (element: WillpowerElementResult) => void;
} & ResultPanelLayoutProps) {
  const [selected, setSelected] = useState<BattleResult | null>(null);
  const [visible, setVisible] = useState(false);
  const [localPosition, setLocalPosition] = useState({ x: 80, y: 88 });
  const position = layout || localPosition;
  const panelRef = useRef<HTMLElement | null>(null);
  const setPosition = useResultPanelLayout(panelRef, layout, onLayoutChange, setLocalPosition);
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
    <section ref={panelRef} className={`result-floating${willpower ? " has-willpower" : ""}`} data-overlay-control data-plugin-resizable data-plugin-overlay-id={overlayId} style={{ left: position.x, top: position.y, ...(layout ? { width: layout.width, height: layout.height, ...pluginContentStyle(layout) } : {}) }}>
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

function RequiredPowerView({ value, context, overlayId, layout, onLayoutChange }: { value: RequiredPowerResponse; context: BattleContext | null } & ResultPanelLayoutProps) {
  const [visible, setVisible] = useState(true);
  const [localPosition, setLocalPosition] = useState({ x: 80, y: 88 });
  const position = layout || localPosition;
  const panelRef = useRef<HTMLElement | null>(null);
  const setPosition = useResultPanelLayout(panelRef, layout, onLayoutChange, setLocalPosition);
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
    <section ref={panelRef} className="required-power-panel" data-overlay-control data-plugin-resizable data-plugin-overlay-id={overlayId} style={{ left: position.x, top: position.y, ...(layout ? { width: layout.width, height: layout.height, ...pluginContentStyle(layout) } : {}) }}>
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

function EnemyAttackSkillPanel({ value, onBack, onPickSkill, onClose, overlayId, layout, onLayoutChange }: { value: EnemyAttackSkillResponse; onBack?: () => void; onPickSkill: () => void; onClose: () => void } & ResultPanelLayoutProps) {
  const [localPosition, setLocalPosition] = useState<{ x: number; y: number } | null>(null);
  const position = layout || localPosition;
  const panelRef = useRef<HTMLElement | null>(null);
  const setPosition = useResultPanelLayout(panelRef, layout, onLayoutChange, setLocalPosition);
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
    <section ref={panelRef} className="enemy-attack-panel" data-overlay-control data-plugin-resizable data-plugin-overlay-id={overlayId} role="dialog" aria-label="敌方攻击技能结果" style={position ? { left: position.x, top: position.y, transform: "none", ...(layout ? { width: layout.width, height: layout.height, ...pluginContentStyle(layout) } : {}) } : undefined}>
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
          const visibleRows = rows.slice(0, 15);
          const tableHeight = Array.from({ length: Math.ceil(visibleRows.length / 5) }, (_, index) =>
            Math.max(...visibleRows.slice(index * 5, index * 5 + 5).map((skill) => skill.stackable ? 70 : 42)),
          ).reduce((total, height) => total + height, 0);
          return (
            <section className="enemy-attack-group" key={group.attackType}>
              <div className="enemy-attack-group-heading"><strong>{group.attackType}</strong><span>++ / + / 无</span></div>
              <div className={`enemy-attack-table${rows.length > 15 ? " is-scrollable" : ""}`} aria-label={`${group.attackType}技能伤害`} style={{ "--enemy-attack-table-height": `${tableHeight}px` } as CSSProperties}>
                <div className="enemy-attack-grid">
                {rows.map((skill) => {
                  const backgroundColor = ELEMENT_RESULT_COLORS[skill.element] || ELEMENT_RESULT_COLORS["普通"];
                  const skillName = `${skill.skillName}${skill.triggered ? "*" : ""}`;
                  const description = [skillName, skill.description || "暂无描述"].join("\n");
                  const samples = skill.columns.flatMap((column) => column.samples);
                  return <div className={`enemy-attack-skill${skill.stackable ? " is-stackable" : ""}`} key={`${skill.skillName}-${skill.caseLabel}`}>
                    <div className="enemy-attack-cell enemy-attack-skill-heading" style={{ backgroundColor }} title={description}>
                      <strong><EntityLabel kind="skill" value={skill.skillName} title={description}>{skillName}</EntityLabel></strong>
                      <span title={samples.map(sampleTitle).join("\n")}>{enemyAttackPowerText(samples.map((sample) => sample.cell))}</span>
                    </div>
                    <div className="enemy-attack-cell enemy-attack-values" style={{ backgroundColor }} title={skill.columns.map((column) => `${column.label || "无"}：${column.samples.map(sampleTitle).join("；")}`).join("\n")}>
                      {Array.from({ length: Math.max(1, ...skill.columns.map((column) => column.samples.length)) }, (_, sampleIndex) => <div className="enemy-attack-sample" key={sampleIndex}>
                        {skill.columns.map((column) => column.samples[sampleIndex]?.cell?.damage ?? "-").join("/")}
                      </div>)}
                    </div>
                  </div>;
                })}
                </div>
              </div>
            </section>
          );
        }) : <p className="enemy-attack-empty">没有可用的攻击技能</p>}
      </div>
    </section>
  );
}

export { uniqueByOrder, ResultView, RequiredPowerView, EnemyAttackSkillPanel };
