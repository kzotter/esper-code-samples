# ServiceNow Outbound REST Message Setup Guide

> Copyright (c) 2026 Esper.io — MIT License

This guide walks through creating the Outbound REST Message that the Esper Device Panel widget uses to call the Esper Cloud API.

## System Properties (create first)

Navigate to **System Properties → All Properties** and create:

| Name | Value | Type |
|------|-------|------|
| `esper.tenant_name` | `acme` (your tenant) | `string` |
| `esper.enterprise_id` | `f44373cb-1800-...` (your UUID) | `string` |
| `esper.api_key` | `Bearer eyJ...` (your API key) | `string` (encrypted) |

> **Enterprise ID note:** The best practice is to store this in a System Property so admins can update it without touching code and it works across dev/test/prod instances. You *can* hardcode it directly in the widget server script — the Enterprise ID is a UUID that essentially never changes — but you lose the flexibility. Our advice: use the property. But it's your instance, your call.

## REST Message Configuration

Navigate to **System Web Services → Outbound → REST Message → New**.

### Base Configuration

| Field | Value |
|-------|-------|
| Name | `Esper API` |
| Endpoint | `https://${esper_tenant}-api.esper.cloud` |
| Authentication | No authentication (we use a custom header) |

Under **HTTP Request → HTTP Headers**, add:

| Name | Value |
|------|-------|
| `Authorization` | `${esper_api_key}` |
| `Content-Type` | `application/json` |

> Use variable substitution so the values come from System Properties at runtime.

### HTTP Methods

Create the following HTTP Methods on the REST Message:

---

#### 1. Device Search (GET)

| Field | Value |
|-------|-------|
| Name | `Device Search` |
| HTTP Method | `GET` |
| Endpoint | `https://${esper_tenant}-api.esper.cloud/api/v2/devices/?search=${serial}&limit=5` |

Variable substitutions:
- `esper_tenant` → `${esper.tenant_name}` (system property)
- `serial` → (set by the widget server script at runtime)

---

#### 2. Device Details (GET)

| Field | Value |
|-------|-------|
| Name | `Device Details` |
| HTTP Method | `GET` |
| Endpoint | `https://${esper_tenant}-api.esper.cloud/api/v2/devices/${device_id}/` |

Variable substitutions:
- `device_id` → (set at runtime)

---

#### 3. Blueprint Details (GET)

| Field | Value |
|-------|-------|
| Name | `Blueprint Details` |
| HTTP Method | `GET` |
| Endpoint | `https://${esper_tenant}-api.esper.cloud/api/v2/blueprints/${blueprint_id}/` |

Variable substitutions:
- `blueprint_id` → (set at runtime)

---

#### 4. Event Feed (GET)

| Field | Value |
|-------|-------|
| Name | `Event Feed` |
| HTTP Method | `GET` |
| Endpoint | `https://${esper_tenant}-api.esper.cloud/api/enterprise/${enterprise_id}/device/${device_id}/event-feed/?limit=20` |

Variable substitutions:
- `enterprise_id` → (set at runtime from System Property)
- `device_id` → (set at runtime)

---

#### 5. Device Command (POST)

| Field | Value |
|-------|-------|
| Name | `Device Command` |
| HTTP Method | `POST` |
| Endpoint | `https://${esper_tenant}-api.esper.cloud/api/enterprise/${enterprise_id}/device/${device_id}/command/` |
| Content | `{"command_type":"DEVICE","command":"${command}"}` |

Variable substitutions:
- `enterprise_id` → (set at runtime)
- `device_id` → (set at runtime)
- `command` → (set at runtime: REBOOT, UPDATE_HEARTBEAT, LOCK, UNLOCK)

---

## Testing

Each HTTP Method has a **Test** button at the bottom of the form. Fill in the variable substitutions with real values from your Esper tenant and click Test. You should see a 200 response with device data.

## Custom Fields on Incident

Add these custom fields to the Incident table:

| Field Label | Column Name | Type | Max Length |
|-------------|-------------|------|------------|
| Device Serial | `u_device_serial` | String | 50 |
| Device Name | `u_device_name` | String | 100 |
| Esper Device ID | `u_esper_device_id` | String | 40 |
| Device Group | `u_device_group` | String | 200 |

Add at least `u_device_serial` to your Incident form layout.
