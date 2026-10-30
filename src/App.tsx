import { useLatestRequest } from "./services/useLatestRequest";
import { useState, type PointerEvent as ReactPointerEvent, useEffect, useMemo } from "react";
import { type AppState } from "./services/desktopTypes";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { desktopApi } from "./services/desktopApi";
import { listen } from "@tauri-apps/api/event";
import { WEATHER_OPTIONS } from "./domain/constants";
import { type UiTokenValues, uiTokenStyleFromValues, uiTokenStyle } from "./features/settings/uiTokens";
import { asError } from "./shared/errors";
import { normalizePetIconName, MegaPetIconContext } from "./components/common/EntityLabel";
import { TeamBattlePage } from "./features/battle/TeamBattlePage";
import { PresetManagerPage } from "./features/presets/PresetManagerPage";
import { InterfaceSettingsPage } from "./features/settings/InterfaceSettingsPage";

function App() {
  const appRequests = useLatestRequest();
  const [tab, setTab] = useState<"team" | "presets" | "settings">("team");
  const [weather, setWeather] = useState<(typeof WEATHER_OPTIONS)[number]["value"]>("none");
  const [data, setData] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [previewUiTokens, setPreviewUiTokens] = useState<UiTokenValues | null>(null);
  const [overlayAttached, setOverlayAttached] = useState(false);
  const [teamDisplayMode, setTeamDisplayMode] = useState<"normal" | "plugin">("plugin");
  const [fullscreenEnabled, setFullscreenEnabled] = useState(false);

  async function toggleFullscreen() {
    const next = !fullscreenEnabled;
    try {
      await getCurrentWindow().setFullscreen(next);
      setFullscreenEnabled(next);
    } catch (err) {
      setError(asError(err));
    }
  }

  function dragWindow(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    void getCurrentWindow().startDragging().catch((err) => setError(asError(err)));
  }

  async function load() {
    const request = appRequests.start();
    setError("");
    try {
      const nextData = await desktopApi.appState();
      if (!request.isCurrent()) return;
      setData(nextData);
      setTeamDisplayMode(nextData.configs.team_layout?.display_mode === "normal" ? "normal" : "plugin");
      setPreviewUiTokens(null);
    } catch (err) {
      if (!request.isCurrent()) return;
      setError(asError(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("overlay-attached", overlayAttached);
    return () => document.documentElement.classList.remove("overlay-attached");
  }, [overlayAttached]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<boolean>("overlay-attachment-change", ({ payload }) => setOverlayAttached(payload))
      .then((stop) => { unlisten = stop; })
      .catch((err) => setError(asError(err)));
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F11") return;
      event.preventDefault();
      void toggleFullscreen();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreenEnabled]);

  const teamConfigs = data && previewUiTokens
    ? { ...data.configs, ui_tokens: { ...(data.configs.ui_tokens || {}), ...previewUiTokens } }
    : data?.configs;
  const megaPetIcons = useMemo(() => new Set((data?.pets || [])
    .filter((pet) => pet.evolutionStage === "mega")
    .flatMap((pet) => [pet.label, `${pet.id}${pet.name}`, pet.name].map(normalizePetIconName))), [data?.pets]);

  return (
    <MegaPetIconContext.Provider value={megaPetIcons}>
    <main className={`${tab === "presets" ? "app-shell preset-shell" : "app-shell"}${overlayAttached ? " overlay-attached" : ""}`} style={data ? (previewUiTokens ? uiTokenStyleFromValues(previewUiTokens) : uiTokenStyle(data.configs)) : undefined}>
      <header className="app-header overlay-header" onPointerDown={dragWindow}>
        <nav className="tabs">
          <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>队伍面板</button>
          <button className={tab === "presets" ? "active" : ""} onClick={() => setTab("presets")}>精灵保存</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>界面配置</button>
          <button onClick={() => void load()}>刷新</button>
        </nav>
        {tab === "team" && teamDisplayMode !== "plugin" ? <section className="weather-panel">
            <label>
              <span className="ui-field-title">天气</span>
              <select value={weather} onChange={(event) => setWeather(event.target.value as (typeof WEATHER_OPTIONS)[number]["value"])}>
                {WEATHER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </section>
        : null}
      </header>
      {error ? <div className="error-banner">{error}</div> : null}
      <datalist id="pet-options">
        {data?.pets.map((pet) => <option key={pet.label} value={pet.label} />)}
      </datalist>
      {data ? (
        <>
          <div className="battle-view" hidden={tab !== "team"}>
            <TeamBattlePage
              presets={data.presets}
              pets={data.pets}
              elements={data.elements}
              configs={teamConfigs || data.configs}
              burstEffects={data.burstEffects}
              weather={weather}
              onWeatherChange={setWeather}
              onPresetsChanged={(presets) => setData((current) => current ? { ...current, presets } : current)}
              onConfigsChanged={(configs) => setData((current) => current ? { ...current, configs } : current)}
              onOverlayAttachmentChange={setOverlayAttached}
              onDisplayModeChange={setTeamDisplayMode}
            />
          </div>
          <div className="battle-view" hidden={tab !== "presets"}>
            <PresetManagerPage
              presets={data.presets}
              pets={data.pets}
              elements={data.elements}
              configs={data.configs}
              onPresetsChanged={(presets) => setData((current) => current ? { ...current, presets } : current)}
              onConfigsChanged={(configs) => setData((current) => current ? { ...current, configs } : current)}
            />
          </div>
          <div className="battle-view" hidden={tab !== "settings"}>
            <InterfaceSettingsPage configs={data.configs} onConfigsChanged={(configs) => setData((current) => current ? { ...current, configs } : current)} onPreviewValues={setPreviewUiTokens} burstEffects={data.burstEffects} />
          </div>
        </>
      ) : (
        <section className="loading-panel">正在读取 Python 核心和 JSON 数据...</section>
      )}
    </main>
    </MegaPetIconContext.Provider>
  );
}

export default App;
