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
  minNoticeHours: 24,   // no bookings (or reschedules) sooner than this; keep BOOKING_NOTICE_HOURS in the sheet script the same

  // Your bookings Google Sheet web app (see BOOKINGS-SETUP.md). It:
  // - tells the site which times are booked, so they show greyed out, and
  // - when a customer comes back from Stripe, checks WITH STRIPE that they
  //   really paid, then records the order, blocks the time and sends both
  //   emails (yours and the customer's) from your Gmail.
  bookingsUrl: "https://script.google.com/macros/s/AKfycbxC6CsTotgpFHxQbm1X8MThDjTHx-r0hIle6prtniFphtHl_HwsEMqnfiA0Kyof1-SB/exec",

  // Stripe's payment form shown inside the site (embedded checkout).
  // Publishable keys are meant to be public: Stripe → Developers → API keys.
  // The bookings sheet creates each checkout with its own secret key.
  // While the live key is blank, customers go to the payment links below.
  stripePublishableKey: "pk_live_51QrUXOFfi36TOg6mRUUSKamfLVMUPQHo4SVfaUV1YH8kEWSdY3DJ5J8yUoEdTdDjkweOOR7mRzwfa2f9nq9iTXDE00mhiERW1O",
  // Optional: Stripe TEST mode key. Opening the site with ?test=1 shows a
  // "Test booking" button that runs the whole flow with no real charge
  // (pay with card 4242 4242 4242 4242, any future date, any CVC).
  stripeTestPublishableKey: "pk_test_51QrUXOFfi36TOg6mngtSUhAuQMKHvF9ZRgouHJpAzsd0KyiQhwkQbEuxBdSGG8JHGF6OXIsMbJpGyPhuUl7ECFti001L371LXf",

  // BACKUP: Stripe Payment Links, used only if the embedded form can't load
  // (key not set, Stripe or the bookings sheet unreachable). Each link must
  // charge exactly the price shown.
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
        if (date.getTime() < earliest) continue;
        slots.push(date);
      }
    }
  }
  return slots;
}

/* ---------- Booked times (from the bookings Google Sheet) ---------- */

let bookedRanges = []; // [{ start, end }] in milliseconds

// Ask the sheet which times are booked. Resolves to the ranges, or null if
// it isn't set up or can't be reached (then nothing is greyed out).
async function fetchBooked() {
  if (!CONFIG.bookingsUrl) return null;
  try {
    const res = await fetch(CONFIG.bookingsUrl, { cache: "no-store" });
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.booked)) return null;
    return data.booked
      .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
      .filter((r) => r.start < r.end);
  } catch {
    return null;
  }
}

async function loadBooked() {
  const ranges = await fetchBooked();
  if (!ranges) return;
  bookedRanges = ranges;
  rebuildSlots();
  updateSummary();
}

// Would a session starting at `start` overlap anything already booked?
function isTaken(start, durationMin = state.duration * 60) {
  const s = start.getTime();
  const e = s + durationMin * 60000;
  return bookedRanges.some((r) => s < r.end && e > r.start);
}

// Re-check right before checkout in case someone else just booked it.
async function slotStillFree() {
  if (state.service !== "live" || !state.slot) return true;
  const ranges = await fetchBooked();
  if (!ranges) return true; // can't check right now: let them continue
  bookedRanges = ranges;
  return !isTaken(state.slot);
}

/* ---------- Booking widget ---------- */

const state = {
  service: "live",
  duration: 1,
  dateKey: null,
  slot: null, // Date
  private: false,
  test: false, // true only while a $1 test purchase is being set up
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
  // keep current selection only if it still exists and is still free
  if (state.slot && (isTaken(state.slot) ||
      !(slotsByDay.get(state.dateKey) || []).some((s) => s.getTime() === state.slot.getTime()))) {
    state.slot = null;
  }
  const hasOpen = (key) => (slotsByDay.get(key) || []).some((s) => !isTaken(s));
  if (state.dateKey && !hasOpen(state.dateKey)) state.dateKey = null;
  if (!state.dateKey) state.dateKey = [...slotsByDay.keys()].find(hasOpen) || null;
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
    const daySlots = slotsByDay.get(key) || [];
    const hasSlots = daySlots.some((s) => !isTaken(s));
    const fullyBooked = daySlots.length > 0 && !hasSlots;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-btn";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", String(key === state.dateKey));
    btn.disabled = !hasSlots;
    btn.dataset.key = key;
    btn.innerHTML = `<span class="dow">${fmtDow.format(day)}</span><span class="day">${day.getDate()}</span><span class="mon">${fmtMon.format(day)}</span>`;
    btn.setAttribute("aria-label", `${day.toDateString()}${hasSlots ? "" : fullyBooked ? " (fully booked)" : " (unavailable)"}`);
    if (fullyBooked) btn.title = "Fully booked";
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
    if (isTaken(s)) {
      btn.disabled = true;
      btn.classList.add("taken");
      btn.title = "Already booked";
      btn.setAttribute("aria-label", `${fmtTime.format(s)}, booked`);
      grid.appendChild(btn);
      continue;
    }
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
  $("#live-notes-wrap").hidden = service !== "live";
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
    const ign = $("#ign");
    if (!ign.value.trim()) return showError("Please enter your in-game name from that match.", ign), false;
  }
  const email = $("#email"), discord = $("#discord"); // name is optional
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) return showError("Please enter a valid email.", email), false;
  if (!discord.value.trim()) return showError("Please enter your Discord username.", discord), false;
  // Discord usernames are 2–32 letters, numbers, _ or . (e.g. tesla0945), or an
  // older-style name#1234. Anything else is usually a display name by mistake.
  discord.value = discord.value.trim().replace(/^@/, "");
  const d = discord.value;
  if (!/^[a-z0-9_.]{2,32}$/i.test(d) && !/^.{2,32}#\d{4}$/.test(d)) {
    return showError("That doesn't look like a full Discord username. Use your username (like tesla0945), not your display name, and include the #1234 if yours has one.", discord), false;
  }
  return true;
}

/* ---------- Stripe checkout ---------- */

// Which Payment Link matches the current selection, e.g. "live-90-private"
function paymentKey() {
  if (state.test) return "test";
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

// Backup payment link for the current selection (never used for test bookings)
function paymentUrl() {
  const link = state.test ? "" : CONFIG.paymentLinks[paymentKey()];
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

/* ---------- Booking record ---------- */

// Everything about one order. It's saved in the customer's browser right
// before they go to Stripe, and sent to the bookings sheet to confirm once
// they come back after paying. The booking ID is their confirmation number.
function buildBooking() {
  const live = state.service === "live";
  return {
    id: state.bookingId,
    kind: live ? "live" : "vod",
    test: state.test,
    service: live ? "Live Coaching" : "VOD Review",
    length: live ? durationLabel(state.duration) : "",
    start: live ? state.slot.toISOString() : "",
    minutes: live ? Math.round(state.duration * 60) : 0,
    replayCode: live ? "" : $("#replay-code").value.trim(),
    ign: live ? "" : $("#ign").value.trim(),
    notes: (live ? $("#live-notes") : $("#vod-notes")).value.trim(),
    private: state.private,
    total: total(),
    name: $("#name").value.trim(),
    email: $("#email").value.trim(),
    discord: $("#discord").value.trim(),
    rank: $("#rank").value,
    timeZone: userTimeZone,
    reference: stripeReference(),
    createdAt: new Date().toISOString(),
    paid: false,
  };
}

function fmtWhen(iso, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}

// The order as label/value rows for the review popup
// (the emails are written by the bookings sheet script)
function orderRows(b) {
  const rows = [];
  if (b.test) rows.push(["Test booking", "Stripe test mode, no real charge"]);
  rows.push(["Service", b.service]);
  if (b.length) rows.push(["Length", b.length]);
  if (b.start) rows.push(["When", fmtWhen(b.start, b.timeZone)]);
  if (b.replayCode) rows.push(["Replay code", b.replayCode]);
  if (b.ign) rows.push(["In-game name", b.ign]);
  if (b.notes) rows.push(["Notes", b.notes]);
  if (!b.start) rows.push(["Delivery", "Video on Discord, within 48 hours"]);
  rows.push(["Private session", b.private ? `Yes (+${money(CONFIG.prices.privateAddon)})` : "No"]);
  if (b.name) rows.push(["Name", b.name]);
  rows.push(["Discord", b.discord], ["Email", b.email]);
  rows.push(["Total", money(b.total)]);
  return rows;
}

/* ---------- Confirming a paid booking ---------- */

// Ask the bookings sheet to confirm this booking. The sheet checks with Stripe
// that it was really paid, then records it, blocks the time and sends both
// emails. Resolves to one of:
//   "confirmed"  - paid and done (data.email is where the confirmation went)
//   "not_paid"   - Stripe has no paid checkout for this booking
//   "processing" - paid by a method that hasn't cleared yet (e.g. bank)
//   "invalid"    - the booking details don't make sense (won't ever work)
//   "error"      - couldn't reach the sheet or Stripe; try again later
async function confirmBooking(b, sessionId) {
  return askSheet({
    action: "confirm",
    sessionId: sessionId || undefined, // embedded checkout: the sheet looks it up directly
    booking: b ? bookingPayload(b) : undefined, // payment-link backup: matched by reference
  });
}

// The booking fields the bookings sheet needs
function bookingPayload(b) {
  return {
    id: b.id,
    kind: b.kind || (b.start ? "live" : "vod"),
    test: b.test,
    private: b.private,
    minutes: b.minutes,
    start: b.start,
    name: b.name,
    email: b.email,
    discord: b.discord,
    rank: b.rank,
    replayCode: b.replayCode,
    ign: b.ign,
    notes: b.notes,
    timeZone: b.timeZone,
  };
}

// POST to the bookings sheet. Always resolves to an object with a status
// (or ok: true); network problems come back as { status: "error" }.
async function askSheet(body) {
  if (!CONFIG.bookingsUrl) return { status: "error" };
  try {
    // sent as plain text so the browser doesn't need a pre-check Google can't answer
    const res = await fetch(CONFIG.bookingsUrl, { method: "POST", body: JSON.stringify(body) });
    const data = await res.json();
    return data && (data.ok || data.status) ? data : { status: "error" };
  } catch {
    return { status: "error" };
  }
}

// The booking waiting for payment, kept in this browser
const PENDING_KEY = "pendingBooking";
function loadPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); } catch { return null; }
}
function savePending(b) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(b)); } catch { /* storage unavailable */ }
}
function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable */ }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PENDING_MAX_DAYS = 7; // stop retrying a booking after this long

// Confirm the paid booking saved in this browser, if there is one. Runs when
// Stripe sends the customer back, and again on later visits if it couldn't
// be confirmed yet (sheet unreachable, or a bank payment still clearing).
let confirming = null;
function confirmPaidBooking(quickRetries = 0, sessionId = "") {
  if (confirming) return confirming;
  confirming = (async () => {
    let b = loadPending();
    if (b && !b.paid && !sessionId) b = null; // never got as far as paying
    if (b && b.createdAt && Date.now() - Date.parse(b.createdAt) > PENDING_MAX_DAYS * 86400000) {
      clearPending();
      b = null;
    }
    const sid = sessionId || (b && b.sessionId) || "";
    if (!b && !sid) return null;
    let result = { status: "error" };
    for (let attempt = 0; attempt <= quickRetries; attempt++) {
      if (attempt) await sleep(3000);
      result = await confirmBooking(b, sid);
      if (result.status !== "not_paid" && result.status !== "error") break;
    }
    if (result.status === "confirmed" || result.status === "invalid") clearPending();
    if (result.status === "confirmed") loadBooked(); // grey the time out here too
    return { ...result, booking: b };
  })().finally(() => { confirming = null; });
  return confirming;
}

/* ---------- Order review popup ---------- */

let currentBooking = null; // the order shown in the review popup

function openModal() {
  state.bookingId = newBookingId();
  const booking = buildBooking();
  currentBooking = booking;
  const pay = paymentUrl(); // backup payment link
  const embedded = embeddedReady(booking.test);

  const list = $("#order-list");
  list.innerHTML = "";
  for (const [k, v] of orderRows(booking)) {
    const row = document.createElement("div");
    if (k === "Total") row.className = "order-total";
    if (k === "Test booking") row.className = "order-test";
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = v;
    row.append(dt, dd);
    list.appendChild(row);
  }

  showPayStep(false);
  $("#pay-error").textContent = "";
  $("#modal-pay").parentElement.hidden = !(embedded || pay);
  if (embedded || pay) {
    $("#modal-intro").textContent = "Check everything looks right, then continue to payment.";
    $("#modal-pay").href = pay || "#";
    $("#modal-pay").textContent = `Continue to payment (${money(booking.total)})`;
    $("#modal-note").textContent = embedded
      ? "You'll pay securely with Stripe right here, then get your confirmation number. Your booking details are emailed to you once payment goes through."
      : "After paying you'll come back here and get your confirmation number. Your booking details are emailed to you once payment goes through.";
    $("#modal-note").hidden = false;
    savePending(booking); // confirmed (and emailed) only after payment goes through
  } else {
    $("#modal-intro").innerHTML = `Online payment isn't available for this option yet. Please email <a href="mailto:${CONFIG.contactEmail}">${CONFIG.contactEmail}</a> to book it.`;
    $("#modal-note").hidden = true;
  }

  $("#modal").hidden = false;
  focusPopup("#modal");
}

// Move keyboard focus into a popup without outlining anything: the popup card
// itself takes focus (it has tabindex="-1"), so Tab goes to its first button
// and screen readers announce its heading.
function focusPopup(modalSel) {
  const card = $(`${modalSel} .modal-card`);
  if (card) card.focus({ preventScroll: true });
}

/* ---------- Stripe's payment form inside the popup (embedded checkout) ---------- */

const stripeKeyFor = (test) => (test ? CONFIG.stripeTestPublishableKey : CONFIG.stripePublishableKey);
const embeddedReady = (test) => !!(stripeKeyFor(test) && CONFIG.bookingsUrl);

// Load Stripe.js from Stripe (it must come from js.stripe.com)
function loadStripeJs() {
  if (document.getElementById("stripe-js")) return;
  const s = document.createElement("script");
  s.id = "stripe-js";
  s.src = "https://js.stripe.com/endive/stripe.js";
  s.async = true;
  document.head.appendChild(s);
}
async function waitForStripe(ms = 10000) {
  loadStripeJs();
  const until = Date.now() + ms;
  while (typeof window.Stripe !== "function") {
    if (Date.now() > until) return false;
    await sleep(100);
  }
  return true;
}

const stripeClients = {};
let embeddedCheckout = null;
let payAttempt = 0; // bumped whenever the popup closes or goes back, to cancel slow loads

function destroyEmbedded() {
  if (embeddedCheckout) {
    try { embeddedCheckout.destroy(); } catch { /* already gone */ }
    embeddedCheckout = null;
  }
  $("#embedded-checkout").innerHTML = "";
}

function showPayStep(on) {
  $("#review-step").hidden = on;
  $("#pay-step").hidden = !on;
  $("#modal .modal-card").classList.toggle("paying", on);
  $("#checkout-loading").hidden = !on;
}

async function startEmbeddedPayment(booking, backupUrl) {
  const attempt = ++payAttempt;
  destroyEmbedded();
  $("#pay-error").textContent = "";
  showPayStep(true);

  const [stripeLoaded, data] = await Promise.all([
    waitForStripe(),
    askSheet({ action: "checkout", booking: bookingPayload(booking) }),
  ]);
  if (attempt !== payAttempt) return; // closed or went back meanwhile

  if (data.status === "taken" || data.status === "too_soon") {
    closeModal();
    await loadBooked();
    rebuildSlots();
    updateSummary();
    showError(data.status === "taken"
      ? "Sorry, someone just booked that time. Please pick another one."
      : `Sessions need to be booked at least ${CONFIG.minNoticeHours} hours ahead. Please pick another time.`);
    $("#time-grid").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const failed = (message) => {
    if (backupUrl) {
      location.href = backupUrl; // fall back to the Stripe payment link
      return;
    }
    showPayStep(false);
    $("#pay-error").textContent = message;
  };
  if (!stripeLoaded || !data.ok || !data.clientSecret) {
    failed(`Checkout couldn't load. Please try again in a moment, or email ${CONFIG.contactEmail}.`);
    return;
  }

  booking.sessionId = data.sessionId;
  savePending(booking);
  try {
    const key = stripeKeyFor(booking.test);
    stripeClients[key] = stripeClients[key] || window.Stripe(key);
    const checkout = await stripeClients[key].createEmbeddedCheckoutPage({
      fetchClientSecret: async () => data.clientSecret,
    });
    if (attempt !== payAttempt) {
      checkout.destroy();
      return;
    }
    embeddedCheckout = checkout;
    $("#checkout-loading").hidden = true;
    checkout.mount("#embedded-checkout");
  } catch (err) {
    console.error(err);
    if (attempt === payAttempt) {
      destroyEmbedded();
      failed(`Checkout couldn't load. Please try again in a moment, or email ${CONFIG.contactEmail}.`);
    }
  }
}

/* ---------- Back from Stripe (?paid=1) ---------- */

// What the "back from Stripe" popup says at each stage
const PAID_MESSAGES = {
  checking: ["Confirming your payment…", "Please stay on this page while I confirm your payment with Stripe. This usually takes a few seconds.", false],
  confirmed: ["Payment received. Thank you!", "You'll receive an email at {email} shortly with your booking information.", true],
  processing: ["Payment processing", "Your payment is still clearing (bank payments can take a few days). I'll email you to confirm your booking once it goes through.", true],
  not_paid: ["We couldn't confirm your payment", `Stripe hasn't confirmed a payment for this booking. If you were charged, email ${CONFIG.contactEmail} with your confirmation number and I'll sort it out.`, false],
  invalid: ["Something went wrong", `I couldn't confirm this booking automatically. Please email ${CONFIG.contactEmail} with your confirmation number.`, false],
  error: ["Payment received. Thank you!", "You'll receive an email shortly with your booking information.", true],
  unknown: ["Payment received. Thank you!", "I'll email you shortly with your booking information.", true],
};

// `id` is the confirmation number (blank if unknown), `email` where it was sent
function showPaidMessage(status, id, email) {
  const [title, note, showHelp] = PAID_MESSAGES[status] || PAID_MESSAGES.error;
  $("#paid-title").textContent = title;
  $("#paid-email-note").textContent = note.replace("{email}", email || "your email");
  $("#paid-help").hidden = !showHelp;
  // while confirming: spinning circle and no "Got it" button yet;
  // once confirmed: a green tick in the same spot
  const checking = status === "checking";
  const confirmed = status === "confirmed";
  $("#paid-spinner").hidden = !checking;
  $("#paid-check").toggleAttribute("hidden", !confirmed); // (SVG has no .hidden property)
  $("#paid-actions").hidden = checking;
  $("#paid-modal .modal-card").classList.toggle("centered", checking || confirmed);
  $("#paid-number-row").hidden = !id;
  $("#paid-number").textContent = id || "";
  $("#paid-modal").hidden = false;
}

async function handlePaymentReturn() {
  const params = new URLSearchParams(location.search);
  if (params.get("paid") !== "1") {
    confirmPaidBooking(); // quietly retry anything left over from an earlier visit
    return;
  }
  // Embedded checkout comes back with ?session_id=cs_...; payment links don't
  const sessionId = params.get("session_id") || "";
  // tidy the address bar so a refresh doesn't show this again
  params.delete("paid");
  params.delete("session_id");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);

  let b = loadPending();
  if (b && sessionId && b.sessionId && b.sessionId !== sessionId) b = null; // a different booking
  if (!b && !sessionId) {
    showPaidMessage("unknown", ""); // paid on another device, or storage blocked
    focusPopup("#paid-modal");
    return;
  }
  if (b && !b.paid) {
    b.paid = true;
    b.paidAt = new Date().toISOString();
    if (sessionId) b.sessionId = sessionId;
    savePending(b);
  }
  showPaidMessage("checking", b ? b.id : "");
  focusPopup("#paid-modal");
  const result = await confirmPaidBooking(2, sessionId);
  showPaidMessage(result ? result.status : "error",
    (result && result.id) || (b && b.id) || "",
    (result && result.email) || (b && b.email) || "");
}
function closePaidMessage() {
  $("#paid-modal").hidden = true;
}
/* ---------- Reschedule (link in the confirmation email) ---------- */

const rs = { id: "", key: "", start: null, end: null, minutes: 60, dateKey: null, slot: null, slotsByDay: new Map() };

// Taken, ignoring the customer's own current session (so they can shift it by 30 min)
function rsTaken(s) {
  const a = s.getTime();
  const b = a + rs.minutes * 60000;
  return bookedRanges.some((r) =>
    !(r.start === rs.start.getTime() && r.end === rs.end.getTime()) && a < r.end && b > r.start);
}
const rsOpen = (s) => !rsTaken(s) && s.getTime() !== rs.start.getTime();

// `success` swaps the heading for "Session rescheduled!" with a green tick
function rsShow(part, message, success = false) {
  $("#rs-loading").hidden = part !== "loading";
  $("#rs-body").hidden = part !== "body";
  $("#rs-message").hidden = part !== "message";
  if (message) $("#rs-message-text").textContent = message;
  $("#rs-title-text").textContent = success ? "Session rescheduled!" : "Reschedule your session";
  $("#rs-check").toggleAttribute("hidden", !success); // (SVG has no .hidden property)
}

function rsBuildSlots() {
  rs.slotsByDay = new Map();
  for (const s of generateSlots(rs.minutes / 60)) {
    const key = localDateKey(s);
    if (!rs.slotsByDay.has(key)) rs.slotsByDay.set(key, []);
    rs.slotsByDay.get(key).push(s);
  }
  if (rs.slot && !rsOpen(rs.slot)) rs.slot = null;
  const hasOpen = (k) => (rs.slotsByDay.get(k) || []).some(rsOpen);
  if (!rs.dateKey || !hasOpen(rs.dateKey)) rs.dateKey = [...rs.slotsByDay.keys()].find(hasOpen) || null;
  rsRender();
}

function rsRender() {
  // dates
  const strip = $("#rs-dates");
  strip.innerHTML = "";
  for (const [key, slots] of rs.slotsByDay) {
    const day = slots[0];
    const open = slots.some(rsOpen);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-btn";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", String(key === rs.dateKey));
    btn.disabled = !open;
    btn.innerHTML = `<span class="dow">${fmtDow.format(day)}</span><span class="day">${day.getDate()}</span><span class="mon">${fmtMon.format(day)}</span>`;
    btn.addEventListener("click", () => { rs.dateKey = key; rs.slot = null; rsRender(); });
    strip.appendChild(btn);
  }
  // times
  const grid = $("#rs-times");
  grid.innerHTML = "";
  const slots = rs.slotsByDay.get(rs.dateKey) || [];
  if (!slots.length) grid.innerHTML = `<p class="muted">No open times right now. Please email ${CONFIG.contactEmail}.</p>`;
  for (const s of slots) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "time-btn";
    btn.textContent = fmtTime.format(s);
    if (!rsOpen(s)) {
      btn.disabled = true;
      btn.classList.add("taken");
      btn.title = s.getTime() === rs.start.getTime() ? "Your current time" : "Already booked";
    } else {
      btn.setAttribute("aria-pressed", String(!!rs.slot && rs.slot.getTime() === s.getTime()));
      btn.addEventListener("click", () => { rs.slot = s; $("#rs-error").textContent = ""; rsRender(); });
    }
    grid.appendChild(btn);
  }
  const go = $("#rs-confirm");
  go.disabled = !rs.slot;
  go.textContent = rs.slot ? `Move my session to ${fmtFull.format(rs.slot)}` : "Pick a new time";
}

async function handleRescheduleLink() {
  const params = new URLSearchParams(location.search);
  const id = params.get("reschedule");
  const key = params.get("key");
  if (!id || !key) return;
  // tidy the address bar (the link stays in their email)
  params.delete("reschedule");
  params.delete("key");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);

  Object.assign(rs, { id, key, slot: null, dateKey: null });
  rsShow("loading");
  $("#reschedule-modal").hidden = false;
  focusPopup("#reschedule-modal");

  const [data] = await Promise.all([askSheet({ action: "lookup", id, key }), loadBooked()]);
  if (!data.ok) {
    const why = {
      invalid: `This reschedule link isn't valid. Please email ${CONFIG.contactEmail} with your confirmation number.`,
      cancelled: `This session has been cancelled. Please email ${CONFIG.contactEmail} if that's a mistake.`,
      not_live: "Only live sessions can be rescheduled.",
    }[data.status] || `Couldn't load your booking right now. Please try the link again in a moment, or email ${CONFIG.contactEmail}.`;
    rsShow("message", why);
    return;
  }
  rs.start = new Date(data.start);
  rs.end = new Date(data.end);
  rs.minutes = data.minutes;
  if (!data.canReschedule) {
    rsShow("message", `Your session (${fmtFull.format(rs.start)}) is less than ${data.cutoffHours} hours away, so it can't be moved online. Please email ${CONFIG.contactEmail} and I'll see what I can do.`);
    return;
  }
  $("#rs-current").innerHTML = "";
  $("#rs-current").append(
    `Confirmation ${data.id}: ${durationLabel(rs.minutes / 60)} live session, currently `,
    Object.assign(document.createElement("strong"), { textContent: fmtFull.format(rs.start) }),
    ". Pick a new time below.");
  $("#rs-tz").textContent = `(your time: ${userTimeZone})`;
  rsBuildSlots();
  rsShow("body");
}

async function confirmReschedule() {
  if (!rs.slot) return;
  const go = $("#rs-confirm");
  go.disabled = true;
  go.textContent = "Moving your session…";
  const data = await askSheet({ action: "reschedule", id: rs.id, key: rs.key, start: rs.slot.toISOString(), timeZone: userTimeZone });
  if (data.ok) {
    const when = fmtFull.format(new Date(data.start));
    rsShow("message", `Your session is now ${when}.${data.emailed === false ? "" : " I've emailed you the new time."}`, true);
    loadBooked(); // update the booking form's greyed-out times too
    return;
  }
  if (data.status === "taken") {
    await loadBooked();
    rsBuildSlots();
    $("#rs-error").textContent = "Sorry, someone just booked that time. Please pick another one.";
    return;
  }
  if (data.status === "too_late") {
    rsShow("message", `Your session is now less than 24 hours away, so it can't be moved online. Please email ${CONFIG.contactEmail}.`);
    return;
  }
  if (data.status === "too_soon") {
    rsBuildSlots();
    $("#rs-error").textContent = `The new time needs to be at least ${CONFIG.minNoticeHours} hours away. Please pick another one.`;
    return;
  }
  rsRender();
  $("#rs-error").textContent = data.status === "invalid"
    ? "That time can't be booked. Please pick another one."
    : `Couldn't move your session right now. Please try again, or email ${CONFIG.contactEmail}.`;
}

function closeReschedule() {
  $("#reschedule-modal").hidden = true;
}

function closeModal() {
  payAttempt++; // cancel a checkout that's still loading
  destroyEmbedded();
  showPayStep(false);
  $("#modal").hidden = true;
  $("#submit-btn").focus();
}

/* ---------- Pause the orbs when nobody can see them ---------- */

// The orbs use heavy animated SVG filters (smoke, goo, glows). Under a popup,
// the popup's blurred background would have to re-blur them every frame,
// which can slow down the whole computer. So they pause while a popup is
// open, while the top of the page is scrolled out of view, and while the
// tab is in the background.
let orbsPaused = false;
const orbPauseReasons = new Set();
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setOrbPause(reason, on) {
  if (on) orbPauseReasons.add(reason);
  else orbPauseReasons.delete(reason);
  const paused = orbPauseReasons.size > 0;
  if (paused === orbsPaused) return;
  orbsPaused = paused;
  document.documentElement.classList.toggle("orbs-paused", paused); // pauses the CSS float/spin
  if (!prefersReducedMotion) {                                       // (those stay frozen anyway)
    $$(".hero-art svg").forEach((svg) => {
      if (paused) svg.pauseAnimations && svg.pauseAnimations();
      else svg.unpauseAnimations && svg.unpauseAnimations();
    });
  }
}

function initOrbPausing() {
  // any popup open?
  const modals = $$(".modal");
  const checkPopups = () => setOrbPause("popup", modals.some((m) => !m.hidden));
  const watcher = new MutationObserver(checkPopups);
  modals.forEach((m) => watcher.observe(m, { attributes: true, attributeFilter: ["hidden"] }));
  checkPopups();
  // top of the page scrolled away? (the orbs can poke out a little, so allow some margin)
  const art = $(".hero-art");
  if (art) {
    const checkScroll = () => {
      const r = art.getBoundingClientRect();
      const margin = r.height * 0.5;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      setOrbPause("offscreen", r.bottom < -margin || (vh > 0 && r.top > vh + margin));
    };
    window.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    checkScroll();
  }
  // tab in the background?
  document.addEventListener("visibilitychange", () => setOrbPause("background", document.hidden));
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
    // paused (popup open, scrolled away): drop any tendril and stop drawing
    if (orbsPaused) {
      for (const o of orbs) {
        o.latched = false;
        o.alpha = 0;
        o.group.setAttribute("opacity", "0");
      }
      running = false;
      return;
    }
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

  // Check the form, make sure the time wasn't just taken, then show the order.
  async function startCheckout(test) {
    if (!validate()) return;
    // the page may have been open a while: is the chosen time still far enough ahead?
    if (state.service === "live" && state.slot &&
        state.slot.getTime() < Date.now() + CONFIG.minNoticeHours * 3600000) {
      rebuildSlots();
      updateSummary();
      showError(`Sessions need to be booked at least ${CONFIG.minNoticeHours} hours ahead. Please pick another time.`);
      $("#time-grid").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const buttons = [$("#submit-btn"), $("#test-btn")];
    buttons.forEach((b) => (b.disabled = true));
    const free = await slotStillFree();
    buttons.forEach((b) => (b.disabled = false));
    if (!free) {
      rebuildSlots();
      updateSummary();
      showError("Sorry, someone just booked that time. Please pick another one.");
      $("#time-grid").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    state.test = test;
    try {
      openModal();
    } finally {
      state.test = false; // back to normal prices for everything else
    }
  }

  $("#booking-form").addEventListener("submit", (e) => {
    e.preventDefault();
    startCheckout(false);
  });

  // Test booking: the whole flow in Stripe's TEST mode (no real charge).
  // Only shown when the page is opened with ?test=1 and a test key is set.
  const testBtn = $("#test-btn");
  const testMode = new URLSearchParams(location.search).get("test") === "1" && embeddedReady(true);
  if (testMode) {
    testBtn.hidden = false;
    testBtn.textContent = "Test booking (no real charge)";
  }
  testBtn.addEventListener("click", () => startCheckout(true));

  // Start loading Stripe early so the payment form opens quickly
  if (embeddedReady(false) || testMode) loadStripeJs();

  // modal
  $("#modal-close").addEventListener("click", closeModal);
  // clicking the dark background closes the review, but not the payment form
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal" && $("#pay-step").hidden) closeModal();
  });
  $("#modal-pay").addEventListener("click", (e) => {
    const b = currentBooking;
    if (!b || !embeddedReady(b.test)) return; // no embedded form: follow the payment link
    e.preventDefault();
    const backup = $("#modal-pay").getAttribute("href");
    startEmbeddedPayment(b, backup && backup !== "#" ? backup : "");
  });
  $("#pay-back").addEventListener("click", () => {
    payAttempt++;
    destroyEmbedded();
    showPayStep(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#modal").hidden) closeModal();
    if (!$("#paid-modal").hidden) closePaidMessage();
    if (!$("#reschedule-modal").hidden) closeReschedule();
  });
  // reschedule popup
  $("#rs-confirm").addEventListener("click", confirmReschedule);
  $("#rs-x").addEventListener("click", closeReschedule);
  $("#rs-done").addEventListener("click", closeReschedule);
  $("#reschedule-modal").addEventListener("click", (e) => { if (e.target.id === "reschedule-modal") closeReschedule(); });
  handleRescheduleLink();
  $("#paid-close").addEventListener("click", closePaidMessage);
  $("#paid-x").addEventListener("click", closePaidMessage);
  $("#paid-modal").addEventListener("click", (e) => { if (e.target.id === "paid-modal") closePaidMessage(); });
  handlePaymentReturn();

  // Freeze the SVG orb animations for visitors who prefer reduced motion
  if (prefersReducedMotion) {
    $$(".borb svg").forEach((svg) => svg.pauseAnimations && svg.pauseAnimations());
  }
  initOrbPausing();

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
  loadBooked(); // grey out booked times once the sheet answers
});
