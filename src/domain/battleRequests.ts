import type { UnitState, TeamOtherBonuses } from "../services/desktopTypes";

export type BattleSides = {
  attacker: UnitState;
  defender: UnitState;
  attackerBonuses: TeamOtherBonuses;
  defenderBonuses: TeamOtherBonuses;
};

export function selectBattleSides(
  left: UnitState, right: UnitState,
  leftBonuses: TeamOtherBonuses, rightBonuses: TeamOtherBonuses,
  attackFromLeft: boolean,
): BattleSides {
  return attackFromLeft
    ? { attacker: left, defender: right, attackerBonuses: leftBonuses, defenderBonuses: rightBonuses }
    : { attacker: right, defender: left, attackerBonuses: rightBonuses, defenderBonuses: leftBonuses };
}

// Only explicitly requested attacker overrides are applied. Do not normalize or
// default unit fields here; command-specific parameters stay with their caller.
export function buildBattleUnits(sides: BattleSides, attackerPatch?: Partial<UnitState>) {
  return {
    attacker: { ...sides.attacker, ...attackerPatch, other_bonuses: sides.attackerBonuses },
    defender: { ...sides.defender, other_bonuses: sides.defenderBonuses },
  };
}
