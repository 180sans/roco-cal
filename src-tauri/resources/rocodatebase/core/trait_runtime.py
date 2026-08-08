from __future__ import annotations

from typing import Any


def empty_trait_runtime(name: str = "", effect_text: str = "") -> dict[str, Any]:
    return {
        "name": name,
        "effect_text": effect_text,
        "affects_battle": False,
        "template": "ignored",
        "stackable": False,
        "permanent": False,
        "triggered": False,
        "stacks": 0,
        "active": False,
        "resolved_effects": [],
        "conditions": [],
        "exclusive_choices": {},
        "note": None,
    }


def _resolve_effect_value(effect: dict[str, Any], count: int, stackable: bool) -> float | int | None:
    if count <= 0:
        return None
    if "value_per_stack" in effect:
        return effect["value_per_stack"] * count
    if "value" not in effect:
        return None
    value = effect["value"]
    return value * count if stackable else value


def _resolve_group_effects(group: dict[str, Any], count: int) -> list[dict[str, Any]]:
    resolved_effects = []
    for effect in group.get("effects", []):
        if not isinstance(effect, dict):
            continue
        base_effect = {key: value for key, value in effect.items() if key not in {"value", "values", "values_per_stack"}}
        if isinstance(group.get("context"), dict):
            base_effect["context"] = group["context"]
        values_per_stack = effect.get("values_per_stack")
        values = values_per_stack if isinstance(values_per_stack, dict) else effect.get("values")
        if isinstance(values, dict):
            for stat, value in values.items():
                if not isinstance(value, (int, float)):
                    continue
                resolved_value = value * count if isinstance(values_per_stack, dict) else value
                resolved_effect = {**base_effect, "stats": [stat], "value": resolved_value}
                resolved_effects.append(resolved_effect)
            continue

        value_per_stack = effect.get("value_per_stack")
        if isinstance(value_per_stack, (int, float)):
            resolved_effects.append({**base_effect, "value": value_per_stack * count})
            continue

        value = effect.get("value")
        if effect.get("kind") == "skill_element" and isinstance(value, str):
            resolved_effects.append({**base_effect, "value": value})
            continue
        if not isinstance(value, (int, float)):
            continue
        resolved_effects.append({**base_effect, "value": value * count if count > 0 else value})
    return resolved_effects


def _resolve_group_runtime(
    name: str,
    effect_text: str,
    battle_effect: dict[str, Any],
    *,
    triggered: bool,
    stacks: int,
    choices: dict[str, str] | None,
) -> dict[str, Any]:
    groups = [group for group in battle_effect.get("effect_groups", []) if isinstance(group, dict)]
    affects_battle = bool(battle_effect.get("affects_battle", False))
    if not affects_battle or not groups:
        return empty_trait_runtime(name=name, effect_text=effect_text)

    normalized_stacks = max(int(stacks or 0), 0)
    choices = choices if isinstance(choices, dict) else {}
    exclusive_choices = {}
    for group in groups:
        group_name = group.get("exclusive_group")
        mode = group.get("mode")
        if not isinstance(group_name, str) or not isinstance(mode, str):
            continue
        entry = exclusive_choices.setdefault(group_name, {"options": [], "selected": ""})
        entry["options"].append(mode)
    for group_name, entry in exclusive_choices.items():
        selected = choices.get(group_name)
        entry["selected"] = selected if selected in entry["options"] else entry["options"][0]
    stack_input = any(group.get("stack", {}).get("enabled") is True for group in groups if isinstance(group.get("stack"), dict))
    triggerable = any(
        group.get("passive") is not True
        and isinstance(group.get("stack"), dict)
        and group["stack"].get("enabled") is False
        for group in groups
    )
    resolved_effects = []
    conditions = []
    for group in groups:
        group_name = group.get("exclusive_group")
        if isinstance(group_name, str) and group.get("mode") != exclusive_choices[group_name]["selected"]:
            continue
        stack = group.get("stack") if isinstance(group.get("stack"), dict) else {}
        is_stack = stack.get("enabled") is True
        is_passive = group.get("passive") is True
        is_trigger = not is_stack and not is_passive and stack.get("enabled") is False
        if is_stack:
            count = normalized_stacks
        elif is_passive or (is_trigger and triggered):
            count = 1
        else:
            continue
        if is_stack and count == 0:
            continue
        resolved_effects.extend(_resolve_group_effects(group, count))
        if is_trigger and isinstance(group.get("mode"), str):
            conditions.append({"mode": group["mode"]})

    template = "generic_stack" if stack_input else "special_condition" if triggerable else "passive"
    return {
        "name": name,
        "effect_text": effect_text,
        "affects_battle": True,
        "template": template,
        "stackable": stack_input,
        "stack_input": stack_input,
        "triggerable": triggerable,
        "permanent": any(bool(group.get("stack", {}).get("permanent", False)) for group in groups if isinstance(group.get("stack"), dict)),
        "triggered": bool(triggered),
        "stacks": normalized_stacks if stack_input else 0,
        "active": bool(resolved_effects),
        "mode_available": triggerable,
        "resolved_effects": resolved_effects,
        "conditions": conditions,
        "exclusive_choices": exclusive_choices,
        "note": battle_effect.get("note"),
    }


def resolve_trait_runtime(
    trait_data: dict[str, Any] | None,
    *,
    triggered: bool = False,
    stacks: int = 0,
    choices: dict[str, str] | None = None,
) -> dict[str, Any]:
    if not trait_data:
        return empty_trait_runtime()

    trait = trait_data.get("特性", {})
    name = trait.get("名称", "")
    effect_text = trait.get("效果", "")
    battle_effect = trait.get("battle_effect")

    if not isinstance(battle_effect, dict):
        return empty_trait_runtime(name=name, effect_text=effect_text)

    if isinstance(battle_effect.get("effect_groups"), list):
        return _resolve_group_runtime(
            name,
            effect_text,
            battle_effect,
            triggered=triggered,
            stacks=stacks,
            choices=choices,
        )

    stackable = bool(battle_effect.get("stackable", False))
    affects_battle = bool(battle_effect.get("affects_battle", False))
    template = battle_effect.get("template", "ignored")
    permanent = bool(battle_effect.get("permanent", False))
    note = battle_effect.get("note")
    conditions = battle_effect.get("conditions", [])
    # `conditions` on stack templates describe how stacks are acquired; they
    # are not a manual condition toggle for the trait's effect.
    has_mode_condition = template == "special_condition" and isinstance(conditions, list) and any(
        isinstance(condition, dict) and isinstance(condition.get("mode"), str)
        for condition in conditions
    )

    if not affects_battle:
        runtime = empty_trait_runtime(name=name, effect_text=effect_text)
        runtime["note"] = note
        return runtime

    normalized_stacks = max(int(stacks or 0), 0)
    if stackable:
        active = normalized_stacks > 0
        effect_count = normalized_stacks
    else:
        active = bool(triggered)
        # Keep mode-bound effects ready for a matching condition group even
        # when this trait's own manual toggle has not been pressed.
        effect_count = 1 if active or has_mode_condition else 0
        normalized_stacks = effect_count

    resolved_effects = []
    for effect in battle_effect.get("effects", []):
        value = _resolve_effect_value(effect, effect_count, stackable)
        if value is None:
            continue

        resolved_effect = {k: v for k, v in effect.items() if k not in {"value", "value_per_stack"}}
        resolved_effect["value"] = value
        resolved_effects.append(resolved_effect)

    return {
        "name": name,
        "effect_text": effect_text,
        "affects_battle": affects_battle,
        "template": template,
        "stackable": stackable,
        "stack_input": stackable,
        "triggerable": template == "special_condition",
        "permanent": permanent,
        "triggered": bool(triggered),
        "stacks": normalized_stacks,
        "active": active and bool(resolved_effects),
        "mode_available": has_mode_condition,
        "resolved_effects": resolved_effects,
        "conditions": conditions,
        "exclusive_choices": {},
        "note": note,
    }
