import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["parsePersonality", "personalityValue", "speedValue", "speedScenarios"];
const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
assert.equal(functions.length, names.length);
const scope = { normalizeStat: (stat) => stat };
vm.createContext(scope);
vm.runInContext(ts.transpileModule(functions.map((node) => node.getText(ast)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, scope);

const pets = [
  { id: "001", name: "初始", label: "001初始", spd: 50, prevForms: [], nextForms: ["002进化"] },
  { id: "002", name: "进化", label: "002进化", spd: 80, prevForms: ["001初始"], nextForms: ["003首领"] },
  { id: "003", name: "首领", label: "003首领", spd: 130, prevForms: ["002进化"], nextForms: ["004超进化"] },
  { id: "004", name: "超进化", label: "004超进化", spd: 160, prevForms: ["003首领"], nextForms: [] },
];
const unit = { name: "003首领", display_name: "自定义预设名", devolution: 0, mega: false, mega_form: null, iv: null, personality_bouns: null, personality_down: null, speed_buff: 0 };
const original = structuredClone({ pets, unit });
const plain = (value) => JSON.parse(JSON.stringify(value));
function calculate(partial = {}, modifiers, data = pets) {
  return plain(scope.speedScenarios({ ...unit, ...partial }, data, modifiers));
}
const baseline = calculate();
assert.equal(baseline.length, 4);
assert.notDeepEqual(calculate({ devolution: 1 }), baseline);
assert.deepEqual(calculate({ devolution: 1 }), calculate({ name: "002进化" }));
assert.deepEqual(calculate({ devolution: 2 }), calculate({ name: "001初始" }));
assert.deepEqual(calculate({ devolution: 5 }), calculate({ name: "001初始" }));
assert.deepEqual(calculate({ devolution: 2, mega: true }), calculate({ name: "002进化" }));
assert.deepEqual(calculate({ mega_form: "004超进化", devolution: 1 }), baseline);
assert.deepEqual(calculate({ mega_form: "004超进化", mega: true, devolution: 1 }), baseline);
assert.deepEqual(calculate({ mega: true }), calculate({ name: "004超进化" }));
const buffed = { devolution: 1, iv: { spd: 7 }, personality_bouns: "spd:0.16", speed_buff: 20 };
assert.deepEqual(calculate(buffed, { flat: 15, percent: .25 }), calculate({ ...buffed, name: "002进化", devolution: 0 }, { flat: 15, percent: .25 }));
const missing = structuredClone(pets);
missing[2].prevForms = ["999不存在"];
assert.deepEqual(calculate({ devolution: 1 }, undefined, missing), baseline);
missing[2].prevForms = ["999进化"];
assert.deepEqual(calculate({ devolution: 1 }, undefined, missing), calculate({ name: "002进化" }));
assert.deepEqual(calculate({ name: "不存在" }), []);
assert.deepEqual({ pets, unit }, original);
console.log("Passed: speed changes with devolution; multiple stages, leader/mega forms, battle form order, IV/personality/buffs, missing links and source preservation.");
