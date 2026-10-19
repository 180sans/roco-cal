"""删除首领形态的独立 skills 字段，保留原形态技能组；执行前自动备份。"""

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from check_mega_skills import DEFAULT_DATA_DIR, SCRIPT_DIR, check_skills


def build_plan(data_dir):
    result = check_skills(data_dir)
    if result["errors"]:
        raise ValueError("数据检查未通过，未修改文件：\n" + "\n".join(result["errors"]))
    plan = []
    for path in sorted({Path(item["mega_file"]) for item in result["comparisons"]}):
        original = path.read_bytes()
        pet = json.loads(original.decode("utf-8-sig"))
        if len(pet["evolution"]["prev"]) != 1:
            raise ValueError(f"{path.name}：继承需要唯一原形态，未修改文件")
        if "skills" not in pet:
            continue
        del pet["skills"]
        newline = "\r\n" if b"\r\n" in original else "\n"
        updated = (json.dumps(pet, ensure_ascii=False, indent=2) + "\n").replace("\n", newline)
        encoding = "utf-8-sig" if original.startswith(b"\xef\xbb\xbf") else "utf-8"
        plan.append((path, original, updated.encode(encoding)))
    return result["summary"]["mega_forms"], plan


def atomic_write(path, content):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + ".", suffix=".tmp", delete=False) as file:
            temporary = Path(file.name)
            file.write(content)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def delete_skills(data_dir, backup_dir, *, apply=False):
    """预检全部通过才写入；返回摘要。重复执行时跳过已清理文件。"""
    data_dir = Path(data_dir).resolve()
    backup_dir = Path(backup_dir).resolve()
    if data_dir in (backup_dir, *backup_dir.parents):
        raise ValueError("备份目录不能放在精灵数据目录内")
    mega_count, plan = build_plan(data_dir)
    result = {"mega_forms": mega_count, "pending": len(plan), "changed": 0,
              "already_inherited": mega_count - len(plan), "backup": None}
    if not apply or not plan:
        return result

    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup = backup_dir / f"mega-skills-{stamp}.zip"
    with ZipFile(backup, "x", compression=ZIP_DEFLATED) as archive:
        for path, original, _ in plan:
            archive.writestr(path.name, original)
        archive.writestr("manifest.json", json.dumps({
            "data_dir": str(data_dir),
            "files": [path.name for path, _, _ in plan],
            "operation": "remove mega skills field only",
        }, ensure_ascii=False, indent=2))
    result["backup"] = str(backup)

    changed = []
    try:
        for path, original, updated in plan:
            if path.read_bytes() != original:
                raise ValueError(f"文件在预检后被修改，停止清理：{path.name}")
            atomic_write(path, updated)
            changed.append((path, original))
    except (OSError, ValueError) as error:
        rollback_errors = []
        for path, original in reversed(changed):
            try:
                atomic_write(path, original)
            except OSError as rollback_error:
                rollback_errors.append(f"{path.name}：{rollback_error}")
        message = f"清理失败：{error}；备份：{backup}"
        if rollback_errors:
            message += "\n部分文件回滚失败：\n" + "\n".join(rollback_errors)
        else:
            message += "；本次已修改文件均已回滚"
        raise ValueError(message) from error
    result["changed"] = len(changed)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="精灵 JSON 目录")
    parser.add_argument("--backup-dir", type=Path, default=SCRIPT_DIR / "backups", help="备份 ZIP 保存目录")
    parser.add_argument("--apply", action="store_true", help="执行删除；不传此参数时仅预览")
    args = parser.parse_args(argv)
    try:
        result = delete_skills(args.data_dir, args.backup_dir, apply=args.apply)
    except (OSError, UnicodeError, ValueError) as error:
        print(f"操作失败：{error}", file=sys.stderr)
        return 2
    print(f"首领形态：{result['mega_forms']}；已有继承：{result['already_inherited']}；待清理：{result['pending']}")
    if args.apply:
        print(f"已删除 {result['changed']} 个首领文件的 skills 字段，原形态数据未修改。")
        if result["backup"]:
            print(f"原始文件备份：{result['backup']}")
    else:
        print("当前仅预览，添加 --apply 执行删除并自动备份。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
