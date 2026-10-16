"""Use the real power calculation with small fixtures; no OCR or local databases required."""

import copy
import importlib.util
import sys
import unittest
from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1] / "src-tauri" / "resources" / "rocodatebase"
sys.path.insert(0, str(ROOT))
import desktop_api as api
from core import skill_finder, will_power
from core.trait_runtime import empty_trait_runtime, resolve_trait_runtime


class TraitAlignmentTests(unittest.TestCase):
    def setUp(self):
        self.skills = {
            "物理": {"type": "物攻", "element": "光", "skill_power": 50},
            "魔法": {"type": "魔攻", "element": "光", "skill_power": 50},
            "状态": {"type": "状态"},
        }
        unit = {"elements": ["普通"], "hp": 100, "atk": 100, "mag": 100, "def": 100, "res": 100, "spd": 100}
        pets = SimpleNamespace(find=lambda *args, **kwargs: unit)
        self.context = ExitStack()
        self.addCleanup(self.context.close)
        self.context.enter_context(patch.dict(sys.modules, {"core.find_pets": SimpleNamespace(pets_dataset=pets)}))
        spec = importlib.util.spec_from_file_location("alignment_damage", ROOT / "core" / "damresult.py")
        damage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(damage)
        self.context.enter_context(patch.dict(sys.modules, {"core.damresult": damage}))
        self.context.enter_context(patch.object(skill_finder.skill_dataset, "find_skill", self.skills.get))
        self.context.enter_context(patch.object(will_power, "mark_effects", lambda: []))
        self.context.enter_context(patch.object(will_power, "weather_effects", lambda: []))
        self.effects = []
        self.stackable = True

        def runtime(state):
            if state.get("name") != "我方":
                return empty_trait_runtime()
            trait = {"特性": {"名称": "测试特性", "battle_effect": {
                "affects_battle": True,
                "effect_groups": [{"stack": {"enabled": self.stackable}, "effects": self.effects}],
            }}}
            return resolve_trait_runtime(trait, stacks=state.get("trait_stacks", 0))

        self.context.enter_context(patch.object(api, "_unit_trait_runtime", runtime))
        self.payload = {
            "attacker": {"name": "我方", "skills": ["状态", "物理", "", "魔法"], "trait_stacks": 7, "skill_trigger_stacks": {"物理": [2]}, "power_bonus": 0, "phys_atk_buff": 0},
            "defender": {"name": "敌方"},
            "weather": "none",
        }

    def candidates(self):
        original = copy.deepcopy(self.payload)
        result = api.trait_power_candidates(self.payload)
        self.assertEqual(self.payload, original)
        self.assertEqual(len(result["candidates"]), 100)
        return result

    def test_attack_stats_and_power_modifiers_change_displayed_power(self):
        effects = [
            {"kind": "stat_buff", "stats": ["atk"], "value_per_stack": 0.2, "target": "self"},
            {"kind": "stat_buff", "stats": ["mag"], "value_per_stack": 0.2, "target": "self"},
            {"kind": "power_bonus", "value_per_stack": 20, "target": "self"},
            {"kind": "power_multiplier", "value_per_stack": 0.2, "target": "self"},
            {"kind": "stat_buff", "stats": ["def", "res"], "value_per_stack": -0.1, "target": "opponent"},
        ]
        for effect in effects:
            with self.subTest(effect=effect):
                self.effects = [effect]
                result = self.candidates()
                index = 3 if effect.get("stats") == ["mag"] else 1
                self.assertIn(index, result["affectedSkills"])
                self.assertEqual(result["candidates"][0]["powers"][index], [50])
                self.assertGreater(result["candidates"][1]["powers"][index][0], 50)
                self.assertEqual(result["candidates"][1]["powers"][0], [])
                self.assertEqual(result["candidates"][1]["powers"][2], [])

    def test_indirect_element_conversion_is_detected(self):
        self.effects = [{"kind": "skill_element", "value": "普通", "target": "self"}]
        result = self.candidates()
        self.assertEqual(result["affectedSkills"], [1, 3])
        self.assertEqual(result["candidates"][1]["powers"][1], [62])

    def test_non_stacking_skill_priority_uses_capability_not_current_count(self):
        self.effects = [{"kind": "power_bonus", "value_per_stack": 20, "target": "self"}]
        self.assertEqual(self.candidates()["nonStackingSkills"], [1, 3])
        self.payload["attacker"]["skill_trigger_stacks"] = {"物理": [0]}
        self.skills["物理"]["triggered"] = {"multiple": True, "skill_power_plus": 10}
        self.assertEqual(self.candidates()["nonStackingSkills"], [3])
        self.skills["魔法"]["triggered"] = [{"skill_power_by_count": [50, 60, 70]}]
        self.assertEqual(self.candidates()["nonStackingSkills"], [])

    def test_non_power_effects_are_rejected(self):
        for effect in [
            {"kind": "stat_buff", "stats": ["spd"], "value_per_stack": 0.2, "target": "self"},
            {"kind": "stat_buff", "stats": ["def", "res"], "value_per_stack": 0.2, "target": "self"},
            {"kind": "damage_reduction", "value_per_stack": 0.01, "target": "self"},
            {"kind": "combo_plus", "value_per_stack": 1, "target": "self"},
        ]:
            with self.subTest(effect=effect):
                self.effects = [effect]
                with self.assertRaisesRegex(ValueError, "不影响"):
                    api.trait_power_candidates(self.payload)

    def test_skill_filters_and_existing_buffs_are_preserved(self):
        self.effects = [{"kind": "power_bonus", "value_per_stack": 20, "target": "self", "filters": {"skill_types": ["物攻"]}}]
        self.payload["attacker"].update(power_bonus=10, phys_atk_buff=20)
        result = self.candidates()
        self.assertEqual(result["affectedSkills"], [1])
        self.assertEqual(result["candidates"][0]["powers"][1], [72])
        self.assertEqual(result["candidates"][1]["powers"][1], [96])
        self.assertEqual(result["candidates"][1]["powers"][3], [60])

    def test_non_stackable_trait_is_rejected(self):
        self.stackable = False
        with self.assertRaisesRegex(ValueError, "没有可修正的叠层"):
            api.trait_power_candidates(self.payload)

    def test_decreasing_power_and_rounding_are_kept_for_exact_matching(self):
        self.effects = [{"kind": "stat_buff", "stats": ["atk"], "value_per_stack": -0.2, "target": "self"}]
        result = self.candidates()
        self.assertEqual(result["candidates"][0]["powers"][1], [50])
        self.assertEqual(result["candidates"][1]["powers"][1], [41])
        self.assertEqual(result["candidates"][-1]["stacks"], 99)

    def test_usage_count_can_indirectly_change_last_displayed_power(self):
        self.effects = [{"kind": "usage_time_plus", "value_per_stack": 1, "target": "self"}]
        self.skills["物理"]["resolved_cases"] = [{
            "type": "物攻", "element": "光", "skill_power": 50,
            "_usage_mode_effects": [{"skill_power_plus": 10}],
        }]
        result = self.candidates()
        self.assertEqual(result["affectedSkills"], [1])
        self.assertEqual(result["candidates"][1]["powers"][1], [60])


if __name__ == "__main__":
    unittest.main()
