# Esper ITSM Connectors

### Bridging Device Fleet Management and Your Service Desk

> **Zendesk · Salesforce Service Cloud · ServiceNow**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Esper API](https://img.shields.io/badge/Esper%20API-v2-green.svg)](https://api.esper.io/)

---

## What Is This?

You manage a fleet of dedicated devices — kiosks, POS terminals, digital signage, ruggedized handhelds, tablets on warehouse carts. When something breaks in the field, the support workflow splits in two: your service desk is in one tool, your device management is in another.

This repo fixes that. It connects Esper's Cloud APIs directly into your ITSM platform so that when a support agent opens a ticket about a device, they see live device status, health data, and remote access controls **right inside the ticket** — no tab switching, no hunting.

## Status
This project is a reference implementation and community sample, not an officially supported Esper product or managed integration.

It is intended to demonstrate architectural patterns for integrating Esper’s Cloud APIs with ITSM platforms such as Zendesk, Salesforce, and ServiceNow. The code is designed for experimentation, extension, and adaptation within your own infrastructure.

## What's Inside

```

├── middleware/          # Shared API adapter (Node.js/Express)
│   ├── src/
│   │   ├── server.js          # Express server + routes
│   │   ├── esper-client.js    # Esper Cloud API client
│   │   └── config.js          # Configuration from env vars
│   ├── test/
│   │   └── esper-client.test.js
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── package.json
│   └── .env.example
├── zendesk/             # ZAF sidebar app
│   ├── manifest.json
│   ├── assets/
│   │   ├── sidebar.html
│   │   ├── sidebar.js
│   │   └── sidebar.css
│   └── README.md
├── salesforce/          # LWC + Apex controller
│   ├── force-app/main/default/
│   │   ├── classes/
│   │   │   ├── EsperDeviceController.cls
│   │   │   └── EsperDeviceController.cls-meta.xml
│   │   ├── lwc/esperDevicePanel/
│   │   │   ├── esperDevicePanel.html
│   │   │   ├── esperDevicePanel.js
│   │   │   ├── esperDevicePanel.css
│   │   │   └── esperDevicePanel.js-meta.xml
│   │   ├── customMetadata/
│   │   │   └── Esper_Config.Default.md-meta.xml
│   │   └── objects/Case/fields/
│   │       └── Device_Serial__c.field-meta.xml
│   ├── sfdx-project.json
│   └── README.md
├── servicenow/          # Service Portal widget + REST Message
│   ├── widget/
│   │   ├── html.html
│   │   ├── client.js
│   │   └── server.js
│   ├── rest-message/
│   │   └── setup-guide.md
│   └── README.md
└── docs/
    └── ARCHITECTURE.md  # Full reference architecture doc
```

## Quick Start

### 1. Start the Middleware

```bash
cd middleware
cp .env.example .env
# Edit .env with your Esper tenant, API key, and enterprise ID

docker-compose up -d
# Middleware is now running at http://localhost:3000
```

### 2. Deploy Your ITSM Connector

Pick your platform and follow the README in the corresponding directory:

- **[Zendesk](zendesk/README.md)** — ZAF sidebar app, ~10 min setup
- **[Salesforce](salesforce/README.md)** — LWC + Apex, ~30 min setup
- **[ServiceNow](servicenow/README.md)** — Widget + REST Message, ~30 min setup

### 3. Test It

Open a ticket/case/incident, set the device serial number field, and watch the Esper device panel light up in the sidebar.

## Prerequisites

- An **Esper tenant** with API access enabled
- An **Esper API key** scoped to a support role (see [RBAC setup](docs/ARCHITECTURE.md#rbac-the-support-agent-role))
- Your **Esper Enterprise ID** (found in API Key Management in the console)
- **Docker** (for the middleware) or Node.js 18+

## How It Works

Every connector follows the same pattern:

```
ITSM ticket has device serial
    → ITSM frontend reads it
    → Calls middleware
    → Middleware calls Esper Cloud API
    → Device data flows back to the ticket sidebar
    → Agent clicks "Remote View"
    → Opens Esper console (SSO handles auth)
    → Agent sees live device screen
```

The middleware is the only component that talks to Esper. The ITSM frontend never touches the Esper API directly. This means:
- API keys never reach the agent's browser
- You can swap ITSM platforms without changing the Esper integration
- Action guardrails are enforced in one place

## Documentation

- **[Full Architecture Reference](docs/ARCHITECTURE.md)** — API endpoints, RBAC configuration, security model, deployment options
- **[Zendesk Setup](zendesk/README.md)**
- **[Salesforce Setup](salesforce/README.md)**
- **[ServiceNow Setup](servicenow/README.md)**

## Contributing

Contributions welcome. If you're running this against a platform not covered here, the middleware is platform-agnostic — build a new frontend and submit a PR.

## License

MIT License — Copyright (c) 2026 Esper.io. See [LICENSE](LICENSE).
