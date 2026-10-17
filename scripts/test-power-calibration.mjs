import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const start = source.indexOf("  async function calibratePowerStacks(");
const handler = source.slice(start, source.indexOf("\n  useEffect(", start));
const code = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
async function run({ skills = ["A", "B", "plain", ""], powers = ["90", "140", "50", ""], right = false, ambiguous = false, fail = false } = {}) {
  const original = { name: "攻击方", skills, skill_trigger_stacks: { A: [7, 3], B: [1] }, power_bonus: 12 };
  const defender = { name: "防御方", skills: [], skill_trigger_stacks: {} };
  const patches = [], requests = [], commands = [];
  const scope = {
    leftAttacks: !right, leftIndex: 0, rightIndex: 1,
    leftSlots: [right ? defender : original], rightSlots: [{}, right ? original : defender],
    leftOtherBonuses: { side: "left" }, rightOtherBonuses: { side: "right" }, weather: "rain", teamSkillCardCount: 4,
    skillCardSlots: (skills) => skills,
    cachedSkillTriggerInfo: async (skill) => ({ stackable: skill === "A" ? [{ index: 0, max: 10, affects_power: true }, { index: 1, max: 10, affects_power: false }] : skill === "B" ? [{ index: 0, max: 4, affects_power: true }] : skill === "combo" ? [{ index: 0, max: 10, affects_power: false }] : [] }),
    invoke: async (command, { payload }) => {
      commands.push(command);
      assert.equal(command, "calculate_quick_skills_batch");
      requests.push(...structuredClone(payload.requests));
      if (fail) throw new Error("calculation failed");
      return { items: payload.requests.map((request) => {
        const skill = request.skills[0];
        const stacks = request.attacker.skill_trigger_stacks[skill];
        assert.equal(request.attacker.power_bonus, 12);
        assert.equal(request.attacker.other_bonuses.side, right ? "right" : "left");
        assert.equal(request.defender.other_bonuses.side, right ? "left" : "right");
        assert.equal(request.weather, "rain");
        if (skill === "A") assert.equal(stacks[1], 3);
        const value = skill === "A" ? 50 + stacks[0] * 20 : 100 + stacks[0] * 20;
        return { items: [{ results: [{ effective_power: ambiguous && skill === "A" ? 90 : value + 0.49 }] }] };
      }) };
    },
    patchSlot: (...args) => patches.push(structuredClone(args)),
  };
  vm.createContext(scope); vm.runInContext(code, scope);
  let applied;
  if (fail) await assert.rejects(() => scope.calibratePowerStacks(powers), /calculation failed/);
  else applied = await scope.calibratePowerStacks(powers);
  assert.deepEqual(original.skill_trigger_stacks, { A: [7, 3], B: [1] });
  return { applied, patches, requests, commands };
}
const unique = await run();
assert.equal(unique.commands.length, 1);
assert.equal(unique.requests.length, 16);
assert.equal(unique.applied, true);
assert.deepEqual(unique.patches, [["left", 0, { skill_trigger_stacks: { A: [2, 3], B: [2] } }]]);
const ambiguous = await run({ ambiguous: true });
assert.deepEqual(ambiguous.patches[0][2].skill_trigger_stacks.A, [7, 3]);
assert.deepEqual(ambiguous.patches[0][2].skill_trigger_stacks.B, [2]);
const noMatch = await run({ powers: ["81", "识别失败", "50", ""] });
assert.equal(noMatch.applied, false); assert.equal(noMatch.patches.length, 0);
const noTrials = await run({ skills: ["plain", "", "", ""], powers: ["50", "", "", ""] });
assert.equal(noTrials.commands.length, 0); assert.equal(noTrials.applied, false);
const nonPowerStacks = await run({ skills: ["combo", "", "", ""], powers: ["100", "", "", ""] });
assert.equal(nonPowerStacks.commands.length, 0);
assert.equal(nonPowerStacks.requests.length, 0);
assert.equal(nonPowerStacks.patches.length, 0);
assert.equal(nonPowerStacks.applied, false);
const duplicate = await run({ skills: ["A", "A", "", ""], powers: ["90", "110", "", ""] });
assert.equal(duplicate.commands.length, 1);
assert.deepEqual(duplicate.patches[0][2].skill_trigger_stacks.A, [3, 3]);
const right = await run({ right: true });
assert.equal(right.patches[0][0], "right"); assert.equal(right.patches[0][1], 1);
const failed = await run({ fail: true }); assert.equal(failed.patches.length, 0);
console.log("Passed: one process call for all stack trials, original input preservation, rounding, unique/ambiguous/no matches, duplicate slots, both attack directions, error handling.");
