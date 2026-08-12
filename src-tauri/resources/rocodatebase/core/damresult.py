import os
from math import ceil
from functools import reduce
from operator import mul
import math
from itertools import product


from core.ele_advantage import TypeChart
from core.find_pets import pets_dataset
from core.skill_finder import _normalize_runtime_value, skill_dataset, resolve_skill
from core.calshuxing import calc_attr

def cal_product(values, default=1):
    """
    计算数组乘积
    """
    if values is None:
        return default
    if len(values) == 0:
        return default
    return reduce(mul, values, 1)


def normalize_ratio(value):
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("%"):
            return float(text[:-1]) / 100
        return float(text)
    return float(value)


def normalize_modifier_list(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        raw_values = value
    else:
        raw_values = [value]

    result = []
    for item in raw_values:
        numeric = normalize_ratio(item)
        if numeric is not None:
            result.append(numeric)
    return result


def normalize_count(value):
    if value is None:
        return None
    numeric = float(value)
    if numeric.is_integer():
        return int(numeric)
    return numeric


def calc_effective_skill_power(
    skill_power,
    power_multiplier,
    power_bonus,
    atk_buff,
    enemy_def_buff,
    type_bonus,
    advantage,
):
    power_multiplier = normalize_modifier_list(power_multiplier)
    power_multiplier_value = 1 + sum(power_multiplier)
    atk_up = max(atk_buff, 0)
    atk_down = max(-atk_buff, 0)
    enemy_def_up = max(enemy_def_buff, 0)
    enemy_def_down = max(-enemy_def_buff, 0)
    buff_numerator = 1 + atk_up + enemy_def_down
    buff_denominator = 1 + atk_down + enemy_def_up
    if buff_denominator == 0:
        raise ValueError("buff 分母不能为0")

    base_power = max(1, math.floor((skill_power + power_bonus) * power_multiplier_value))
    effective_power = (buff_numerator / buff_denominator) * base_power * (1 + type_bonus) * advantage
    return effective_power


def calculate_damage(
        atk,
        defense,
        skill_power=None,
        hp=None,
        power_multiplier=None,
        power_bonus=0,

        atk_buff=0.,
        enemy_def_buff=0.,
        # other_attack_bonuses=None,
        damage_reductions=None,
        type_bonus=0.25,
        advantage=1.0,
        damage_multiplier=None,

        usage_time=1,
        combo=None,

        atk_lv=60
        # def_lv = 60

):
    """
    计算伤害或反推击杀所需威力

    参数说明：
    atk: 进攻方攻击
    defense: 防守方防御
    skill_power: 技能威力（如果提供，则计算伤害）
    hp: 防守方血量（如果提供且未提供 skill_power，则反推击杀需要的威力）
    power_multiplier: 技能威力加成，默认1
    power_bonus: 威力加成，默认0
    combo: 连击次数，默认None（不连击）
    usage_time: 使用次数，默认1
    atk_buff: 进攻方攻击提升/下降，+为提升，-为下降，默认0
    enemy_def_buff: 敌方防御提升/下降，+为提升，-为下降，默认0
    damage_reductions: 减伤数组，彼此乘算，默认[1]
    type_bonus: 系别加成，默认0.25（即25%）
    """

    if defense == 0:
        raise ValueError("防守方防御不能为0")

    power_multiplier = normalize_modifier_list(power_multiplier)
    power_multiplier_value = 1 + sum(power_multiplier)

    damage_multiplier = normalize_modifier_list(damage_multiplier)
    damage_multiplier_value = 1 + sum(damage_multiplier)

    if damage_reductions is None:
        damage_reductions = []

    damage_reductions = [
        reduction
        for reduction in (normalize_ratio(item) for item in damage_reductions)
        if reduction is not None
    ]

    reduction_product = cal_product([1 - r for r in damage_reductions], 1)

    # 按你的规则处理 buff
    atk_up = max(atk_buff, 0)
    atk_down = max(-atk_buff, 0)
    enemy_def_up = max(enemy_def_buff, 0)
    enemy_def_down = max(-enemy_def_buff, 0)

    buff_numerator = 1 + atk_up + enemy_def_down
    buff_denominator = 1 + atk_down + enemy_def_up

    if buff_denominator == 0:
        raise ValueError("buff 分母不能为0")

    power_effect = (buff_numerator / buff_denominator)

    damage_constant = (atk_lv * 45 / 100 + 10) / 41

    if skill_power is not None:
        effective_power_value = calc_effective_skill_power(
            skill_power=skill_power,
            power_multiplier=power_multiplier,
            power_bonus=power_bonus,
            atk_buff=atk_buff,
            enemy_def_buff=enemy_def_buff,
            type_bonus=type_bonus,
            advantage=advantage,
        )
        effective_power = math.floor(effective_power_value)
        damage = math.floor(
            (effective_power_value * atk * damage_constant) / defense * reduction_product * damage_multiplier_value
        )
        # 根据combo和usage_time决定输出格式
        has_combo = combo is not None and combo > 1
        has_usage = usage_time is not None and usage_time > 1
        if has_combo or has_usage:
            single_damage = damage
            total = single_damage
            parts = [f"单次伤害: {single_damage}"]
            if has_combo:
                total *= combo
                parts.append(f"连击: {combo}")
            if has_usage:
                total *= usage_time
                parts.append(f"使用次数: {usage_time}")
            parts.append(f"总伤害: {total}")
            damage = total
            return damage, ", ".join(parts), effective_power
        else:
            return damage, None, effective_power

    # 模式2：已知血量，反推击杀威力
    if hp is not None:
        if power_multiplier_value == 0:
            raise ValueError("应对倍率不能为0，否则无法反推技能威力")
        base_factor = (
                (atk / defense)
                * 0.9 * combo
                # * other_bonus_product
                * reduction_product
                * (1 + type_bonus))
        needed_total_power = hp / (base_factor*power_effect)
        needed_skill_power = (needed_total_power - power_bonus) / power_multiplier_value

        return {
            "mode": "required_power",
            "required_skill_power": needed_skill_power,
            "required_skill_power_ceil": ceil(needed_skill_power)
        }

    raise ValueError("必须提供 skill_power 或 hp 其中之一")


def calculate_damage_simple(
    atk,
    defense,
    skill_power,
    combo=1,
    atk_lv=60,
    other_attack_bonuses=None,
    damage_reductions=None,
    atk_bonus=False
):
    """
    极简伤害计算：
    只保留 atk / defense / skill_power / combo
    """

    if defense == 0:
        raise ValueError("防守方防御不能为0")

    if other_attack_bonuses is None:
        other_attack_bonuses = [1]

    if damage_reductions is None:
        damage_reductions = [1]

    # 攻击加成（乘算）
    other_bonus_product = cal_product([1 + b for b in other_attack_bonuses], 1)
    reduction_product = cal_product([1 - r for r in damage_reductions], 1)

    # 等级常数（保留你的设定）
    damage_constant = (atk_lv * 45 / 100 + 10) / 41

    # 核心伤害公式
    damage = (
        atk / defense
        # * 0.9
        * skill_power
        * combo
        * damage_constant
        * other_bonus_product
        * reduction_product
    )

    # 取整规则
    if atk_bonus:
        damage = math.ceil(damage)
    else:
        damage = math.floor(damage)

    return {
        "mode": "damage",
        "damage": damage
    }


def generate_scenarios(atk_iv, atk_personality, def_iv, def_personality, hp_iv, hp_personality):
    """
    根据 iv 是否为 None，生成所有需要计算的场景组合。

    当 iv 为 None 时，展开为多种情况；当 iv 已指定时，使用指定值。

    返回列表，每个元素为 dict:
    {
        "atk_iv": int, "atk_personality": bool|None,
        "def_iv": int, "def_personality": bool|None,
        "hp_iv": int, "hp_personality": bool|None,
        "label": str
    }
    """

    # 攻击方场景
    if atk_iv is None:
        atk_scenarios = [
            {"atk_iv": 10, "atk_personality": True, "atk_label": "加攻击天分加性格"},
            {"atk_iv": 10, "atk_personality": None, "atk_label": "加攻击天分"},
            {"atk_iv": 0, "atk_personality": None, "atk_label": "正常攻击"},
            {"atk_iv": 0, "atk_personality": False, "atk_label": "减攻击性格"},
        ]
    else:
        atk_scenarios = [
            {"atk_iv": atk_iv, "atk_personality": atk_personality, "atk_label": "指定攻击"}
        ]

    # 防御方防御场景
    if def_iv is None:
        def_scenarios = [
            {"def_iv": 10, "def_personality": None, "def_label": "加防御天分"},
            {"def_iv": 0, "def_personality": None, "def_label": "正常防御"},
            {"def_iv": 0, "def_personality": False, "def_label": "减防御性格"},
        ]
    else:
        def_scenarios = [
            {"def_iv": def_iv, "def_personality": def_personality, "def_label": "指定防御"}
        ]

    # 防御方生命场景
    if hp_iv is None:
        hp_scenarios = [
            {"hp_iv": 10, "hp_personality": True, "hp_label": "加生命天分加性格"},
            {"hp_iv": 10, "hp_personality": None, "hp_label": "加生命天分"},
            {"hp_iv": 0, "hp_personality": None, "hp_label": "正常血量"},
        ]
    else:
        hp_scenarios = [
            {"hp_iv": hp_iv, "hp_personality": hp_personality, "hp_label": "指定血量"}
        ]

    # 笛卡尔积组合所有场景
    from itertools import product
    combinations = []
    for atk_s, def_s, hp_s in product(atk_scenarios, def_scenarios, hp_scenarios):
        combo = {}
        combo.update(atk_s)
        combo.update(def_s)
        combo.update(hp_s)
        combo["label"] = f"{atk_s['atk_label']} | {def_s['def_label']} | {hp_s['hp_label']}"
        combinations.append(combo)

    return combinations

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
skill_dir = os.path.join(BASE_DIR, "data", "skills_database")

# ========== 天分和性格的默认值 ==========
DEFAULT_PERSONALITY_BONUS = 0.2  # 默认正面性格加成值
DEFAULT_PERSONALITY_PENALTY = -0.1  # 默认负面性格减少值（如果需要的话）

IV_ATTRS = ("hp", "atk", "mag", "def", "res", "spd")


def parse_personality(personality_bouns, personality_down):
    """
    解析性格输入为 {attr: bonus_value} 字典。

    personality_bouns: None 或 str
        - None: 无正面性格
        - "atk": atk 有正面性格，使用默认值
        - "atk:0.15": atk 有正面性格，加成 0.15

    personality_down: None 或 str
        - None: 无负面性格
        - "def": def 有负面性格

    返回: dict, 例如 {"atk": 0.1, "def": -0.1}
    """
    result = {}

    if personality_bouns is not None:
        if ":" in personality_bouns:
            attr, value = personality_bouns.split(":", 1)
            value = abs(float(value)) if value.lower() != "none" else DEFAULT_PERSONALITY_BONUS
        else:
            attr = personality_bouns
            value = DEFAULT_PERSONALITY_BONUS
        if attr in IV_ATTRS:
            result[attr] = value

    if personality_down is not None:
        if ":" in personality_down:
            attr, value = personality_down.split(":", 1)
            value = -abs(float(value)) if value.lower() != "none" else DEFAULT_PERSONALITY_PENALTY
        else:
            attr = personality_down
            value = DEFAULT_PERSONALITY_PENALTY
        if attr in IV_ATTRS:
            result[attr] = value

    return result


def get_personality_bonus_for_attr(personality_dict, attr_name):
    """
    从性格字典中获取某个属性的性格加成。
    返回 True (正面), False (负面), None (无), 或具体数值。

    为了兼容 calc_attr 的 personality_bonus 参数格式。
    """
    if attr_name not in personality_dict:
        return None
    value = personality_dict[attr_name]
    if value > 0:
        return value  # 正面性格，返回具体数值
    elif value < 0:
        return value  # 负面性格，返回具体负值
    return None


def generate_atk_scenarios(atk_iv, atk_personality_bonus, atk_attr_name):
    """
    生成攻击方场景。

    atk_iv: int 或 None (从 iv_dict 中按 atk_attr_name 取得)
    atk_personality_bonus: 性格加成值，或 None
    atk_attr_name: "atk" 或 "mag"
    """
    label_map = {"atk": "攻击", "mag": "魔攻"}
    attr_label = label_map.get(atk_attr_name, atk_attr_name)

    if atk_iv is None and atk_personality_bonus is None:
        # 未指定，展开多种场景
        return [
            {"atk_iv": 10, "atk_personality": DEFAULT_PERSONALITY_BONUS,
             "atk_label": f"加{attr_label}天分加性格"},
            {"atk_iv": 10, "atk_personality": None,
             "atk_label": f"加{attr_label}天分"},
            {"atk_iv": 0, "atk_personality": None,
             "atk_label": f"正常{attr_label}"},
            {"atk_iv": 0, "atk_personality": DEFAULT_PERSONALITY_PENALTY,
             "atk_label": f"减{attr_label}性格"},
        ]
    else:
        iv = atk_iv if atk_iv is not None else 0
        return [{"atk_iv": iv, "atk_personality": atk_personality_bonus,
                 "atk_label": f"指定{attr_label}"}]


def generate_def_scenarios(def_iv, def_personality_bonus, def_attr_name):
    """
    生成防御方防御场景。

    def_iv: int 或 None (从 iv_dict 中按 def_attr_name 取得)
    def_personality_bonus: 性格加成值，或 None
    def_attr_name: "def" 或 "res"
    """
    label_map = {"def": "防御", "res": "魔抗"}
    attr_label = label_map.get(def_attr_name, def_attr_name)

    if def_iv is None and def_personality_bonus is None:
        return [
            {"def_iv": 10, "def_personality": None,
             "def_label": f"加{attr_label}天分"},
            {"def_iv": 0, "def_personality": None,
             "def_label": f"正常{attr_label}"},
            {"def_iv": 0, "def_personality": DEFAULT_PERSONALITY_PENALTY,
             "def_label": f"减{attr_label}性格"},
        ]
    else:
        iv = def_iv if def_iv is not None else 0
        return [{"def_iv": iv, "def_personality": def_personality_bonus,
                 "def_label": f"指定{attr_label}"}]


def generate_hp_scenarios(hp_iv, hp_personality_bonus):
    """
    生成防御方生命场景。

    hp_iv: int 或 None
    hp_personality_bonus: 性格加成值，或 None
    """
    if hp_iv is None and hp_personality_bonus is None:
        return [
            {"hp_iv": 10, "hp_personality": DEFAULT_PERSONALITY_BONUS,
             "hp_label": "加生命天分加性格"},
            {"hp_iv": 10, "hp_personality": None,
             "hp_label": "加生命天分"},
            {"hp_iv": 0, "hp_personality": None,
             "hp_label": "正常血量"},
        ]
    else:
        iv = hp_iv if hp_iv is not None else 0
        return [{"hp_iv": iv, "hp_personality": hp_personality_bonus,
                 "hp_label": "指定血量"}]


def _effect_matches_skill_filters(
    effect,
    *,
    current_skill_name,
    current_skill_element,
    current_skill_type,
    current_skill_effect=None,
    owner_elements=None,
    current_advantage=None,
):
    filters = effect.get("filters")
    if not filters:
        return True

    skill_names = filters.get("skill_names")
    if isinstance(skill_names, str):
        skill_names = [skill_names]
    if skill_names and current_skill_name not in skill_names:
        return False

    skill_elements = filters.get("skill_elements")
    if skill_elements and current_skill_element not in skill_elements:
        return False

    exclude_skill_elements = filters.get("exclude_skill_elements")
    if exclude_skill_elements and current_skill_element in exclude_skill_elements:
        return False

    skill_types = filters.get("skill_types")
    if skill_types and current_skill_type not in skill_types:
        return False

    skill_effects = filters.get("skill_effect")
    if isinstance(skill_effects, str):
        skill_effects = [skill_effects]
    if skill_effects and current_skill_effect not in skill_effects:
        return False

    if filters.get("skill_element") == "not_owner_element" and current_skill_element in (owner_elements or []):
        return False

    advantage_threshold = filters.get("advantage_gte")
    if advantage_threshold is not None:
        if current_advantage is None or current_advantage < float(advantage_threshold):
            return False

    return True


def _targets_current_attacker(owner_side, target):
    return (
        target == "all"
        or
        (owner_side == "attacker" and target in (None, "self"))
        or (owner_side == "defender" and target == "opponent")
    )


def _targets_current_defender(owner_side, target):
    return (
        target == "all"
        or
        (owner_side == "defender" and target in (None, "self"))
        or (owner_side == "attacker" and target == "opponent")
    )


def _resolve_trait_skill_element(
    trait_runtime,
    *,
    owner_side,
    current_skill_name,
    current_skill_element,
    current_skill_type,
    owner_elements=None,
):
    """Apply supported trait-driven element conversions before type calculation."""
    if not trait_runtime:
        return current_skill_element

    resolved_element = current_skill_element
    for effect in trait_runtime.get("resolved_effects", []):
        if effect.get("kind") != "skill_element":
            continue
        if not _targets_current_attacker(owner_side, effect.get("target")):
            continue
        if not _effect_matches_skill_filters(
            effect,
            current_skill_name=current_skill_name,
            current_skill_element=resolved_element,
            current_skill_type=current_skill_type,
            owner_elements=owner_elements,
        ):
            continue
        value = effect.get("value")
        if isinstance(value, str) and value:
            resolved_element = value
    return resolved_element


def _collect_trait_modifiers(
    trait_runtime,
    *,
    owner_side,
    current_skill_name,
    current_skill_element,
    current_skill_type,
    current_skill_effect=None,
    active_modes=None,
    manual_modes=None,
    skill_trigger_modes=None,
    owner_elements=None,
    current_advantage=None,
):
    modifiers = {
        "atk_buff_delta": 0.0,
        "def_buff_delta": 0.0,
        "power_bonus": 0,
        "power_multipliers": [],
        "damage_reductions": [],
        "damage_multipliers": [],
        "combo_plus": 0,
        "combo_mul_delta": 0,
        "combo_fixed": None,
        "combo_fix_priority": -1,
        "usage_time_plus": 0,
    }

    if not trait_runtime:
        return modifiers

    conditions = trait_runtime.get("conditions", [])
    mode_conditions = [
        condition for condition in conditions
        if isinstance(condition, dict) and isinstance(condition.get("mode"), str)
    ] if trait_runtime.get("triggerable", trait_runtime.get("template") == "special_condition") and isinstance(conditions, list) else []
    if mode_conditions and not any(
        condition["mode"] in (manual_modes or set())
        and (
            condition["mode"] not in (skill_trigger_modes or set())
            or condition["mode"] in (active_modes or set())
        )
        and (not condition.get("skill_types") or current_skill_type in condition["skill_types"])
        and (not condition.get("skill_elements") or current_skill_element in condition["skill_elements"])
        and (not condition.get("skill_names") or current_skill_name in condition["skill_names"])
        for condition in mode_conditions
    ):
        return modifiers
    if not mode_conditions and not trait_runtime.get("active"):
        return modifiers

    for effect in trait_runtime.get("resolved_effects", []):
        if not _effect_matches_skill_filters(
            effect,
            current_skill_name=current_skill_name,
            current_skill_element=current_skill_element,
            current_skill_type=current_skill_type,
            current_skill_effect=current_skill_effect,
            owner_elements=owner_elements,
            current_advantage=current_advantage,
        ):
            continue

        kind = effect.get("kind")
        target = effect.get("target")
        value = effect.get("value", 0)

        if kind == "stat_buff":
            stats = effect.get("stats", [])
            if _targets_current_attacker(owner_side, target):
                if current_skill_type == "物攻" and "atk" in stats:
                    modifiers["atk_buff_delta"] += value
                elif current_skill_type == "魔攻" and "mag" in stats:
                    modifiers["atk_buff_delta"] += value

            if _targets_current_defender(owner_side, target):
                if current_skill_type == "物攻" and "def" in stats:
                    modifiers["def_buff_delta"] += value
                elif current_skill_type == "魔攻" and "res" in stats:
                    modifiers["def_buff_delta"] += value

        elif kind == "power_bonus" and _targets_current_attacker(owner_side, target):
            modifiers["power_bonus"] += value
        elif kind == "power_multiplier" and _targets_current_attacker(owner_side, target):
            modifiers["power_multipliers"].append(value)
        elif kind in {"damage_multiplier", "incoming_damage_multiplier"} and (
            _targets_current_defender(owner_side, target)
            or (
                owner_side == "defender"
                and target == "enemy"
                and effect.get("context", {}).get("subject") == "attacker"
            )
        ):
            modifiers["damage_multipliers"].append(value)
        elif kind == "damage_reduction" and _targets_current_defender(owner_side, target):
            modifiers["damage_reductions"].append(value)
        elif kind in {"combo_bonus", "combo_plus"} and _targets_current_attacker(owner_side, target):
            modifiers["combo_plus"] += value
        elif kind == "combo_mul" and _targets_current_attacker(owner_side, target):
            modifiers["combo_mul_delta"] += value
        elif kind in {"usage_time_bonus", "usage_time_plus"} and _targets_current_attacker(owner_side, target):
            modifiers["usage_time_plus"] += value
        elif kind == "combo" and target == "all":
            priority = 2 if trait_runtime.get("name") == "无差别过滤" else 1 if trait_runtime.get("name") == "强制过滤" else 0
            if priority > modifiers["combo_fix_priority"]:
                modifiers["combo_fixed"] = value
                modifiers["combo_fix_priority"] = priority

    return modifiers


def resolve_effective_skill_combos(
    skill_name,
    *,
    multiple=0,
    use_override=False,
    usage_mode_choice=None,
    combo_plus=0,
    combo_mul=1,
    attacker_name=None,
    attacker_devolution=0,
    attacker_mega=False,
    attacker_trait_runtime=None,
    attacker_mark_state=None,
    defender_name=None,
    defender_devolution=0,
    defender_mega=False,
    defender_trait_runtime=None,
):
    """Resolve combo counts with the same skill, trait, and mark rules as battle damage."""
    skill_data = skill_dataset.find_skill(skill_name)
    if skill_data is None:
        raise ValueError(f"未找到技能: {skill_name}")
    attacker_data = pets_dataset.find(attacker_name, devolution=attacker_devolution, mega=attacker_mega)
    defender_data = pets_dataset.find(defender_name, devolution=defender_devolution, mega=defender_mega)
    resolved_cases = resolve_skill(
        skill_data,
        multiple=multiple,
        use_override=use_override,
        usage_mode_choice=usage_mode_choice,
    )
    attacker_elements = attacker_data["elements"]
    defender_elements = defender_data["elements"]
    base_skill_type_raw = resolved_cases[0].get("type")
    skill_effect = skill_data.get("effect")

    def trait_manual_modes(runtime):
        if (
            not runtime
            or not runtime.get("triggerable", runtime.get("template") == "special_condition")
            or not runtime.get("triggered")
        ):
            return set()
        return {
            condition["mode"]
            for condition in runtime.get("conditions", [])
            if isinstance(condition, dict) and isinstance(condition.get("mode"), str)
        }

    from core.battle_effects import manual_mark_modes, resolve_mark_modifiers

    skill_trigger_modes = {
        mode
        for case in resolved_cases
        for mode in case.get("_trigger_modes", [])
        if isinstance(mode, str)
    }
    attacker_manual_modes = manual_mark_modes(attacker_mark_state or {}) | trait_manual_modes(attacker_trait_runtime)
    defender_manual_modes = trait_manual_modes(defender_trait_runtime)
    combos = []
    for skill_info in resolved_cases:
        active_modes = set(skill_info.get("_trigger_modes", []))
        current_skill_type = skill_info.get("type", base_skill_type_raw)
        skill_element = _resolve_trait_skill_element(
            attacker_trait_runtime,
            owner_side="attacker",
            current_skill_name=skill_name,
            current_skill_element=skill_info.get("element"),
            current_skill_type=current_skill_type,
            owner_elements=attacker_elements,
        )
        advantage = TypeChart.calc(skill_element, defender_elements)
        mini_advantage = skill_info.get("mini_advantage")
        if mini_advantage is not None:
            advantage = max(advantage, float(mini_advantage))
        attacker_modifiers = _collect_trait_modifiers(
            attacker_trait_runtime,
            owner_side="attacker",
            current_skill_name=skill_name,
            current_skill_element=skill_element,
            current_skill_type=current_skill_type,
            current_skill_effect=skill_effect,
            active_modes=active_modes,
            manual_modes=attacker_manual_modes,
            skill_trigger_modes=skill_trigger_modes,
            owner_elements=attacker_elements,
            current_advantage=advantage,
        )
        defender_modifiers = _collect_trait_modifiers(
            defender_trait_runtime,
            owner_side="defender",
            current_skill_name=skill_name,
            current_skill_element=skill_element,
            current_skill_type=current_skill_type,
            current_skill_effect=skill_effect,
            active_modes=active_modes,
            manual_modes=defender_manual_modes,
            skill_trigger_modes=skill_trigger_modes,
            owner_elements=defender_elements,
            current_advantage=advantage,
        )
        mark_modifiers = resolve_mark_modifiers(
            attacker_mark_state or {},
            skill_name,
            manual_modes=attacker_manual_modes,
            active_skill_modes=active_modes,
            skill_trigger_modes=skill_trigger_modes,
        )
        base_combo = normalize_count(skill_info.get("combo"))
        combo_fix = max(
            (attacker_modifiers, defender_modifiers),
            key=lambda modifiers: modifiers["combo_fix_priority"],
        )["combo_fixed"]
        if combo_fix is not None:
            combo = normalize_count(combo_fix)
        else:
            total_plus = combo_plus + attacker_modifiers["combo_plus"] + defender_modifiers["combo_plus"] + mark_modifiers["combo_plus"]
            total_mul = combo_mul + attacker_modifiers["combo_mul_delta"] + defender_modifiers["combo_mul_delta"] + mark_modifiers["combo_mul_delta"]
            combo = normalize_count(((base_combo if base_combo is not None else 1) + total_plus) * total_mul)
        combos.append(combo if combo is not None else 1)
    return combos


def battle_damage(
    # 技能方面
    skill_name,
    skill_folder=skill_dir,
    multiple=0,
    use_override=False,

    # 攻击方方面
    attacker_name=None,
    attacker_devolution=0,
    attacker_mega=False,
    attacker_iv=None,            # dict, e.g. {"atk": 10, "mag": 5, ...}, 各项可为 None
    attacker_personality_bouns=None,   # str 或 None, e.g. "atk", "mag:0.15"
    attacker_personality_down=None,    # str 或 None, e.g. "def", "spd"
    atk_buff=0.,
    attacker_phys_atk_buff=None,
    attacker_mag_atk_buff=None,
    power_multiplier=None,
    damage_multiplier=None,
    power_bonus=0,
    combo_plus=0,
    combo_mul=1,
    usage_time_plus=0,
    usage_mode_choice=None,
    thunderstorm_unregistered_burst=False,
    thunderstorm_burst_effect_count=0,
    thunderstorm_burst_power_bonus=0,
    weather="none",
    attacker_trait_runtime=None,
    attacker_mark_state=None,

    # 防御方方面
    defender_name=None,
    defender_devolution=0,
    defender_mega=False,
    defender_iv=None,            # dict, e.g. {"hp": 10, "def": 8, "res": 6, ...}, 各项可为 None
    defender_personality_bouns=None,   # str 或 None
    defender_personality_down=None,    # str 或 None
    damage_reductions_extra=None,
    def_buff=0.,
    defender_phys_def_buff=None,
    defender_mag_def_buff=None,
    defender_starfall_mark_stacks=0,
    defender_trait_runtime=None,

    # 其他参数
    atk_lv=60,
    def_lv=60,
    hp=None
):
    """
    对战伤害封装函数

    参数说明:
      attacker_iv: 攻击方天分字典，键为 "hp","atk","mag","def","res","spd"，值为 int 或 None。
                   整个参数为 None 时等同于所有属性都为 None（自动展开场景）。
      attacker_personality_bouns: 攻击方正面性格属性，如 "atk", "mag:0.15", 或 None 表示无正面性格。
      attacker_personality_down: 攻击方负面性格属性，如 "def", 或 None。
      defender_iv: 防御方天分字典，格式同上。
      defender_personality_bouns: 防御方正面性格属性。
      defender_personality_down: 防御方负面性格属性。
    """

    # ========== 0. 查找并解析技能 ==========
    skill_data = skill_dataset.find_skill(skill_name)
    if skill_data is None:
        raise ValueError(f"未找到技能: {skill_name}")
    skill_effect = skill_data.get("effect")

    resolved_cases = resolve_skill(
        skill_data,
        multiple=multiple,
        use_override=use_override,
        usage_mode_choice=usage_mode_choice,
    )

    attacker_data = pets_dataset.find(attacker_name, devolution=attacker_devolution, mega=attacker_mega)
    defender_data = pets_dataset.find(defender_name, devolution=defender_devolution, mega=defender_mega)

    # ========== 1. 获取属性列表 ==========
    attacker_elements = attacker_data["elements"]
    defender_elements = defender_data["elements"]

    # ========== 2. 根据技能类型确定攻击/防御属性 ==========
    base_skill_type_raw = resolved_cases[0].get("type")
    type_map = {"物攻": "atk", "魔攻": "mag"}
    skill_type = type_map.get(base_skill_type_raw, base_skill_type_raw)

    if skill_type == "atk":
        atk_attr_name = "atk"
        def_attr_name = "def"
    elif skill_type == "mag":
        atk_attr_name = "mag"
        def_attr_name = "res"
    else:
        raise ValueError(f"skill_type 必须为 'atk' 或 'mag'，当前值: {skill_type}")

    atk_race_value = attacker_data[atk_attr_name]
    def_race_value = defender_data[def_attr_name]
    hp_race_value = defender_data["hp"]
    if skill_type == "atk":
        active_atk_buff = attacker_phys_atk_buff if attacker_phys_atk_buff is not None else atk_buff
        active_def_buff = defender_phys_def_buff if defender_phys_def_buff is not None else def_buff
    else:
        active_atk_buff = attacker_mag_atk_buff if attacker_mag_atk_buff is not None else atk_buff
        active_def_buff = defender_mag_def_buff if defender_mag_def_buff is not None else def_buff

    # ========== 3. 解析天分和性格 ==========
    # 攻击方
    if attacker_iv is None:
        attacker_iv = {}
    atk_iv_value = attacker_iv.get(atk_attr_name)  # 攻击属性的天分

    attacker_personality = parse_personality(attacker_personality_bouns, attacker_personality_down)
    atk_personality_value = get_personality_bonus_for_attr(attacker_personality, atk_attr_name)

    # 防御方
    if defender_iv is None:
        defender_iv = {}
    def_iv_value = defender_iv.get(def_attr_name)  # 防御属性的天分
    hp_iv_value = defender_iv.get("hp")            # 生命天分

    defender_personality = parse_personality(defender_personality_bouns, defender_personality_down)
    def_personality_value = get_personality_bonus_for_attr(defender_personality, def_attr_name)
    hp_personality_value = get_personality_bonus_for_attr(defender_personality, "hp")

    # ========== 4. 生成场景 ==========
    atk_scenarios = generate_atk_scenarios(atk_iv_value, atk_personality_value, atk_attr_name)
    def_scenarios = generate_def_scenarios(def_iv_value, def_personality_value, def_attr_name)
    hp_scenarios = generate_hp_scenarios(hp_iv_value, hp_personality_value)

    # ========== 5. 按技能情况与 (atk, def) 场景计算伤害 ==========
    from core.battle_effects import manual_mark_modes, resolve_mark_modifiers

    def trait_manual_modes(runtime):
        if (
            not runtime
            or not runtime.get("triggerable", runtime.get("template") == "special_condition")
            or not runtime.get("triggered")
        ):
            return set()
        return {
            condition["mode"]
            for condition in runtime.get("conditions", [])
            if isinstance(condition, dict) and isinstance(condition.get("mode"), str)
        }

    skill_trigger_modes = {
        mode
        for case in resolved_cases
        for mode in case.get("_trigger_modes", [])
        if isinstance(mode, str)
    }
    attacker_manual_modes = manual_mark_modes(attacker_mark_state or {}) | trait_manual_modes(attacker_trait_runtime)
    defender_manual_modes = trait_manual_modes(defender_trait_runtime)
    results = []
    for skill_info in resolved_cases:
        active_modes = set(skill_info.get("_trigger_modes", []))
        skill_element = _resolve_trait_skill_element(
            attacker_trait_runtime,
            owner_side="attacker",
            current_skill_name=skill_name,
            current_skill_element=skill_info.get("element"),
            current_skill_type=skill_info.get("type", base_skill_type_raw),
            owner_elements=attacker_elements,
        )
        skill_power = skill_info.get("skill_power")
        current_skill_type_raw = skill_info.get("type", base_skill_type_raw)
        combo = normalize_count(skill_info.get("combo"))
        usage_time = normalize_count(skill_info.get("usage_time"))
        damage_reduction = normalize_ratio(skill_info.get("damage_reduction"))
        skill_power_multiplier = skill_info.get("power_multiplier")
        skill_damage_multiplier = skill_info.get("damage_multiplier")
        mini_advantage = skill_info.get("mini_advantage")
        usage_mode_effects = skill_info.get("_usage_mode_effects", [])
        advantage = TypeChart.calc(skill_element, defender_elements)
        if mini_advantage is not None:
            advantage = max(advantage, float(mini_advantage))

        attacker_trait_modifiers = _collect_trait_modifiers(
            attacker_trait_runtime,
            owner_side="attacker",
            current_skill_name=skill_name,
            current_skill_element=skill_element,
            current_skill_type=current_skill_type_raw,
            current_skill_effect=skill_effect,
            active_modes=active_modes,
            manual_modes=attacker_manual_modes,
            skill_trigger_modes=skill_trigger_modes,
            owner_elements=attacker_elements,
            current_advantage=advantage,
        )
        defender_trait_modifiers = _collect_trait_modifiers(
            defender_trait_runtime,
            owner_side="defender",
            current_skill_name=skill_name,
            current_skill_element=skill_element,
            current_skill_type=current_skill_type_raw,
            current_skill_effect=skill_effect,
            active_modes=active_modes,
            manual_modes=defender_manual_modes,
            skill_trigger_modes=skill_trigger_modes,
            owner_elements=defender_elements,
            current_advantage=advantage,
        )
        attacker_mark_modifiers = resolve_mark_modifiers(
            attacker_mark_state or {},
            skill_name,
            manual_modes=attacker_manual_modes,
            active_skill_modes=active_modes,
            skill_trigger_modes=skill_trigger_modes,
        )

        combined_combo_plus = (
            combo_plus
            + attacker_trait_modifiers["combo_plus"]
            + defender_trait_modifiers["combo_plus"]
            + attacker_mark_modifiers["combo_plus"]
        )
        combined_combo_mul = (
            combo_mul
            + attacker_trait_modifiers["combo_mul_delta"]
            + defender_trait_modifiers["combo_mul_delta"]
            + attacker_mark_modifiers["combo_mul_delta"]
        )
        combined_usage_time_plus = (
            usage_time_plus
            + attacker_trait_modifiers["usage_time_plus"]
            + defender_trait_modifiers["usage_time_plus"]
        )

        combo_fix = max(
            (attacker_trait_modifiers, defender_trait_modifiers),
            key=lambda modifiers: modifiers["combo_fix_priority"],
        )["combo_fixed"]
        if combo_fix is not None:
            combo = normalize_count(combo_fix)
        elif combo is not None or combined_combo_plus or combined_combo_mul != 1:
            base_combo = combo if combo is not None else 1
            combo = normalize_count((base_combo + combined_combo_plus) * combined_combo_mul)
            if combo == 1:
                combo = None

        if usage_time is not None or combined_usage_time_plus:
            base_usage_time = usage_time if usage_time is not None else 1
            usage_time = normalize_count(base_usage_time + combined_usage_time_plus)
            if usage_time == 1:
                usage_time = None

        damage_reductions = []
        if damage_reduction is not None:
            damage_reductions.append(damage_reduction)
        if damage_reductions_extra:
            damage_reductions.extend(
                reduction
                for reduction in (normalize_ratio(item) for item in damage_reductions_extra)
                if reduction is not None
            )
        damage_reductions.extend(attacker_trait_modifiers["damage_reductions"])
        damage_reductions.extend(defender_trait_modifiers["damage_reductions"])

        power_multipliers = normalize_modifier_list(power_multiplier)
        power_multipliers.extend(normalize_modifier_list(skill_power_multiplier))
        power_multipliers.extend(attacker_trait_modifiers["power_multipliers"])
        power_multipliers.extend(defender_trait_modifiers["power_multipliers"])
        power_multipliers.extend(attacker_mark_modifiers["power_multipliers"])
        from core.battle_effects import weather_power_multipliers
        power_multipliers.extend(weather_power_multipliers(weather, skill_element))

        damage_multipliers = normalize_modifier_list(damage_multiplier)
        damage_multipliers.extend(normalize_modifier_list(skill_damage_multiplier))
        damage_multipliers.extend(attacker_trait_modifiers["damage_multipliers"])
        damage_multipliers.extend(defender_trait_modifiers["damage_multipliers"])

        active_atk_buff_with_traits = (
            active_atk_buff
            + attacker_trait_modifiers["atk_buff_delta"]
            + defender_trait_modifiers["atk_buff_delta"]
        )
        active_def_buff_with_traits = (
            active_def_buff
            + attacker_trait_modifiers["def_buff_delta"]
            + defender_trait_modifiers["def_buff_delta"]
        )
        power_bonus_with_traits = (
            power_bonus
            + attacker_trait_modifiers["power_bonus"]
            + defender_trait_modifiers["power_bonus"]
            + attacker_mark_modifiers["power_bonus"]
        )

        type_bonus = 0.25 if skill_element in attacker_elements else 0.0

        is_active_trigger = (
            "trigger_label" in skill_info
            or bool(active_modes)
            or bool(thunderstorm_unregistered_burst)
        )
        case_label = skill_info.get("trigger_label") or ("触发情况" if is_active_trigger else "基础情况")

        for atk_s, def_s in product(atk_scenarios, def_scenarios):
            atk = calc_attr(
                attr_name=atk_attr_name,
                race_value=atk_race_value,
                iv=atk_s["atk_iv"],
                level=atk_lv,
                personality_bonus=atk_s["atk_personality"]
            )

            defense = calc_attr(
                attr_name=def_attr_name,
                race_value=def_race_value,
                iv=def_s["def_iv"],
                level=def_lv,
                star=5,
                personality_bonus=def_s["def_personality"]
            )

            usage_count = int(usage_time or 1)
            usage_results = None
            if (usage_mode_effects or thunderstorm_unregistered_burst) and usage_count > 1:
                sequence_damage = []
                usage_results = []
                effective_power = None
                for usage_index in range(usage_count):
                    usage_skill_power = skill_power
                    usage_combo = combo
                    usage_power_bonus = power_bonus_with_traits
                    if thunderstorm_unregistered_burst and usage_index > 0:
                        usage_skill_power = (usage_skill_power or 0) + thunderstorm_burst_effect_count * 10
                        usage_power_bonus += thunderstorm_burst_power_bonus
                    for effect in usage_mode_effects:
                        for key, raw_value in effect.items():
                            if key in {"multiple", "condition", "mode", "override"}:
                                continue
                            value = _normalize_runtime_value(key, raw_value)
                            if key == "skill_power_plus":
                                usage_skill_power = (usage_skill_power or 0) + value * usage_index
                            elif key == "combo_plus":
                                usage_combo = (usage_combo or 1) + value * usage_index
                            elif key == "skill_power_mul":
                                usage_skill_power = (usage_skill_power or 0) * (value ** usage_index)
                            elif key == "combo_mul":
                                usage_combo = (usage_combo or 1) * (value ** usage_index)

                    current_damage, _, current_effective_power = calculate_damage(
                        atk=atk,
                        defense=defense,
                        skill_power=usage_skill_power,
                        hp=hp,
                        power_multiplier=power_multipliers,
                        power_bonus=usage_power_bonus,
                        combo=usage_combo,
                        atk_buff=active_atk_buff_with_traits,
                        enemy_def_buff=active_def_buff_with_traits,
                        damage_reductions=damage_reductions,
                        type_bonus=type_bonus,
                        advantage=advantage,
                        atk_lv=atk_lv,
                        damage_multiplier=damage_multipliers,
                    )
                    sequence_damage.append(current_damage)
                    effective_power = current_effective_power
                    usage_results.append({
                        "effective_power": current_effective_power,
                        "combo": usage_combo,
                        "damage": current_damage,
                    })
                damage = sum(sequence_damage)
                damage_info = f"使用次数: {usage_count}, 逐次伤害: {' + '.join(map(str, sequence_damage))}, 总伤害: {damage}"
            else:
                damage, damage_info, effective_power = calculate_damage(
                    atk=atk,
                    defense=defense,
                    skill_power=skill_power,
                    hp=hp,
                    power_multiplier=power_multipliers,
                    power_bonus=power_bonus_with_traits,
                    combo=combo,
                    atk_buff=active_atk_buff_with_traits,
                    enemy_def_buff=active_def_buff_with_traits,
                    damage_reductions=damage_reductions,
                    type_bonus=type_bonus,
                    advantage=advantage,
                    atk_lv=atk_lv,
                    usage_time=usage_time,
                    damage_multiplier=damage_multipliers
                )

            starfall_result = None
            starfall_stacks = max(0, int(defender_starfall_mark_stacks or 0))
            if starfall_stacks and skill_element != "幻":
                starfall_power = starfall_stacks ** 2 + 24 * starfall_stacks - 24
                starfall_advantage = TypeChart.calc("幻", defender_elements)
                starfall_damage, _, _ = calculate_damage(
                    atk=atk,
                    defense=defense,
                    skill_power=starfall_power,
                    atk_buff=active_atk_buff_with_traits,
                    enemy_def_buff=active_def_buff_with_traits,
                    damage_reductions=damage_reductions,
                    type_bonus=0.0,
                    advantage=starfall_advantage,
                    atk_lv=atk_lv,
                )
                damage += starfall_damage
                starfall_result = {
                    "stacks": starfall_stacks,
                    "power": starfall_power,
                    "damage": starfall_damage,
                }

            hp_results = []
            for hp_s in hp_scenarios:
                if hp is not None:
                    scenario_hp = hp
                else:
                    scenario_hp = calc_attr(
                        attr_name="hp",
                        race_value=hp_race_value,
                        iv=hp_s["hp_iv"],
                        level=def_lv,
                        star=5,
                        personality_bonus=hp_s["hp_personality"]
                    )

                damage_percent = math.floor(damage / scenario_hp * 100)

                hp_results.append({
                    "hp_label": hp_s["hp_label"],
                    "hp": scenario_hp,
                    "damage_percent": damage_percent,
                })

            results.append({
                "skill_name": skill_name,
                "case_label": case_label,
                "is_triggered": is_active_trigger,
                "effective_power": effective_power,
                "atk_label": atk_s["atk_label"],
                "def_label": def_s["def_label"],
                "atk_value": atk,
                "def_value": defense,
                "damage": damage,
                "damage_info": damage_info,
                "usage_results": usage_results,
                "starfall": starfall_result,
                "hp_results": hp_results,
            })

    return results

def calculate_damage_range(
    atk_iv,
    def_iv,
    hp_iv,
    skill_power,
    combo=1,
    enable_talent=True,
):
    if enable_talent:
        talent_values = [0, 10]
    else:
        talent_values = list(range(11))  # 0~10

    results = []

    for atk_talent in talent_values:
        for def_talent in talent_values:
            for hp_talent in talent_values:

                for atk_personality in [0, 0.2]:

                    for hp_personality, def_personality in [
                        (0, 0),
                        (0.2, 0),
                        (0, 0.2),
                        (-0.1, 0),
                        (0, -0.1),
                    ]:
                        atk = calc_attr(
                            "atk",
                            atk_iv,
                            atk_talent,
                            personality_bonus=atk_personality,
                        )

                        defense = calc_attr(
                            "def",
                            def_iv,
                            def_talent,
                            personality_bonus=def_personality,
                        )

                        hp = calc_attr(
                            "hp",
                            hp_iv,
                            hp_talent,
                            personality_bonus=hp_personality,
                        )

                        damage = calculate_damage_simple(
                            atk=atk,
                            defense=defense,
                            skill_power=skill_power,
                            combo=combo,
                            other_attack_bonuses=[0],
                            damage_reductions=[0],
                        )["damage"]

                        results.append({
                            "atk": (atk_talent, atk_personality),
                            "hp": (hp_talent, hp_personality),
                            "def": (def_talent, def_personality),
                            "damage": damage,
                            "ratio": math.floor(damage / hp, 4),
                        })

    return  results

# =========================
# 示例用法
# =========================

if __name__ == "__main__":
    # 示例1：计算伤害
    # atk = calc_attr("atk",137,10,personality_bonus=0)
    # defense = calc_attr("def", 79, 0,personality_bonus=0)

    # result = calculate_damage_range(
    #     atk_iv=111,
    #     def_iv=77,
    #     hp_iv=90,
    #     skill_power=187,
    # )
    # print(result)

    results = battle_damage(
        # 技能
        skill_name="灵光",
        # skill_name="流火",
        # 攻击方
        attacker_name="落陨星兔",
        attacker_devolution=0,  # 不退化
        attacker_mega=False,  # 非mega
        attacker_iv={"hp": 10, "atk": None, "mag": 10},
        attacker_personality_bouns=None,  # str 或 None, e.g. "atk", "mag:0.15"
        attacker_personality_down=None,
        atk_buff=0,  # 10% 攻击buff
        power_multiplier=[0],  # 威力 +20%
        power_bonus=40,  # 威力增幅 +30
        # combo=1,
        # 防御方
        # defender_name="优优",
        # defender_name="布鲁斯",
        # defender_name="冰虫",
        # defender_name="兽花蕾",
        # defender_name="冰布丁",
        defender_name="马头",
        # defender_name="锤头鹳",
        # defender_name="影狸",
        # defender_name="巨鼓象",
        # defender_name="加油蟹",
        # defender_name= "落陨星兔",
        # defender_name="音速犬",
        # defender_name="花衣蝶",
        # defender_name= "琉璃水母",
        # defender_name="狐狸",
        # defender_name="烈火守护",
        defender_devolution=0,

        defender_mega=False,
        defender_iv={"hp": None, "def": None, "res": None},
        defender_personality_bouns=None,  # str 或 None
        defender_personality_down=None,  # str 或 None
        # damage_reductions=[0.8],  # 10% 减伤
        def_buff=0.2,
        # 其他
        # atk_lv=60,
        # def_lv=60
    )
    for r in results:
        print("=" * 60)
        print(f"攻击: {r['atk_label']:6} ({r['atk_value']})")
        print(f"防御: {r['def_label']:6} ({r['def_value']})")
        print(f"伤害: {r['damage']}")
        if r['damage_info'] is not None:
            print(f"{r['damage_info']}\n")
        print("HP情况:")
        for hp in r["hp_results"]:
            print(
                f"    {hp['hp_label']:6} "
                f"HP={hp['hp']:3} "
                f"伤害={hp['damage_percent']}%"
            )
