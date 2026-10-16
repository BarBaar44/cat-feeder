// Tests for cat-feeder-card.js in a simulated browser. Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
const src = fs.readFileSync(path.join(__dirname, "..", "cat-feeder-card.js"), "utf8");
w.eval(src);
w.eval(src); // loading twice as a classic script must not throw (no top-level name clashes)
const Card = w.customElements.get("cat-feeder-card");
assert(Card, "registered");

// A fixed clock, in UTC (HA's time zone in these tests): Friday 16 Oct 2026.
let NOW = Date.UTC(2026, 9, 16, 12, 0);
w.Date.now = () => NOW;
const at = (d, h, m = 0, s = 0) => Date.UTC(2026, 9, d, h, m, s);
const iso = (ms) => new Date(ms).toISOString();

const SCHED = "switch.schedule_cat_feeder_daily_8h";
const FEED = "sensor.cat_feeder_last_feed";
const ERR = "binary_sensor.cat_feeder_error";
const st = (state, attributes = {}, last_changed = iso(at(1, 0))) => ({ state: String(state), attributes, last_changed, last_updated: last_changed });

/* Schedule on with a daily 08:00 run, last feed as given, no error. */
const states = (o = {}) => ({
  [SCHED]: st(o.sched || "on", o.schedAttrs || { next_trigger: iso(o.next || at(17, 8)) }, o.schedSince ? iso(o.schedSince) : undefined),
  [FEED]: o.feed === undefined ? st(iso(at(16, 8, 0, 8)), { portions: 4, grams: 32 }) : o.feed,
  [ERR]: st(o.err || "off"),
});
const hass = (s) => ({ states: s, language: "en", locale: { language: "en" }, config: { time_zone: "UTC" } });

const cards = [];
function render(s, config = {}) {
  const c = new Card();
  w.document.body.appendChild(c);
  cards.push(c);
  c.setConfig(config);
  c.hass = hass(s);
  return c;
}
function read(c) {
  const e = c._el;
  const long = (el) => (el.querySelector(".long") ? el.querySelector(".long").textContent : el.textContent);
  const short = (el) => (el.querySelector(".short") ? el.querySelector(".short").textContent : el.textContent);
  const cls = ["error", "off", "feeding", "on", "unavailable"].find((k) => e.card.classList.contains(k));
  return {
    kind: cls,
    status: long(e.status),
    detail: e.card.classList.contains("nodetail") ? "" : long(e.detail),
    detailShort: e.card.classList.contains("nodetail") ? "" : short(e.detail),
    missed: e.detail.classList.contains("missed"),
    colour: e.card.style.getPropertyValue("--c"),
    title: e.card.title,
  };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("fed today with grams", () => {
  NOW = at(16, 12, 0);
  const r = read(render(states({ feed: st(iso(at(16, 8, 0, 8)), { portions: 4, grams: 32 }) })));
  assert.strictEqual(r.kind, "on");
  assert.strictEqual(r.status, "Next 08:00");
  assert.strictEqual(r.detail, "Fed 08:00 · 32 g");
  assert.strictEqual(r.detailShort, "Fed 08:00");
  assert(!r.missed);
  assert(/Last feed: Friday,? 16 October 2026/.test(r.title) || /Last feed: Friday, October 16, 2026/.test(r.title), r.title);
});

test("fed today without attributes", () => {
  NOW = at(16, 12, 0);
  assert.strictEqual(read(render(states({ feed: st(iso(at(16, 8, 0, 8))) }))).detail, "Fed 08:00");
  // Portions when grams is missing.
  assert.strictEqual(read(render(states({ feed: st(iso(at(16, 8, 0, 8)), { portions: 4 }) }))).detail, "Fed 08:00 · 4 portions");
});

test("fed yesterday", () => {
  NOW = at(16, 7, 30); // before today's 08:00 run
  const r = read(render(states({ feed: st(iso(at(15, 17, 0, 8)), { grams: 32 }) })));
  assert.strictEqual(r.detail, "Fed yesterday 17:00");
  assert.strictEqual(r.detailShort, "Yesterday");
  assert(!r.missed);
});

test("fed 3 days ago, and more than a week ago", () => {
  NOW = at(16, 7, 30);
  let r = read(render(states({ feed: st(iso(at(13, 17, 0, 8))) })));
  assert.strictEqual(r.detail, "Fed Tue 17:00");
  assert.strictEqual(r.detailShort, "Fed Tue");
  r = read(render(states({ feed: st(iso(at(3, 17, 0, 8))) })));
  assert(/^Fed (3 Oct|Oct 3)$/.test(r.detail), r.detail); // date in HA's language
});

test("unknown and unavailable last feed: no feed recorded, no crash", () => {
  NOW = at(16, 7, 30);
  for (const v of ["unknown", "unavailable", "not a date"]) {
    const r = read(render(states({ feed: st(v) })));
    assert.strictEqual(r.detail, "No feed recorded", v);
    assert.strictEqual(r.detailShort, "No feed", v);
    assert.strictEqual(r.status, "Next 08:00", v);
  }
  // The role switched off works too.
  assert.strictEqual(read(render(states(), { entities: { last_feed: null } })).detail, "No feed recorded");
});

test("missed 08:00: schedule on, last feed yesterday 17:00, now 08:11", () => {
  NOW = at(16, 8, 11);
  const r = read(render(states({ feed: st(iso(at(15, 17, 0, 8))) })));
  assert.strictEqual(r.detail, "Missed 08:00");
  assert.strictEqual(r.detailShort, "Missed");
  assert(r.missed);
  assert(/Missed the 08:00 feed/.test(r.title), r.title);
});

test("not missed at 08:09 (within the 10 min grace)", () => {
  NOW = at(16, 8, 9);
  const r = read(render(states({ feed: st(iso(at(15, 17, 0, 8))) })));
  assert.strictEqual(r.detail, "Fed yesterday 17:00");
  assert(!r.missed);
});

test("grace_minutes is configurable", () => {
  NOW = at(16, 8, 9);
  assert(read(render(states({ feed: st(iso(at(15, 17, 0, 8))) }), { grace_minutes: 5 })).missed);
});

test("schedule off never gives missed: grey, just Off", () => {
  NOW = at(16, 9, 0);
  const r = read(render(states({ sched: "off", feed: st(iso(at(15, 17, 0, 8))) })));
  assert.strictEqual(r.kind, "off");
  assert.strictEqual(r.status, "Off");
  assert.strictEqual(r.detail, "");
  assert(!r.missed);
  assert.strictEqual(r.colour, "var(--cf-off)");
});

test("missed clears once last_feed moves past 08:00", () => {
  NOW = at(16, 8, 11);
  const c = render(states({ feed: st(iso(at(15, 17, 0, 8))) }));
  assert(read(c).missed);
  NOW = at(16, 8, 11, 40);
  c.hass = hass({ ...c.hass.states, [FEED]: st(iso(at(16, 8, 11, 30)), { grams: 32 }) });
  const r = read(c);
  assert(!r.missed);
  assert.strictEqual(r.kind, "feeding"); // within a minute of the confirmed feed
  assert.strictEqual(r.detail, "Fed 08:11 · 32 g");
});

test("the 30 s refresh turns fed-yesterday into missed without a state change", () => {
  NOW = at(16, 8, 9);
  const c = render(states({ feed: st(iso(at(15, 17, 0, 8))) }));
  assert(!read(c).missed);
  NOW = at(16, 8, 10, 30);
  c._update(); // what the tick does
  assert(read(c).missed);
});

test("a schedule switched on after today's run is not missed", () => {
  NOW = at(16, 9, 0);
  const r = read(render(states({ feed: st(iso(at(15, 17, 0, 8))), schedSince: at(16, 8, 30) })));
  assert(!r.missed);
});

test("slots from timeslots, and weekdays respected", () => {
  NOW = at(16, 17, 20); // Friday
  const attrs = (weekdays) => ({ next_trigger: iso(at(17, 8)), timeslots: ["08:00:00", "17:00:00 - 17:01:00"], weekdays });
  let r = read(render(states({ schedAttrs: attrs(["daily"]), feed: st(iso(at(16, 8, 0, 8))) })));
  assert.strictEqual(r.detail, "Missed 17:00"); // fed at 08:00, nothing after 17:00
  r = read(render(states({ schedAttrs: attrs(["sat", "sun"]), feed: st(iso(at(15, 17, 0, 8))) })));
  assert(!r.missed, "not a run day");
  r = read(render(states({ schedAttrs: attrs(["workday"]), feed: st(iso(at(16, 17, 0, 8))) })));
  assert(!r.missed);
});

test("feeding for one minute after a confirmed feed", () => {
  NOW = at(16, 17, 0, 30);
  let r = read(render(states({ next: at(17, 17), feed: st(iso(at(16, 17, 0, 8)), { grams: 32 }) })));
  assert.strictEqual(r.kind, "feeding");
  assert.strictEqual(r.status, "Feeding");
  NOW = at(16, 17, 1, 30);
  r = read(render(states({ next: at(17, 17), feed: st(iso(at(16, 17, 0, 8)), { grams: 32 }) })));
  assert.strictEqual(r.kind, "on");
});

test("error wins over everything", () => {
  NOW = at(16, 12, 0);
  let r = read(render(states({ err: "on" })));
  assert.strictEqual(r.kind, "error");
  assert.strictEqual(r.status, "Error");
  assert.strictEqual(r.colour, "var(--cf-error)");
  r = read(render(states({ err: "on", sched: "off" })));
  assert.strictEqual(r.kind, "error");
});

test("unavailable schedule", () => {
  const r = read(render(states({ sched: "unavailable" })));
  assert.strictEqual(r.kind, "unavailable");
  assert.strictEqual(r.status, "Unavailable");
});

test("tap toggles the schedule, hold opens more-info, badge opens the error sensor", () => {
  const c = render(states({ err: "on" }));
  const got = [];
  c.addEventListener("hass-action", (e) => got.push(JSON.parse(JSON.stringify(e.detail))));
  c._run(c._config.tap_action, "tap");
  c._run(c._config.hold_action, "hold");
  c._el.badge.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert.deepStrictEqual(got, [
    { config: { entity: SCHED, tap_action: { action: "toggle" } }, action: "tap" },
    { config: { entity: SCHED, hold_action: { action: "more-info" } }, action: "hold" },
    { config: { entity: ERR, tap_action: { action: "more-info", entity: ERR } }, action: "tap" },
  ]);
});

test("re-renders only for its own entities", () => {
  const c = render(states());
  let n = 0;
  const orig = c._update.bind(c);
  c._update = () => { n++; orig(); };
  c.hass = hass({ ...c.hass.states, "light.other": st("on") });
  assert.strictEqual(n, 0);
  c.hass = hass({ ...c.hass.states, [ERR]: st("on") });
  assert.strictEqual(n, 1);
});

test("config errors", () => {
  const bad = [
    [{ schedule: [] }, /Unknown option 'schedule'/],
    [{ entities: { feed: "sensor.x" } }, /unknown role 'feed'/],
    [{ entities: { error: "nope" } }, /not an entity id/],
    [{ schedules: [] }, /at least one/],
    [{ schedules: ["bad id"] }, /not an entity id/],
    [{ grace_minutes: "x" }, /grace_minutes/],
  ];
  for (const [cfg, re] of bad) assert.throws(() => new Card().setConfig(cfg), re);
});


test("editor: defaults shown, only changes written, round trip", async () => {
  const Editor = w.customElements.get("cat-feeder-card-editor");
  assert(Editor, "editor registered");
  assert.equal(Card.getConfigElement().tagName.toLowerCase(), "cat-feeder-card-editor");

  const minimal = { type: "custom:cat-feeder-card", grid_options: { columns: 3, rows: 2 } };
  const d0 = Editor.toData(minimal);
  assert.equal(d0.name, "Cat Feeder");
  assert.deepEqual(d0.schedules, [SCHED]);
  assert.equal(d0.entities.last_feed, FEED);
  assert.equal(d0.entities.error, ERR);
  assert.equal(d0.grace_minutes, 10);
  assert.deepEqual(Editor.toConfig(d0, minimal), minimal, "unchanged writes nothing new");

  // schedules, cleared entity, grace
  const d1 = Editor.toData(minimal);
  d1.schedules = [SCHED, "switch.schedule_cat_feeder_daily_17h"];
  d1.entities.error = "";
  d1.grace_minutes = 15;
  const c1 = Editor.toConfig(d1, minimal);
  assert.deepEqual(c1.schedules, [SCHED, "switch.schedule_cat_feeder_daily_17h"]);
  assert.deepEqual(c1.entities, { error: null });
  assert.equal(c1.grace_minutes, 15);
  assert.equal(Editor.toData(c1).entities.error, "");
  assert.deepEqual(Editor.toConfig(Editor.toData(c1), c1), c1, "round trip");

  // no schedules left, or an empty grace: back to the defaults
  const d2 = Editor.toData(c1);
  d2.schedules = [];
  d2.grace_minutes = undefined;
  const c2 = Editor.toConfig(d2, c1);
  assert.equal("schedules" in c2, false);
  assert.equal("grace_minutes" in c2, false);

  // name, actions, colours
  const full = {
    type: "custom:cat-feeder-card", name: "Feeder", tap_action: { action: "more-info" },
    hold_action: { action: "none" }, colors: { on: "teal" },
  };
  assert.deepEqual(Editor.toConfig(Editor.toData(full), full), full);
  const d3 = Editor.toData(full);
  d3.colors.on = " ";
  assert.equal(Editor.toConfig(d3, full).colors, undefined, "empty colour dropped");

  // every config the editor writes is accepted by the card
  new Card().setConfig(c1);
  new Card().setConfig(c2);
  new Card().setConfig(Editor.toConfig(Editor.toData(full), full));

  // with a stub ha-form: renders and passes changes on
  if (!w.customElements.get("ha-form")) w.customElements.define("ha-form", class extends w.HTMLElement {});
  const ed = new Editor();
  const got = [];
  ed.addEventListener("config-changed", (e) => got.push(e.detail.config));
  ed.setConfig(minimal);
  w.document.body.appendChild(ed);
  await new Promise((r) => setTimeout(r, 0));
  const form = ed.querySelector("ha-form");
  assert(form, "ha-form rendered");
  assert.deepEqual(form.data.schedules, [SCHED]);
  assert.equal(form.computeLabel({ name: "grace_minutes" }), "Missed after");
  form.dispatchEvent(new w.CustomEvent("value-changed", { detail: { value: { ...form.data, name: "Poes" } } }));
  assert.deepEqual(got[0], { ...minimal, name: "Poes" });
  ed.remove();
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${name}\n     ${err.message}`);
    }
  }
  cards.forEach((c) => c.remove());
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
