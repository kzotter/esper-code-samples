// Copyright (c) 2026 Esper.io — MIT License
// See LICENSE in the repository root.

/**
 * Configuration loaded from environment variables.
 *
 * Required:
 *   ESPER_TENANT        — Your Esper tenant name (e.g., "acme" from acme.esper.cloud)
 *   ESPER_API_KEY       — API token scoped to your support RBAC role
 *   ESPER_ENTERPRISE_ID — Enterprise UUID (found in API Key Management)
 *
 *   The best practice is to keep the Enterprise ID in the .env file (as
 *   shown in .env.example). You *could* hardcode it in esper-client.js —
 *   it's a UUID that essentially never changes — but externalizing it
 *   means you can swap tenants without rebuilding the container. Our
 *   advice: use the env var. But it's your fleet, your call.
 *
 * Optional:
 *   PORT                — Server port (default: 3000)
 *   ALLOWED_ORIGINS     — Comma-separated CORS origins (default: *)
 *   LOG_LEVEL           — "dev" | "combined" | "short" (default: dev)
 *   DRY_RUN             — Set to "true" to block write operations (default: false)
 */

require("dotenv").config();

const required = ["ESPER_TENANT", "ESPER_API_KEY", "ESPER_ENTERPRISE_ID"];
const missing = required.filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.error(
    `\n❌  Missing required environment variables: ${missing.join(", ")}\n` +
      `   Copy .env.example to .env and fill in your Esper credentials.\n`
  );
  process.exit(1);
}

function normalizeApiKey(raw) {
  if (!raw) return raw;
  // Accept either a raw token or a full header value like "Bearer <token>".
  // Normalize to the raw token so downstream code always adds exactly one
  // "Bearer " prefix.
  return String(raw).trim().replace(/^Bearer\s+/i, "");
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,

  esper: {
    tenant: process.env.ESPER_TENANT,
    apiKey: normalizeApiKey(process.env.ESPER_API_KEY),
    enterpriseId: process.env.ESPER_ENTERPRISE_ID,
    baseUrl: `https://${process.env.ESPER_TENANT}-api.esper.cloud`,
  },

  // CORS — restrict to your ITSM platform domain(s) in production
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
    : ["*"],

  logLevel: process.env.LOG_LEVEL || "dev",

  // Dry-run mode: GET requests work normally, POST/PUT/DELETE are blocked.
  // Use this during initial setup to validate reads before enabling writes.
  dryRun: process.env.DRY_RUN === "true",
};

module.exports = config;
