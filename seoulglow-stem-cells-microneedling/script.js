(function () {
  "use strict";

  // ------- Configuration -------
  const SERVICE_NAME = "Korean Facial Treatment";
  const SERVICE_DURATION_MIN = 60;
  // Salon is at 22554 Ventura Blvd, Woodland Hills CA. Slots displayed and
  // sent to GHL are this wall-clock time, regardless of customer location.
  const BUSINESS_TZ = "America/Los_Angeles";

  // Same-origin Vercel function — see api/book.js. It calls the GHL API
  // server-side with a Private Integration token so the appointment lands
  // on the calendar's appointment list.
  const BOOK_URL = "/api/book";

  const MORNING_SLOTS = [
    { label: "10:00 AM", hour: 10, minute: 0 },
    { label: "11:15 AM", hour: 11, minute: 15 },
  ];
  const AFTERNOON_SLOTS = [
    { label: "12:30 PM", hour: 12, minute: 30 },
    { label: "2:15 PM",  hour: 14, minute: 15 },
    { label: "3:30 PM",  hour: 15, minute: 30 },
    { label: "4:45 PM",  hour: 16, minute: 45 },
  ];

  const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const STEPS = ["date", "time", "details", "confirmed"];

  // ------- State -------
  const today = startOfDay(new Date());
  let selectedDate = null;
  let selectedTime = null;

  // ------- Elements -------
  const $ = (id) => document.getElementById(id);
  const dateGrid = $("date-grid");
  const morningGrid = $("morning-grid");
  const afternoonGrid = $("afternoon-grid");

  const timeSummary    = $("time-summary");
  const detailsSummary = $("details-summary");
  const detailsForm    = $("details-form");
  const submitBtn      = $("submit-btn");
  const btnLabel       = submitBtn.querySelector(".btn-label");
  const spinner        = submitBtn.querySelector(".spinner");
  const errorText      = $("error-text");
  const resetBtn       = $("reset-btn");
  const gcalLink       = $("gcal-link");
  const confirmCard    = $("confirm-card");

  // ------- Helpers -------
  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function pad(n) { return String(n).padStart(2, "0"); }

  // Minutes that `tz` is ahead of UTC at the given moment. Handles DST.
  function offsetMinutesForTz(date, tz) {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    });
    const parts = dtf.formatToParts(date);
    const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
    const asUtc = Date.UTC(
      get("year"), get("month") - 1, get("day"),
      get("hour"), get("minute"), get("second"),
    );
    return Math.round((asUtc - date.getTime()) / 60000);
  }

  // Convert a wall-clock time in `tz` to the Date (absolute UTC moment).
  function dateFromWallTime(year, month, day, hour, minute, tz) {
    const approx = new Date(Date.UTC(year, month, day, hour, minute));
    const off = offsetMinutesForTz(approx, tz);
    return new Date(approx.getTime() - off * 60000);
  }

  // ISO 8601 with the offset of `tz`, e.g. 2026-04-30T09:00:00-07:00.
  // GHL expects the slot in this format, not UTC "Z".
  function isoInTz(date, tz) {
    const off = offsetMinutesForTz(date, tz);
    const wall = new Date(date.getTime() + off * 60000);
    const sign = off >= 0 ? "+" : "-";
    const abs = Math.abs(off);
    return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}` +
           `T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}` +
           `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  }
  function sameDay(a, b) {
    return a && b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }
  function formatLongDate(d) {
    return d.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  }

  // ------- Step navigation -------
  function showStep(step) {
    STEPS.forEach((s) => {
      const el = $("step-" + s);
      if (el) el.classList.toggle("hidden", s !== step);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ------- Calendar render -------
  function renderMonth() {
    dateGrid.innerHTML = "";

    const cells = [];
    const cursor = new Date(today);
    for (let i = 0; i < 6; i++) {
      cells.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    cells.forEach((d) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "date-cell";
      if (sameDay(d, selectedDate)) btn.classList.add("selected");

      const dow = document.createElement("span");
      dow.className = "dow";
      dow.textContent = DOW_SHORT[d.getDay()];

      const day = document.createElement("span");
      day.className = "day";
      day.textContent = String(d.getDate());

      btn.appendChild(dow);
      btn.appendChild(day);

      btn.addEventListener("click", () => selectDate(d));
      dateGrid.appendChild(btn);
    });
  }

  function renderTimes() {
    function build(grid, slots) {
      grid.innerHTML = "";
      slots.forEach((s) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "time-cell";
        if (selectedTime && selectedTime.label === s.label) b.classList.add("selected");
        b.textContent = s.label;
        b.addEventListener("click", () => selectTime(s));
        grid.appendChild(b);
      });
    }
    build(morningGrid, MORNING_SLOTS);
    build(afternoonGrid, AFTERNOON_SLOTS);
  }

  // ------- Selection handlers -------
  function selectDate(d) {
    selectedDate = startOfDay(d);
    selectedTime = null;
    renderMonth();
    renderTimes();
    timeSummary.textContent = formatLongDate(selectedDate);
    showStep("time");
    track("AddToCart", { content_name: SERVICE_NAME });
  }

  function selectTime(slot) {
    selectedTime = slot;
    renderTimes();
    detailsSummary.textContent =
      `${formatLongDate(selectedDate)} • ${selectedTime.label}`;
    showStep("details");
    track("InitiateCheckout", { content_name: SERVICE_NAME });
  }

  function track(event, params) {
    if (typeof window.fbq === "function") {
      try { window.fbq("track", event, params || {}); } catch (_) {}
    }
  }

  // ------- Back buttons -------
  document.querySelectorAll(".back-btn").forEach((btn) => {
    btn.addEventListener("click", () => showStep(btn.dataset.back));
  });

  // ------- Form submit -------
  detailsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorText.classList.add("hidden");

    const name  = $("name").value.trim();
    const email = $("email").value.trim();
    const phone = $("phone").value.trim();

    if (!name || !email || !phone || !selectedDate || !selectedTime) {
      errorText.textContent = "Please fill in all fields.";
      errorText.classList.remove("hidden");
      return;
    }

    submitBtn.disabled = true;
    btnLabel.textContent = "Booking";
    spinner.classList.remove("hidden");

    submitBtn.disabled = true;
    btnLabel.textContent = "Booking";
    spinner.classList.remove("hidden");

    const start = dateFromWallTime(
      selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(),
      selectedTime.hour, selectedTime.minute, BUSINESS_TZ,
    );
    const end = new Date(start.getTime() + SERVICE_DURATION_MIN * 60000);
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(" ");

    const payload = {
      firstName: firstName || name,
      lastName,
      name,
      email,
      phone,
      startTime: isoInTz(start, BUSINESS_TZ),
      endTime:   isoInTz(end,   BUSINESS_TZ),
      selectedTimezone: BUSINESS_TZ,
    };

    try {
      const res = await fetch(BOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch (_) {}

      if (!res.ok) {
        console.error("Booking failed", { status: res.status, body: body || raw });
        const detail =
          (body && (body.error || body.message || body.msg)) || "";
        errorText.textContent =
          detail || `Booking failed (${res.status}). Please try again or call us.`;
        errorText.classList.remove("hidden");
        return;
      }

      track("Lead", { content_name: SERVICE_NAME });
      track("Schedule", { content_name: SERVICE_NAME });

      renderConfirmation({
        service: SERVICE_NAME,
        name, email, phone,
        time: selectedTime.label,
      });
      showStep("confirmed");
    } catch (err) {
      console.error("GHL booking network error", err);
      errorText.textContent =
        "Couldn't reach the booking server. Please check your connection and try again.";
      errorText.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      btnLabel.textContent = "Schedule Appointment";
      spinner.classList.add("hidden");
    }
  });

  // ------- Confirmation rendering -------
  function renderConfirmation(p) {
    confirmCard.innerHTML = `
      <div class="row"><span class="label">Service</span><span>${escapeHtml(p.service)}</span></div>
      <div class="row"><span class="label">Date</span><span>${escapeHtml(formatLongDate(selectedDate))}</span></div>
      <div class="row"><span class="label">Time</span><span>${escapeHtml(p.time)}</span></div>
      <div class="row"><span class="label">Name</span><span>${escapeHtml(p.name)}</span></div>
      <div class="row"><span class="label">Email</span><span>${escapeHtml(p.email)}</span></div>
      <div class="row"><span class="label">Phone</span><span>${escapeHtml(p.phone)}</span></div>
    `;
    gcalLink.href = buildGCalUrl(p);
  }

  function buildGCalUrl(p) {
    const start = dateFromWallTime(
      selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(),
      selectedTime.hour, selectedTime.minute, BUSINESS_TZ,
    );
    const end = new Date(start.getTime() + SERVICE_DURATION_MIN * 60000);
    const fmt = (d) =>
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) + "Z";
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: SERVICE_NAME,
      dates: `${fmt(start)}/${fmt(end)}`,
      details: `Booking for ${p.name} (${p.email}, ${p.phone}).`,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ------- Reset -------
  resetBtn.addEventListener("click", () => {
    selectedDate = null;
    selectedTime = null;
    detailsForm.reset();
    renderMonth();
    showStep("date");
  });

  // ------- Init -------
  renderMonth();
  renderTimes();
  showStep("date");
})();
