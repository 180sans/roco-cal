import { useLatestEffect } from "../../services/useLatestRequest";
import { type Pet, type UnitState, type PickerConfigs } from "../../services/desktopTypes";
import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { cachedTraitInfo } from "../../services/desktopApi";
import { EntityLabel } from "../../components/common/EntityLabel";
import { RefreshButton, TriggerButton } from "../../components/common/ActionButtons";
import { parsePersonality, buildPersonality, updateIv } from "../../domain/unitState";
import { FieldLabel, NumberInput } from "../../components/common/Controls";
import { STATS, STAT_LABEL, IV_OPTIONS } from "../../domain/constants";
import { usePopupPlacement } from "../plugin/PluginPanels";
import { asError } from "../../shared/errors";
import { PickerModal } from "../../components/picker/PickerModal";

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

function FamilyFormSelect({ value, pets, onChange, pluginMode = false, compact = false }: { value: UnitState; pets: Pet[]; onChange: (partial: Partial<UnitState>) => void; pluginMode?: boolean; compact?: boolean }) {
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
    if (compact) event.stopPropagation();
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
    <button ref={anchorRef} type="button" className={`family-form-select${compact ? " family-form-select-compact" : ""}`} aria-label="同进化链精灵形态" aria-haspopup="listbox" aria-expanded={open} disabled={!forms.length} onClick={(event) => { if (compact) event.stopPropagation(); setOpen(!open); }} onKeyDown={handleKey}>
      {compact ? null : selected ? <EntityLabel kind="pet" value={selected.label} iconOnly>{selected.name}</EntityLabel> : pluginMode ? "形态" : "选择形态"}<span aria-hidden="true">▾</span>
    </button>
    {open ? createPortal(<div ref={popupRef} className={`family-form-options${document.documentElement.classList.contains("overlay-attached") || anchorRef.current?.closest(".battle-page.immersive-mode") ? " overlay-form-options" : ""}`} data-overlay-control style={position} onKeyDown={handleKey}>
      <div role="listbox" aria-label="同进化链精灵形态">
        {forms.map((pet) => <button type="button" role="option" aria-selected={pet.label === selected?.label} key={pet.label} onClick={() => choose(pet)}><EntityLabel kind="pet" value={pet.label} iconOnly>{pet.name}</EntityLabel></button>)}
      </div>
      {pluginMode ? <RefreshButton className="family-form-reset" label="重置" onClick={() => { onChange({ devolution: 0, mega: false, mega_form: null }); setOpen(false); anchorRef.current?.focus(); }} /> : null}
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
      {!pluginMode ? <RefreshButton className="compact-button evolution-reset-button" onClick={() => onChange({ devolution: 0, mega: false, mega_form: null })} /> : null}
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

function TeamTraitEditor({
  value,
  pets,
  elements,
  configs,
  onChange,
  onConfigsChanged,
  pluginMode = false,
  expanded: expandedProp,
  onExpandedChange,
}: {
  value: UnitState;
  pets: Pet[];
  elements: string[];
  configs: PickerConfigs;
  onChange: (partial: Partial<UnitState>) => void;
  onConfigsChanged: (configs: PickerConfigs) => void;
  pluginMode?: boolean;
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

  useLatestEffect((request) => {
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
      .then((data) => { if (request.isCurrent()) setTraitRuntime(data.runtime); })
      .catch((err) => { if (request.isCurrent()) setTraitRuntime({ error: asError(err) }); });
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
        <strong className="ui-field-title">{pluginMode ? "T" : traitLabel}</strong>
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
          <strong className="trait-expanded-name">{traitLabel}</strong>
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

export { TeamTraitEditor, TeamIvEditor, TeamEvolutionControls, selectedFamilyForm, FamilyFormSelect };
