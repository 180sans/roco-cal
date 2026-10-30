/** The existing immediate-drag subscription; callers own coordinates and policy. */
export function trackPointerMovement(
  move: (event: PointerEvent) => void,
  onStop?: () => void,
  trackCancel = false,
) {
  const stop = () => {
    onStop?.();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    if (trackCancel) window.removeEventListener("pointercancel", stop);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  if (trackCancel) window.addEventListener("pointercancel", stop);
  return stop;
}
