export type TraitPowerCandidates = {
  traitName: string;
  affectedSkills: number[];
  nonStackingSkills: number[];
  alignmentSource?: "self_health";
  candidates: Array<{ stacks: number; powers: number[][]; hpValues?: number[] }>;
};

export function findTraitStackMatches(data: TraitPowerCandidates, powerTexts: string[]): number[] {
  if (data.alignmentSource === "self_health") {
    const health = powerTexts[0]?.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!health) throw new Error("我方血量识别失败，请检查 OCR 识别框（需要当前生命/最大生命）");
    const current = Number(health[1]);
    const maximum = Number(health[2]);
    if (!Number.isSafeInteger(current) || !Number.isSafeInteger(maximum) || maximum <= 0 || current > maximum) {
      throw new Error("我方血量识别结果无效，原等级未修改");
    }
    return data.candidates.filter((candidate) => candidate.hpValues?.includes(maximum)).map((candidate) => candidate.stacks);
  }
  const usedSlots = (data.candidates[0]?.powers || []).flatMap((powers, index) => powers.length ? [index] : []);
  if (!usedSlots.length) throw new Error("当前特性叠层不影响所携技能的显示威力");
  // 优先用自身没有叠层机制且能判断特性的技能，避免未校准的技能层数干扰。
  const preferredSlots = usedSlots.filter((index) => data.nonStackingSkills.includes(index));
  const alignmentSlots = preferredSlots.some((index) => data.affectedSkills.includes(index)) ? preferredSlots : usedSlots;
  const observations = alignmentSlots.map((index) => {
    const text = powerTexts[index]?.trim() || "";
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error(`技能${index + 1}威力识别失败，请检查 OCR 识别框`);
    return { index, power: Number(text) };
  });
  return data.candidates
    .filter((candidate) => observations.every(({ index, power }) => candidate.powers[index]?.includes(power)))
    .map((candidate) => candidate.stacks);
}

export function matchTraitStacks(data: TraitPowerCandidates, powerTexts: string[]): number {
  const matches = findTraitStackMatches(data, powerTexts);
  if (data.alignmentSource === "self_health") {
    if (!matches.length) throw new Error("最大生命没有匹配的等级，请检查生命天分、性格和识别结果");
    if (matches.length !== 1) throw new Error("最大生命对应多个等级，请补全生命天分和性格，原等级未修改");
    return matches[0];
  }
  if (!matches.length) throw new Error("没有匹配的特性层数，请检查是否遗漏 buff、技能叠层或触发状态");
  if (matches.length !== 1) throw new Error("识别威力对应多个特性层数，无法唯一对齐，原层数未修改");
  return matches[0];
}
