import { invoke } from "@tauri-apps/api/core";
import { listen as nativeListen, type EventCallback } from "@tauri-apps/api/event";

export function diagnostic(name: string, details: Record<string, unknown> = {}) {
  void invoke("diagnostic_event", { name, details }).catch(() => undefined);
}

// Wrap the actual handlers so receipt means that the business listener is mounted.
export function diagnosticListen<T>(name: string, handler: EventCallback<T>) {
  diagnostic("listener.register", { name });
  return nativeListen<T>(name, (event) => {
    diagnostic("listener.received", { name, eventId: event.id });
    try {
      handler(event);
      diagnostic("listener.dispatched", { name, eventId: event.id });
    } catch (error) {
      diagnostic("listener.error", { name, error: String(error) });
      throw error;
    }
  }).then((stop) => {
    diagnostic("listener.ready", { name });
    return () => { diagnostic("listener.removed", { name }); stop(); };
  }, (error) => {
    diagnostic("listener.registration_error", { name, error: String(error) });
    throw error;
  });
}

export function startFrontendDiagnostics() {
  const state = () => ({ focused: document.hasFocus(), visibility: document.visibilityState,
    attached: document.documentElement.classList.contains("overlay-attached") });
  diagnostic("start", { userAgent: navigator.userAgent, devicePixelRatio, ...state() });
  const focus = () => diagnostic("focus", state());
  const blur = () => diagnostic("blur", state());
  const visibility = () => diagnostic("visibility", state());
  const error = (event: ErrorEvent) => diagnostic("error", {
    message: event.message, file: event.filename, line: event.lineno, stack: String(event.error?.stack ?? "").slice(0, 6000),
  });
  const rejection = (event: PromiseRejectionEvent) => diagnostic("unhandled_rejection", {
    message: String(event.reason), stack: String(event.reason?.stack ?? "").slice(0, 6000),
  });
  window.addEventListener("focus", focus);
  window.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("error", error);
  window.addEventListener("unhandledrejection", rejection);
  const timer = window.setInterval(() => diagnostic("heartbeat", state()), 15000);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", focus);
    window.removeEventListener("blur", blur);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("error", error);
    window.removeEventListener("unhandledrejection", rejection);
  };
}
