import definitions from "./pluginShortcuts.json";
import { type PickerConfigs } from "../services/desktopTypes";

const PLUGIN_SHORTCUTS = definitions;
type PluginShortcutBindings = Record<string, string>;
type PluginShortcutButtons = Record<string, boolean>;
const SHORTCUT_KEYS = ["", ...Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index)), ...Array.from({ length: 10 }, (_, index) => String(index)), ...Array.from({ length: 24 }, (_, index) => `F${index + 1}`)];
const SHORTCUT_MODIFIERS = ["", "Ctrl", "Alt", "Shift", "Ctrl+Shift", "Ctrl+Alt", "Alt+Shift", "Ctrl+Alt+Shift"];

function savedPluginShortcuts(configs: PickerConfigs): PluginShortcutBindings {
  const saved = configs.team_layout?.shortcuts as Record<string, unknown> | undefined;
  return Object.fromEntries(PLUGIN_SHORTCUTS.map((item) => {
    const value = saved?.[item.id];
    return [item.id, typeof value === "string" ? value : item.shortcut];
  }));
}

function savedShortcutButtons(configs: PickerConfigs): PluginShortcutButtons {
  const saved = configs.team_layout?.shortcut_buttons as Record<string, unknown> | undefined;
  return Object.fromEntries(PLUGIN_SHORTCUTS.filter((item) => item.row !== null).map((item) => [item.id, saved?.[item.id] !== false]));
}

function shortcutMatches(event: KeyboardEvent, shortcut: string): boolean {
  if (!shortcut || event.repeat || event.metaKey) return false;
  const parts = shortcut.split("+");
  const key = parts.pop()!;
  const eventKey = event.code?.replace(/^Key|^Digit/, "") || event.key.toUpperCase();
  return eventKey === key && Boolean(event.ctrlKey) === parts.includes("Ctrl")
    && Boolean(event.altKey) === parts.includes("Alt") && Boolean(event.shiftKey) === parts.includes("Shift");
}

function shortcutAria(shortcut: string) { return shortcut.replace("Ctrl", "Control") || undefined; }

function validatePluginShortcuts(bindings: PluginShortcutBindings): string {
  if (Object.keys(bindings).some((id) => !PLUGIN_SHORTCUTS.some((item) => item.id === id))) return "存在未知快捷键配置";
  const used = new Map<string, string>();
  for (const item of PLUGIN_SHORTCUTS) {
    const value = bindings[item.id];
    if (value === "") continue;
    if (typeof value !== "string") return `${item.label}：无效快捷键`;
    const parts = value.split("+");
    const key = parts.pop()!;
    if (!SHORTCUT_KEYS.includes(key) || !SHORTCUT_MODIFIERS.includes(parts.join("+"))) return `${item.label}：无效快捷键`;
    if (!key || (!/^F\d+$/.test(key) && !parts.includes("Ctrl") && !parts.includes("Alt"))) return `${item.label}：字母和数字必须搭配 Ctrl 或 Alt`;
    if (key === "F11") return "F11 已用于全屏，请选择其他快捷键";
    if (key === "F12") return "F12 为系统保留键，请选择其他快捷键";
    if (used.has(value)) return `${item.label}与${used.get(value)}的快捷键重复：${value}`;
    used.set(value, item.label);
  }
  return "";
}

export { PLUGIN_SHORTCUTS, SHORTCUT_KEYS, SHORTCUT_MODIFIERS, type PluginShortcutBindings, type PluginShortcutButtons, savedPluginShortcuts, savedShortcutButtons, shortcutMatches, shortcutAria, validatePluginShortcuts };
