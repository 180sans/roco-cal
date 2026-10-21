/** Reserve both sides of the visible border for resizing, including corners. */
export function pluginResizeEdges(
  rect: { left: number; right: number; top: number; bottom: number; width: number; height: number },
  x: number,
  y: number,
) {
  const outside = 5;
  if (x < rect.left - outside || x > rect.right + outside || y < rect.top - outside || y > rect.bottom + outside) return null;
  const horizontal = Math.min(5, rect.width / 4);
  const vertical = Math.min(5, rect.height / 4);
  const edges = {
    left: x <= rect.left + horizontal,
    right: x >= rect.right - horizontal,
    top: y <= rect.top + vertical,
    bottom: y >= rect.bottom - vertical,
  };
  return edges.left || edges.right || edges.top || edges.bottom ? edges : null;
}

/** Own one panel gesture before child controls receive pointer-down handlers. */
export function beginPluginLongPressDrag(
  event: PointerEvent,
  panel: HTMLElement,
  onMove: (dx: number, dy: number) => void,
  onActivate?: () => void,
): () => void {
  // An edge gesture never arms the long-press timer, even if content covers it.
  if (pluginResizeEdges(panel.getBoundingClientRect(), event.clientX, event.clientY)) return () => undefined;
  const pointerId = event.pointerId;
  let pointerX = event.clientX;
  let pointerY = event.clientY;
  let anchorX = pointerX;
  let anchorY = pointerY;
  let dragging = false;
  let disposed = false;
  let releaseTimer: number | undefined;

  // Keep the native button click/focus defaults, but prevent the old immediate
  // drag handlers in React from starting a competing gesture.
  event.stopPropagation();

  const stopTracking = () => {
    window.clearTimeout(holdTimer);
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", finish, true);
    window.removeEventListener("pointercancel", cancelPointer, true);
    window.removeEventListener("blur", cleanup);
    panel.removeEventListener("lostpointercapture", lostCapture);
    delete panel.dataset.pluginDragging;
    if (panel.hasPointerCapture(pointerId)) panel.releasePointerCapture(pointerId);
  };
  function cleanup() {
    if (disposed) return;
    disposed = true;
    stopTracking();
    window.clearTimeout(releaseTimer);
    document.removeEventListener("click", suppressClick, true);
  }
  function suppressClick(click: MouseEvent) {
    if (!dragging || click.detail === 0 || !panel.contains(click.target as Node)) return;
    click.preventDefault();
    click.stopImmediatePropagation();
    cleanup();
  }
  function move(next: PointerEvent) {
    if (next.pointerId !== pointerId) return;
    pointerX = next.clientX;
    pointerY = next.clientY;
    if (!dragging) {
      // Scrolling or moving before the hold completes is not a panel drag.
      if (Math.hypot(pointerX - anchorX, pointerY - anchorY) > 5) cleanup();
      return;
    }
    next.preventDefault();
    onMove(pointerX - anchorX, pointerY - anchorY);
  }
  function finish(end: PointerEvent) {
    if (end.pointerId !== pointerId) return;
    if (!dragging) {
      cleanup();
      return;
    }
    stopTracking();
    // WebView may deliver click after pointer-up. Keep the capture guard until
    // that click, the next pointer-down, or the fallback timeout.
    releaseTimer = window.setTimeout(cleanup, 500);
  }
  function cancelPointer(end: PointerEvent) {
    if (end.pointerId === pointerId) cleanup();
  }
  function lostCapture(end: PointerEvent) {
    // Transferring capture from an inner control bubbles a lost-capture event;
    // only losing the panel's own capture ends this drag.
    if (end.target === panel && end.pointerId === pointerId) cleanup();
  }
  const holdTimer = window.setTimeout(() => {
    if (!panel.isConnected) {
      cleanup();
      return;
    }
    anchorX = pointerX;
    anchorY = pointerY;
    dragging = true;
    panel.dataset.pluginDragging = "true";
    try {
      panel.setPointerCapture(pointerId);
    } catch {
      cleanup();
      return;
    }
    onActivate?.();
  }, 400);

  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", finish, true);
  window.addEventListener("pointercancel", cancelPointer, true);
  window.addEventListener("blur", cleanup);
  panel.addEventListener("lostpointercapture", lostCapture);
  document.addEventListener("click", suppressClick, true);
  return cleanup;
}
