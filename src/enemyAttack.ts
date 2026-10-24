export type EnemyAttackSkillCell = {
  skillPower: number | null;
  damage: number | null;
  combo: number;
  hitSegments: Array<{ power: number | null; damage: number; combo: number }>;
  totalSkillPower: number;
  extraDamage: number;
  stacks: number;
  stackValues: number[];
};

export type EnemyAttackSkill = {
  skillName: string;
  caseLabel: string;
  triggered: boolean;
  description: string;
  element: string;
  stackable: boolean;
  columns: Array<{ label: string; candidates: EnemyAttackSkillCell[] }>;
};

export type EnemyAttackSkillGroup = { attackType: "物攻" | "魔攻"; skills: EnemyAttackSkill[] };
export type EnemyAttackSkillResponse = { targetHp: number | null; maxHp: number; groups: EnemyAttackSkillGroup[] };
export type EnemyAttackSample = { kind: "base" | "middle" | "kill"; cell: EnemyAttackSkillCell | null; killed: boolean };

export function parseEnemyAttackHealth(text: string): { current: number; maximum: number } | null {
  const match = text.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  const current = Number(match[1]);
  const maximum = Number(match[2]);
  return Number.isSafeInteger(current) && Number.isSafeInteger(maximum) && maximum > 0 && current <= maximum
    ? { current, maximum }
    : null;
}

export function enemyAttackSamples(candidates: EnemyAttackSkillCell[], stackable: boolean, targetHp: number | null, maxHp: number): EnemyAttackSample[] {
  const values = candidates.filter((cell) => cell.damage != null && Number.isFinite(cell.damage));
  const killed = (cell: EnemyAttackSkillCell) => targetHp != null
    ? cell.damage! >= targetHp
    : maxHp > 0 && cell.damage! > maxHp;
  const order = (left: EnemyAttackSkillCell, right: EnemyAttackSkillCell) => left.stacks - right.stacks || left.damage! - right.damage!;
  const strongest = (cells: EnemyAttackSkillCell[]) => [...cells].sort((left, right) => right.damage! - left.damage! || order(left, right))[0] || null;
  const zero = values.filter((cell) => cell.stacks === 0);
  const base = [...zero.filter(killed)].sort(order)[0] || strongest(zero);
  if (!stackable) return [{ kind: "base", cell: base, killed: base != null && killed(base) }];
  const lethal = [...values.filter(killed)].sort(order)[0] || strongest(values);
  const midpoint = Math.floor((lethal?.stacks || 0) / 2);
  const middle = [...values.filter((cell) => cell.stacks <= midpoint)].sort((left, right) => right.stacks - left.stacks || right.damage! - left.damage!)[0] || base;
  return [
    { kind: "base", cell: base, killed: base != null && killed(base) },
    { kind: "middle", cell: middle, killed: middle != null && killed(middle) },
    { kind: "kill", cell: lethal, killed: lethal != null && killed(lethal) },
  ];
}

export function enemyAttackRows(group: EnemyAttackSkillGroup, targetHp: number | null, maxHp: number) {
  return group.skills.map((skill) => {
    const columns = ["++", "+", ""].map((label) => ({
      label,
      samples: enemyAttackSamples(skill.columns.find((column) => column.label === label)?.candidates || [], skill.stackable, targetHp, maxHp),
    }));
    const power = Math.max(0, ...columns.flatMap((column) => column.samples.map((sample) => sample.cell?.totalSkillPower || 0)));
    return { ...skill, columns, power };
  }).sort((left, right) => right.power - left.power || left.skillName.localeCompare(right.skillName) || left.caseLabel.localeCompare(right.caseLabel));
}

export function enemyAttackPowerText(cells: Array<EnemyAttackSkillCell | null>): string {
  const values = cells.flatMap((cell) => cell ? [cell.totalSkillPower] : []);
  if (!values.length) return "-";
  const low = Math.min(...values), high = Math.max(...values);
  return low === high ? String(low) : `${low}～${high}`;
}
