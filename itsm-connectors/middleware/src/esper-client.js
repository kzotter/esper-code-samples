// Copyright (c) 2026 Esper.io — MIT License
// See LICENSE in the repository root.

/**
 * Esper Cloud API Client
 *
 * Wraps the Esper REST API endpoints used by the ITSM connectors.
 * All methods return parsed JSON or throw on error.
 *
 * API surface used:
 *   Devices     — GET /api/v2/devices/               (search, list)
 *   Devices     — GET /api/v2/devices/:id/            (single device)
 *   Blueprints  — GET /api/v2/blueprints/:id/         (blueprint details)
 *   Event Feed  — GET /api/enterprise/:eid/device/:id/event-feed/
 *   Commands    — POST /api/enterprise/:eid/device/:id/command/
 *   Groups      — GET /api/enterprise/:eid/devicegroup/:id/
 *
 * Note: Enterprise ID is only included in paths where the API requires it.
 * v2 endpoints (devices, blueprints) do NOT use enterprise ID in the path.
 * v1 endpoints (event-feed, commands, groups) DO require it.
 */

const config = require("./config");

const BASE = config.esper.baseUrl;
const EID = config.esper.enterpriseId;

const headers = {
  Authorization: `Bearer ${config.esper.apiKey}`,
  "Content-Type": "application/json",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function esperFetch(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { headers, ...options });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      `Esper API ${res.status}: ${res.statusText} — ${url}`
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Device operations
// ---------------------------------------------------------------------------

/**
 * Search for devices by serial number, name, alias, or any searchable field.
 * Returns the full paginated response from /api/v2/devices/.
 */
async function searchDevices(query, { limit = 10, offset = 0 } = {}) {
  const params = new URLSearchParams({
    search: query,
    limit: String(limit),
    offset: String(offset),
  });
  return esperFetch(`/api/v2/devices/?${params}`);
}

/**
 * Resolve a search query to a single device. Returns the first match or null.
 * This is the primary method the ITSM sidebar uses — pass a serial number,
 * device name, or alias and get back a fully hydrated device object.
 */
async function resolveDevice(query) {
  const data = await searchDevices(query, { limit: 5 });
  if (data.results && data.results.length > 0) {
    return data.results[0];
  }
  return null;
}

/**
 * Get full details for a single device by its UUID.
 */
async function getDevice(deviceId) {
  return esperFetch(`/api/v2/devices/${deviceId}/`);
}

/**
 * Get devices filtered by various criteria. Useful for group-scoped views.
 */
async function listDevices(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  if (!params.has("limit")) params.set("limit", "20");
  return esperFetch(`/api/v2/devices/?${params}`);
}

// ---------------------------------------------------------------------------
// Blueprint operations
// ---------------------------------------------------------------------------

/**
 * Get blueprint details by UUID.
 */
async function getBlueprint(blueprintId) {
  return esperFetch(`/api/v2/blueprints/${blueprintId}/`);
}

// ---------------------------------------------------------------------------
// Event feed
// ---------------------------------------------------------------------------

/**
 * Get the event feed for a device. Returns recent events (status changes,
 * commands, connectivity, etc.).
 *
 * Note: This uses the v1 enterprise-scoped endpoint.
 */
async function getEventFeed(deviceId, { limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return esperFetch(
    `/api/enterprise/${EID}/device/${deviceId}/event-feed/?${params}`
  );
}

/**
 * Get the human-readable event feed report for a device.
 */
async function getEventFeedReport(deviceId, { limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return esperFetch(
    `/api/enterprise/${EID}/device/${deviceId}/event-feed-report/?${params}`
  );
}

// ---------------------------------------------------------------------------
// Device commands
// ---------------------------------------------------------------------------

/**
 * Allowed commands. The middleware only permits these — everything else is
 * rejected before it reaches the Esper API. Adjust this list to match your
 * RBAC role's permissions.
 */
const ALLOWED_COMMANDS = new Set([
  "REBOOT",
  "UPDATE_HEARTBEAT", // ping
  "LOCK",
  "UNLOCK",
]);

/**
 * Send a command to a device.
 *
 * In dry-run mode, this validates the command but does not execute it.
 * Returns { dryRun: true, command, deviceId } instead.
 *
 * Note: This uses the v1 enterprise-scoped endpoint.
 */
async function sendCommand(deviceId, command) {
  const cmd = String(command).toUpperCase();

  if (!ALLOWED_COMMANDS.has(cmd)) {
    const err = new Error(
      `Command "${cmd}" is not in the allowed list. ` +
        `Permitted: ${[...ALLOWED_COMMANDS].join(", ")}`
    );
    err.status = 403;
    throw err;
  }

  if (config.dryRun) {
    return {
      dryRun: true,
      message: `Dry-run mode: ${cmd} would be sent to device ${deviceId}`,
      command: cmd,
      deviceId,
    };
  }

  return esperFetch(`/api/enterprise/${EID}/device/${deviceId}/command/`, {
    method: "POST",
    body: JSON.stringify({
      command_type: "DEVICE",
      command: cmd,
    }),
  });
}

// ---------------------------------------------------------------------------
// Device groups
// ---------------------------------------------------------------------------

/**
 * Get a device group by UUID.
 *
 * Note: This uses the v1 enterprise-scoped endpoint.
 */
async function getGroup(groupId) {
  return esperFetch(
    `/api/enterprise/${EID}/devicegroup/${groupId}/`
  );
}

// ---------------------------------------------------------------------------
// Console deep link builder
// ---------------------------------------------------------------------------

/**
 * Build a deep link URL to the Esper console for a device.
 * The agent's existing SSO session handles authentication.
 */
function buildConsoleLink(deviceId) {
  return `https://${config.esper.tenant}.esper.cloud/devices/${deviceId}/`;
}

// ---------------------------------------------------------------------------
// Enrichment — combines multiple API calls into a single sidebar payload
// ---------------------------------------------------------------------------

/**
 * Resolve a device and return an enriched payload suitable for rendering
 * in an ITSM sidebar. This is the primary method most connectors will call.
 *
 * Returns null if no device matches the query.
 */
async function getEnrichedDevice(query) {
  const device = await resolveDevice(query);
  if (!device) return null;

  const result = {
    ...device,
    consoleLink: buildConsoleLink(device.id),
    statusLabel: device.state === 1 ? "Online" : "Offline",
  };

  // Enrich with blueprint name if available
  if (device.blueprint_info?.assigned_blueprint_id) {
    try {
      const bp = await getBlueprint(device.blueprint_info.assigned_blueprint_id);
      result.blueprintName = bp.name;
    } catch {
      result.blueprintName = "Unknown";
    }
  }

  return result;
}

module.exports = {
  searchDevices,
  resolveDevice,
  getDevice,
  listDevices,
  getBlueprint,
  getEventFeed,
  getEventFeedReport,
  sendCommand,
  getGroup,
  buildConsoleLink,
  getEnrichedDevice,
  ALLOWED_COMMANDS,
};
