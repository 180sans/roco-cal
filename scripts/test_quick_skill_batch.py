"""The batch wrapper must preserve single-request calculation results and order."""
import copy
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src-tauri/resources/rocodatebase"))
import desktop_api as api


class QuickSkillBatchTests(unittest.TestCase):
    def test_preserves_each_original_calculation(self):
        requests = [{"attacker": {"name": "我方", "count": count, "power_bonus": 12}, "defender": {"name": "敌方"}, "skills": ["攻击", "攻击", "状态"], "weather": "rain"} for count in range(11)]
        original = copy.deepcopy(requests)
        modules = {
            "core.damresult": SimpleNamespace(battle_damage=lambda **kw: [{"effective_power": 50 + kw["count"] * 20, "weather": kw["weather"]}]),
            "core.skill_finder": SimpleNamespace(skill_dataset=SimpleNamespace(find_skill=lambda name: {"type": "物攻" if name == "攻击" else "状态"})),
        }
        with patch.dict(sys.modules, modules), patch.object(api, "_attacker_args", lambda s: {"count": s["count"]}), patch.object(api, "_defender_args", lambda s: {}):
            expected = [api.calculate_quick_skills(request) for request in requests]
            self.assertEqual(api.calculate_quick_skills_batch({"requests": requests}), {"items": expected})
        self.assertEqual(requests, original)

    def test_empty_batch(self):
        self.assertEqual(api.calculate_quick_skills_batch({"requests": []}), {"items": []})

    def test_invalid_batch(self):
        for requests in (None, {}, "bad"):
            with self.subTest(requests=requests), self.assertRaises(ValueError):
                api.calculate_quick_skills_batch({"requests": requests})


if __name__ == "__main__":
    unittest.main()
