import json
import os
from copy import deepcopy
from functools import lru_cache
from typing import Any


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRAIT_DIR = os.path.join(BASE_DIR, "data", "pets_trait_json")


def _load_json(filepath: str) -> dict[str, Any] | None:
    try:
        with open(filepath, "r", encoding="utf-8-sig") as file:
            data = json.load(file)
    except (json.JSONDecodeError, OSError):
        return None
    return data if isinstance(data, dict) else None


def trait_name_from_value(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return str(value.get("名称", "") or "").strip()
    return ""


@lru_cache(maxsize=None)
def _load_trait_data_by_name_cached(trait_name: str) -> dict[str, Any] | None:
    if not trait_name:
        return None

    filepath = os.path.join(TRAIT_DIR, f"{trait_name}.json")
    if os.path.isfile(filepath):
        data = _load_json(filepath)
        if data and isinstance(data.get("特性"), dict):
            return data

    return _scan_trait_data_by_name(trait_name)


def _scan_trait_data_by_name(trait_name: str) -> dict[str, Any] | None:
    if not os.path.isdir(TRAIT_DIR):
        return None

    for root, _, filenames in os.walk(TRAIT_DIR):
        for filename in filenames:
            if not filename.endswith(".json"):
                continue
            filepath = os.path.join(root, filename)
            data = _load_json(filepath)
            if not data:
                continue
            trait = data.get("特性")
            if isinstance(trait, dict) and trait.get("名称") == trait_name:
                return data
    return None


def load_trait_data_by_name(trait_name: str) -> dict[str, Any] | None:
    trait_data = _load_trait_data_by_name_cached((trait_name or "").strip())
    return deepcopy(trait_data) if trait_data else None


def resolve_trait_data_for_pet(pet_data: dict[str, Any]) -> dict[str, Any] | None:
    raw_trait = pet_data.get("特性")
    if isinstance(raw_trait, dict):
        return {"特性": deepcopy(raw_trait)}

    trait_name = trait_name_from_value(raw_trait)
    return load_trait_data_by_name(trait_name)


def resolve_trait_summary_for_pet(pet_data: dict[str, Any]) -> dict[str, Any] | None:
    trait_data = resolve_trait_data_for_pet(pet_data)
    if not trait_data:
        return None

    trait = trait_data.get("特性")
    return trait if isinstance(trait, dict) else None
