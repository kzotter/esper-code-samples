// Copyright (c) 2026 Esper.io — MIT License
// See LICENSE in the repository root.

/**
 * Esper ITSM Connector Middleware
 *
 * A lightweight Express service that bridges ITSM platforms (Zendesk,
 * Salesforce, ServiceNow) to the Esper Cloud API.
 *
 * This service:
 *   - Holds the Esper API key server-side (never exposed to the browser)
 *   - Resolves device identifiers (serial, name, alias) to Esper UUIDs
 *   - Enforces command guardrails (only allows whitelisted operations)
 *   - Supports dry-run mode for safe initial setup
 *   - Logs ITSM context (ticket ID) alongside device operations
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const config = require("./config");
const esper = require("./esper-client");

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(helmet());
app.use(express.json());
app.use(morgan(config.logLevel));

// CORS — lock this down to your ITSM platform domain(s) in production
app.use(
  cors({
    origin: config.allowedOrigins.includes("*")
      ? true
      : config.allowedOrigins,
    methods: ["GET", "POST"],
  })
);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    tenant: config.esper.tenant,
    dryRun: config.dryRun,
    version: require("../package.json").version,
  });
});

// ---------------------------------------------------------------------------
// Device resolution
// ---------------------------------------------------------------------------

/**
 * GET /device/resolve?q=<serial|name|alias>
 *
 * The primary endpoint for ITSM sidebars. Pass a device serial number,
 * name, or alias and get back an enriched device object with blueprint
 * name and console deep link.
 *
 * Query params:
 *   q (required) — search query (serial, name, alias)
 *
 * Returns 200 with device object, or 404 if no match found.
 */
app.get("/device/resolve", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Missing required query param: q" });
  }

  try {
    const device = await esper.getEnrichedDevice(query);
    if (!device) {
      return res
        .status(404)
        .json({ error: `No device found matching: ${query}` });
    }
    res.json(device);
  } catch (err) {
    console.error("Device resolve error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Device details
// ---------------------------------------------------------------------------

/**
 * GET /device/:id
 *
 * Get full details for a device by its Esper UUID.
 */
app.get("/device/:id", async (req, res) => {
  try {
    const device = await esper.getDevice(req.params.id);
    device.consoleLink = esper.buildConsoleLink(req.params.id);
    res.json(device);
  } catch (err) {
    console.error("Device detail error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Device search (multi-result)
// ---------------------------------------------------------------------------

/**
 * GET /devices?q=<query>&limit=10&offset=0
 *
 * Search for devices. Returns multiple results (paginated).
 * Useful when a serial number matches more than one device.
 */
app.get("/devices", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Missing required query param: q" });
  }

  try {
    const data = await esper.searchDevices(query, {
      limit: parseInt(req.query.limit, 10) || 10,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json(data);
  } catch (err) {
    console.error("Device search error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Blueprint details
// ---------------------------------------------------------------------------

/**
 * GET /device/:id/blueprint
 *
 * Get the blueprint assigned to a device. Requires the device's blueprint
 * info (fetches the device first if needed).
 */
app.get("/device/:id/blueprint", async (req, res) => {
  try {
    const device = await esper.getDevice(req.params.id);
    const bpId = device.blueprint_info?.assigned_blueprint_id;

    if (!bpId) {
      return res
        .status(404)
        .json({ error: "No blueprint assigned to this device" });
    }

    const blueprint = await esper.getBlueprint(bpId);
    res.json(blueprint);
  } catch (err) {
    console.error("Blueprint error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Event feed
// ---------------------------------------------------------------------------

/**
 * GET /device/:id/events?limit=20&offset=0
 *
 * Get recent events for a device (status changes, commands, connectivity).
 */
app.get("/device/:id/events", async (req, res) => {
  try {
    const data = await esper.getEventFeed(req.params.id, {
      limit: parseInt(req.query.limit, 10) || 20,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json(data);
  } catch (err) {
    console.error("Event feed error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /device/:id/events/report?limit=20&offset=0
 *
 * Get a human-readable event feed report for a device.
 */
app.get("/device/:id/events/report", async (req, res) => {
  try {
    const data = await esper.getEventFeedReport(req.params.id, {
      limit: parseInt(req.query.limit, 10) || 20,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json(data);
  } catch (err) {
    console.error("Event feed report error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Device commands
// ---------------------------------------------------------------------------

/**
 * POST /device/:id/command
 *
 * Send a command to a device. Only whitelisted commands are allowed.
 *
 * Body:
 *   { "command": "REBOOT" | "UPDATE_HEARTBEAT" | "LOCK" | "UNLOCK" }
 *
 * Optional body fields (for audit logging):
 *   { "ticketId": "ZD-4821", "agentEmail": "jane@acme.com" }
 *
 * In dry-run mode (DRY_RUN=true), the command is validated but not executed.
 */
app.post("/device/:id/command", async (req, res) => {
  const { command, ticketId, agentEmail } = req.body;

  if (!command) {
    return res.status(400).json({
      error: "Missing required field: command",
      allowed: [...esper.ALLOWED_COMMANDS],
    });
  }

  // Audit log entry
  console.log(
    `[COMMAND] device=${req.params.id} command=${command} ` +
      `ticket=${ticketId || "n/a"} agent=${agentEmail || "n/a"} ` +
      `dryRun=${config.dryRun}`
  );

  try {
    const result = await esper.sendCommand(req.params.id, command);
    res.json(result);
  } catch (err) {
    console.error("Command error:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Console deep link
// ---------------------------------------------------------------------------

/**
 * GET /device/:id/console-link
 *
 * Returns a deep link URL to the Esper console for this device.
 * The agent's existing SSO session handles authentication.
 */
app.get("/device/:id/console-link", (req, res) => {
  res.json({
    url: esper.buildConsoleLink(req.params.id),
    deviceId: req.params.id,
  });
});

// ---------------------------------------------------------------------------
// Info endpoint — lists available commands and capabilities
// ---------------------------------------------------------------------------

app.get("/info", (_req, res) => {
  res.json({
    tenant: config.esper.tenant,
    dryRun: config.dryRun,
    allowedCommands: [...esper.ALLOWED_COMMANDS],
    endpoints: {
      resolve: "GET /device/resolve?q=<serial|name>",
      detail: "GET /device/:id",
      search: "GET /devices?q=<query>&limit=10",
      blueprint: "GET /device/:id/blueprint",
      events: "GET /device/:id/events?limit=20",
      eventsReport: "GET /device/:id/events/report?limit=20",
      command: "POST /device/:id/command",
      consoleLink: "GET /device/:id/console-link",
    },
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(config.port, () => {
  console.log(`\n🚀 Esper ITSM Middleware running on port ${config.port}`);
  console.log(`   Tenant:   ${config.esper.tenant}`);
  console.log(`   Base URL:  ${config.esper.baseUrl}`);
  console.log(`   Dry-run:  ${config.dryRun}`);
  console.log(`   CORS:     ${config.allowedOrigins.join(", ")}\n`);
});

module.exports = app;
