const socket = io();
let latestState = null;

const screen = document.body.dataset.screen;
const $ = (selector) => document.querySelector(selector);

socket.on("queue:state", (state) => {
  latestState = state;
  renderState(state);
});

if (screen === "reception") {
  setupReception();
}

if (screen === "waiting") {
  setupWaitingRoom();
}

function setupReception() {
  $("#patient-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const startedAt = performance.now();
    const response = await postJson("/api/patients", payload);
    if (response.ok) {
      event.currentTarget.reset();
      $("#name").focus();
      const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
      showToast(`Token ${response.data.token} issued in ${elapsed}s`);
    } else {
      showToast(response.data.message || "Could not add patient");
    }
  });

  $("#call-next").addEventListener("click", async () => {
    const response = await postJson("/api/call-next", {});
    if (!response.ok) {
      showToast(response.data.message || "Queue is empty");
    }
  });

  $("#avg-time").addEventListener("change", async (event) => {
    await postJson("/api/average-time", { minutes: event.target.value });
  });

  $("#avg-time").addEventListener("input", (event) => {
    $("#avg-label").textContent = `${event.target.value} min`;
  });

  $("#reset-day").addEventListener("click", async () => {
    if (confirm("Reset today's queue? This clears waiting and completed tokens.")) {
      await postJson("/api/reset", {});
    }
  });
}

function setupWaitingRoom() {
  $("#token-search").addEventListener("input", () => renderMyStatus(latestState));
  $("#clear-search").addEventListener("click", () => {
    $("#token-search").value = "";
    renderMyStatus(latestState);
  });
}

function renderState(state) {
  renderCurrent(state.current);
  renderQueue(state);

  const avgLabel = $("#avg-label");
  if (avgLabel) {
    avgLabel.textContent = `${state.metrics.averageConsultationMinutes} min`;
    $("#avg-time").value = state.settings.averageConsultationMinutes;
    $("#avg-source").textContent =
      state.metrics.source === "completed consultations"
        ? "Using recent completed consultation durations."
        : "Using receptionist setting until enough real visits complete.";
  }

  renderMyStatus(state);
}

function renderCurrent(current) {
  const token = $("#current-token");
  const name = $("#current-name");
  if (!token || !name) return;

  token.textContent = current ? tokenLabel(current.token) : "--";
  name.textContent = current ? current.name : "No patient called yet";
}

function renderQueue(state) {
  const list = $("#queue-list");
  const count = $("#queue-count");
  if (!list) return;

  count.textContent = state.queue.length;
  list.innerHTML = "";

  if (state.queue.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-row";
    empty.textContent = "No patients waiting";
    list.append(empty);
    return;
  }

  state.queue.slice(0, screen === "waiting" ? 12 : 50).forEach((patient) => {
    const item = document.createElement("li");
    item.className = screen === "waiting" ? "ticket" : "queue-row";
    item.innerHTML =
      screen === "waiting"
        ? `<strong>${tokenLabel(patient.token)}</strong><span>${patient.estimatedWaitMinutes} min</span>`
        : `<div><strong>${tokenLabel(patient.token)} ${escapeHtml(patient.name)}</strong><span>${escapeHtml(patient.concern || "General visit")}</span></div><time>${patient.estimatedWaitMinutes} min wait</time>`;
    list.append(item);
  });
}

function renderMyStatus(state) {
  if (screen !== "waiting" || !state) return;
  const value = Number($("#token-search").value);
  const status = $("#my-status");

  if (!value) {
    status.textContent = "Enter your token to see tokens ahead and wait time.";
    status.className = "my-status";
    return;
  }

  if (state.current?.token === value) {
    status.textContent = "It is your turn now. Please go in.";
    status.className = "my-status active";
    return;
  }

  const patient = state.queue.find((item) => item.token === value);
  if (!patient) {
    status.textContent = "This token is not waiting right now. It may be completed or not issued today.";
    status.className = "my-status missing";
    return;
  }

  status.textContent = `${patient.tokensAhead} token${patient.tokensAhead === 1 ? "" : "s"} ahead. Estimated wait: ${patient.estimatedWaitMinutes} minutes.`;
  status.className = "my-status";
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  window.setTimeout(() => {
    toast.textContent = "";
  }, 2600);
}

function tokenLabel(token) {
  return `T${String(token).padStart(3, "0")}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}
