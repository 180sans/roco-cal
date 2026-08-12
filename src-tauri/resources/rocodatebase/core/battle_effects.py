import json
from functools import lru_cache
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "battle_effects"


@lru_cache(maxsize=None)
def _load_category(name: str) -> list[dict[str, Any]]:
    path = DATA_DIR / f"{name}.json"
    try:
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        return []
    items = data.get("items", []) if isinstance(data, dict) else []
    return [item for item in items if isinstance(item, dict)]


def weather_effects() -> list[dict[str, Any]]:
    return _load_category("weather")


def mark_effects() -> list[dict[str, Any]]:
    return _load_category("marks")


def manual_mark_modes(state: dict[str, Any]) -> set[str]:
    modes = set()
    for mark in mark_effects():
        enabled_field = mark.get("enabled_field")
        if not isinstance(enabled_field, str) or not bool(state.get(enabled_field, False)):
            continue
        for condition in mark.get("conditions", []):
            if isinstance(condition, dict) and isinstance(condition.get("mode"), str):
                modes.add(condition["mode"])
    return modes


def weather_power_multipliers(weather_id: str, skill_element: str) -> list[float]:
    weather = next((item for item in weather_effects() if item.get("id") == weather_id), None)
    if weather is None:
        return []
    values = []
    for effect in weather.get("effects", []):
        if not isinstance(effect, dict) or effect.get("kind") != "power_multiplier":
            continue
        filters = effect.get("filters", {})
        elements = filters.get("skill_elements", []) if isinstance(filters, dict) else []
        if elements and skill_element not in elements:
            continue
        try:
            values.append(float(effect.get("value", 0)))
        except (TypeError, ValueError):
            continue
    return values


def resolve_mark_modifiers(
    state: dict[str, Any],
    skill_name: str,
    *,
    manual_modes: set[str],
    active_skill_modes: set[str],
    skill_trigger_modes: set[str],
) -> dict[str, Any]:
    result = {"power_bonus": 0, "power_multipliers": [], "combo_plus": 0, "combo_mul_delta": 0}
    for mark in mark_effects():
        conditions = mark.get("conditions", [])
        if isinstance(conditions, list):
            modes = {
                condition.get("mode")
                for condition in conditions
                if isinstance(condition, dict) and isinstance(condition.get("mode"), str)
            }
            if modes and not any(
                mode in manual_modes
                and (mode not in skill_trigger_modes or mode in active_skill_modes)
                for mode in modes
            ):
                continue
        stack_field = mark.get("stack_field")
        if not isinstance(stack_field, str):
            continue
        enabled_field = mark.get("enabled_field")
        if not modes and isinstance(enabled_field, str) and not bool(state.get(enabled_field, False)):
            continue
        try:
            stacks = max(0, int(state.get(stack_field, 0) or 0))
        except (TypeError, ValueError):
            continue
        for effect in mark.get("effects", []):
            if not isinstance(effect, dict):
                continue
            filters = effect.get("filters", {})
            names = filters.get("skill_names", []) if isinstance(filters, dict) else []
            if names and skill_name not in names:
                continue
            try:
                value = float(effect.get("value_per_stack", 0)) * stacks
            except (TypeError, ValueError):
                continue
            if value == 0:
                continue
            if effect.get("kind") == "power_bonus":
                result["power_bonus"] += value
            elif effect.get("kind") == "power_multiplier":
                result["power_multipliers"].append(value)
            elif effect.get("kind") == "combo_plus":
                result["combo_plus"] += value
            elif effect.get("kind") == "combo_mul":
                result["combo_mul_delta"] += value
    return result
