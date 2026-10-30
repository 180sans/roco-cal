import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { EntityLabel } from "../../components/common/EntityLabel";
import { skillCardSlots } from "../../components/picker/skillPresentation";
import { PickerModal } from "../../components/picker/PickerModal";
import { cachedListSkills } from "../../services/desktopApi";
import { useLatestEffect } from "../../services/useLatestRequest";
import { type PickerConfigs, type SkillListResult } from "../../services/desktopTypes";

function SkillOrderPanel({ skills, petName, elements, configs, onConfigsChanged, onSave, onClose }: {
  skills: string[];
  petName: string;
  elements: string[];
  configs: PickerConfigs;
  onConfigsChanged: (configs: PickerConfigs) => void;
  onSave: (skills: string[]) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState(() => skillCardSlots(skills, 4).map((name, id) => ({ id, name })));
  const [dragging, setDragging] = useState<{ id: number; y: number } | null>(null);
  const [pickerId, setPickerId] = useState<number | null>(null);
  const [skillData, setSkillData] = useState<SkillListResult>({ petSkills: [], allSkills: [] });
  const dragRef = useRef<{ id: number; pointerId: number; startY: number; originY: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowHeight = 48;
  const rowGap = 6;
  const rowStep = rowHeight + rowGap;

  useLatestEffect((request) => {
    if (pickerId === null) return;
    void cachedListSkills(petName)
      .then((data) => { if (request.isCurrent()) setSkillData(data); })
      .catch(() => { if (request.isCurrent()) setSkillData({ petSkills: [], allSkills: [] }); });
  }, [pickerId, petName]);

  function setSkill(id: number, name: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, name } : item));
    setPickerId(null);
  }

  function moveSkill(id: number, target: number) {
    setItems((current) => {
      const from = current.findIndex((item) => item.id === id);
      if (from < 0 || target < 0 || target >= current.length || from === target) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  function startSkillDrag(event: ReactPointerEvent<HTMLDivElement>, id: number) {
    if (event.button !== 0 || !event.isPrimary || dragRef.current || !listRef.current
      || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.currentTarget.focus();
    listRef.current.setPointerCapture(event.pointerId);
    const originY = items.findIndex((item) => item.id === id) * rowStep;
    dragRef.current = { id, pointerId: event.pointerId, startY: event.clientY, originY };
    setDragging({ id, y: originY });
  }

  function moveSkillDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !listRef.current) return;
    event.preventDefault();
    const y = Math.max(0, Math.min((items.length - 1) * rowStep, drag.originY + event.clientY - drag.startY));
    setDragging({ id: drag.id, y });
    moveSkill(drag.id, Math.round(y / rowStep));
  }

  function stopSkillDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <>
    {createPortal(
    <div data-overlay-control className="modal-backdrop" onKeyDown={(event) => {
      if (pickerId !== null) return;
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="team-code-modal plugin-skill-order-modal" role="dialog" aria-modal="true" aria-labelledby="skill-order-title">
        <header><h2 id="skill-order-title">技能排序</h2><button className="compact-button" onClick={onClose}>取消</button></header>
        <div ref={listRef} className="plugin-skill-order-list" role="list" aria-label="我方技能顺序"
          style={{ height: items.length * rowStep - rowGap }}
          onPointerMove={moveSkillDrag} onPointerUp={stopSkillDrag} onPointerCancel={stopSkillDrag} onLostPointerCapture={stopSkillDrag}>
          {items.map((item, index) => <div
            key={item.id}
            className={`plugin-skill-order-row${dragging?.id === item.id ? " is-dragging" : ""}`}
            style={{ height: rowHeight, transform: `translateY(${dragging?.id === item.id ? dragging.y : index * rowStep}px)` }}
            role="listitem"
            tabIndex={0}
            aria-label={`技能${index + 1}：${item.name || "空技能"}`}
            onPointerDown={(event) => startSkillDrag(event, item.id)}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault();
              moveSkill(item.id, index + (event.key === "ArrowUp" ? -1 : 1));
            }}
          ><span aria-hidden="true">↕</span><span className="plugin-skill-order-name">{item.name ? <EntityLabel kind="skill" value={item.name} /> : <span>空技能 {index + 1}</span>}</span>
            <button className="compact-button" onClick={() => setPickerId(item.id)} aria-label={`选择技能${index + 1}`}>选技</button>
            <button className="compact-button" disabled={!item.name} onClick={() => setSkill(item.id, "")} aria-label={`删除技能${index + 1}`}>删除</button>
          </div>)}
        </div>
        <button className="primary-button" autoFocus onClick={() => onSave([...items.map((item) => item.name), ...skills.slice(4)])}>保存退出</button>
      </section>
    </div>, document.body,
    )}
    {pickerId !== null ? <PickerModal
      mode="skill" pets={[]} traits={[]} elements={elements}
      petSkills={skillData.petSkills} allSkills={skillData.allSkills}
      configs={configs} onConfigsChanged={onConfigsChanged}
      initialSkillName={items.find((item) => item.id === pickerId)?.name || ""}
      searchSkillDescriptions
      onClose={() => setPickerId(null)} onPickPet={() => undefined} onPickTrait={() => undefined}
      onPickSkill={(skill) => setSkill(pickerId, skill.name)} onClearSkill={() => setSkill(pickerId, "")}
    /> : null}
  </>;
}

export { SkillOrderPanel };
