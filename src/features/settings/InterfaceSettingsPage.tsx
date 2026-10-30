import { saveConfigPatch } from "../../services/configSaves";
import { desktopApi } from "../../services/desktopApi";
import { type PickerConfigs, type BurstEffectItem } from "../../services/desktopTypes";
import { useState, useMemo, useEffect } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { type UiTokenValues, uiTokenValues, UI_TOKEN_SECTIONS, UI_TOKEN_DEFAULTS, UI_TOKEN_FIELDS } from "./uiTokens";
import { savedPluginVisibility, PLUGIN_VISIBILITY_GROUPS } from "../plugin/layout";
import { asError } from "../../shared/errors";
import { BurstPanelPage } from "./BurstPanelPage";
import { NumberInput } from "../../components/common/Controls";

function InterfaceSettingsPage({
  configs,
  onConfigsChanged,
  onPreviewValues,
  burstEffects,
}: {
  configs: PickerConfigs;
  onConfigsChanged: (configs: PickerConfigs) => void;
  onPreviewValues: (values: UiTokenValues | null) => void;
  burstEffects: BurstEffectItem[];
}) {
  const [values, setValues] = useState(() => uiTokenValues(configs));
  const [pluginVisibility, setPluginVisibility] = useState(() => savedPluginVisibility(configs));
  const [message, setMessage] = useState("");
  const [configIndex, setConfigIndex] = useState<"team" | "preset" | "burst" | "plugin">("team");
  const [sectionTitle, setSectionTitle] = useState(() => UI_TOKEN_SECTIONS[0]?.title || "");
  const visibleSections = useMemo(
    () => UI_TOKEN_SECTIONS.filter((section) => configIndex === "preset" ? section.title.startsWith("精灵保存：") : configIndex === "team" ? !section.title.startsWith("精灵保存：") : false),
    [configIndex],
  );
  const activeSection = visibleSections.find((section) => section.title === sectionTitle) || visibleSections[0];
  useEffect(() => {
    setValues(uiTokenValues(configs));
    setPluginVisibility(savedPluginVisibility(configs));
  }, [configs]);

  async function save() {
    try {
      if (configIndex === "plugin") {
        await saveConfigPatch("team_layout", { plugin_visibility: pluginVisibility }, onConfigsChanged);
        setMessage("插件模式显示配置已保存");
        return;
      }
      await saveConfigPatch("ui_tokens", values, onConfigsChanged,
        { beforePublish: () => getCurrentWindow().setSize(new LogicalSize(values["window-width"], values["window-height"])) });
      onPreviewValues(null);
      setMessage("配置已保存");
    } catch (err) {
      setMessage(`保存失败：${asError(err)}`);
    }
  }

  function updateValue(key: keyof typeof UI_TOKEN_DEFAULTS, value: number) {
    const field = UI_TOKEN_FIELDS.find((item) => item.key === key);
    const nextValue = Number.isFinite(value)
      ? Math.min(field?.max ?? value, Math.max(field?.min ?? value, value))
      : values[key];
    const nextValues = { ...values, [key]: nextValue };
    setValues(nextValues);
    setMessage("");
    onPreviewValues(nextValues);
  }

  function switchConfigIndex(nextIndex: "team" | "preset" | "burst" | "plugin") {
    const nextSections = UI_TOKEN_SECTIONS.filter((section) => nextIndex === "preset" ? section.title.startsWith("精灵保存：") : nextIndex === "team" ? !section.title.startsWith("精灵保存：") : false);
    setConfigIndex(nextIndex);
    setSectionTitle(nextSections[0]?.title || "");
  }

  async function openConfigDirectory() {
    try {
      await desktopApi.openConfigDirectory();
      setMessage("");
    } catch (err) {
      setMessage(`打开配置目录失败：${asError(err)}`);
    }
  }

  return (
    <section className={`settings-page ${configIndex === "burst" ? "burst-settings-page" : ""}`}>
      <header className="settings-header">
        <h2>界面配置</h2>
        <div className="header-actions">
          <button className="compact-button" onClick={() => void openConfigDirectory()}>打开配置目录</button>
          {configIndex !== "burst" ? <button className="compact-button" onClick={() => void save()}>保存配置</button> : null}
        </div>
      </header>
      <nav className="settings-config-index" aria-label="配置位置">
        <button className={configIndex === "team" ? "active" : ""} onClick={() => switchConfigIndex("team")}>队伍面板</button>
        <button className={configIndex === "preset" ? "active" : ""} onClick={() => switchConfigIndex("preset")}>精灵保存</button>
        <button className={configIndex === "burst" ? "active" : ""} onClick={() => switchConfigIndex("burst")}>雷暴面板</button>
        <button className={configIndex === "plugin" ? "active" : ""} onClick={() => switchConfigIndex("plugin")}>插件模式</button>
      </nav>
      {configIndex !== "burst" && configIndex !== "plugin" ? <nav className="settings-section-index" aria-label="配置分区">
        <span className="settings-section-index-label">分区</span>
        <div className="settings-section-index-list">
          {visibleSections.map((section) => (
            <button
              key={section.title}
              className={section.title === activeSection?.title ? "active" : ""}
              onClick={() => setSectionTitle(section.title)}
            >
              {section.title.replace("精灵保存：", "")}
            </button>
          ))}
        </div>
      </nav> : null}
      {configIndex === "plugin" ? <div className="plugin-visibility-settings">
        <p>勾选需要显示的框，点击“保存配置”生效。</p>
        <section className="settings-token-section">
          <h3>固定显示</h3>
          {["我方队伍框", "敌方队伍框", "我方萌化框", "敌方萌化框", "我方特性框", "敌方特性框", "计算和对局重置框", "对局重置"].map((label) => <label className="plugin-visibility-option" key={label}><input type="checkbox" checked disabled /><span>{label}（不能关闭）</span></label>)}
        </section>
        {PLUGIN_VISIBILITY_GROUPS.map((group) => <section className="settings-token-section" key={group.title}>
          <h3>{group.title}</h3>
          {group.items.map(([key, label]) => <label className="plugin-visibility-option" key={key}>
            <input type="checkbox" checked={pluginVisibility[key]} onChange={(event) => { setPluginVisibility((current) => ({ ...current, [key]: event.target.checked })); setMessage(""); }} />
            <span>{label}</span>
          </label>)}
        </section>)}
      </div> : configIndex === "burst" ? (
        <BurstPanelPage effects={burstEffects} configs={configs} onConfigsChanged={onConfigsChanged} />
      ) : <div className="settings-sections">
        {activeSection ? (
          <section className="settings-token-section" key={activeSection.title}>
            <div className="settings-token-section-header">
              <h3>{activeSection.title}</h3>
              {configIndex === "team" ? (
                <button
                  className="compact-button"
                  onClick={() => {
                    const nextValues = { ...values };
                    activeSection.fields.forEach(({ key }) => {
                      nextValues[key] = UI_TOKEN_DEFAULTS[key];
                    });
                    setValues(nextValues);
                    setMessage("");
                    onPreviewValues(nextValues);
                  }}
                >
                  恢复默认
                </button>
              ) : null}
            </div>
            <div className="font-settings-grid">
              {activeSection.fields.map(({ key, label, min, max }) => (
                <label key={key}>
                  <span>{label}</span>
                  <NumberInput value={values[key]} min={min} max={max} deferValidation onChange={(value) => updateValue(key, value)} />
                </label>
              ))}
            </div>
          </section>
        ) : null}
      </div>}
      {message ? <p className="save-message">{message}</p> : null}
    </section>
  );
}

export { InterfaceSettingsPage };
