import { type SkillItem } from "../../services/desktopTypes";
import { PickerIcon } from "../common/EntityLabel";
import { DEFAULT_SKILL_CARD_COUNT } from "../../domain/constants";

function skillDetail(skill: SkillItem) {
  return skill.detail || skill;
}

function skillMeta(skill: SkillItem, imageLoading: "eager" | "lazy" = "eager", part: "all" | "icons" | "numbers" = "all") {
  const detail = skillDetail(skill);
  const numbers = [
    detail.skill_power !== null && detail.skill_power !== undefined ? `威力 ${detail.skill_power}` : null,
    detail.cost !== undefined ? `费用 ${detail.cost}` : null,
  ].filter(Boolean).join(" / ");
  if (!detail.element && !detail.type && !numbers) return null;
  return <span className="picker-card-meta">
    {part !== "numbers" && detail.element ? <PickerIcon value={detail.element} imageLoading={imageLoading} /> : null}
    {part !== "numbers" && detail.type ? <PickerIcon value={detail.type} kind="skill-type" imageLoading={imageLoading} /> : null}
    {part !== "icons" && numbers ? <span>{numbers}</span> : null}
  </span>;
}

function skillText(skill: SkillItem) {
  const detail = skillDetail(skill);
  return [detail.description || skill.description, skill.unlock].filter(Boolean).join("\n");
}

function skillCardSlots(skills: string[], count = DEFAULT_SKILL_CARD_COUNT) {
  return Array.from({ length: count }, (_, index) => skills[index] || "");
}

export { skillDetail, skillText, skillMeta, skillCardSlots };
