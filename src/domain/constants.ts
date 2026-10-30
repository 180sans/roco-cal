

const STATS = ["hp", "atk", "mag", "def", "res", "spd"] as const;

const STAT_LABEL: Record<(typeof STATS)[number], string> = {
  hp: "生命",
  atk: "物攻",
  mag: "魔攻",
  def: "防御",
  res: "魔抗",
  spd: "速度",
};

const IV_OPTIONS = ["", "0", "7", "8", "9", "10"];

const BLOODLINE_OPTIONS = [
  "普通系血脉",
  "草系血脉",
  "火系血脉",
  "水系血脉",
  "光系血脉",
  "地系血脉",
  "冰系血脉",
  "龙系血脉",
  "电系血脉",
  "毒系血脉",
  "虫系血脉",
  "武系血脉",
  "翼系血脉",
  "萌系血脉",
  "幽系血脉",
  "恶系血脉",
  "机械系血脉",
  "幻系血脉",
  "首领血脉",
];

const DEFAULT_SKILL_CARD_COUNT = 4;

const WEATHER_OPTIONS = [
  { value: "none", label: "无" },
  { value: "rain", label: "雨天（水）" },
  { value: "sandstorm", label: "沙暴（地）" },
  { value: "blizzard", label: "雪天（冰）" },
  { value: "thunder", label: "雷鸣（电）" },
] as const;

const SKILL_TYPE_FILTERS = ["物攻", "魔攻", "防御", "状态"] as const;

const ELEMENT_RESULT_COLORS: Record<string, string> = {
  "光": "rgb(79, 192, 255)",
  "冰": "rgb(99, 174, 218)",
  "地": "rgb(152, 125, 68)",
  "幻": "rgb(156, 169, 255)",
  "幽": "rgb(148, 70, 236)",
  "恶": "rgb(207, 70, 122)",
  "普通": "rgb(244, 238, 225)",
  "机械": "rgb(36, 185, 163)",
  "武": "rgb(255, 149, 49)",
  "毒": "rgb(186, 98, 224)",
  "水": "rgb(98, 168, 255)",
  "火": "rgb(223, 86, 30)",
  "电": "rgb(229, 202, 0)",
  "翼": "rgb(62, 199, 202)",
  "草": "rgb(78, 188, 115)",
  "萌": "rgb(255, 124, 177)",
  "虫": "rgb(158, 206, 33)",
  "龙": "rgb(232, 74, 96)",
};

export { DEFAULT_SKILL_CARD_COUNT, ELEMENT_RESULT_COLORS, STATS, STAT_LABEL, IV_OPTIONS, SKILL_TYPE_FILTERS, WEATHER_OPTIONS, BLOODLINE_OPTIONS };
