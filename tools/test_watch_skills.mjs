import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/watchSkills.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { readWatchConfiguration, watchConfigurationValues, parseWatchTags, groupWatchedSkills, watchSkillMatchesSearch } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const old = { watch_skills: ["倾斜"], watch_skills_by_group: { 队伍一: ["守护"], 队伍二: ["倾斜"] } };
const migrated = readWatchConfiguration(old);
assert.equal(migrated.groups.length, 3);
assert.equal(migrated.groups[1].rules[0].name, "守护");
const selected = { ...migrated, activeGroupId: migrated.groups[2].id };
assert.deepEqual(readWatchConfiguration({ ...old, ...watchConfigurationValues(selected) }), selected);
assert.equal(readWatchConfiguration({ ...old, ...watchConfigurationValues(selected), watch_skills_by_group: { 新队伍: [] } }).activeGroupId, selected.activeGroupId);
assert.deepEqual(parseWatchTags("防御，清印记, 防御；重点"), ["防御", "清印记", "重点"]);

const skills = [
  { name: "守护", detail: { type: "防御", description: "抵挡攻击" } },
  { name: "倾斜", detail: { type: "状态", description: "清除印记" } },
  { name: "破盾", type: "物攻", element: "火", description: "应对：防御，提升威力" },
  { name: "拦截", type: "魔攻", element: "水", description: "应对状态技能" },
  { name: "火盾", type: "防御", element: "火" },
];
assert.deepEqual([...skills, { name: "积蓄", description: "获得蓄电印记" }].filter((skill) => watchSkillMatchesSearch(skill, "印记")).map((skill) => skill.name), ["倾斜", "积蓄"]);
assert.deepEqual(skills.filter((skill) => watchSkillMatchesSearch(skill, "倾斜")).map((skill) => skill.name), ["倾斜"]);
const rule = (id, kind, tags, name = kind) => ({ id, kind, tags, name });
const rules = [
  rule("def", "defense", ["防御"]),
  rule("tilt", "skill", ["清印记", "重点"], "倾斜"),
  rule("fire", "super-effective", ["克制"]),
  rule("cd", "counter-defense", ["破防"]),
  rule("cs", "counter-status", ["拦截"]),
  rule("exact", "skill", ["防御"], "守护"),
  rule("absent", "skill", ["不存在"], "敌方没有的技能"),
];
const groups = groupWatchedSkills(rules, skills, { 火: 2, 水: 0.5 });
const names = (tag) => groups.find((group) => group.tag === tag).matches.map(({ skill }) => skill.name);
assert.deepEqual(names("防御"), ["守护", "火盾"]);
assert.deepEqual(names("清印记"), ["倾斜"]);
assert.deepEqual(names("重点"), ["倾斜"]);
assert.deepEqual(names("克制"), ["破盾"]);
assert.deepEqual(names("破防"), ["破盾"]);
assert.deepEqual(names("拦截"), ["拦截"]);
assert.deepEqual(names("不存在"), []);
assert.deepEqual(groups[0].matches[0].ruleIds, ["def", "exact"]);
assert.deepEqual(groupWatchedSkills([rules[2]], skills, { 火: 0.5, 水: 2 })[0].matches.map(({ skill }) => skill.name), ["拦截"]);
assert.deepEqual(groupWatchedSkills([rules[2]], skills, {})[0].matches, []);
assert.equal(groupWatchedSkills([rule("plain", "skill", [], "倾斜")], skills, {})[0].tag, "未标签");
console.log("醒目技能：旧配置迁移、独立分组、多标签归类、去重、动态克制及描述分类检查通过。");
