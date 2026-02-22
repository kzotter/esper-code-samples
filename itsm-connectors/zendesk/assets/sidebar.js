// Copyright (c) 2026 Esper.io — MIT License
// See LICENSE in the repository root.

(function () {
  const client = ZAFClient.init();

  // State
  let device = null;
  let middlewareUrl = "";
  let esperTenant = "";
  let deviceFieldName = "device_serial";

  // DOM helpers
  const $ = (id) => document.getElementById(id);
  const show = (id) => {
    $(id).style.display = "";
  };
  const hide = (id) => {
    $(id).style.display = "none";
  };

  function showState(stateId) {
    ["loading", "no-device", "not-found", "error-state", "device-card"].forEach(
      hide
    );
    show(stateId);
  }

  // ── Initialization ──────────────────────────────────────────────────────

  client.on("app.registered", async () => {
    try {
      // Read app settings
      const meta = await client.metadata();
      middlewareUrl = meta.settings.middleware_url.replace(/\/+$/, "");
      esperTenant = meta.settings.esper_tenant;
      deviceFieldName = meta.settings.device_field_name || "device_serial";

      // Read device serial from ticket custom field
      const ticketData = await client.get(
        `ticket.customField:${deviceFieldName}`
      );
      const serial =
        ticketData[`ticket.customField:${deviceFieldName}`];

      if (!serial) {
        showState("no-device");
        client.invoke("resize", { width: "100%", height: "120px" });
        return;
      }

      await loadDevice(serial);
    } catch (err) {
      showError(err.message);
    }
  });

  // Listen for field changes (agent adds serial after ticket opens)
  client.on(`ticket.customField:${deviceFieldName}.changed`, async (val) => {
    if (val) {
      showState("loading");
      await loadDevice(val);
    } else {
      showState("no-device");
    }
  });

  // ── Device loading ──────────────────────────────────────────────────────

  async function loadDevice(query) {
    showState("loading");

    try {
      const response = await client.request({
        url: `${middlewareUrl}/device/resolve?q=${encodeURIComponent(query)}`,
        type: "GET",
        dataType: "json",
      });

      device = response;
      renderDevice();
    } catch (err) {
      if (err.status === 404) {
        $("searched-query").textContent = query;
        showState("not-found");
        client.invoke("resize", { width: "100%", height: "120px" });
      } else {
        showError(err.responseText || err.message || "Unknown error");
      }
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  function renderDevice() {
    $("device-name").textContent = device.name || device.id;
    $("device-serial").textContent = device.serial || "—";
    $("device-model").textContent = device.hardware_info
      ? `${device.hardware_info.brand} ${device.hardware_info.model}`
      : "—";
    $("device-os").textContent = `Android ${device.os_version || "?"}`;
    $("device-agent").textContent = device.dpc_version || "—";
    $("device-blueprint").textContent = device.blueprintName || "—";
    $("device-lastseen").textContent = device.last_seen
      ? timeAgo(device.last_seen)
      : "—";

    const badge = $("status-badge");
    if (device.state === 1) {
      badge.textContent = "Online";
      badge.className = "status-badge online";
    } else {
      badge.textContent = "Offline";
      badge.className = "status-badge offline";
    }

    showState("device-card");
    client.invoke("resize", { width: "100%", height: "380px" });
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  $("btn-remote").addEventListener("click", () => {
    if (device) {
      const url = `https://${esperTenant}.esper.cloud/devices/${device.id}/`;
      window.open(url, "_blank");
    }
  });

  $("btn-reboot").addEventListener("click", () => sendCommand("REBOOT"));
  $("btn-ping").addEventListener("click", () =>
    sendCommand("UPDATE_HEARTBEAT")
  );

  $("btn-events").addEventListener("click", async () => {
    const panel = $("events-panel");
    if (panel.style.display !== "none") {
      hide("events-panel");
      client.invoke("resize", { width: "100%", height: "380px" });
      return;
    }

    try {
      const data = await client.request({
        url: `${middlewareUrl}/device/${device.id}/events?limit=10`,
        type: "GET",
        dataType: "json",
      });

      const list = $("events-list");
      list.innerHTML = "";

      const events = data.results || data;
      if (Array.isArray(events) && events.length > 0) {
        events.slice(0, 10).forEach((evt) => {
          const div = document.createElement("div");
          div.className = "event-item";
          div.innerHTML = `
            <span class="event-time">${timeAgo(evt.timestamp || evt.created_on)}</span>
            <span class="event-text">${evt.event_name || evt.type || "Event"}</span>
          `;
          list.appendChild(div);
        });
      } else {
        list.innerHTML = '<p class="muted small">No recent events.</p>';
      }

      show("events-panel");
      client.invoke("resize", { width: "100%", height: "600px" });
    } catch (err) {
      client.invoke("notify", "Error loading events", "error");
    }
  });

  async function sendCommand(command) {
    if (!device) return;

    try {
      // Get ticket ID for audit logging
      const ticketData = await client.get("ticket.id");
      const ticketId = ticketData["ticket.id"];

      await client.request({
        url: `${middlewareUrl}/device/${device.id}/command`,
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify({
          command,
          ticketId: `ZD-${ticketId}`,
        }),
      });

      const label =
        command === "UPDATE_HEARTBEAT" ? "Ping" : capitalize(command);
      client.invoke(
        "notify",
        `${label} sent to ${device.name}`,
        "notice"
      );
    } catch (err) {
      const msg =
        err.responseJSON?.error || err.message || "Command failed";
      client.invoke("notify", msg, "error");
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function showError(msg) {
    $("error-message").textContent = msg;
    showState("error-state");
    client.invoke("resize", { width: "100%", height: "120px" });
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  function timeAgo(isoString) {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }
})();
