# 特性与技能 Mode 规范

`mode` 是可复用的战斗判定结果名称。战斗运行时先根据当前局面生成生效
mode 集合，再让引用同一 mode 的特性或技能触发效果一起结算。mode 本身包含
完整的判定语义，不在数据中重复书写旧式 `when`、`condition`、`*_eq` 等字段。

## 放置位置

特性的 mode 写在 `battle_effect.conditions`：

```json
"conditions": [{ "mode": "skill_cost_1" }]
```

技能的 mode 只写在会改变数值的 `triggered` 效果对象中：

```json
"triggered": {
  "mode": "response_status",
  "skill_power_mul": "2"
}
```

`triggered` 是多个分支时，每个分支各自声明它的 mode。覆盖分支的 mode
写在 `override` 内，例如鸩毒：

```json
"triggered": {
  "mode": "poison_effect_stack",
  "skill_power_plus": "10",
  "multiple": true,
  "override": {
    "mode": "response_status",
    "skill_power_plus": "40"
  }
}
```

`usage_` 仅用于“使用技能后”产生的叠层事件。可叠层不等于必须使用
`usage_` 前缀，例如合拍的层数来自本回合同项匹配数，入场类特性的层数来自
入场事件。

## 特性条件 Mode

| Mode | 生效条件 |
| --- | --- |
| `all_skill_cost_less_than_4` | 自身携带技能总能耗小于 4。 |
| `attacker_energy_0` | 攻击方能量为 0。 |
| `burst` | 当前技能处于迸发触发情况。 |
| `burst_attack_skill` | 当前攻击技能处于迸发触发情况。 |
| `charging` | 自身处于蓄力状态。 |
| `enemy_boss_bloodline` | 敌方为首领血脉。 |
| `enemy_magic_value_1` | 敌方魔力值为 1。 |
| `enemy_non_owner_element_bloodline` | 敌方血脉系别不同于自身系别。 |
| `enemy_polluted_bloodline` | 敌方为污染血脉。 |
| `first_action_after_entry` | 自身入场后的首次行动。 |
| `first_turn` | 自身入场后的首回合。 |
| `firsthand` | 自身先于敌方行动。 |
| `hold_same_skill_as_atk_skill` | 来袭技能系别与防御方携带技能的任一系别相同。 |
| `incoming_advantage_hit` | 来袭技能克制防御方。 |
| `incoming_attack_skill_cost_lte_1` | 来袭技能为物攻或魔攻，且能耗不大于 1。 |
| `incoming_non_attacker_element` | 来袭技能系别不属于攻击方系别。 |
| `next_attack_double_buff` | 自身持有下次攻击威力翻倍效果。 |
| `non_light_skill` | 当前技能不是光系。 |
| `poison_effect_stack` | 敌方有中毒层数；层数取对应中毒层数。 |
| `predict_dead` | 敌方所选技能足以击败自身。 |
| `self_fainted` | 自身已力竭。 |
| `self_magic_value_1` | 自身魔力值为 1。 |
| `self_switch_in` | 自身入场；层数由该入场规则提供。 |
| `skill_bouns_chongming` | 当前技能为虫鸣；为兼容既有数据，保留 `bouns` 拼写。 |
| `skill_cost_0` | 当前技能能耗为 0。 |
| `skill_cost_1` | 当前技能能耗为 1。 |
| `skill_cost_gt_3` | 当前技能能耗大于 3。 |
| `skill_no_effect` | 当前攻击技能没有额外效果。 |
| `skill_not_same_as_owner_element` | 当前技能系别不同于自身系别。 |
| `skill_position_1_or_2` | 当前技能位于 1 或 2 号位。 |
| `slower_than_enemy` | 自身后于敌方行动。 |
| `team_has_bug_element` | 己方队伍存在虫系精灵。 |
| `usage_skill_cost_3` | 使用能耗为 3 的技能后，增加一层。 |
| `usage_wing` | 使用翼系技能后，增加一层。 |
| `water_environment` | 当前为雨天或其他水系环境。 |
| `weather_blizzard` | 当前天气为暴风雪。 |
| `weather_sandstorm` | 当前天气为沙暴。 |
| `weekend` | 当前日期为周六或周日。 |

## 技能触发 Mode

下列 mode 只描述 `triggered` 数值变化的触发情况。与特性同名的 mode（如
`burst`、`firsthand`、`self_switch_in`、`weather_blizzard`、
`poison_effect_stack`）必须使用相同判定结果。

| Mode | 触发情况 |
| --- | --- |
| `after_defeat` | 本次或此前一次效果击败敌方。 |
| `attacker_hold_light_skill` | 敌方携带光系技能。 |
| `burst` | 当前技能迸发。 |
| `enemy_energy_0` | 敌方能量为 0。 |
| `enemy_energy_lte_2` | 敌方能量不大于 2。 |
| `enemy_energy_stack` | 敌方每有 1 点能量，计一层。 |
| `enemy_fainted_stack` | 敌方每有 1 只力竭精灵，计一层。 |
| `enemy_hp_loss_5_percent` | 敌方每失去 5% 生命，计一层。 |
| `enemy_hybrid` | 敌方为混血精灵。 |
| `enemy_moe_effect` | 敌方具有萌化效果。 |
| `enemy_no_skill_damage_last_turn` | 敌方上回合未受到技能伤害。 |
| `enemy_switch_in_this_turn` | 敌方本回合更换过精灵。 |
| `energy_depleted_after_use` | 技能释放后自身能量耗尽。 |
| `firsthand` | 自身先于敌方行动。 |
| `freeze_effect` | 敌方具有冻结效果。 |
| `freeze_effect_stack` | 敌方每有 1 层冻结，计一层。 |
| `incoming_resisted_skill` | 自身受到一次被抵抗的非连击技能攻击。 |
| `last_turn_response_success` | 自身上回合应对成功。 |
| `last_turn_status_skill` | 自身上回合使用状态技能。 |
| `mark_effect` | 敌方具有印记。 |
| `mark_effect_stack` | 敌方每有 1 层印记，计一层。 |
| `poison_effect` | 敌方具有中毒效果。 |
| `poison_effect_stack` | 敌方每有 1 层中毒，计一层。 |
| `response_attack` | 当前处于应对攻击。 |
| `response_status` | 当前处于应对状态。 |
| `response_success` | 每成功应对 1 次，计一层。 |
| `secondhand` | 自身后于敌方行动。 |
| `self_debuff` | 自身具有减益效果。 |
| `self_energy_stack` | 自身每有 1 点能量，计一层。 |
| `self_hp_gt_80` | 自身生命高于 80%。 |
| `self_hp_less_than_50` | 自身生命低于 50%。 |
| `self_hp_loss_10_percent` | 自身每失去 10% 生命，计一层。 |
| `self_hp_loss_5_percent` | 自身每失去 5% 生命，计一层。 |
| `self_moe_effect` | 自身具有萌化效果。 |
| `self_switch_in` | 自身每次入场。 |
| `self_switch_out` | 自身每次离场。 |
| `skill_position_1` | 当前技能位于 1 号位。 |
| `skill_position_1_or_3` | 当前技能位于 1 或 3 号位。 |
| `skill_position_3` | 当前技能位于 3 号位。 |
| `skill_position_changed` | 当前技能的位置发生变化。 |
| `skill_cost_decreased` | 当前技能能耗每降低 1 点，计一层。 |
| `skill_cost_increased` | 当前技能能耗每提高 1 点，计一层。 |
| `starfall_effect_stack` | 敌方每有 1 层星陨，计一层。 |
| `team_hold_chongming` | 己方队伍每携带一个虫鸣，计一层。 |
| `team_moe_effect_stack` | 双方队伍精灵每有 1 层萌化，计一层。 |
| `turn_end` | 回合结束。 |
| `usage` | 每次使用该技能后，计一层。 |
| `usage_other_element_skill` | 每使用 1 个其他系别技能，计一层。 |
| `usage_other_fire_skill` | 每使用 1 次其他火系技能，计一层。 |
| `usage_other_grass_skill` | 每使用 1 次其他草系技能，计一层。 |
| `weather_blizzard` | 当前天气为暴风雪。 |

## 技能筛选

当特性已经生效、但只影响一部分技能时，在 `effects[].filters` 中做筛选，
不要再增加第二套条件语法。例如“非光系技能威力 +25%”使用：

```json
"filters": { "exclude_skill_elements": ["光"] }
```

当整个效果的成立与某个可复用判定完全一致时，应新建或复用一个 mode。
