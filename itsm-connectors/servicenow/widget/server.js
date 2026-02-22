// Copyright (c) 2026 Esper.io — MIT License
// See LICENSE in the repository root.
//
// Esper Device Panel — ServiceNow Widget Server Script
// Widget Name: esper-device-panel
//
// ── Enterprise ID: where to put it ──────────────────────────────────────
//
// The best practice is to store your Enterprise ID (and tenant name and
// API key) in ServiceNow System Properties. This keeps secrets out of
// code, lets admins update values without an update set, and works
// across dev/test/prod instances.
//
// That said, you can hardcode the Enterprise ID directly in this script
// if you want. It's a UUID that essentially never changes for your
// tenant. The tradeoff: you lose the ability to change it without
// editing code, and promoting across instances means touching the script
// each time.
//
// Our advice: use System Properties. But if you're running a single
// instance and want to keep it simple, hardcoding the Enterprise ID
// (not the API key — never hardcode that) is a reasonable shortcut.
//
// ── System Properties used ──────────────────────────────────────────────
//
//   esper.tenant_name    — Tenant name (e.g., "acme")
//   esper.api_key        — API key (store encrypted via sys_properties)
//   esper.enterprise_id  — Enterprise UUID
//
// ── REST Message dependency ─────────────────────────────────────────────
//
// This script uses a ServiceNow Outbound REST Message named "Esper API"
// with HTTP Methods defined for each Esper endpoint. See the setup guide
// in /servicenow/rest-message/setup-guide.md for configuration steps.

(function () {
  var action = input.action || 'getDevice';

  // Tenant name for console deep links
  data.esper_tenant = gs.getProperty('esper.tenant_name', '');

  // ── Get Device ──────────────────────────────────────────────────

  if (action === 'getDevice') {
    // Read serial from the current incident record
    var serial = getSerialFromIncident();

    if (!serial) {
      // No serial on the incident — widget will show "no device" state
      return;
    }

    try {
      var r = new sn_ws.RESTMessageV2('Esper API', 'Device Search');
      r.setStringParameterNoEscape('serial', serial);

      var response = r.execute();
      var httpStatus = response.getStatusCode();
      var body = JSON.parse(response.getBody());

      if (httpStatus == 200 && body.results && body.results.length > 0) {
        data.device = body.results[0];

        // Enrich with blueprint name
        data.blueprintName = fetchBlueprintName(data.device);
      } else {
        data.error = 'No device found in Esper matching: ' + serial;
      }
    } catch (ex) {
      gs.error('Esper Device Panel: getDevice failed — ' + ex.message);
      data.error = 'Failed to reach Esper API: ' + ex.message;
    }
  }

  // ── Get Events ──────────────────────────────────────────────────

  if (action === 'getEvents') {
    var deviceId = input.deviceId;
    if (!deviceId) {
      data.error = 'No device ID provided for event lookup.';
      return;
    }

    try {
      var r = new sn_ws.RESTMessageV2('Esper API', 'Event Feed');
      r.setStringParameterNoEscape('enterprise_id',
        gs.getProperty('esper.enterprise_id', ''));
      r.setStringParameterNoEscape('device_id', deviceId);

      var response = r.execute();
      var body = JSON.parse(response.getBody());
      data.events = body.results || [];
    } catch (ex) {
      gs.error('Esper Device Panel: getEvents failed — ' + ex.message);
      data.events = [];
    }
  }

  // ── Send Command ────────────────────────────────────────────────

  if (action === 'sendCommand') {
    var deviceId = input.deviceId;
    var command = input.command;

    if (!deviceId || !command) {
      data.error = 'Device ID and command are required.';
      return;
    }

    // Command whitelist — defense in depth on top of Esper RBAC
    var allowed = ['REBOOT', 'UPDATE_HEARTBEAT', 'LOCK', 'UNLOCK'];
    command = command.toUpperCase();
    if (allowed.indexOf(command) === -1) {
      data.error = 'Command "' + command + '" is not permitted.';
      return;
    }

    try {
      var r = new sn_ws.RESTMessageV2('Esper API', 'Device Command');
      r.setStringParameterNoEscape('enterprise_id',
        gs.getProperty('esper.enterprise_id', ''));
      r.setStringParameterNoEscape('device_id', deviceId);
      r.setStringParameterNoEscape('command', command);

      var response = r.execute();
      data.commandResult = JSON.parse(response.getBody());

      // Audit log
      gs.info('Esper command sent: device=' + deviceId +
        ' command=' + command + ' by=' + gs.getUserName());
    } catch (ex) {
      gs.error('Esper Device Panel: sendCommand failed — ' + ex.message);
      data.error = 'Command failed: ' + ex.message;
    }
  }

  // ── Helper functions ────────────────────────────────────────────

  /**
   * Read the device serial from the current Incident record.
   * Looks for the custom field u_device_serial.
   */
  function getSerialFromIncident() {
    // input.sys_id comes from the widget's record context
    if (!input.sys_id) {
      // Try to get it from the URL parameter
      var pageId = $sp.getParameter('sys_id');
      if (!pageId) return '';
    }
    var sysId = input.sys_id || $sp.getParameter('sys_id');

    var gr = new GlideRecord('incident');
    if (gr.get(sysId)) {
      return gr.getValue('u_device_serial') || '';
    }
    return '';
  }

  /**
   * Fetch the blueprint name for a device. Returns '—' on failure.
   */
  function fetchBlueprintName(device) {
    try {
      var bpInfo = device.blueprint_info;
      if (!bpInfo || !bpInfo.assigned_blueprint_id) return '—';

      var r = new sn_ws.RESTMessageV2('Esper API', 'Blueprint Details');
      r.setStringParameterNoEscape('blueprint_id',
        bpInfo.assigned_blueprint_id);

      var response = r.execute();
      if (response.getStatusCode() == 200) {
        var bp = JSON.parse(response.getBody());
        return bp.name || '—';
      }
    } catch (ex) {
      gs.warn('Blueprint lookup failed: ' + ex.message);
    }
    return '—';
  }
})();
