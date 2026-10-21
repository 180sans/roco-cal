export const WATCH_RULE_OPTIONS = [
  { kind: "super-effective", label: "克制技能" },
  { kind: "counter-defense", label: "应对防御" },
  { kind: "counter-status", label: "应对状态" },
  { kind: "defense", label: "防御" },
] as const;

export type WatchRuleKind = "skill" | typeof WATCH_RULE_OPTIONS[number]["kind"];
export type WatchRule = { id: string; kind: WatchRuleKind; name: string; tags: string[] };
export type WatchGroup = { id: string; name: string; rules: WatchRule[]; tags?: string[] };
export type WatchConfiguration = { groups: WatchGroup[]; activeGroupId: string };
export type WatchSkill = { name: string; type?: string; element?: string; description?: string; detail?: { type?: string; element?: string; description?: string } | null };

export function parseWatchTags(text: string): string[] {
  return [...new Set(text.split(/[,，、;；\n]+/).map((tag) => tag.trim()).filter(Boolean))];
}

export function watchSkillMatchesSearch(skill: WatchSkill, query: string): boolean {
  return `${skill.name}\n${(skill.detail || skill).description || ""}`.toLowerCase().includes(query.trim().toLowerCase());
}

export function readWatchConfiguration(layout: Record<string, unknown> = {}): WatchConfiguration {
  let groups: WatchGroup[];
  if (Array.isArray(layout.watch_skill_groups) && layout.watch_skill_groups.length) {
    groups = layout.watch_skill_groups as WatchGroup[];
  } else {
    // 旧列表只用于迁移，迁移后的分组与精灵分组不再关联。
    const legacy = layout.watch_skills_by_group && typeof layout.watch_skills_by_group === "object"
      ? Object.entries(layout.watch_skills_by_group) : [];
    if (Array.isArray(layout.watch_skills) && layout.watch_skills.length) legacy.unshift(["原全局", layout.watch_skills]);
    groups = legacy.map(([name, skills], index) => ({
      id: `legacy-${index}`, name,
      rules: (Array.isArray(skills) ? skills : []).filter((skill): skill is string => typeof skill === "string")
        .map((name, ruleIndex) => ({ id: `legacy-${index}-${ruleIndex}`, kind: "skill", name, tags: [] })),
    }));
    if (!groups.length) groups = [{ id: "default", name: "默认分组", rules: [] }];
  }
  const savedId = layout.active_watch_skill_group;
  return { groups, activeGroupId: groups.find((group) => group.id === savedId)?.id || groups[0].id };
}

export function watchConfigurationValues(configuration: WatchConfiguration) {
  return { watch_skill_groups: configuration.groups, active_watch_skill_group: configuration.activeGroupId };
}

export function watchSkillMatches(rule: WatchRule, skill: WatchSkill, advantages: Record<string, number>): boolean {
  const detail = skill.detail || skill;
  const description = detail.description || "";
  switch (rule.kind) {
    case "skill": return skill.name === rule.name;
    case "defense": return detail.type === "防御";
    case "counter-defense": return /应对[\s：:（(]*防御/.test(description);
    case "counter-status": return /应对[\s：:（(]*状态/.test(description);
    case "super-effective": return (detail.type === "物攻" || detail.type === "魔攻") && (advantages[detail.element || ""] || 0) > 1;
  }
}

export function groupWatchedSkills(rules: WatchRule[], skills: WatchSkill[], advantages: Record<string, number>) {
  const groups = new Map<string, Map<string, { skill: WatchSkill; ruleIds: string[] }>>();
  for (const rule of rules) {
    for (const tag of rule.tags.length ? rule.tags : ["未标签"]) {
      if (!groups.has(tag)) groups.set(tag, new Map());
      const matches = groups.get(tag)!;
      for (const skill of skills) {
        if (!watchSkillMatches(rule, skill, advantages)) continue;
        const existing = matches.get(skill.name);
        if (existing) existing.ruleIds.push(rule.id);
        else matches.set(skill.name, { skill, ruleIds: [rule.id] });
      }
    }
  }
  return [...groups].map(([tag, matches]) => ({ tag, matches: [...matches.values()] }));
}
