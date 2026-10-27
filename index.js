const $ = s => document.querySelector(s);
const load = (k, d) => JSON.parse(localStorage.getItem(k)) ?? d;
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const themeToggle = document.querySelector("#themeToggle");
const themeIcon = document.querySelector("#themeIcon");
const timeZone = document.querySelector("#timeZone");
const liveClock = document.querySelector("#liveClock");

function applyTheme(theme) {
  const dark = theme === "dark";
  document.body.classList.toggle("dark-mode", dark);
  themeIcon.textContent = dark ? "☀" : "◐";
  themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
}

function updateClock() {
  const zone = timeZone.value;
  const options = { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
  if (zone !== "local") options.timeZone = zone;
  liveClock.textContent = new Intl.DateTimeFormat("en-GB", options).format(new Date());
}

applyTheme(load("theme", "light"));
timeZone.value = load("timeZone", "local");
updateClock();
setInterval(updateClock, 1000);
themeToggle.onclick = () => {
  const next = document.body.classList.contains("dark-mode") ? "light" : "dark";
  save("theme", next);
  applyTheme(next);
};
timeZone.onchange = () => { save("timeZone", timeZone.value); updateClock(); };

const ZONES = ["North", "South", "East", "West", "Central"];
const TYPES = ["Organic", "Recyclable", "General", "E-Waste"];
const ICON = { Organic: "🌿", Recyclable: "♻️", General: "🗑️", "E-Waste": "🔋" };

let bins = load("bins", null) || Array.from({ length: 12 }, (_, i) => ({
  id: `BIN-${String(i + 1).padStart(2, "0")}`,
  zone: ZONES[i % 5], type: TYPES[i % 4], fill: Math.floor(Math.random() * 100)
}));
let reports = load("reports", []);
let pickups = load("pickups", []);
let qa = load("qa", []);
save("bins", bins);

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

const statusOf = f => (f >= 85 ? "crit" : f >= 60 ? "warn" : "ok");

function stats() {
  const avg = Math.round(bins.reduce((s, b) => s + b.fill, 0) / bins.length);
  $("#statBins").textContent = bins.length;
  $("#statFull").textContent = bins.filter(b => b.fill >= 85).length;
  $("#statAvg").textContent = avg + "%";
  $("#statReports").textContent = reports.filter(r => r.status === "Open").length;
}

/* ---------- Bins ---------- */
function renderBins() {
  const filter = $("#filterType").value;
  const list = bins.filter(b => filter === "All" || b.type === filter);
  $("#binGrid").innerHTML = list.map(b => `
    <div class="bin ${statusOf(b.fill)}">
      <div class="bin-head"><strong>${ICON[b.type]} ${b.id}</strong><span>${b.zone}</span></div>
      <div class="meter"><div style="width:${b.fill}%"></div></div>
      <div class="bin-foot"><span>${b.fill}% · ${b.type}</span>
        <button data-empty="${b.id}">Empty</button></div>
    </div>`).join("") || "<p class='muted'>No bins for this filter.</p>";
  stats();
  drawChart();
}

$("#binGrid").onclick = e => {
  const id = e.target.dataset.empty;
  if (!id) return;
  const bin = bins.find(b => b.id === id);
  bin.fill = 0;
  save("bins", bins);
  renderBins();
  toast(`✅ ${id} emptied`);
};
$("#filterType").onchange = renderBins;

/* Route optimizer: groups bins by zone, most-full first */
$("#routeBtn").onclick = () => {
  const todo = bins.filter(b => b.fill >= 70)
    .sort((a, b) => a.zone.localeCompare(b.zone) || b.fill - a.fill);
  $("#route").innerHTML = todo.length
    ? `<strong>Optimized collection route</strong><ol>${todo.map(b => `<li>${b.id} · ${b.zone} · ${b.fill}%</li>`).join("")}</ol>
       <p class="muted">Estimated distance: ${(todo.length * 2.5).toFixed(1)} km (demo estimate)</p>`
    : "<p>All bins are below 70%. No collection needed right now.</p>";
};

/* Simulated IoT sensors: fill levels rise over time and trigger alerts */
setInterval(() => {
  const b = bins[Math.floor(Math.random() * bins.length)];
  const before = b.fill;
  b.fill = Math.min(100, b.fill + 1 + Math.floor(Math.random() * 7));
  if (before < 85 && b.fill >= 85) toast(`⚠️ ${b.id} (${b.zone}) is almost full. Schedule a pickup.`);
  save("bins", bins);
  renderBins();
}, 6000);

/* ---------- Reports ---------- */
function renderReports() {
  $("#reportList").innerHTML = reports.map(r => `
    <div class="item">
      <div><strong>${esc(r.type)}</strong> · ${esc(r.location)}<p>${esc(r.desc)}</p>
      <small>${r.date} · ${r.status}</small></div>
      <button data-res="${r.id}">${r.status === "Open" ? "Mark resolved" : "Reopen"}</button>
    </div>`).join("") || "<p class='muted'>No reports yet.</p>";
  stats();
}
$("#reportForm").onsubmit = e => {
  e.preventDefault();
  const f = e.target;
  reports.unshift({
    id: Date.now(), location: f.rLocation.value, type: f.rType.value,
    desc: f.rDesc.value, status: "Open", date: new Date().toLocaleString()
  });
  save("reports", reports);
  f.reset();
  renderReports();
  toast("📨 Report submitted. Thank you!");
};
$("#reportList").onclick = e => {
  const id = e.target.dataset.res;
  if (!id) return;
  const r = reports.find(x => String(x.id) === id);
  r.status = r.status === "Open" ? "Resolved" : "Open";
  save("reports", reports);
  renderReports();
};

/* ---------- Pickups ---------- */
function renderPickups() {
  $("#pickupList").innerHTML = pickups.map(p => `
    <div class="item">
      <div><strong>${ICON[p.type]} ${p.type}</strong> · ${p.zone}<p>Scheduled: ${p.date}</p></div>
      <button data-cancel="${p.id}">Cancel</button>
    </div>`).join("") || "<p class='muted'>No pickups scheduled.</p>";
}
$("#pickupForm").onsubmit = e => {
  e.preventDefault();
  const f = e.target;
  pickups.push({ id: Date.now(), zone: f.pzone.value, type: f.pwtype.value, date: f.pdate.value });
  save("pickups", pickups);
  f.reset();
  renderPickups();
  toast("🚚 Pickup booked!");
};
$("#pickupList").onclick = e => {
  const id = e.target.dataset.cancel;
  if (!id) return;
  pickups = pickups.filter(p => String(p.id) !== id);
  save("pickups", pickups);
  renderPickups();
  toast("Pickup cancelled");
};

/* ---------- Analytics chart (canvas, no libraries) ---------- */
function drawChart() {
  const c = $("#chart"), dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr;
  const x = c.getContext("2d");
  x.scale(dpr, dpr);
  x.clearRect(0, 0, w, h);
  const avgs = ZONES.map(z => {
    const l = bins.filter(b => b.zone === z);
    return l.length ? Math.round(l.reduce((s, b) => s + b.fill, 0) / l.length) : 0;
  });
  const slot = w / ZONES.length, bw = slot * 0.55;
  ZONES.forEach((z, i) => {
    const bh = (h - 50) * avgs[i] / 100, x0 = i * slot + (slot - bw) / 2, y0 = h - 26 - bh;
    const g = x.createLinearGradient(0, y0, 0, h - 26);
    g.addColorStop(0, "#34d399"); g.addColorStop(1, "#0ea5e9");
    x.fillStyle = g;
    x.beginPath(); x.roundRect(x0, y0, bw, bh, 8); x.fill();
    x.fillStyle = "#e2e8f0"; x.font = "13px system-ui"; x.textAlign = "center";
    x.fillText(avgs[i] + "%", x0 + bw / 2, y0 - 8);
    x.fillText(z, x0 + bw / 2, h - 8);
  });
}

/* ---------- AI Q&A ---------- */
const SYSTEM = "You are EcoSmart's assistant for smart waste management. Answer clearly and concisely (under 150 words) about waste segregation, recycling, e-waste, composting, pickups, and how to use this app.";

const KB = [
  [/plastic|bottle/i, "Rinse plastic bottles and check the resin code. Recyclable plastics (PET #1, HDPE #2) go in the recyclable bin. Bags and wrappers usually go to general waste."],
  [/compost|organic|food|kitchen/i, "Food scraps, peels, leaves and garden waste belong in the Organic (green) bin. You can also compost them at home."],
  [/battery|batteries|e-?waste|electronic|phone|laptop/i, "Batteries and electronics are hazardous. Never put them in general bins. Use an E-Waste drop-off point."],
  [/glass/i, "Glass bottles and jars are recyclable. Remove lids and rinse them. Broken window glass and ceramics are general waste."],
  [/pickup|collect|schedule/i, "Use the Pickup section to book a collection for your zone and waste type. It will appear under the booking list."],
  [/full|overflow|report|damage/i, "For an overflowing or damaged bin, submit a report with its location so the team can prioritize it."]
];

function localAnswer(q) {
  const hit = KB.find(([re]) => re.test(q));
  return hit ? hit[1] : "I can answer questions about segregation, recycling, e-waste, composting, pickups and reports. Add an Anthropic API key above for AI answers to any question.";
}

async function askAI(q) {
  const key = $("#apiKey").value.trim();
  if (!key) return localAnswer(q);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-haiku-5-5", max_tokens: 500, system: SYSTEM,
        messages: [{ role: "user", content: q }]
      })
    });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    return d.content.filter(b => b.type === "text").map(b => b.text).join("\n");
  } catch (err) {
    toast("AI request failed. Showing offline answer.");
    return localAnswer(q);
  }
}

function renderQA() {
  $("#qaList").innerHTML = qa.map(x => `
    <div class="item qa" style="display:block">
      <p class="q">❓ ${esc(x.q)}</p>
      <p class="a">${esc(x.a)}</p>
      <small>${x.t}</small>
    </div>`).join("") || "<p class='muted'>No questions yet. Ask anything!</p>";
}

$("#qaForm").onsubmit = async e => {
  e.preventDefault();
  const q = $("#question").value.trim();
  if (!q) return;
  const btn = e.target.querySelector("button");
  btn.disabled = true; btn.textContent = "Thinking…";
  const a = await askAI(q);
  qa.unshift({ q, a, t: new Date().toLocaleTimeString() });
  qa = qa.slice(0, 50);
  save("qa", qa);
  $("#question").value = "";
  btn.disabled = false; btn.textContent = "Ask";
  renderQA();
};

/* ---------- Animated particle background ---------- */
const bg = $("#bg"), bx = bg.getContext("2d");
let pts = [];
function resizeBg() {
  bg.width = innerWidth; bg.height = innerHeight;
  pts = Array.from({ length: 70 }, () => ({
    x: Math.random() * bg.width, y: Math.random() * bg.height,
    vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, r: Math.random() * 2 + 1
  }));
}
function animBg() {
  bx.clearRect(0, 0, bg.width, bg.height);
  pts.forEach((p, i) => {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > bg.width) p.vx *= -1;
    if (p.y < 0 || p.y > bg.height) p.vy *= -1;
    bx.beginPath(); bx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    bx.fillStyle = "rgba(74,222,128,.6)"; bx.fill();
    for (let j = i + 1; j < pts.length; j++) {
      const q = pts[j], d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < 120) {
        bx.strokeStyle = `rgba(56,189,248,${1 - d / 120})`;
        bx.beginPath(); bx.moveTo(p.x, p.y); bx.lineTo(q.x, q.y); bx.stroke();
      }
    }
  });
  requestAnimationFrame(animBg);
}

/* ---------- Init ---------- */
addEventListener("resize", () => { resizeBg(); drawChart(); });
renderBins();
renderReports();
renderPickups();
renderQA();
resizeBg();
animBg();

const pickupDate = document.querySelector("#pickupForm input[type=date]");
if (pickupDate) {
  const today = new Date();
  pickupDate.min = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
}