"""首领技能继承、独立技能组清理及检查工具的定向测试。"""

import json
import contextlib
import io
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / "src-tauri/resources/rocodatebase"
sys.path[:0] = [str(ROOT), str(PROJECT / "tools")]
import desktop_api as api
import delete_mega_skills as cleanup
from check_mega_skills import check_skills

finder_module = types.ModuleType("mega_test_finder")
finder_module.__file__ = str(ROOT / "core/find_pets.py")
source = Path(finder_module.__file__).read_text(encoding="utf-8")
exec(compile(source.replace("pets_dataset = SpiritFinder(data_dir=data_dir)", "pets_dataset = None"),
             finder_module.__file__, "exec"), finder_module.__dict__)


class MegaSkillInheritanceTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.data = self.root / "pets"
        self.data.mkdir()
        self.backups = self.root / "backups"
        self.skills = [{"skill_name": "抓挠", "unlock_condition": "默认"},
                       {"skill_name": "斩断", "unlock_condition": "技能石"}]
        self.save("原形态", skills=self.skills, next=["004首领甲", "004首领乙"], prev=["003前形态"])
        self.save("首领甲", stage="mega", skills=[{"skill_name": "旧错误技能"}], prev=["004原形态"])
        self.save("首领乙", stage="mega", prev=["004原形态"])
        self.save("同编号异形", skills=[{"skill_name": "异形技能"}])
        self.finder = finder_module.SpiritFinder(str(self.data))

    def save(self, name, stage=3, **kwargs):
        skills = kwargs.pop("skills", None)
        record = {"id": "004", "name": name, "elements": ["草"], "atk": 100,
                  "特性": {"名称": name + "特性"}, "evolution": {"stage": stage, **kwargs}}
        if skills is not None:
            record["skills"] = skills
        path = self.data / f"004{name}.json"
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return path

    def snapshots(self):
        return {path.name: path.read_bytes() for path in self.data.glob("*.json")}

    def test_all_python_read_paths_inherit_without_changing_form_or_files(self):
        before = self.snapshots()
        for name in ("首领甲", "首领乙"):
            key = "004" + name
            for pet in (self.finder.find(key), self.finder.find(name),
                        self.finder.load(self.data / f"{key}.json"),
                        self.finder._load_by_filepath(self.data / f"{key}.json"),
                        self.finder._load_by_id_name(key), self.finder._find_base_spirit(name)):
                self.assertEqual(pet["skills"], self.skills)
                self.assertEqual(pet["name"], name)
                self.assertEqual(pet["特性"]["名称"], name + "特性")
        self.assertEqual(self.finder.find("004原形态", mega=True)["skills"], self.skills)
        self.assertEqual(self.finder.find("004首领乙", devolution=1)["name"], "原形态")
        all_pets = self.finder.load_all()
        self.assertTrue(all(p["skills"] == self.skills for p in all_pets if p["evolution"]["stage"] == "mega"))
        self.assertEqual(before, self.snapshots())
        mutated = self.finder.find("004首领乙")
        mutated["skills"][0]["skill_name"] = "修改副本"
        self.assertEqual(self.finder.find("004原形态")["skills"], self.skills)
        self.assertEqual(self.finder.find("004首领乙")["skills"], self.skills)

    def test_api_skill_picker_counts_and_team_code_matching_use_inherited_skills(self):
        module = types.SimpleNamespace(pets_dataset=self.finder)
        with patch.dict(sys.modules, {"core.find_pets": module}), \
                patch.object(api, "_find_skill_detail", lambda name: {"name": name}), \
                patch.object(api, "_iter_json_files", lambda path: []):
            result = api.list_skills({"petQuery": "004首领乙"})
            self.assertEqual([s["name"] for s in result["petSkills"]], ["抓挠", "斩断"])
            self.assertEqual(result["petSkills"][1]["unlock"], "技能石")
            items = api.list_pets({"query": "首领"})["items"]
            self.assertEqual(len(items), 2)
            self.assertTrue(all(p["skillCount"] == 2 for p in items))
            pet, _, matches = api._match_team_code_pet(self.finder, "首领乙", ["斩断"])
            self.assertEqual(pet["name"], "首领乙")
            self.assertEqual(matches, 1)

    def test_source_skill_updates_are_inherited(self):
        self.finder.find("004首领甲")
        updated = self.skills + [{"skill_name": "新技能"}]
        self.save("原形态", skills=updated)
        self.assertEqual(self.finder.find("004首领甲")["skills"], updated)
        self.assertEqual(self.finder.find("004首领乙")["skills"], updated)

    def test_missing_and_cyclic_sources_are_reported(self):
        self.save("首领甲", stage="mega", prev=["004不存在"])
        with self.assertRaisesRegex(ValueError, "找不到原形态"):
            self.finder.find("004首领甲")
        self.save("首领甲", stage="mega", prev=["004首领乙"])
        self.save("首领乙", stage="mega", prev=["004首领甲"])
        with self.assertRaisesRegex(ValueError, "循环"):
            self.finder.find("004首领甲")

    def test_cleanup_preview_backup_apply_and_idempotence(self):
        before = self.snapshots()
        preview = cleanup.delete_skills(self.data, self.backups)
        self.assertEqual((preview["pending"], preview["changed"]), (1, 0))
        self.assertEqual(before, self.snapshots())
        self.assertFalse(self.backups.exists())
        result = cleanup.delete_skills(self.data, self.backups, apply=True)
        self.assertEqual(result["changed"], 1)
        with ZipFile(result["backup"]) as archive:
            self.assertEqual(archive.read("004首领甲.json"), before["004首领甲.json"])
        after = self.snapshots()
        for name, content in before.items():
            if name == "004首领甲.json":
                expected = json.loads(content)
                del expected["skills"]
                self.assertEqual(json.loads(after[name]), expected)
            else:
                self.assertEqual(after[name], content)
        again = cleanup.delete_skills(self.data, self.backups, apply=True)
        self.assertEqual(again["changed"], 0)
        self.assertIsNone(again["backup"])
        self.assertEqual(check_skills(self.data)["summary"]["inherited"], 2)
        self.assertEqual(self.finder.find("004首领甲")["skills"], self.skills)

    def test_cleanup_invalid_source_leaves_all_files_untouched(self):
        self.save("首领乙", stage="mega", prev=["004不存在"])
        before = self.snapshots()
        with self.assertRaisesRegex(ValueError, "找不到原精灵"):
            cleanup.delete_skills(self.data, self.backups, apply=True)
        self.assertEqual(before, self.snapshots())
        self.assertFalse(self.backups.exists())

    def test_cleanup_rolls_back_after_write_failure(self):
        self.save("首领乙", stage="mega", prev=["004原形态"], skills=self.skills)
        before = self.snapshots()
        original_write = cleanup.atomic_write
        calls = 0

        def fail_second(path, content):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("模拟写入失败")
            original_write(path, content)

        with patch.object(cleanup, "atomic_write", fail_second), self.assertRaisesRegex(ValueError, "均已回滚"):
            cleanup.delete_skills(self.data, self.backups, apply=True)
        self.assertEqual(before, self.snapshots())
        self.assertEqual(len(list(self.backups.glob("*.zip"))), 1)

    def test_skill_import_does_not_recreate_mega_skills(self):
        input_dir, output_dir = self.root / "skill-input", self.root / "output"
        input_dir.mkdir()
        for name in ("004原形态", "004首领甲"):
            (input_dir / f"{name}.json").write_text(json.dumps(self.skills), encoding="utf-8")
        with patch.object(finder_module, "SpiritFinder", lambda **kwargs: self.finder), \
                contextlib.redirect_stdout(io.StringIO()):
            finder_module.process_skills(str(input_dir), str(output_dir))
        self.assertEqual(json.loads((output_dir / "004原形态.json").read_text(encoding="utf-8"))["skills"], self.skills)
        self.assertNotIn("skills", json.loads((output_dir / "004首领甲.json").read_text(encoding="utf-8")))


if __name__ == "__main__":
    unittest.main()
