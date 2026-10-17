import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const start = source.indexOf("  async function calculateWillpower(");
const handler = source.slice(start, source.indexOf("\n  async function calculateRequiredPower(", start));
const code = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const clicks = [...source.matchAll(/className="bonus-tool-button willpower" onClick=\{\(\) => void (calculateWillpower\([^\n]*?\))\}/g)].map((match) => match[1]);
assert.equal(clicks.length, 2);

for (const displayMode of ["plugin", "normal"]) {
  for (const leftAttacks of [true, false]) {
    for (const button of [0, 1]) {
      const left = { name: "我方", power_bonus: 17, iv: { atk: 10 }, trait_stacks: 3 };
      const right = { name: "敌方", power_bonus: 29, iv: { mag: 7 }, trait_stacks: 5 };
      const leftBonuses = { dedication: 2 }, rightBonuses = { marks: 4 };
      const attackFromLeft = displayMode === "plugin" ? button === 0 : leftAttacks;
      const attacker = attackFromLeft ? left : right;
      const defender = attackFromLeft ? right : left;
      const expected = {
        attacker: { ...attacker, other_bonuses: attackFromLeft ? leftBonuses : rightBonuses },
        defender: { ...defender, other_bonuses: attackFromLeft ? rightBonuses : leftBonuses },
        weather: "rain",
        restrict_to_bloodline: attackFromLeft,
      };
      const response = { elements: [{ element: "电", results: [{ damage: 123 }] }] };
      const state = {}, calls = [];
      const scope = {
        displayMode, leftAttacks, leftSlots: [{ name: "unused" }, left], rightSlots: [right], leftIndex: 1, rightIndex: 0,
        leftOtherBonuses: leftBonuses, rightOtherBonuses: rightBonuses, weather: "rain",
        invoke: async (command, { payload }) => { calls.push({ command, payload }); return response; },
        battleContextFromUnits: (a, d) => ({ attackerName: a.name, defenderName: d.name }),
        setError: (value) => { state.error = value; },
        setBattleContext: (value) => { state.context = value; },
        setWillpower: (value) => { state.willpower = value; },
        setRequiredPower: (value) => { state.requiredPower = value; },
        setSelectedWillpowerElement: (value) => { state.element = value; },
        setResults: (value) => { state.results = value; },
        asError: String,
      };
      vm.createContext(scope);
      vm.runInContext(code, scope);
      await vm.runInContext(clicks[button], scope);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].command, "calculate_willpower");
      assert.deepEqual(JSON.parse(JSON.stringify(calls[0].payload)), expected);
      assert.equal(state.error, "");
      assert.equal(state.context.attackerName, attacker.name);
      assert.equal(state.context.defenderName, defender.name);
      assert.equal(state.context.skillName, "愿力");
      assert.equal(state.context.defenderFirst, !attackFromLeft);
      assert.equal(state.willpower, response);
      assert.equal(state.results, response.elements[0].results);
      assert.equal(state.element, "电");
      assert.equal(scope.leftAttacks, leftAttacks);
    }
  }
}
console.log("Passed: both willpower buttons, both global directions, plugin side selection, normal-mode behavior, original bonuses and result context.");
