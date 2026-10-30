import { useOptimisticConfig } from "../../services/useOptimisticConfig";
import { useLatestEffect } from "../../services/useLatestRequest";
import { saveConfigPatch } from "../../services/configSaves";
import { type PickerConfigs, type SkillItem, type UnitState } from "../../services/desktopTypes";
import { useState, useRef, useEffect } from "react";
import {
  readWatchConfiguration,
  type WatchConfiguration,
  watchConfigurationValues,
  type WatchGroup,
  type WatchRule,
  WATCH_RULE_OPTIONS,
  groupWatchedSkills,
} from "../../watchSkills";
import { desktopApi, cachedListSkills } from "../../services/desktopApi";
import { createPortal } from "react-dom";
import { asError } from "../../shared/errors";
import { EntityLabel } from "../../components/common/EntityLabel";
import { PickerModal } from "../../components/picker/PickerModal";
import { type PluginOverlayLayout } from "../plugin/layout";
import { FloatingTeamPanel } from "../plugin/PluginPanels";
import { skillDetail } from "../../components/picker/skillPresentation";

function useWatchConfiguration(configs: PickerConfigs, onConfigsChanged: (configs: PickerConfigs) => void, onError: (error: string) => void) {
  const [configuration, setConfiguration] = useState(() => readWatchConfiguration(configs.team_layout));
  const current = useRef(configuration);
  const changes = useOptimisticConfig(configuration, (next) => {
    current.current = next;
    setConfiguration(next);
  });
  useEffect(() => {
    if (changes.isPending()) return;
    const next = readWatchConfiguration(configs.team_layout);
    current.current = next;
    setConfiguration(next);
  }, [configs.team_layout]);

  async function update(change: (value: WatchConfiguration) => WatchConfiguration) {
    const operation = changes.begin(change(current.current));
    try {
      await saveConfigPatch("team_layout", watchConfigurationValues(current.current), onConfigsChanged);
      operation.commit();
      return true;
    } catch (error) {
      if (operation.rollback()) onError(asError(error));
      return false;
    }
  }
  return [configuration, update] as const;
}

function WatchSkillsSettings({ elements, configs, onConfigsChanged, onClose }: {
  elements: string[];
  configs: PickerConfigs;
  onConfigsChanged: (configs: PickerConfigs) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [configuration, update] = useWatchConfiguration(configs, onConfigsChanged, setError);
  const group = configuration.groups.find((item) => item.id === configuration.activeGroupId)!;
  const [groupDraft, setGroupDraft] = useState<WatchGroup>(group);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const draftIsSaved = configuration.groups.some((item) => item.id === groupDraft.id);
  const [newTags, setNewTags] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [tagNameDraft, setTagNameDraft] = useState("");
  useEffect(() => { setGroupDraft(group); setEditingGroupName(false); setSelectedTag(null); setEditingTag(null); setSaveMessage(""); }, [group.id]);
  const tags = [...new Set([...(groupDraft.tags || []), ...groupDraft.rules.flatMap((rule) => rule.tags)])];
  const visibleTags = groupDraft.rules.some((rule) => !rule.tags.length) || !tags.length ? ["", ...tags] : tags;
  const activeTag = selectedTag !== null && visibleTags.includes(selectedTag) ? selectedTag : visibleTags[0];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allSkills, setAllSkills] = useState<SkillItem[]>([]);
  useLatestEffect((request) => {
    if (!pickerOpen) return;

    void cachedListSkills("").then((data) => { if (request.isCurrent()) setAllSkills(data.allSkills); }).catch((error) => { if (request.isCurrent()) setError(asError(error)); });
    return;
  }, [pickerOpen]);

  function changeRules(change: (rules: WatchRule[]) => WatchRule[]) {
    setSaveMessage("");
    setGroupDraft((value) => ({ ...value, rules: change(value.rules) }));
  }
  function addRule(kind: WatchRule["kind"], name: string) {
    const tags = activeTag ? [activeTag] : [];
    changeRules((rules) => {
      const existing = rules.find((rule) => rule.kind === kind && (kind !== "skill" || rule.name === name));
      if (existing) return rules.map((rule) => rule.id === existing.id ? { ...rule, name, tags: [...new Set([...rule.tags, ...tags])] } : rule);
      return [...rules, { id: crypto.randomUUID(), kind, name, tags }];
    });
  }
  function addTag() {
    const tag = newTags.trim();
    if (!tag) { setError("请填写标签名"); return; }
    if (tags.includes(tag)) { setError("标签已存在"); return; }
    setError("");
    setSaveMessage("");
    setGroupDraft((value) => ({ ...value, tags: [...new Set([...(value.tags || []), ...value.rules.flatMap((rule) => rule.tags), tag])] }));
    setSelectedTag(tag);
    setNewTags("");
  }
  function renameTag(tag: string) {
    const name = tagNameDraft.trim();
    if (!name) { setError("标签名不能为空"); return; }
    if (name !== tag && tags.includes(name)) { setError("标签已存在"); return; }
    setError("");
    setSaveMessage("");
    setGroupDraft((value) => ({
      ...value,
      tags: [...new Set([...(value.tags || []), ...value.rules.flatMap((rule) => rule.tags), ...(tag ? [] : [name])].map((item) => item === tag ? name : item))],
      rules: value.rules.map((rule) => ({ ...rule, tags: tag ? rule.tags.map((item) => item === tag ? name : item) : rule.tags.length ? rule.tags : [name] })),
    }));
    setSelectedTag(name);
    setEditingTag(null);
  }
  async function saveGroup() {
    const name = groupDraft.name.trim();
    if (!name) { setError("请填写醒目技能分组名"); return; }
    if (configuration.groups.some((item) => item.name === name && item.id !== groupDraft.id)) { setError("醒目技能分组名已存在"); return; }
    setError("");
    setSaveMessage("");
    setSaving(true);
    const next = { ...groupDraft, name };
    setGroupDraft(next);
    const success = await update((value) => ({
      groups: value.groups.some((item) => item.id === next.id)
        ? value.groups.map((item) => item.id === next.id ? next : item)
        : [...value.groups, next],
      activeGroupId: next.id,
    }));
    setSaving(false);
    if (success) {
      setEditingGroupName(false);
      setSaveMessage(`已保存醒目技能分组：${name}`);
    }
  }

  return <>{createPortal(
    <div data-overlay-control className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="team-code-modal preset-watch-modal" role="dialog" aria-modal="true" aria-labelledby="preset-watch-title">
        <header><h2 id="preset-watch-title">醒目技能</h2><button className="compact-button" onClick={onClose}>关闭</button></header>
        <div className="watch-settings-row watch-settings-group">
          <label htmlFor="watch-group-name">分组</label>
          {editingGroupName || !draftIsSaved ? <input id="watch-group-name" aria-label="醒目技能分组名" autoFocus value={groupDraft.name} placeholder="输入分组名" onChange={(event) => {
            setSaveMessage("");
            setGroupDraft((value) => ({ ...value, name: event.target.value }));
          }} onKeyDown={(event) => {
            if (event.key === "Enter" && !saving) void saveGroup();
            if (event.key === "Escape" && draftIsSaved) {
              const saved = configuration.groups.find((item) => item.id === groupDraft.id)!;
              setGroupDraft((value) => ({ ...value, name: saved.name }));
              setEditingGroupName(false);
            }
          }} /> : <select id="watch-group-name" aria-label="醒目技能分组" value={groupDraft.id} disabled={saving} onChange={(event) => {
            const selected = configuration.groups.find((item) => item.id === event.target.value);
            if (!selected) return;
            setGroupDraft(selected);
            setEditingGroupName(false);
            setSelectedTag(null);
            setEditingTag(null);
            setNewTags("");
            setError("");
            setSaveMessage("");
            void update((value) => ({ ...value, activeGroupId: selected.id }));
          }}>
            {configuration.groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>}
          <button className="compact-button" disabled={saving || !draftIsSaved} onClick={() => { setEditingGroupName(true); setSaveMessage(""); }}>重命名</button>
          <button className="compact-button" disabled={saving} onClick={() => void saveGroup()}>{saving ? "保存中…" : "保存"}</button>
          <button className="compact-button" disabled={saving} onClick={() => {
            setError("");
            setGroupDraft({ id: crypto.randomUUID(), name: "", rules: [] });
            setEditingGroupName(true);
            setSelectedTag(null);
            setEditingTag(null);
            setSaveMessage("");
            setNewTags("");
          }}>新建</button>
          <button className="compact-button watch-settings-delete" disabled={saving || configuration.groups.length === 1 || !draftIsSaved} onClick={() => {
            if (!window.confirm(`删除醒目技能分组“${groupDraft.name}”？`)) return;
            update((value) => { const groups = value.groups.filter((item) => item.id !== groupDraft.id); setGroupDraft(groups[0]); return { groups, activeGroupId: groups[0].id }; });
          }}>删除分组</button>
        </div>
        {saveMessage ? <p className="save-message" role="status">{saveMessage}</p> : null}
        <div className="watch-settings-tag-groups">
          {visibleTags.map((tag) => <section className="watch-settings-tag-group" key={`${groupDraft.id}-${tag}`}>
            <div className="watch-settings-tag-header">
              {editingTag === tag ? <>
                <input className="watch-settings-tag-name" aria-label="修改标签名" autoFocus value={tagNameDraft} onChange={(event) => setTagNameDraft(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter") renameTag(tag);
                  if (event.key === "Escape") setEditingTag(null);
                }} />
                <button className="compact-button" title="确认标签名" aria-label="确认标签名" onClick={() => renameTag(tag)}>✓</button>
                <button className="compact-button" title="取消修改标签名" aria-label="取消修改标签名" onClick={() => setEditingTag(null)}>×</button>
              </> : <>
                <button type="button" className={`compact-button watch-settings-tag${tag === activeTag ? " active" : ""}`} aria-pressed={tag === activeTag} onClick={() => setSelectedTag(tag)}>{tag || "未标签"}</button>
                <button className="compact-button watch-settings-tag-edit" title="修改标签名" aria-label={`修改${tag || "未标签"}标签名`} onClick={() => { setEditingTag(tag); setTagNameDraft(tag); }}>✎</button>
              </>}
            </div>
            <div className="watch-settings-rules">
              {groupDraft.rules.filter((rule) => tag ? rule.tags.includes(tag) : !rule.tags.length).map((rule) => <div className="watch-settings-rule" key={rule.id}>
                <span>{rule.kind === "skill" ? <EntityLabel kind="skill" value={rule.name} /> : WATCH_RULE_OPTIONS.find((option) => option.kind === rule.kind)?.label || rule.name}</span>
                <button className="compact-button" aria-label={`从${tag || "未标签"}移除${rule.name}`} onClick={() => changeRules((rules) => rules.flatMap((item) => {
                  if (item.id !== rule.id) return [item];
                  const tags = item.tags.filter((itemTag) => itemTag !== tag);
                  return tags.length ? [{ ...item, tags }] : [];
                }))}>×</button>
              </div>)}
            </div>
          </section>)}
        </div>
        <div className="watch-settings-row watch-settings-add-skills">
          {WATCH_RULE_OPTIONS.map((option) => <button className="compact-button" key={option.kind} onClick={() => addRule(option.kind, option.label)}>{option.label}</button>)}
          <button className="compact-button watch-settings-pick" title="按技能名称或描述搜索" onClick={() => setPickerOpen(true)}>选择</button>
          <div className="watch-settings-new-tag">
            <input aria-label="标签名" value={newTags} onChange={(event) => setNewTags(event.target.value)} placeholder="标签名" onKeyDown={(event) => { if (event.key === "Enter") addTag(); }} />
            <button className="compact-button" onClick={addTag}>新增标签</button>
          </div>
        </div>
        {error ? <p className="error-text">错误：{error}</p> : null}
      </section>
    </div>, document.body,
  )}{pickerOpen ? <PickerModal mode="skill" searchSkillDescriptions pets={[]} elements={elements} petSkills={allSkills} allSkills={allSkills} traits={[]} configs={configs} onConfigsChanged={onConfigsChanged} onClose={() => setPickerOpen(false)} onPickPet={() => undefined} onPickTrait={() => undefined} onPickSkill={(skill) => addRule("skill", skill.name)} /> : null}</>;
}

/* 敌方醒目技能按独立分组中的规则匹配，再按自定义标签归类。 */
function EnemyWatchSkillsPanel({ layout, onLayoutChange, configuration, onConfigurationChange, self, enemy }: {
  layout: PluginOverlayLayout;
  onLayoutChange: (partial: Partial<PluginOverlayLayout>) => void;
  configuration: WatchConfiguration;
  onConfigurationChange: (change: (value: WatchConfiguration) => WatchConfiguration) => void;
  self: UnitState;
  enemy: UnitState;
}) {
  const enemyName = enemy.mega_form || enemy.name;
  const [skillData, setSkillData] = useState<{ name: string; skills: SkillItem[] }>({ name: "", skills: [] });
  const group = configuration.groups.find((item) => item.id === configuration.activeGroupId)!;
  const needsAdvantages = group.rules.some((rule) => rule.kind === "super-effective");
  const defenderKey = JSON.stringify([self.name, self.devolution, self.mega, self.mega_form]);
  const [advantageData, setAdvantageData] = useState<{ key: string; values: Record<string, number> }>({ key: "", values: {} });
  const [advantageError, setAdvantageError] = useState("");
  const [skillError, setSkillError] = useState("");
  const [collapsedTags, setCollapsedTags] = useState<Record<string, boolean>>({});

  useLatestEffect((request) => {
    setSkillError("");
    if (!enemyName) return;

    void cachedListSkills(enemyName)
      .then((data) => { if (request.isCurrent()) setSkillData({ name: enemyName, skills: data.petSkills }); })
      .catch((error) => { if (request.isCurrent()) { setSkillData({ name: enemyName, skills: [] }); setSkillError(asError(error)); } });
    return;
  }, [enemyName]);

  useLatestEffect((request) => {
    setAdvantageError("");
    if (!needsAdvantages || !self.name) return;

    void desktopApi.calculateWatchAdvantages({ defender: { name: self.name, devolution: self.devolution, mega: self.mega, mega_form: self.mega_form } })
      .then((values) => { if (request.isCurrent()) setAdvantageData({ key: defenderKey, values }); })
      .catch((error) => { if (request.isCurrent()) { setAdvantageData({ key: defenderKey, values: {} }); setAdvantageError(asError(error)); } });
    return;
  }, [defenderKey, needsAdvantages]);

  const matchedGroups = groupWatchedSkills(group.rules, skillData.name === enemyName ? skillData.skills : [], advantageData.key === defenderKey ? advantageData.values : {}).filter(({ matches }) => matches.length > 0);

  return (
    <FloatingTeamPanel className="watch-skill-panel" overlayId="right-watch" layout={layout} onLayoutChange={onLayoutChange}>
      <div className="watch-skill-title">醒目技能 <select aria-label="插件醒目技能分组" value={group.id} onChange={(event) => onConfigurationChange((value) => ({ ...value, activeGroupId: event.target.value }))}>
        {configuration.groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></div>
      {matchedGroups.map(({ tag, matches }) => {
        const tagKey = JSON.stringify([group.id, tag]);
        const collapsed = Boolean(collapsedTags[tagKey]);
        return <div className="watch-skill-tag-group" key={tag}>
          <button type="button" className="watch-skill-tag" aria-expanded={!collapsed} onClick={() => setCollapsedTags((value) => ({ ...value, [tagKey]: !value[tagKey] }))}>{tag} <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span></button>
          {!collapsed ? <div className="watch-skill-list" onPointerDown={(event) => event.stopPropagation()}>{matches.map(({ skill }) => <div className="watch-skill-item" key={skill.name} title={[skill.name, skillDetail(skill).description || skill.description].filter(Boolean).join("\n")}>
            <span><EntityLabel kind="skill" value={skill.name} /></span>
          </div>)}</div> : null}
        </div>;
      })}
      {!matchedGroups.length ? <div className="watch-skill-empty">无</div> : null}
      {needsAdvantages && self.name && advantageData.key !== defenderKey && !advantageError ? <div className="watch-skill-empty">克制技能计算中…</div> : null}
      {advantageError || skillError ? <div className="error-text">{advantageError || skillError}</div> : null}
    </FloatingTeamPanel>
  );
}

export { useWatchConfiguration, EnemyWatchSkillsPanel, WatchSkillsSettings };
