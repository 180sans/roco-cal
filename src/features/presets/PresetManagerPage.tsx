import { useLatestEffect } from "../../services/useLatestRequest";
import {
  type PresetGroup,
  type Pet,
  type PickerConfigs,
  type UnitState,
  type SkillListResult,
  type PresetItem,
} from "../../services/desktopTypes";
import { useState, useRef, useMemo, useEffect } from "react";
import { cachedListSkills, desktopApi } from "../../services/desktopApi";
import { createPortal } from "react-dom";
import { blankUnit, unitFromPreset } from "../../domain/unitState";
import { buildPetLookup } from "../../domain/pets";
import { skillCardSlots } from "../../components/picker/skillPresentation";
import { DEFAULT_SKILL_CARD_COUNT, BLOODLINE_OPTIONS } from "../../domain/constants";
import { asError } from "../../shared/errors";
import { EntityLabel } from "../../components/common/EntityLabel";
import { FieldLabel } from "../../components/common/Controls";
import { TeamTraitEditor, TeamIvEditor, TeamEvolutionControls } from "../units/UnitEditors";
import { RefreshButton } from "../../components/common/ActionButtons";
import { TeamSkillCardGrid } from "../battle/SkillCards";
import { PickerModal } from "../../components/picker/PickerModal";
import { WatchSkillsSettings } from "../watch/WatchSkills";

function PresetManagerPage({
  presets,
  pets,
  elements,
  configs,
  onPresetsChanged,
  onConfigsChanged,
}: {
  presets: PresetGroup[];
  pets: Pet[];
  elements: string[];
  configs: PickerConfigs;
  onPresetsChanged: (groups: PresetGroup[]) => void;
  onConfigsChanged: (configs: PickerConfigs) => void;
}) {
  const firstGroupName = presets[0]?.name || "attackers";
  const [groupName, setGroupName] = useState(firstGroupName);
  const [targetGroup, setTargetGroup] = useState(firstGroupName);
  const [selectedKey, setSelectedKey] = useState("");
  const [presetName, setPresetName] = useState("");
  const [newPresetHint, setNewPresetHint] = useState(false);
  const presetNameInputRef = useRef<HTMLInputElement | null>(null);
  const [editor, setEditor] = useState<UnitState>(blankUnit());
  const [picker, setPicker] = useState<"pet" | null>(null);
  const [skillPickerIndex, setSkillPickerIndex] = useState<number | null>(null);
  const [watchSettingsOpen, setWatchSettingsOpen] = useState(false);
  const [skillData, setSkillData] = useState<SkillListResult>({ petSkills: [], allSkills: [] });
  const [skillDataPetName, setSkillDataPetName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeText, setCodeText] = useState("");
  const [codeGroupName, setCodeGroupName] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMessage, setCodeMessage] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeReport, setCodeReport] = useState<string[]>([]);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<PresetGroup | null>(null);
  const [deleteGroupBusy, setDeleteGroupBusy] = useState(false);

  const currentGroup = presets.find((group) => group.name === groupName) || presets[0];
  const selectedPreset = currentGroup?.items.find((item) => item.key === selectedKey) || null;
  const initialGroupSelectedRef = useRef(false);
  const petLookup = useMemo(() => buildPetLookup(pets), [pets]);

  useEffect(() => {
    if (initialGroupSelectedRef.current) return;
    initialGroupSelectedRef.current = true;
    const firstPreset = currentGroup?.items[0];
    if (firstPreset) selectPreset(firstPreset);
    else newPreset();
  }, [currentGroup]);

  useEffect(() => {
    if (!presets.some((group) => group.name === groupName)) {
      setGroupName(firstGroupName);
    }
    if (!presets.some((group) => group.name === targetGroup)) {
      setTargetGroup(firstGroupName);
    }
  }, [firstGroupName, groupName, presets, targetGroup]);

  useLatestEffect((request) => {
    if (skillPickerIndex === null) return;

    void cachedListSkills(editor.name).then((data) => {
      if (!request.isCurrent()) return;
      setSkillData(data);
      setSkillDataPetName(editor.name);
    }).catch(() => {
      if (request.isCurrent()) { setSkillData({ petSkills: [], allSkills: [] }); setSkillDataPetName(editor.name); }
    });
    return;
  }, [editor.name, skillPickerIndex]);

  function defaultBloodlineForPet(name: string) {
    const element = petLookup.get(name)?.elements[0];
    return element ? `${element.replace(/系$/, "")}系血脉` : "";
  }

  function patchEditor(partial: Partial<UnitState>) {
    setEditor((value) => ({
      ...value,
      ...partial,
      ...(partial.name !== undefined && partial.name !== value.name && partial.bloodline === undefined
        ? { bloodline: defaultBloodlineForPet(partial.name) }
        : {}),
    }));
  }

  function selectPreset(preset: PresetItem) {
    setNewPresetHint(false);
    setSelectedKey(preset.key);
    setPresetName(preset.key);
    const unit = unitFromPreset(preset);
    setEditor({ ...unit, bloodline: unit.bloodline || defaultBloodlineForPet(unit.name) });
    setMessage("");
    setError("");
  }

  function newPreset() {
    setNewPresetHint(false);
    setSelectedKey("");
    setPresetName("");
    setEditor(blankUnit());
    setMessage("");
    setError("");
  }

  function selectGroup(name: string) {
    setGroupName(name);
    const firstPreset = presets.find((group) => group.name === name)?.items[0];
    if (firstPreset) selectPreset(firstPreset);
    else newPreset();
  }

  function setSkillAt(index: number, skillName: string) {
    const next = skillCardSlots(editor.skills, Math.max(DEFAULT_SKILL_CARD_COUNT, editor.skills.length));
    next[index] = skillName;
    patchEditor({ skills: next, current_skill: skillName });
  }

  function clearSkillAt(index: number) {
    const next = skillCardSlots(editor.skills, Math.max(DEFAULT_SKILL_CARD_COUNT, editor.skills.length));
    const removed = next[index];
    next[index] = "";
    patchEditor({ skills: next, current_skill: editor.current_skill === removed ? next.find(Boolean) || "" : editor.current_skill });
  }

  async function runPresetAction(payload: Record<string, unknown>, successMessage: string) {
    setError("");
    try {
      const data = await desktopApi.managePreset(payload);
      onPresetsChanged(data.presets);
      if (data.groupName) {
        setGroupName(data.groupName);
        setTargetGroup(data.groupName);
      }
      setSelectedKey(data.presetName || "");
      setMessage(successMessage);
    } catch (err) {
      setError(asError(err));
    }
  }

  async function createGroup() {
    const name = codeGroupName.trim();
    if (!name) {
      setCodeError("分组名不能为空");
      return;
    }
    setCodeBusy(true);
    setCodeError("");
    setCodeMessage("");
    setCodeReport([]);
    setError("");
    try {
      const data = await desktopApi.managePreset({ action: "create_group", groupName: name });
      onPresetsChanged(data.presets);
      if (data.groupName) {
        setGroupName(data.groupName);
        setTargetGroup(data.groupName);
      }
      setSelectedKey(data.presetName || "");
      setMessage(`已创建分组：${name}`);
      setCodeMessage(`已创建分组：${name}`);
    } catch (err) {
      setCodeError(asError(err));
    } finally {
      setCodeBusy(false);
    }
  }

  async function savePreset() {
    setError("");
    try {
      const data = await desktopApi.savePreset({ groupName, presetName, presetKey: selectedKey, state: editor, overwrite: true });
      onPresetsChanged(data.presets);
      setSelectedKey(data.presetName);
      setPresetName(data.presetName);
      setNewPresetHint(false);
      setMessage(`已保存：${data.presetName}`);
    } catch (err) {
      setError(asError(err));
    }
  }

  async function copyPreset() {
    if (!selectedPreset) return;
    await runPresetAction(
      { action: "copy_preset", groupName, presetKey: selectedPreset.key, targetGroup, targetName: presetName || selectedPreset.key },
      `已复制到：${targetGroup}`,
    );
  }

  async function movePreset() {
    if (!selectedPreset) return;
    await runPresetAction(
      { action: "move_preset", groupName, presetKey: selectedPreset.key, targetGroup, targetName: presetName || selectedPreset.key },
      `已移动到：${targetGroup}`,
    );
  }

  async function deletePreset() {
    if (!selectedPreset || !window.confirm(`删除预设“${selectedPreset.key}”？`)) return;
    await runPresetAction({ action: "delete_preset", groupName, presetKey: selectedPreset.key }, `已删除：${selectedPreset.key}`);
    newPreset();
  }

  async function deleteGroup() {
    if (!deleteGroupConfirm || deleteGroupBusy) return;
    setError("");
    setDeleteGroupBusy(true);
    try {
      const data = await desktopApi.managePreset({ action: "delete_group", groupName: deleteGroupConfirm.name });
      onPresetsChanged(data.presets);
      setGroupName(data.groupName || "");
      setTargetGroup(data.groupName || "");
      newPreset();
      setMessage(`已删除分组：${deleteGroupConfirm.name}`);
      setDeleteGroupConfirm(null);
    } catch (err) {
      setError(asError(err));
    } finally {
      setDeleteGroupBusy(false);
    }
  }

  function openCreateGroup() {
    setCodeOpen(true);
    setCodeMessage("");
    setCodeError("");
    setCodeReport([]);
  }

  async function importTeamCode(mode: "overwrite" | "create") {
    const target = mode === "create" ? codeGroupName.trim() : groupName;
    if (!codeText.trim()) {
      setCodeError("请先粘贴阵容码");
      return;
    }
    if (!target) {
      setCodeError("请先填写新分组名");
      return;
    }
    if (mode === "overwrite") {
      const count = presets.find((group) => group.name === groupName)?.items.length || 0;
      if (!window.confirm(`将用导入的精灵替换分组“${groupName}”现有的 ${count} 个预设，是否继续？`)) return;
    } else if (presets.some((group) => group.name === target)) {
      if (!window.confirm(`分组“${target}”已存在，导入会替换它的内容，是否继续？`)) return;
    }
    setCodeBusy(true);
    setCodeError("");
    setCodeMessage("");
    setCodeReport([]);
    try {
      const data = await desktopApi.importTeamCode({ text: codeText, mode, groupName: target });
      onPresetsChanged(data.presets);
      setGroupName(data.groupName);
      setTargetGroup(data.groupName);
      setSelectedKey("");
      setPresetName("");
      setEditor(blankUnit());
      setNewPresetHint(false);
      setMessage(`已导入到分组：${data.groupName}`);
      setCodeMessage(`已导入到分组：${data.groupName}`);
      setCodeReport(data.report || []);
    } catch (err) {
      setCodeError(asError(err));
    } finally {
      setCodeBusy(false);
    }
  }

  const skillCards = skillCardSlots(editor.skills).map((name) => (name ? { name } : null));

  return (
    <section className="preset-manager-page">
      <aside className="preset-library-panel">
        <header className="preset-manager-header">
          <h2 className="preset-library-title">分组</h2>
          <select aria-label="分组" className="preset-group-control" value={currentGroup?.name || ""} onChange={(event) => selectGroup(event.target.value)}>
            {presets.map((group) => (
              <option key={group.name} value={group.name}>{group.name}</option>
            ))}
          </select>
        </header>
        <div className="preset-create-row">
          <button className="compact-button preset-new-button" onClick={() => {
            newPreset();
            setNewPresetHint(true);
            presetNameInputRef.current?.focus();
          }}>新建预设</button>
          <button className="preset-create-button" onClick={openCreateGroup}>创建分组</button>
          <button className="compact-button preset-watch-button" onClick={() => setWatchSettingsOpen(true)}>醒目技能</button>
          <button className="compact-button preset-delete-group-button" disabled={!currentGroup} onClick={() => { setError(""); setDeleteGroupConfirm(currentGroup || null); }}>删除当前分组</button>
        </div>
        <div className="preset-list">
          {(currentGroup?.items || []).map((preset) => (
            <button key={preset.key} className={preset.key === selectedKey ? "preset-list-item preset-list-control active" : "preset-list-item preset-list-control"} onClick={() => selectPreset(preset)}>
              <strong className="preset-card-name" title={preset.key}>{preset.key}</strong>
              <span className="preset-card-body">
                <span className="preset-card-pet">
                  <EntityLabel kind="pet" value={`${preset.id}${preset.name}`} iconOnly>{preset.name}</EntityLabel>
                </span>
                <span className="preset-card-skills">
                  {skillCardSlots(preset.skills || [], DEFAULT_SKILL_CARD_COUNT).map((name, index) => (
                    <span className="preset-card-skill" key={index} title={name || `空技能${index + 1}`}>
                      {name ? <EntityLabel kind="skill" value={name} /> : `空技能${index + 1}`}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <section className="preset-editor-panel">
        <header className="preset-manager-header preset-editor-header">
          <h2 className="preset-settings-title">精灵预设</h2>
          <input ref={presetNameInputRef} aria-label="预设名" className={`preset-name-input${newPresetHint ? " is-new-preset" : ""}`} value={presetName} onChange={(event) => { setPresetName(event.target.value); setNewPresetHint(false); }} placeholder={newPresetHint ? "新键预设" : "留空则使用精灵名"} />
          <div className="header-actions">
            <button className="compact-button preset-save-button" onClick={() => void savePreset()}>保存预设</button>
            <button className="compact-button preset-delete-button" disabled={!selectedPreset} onClick={() => void deletePreset()}>删除</button>
          </div>
        </header>
        <section className="preset-editor-section preset-transfer-section">
          <FieldLabel className="preset-transfer-label"><span className="ui-field-title preset-section-title">目标分组</span></FieldLabel>
          <select className="preset-transfer-select" value={targetGroup} onChange={(event) => setTargetGroup(event.target.value)}>
            {presets.map((group) => (
              <option key={group.name} value={group.name}>{group.name}</option>
            ))}
          </select>
          <button className="preset-copy-button" disabled={!selectedPreset} onClick={() => void copyPreset()}>复制</button>
          <button className="preset-move-button" disabled={!selectedPreset} onClick={() => void movePreset()}>移动</button>
        </section>
        <section className="preset-editor-section preset-main-section">
          <FieldLabel className="preset-pet-label">
            <span className="ui-field-title preset-section-title">精灵</span>
            <div className="preset-pet-row">
              <input className="preset-pet-input" list="pet-options" value={editor.name} onChange={(event) => patchEditor({ name: event.target.value })} placeholder="选择或输入精灵" />
              <button className="preset-pet-picker-button" onClick={() => setPicker("pet")}>选宠</button>
            </div>
          </FieldLabel>
          <FieldLabel className="preset-bloodline-label">
            <span className="ui-field-title preset-section-title">血脉</span>
            <div className="preset-bloodline-row">
              <select className="preset-bloodline-select" value={editor.bloodline || ""} onChange={(event) => patchEditor({ bloodline: event.target.value })}>
                <option value="">无</option>
                {BLOODLINE_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </FieldLabel>
        </section>
        <div className="slot-inline-controls preset-runtime-section">
          <TeamTraitEditor value={editor} pets={pets} elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onChange={patchEditor} />
          <TeamIvEditor value={editor} onChange={patchEditor} alwaysOpen />
          <TeamEvolutionControls value={editor} pets={pets} onChange={patchEditor} className="preset-evolution-controls" />
        </div>
        <section className="preset-editor-section">
          <div className="panel-title">
            <h2 className="preset-skills-title">技能</h2>
            <RefreshButton className="compact-button preset-skill-reset-button" onClick={() => patchEditor({ skills: [], current_skill: "" })} />
          </div>
          <TeamSkillCardGrid
            cards={skillCards}
            replaceOnChoose
            currentSkill={editor.current_skill}
            onPick={(current_skill) => patchEditor({ current_skill })}
            onChoose={setSkillPickerIndex}
            onClear={clearSkillAt}
          />
        </section>
        {message ? <p className="save-message">{message}</p> : null}
        {error ? <p className="error-text preset-message">错误：{error}</p> : null}
      </section>
      {picker ? (
        <PickerModal
          mode="pet"
          preferredGroup={groupName}
          presets={presets}
          pets={pets}
          elements={elements}
          petSkills={[]}
          allSkills={[]}
          traits={[]}
          configs={configs}
          onConfigsChanged={onConfigsChanged}
          onClose={() => setPicker(null)}
          onPickPreset={(preset) => {
            selectPreset(preset);
            setPicker(null);
          }}
          onPickPet={(pet) => {
            patchEditor({ name: pet.label });
            if (!presetName) setPresetName(`${pet.id}${pet.name}`);
            setPicker(null);
          }}
          onPickSkill={() => undefined}
          onPickTrait={() => undefined}
        />
      ) : null}
      {skillPickerIndex !== null ? (
        <PickerModal
          key={`${editor.name}-${skillPickerIndex}`}
          mode="skill"
          initialSkillName={editor.skills[skillPickerIndex] || ""}
          onClearSkill={() => {
            clearSkillAt(skillPickerIndex);
            setSkillPickerIndex(null);
          }}
          pets={[]}
          elements={elements}
          petSkills={skillDataPetName === editor.name ? skillData.petSkills : []}
          allSkills={skillDataPetName === editor.name ? skillData.allSkills : []}
          traits={[]}
          configs={configs}
          onConfigsChanged={onConfigsChanged}
          onClose={() => setSkillPickerIndex(null)}
          onPickPet={() => undefined}
          onPickSkill={(skill) => {
            setSkillAt(skillPickerIndex, skill.name);
            setSkillPickerIndex(null);
          }}
          onPickTrait={() => undefined}
        />
      ) : null}
      {watchSettingsOpen ? <WatchSkillsSettings elements={elements} configs={configs} onConfigsChanged={onConfigsChanged} onClose={() => setWatchSettingsOpen(false)} /> : null}
      {deleteGroupConfirm ? createPortal(
        <div data-overlay-control className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !deleteGroupBusy) setDeleteGroupConfirm(null);
        }}>
          <section className="team-code-modal preset-group-delete-modal" role="dialog" aria-modal="true" aria-labelledby="preset-group-delete-title">
            <h2 id="preset-group-delete-title">删除分组</h2>
            <p>删除“{deleteGroupConfirm.name}”分组及其中全部 {deleteGroupConfirm.items.length} 个精灵预设？</p>
            <div className="header-actions">
              <button className="compact-button" disabled={deleteGroupBusy} onClick={() => setDeleteGroupConfirm(null)}>取消</button>
              <button className="compact-button" disabled={deleteGroupBusy} onClick={() => void deleteGroup()}>{deleteGroupBusy ? "删除中…" : "确认删除"}</button>
            </div>
            {error ? <p className="error-text">错误：{error}</p> : null}
          </section>
        </div>,
        document.body,
      ) : null}
      {codeOpen ? createPortal(
        <div
          data-overlay-control
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCodeOpen(false);
          }}
        >
          <section className="team-code-modal preset-create-group-modal" role="dialog" aria-modal="true" aria-labelledby="preset-create-group-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2 id="preset-create-group-title">创建分组</h2>
              <button className="compact-button" onClick={() => setCodeOpen(false)}>关闭</button>
            </header>
            <label className="preset-create-group-field">
              <span>分组名</span>
              <input className="preset-new-group-input" value={codeGroupName} onChange={(event) => setCodeGroupName(event.target.value)} placeholder="新分组名" />
            </label>
            <label className="preset-create-group-field">
              <span>阵容码（可选）</span>
              <textarea
                className="team-code-textarea"
                value={codeText}
                onChange={(event) => setCodeText(event.target.value)}
                placeholder="粘贴游戏里复制的完整内容（包含 # 音速犬：首领血脉、{灼伤、热身} 这类说明行和阵容码那一行）"
              />
            </label>
            <div className="team-code-actions">
              <button className="compact-button" disabled={codeBusy} onClick={() => void (codeText.trim() ? importTeamCode("create") : createGroup())}>{codeBusy ? "处理中…" : "创建分组"}</button>
              <button className="compact-button" disabled={codeBusy} onClick={() => void importTeamCode("overwrite")}>覆盖当前分组</button>
            </div>
            <p className="team-code-hint">只填写分组名可创建空分组；填写阵容码则导入到新分组（同名会覆盖）。覆盖当前分组：用阵容码替换“{groupName}”里现有的全部预设。</p>
            {codeMessage ? <p className="save-message">{codeMessage}</p> : null}
            {codeError ? <p className="error-text preset-message">错误：{codeError}</p> : null}
            {codeReport.length ? (
              <div className="team-code-report">
                <span className="ui-field-title">导入结果</span>
                {codeReport.map((line, index) => <p key={index}>{line}</p>)}
              </div>
            ) : null}
          </section>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}

export { PresetManagerPage };
