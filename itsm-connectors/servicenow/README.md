# Esper Device Panel — ServiceNow Connector

> Copyright (c) 2026 Esper.io — MIT License

A Service Portal Widget that displays live Esper device status inside ServiceNow Incident forms.

## What It Does

When an agent opens an Incident with a device serial number, the widget automatically:
- Resolves the serial to an Esper-managed device via the Outbound REST Message
- Displays live status, hardware info, OS version, blueprint name
- Provides buttons for Remote View, Event Feed, Reboot, and Ping

## Prerequisites

- ServiceNow (Madrid or later)
- Esper API key scoped to a support RBAC role
- Admin access to create REST Messages, System Properties, and Widgets

## Setup

### 1. Create System Properties

See [REST Message Setup Guide](rest-message/setup-guide.md#system-properties-create-first) — create `esper.tenant_name`, `esper.enterprise_id`, and `esper.api_key`.

### 2. Create Outbound REST Message

Follow the step-by-step instructions in the [REST Message Setup Guide](rest-message/setup-guide.md#rest-message-configuration).

### 3. Create the Widget

Navigate to **Service Portal → Widgets → New**:

| Field | Value |
|-------|-------|
| Name | `Esper Device Panel` |
| ID | `esper-device-panel` |

Then paste the contents of each file into the corresponding section:
- **Body HTML template** ← `widget/html.html`
- **Client controller** ← `widget/client.js`
- **Server script** ← `widget/server.js`

### 4. Add Custom Fields to Incident

Add `u_device_serial` (String, 50 chars) to the Incident table and form layout.

### 5. Add Widget to Incident Page

**Option A: Service Portal Designer**
1. Navigate to Service Portal → Designer
2. Select your Incident page
3. Drag the Esper Device Panel widget into the sidebar

**Option B: Agent Workspace**
1. Configure the Workspace layout for Incident
2. Add the widget as a configurable component in the sidebar region

**Option C: Standard UI (UI Formatter)**
1. Create a UI Formatter that renders the widget
2. Add it to the Incident form layout via Form Designer

### 6. Test

Open an Incident, enter a device serial in the Device Serial field, and the panel should populate.

## Files

```
servicenow/
├── widget/
│   ├── html.html              # Widget HTML template
│   ├── client.js              # Client-side controller (AngularJS)
│   └── server.js              # Server-side script (GlideHTTP/RESTMessageV2)
├── rest-message/
│   └── setup-guide.md         # Step-by-step REST Message configuration
└── README.md
```
