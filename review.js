/* Review page: review.html?id=TC-XXXXXX&key=... (the "Leave a review" button
   in the follow-up email). The sheet script checks the link, then saves the
   review in the Reviews tab of the bookings sheet and emails Tesla. */

// Keep this the same as bookingsUrl in script.js
const BOOKINGS_URL = "https://script.google.com/macros/s/AKfycbxC6CsTotgpFHxQbm1X8MThDjTHx-r0hIle6prtniFphtHl_HwsEMqnfiA0Kyof1-SB/exec";

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const id = params.get("id") || "";
const key = params.get("key") || "";
const WORDS = ["Tap a star", "Not great", "Okay", "Good", "Great", "Amazing!"];

document.getElementById("year").textContent = new Date().getFullYear();

async function askSheet(body) {
  try {
    // sent as plain text so the browser doesn't need a pre-check Google can't answer
    const res = await fetch(BOOKINGS_URL, { method: "POST", body: JSON.stringify(body) });
    const data = await res.json();
    return data && (data.ok || data.status) ? data : { status: "error" };
  } catch {
    return { status: "error" };
  }
}

function show(which) {
  ["#review-loading", "#review-invalid", "#review-form", "#review-done"].forEach((s) => { $(s).hidden = s !== which; });
}

// Stars: light up everything up to the hovered / chosen one
const starInputs = [...document.querySelectorAll("#stars input")];
const chosen = () => Number((starInputs.find((i) => i.checked) || {}).value || 0);
function paintStars(n) {
  starInputs.forEach((input) => input.nextElementSibling.classList.toggle("on", Number(input.value) <= n));
  $("#stars-word").textContent = WORDS[n];
}
starInputs.forEach((input) => {
  input.addEventListener("change", () => { paintStars(chosen()); $("#stars").classList.remove("invalid-stars"); });
  input.nextElementSibling.addEventListener("mouseenter", () => paintStars(Number(input.value)));
});
$("#stars").addEventListener("mouseleave", () => paintStars(chosen()));

async function load() {
  if (!/^TC-[A-Z0-9]{6}$/.test(id) || !/^[a-f0-9]{32}$/.test(key)) return show("#review-invalid");
  const r = await askSheet({ action: "review_lookup", id, key });
  if (r.status === "error") {
    $("#review-invalid h1").textContent = "Couldn't load your booking";
    $("#review-invalid p").textContent = "Something went wrong on my end. Please try again in a minute, or just reply to your follow-up email with your review.";
    return show("#review-invalid");
  }
  if (!r.ok) return show("#review-invalid");

  $("#review-for").textContent = `Your ${r.service} · ${id}`;
  $("#review-name").value = r.showAs || "";
  const p = r.previous;
  if (p) {
    $("#review-again").hidden = false;
    const star = starInputs.find((i) => Number(i.value) === p.stars);
    if (star) star.checked = true;
    $("#review-text").value = p.text || "";
    $("#review-name").value = p.showAs || r.showAs || "";
    $("#review-rank").value = p.rank || "";
    $("#review-feature").checked = !!p.feature;
  }
  paintStars(chosen());
  show("#review-form");
}

$("#review-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#review-error");
  err.textContent = "";
  const stars = chosen();
  const text = $("#review-text").value.trim();
  $("#review-text").classList.toggle("invalid", text.length < 3);
  $("#stars").classList.toggle("invalid-stars", !stars);
  if (!stars || text.length < 3) {
    err.textContent = !stars ? "Please pick a star rating." : "Please write a few words about how it went.";
    (!stars ? starInputs[4] : $("#review-text")).focus();
    return;
  }
  const btn = $("#review-send");
  btn.disabled = true;
  btn.textContent = "Sending…";
  const feature = $("#review-feature").checked;
  const showAs = $("#review-name").value.trim();
  const r = await askSheet({
    action: "review", id, key, stars, text, showAs,
    rank: $("#review-rank").value.trim(),
    feature,
  });
  btn.disabled = false;
  btn.textContent = "Send review";
  if (!r.ok) {
    err.textContent = r.status === "invalid"
      ? "This review link doesn't work any more. Please reply to your follow-up email with your review instead."
      : "Couldn't send your review just now. Please try again in a minute.";
    return;
  }
  $("#review-done-note").textContent = feature
    ? `It really helps, and I read every one. If I feature it, it'll appear on the website as ${showAs || "a customer"}.`
    : "It really helps, and I read every one.";
  show("#review-done");
  window.scrollTo(0, 0);
});

load();
