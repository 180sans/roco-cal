import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const start = source.indexOf("  const currentSkillSource =");
const filter = source.slice(start, source.indexOf("\n  async function saveConfig(", start));
const detailStart = source.indexOf("function skillDetail(");
const detail = source.slice(detailStart, source.indexOf("\n}", detailStart) + 2);
const code = ts.transpileModule(`${detail}\n${filter}\nJSON.stringify(filteredSkills.map((skill) => skill.name));`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const skills = [
  { name: "火", element: "火", type: "魔攻" },
  { name: "光A", detail: { element: "光", type: "物攻" } },
  { name: "未知", type: "物攻" },
  { name: "普通", element: "普通", type: "魔攻" },
  { name: "光B", element: "光", type: "魔攻" },
];
const original = structuredClone(skills);
function run(values = {}) {
  const context = { mode: "skill", skillTab: "library", petSkills: skills, allSkills: skills, elements: ["普通", "光", "火"], normalizedQuery: "", element: "", skillType: "", useMemo: (fn) => fn(), ...values };
  vm.createContext(context);
  return JSON.parse(vm.runInContext(code, context));
}
assert.deepEqual(run(), ["普通", "光A", "光B", "火", "未知"]);
assert.deepEqual(run({ skillTab: "pet" }), ["普通", "光A", "光B", "火", "未知"]);
assert.deepEqual(run({ element: "光" }), ["光A", "光B"]);
assert.deepEqual(run({ skillType: "魔攻" }), ["普通", "光B", "火"]);
assert.deepEqual(run({ normalizedQuery: "光" }), ["光A", "光B"]);
assert.deepEqual(skills, original);
console.log("Passed: library element order, stable ties, unknown elements, pet skill order, filters and source preservation.");
