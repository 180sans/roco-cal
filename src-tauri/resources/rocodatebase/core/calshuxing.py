import math

def special_round(x):
    if x - math.floor(x) > 0.5:
        return math.ceil(x)
    return math.floor(x)

def normal_round(x):
    return math.floor(x+0.5)

def round_to_odd(x):
    integer = math.floor(x)
    frac = x - integer

    if frac < 0.5:
        return integer
    elif frac > 0.5:
        return integer + 1
    else:  # 恰好 .5
        if integer % 2 == 1:      # 下方是奇数
            return integer
        else:                     # 上方是奇数
            return integer + 1

def normal_round6(x):
    return math.floor(x + 0.4)

def calc_attr(
    attr_name,
    race_value,
    iv,
    level=60,
    star=5,
    ev=None,
    personality_bonus=None
):
    """
    参数:
    attr_name         属性名，例如 "hp" / "attack"
    race_value        种族值
    iv                个体值
    level             等级
    star              星级

    ev                努力值（可选）
                      默认 = 10 * 星级
                      hp属性会翻倍

    personality_bonus 性格修正（可选）
                      输入小数，例如 0.16 表示 16%
                      默认 = (10 + 2*星级)%


    返回:
    dict
    """

    # 默认努力值
    if ev is None:
        ev = 10 * star

    # hp努力值翻倍
    if attr_name.lower() == "hp":
        ev *= 2
    iv = iv + iv*star
    # 默认性格修正
    if personality_bonus is True:
        personality_bonus = (10 + 2 * star) / 100
    elif personality_bonus is False:
        personality_bonus = -0.1
    elif personality_bonus is None:
        personality_bonus = 0
    # 属性基础值
# 种族值部分
    race_base = race_value / 100
    
    # 个体值部分
    iv_base = (iv / 2) / 100
    
    if attr_name.lower() == "hp":
        race_attr = level * (2 * race_base) + 50 * race_base
        iv_attr = level * (2 * iv_base) + 50 * iv_base
        final_attr = normal_round(race_attr) + normal_round(iv_attr) + level + 10
    else:
        race_attr = level * race_base + 50 * race_base
        iv_attr = level * iv_base + 50 * iv_base
        final_attr = normal_round(race_attr) + normal_round(iv_attr) + 10
    
    # 属性修正值
    result = final_attr * (1 + personality_bonus) + ev
    
    result = normal_round(result)
    
    return result
    """
    return {
        "属性名": attr_name,
        "属性基础值": round(base_attr, 2),
        "属性最终值": round(final_attr, 2),
        "属性修正值": round(result, 2),
        "努力值": ev,
        "性格修正": f"{personality_bonus * 100:.1f}%"
    }
        base_attr = (race_value + iv / 2) / 100

    # 属性最终值
    final_attr = (
        level * ( 2*base_attr+1 if attr_name.lower() == "hp" else base_attr)
        + 50 * base_attr
        + 10
    )
    # round((round(1.1 x (种族值128 + 3 x 个体10)) + 10) x 性格1)
    # final_attr = math.ceil(final_attr)
    # final_attr = math.floor(final_attr)
    final_attr = normal_round(final_attr)
    # 属性修正值
    result = final_attr * (1 + personality_bonus) + ev
    
    # result = math.ceil(result)
    # result = math.floor(result)
    result = normal_round(result)
    
    return  result
    """



# =========================
# 使用示例
# =========================

    """
data = calc_attr(
    attr_name="spd",
    race_value=80,
    iv=0,
    level=39,
    star=0,
    ev=None,
    personality_bonus=0
)

data = calc_attr(
    attr_name="hp",
    race_value=90,
    iv=8,
    level=60,
    star=2,
    ev=None,
    personality_bonus=0
)


    """



ATTR_LIST = ["hp", "atk", "mag",  "def", "res", "spd"]

def calc_all_attrs(
    race_values,                 # [hp, mag, atk, def, res, spd]
    iv_values,                   # [hp, mag, atk, def, res, spd]

    personality_up_attr=None,   # 性格增加属性
    personality_up_value=None,  # 性格增加量

    personality_down_attr=None, # 性格减少属性
    personality_down_value = -0.1,# 默认 -10%

    star=5,
    level=60,
    ev_dict=None                # {"hp":50,"atk":30}
):
    """
    批量计算全部属性
    """

    # 默认努力值字典
    if ev_dict is None:
        ev_dict = {}

    result = {}

    for idx, attr_name in enumerate(ATTR_LIST):

        race_value = race_values[idx]
        iv = iv_values[idx]

        # 默认性格修正
        
        personality_bonus = 0
        # 性格增加
        if attr_name == personality_up_attr:
            if personality_up_value is None:
               personality_bonus = personality_up_value
            else:
               personality_bonus = (10 + 2 * star) / 100

        # 性格减少
        if attr_name == personality_down_attr:
            if personality_down_value is None:
               personality_bonus = personality_down_value
            else:
               personality_bonus = personality_down_value
            # personality_bonus += personality_down_value
        
        value = calc_attr(
            attr_name=attr_name,
            race_value=race_value,
            iv=iv,
            level=level,
            star=star,
            ev=ev_dict.get(attr_name),
            personality_bonus=personality_bonus
        )

        result[attr_name] = value

    return result


# =====================================================
# 使用示例
# =====================================================
if __name__ == "__main__":
# ["hp", "atk", "mag", "def", "res", "spd"]
# race_values = [126, 97, 39, 141, 103, 80]
  race_values = [150, 128, 105, 105, 70, 125]
  iv_values = [0, 10, 10, 0, 0, 0]

  data = calc_all_attrs(
    race_values=race_values,
    iv_values=iv_values,

    personality_up_attr="res",
    # personality_up_value=0.2,   # +20%

    personality_down_attr="def",

    star=5,
    level=60,

    # ev_dict={
        # "hp": 80,
        # "atk": 50
    # }
)

  print(data)

# print(data)