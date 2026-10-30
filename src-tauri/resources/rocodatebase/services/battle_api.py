import time
from typing import Any

from . import unit_args


COMMAND_TIMING: dict[str, float] = {}


def trait_info(payload: dict[str, Any]) -> dict[str, Any]:
    from core.trait_finder import find_trait
    from core.trait_runtime import resolve_trait_runtime

    trait_data = find_trait(
        (payload.get("query") or "").strip(),
        mega=bool(payload.get("mega", False)),
        mega_target_query=(payload.get("megaForm") or "").strip() or None,
    )
    runtime = resolve_trait_runtime(
        trait_data,
        triggered=bool(payload.get("triggered", False)),
        stacks=int(payload.get("stacks", 0) or 0),
        choices=payload.get("choices"),
    )
    return {"trait": trait_data, "runtime": runtime}


def calculate_battle(payload: dict[str, Any]) -> dict[str, Any]:
    from core.damresult import battle_damage, get_personality_bonus_for_attr, parse_personality

    attacker = payload.get("attacker") or {}
    defender = payload.get("defender") or {}
    weather = payload.get("weather") or "none"
    return {"results": battle_damage(**unit_args._attacker_args(attacker), **unit_args._defender_args(defender), weather=weather)}


def calculate_quick_skills(payload: dict[str, Any]) -> dict[str, Any]:
    """Calculate every damaging skill in the supplied card order.

    This deliberately does not consult ``current_skill``.  Ctrl+J is a batch
    action, so status skills are ignored and each attack skill gets its own
    explicit damage calculation (including all of its resolved conditions).
    """
    from core.damresult import battle_damage
    from core.skill_finder import skill_dataset

    attacker = payload.get("attacker") or {}
    defender = payload.get("defender") or {}
    weather = payload.get("weather") or "none"
    skills = payload.get("skills") or attacker.get("skills") or []
    if not isinstance(skills, list):
        skills = []

    handler_started = time.perf_counter()
    seen: set[str] = set()
    items = []
    started = time.perf_counter()
    defender_args = unit_args._defender_args(defender)
    COMMAND_TIMING["defender_args_ms"] = COMMAND_TIMING.get("defender_args_ms", 0.0) + (time.perf_counter() - started) * 1000
    for raw_name in skills:
        skill_name = str(raw_name or "").strip()
        if not skill_name or skill_name in seen:
            continue
        seen.add(skill_name)
        started = time.perf_counter()
        skill_data = skill_dataset.find_skill(skill_name)
        COMMAND_TIMING["skill_lookup_ms"] = COMMAND_TIMING.get("skill_lookup_ms", 0.0) + (time.perf_counter() - started) * 1000
        if not isinstance(skill_data, dict) or skill_data.get("type") not in {"物攻", "魔攻"}:
            continue
        started = time.perf_counter()
        attacker_args = unit_args._attacker_args({**attacker, "current_skill": skill_name})
        COMMAND_TIMING["attacker_args_ms"] = COMMAND_TIMING.get("attacker_args_ms", 0.0) + (time.perf_counter() - started) * 1000
        started = time.perf_counter()
        results = battle_damage(
            **attacker_args,
            **defender_args,
            weather=weather,
            powers_only=bool(payload.get("powers_only", False)),
        )
        COMMAND_TIMING["battle_damage_ms"] = COMMAND_TIMING.get("battle_damage_ms", 0.0) + (time.perf_counter() - started) * 1000
        COMMAND_TIMING["battle_damage_calls"] = COMMAND_TIMING.get("battle_damage_calls", 0.0) + 1
        items.append({
            "skillName": skill_name,
            # 技能卡显示的是计算后的威力，不是技能数据库里的原始威力。
            "displayPower": results[0].get("effective_power") if results else None,
            "results": results,
        })
    COMMAND_TIMING["quick_skill_requests"] = COMMAND_TIMING.get("quick_skill_requests", 0.0) + 1
    COMMAND_TIMING["quick_skill_handler_ms"] = COMMAND_TIMING.get("quick_skill_handler_ms", 0.0) + (time.perf_counter() - handler_started) * 1000
    return {"items": items}


def calculate_quick_skills_batch(payload: dict[str, Any]) -> dict[str, Any]:
    """Reuse one interpreter for stack trials; preserve each calculation verbatim."""
    requests = payload.get("requests")
    if not isinstance(requests, list):
        raise ValueError("Quick skill requests must be a list")
    started = time.perf_counter()
    items = [calculate_quick_skills(request) for request in requests]
    COMMAND_TIMING["batch_requests"] = float(len(requests))
    COMMAND_TIMING["batch_handler_ms"] = (time.perf_counter() - started) * 1000
    return {"items": items}


def trait_power_candidates(payload: dict[str, Any]) -> dict[str, Any]:
    """Prepare layer-dependent displayed powers before starting trait-alignment OCR."""
    from core.damresult import battle_damage
    from core.skill_finder import skill_dataset

    attacker = payload.get("attacker") or {}
    defender = payload.get("defender") or {}
    started = time.perf_counter()
    runtime = unit_args._unit_trait_runtime({**attacker, "trait_stacks": 1})
    COMMAND_TIMING["trait_runtime_ms"] = (time.perf_counter() - started) * 1000
    if not runtime.get("stackable"):
        raise ValueError("当前特性没有可修正的叠层，无法进行特性对齐")

    # 保留技能槽索引，不能跳过状态技能后把 OCR 威力对应到其他技能上。
    skill_names = (attacker.get("skills") or [])[:4]
    attack_skills = []
    non_stacking_skills = []
    started = time.perf_counter()
    for index, name in enumerate(skill_names):
        skill = skill_dataset.find_skill(name) if name else None
        if isinstance(skill, dict) and skill.get("type") in {"物攻", "魔攻"}:
            attack_skills.append((index, name))
            triggered = skill.get("triggered")
            options = [triggered] if isinstance(triggered, dict) else triggered if isinstance(triggered, list) else []
            if not any(isinstance(option, dict) and (option.get("multiple") or option.get("skill_power_by_count")) for option in options):
                non_stacking_skills.append(index)
    COMMAND_TIMING["trait_skill_lookup_ms"] = (time.perf_counter() - started) * 1000
    if not attack_skills:
        raise ValueError("我方当前技能中没有可用于特性对齐的攻击技能")

    started = time.perf_counter()
    defender_args = unit_args._defender_args(defender)
    COMMAND_TIMING["trait_defender_args_ms"] = (time.perf_counter() - started) * 1000
    min_stacks = max(0, min(99, int(payload.get("min_stacks", 0))))
    max_stacks = max(0, min(99, int(payload.get("max_stacks", 99))))
    if min_stacks > max_stacks:
        raise ValueError("特性层数搜索范围无效")
    candidates = []
    attacker_args_ms = 0.0
    battle_damage_ms = 0.0
    battle_damage_calls = 0
    # 与特性层数输入框一致，只穷举指定范围；技能叠层、buff、触发选择均保持原值。
    for stacks in range(min_stacks, max_stacks + 1):
        powers = [[] for _ in range(4)]
        for index, name in attack_skills:
            started = time.perf_counter()
            attacker_args = unit_args._attacker_args({**attacker, "current_skill": name, "trait_stacks": stacks})
            attacker_args_ms += (time.perf_counter() - started) * 1000
            started = time.perf_counter()
            results = battle_damage(
                **attacker_args,
                **defender_args,
                weather=payload.get("weather") or "none",
                powers_only=True,
            )
            battle_damage_ms += (time.perf_counter() - started) * 1000
            battle_damage_calls += 1
            powers[index] = sorted({
                int(item["effective_power"])
                for item in results
                if isinstance(item.get("effective_power"), (int, float))
            })
        candidates.append({"stacks": stacks, "powers": powers})
    COMMAND_TIMING["trait_attacker_args_ms"] = attacker_args_ms
    COMMAND_TIMING["trait_battle_damage_ms"] = battle_damage_ms
    COMMAND_TIMING["trait_battle_damage_calls"] = float(battle_damage_calls)
    COMMAND_TIMING["trait_candidate_count"] = float(len(candidates))
    COMMAND_TIMING["trait_total_ms"] = (
        COMMAND_TIMING.get("trait_runtime_ms", 0.0)
        + COMMAND_TIMING.get("trait_skill_lookup_ms", 0.0)
        + COMMAND_TIMING.get("trait_defender_args_ms", 0.0)
        + attacker_args_ms
        + battle_damage_ms
    )

    # 比较实际计算结果，覆盖技能属性转换、对方防御增减、逐次威力等间接影响。
    # 单纯增加连击/伤害、速度等不会改变显示威力，不能拿来反推特性层数。
    affected = [index for index, _ in attack_skills if any(
        candidate["powers"][index] != candidates[0]["powers"][index]
        for candidate in candidates[1:]
    )]
    if min_stacks == 0 and not affected:
        raise ValueError("当前特性叠层不影响所携技能的显示威力，无法进行特性对齐")
    return {"traitName": runtime.get("name") or "当前特性", "candidates": candidates, "affectedSkills": affected, "nonStackingSkills": non_stacking_skills}


def calculate_enemy_attack_skills(payload: dict[str, Any]) -> dict[str, Any]:
    """Return every damage branch and stack trial for the Ctrl+K table."""
    from itertools import product

    from core.damresult import battle_damage, get_personality_bonus_for_attr, parse_personality
    from core.find_pets import pets_dataset
    from core.skill_finder import resolve_skill, skill_dataset

    attacker = payload.get("attacker") or {}
    defender = payload.get("defender") or {}
    target_hp = float(payload.get("target_hp") or 0)
    weather = payload.get("weather") or "none"
    selected_skill = str(payload.get("skill_name") or "").strip()

    defender_args = unit_args._defender_args(defender)
    suffix_order = ["++", "+", ""]
    max_hp = 0

    def suffix_for_result(label: str, skill_type: str) -> str:
        if label.startswith("加") and "天分加性格" in label:
            return "++"
        if label.startswith("加") and "天分" in label:
            return "+"
        if label.startswith("减"):
            return "-"
        if label.startswith("正常"):
            return ""
        # A configured personality without a built-in scenario label is returned as「指定攻击」.
        if label.startswith("指定"):
            attr_name = "atk" if skill_type == "物攻" else "mag"
            iv = ((attacker.get("iv") or {}).get(attr_name))
            personality = parse_personality(attacker.get("personality_bouns"), attacker.get("personality_down"))
            personality_value = get_personality_bonus_for_attr(personality, attr_name)
            if personality_value is not None and personality_value < 0:
                return "-"
            if iv is not None and iv > 0:
                return "++" if personality_value and personality_value > 0 else "+"
            return ""
        return ""

    def stack_dimensions(skill_data: dict[str, Any]) -> list[tuple[int, int]]:
        triggered = skill_data.get("triggered")
        options = [triggered] if isinstance(triggered, dict) else triggered if isinstance(triggered, list) else []
        return [
            (index, len(option["skill_power_by_count"]) - 1 if isinstance(option.get("skill_power_by_count"), list) and option["skill_power_by_count"] else 10)
            for index, option in enumerate(options)
            if isinstance(option, dict) and (bool(option.get("multiple")) or bool(option.get("skill_power_by_count")))
        ]

    def stack_vectors(dimensions: list[tuple[int, int]]) -> list[list[int]]:
        if not dimensions:
            return [[]]
        vectors = []
        for counts in product(*(range(maximum + 1) for _, maximum in dimensions)):
            values = [0] * (dimensions[-1][0] + 1)
            for (index, _), count in zip(dimensions, counts):
                values[index] = count
            vectors.append(values)
        vectors.sort(key=lambda values: (sum(values), max(values, default=0), values))
        return vectors

    def cell_for_result(item: dict[str, Any], stacks: list[int]):
        combo = item.get("combo") or 1
        usage_count = item.get("usage_time") or 1
        extra_damage = (item.get("starfall") or {}).get("damage", 0)
        usage_results = item.get("usage_results") or [{
            "effective_power": item.get("effective_power"),
            "combo": combo,
            "damage": (item.get("damage", 0) - extra_damage) / usage_count,
        }] * usage_count
        hit_segments = [{
            "power": usage.get("effective_power"),
            "combo": usage.get("combo") or 1,
            "damage": usage.get("damage", 0) / (usage.get("combo") or 1),
        } for usage in usage_results]
        return {
            "skillPower": item.get("effective_power"),
            "damage": item.get("damage"),
            "combo": combo,
            "hitSegments": hit_segments,
            "totalSkillPower": sum(segment["power"] * segment["combo"] for segment in hit_segments if segment["power"] is not None),
            "extraDamage": extra_damage,
            "stacks": sum(stacks),
            "stackValues": stacks,
        }

    # Ctrl+K 取敌方精灵的技能库（该精灵可学到的全部技能），不是当前携带的技能。
    mega_form = (attacker.get("mega_form") or "").strip()
    attacker_pet = pets_dataset.find(
        mega_form or attacker.get("name") or "",
        devolution=int(attacker.get("devolution", 0) or 0),
        mega=bool(attacker.get("mega", False)) and not mega_form,
    )
    library_names: list[str] = []
    if isinstance(attacker_pet, dict):
        for entry in attacker_pet.get("skills") or []:
            raw_skill = entry.get("skill_name") if isinstance(entry, dict) else entry
            name = str(raw_skill or "").strip()
            if name:
                library_names.append(name)
    if not library_names:
        library_names = [str(raw_name or "").strip() for raw_name in attacker.get("skills") or []]
    if selected_skill:
        library_names = [selected_skill]

    profiles: dict[str, list[dict[str, Any]]] = {"物攻": [], "魔攻": []}
    seen = set()
    for raw_name in library_names:
        skill_name = str(raw_name or "").strip()
        if not skill_name or skill_name in seen:
            continue
        seen.add(skill_name)
        skill_data = skill_dataset.find_skill(skill_name)
        if not isinstance(skill_data, dict) or skill_data.get("type") not in {"物攻", "魔攻"}:
            continue
        dimensions = stack_dimensions(skill_data)
        attacker_args = unit_args._attacker_args({**attacker, "current_skill": skill_name})
        branches: dict[int, dict[str, Any]] = {}
        for stacks in stack_vectors(dimensions):
            multiple = stacks if dimensions else attacker_args.get("multiple", 0)
            # Stack trials (including discrete energy-count tables such as 魔能爆)
            # must resolve against this trial's count, never a cached/base case.
            cases = resolve_skill(
                skill_data, multiple=multiple, usage_mode_choice=attacker_args.get("usage_mode_choice"),
            ) if dimensions else skill_data.get("resolved_cases") or resolve_skill(
                skill_data, multiple=multiple, usage_mode_choice=attacker_args.get("usage_mode_choice"),
            )
            # Stable case IDs keep a stacking base branch separate from real trigger branches.
            resolved = []
            for index, case in enumerate(cases):
                # Some attack skills only gain power when a trigger applies (for
                # example, a skill_power_plus branch with no base power). The
                # untriggered case has no damage to calculate, and passing it to
                # battle_damage raises "必须提供 skill_power 或 hp" for the
                # entire Ctrl+K request. Keep any calculable trigger branches.
                if case.get("skill_power") is None:
                    continue
                if index not in branches:
                    branches[index] = {
                        "skillName": skill_name,
                        "caseLabel": (case.get("case_label") or case.get("trigger_label") or ("非触发情况" if index == 0 else "触发情况")) if len(cases) > 1 else case.get("case_label") or case.get("trigger_label") or "",
                        "triggered": bool(case.get("is_triggered") or case.get("trigger_label") or index > 0),
                        "description": skill_data.get("description") or "",
                        "element": skill_data.get("element") or "普通",
                        "stackable": bool(dimensions),
                        "columns": [{"label": suffix, "candidates": []} for suffix in suffix_order],
                    }
                resolved.append({**case, "case_label": str(index)})
            if not resolved:
                continue
            results = battle_damage(
                **{**attacker_args, "multiple": multiple}, **defender_args, weather=weather,
                skill_data_override={**skill_data, "resolved_cases": resolved},
            )
            for item in results:
                max_hp = max(max_hp, *(float(hp.get("hp") or 0) for hp in item.get("hp_results") or [{}]))
                suffix = suffix_for_result(item.get("atk_label", ""), skill_data["type"])
                if suffix not in suffix_order:
                    continue
                branch = branches[int(item["case_label"])]
                branch["columns"][suffix_order.index(suffix)]["candidates"].append(cell_for_result(item, stacks))
        for branch in branches.values():
            if any(column["candidates"] for column in branch["columns"]):
                profiles[skill_data["type"]].append(branch)

    groups = []
    for attack_type in ("物攻", "魔攻"):
        skills = profiles[attack_type]
        if not skills:
            continue
        skills.sort(key=lambda skill: (-max(
            (cell["totalSkillPower"] for column in skill["columns"] for cell in column["candidates"] if cell["stacks"] == 0), default=0,
        ), skill["skillName"], skill["caseLabel"]))
        groups.append({"attackType": attack_type, "skills": skills})
    return {"targetHp": target_hp, "maxHp": max_hp, "groups": groups}


def calculate_watch_advantages(payload: dict[str, Any]) -> dict[str, float]:
    """Resolve current defending form and reuse the battle type chart."""
    from core.ele_advantage import Type, TypeChart
    from core.find_pets import pets_dataset

    defender = payload.get("defender") or {}
    mega_form = (defender.get("mega_form") or "").strip()
    pet = pets_dataset.find(
        mega_form or defender.get("name", ""),
        devolution=int(defender.get("devolution", 0) or 0),
        mega=bool(defender.get("mega", False)) and not mega_form,
    )
    if not pet:
        raise ValueError("未找到当前我方精灵，无法计算克制技能")
    return {element.name: TypeChart.calc([element.name], pet["elements"]) for element in Type}


def calculate_willpower(payload: dict[str, Any]) -> dict[str, Any]:
    """Calculate only distinct relation/STAB cases, then reuse them for all 18 elements."""
    from core.will_power import WILLPOWER_ELEMENTS, willpower_skill_cases
    from core.calshuxing import calc_attr
    from core.damresult import battle_damage, parse_personality, get_personality_bonus_for_attr
    from core.ele_advantage import TypeChart
    from core.find_pets import pets_dataset

    attacker = payload.get("attacker") or {}
    defender = payload.get("defender") or {}
    weather = payload.get("weather") or "none"
    allowed_elements = WILLPOWER_ELEMENTS
    bloodline = (attacker.get("bloodline") or "").strip()
    if payload.get("restrict_to_bloodline") and bloodline:
        allowed_elements = tuple(element for element in WILLPOWER_ELEMENTS if bloodline == f"{element}系血脉")
        if not allowed_elements:
            raise ValueError(f"{bloodline}无法使用愿力")
    attacker_data = pets_dataset.find(attacker.get("name"), devolution=attacker.get("devolution", 0), mega=attacker.get("mega", False))
    defender_data = pets_dataset.find(defender.get("name"), devolution=defender.get("devolution", 0), mega=defender.get("mega", False))
    attacker_args = unit_args._attacker_args(attacker)
    personality = parse_personality(attacker.get("personality_bouns"), attacker.get("personality_down"))
    iv = attacker.get("iv") or {}
    trait_effects = (attacker_args.get("attacker_trait_runtime") or {}).get("resolved_effects", [])

    def final_attack_value(attribute: str, buff_key: str) -> float:
        value = calc_attr(attribute, attacker_data[attribute], iv.get(attribute) or 0, level=60, personality_bonus=get_personality_bonus_for_attr(personality, attribute))
        # Passive/self trait stat buffs contribute to the type decision before damage is calculated.
        trait_buff = sum(
            float(effect.get("value", 0) or 0)
            for effect in trait_effects
            if isinstance(effect, dict)
            and effect.get("kind") == "stat_buff"
            and attribute in effect.get("stats", [])
            and effect.get("target") in {"self", "all", "attacker"}
        )
        return value * (1 + (attacker.get(buff_key, 0) or 0) / 100 + trait_buff)

    # Compare final offensive values. Equal values intentionally select magic.
    atk = final_attack_value("atk", "phys_atk_buff")
    mag = final_attack_value("mag", "mag_atk_buff")
    attack_type = "atk" if atk > mag else "mag"
    cases = willpower_skill_cases(attack_type)
    cache: dict[tuple[float, bool, bool], list[dict[str, Any]]] = {}
    elements = []
    for element in allowed_elements:
        advantage = TypeChart.calc([element], defender_data["elements"])
        has_stab = element in attacker_data["elements"]
        key = (advantage, has_stab, element == "光" and bool(attacker.get("light_power_buff")))
        if key not in cache:
            skill_data = {"name": "愿力", "effect": "攻击", "resolved_cases": [{**case, "element": element} for case in cases]}
            cache[key] = battle_damage(**attacker_args, **unit_args._defender_args(defender), weather=weather, skill_data_override=skill_data)
        elements.append({"element": element, "advantage": advantage, "has_stab": has_stab, "results": cache[key]})
    return {"attack_type": attack_type, "elements": elements}


def calculate_required_power(payload: dict[str, Any]) -> dict[str, Any]:
    from core.damresult import battle_required_power
    from core.find_pets import pets_dataset

    # 判死由当前防御方攻击当前攻击方；输入的是我方（当前攻击方）的血量。
    target = payload.get("attacker") or {}
    killer = payload.get("defender") or {}
    target_hp = float(payload.get("target_hp") or 0)
    weather = payload.get("weather") or "none"
    killer_args = unit_args._attacker_args(killer)
    # 判死表固定枚举敌方物攻/魔攻的四种天分与性格档位，不使用其当前指定值。
    killer_args["attacker_iv"] = {**(killer_args.get("attacker_iv") or {}), "atk": None, "mag": None}
    killer_args["attacker_personality_bouns"] = None
    killer_args["attacker_personality_down"] = None
    target_args = unit_args._defender_args(target)
    killer_data = pets_dataset.find(killer_args["attacker_name"], devolution=killer_args["attacker_devolution"], mega=killer_args["attacker_mega"])
    element = (killer_data.get("elements") or ["普通"])[0]
    rows = []
    for attack_type, label in (("物攻", "物攻"), ("魔攻", "魔攻")):
        skill_data = {"name": f"判死{label}", "effect": "攻击", "resolved_cases": [{"case_label": "判死", "is_triggered": False, "skill_power": 1, "type": attack_type, "element": element}]}
        results = battle_required_power(target_hp, **killer_args, **target_args, weather=weather, skill_data_override=skill_data)
        for result in results:
            rows.append({"attack_type": label, "attacker_label": result["atk_label"], "required_power": result["required_power"]})
    return {"target_hp": target_hp, "rows": rows}
