import { saveConfigPatch } from "../../services/configSaves";
import { type ReactNode, useRef, useState, useLayoutEffect, useEffect, useMemo, Fragment } from "react";
import { flushSync, createPortal } from "react-dom";
import {
  type PresetGroup,
  type Pet,
  type SkillItem,
  type PickerConfigs,
  type PresetItem,
} from "../../services/desktopTypes";
import { watchSkillMatchesSearch } from "../../watchSkills";
import { desktopApi } from "../../services/desktopApi";
import { type PickerMode } from "../../domain/unitState";
import { buildPetLookup, petFromPreset, petMatchesPickerFilters } from "../../domain/pets";
import { skillDetail, skillText, skillMeta } from "./skillPresentation";
import { PickerIcon, EntityLabel } from "../common/EntityLabel";
import { SKILL_TYPE_FILTERS, DEFAULT_SKILL_CARD_COUNT } from "../../domain/constants";
import { FieldLabel } from "../common/Controls";

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
    .filter((skill) => !normalizedQuery || watchSkillMatchesSearch(skill, normalizedQuery))
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
    await saveConfigPatch(section, values, onConfigsChanged);
  }

  useLayoutEffect(() => {
    void desktopApi.setOverlayClickThrough(false).catch(() => undefined);
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
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === "skill" ? "搜索技能名称或描述，如：印记" : "搜索..."} />
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

export { PickerModal };
