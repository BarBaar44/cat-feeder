/*
 * Cat Feeder Card
 * A small Lovelace tile for an automatic cat feeder run by Scheduler-card
 * schedules: whether the feeding schedule is on, when the next feed is,
 * when food last actually came out, a missed feed, and the feeder's error.
 *
 * States, first match wins: Error (error sensor on), Off (grey, no detail), Feeding
 * (the first minute after a confirmed feed), On.
 * The detail line is about the last confirmed feed ("Fed 17:00 · 32 g"),
 * or "Missed 08:00" when a schedule that is on had a run today more than
 * `grace_minutes` ago and no feed came after it.
 *
 * Tap and hold go through Home Assistant's own action handler (hass-action);
 * the card never hardcodes a service call.
 *
 * https://github.com/BarBaar44/cat-feeder  (MIT)
 */

// Everything sits in one block so the top-level names cannot clash with the
// sister cards when the files are loaded as classic scripts.
{
const VERSION = "0.1.0";

const FEEDER_HOLD_MS = 500;
const FEEDER_MOVE_PX = 10;
const FEEDER_TICK_MS = 30000; // "Missed" and "yesterday" appear without a state change
const FEEDER_FEEDING_MS = 60000; // the feeding animation runs this long after a confirmed feed
const FEEDER_DAY_MS = 86400000;

const FEEDER_DEFAULTS = {
  name: "Cat Feeder",
  grace_minutes: 10,
  schedules: ["switch.schedule_cat_feeder_daily_8h"],
  entities: {
    last_feed: "sensor.cat_feeder_last_feed", // timestamp of the last confirmed dispense; attributes portions, grams
    error: "binary_sensor.cat_feeder_error",
  },
};

/* colors key -> CSS variable and default. */
const FEEDER_COLORS = {
  on: ["--cf-on", "var(--green-color, #4caf50)"],
  feeding: ["--cf-feeding", "var(--green-color, #4caf50)"],
  off: ["--cf-off", "var(--disabled-color, #9e9e9e)"],
  error: ["--cf-error", "var(--error-color, #db4437)"],
  missed: ["--cf-missed", "var(--error-color, #db4437)"],
  unavailable: ["--cf-unavailable", "var(--disabled-color, #9e9e9e)"],
};

const FEEDER_BAD = ["unknown", "unavailable", "none", ""];
const FEEDER_WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const feederNum = (v) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? null : Number(v));
const feederKey = (v) => String(v == null ? "" : v).trim().toLowerCase();
const feederId = (v) => typeof v === "string" && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(v);

/* A feeder: hopper with a window, chute, bowl. Drawn here: mdi has none. */
const FEEDER_ICON = `<path d="M6.5 2h11A1.5 1.5 0 0 1 19 3.5v6A1.5 1.5 0 0 1 17.5 11h-11A1.5 1.5 0 0 1 5 9.5v-6A1.5 1.5 0 0 1 6.5 2zm2 2.2v3.6h7V4.2z"/><rect x="10.7" y="11" width="2.6" height="2.4" rx=".5"/><path d="M3.5 17.6h17l-1.6 4.4H5.1z"/>`;
/* Kibble falling into a filling bowl (feeding), and z's (schedule off). */
const FEEDER_KIBBLE = `<defs><clipPath id="cf-bowl"><rect x="3" y="12" width="18" height="5.8"/></clipPath></defs><g clip-path="url(#cf-bowl)"><ellipse class="mound" cx="12" cy="17.8" rx="6" ry="2.6"/></g><circle class="k k1" cx="11.4" cy="14" r="1"/><circle class="k k2" cx="12.6" cy="14" r="1"/><circle class="k k3" cx="12" cy="14" r="1"/>`;
const FEEDER_ZZZ = `<text class="z z1" x="17" y="7">z</text><text class="z z2" x="17" y="7">z</text>`;

const FEEDER_STYLE = `
  :host {
${Object.values(FEEDER_COLORS).map(([v, d]) => `    ${v}: ${d};`).join("\n")}
  }
  ha-card {
    height: 100%; box-sizing: border-box; padding: 16px 3px 0; /* 3px: "Cat Feeder" needs 76px at phone width */ overflow: hidden; position: relative;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    container-type: inline-size;
    cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent;
    user-select: none; -webkit-user-select: none; touch-action: manipulation;
  }
  ha-card.pressed { opacity: .7; }
  ha-card:focus-visible { box-shadow: 0 0 0 2px var(--primary-color); }

  /* Same grid as the Espresso Card and a Mushroom tile: 36px icon 17px from the top,
     name baseline 44px above the bottom; status and detail right under it. */
  .icon {
    width: 36px; height: 36px; border-radius: 50%; flex: none;
    display: flex; align-items: center; justify-content: center;
    color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent);
    transition: background-color .3s, color .3s;
  }
  .icon svg { width: 24px; height: 24px; display: block; overflow: visible; fill: currentColor; }
  .badge {
    display: none; position: absolute; top: 8px; right: 8px; width: 16px; height: 16px; padding: 0;
    border: none; border-radius: 50%; cursor: pointer; align-items: center; justify-content: center;
    background: var(--cf-error); color: var(--card-background-color, #1c1c1c); font: 700 11px/16px sans-serif;
  }
  .error .badge { display: flex; }

  .text { min-width: 0; width: 100%; margin-top: 9px; }
  .name { font-size: 14px; font-weight: 500; line-height: 18px; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status, .detail { font-size: 12px; line-height: 16px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .error .status { color: var(--cf-error); }
  .detail.missed { color: var(--cf-missed); }
  .nodetail .detail { display: none; }
  .nodetail .status { margin-top: 8px; }
  /* Narrow tiles (3 columns on a phone) get the short words, wider ones the long. */
  .long { display: none; }
  @container (min-width: 90px) {
    .short { display: none; }
    .long { display: inline; }
  }

  /* Feeding: kibble drops, the bowl fills, a soft ring. */
  .k { opacity: 0; }
  .feeding .k { animation: cf-drop 1.2s ease-in infinite; }
  .feeding .k2 { animation-delay: .4s; }
  .feeding .k3 { animation-delay: .8s; }
  .mound { transform-box: fill-box; transform-origin: 50% 100%; transform: scaleY(0); }
  .feeding .mound { animation: cf-fill 6s ease-out infinite; }
  .feeding .icon, .error .icon { animation: cf-ring 2s ease-out infinite; }
  @keyframes cf-drop {
    0% { transform: translateY(0); opacity: 0; }
    10% { opacity: 1; }
    80% { transform: translateY(3.6px); opacity: 1; }
    90%, 100% { transform: translateY(3.8px); opacity: 0; }
  }
  @keyframes cf-fill { 0% { transform: scaleY(0); } 85%, 100% { transform: scaleY(1); } }
  @keyframes cf-ring {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 45%, transparent); }
    100% { box-shadow: 0 0 0 8px transparent; }
  }
  /* Schedule off: the cat dozes. */
  .z { display: none; font: 700 8px sans-serif; fill: currentColor; opacity: 0; }
  .off .z { display: inline; animation: cf-z 3s ease-out infinite; }
  .off .z2 { animation-delay: 1.5s; }
  @keyframes cf-z {
    0% { transform: translate(0, 0) scale(.6); opacity: 0; }
    20% { opacity: .9; }
    100% { transform: translate(4px, -7px) scale(1.2); opacity: 0; }
  }
  /* Error: the feeder shakes now and then. */
  .error .icon svg { transform-origin: 50% 60%; animation: cf-shake 3s ease-in-out infinite; }
  @keyframes cf-shake {
    0%, 80%, 100% { transform: rotate(0); }
    84% { transform: rotate(-10deg); } 88% { transform: rotate(10deg); }
    92% { transform: rotate(-6deg); } 96% { transform: rotate(4deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .icon, .icon * { animation: none !important; transition: none !important; }
    .k, .z { opacity: 0 !important; }
    .feeding .mound { transform: scaleY(.8) !important; }
  }
`;

class CatFeederCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._seen = Object.create(null);
    this._ids = [];
    this._tick = null;
    this._feedTimer = null;
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    const c = config || {};
    const known = ["type", "name", "schedules", "entities", "grace_minutes", "tap_action", "hold_action", "colors",
      "grid_options", "layout_options", "view_layout", "visibility", "card_mod"];
    for (const k of Object.keys(c)) {
      if (!known.includes(k)) throw new Error(`Unknown option '${k}'. Known: ${known.slice(1, 8).join(", ")}`);
    }
    const ent = c.entities == null ? {} : c.entities;
    if (typeof ent !== "object" || Array.isArray(ent)) throw new Error("entities must be a map, e.g. last_feed: sensor.my_feed");
    for (const [k, v] of Object.entries(ent)) {
      if (!(k in FEEDER_DEFAULTS.entities)) {
        throw new Error(`entities: unknown role '${k}'. Known: ${Object.keys(FEEDER_DEFAULTS.entities).join(", ")}`);
      }
      if (v !== null && !feederId(v)) throw new Error(`entities.${k}: '${v}' is not an entity id (null switches it off)`);
    }
    const schedules = c.schedules == null ? FEEDER_DEFAULTS.schedules : c.schedules;
    if (!Array.isArray(schedules) || !schedules.length) throw new Error("schedules must be a list of at least one schedule switch");
    schedules.forEach((s, i) => {
      if (!feederId(s)) throw new Error(`schedules[${i}]: '${s}' is not an entity id`);
    });
    const grace = c.grace_minutes == null ? FEEDER_DEFAULTS.grace_minutes : feederNum(c.grace_minutes);
    if (grace === null || grace < 0) throw new Error("grace_minutes must be a number of minutes");
    if (c.colors != null && (typeof c.colors !== "object" || Array.isArray(c.colors))) {
      throw new Error("colors must be a map, e.g. on: green");
    }

    this._config = {
      name: c.name || FEEDER_DEFAULTS.name,
      schedules,
      entities: { ...FEEDER_DEFAULTS.entities, ...ent },
      grace: grace * 60000,
      tap_action: c.tap_action || { action: "toggle" },
      hold_action: c.hold_action || { action: "more-info" },
      colors: c.colors || {},
    };
    this._applyColors(this._config.colors);
    this._ids = [...new Set([...schedules, ...Object.values(this._config.entities)].filter(Boolean))];
    this._seen = Object.create(null);
    this._build();
    if (this._hass) this._update();
  }

  _applyColors(colors) {
    Object.keys(colors).forEach((k) => {
      if (!FEEDER_COLORS[k]) console.warn(`cat-feeder-card: unknown colors key "${k}". Known: ${Object.keys(FEEDER_COLORS).join(", ")}`);
    });
    Object.entries(FEEDER_COLORS).forEach(([k, [v]]) => {
      const val = typeof colors[k] === "string" && colors[k].trim() ? colors[k].trim() : null;
      if (val) this.style.setProperty(v, val);
      else this.style.removeProperty(v);
    });
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._config) return;
    let changed = first;
    for (const id of this._ids) {
      const s = hass.states[id];
      if (s !== this._seen[id]) {
        this._seen[id] = s;
        changed = true;
      }
    }
    if (changed) this._update();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    clearInterval(this._tick);
    this._tick = setInterval(() => this._update(), FEEDER_TICK_MS);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._tick = null;
    clearTimeout(this._feedTimer);
    this._feedTimer = null;
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return { columns: 3, rows: 2, min_columns: 3, min_rows: 2 };
  }

  /* ---- DOM, built once per config ---------------------------------------- */

  _build() {
    this.shadowRoot.innerHTML = `
      <style>${FEEDER_STYLE}</style>
      <ha-card role="button" tabindex="0">
        <button class="badge" title="Error" aria-label="Open the error sensor">!</button>
        <div class="icon"><svg viewBox="0 0 24 24">${FEEDER_ICON}${FEEDER_KIBBLE}${FEEDER_ZZZ}</svg></div>
        <div class="text">
          <div class="name"></div>
          <div class="status"></div>
          <div class="detail"></div>
        </div>
      </ha-card>`;
    const $ = (s) => this.shadowRoot.querySelector(s);
    this._el = { card: $("ha-card"), badge: $(".badge"), name: $(".name"), status: $(".status"), detail: $(".detail") };
    this._el.name.textContent = this._config.name;
    this._bindPress(this._el.card);
    ["pointerdown", "pointerup", "keydown"].forEach((t) => this._el.badge.addEventListener(t, (e) => e.stopPropagation()));
    this._el.badge.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = this._config.entities.error;
      if (id) this._run({ action: "more-info", entity: id }, "tap", id);
    });
  }

  /* ---- actions ------------------------------------------------------------ */

  _bindPress(el) {
    let timer = null;
    let start = null;
    let held = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
      start = null;
      el.classList.remove("pressed");
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      held = false;
      start = { x: e.clientX, y: e.clientY };
      el.classList.add("pressed");
      timer = setTimeout(() => {
        timer = null;
        held = true;
        el.classList.remove("pressed");
        this._run(this._config.hold_action, "hold");
      }, FEEDER_HOLD_MS);
    });
    el.addEventListener("pointermove", (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > FEEDER_MOVE_PX) cancel();
    });
    el.addEventListener("pointerup", () => {
      if (!start) return;
      const wasHeld = held;
      cancel();
      if (!wasHeld) this._run(this._config.tap_action, "tap");
    });
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      this._run(this._config.tap_action, "tap");
    });
  }

  /* Hands an action to Home Assistant's own handler, like built-in cards do. Default entity: the first schedule. */
  _run(conf, kind, entity) {
    if (!conf || conf.action === "none") return;
    window.dispatchEvent(new CustomEvent("haptic", { detail: kind === "hold" ? "medium" : "light" }));
    const config = { entity: entity || this._config.schedules[0] };
    config[kind === "hold" ? "hold_action" : "tap_action"] = conf;
    this.dispatchEvent(new CustomEvent("hass-action", {
      bubbles: true, composed: true, detail: { config, action: kind },
    }));
  }

  /* ---- time in HA's time zone ---------------------------------------------- */

  _lang() {
    const h = this._hass;
    return (h && h.locale && h.locale.language) || (h && h.language) || "en";
  }

  _tz() {
    return (this._hass && this._hass.config && this._hass.config.time_zone) || undefined;
  }

  _fmt(ms, opts) {
    const tz = this._tz();
    try {
      return new Intl.DateTimeFormat(this._lang(), tz ? { ...opts, timeZone: tz } : opts).format(new Date(ms));
    } catch (_) {
      return new Intl.DateTimeFormat("en-GB", opts).format(new Date(ms));
    }
  }

  _clock(ms) {
    return this._fmt(ms, { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  /* Wall-clock parts in HA's time zone. */
  _parts(ms) {
    const tz = this._tz();
    const opts = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short" };
    let p;
    try {
      p = new Intl.DateTimeFormat("en-US", tz ? { ...opts, timeZone: tz } : opts).formatToParts(new Date(ms));
    } catch (_) {
      p = new Intl.DateTimeFormat("en-US", opts).formatToParts(new Date(ms));
    }
    const o = {};
    p.forEach((x) => { o[x.type] = x.value; });
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: feederKey(o.weekday).slice(0, 3) };
  }

  /* Day number in HA's time zone, for today / yesterday / days ago. */
  _dayNo(ms) {
    const p = this._parts(ms);
    return Math.round(Date.UTC(p.y, p.mo - 1, p.d) / FEEDER_DAY_MS);
  }

  /* Today at hh:mm in HA's time zone, as epoch ms. */
  _todayAt(now, minutes) {
    const p = this._parts(now);
    const offset = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(now / 1000) * 1000;
    return Date.UTC(p.y, p.mo - 1, p.d, Math.floor(minutes / 60), minutes % 60) - offset;
  }

  /* ---- state -------------------------------------------------------------- */

  _s(id) {
    return id && this._hass ? this._hass.states[id] : undefined;
  }

  /* The last confirmed feed: { at, grams, portions } or null when none is known. */
  _lastFeed() {
    const s = this._s(this._config.entities.last_feed);
    if (!s || FEEDER_BAD.includes(feederKey(s.state))) return null;
    const at = Date.parse(s.state);
    if (isNaN(at)) return null;
    const a = s.attributes || {};
    return { at, grams: feederNum(a.grams), portions: feederNum(a.portions) };
  }

  /* Minutes after midnight of a schedule's slots: from `timeslots` ("08:00:00" or "08:00:00 - 08:01:00"), else from next_trigger. */
  _slots(s) {
    const a = s.attributes || {};
    const out = [];
    const slots = Array.isArray(a.timeslots) ? a.timeslots : typeof a.timeslots === "string" ? [a.timeslots] : [];
    for (const t of slots) {
      const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(t));
      if (m) out.push(+m[1] * 60 + +m[2]);
    }
    if (!out.length) {
      const next = Date.parse(a.next_trigger);
      if (!isNaN(next)) {
        const p = this._parts(next);
        out.push(p.h * 60 + p.mi);
      }
    }
    return out;
  }

  /* Whether a schedule runs today, from its `weekdays` attribute; without one: daily. */
  _runsToday(s, now) {
    const w = (s.attributes || {}).weekdays;
    const days = (Array.isArray(w) ? w : w == null ? [] : [w]).map(feederKey);
    if (!days.length || days.includes("daily")) return true;
    const wd = this._parts(now).wd;
    if (days.includes(wd)) return true;
    const weekend = wd === "sat" || wd === "sun";
    if (days.includes("workday")) return !weekend;
    if (days.includes("weekend")) return weekend;
    return false;
  }

  /* The latest run today, on a schedule that is on, more than grace ago, with no feed since. */
  _missed(now, feed) {
    let missed = null;
    for (const id of this._config.schedules) {
      const s = this._s(id);
      if (!s || s.state !== "on" || !this._runsToday(s, now)) continue;
      const since = Date.parse(s.last_changed);
      for (const minutes of this._slots(s)) {
        const at = this._todayAt(now, minutes);
        if (now - at <= this._config.grace) continue; // not yet, or still within the grace time
        if (!isNaN(since) && since > at) continue; // the schedule was switched on after this run
        if (feed && feed.at > at) continue;
        if (missed === null || at > missed) missed = at;
      }
    }
    return missed;
  }

  /* Short and long text for the last feed. */
  _fedText(now, feed) {
    if (!feed) return ["No feed", "No feed recorded"];
    const time = this._clock(feed.at);
    const days = this._dayNo(now) - this._dayNo(feed.at);
    if (days <= 0) {
      const amount = feed.grams !== null ? ` · ${Math.round(feed.grams)} g`
        : feed.portions !== null ? ` · ${Math.round(feed.portions)} portion${Math.round(feed.portions) === 1 ? "" : "s"}` : "";
      return [`Fed ${time}`, `Fed ${time}${amount}`];
    }
    if (days === 1) return ["Yesterday", `Fed yesterday ${time}`];
    if (days <= 6) {
      const wd = this._fmt(feed.at, { weekday: "short" });
      return [`Fed ${wd}`, `Fed ${wd} ${time}`];
    }
    const date = this._fmt(feed.at, { day: "numeric", month: "short" });
    return [`Fed ${date}`, `Fed ${date}`];
  }

  /* Plain text, or a short and a long version; CSS shows the one that fits. */
  _text(el, short, long) {
    const key = long && long !== short ? `${short}\u0000${long}` : short;
    if (el._shown === key) return;
    el._shown = key;
    if (long && long !== short) {
      el.innerHTML = '<span class="short"></span><span class="long"></span>';
      el.firstChild.textContent = short;
      el.lastChild.textContent = long;
    } else {
      el.textContent = short;
    }
  }

  _update() {
    if (!this._hass || !this._el) return;
    const e = this._el;
    const now = Date.now();
    const scheds = this._config.schedules.map((id) => this._s(id));
    const anyOn = scheds.some((s) => s && s.state === "on");
    const known = scheds.some((s) => s && !FEEDER_BAD.includes(feederKey(s.state)));
    const err = this._s(this._config.entities.error);
    const isError = !!err && err.state === "on";
    const feed = this._lastFeed();
    const feeding = !!feed && now >= feed.at && now - feed.at < FEEDER_FEEDING_MS;

    let kind;
    if (isError) kind = "error";
    else if (!known) kind = "unavailable";
    else if (!anyOn) kind = "off";
    else if (feeding) kind = "feeding";
    else kind = "on";

    // Status line
    let status;
    let statusLong = null;
    if (kind === "error") status = "Error";
    else if (kind === "unavailable") status = "Unavailable";
    else if (kind === "off") status = "Off";
    else if (kind === "feeding") status = "Feeding";
    else {
      const next = this._next(now);
      status = next ? `Next ${this._clock(next)}` : "On";
    }

    // Detail line: a missed run beats the last feed.
    const missed = kind === "unavailable" || kind === "off" ? null : this._missed(now, feed);
    let detail;
    let detailLong;
    if (kind === "unavailable" || kind === "off") [detail, detailLong] = ["", ""]; // off: grey, just "Off"
    else if (missed !== null) [detail, detailLong] = ["Missed", `Missed ${this._clock(missed)}`]; // "Missed 08:00" does not fit 84px
    else [detail, detailLong] = this._fedText(now, feed);

    const colour = kind === "error" ? "error" : kind === "off" ? "off" : kind === "unavailable" ? "unavailable" : kind === "feeding" ? "feeding" : "on";
    e.card.style.setProperty("--c", `var(${FEEDER_COLORS[colour][0]})`);
    ["error", "off", "feeding", "on", "unavailable"].forEach((k) => e.card.classList.toggle(k, kind === k));
    e.card.classList.toggle("nodetail", !detail);
    e.detail.classList.toggle("missed", missed !== null);
    this._text(e.status, status, statusLong);
    this._text(e.detail, detail, detailLong);

    // Tooltip and label with the full date and time of the last feed.
    const full = feed ? this._fmt(feed.at, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : null;
    const amount = feed && feed.grams !== null ? `, ${Math.round(feed.grams)} g` : feed && feed.portions !== null ? `, ${Math.round(feed.portions)} portions` : "";
    const title = [missed !== null ? `Missed the ${this._clock(missed)} feed` : null, full ? `Last feed: ${full}${amount}` : "No feed recorded"].filter(Boolean).join(". ");
    e.card.title = title;
    e.card.setAttribute("aria-label", `${this._config.name}: ${status}. ${title}`);

    // End the feeding animation on time, not at the next 30 s tick.
    clearTimeout(this._feedTimer);
    this._feedTimer = null;
    if (feeding && this.isConnected) this._feedTimer = setTimeout(() => this._update(), feed.at + FEEDER_FEEDING_MS - now + 50);
  }

  /* The earliest future next_trigger among schedules that are on. */
  _next(now) {
    let best = null;
    for (const id of this._config.schedules) {
      const s = this._s(id);
      if (!s || s.state !== "on") continue;
      const t = Date.parse((s.attributes || {}).next_trigger);
      if (!isNaN(t) && t > now && (best === null || t < best)) best = t;
    }
    return best;
  }
}

if (!customElements.get("cat-feeder-card")) {
  customElements.define("cat-feeder-card", CatFeederCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "cat-feeder-card")) {
  window.customCards.push({
    type: "cat-feeder-card",
    name: "Cat Feeder Card",
    description: "Cat feeder on a feeding schedule: schedule on or off, next feed, last confirmed feed, missed feeds and errors.",
    preview: true,
    documentationURL: "https://github.com/BarBaar44/cat-feeder",
  });
}

console.info(`%c CAT-FEEDER-CARD %c ${VERSION} `, "background:#4caf50;color:#fff", "");
}
