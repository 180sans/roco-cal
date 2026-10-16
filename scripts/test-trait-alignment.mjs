import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const matching = { exports: {} };
vm.createContext(matching);
vm.runInContext(compile(fs.readFileSync(new URL("../src/traitAlignment.ts", import.meta.url), "utf8")), matching);
const { matchTraitStacks } = matching.exports;
const data = {
  traitName: "测试特性", affectedSkills: [0], nonStackingSkills: [0, 2],
  candidates: Array.from({ length: 100 }, (_, stacks) => ({ stacks, powers: [[50 + 20 * stacks], [], [80], []] })),
};
assert.equal(matchTraitStacks(data, ["90", "", "80", ""]), 2);
assert.equal(matchTraitStacks(data, ["50", "", "80", ""]), 0);
assert.throws(() => matchTraitStacks(data, ["80", "", "80", ""]), /没有匹配/);
assert.throws(() => matchTraitStacks(data, ["90", "", "81", ""]), /没有匹配/);
assert.throws(() => matchTraitStacks(data, ["9O", "", "80", ""]), /识别失败/);
assert.throws(() => matchTraitStacks(data, ["90", "", "", ""]), /识别失败/);
const ambiguous = structuredClone(data);
ambiguous.candidates[3].powers[0] = [90];
assert.throws(() => matchTraitStacks(ambiguous, ["90", "", "80", ""]), /多个/);

// 有无叠层技能时，有叠层技能的旧层数/识别失败不能否决校对结果。
const preferred = structuredClone(data);
preferred.nonStackingSkills = [0];
assert.equal(matchTraitStacks(preferred, ["90", "", "999", ""]), 2);
assert.equal(matchTraitStacks(preferred, ["90", "", "识别失败", ""]), 2);
assert.throws(() => matchTraitStacks(preferred, ["识别失败", "", "80", ""]), /识别失败/);
// 所有技能都可叠层，或无叠层技能不受特性影响时，才使用其余技能。
const fallback = structuredClone(data);
fallback.nonStackingSkills = [];
assert.equal(matchTraitStacks(fallback, ["90", "", "80", ""]), 2);
assert.throws(() => matchTraitStacks(fallback, ["90", "", "81", ""]), /没有匹配/);
fallback.nonStackingSkills = [2];
assert.equal(matchTraitStacks(fallback, ["90", "", "80", ""]), 2);

const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const handler = app.slice(app.indexOf("  async function alignTraitStacks()"), app.indexOf("  async function calibratePowerStacks("));
async function run({ rejectTrait = false, changeState = false, powers = ["90", "", "80", ""] } = {}) {
  let captures = 0;
  const patches = [], errors = [];
  const scope = {
    displayMode: "plugin", calibrationGroupRef: { current: null }, targetAttached: true,
    recognitionBusyRef: { current: false }, traitAlignmentSnapshotRef: { current: "original" },
    leftSlots: [{ name: "我方", trait_stacks: 7 }], rightSlots: [{ name: "敌方" }], leftIndex: 0, rightIndex: 0,
    leftOtherBonuses: {}, rightOtherBonuses: {}, weather: "none", matchTraitStacks, asError: String,
    setDetectionMessage() {}, setDetectionToast() {}, setError: (message) => errors.push(message), setRecognitionStatus() {}, setDetectedSkillPowers() {},
    invoke: async () => { if (rejectTrait) throw new Error("不影响显示威力"); return data; },
    targetCanvas: async () => { captures++; return {}; }, cropDetection: () => "image",
    recognizeNumericImages: async () => {
      if (changeState) scope.traitAlignmentSnapshotRef.current = "changed";
      return { items: powers.map((text) => ({ text })) };
    },
    patchSlot: (...args) => patches.push(args),
  };
  vm.createContext(scope);
  vm.runInContext(compile(handler), scope);
  await scope.alignTraitStacks();
  assert.equal(scope.recognitionBusyRef.current, false);
  return { captures, patches, errors };
}
const success = await run();
assert.equal(success.patches.length, 1);
assert.equal(success.patches[0][0], "left");
assert.equal(success.patches[0][2].trait_stacks, 2);
assert.deepEqual(Object.keys(success.patches[0][2]), ["trait_stacks"]);
const rejected = await run({ rejectTrait: true });
assert.equal(rejected.captures, 0);
assert.equal(rejected.patches.length, 0);
for (const settings of [{ changeState: true }, { powers: ["80", "", "80", ""] }]) {
  const failed = await run(settings);
  assert.equal(failed.patches.length, 0);
  assert.ok(failed.errors.at(-1).includes("特性对齐失败"));
}
console.log("Passed: non-stacking skill priority and fallback, exact/ambiguous/missing-buff matches, OCR failures, validation before OCR, stale-state rejection, trait-only updates.");
