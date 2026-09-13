/**
 * Finish time ki jaanch — ek hi jagah, dono submission raaste ke liye.
 *
 * Pehle timing kahin bhi zaroori nahi thi: form par "optional" likha tha
 * aur server bhi kabhi nahi maangta tha. Isliye kuch log bina time ke
 * submit kar dete the aur leaderboard par kabhi aate hi nahi the.
 *
 * Manzoor: "MM:SS" ya "H:MM:SS" (ya "HH:MM:SS")
 * Lautata hai: { ok: true, value: "H:MM:SS" }  ya  { ok: false, reason }
 */

const two = (n) => String(n).padStart(2, "0");

const normaliseTiming = (raw) => {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: false, reason: "Please enter your finish time — it is required." };
  }

  const parts = value.split(":").map((p) => p.trim());

  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,2}$/.test(p))) {
    return { ok: false, reason: "Finish time must look like MM:SS or HH:MM:SS (numbers only)." };
  }

  const [h, m, s] = parts.length === 3
    ? parts.map(Number)
    : [0, Number(parts[0]), Number(parts[1])];

  if (m > 59 || s > 59) {
    return { ok: false, reason: "Minutes and seconds must be between 00 and 59." };
  }
  if (h > 99) {
    return { ok: false, reason: "That finish time looks too large. Please check it." };
  }
  if (h === 0 && m === 0 && s === 0) {
    return { ok: false, reason: "Finish time cannot be 00:00. Please enter your actual time." };
  }

  return { ok: true, value: `${h}:${two(m)}:${two(s)}` };
};

module.exports = { normaliseTiming };
