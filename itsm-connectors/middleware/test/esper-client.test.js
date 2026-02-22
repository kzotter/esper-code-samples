// Copyright (c) 2026 Esper.io — MIT License
// Basic smoke tests for the Esper client module.
// Run: node --test test/esper-client.test.js

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Set required env vars before importing config
process.env.ESPER_TENANT = "test-tenant";
process.env.ESPER_API_KEY = "test-key";
process.env.ESPER_ENTERPRISE_ID = "test-eid";

const esper = require("../src/esper-client");

describe("esper-client", () => {
  it("buildConsoleLink returns correct URL", () => {
    const link = esper.buildConsoleLink("abc-123");
    assert.equal(link, "https://test-tenant.esper.cloud/devices/abc-123/");
  });

  it("ALLOWED_COMMANDS contains expected commands", () => {
    assert.ok(esper.ALLOWED_COMMANDS.has("REBOOT"));
    assert.ok(esper.ALLOWED_COMMANDS.has("UPDATE_HEARTBEAT"));
    assert.ok(esper.ALLOWED_COMMANDS.has("LOCK"));
    assert.ok(!esper.ALLOWED_COMMANDS.has("WIPE"));
    assert.ok(!esper.ALLOWED_COMMANDS.has("FACTORY_RESET"));
  });

  it("sendCommand rejects disallowed commands", async () => {
    await assert.rejects(
      () => esper.sendCommand("device-1", "WIPE"),
      (err) => {
        assert.equal(err.status, 403);
        assert.match(err.message, /not in the allowed list/);
        return true;
      }
    );
  });
});
