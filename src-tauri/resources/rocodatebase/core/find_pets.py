import os
import json
import re
from typing import Optional, List
from typing import Callable

from core.trait_library import resolve_trait_summary_for_pet


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class SpiritFinder:
    def __init__(self, data_dir: str = "spirits"):
        """
        初始化精灵查找器
        :param data_dir: 精灵JSON文件所在目录
        """
        self.data_dir = data_dir
        self._name_index = {}       # name -> [文件路径, ...]
        self._other_name_index = {} # other_name -> [文件路径, ...]
        self._id_name_index = {}    # "id+name"(如"004魔力猫") -> 文件路径
        self._all_cache: Optional[List[dict]] = None  # 新增
        self._spirit_cache: Optional[dict] = None  # 新增，懒加载
        self._build_index()

    def _build_index(self):
        """扫描目录，建立 name / other_name / id+name 到文件路径的索引"""
        if not os.path.isdir(self.data_dir):
            raise FileNotFoundError(f"数据目录不存在: {self.data_dir}")

        for filename in os.listdir(self.data_dir):
            if not filename.endswith(".json"):
                continue
            filepath = os.path.join(self.data_dir, filename)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (json.JSONDecodeError, IOError):
                continue

            name = data.get("name", "")
            spirit_id = data.get("id", "")
            id_name_key = f"{spirit_id}{name}"  # 如 "004魔力猫"

            # 主名称索引（改为列表，支持多匹配）
            if name:
                self._name_index.setdefault(name, []).append(filepath)
            # id+name 索引（唯一性较高，保持单值）
            if id_name_key:
                self._id_name_index[id_name_key] = filepath

            # other_name 索引（支持 dict 或 list，改为列表）
            other_names = data.get("other_name", {})
            if isinstance(other_names, dict):
                for key, val in other_names.items():
                    if val:
                        self._other_name_index.setdefault(val, []).append(filepath)
                    if key:
                        self._other_name_index.setdefault(key, []).append(filepath)
            elif isinstance(other_names, list):
                for alias in other_names:
                    if alias:
                        self._other_name_index.setdefault(alias, []).append(filepath)

    def _load_by_filepath(self, filepath: str) -> Optional[dict]:
        """根据文件路径加载精灵数据"""
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                spirit = json.load(f)
        except (json.JSONDecodeError, IOError):
            return None
        return self._merge_trait_summary(spirit)

    def _merge_trait_summary(self, spirit: dict) -> dict:
        if not isinstance(spirit, dict):
            return spirit
        if isinstance(spirit.get("特性"), dict):
            return spirit

        trait_summary = resolve_trait_summary_for_pet(spirit)
        if trait_summary:
            spirit["特性"] = trait_summary
        return spirit

    def _load_all_by_filepaths(self, filepaths: List[str]) -> List[dict]:
        """根据多个文件路径加载所有精灵数据"""
        results = []
        for fp in filepaths:
            data = self._load_by_filepath(fp)
            if data is not None:
                results.append(data)
        return results

    def _load_by_id_name(self, id_name: str) -> Optional[dict]:
        """
        根据 'id+name' 标识（如 '003喵呜'）加载精灵数据
        先查索引，索引未命中则尝试直接拼文件名
        """
        if id_name in self._id_name_index:
            return self._load_by_filepath(self._id_name_index[id_name])

        # 从 id_name 中提取纯 name（去掉前面的数字id）
        match = re.match(r"(\d+)(.*)", id_name)
        if match:
            pure_name = match.group(2)
            if pure_name in self._name_index:
                # 取第一个匹配
                return self._load_by_filepath(self._name_index[pure_name][0])

        # 最后尝试直接读文件
        filepath = os.path.join(self.data_dir, f"{id_name}.json")
        if os.path.isfile(filepath):
            return self._load_by_filepath(filepath)

        return None

    def _find_base_spirit(self, query: str) -> Optional[dict]:
        """
        根据 name 或 other_name 查找精灵基础数据
        优先级：other_name > name > id+name
        当存在多个匹配时，优先选择 other_name 精确匹配的结果
        """
        candidates = []

        # ---- 优先级1：other_name 匹配（最高优先） ----
        if query in self._other_name_index:
            filepaths = self._other_name_index[query]
            spirits = self._load_all_by_filepaths(filepaths)
            if spirits:
                if len(spirits) == 1:
                    return spirits[0]
                # 多个匹配时，选择 other_name 中该 query 完全匹配的
                # 进一步筛选：优先选 name 也匹配的，否则取第一个
                for sp in spirits:
                    if sp.get("name") == query:
                        return sp
                print(f"[警告] other_name '{query}' 匹配到 {len(spirits)} 个精灵，"
                      f"取第一个: {spirits[0].get('id','')}{spirits[0].get('name','')}")
                return spirits[0]

        # ---- 优先级2：name 匹配 ----
        if query in self._name_index:
            filepaths = self._name_index[query]
            spirits = self._load_all_by_filepaths(filepaths)
            if spirits:
                if len(spirits) == 1:
                    return spirits[0]
                # 多个同名精灵，打印警告，取第一个
                print(f"[警告] name '{query}' 匹配到 {len(spirits)} 个精灵:")
                for sp in spirits:
                    print(f"  - {sp.get('id','')}{sp.get('name','')}")
                print(f"  选择第一个: {spirits[0].get('id','')}{spirits[0].get('name','')}")
                return spirits[0]

        # ---- 优先级3：id+name 匹配 ----
        if query in self._id_name_index:
            return self._load_by_filepath(self._id_name_index[query])

        return None

    def find(self, query: str, devolution: int = 0, mega: bool = False) -> Optional[dict]:

        spirit = None

        # ---- 0. 最高优先级：id+name 精确匹配 ----
        if query in self._id_name_index:
            filepath = self._id_name_index[query]
            spirit = self.load(filepath)

        # ---- 1. name 精确匹配 ----
        elif query in self._name_index:
            filepath = self._name_index[query][0]  # 默认取第一个
            spirit = self.load(filepath)

        # ---- 2. other_name 精确匹配 ----
        elif query in self._other_name_index:
            filepath = self._other_name_index[query][0]
            spirit = self.load(filepath)

        # ---- 3. fallback：模糊查找 ----
        if spirit is None:
            # print(f"[错误] 未找到精灵: {query}")
            return None

        # print(f"[基础查找] 命中: {spirit.get('id', '?')}{spirit.get('name', '?')}")

        if devolution > 0:
            spirit = self._apply_devolution(spirit, devolution)

        if mega:
            spirit = self._apply_mega(spirit)

        # print(f"[最终结果] {spirit.get('id', '?')}{spirit.get('name', '?')}")
        return spirit

    def load(self, filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            spirit = json.load(f)
        return self._merge_trait_summary(spirit)

    def _apply_devolution(self, spirit: dict, steps: int) -> dict:
        """
        沿 evolution.prev 退化指定层数
        如果 prev 为空或不存在则停止
        """
        current = spirit
        for i in range(steps):
            evolution = current.get("evolution", {})
            prev_list = evolution.get("prev", [])

            if not prev_list or prev_list[0] is None:
                print(f"[退化] 第{i+1}步无法继续退化，已到最初形态: "
                      f"{current.get('id', '?')}{current.get('name', '?')}")
                break

            prev_id_name = prev_list[0]  # 取第一个退化目标，如 "003喵呜"
            # _apply_devolution 中
            prev_spirit = (
                              self._spirit_cache.get(prev_id_name) if self._spirit_cache else None
                          ) or self._load_by_id_name(prev_id_name)

            if prev_spirit is None:
                print(f"[退化] 第{i+1}步找不到退化目标文件: {prev_id_name}")
                break

            print(f"[退化] 第{i+1}步: {current.get('id','')}{current.get('name','')} "
                  f"-> {prev_spirit.get('id','')}{prev_spirit.get('name','')}")
            current = prev_spirit

        return current

    def _apply_mega(self, spirit: dict) -> dict:
        """
        沿 evolution.next 前进1次（Mega进化）
        如果 next 为空或不存在则保持不变
        """
        evolution = spirit.get("evolution", {})
        next_list = evolution.get("next", [])

        if not next_list or next_list[0] is None:
            print(f"[Mega] 无Mega形态，保持: "
                  f"{spirit.get('id', '?')}{spirit.get('name', '?')}")
            return spirit

        next_id_name = next_list[0]  # 取第一个进化目标
        next_spirit = (
            ( self._spirit_cache.get(next_id_name) if self._spirit_cache else None)
                or self._load_by_id_name(next_id_name)
        )

        if next_spirit is None:
            print(f"[Mega] 找不到Mega目标文件: {next_id_name}，保持不变")
            return spirit

        print(f"[Mega] {spirit.get('id','')}{spirit.get('name','')} "
              f"-> {next_spirit.get('id','')}{next_spirit.get('name','')}")
        return next_spirit

    def _get_all_filepaths(self) -> List[str]:
        """
        从_name_index 收集所有唯一文件路径。
        _name_index 已覆盖全量文件，其他索引只是别名，不需要重复扫描。
        """
        all_paths: set = set()
        for paths in self._name_index.values():
            all_paths.update(paths)
        return list(all_paths)

    def load_all(self) -> List[dict]:
        """加载全部精灵，结果缓存在内存，后续调用直接复用"""
        if self._all_cache is None:
            self._all_cache = self._load_all_by_filepaths(self._get_all_filepaths())
        return self._all_cache

    def filter_all(self, predicate: Callable[[dict], bool]) -> List[dict]:
        """
        加载所有精灵，按predicate 过滤后返回。
        用法示例:
            # 查找所有火属性精灵
            finder.filter_all(lambda s: "火" in s.get("element", []))
            # 查找速度超过 100 的精灵
            finder.filter_all(lambda s: s.get("stats", {}).get("speed", 0) > 100)
            # 组合条件
            finder.filter_all(
                lambda s: s.get("rarity") == 5 and "水" in s.get("element", [])
            )
        """
        return [s for s in self.load_all() if predicate(s)]

    def query(self, **kwargs) -> List[dict]:
        """
        字段等值匹配过滤，支持用__ 访问嵌套字段。
        用法示例:
            finder.query(rarity=5)
            finder.query(element=["火"])
            finder.query(stats__speed=120)   # 等价于 s["stats"]["speed"] == 120
        """

        def _match(spirit: dict) -> bool:
            for key, expected in kwargs.items():
                obj = spirit
                for part in key.split("__"):
                    if not isinstance(obj, dict):
                        return False
                    obj = obj.get(part)
                if obj != expected:
                    return False
            return True

        return self.filter_all(_match)

    def _ensure_spirit_cache(self):
        if self._spirit_cache is None:
            # load_all() 已有缓存，这里只是换个数据结构，无额外 IO
            self._spirit_cache = {
                f"{s.get('id', '')}{s.get('name', '')}": s
                for s in self.load_all()
            }

    def is_final_form(self, spirit: dict) -> bool:
        evolution = spirit.get("evolution", {})
        if evolution.get("stage") == "mega":
            return False
        next_list = [n for n in evolution.get("next", []) if n]
        if not next_list:
            return True
        self._ensure_spirit_cache()
        for next_id_name in next_list:
            next_spirit = (
                    self._spirit_cache.get(next_id_name)
                    or self._load_by_id_name(next_id_name)
            )
            if next_spirit is None:
                continue
            if next_spirit.get("evolution", {}).get("stage") != "mega":
                return False
        return True

    def filter_final_forms(self) -> List[dict]:
        return self.filter_all(self.is_final_form)

    # 使用
    # results = finder.filter_all_with_cache(
    #     lambda s, cache: finder.is_final_form(s, _cache=cache)
    # )



BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data_dir = os.path.join(BASE_DIR, "data", "pets_w_skill_json")
pets_dataset = SpiritFinder(data_dir=data_dir)
# ==================== 使用示例 ====================


def check_missing_files(folder_path, finder):
    """检测文件夹中无法找到的文件"""
    missing_files = []
    if not os.path.isdir(folder_path):
        print(f"错误: {folder_path} 不是有效的文件夹")
        return missing_files
    files = os.listdir(folder_path)
    total = len(files)
    print(f"开始检测 {total} 个文件...")
    for i, filename in enumerate(files, 1):
        filepath = os.path.join(folder_path, filename)
        # 跳过子文件夹
        if not os.path.isfile(filepath):
            continue
        # 去掉扩展名，使用原始文件名进行查找
        base_name = os.path.splitext(filename)[0]

        if not finder.find(base_name):
            missing_files.append(filename)
        # 显示进度
        if i % 100 == 0 or i == total:
            print(f"进度: {i}/{total}")
    return missing_files



from typing import Optional



def load_skill_file(filepath: str) -> Optional[list]:
    """加载技能 JSON 文件，返回技能列表；失败返回 None"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            print(f"[警告] 技能文件格式不是列表: {filepath}")
            return None
        return data
    except (json.JSONDecodeError, IOError) as e:
        print(f"[错误] 无法读取技能文件 '{filepath}': {e}")
        return None


def process_skills(skills_dir: str, output_dir: str):
    """
    遍历技能文件夹，用文件名查找对应精灵，
    将技能列表录入精灵数据后输出到指定目录。

    :param skills_dir: 技能 JSON 文件所在文件夹
    :param output_dir: 录入技能后的精灵 JSON 输出目录
    """
    finder = SpiritFinder(data_dir="../../caldamage/precison_pets_json")
    os.makedirs(output_dir, exist_ok=True)

    success_list = []
    error_list = []

    skill_files = [f for f in os.listdir(skills_dir) if f.endswith(".json")]
    if not skill_files:
        print(f"[警告] 技能文件夹中没有 JSON 文件: {skills_dir}")
        return

    for filename in sorted(skill_files):
        skill_filepath = os.path.join(skills_dir, filename)
        # 去掉后缀作为查询关键字
        query = os.path.splitext(filename)[0]

        # ---- 1. 加载技能数据 ----
        skills = load_skill_file(skill_filepath)
        if skills is None:
            error_list.append(f"技能文件读取失败: {filename}")
            continue

        # ---- 2. 查找对应精灵 ----
        spirit = finder.find(query)
        if spirit is None:
            msg = f"未找到精灵 '{query}'（来自技能文件: {filename}）"
            error_list.append(msg)
            print(f"[错误] {msg}")
            continue

        # ---- 3. 录入技能 ----
        spirit["skills"] = skills

        # ---- 4. 输出到目标文件夹 ----
        spirit_id= spirit.get("id", "")
        spirit_name = spirit.get("name", "未知")
        out_filename = f"{spirit_id}{spirit_name}.json"
        out_filepath = os.path.join(output_dir, out_filename)

        try:
            with open(out_filepath, "w", encoding="utf-8") as f:
                json.dump(spirit, f, ensure_ascii=False, indent=2)
            success_list.append(f"{query} -> {out_filename}（{len(skills)} 个技能）")
            print(f"[成功] {query} -> {out_filename}")
        except IOError as e:
            msg = f"写入失败 '{out_filename}': {e}"
            error_list.append(msg)
            print(f"[错误] {msg}")

    # ---- 5.汇总报告 ----
    print("\n" + "=" * 40)
    print(f"处理完成：成功 {len(success_list)} 个，失败 {len(error_list)} 个")
    if success_list:
        print("\n【成功列表】")
        for item in success_list:
            print(f"  ✓ {item}")
    if error_list:
        print("\n【错误列表】")
        for item in error_list:
            print(f"  ✗ {item}")



if __name__ == "__main__":
    # finder = SpiritFinder(data_dir="../data/precison_pets_json")

    # 示例1: 直接查找
    # result = finder.find("魔力猫")
    # 结果: 004魔力猫
    # missing = check_missing_files("../data/pets_skill_json",pets_dataset)
    # print("\n" + "=" * 50)
    # if missing:
    #     print(f"无法找到的文件 ({len(missing)} 个):")
    #     for filename in missing:
    #         print(f"  - {filename}")
    # else:
    #     print("所有文件都能找到！")
    # print("=" * 50)
    # skills_dir="../data/pets_skill_json"
    # output_dir="../data/pets_w_skill_json"
    # process_skills(skills_dir, output_dir)

    r = pets_dataset.filter_all(lambda s: "火" in s.get("elements", []))
    print(r)
    # 示例2: 查找并退化1层
    # result = finder.find("魔力猫", devolution=1)
    # 结果: 003喵呜

    # 示例3: 查找并退化2层
    # result = finder.find("魔力猫", devolution=2)
    # 结果: 002喵喵

    # 示例4: 查找并Mega进化
    # result = finder.find("魔力猫", mega=True)
    # 结果: 004叶冕魔力猫

    # 示例5: 退化超出范围（退化10层但只有2层可退）
    # result = finder.find("魔力猫", devolution=10)
    # 结果: 002喵喵（退到最初形态后停止）

    # 示例6: 通过别名查找
    # result = finder.find("某个别名", devolution=1, mega=False)

    # if result:
    #     print(json.dumps(result, ensure_ascii=False, indent=2))
