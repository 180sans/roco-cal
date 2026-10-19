"""Regress fixed-combo traits without loading the local pet/skill databases."""

import copy
import importlib.util
import sys
import unittest
from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1] / "src-tauri/resources/rocodatebase"
sys.path.insert(0, str(ROOT))
import desktop_api as api
from core import skill_finder, will_power
from core.trait_runtime import empty_trait_runtime, resolve_trait_runtime


def combo_filter(name, count):
    return resolve_trait_runtime({"特性": {"名称": name, "battle_effect": {
        "affects_battle": True,
        "effect_groups": [{
            "mode": "combo_fix", "passive": True,
            "stack": {"enabled": False},
            "effects": [{"kind": "combo", "target": "all", "value": count}],
        }],
    }}})


class ComboFilterTests(unittest.TestCase):
    def setUp(self):
        unit = {"elements": ["草", "冰"], "hp": 100, "atk": 68,
                "mag": 100, "def": 100, "res": 100, "spd": 100}
        pets = {"我方": unit, "敌方": {**unit, "elements": ["地", "翼"], "def": 109}}
        self.skills = {
            "冰雹": {"name": "冰雹", "type": "物攻", "element": "冰", "skill_power": 105},
        }
        self.skills["三连击"] = {**self.skills["冰雹"], "name": "三连击", "combo": 3}
        self.skills["条件连击"] = {**self.skills["冰雹"], "name": "条件连击", "triggered": {"combo": 3}}
        self.context = ExitStack()
        self.addCleanup(self.context.close)
        self.context.enter_context(patch.dict(sys.modules, {"core.find_pets": SimpleNamespace(
            pets_dataset=SimpleNamespace(find=lambda name, **kwargs: pets[name]),
        )}))
        spec = importlib.util.spec_from_file_location("combo_filter_damage", ROOT / "core/damresult.py")
        self.damage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.damage)
        self.context.enter_context(patch.dict(sys.modules, {"core.damresult": self.damage}))
        self.context.enter_context(patch.object(skill_finder.skill_dataset, "find_skill", self.skills.get))
        self.marks = []
        self.context.enter_context(patch.object(will_power, "mark_effects", lambda: self.marks))
        self.context.enter_context(patch.object(will_power, "weather_effects", lambda: []))
        self.runtimes = {}
        self.context.enter_context(patch.object(api, "_unit_trait_runtime", lambda state:
            self.runtimes.get(state.get("name"), empty_trait_runtime())))
        self.filter_two = combo_filter("无差别过滤", 2)
        self.filter_one = combo_filter("强制过滤", 1)

    def args(self):
        return {
            "attacker_name": "我方", "defender_name": "敌方",
            "attacker_trait_runtime": self.runtimes.get("我方"),
            "defender_trait_runtime": self.runtimes.get("敌方"),
        }

    def assert_combos(self, skill, counts, **kwargs):
        args = {**self.args(), **kwargs}
        self.assertEqual(self.damage.resolve_effective_skill_combos(skill, **args), counts)
        rows = self.damage.battle_damage(skill, **args)
        self.assertEqual(set(row["combo"] or 1 for row in rows), set(counts))
        return rows

    def test_reported_single_hit_damage_through_api_and_quick_skills(self):
        payload = {"attacker": {"name": "我方", "current_skill": "冰雹", "skills": ["冰雹"]},
                   "defender": {"name": "敌方"}}
        original = copy.deepcopy(payload)
        baseline = api.calculate_battle(payload)["results"]
        for owner in ("我方", "敌方"):
            with self.subTest(owner=owner):
                self.runtimes = {owner: self.filter_two}
                rows = api.calculate_battle(payload)["results"]
                self.assertEqual(rows, baseline)
                self.assertEqual(api.calculate_quick_skills(payload)["items"][0]["results"], baseline)
                attack_plus = [row for row in rows if row["atk_value"] == 168]
                self.assertEqual({row["def_value"]: row["damage"] for row in attack_plus},
                                 {213: 280, 180: 331, 167: 357})
                self.assertTrue(all(row["combo"] is None and row["damage_info"] is None for row in rows))
                self.assert_combos("冰雹", [1])
        self.assertEqual(payload, original)

    def test_existing_combo_and_fixed_one_are_preserved(self):
        self.assert_combos("三连击", [3])
        for owner in ("我方", "敌方"):
            for trait, count in ((self.filter_two, 2), (self.filter_one, 1)):
                with self.subTest(owner=owner, count=count):
                    self.runtimes = {owner: trait}
                    self.assert_combos("三连击", [count])
                    self.assert_combos("冰雹", [1])

    def test_fixed_two_keeps_priority_over_fixed_one(self):
        for first, second in ((self.filter_one, self.filter_two), (self.filter_two, self.filter_one)):
            self.runtimes = {"我方": first, "敌方": second}
            self.assert_combos("三连击", [2])
            self.assert_combos("冰雹", [1])

    def test_manual_combo_buffs_keep_existing_rules(self):
        for buff in ({"combo_plus": 2}, {"combo_mul": 3}):
            with self.subTest(buff=buff):
                self.runtimes = {}
                self.assert_combos("冰雹", [3], **buff)
                self.runtimes = {"敌方": self.filter_two}
                self.assert_combos("冰雹", [2], **buff)
                self.runtimes["敌方"] = self.filter_one
                self.assert_combos("冰雹", [1], **buff)

    def test_trait_combo_buffs_keep_existing_rules(self):
        for kind in ("combo_plus", "combo_mul"):
            self.runtimes = {"我方": {"active": True, "resolved_effects": [
                {"kind": kind, "target": "self", "value": 2},
            ]}}
            self.assert_combos("冰雹", [3])
            self.runtimes["敌方"] = self.filter_two
            self.assert_combos("冰雹", [2])

    def test_mark_combo_buffs_keep_existing_rules(self):
        for kind in ("combo_plus", "combo_mul"):
            self.marks = [{"stack_field": "test_stacks", "effects": [
                {"kind": kind, "value_per_stack": 1},
            ]}]
            kwargs = {"attacker_mark_state": {"test_stacks": 2}}
            self.runtimes = {}
            self.assert_combos("冰雹", [3], **kwargs)
            self.runtimes["敌方"] = self.filter_two
            self.assert_combos("冰雹", [2], **kwargs)

    def test_skill_trigger_is_checked_for_each_case(self):
        self.assert_combos("条件连击", [1, 3])
        self.runtimes["敌方"] = self.filter_two
        self.assert_combos("条件连击", [1, 2])

    def test_repeated_uses_do_not_enable_combo(self):
        baseline = self.damage.battle_damage("冰雹", **self.args(), usage_time_plus=2)
        self.runtimes["敌方"] = self.filter_two
        rows = self.damage.battle_damage("冰雹", **self.args(), usage_time_plus=2)
        self.assertEqual(rows, baseline)
        self.assertTrue(all(row["combo"] is None and row["usage_time"] == 3 for row in rows))


if __name__ == "__main__":
    unittest.main()
