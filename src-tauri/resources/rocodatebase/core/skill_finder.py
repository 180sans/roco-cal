import json
import json
import os
import re
from typing import Any


RUNTIME_RESULT_KEYS = [
    "skill_power",
    "type",
    "element",
    "combo",
    "damage_reduction",
    "usage_time",
    "power_multiplier",
    "damage_multiplier",
    "mini_advantage",
]

RUNTIME_NUMERIC_KEYS = {
    "skill_power",
    "combo",
    "damage_reduction",
    "usage_time",
    "power_multiplier",
    "damage_multiplier",
    "mini_advantage",
}

STACKABLE_TRIGGER_KEYS = {
    "power_multiplier",
    "damage_multiplier",
}

# These are the only skill effects that have a corresponding field in the
# team's Buff panel.  Values use the same units as the panel: ``-50`` means
# ``-50%`` for percentage fields, while ``power_bonus`` is a flat power value.
BUFF_FIELDS = {
    "phys_atk_buff",
    "mag_atk_buff",
    "phys_def_buff",
    "mag_def_buff",
    "power_multiplier",
    "power_bonus",
    "combo_plus",
    "combo_mul",
}

_BUFF_FIELD_ALIASES = {
    "物攻": "phys_atk_buff",
    "物攻%": "phys_atk_buff",
    "魔攻": "mag_atk_buff",
    "魔攻%": "mag_atk_buff",
    "物防": "phys_def_buff",
    "物防%": "phys_def_buff",
    "魔防": "mag_def_buff",
    "魔防%": "mag_def_buff",
    "威力%": "power_multiplier",
    "技能威力%": "power_multiplier",
    "全技能威力%": "power_multiplier",
    "威力+": "power_bonus",
    "技能威力+": "power_bonus",
    "全技能威力+": "power_bonus",
    "连击": "combo_plus",
    "连击+": "combo_plus",
    "连击数": "combo_plus",
    "连击数+": "combo_plus",
    "连击倍": "combo_mul",
    "连击倍率": "combo_mul",
}
_BUFF_TARGET_ALIASES = {
    "自己": "self",
    "自身": "self",
    "己方": "self",
    "self": "self",
    "敌方": "opponent",
    "对方": "opponent",
    "敌人": "opponent",
    "对手": "opponent",
    "enemy": "opponent",
    "opponent": "opponent",
    "both": "both",
    "双方": "both",
}
_BUFF_VALUE_RE = re.compile(r"\s*(?:永久)?\s*([+-])\s*(\d+(?:\.\d+)?)\s*(%)?")
_BUFF_STAT_RE = re.compile(
    r"双攻和双防|双防和双攻|物攻和魔攻|魔攻和物攻|物攻和物防|物防和物攻|"
    r"魔攻和魔防|魔防和魔攻|魔攻和物防|物防和魔攻|物攻和魔防|魔防和物攻|物攻魔攻|魔攻物攻|物攻魔防|魔防物攻|魔攻魔防|魔防魔攻|物防魔攻|魔攻物防|物防魔防|魔防物防|双攻|双防|物攻|魔攻|物防|魔防"
)
_BUFF_IGNORED_CONDITION_MARKERS = (
    "应对",
    "选择",
    "若",
    "每",
    "下一次",
    "下回合",
    "本次",
    "本技能",
    "使用后",
    "期间",
    "位于",
    "当",
    "根据",
    "携带",
    "至多",
    "系别",
    "系技能",
)


class SkillRepository:
    """
    技能仓库 + 内存索引
    """

    def __init__(self, folder_path: str):
        self.folder_path = folder_path
        self.index: dict[str, dict[str, Any]] = {}
        self._built = False

    def _build_index(self):
        """扫描目录，建立 name -> skill_data 索引"""
        if not os.path.isdir(self.folder_path):
            raise FileNotFoundError(f"数据目录不存在: {self.folder_path}")

        for filename in os.listdir(self.folder_path):
            if not filename.endswith(".json"):
                continue

            filepath = os.path.join(self.folder_path, filename)
            with open(filepath, "r", encoding="utf-8") as file:
                data = json.load(file)

            if isinstance(data, list):
                for item in data:
                    name = item.get("name")
                    if name:
                        self.index[name] = item
            elif isinstance(data, dict):
                name = data.get("name")
                if name:
                    self.index[name] = data

        self._built = True

    def find_skill(self, skill_name: str) -> dict[str, Any] | None:
        """O(1) 查询技能"""
        if not self._built:
            self._build_index()
        return self.index.get(skill_name)


def _coerce_numeric(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("%"):
            return float(text[:-1]) / 100
        return float(text)
    raise TypeError(f"不支持的数值类型: {type(value)!r}")


def _normalize_buff_value(field: str, value: Any) -> float | None:
    """Normalize a library value to the units used by ``UnitState``."""
    if value is None:
        return None
    if isinstance(value, str) and value.strip().endswith("%"):
        numeric = float(value.strip()[:-1])
        if field == "combo_mul":
            return 1 + numeric / 100
        return numeric
    numeric = _coerce_numeric(value)
    if numeric is None:
        return None
    return numeric


def _normalize_buff_effect(effect: Any) -> dict[str, Any] | None:
    if not isinstance(effect, dict):
        return None

    raw_target = str(effect.get("target", "self")).strip().lower()
    target = _BUFF_TARGET_ALIASES.get(raw_target)
    if target is None:
        return None

    raw_field = str(effect.get("field", "")).strip()
    field = _BUFF_FIELD_ALIASES.get(raw_field, raw_field)
    if field not in BUFF_FIELDS:
        return None

    value = _normalize_buff_value(field, effect.get("value"))
    if value is None:
        return None
    if field == "combo_mul" and value <= 0:
        return None
    if value.is_integer():
        value = int(value)
    return {"target": target, "field": field, "value": value}


def _normalize_buff_option(option: Any, index: int) -> dict[str, Any] | None:
    if not isinstance(option, dict):
        return None
    raw_effects = option.get("effects")
    if not isinstance(raw_effects, list):
        return None
    effects = [item for raw in raw_effects if (item := _normalize_buff_effect(raw)) is not None]
    if not effects:
        return None
    label = str(option.get("label") or _buff_option_label(effects) or f"Buff 选项 {index + 1}").strip()
    return {"label": label, "effects": effects}


def _buff_option_label(effects: list[dict[str, Any]]) -> str:
    field_labels = {
        "phys_atk_buff": ("物攻", "%"),
        "mag_atk_buff": ("魔攻", "%"),
        "phys_def_buff": ("物防", "%"),
        "mag_def_buff": ("魔防", "%"),
        "power_multiplier": ("威力", "%"),
        "power_bonus": ("威力", ""),
        "combo_plus": ("连击", ""),
    }
    labels = []
    for effect in effects:
        target = {"self": "自己", "opponent": "敌方", "both": "双方"}.get(effect["target"], "")
        field = effect["field"]
        value = effect["value"]
        if field == "combo_mul":
            text = f"连击 x{value:g}"
        else:
            field_label, suffix = field_labels[field]
            text = f"{field_label} {value:+g}{suffix}"
        labels.append(f"{target}{text}")
    return " / ".join(labels)


def _description_target(clause: str) -> str | None:
    if "己方队伍" in clause or "队伍中的" in clause:
        return None
    has_self = any(token in clause for token in ("自己", "自身"))
    has_opponent = any(token in clause for token in ("敌方", "对方", "敌人"))
    if has_self and has_opponent:
        return None
    if has_opponent:
        return "opponent"
    if has_self:
        return "self"
    # A few skills use the concise form “获得全技能威力+40” without an
    # explicit subject.  In that form the caster is the implied target.
    if (
        "获得" in clause
        or "全技能威力" in clause
        or "技能威力" in clause
        or "连击数" in clause
        or re.search(r"(?:威力|连击)\s*(?:永久)?\s*[+-]\s*\d", clause)
    ):
        return "self"
    return None


def _description_effects(description: str, include_conditional: bool = False) -> list[dict[str, Any]]:
    effects: list[dict[str, Any]] = []
    conditional_tail = False
    previous_separator = ""
    parts = re.split(r"([，。；;])", description or "")
    for index in range(0, len(parts), 2):
        clause = parts[index]
        separator = parts[index + 1] if index + 1 < len(parts) else ""
        clause = clause.strip()
        if include_conditional:
            # The quick Buff control deliberately exposes stat effects even
            # when their original trigger was a choice, response, or other
            # condition.  It still excludes one-off damage modifiers and
            # element-restricted effects because the panel cannot represent
            # them as persistent unit Buffs.
            if not clause or any(marker in clause for marker in ("系别", "系技能", "至多")):
                previous_separator = separator
                continue
        else:
            if previous_separator in {"。", "；", ";"}:
                conditional_tail = False
            if not clause or conditional_tail:
                if any(marker in clause for marker in _BUFF_IGNORED_CONDITION_MARKERS):
                    conditional_tail = True
                previous_separator = separator
                continue
            if any(marker in clause for marker in _BUFF_IGNORED_CONDITION_MARKERS):
                conditional_tail = True
                previous_separator = separator
                continue
        target = _description_target(clause)
        if target is None:
            previous_separator = separator
            continue

        # Stat groups share the value after the group, e.g. “双攻和双防-40%”.
        for match in _BUFF_STAT_RE.finditer(clause):
            value_match = _BUFF_VALUE_RE.match(clause, match.end())
            if value_match is None:
                continue
            sign, number, _percent = value_match.groups()
            value = float(number) * (-1 if sign == "-" else 1)
            stat_group = match.group(0)
            if stat_group in {"双攻", "物攻和魔攻", "魔攻和物攻", "物攻魔攻", "魔攻物攻"}:
                fields = ("phys_atk_buff", "mag_atk_buff")
            elif stat_group in {"双防", "物防和魔防", "魔防和物防", "物防魔防", "魔防物防"}:
                fields = ("phys_def_buff", "mag_def_buff")
            elif stat_group in {"物攻和物防", "物防和物攻"}:
                fields = ("phys_atk_buff", "phys_def_buff")
            elif stat_group in {"物攻和魔防", "物攻魔防", "魔防物攻", "魔防和物攻"}:
                fields = ("phys_atk_buff", "mag_def_buff")
            elif stat_group in {"魔攻和物防", "物防魔攻", "魔攻物防", "物防和魔攻"}:
                fields = ("phys_def_buff", "mag_atk_buff")
            elif stat_group in {"魔攻和魔防", "魔攻魔防", "魔防魔攻"}:
                fields = ("mag_atk_buff", "mag_def_buff")
            elif stat_group in {"双攻和双防", "双防和双攻"}:
                fields = ("phys_atk_buff", "mag_atk_buff", "phys_def_buff", "mag_def_buff")
            elif stat_group == "物攻":
                fields = ("phys_atk_buff",)
            elif stat_group == "魔攻":
                fields = ("mag_atk_buff",)
            elif stat_group == "物防":
                fields = ("phys_def_buff",)
            else:
                fields = ("mag_def_buff",)
            effects.extend({"target": target, "field": field, "value": value} for field in fields)

        # The panel is a unit Buff panel, so one-off modifiers for "本次技能"
        # or "本技能" must never be exposed as persistent Buffs.  Only an
        # explicit "全技能威力" modifier affects the whole unit.
        for match in re.finditer(r"(?:全技能威力|技能威力)\s*(?:永久)?\s*([+-])\s*(\d+(?:\.\d+)?)\s*(%)?", clause):
            if "本次" in clause or "本技能" in clause:
                continue
            sign, number, percent = match.groups()
            value = float(number) * (-1 if sign == "-" else 1)
            field = "power_multiplier" if percent else "power_bonus"
            effects.append({"target": target, "field": field, "value": value})

        if "本次" not in clause and "本技能" not in clause and ("全技能威力翻倍" in clause or "全技能威力永久翻倍" in clause):
            effects.append({"target": "self", "field": "power_multiplier", "value": 100})
        for match in re.finditer(r"(?:全技能威力|技能威力)(?:变为|变成)\s*(\d+(?:\.\d+)?)倍", clause):
            if "本次" in clause or "本技能" in clause:
                continue
            multiplier = float(match.group(1))
            if multiplier > 0:
                effects.append({"target": "self", "field": "power_multiplier", "value": (multiplier - 1) * 100})

        for match in re.finditer(r"获得连击数\s*([+-])\s*(\d+(?:\.\d+)?)\s*(%)?", clause):
            sign, number, percent = match.groups()
            value = float(number) * (-1 if sign == "-" else 1)
            if percent:
                effects.append({"target": target, "field": "combo_mul", "value": 1 + value / 100})
            else:
                effects.append({"target": target, "field": "combo_plus", "value": value})
        previous_separator = separator

    normalized = []
    seen: set[tuple[str, str, float]] = set()
    for effect in effects:
        item = _normalize_buff_effect(effect)
        if item is None:
            continue
        key = (item["target"], item["field"], float(item["value"]))
        if key in seen:
            continue
        seen.add(key)
        normalized.append(item)
    return normalized


def resolve_buff_effects(skill_data: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Return the panel-visible Buff effects for one skill.

    ``buff_effects`` is the preferred data format.  Older entries without the
    field are parsed conservatively from their description so the existing
    library remains usable while new skills can state the target explicitly.
    """
    options = resolve_buff_options(skill_data)
    return options[0]["effects"] if options else []


def resolve_buff_options(skill_data: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Return selectable Buff options for a skill.

    A ``buff_options`` entry represents choices and conditional effects that
    cannot be inferred safely from prose.  ``buff_effects`` and legacy text
    are exposed as one default option for the quick-apply control.
    """
    if not isinstance(skill_data, dict):
        return []
    if "buff_options" in skill_data:
        raw_options = skill_data.get("buff_options")
        if not isinstance(raw_options, list):
            return []
        return [item for index, raw in enumerate(raw_options) if (item := _normalize_buff_option(raw, index)) is not None]

    if "buff_effects" in skill_data:
        raw_effects = skill_data.get("buff_effects")
        if not isinstance(raw_effects, list):
            return []
        effects = [item for raw in raw_effects if (item := _normalize_buff_effect(raw)) is not None]
    else:
        effects = _description_effects(str(skill_data.get("description") or ""), include_conditional=True)
    return [{"label": _buff_option_label(effects), "effects": effects}] if effects else []


def _normalize_runtime_value(key: str, value: Any) -> Any:
    canonical_key = "usage_time" if key == "usage" else key
    numeric_key = canonical_key
    if canonical_key.endswith("_plus"):
        numeric_key = canonical_key[:-5]
    elif canonical_key.endswith("_mul"):
        numeric_key = canonical_key[:-4]

    if numeric_key not in RUNTIME_NUMERIC_KEYS:
        return value

    numeric = _coerce_numeric(value)
    if numeric is None:
        return None
    if numeric_key in {"skill_power", "combo", "usage_time"} and numeric.is_integer():
        return int(numeric)
    return numeric


def resolve_skill(
    skill_data: dict[str, Any],
    multiple: int | list[int] = 0,
    use_override: bool = False,
    usage_mode_choice: int | None = None,
) -> list[dict[str, Any]]:
    """
    根据技能原始数据，计算并返回基础情况与触发情况。
    """
    base = {}
    for key in RUNTIME_RESULT_KEYS:
        if key == "usage_time":
            value = skill_data.get("usage_time", skill_data.get("usage"))
        else:
            value = skill_data.get(key)
        base[key] = _normalize_runtime_value(key, value)

    triggered = skill_data.get("triggered")
    if isinstance(triggered, dict):
        triggered_options = [(0, triggered)]
    elif isinstance(triggered, list):
        triggered_options = [
            (index, option) for index, option in enumerate(triggered) if isinstance(option, dict)
        ]
    else:
        return [base]

    multiples = multiple if isinstance(multiple, list) else [multiple]

    def has_runtime_effect(effective: dict[str, Any]) -> bool:
        """Return whether a trigger changes a value used by battle calculation."""
        for trig_key in effective:
            if trig_key in {"multiple", "condition", "mode", "override"}:
                continue
            canonical_key = "usage_time" if trig_key == "usage" else trig_key
            target_key = canonical_key.removesuffix("_plus").removesuffix("_mul")
            if target_key in RUNTIME_RESULT_KEYS:
                return True
        return False

    def apply_effects(case: dict[str, Any], effective: dict[str, Any], times: int) -> dict[str, Any]:
        result = dict(case)
        for trig_key, trig_value in effective.items():
            if trig_key in {"multiple", "condition", "mode"}:
                continue

            canonical_key = "usage_time" if trig_key == "usage" else trig_key
            value = _normalize_runtime_value(canonical_key, trig_value)
            if canonical_key.endswith("_plus"):
                target_key = canonical_key[:-5]
                base_value = result.get(target_key, 0) or 0
                result[target_key] = base_value + value * times
            elif canonical_key.endswith("_mul"):
                target_key = canonical_key[:-4]
                base_value = result.get(target_key, 0) or 0
                result[target_key] = base_value * (value ** times)
            elif canonical_key in STACKABLE_TRIGGER_KEYS and bool(effective.get("multiple", False)):
                result[canonical_key] = value * times
            else:
                result[canonical_key] = value
        return result

    stacked_case = dict(base)
    trigger_options = []
    usage_mode_options = []
    has_stacks = False
    stacked_modes = []
    for option_index, triggered_option in triggered_options:
        if use_override and isinstance(triggered_option.get("override"), dict):
            effective = {key: value for key, value in triggered_option.items() if key != "override"}
            for key, value in triggered_option["override"].items():
                if key != "condition":
                    effective[key] = value
        else:
            effective = {key: value for key, value in triggered_option.items() if key != "override"}

        # Some records only mark a trigger mode (for example, a cost change that
        # is not modeled by the calculator). Do not add an identical trigger case.
        if not has_runtime_effect(effective):
            continue

        if effective.get("mode") == "usage":
            usage_mode_options.append((option_index, effective))

        is_multiple = bool(effective.get("multiple", False))
        times = max(0, int(multiples[option_index] if option_index < len(multiples) else 0)) if is_multiple else 1
        if is_multiple:
            has_stacks = True
            stacked_case = apply_effects(stacked_case, effective, times)
            if times > 0 and isinstance(effective.get("mode"), str):
                stacked_modes.append(effective["mode"])
        else:
            trigger_options.append(effective)

    if usage_mode_options:
        # A list of usage-mode effects represents mutually exclusive growth paths
        # (for example, Trial Flight). A single effect has no choice to make.
        selected_options = usage_mode_options
        if len(usage_mode_options) > 1:
            selected_index = usage_mode_choice if usage_mode_choice is not None else usage_mode_options[0][0]
            selected_options = [
                item for item in usage_mode_options if item[0] == selected_index
            ] or [usage_mode_options[0]]
        stacked_case["_usage_mode_effects"] = [effect for _, effect in selected_options]

    if stacked_modes:
        stacked_case["_trigger_modes"] = stacked_modes

    if not trigger_options:
        return [stacked_case]

    non_trigger_case = stacked_case if has_stacks else base
    triggered_cases = []
    for trigger_index, effective in enumerate(trigger_options):
        triggered_case = apply_effects(non_trigger_case, effective, 1)
        if isinstance(effective.get("mode"), str):
            triggered_case["_trigger_modes"] = [effective["mode"]]
        triggered_case["trigger_label"] = (
            "触发情况" if len(trigger_options) == 1 else f"触发情况{trigger_index + 1}"
        )
        triggered_cases.append(triggered_case)
    return [non_trigger_case, *triggered_cases]


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
skill_dir = os.path.join(BASE_DIR, "data", "skills_database")
skill_dataset = SkillRepository(skill_dir)
