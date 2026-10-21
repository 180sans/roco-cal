import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Execute the page's real capture handlers, including competing child controls.
const source = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const page = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "TeamBattlePage");
const route = page.body.statements.find((node) => ts.isExpressionStatement(node) && node.getText(ast).startsWith("pluginDragStartRef.current ="));
const effects = ["cleanupGesture", "cleanupResize"].map((name) => page.body.statements.find((node) =>
  ts.isExpressionStatement(node) && node.getText(ast).startsWith("useEffect(") && node.getText(ast).includes(name)));
assert.ok(route && effects.every(Boolean));
const helper = fs.readFileSync(new URL("../src/pluginLongPressDrag.ts", import.meta.url), "utf8").replaceAll("export function", "function");
const compile = (text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const executable = compile([helper, route.getText(ast), ...effects.map((effect) => effect.getText(ast))].join("\n"));

class Element {
  constructor(parent = null, classes = [], dataset = {}) {
    this.parent = parent;
    this.classList = new Set(classes);
    this.classList.contains = (name) => this.classList.has(name);
    this.dataset = dataset;
    this.listeners = [];
    this.isConnected = true;
    this.offsetWidth = 100;
    this.offsetHeight = 40;
    this.offsetParent = null;
    this.captured = null;
    this.style = { setProperty(name, value) { this[name] = value; } };
  }
  matches(selector) {
    return selector.split(",").some((part) => {
      const s = part.trim();
      return s.startsWith(".") ? this.classList.has(s.slice(1)) : s === "[data-plugin-resizable]" && "pluginResizable" in this.dataset;
    });
  }
  closest(selector) { for (let node = this; node; node = node.parent) if (node.matches(selector)) return node; return null; }
  contains(target) { for (let node = target; node; node = node.parent) if (node === this) return true; return false; }
  getBoundingClientRect() {
    const left = Number.parseFloat(this.style.left) || 100, top = Number.parseFloat(this.style.top) || 100;
    const width = Number.parseFloat(this.style.width) || 100, height = Number.parseFloat(this.style.height) || 40;
    return this.classList.has("team-layout")
      ? { left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700 }
      : { left, top, right: left + width, bottom: top + height, width, height };
  }
  addEventListener(type, fn, options = false) { this.listeners.push({ type, fn, capture: typeof options === "object" ? !!options.capture : options }); }
  removeEventListener(type, fn, capture = false) { this.listeners = this.listeners.filter((item) => item.type !== type || item.fn !== fn || item.capture !== capture); }
  setPointerCapture(id) { this.captured = id; }
  hasPointerCapture(id) { return this.captured === id; }
  releasePointerCapture() { this.captured = null; }
}

function harness(className = "team-left-skill-0", dataset = {}, local = false) {
  const win = new Element(), doc = new Element(win), workspace = new Element(doc, ["team-layout"]);
  const panel = new Element(workspace, [className], { pluginResizable: "true", ...dataset });
  const button = new Element(panel), image = new Element(button);
  const calls = [], timers = new Map(), disposers = [];
  let now = 0, serial = 0, clicks = 0, oldDrags = 0;
  win.innerWidth = 1200; win.innerHeight = 800;
  win.setTimeout = (fn, delay) => { const id = ++serial; timers.set(id, { fn, due: now + delay }); return id; };
  win.clearTimeout = (id) => timers.delete(id);
  const advance = (ms) => {
    now += ms;
    let next;
    while ((next = [...timers].find(([, timer]) => timer.due <= now))) { timers.delete(next[0]); next[1].fn(); }
  };
  const dispatch = (type, target = button, overrides = {}) => {
    const path = [];
    for (let node = target; node; node = node.parent) path.push(node);
    let stopped = false, immediate = false;
    const event = {
      type, target, pointerId: 1, button: 0, isPrimary: true, clientX: 130, clientY: 120, detail: 1, defaultPrevented: false,
      composedPath: () => path, preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { stopped = true; }, stopImmediatePropagation() { immediate = true; stopped = true; }, ...overrides,
    };
    const notify = (node, capture) => {
      for (const listener of [...node.listeners]) {
        if (listener.type === type && listener.capture === capture) listener.fn(event);
        if (immediate) break;
      }
    };
    for (const node of [...path].reverse()) { notify(node, true); if (stopped) return event; }
    for (const node of path) { notify(node, false); if (stopped) return event; }
    return event;
  };
  const regions = Object.fromEntries(["left-roster", "right-roster", "left-bonus-tools", "right-bonus-tools", "left-buff", "right-buff", "weather"].map((id) => [id, { x: 100, y: 100 }]));
  const overlays = {};
  const moveRegion = (id, position) => { calls.push({ id, ...position }); regions[id] = { ...regions[id], ...position }; };
  const updateOverlayLayout = (id, position) => { calls.push({ id, ...position }); overlays[id] = { ...overlays[id], ...position }; };
  const readouts = { current: { health: { x: 0, y: 0 }, powers: { x: 0, y: 0 } } };
  const panelMoves = new WeakMap();
  if (local) panelMoves.set(panel, (position) => { calls.push({ id: "local", ...position }); panel.style.left = `${position.x}px`; panel.style.top = `${position.y}px`; });
  const scope = {
    HTMLElement: Element, window: win, document: doc, displayMode: "plugin", pluginPanelMoves: panelMoves,
    getComputedStyle: (element) => ({ position: "fixed", getPropertyValue: (name) => element.style[name] || "" }),
    pluginDragStartRef: { current: null }, regionPositions: regions, overlayLayout: (id) => overlays[id] || { x: 100, y: 100 },
    defaultPluginOverlayLayout: () => ({ x: 100, y: 100 }), snapToGrid: Math.round,
    detectionReadoutLayouts: readouts.current, detectionReadoutLayoutsRef: readouts,
    setDetectionReadoutLayouts: (next) => {
      readouts.current = typeof next === "function" ? next(readouts.current) : next;
      calls.push({ id: "readout", ...readouts.current[dataset.pluginReadout] });
    },
    resizeContextRef: { current: { regionPositions: regions, overlayLayouts: overlays, moveRegion, updateOverlayLayout, detectionReadoutCoordinateMode: "page" } },
    moveRegion, updateOverlayLayout, focusRegion() {}, useEffect: (fn) => disposers.push(fn()),
  };
  vm.runInNewContext(executable, scope);
  panel.addEventListener("pointerdown", () => { oldDrags += 1; });
  button.addEventListener("pointerdown", (event) => event.stopPropagation());
  button.addEventListener("pointermove", (event) => event.stopPropagation());
  button.addEventListener("pointerup", (event) => event.stopPropagation());
  button.addEventListener("click", () => { clicks += 1; });
  return { win, doc, panel, button, image, calls, dispatch, advance, timers,
    dispose: () => disposers.forEach((dispose) => dispose?.()),
    rerender: () => vm.runInNewContext(compile(route.getText(ast)), scope),
    get clicks() { return clicks; }, get oldDrags() { return oldDrags; },
  };
}

const routes = [
  ["team-left-skill-0", {}, "left-skill-0"], ["team-right-skill-3", {}, "right-skill-3"],
  ...["left-buff", "right-buff", "left-trait", "right-trait", "left-evolution", "right-evolution", "left-roster", "right-roster", "weather"].map((id) => [`team-${id}`, {}, id]),
  ["team-left-bonus-toolbar", {}, "left-bonus-tools"], ["team-right-bonus-toolbar", {}, "right-bonus-tools"],
  ...["action", "speed-line", "speed-buffs", "right-watch", "recognition-status"].map((id) => [id, { pluginOverlayId: id }, id]),
  ["health", { pluginReadout: "health" }, "readout"], ["powers", { pluginReadout: "powers" }, "readout"],
  ...["result-floating", "required-power-panel", "enemy-attack-panel", "bonus-tool-floating"].map((name) => [name, {}, "local", true]),
];
for (const [name, data, id, local] of routes) {
  const h = harness(name, data, local);
  assert.equal(h.dispatch("pointerdown", h.image).defaultPrevented, false);
  h.advance(399); assert.equal(h.panel.dataset.pluginDragging, undefined);
  h.advance(1); assert.equal(h.panel.dataset.pluginDragging, "true", `${name}: center activates only after holding`);
  h.rerender(); h.dispatch("pointermove", h.button, { clientX: 150, clientY: 130 });
  assert.equal(h.calls[0]?.id, id);
  assert.equal(h.calls[0].x, id === "readout" ? 20 : 120);
  assert.equal(h.calls[0].y, id === "readout" ? 10 : 110);
  h.dispatch("pointerup"); h.advance(100);
  assert.equal(h.dispatch("click").defaultPrevented, true);
  assert.equal(h.clicks, 0); assert.equal(h.oldDrags, 0); h.dispose();

  const edge = harness(name, data, local);
  assert.equal(edge.dispatch("pointerdown", edge.image, { clientX: 198 }).defaultPrevented, true);
  edge.dispatch("pointermove", edge.button, { clientX: 218 });
  assert.equal(edge.panel.dataset.pluginResizing, "true", `${name}: resize starts immediately inside border`);
  assert.equal(edge.panel.dataset.pluginDragging, undefined);
  assert.equal(edge.calls[0]?.id, id);
  assert.equal(local || id === "readout" ? edge.panel.style.width : edge.calls[0].width, local || id === "readout" ? "120px" : 120);
  edge.advance(600); assert.equal(edge.panel.dataset.pluginDragging, undefined);
  edge.dispatch("pointerup"); assert.equal(edge.panel.dataset.pluginResizing, undefined);
  assert.equal(edge.dispatch("click").defaultPrevented, true); assert.equal(edge.clicks, 0);
  edge.dispose(); assert.equal(edge.timers.size, 0);
}

for (const [x, y, width, height] of [[102, 120, 80, 40], [198, 120, 120, 40], [130, 102, 100, 30], [130, 138, 100, 50], [102, 102, 80, 30], [198, 102, 120, 30], [102, 138, 80, 50], [198, 138, 120, 50], [202, 120, 120, 40]]) {
  const h = harness();
  const target = x > 200 ? new Element(h.panel, ["plugin-resize-edge"]) : h.image;
  h.dispatch("pointerdown", target, { clientX: x, clientY: y });
  h.dispatch("pointermove", h.button, { clientX: x + 20, clientY: y + 10 });
  assert.equal(h.calls[0].width, width); assert.equal(h.calls[0].height, height);
  h.dispose();
}
const short = harness();
short.dispatch("pointerdown"); short.advance(399); short.dispatch("pointerup"); short.dispatch("click"); short.advance(1000);
assert.equal(short.clicks, 1); assert.equal(short.calls.length, 0); short.dispose();
const drift = harness();
drift.dispatch("pointerdown"); drift.dispatch("pointermove", drift.button, { clientX: 140 }); drift.advance(500);
assert.equal(drift.panel.dataset.pluginDragging, undefined); assert.equal(drift.calls.length, 0); drift.dispose();

for (const resize of [false, true]) {
  for (const end of ["pointercancel", "blur", "lostpointercapture", "unmount"]) {
    const h = harness(); h.dispatch("pointerdown", h.button, { clientX: resize ? 198 : 130 });
    if (!resize) h.advance(400);
    h.dispatch("lostpointercapture", h.button);
    assert.equal(h.panel.dataset[resize ? "pluginResizing" : "pluginDragging"], "true", "nested control capture loss must not stop panel gesture");
    h.dispatch("pointerup", h.panel, { pointerId: 2 }); assert.equal(h.panel.captured, 1);
    if (end === "unmount") h.dispose(); else h.dispatch(end, end === "blur" ? h.win : h.panel);
    assert.equal(h.panel.captured, null);
    h.dispatch("pointermove", h.button, { clientX: 240 }); assert.equal(h.calls.length, 0);
    h.dispose(); h.advance(1000); assert.equal(h.timers.size, 0);
  }
}
for (const excluded of ["modal-backdrop", "trait-expanded-content", "team-buff-grid", "slot-iv-popover"]) {
  for (const clientX of [130, 198]) {
    const h = harness(), target = new Element(h.panel, [excluded]);
    h.dispatch("pointerdown", target, { clientX }); h.advance(500);
    assert.equal(h.panel.dataset.pluginDragging, undefined); assert.equal(h.panel.dataset.pluginResizing, undefined); h.dispose();
  }
}
for (const overrides of [{ button: 2 }, { isPrimary: false }]) {
  const h = harness(); h.dispatch("pointerdown", h.button, { clientX: 198, ...overrides }); h.advance(500);
  assert.equal(h.panel.captured, null); assert.equal(h.calls.length, 0); h.dispose();
}
console.log(`插件手势检查通过：${routes.length} 类框的边缘立即缩放、中心长按移动，以及四角、点击、取消和清理。`);
