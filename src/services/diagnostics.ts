import { invoke } from "@tauri-apps/api/core";
import { listen as nativeListen, type EventCallback } from "@tauri-apps/api/event";

export function diagnostic(name: string, details: Record<string, unknown> = {}) {
  if (name !== "start" && !/error|failed|panic|unhandled_rejection/.test(name)) return;
  void invoke("diagnostic_event", { name, details }).catch(() => undefined);
}

// Preserve listener behavior while reporting failures only.
export function diagnosticListen<T>(name: string, handler: EventCallback<T>) {
  return nativeListen<T>(name, (event) => {
    try {
      handler(event);
    } catch (error) {
      diagnostic("listener.error", { name, error: String(error) });
      throw error;
    }
  }).then((stop) => {
    return stop;
  }, (error) => {
    diagnostic("listener.registration_error", { name, error: String(error) });
    throw error;
  });
}

export function startFrontendDiagnostics() {
  const state = () => ({ focused: document.hasFocus(), visibility: document.visibilityState,
    attached: document.documentElement.classList.contains("overlay-attached") });
  diagnostic("start", { userAgent: navigator.userAgent, devicePixelRatio, ...state() });
  const error = (event: ErrorEvent) => diagnostic("error", {
    message: event.message, file: event.filename, line: event.lineno, stack: String(event.error?.stack ?? "").slice(0, 6000),
  });
  const rejection = (event: PromiseRejectionEvent) => diagnostic("unhandled_rejection", {
    message: String(event.reason), stack: String(event.reason?.stack ?? "").slice(0, 6000),
  });
  window.addEventListener("error", error);
  window.addEventListener("unhandledrejection", rejection);
  return () => {
    window.removeEventListener("error", error);
    window.removeEventListener("unhandledrejection", rejection);
  };
}
