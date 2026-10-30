from typing import Any


def _unit_trait_runtime(state: dict[str, Any]) -> dict[str, Any]:
    from core.trait_finder import find_trait
    from core.trait_library import load_trait_data_by_name
    from core.trait_runtime import resolve_trait_runtime

    mega_form = (state.get("mega_form") or "").strip()
    query = (state.get("trait_override_query") or state.get("name") or "").strip()
    trait_data = find_trait(
        query,
        mega=bool(state.get("mega", False)) or bool(mega_form),
        mega_target_query=mega_form or None,
    )
    if trait_data is None:
        trait_data = load_trait_data_by_name(query)
    return resolve_trait_runtime(
        trait_data,
        triggered=bool(state.get("trait_triggered", False)),
        stacks=int(state.get("trait_stacks", 0) or 0),
        choices=state.get("trait_choices"),
    )


def _attacker_args(state: dict[str, Any]) -> dict[str, Any]:
    power_multiplier = state.get("power_multiplier", 0) or 0
    other_bonuses = state.get("other_bonuses") or {}
    if not isinstance(other_bonuses, dict):
        other_bonuses = {}
    mega_form = (state.get("mega_form") or "").strip()
    skill_name = state.get("current_skill") or (state.get("skills") or [""])[0]
    skill_stacks = state.get("skill_trigger_stacks") or {}
    multiple = skill_stacks.get(skill_name) if isinstance(skill_stacks, dict) else None
    if not isinstance(multiple, list):
        multiple = [state.get("multiple", 0) or 0]
    dedication_power_stacks = max(0, int(other_bonuses.get("dedication_power_stacks", 0) or 0))
    dedication_combo_stacks = max(0, int(other_bonuses.get("dedication_combo_stacks", 0) or 0))
    has_dedication_bonus = skill_name in {"虫群", "啃咬"}
    burst_effect_ids = other_bonuses.get("burst_triggered_effect_ids", [])
    if not isinstance(burst_effect_ids, list):
        burst_effect_ids = []
    burst_effect_ids = {str(effect_id) for effect_id in burst_effect_ids}
    burst_runtime_effects = {
        "skill:电弧": {"power_bonus": 40},
        "skill:引雷": {"power_bonus": 20},
        "skill:天旋地转": {"power_bonus": 30},
        "skill:双联脉冲": {"usage_time_plus": 1},
        "trait:电流刺激": {"power_bonus": 40},
        "mark:蓄电印记": {"power_bonus": 10},
    }
    attacker_trait_runtime = _unit_trait_runtime(state)
    current_burst_effect_ids = set()
    trait_modes = {
        condition.get("mode")
        for condition in attacker_trait_runtime.get("conditions", [])
        if isinstance(condition, dict) and isinstance(condition.get("mode"), str)
    }
    if attacker_trait_runtime.get("name") == "电流刺激" and "burst" in trait_modes:
        current_burst_effect_ids.add("trait:电流刺激")
    if bool(other_bonuses.get("charge_mark_triggered", False)):
        current_burst_effect_ids.add("mark:蓄电印记")

    unregistered_burst_effect_ids = current_burst_effect_ids - burst_effect_ids
    # 面板勾选的是雷暴在本次计算开始前已经获得、已经计入的效果。
    # 未勾选但当前有效的来源，要等第一段雷暴结束后才会被雷暴获得。
    counted_burst_effect_ids = burst_effect_ids
    burst_power_bonus = 0
    burst_usage_time_plus = 0
    unregistered_burst_power_bonus = 0
    if skill_name == "雷暴":
        # 雷暴的 +10 来自其原始 triggered.skill_power_plus，通过 multiple
        # 交给技能解析器结算；此处只叠加其他来源可计算的效果。
        for effect_id in counted_burst_effect_ids:
            effect = burst_runtime_effects.get(effect_id, {})
            burst_power_bonus += effect.get("power_bonus", 0)
            burst_usage_time_plus += effect.get("usage_time_plus", 0)
        for effect_id in unregistered_burst_effect_ids:
            unregistered_burst_power_bonus += burst_runtime_effects.get(effect_id, {}).get("power_bonus", 0)
    return {
        "attacker_name": mega_form or state.get("name", ""),
        "attacker_devolution": int(state.get("devolution", 0) or 0),
        "attacker_mega": bool(state.get("mega", False)) and not mega_form,
        "attacker_iv": state.get("iv"),
        "attacker_personality_bouns": state.get("personality_bouns"),
        "attacker_personality_down": state.get("personality_down"),
        "attacker_phys_atk_buff": (state.get("phys_atk_buff", 0) or 0) / 100,
        "attacker_mag_atk_buff": (state.get("mag_atk_buff", 0) or 0) / 100,
        "skill_name": skill_name,
        "multiple": [len(burst_effect_ids)] if skill_name == "雷暴" else [max(0, int(value or 0)) for value in multiple],
        "power_multiplier": (
            ([(power_multiplier / 100)] if power_multiplier else [])
        ) or None,
        "light_power_multiplier": (state.get("light_power_buff", 0) or 0) / 100,
        "power_bonus": (state.get("power_bonus", 0) or 0) + (dedication_power_stacks * 20 if has_dedication_bonus else 0) + burst_power_bonus,
        "combo_plus": (state.get("combo_plus", 0) or 0) + (dedication_combo_stacks if has_dedication_bonus else 0),
        # UI 中的连击倍是 buff 增量，0 表示不改变原本连击倍率；
        # 计算核心仍以 1 作为基础倍率，因此这里还原为核心输入值。
        "combo_mul": 1 + (state.get("combo_mul", 0) or 0),
        "usage_time_plus": (state.get("usage_time_plus", 0) or 0) + burst_usage_time_plus,
        "thunderstorm_unregistered_burst": bool(unregistered_burst_effect_ids) and skill_name == "雷暴",
        "thunderstorm_burst_effect_count": len(unregistered_burst_effect_ids),
        "thunderstorm_burst_power_bonus": unregistered_burst_power_bonus,
        "usage_mode_choice": (state.get("skill_usage_mode_choices") or {}).get(skill_name),
        "attacker_trait_runtime": attacker_trait_runtime,
        "attacker_mark_state": other_bonuses,
    }


def _defender_args(state: dict[str, Any]) -> dict[str, Any]:
    mega_form = (state.get("mega_form") or "").strip()
    other_bonuses = state.get("other_bonuses") or {}
    if not isinstance(other_bonuses, dict):
        other_bonuses = {}
    return {
        "defender_name": mega_form or state.get("name", ""),
        "defender_devolution": int(state.get("devolution", 0) or 0),
        "defender_mega": bool(state.get("mega", False)) and not mega_form,
        "defender_iv": state.get("iv"),
        "defender_personality_bouns": state.get("personality_bouns"),
        "defender_personality_down": state.get("personality_down"),
        "defender_phys_def_buff": (state.get("phys_def_buff", 0) or 0) / 100,
        "defender_mag_def_buff": (state.get("mag_def_buff", 0) or 0) / 100,
        "defender_starfall_mark_stacks": max(0, int(other_bonuses.get("starfall_mark_stacks", 0) or 0)),
        "defender_trait_runtime": _unit_trait_runtime(state),
    }
