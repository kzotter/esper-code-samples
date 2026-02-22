# Esper ITSM Connector Reference Architecture

> Copyright (c) 2026 Esper.io — MIT License

## Zendesk · Salesforce · ServiceNow

### Bridging Device Fleet Management and Your Service Desk

---

## The Problem Every Fleet Operator Knows

You manage a fleet of dedicated devices — kiosks, point-of-sale terminals, digital signage, ruggedized handhelds, tablets bolted to warehouse carts. When something goes wrong in the field, the support workflow splits in two: your service desk lives in one tool, your device management lives in another. The agent handling the ticket has to context-switch to Esper, hunt for the device, check its status, maybe start a remote session — all while the ticket sits waiting.

This document lays out a reference architecture for connecting Esper's Cloud APIs directly into the three most common ITSM platforms: Zendesk, Salesforce Service Cloud, and ServiceNow. The goal is simple: when a support agent opens a ticket about a device, the device's live status, health, and remote access controls should already be *right there* — no tab switching, no hunting.

We built this architecture against Esper's production Cloud APIs. Every endpoint referenced here is real and available on your tenant today. The patterns are designed to work whether you run the connector yourself or whether Esper provides it as a managed service down the road.

---

## Architecture Overview

The architecture is the same across all three platforms. The ITSM frontend is different, the Esper backend is identical.

```
┌─────────────────────────────────────────────────────────────────┐
│                     ITSM PLATFORM                               │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │    Ticket / Case /   │  │   Esper Device Panel              │ │
│  │    Incident View     │  │                                   │ │
│  │                      │  │  ┌──────────────────────────────┐ │ │
│  │  "Kiosk frozen at    │  │  │ Device: ACME-KSK-247         │ │ │
│  │   Store #247"        │  │  │ Status: 🟢 Online             │ │ │
│  │                      │  │  │ Battery: 87%                  │ │ │
│  │  Device Field:       │──│──│ OS: Android 14 (Samsung)      │ │ │
│  │  [Serial: RZCW80..]  │  │  │ Blueprint: Retail-Kiosk-v3   │ │ │
│  │                      │  │  │ Last Seen: 2 min ago          │ │ │
│  │                      │  │  │                               │ │ │
│  │                      │  │  │ [🔍 Remote View]              │ │ │
│  │                      │  │  │ [📋 Event Feed]               │ │ │
│  │                      │  │  │ [🔄 Reboot]  [📌 Ping]       │ │ │
│  │                      │  │  └──────────────────────────────┘ │ │
│  └──────────────────────┘  └──────────────┬───────────────────┘ │
│                                           │                      │
└───────────────────────────────────────────┼──────────────────────┘
                                            │
                              Authenticated API calls
                                            │
                    ┌───────────────────────▼───────────────────────┐
                    │          MIDDLEWARE / CONNECTOR SERVICE        │
                    │                                               │
                    │  Auth ──► Device Resolution ──► API Adapter   │
                    │                                               │
                    │  • Maps serial/name/tag → Esper device UUID   │
                    │  • Holds Esper API key server-side            │
                    │  • Enforces action guardrails                 │
                    │  • Logs ticket ID alongside device actions    │
                    │                                               │
                    └───────────────────────┬───────────────────────┘
                                            │
                              Bearer Token (RBAC-scoped)
                                            │
                    ┌───────────────────────▼───────────────────────┐
                    │              ESPER CLOUD APIs                  │
                    │                                               │
                    │  GET  /api/v2/devices/?search=<serial>        │
                    │  GET  /api/v2/devices/<id>/                   │
                    │  GET  /api/v2/blueprints/<id>/                │
                    │  GET  /api/enterprise/<eid>/device/<id>/      │
                    │       event-feed/                             │
                    │  POST /api/enterprise/<eid>/device/<id>/      │
                    │       command/  (reboot, ping, lock)          │
                    │                                               │
                    │  Console Deep Link for Remote Viewer:         │
                    │  https://<tenant>.esper.cloud/devices/<id>/   │
                    └───────────────────────────────────────────────┘
```

### Why Middleware?

You might look at this and wonder why not call Esper's API directly from the ITSM platform. Three reasons:

**Token isolation.** The Esper API key never touches the agent's browser. The middleware holds it server-side and only exposes the endpoints the ITSM integration needs.

**Device resolution.** Tickets reference devices by serial number, asset tag, name, or alias. The middleware normalizes all of these into an Esper device UUID with a single search call, then enriches the response with blueprint and group context.

**Action guardrails.** The middleware enforces which commands are available based on the ITSM agent's role — layered on top of Esper's own RBAC. A Tier 1 agent might see "Ping" and "Reboot" but not "Factory Reset."

### Middleware Endpoints

| Endpoint | Method | Esper API Called | Purpose |
|----------|--------|------------------|---------|
| `/device/resolve` | GET | `GET /api/v2/devices/?search=<query>` | Find device by serial, name, or alias |
| `/device/:id/status` | GET | `GET /api/v2/devices/<id>/` | Device health snapshot |
| `/device/:id/blueprint` | GET | `GET /api/v2/blueprints/<id>/` | Current blueprint info |
| `/device/:id/events` | GET | `GET /api/enterprise/<eid>/device/<id>/event-feed/` | Recent event feed |
| `/device/:id/command` | POST | `POST /api/enterprise/<eid>/device/<id>/command/` | Issue command (reboot, ping, lock) |
| `/device/:id/remote-link` | GET | *Constructs URL* | Deep link to Esper console remote viewer |

---

## Esper Cloud API Reference (Used by All Three Connectors)

Every endpoint below is confirmed against a production Esper tenant. The middleware calls these; the ITSM frontend never touches them directly.

### Device Search & Details (v2)

```bash
# Search by serial number, device name, or alias
GET https://{tenant}-api.esper.cloud/api/v2/devices/?search=RZCW80EFNDB&limit=10
Authorization: Bearer {API_KEY}
```

Response fields your sidebar card needs:

```json
{
  "id": "a0430bca-db69-4d9f-914d-974faeb6a4fd",
  "name": "ACME-KSK-247",
  "state": 1,
  "platform": "ANDROID",
  "os_version": "14",
  "serial": "RZCW80EFNDB",
  "last_seen": "2026-02-14T20:20:51.895213Z",
  "managed_by": "BLUEPRINT",
  "hardware_info": {
    "brand": "samsung",
    "model": "SM-M146B",
    "manufacturer": "samsung"
  },
  "network_info": {
    "wifi_mac_address": "bc:f7:30:92:ea:2a",
    "imei1": "357718895129084"
  },
  "memory_info": {
    "total_internal_storage": "137438",
    "total_ram": "5472"
  },
  "blueprint_info": {
    "assigned_blueprint_id": "a58bf47b-...",
    "current_blueprint_id": "a58bf47b-...",
    "current_blueprint_version_id": "39b390d1-..."
  },
  "dpc_version": "v9.3.2803"
}
```

### Single Device Details (v2)

```bash
GET https://{tenant}-api.esper.cloud/api/v2/devices/{device_id}/
Authorization: Bearer {API_KEY}
```

### Event Feed (v1 — enterprise-scoped)

```bash
GET https://{tenant}-api.esper.cloud/api/enterprise/{enterprise_id}/device/{device_id}/event-feed/?limit=20
Authorization: Bearer {API_KEY}
```

### Device Commands (v1 — enterprise-scoped)

```bash
POST https://{tenant}-api.esper.cloud/api/enterprise/{enterprise_id}/device/{device_id}/command/
Authorization: Bearer {API_KEY}
Content-Type: application/json

# Reboot
{ "command_type": "DEVICE", "command": "REBOOT" }

# Ping / heartbeat
{ "command_type": "DEVICE", "command": "UPDATE_HEARTBEAT" }

# Lock screen
{ "command_type": "DEVICE", "command": "LOCK" }
```

### Blueprint Details (v2)

```bash
GET https://{tenant}-api.esper.cloud/api/v2/blueprints/{blueprint_id}/
Authorization: Bearer {API_KEY}
```

### Device Groups (v1 — enterprise-scoped)

```bash
GET https://{tenant}-api.esper.cloud/api/enterprise/{enterprise_id}/devicegroup/{group_id}/
Authorization: Bearer {API_KEY}
```

### Console Deep Link (Remote Viewer)

```
https://{tenant}.esper.cloud/devices/{device_id}/
```

This link drops the agent directly onto the device page in the Esper console. Authentication is handled by the agent's existing SSO session — Esper's full auth model (MFA, session management, audit trail) protects the remote session. No separate token exchange required.

---

## RBAC: The "Support Agent" Role

This is the security cornerstone of the entire integration. Rather than giving every support agent full console access, you create a tightly scoped RBAC role in Esper that limits what the connector can do — even if the API key were compromised.

**RBAC endpoints** (these are NOT enterprise-scoped — do not use `/api/enterprise/{eid}/role/`):

```bash
GET  /api/authz2/v1/roles/                    # List all roles
GET  /api/authz2/v1/roles/{role_id}/scopes    # View role permissions
PUT  /api/authz2/v1/roles/{role_id}/scopes    # Update role permissions
```

### Recommended Permission Matrix

| Permission | Tier 1 Support | Tier 2 Support | Fleet Admin |
|------------|:-:|:-:|:-:|
| View device list (scoped to groups) | ✅ | ✅ | ✅ |
| View device details & status | ✅ | ✅ | ✅ |
| View event feed | ✅ | ✅ | ✅ |
| Remote Viewer (view-only) | ✅ | ✅ | ✅ |
| Remote Control (interactive) | ❌ | ✅ | ✅ |
| Ping device | ✅ | ✅ | ✅ |
| Reboot device | ❌ | ✅ | ✅ |
| Lock screen | ✅ | ✅ | ✅ |
| Factory reset | ❌ | ❌ | ✅ |
| Modify blueprint | ❌ | ❌ | ✅ |
| Install / remove apps | ❌ | ❌ | ✅ |
| Wipe device | ❌ | ❌ | ✅ |

Generate a separate API key for each tier. The middleware checks which key to use based on the ITSM agent's role, or you run separate middleware instances per tier.

---

---

## Enterprise ID: Where to Store It

Every ITSM connector needs your Esper Enterprise ID for the v1 API endpoints (event feed, commands, groups). The question is where to put it. Here's the tradeoff.

### The best practice: externalize it

| Platform | Mechanism | Why |
|----------|-----------|-----|
| Middleware | Environment variable (`ESPER_ENTERPRISE_ID` in `.env`) | Standard 12-factor config. Change it without rebuilding. |
| Salesforce | Custom Metadata (`Esper_Config__mdt`) | Travels with change sets, editable in Setup, no code deploy. |
| ServiceNow | System Property (`esper.enterprise_id`) | Admin-editable, works across dev/test/prod instances. |

Externalizing means: an admin can update it without a developer, it works across multiple orgs/instances, and it follows each platform's native configuration pattern.

### The shortcut: hardcode it

The Enterprise ID is a UUID that essentially never changes for your tenant. You could drop it as a string constant in your Apex class, your ServiceNow server script, or your middleware config file. It will work. The device fleet won't care.

The tradeoff is portability and maintainability. Hardcoding means:
- Every org/instance you deploy to needs a code change
- An admin can't update it without involving a developer
- You lose the idiomatic configuration pattern for the platform

### Our advice

Use the externalized approach. It takes five extra minutes to set up, and it's the pattern your platform team already expects. But if you're running a single instance and want to ship fast — hardcoding the Enterprise ID (not the API key — never hardcode secrets) is a reasonable shortcut. Just know what you're trading away.

---

## Connector 1: Zendesk

### How It Works

Zendesk's Apps Framework (ZAF) lets you embed an iframe app in the ticket sidebar. The app reads a custom field from the ticket (device serial number), calls the middleware to resolve it to an Esper device, and renders a device status card with action buttons.

### ZAF Sidebar App

**Manifest (`manifest.json`):**

```json
{
  "name": "Esper Device Manager",
  "author": { "name": "Your Org" },
  "version": "1.0.0",
  "frameworkVersion": "2.0",
  "location": {
    "support": {
      "ticket_sidebar": {
        "url": "assets/sidebar.html",
        "flexible": true
      }
    }
  },
  "parameters": [
    {
      "name": "esper_tenant",
      "type": "text",
      "required": true,
      "label": "Esper Tenant Name (e.g., 'acme' from acme.esper.cloud)"
    },
    {
      "name": "esper_api_key",
      "type": "text",
      "required": true,
      "secure": true,
      "label": "Esper API Key (RBAC-scoped for support role)"
    },
    {
      "name": "middleware_url",
      "type": "text",
      "required": true,
      "label": "Middleware Base URL (e.g., https://esper-connector.yourco.com)"
    }
  ]
}
```

**Key detail:** The `"secure": true` parameter means the API key is never exposed in the browser. ZAF's proxy server inserts the value server-side when making `client.request()` calls.

### Agent Workflow

```
1. Agent opens Zendesk ticket #4821
   └─► ZAF sidebar app loads in iframe

2. App reads custom ticket field
   └─► client.get('ticket.customField:device_serial')
   └─► Returns: "RZCW80EFNDB"

3. App calls middleware
   └─► GET {middleware}/device/resolve?serial=RZCW80EFNDB
   └─► Middleware calls Esper: GET /api/v2/devices/?search=RZCW80EFNDB
   └─► Returns device UUID + status + hardware info

4. Sidebar renders device card
   ┌──────────────────────────────┐
   │ 📱 ACME-KSK-247              │
   │ Serial: RZCW80EFNDB          │
   │ Status: 🟢 Online             │
   │ Model: Samsung SM-M146B      │
   │ OS: Android 14               │
   │ Battery: 87% · RAM: 5.3 GB   │
   │ Blueprint: Retail-Kiosk-v3   │
   │ Last Seen: 2 min ago         │
   │ Group: Stores / West / #247  │
   │                              │
   │ [🔍 Remote View]  [📋 Events]│
   │ [🔄 Reboot]  [📌 Ping]      │
   └──────────────────────────────┘

5. Agent clicks "Remote View"
   └─► Opens: https://acme.esper.cloud/devices/a0430bca-.../
   └─► Agent's SSO session handles auth
   └─► Agent sees live device screen in < 10 seconds
```

### ZAF API Calls Used

| ZAF Method | Purpose |
|------------|---------|
| `client.get('ticket.customField:device_serial')` | Read device identifier from ticket |
| `client.request({ url: middleware_url, ... })` | Proxied API call to middleware (hides secrets) |
| `client.invoke('notify', 'success', 'Device rebooted')` | Show success/error banner to agent |
| `client.set('ticket.customField:esper_device_id', uuid)` | Write resolved device UUID back to ticket |

### Zendesk Custom Fields

| Field Name | Type | Purpose |
|-----------|------|---------|
| `device_serial` | Text | Device serial number — primary lookup key |
| `device_name` | Text | Esper device name (e.g., ACME-KSK-247) |
| `device_group` | Text | Store / location / fleet group |
| `esper_device_id` | Text | Esper UUID — auto-populated after resolution |

### Setup Time

Packaging a ZAF app and uploading it as a private app takes about 10 minutes via `zcli`. The middleware is a Node.js/Express or Python/FastAPI service (~800 lines) that deploys with a single Docker container.

---

## Connector 2: Salesforce Service Cloud

### How It Works

Salesforce uses Lightning Web Components (LWC) to add custom UI to record pages. You build an LWC that sits in the Case record page sidebar, reads the device serial from a custom Case field, and calls an Apex controller that talks to the middleware (or directly to Esper's API via a Named Credential).

### Integration Pattern

Salesforce has a specific security model: Lightning sessions are not API-enabled, so you cannot make external callouts directly from LWC JavaScript. Instead, you use this chain:

```
LWC Component (UI)
    ↓ calls @AuraEnabled Apex method
Apex Controller
    ↓ uses Named Credential for auth
    ↓ HttpRequest to callout:Esper_API/...
Esper Cloud API (or Middleware)
    ↓ returns device data
Apex Controller
    ↓ returns structured response
LWC Component
    ↓ renders device card
```

### Named Credential Setup

Named Credentials store the Esper API endpoint and Bearer token securely in Salesforce — no credentials in code.

```
Setup → Named Credentials → New

Label:                Esper_API
Name:                 Esper_API
URL:                  https://{tenant}-api.esper.cloud
Identity Type:        Named Principal
Authentication:       Custom Header
Header Name:          Authorization
Header Value:         Bearer {your_esper_api_key}
Generate Auth Header: unchecked (we're providing our own)
```

If you're using the middleware layer instead of calling Esper directly, point the Named Credential at the middleware URL instead.

### Apex Controller

```java
public with sharing class EsperDeviceController {

    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getDeviceBySerial(String serialNumber) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:Esper_API/api/v2/devices/?search='
            + EncodingUtil.urlEncode(serialNumber, 'UTF-8') + '&limit=5');
        req.setMethod('GET');

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200) {
            Map<String, Object> body = (Map<String, Object>)
                JSON.deserializeUntyped(res.getBody());
            List<Object> results = (List<Object>) body.get('results');
            if (!results.isEmpty()) {
                return (Map<String, Object>) results[0];
            }
        }
        return null;
    }

    @AuraEnabled
    public static Map<String, Object> getDeviceEvents(String deviceId) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:Esper_API/api/enterprise/'
            + getEnterpriseId() + '/device/' + deviceId + '/event-feed/?limit=20');
        req.setMethod('GET');

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200) {
            return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        }
        return null;
    }

    @AuraEnabled
    public static Map<String, Object> sendDeviceCommand(String deviceId, String command) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:Esper_API/api/enterprise/'
            + getEnterpriseId() + '/device/' + deviceId + '/command/');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setBody('{"command_type":"DEVICE","command":"' + command + '"}');

        Http http = new Http();
        HttpResponse res = http.send(req);

        return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    }

    private static String getEnterpriseId() {
        // Store this in Custom Metadata or Custom Setting
        return Esper_Config__mdt.getInstance('Default').Enterprise_Id__c;
    }
}
```

### Lightning Web Component

```html
<!-- esperDevicePanel.html -->
<template>
    <lightning-card title="Esper Device" icon-name="custom:custom85">
        <template if:true={device}>
            <div class="slds-p-horizontal_medium">
                <p class="slds-text-heading_small">{device.name}</p>
                <dl class="slds-dl_horizontal slds-m-top_small">
                    <dt>Serial</dt>    <dd>{device.serial}</dd>
                    <dt>Status</dt>    <dd>{statusLabel}</dd>
                    <dt>Model</dt>     <dd>{deviceModel}</dd>
                    <dt>OS</dt>        <dd>Android {device.os_version}</dd>
                    <dt>Last Seen</dt> <dd>{lastSeenFormatted}</dd>
                    <dt>Agent</dt>     <dd>{device.dpc_version}</dd>
                </dl>

                <div class="slds-m-top_medium slds-button-group">
                    <lightning-button label="Remote View"
                        onclick={handleRemoteView}
                        variant="brand" icon-name="utility:preview">
                    </lightning-button>
                    <lightning-button label="Reboot"
                        onclick={handleReboot}
                        variant="neutral" icon-name="utility:refresh">
                    </lightning-button>
                    <lightning-button label="Ping"
                        onclick={handlePing}
                        variant="neutral" icon-name="utility:connected_apps">
                    </lightning-button>
                </div>
            </div>
        </template>
        <template if:false={device}>
            <div class="slds-p-around_medium">
                <template if:true={loading}>
                    <lightning-spinner size="small"></lightning-spinner>
                </template>
                <template if:false={loading}>
                    <p>No device linked to this case.</p>
                </template>
            </div>
        </template>
    </lightning-card>
</template>
```

```javascript
// esperDevicePanel.js
import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import getDeviceBySerial from '@salesforce/apex/EsperDeviceController.getDeviceBySerial';
import sendDeviceCommand from '@salesforce/apex/EsperDeviceController.sendDeviceCommand';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import SERIAL_FIELD from '@salesforce/schema/Case.Device_Serial__c';

export default class EsperDevicePanel extends LightningElement {
    @api recordId;
    device;
    loading = true;

    @wire(getRecord, { recordId: '$recordId', fields: [SERIAL_FIELD] })
    wiredCase({ data }) {
        if (data) {
            const serial = getFieldValue(data, SERIAL_FIELD);
            if (serial) {
                this.loadDevice(serial);
            } else {
                this.loading = false;
            }
        }
    }

    async loadDevice(serial) {
        try {
            this.device = await getDeviceBySerial({ serialNumber: serial });
        } catch (e) {
            console.error('Esper lookup failed:', e);
        } finally {
            this.loading = false;
        }
    }

    handleRemoteView() {
        // Opens Esper console — agent's SSO session handles auth
        const url = `https://${this.esperTenant}.esper.cloud/devices/${this.device.id}/`;
        window.open(url, '_blank');
    }

    async handleReboot() {
        const result = await sendDeviceCommand({
            deviceId: this.device.id, command: 'REBOOT'
        });
        this.dispatchEvent(new ShowToastEvent({
            title: 'Reboot issued',
            message: `Command sent to ${this.device.name}`,
            variant: 'success'
        }));
    }

    async handlePing() {
        await sendDeviceCommand({
            deviceId: this.device.id, command: 'UPDATE_HEARTBEAT'
        });
        this.dispatchEvent(new ShowToastEvent({
            title: 'Ping sent',
            message: `Heartbeat requested for ${this.device.name}`,
            variant: 'success'
        }));
    }

    get statusLabel() {
        return this.device?.state === 1 ? '🟢 Online' : '🔴 Offline';
    }

    get deviceModel() {
        const hw = this.device?.hardware_info;
        return hw ? `${hw.brand} ${hw.model}` : 'Unknown';
    }

    get lastSeenFormatted() {
        return this.device?.last_seen
            ? new Date(this.device.last_seen).toLocaleString()
            : 'Unknown';
    }
}
```

### Deployment to Case Record Page

```xml
<!-- esperDevicePanel.js-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>59.0</apiVersion>
    <isExposed>true</isExposed>
    <targets>
        <target>lightning__RecordPage</target>
    </targets>
    <targetConfigs>
        <targetConfig targets="lightning__RecordPage">
            <objects>
                <object>Case</object>
            </objects>
        </targetConfig>
    </targetConfigs>
</LightningComponentBundle>
```

After deploying the LWC, add it to your Case record page:

1. Open any Case record → click the gear icon → **Edit Page**
2. In Lightning App Builder, drag the **Esper Device Panel** component into the right sidebar
3. **Save** → **Activate** → assign to your Service Console app

### Salesforce Custom Fields on Case

| Field | API Name | Type | Purpose |
|-------|----------|------|---------|
| Device Serial | `Device_Serial__c` | Text(50) | Primary device lookup key |
| Device Name | `Device_Name__c` | Text(100) | Esper device name |
| Esper Device ID | `Esper_Device_Id__c` | Text(40) | UUID — auto-populated by LWC |
| Device Group | `Device_Group__c` | Text(200) | Fleet / location group path |

### Setup Time

Named Credential setup: ~10 minutes. LWC + Apex deployment via `sfdx`: ~20 minutes. Lightning App Builder drag-and-drop: ~5 minutes. Total: under an hour for a working integration.

---

## Connector 3: ServiceNow

### How It Works

ServiceNow uses Service Portal Widgets (AngularJS-based) or UI Formatter / UI Macro components that embed into Incident or Case forms. The pattern uses a server-side GlideHTTP or `RESTMessageV2` call to reach the middleware (or Esper directly via an Outbound REST Message), then renders results in a widget on the Incident form.

### Integration Pattern

```
ServiceNow Incident Form
    ↓ UI Formatter loads widget
Service Portal Widget (or Workspace UI Component)
    ↓ client script calls server()
Server Script (GlideHTTP / RESTMessageV2)
    ↓ calls Outbound REST Message "Esper API"
Esper Cloud API (or Middleware)
    ↓ returns device data
Server Script
    ↓ puts data on data object
Client Script
    ↓ renders device panel in HTML template
```

### Outbound REST Message Setup

```
System Web Services → Outbound → REST Message → New

Name:                 Esper API
Endpoint:             https://{tenant}-api.esper.cloud
Authentication:       No authentication (we'll add Bearer header)

HTTP Methods (create these):

GET - Device Search
  Endpoint: /api/v2/devices/?search=${serial}&limit=5
  HTTP Headers:
    Authorization: Bearer {api_key}  (use sys_properties for the key)
    Content-Type: application/json

GET - Device Details
  Endpoint: /api/v2/devices/${device_id}/
  HTTP Headers:
    Authorization: Bearer {api_key}

GET - Event Feed
  Endpoint: /api/enterprise/${enterprise_id}/device/${device_id}/event-feed/?limit=20
  HTTP Headers:
    Authorization: Bearer {api_key}

POST - Device Command
  Endpoint: /api/enterprise/${enterprise_id}/device/${device_id}/command/
  HTTP Headers:
    Authorization: Bearer {api_key}
    Content-Type: application/json
  Content: {"command_type":"DEVICE","command":"${command}"}
```

Store the API key in a System Property (`esper.api_key`) rather than hardcoding it in the REST Message.

### Service Portal Widget

**HTML Template:**

```html
<div class="panel panel-default" ng-if="c.device">
  <div class="panel-heading">
    <h4 class="panel-title">
      <i class="fa fa-tablet"></i> Esper Device: {{c.device.name}}
    </h4>
  </div>
  <div class="panel-body">
    <div class="row">
      <div class="col-sm-6">
        <dl class="dl-horizontal">
          <dt>Serial</dt>       <dd>{{c.device.serial}}</dd>
          <dt>Status</dt>       <dd>
            <span class="label" ng-class="c.device.state == 1 ?
              'label-success' : 'label-danger'">
              {{c.device.state == 1 ? 'Online' : 'Offline'}}
            </span>
          </dd>
          <dt>Model</dt>        <dd>{{c.device.hardware_info.brand}}
                                    {{c.device.hardware_info.model}}</dd>
          <dt>OS</dt>           <dd>Android {{c.device.os_version}}</dd>
          <dt>Last Seen</dt>    <dd>{{c.lastSeen}}</dd>
          <dt>Agent</dt>        <dd>{{c.device.dpc_version}}</dd>
        </dl>
      </div>
    </div>

    <div class="btn-group" role="group">
      <button class="btn btn-primary btn-sm" ng-click="c.remoteView()">
        <i class="fa fa-eye"></i> Remote View
      </button>
      <button class="btn btn-default btn-sm" ng-click="c.rebootDevice()">
        <i class="fa fa-refresh"></i> Reboot
      </button>
      <button class="btn btn-default btn-sm" ng-click="c.pingDevice()">
        <i class="fa fa-exchange"></i> Ping
      </button>
    </div>
  </div>
</div>

<div class="alert alert-info" ng-if="c.loading">
  <i class="fa fa-spinner fa-spin"></i> Loading device data from Esper...
</div>

<div class="alert alert-warning" ng-if="!c.device && !c.loading">
  No device serial number found on this incident.
</div>
```

**Client Script:**

```javascript
api.controller = function($scope, $window) {
  var c = this;
  c.loading = true;
  c.device = null;

  // Load device on widget init
  c.$onInit = function() {
    c.server.get({ action: 'getDevice' }).then(function(response) {
      c.device = response.data.device;
      c.lastSeen = c.device ?
        new Date(c.device.last_seen).toLocaleString() : '';
      c.loading = false;
    });
  };

  c.remoteView = function() {
    var tenant = c.data.esper_tenant;
    var url = 'https://' + tenant + '.esper.cloud/devices/' + c.device.id + '/';
    $window.open(url, '_blank');
  };

  c.rebootDevice = function() {
    c.server.get({ action: 'sendCommand', command: 'REBOOT',
                   deviceId: c.device.id }).then(function() {
      alert('Reboot command sent to ' + c.device.name);
    });
  };

  c.pingDevice = function() {
    c.server.get({ action: 'sendCommand', command: 'UPDATE_HEARTBEAT',
                   deviceId: c.device.id }).then(function() {
      alert('Ping sent to ' + c.device.name);
    });
  };
};
```

**Server Script:**

```javascript
(function() {
  var action = input.action || 'getDevice';
  data.esper_tenant = gs.getProperty('esper.tenant_name');

  if (action === 'getDevice') {
    // Read the serial from the current incident
    var serial = '';
    if (input.sys_id) {
      var inc = new GlideRecord('incident');
      if (inc.get(input.sys_id)) {
        serial = inc.getValue('u_device_serial');
      }
    }

    if (serial) {
      try {
        var r = new sn_ws.RESTMessageV2('Esper API', 'Device Search');
        r.setStringParameterNoEscape('serial', serial);
        var response = r.execute();
        var body = JSON.parse(response.getBody());

        if (body.results && body.results.length > 0) {
          data.device = body.results[0];
        }
      } catch(ex) {
        gs.error('Esper API error: ' + ex.message);
      }
    }
  }

  if (action === 'sendCommand') {
    try {
      var r = new sn_ws.RESTMessageV2('Esper API', 'Device Command');
      r.setStringParameterNoEscape('enterprise_id',
        gs.getProperty('esper.enterprise_id'));
      r.setStringParameterNoEscape('device_id', input.deviceId);
      r.setStringParameterNoEscape('command', input.command);
      var response = r.execute();
      data.commandResult = JSON.parse(response.getBody());
    } catch(ex) {
      gs.error('Esper command error: ' + ex.message);
    }
  }
})();
```

### Embedding in the Incident Form

**Option A: Service Portal (for CSM / ITSM portal)**
Add the widget to the Incident page layout via the Service Portal Designer. Drag it into the sidebar region.

**Option B: Agent Workspace / Standard UI**
Create a **UI Formatter** that renders the widget, then add it to the Incident form layout via Form Designer. Alternatively, use a **Workspace UI Component** in the Agent Workspace configurable layout.

**Option C: iFrame Embed (simplest)**
If you're running the middleware with its own UI, embed it as an iFrame in the Incident form using a UI Macro. Pass the serial number as a URL parameter.

### ServiceNow Custom Fields on Incident

| Field | Column Name | Type | Purpose |
|-------|-------------|------|---------|
| Device Serial | `u_device_serial` | String(50) | Primary device lookup key |
| Device Name | `u_device_name` | String(100) | Esper device name |
| Esper Device ID | `u_esper_device_id` | String(40) | UUID from Esper |
| Device Group | `u_device_group` | String(200) | Fleet / location path |

### ServiceNow System Properties

| Property | Example Value | Purpose |
|----------|---------------|---------|
| `esper.tenant_name` | `acme` | Tenant name for console deep links |
| `esper.api_key` | `Bearer eyJ...` | API key (stored encrypted) |
| `esper.enterprise_id` | `f44373cb-1800-...` | Enterprise UUID for v1 endpoints |

### Setup Time

Outbound REST Message: ~15 minutes. Widget creation: ~30 minutes. Form layout: ~10 minutes. Total: about an hour.

---

## Security Model

The security posture is identical across all three connectors:

**1. API Key Isolation**
The Esper API key is stored in the ITSM platform's secure credential store (ZAF secure settings / Salesforce Named Credential / ServiceNow System Property) and never reaches the agent's browser.

**2. RBAC Scoping**
The API key is generated for a role with minimal permissions. Even if compromised, it can only read device status and issue non-destructive commands per the permission matrix above.

**3. Console Deep Links + SSO**
Remote viewer links open the Esper console directly. The agent authenticates via their existing SSO session. Esper's full auth model — MFA, session management, audit trail — governs the remote session.

**4. Group Scoping**
RBAC roles in Esper can be scoped to device groups. A support team for "Region West" only sees devices in their assigned groups. This scoping carries through to the connector automatically.

**5. Audit Correlation**
The middleware logs the ITSM ticket ID alongside every Esper API call. This means you can trace a device command (e.g., reboot) back to the specific support ticket that triggered it.

---

## Deployment Models

### Self-Hosted (Reference Implementation)

```
┌──────────────┐     ┌──────────────────┐     ┌──────────┐
│   ITSM       │────▶│  You run the     │────▶│  Esper   │
│   Platform   │     │  middleware on    │     │  Cloud   │
│              │     │  your infra       │     │  APIs    │
└──────────────┘     └──────────────────┘     └──────────┘
```

**What ships on GitHub:**
- ITSM frontend code (ZAF app / LWC + Apex / ServiceNow widget)
- Middleware service (Node.js or Python, ~800 lines)
- Dockerfile + docker-compose.yml
- Helm chart for Kubernetes deployment
- Example RBAC role configuration
- Setup guide with screenshots

**You own:** hosting, API key rotation, uptime, monitoring.

### Managed Connector (Esper-Hosted, Future)

```
┌──────────────┐     ┌──────────────────────────────────┐
│   ITSM       │────▶│  Esper Connector Service          │
│   Platform   │     │  (multi-tenant, Esper security)   │
│              │     │                                    │
│              │     │  • Tenant isolation                │
│              │     │  • Automated key rotation          │
│              │     │  • Audit logging                   │
│              │     │  • Rate limiting & SLA             │
│              │     │                                    │
└──────────────┘     └──────────────────────────────────┘
```

**You do:** install the ITSM-side component, enter your tenant name, done.

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/esper-io/itsm-connectors.git

# 2. Choose your platform
cd itsm-connectors/zendesk     # or /salesforce or /servicenow

# 3. Configure
cp .env.example .env
# Set: ESPER_TENANT, ESPER_API_KEY, ESPER_ENTERPRISE_ID

# 4. Run the middleware
docker-compose up -d

# 5. Deploy the ITSM-side component
#    (see platform-specific README)

# 6. Open a ticket, attach a device serial, watch it light up
```

---

## Questions? Feedback?

This is a reference implementation — it's designed to prove the pattern works and give you a running start. If you build on this, we want to hear about it. Open an issue, submit a PR, or reach out to us directly.

The pattern is extensible. The same middleware supports any ITSM platform that can make an HTTP call and render the response. If you're running something other than these three, the Esper API layer doesn't change — just build a new frontend.

*Built against the Esper Cloud API. Every endpoint referenced here is production-ready and available on your tenant today.*

*Copyright (c) 2026 Esper.io — MIT License*
