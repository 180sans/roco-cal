import { saveConfigPatch } from "../../services/configSaves";
import { type BurstEffectItem, type PickerConfigs } from "../../services/desktopTypes";
import { useState, useEffect } from "react";
import { asError } from "../../shared/errors";
import { EntityLabel } from "../../components/common/EntityLabel";

function BurstPanelPage({
  effects,
  configs,
  onConfigsChanged,
}: {
  effects: BurstEffectItem[];
  configs: PickerConfigs;
  onConfigsChanged: (configs: PickerConfigs) => void;
}) {
  const savedNotes = (configs.burst_panel?.notes || {}) as Record<string, string>;
  const [notes, setNotes] = useState<Record<string, string>>(savedNotes);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setNotes(savedNotes);
  }, [configs]);

  async function saveNotes(nextNotes: Record<string, string>) {
    try {
      await saveConfigPatch("burst_panel", { notes: nextNotes }, onConfigsChanged);
      setMessage("备注已保存");
    } catch (err) {
      setMessage(`保存失败：${asError(err)}`);
    }
  }

  const skills = effects.filter((effect) => effect.kind === "skill");
  const traits = effects.filter((effect) => effect.kind === "trait");
  const marks = effects.filter((effect) => effect.kind === "mark");
  const renderEffect = (effect: BurstEffectItem) => {
    const isExpanded = expanded === effect.id;
    return (
      <article className={`burst-card ${isExpanded ? "expanded" : ""}`} key={effect.id}>
        <button className="burst-card-summary" onClick={() => setExpanded(isExpanded ? null : effect.id)} aria-expanded={isExpanded}>
          <strong>{effect.kind === "skill" ? <EntityLabel kind="skill" value={effect.name} /> : effect.name}</strong>
          {effect.kind === "skill" ? (
            <span className="burst-card-stats">
              <span>威力 {effect.skill_power ?? "-"}</span>
              <span>费用 {effect.cost ?? "-"}</span>
              <span>{effect.element} {effect.type}</span>
            </span>
          ) : <span className="burst-card-kind">{effect.kind === "mark" ? "印记" : "特性"}</span>}
          <span className="burst-card-expand">{isExpanded ? "收起" : "展开"}</span>
        </button>
        {isExpanded ? (
          <div className="burst-card-detail">
            <p className="burst-effect-description"><span>效果描述</span>{effect.description || "暂无描述"}</p>
            <label>
              <span>迸发效果备注</span>
              <textarea
                value={notes[effect.id] || ""}
                placeholder="填写迸发效果"
                onChange={(event) => {
                  setNotes({ ...notes, [effect.id]: event.target.value });
                  setMessage("");
                }}
                onBlur={() => void saveNotes(notes)}
              />
            </label>
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <section className="burst-panel-page">
      <header className="burst-panel-header">
        <div>
          <h2>雷暴面板</h2>
          <p>固态迸发效果</p>
        </div>
        {message ? <span className="save-message">{message}</span> : null}
      </header>
      <section className="burst-panel-section">
        <h3>电系技能</h3>
        <div className="burst-card-grid">{skills.map(renderEffect)}</div>
      </section>
      <section className="burst-panel-section">
        <h3>特性</h3>
        <div className="burst-card-grid">{traits.map(renderEffect)}</div>
      </section>
      <section className="burst-panel-section">
        <h3>印记</h3>
        <div className="burst-card-grid">{marks.map(renderEffect)}</div>
      </section>
    </section>
  );
}

export { BurstPanelPage };
