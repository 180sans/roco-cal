import { useLatestEffect } from "../../services/useLatestRequest";
import {
  type UnitState,
  type PickerConfigs,
  type QuickSkillResult,
  type SkillListResult,
  type SkillTriggerInfo,
  type SkillItem,
} from "../../services/desktopTypes";
import { useState, useRef, useEffect, type CSSProperties } from "react";
import { cachedListSkills, cachedSkillTriggerInfo } from "../../services/desktopApi";
import { type PluginOverlayLayout, type PanelState, pluginContentStyle } from "../plugin/layout";
import { skillCardSlots, skillDetail } from "../../components/picker/skillPresentation";
import { PluginResizeEdges } from "../plugin/PluginPanels";
import { NumberInput, FieldLabel } from "../../components/common/Controls";
import { RefreshButton } from "../../components/common/ActionButtons";
import { PickerModal } from "../../components/picker/PickerModal";
import { ELEMENT_RESULT_COLORS } from "../../domain/constants";
import { EntityLabel } from "../../components/common/EntityLabel";

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

  useLatestEffect((request) => {
    if (pickerIndex === null) return;
    void cachedListSkills(value.name).then((data) => { if (request.isCurrent()) setSkillData(data); }).catch(() => { if (request.isCurrent()) setSkillData({ petSkills: [], allSkills: [] }); });
  }, [pickerIndex, value.name]);

  useLatestEffect((request) => {

    setSkillInfo(null);
    if (!controlSkill) return;
    void cachedSkillTriggerInfo(controlSkill)
      .then((data) => {
        if (request.isCurrent() && data.skill_name === controlSkill) setSkillInfo(data);
      })
      .catch(() => {
        if (request.isCurrent()) setSkillInfo(null);
      });
    return;
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

  useLatestEffect((request) => {

    if (!cardSkillNames.length) {
      setSkillDetails({});
      return;
    }
    void Promise.all(cardSkillNames.map(async (name) => {
      const data = await cachedSkillTriggerInfo(name);
      return [name, { description: data.description || "", element: data.element || "" }] as const;
    }))
      .then((details) => {
        if (request.isCurrent()) setSkillDetails(Object.fromEntries(details));
      })
      .catch(() => {
        if (request.isCurrent()) setSkillDetails({});
      });
    return;
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

export { TeamSkillCards, TeamSkillCardGrid };
