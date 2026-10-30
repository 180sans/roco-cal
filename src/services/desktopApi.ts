import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { EnemyAttackSkillResponse } from "../enemyAttack";
import type { NumericOcrMode } from "../numericOcr";
import type { TraitPowerCandidates } from "../traitAlignment";
import type {
  AppState, ApplySkillBuffsResult, BattleResult, BuffShortcutEntry, PickerConfigs,
  PresetGroup, PresetManagerResult, QuickSkillResult, RequiredPowerResponse,
  SkillListResult, SkillTriggerInfo, WillpowerResponse, ExternalIconCatalog,
} from "./desktopTypes";
import { createPromiseCache } from "./promiseCache";

type Payload = Record<string, unknown>;
export type ConfigSection = "pet_picker" | "trait_picker" | "skill_picker" | "ui_tokens" | "burst_panel" | "team_layout" | "replay";
type ImageSample = { key?: string; imageDataUrl: string };
type NumericImage = ImageSample & { key: string; mode: NumericOcrMode };
type CaptureRequest = {
  regions: Array<{ key: string; x: number; y: number; right: number; bottom: number }>;
  viewportWidth: number;
  viewportHeight: number;
};

// Keep transport details here; callers retain their existing state, timing and error handling.
export const desktopApi = {
  appState: () => invoke<AppState>("app_state"),
  externalIcons: () => invoke<ExternalIconCatalog>("external_icons"),
  openConfigDirectory: () => invoke<void>("open_config_directory"),
  listSkills: (payload: Payload) => invoke<SkillListResult>("list_skills", { payload }),
  listBuffSkills: (payload: Payload) => invoke<{ items: BuffShortcutEntry[] }>("list_buff_skills", { payload }),
  traitInfo: (payload: Payload) => invoke<any>("trait_info", { payload }),
  skillTriggerInfo: (payload: Payload) => invoke<SkillTriggerInfo>("skill_trigger_info", { payload }),

  // Raw transport; UI saves go through configSaves to coordinate publication.
  savePickerConfig: (section: ConfigSection, values: Payload) =>
    invoke<{ configs: PickerConfigs }>("save_picker_config", { payload: { section, values } }),
  managePreset: (payload: Payload) => invoke<PresetManagerResult>("manage_preset", { payload }),
  savePreset: (payload: Payload) => invoke<{ presets: PresetGroup[]; presetName: string }>("save_preset", { payload }),
  importTeamCode: (payload: Payload) => invoke<{ presets: PresetGroup[]; groupName: string; report: string[] }>("import_team_code", { payload }),

  applySkillBuffs: (payload: Payload) => invoke<ApplySkillBuffsResult>("apply_skill_buffs", { payload }),
  calculateBattle: (payload: Payload) => invoke<{ results: BattleResult[] }>("calculate_battle", { payload }),
  calculateQuickSkills: (payload: Payload) => invoke<{ items: QuickSkillResult[] }>("calculate_quick_skills", { payload }),
  calculateQuickSkillsBatch: (payload: Payload) => invoke<{ items: Array<{ items: QuickSkillResult[] }> }>("calculate_quick_skills_batch", { payload }),
  calculateEnemyAttackSkills: (payload: Payload) => invoke<EnemyAttackSkillResponse>("calculate_enemy_attack_skills", { payload }),
  calculateWatchAdvantages: (payload: Payload) => invoke<Record<string, number>>("calculate_watch_advantages", { payload }),
  calculateWillpower: (payload: Payload) => invoke<WillpowerResponse>("calculate_willpower", { payload }),
  calculateRequiredPower: (payload: Payload) => invoke<RequiredPowerResponse>("calculate_required_power", { payload }),
  traitPowerCandidates: (payload: Payload) => invoke<TraitPowerCandidates>("trait_power_candidates", { payload }),

  recognizeImages: (images: NumericImage[]) => invoke<{ items: Array<{ text: string }> }>("recognize_images", { images }),
  classifyImageSamples: (payload: { images: ImageSample[] }) => invoke<{ items: Array<{ label: string }> }>("classify_image_samples", { payload }),
  saveOcrDebugImages: (category: string, images: ImageSample[]) => invoke("save_ocr_debug_images", { category, images }),
  recordRecognitionTiming: (message: string) => invoke("record_recognition_timing", { message }),

  captureOverlayTarget: (args: CaptureRequest) => invoke<{ regions: Record<string, string> }>("capture_overlay_target", args),
  setOverlayClickThrough: (enabled: boolean) => invoke("update_overlay_click_through", { enabled }),
  attachOverlayTarget: (hwnd: string) => invoke<{ attached: boolean; hwnd: string }>("attach_overlay_target", { hwnd }),
  detachOverlayTarget: () => invoke("detach_overlay_target"),
};

const skillLists = createPromiseCache<string, SkillListResult>();
const traitInfos = createPromiseCache<string, any>();
const skillTriggerInfos = createPromiseCache<string, SkillTriggerInfo>();

export function externalIconUrl(path: string) {
  return convertFileSrc(path);
}

// Preserve the existing keys, including payload property order and rejected Promises.
export function cachedListSkills(petQuery: string) {
  return skillLists(petQuery || "", () => desktopApi.listSkills({ petQuery, query: "" }));
}

export function cachedTraitInfo(payload: Payload) {
  return traitInfos(JSON.stringify(payload), () => desktopApi.traitInfo(payload));
}

export function cachedSkillTriggerInfo(skillName: string) {
  return skillTriggerInfos(skillName, () => desktopApi.skillTriggerInfo({ skill_name: skillName }));
}
