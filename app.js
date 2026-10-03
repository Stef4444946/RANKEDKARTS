const STORAGE_KEY = "kartTimeReaderData";

const state = {
  data: loadData(),
  timer: null,
  reading: false,
  currentUrl: ""
};

const $ = id => document.getElementById(id);

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
      heats: [],
      karts: {},
      current: null,
      meta: {}
    };
  } catch {
    return {
      heats: [],
      karts: {},
      current: null,
      meta: {}
    };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatTime(value) {
  return Number.isFinite(Number(value))
    ? `${Number(value).toFixed(3)} s`
    : "—";
}

function timeToSec(value) {
  const s = String(value ?? "").replace(",", ".").trim();
  if (!s) return null;

  const p = s.split(":").map(Number);

  if (p.some(Number.isNaN)) return null;

  if (p.length === 3) {
    return p[0] * 3600 + p[1] * 60 + p[2];
  }

  if (p.length === 2) {
    return p[0] * 60 + p[1];
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function setMessage(text, online = false) {
  $("message").textContent = text;

  $("status").textContent = online ? "Live verbonden" : "Niet verbonden";
  $("status").classList.toggle("online", online);
  $("status").classList.toggle("offline", !online);
}

function rankingScore(kart) {
  return kart.averageSec * 0.70 + kart.bestSec * 0.30;
}

function ensureKart(kart, driver) {
  const key = String(kart);

  if (!state.data.karts[key]) {
    state.data.karts[key] = {
      kart: key,
      driver: driver || "",
      heats: [],
      bestSec: null,
      averageSec: null,
      lastSec: null,
      lastHeat: ""
    };
  }

  if (driver) {
    state.data.karts[key].driver = driver;
  }

  return state.data.karts[key];
}

function addMeasurement(row, heat) {
  const kart = ensureKart(row.kart, row.driver);

  const sec = timeToSec(row.best);
  if (!Number.isFinite(sec)) return;

  let entry = kart.heats.find(x => x.heatId === heat.id);

  if (!entry) {
    entry = {
      heatId: heat.id,
      name: heat.name,
      phase: heat.phase,
      timeSec: sec,
      savedAt: Date.now()
    };

    kart.heats.push(entry);
  } else if (sec < entry.timeSec) {
    entry.timeSec = sec;
    entry.savedAt = Date.now();
  }

  const values = kart.heats
    .map(x => Number(x.timeSec))
    .filter(Number.isFinite);

  kart.bestSec = Math.min(...values);
  kart.averageSec =
    values.reduce((sum, value) => sum + value, 0) / values.length;

  kart.lastSec = sec;
  kart.lastHeat = heat.name;
}

function createHeatId(data) {
  return [
    data.url,
    data.session,
    data.phase
  ].join("|").toLowerCase().replace(/\s+/g, " ").trim();
}

function finishCurrentHeat() {
  if (!state.data.current?.karts?.length) return;

  const current = {
    ...state.data.current,
    status: "finished",
    finishedAt: Date.now()
  };

  const index = state.data.heats.findIndex(x => x.id === current.id);

  if (index >= 0) {
    state.data.heats[index] = current;
  } else {
    state.data.heats.push(current);
  }

  state.data.current = null;
}

function processApexData(data) {
  if (!data?.ok) {
    throw new Error("Geen karts gevonden op de Apex-pagina.");
  }

  const heatId = createHeatId(data);

  if (
    state.data.current &&
    state.data.current.id &&
    state.data.current.id !== heatId
  ) {
    finishCurrentHeat();
  }

  const now = Date.now();

  const heat = {
    id: heatId,
    name: data.session || "Onbekende heat",
    phase: data.phase || "",
    karts: data.karts.map(row => ({
      kart: row.kart,
      driver: row.driver,
      best: row.best,
      bestSec: row.bestSec
    })),
    startedAt:
      state.data.current?.id === heatId
        ? state.data.current.startedAt
        : now,
    updatedAt: now,
    status: "live"
  };

  state.data.current = heat;

  for (const row of data.karts) {
    addMeasurement(row, {
      id: heatId,
      name: heat.name,
      phase: heat.phase
    });
  }

  state.data.meta = {
    updatedAt: now,
    lastSession: data.session,
    lastPhase: data.phase,
    url: data.url
  };

  saveData();
}

function renderLive(data) {
  $("session").textContent = `Sessie: ${data?.session || "—"}`;
  $("phase").textContent = `Fase: ${data?.phase || "—"}`;
  $("updated").textContent = data?.updated
    ? new Date(data.updated).toLocaleTimeString()
    : "—";

  const rows = data?.karts || [];

  if (!rows.length) {
    $("liveTable").innerHTML =
      `<div class="empty">Nog geen karts gevonden.</div>`;
    return;
  }

  $("liveTable").innerHTML = rows.map(row => `
    <div class="row">
      <span class="kart">#${escapeHtml(row.kart)}</span>
      <span>${escapeHtml(row.driver || "—")}</span>
      <span class="best">${escapeHtml(row.best || "—")}</span>
      <span class="source">${escapeHtml(row.source || "best")}</span>
    </div>
  `).join("");
}

function renderRanking() {
  const list = Object.values(state.data.karts || {})
    .filter(k =>
      Number.isFinite(k.averageSec) &&
      Number.isFinite(k.bestSec)
    )
    .sort((a, b) => rankingScore(a) - rankingScore(b));

  if (!list.length) {
    $("rankingTable").innerHTML =
      `<div class="empty">Nog geen opgeslagen heats.</div>`;
    return;
  }

  $("rankingTable").innerHTML = list.map((kart, index) => `
    <div class="rank-row">
      <span class="pos">${index + 1}</span>

      <span>
        <b>Kart #${escapeHtml(kart.kart)}</b>
        <small>${escapeHtml(kart.driver || "")}</small>
      </span>

      <span>${formatTime(kart.averageSec)}</span>
      <span>${formatTime(kart.bestSec)}</span>
      <span>${kart.heats?.length || 0}</span>
      <span class="score">${formatTime(rankingScore(kart))}</span>

      <button
        class="remove"
        data-remove="${escapeHtml(kart.kart)}"
      >
        Verwijder
      </button>
    </div>
  `).join("");

  document.querySelectorAll("[data-remove]").forEach(button => {
    button.addEventListener("click", () => {
      const kart = button.dataset.remove;

      if (!confirm(`Kart #${kart} uit de ranking verwijderen?`)) {
        return;
      }

      delete state.data.karts[kart];
      saveData();
      renderRanking();
    });
  });
}

function renderHeats() {
  const heats = [...(state.data.heats || [])];

  if (state.data.current) {
    heats.unshift(state.data.current);
  }

  heats.sort((a, b) =>
    (b.updatedAt || b.finishedAt || 0) -
    (a.updatedAt || a.finishedAt || 0)
  );

  if (!heats.length) {
    $("heatTable").innerHTML =
      `<div class="empty">Nog geen heats opgeslagen.</div>`;
    return;
  }

  $("heatTable").innerHTML = heats.map(heat => `
    <article class="heat">
      <div>
        <b>${escapeHtml(heat.name || "Onbekende heat")}</b>
        <span>
          ${escapeHtml(heat.phase || "Geen fase")}
          ·
          ${heat.status === "live" ? "LIVE" : "OPGESLAGEN"}
        </span>
      </div>

      <div class="heat-count">
        ${heat.karts?.length || 0} karts
      </div>
    </article>
  `).join("");
}

async function readNow() {
  if (state.reading) return;

  const url = $("url").value.trim();

  if (!url) {
    setMessage("Vul eerst een Apex Timing-link in.");
    return;
  }

  state.reading = true;
  setMessage("Apex Timing wordt uitgelezen...");

  try {
    const response = await fetch("/api/read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Geen data gevonden.");
    }

    state.currentUrl = url;

    processApexData(data);
    renderLive(data);
    renderRanking();
    renderHeats();

    setMessage(
      `${data.karts.length} karts gelezen · ${data.session || "sessie onbekend"}`,
      true
    );
  } catch (error) {
    console.error(error);
    setMessage(error.message || "Lezen mislukt.");
  } finally {
    state.reading = false;
  }
}

function restartTimer() {
  clearInterval(state.timer);
  state.timer = null;

  const ms = Number($("interval").value);

  if (ms > 0) {
    state.timer = setInterval(readNow, ms);
    readNow();
  }
}

$("readBtn").addEventListener("click", readNow);
$("startBtn").addEventListener("click", restartTimer);
$("interval").addEventListener("change", restartTimer);

$("clearBtn").addEventListener("click", () => {
  if (!confirm("Alle heats en rankinggegevens wissen?")) return;

  state.data = {
    heats: [],
    karts: {},
    current: null,
    meta: {}
  };

  saveData();
  renderRanking();
  renderHeats();
  setMessage("Alle gegevens zijn gewist.");
});

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab")
      .forEach(x => x.classList.remove("active"));

    document.querySelectorAll(".panel")
      .forEach(x => x.classList.add("hidden"));

    button.classList.add("active");
    $(button.dataset.tab).classList.remove("hidden");

    renderRanking();
    renderHeats();
  });
});

renderRanking();
renderHeats();