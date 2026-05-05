// Vercel serverless function: creates the GHL contact and appointment so the
// booking shows up under the calendar's appointment list. Requires GHL_TOKEN
// (Private Integration token with contacts.write + calendars/events.write
// scopes) set in the Vercel project's environment variables.

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const LOCATION_ID  = "ctTbUc9SRPDOjYpRK3CU";
const CALENDAR_ID  = "8lVOsnGOaESPJr5sYSQH";
const ASSIGNED_USER_ID = "I4T6Q498xbtTptEBZkP8";
const SERVICE_NAME = "Korean Facial Treatment";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.GHL_TOKEN;
  if (!token) {
    console.error("GHL_TOKEN env var is not set");
    res.status(500).json({ error: "Server not configured" });
    return;
  }

  const body = typeof req.body === "string" ? safeJson(req.body) : (req.body || {});
  const {
    firstName, lastName, name, email, phone,
    startTime, endTime, selectedTimezone,
  } = body;

  if (!email || !phone || !startTime || !endTime || !selectedTimezone) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const authHeaders = {
    "Authorization": `Bearer ${token}`,
    "Content-Type":  "application/json",
    "Accept":        "application/json",
  };

  // 1) Upsert the contact so we get a contactId to attach the appointment to.
  let contactId;
  try {
    const r = await fetch(`${GHL_API_BASE}/contacts/upsert`, {
      method: "POST",
      headers: { ...authHeaders, "Version": "2021-07-28" },
      body: JSON.stringify({
        locationId: LOCATION_ID,
        firstName:  firstName || name || "",
        lastName:   lastName  || "",
        name:       name || `${firstName || ""} ${lastName || ""}`.trim(),
        email,
        phone,
      }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      console.error("contact upsert failed", r.status, data);
      res.status(502).json({ error: "Could not create contact", detail: data });
      return;
    }
    contactId = data?.contact?.id || data?.id;
    if (!contactId) {
      console.error("upsert returned no contact id", data);
      res.status(502).json({ error: "Upsert returned no contact id" });
      return;
    }
  } catch (err) {
    console.error("contact upsert threw", err);
    res.status(502).json({ error: "Contact upsert failed", detail: String(err) });
    return;
  }

  // 2) Create the appointment on the calendar.
  const apptPayload = {
    calendarId:               CALENDAR_ID,
    locationId:               LOCATION_ID,
    contactId,
    assignedUserId:           ASSIGNED_USER_ID,
    startTime,
    endTime,
    selectedTimezone,
    title:                    name ? `${SERVICE_NAME} — ${name}` : SERVICE_NAME,
    appointmentStatus:        "confirmed",
    ignoreDateRange:          true,
    ignoreFreeSlotValidation: true,
    toNotify:                 true,
  };
  try {
    const r = await fetch(`${GHL_API_BASE}/calendars/events/appointments`, {
      method: "POST",
      headers: { ...authHeaders, "Version": "2021-04-15" },
      body: JSON.stringify(apptPayload),
    });
    const raw = await r.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
    console.log("appointment create response", {
      status: r.status,
      payload: apptPayload,
      body: data || raw,
    });
    if (!r.ok) {
      res.status(502).json({
        error: "Could not create appointment",
        status: r.status,
        sent: apptPayload,
        detail: data || raw,
      });
      return;
    }
    res.status(200).json({
      ok: true,
      contactId,
      appointmentId: data?.id || data?.appointment?.id || null,
      ghlResponse: data,
    });
  } catch (err) {
    console.error("appointment create threw", err);
    res.status(502).json({ error: "Appointment create failed", detail: String(err) });
  }
};

function safeJson(s) { try { return JSON.parse(s); } catch (_) { return {}; } }
