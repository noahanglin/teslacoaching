/* =========================================================
   SITE SETTINGS: edit these to match your business
   ========================================================= */
const CONFIG = {
  contactEmail: "moiracoaching@gmail.com",

  prices: {
    liveHourly: 55, // $ per hour
    vod: 30,        // $ per replay
    privateAddon: 5, // $ added to any order when "keep my session private" is checked
  },

  // Your time zone. Availability below is written in this zone and
  // is automatically shown to visitors in THEIR local time.
  // Full list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
  coachTimeZone: "America/New_York",

  // Weekly availability (24h clock, in coachTimeZone).
  // 0 = Sunday ... 6 = Saturday. Leave an empty array for days off.
  // "24:00" means midnight at the end of that day; sessions must finish by then.
  availability: {
    0: [["17:00", "24:00"]],
    1: [["17:00", "24:00"]],
    2: [["17:00", "24:00"]],
    3: [["17:00", "24:00"]],
    4: [["17:00", "24:00"]],
    5: [["17:00", "24:00"]],
    6: [["17:00", "24:00"]],
  },

  slotStepMinutes: 30,  // how often a session can start (30 = on the hour and half hour)
  daysAhead: 14,        // how far out people can book
  minNoticeHours: 12,   // no bookings sooner than this

  // Already-booked start times, as ISO strings in UTC, e.g. "2026-11-12T23:00:00Z".
  // (Later this will come from your real booking system.)
  bookedSlots: [],

  // Web3Forms access key (free, from web3forms.com). When set, booking details
  // are emailed to you automatically as soon as someone clicks
  // "Continue to payment". Leave "" to have customers email them instead.
  web3formsKey: "a406df78-c071-4844-b39b-403a29e585c2",

  // Stripe Payment Links (create these in your Stripe dashboard, then paste
  // each link here). Each link must charge exactly the price shown.
  // Leave one blank ("") and that option falls back to an email request.
  paymentLinks: {
    "live-60":          "https://book.stripe.com/eVq5kDgp98cbgad4pPbjW00", // Live coaching, 1 hour              $55.00
    "live-90":          "https://book.stripe.com/eVqbJ10qbdwvf691dDbjW01", // Live coaching, 1.5 hours           $82.50
    "live-120":         "https://book.stripe.com/4gM28r6Oz2RRaPT5tTbjW02", // Live coaching, 2 hours             $110.00
    "vod":              "https://book.stripe.com/eVqaEX4GrfED6zD09zbjW03", // VOD review                         $30.00
    "live-60-private":  "https://book.stripe.com/6oUaEXa0L643bTX8G5bjW04", // Live coaching, 1 hour + private    $60.00
    "live-90-private":  "https://book.stripe.com/9B628r0qb2RRgad9K9bjW05", // Live coaching, 1.5 hours + private $87.50
    "live-120-private": "https://book.stripe.com/4gMbJ1fl5bon6zDaOdbjW06", // Live coaching, 2 hours + private   $115.00
    "vod-private":      "https://book.stripe.com/3cI9ATc8T3VV2jn1dDbjW07", // VOD review + private               $35.00
  },
};

/* ========================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const money = (n) => `$${n.toFixed(2)}`;
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/* ---------- Time zone helpers ---------- */

// Minutes that `tz` is ahead of UTC at instant `ts`.
function tzOffsetMinutes(ts, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ts));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - ts) / 60000);
}

// Convert a wall-clock time in `tz` to a real Date.
function zonedTimeToDate(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m, d, h, min);
  let offset = tzOffsetMinutes(guess, tz);
  let ts = guess - offset * 60000;
  const offset2 = tzOffsetMinutes(ts, tz);
  if (offset2 !== offset) ts = guess - offset2 * 60000; // DST edge
  return new Date(ts);
}

function todayInZone(tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month - 1, d: +p.day };
}

const localDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/* ---------- Slot generation ---------- */

function generateSlots(durationHours) {
  const durationMin = durationHours * 60;
  const earliest = Date.now() + CONFIG.minNoticeHours * 3600000;
  const booked = new Set(CONFIG.bookedSlots.map((s) => new Date(s).getTime()));
  const start = todayInZone(CONFIG.coachTimeZone);
  const slots = [];

  for (let i = 0; i <= CONFIG.daysAhead; i++) {
    const day = new Date(Date.UTC(start.y, start.m, start.d + i));
    const y = day.getUTCFullYear(), m = day.getUTCMonth(), d = day.getUTCDate();
    const windows = CONFIG.availability[day.getUTCDay()] || [];

    for (const [from, to] of windows) {
      const [fh, fm] = from.split(":").map(Number);
      const [th, tm] = to.split(":").map(Number);
      const winStart = fh * 60 + fm;
      const winEnd = th * 60 + tm;

      for (let t = winStart; t + durationMin <= winEnd; t += CONFIG.slotStepMinutes) {
        const date = zonedTimeToDate(y, m, d, Math.floor(t / 60), t % 60, CONFIG.coachTimeZone);
        if (date.getTime() < earliest || booked.has(date.getTime())) continue;
        slots.push(date);
      }
    }
  }
  return slots;
}

/* ---------- Booking widget ---------- */

const state = {
  service: "live",
  duration: 1,
  dateKey: null,
  slot: null, // Date
  private: false,
};

const fmtDow = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const fmtMon = new Intl.DateTimeFormat(undefined, { month: "short" });
const fmtTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const fmtFull = new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});

let slotsByDay = new Map();

function rebuildSlots() {
  slotsByDay = new Map();
  for (const s of generateSlots(state.duration)) {
    const key = localDateKey(s);
    if (!slotsByDay.has(key)) slotsByDay.set(key, []);
    slotsByDay.get(key).push(s);
  }
  // keep current selection only if it still exists
  if (state.slot && !(slotsByDay.get(state.dateKey) || []).some((s) => s.getTime() === state.slot.getTime())) {
    state.slot = null;
  }
  if (state.dateKey && !slotsByDay.has(state.dateKey)) state.dateKey = null;
  if (!state.dateKey) state.dateKey = slotsByDay.keys().next().value || null;
  renderDates();
  renderTimes();
}

function renderDates() {
  const strip = $("#date-strip");
  strip.innerHTML = "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i <= CONFIG.daysAhead; i++) {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    const key = localDateKey(day);
    const hasSlots = slotsByDay.has(key);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-btn";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", String(key === state.dateKey));
    btn.disabled = !hasSlots;
    btn.dataset.key = key;
    btn.innerHTML = `<span class="dow">${fmtDow.format(day)}</span><span class="day">${day.getDate()}</span><span class="mon">${fmtMon.format(day)}</span>`;
    btn.setAttribute("aria-label", `${day.toDateString()}${hasSlots ? "" : " (unavailable)"}`);
    btn.addEventListener("click", () => {
      state.dateKey = key;
      state.slot = null;
      renderDates();
      renderTimes();
      updateSummary();
    });
    strip.appendChild(btn);
  }
}

function renderTimes() {
  const grid = $("#time-grid");
  grid.innerHTML = "";
  const slots = slotsByDay.get(state.dateKey) || [];

  if (!state.dateKey || slots.length === 0) {
    grid.innerHTML = `<p class="muted">No open times for this day. Try another date.</p>`;
    return;
  }
  for (const s of slots) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "time-btn";
    btn.textContent = fmtTime.format(s);
    btn.setAttribute("aria-pressed", String(state.slot && state.slot.getTime() === s.getTime()));
    btn.addEventListener("click", () => {
      state.slot = s;
      renderTimes();
      updateSummary();
      clearError();
    });
    grid.appendChild(btn);
  }
}

function total() {
  const base = state.service === "live" ? CONFIG.prices.liveHourly * state.duration : CONFIG.prices.vod;
  return base + (state.private ? CONFIG.prices.privateAddon : 0);
}

function durationLabel(h) {
  return h === 1 ? "1 hour" : `${h} hours`;
}

function updateSummary() {
  const live = state.service === "live";
  $("#sum-service").textContent = live ? "Live Coaching" : "VOD Review";
  $("#sum-length-row").hidden = !live;
  $("#sum-when-row").hidden = !live;
  $("#sum-delivery-row").hidden = live;
  $("#sum-private-row").hidden = !state.private;
  $("#sum-length").textContent = durationLabel(state.duration);
  $("#sum-when").textContent = state.slot ? fmtFull.format(state.slot) : "Not selected";
  $("#sum-total").textContent = money(total());
}

function setService(service) {
  state.service = service;
  const radio = $(`input[name="service"][value="${service}"]`);
  if (radio) radio.checked = true;
  $("#live-fields").hidden = service !== "live";
  $("#vod-fields").hidden = service !== "vod";
  $("#details-legend").textContent = service === "live" ? "5. Your details" : "3. Your details";
  $("#privacy-legend").textContent = service === "live" ? "6. Privacy" : "4. Privacy";
  clearError();
  updateSummary();
}

/* ---------- Validation & submit ---------- */

function showError(msg, field) {
  $("#form-error").textContent = msg;
  if (field) {
    field.classList.add("invalid");
    field.focus();
  }
}
function clearError() {
  $("#form-error").textContent = "";
  $$(".invalid").forEach((el) => el.classList.remove("invalid"));
}

function validate() {
  clearError();
  if (state.service === "live" && !state.slot) {
    showError("Please pick a date and time for your session.");
    $("#time-grid").scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }
  if (state.service === "vod") {
    const code = $("#replay-code");
    if (!code.value.trim()) return showError("Please enter your replay code.", code), false;
  }
  const name = $("#name"), email = $("#email"), discord = $("#discord");
  if (!name.value.trim()) return showError("Please enter your name.", name), false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) return showError("Please enter a valid email.", email), false;
  if (!discord.value.trim()) return showError("Please enter your Discord username.", discord), false;
  return true;
}

/* ---------- Stripe checkout ---------- */

// Which Payment Link matches the current selection, e.g. "live-90-private"
function paymentKey() {
  const base = state.service === "live" ? `live-${Math.round(state.duration * 60)}` : "vod";
  return state.private ? `${base}-private` : base;
}

// Short booking ID like "TC-K7F3Q2" so a payment can be matched to its booking
function newBookingId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alikes (0/O, 1/I)
  let id = "TC-";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// Reference stored on the Stripe payment (letters, numbers, - and _ only):
// booking ID + service + start time in UTC, e.g. TC-K7F3Q2_live90_20261112T2300Z
function stripeReference() {
  let ref = `${state.bookingId}_${paymentKey().replace(/-/g, "")}`;
  if (state.service === "live" && state.slot) {
    ref += "_" + state.slot.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "").slice(0, 13) + "Z";
  }
  return ref;
}

function paymentUrl() {
  const link = CONFIG.paymentLinks[paymentKey()];
  if (!link) return null;
  try {
    const url = new URL(link);
    url.searchParams.set("client_reference_id", stripeReference());
    url.searchParams.set("prefilled_email", $("#email").value.trim());
    return url.toString();
  } catch {
    return null; // not a valid URL
  }
}

function bookingText() {
  const lines = [`Booking ID: ${state.bookingId}`];
  if (state.service === "live") {
    lines.push("Service: Live Coaching");
    lines.push(`Length: ${durationLabel(state.duration)}`);
    lines.push(`When: ${fmtFull.format(state.slot)}`);
    lines.push(`When (UTC): ${state.slot.toISOString()}`);
  } else {
    lines.push("Service: VOD Review");
    lines.push(`Replay code: ${$("#replay-code").value.trim()}`);
    const notes = $("#vod-notes").value.trim();
    if (notes) lines.push(`Notes: ${notes}`);
  }
  lines.push(`Private (do not post): ${state.private ? `Yes (+${money(CONFIG.prices.privateAddon)})` : "No"}`);
  lines.push(`Total: ${money(total())}`);
  lines.push("");
  lines.push(`Name: ${$("#name").value.trim()}`);
  lines.push(`Email: ${$("#email").value.trim()}`);
  lines.push(`Discord: ${$("#discord").value.trim()}`);
  lines.push(`Rank: ${$("#rank").value}`);
  lines.push(`Time zone: ${userTimeZone}`);
  return lines.join("\n");
}

// Email the booking details to you through Web3Forms (resolves true/false)
async function sendBookingDetails(text) {
  const customerEmail = $("#email").value.trim();
  const service = state.service === "live" ? "Live Coaching" : "VOD Review";
  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: CONFIG.web3formsKey,
        subject: `New booking ${state.bookingId}: ${service} ${money(total())} (check Stripe for payment)`,
        from_name: "Coaching website",
        name: $("#name").value.trim(),
        email: customerEmail, // replying to the email goes to the customer
        message: text,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.success !== false;
  } catch {
    return false;
  }
}

let lastSent = { key: "", id: "" }; // avoid emailing the same booking twice

function setModalStatus(kind, message) {
  const el = $("#modal-status");
  el.hidden = !kind;
  el.className = `modal-status ${kind || ""}`;
  el.textContent = message || "";
}

function openModal() {
  // Same details as the last booking that was sent? Reuse its ID and don't resend.
  const detailsKey = (() => { state.bookingId = ""; return bookingText(); })();
  const alreadySent = CONFIG.web3formsKey && detailsKey === lastSent.key;
  state.bookingId = alreadySent ? lastSent.id : newBookingId();

  const text = bookingText();
  $("#modal-summary").textContent = text;
  const subject = `${state.service === "live" ? "Live Coaching booking" : "VOD Review"} ${state.bookingId}`;
  $("#modal-send").href = `mailto:${CONFIG.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  const pay = paymentUrl();
  const autoSend = !!CONFIG.web3formsKey;
  $("#pay-step").hidden = !pay;
  $("#email-step").hidden = autoSend; // shown again below if sending fails
  $("#modal-send").classList.toggle("btn-ghost", !!pay); // email is the main button when there's no payment link

  if (pay) {
    $("#modal-title").textContent = "Almost done!";
    $("#modal-intro").textContent = autoSend
      ? "Last step: pay to lock in your session."
      : "Two quick steps to lock in your session.";
    $("#modal-pay").href = pay;
    $("#modal-pay").textContent = `Pay ${money(total())} with Stripe`;
    $("#modal-note").textContent = `Your booking ID ${state.bookingId} is attached to your payment so I can match them up.`;
    try { localStorage.setItem("lastBookingId", state.bookingId); } catch { /* storage unavailable */ }
  } else {
    $("#modal-title").textContent = autoSend ? "Booking request" : "Booking request ready";
    $("#modal-intro").textContent = autoSend
      ? "I'll confirm your session and reply with a payment link."
      : "Online payment for this option isn't set up yet. Send me your details and I'll confirm your session and reply with a payment link.";
    $("#modal-note").textContent = "";
  }

  setModalStatus(null);
  if (autoSend) {
    if (alreadySent) {
      setModalStatus("sent", "Your booking details were sent to Tesla.");
    } else {
      setModalStatus("sending", "Sending your booking details…");
      const bookingId = state.bookingId;
      sendBookingDetails(text).then((ok) => {
        if (state.bookingId !== bookingId) return; // a newer booking replaced this one
        if (ok) {
          lastSent = { key: detailsKey, id: bookingId };
          setModalStatus("sent", "Your booking details were sent to Tesla.");
        } else {
          setModalStatus("failed", "Couldn't send your details automatically. Please email them with the button below.");
          $("#email-step").hidden = false;
          $("#modal-intro").textContent = pay
            ? "Two quick steps to lock in your session."
            : "Send me your details and I'll confirm your session and reply with a payment link.";
        }
      });
    }
  }

  $("#modal").hidden = false;
  $("#modal-close").focus();
}

// Shown when Stripe sends the customer back after paying (?paid=1)
function showPaidMessage() {
  const params = new URLSearchParams(location.search);
  if (params.get("paid") !== "1") return;
  let id = "";
  try { id = localStorage.getItem("lastBookingId") || ""; } catch { /* storage unavailable */ }
  $("#paid-id").textContent = id ? ` (booking ID ${id})` : "";
  $("#paid-modal").hidden = false;
  $("#paid-close").focus();
  // tidy the address bar so a refresh doesn't show this again
  params.delete("paid");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
}
function closePaidMessage() {
  $("#paid-modal").hidden = true;
}
function closeModal() {
  $("#modal").hidden = true;
  $("#submit-btn").focus();
}

/* ---------- Orb tendrils that latch onto the cursor ---------- */

const TETHER = {
  latchDistance: 480, // px from an orb's center where its tendril grabs the cursor
  follow: 0.55,       // 0-1, how tightly the tip tracks the cursor
  fadeIn: 0.22,       // 0-1, how fast the tendril appears
  fadeOut: 0.05,      // 0-1, how fast it fades after letting go
  retract: 0.96,      // 0-1, how much the tip pulls back toward the orb each frame while fading
  // The body of the tendril is a springy rope: the cursor drags the tip and the
  // rest of the ribbon trails behind it, then swings back into line.
  stiffness: 0.06,    // 0-1, how hard each part of the rope pulls back into line (lower = more trailing)
  damping: 0.82,      // 0-1, how long the swing lasts (higher = more whip)
};

// Look of the ribbon (sizes are in SVG units; ~2px each on desktop)
const RIBBON = {
  width: 4.6,     // bright core thickness at its fattest
  glow: 4.5,      // glow thickness as a multiple of the core
  wave: 0.035,    // ripple height as a fraction of the tendril length
  waves: 2.4,     // how many ripples fit along the tendril
  waveSpeed: 0.005, // how fast the ripples travel toward the cursor
};
// Orbs get used up while a tendril is attached, then respawn
const ORB_LIFE = {
  drainMs: 10000,       // total attached time before the orb is spent
  minScale: 0.08,       // how small the orb gets right before it disappears
  fadeOutMs: 450,       // fade once spent
  respawnDelayMs: 2000, // time the orb stays gone
  fadeInMs: 500,        // fade back in when it respawns
};
const ROPE_NODES = 14;  // joints in the springy rope
const SPARK_COUNT = 10; // glowing flecks that stream along the tendril
const SVG_NS = "http://www.w3.org/2000/svg";

function initOrbTethers() {
  const orbs = $$(".borb svg").map((svg) => {
    const group = $(".tether", svg);
    if (!group) return null;
    const make = (parent, tag, attrs = {}) => {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      parent.appendChild(el);
      return el;
    };
    const sparks = Array.from({ length: SPARK_COUNT }, (_, i) => ({
      seed: i / SPARK_COUNT,
      jitter: Math.random() * 100,
      el: make($(".tether-sparks", svg), "circle", { r: 1 }),
    }));
    return {
      svg,
      group,
      glow: make($(".tether-glows", svg), "path"),
      core: make($(".tether-cores", svg), "path"),
      rope: Array.from({ length: ROPE_NODES + 1 }, () => ({ x: 0, y: 0, vx: 0, vy: 0 })),
      bodies: $$(".orb-body", svg),
      // state: "active" (can latch, shrinks while attached) -> "fading" -> "gone" -> "spawning" -> "active"
      life: { state: "active", used: 0, t: 0, shown: "" },
      sparks,
      flare: $(".tether-flare", svg),
      flareGlow: $(".flare-glow", svg),
      // blur filter region gets resized each frame to hug the tendril
      regions: $$('filter[id$="-tb"]', svg),
      latched: false,
      alpha: 0,
      tx: 0,
      ty: 0,
      phase: Math.random() * Math.PI * 2,
    };
  }).filter(Boolean);
  if (!orbs.length) return;

  // Move the rope: the orb end is pinned, the tip end is pinned to the cursor,
  // and every joint in between springs toward the straight line between them.
  function stepRope(o) {
    const n = ROPE_NODES;
    const rope = o.rope;
    rope[0].x = 0; rope[0].y = 0;
    rope[n].x = o.tx; rope[n].y = o.ty;
    for (let i = 1; i < n; i++) {
      const p = rope[i];
      const s = i / n;
      p.vx = (p.vx + (s * o.tx - p.x) * TETHER.stiffness) * TETHER.damping;
      p.vy = (p.vy + (s * o.ty - p.y) * TETHER.stiffness) * TETHER.damping;
      p.x += p.vx;
      p.y += p.vy;
    }
    // smooth out kinks so it reads as one flowing ribbon
    for (let i = 1; i < n; i++) {
      const a = rope[i - 1], p = rope[i], b = rope[i + 1];
      p.x = p.x * 0.5 + (a.x + b.x) * 0.25;
      p.y = p.y * 0.5 + (a.y + b.y) * 0.25;
    }
  }

  // Smooth curve through the rope joints (Catmull-Rom), with a travelling ripple
  function ribbonCurve(o, len, time) {
    const rope = o.rope;
    const n = ROPE_NODES;
    const steps = 3; // curve points per rope segment
    const raw = [];
    for (let i = 0; i < n; i++) {
      const p0 = rope[Math.max(0, i - 1)], p1 = rope[i], p2 = rope[i + 1], p3 = rope[Math.min(n, i + 2)];
      for (let k = 0; k < steps; k++) {
        const t = k / steps, t2 = t * t, t3 = t2 * t;
        raw.push([
          0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        ]);
      }
    }
    raw.push([rope[n].x, rope[n].y]);

    const last = raw.length - 1;
    return raw.map(([x, y], i) => {
      const a = raw[Math.max(0, i - 1)], b = raw[Math.min(last, i + 1)];
      const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / dl, ny = (b[0] - a[0]) / dl;
      const u = i / last;
      const off = len * RIBBON.wave * Math.sin(Math.PI * u) *
        Math.sin(Math.PI * 2 * RIBBON.waves * u - time * RIBBON.waveSpeed + o.phase);
      return [x + nx * off, y + ny * off];
    });
  }

  // Tapered ribbon (closed shape) around a curve
  function ribbonPath(pts, width, bounds) {
    const last = pts.length - 1;
    const left = [];
    const right = [];
    for (let i = 0; i <= last; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(last, i + 1)];
      const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dx = (b[0] - a[0]) / dl, dy = (b[1] - a[1]) / dl;
      const half = (width * Math.pow(Math.sin(Math.PI * (i / last)), 0.8)) / 2;
      const [x, y] = pts[i];
      left.push(`${(x - dy * half).toFixed(1)} ${(y + dx * half).toFixed(1)}`);
      right.push(`${(x + dy * half).toFixed(1)} ${(y - dx * half).toFixed(1)}`);
      if (bounds) {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
    return `M${left.join(" L")} L${right.reverse().join(" L")} Z`;
  }

  const pointer = { x: 0, y: 0, active: false };
  let running = false;

  let lastTime = null;
  function kick() {
    if (!running) {
      running = true;
      lastTime = null;
      requestAnimationFrame(frame);
    }
  }

  // Advance an orb's used-up / respawn cycle and size/fade its body to match
  function updateLife(o, dt) {
    const L = o.life;
    const C = ORB_LIFE;
    if (L.state === "active") {
      if (o.latched) L.used = Math.min(C.drainMs, L.used + dt);
      if (L.used >= C.drainMs) { L.state = "fading"; L.t = 0; }
    } else {
      L.t += dt;
      if (L.state === "fading" && L.t >= C.fadeOutMs) { L.state = "gone"; L.t = 0; }
      else if (L.state === "gone" && L.t >= C.respawnDelayMs) { L.state = "spawning"; L.t = 0; L.used = 0; }
      else if (L.state === "spawning" && L.t >= C.fadeInMs) { L.state = "active"; L.t = 0; }
    }

    let scale = 1;
    let opacity = 1;
    if (L.state === "active") {
      scale = 1 - (1 - C.minScale) * (L.used / C.drainMs);
    } else if (L.state === "fading") {
      const k = Math.min(1, L.t / C.fadeOutMs);
      scale = C.minScale * (1 - 0.6 * k);
      opacity = 1 - k;
    } else if (L.state === "gone") {
      scale = 0.001;
      opacity = 0;
    } else {
      const k = Math.min(1, L.t / C.fadeInMs);
      scale = 0.75 + 0.25 * (1 - (1 - k) * (1 - k)); // ease-out grow back to full size
      opacity = k;
    }

    const shown = `${scale.toFixed(4)}|${opacity.toFixed(3)}`;
    if (shown !== L.shown) {
      L.shown = shown;
      for (const b of o.bodies) {
        b.setAttribute("transform", `scale(${scale.toFixed(4)})`);
        b.setAttribute("opacity", opacity.toFixed(3));
      }
    }
    return L.state !== "active"; // still animating on its own
  }

  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    kick();
  }, { passive: true });
  const release = () => { pointer.active = false; kick(); };
  document.documentElement.addEventListener("mouseleave", release);
  window.addEventListener("blur", release);
  window.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") release(); });
  window.addEventListener("pointercancel", release);
  // Scrolling moves the orbs under a still cursor, so re-check on scroll too
  window.addEventListener("scroll", () => { if (pointer.active) kick(); }, { passive: true });

  function frame(time) {
    let busy = false;
    const dt = lastTime === null ? 16 : Math.min(50, time - lastTime); // ms since last frame
    lastTime = time;

    for (const o of orbs) {
      const rect = o.svg.getBoundingClientRect();
      const scale = rect.width / 240; // screen px per SVG unit (viewBox is 240 wide)
      const dx = pointer.x - (rect.left + rect.width / 2);
      const dy = pointer.y - (rect.top + rect.height / 2);
      const inRange = pointer.active && o.life.state === "active" &&
        Math.hypot(dx, dy) < TETHER.latchDistance;

      if (inRange) {
        const targetX = dx / scale;
        const targetY = dy / scale;
        if (!o.latched && o.alpha < 0.05) {
          // fresh grab: start the tip at the orb's surface so the tendril shoots out
          const len = Math.hypot(targetX, targetY) || 1;
          o.tx = (targetX / len) * 40;
          o.ty = (targetY / len) * 40;
          o.rope.forEach((p, i) => {
            p.x = (i / ROPE_NODES) * o.tx;
            p.y = (i / ROPE_NODES) * o.ty;
            p.vx = 0;
            p.vy = 0;
          });
        }
        o.latched = true;
        o.tx += (targetX - o.tx) * TETHER.follow;
        o.ty += (targetY - o.ty) * TETHER.follow;
        o.alpha += (1 - o.alpha) * TETHER.fadeIn;
      } else {
        o.latched = false;
        o.alpha += (0 - o.alpha) * TETHER.fadeOut;
        o.tx *= TETHER.retract;
        o.ty *= TETHER.retract;
      }

      if (updateLife(o, dt)) busy = true;

      if (o.alpha < 0.01 && !o.latched) {
        o.alpha = 0;
        o.group.setAttribute("opacity", "0");
        continue;
      }
      busy = true;

      const len = Math.hypot(o.tx, o.ty) || 1;
      const nx = -o.ty / len; // unit normal to the orb -> cursor line
      const ny = o.tx / len;
      const bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

      // one wispy ribbon: a wide blurred glow + a thin bright core
      stepRope(o);
      const pts = ribbonCurve(o, len, time);
      o.glow.setAttribute("d", ribbonPath(pts, RIBBON.width * RIBBON.glow, bounds));
      o.core.setAttribute("d", ribbonPath(pts, RIBBON.width, null));

      // sparks streaming from the orb out along the ribbon
      for (const s of o.sparks) {
        const t = (time * 0.00045 + s.seed) % 1;
        const [x, y] = pts[Math.round(t * (pts.length - 1))];
        const drift = len * 0.06 * Math.sin(s.jitter + time * 0.002) * Math.sin(Math.PI * t);
        s.el.setAttribute("cx", (x + nx * drift).toFixed(1));
        s.el.setAttribute("cy", (y + ny * drift).toFixed(1));
        s.el.setAttribute("r", (0.6 + 1.4 * (1 - t)).toFixed(2));
        s.el.setAttribute("opacity", Math.sin(Math.PI * t).toFixed(2));
      }

      // lens-flare at the point where the tendril grabs the cursor
      o.flare.setAttribute("transform", `translate(${o.tx.toFixed(1)} ${o.ty.toFixed(1)})`);
      o.flareGlow.setAttribute("r", (9 + Math.sin(time / 110 + o.phase) * 2.5).toFixed(2));

      // keep the blur filter just big enough to cover the tendril
      const pad = 40;
      for (const f of o.regions) {
        f.setAttribute("x", (bounds.minX - pad).toFixed(0));
        f.setAttribute("y", (bounds.minY - pad).toFixed(0));
        f.setAttribute("width", (bounds.maxX - bounds.minX + pad * 2).toFixed(0));
        f.setAttribute("height", (bounds.maxY - bounds.minY + pad * 2).toFixed(0));
      }

      o.group.setAttribute("opacity", o.alpha.toFixed(3));
    }

    if (busy) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }
}

/* ---------- Feedback carousel ---------- */

function initCarousel() {
  const track = $("#reviews-track");
  if (!track) return;
  const prev = $(".carousel-prev");
  const next = $(".carousel-next");
  const dotsWrap = $("#reviews-dots");

  // Cards fill top-to-bottom, then left-to-right, in 2 rows.
  const cols = () => parseInt(getComputedStyle(track).getPropertyValue("--cols"), 10) || 1;
  const columnStep = () => {
    const cards = track.children;
    return cards.length > 2 ? cards[2].offsetLeft - cards[0].offsetLeft : track.clientWidth;
  };
  const pageWidth = () => columnStep() * cols();
  const pageCount = () => Math.max(1, Math.ceil(Math.ceil(track.children.length / 2) / cols()));
  const currentPage = () => Math.min(pageCount() - 1, Math.round(track.scrollLeft / pageWidth()));

  function buildDots() {
    dotsWrap.innerHTML = "";
    for (let i = 0; i < pageCount(); i++) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.tabIndex = -1;
      dot.addEventListener("click", () => track.scrollTo({ left: i * pageWidth() }));
      dotsWrap.appendChild(dot);
    }
    update();
  }

  function update() {
    const page = currentPage();
    const max = track.scrollWidth - track.clientWidth;
    const atStart = track.scrollLeft <= 2;
    const atEnd = track.scrollLeft >= max - 2;
    prev.disabled = atStart;
    next.disabled = atEnd;
    track.classList.toggle("at-start", atStart);
    track.classList.toggle("at-end", atEnd);
    $$("button", dotsWrap).forEach((d, i) => d.classList.toggle("active", i === page));
  }

  prev.addEventListener("click", () => track.scrollBy({ left: -pageWidth() }));
  next.addEventListener("click", () => track.scrollBy({ left: pageWidth() }));
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next.click(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); prev.click(); }
  });

  let raf;
  track.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(update);
  });
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildDots, 150);
  });

  buildDots();
}

/* ---------- Wire up ---------- */

document.addEventListener("DOMContentLoaded", () => {
  $("#year").textContent = new Date().getFullYear();
  $("#tz-label").textContent = `(your time: ${userTimeZone.replace(/_/g, " ")})`;

  // mobile nav
  const toggle = $(".nav-toggle");
  const links = $(".nav-links");
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  $$(".nav-links a").forEach((a) => a.addEventListener("click", () => {
    links.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }));

  // service cards preselect the booking form
  $$("[data-service]").forEach((el) => el.addEventListener("click", () => setService(el.dataset.service)));

  $$('input[name="service"]').forEach((r) => r.addEventListener("change", () => setService(r.value)));
  $$('input[name="duration"]').forEach((r) => r.addEventListener("change", () => {
    state.duration = Number(r.value);
    rebuildSlots();
    updateSummary();
  }));
  $("#private").addEventListener("change", (e) => {
    state.private = e.target.checked;
    updateSummary();
  });
  $$("#booking-form input, #booking-form textarea").forEach((el) =>
    el.addEventListener("input", () => el.classList.remove("invalid")));

  $("#booking-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (validate()) openModal();
  });

  // modal
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#modal").hidden) closeModal();
    if (!$("#paid-modal").hidden) closePaidMessage();
  });
  $("#paid-close").addEventListener("click", closePaidMessage);
  $("#paid-x").addEventListener("click", closePaidMessage);
  $("#paid-modal").addEventListener("click", (e) => { if (e.target.id === "paid-modal") closePaidMessage(); });
  showPaidMessage();
  $("#modal-copy").addEventListener("click", async () => {
    const btn = $("#modal-copy");
    try {
      await navigator.clipboard.writeText($("#modal-summary").textContent);
      btn.textContent = "Copied!";
    } catch {
      btn.textContent = "Copy failed";
    }
    setTimeout(() => (btn.textContent = "Copy details"), 1800);
  });

  // Freeze the SVG orb animations for visitors who prefer reduced motion
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    $$(".borb svg").forEach((svg) => svg.pauseAnimations && svg.pauseAnimations());
  }

  // "Copy" buttons (e.g. Discord username in the About section)
  $$("[data-copy]").forEach((btn) => btn.addEventListener("click", async () => {
    const hint = $(".copy-hint", btn);
    let ok = false;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      ok = true;
    } catch {
      // older browsers / non-secure pages: copy via a hidden text box
      const ta = document.createElement("textarea");
      ta.value = btn.dataset.copy;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
    }
    if (hint) hint.textContent = ok ? "Copied!" : "Copy failed";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.classList.remove("copied");
      if (hint) hint.textContent = "Copy";
    }, 1800);
  }));

  initOrbTethers();
  initCarousel();
  rebuildSlots();
  updateSummary();
});
