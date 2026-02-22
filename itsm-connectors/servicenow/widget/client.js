// Copyright (c) 2026 Esper.io — MIT License
// See LICENSE in the repository root.
//
// Esper Device Panel — ServiceNow Widget Client Script
// Widget Name: esper-device-panel

api.controller = function ($scope, $window) {
  var c = this;

  // State
  c.device = null;
  c.loading = true;
  c.error = null;
  c.commanding = false;

  // Events panel
  c.showEvents = false;
  c.events = [];
  c.eventsLoading = false;

  // Computed display values
  c.deviceModel = '';
  c.blueprintName = '';
  c.lastSeen = '';

  // ── Initialization ──────────────────────────────────────────────

  c.$onInit = function () {
    c.server.get({ action: 'getDevice' }).then(function (response) {
      c.loading = false;

      if (response.data.error) {
        c.error = response.data.error;
        return;
      }

      if (response.data.device) {
        c.device = response.data.device;
        c.deviceModel = formatModel(c.device);
        c.blueprintName = response.data.blueprintName || '—';
        c.lastSeen = timeAgo(c.device.last_seen);
      }
    });
  };

  // ── Actions ─────────────────────────────────────────────────────

  c.remoteView = function () {
    if (c.device && c.data.esper_tenant) {
      var url = 'https://' + c.data.esper_tenant +
        '.esper.cloud/devices/' + c.device.id + '/';
      $window.open(url, '_blank');
    }
  };

  c.sendCommand = function (command) {
    if (!c.device || c.commanding) return;

    c.commanding = true;
    c.server.get({
      action: 'sendCommand',
      command: command,
      deviceId: c.device.id
    }).then(function (response) {
      c.commanding = false;
      if (response.data.error) {
        alert('Command failed: ' + response.data.error);
      } else {
        var label = command === 'UPDATE_HEARTBEAT' ? 'Ping' :
          command.charAt(0) + command.slice(1).toLowerCase();
        alert(label + ' sent to ' + (c.device.name || c.device.serial));
      }
    });
  };

  c.toggleEvents = function () {
    c.showEvents = !c.showEvents;
    if (c.showEvents && c.events.length === 0) {
      loadEvents();
    }
  };

  function loadEvents() {
    c.eventsLoading = true;
    c.server.get({
      action: 'getEvents',
      deviceId: c.device.id
    }).then(function (response) {
      c.eventsLoading = false;
      var raw = response.data.events || [];
      c.events = raw.map(function (evt) {
        evt.timeAgo = timeAgo(evt.timestamp || evt.created_on);
        return evt;
      });
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────

  function formatModel(device) {
    if (device.hardware_info) {
      return device.hardware_info.brand + ' ' + device.hardware_info.model;
    }
    return '—';
  }

  function timeAgo(isoString) {
    if (!isoString) return '—';
    var diff = Date.now() - new Date(isoString).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }
};
