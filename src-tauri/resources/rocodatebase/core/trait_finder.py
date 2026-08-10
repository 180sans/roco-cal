import json
import os
from copy import deepcopy
from typing import Any

from core.find_pets import pets_dataset
from core.trait_library import resolve_trait_data_for_pet


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
trait_dir = os.path.join(BASE_DIR, "data", "pets_trait_json")


def _build_trait_filename(pet_data: dict[str, Any]) -> str | None:
    pet_id = pet_data.get("id")
    pet_name = pet_data.get("name")
    if not pet_id or not pet_name:
        return None
    return f"{pet_id}{pet_name}.json"


def _load_trait_data_for_pet(pet_data: dict[str, Any]) -> dict[str, Any] | None:
    trait_data = resolve_trait_data_for_pet(pet_data)
    if trait_data:
        return trait_data

    filename = _build_trait_filename(pet_data)
    if filename:
        filepath = os.path.join(trait_dir, filename)
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as file:
                return json.load(file)

    trait_summary = pet_data.get("特性")
    if isinstance(trait_summary, dict):
        return {"特性": deepcopy(trait_summary)}
    return None


def _get_battle_effect(trait_data: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(trait_data, dict):
        return {}
    trait = trait_data.get("特性")
    if not isinstance(trait, dict):
        return {}
    battle_effect = trait.get("battle_effect")
    return battle_effect if isinstance(battle_effect, dict) else {}


def _has_battle_effect(trait_data: dict[str, Any] | None) -> bool:
    battle_effect = _get_battle_effect(trait_data)
    effect_groups = battle_effect.get("effect_groups")
    return isinstance(effect_groups, list) and any(
        isinstance(group, dict)
        and isinstance(group.get("effects"), list)
        and bool(group["effects"])
        for group in effect_groups
    )


def _should_replace_with_mega_trait(
    base_trait_data: dict[str, Any] | None,
    mega_trait_data: dict[str, Any] | None,
) -> bool:
    base_has_battle_effect = _has_battle_effect(base_trait_data)
    mega_has_battle_effect = _has_battle_effect(mega_trait_data)
    return not base_has_battle_effect or mega_has_battle_effect


def _find_mega_target(pet_data: dict[str, Any]) -> dict[str, Any] | None:
    evolution = pet_data.get("evolution", {})
    if evolution.get("stage") == "mega":
        return pet_data

    for next_id_name in evolution.get("next", []):
        if not next_id_name:
            continue
        next_pet = pets_dataset.find(next_id_name)
        if next_pet and next_pet.get("evolution", {}).get("stage") == "mega":
            return next_pet
    return None


def _build_pet_label(pet_data: dict[str, Any] | None) -> str:
    if not isinstance(pet_data, dict):
        return ""
    pet_id = pet_data.get("id", "")
    pet_name = pet_data.get("name", "")
    return f"{pet_id}{pet_name}" if pet_id or pet_name else ""


def _attach_trait_source(
    trait_data: dict[str, Any] | None,
    *,
    requested_pet: dict[str, Any],
    source_pet: dict[str, Any],
    mega_target: dict[str, Any] | None,
    mega_enabled: bool,
    replaced_by_mega: bool,
) -> dict[str, Any] | None:
    if trait_data is None:
        return None

    result = deepcopy(trait_data)
    result["_trait_source"] = {
        "requested_label": _build_pet_label(requested_pet),
        "source_label": _build_pet_label(source_pet),
        "mega_target_label": _build_pet_label(mega_target),
        "mega_enabled": mega_enabled,
        "mega_available": mega_target is not None,
        "replaced_by_mega": replaced_by_mega,
    }
    return result


def find_trait(
    query: str | None,
    devolution: int = 0,
    mega: bool = False,
    mega_target_query: str | None = None,
) -> dict[str, Any] | None:
    if not query:
        return None

    # Trait lookup follows the currently selected pet and optional mega replacement.
    # Devolution intentionally does not change trait source.
    requested_pet = pets_dataset.find(query)
    if requested_pet is None:
        return None

    mega_target = None
    if mega:
        if mega_target_query:
            candidate = pets_dataset.find(mega_target_query)
            if candidate and candidate.get("evolution", {}).get("stage") == "mega":
                mega_target = candidate
        else:
            mega_target = _find_mega_target(requested_pet)
    source_pet = requested_pet
    trait_data = _load_trait_data_for_pet(requested_pet)
    replaced_by_mega = False

    if mega_target is not None:
        mega_trait_data = _load_trait_data_for_pet(mega_target)
        if mega_trait_data and _should_replace_with_mega_trait(trait_data, mega_trait_data):
            source_pet = mega_target
            trait_data = mega_trait_data
            replaced_by_mega = True

    return _attach_trait_source(
        trait_data,
        requested_pet=requested_pet,
        source_pet=source_pet,
        mega_target=mega_target,
        mega_enabled=mega,
        replaced_by_mega=replaced_by_mega,
    )
