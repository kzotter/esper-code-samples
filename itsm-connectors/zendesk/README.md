# Esper Device Manager — Zendesk Connector

> Copyright (c) 2026 Esper.io — MIT License

A Zendesk Apps Framework (ZAF) sidebar app that displays live Esper device status inside your support tickets.

## Status
This project is a reference implementation and community sample, not an officially supported Esper product or managed integration.

It is intended to demonstrate architectural patterns for integrating Esper’s Cloud APIs with ITSM platforms such as Zendesk, Salesforce, and ServiceNow. The code is designed for experimentation, extension, and adaptation within your own infrastructure.

## What It Does

When an agent opens a ticket with a device serial number, the sidebar automatically:
- Resolves the serial to an Esper-managed device
- Shows live status (online/offline), hardware info, OS version, blueprint
- Provides one-click access to Remote Viewer, event history, and device commands

## Prerequisites

- Esper ITSM Middleware running (see `/middleware`)
- Zendesk Support (Team plan or higher)
- A custom ticket field for device serial numbers
- [ZCLI](https://developer.zendesk.com/documentation/apps/getting-started/using-zcli/) installed (for packaging)

## Setup

### 1. Add Custom Ticket Field

In Zendesk Admin → Ticket Fields → Add Field:
- **Type:** Text
- **Title:** Device Serial
- **Field key:** `device_serial`

### 2. Package the App

```bash
cd zendesk
npx @zendesk/zcli apps:package
```

### 3. Upload to Zendesk

Admin Center → Apps and Integrations → Apps → Upload private app → select the `.zip` from `./tmp/`

### 4. Configure

Enter in the app settings:
- **Middleware URL** — e.g., `https://esper-connector.yourco.com`
- **Esper Tenant Name** — e.g., `acme`
- **Custom Field Name** — `device_serial` (or your custom name)

### 5. Test

Open any ticket, enter a device serial in the Device Serial field, and the sidebar should populate with device info.

## Files

```
zendesk/
├── manifest.json              # ZAF app manifest
├── assets/
│   ├── sidebar.html           # Sidebar UI
│   ├── sidebar.js             # Client-side logic
│   └── sidebar.css            # Styles
└── translations/
    └── en.json                # App description and install instructions
```
