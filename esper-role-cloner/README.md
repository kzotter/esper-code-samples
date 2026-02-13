# Esper Custom Role Cloner

Clone custom RBAC roles from one Esper tenant to one or more target tenants.

## Overview

Built for multi-tenant partners who need to replicate custom role definitions across their tenant portfolio without the pain of manual re-creation in the console.

When you create a perfect custom role with exactly the right permissions in one tenant, this tool lets you instantly deploy it to all your other tenants with a single command.

API Surface Note

This script uses the AuthZ v2 Roles API.

Roles are NOT enterprise-scoped under /api/enterprise/{enterprise_id}/....

The enterprise_id remains in the config for compatibility with other enterprise-scoped APIs but is not required for AuthZ v2 role endpoints.

All role operations use:
	•	GET /api/authz2/v1/roles/
	•	GET /api/authz2/v1/roles/{role_id}/scopes
	•	PUT /api/authz2/v1/roles/{role_id}/scopes

Base URL format:

https://{tenant}-api.esper.cloud/api

If you receive a 404 error, verify the path includes /api/authz2/v1/.

## Features

- **Clone roles to multiple tenants** in one operation
- **Smart updates**: If a role already exists, updates its permissions instead of failing
- **Dry-run mode**: Preview exactly what would happen before making changes
- **Export roles**: Save role definitions to JSON for auditing or sharing
- **List roles**: Quick inventory of what roles exist in any tenant

## Requirements

- Python 3.8+
- `requests` library

```bash
pip install requests
```

## Quick Start

### 1. Create your tenant configuration

Copy `tenants.sample.json` to `tenants.json` and fill in your tenant details:

```json
{
  "tenants": {
    "my-master": {
      "tenant_name": "my-master",
      "enterprise_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "api_key": "your-api-key-here"
    },
    "my-east": {
      "tenant_name": "my-east",
      "enterprise_id": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
      "api_key": "your-api-key-here"
    }
  }
}
```

**Finding your credentials:**
- `tenant_name`: Your Esper subdomain (e.g., if your console URL is `acme.esper.cloud`, use `acme`)
- `enterprise_id`: Console → Company Settings → Enterprise ID
- `api_key`: Console → Developer Tools → API Keys → Create new key

### 2. List available roles

```bash
python esper_clone_role.py --source-tenant my-master --list-roles
```

### 3. Clone a role

```bash
# Clone to specific tenants
python esper_clone_role.py \
    --source-tenant my-master \
    --role-name "Field Tech" \
    --target-tenants "my-east,my-west"

# Clone to ALL other tenants in your config
python esper_clone_role.py \
    --source-tenant my-master \
    --role-name "Field Tech" \
    --all-targets
```

## Usage Examples

### Preview changes (dry run)

See exactly what would happen without making any changes:

```bash
python esper_clone_role.py \
    --source-tenant my-master \
    --role-name "Field Tech" \
    --all-targets \
    --dry-run
```

### Export a role definition

Save a role to JSON for auditing, sharing, or version control:

```bash
python esper_clone_role.py \
    --source-tenant my-master \
    --role-name "Field Tech" \
    --export-role field-tech-role.json
```

### Verbose mode

See all API calls and permission details:

```bash
python esper_clone_role.py \
    --source-tenant my-master \
    --role-name "Field Tech" \
    --all-targets \
    --verbose
```

## Command Reference

```
python esper_clone_role.py [OPTIONS]

Required:
  --source-tenant NAME    Friendly name of source tenant (from config)
  --role-name NAME        Name of the custom role to clone

Target selection (pick one):
  --target-tenants LIST   Comma-separated list of target tenant names
  --all-targets           Clone to all tenants except source

Optional:
  --config PATH           Path to config file (default: tenants.json)
  --list-roles            List all roles in source tenant and exit
  --export-role PATH      Export role definition to JSON file
  --dry-run               Preview actions without making changes
  --verbose               Show detailed API information
  --sample-config         Print sample config and exit
```

## Security Notes

- **Never commit `tenants.json`** with real API keys to version control
- API keys should have minimal required permissions
- The sample file uses placeholder values that won't work
- Consider using environment variables for API keys in CI/CD

## How It Works

1. Connects to the source tenant and fetches the role by name
2. Extracts the role's permission scopes (the actual capabilities)
3. For each target tenant:
   - If the role doesn't exist: creates it and applies scopes
   - If the role exists: updates the existing role's scopes
4. Reports success/failure for each target

## Troubleshooting

**"Role not found"**
- Role names are case-insensitive but must match exactly
- Use `--list-roles` to see available roles

**"401 Unauthorized"**
- Check your API key is correct and not expired
- Verify the API key has permission to manage roles

**"404 Not Found"**
Likely incorrect endpoint path (check for /api/authz2/v1/).

**"401 / 403"**
Authentication or permission issue with API key.

**"Role created but failed to apply scopes"**
- The target tenant may not support all the same permission scopes
- Check if the target tenant is on a different Esper plan

## License

MIT License - see repository root.
