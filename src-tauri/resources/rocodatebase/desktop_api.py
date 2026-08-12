import argparse
import contextlib
import json
import os
import sys
from pathlib import Path
from typing import Any


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

API_STDOUT = sys.stdout

BASE_DIR = Path(__file__).resolve().parent
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
    from core.skill_finder import skill_dataset

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


def save_picker_config(payload: dict[str, Any]) -> dict[str, Any]:
    section = (payload.get("section") or "").strip()
    values = payload.get("values") or {}
    if section not in {"pet_picker", "trait_picker", "skill_picker", "ui_tokens", "burst_panel"}:
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
            "apply-skill-buffs",
            "skill-trigger-info",
            "save-preset",
            "manage-preset",
            "save-picker-config",
        ],
    )
    parser.add_argument("--payload", default="")
    args = parser.parse_args()

    try:
        with contextlib.redirect_stdout(sys.stderr):
            payload_arg = _payload_from_text(args.payload)
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
            elif args.command == "apply-skill-buffs":
                payload = apply_skill_buffs(payload_arg)
            elif args.command == "skill-trigger-info":
                payload = skill_trigger_info(payload_arg)
            elif args.command == "save-preset":
                payload = save_preset(payload_arg)
            elif args.command == "manage-preset":
                payload = manage_preset(payload_arg)
            else:
                payload = save_picker_config(payload_arg)
        _json_response({"ok": True, "data": payload})
        return 0
    except Exception as exc:
        _json_response({"ok": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
