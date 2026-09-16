import argparse
import base64
import contextlib
import difflib
import io
import json
import os
import re
import sys
from pathlib import Path
from typing import Any


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

API_STDOUT = sys.stdout
ONNX_OCR_ENGINE: Any | None = None
IMAGE_CLASSIFIER: Any | None = None
REPLAY_SKILL_OVERRIDES: dict[str, dict[str, str]] = {
    "愿力冲击": {"type": "物攻"},
    "聚能": {"type": "变化"},
    "跺地": {"type": "物攻"},
}
REPLAY_SKILL_ALIASES = {
    # The OCR model occasionally substitutes the first glyph of this skill.
    "踩地": "跺地",
}

BASE_DIR = Path(__file__).resolve().parent
CLASSIFIER_DIR = BASE_DIR.parent / "image-classifier"
DATA_DIR = BASE_DIR / "data"
PETS_DIR = DATA_DIR / "pets_w_skill_json"
SKILLS_DIR = DATA_DIR / "skills_database"
USER_DATA_DIR = Path(os.environ.get("ROCODATABASE_USER_DATA_DIR", DATA_DIR))
PRESETS_PATH = USER_DATA_DIR / "presets.json"
TEAMS_PATH = USER_DATA_DIR / "teams.json"
CONFIGS_PATH = USER_DATA_DIR / "configs.json"
DEFAULT_PRESETS_PATH = DATA_DIR / "presets.json"
DEFAULT_TEAMS_PATH = DATA_DIR / "teams.json"
DEFAULT_CONFIGS_PATH = DATA_DIR / "configs.json"

sys.path.insert(0, str(BASE_DIR))


def _json_response(payload: dict[str, Any]) -> None:
    API_STDOUT.write(json.dumps(payload, ensure_ascii=False) + "\n")
    API_STDOUT.flush()


def _load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def _iter_json_files(path: Path):
    if not path.exists():
        return
    for item in sorted(path.iterdir(), key=lambda p: p.name):
        if item.suffix.lower() == ".json" and item.is_file():
            yield item


def _payload_from_text(text: str) -> dict[str, Any]:
    return json.loads(text) if text else {}


def _pet_label(pet: dict[str, Any]) -> str:
    return f"{pet.get('id', '')}{pet.get('name', '')}"


def _pet_sort_key(pet: dict[str, Any]) -> tuple[int, str]:
    pet_id = pet.get("id", "")
    try:
        return int(pet_id), pet.get("name", "")
    except (TypeError, ValueError):
        return 10**9, pet.get("name", "")


def _pet_summary(pet: dict[str, Any]) -> dict[str, Any]:
    skills = pet.get("skills") or []
    trait = pet.get("特性")
    trait_name = trait.get("名称") if isinstance(trait, dict) else trait
    trait_effect = trait.get("效果") if isinstance(trait, dict) else ""
    evolution = pet.get("evolution") or {}
    return {
        "id": pet.get("id", ""),
        "name": pet.get("name", ""),
        "label": _pet_label(pet),
        "elements": pet.get("elements", []),
        "race": pet.get("种族资质"),
        "hp": pet.get("hp"),
        "atk": pet.get("atk"),
        "mag": pet.get("mag"),
        "def": pet.get("def"),
        "res": pet.get("res"),
        "spd": pet.get("spd"),
        "traitName": trait_name or "",
        "traitEffect": trait_effect or "",
        "evolutionStage": evolution.get("stage", "") if isinstance(evolution, dict) else "",
        "nextForms": evolution.get("next", []) if isinstance(evolution, dict) else [],
        "evolutionChain": evolution.get("chain", []) if isinstance(evolution, dict) else [],
        "skillCount": len(skills) if isinstance(skills, list) else 0,
    }


def _load_presets() -> dict[str, Any]:
    presets = _load_json(PRESETS_PATH, _load_json(DEFAULT_PRESETS_PATH, {}))
    presets.setdefault("attackers", {})
    presets.setdefault("defenders", {})
    return presets


def _save_presets(presets: dict[str, Any]) -> None:
    PRESETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with PRESETS_PATH.open("w", encoding="utf-8") as file:
        json.dump(presets, file, ensure_ascii=False, indent=2)


def _load_configs() -> dict[str, Any]:
    defaults = _load_json(DEFAULT_CONFIGS_PATH, {})
    user_configs = _load_json(CONFIGS_PATH, {})
    merged = dict(defaults)
    for key, value in user_configs.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


def _save_configs(configs: dict[str, Any]) -> None:
    CONFIGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CONFIGS_PATH.open("w", encoding="utf-8") as file:
        json.dump(configs, file, ensure_ascii=False, indent=2)


def _build_default_preset_name(pet_id: str, pet_name: str) -> str:
    return f"{pet_id}{pet_name}"


def _resolve_pet_identity(query: str) -> tuple[str, str]:
    from core.find_pets import pets_dataset

    pet = pets_dataset.find((query or "").strip())
    if pet is None:
        raise ValueError(f"未找到精灵: {query}")
    return pet.get("id", ""), pet.get("name", "")


def _find_skill_detail(skill_name: str) -> dict[str, Any] | None:
    for path in _iter_json_files(SKILLS_DIR) or []:
        skills = _load_json(path, [])
        if isinstance(skills, list):
            for skill in skills:
                if skill.get("name") == skill_name:
                    return skill
    return None


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
        "power_bonus": (state.get("power_bonus", 0) or 0) + (dedication_power_stacks * 20 if has_dedication_bonus else 0) + burst_power_bonus,
        "combo_plus": (state.get("combo_plus", 0) or 0) + (dedication_combo_stacks if has_dedication_bonus else 0),
        "combo_mul": state.get("combo_mul", 1) or 1,
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


def summary() -> dict[str, Any]:
    presets = _load_presets()
    teams = _load_json(TEAMS_PATH, _load_json(DEFAULT_TEAMS_PATH, {}))
    pet_files = list(_iter_json_files(PETS_DIR) or [])
    skill_files = list(_iter_json_files(SKILLS_DIR) or [])
    return {
        "dataDir": str(DATA_DIR),
        "userDataDir": str(USER_DATA_DIR),
        "petCount": len(pet_files),
        "skillFileCount": len(skill_files),
        "presetGroups": [
            {"name": group, "count": len(value) if isinstance(value, dict) else 0}
            for group, value in presets.items()
        ],
        "teamCount": len(teams) if isinstance(teams, dict) else 0,
    }


def list_presets() -> dict[str, Any]:
    presets = _load_presets()
    groups = []
    for group, items in presets.items():
        if not isinstance(items, dict):
            continue
        groups.append(
            {
                "name": group,
                "items": [
                    {
                        "key": key,
                        "name": value.get("name", key) if isinstance(value, dict) else key,
                        "id": value.get("id", "") if isinstance(value, dict) else "",
                        "iv": value.get("iv") if isinstance(value, dict) else None,
                        "personality_bouns": value.get("personality_bouns") if isinstance(value, dict) else None,
                        "personality_down": value.get("personality_down") if isinstance(value, dict) else None,
                        "skills": value.get("skills", []) if isinstance(value, dict) else [],
                        "bloodline": value.get("bloodline") if isinstance(value, dict) else None,
                        "trait_override_query": value.get("trait_override_query") if isinstance(value, dict) else None,
                        "trait_triggered": bool(value.get("trait_triggered", False)) if isinstance(value, dict) else False,
                        "trait_stacks": int(value.get("trait_stacks", 0) or 0) if isinstance(value, dict) else 0,
                        "trait_choices": value.get("trait_choices", {}) if isinstance(value, dict) else {},
                        "devolution": int(value.get("devolution", 0) or 0) if isinstance(value, dict) else 0,
                        "mega": bool(value.get("mega", False)) if isinstance(value, dict) else False,
                        "mega_form": value.get("mega_form") if isinstance(value, dict) else None,
                        "skillCount": len(value.get("skills", [])) if isinstance(value, dict) else 0,
                    }
                    for key, value in items.items()
                ],
            }
        )
    return {"groups": groups}


def app_state() -> dict[str, Any]:
    from core.find_pets import pets_dataset

    all_pets = pets_dataset.load_all()
    pet_items = []
    for pet in sorted(all_pets, key=_pet_sort_key):
        item = _pet_summary(pet)
        item["isFinal"] = pets_dataset.is_final_form(pet)
        pet_items.append(item)
    return {
        "summary": summary(),
        "presets": list_presets()["groups"],
        "pets": pet_items,
        "elements": sorted({element for pet in all_pets for element in pet.get("elements", [])}),
        "configs": _load_configs(),
        "burstEffects": list_burst_effects()["items"],
    }


def list_pets(payload: dict[str, Any]) -> dict[str, Any]:
    from core.find_pets import pets_dataset

    query = (payload.get("query") or "").strip().lower()
    element = payload.get("element") or ""
    final_only = bool(payload.get("finalOnly", False))
    sort_desc = bool(payload.get("sortDesc", False))
    limit = int(payload.get("limit", 300) or 300)
    results = []
    for pet in sorted(pets_dataset.load_all(), key=_pet_sort_key, reverse=sort_desc):
        searchable = " ".join([pet.get("id", ""), pet.get("name", ""), _pet_label(pet)]).lower()
        if query and query not in searchable:
            continue
        if element and element not in pet.get("elements", []):
            continue
        if final_only and not pets_dataset.is_final_form(pet):
            continue
        item = _pet_summary(pet)
        item["isFinal"] = pets_dataset.is_final_form(pet)
        results.append(item)
        if len(results) >= limit:
            break
    return {"items": results}


def list_skills(payload: dict[str, Any]) -> dict[str, Any]:
    from core.find_pets import pets_dataset

    query = (payload.get("query") or "").strip().lower()
    pet_query = (payload.get("petQuery") or "").strip()
    element = payload.get("element") or ""
    by_pet = []
    if pet_query:
        pet = pets_dataset.find(pet_query)
        if pet:
            for skill in pet.get("skills", []):
                name = skill.get("skill_name", "")
                if query and query not in name.lower():
                    continue
                by_pet.append(
                    {
                        "name": name,
                        "unlock": skill.get("unlock_condition", ""),
                        "detail": _find_skill_detail(name),
                    }
                )

    all_skills = []
    for path in _iter_json_files(SKILLS_DIR) or []:
        skills = _load_json(path, [])
        if not isinstance(skills, list):
            continue
        for skill in skills:
            name = str(skill.get("name", ""))
            if query and query not in name.lower():
                continue
            if element and skill.get("element") != element:
                continue
            all_skills.append(skill)

    return {"petSkills": by_pet, "allSkills": all_skills}


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


def list_traits(payload: dict[str, Any]) -> dict[str, Any]:
    from core.find_pets import pets_dataset
    from core.trait_library import resolve_trait_summary_for_pet, trait_name_from_value

    query = (payload.get("query") or "").strip().lower()
    element = payload.get("element") or ""
    final_only = bool(payload.get("finalOnly", False))
    sort_desc = bool(payload.get("sortDesc", False))
    items = []
    for pet in sorted(pets_dataset.load_all(), key=_pet_sort_key, reverse=sort_desc):
        trait = resolve_trait_summary_for_pet(pet) or {}
        trait_name = trait.get("名称", "") or trait_name_from_value(pet.get("特性")) or ""
        if not trait_name:
            continue
        searchable = " ".join([pet.get("id", ""), pet.get("name", ""), trait_name, trait.get("效果", "")]).lower()
        if query and query not in searchable:
            continue
        if element and element not in pet.get("elements", []):
            continue
        if final_only and not pets_dataset.is_final_form(pet):
            continue
        item = {**_pet_summary(pet), "traitName": trait_name, "traitEffect": trait.get("效果", "")}
        item["isFinal"] = pets_dataset.is_final_form(pet)
        items.append(item)
    return {"items": items[:500]}


def list_burst_effects() -> dict[str, Any]:
    """List the fixed thunderstorm-panel burst sources from the data files."""
    items = []
    for skill in _load_json(SKILLS_DIR / "电系.json", []):
        triggered = skill.get("triggered") if isinstance(skill, dict) else None
        options = [triggered] if isinstance(triggered, dict) else triggered if isinstance(triggered, list) else []
        if skill.get("name") == "雷暴" or not any(option.get("mode") == "burst" for option in options if isinstance(option, dict)):
            continue
        items.append({
            "id": f"skill:{skill.get('name', '')}",
            "kind": "skill",
            "name": skill.get("name", ""),
            "cost": skill.get("cost"),
            "element": skill.get("element", ""),
            "type": skill.get("type", ""),
            "skill_power": skill.get("skill_power"),
            "description": skill.get("description", ""),
        })

    from core.trait_library import load_trait_data_by_name
    for trait_name in ("生物电", "电流刺激"):
        data = load_trait_data_by_name(trait_name) or {}
        trait = data.get("特性", {}) if isinstance(data, dict) else {}
        items.append({
            "id": f"trait:{trait_name}",
            "kind": "trait",
            "name": trait.get("名称", trait_name),
            "description": trait.get("效果", ""),
        })
    items.append({
        "id": "mark:蓄电印记",
        "kind": "mark",
        "name": "蓄电印记",
        "description": "迸发：本次威力+10。",
    })
    return {"items": items}


def calculate_battle(payload: dict[str, Any]) -> dict[str, Any]:
    from core.damresult import battle_damage

    attacker = payload.get("attacker") or {}
    defender = payload.get("defender") or {}
    weather = payload.get("weather") or "none"
    return {"results": battle_damage(**_attacker_args(attacker), **_defender_args(defender), weather=weather)}


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

    seen: set[str] = set()
    items = []
    defender_args = _defender_args(defender)
    for raw_name in skills:
        skill_name = str(raw_name or "").strip()
        if not skill_name or skill_name in seen:
            continue
        seen.add(skill_name)
        skill_data = skill_dataset.find_skill(skill_name)
        if not isinstance(skill_data, dict) or skill_data.get("type") not in {"物攻", "魔攻"}:
            continue
        attacker_args = _attacker_args({**attacker, "current_skill": skill_name})
        results = battle_damage(**attacker_args, **defender_args, weather=weather)
        items.append({
            "skillName": skill_name,
            # 技能卡显示的是计算后的威力，不是技能数据库里的原始威力。
            "displayPower": results[0].get("effective_power") if results else None,
            "results": results,
        })
    return {"items": items}


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
    attacker_data = pets_dataset.find(attacker.get("name"), devolution=attacker.get("devolution", 0), mega=attacker.get("mega", False))
    defender_data = pets_dataset.find(defender.get("name"), devolution=defender.get("devolution", 0), mega=defender.get("mega", False))
    attacker_args = _attacker_args(attacker)
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
    cache: dict[tuple[float, bool], list[dict[str, Any]]] = {}
    elements = []
    for element in WILLPOWER_ELEMENTS:
        advantage = TypeChart.calc([element], defender_data["elements"])
        has_stab = element in attacker_data["elements"]
        key = (advantage, has_stab)
        if key not in cache:
            skill_data = {"name": "愿力", "effect": "攻击", "resolved_cases": [{**case, "element": element} for case in cases]}
            cache[key] = battle_damage(**attacker_args, **_defender_args(defender), weather=weather, skill_data_override=skill_data)
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
    killer_args = _attacker_args(killer)
    # 判死表固定枚举敌方物攻/魔攻的四种天分与性格档位，不使用其当前指定值。
    killer_args["attacker_iv"] = {**(killer_args.get("attacker_iv") or {}), "atk": None, "mag": None}
    killer_args["attacker_personality_bouns"] = None
    killer_args["attacker_personality_down"] = None
    target_args = _defender_args(target)
    killer_data = pets_dataset.find(killer_args["attacker_name"], devolution=killer_args["attacker_devolution"], mega=killer_args["attacker_mega"])
    element = (killer_data.get("elements") or ["普通"])[0]
    rows = []
    for attack_type, label in (("物攻", "物攻"), ("魔攻", "魔攻")):
        skill_data = {"name": f"判死{label}", "effect": "攻击", "resolved_cases": [{"case_label": "判死", "is_triggered": False, "skill_power": 1, "type": attack_type, "element": element}]}
        results = battle_required_power(target_hp, **killer_args, **target_args, weather=weather, skill_data_override=skill_data)
        for result in results:
            rows.append({"attack_type": label, "attacker_label": result["atk_label"], "required_power": result["required_power"]})
    return {"target_hp": target_hp, "rows": rows}


def apply_skill_buffs(payload: dict[str, Any]) -> dict[str, Any]:
    from core.damresult import resolve_effective_skill_combos
    from core.skill_finder import resolve_buff_options, skill_dataset

    skill_name = (payload.get("skill_name") or payload.get("skillName") or "").strip()
    if not skill_name:
        raise ValueError("未选择技能")
    skill_data = skill_dataset.find_skill(skill_name)
    if skill_data is None:
        raise ValueError(f"未找到技能: {skill_name}")
    attacker_state = payload.get("attacker") if isinstance(payload.get("attacker"), dict) else None
    defender_state = payload.get("defender") if isinstance(payload.get("defender"), dict) else None
    weather = payload.get("weather") or "none"
    if attacker_state and defender_state:
        attacker_args = _attacker_args({**attacker_state, "current_skill": skill_name})
        defender_args = _defender_args(defender_state)
        combo_count = resolve_effective_skill_combos(
            skill_name,
            multiple=attacker_args["multiple"],
            usage_mode_choice=attacker_args["usage_mode_choice"],
            combo_plus=attacker_args["combo_plus"],
            combo_mul=attacker_args["combo_mul"],
            attacker_name=attacker_args["attacker_name"],
            attacker_devolution=attacker_args["attacker_devolution"],
            attacker_mega=attacker_args["attacker_mega"],
            attacker_trait_runtime=attacker_args["attacker_trait_runtime"],
            attacker_mark_state=attacker_args["attacker_mark_state"],
            defender_name=defender_args["defender_name"],
            defender_devolution=defender_args["defender_devolution"],
            defender_mega=defender_args["defender_mega"],
            defender_trait_runtime=defender_args["defender_trait_runtime"],
            weather=weather,
        )[0]
    else:
        combo_count = 1

    # Buff effects resolve once per hit. Combo multipliers are persistent
    # multiplier deltas, so they apply once per skill use.
    options = []
    for option in resolve_buff_options(skill_data):
        effects = [
            {**effect, "value": effect["value"] if effect["field"] == "combo_mul" else effect["value"] * combo_count}
            for effect in option["effects"]
        ]
        options.append({**option, "effects": effects})
    return {
        "skill_name": skill_name,
        "combo_count": combo_count,
        "options": options,
        "effects": options[0]["effects"] if options else [],
    }


def skill_trigger_info(payload: dict[str, Any]) -> dict[str, Any]:
    from core.skill_finder import resolve_buff_options, skill_dataset

    skill_name = (payload.get("skill_name") or payload.get("skillName") or "").strip()
    skill_data = skill_dataset.find_skill(skill_name) if skill_name else None
    triggered = skill_data.get("triggered") if skill_data else None
    options = [triggered] if isinstance(triggered, dict) else triggered if isinstance(triggered, list) else []
    labels = {
        "skill_power_plus": "威力",
        "power_multiplier": "威力%",
        "combo_plus": "连击",
        "combo_mul": "连击倍",
    }
    stackable = [
        {
            "index": index,
            "label": option.get("label") or next((labels.get(key, key) for key in option if key not in {"multiple", "condition", "override", "mode", "context", "skill_power_by_count", "label"}), "叠加"),
            "max": len(option["skill_power_by_count"]) - 1 if isinstance(option.get("skill_power_by_count"), list) and option["skill_power_by_count"] else 10,
        }
        for index, option in enumerate(options)
        if isinstance(option, dict) and (bool(option.get("multiple", False)) or bool(option.get("skill_power_by_count")))
    ]
    usage_mode_options = [
        {
            "index": index,
            "label": next((labels.get(key, key) for key in option if key not in {"multiple", "condition", "override", "mode"}), "叠加"),
        }
        for index, option in enumerate(options)
        if isinstance(option, dict) and option.get("mode") == "usage"
    ]
    return {
        "skill_name": skill_name,
        "description": skill_data.get("description", "") if skill_data else "",
        "has_damage": bool(skill_data and any(key in skill_data for key in ("skill_power", "power", "damage"))),
        "has_buff": bool(resolve_buff_options(skill_data)),
        "stackable": stackable,
        "usage_mode_options": usage_mode_options,
    }


def save_preset(payload: dict[str, Any]) -> dict[str, Any]:
    group_name = (payload.get("groupName") or "attackers").strip()
    state = payload.get("state") or {}
    overwrite = bool(payload.get("overwrite", True))
    presets = _load_presets()
    presets.setdefault(group_name, {})
    pet_id, pet_name = _resolve_pet_identity(state.get("name", ""))
    preset_key = (payload.get("presetKey") or "").strip()
    requested_name = (payload.get("presetName") or "").strip() or _build_default_preset_name(pet_id, pet_name)
    preset_name = preset_key if preset_key in presets[group_name] else requested_name
    if not overwrite and preset_name in presets[group_name]:
        raise FileExistsError(preset_name)
    data = {
        "id": pet_id,
        "name": pet_name,
        "iv": state.get("iv"),
        "personality_bouns": state.get("personality_bouns"),
        "personality_down": state.get("personality_down"),
        "skills": [skill for skill in (state.get("skills") or []) if skill],
        "bloodline": (state.get("bloodline") or "").strip() or None,
        "trait_override_query": state.get("trait_override_query"),
        "trait_triggered": bool(state.get("trait_triggered", False)),
        "trait_stacks": max(0, int(state.get("trait_stacks", 0) or 0)),
        "trait_choices": state.get("trait_choices") or {},
        "devolution": max(0, int(state.get("devolution", 0) or 0)),
        "mega": bool(state.get("mega", False)),
        "mega_form": state.get("mega_form") or None,
    }
    presets[group_name][preset_name] = data
    _save_presets(presets)
    return {"presets": list_presets()["groups"], "presetName": preset_name, "preset": data}


def _copy_preset_data(data: Any) -> Any:
    return json.loads(json.dumps(data, ensure_ascii=False))


def _next_preset_name(items: dict[str, Any], base_name: str) -> str:
    if base_name not in items:
        return base_name
    index = 2
    while f"{base_name} 副本{index}" in items:
        index += 1
    return f"{base_name} 副本{index}"


def manage_preset(payload: dict[str, Any]) -> dict[str, Any]:
    action = (payload.get("action") or "").strip()
    group_name = (payload.get("groupName") or "").strip()
    preset_key = (payload.get("presetKey") or "").strip()
    target_group = (payload.get("targetGroup") or "").strip()
    target_name = (payload.get("targetName") or "").strip()
    presets = _load_presets()
    result_group = group_name
    result_name = preset_key

    if action == "create_group":
        if not group_name:
            raise ValueError("分组名不能为空")
        presets.setdefault(group_name, {})
        result_group = group_name
        result_name = ""
    elif action in {"delete_preset", "copy_preset", "move_preset"}:
        if not group_name or group_name not in presets or not isinstance(presets[group_name], dict):
            raise ValueError("未找到来源分组")
        if not preset_key or preset_key not in presets[group_name]:
            raise ValueError("未找到精灵预设")

        if action == "delete_preset":
            del presets[group_name][preset_key]
        else:
            if not target_group:
                raise ValueError("目标分组不能为空")
            presets.setdefault(target_group, {})
            if not isinstance(presets[target_group], dict):
                presets[target_group] = {}
            next_name = _next_preset_name(presets[target_group], target_name or preset_key)
            presets[target_group][next_name] = _copy_preset_data(presets[group_name][preset_key])
            if action == "move_preset":
                del presets[group_name][preset_key]
            result_group = target_group
            result_name = next_name
    else:
        raise ValueError(f"未知预设操作: {action}")

    _save_presets(presets)
    return {"presets": list_presets()["groups"], "groupName": result_group, "presetName": result_name}


TEAM_CODE_MAX_PETS = 6
# 阵容码性格字母：正面/负面属性各按 生命、物攻、魔攻、物防、魔防、速度 排布。
TEAM_CODE_NATURES: dict[str, tuple[str, str]] = {
    "F": ("atk", "hp"), "C": ("atk", "mag"), "B": ("atk", "def"), "D": ("atk", "res"), "E": ("atk", "spd"),
    "K": ("def", "hp"), "G": ("def", "atk"), "H": ("def", "mag"), "I": ("def", "res"), "J": ("def", "spd"),
    "a": ("hp", "atk"), "c": ("hp", "mag"), "b": ("hp", "def"), "d": ("hp", "res"), "e": ("hp", "spd"),
    "Z": ("spd", "hp"), "V": ("spd", "atk"), "X": ("spd", "mag"), "W": ("spd", "def"), "Y": ("spd", "res"),
    "P": ("mag", "hp"), "L": ("mag", "atk"), "M": ("mag", "def"), "N": ("mag", "res"), "O": ("mag", "spd"),
    "U": ("res", "hp"), "Q": ("res", "atk"), "S": ("res", "mag"), "R": ("res", "def"), "T": ("res", "spd"),
}
# 个体值串每两位一组，第二位是属性字母，第一位是数值（B 等非 0 视作满值 10，0 表示缺省）。
TEAM_CODE_IV_STATS = {"P": "hp", "Q": "atk", "R": "mag", "S": "def", "T": "res", "U": "spd"}
TEAM_CODE_CORRECTIONS = {"B": "hp", "C": "atk", "D": "mag", "E": "def", "F": "res", "G": "spd"}
TEAM_CODE_STAT_LABELS = {"hp": "生命", "atk": "物攻", "mag": "魔攻", "def": "物防", "res": "魔防", "spd": "速度"}
TEAM_CODE_IV_ORDER = ("hp", "atk", "mag", "def", "res", "spd")


def _team_code_base_name(name: str) -> str:
    """取括号前的主体名称，避免“鸭吉吉”匹配到“鸭吉吉国王”。"""

    return re.split(r"[（(【\[]", (name or "").strip(), maxsplit=1)[0].strip()


def _team_code_strip_id(name: str) -> str:
    stripped = re.sub(r"^\d+", "", (name or "").strip()).strip()
    return stripped or (name or "").strip()


def _parse_team_code_block(text: str) -> tuple[str, list[dict[str, Any]]]:
    code = ""
    entries: list[dict[str, Any]] = []
    for raw_line in (text or "").splitlines():
        line = raw_line.strip().lstrip("#").strip()
        if not line:
            continue
        if "~~~" in line:
            if len(line) > len(code):
                code = line
            continue
        # 说明行结尾可能还跟着性格文字（如“加物防，减生命”），这里只取到技能表。
        match = re.match(r"^(?P<name>[^：:]+)[：:](?P<blood>[^、{}]*)、?\s*\{(?P<skills>[^}]*)\}", line)
        if match:
            skills = [item.strip() for item in re.split(r"[、,，]", match.group("skills")) if item.strip()]
            entries.append(
                {
                    "name": match.group("name").strip(),
                    "bloodline": match.group("blood").strip(),
                    "skills": skills,
                }
            )
    if not code:
        raise ValueError("没有找到阵容码，请粘贴游戏里复制的完整内容")
    if not entries:
        raise ValueError("没有找到精灵说明行（形如 # 音速犬：首领血脉、{灼伤、热身}）")
    return code, entries


def _parse_team_code_iv(chunk: str) -> dict[str, int]:
    iv = {stat: 0 for stat in TEAM_CODE_IV_ORDER}
    index = 0
    while index + 1 < len(chunk):
        value_char = chunk[index]
        stat = TEAM_CODE_IV_STATS.get(chunk[index + 1])
        # 个体值只有“满值(B)”和“缺省(00)”两种，出现别的字符说明这里已经是技能编码，停止解析。
        if stat is None or value_char not in {"B", "0"}:
            break
        if value_char != "0":
            iv[stat] = 10
        index += 2
    return iv


def _parse_team_code_records(code: str, count: int) -> list[dict[str, Any]]:
    records = code.split("~~~")[1:]
    if len(records) != count:
        raise ValueError(f"阵容码与精灵说明数量不一致：码内 {len(records)} 只，说明行 {count} 只")
    correction_match = re.search(r"F((?:[A-G]~)+)$", code)
    corrections = [item for item in correction_match.group(1).split("~") if item] if correction_match else []
    parsed: list[dict[str, Any]] = []
    for index, record in enumerate(records):
        parts = record.split("~")
        parsed.append(
            {
                "bloodline_letter": parts[0] if parts else "",
                "nature_letter": parts[1] if len(parts) > 1 else "",
                "iv": _parse_team_code_iv(parts[2] if len(parts) > 2 else ""),
                "correction": corrections[index * 2:index * 2 + 2],
            }
        )
    return parsed


def _team_code_personality(nature_letter: str, correction: list[str]) -> tuple[str | None, str | None, list[str]]:
    notes: list[str] = []
    nature = TEAM_CODE_NATURES.get(nature_letter)
    if nature is None:
        return None, None, [f"未识别的性格字母“{nature_letter}”，性格按未指定处理"]
    plus, minus = nature
    corrected = (list(correction) + ["A", "A"])[:2]
    applied: list[str] = []
    for position, letter in enumerate(corrected):
        stat = TEAM_CODE_CORRECTIONS.get(letter) if letter != "A" else None
        if stat is None:
            continue
        if position == 0:
            plus = stat
        else:
            minus = stat
        applied.append(("正面→" if position == 0 else "负面→") + TEAM_CODE_STAT_LABELS[stat])
    if applied:
        notes.append("性格修正：" + "、".join(applied))
    if plus == minus:
        notes.append("性格修正后正负属性相同，已忽略修正")
        plus, minus = nature
    return plus, minus, notes


def _team_code_candidate_paths(dataset: Any, query: str) -> list[str]:
    """只用内存索引列出候选文件，顺序为 编号+全名 → 全名 → 括号前主体名 → 模糊。"""

    normalized = (query or "").strip()
    stripped = _team_code_strip_id(normalized)
    base = _team_code_base_name(stripped)
    paths: list[str] = []

    def add(path: Any) -> None:
        if isinstance(path, str) and path not in paths:
            paths.append(path)

    def add_all(items: Any) -> None:
        for path in items or []:
            add(path)

    add(dataset._id_name_index.get(normalized))
    add(dataset._id_name_index.get(stripped))
    add_all(dataset._name_index.get(stripped))
    add_all(dataset._other_name_index.get(stripped))
    if base != stripped:
        add_all(dataset._name_index.get(base))
        add_all(dataset._other_name_index.get(base))
    if base:
        # 只比较括号前的主体名，避免“鸭吉吉”匹配到“鸭吉吉国王”。
        for name in sorted(name for name in dataset._name_index if _team_code_base_name(name) == base):
            add_all(dataset._name_index.get(name))
    if not paths and base:
        for name in sorted(
            name for name in dataset._name_index
            if base in _team_code_base_name(name) or _team_code_base_name(name) in base
        ):
            add_all(dataset._name_index.get(name))
    if not paths and base:
        scored = sorted(
            (
                (difflib.SequenceMatcher(a=base, b=_team_code_base_name(name)).ratio(), name)
                for name in dataset._name_index
            ),
            key=lambda item: (-item[0], item[1]),
        )
        for score, name in scored[:5]:
            if score >= 0.5:
                add_all(dataset._name_index.get(name))
    # 文件名就是“编号+全名”，按文件名排序等价于按编号、名称排序。
    return sorted(paths, key=lambda path: os.path.basename(path))


def _match_team_code_pet(
    dataset: Any,
    query: str,
    skills: list[str],
) -> tuple[dict[str, Any] | None, int, int]:
    """返回（选中的精灵, 候选数量, 技能表也符合的候选数量）。"""

    paths = _team_code_candidate_paths(dataset, query)
    first: dict[str, Any] | None = None
    matched: list[dict[str, Any]] = []
    for path in paths:
        pet = dataset.load(path)
        if not isinstance(pet, dict):
            continue
        if first is None:
            first = pet
        owned = {skill.get("skill_name") for skill in pet.get("skills", []) if isinstance(skill, dict)}
        if all(skill in owned for skill in skills):
            matched.append(pet)
    if matched:
        return matched[0], len(paths), len(matched)
    return first, len(paths), 0


def import_team_code(payload: dict[str, Any]) -> dict[str, Any]:
    from core.find_pets import pets_dataset

    mode = (payload.get("mode") or "create").strip()
    if mode not in {"create", "overwrite"}:
        raise ValueError(f"未知的导入方式: {mode}")
    group_name = (payload.get("groupName") or "").strip()
    if not group_name:
        raise ValueError("分组名不能为空")

    code, entries = _parse_team_code_block(payload.get("text") or "")
    report: list[str] = []
    records = _parse_team_code_records(code, len(entries))
    if len(entries) > TEAM_CODE_MAX_PETS:
        report.append(f"阵容码内有 {len(entries)} 只精灵，超过队伍上限，已只取前 {TEAM_CODE_MAX_PETS} 只")
        entries = entries[:TEAM_CODE_MAX_PETS]
        records = records[:TEAM_CODE_MAX_PETS]

    presets = _load_presets()
    if mode == "overwrite" and group_name not in presets:
        raise ValueError(f"未找到当前分组: {group_name}")

    items: dict[str, Any] = {}
    for entry, record in zip(entries, records):
        pet, candidate_count, matched_count = _match_team_code_pet(pets_dataset, entry["name"], entry["skills"])
        if pet is None:
            report.append(f"{entry['name']}：精灵库中没有找到，已跳过")
            continue
        pet_name = pet.get("name", "") or entry["name"]
        plus, minus, notes = _team_code_personality(record["nature_letter"], record["correction"])
        owned = {skill.get("skill_name") for skill in pet.get("skills", []) if isinstance(skill, dict)}
        missing = [skill for skill in entry["skills"] if skill not in owned]
        lines = [f"{entry['name']} → {_pet_label(pet)}"]
        if candidate_count > 1:
            if matched_count == 1:
                lines.append(f"候选形态 {candidate_count} 个，技能表唯一确定这个形态")
            elif matched_count > 1:
                lines.append(f"候选形态 {candidate_count} 个，其中 {matched_count} 个的技能表都符合，已取第一个（请自行确认形态）")
            else:
                lines.append(f"候选形态 {candidate_count} 个，技能表都对不上，已取第一个（请自行确认形态）")
        if missing:
            lines.append("技能不在该精灵技能表里：" + "、".join(missing))
        if plus and minus:
            lines.append(f"性格：加{TEAM_CODE_STAT_LABELS[plus]}、减{TEAM_CODE_STAT_LABELS[minus]}")
        lines.extend(notes)
        report.append("｜".join(lines))

        key = pet_name
        suffix = 2
        while key in items:
            key = f"{pet_name} {suffix}"
            suffix += 1
        items[key] = {
            "id": pet.get("id", ""),
            "name": pet_name,
            "iv": record["iv"],
            "personality_bouns": plus,
            "personality_down": minus,
            "skills": list(entry["skills"]),
            "bloodline": entry["bloodline"] or None,
            "trait_override_query": None,
            "trait_triggered": False,
            "trait_stacks": 0,
            "trait_choices": {},
            "devolution": 0,
            "mega": False,
            "mega_form": None,
        }

    if not items:
        raise ValueError("没有可导入的精灵，请检查阵容码内容")
    presets[group_name] = items
    _save_presets(presets)
    return {"presets": list_presets()["groups"], "groupName": group_name, "report": report}


def save_picker_config(payload: dict[str, Any]) -> dict[str, Any]:
    section = (payload.get("section") or "").strip()
    values = payload.get("values") or {}
    if section not in {"pet_picker", "trait_picker", "skill_picker", "ui_tokens", "burst_panel", "team_layout", "replay"}:
        raise ValueError(f"未知配置段: {section}")
    configs = _load_configs()
    configs.setdefault(section, {})
    configs[section].update(values)
    _save_configs(configs)
    return {"configs": configs, "section": section}


def call_core_probe() -> dict[str, Any]:
    from core.find_pets import pets_dataset

    final_forms = pets_dataset.filter_final_forms()
    return {
        "coreImportOk": True,
        "finalFormCount": len(final_forms),
        "firstFinalForm": final_forms[0].get("name", "") if final_forms else "",
    }


def is_dash_only_numeric_image(image: Any) -> bool:
    """Identify the game's two short dashes before numeric OCR can call them 2."""
    import numpy as np

    grayscale = np.asarray(image.convert("L"))
    foreground = grayscale >= 180
    height, width = foreground.shape
    seen = np.zeros_like(foreground, dtype=bool)
    bars: list[tuple[float, float]] = []
    for start_y, start_x in zip(*np.where(foreground)):
        if seen[start_y, start_x]:
            continue
        stack = [(int(start_y), int(start_x))]
        seen[start_y, start_x] = True
        pixels: list[tuple[int, int]] = []
        touches_edge = False
        while stack:
            y, x = stack.pop()
            pixels.append((y, x))
            touches_edge = touches_edge or y in (0, height - 1) or x in (0, width - 1)
            for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= next_y < height and 0 <= next_x < width and foreground[next_y, next_x] and not seen[next_y, next_x]:
                    seen[next_y, next_x] = True
                    stack.append((next_y, next_x))
        if touches_edge or len(pixels) < 20:
            continue
        ys = [pixel[0] for pixel in pixels]
        xs = [pixel[1] for pixel in pixels]
        component_width = max(xs) - min(xs) + 1
        component_height = max(ys) - min(ys) + 1
        if component_width >= 12 and component_height <= 10 and component_width / component_height >= 1.5:
            bars.append(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2))
    return any(
        8 <= abs(first_x - second_x) <= 42 and abs(first_y - second_y) <= 14
        for index, (first_x, first_y) in enumerate(bars)
        for second_x, second_y in bars[index + 1:]
    )


def recognize_image_text(payload: dict[str, Any]) -> dict[str, str]:
    image_data_url = payload.get("imageDataUrl") or ""
    mode = payload.get("mode") or "text"
    if not isinstance(image_data_url, str) or "," not in image_data_url:
        raise ValueError("OCR image must be a data URL")
    if mode not in {"power", "enemy_health", "self_health", "number", "health", "text"}:
        raise ValueError(f"Unsupported OCR mode: {mode}")

    from PIL import Image
    import numpy as np
    _, encoded = image_data_url.split(",", 1)
    image = Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")
    numeric_modes = {"power", "enemy_health", "self_health", "number", "health"}
    dash_only = mode in numeric_modes and is_dash_only_numeric_image(image)
    ocr = _ocr_engine()
    recognize_number = getattr(ocr, "recognize_number_crop", None)
    if mode in numeric_modes:
        # A numeric crop is recognized as one image when the dedicated whole-crop
        # model is installed; the detector would crop away "%" and "/" glyphs.
        text = recognize_number(image) if recognize_number is not None else None
        if text is None:
            if mode == "power":
                text = ocr.recognize_power_center(image)
            else:
                # Fallback: let the detector locate the text before recognition
                # instead of treating the entire crop as one glyph.
                lines = ocr(image, force_horizontal=True)
                text = "\n".join(line["text"] for line in lines if line.get("text"))
                if not text:
                    # Some compact, slanted game badges are rejected by the
                    # detector even though the recognizer can still read them.
                    text = ocr.recognize_without_detection(image)
    else:
        lines = ocr(image)
        text = "\n".join(line["text"] for line in lines if line.get("text"))
    raw_text = text.strip() or "-"
    if dash_only and len("".join(raw_text.split()).replace("-", "")) <= 1:
        return {"text": "-", "rawText": raw_text}
    if mode in numeric_modes:
        text = text.translate(str.maketrans({"Z": "2", "z": "2", "O": "0", "o": "0", "G": "6"}))
        text = text.replace("／", "/").replace("\\", "/")
        allowed = {
            "power": "0123456789",
            "enemy_health": "0123456789%",
            "self_health": "0123456789/",
            "number": "0123456789",
            "health": "0123456789/",
        }[mode]
        text = "".join(char for char in text if char in allowed)
    if mode in {"self_health", "health"}:
        text = normalize_health_text(text)
    return {"text": text.strip() or "-", "rawText": raw_text}


def normalize_health_text(text: str) -> str:
    match = re.fullmatch(r"(\d+)/(\d+)", text)
    if match:
        current, maximum = (int(value) for value in match.groups())
        return text if current <= maximum else ""

    # The OCR model can read the slash as 7. Only repair an unambiguous,
    # plausible split; otherwise reject it instead of displaying x7x.
    candidates: list[tuple[int, int, str]] = []
    if text.isdigit():
        center = len(text) / 2
        for index, char in enumerate(text[1:-1], start=1):
            if char != "7":
                continue
            numerator = text[:index]
            denominator = text[index + 1 :]
            if int(numerator) <= int(denominator):
                candidates.append((abs(len(numerator) - len(denominator)), int(abs(index - center) * 2), f"{numerator}/{denominator}"))
    if not candidates:
        return ""
    candidates.sort()
    return candidates[0][2] if len(candidates) == 1 or candidates[0][:2] != candidates[1][:2] else ""


class OnnxOcr:
    def __init__(self, models_dir: Path):
        import onnxruntime as ort

        self.det = ort.InferenceSession(str(models_dir / "det" / "model.onnx"), providers=["CPUExecutionProvider"])
        self.rec = ort.InferenceSession(str(models_dir / "rec" / "model.onnx"), providers=["CPUExecutionProvider"])
        self.det_input = self.det.get_inputs()[0].name
        self.rec_input = self.rec.get_inputs()[0].name
        self.characters = [line.rstrip("\r\n") for line in (models_dir / "ppocr_keys_v1.txt").read_text(encoding="utf-8").splitlines()]
        self.characters.append(" ")
        # Numeric regions can use a dedicated whole-crop model at
        # ocr-models/number/{model.onnx,charset.txt}. When the directory is
        # absent the engine falls back to the detector + PP-OCR recognition
        # path, so the model can be added, replaced or removed at any time.
        self.number_dir = Path(os.environ.get("ROCODATABASE_OCR_NUMBER_DIR") or (models_dir / "number"))
        self.number_session: Any | None = None
        self.number_input = ""
        self.number_characters: list[str] = []
        self.number_stamp: tuple[int, int, int, int] | None = None
        self._reload_number_model(force=True)

    def _reload_number_model(self, force: bool = False) -> bool:
        """Load the numeric model, reloading it when the files on disk change."""
        import onnxruntime as ort

        model_path = self.number_dir / "model.onnx"
        charset_path = self.number_dir / "charset.txt"
        if not (model_path.is_file() and charset_path.is_file()):
            self.number_session = None
            self.number_stamp = None
            return False
        try:
            model_stat = model_path.stat()
            charset_stat = charset_path.stat()
        except OSError:
            return self.number_session is not None
        stamp = (model_stat.st_mtime_ns, model_stat.st_size, charset_stat.st_mtime_ns, charset_stat.st_size)
        if not force and self.number_session is not None and stamp == self.number_stamp:
            return True
        try:
            session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
            characters = [line.rstrip("\r\n") for line in charset_path.read_text(encoding="utf-8").splitlines()]
        except Exception:
            # A broken model must not break OCR: fall back to PP-OCR.
            self.number_session = None
            self.number_stamp = None
            return False
        if not characters:
            self.number_session = None
            self.number_stamp = None
            return False
        self.number_session = session
        self.number_input = session.get_inputs()[0].name
        self.number_characters = characters
        self.number_stamp = stamp
        return True

    def recognize_number_crop(self, image: Any) -> str | None:
        """Recognize a whole numeric crop; None means no model, caller falls back."""
        import cv2
        import numpy as np

        if not self._reload_number_model():
            return None
        source = np.asarray(image)
        height, width = source.shape[:2]
        target_width = max(48, min(320, int(round(width / max(height, 1) * 48))))
        resized = cv2.resize(source, (target_width, 48), interpolation=cv2.INTER_LINEAR)
        tensor = resized.astype(np.float32) / 255.0
        tensor = (tensor - 0.5) / 0.5
        prediction = self.number_session.run(None, {self.number_input: tensor.transpose(2, 0, 1)[None]})[0][0]
        indices = prediction.argmax(axis=1)
        result = []
        previous = -1
        for index in indices:
            index = int(index)
            if index != 0 and index != previous and index - 1 < len(self.number_characters):
                result.append(self.number_characters[index - 1])
            previous = index
        return "".join(result)

    @staticmethod
    def _det_input(image: Any) -> tuple[Any, tuple[int, int, int, int]]:
        import cv2
        import numpy as np

        height, width = image.shape[:2]
        scale = min(960 / max(height, width), 1.0)
        resized_width = max(32, int(round(width * scale / 32) * 32))
        resized_height = max(32, int(round(height * scale / 32) * 32))
        resized = cv2.resize(image, (resized_width, resized_height), interpolation=cv2.INTER_LINEAR)
        tensor = resized.astype(np.float32) / 255.0
        tensor = (tensor - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array([0.229, 0.224, 0.225], dtype=np.float32)
        return tensor.transpose(2, 0, 1)[None], (height, width, resized_height, resized_width)

    @staticmethod
    def _order_box(points: Any) -> Any:
        import numpy as np

        points = np.asarray(points, dtype=np.float32)
        center = points.mean(axis=0)
        angles = np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0])
        return points[np.argsort(angles)]

    def _detect(self, image: Any) -> list[Any]:
        import cv2
        import numpy as np

        tensor, (source_height, source_width, resized_height, resized_width) = self._det_input(image)
        prediction = self.det.run(None, {self.det_input: tensor})[0][0, 0]
        mask = (prediction > 0.3).astype(np.uint8)
        contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        scale_x = source_width / prediction.shape[1]
        scale_y = source_height / prediction.shape[0]
        boxes = []
        for contour in contours[:1000]:
            area = cv2.contourArea(contour)
            if area < 3:
                continue
            score = cv2.mean(prediction, mask=cv2.drawContours(np.zeros_like(mask), [contour], -1, 1, -1))[0]
            if score < 0.6:
                continue
            rectangle = cv2.minAreaRect(contour)
            points = cv2.boxPoints(rectangle)
            points[:, 0] *= scale_x
            points[:, 1] *= scale_y
            center = points.mean(axis=0)
            points = center + (points - center) * 1.5
            points[:, 0] = np.clip(points[:, 0], 0, source_width - 1)
            points[:, 1] = np.clip(points[:, 1], 0, source_height - 1)
            points = self._order_box(points)
            if cv2.contourArea(points.astype(np.float32)) >= 3:
                boxes.append(points)
        boxes.sort(key=lambda box: (float(box[:, 1].min()), float(box[:, 0].min())))
        return boxes

    @staticmethod
    def _crop(image: Any, box: Any) -> Any:
        import cv2
        import numpy as np

        box = np.asarray(box, dtype=np.float32)
        width = max(int(np.linalg.norm(box[1] - box[0])), int(np.linalg.norm(box[2] - box[3])), 8)
        height = max(int(np.linalg.norm(box[3] - box[0])), int(np.linalg.norm(box[2] - box[1])), 8)
        target = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype=np.float32)
        return cv2.warpPerspective(image, cv2.getPerspectiveTransform(box, target), (width, height), borderMode=cv2.BORDER_REPLICATE)

    @staticmethod
    def _horizontal_crop(image: Any, box: Any) -> Any:
        import numpy as np

        box = np.asarray(box, dtype=np.float32)
        source_height, source_width = image.shape[:2]
        left = int(np.floor(box[:, 0].min()))
        top = int(np.floor(box[:, 1].min()))
        right = int(np.floor(box[:, 0].max())) + 1
        bottom = int(np.floor(box[:, 1].max())) + 1
        padding = max(4, int(round((bottom - top) * 0.25)))
        return image[
            max(0, top - padding):min(source_height, bottom + padding),
            max(0, left - padding):min(source_width, right + padding),
        ]

    def _recognize_crop(self, image: Any) -> str:
        import cv2
        import numpy as np

        height, width = image.shape[:2]
        target_width = max(48, min(320, int(round(width / max(height, 1) * 48))))
        resized = cv2.resize(image, (target_width, 48), interpolation=cv2.INTER_LINEAR)
        tensor = resized.astype(np.float32) / 255.0
        tensor = (tensor - 0.5) / 0.5
        prediction = self.rec.run(None, {self.rec_input: tensor.transpose(2, 0, 1)[None]})[0][0]
        indices = prediction.argmax(axis=1)
        result = []
        previous = -1
        for index in indices:
            index = int(index)
            if index != 0 and index != previous and index - 1 < len(self.characters):
                result.append(self.characters[index - 1])
            previous = index
        return "".join(result)

    def recognize_without_detection(self, image: Any) -> str:
        return self._recognize_crop(__import__("numpy").asarray(image))

    def recognize_power_center(self, image: Any) -> str:
        source = __import__("numpy").asarray(image)
        height, width = source.shape[:2]
        return self._recognize_crop(source[
            round(height * 0.06):round(height * 0.94),
            round(width * 0.125):round(width * 0.875),
        ])

    def __call__(self, image: Any, force_horizontal: bool = False) -> list[dict[str, str]]:
        import numpy as np

        source = np.asarray(image)
        crop = self._horizontal_crop if force_horizontal else self._crop
        return [{"text": text} for text in (self._recognize_crop(crop(source, box)) for box in self._detect(source)) if text]


def _ocr_engine():
    global ONNX_OCR_ENGINE
    if ONNX_OCR_ENGINE is None:
        ONNX_OCR_ENGINE = OnnxOcr(BASE_DIR.parent / "ocr-models")
    return ONNX_OCR_ENGINE


def recognize_images(payload: dict[str, Any]) -> dict[str, list[dict[str, str]]]:
    images = payload.get("images")
    if not isinstance(images, list):
        raise ValueError("OCR images must be a list")
    items = []
    for image in images:
        if not isinstance(image, dict):
            raise ValueError("OCR image entry must be an object")
        result = recognize_image_text(image)
        item = {"text": result["text"], "rawText": result.get("rawText", result["text"])}
        if image.get("key") in {"enemyNotice", "selfNotice"}:
            item["event"] = classify_replay_notice(result["text"])
        items.append(item)
    return {"items": items}


def classify_image_samples(payload: dict[str, Any]) -> dict[str, Any]:
    """Run the bundled RGB sprite classifier against one or more crops."""
    global IMAGE_CLASSIFIER
    import json as json_module
    import numpy as np
    import onnxruntime as ort
    from PIL import Image

    if IMAGE_CLASSIFIER is None:
        model_path = CLASSIFIER_DIR / "model.onnx"
        classes_path = CLASSIFIER_DIR / "classes.json"
        with classes_path.open("r", encoding="utf-8") as file:
            classes = json_module.load(file)
        IMAGE_CLASSIFIER = (ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"]), classes)
    session, classes = IMAGE_CLASSIFIER
    images = payload.get("images")
    if not isinstance(images, list):
        raise ValueError("Classifier images must be a list")
    results = []
    for image in images:
        _, encoded = str(image.get("imageDataUrl", "")).split(",", 1)
        source = Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGBA")
        source.thumbnail((72, 72), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
        canvas.alpha_composite(source, ((72 - source.width) // 2, (72 - source.height) // 2))
        # Keep transparent pixels black while dropping alpha for the RGB model.
        rgb_canvas = canvas.convert("RGB")
        tensor = np.asarray(rgb_canvas, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
        logits = session.run(["logits"], {"input": tensor})[0][0]
        probabilities = np.exp(logits - np.max(logits))
        probabilities /= probabilities.sum()
        indices = np.argsort(probabilities)[::-1][:6]
        results.append({
            "label": classes[int(indices[0])],
            "confidence": float(probabilities[int(indices[0])]),
            "topK": [{"label": classes[int(index)], "confidence": float(probabilities[int(index)])} for index in indices],
        })
    return {"items": results}


def _resolve_replay_skill(fragment: str) -> tuple[str, dict[str, Any] | None]:
    """Resolve partial OCR text without turning ambiguous fragments into attacks."""
    normalized = re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]", "", fragment)
    if not normalized:
        return "", None
    normalized = REPLAY_SKILL_ALIASES.get(normalized, normalized)
    override = REPLAY_SKILL_OVERRIDES.get(normalized)
    if override:
        return normalized, override
    from core.skill_finder import skill_dataset

    exact = skill_dataset.find_skill(normalized)
    if isinstance(exact, dict):
        return normalized, exact

    # A prefix/suffix often survives when the OCR detector truncates the notice.
    # A short fragment is accepted only when it identifies one skill or all
    # matching skills share the same attack type.
    contained = [
        name for name in [*skill_dataset.index, *REPLAY_SKILL_OVERRIDES]
        if len(normalized) >= 2 and normalized in name
    ]
    if contained:
        types = {
            data.get("type") for name in contained
            if isinstance((data := REPLAY_SKILL_OVERRIDES.get(name) or skill_dataset.find_skill(name)), dict)
        }
        attack_types = types & {"物攻", "魔攻"}
        if len(contained) == 1 or (len(types) == 1 and len(attack_types) == 1):
            name = min(contained, key=len)
            return name, REPLAY_SKILL_OVERRIDES.get(name) or skill_dataset.find_skill(name)

    # Handle one missing or mistaken glyph in a three-or-more-character skill.
    if len(normalized) >= 3:
        candidates = [
            name for name in [*skill_dataset.index, *REPLAY_SKILL_OVERRIDES]
            if abs(len(name) - len(normalized)) <= 2
        ]
        name = max(
            candidates,
            key=lambda candidate: difflib.SequenceMatcher(a=normalized, b=candidate).ratio(),
            default=None,
        )
        if name and difflib.SequenceMatcher(a=normalized, b=name).ratio() >= 0.66:
            return name, REPLAY_SKILL_OVERRIDES.get(name) or skill_dataset.find_skill(name)
    return normalized, None


def classify_replay_notice(text: str) -> dict[str, Any]:
    notice_text = text or ""
    compact = re.sub(r"\s+", "", notice_text)
    if "召唤" in compact:
        return {"kind": "summon"}
    if "特性" in compact:
        return {"kind": "trait"}

    # OCR may omit the trailing "出" or insert a glyph between the two. Keep
    # the use marker tolerant, then let the skill-library match decide whether
    # this is actually an attacking skill.
    matches = list(re.finditer(r"使.{0,2}?出|使出?", compact))
    after_marker = compact[matches[-1].end():] if matches else compact
    # A skill is delimited on the left by either a non-Chinese character or
    # "使出了", and on the right by a non-Chinese character. This prevents the
    # action marker from being joined into the skill name.
    delimited_skills = re.findall(r"(?:使出了?|[^\u4e00-\u9fff])([\u4e00-\u9fff]{2,})(?=[^\u4e00-\u9fff]|$)", notice_text)
    fragment = delimited_skills[-1] if delimited_skills else after_marker
    fragment = re.sub(r"^了?(?:[★☆]\d+)?", "", fragment)
    fragment = re.split(r"[！!。,.，]", fragment, maxsplit=1)[0].strip()
    try:
        skill, skill_data = _resolve_replay_skill(fragment)
    except Exception:
        skill, skill_data = fragment, None
    if not matches and skill_data is None:
        return {"kind": "none"}
    return {
        "kind": "skill",
        "skill": skill,
        "attack": bool(isinstance(skill_data, dict) and skill_data.get("type") in {"物攻", "魔攻"}),
    }


def ocr_worker() -> int:
    for line in sys.stdin:
        try:
            with contextlib.redirect_stdout(sys.stderr):
                payload = _payload_from_text(line)
                result = recognize_images(payload)
            _json_response({"ok": True, "data": result})
        except Exception as exc:
            _json_response({"ok": False, "error": str(exc)})
    return 0


def main() -> int:
    os.chdir(BASE_DIR)
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        choices=[
            "summary",
            "presets",
            "core-probe",
            "app-state",
            "list-pets",
            "list-skills",
            "trait-info",
            "list-traits",
            "list-burst-effects",
            "calculate-battle",
            "calculate-quick-skills",
            "calculate-willpower",
            "calculate-required-power",
            "apply-skill-buffs",
            "skill-trigger-info",
            "save-preset",
            "manage-preset",
            "import-team-code",
            "save-picker-config",
            "recognize-image-text",
            "classify-image-samples",
            "ocr-worker",
        ],
    )
    parser.add_argument("--payload", default="")
    parser.add_argument("--payload-stdin", action="store_true")
    args = parser.parse_args()

    if args.command == "ocr-worker":
        return ocr_worker()

    try:
        with contextlib.redirect_stdout(sys.stderr):
            payload_arg = _payload_from_text(sys.stdin.read() if args.payload_stdin else args.payload)
            if args.command == "summary":
                payload = summary()
            elif args.command == "presets":
                payload = list_presets()
            elif args.command == "core-probe":
                payload = call_core_probe()
            elif args.command == "app-state":
                payload = app_state()
            elif args.command == "list-pets":
                payload = list_pets(payload_arg)
            elif args.command == "list-skills":
                payload = list_skills(payload_arg)
            elif args.command == "trait-info":
                payload = trait_info(payload_arg)
            elif args.command == "list-traits":
                payload = list_traits(payload_arg)
            elif args.command == "list-burst-effects":
                payload = list_burst_effects()
            elif args.command == "calculate-battle":
                payload = calculate_battle(payload_arg)
            elif args.command == "calculate-quick-skills":
                payload = calculate_quick_skills(payload_arg)
            elif args.command == "calculate-willpower":
                payload = calculate_willpower(payload_arg)
            elif args.command == "calculate-required-power":
                payload = calculate_required_power(payload_arg)
            elif args.command == "apply-skill-buffs":
                payload = apply_skill_buffs(payload_arg)
            elif args.command == "skill-trigger-info":
                payload = skill_trigger_info(payload_arg)
            elif args.command == "save-preset":
                payload = save_preset(payload_arg)
            elif args.command == "manage-preset":
                payload = manage_preset(payload_arg)
            elif args.command == "import-team-code":
                payload = import_team_code(payload_arg)
            elif args.command == "recognize-image-text":
                payload = recognize_image_text(payload_arg)
            elif args.command == "classify-image-samples":
                payload = classify_image_samples(payload_arg)
            else:
                payload = save_picker_config(payload_arg)
        _json_response({"ok": True, "data": payload})
        return 0
    except Exception as exc:
        _json_response({"ok": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
