"""Exercise the new handler with real type-chart rules and a controlled pet lookup."""
import ast
import runpy
import sys
import types
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "src-tauri/resources/rocodatebase"
tree = ast.parse((root / "desktop_api.py").read_text(encoding="utf-8"))
handler = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "calculate_watch_advantages")
chart = runpy.run_path(str(root / "core/ele_advantage.py"))
chart_module = types.ModuleType("core.ele_advantage")
chart_module.Type = chart["Type"]
chart_module.TypeChart = chart["TypeChart"]
calls = []


class Pets:
    def find(self, name, **options):
        calls.append((name, options))
        if name == "不存在":
            return None
        return {"elements": ["冰", "草"] if name == "双属性" else ["水", "龙"]}


pet_module = types.ModuleType("core.find_pets")
pet_module.pets_dataset = Pets()
sys.modules.update({"core": types.ModuleType("core"), "core.find_pets": pet_module, "core.ele_advantage": chart_module})
scope = {"Any": object}
exec(compile(ast.Module(body=[handler], type_ignores=[]), "watch-handler", "exec"), scope)
calculate = scope["calculate_watch_advantages"]
result = calculate({"defender": {"name": "双属性", "devolution": 1, "mega": True}})
assert len(result) == 18
assert result["火"] == 3, result
assert calls[-1] == ("双属性", {"devolution": 1, "mega": True})
result = calculate({"defender": {"name": "双属性", "mega_form": "指定首领", "mega": True}})
assert calls[-1] == ("指定首领", {"devolution": 0, "mega": False})
assert result["火"] == 0.25
assert result["冰"] == 2
try:
    calculate({"defender": {"name": "不存在"}})
except ValueError:
    pass
else:
    raise AssertionError("Missing pet must report an error")
print("克制计算：双属性倍率、切换精灵、退化及指定首领参数、异常检查通过。")
