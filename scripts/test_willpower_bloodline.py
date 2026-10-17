"""Bloodline filters must preserve the existing willpower calculation results."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src-tauri/resources/rocodatebase"))
import desktop_api as api
from core.will_power import WILLPOWER_ELEMENTS


class WillpowerBloodlineTests(unittest.TestCase):
    def setUp(self):
        self.damage_calls = []

        def damage(**kwargs):
            self.damage_calls.append(kwargs)
            return [{"effective_power": case["skill_power"], "element": case["element"]}
                    for case in kwargs["skill_data_override"]["resolved_cases"]]

        self.modules = {
            "core.calshuxing": SimpleNamespace(calc_attr=lambda attr, value, iv, **kw: value),
            "core.damresult": SimpleNamespace(battle_damage=damage, parse_personality=lambda *a: {}, get_personality_bonus_for_attr=lambda *a: 0),
            "core.ele_advantage": SimpleNamespace(TypeChart=SimpleNamespace(calc=lambda elements, target: 0.5 if elements[0] == "电" else 1)),
            "core.find_pets": SimpleNamespace(pets_dataset=SimpleNamespace(find=lambda *a, **kw: {"atk": 80, "mag": 100, "elements": ["电"]})),
        }
        self.contexts = [patch.dict(sys.modules, self.modules), patch.object(api, "_attacker_args", lambda s: {}), patch.object(api, "_defender_args", lambda s: {})]
        for context in self.contexts:
            context.start()
            self.addCleanup(context.stop)

    def calculate(self, bloodline, restrict=True):
        return api.calculate_willpower({"attacker": {"name": "我方", "bloodline": bloodline}, "defender": {"name": "敌方"}, "restrict_to_bloodline": restrict})

    def test_only_corresponding_element_for_each_bloodline(self):
        for element in WILLPOWER_ELEMENTS:
            with self.subTest(element=element):
                result = self.calculate(f"{element}系血脉")
                self.assertEqual([item["element"] for item in result["elements"]], [element])
                self.assertEqual(result["attack_type"], "mag")
                self.assertEqual(result["elements"][0]["results"], [{"effective_power": power, "element": element} for power in (80, 200)])

    def test_missing_bloodline_keeps_all_eighteen(self):
        for bloodline in (None, "", "  "):
            self.assertEqual([item["element"] for item in self.calculate(bloodline)["elements"]], list(WILLPOWER_ELEMENTS))

    def test_non_element_bloodlines_rejected_before_damage(self):
        for bloodline in ("首领血脉", "未知血脉"):
            with self.assertRaisesRegex(ValueError, "无法使用愿力"):
                self.calculate(bloodline)
        self.assertEqual(self.damage_calls, [])

    def test_enemy_attack_keeps_all_eighteen(self):
        for bloodline in ("电系血脉", "首领血脉", None):
            self.assertEqual([item["element"] for item in self.calculate(bloodline, False)["elements"]], list(WILLPOWER_ELEMENTS))


if __name__ == "__main__":
    unittest.main()
