"""Exercise element-specific power buffs through the real calculation entry points."""
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
from core.trait_runtime import empty_trait_runtime


class LightPowerBuffTests(unittest.TestCase):
    def setUp(self):
        self.skills = {
            "光物攻": {"name": "光物攻", "type": "物攻", "element": "光", "skill_power": 80},
            "光魔攻": {"name": "光魔攻", "type": "魔攻", "element": "光", "skill_power": 80},
            "火魔攻": {"name": "火魔攻", "type": "魔攻", "element": "火", "skill_power": 80},
        }
        unit = {"elements": ["普通"], "hp": 100, "atk": 100, "mag": 100, "def": 100, "res": 100, "spd": 100}
        self.context = ExitStack()
        self.addCleanup(self.context.close)
        self.context.enter_context(patch.dict(sys.modules, {"core.find_pets": SimpleNamespace(pets_dataset=SimpleNamespace(find=lambda *a, **kw: unit))}))
        spec = importlib.util.spec_from_file_location("light_buff_damage", ROOT / "core/damresult.py")
        damage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(damage)
        self.context.enter_context(patch.dict(sys.modules, {"core.damresult": damage}))
        self.context.enter_context(patch.object(skill_finder.skill_dataset, "find_skill", self.skills.get))
        self.context.enter_context(patch.object(will_power, "mark_effects", lambda: []))
        self.context.enter_context(patch.object(will_power, "weather_effects", lambda: []))
        self.convert = None
        self.context.enter_context(patch.object(api, "_unit_trait_runtime", lambda state: {"resolved_effects": [{"kind": "skill_element", "value": self.convert, "target": "self"}]} if self.convert and state.get("name") == "我方" else empty_trait_runtime()))
        self.payload = {"attacker": {"name": "我方", "skills": list(self.skills), "light_power_buff": 50}, "defender": {"name": "敌方"}, "weather": "none"}

    def powers(self):
        return {item["skillName"]: set(result["effective_power"] for result in item["results"]) for item in api.calculate_quick_skills(self.payload)["items"]}

    def test_only_light_skills_receive_bonus(self):
        self.assertEqual(self.powers(), {"光物攻": {120}, "光魔攻": {120}, "火魔攻": {80}})
        self.payload["attacker"]["light_power_buff"] = 0
        self.assertEqual(self.powers(), {name: {80} for name in self.skills})

    def test_stacks_with_existing_power_modifiers(self):
        self.payload["attacker"].update(power_multiplier=20, power_bonus=10)
        self.assertEqual(self.powers(), {"光物攻": {153}, "光魔攻": {153}, "火魔攻": {108}})

    def test_repeated_application_and_ten_percent_increment(self):
        self.payload["attacker"]["light_power_buff"] = 100
        self.assertEqual(self.powers()["光魔攻"], {160})
        self.payload["attacker"]["light_power_buff"] = 10
        self.assertEqual(self.powers()["光魔攻"], {88})

    def test_final_element_after_trait_conversion(self):
        self.convert = "光"
        self.assertTrue(all(powers == {120} for powers in self.powers().values()))
        self.convert = "火"
        self.assertTrue(all(powers == {80} for powers in self.powers().values()))

    def test_willpower_cache_does_not_share_light_bonus(self):
        original = copy.deepcopy(self.payload)
        active = api.calculate_willpower(self.payload)
        self.assertEqual(self.payload, original)
        self.payload["attacker"]["light_power_buff"] = 0
        baseline = api.calculate_willpower(self.payload)
        for item, previous in zip(active["elements"], baseline["elements"]):
            if item["element"] == "光":
                self.assertEqual({result["effective_power"] for result in item["results"]}, {120, 300})
            else:
                self.assertEqual(item, previous)


if __name__ == "__main__":
    unittest.main()
