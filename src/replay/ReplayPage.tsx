import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { prepareNumericCanvas, type NumericOcrMode } from "../numericOcr";

type SkillRegionKey = "skill1" | "skill2" | "skill3" | "skill4";
type RegionKey = "enemyHealth" | "selfHealth" | "enemyNotice" | "enemyDamage" | "selfNotice" | "selfDamage" | "enemyImage" | "selfImage" | SkillRegionKey;
type Region = { x: number; y: number; width: number; height: number };
type EventItem = { time: number; kind: "血量" | "提示" | "伤害"; text: string };
type OcrKind = NumericOcrMode | "number" | "text";
type NoticeEvent = { kind: "none" | "skill" | "summon" | "trait"; skill?: string; attack?: boolean };
type CapturedFrame = {
  videoTime: number;
  damage: Record<"enemyDamage" | "selfDamage", string>;
  health: Record<"enemyHealth" | "selfHealth", string>;
  signatures: Record<"enemyDamage" | "selfDamage", Uint8Array>;
};
type CaptureSession = {
  id: number;
  generation: number;
  noticeKey: "enemyNotice" | "selfNotice";
  startVideoTime: number;
  endVideoTime: number;
  expiresAt: number;
  lastCaptureTime: number;
  frames: CapturedFrame[];
  attackTarget: "enemyDamage" | "selfDamage" | null;
  complete: boolean;
  analysisInFlight: boolean;
  analyzedFrameCount: number;
  noticeImages: string[];
  noticeOcrQueued: boolean;
  latestDamage: string;
};
type NoticeRecognitionJob = { imageDataUrls: string[]; videoTime: number; sessionId: number; generation: number };
type ReplaySettings = { regions: Record<RegionKey, Region> };
type AppConfigs = Record<string, Record<string, unknown>>;
const REPLAY_SETTINGS_KEY = "rocodatebase.replay.settings.v1";
const SKILL_REGION_KEYS = ["skill1", "skill2", "skill3", "skill4"] as const;
const LIVE_NUMBER_REGION_KEYS = ["enemyHealth", "selfHealth", ...SKILL_REGION_KEYS] as const;
const OCR_KEYS = [...LIVE_NUMBER_REGION_KEYS, "enemyNotice", "enemyDamage", "selfNotice", "selfDamage"] as const;
const ACTIVE_REGION_KEYS = ["enemyHealth", "selfHealth", ...SKILL_REGION_KEYS, "enemyImage", "selfImage"] as const;
const REGION_FRAME_LABELS: Record<(typeof ACTIVE_REGION_KEYS)[number], string> = {
  enemyHealth: "敌方血量", selfHealth: "我方血量",
  skill1: "技能 1", skill2: "技能 2", skill3: "技能 3", skill4: "技能 4",
  enemyImage: "敌方图像", selfImage: "我方图像",
};
const CAPTURE_WINDOW_SECONDS = 3;
const PRE_EVENT_SECONDS = 1;
const CAPTURE_INTERVAL_SECONDS = 0.1;
const CAPTURE_RETENTION_MS = 30_000;
const DAMAGE_ANALYSIS_BATCH_FRAMES = 2;
const NOTICE_OCR_FRAME_COUNT = 3;
const IMAGE_FRAME_SAVE_INTERVAL_SECONDS = 0.3;
const MAX_IMAGE_FRAME_SAVES = 10;

const REGION_LABELS: Record<RegionKey, string> = {
  enemyHealth: "敌方血量百分比 OCR",
  selfHealth: "我方当前 / 最大生命 OCR",
  enemyNotice: "敌方技能 / 召唤",
  enemyDamage: "敌方受击伤害",
  selfNotice: "我方技能 / 召唤",
  selfDamage: "我方受击伤害",
  skill1: "技能 1 威力",
  skill2: "技能 2 威力",
  skill3: "技能 3 威力",
  skill4: "技能 4 威力",
  enemyImage: "敌方图像",
  selfImage: "我方图像",
};

const DEFAULT_REGIONS: Record<RegionKey, Region> = {
  enemyHealth: { x: 73, y: 12, width: 16, height: 7 },
  selfHealth: { x: 8, y: 76, width: 32, height: 12 },
  enemyNotice: { x: 5, y: 61, width: 88, height: 17 },
  enemyDamage: { x: 36, y: 20, width: 28, height: 28 },
  selfNotice: { x: 5, y: 78, width: 88, height: 17 },
  selfDamage: { x: 36, y: 52, width: 28, height: 28 },
  skill1: { x: 36, y: 20, width: 16, height: 8 },
  skill2: { x: 36, y: 52, width: 16, height: 8 },
  skill3: { x: 52, y: 20, width: 16, height: 8 },
  skill4: { x: 52, y: 52, width: 16, height: 8 },
  enemyImage: { x: 15, y: 15, width: 25, height: 35 },
  selfImage: { x: 15, y: 50, width: 25, height: 35 },
};

const REGION_OCR_KIND: Record<RegionKey, OcrKind> = {
  enemyHealth: "enemy_health", selfHealth: "self_health", enemyNotice: "text", enemyDamage: "number", selfNotice: "text", selfDamage: "number",
  skill1: "power", skill2: "power", skill3: "power", skill4: "power", enemyImage: "text", selfImage: "text",
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function ReplayPage({ configs, onConfigsChanged }: { configs: AppConfigs; onConfigsChanged: (configs: AppConfigs) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileUrlRef = useRef<string | null>(null);
  const noticeOcrBusyRef = useRef<Record<"enemyNotice" | "selfNotice", boolean>>({ enemyNotice: false, selfNotice: false });
  const forceRecognitionRef = useRef(false);
  const motionRef = useRef<Partial<Record<RegionKey, Uint8Array>>>({});
  // Pending prompt snapshots are keyed by side. Confirmed attacks move to the
  // active map, so later prompts never replace an earlier damage workflow.
  const captureSessionsRef = useRef(new Map<"enemyNotice" | "selfNotice", CaptureSession>());
  const pendingNoticeSessionsRef = useRef(new Map<number, CaptureSession>());
  const activeDamageSessionsRef = useRef(new Map<number, CaptureSession>());
  const captureSessionIndexRef = useRef(new Map<number, CaptureSession>());
  const noticeRecognitionQueuesRef = useRef<Record<"enemyNotice" | "selfNotice", NoticeRecognitionJob[]>>({ enemyNotice: [], selfNotice: [] });
  const lastNoticeSessionTimeRef = useRef<Record<"enemyNotice" | "selfNotice", number>>({ enemyNotice: -Infinity, selfNotice: -Infinity });
  const recognitionGenerationRef = useRef(0);
  const lastAnalyzedVideoTimeRef = useRef(-Infinity);
  const scanNoticesOnNextFrameRef = useRef(false);
  const saveFramesRef = useRef(false);
  const recentFramesRef = useRef<CapturedFrame[]>([]);
  const lastBufferedFrameTimeRef = useRef(-Infinity);
  const lastHealthOcrTimeRef = useRef(-Infinity);
  const imageFrameSavingRef = useRef(false);
  const imageFrameSaveCountRef = useRef(0);
  const numericRecognitionBusyRef = useRef(false);
  const imageTruthRef = useRef({ enemyImage: "", selfImage: "" });
  const captureSequenceRef = useRef(0);
  const lastNoticeTextRef = useRef<Record<"enemyNotice" | "selfNotice", string>>({ enemyNotice: "", selfNotice: "" });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [regions, setRegions] = useState<Record<RegionKey, Region>>(() => {
    const configuredRegions = configs.replay?.regions;
    if (configuredRegions && typeof configuredRegions === "object") {
      return { ...DEFAULT_REGIONS, ...(configuredRegions as Partial<Record<RegionKey, Region>>) };
    }
    try {
      const saved = JSON.parse(localStorage.getItem(REPLAY_SETTINGS_KEY) || "") as ReplaySettings;
      return saved.regions ? { ...DEFAULT_REGIONS, ...saved.regions } : DEFAULT_REGIONS;
    } catch { return DEFAULT_REGIONS; }
  });
  const [activeRegion, setActiveRegion] = useState<RegionKey>("enemyHealth");
  const [dragging, setDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [numericOcrTestMode, setNumericOcrTestMode] = useState(configs.replay?.numeric_ocr_test_mode === true || configs.replay?.health_ocr_test_mode === true);
  const [saveFrames, setSaveFrames] = useState(false);
  const [rate, setRate] = useState(1);
  const [duration, setDuration] = useState(0);
  const [videoAspect, setVideoAspect] = useState("16 / 9");
  const [currentTime, setCurrentTime] = useState(0);
  const [ocrValues, setOcrValues] = useState({ enemyHealth: "-", selfHealth: "-", enemyNotice: "-", selfNotice: "-", enemyDamage: "-", selfDamage: "-", skill1: "-", skill2: "-", skill3: "-", skill4: "-" });
  const [ocrRawValues, setOcrRawValues] = useState<Record<RegionKey, string>>({ enemyHealth: "-", selfHealth: "-", enemyNotice: "-", enemyDamage: "-", selfNotice: "-", selfDamage: "-", skill1: "-", skill2: "-", skill3: "-", skill4: "-", enemyImage: "-", selfImage: "-" });
  const [settingsMessage, setSettingsMessage] = useState("配置会自动保存");
  const [sampleLabels, setSampleLabels] = useState<Record<(typeof LIVE_NUMBER_REGION_KEYS)[number], string>>({
    enemyHealth: "", selfHealth: "", skill1: "", skill2: "", skill3: "", skill4: "",
  });
  const [sampleMessage, setSampleMessage] = useState("");
  const [imageTruth, setImageTruth] = useState({ enemyImage: "", selfImage: "" });
  const [imageSampleMessage, setImageSampleMessage] = useState("");
  const [imagePredictions, setImagePredictions] = useState({ enemyImage: "-", selfImage: "-" });
  const [isSavingImageFrames, setIsSavingImageFrames] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [flowStatus, setFlowStatus] = useState({ trigger: "等待提示变化", skill: "-", capture: "未采集", result: "-" });

  useEffect(() => () => { if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current); }, []);

  useEffect(() => {
    localStorage.setItem(REPLAY_SETTINGS_KEY, JSON.stringify({ regions } satisfies ReplaySettings));
  }, [regions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        step(event.key === "ArrowLeft" ? -5 : 5);
        return;
      }
      if (event.key.toLowerCase() === "x" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setIsAnalyzing((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
  }, [rate]);

  useEffect(() => { saveFramesRef.current = saveFrames; }, [saveFrames]);

  useEffect(() => { imageTruthRef.current = imageTruth; }, [imageTruth]);

  useEffect(() => {
    if (!isAnalyzing) return;
    const id = window.setInterval(() => analyzeFrame(), 50);
    return () => window.clearInterval(id);
  });

  useEffect(() => {
    if (!isSavingImageFrames) return;
    const id = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || video.paused || video.ended || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (imageFrameSaveCountRef.current >= MAX_IMAGE_FRAME_SAVES) {
        setIsSavingImageFrames(false);
        setImageSampleMessage(`帧保存完成：每个已填写真值的图像框保存 ${MAX_IMAGE_FRAME_SAVES} 张`);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      void saveImageFrames(canvas, video.currentTime).then((saved) => {
        if (saved) imageFrameSaveCountRef.current += 1;
      });
    }, IMAGE_FRAME_SAVE_INTERVAL_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, [isSavingImageFrames]);

  function addEvent(kind: EventItem["kind"], text: string) {
    const time = videoRef.current?.currentTime || 0;
    setEvents((items) => [...items.slice(-79), { time, kind, text }]);
  }

  function analyzeFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (video.currentTime + 0.05 < lastAnalyzedVideoTimeRef.current) resetRecognitionPipeline();
    lastAnalyzedVideoTimeRef.current = video.currentTime;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    if (video.currentTime - lastHealthOcrTimeRef.current >= 0.5) {
      lastHealthOcrTimeRef.current = video.currentTime;
      void recognizeRegions(canvas, LIVE_NUMBER_REGION_KEYS, video.currentTime);
    }
    if (forceRecognitionRef.current) {
      forceRecognitionRef.current = false;
      void recognizeRegions(canvas, OCR_KEYS, video.currentTime);
      return;
    }
  }

  function resetRecognitionPipeline() {
    recognitionGenerationRef.current += 1;
    motionRef.current = {};
    captureSessionsRef.current.clear();
    pendingNoticeSessionsRef.current.clear();
    activeDamageSessionsRef.current.clear();
    captureSessionIndexRef.current.clear();
    recentFramesRef.current = [];
    lastBufferedFrameTimeRef.current = -Infinity;
    lastHealthOcrTimeRef.current = -Infinity;
    noticeRecognitionQueuesRef.current = { enemyNotice: [], selfNotice: [] };
    lastNoticeSessionTimeRef.current = { enemyNotice: -Infinity, selfNotice: -Infinity };
    lastNoticeTextRef.current = { enemyNotice: "", selfNotice: "" };
    scanNoticesOnNextFrameRef.current = true;
    setFlowStatus({ trigger: "等待提示变化", skill: "-", capture: "未采集", result: "已重置为当前视频位置" });
  }

  function changedRegions(canvas: HTMLCanvasElement, keys: readonly RegionKey[]) {
    const changes: RegionKey[] = [];
    const sample = document.createElement("canvas");
    sample.width = 40;
    sample.height = 18;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) return changes;
    for (const key of keys) {
      const region = regions[key];
      const x = Math.floor(canvas.width * region.x / 100);
      const y = Math.floor(canvas.height * region.y / 100);
      const width = Math.max(1, Math.floor(canvas.width * region.width / 100));
      const height = Math.max(1, Math.floor(canvas.height * region.height / 100));
      context.drawImage(canvas, x, y, width, height, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      const signature = new Uint8Array(sample.width * sample.height);
      for (let index = 0; index < signature.length; index += 1) {
        const offset = index * 4;
        signature[index] = Math.round(pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114);
      }
      const previous = motionRef.current[key];
      motionRef.current[key] = signature;
      if (!previous) continue;
      let difference = 0;
      for (let index = 0; index < signature.length; index += 1) difference += Math.abs(signature[index] - previous[index]);
      if (difference / signature.length >= 14) changes.push(key);
    }
    return changes;
  }

  function startCaptureSession(videoTime: number, noticeKey: "enemyNotice" | "selfNotice") {
    // Prompt animations change pixels for several frames. This debounce keeps
    // one workflow per prompt while still allowing consecutive prompts.
    if (videoTime - lastNoticeSessionTimeRef.current[noticeKey] < 0.35) return null;
    lastNoticeSessionTimeRef.current[noticeKey] = videoTime;
    const session: CaptureSession = {
      id: ++captureSequenceRef.current,
      generation: recognitionGenerationRef.current,
      noticeKey,
      startVideoTime: videoTime,
      endVideoTime: videoTime + CAPTURE_WINDOW_SECONDS,
      expiresAt: Date.now() + CAPTURE_RETENTION_MS,
      lastCaptureTime: -Infinity,
      frames: [],
      attackTarget: null,
      complete: false,
      analysisInFlight: false,
      analyzedFrameCount: 0,
      noticeImages: [],
      noticeOcrQueued: false,
      latestDamage: "",
    };
    captureSessionsRef.current.set(noticeKey, session);
    pendingNoticeSessionsRef.current.set(session.id, session);
    captureSessionIndexRef.current.set(session.id, session);
    setFlowStatus((current) => ({ ...current, trigger: "提示区域变化", capture: "采集中（0 帧）", result: "等待技能分类" }));
    window.setTimeout(() => {
      session.frames.length = 0;
      if (captureSessionsRef.current.get(noticeKey)?.id === session.id) captureSessionsRef.current.delete(noticeKey);
      pendingNoticeSessionsRef.current.delete(session.id);
      activeDamageSessionsRef.current.delete(session.id);
      captureSessionIndexRef.current.delete(session.id);
    }, CAPTURE_RETENTION_MS);
    return session;
  }

  function collectNoticeFrame(canvas: HTMLCanvasElement, session: CaptureSession, videoTime: number) {
    if (session.noticeOcrQueued || session.noticeImages.length >= NOTICE_OCR_FRAME_COUNT) return;
    const noticeKey = session.noticeKey;
    const crop = createOcrCrop(canvas, regions[noticeKey], "text");
    session.noticeImages.push(crop.toDataURL("image/png"));
    if (session.noticeImages.length < NOTICE_OCR_FRAME_COUNT) return;
    session.noticeOcrQueued = true;
    noticeRecognitionQueuesRef.current[noticeKey].push({ imageDataUrls: session.noticeImages, videoTime, sessionId: session.id, generation: session.generation });
    if (!noticeOcrBusyRef.current[noticeKey]) void processNoticeRecognitionQueue(noticeKey);
  }

  async function processNoticeRecognitionQueue(noticeKey: "enemyNotice" | "selfNotice") {
    if (noticeOcrBusyRef.current[noticeKey]) return;
    const job = noticeRecognitionQueuesRef.current[noticeKey].shift();
    if (!job) return;
    noticeOcrBusyRef.current[noticeKey] = true;
    try {
      const response = await invoke<{ items: Array<{ text: string; event?: NoticeEvent }> }>("recognize_images", {
        images: job.imageDataUrls.map((imageDataUrl) => ({ key: noticeKey, imageDataUrl, mode: "text" })),
      });
      if (job.generation !== recognitionGenerationRef.current) return;
      const results = response.items.map((item) => ({ text: item.text.trim(), event: item.event }));
      const confirmed = results.find((item) => item.event?.kind === "skill" && item.event.attack);
      const best = confirmed || results.reduce((current, item) => item.text.length > current.text.length ? item : current, { text: "", event: undefined as NoticeEvent | undefined });
      const { text, event } = best;
      if (text && event) {
        setFlowStatus((current) => ({
          ...current,
          trigger: `${noticeKey === "selfNotice" ? "我方" : "敌方"}提示：${text}`,
          skill: event.kind === "skill" ? `${event.skill || "未知技能"}（${event.attack ? "攻击" : "非攻击"}）` : "未识别行为",
        }));
        startDamageWindow(noticeKey, event, job.videoTime, job.sessionId);
      }
      applyOcrValues({ [noticeKey]: text });
    } catch (error) {
      setSettingsMessage(`OCR 不可用：${String(error)}`);
    } finally {
      noticeOcrBusyRef.current[noticeKey] = false;
      if (noticeRecognitionQueuesRef.current[noticeKey].length) void processNoticeRecognitionQueue(noticeKey);
    }
  }

  function captureEventFrame(canvas: HTMLCanvasElement, videoTime: number) {
    const sessions = [...new Map([
      ...pendingNoticeSessionsRef.current.values(),
      ...activeDamageSessionsRef.current.values(),
    ].map((session) => [session.id, session])).values()].filter((session) =>
      !session.complete
      && videoTime <= session.endVideoTime
      && videoTime - session.lastCaptureTime >= CAPTURE_INTERVAL_SECONDS,
    );
    if (!sessions.length && videoTime - lastBufferedFrameTimeRef.current < CAPTURE_INTERVAL_SECONDS) return;
    const enemyDamageCrop = createOcrCrop(canvas, regions.enemyDamage, REGION_OCR_KIND.enemyDamage);
    const selfDamageCrop = createOcrCrop(canvas, regions.selfDamage, REGION_OCR_KIND.selfDamage);
    const damage = {
      enemyDamage: enemyDamageCrop.toDataURL("image/png"),
      selfDamage: selfDamageCrop.toDataURL("image/png"),
    };
    const health = {
      enemyHealth: createOcrCrop(canvas, regions.enemyHealth, REGION_OCR_KIND.enemyHealth).toDataURL("image/png"),
      selfHealth: createOcrCrop(canvas, regions.selfHealth, REGION_OCR_KIND.selfHealth).toDataURL("image/png"),
    };
    const signatures = {
      enemyDamage: canvasSignature(enemyDamageCrop),
      selfDamage: canvasSignature(selfDamageCrop),
    };
    const frame = { videoTime, damage, health, signatures };
    if (videoTime - lastBufferedFrameTimeRef.current >= CAPTURE_INTERVAL_SECONDS) {
      lastBufferedFrameTimeRef.current = videoTime;
      recentFramesRef.current.push(frame);
      recentFramesRef.current = recentFramesRef.current.filter((item) => item.videoTime >= videoTime - PRE_EVENT_SECONDS);
    }
    for (const session of sessions) {
      session.lastCaptureTime = videoTime;
      session.frames.push(frame);
      if (pendingNoticeSessionsRef.current.has(session.id)) collectNoticeFrame(canvas, session, videoTime);
      if (session.frames.length % 5 === 0) {
      setFlowStatus((current) => ({ ...current, capture: `采集中（${session.frames.length} 帧）` }));
    }
      if (session.attackTarget && session.frames.length > session.analyzedFrameCount && !session.analysisInFlight) {
        void analyzeCapturedFrames(session, false);
      }
      if (saveFramesRef.current) void invoke("save_replay_ocr_frames", {
      frames: [
        { region: "enemyDamage", imageDataUrl: damage.enemyDamage, videoTime, sessionId: session.id },
        { region: "selfDamage", imageDataUrl: damage.selfDamage, videoTime, sessionId: session.id },
        { region: "enemyHealth", imageDataUrl: health.enemyHealth, videoTime, sessionId: session.id },
        { region: "selfHealth", imageDataUrl: health.selfHealth, videoTime, sessionId: session.id },
      ],
    }).catch((error) => setSettingsMessage(`保存回放帧失败：${String(error)}`));
    }
  }

  function canvasSignature(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return new Uint8Array();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(1, Math.floor(Math.sqrt((canvas.width * canvas.height) / 320)));
    const values: number[] = [];
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const offset = (y * canvas.width + x) * 4;
        values.push(Math.round(pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114));
      }
    }
    return Uint8Array.from(values);
  }

  function finishCaptureSession(videoTime: number) {
    const sessions = new Map([
      ...pendingNoticeSessionsRef.current.values(),
      ...activeDamageSessionsRef.current.values(),
    ].map((session) => [session.id, session] as const));
    for (const session of sessions.values()) {
    if (session.complete) continue;
      if (videoTime <= session.endVideoTime) continue;
    session.complete = true;
    setFlowStatus((current) => ({ ...current, capture: `已保存 ${session.frames.length} 帧` }));
    if (session.attackTarget) {
      setFlowStatus((current) => ({ ...current, result: "分析候选伤害帧" }));
      void analyzeCapturedFrames(session, true);
    }
    }
  }

  async function analyzeCapturedFrames(session: CaptureSession, final: boolean) {
    const target = session.attackTarget;
    if (session.generation !== recognitionGenerationRef.current || !target || !session.frames.length || session.analysisInFlight || Date.now() >= session.expiresAt) return;
    const frameCount = session.frames.length;
    const scanEndFrame = Math.min(frameCount, session.analyzedFrameCount + DAMAGE_ANALYSIS_BATCH_FRAMES);
    // Every frame in the event window belongs to the event. Do not use
    // visual-difference filtering to decide which images are OCR inputs.
    const candidates = session.frames.slice(session.analyzedFrameCount, scanEndFrame);
    if (!candidates.length) return;
    session.analysisInFlight = true;
    const last = session.frames[session.frames.length - 1];
    try {
      const analysisFrames = [
        ...candidates.map((frame) => ({ region: target, imageDataUrl: frame.damage[target], videoTime: frame.videoTime, sessionId: session.id, category: "ocr-analysis" })),
        ...(final && scanEndFrame === frameCount ? [
          { region: "enemyHealth", imageDataUrl: last.health.enemyHealth, videoTime: last.videoTime, sessionId: session.id, category: "ocr-analysis" },
          { region: "selfHealth", imageDataUrl: last.health.selfHealth, videoTime: last.videoTime, sessionId: session.id, category: "ocr-analysis" },
        ] : []),
      ];
      if (saveFramesRef.current) void invoke("save_replay_ocr_frames", { frames: analysisFrames }).catch((error) => setSettingsMessage(`保存 OCR 分析帧失败：${String(error)}`));
      const images = analysisFrames.map((frame) => ({ key: frame.region, imageDataUrl: frame.imageDataUrl, mode: REGION_OCR_KIND[frame.region as RegionKey] }));
      const response = await invoke<{ items: Array<{ text: string }> }>("recognize_images", { images });
      if (session.generation !== recognitionGenerationRef.current) return;
      const damageValues = response.items.slice(0, candidates.length)
        .map((item) => item.text.match(/\d{1,7}/)?.[0])
        .filter((value): value is string => Boolean(value));
      // Damage popups can count upward. Preserve the latest valid value rather
      // than the largest value from an earlier animation frame.
      const latestBatchDamage = damageValues[damageValues.length - 1] || "";
      if (latestBatchDamage) session.latestDamage = latestBatchDamage;
      const finalDamage = session.latestDamage;
      if (final && scanEndFrame === frameCount) {
        applyOcrValues({
          [target]: finalDamage || "",
          enemyHealth: response.items[candidates.length]?.text.trim() || "",
          selfHealth: response.items[candidates.length + 1]?.text.trim() || "",
        });
      } else if (finalDamage) {
        applyOcrValues({ [target]: finalDamage });
      }
      session.analyzedFrameCount = Math.max(session.analyzedFrameCount, scanEndFrame);
      setFlowStatus((current) => ({ ...current, result: finalDamage ? `伤害 ${finalDamage}，已校准血量` : "未识别到有效伤害" }));
    } catch (error) {
      setSettingsMessage(`OCR 不可用：${String(error)}`);
    } finally {
      session.analysisInFlight = false;
      if (session.generation === recognitionGenerationRef.current && session.analyzedFrameCount < session.frames.length) {
        const continueAnalysis = () => {
          if (!session.analysisInFlight) void analyzeCapturedFrames(session, session.complete);
        };
        window.setTimeout(continueAnalysis, 25);
      }
    }
  }

  function applyOcrValues(values: Partial<Record<RegionKey, string>>, rawValues: Partial<Record<RegionKey, string>> = values) {
    setOcrRawValues((current) => ({ ...current, ...rawValues }));
    const percent = values.enemyHealth?.match(/(?:100|[1-9]?\d)\s*%?/)?.[0]?.replace(/\s/g, "");
    const hp = values.selfHealth?.match(/\d+\s*\/\s*\d+/);
    const enemyDamage = values.enemyDamage?.match(/\d{1,7}/);
    const selfDamage = values.selfDamage?.match(/\d{1,7}/);
    const skillPower = (key: SkillRegionKey, current: string) => {
      if (values[key] === undefined) return current;
      return values[key]?.match(/\d{1,7}/)?.[0] || "-";
    };
    setOcrValues((current) => ({
      enemyHealth: percent && Number(percent.replace("%", "")) <= 100 ? `${percent.replace("%", "")}%` : current.enemyHealth,
      selfHealth: hp ? hp[0].replace(/\s/g, "") : current.selfHealth,
      enemyNotice: values.enemyNotice || current.enemyNotice,
      selfNotice: values.selfNotice || current.selfNotice,
      enemyDamage: enemyDamage ? enemyDamage[0] : current.enemyDamage,
      selfDamage: selfDamage ? selfDamage[0] : current.selfDamage,
      skill1: skillPower("skill1", current.skill1),
      skill2: skillPower("skill2", current.skill2),
      skill3: skillPower("skill3", current.skill3),
      skill4: skillPower("skill4", current.skill4),
    }));
  }

  function refreshFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
  }

  function createOcrCrop(canvas: HTMLCanvasElement, region: Region, mode: OcrKind, preprocess = true) {
    const sourceWidth = Math.max(1, Math.floor(canvas.width * region.width / 100));
    const sourceHeight = Math.max(1, Math.floor(canvas.height * region.height / 100));
    const sourceX = Math.floor(canvas.width * region.x / 100);
    const sourceY = Math.floor(canvas.height * region.y / 100);
    if (mode !== "text") {
      const original = document.createElement("canvas");
      original.width = sourceWidth;
      original.height = sourceHeight;
      original.getContext("2d")?.drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
      return preprocess ? prepareNumericCanvas(original, sourceWidth, sourceHeight) : original;
    }
    const scale = 3;
    const padding = 6;
    const crop = document.createElement("canvas");
    crop.width = sourceWidth * scale + padding * 2;
    crop.height = sourceHeight * scale + padding * 2;
    const context = crop.getContext("2d", { willReadFrequently: true });
    if (!context) return crop;
    context.fillStyle = "#000";
    context.fillRect(0, 0, crop.width, crop.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, padding, padding, sourceWidth * scale, sourceHeight * scale);
    return crop;
  }

  function createImageSampleCrop(canvas: HTMLCanvasElement, region: Region) {
    const width = Math.max(1, Math.floor(canvas.width * region.width / 100));
    const height = Math.max(1, Math.floor(canvas.height * region.height / 100));
    const crop = document.createElement("canvas");
    crop.width = width;
    crop.height = height;
    crop.getContext("2d")?.drawImage(
      canvas,
      Math.floor(canvas.width * region.x / 100),
      Math.floor(canvas.height * region.y / 100),
      width,
      height,
      0,
      0,
      width,
      height,
    );
    return crop;
  }

  async function recognizeRegions(canvas: HTMLCanvasElement, keys: readonly RegionKey[], sourceVideoTime: number, debugCategory?: string) {
    const noticeKeys = keys.filter((key): key is "enemyNotice" | "selfNotice" => key === "enemyNotice" || key === "selfNotice");
    noticeKeys.forEach((key) => { noticeOcrBusyRef.current[key] = true; });
    try {
      // OCR is asynchronous. Keep the exact capture window that supplied each
      // notice image so a later notice change cannot redirect its damage frames.
      const noticeSessionIds = Object.fromEntries(noticeKeys
        .map((key) => [key, captureSessionsRef.current.get(key)?.id])) as Partial<Record<"enemyNotice" | "selfNotice", number>>;
      const images = keys.map((key) => {
        const region = regions[key];
        const crop = createOcrCrop(canvas, region, REGION_OCR_KIND[key]);
        return { key, imageDataUrl: crop.toDataURL("image/png"), mode: REGION_OCR_KIND[key] };
      });
      if (debugCategory) {
        const saved = await invoke<{ directory: string }>("save_ocr_debug_images", { category: debugCategory, images });
        setSettingsMessage(`测试图像已保存：${saved.directory}`);
      }
      const response = await invoke<{ items: Array<{ text: string; rawText?: string; event?: NoticeEvent }> }>("recognize_images", { images });
      const values = Object.fromEntries(keys.map((key, index) => [key, response.items[index]?.text.trim() || ""])) as Partial<Record<RegionKey, string>>;
      const rawValues = Object.fromEntries(keys.map((key, index) => [key, response.items[index]?.rawText?.trim() || response.items[index]?.text.trim() || ""])) as Partial<Record<RegionKey, string>>;
      keys.forEach((key, index) => {
        if (key !== "enemyNotice" && key !== "selfNotice") return;
        const text = values[key] || "";
        if (!text) return;
        const sessionId = noticeSessionIds[key];
        const session = sessionId ? captureSessionIndexRef.current.get(sessionId) : captureSessionsRef.current.get(key);
        if (text === lastNoticeTextRef.current[key] && session?.attackTarget) return;
        lastNoticeTextRef.current[key] = text;
        const event = response.items[index]?.event;
        if (event) {
          setFlowStatus((current) => ({
            ...current,
            trigger: `${key === "selfNotice" ? "我方" : "敌方"}提示：${text}`,
            skill: event.kind === "skill" ? `${event.skill || "未知技能"}（${event.attack ? "攻击" : "非攻击"}）` : event.kind === "summon" ? "召唤" : event.kind === "trait" ? "特性" : "未识别行为",
          }));
          startDamageWindow(key, event, sourceVideoTime, sessionId);
        }
      });
      applyOcrValues(values, rawValues);
      return values;
    } catch (error) {
      setSettingsMessage(`OCR 不可用：${String(error)}`);
      return {} as Partial<Record<RegionKey, string>>;
    } finally {
      noticeKeys.forEach((key) => { noticeOcrBusyRef.current[key] = false; });
    }
  }

  function startDamageWindow(noticeKey: "enemyNotice" | "selfNotice", event: NoticeEvent, sourceVideoTime: number, sessionId?: number) {
    if (event.kind !== "skill" || !event.attack) return;
    // Resolve the exact window that supplied the notice image. The current
    // side's session may already have advanced to a newer event, but the old
    // fixed window must still receive its recognized attack result.
    const session = sessionId ? captureSessionIndexRef.current.get(sessionId) : captureSessionsRef.current.get(noticeKey);
    if (!session || session.id !== sessionId || Date.now() >= session.expiresAt) return;
    // Bind the event to the frame that was sent to text OCR, never to the
    // later time at which the asynchronous OCR call happened to return.
    session.startVideoTime = Math.max(0, sourceVideoTime - PRE_EVENT_SECONDS);
    session.endVideoTime = sourceVideoTime + CAPTURE_WINDOW_SECONDS;
    session.frames = [...new Map([
      ...recentFramesRef.current,
      ...session.frames,
    ].map((frame) => [frame.videoTime, frame])).values()].filter((frame) =>
      frame.videoTime >= session.startVideoTime && frame.videoTime <= session.endVideoTime,
    );
    session.analyzedFrameCount = 0;
    session.attackTarget = noticeKey === "selfNotice" ? "enemyDamage" : "selfDamage";
    // This is now a durable, independent event workflow. Free the side's
    // pending slot so the next "use skill" prompt gets its own session while
    // this fixed window continues collecting and analyzing damage frames.
    if (captureSessionsRef.current.get(noticeKey)?.id === session.id) captureSessionsRef.current.delete(noticeKey);
    pendingNoticeSessionsRef.current.delete(session.id);
    activeDamageSessionsRef.current.set(session.id, session);
    session.complete = (videoRef.current?.currentTime || 0) > session.endVideoTime;
    if (session.frames.length > session.analyzedFrameCount && !session.analysisInFlight) {
      void analyzeCapturedFrames(session, session.complete);
    }
    setFlowStatus((current) => ({ ...current, capture: `固定窗口 ${formatTime(session.startVideoTime)} - ${formatTime(session.endVideoTime)}`, result: "等待窗口结束" }));
    if (session.complete) void analyzeCapturedFrames(session, true);
  }

  function chooseVideo(file: File | undefined) {
    if (!file) return;
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    const url = URL.createObjectURL(file);
    fileUrlRef.current = url;
    setVideoUrl(url);
    setVideoName(file.name);
    setEvents([]);
    setCurrentTime(0);
    setDuration(0);
    setIsAnalyzing(false);
    motionRef.current = {};
    forceRecognitionRef.current = false;
    resetRecognitionPipeline();
    lastAnalyzedVideoTimeRef.current = -Infinity;
    setFlowStatus({ trigger: "等待提示变化", skill: "-", capture: "未采集", result: "-" });
    setSettingsMessage("视频已导入，点击“识别当前帧”或按 X 才会启动 OCR");
  }

  function moveRegion(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const region = regions[activeRegion];
    const x = clamp(((event.clientX - bounds.left) / bounds.width) * 100 - region.width / 2, 0, 100 - region.width);
    const y = clamp(((event.clientY - bounds.top) / bounds.height) * 100 - region.height / 2, 0, 100 - region.height);
    setRegions((current) => ({ ...current, [activeRegion]: { ...current[activeRegion], x, y } }));
  }

  function step(delta: number) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = clamp(video.currentTime + delta, 0, video.duration || 0);
  }

  function updateActiveRegion(partial: Partial<Region>) {
    setRegions((current) => {
      const region = current[activeRegion];
      const width = clamp(partial.width ?? region.width, 1, 96);
      const height = clamp(partial.height ?? region.height, 1, 96);
      const centerX = region.x + region.width / 2;
      const centerY = region.y + region.height / 2;
      return { ...current, [activeRegion]: { x: clamp(centerX - width / 2, 0, 100 - width), y: clamp(centerY - height / 2, 0, 100 - height), width, height } };
    });
  }

  function recognizeCurrentFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    forceRecognitionRef.current = true;
    analyzeFrame();
  }

  async function recognizeNumericFrame() {
    if (numericRecognitionBusyRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    numericRecognitionBusyRef.current = true;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    try {
      await recognizeRegions(canvas, LIVE_NUMBER_REGION_KEYS, video.currentTime, numericOcrTestMode ? "replay-numeric" : undefined);
    } finally {
      numericRecognitionBusyRef.current = false;
    }
  }

  async function changeNumericOcrTestMode(enabled: boolean) {
    const previous = numericOcrTestMode;
    setNumericOcrTestMode(enabled);
    try {
      const result = await invoke<{ configs: AppConfigs }>("save_picker_config", {
        payload: { section: "replay", values: { numeric_ocr_test_mode: enabled } },
      });
      onConfigsChanged(result.configs);
      setSettingsMessage(enabled ? "数字测试模式已开启" : "数字测试模式已关闭");
    } catch (error) {
      setNumericOcrTestMode(previous);
      setSettingsMessage(`保存失败：${String(error)}`);
    }
  }

  async function saveSample(region: (typeof LIVE_NUMBER_REGION_KEYS)[number]) {
    const label = sampleLabels[region].trim().replace(/\s/g, "");
    if (!/^(?:[0-9/%]+|-)$/.test(label)) {
      setSampleMessage(`${REGION_FRAME_LABELS[region]}真值只能填写数字、/、% 或 -`);
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const originalCrop = createOcrCrop(canvas, regions[region], REGION_OCR_KIND[region], false);
    try {
      const result = await invoke<{ file: string }>("save_labeled_ocr_sample", { imageDataUrl: originalCrop.toDataURL("image/png"), region, label, videoTime: video.currentTime });
      setSampleMessage(`${REGION_FRAME_LABELS[region]}已保存：${result.file}`);
      setSampleLabels((current) => ({ ...current, [region]: "" }));
    } catch (error) {
      setSampleMessage(`保存失败：${String(error)}`);
    }
  }

  async function saveImageSample(region: "enemyImage" | "selfImage") {
    const truth = imageTruth[region].trim();
    if (!truth) {
      setImageSampleMessage("请填写图像真值");
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const crop = createImageSampleCrop(canvas, regions[region]);
    try {
      const result = await invoke<{ file: string }>("save_labeled_image_sample", {
        imageDataUrl: crop.toDataURL("image/png"), region, truth, videoTime: video.currentTime,
      });
      setImageSampleMessage(`已保存：${result.file}`);
      setImageTruth((current) => ({ ...current, [region]: "" }));
    } catch (error) {
      setImageSampleMessage(`保存失败：${String(error)}`);
    }
  }

  async function saveImageFrames(canvas: HTMLCanvasElement, videoTime: number) {
    if (imageFrameSavingRef.current) return false;
    const truths = imageTruthRef.current;
    const imageRegions = (["enemyImage", "selfImage"] as const).filter((region) => truths[region].trim());
    if (!imageRegions.length) {
      setImageSampleMessage("帧保存模式需要至少填写一个图像真值");
      return false;
    }
    imageFrameSavingRef.current = true;
    try {
      await Promise.all(imageRegions.map((region) => {
        const crop = createImageSampleCrop(canvas, regions[region]);
        return invoke("save_labeled_image_sample", {
          imageDataUrl: crop.toDataURL("image/png"), region, truth: truths[region].trim(), videoTime,
        });
      }));
      return true;
    } catch (error) {
      setImageSampleMessage(`帧保存失败：${String(error)}`);
      return false;
    } finally {
      imageFrameSavingRef.current = false;
    }
  }

  async function classifyImage(region: "enemyImage" | "selfImage") {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const crop = createImageSampleCrop(canvas, regions[region]);
    try {
      const result = await invoke<{ items: Array<{ label: string; confidence: number }> }>("classify_image_samples", {
        payload: { images: [{ imageDataUrl: crop.toDataURL("image/png") }] },
      });
      const item = result.items[0];
      setImagePredictions((current) => ({ ...current, [region]: item ? `${item.label} ${(item.confidence * 100).toFixed(1)}%` : "未识别" }));
    } catch (error) {
      setImageSampleMessage(`图像识别失败：${String(error)}`);
    }
  }

  async function saveSettings() {
    localStorage.setItem(REPLAY_SETTINGS_KEY, JSON.stringify({ regions } satisfies ReplaySettings));
    try {
      const result = await invoke<{ configs: AppConfigs }>("save_picker_config", {
        payload: { section: "replay", values: { regions } },
      });
      onConfigsChanged(result.configs);
      setSettingsMessage("已保存校准配置");
    } catch (error) {
      setSettingsMessage(`保存失败：${String(error)}`);
    }
  }

  function resetSettings() {
    setRegions(DEFAULT_REGIONS);
    setSettingsMessage("已恢复默认区域");
  }

  return <section className="replay-page">
    <header className="replay-header">
      <div><h2>对局回放识别</h2><p>导入录像后校准区域，按 X 开始或暂停调试分析。</p></div>
      <label className="replay-file-button">导入视频<input type="file" accept="video/mp4,video/webm,video/ogg" onChange={(event) => chooseVideo(event.target.files?.[0])} /></label>
    </header>
    <div className="replay-layout">
      <section className="replay-workspace">
        <div className="video-stage" style={{ aspectRatio: videoAspect }} onPointerMove={moveRegion} onPointerUp={() => setDragging(false)} onPointerLeave={() => setDragging(false)}>
          {videoUrl ? <video ref={videoRef} src={videoUrl} onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration); setVideoAspect(`${event.currentTarget.videoWidth} / ${event.currentTarget.videoHeight}`); }} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onLoadedData={refreshFrame} onSeeking={resetRecognitionPipeline} onSeeked={refreshFrame} /> : <div className="video-empty">选择一段 MP4 / WebM 录像开始调试</div>}
          {videoUrl ? ACTIVE_REGION_KEYS.map((key) => {
            const region = regions[key];
            return <button key={key} className={`roi ${activeRegion === key ? "active" : ""}`} style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }} onPointerDown={(event) => { event.preventDefault(); setActiveRegion(key); setDragging(true); }} title={`拖动 ${REGION_FRAME_LABELS[key]}`}><span>{REGION_FRAME_LABELS[key]}</span></button>;
          }) : null}
        </div>
        <div className="replay-controls">
          <button onClick={() => step(-1 / 15)} title="后退一帧">&lt;</button>
          <button onClick={() => step(-5)} title="后退 5 秒">-5s</button>
          <button onClick={() => { const video = videoRef.current; if (!video) return; video.paused ? void video.play() : video.pause(); }}>播放 / 暂停</button>
          <button onClick={() => step(5)} title="快进 5 秒">+5s</button>
          <button onClick={() => step(1 / 15)} title="前进一帧">&gt;</button>
          <button className={isAnalyzing ? "active" : ""} onClick={() => setIsAnalyzing((value) => !value)} disabled={!videoUrl}>{isAnalyzing ? "停止分析" : "开始分析 (X)"}</button>
          <button className={isSavingImageFrames ? "active" : ""} onClick={() => setIsSavingImageFrames((value) => { if (!value) imageFrameSaveCountRef.current = 0; return !value; })} disabled={!videoUrl}>图像帧保存：{isSavingImageFrames ? `${imageFrameSaveCountRef.current}/${MAX_IMAGE_FRAME_SAVES}` : "关"}</button>
          <select value={rate} onChange={(event) => setRate(Number(event.target.value))} aria-label="播放速度"><option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option></select>
          <span>{videoName || "尚未导入视频"}</span>
        </div>
        <div className="replay-progress"><span>{formatTime(currentTime)}</span><input type="range" min="0" max={duration || 0} step="0.01" value={Math.min(currentTime, duration || 0)} disabled={!videoUrl} aria-label="视频进度" onChange={(event) => { const video = videoRef.current; const value = Number(event.target.value); if (video) video.currentTime = value; setCurrentTime(value); }} /><span>{formatTime(duration)}</span></div>
        <section className="ocr-sample-panel">
          <h3>图像样本与识别</h3>
          <div className="image-sample-grid">
            {(["enemyImage", "selfImage"] as const).map((region) => <div className="image-sample-entry" key={region}><label>{REGION_LABELS[region]} 真值<input value={imageTruth[region]} onChange={(event) => setImageTruth((current) => ({ ...current, [region]: event.target.value }))} /></label><div><button onClick={() => void classifyImage(region)} disabled={!videoUrl}>识别</button><button onClick={() => void saveImageSample(region)} disabled={!videoUrl}>保存</button></div><p>{imagePredictions[region]}</p></div>)}
          </div>
          {imageSampleMessage ? <p className="sample-message">{imageSampleMessage}</p> : null}
        </section>
      </section>
      <aside className="replay-sidebar">
        <section className="replay-region-panel">
          <h3>识别框</h3>
          {ACTIVE_REGION_KEYS.map((key) => <button key={key} className={activeRegion === key ? "active" : ""} onClick={() => setActiveRegion(key)}>{REGION_FRAME_LABELS[key]}</button>)}
          <label className="region-size-control">宽度 {Math.round(regions[activeRegion].width)}%<input type="range" min="1" max="96" value={regions[activeRegion].width} onChange={(event) => updateActiveRegion({ width: Number(event.target.value) })} /></label>
          <label className="region-size-control">高度 {Math.round(regions[activeRegion].height)}%<input type="range" min="1" max="96" value={regions[activeRegion].height} onChange={(event) => updateActiveRegion({ height: Number(event.target.value) })} /></label>
          <div className="replay-settings-actions"><button onClick={() => void saveSettings()}>保存配置</button><button onClick={resetSettings}>恢复默认</button></div>
          <p>{settingsMessage}</p>
        </section>
        <section className="replay-number-results">
          <h3>数字识别结果</h3>
          <div className="replay-number-actions">
            <button onClick={() => void recognizeNumericFrame()} disabled={!videoUrl}>开始识别</button>
            <label><input type="checkbox" checked={numericOcrTestMode} onChange={(event) => void changeNumericOcrTestMode(event.target.checked)} />测试模式</label>
          </div>
          <div className="replay-result-columns"><span /><span>原始</span><span>处理后</span></div>
          <dl>
            <div><dt>敌方百分比</dt><dd>{ocrRawValues.enemyHealth}</dd><dd>{ocrValues.enemyHealth}</dd></div>
            <div><dt>我方生命</dt><dd>{ocrRawValues.selfHealth}</dd><dd>{ocrValues.selfHealth}</dd></div>
            {SKILL_REGION_KEYS.map((key, index) => <div key={key}><dt>技能 {index + 1}</dt><dd>{ocrRawValues[key]}</dd><dd>{ocrValues[key]}</dd></div>)}
            <div className="replay-analysis-row"><dt>分析状态</dt><dd>{isAnalyzing ? "运行中" : "已暂停"}</dd></div>
          </dl>
          <div className="numeric-sample-panel">
            <h4>保存原始裁图与真值</h4>
            {LIVE_NUMBER_REGION_KEYS.map((region) => <div className="numeric-sample-row" key={region}>
              <label htmlFor={`numeric-sample-${region}`}>{REGION_FRAME_LABELS[region]}</label>
              <input
                id={`numeric-sample-${region}`}
                value={sampleLabels[region]}
                inputMode="text"
                placeholder="真值"
                onChange={(event) => setSampleLabels((current) => ({ ...current, [region]: event.target.value }))}
              />
              <button onClick={() => void saveSample(region)} disabled={!videoUrl}>保存</button>
            </div>)}
            {sampleMessage ? <p className="sample-message">{sampleMessage}</p> : null}
          </div>
        </section>
      </aside>
    </div>
    <canvas ref={canvasRef} hidden />
  </section>;
}
