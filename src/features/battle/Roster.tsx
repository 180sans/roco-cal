import { type PresetGroup, type Pet, type PickerConfigs, type UnitState } from "../../services/desktopTypes";
import { useState, useRef, Fragment } from "react";
import { type PanelState } from "../plugin/layout";
import { blankUnit, petNameOnly } from "../../domain/unitState";
import { PluginResizeEdges } from "../plugin/PluginPanels";
import {
  selectedFamilyForm,
  FamilyFormSelect,
  TeamIvEditor,
  TeamTraitEditor,
  TeamEvolutionControls,
} from "../units/UnitEditors";
import { EntityLabel } from "../../components/common/EntityLabel";
import { RefreshButton } from "../../components/common/ActionButtons";

function Roster({
  selectedGroup = "",
  title,
  className = "",
  presets,
  pets,
  elements,
  configs,
  slots,
  activeIndex,
  onConfigsChanged,
  onImportGroup,
  onSelect,
  onPatchSlot,
  onPatchSlotAt,
  onChoose,
  pluginMode,
  panelState: state,
}: {
  selectedGroup?: string;
  title: string;
  className?: string;
  presets: PresetGroup[];
  pets: Pet[];
  elements: string[];
  configs: PickerConfigs;
  slots: UnitState[];
  activeIndex: number;
  onConfigsChanged: (configs: PickerConfigs) => void;
  onImportGroup: (groupName: string) => void;
  onSelect: (index: number) => void;
  onPatchSlot: (partial: Partial<UnitState>) => void;
  onPatchSlotAt: (index: number, partial: Partial<UnitState>) => void;
  onChoose: (index: number) => void;
  pluginMode: boolean;
  panelState?: PanelState;
}) {
  const activeSlot = slots[activeIndex] || blankUnit();
  const controlAfterIndex = Math.min(activeIndex % 2 === 0 ? activeIndex + 1 : activeIndex, slots.length - 1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  function openPopover(index: number) {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    setHoveredIndex(index);
  }

  function schedulePopoverClose() {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHoveredIndex(null), 240);
  }

  return (
    <section className={`roster ${className}`.trim()} data-panel-state={state} data-overlay-control data-plugin-resizable={pluginMode || undefined}>
      {pluginMode ? <PluginResizeEdges /> : null}
      <header className="roster-header">
        {!pluginMode ? <h2>{title}</h2> : null}
        <select
          className="roster-import-select"
          value={selectedGroup}
          title="导入分组"
          onChange={(event) => {
            if (event.target.value) onImportGroup(event.target.value);
          }}
        >
          <option value="">导入分组</option>
          {presets.map((group) => (
            <option key={group.name} value={group.name}>
              {group.name}
            </option>
          ))}
        </select>
      </header>
      <div className="slot-grid">
        {slots.map((slot, index) => (
          <Fragment key={index}>
            <div className="slot-cell" onMouseEnter={() => pluginMode && openPopover(index)} onMouseLeave={schedulePopoverClose}>
              <div
                className={`${index === activeIndex ? "slot active" : "slot"}${slot.name ? "" : " is-empty"}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelect(index);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(index);
                  }
                }}
              >
                <strong title={pluginMode && slot.name ? (selectedFamilyForm(slot, pets)?.name || slot.display_name || slot.name) : slot.display_name || slot.name || (pluginMode ? "空" : "空槽位")}><EntityLabel kind="pet" value={pluginMode && slot.name ? (selectedFamilyForm(slot, pets)?.label || slot.name) : slot.name} iconOnly={pluginMode} className={pluginMode ? "roster-pet-image" : ""}>{petNameOnly(slot.display_name || slot.name) || (pluginMode ? "空" : "空槽位")}</EntityLabel></strong>
                {pluginMode && slot.name ? <FamilyFormSelect value={slot} pets={pets} onChange={(partial) => onPatchSlotAt(index, partial)} pluginMode compact /> : null}
                {slot.name ? <RefreshButton className="slot-action" label="更换" onClick={(event) => { event.stopPropagation(); onChoose(index); }} /> : <button className="slot-action" onClick={(event) => { event.stopPropagation(); onChoose(index); }}>选择</button>}
              </div>
              {pluginMode && hoveredIndex === index && slot.name ? <div className="slot-iv-popover" onMouseEnter={() => openPopover(index)} onMouseLeave={schedulePopoverClose} onPointerDown={(event) => event.stopPropagation()}>
                <TeamIvEditor value={slot} onChange={(partial) => onPatchSlotAt(index, partial)} alwaysOpen />
              </div> : null}
            </div>
            {!pluginMode && index === controlAfterIndex ? (
              <div className="slot-inline-controls">
                <TeamTraitEditor value={activeSlot} pets={pets} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onChange={onPatchSlot} />
                <TeamIvEditor value={activeSlot} onChange={onPatchSlot} />
                <TeamEvolutionControls value={activeSlot} pets={pets} onChange={onPatchSlot} />
              </div>
            ) : null}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

export { Roster };
