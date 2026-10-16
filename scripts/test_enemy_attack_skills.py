"""Ctrl+K 伤害档位筛选回归检查，不依赖本地精灵数据库。"""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src-tauri" / "resources" / "rocodatebase"))
import desktop_api as api


class EnemyAttackSkillSelectionTests(unittest.TestCase):
    def calculate(self, skills, selected_skill=None):
        skill_data = {skill["name"]: {"type": "物攻", "element": "普通"} for skill in skills}
        results = {}
        for skill in skills:
            cases = [(False, skill["power"], skill["damage"])]
            if "trigger_damage" in skill:
                cases.append((True, skill["trigger_power"], skill["trigger_damage"]))
            results[skill["name"]] = [
                {
                    "atk_label": label,
                    "effective_power": power,
                    "damage": damage * factor,
                    "is_triggered": triggered,
                    "case_label": "触发情况" if triggered else "基础情况",
                }
                for triggered, power, damage in cases
                for label, factor in [("加天分加性格", 1.2), ("加天分", 1.1), ("正常", 1), ("减性格", 0.9)]
            ]
        modules = {
            "core.damresult": SimpleNamespace(
                battle_damage=lambda skill_name, **kwargs: results[skill_name],
                get_personality_bonus_for_attr=lambda *args: 0,
                parse_personality=lambda *args: {},
            ),
            "core.find_pets": SimpleNamespace(pets_dataset=SimpleNamespace(find=lambda *args, **kwargs: {"skills": list(skill_data)})),
            "core.skill_finder": SimpleNamespace(skill_dataset=SimpleNamespace(find_skill=skill_data.get)),
        }
        payload = {"attacker": {}, "defender": {}, "target_hp": 0}
        if selected_skill:
            payload["skill_name"] = selected_skill
        with patch.dict(sys.modules, modules), patch.object(api, "_attacker_args", lambda state: {"skill_name": state["current_skill"]}), patch.object(api, "_defender_args", lambda state: {}):
            return api.calculate_enemy_attack_skills(payload)

    def test_dense_low_damage_skills_do_not_hide_ground_effective_power_160(self):
        # 旧的按数量取样会得到 18、55、80、255，漏掉克制后的 160。
        powers = [18, 20, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 80, 80, 80, 87, 100, 105, 110, 115, 160, 255]
        skills = [{"name": f"技能{index:02}", "power": power, "damage": power * 2} for index, power in enumerate(powers)]
        skills[-1].update(power=85, damage=170, trigger_power=255, trigger_damage=510)
        group = self.calculate(skills)["groups"][0]
        self.assertEqual(len(group["skills"]), 4)
        cells = group["rows"][0]["skills"]
        self.assertEqual([cell["skillPower"] for cell in cells], [18, 100, 160, 255])
        self.assertTrue(cells[-1]["triggered"])
        # 技能库顺序变化不会改变选出的伤害档。
        self.assertEqual(self.calculate(list(reversed(skills)))["groups"][0], group)

    def test_selects_by_final_damage_instead_of_skill_power(self):
        skills = [{"name": f"技能{index}", "power": power, "damage": index * 20} for index, power in enumerate([1000, 1, 999, 2, 3, 4])]
        group = self.calculate(skills)["groups"][0]
        self.assertEqual(group["skills"], ["技能0", "技能2", "技能3", "技能5"])

    def test_four_or_fewer_skills_keep_all_original_results(self):
        skills = [{"name": f"技能{power}", "power": power, "damage": power * 2} for power in [80, 18, 160, 55]]
        group = self.calculate(skills)["groups"][0]
        self.assertEqual([cell["skillPower"] for cell in group["rows"][0]["skills"]], [18, 55, 80, 160])
        self.assertEqual(self.calculate([])["groups"], [])

    def test_manual_skill_keeps_both_trigger_cases(self):
        skills = [{"name": "自选技能", "power": 80, "damage": 160, "trigger_power": 160, "trigger_damage": 320}]
        group = self.calculate(skills, "自选技能")["groups"][0]
        self.assertEqual(group["skills"], ["自选技能"])
        for row in group["rows"]:
            variants = row["skills"][0]["variants"]
            self.assertEqual([variant["triggered"] for variant in variants], [False, True])
            self.assertEqual([variant["skillPower"] for variant in variants], [80, 160])


if __name__ == "__main__":
    unittest.main()
