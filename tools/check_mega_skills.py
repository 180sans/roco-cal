"""只读检查所有首领形态与原精灵的技能名称集合是否一致。"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = SCRIPT_DIR.parent / "src-tauri/resources/rocodatebase/data/pets_w_skill_json"


def check_skills(data_dir):
    """返回检查结果；不导入主程序，也不写入数据目录。"""
    data_dir = Path(data_dir).resolve()
    if not data_dir.is_dir():
        raise ValueError(f"数据目录不存在或无法读取：{data_dir}")
    paths = sorted(data_dir.glob("*.json"))
    if not paths:
        raise ValueError(f"数据目录中没有 JSON 文件：{data_dir}")

    pets = {}
    errors = []
    for path in paths:
        try:
            pet = json.loads(path.read_text(encoding="utf-8-sig"))
            if not isinstance(pet, dict):
                raise ValueError("JSON 顶层必须是对象")
            if not all(isinstance(pet.get(key), str) and pet[key].strip() for key in ("id", "name")):
                raise ValueError("id 和 name 必须是非空字符串")
            key = pet["id"] + pet["name"]
            if key in pets:
                raise ValueError(f"精灵标识重复：{key}")
            if not isinstance(pet.get("evolution"), dict):
                raise ValueError("evolution 必须是对象")
            pets[key] = {"data": pet, "file": str(path)}
        except (OSError, UnicodeError, ValueError) as error:
            errors.append(f"{path.name}：{error}")

    skill_cache = {}

    def skill_names(key):
        if key not in skill_cache:
            skills = pets[key]["data"].get("skills")
            if not isinstance(skills, list) or not skills:
                errors.append(f"{key}：skills 缺失、格式错误或为空，无法确认技能组")
                skill_cache[key] = None
            elif any(not isinstance(item, dict) or not isinstance(item.get("skill_name"), str)
                     or not item["skill_name"].strip() for item in skills):
                errors.append(f"{key}：skills 中存在缺失或无效的 skill_name")
                skill_cache[key] = None
            else:
                # 技能组比较只看名称；不把解锁条件或列表顺序当作技能差异。
                skill_cache[key] = {item["skill_name"] for item in skills}
        return skill_cache[key]

    mega_keys = sorted(key for key, pet in pets.items()
                       if pet["data"]["evolution"].get("stage") == "mega")
    comparisons = []
    unresolved = set()
    for mega_key in mega_keys:
        previous = pets[mega_key]["data"]["evolution"].get("prev")
        if (not isinstance(previous, list) or not previous
                or any(not isinstance(key, str) or not key.strip() for key in previous)):
            errors.append(f"{mega_key}：evolution.prev 缺失或无效，无法确定原精灵")
            unresolved.add(mega_key)
            continue
        # 检查所有 prev 分支，不能只取第一个；也不按相同编号猜测原精灵。
        for base_key in dict.fromkeys(previous):
            if base_key not in pets:
                errors.append(f"{mega_key}：找不到原精灵 {base_key}")
                unresolved.add(mega_key)
                continue
            if pets[base_key]["data"]["evolution"].get("stage") == "mega":
                errors.append(f"{mega_key}：prev 指向首领形态 {base_key}，需要确认原精灵关联")
                unresolved.add(mega_key)
                continue
            base_skills = skill_names(base_key)
            inherited = "skills" not in pets[mega_key]["data"]
            mega_skills = base_skills if inherited else skill_names(mega_key)
            if base_skills is None or mega_skills is None:
                unresolved.add(mega_key)
                continue
            comparisons.append({
                "base": base_key,
                "mega": mega_key,
                "base_file": pets[base_key]["file"],
                "mega_file": pets[mega_key]["file"],
                "base_skill_count": len(base_skills),
                "mega_skill_count": len(mega_skills),
                "consistent": base_skills == mega_skills,
                "inherited": inherited,
                "missing_in_mega": sorted(base_skills - mega_skills),
                "extra_in_mega": sorted(mega_skills - base_skills),
            })

    if not mega_keys:
        errors.append("没有发现 evolution.stage 为 mega 的首领形态，无法完成检查")
    return {
        "checked_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "data_dir": str(data_dir),
        "comparison_rule": "比较技能名称集合，忽略排列顺序、重复项和解锁条件；首领无 skills 字段时按原形态继承；不修改数据。",
        "summary": {
            "json_files": len(paths),
            "loaded_pets": len(pets),
            "mega_forms": len(mega_keys),
            "base_groups": len({item["base"] for item in comparisons}),
            "comparisons": len(comparisons),
            "consistent": sum(item["consistent"] for item in comparisons),
            "inconsistent": sum(not item["consistent"] for item in comparisons),
            "inherited": sum(item["inherited"] for item in comparisons),
            "unresolved_forms": len(unresolved),
        },
        "comparisons": comparisons,
        "errors": errors,
    }


def format_report(result):
    summary = result["summary"]
    lines = [
        "首领形态技能组一致性检测", f"检测时间：{result['checked_at']}",
        f"数据目录：{result['data_dir']}", f"比较规则：{result['comparison_rule']}", "",
        f"扫描 JSON：{summary['json_files']}；成功加载精灵：{summary['loaded_pets']}",
        f"首领形态：{summary['mega_forms']}；参与比较的原精灵：{summary['base_groups']}",
        f"完成对照：{summary['comparisons']}；一致：{summary['consistent']}；不一致：{summary['inconsistent']}",
        f"已移除独立技能组、使用继承：{summary['inherited']}",
        f"未完成检查的首领形态：{summary['unresolved_forms']}；数据或关联异常：{len(result['errors'])}",
        "", "=== 不一致的技能组 ===",
    ]
    differences = [item for item in result["comparisons"] if not item["consistent"]]
    if not differences:
        lines.append("无（如有数据或关联异常，仍需处理后重新检查）。" if result["errors"] else "无。")
    for item in differences:
        lines.extend([
            f"{item['base']} → {item['mega']}",
            f"  技能数量：原精灵 {item['base_skill_count']}，首领 {item['mega_skill_count']}",
            f"  首领缺少：{'、'.join(item['missing_in_mega']) or '无'}",
            f"  首领多出：{'、'.join(item['extra_in_mega']) or '无'}",
            "",
        ])
    lines.extend(["=== 一致的技能组 ==="])
    lines.extend(f"{item['base']} → {item['mega']}（{item['base_skill_count']} 个技能）"
                 for item in result["comparisons"] if item["consistent"])
    lines.extend(["", "=== 数据或关联异常 ===", *(result["errors"] or ["无。"])])
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="精灵 JSON 目录，默认使用本项目数据")
    parser.add_argument("--report", type=Path, default=SCRIPT_DIR / "mega_skill_report.txt", help="文本报告路径，默认保存到脚本所在目录")
    parser.add_argument("--json-report", type=Path, help="可选：同时保存结构化 JSON 报告")
    args = parser.parse_args(argv)
    outputs = [args.report.resolve()]
    if args.json_report:
        outputs.append(args.json_report.resolve())
    if len(set(outputs)) != len(outputs):
        parser.error("文本报告与 JSON 报告不能使用同一路径")
    for output in outputs:
        if output == Path(__file__).resolve() or args.data_dir.resolve() in (output, *output.parents):
            parser.error("报告不能覆盖检测脚本，也不能写入精灵数据目录")
    try:
        result = check_skills(args.data_dir)
        report = format_report(result)
        for output in outputs:
            output.parent.mkdir(parents=True, exist_ok=True)
        outputs[0].write_text(report, encoding="utf-8-sig")
        if args.json_report:
            outputs[1].write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, UnicodeError, ValueError) as error:
        print(f"检测失败：{error}", file=sys.stderr)
        return 2
    print(report, end="")
    print(f"文本报告已保存：{outputs[0]}")
    if args.json_report:
        print(f"JSON 报告已保存：{outputs[1]}")
    return 2 if result["errors"] else 1 if result["summary"]["inconsistent"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
