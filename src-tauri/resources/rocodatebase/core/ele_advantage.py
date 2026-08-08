from enum import IntEnum


class Type(IntEnum):
    普通 = 0;  草 = 1;  火 = 2;  水 = 3;  光 = 4;  地 = 5
    冰 = 6;  龙 = 7;  电 = 8;  毒 = 9;  虫 = 10; 武 = 11
    翼 = 12; 萌 = 13; 幽 = 14; 恶 = 15; 机械 = 16; 幻 = 17


class TypeChart:

    _CHART = [
        [1,1,1,1,1,0.5,1,1,1,1,1,1,1,1,0.5,1,0.5,1],
        [1,1,0.5,2,2,2,1,0.5,1,0.5,0.5,1,0.5,1,1,1,0.5,1],
        [1,2,1,0.5,1,0.5,2,0.5,1,1,2,1,1,1,1,1,2,1],
        [1,0.5,2,1,1,2,0.5,0.5,1,1,1,1,1,1,1,1,2,1],
        [1,0.5,1,1,1,1,0.5,1,1,1,1,1,1,1,2,2,1,1],
        [1,0.5,2,1,1,1,2,1,2,2,1,0.5,1,1,1,1,1,1],
        [1,2,0.5,1,1,2,0.5,2,1,1,1,1,2,1,1,1,0.5,1],
        [1,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,0.5,1],
        [1,0.5,1,2,1,0.5,1,0.5,0.5,1,1,1,2,1,1,1,1,1],
        [1,2,1,1,1,0.5,1,1,1,0.5,1,1,1,2,0.5,1,0.5,1],
        [1,2,0.5,1,1,1,1,1,1,0.5,1,0.5,0.5,0.5,0.5,2,0.5,2],
        [2,1,1,1,1,2,2,1,1,0.5,0.5,1,0.5,0.5,0.5,2,2,0.5],
        [1,2,1,1,1,0.5,1,0.5,0.5,1,2,2,1,1,1,1,0.5,1],
        [1,1,0.5,1,1,1,1,2,1,0.5,1,2,1,1,1,2,0.5,1],
        [0.5,1,1,1,2,1,1,1,1,1,1,1,1,1,2,0.5,1,2],
        [1,1,1,1,0.5,1,1,1,1,2,1,0.5,1,2,2,0.5,1,1],
        [1,1,0.5,0.5,1,2,2,1,0.5,1,1,1,1,2,1,1,0.5,1],
        [1,1,1,1,0.5,1,1,1,1,2,1,2,1,1,1,1,0.5,0.5],
    ]

    @staticmethod
    def _parse(types: list[str]) -> list[Type]:
        if isinstance(types, str):
            types = [types]
        return [Type[t] for t in types]

    @classmethod
    def calc(cls, atk: list[str], def_: list[str]) -> float:
        """
        atk:  攻击方属性，如 ["幽"]
        def_: 防御方属性，如 ["幽", "恶"]
        返回最终倍率
        """
        atk_types = cls._parse(atk)
        def_types = cls._parse(def_)

        # 攻击方每个属性分别算，取最大（多攻击属性时选最优）
        best = 0
        for a in atk_types:
            row = cls._CHART[a]
            multipliers = [row[d] for d in def_types]

            count_super = 0
            other_product = 1.0

            for m in multipliers:
                if m == 2:
                    count_super += 1
                else:
                    other_product *= m

            super_combined = (1 + count_super) if count_super > 0 else 1
            result = super_combined * other_product

            if result > best:
                best = result

        return best


# ========== 调用 ==========
if __name__ == "__main__":
# 幽 打 幽/恶
   print(TypeChart.calc(["幽"], ["幽", "恶"]))
# 幽→幽=2, 幽→恶=0.5 → 2 × 0.5 = 1.0

# 火 打 冰/草
   print(TypeChart.calc(["火"], ["冰", "草"]))
# 火→冰=2, 火→草=2 → 1+2 = 3.0

# 火 打 水/龙
   print(TypeChart.calc(["冰"], ["幽", "龙"]))
# 火→水=0.5, 火→龙=0.5 → 0.25

# 单属性对单属性
   print(TypeChart.calc(["火"], ["草"]))
# 2.0
