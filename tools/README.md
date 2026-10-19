# 首领技能组检测

`check_mega_skills.py` 是独立的只读检测程序，使用 Python 3.9 或更新版本，无需安装依赖，不导入或启动主程序。

在项目目录运行：

```powershell
python tools\check_mega_skills.py
```

默认检查 `src-tauri\resources\rocodatebase\data\pets_w_skill_json`，结果显示在终端，并保存到 `tools\mega_skill_report.txt`。每次运行会更新报告。

指定其他数据目录或报告位置：

```powershell
python tools\check_mega_skills.py --data-dir "D:\精灵数据" --report "D:\检测结果.txt" --json-report "D:\检测结果.json"
```

检测规则：

- 以 `evolution.stage == "mega"` 识别首领形态，通过首领自己的 `evolution.prev` 定位原精灵；所有首领分支都会比较。
- 比较整个 `skills` 列表的技能名称集合，包括默认、血脉、技能石等所有来源；忽略顺序、重复项和解锁条件文字。
- 报告逐项列出首领相对原精灵缺少、多出的技能，也列出一致的对照。
- 找不到原精灵、技能数据为空或格式错误等情况会报告异常，不会视为检查通过。
- 只生成报告，不自动修正精灵文件；报告路径不能位于输入数据目录内。
- 首领已经删除 `skills` 字段时，按原形态技能组检查继承；报告会统计继承数量。清理前生成的报告保留的是当时的独立技能组差异。

退出码：`0` 全部一致；`1` 有技能差异；`2` 数据、关联或读写异常。发现差异时返回 `1` 是正常的检测结果。

# 清理首领独立技能组

主程序的 Rust 与 Python 数据读取均已改为：首领通过 `evolution.prev` 继承原形态的完整技能条目（包含解锁条件），忽略首领自身旧的 `skills`。修改原形态后，重新启动程序即可读取更新后的技能组。首领种族值、属性和特性仍使用首领自身数据。

预览要清理的数量：

```powershell
python tools\delete_mega_skills.py
```

执行清理：

```powershell
python tools\delete_mega_skills.py --apply
```

执行前会检查全部首领关联并将待修改文件原样备份为 `tools\backups\mega-skills-时间.zip`；仅删除 `stage == "mega"` 文件中的 `skills` 字段。非首领文件不修改。重复运行会跳过已经清理的文件。

支持 `--data-dir "其他精灵目录"` 和 `--backup-dir "备份目录"`。首领需要唯一、有效的 `prev` 原形态关联；数据或关联异常时不执行清理。写入中途失败会尝试回滚，并保留备份 ZIP。
