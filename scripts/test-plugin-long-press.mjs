import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const page = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "TeamBattlePage");
const route = page.body.statements.find((node) => ts.isExpressionStatement(node) && node.getText(ast).startsWith("pluginDragStartRef.current ="));
const effect = page.body.statements.find((node) => ts.isExpressionStatement(node) && node.getText(ast).startsWith("useEffect(") && node.getText(ast).includes("cleanupGesture"));
assert.ok(route && effect, "test the actual page event routing, not a copied handler");
const helper = fs.readFileSync(new URL("../src/pluginLongPressDrag.ts", import.meta.url), "utf8");
const executable = ts.transpileModule(helper.replace("export function", "function") + "\n" + route.getText(ast) + "\n" + effect.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;

// A small event tree models capture, bubbling and stopPropagation so child
// controls really compete with the page's gesture handler in these checks.
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
    this.captured = null;
  }
  matches(selector) {
    return selector.split(",").some((part) => {
      const s = part.trim();
      return s.startsWith(".") ? this.classList.has(s.slice(1)) : s === "[data-plugin-resizable]" && "pluginResizable" in this.dataset;
    });
  }
  closest(selector) {
    for (let current = this; current; current = current.parent) if (current.matches(selector)) return current;
    return null;
  }
  contains(element) {
    for (let current = element; current; current = current.parent) if (current === this) return true;
    return false;
  }
  getBoundingClientRect() {
    return this.classList.has("team-layout")
      ? { left: 0, top: 0, right: 1000, bottom: 700 }
      : { left: 100, top: 100, right: 200, bottom: 140 };
  }
  addEventListener(type, fn, capture = false) { this.listeners.push({ type, fn, capture }); }
  removeEventListener(type, fn, capture = false) {
    this.listeners = this.listeners.filter((item) => item.type !== type || item.fn !== fn || item.capture !== capture);
  }
  setPointerCapture(id) { this.captured = id; }
  hasPointerCapture(id) { return this.captured === id; }
  releasePointerCapture() { this.captured = null; }
}

function harness(className = "team-left-skill-0", dataset = {}) {
  const win = new Element();
  const doc = new Element(win);
  const workspace = new Element(doc, ["team-layout"]);
  const panel = new Element(workspace, [className], { pluginResizable: "true", ...dataset });
  const button = new Element(panel);
  const image = new Element(button);
  const calls = [];
  const timers = new Map();
  let now = 0, serial = 0, clicks = 0, oldDrags = 0, mixedPointerStarts = 0;
  win.innerWidth = 1200;
  win.innerHeight = 800;
  win.setTimeout = (fn, delay) => { const id = ++serial; timers.set(id, { fn, due: now + delay }); return id; };
  win.clearTimeout = (id) => timers.delete(id);
  const advance = (ms) => {
    now += ms;
    let next;
    while ((next = [...timers].find(([, timer]) => timer.due <= now))) {
      timers.delete(next[0]); next[1].fn();
    }
  };
  const dispatch = (type, target = button, overrides = {}) => {
    const path = [];
    for (let current = target; current; current = current.parent) path.push(current);
    let stopped = false, immediate = false;
    const event = {
      type, target, pointerId: 1, button: 0, isPrimary: true, clientX: 110, clientY: 110, detail: 1, defaultPrevented: false,
      composedPath: () => path,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { stopped = true; },
      stopImmediatePropagation() { immediate = true; stopped = true; },
      ...overrides,
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
  let dispose;
  const scope = {
    HTMLElement: Element, window: win, document: doc, displayMode: "plugin",
    pluginDragStartRef: { current: null },
    regionPositions: Object.fromEntries(["left-roster", "right-roster", "left-bonus-tools", "right-bonus-tools", "left-buff", "right-buff", "weather"].map((id) => [id, { x: 100, y: 100 }])),
    overlayLayout: () => ({ x: 100, y: 100 }), snapToGrid: Math.round,
    moveRegion: (id, position) => calls.push({ id, ...position }),
    updateOverlayLayout: (id, position) => calls.push({ id, ...position }),
    focusRegion() {}, useEffect: (fn) => { dispose = fn(); },
  };
  vm.runInNewContext(executable, scope);
  // Same-node document handlers (including mixed-mode tracking) still run;
  // descendant handlers cannot start an old immediate drag or hide the press.
  doc.addEventListener("pointerdown", () => { mixedPointerStarts += 1; }, true);
  panel.addEventListener("pointerdown", () => { oldDrags += 1; });
  button.addEventListener("pointerdown", (event) => event.stopPropagation());
  button.addEventListener("pointermove", (event) => event.stopPropagation());
  button.addEventListener("click", () => { clicks += 1; });
  return { win, doc, panel, button, image, calls, dispatch, advance, timers,
    dispose: () => dispose(),
    rerender: () => vm.runInNewContext(ts.transpileModule(route.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, scope),
    get clicks() { return clicks; }, get oldDrags() { return oldDrags; }, get mixedPointerStarts() { return mixedPointerStarts; },
  };
}

const routes = [
  ["team-left-skill-0", {}, "left-skill-0"], ["team-left-buff", {}, "left-buff"],
  ["team-right-buff", {}, "right-buff"], ["team-left-trait", {}, "left-trait"],
  ["team-right-trait", {}, "right-trait"], ["team-left-evolution", {}, "left-evolution"],
  ["team-left-roster", {}, "left-roster"], ["team-right-roster", {}, "right-roster"],
  ["team-left-bonus-toolbar", {}, "left-bonus-tools"], ["team-right-bonus-toolbar", {}, "right-bonus-tools"],
  ["team-weather", {}, "weather"], ["team-action-floating", { pluginOverlayId: "action" }, "action"],
  ["speed-line", { pluginOverlayId: "speed-line" }, "speed-line"],
  ["speed-buffs", { pluginOverlayId: "speed-buffs" }, "speed-buffs"],
  ["watch-skill-panel", { pluginOverlayId: "right-watch" }, "right-watch"],
];
for (const [name, data, id] of routes) {
  const h = harness(name, data);
  const down = h.dispatch("pointerdown", h.image);
  assert.equal(down.defaultPrevented, false, `${name}: preserve button focus/defaults`);
  h.advance(400);
  assert.equal(h.panel.dataset.pluginDragging, "true", `${name}: activate over nested button image`);
  h.rerender();
  h.dispatch("pointermove", h.button, { clientX: 130, clientY: 120 });
  assert.equal(h.calls[0]?.id, id, `${name}: update the owning layout`);
  assert.equal(h.calls[0].x, 120);
  assert.equal(h.calls[0].y, 110);
  h.dispatch("pointerup");
  h.advance(100);
  assert.equal(h.dispatch("click").defaultPrevented, true, `${name}: suppress even delayed release click`);
  assert.equal(h.clicks, 0); assert.equal(h.oldDrags, 0); assert.equal(h.mixedPointerStarts, 1);
  h.dispose();
}

const short = harness();
short.dispatch("pointerdown"); short.advance(399); short.dispatch("pointerup"); short.dispatch("click"); short.advance(1000);
assert.equal(short.clicks, 1); assert.equal(short.calls.length, 0); assert.equal(short.panel.captured, null);
short.dispose();

const drift = harness();
drift.dispatch("pointerdown"); drift.dispatch("pointermove", drift.button, { clientX: 120 }); drift.advance(400);
drift.dispatch("pointermove", drift.button, { clientX: 123 });
assert.equal(drift.calls[0].x, 103, "pre-hold movement must neither cancel the hold nor make the panel jump");
// A nested control losing capture must not cancel the parent's new capture.
drift.dispatch("lostpointercapture", drift.button);
assert.equal(drift.panel.dataset.pluginDragging, "true");
drift.dispatch("pointermove", drift.button, { clientX: 125 }); assert.equal(drift.calls.length, 2);
drift.dispatch("pointerup", drift.button, { pointerId: 2 }); assert.equal(drift.panel.captured, 1);
drift.dispose(); assert.equal(drift.panel.captured, null);

for (const end of ["pointercancel", "blur", "lostpointercapture"]) {
  const h = harness(); h.dispatch("pointerdown"); h.advance(400);
  h.dispatch(end, end === "blur" ? h.win : h.panel);
  assert.equal(h.panel.dataset.pluginDragging, undefined); assert.equal(h.panel.captured, null);
  h.dispatch("pointermove", h.button, { clientX: 150 }); assert.equal(h.calls.length, 0);
  h.dispose();
}
for (const active of [false, true]) {
  const h = harness(); h.dispatch("pointerdown"); if (active) h.advance(400);
  h.dispose(); h.advance(1000); h.dispatch("pointermove", h.button, { clientX: 150 });
  assert.equal(h.calls.length, 0); assert.equal(h.panel.captured, null); assert.equal(h.timers.size, 0);
}
for (const excluded of ["plugin-resize-edge", "modal-backdrop", "trait-expanded-content", "team-buff-grid"]) {
  const h = harness(); const target = new Element(h.panel, [excluded]);
  h.dispatch("pointerdown", target); h.advance(500);
  assert.equal(h.panel.dataset.pluginDragging, undefined, `${excluded}: do not hijack resizing/popups`);
  h.dispose();
}
for (const override of [{ button: 2 }, { isPrimary: false }]) {
  const h = harness(); h.dispatch("pointerdown", h.button, override); h.advance(500);
  assert.equal(h.panel.dataset.pluginDragging, undefined); h.dispose();
}
const next = harness(); next.dispatch("pointerdown"); next.advance(400); next.dispatch("pointerup");
next.dispatch("pointerdown"); next.dispatch("pointerup"); next.dispatch("click");
assert.equal(next.clicks, 1, "the next ordinary click must not be swallowed"); next.dispose();

console.log(`Plugin long-press checks passed: ${routes.length} panel routes, nested buttons, event capture, delayed click, rerender, cancellation and cleanup.`);
