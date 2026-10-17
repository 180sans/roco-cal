import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
function between(start, end) {
  const offset = source.indexOf(start);
  assert.ok(offset >= 0, start);
  return source.slice(offset, source.indexOf(end, offset));
}
const code = ts.transpileModule([
  between("function buildPetLookup(", "\nfunction petFromPreset("),
  between("function blankUnit(", "\nfunction blankTeamOtherBonuses("),
  between("function unitFromPreset(", "\nfunction updateIv("),
  between("  function defaultBloodlineForPet(", "\n  function newPreset("),
].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
let editor = { name: "", bloodline: "", power_bonus: 13 };
const scope = {
  setEditor: (update) => { editor = typeof update === "function" ? update(editor) : update; },
  setNewPresetHint() {}, setSelectedKey() {}, setPresetName() {}, setMessage() {}, setError() {},
};
vm.createContext(scope);
vm.runInContext(code, scope);
scope.petLookup = scope.buildPetLookup([
  { id: "001", name: "双属性", label: "001双属性", elements: ["电", "翼"] },
  { id: "002", name: "另一个", label: "002另一个", elements: ["水系", "冰"] },
]);
scope.patchEditor({ name: "001双属性" });
assert.equal(editor.bloodline, "电系血脉");
assert.equal(editor.power_bonus, 13);
scope.patchEditor({ bloodline: "首领血脉" });
scope.patchEditor({ trait_stacks: 3 });
assert.equal(editor.bloodline, "首领血脉");
scope.patchEditor({ name: "001双属性" });
assert.equal(editor.bloodline, "首领血脉");
scope.patchEditor({ name: "另一个" });
assert.equal(editor.bloodline, "水系血脉");
scope.patchEditor({ bloodline: "" });
scope.patchEditor({ iv: { atk: 10 } });
assert.equal(editor.bloodline, "");
scope.patchEditor({ name: "未知精灵" });
assert.equal(editor.bloodline, "");
scope.patchEditor({ name: "001双属性", bloodline: "火系血脉" });
assert.equal(editor.bloodline, "火系血脉");
const preset = { key: "保存的精灵", id: "001", name: "双属性", skills: [] };
scope.selectPreset(preset);
assert.equal(editor.bloodline, "电系血脉");
assert.equal(preset.bloodline, undefined);
scope.selectPreset({ ...preset, bloodline: "首领血脉" });
assert.equal(editor.bloodline, "首领血脉");
const merged = scope.mergePresetIntoUnit({ ...scope.blankUnit(), phys_atk_buff: 50 }, { ...preset, bloodline: "火系血脉" });
assert.equal(merged.bloodline, "火系血脉");
assert.equal(merged.phys_atk_buff, 50);
assert.equal(scope.unitFromPreset(preset).bloodline, "");
console.log("Passed: first-element default, name lookup, pet changes, explicit choices, existing bloodlines, unset battle presets, group import and unrelated fields.");
