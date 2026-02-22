# Esper Device Panel — Salesforce Connector

> Copyright (c) 2026 Esper.io — MIT License

A Lightning Web Component that displays live Esper device status in the Case record page sidebar.

## Status
This project is a reference implementation and community sample, not an officially supported Esper product or managed integration.

It is intended to demonstrate architectural patterns for integrating Esper’s Cloud APIs with ITSM platforms such as Zendesk, Salesforce, and ServiceNow. The code is designed for experimentation, extension, and adaptation within your own infrastructure.

## What It Does

When a support agent opens a Case with a device serial number, the component automatically:
- Resolves the serial to an Esper-managed device via the Apex controller
- Displays live status, hardware info, OS version, blueprint name
- Provides buttons for Remote View, Reboot, and Ping

## Prerequisites

- Salesforce Service Cloud (Enterprise edition or higher)
- [Salesforce CLI (sf)](https://developer.salesforce.com/tools/salesforcecli) installed
- Esper API key scoped to a support RBAC role

## Setup

### 1. Create Named Credential

Setup → Named Credentials → New:

| Field | Value |
|-------|-------|
| Label | `Esper_API` |
| Name | `Esper_API` |
| URL | `https://{tenant}-api.esper.cloud` |
| Identity Type | Named Principal |
| Authentication Protocol | Custom Header |
| Custom Header Name | `Authorization` |
| Custom Header Value | `Bearer {your_esper_api_key}` |

Also add `https://{tenant}-api.esper.cloud` to Remote Site Settings.

### 2. Create Custom Metadata Type

Setup → Custom Metadata Types → New:

| Field | Value |
|-------|-------|
| Label | `Esper Config` |
| Object Name | `Esper_Config` |

Add two custom fields:
- `Enterprise_Id__c` (Text 50) — Your Esper Enterprise UUID
- `Tenant_Name__c` (Text 50) — Your tenant name (e.g., "acme")

Then create a record named "Default" with your values. Or deploy the included metadata — just update the values in `customMetadata/Esper_Config.Default.md-meta.xml` first.

### 3. Deploy

```bash
cd salesforce
sf project deploy start --source-dir force-app
```

### 4. Add to Case Page

1. Open any Case → gear icon → **Edit Page**
2. Drag **Esper Device Panel** into the right sidebar
3. **Save** → **Activate** → assign to your Service Console app

### 5. Test

Open a Case, enter a device serial in the Device Serial field, and the panel will populate.

## Files

```
salesforce/
├── force-app/main/default/
│   ├── classes/
│   │   ├── EsperDeviceController.cls          # Apex controller
│   │   └── EsperDeviceController.cls-meta.xml
│   ├── lwc/esperDevicePanel/
│   │   ├── esperDevicePanel.html              # Component template
│   │   ├── esperDevicePanel.js                # Component logic
│   │   ├── esperDevicePanel.css               # Styles
│   │   └── esperDevicePanel.js-meta.xml       # Component metadata
│   ├── customMetadata/
│   │   └── Esper_Config.Default.md-meta.xml   # Enterprise ID + Tenant config
│   └── objects/Case/fields/
│       └── Device_Serial__c.field-meta.xml    # Custom field definition
└── sfdx-project.json
```
