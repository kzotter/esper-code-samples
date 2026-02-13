#!/usr/bin/env python3
"""
Esper Custom Role Cloner
========================
Clone custom RBAC roles from one Esper tenant to one or more target tenants.

Built for multi-tenant partners who need to replicate
custom role definitions across their tenant portfolio without the
pain of manual re-creation in the console.

Usage:
    python esper_clone_role.py --config tenants.json --source-tenant "acme-corp" --role-name "Field Tech"
    python esper_clone_role.py --config tenants.json --source-tenant "acme-corp" --role-name "Field Tech" --target-tenants "tenant-b,tenant-c"
    python esper_clone_role.py --config tenants.json --source-tenant "acme-corp" --role-name "Field Tech" --all-targets
    python esper_clone_role.py --config tenants.json --source-tenant "acme-corp" --role-name "Field Tech" --dry-run

Requirements:
    pip install requests

Author: Esper Partner Sales Engineering
"""

import argparse
import json
import sys
import time
from typing import Optional

import requests
from pathlib import Path


# =============================================================================
# Configuration
# =============================================================================

API_VERSION = "v1"
REQUEST_TIMEOUT = 30  # seconds
RATE_LIMIT_DELAY = 0.5  # seconds between API calls to stay safe


# =============================================================================
# Esper API Client
# =============================================================================

class EsperTenant:
    """Represents a single Esper tenant with API access."""

    def __init__(self, name: str, tenant_name: str, enterprise_id: str, api_key: str):
        self.name = name
        self.tenant_name = tenant_name
        self.enterprise_id = enterprise_id
        self.api_key = api_key
        self.base_url = f"https://{tenant_name}-api.esper.cloud/api"

    @property
    def headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def __repr__(self):
        return f"EsperTenant({self.name} -> {self.tenant_name})"


class EsperRoleCloner:
    """Handles fetching and cloning custom roles between Esper tenants."""

    def __init__(self, dry_run: bool = False, verbose: bool = False):
        self.dry_run = dry_run
        self.verbose = verbose

    # -------------------------------------------------------------------------
    # API Helpers
    # -------------------------------------------------------------------------

    def _get(self, tenant: EsperTenant, path: str, params: dict = None) -> dict:
        """Make a GET request to the Esper API."""
        url = f"{tenant.base_url}/{path}"
        if self.verbose:
            print(f"  [GET] {url}")
        resp = requests.get(url, headers=tenant.headers, params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        time.sleep(RATE_LIMIT_DELAY)
        return resp.json()

    def _post(self, tenant: EsperTenant, path: str, data: dict) -> dict:
        """Make a POST request to the Esper API."""
        url = f"{tenant.base_url}/{path}"
        if self.verbose:
            print(f"  [POST] {url}")
        resp = requests.post(url, headers=tenant.headers, json=data, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        time.sleep(RATE_LIMIT_DELAY)
        return resp.json()

    def _put(self, tenant: EsperTenant, path: str, data: dict) -> dict:
        """Make a PUT request to the Esper API."""
        url = f"{tenant.base_url}/{path}"
        if self.verbose:
            print(f"  [PUT] {url}")
        resp = requests.put(url, headers=tenant.headers, json=data, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        time.sleep(RATE_LIMIT_DELAY)
        return resp.json()

    # -------------------------------------------------------------------------
    # Role Operations
    # -------------------------------------------------------------------------

    def list_roles(self, tenant: EsperTenant) -> list:
        """List roles in a tenant.

        Uses the AuthZ v2 Roles API:
          GET /api/authz2/v1/roles/
        """
        path = "authz2/v1/roles/"
        result = self._get(tenant, path)

        # Expected shape: {"count": N, "roles": [...]}
        if isinstance(result, dict):
            if "roles" in result and isinstance(result["roles"], list):
                return result["roles"]
            # Back-compat / edge cases
            if "results" in result and isinstance(result["results"], list):
                return result["results"]

        # Some environments may return a bare list
        if isinstance(result, list):
            return result

        return []

    def get_role_by_name(self, tenant: EsperTenant, role_name: str) -> Optional[dict]:
        """Find a specific role by its display name."""
        roles = self.list_roles(tenant)
        for role in roles:
            if role.get("name", "").strip().lower() == role_name.strip().lower():
                return role
        return None

    def get_role_scopes(self, tenant: EsperTenant, role_id: str) -> list:
        """Get the permission scopes assigned to a role.

        Uses the AuthZ v2 Roles API:
          GET /api/authz2/v1/roles/{role_id}/scopes
        """
        path = f"authz2/v1/roles/{role_id}/scopes"
        result = self._get(tenant, path)

        # Common response: bare list of scope objects
        if isinstance(result, list):
            return result

        # Some variants wrap: {"count": N, "scopes": [...]}
        if isinstance(result, dict):
            if "scopes" in result and isinstance(result["scopes"], list):
                return result["scopes"]
            if "results" in result and isinstance(result["results"], list):
                return result["results"]

        return []

    def create_role(self, tenant: EsperTenant, name: str, description: str = "") -> dict:
        """Create a new custom role in a tenant (no scopes by default).

        Uses the AuthZ v2 Roles API:
          POST /api/authz2/v1/roles/
        """
        path = "authz2/v1/roles/"
        payload = {"name": name, "description": description}
        return self._post(tenant, path, payload)

    def update_role_scopes(self, tenant: EsperTenant, role_id: str, scopes: list) -> dict:
        """Set the permission scopes on a role.

        Uses the AuthZ v2 Roles API:
          PUT /api/authz2/v1/roles/{role_id}/scopes
        """
        path = f"authz2/v1/roles/{role_id}/scopes"

        # The API expects scope names (strings). Normalize if needed.
        scope_names = []
        for s in scopes or []:
            if isinstance(s, str):
                scope_names.append(s)
            elif isinstance(s, dict):
                if "name" in s:
                    scope_names.append(s["name"])
                elif "scope" in s:
                    scope_names.append(s["scope"])

        payload = {"scope_names": scope_names}
        return self._put(tenant, path, payload)

    def fetch_role_definition(self, source: EsperTenant, role_name: str) -> dict:
        """
        Fetch a complete role definition (metadata + scopes) from the source tenant.
        Returns a portable dict that can be applied to any target tenant.
        """
        print(f"\n📋 Fetching role '{role_name}' from source tenant: {source.name}")

        role = self.get_role_by_name(source, role_name)
        if not role:
            available = self.list_roles(source)
            available_names = [r.get("name", "???") for r in available]
            print(f"\n❌ Role '{role_name}' not found in tenant '{source.name}'.")
            print(f"   Available roles: {', '.join(available_names)}")
            sys.exit(1)

        role_id = role.get("id") or role.get("role_id")
        print(f"   ✅ Found role: {role.get('name')} (ID: {role_id})")

        scopes = self.get_role_scopes(source, role_id)
        scope_list = self._extract_scope_identifiers(scopes)
        print(f"   ✅ Captured {len(scope_list)} permission scopes")

        if self.verbose and scope_list:
            for s in scope_list:
                print(f"      • {s}")

        return {
            "name": role.get("name"),
            "description": role.get("description", ""),
            "scopes": scope_list,
            "raw_scopes": scopes,
        }

    def _extract_scope_identifiers(self, scopes_response) -> list:
        """
        Extract the scope identifiers from the API response.
        The exact structure depends on Esper's API response format.
        This handles common patterns.
        """
        if isinstance(scopes_response, list):
            identifiers = []
            for item in scopes_response:
                if isinstance(item, str):
                    identifiers.append(item)
                elif isinstance(item, dict):
                    # Try common key patterns
                    for key in ("scope", "name", "permission", "id", "slug"):
                        if key in item:
                            identifiers.append(item[key])
                            break
                    else:
                        # If no known key, include the whole item
                        identifiers.append(item)
            return identifiers
        return scopes_response if scopes_response else []

    def clone_to_tenant(self, target: EsperTenant, role_def: dict) -> bool:
        """
        Clone a role definition to a target tenant.
        Returns True on success, False on failure.
        """
        role_name = role_def["name"]
        print(f"\n🔄 Cloning '{role_name}' → {target.name}")

        # Check if the role already exists in the target
        existing = self.get_role_by_name(target, role_name)
        if existing:
            existing_id = existing.get("id") or existing.get("role_id")
            print(f"   ⚠️  Role '{role_name}' already exists in {target.name} (ID: {existing_id})")
            print(f"   → Updating scopes on existing role...")
            if self.dry_run:
                print(f"   🏜️  [DRY RUN] Would update {len(role_def['scopes'])} scopes on existing role")
                return True
            try:
                self.update_role_scopes(target, existing_id, role_def["scopes"])
                print(f"   ✅ Updated scopes successfully")
                return True
            except requests.HTTPError as e:
                print(f"   ❌ Failed to update scopes: {e}")
                return False

        # Create the new role
        if self.dry_run:
            print(f"   🏜️  [DRY RUN] Would create role '{role_name}' with {len(role_def['scopes'])} scopes")
            return True

        try:
            new_role = self.create_role(
                target,
                name=role_def["name"],
                description=role_def.get("description", ""),
            )
            new_role_id = new_role.get("id") or new_role.get("role_id")
            print(f"   ✅ Created role (ID: {new_role_id})")
        except requests.HTTPError as e:
            print(f"   ❌ Failed to create role: {e}")
            return False

        # Apply the scopes
        try:
            self.update_role_scopes(target, new_role_id, role_def["scopes"])
            print(f"   ✅ Applied {len(role_def['scopes'])} permission scopes")
        except requests.HTTPError as e:
            print(f"   ❌ Role created but failed to apply scopes: {e}")
            print(f"   ⚠️  You may need to manually apply scopes or delete the empty role.")
            return False

        return True


# =============================================================================
# Configuration Loader
# =============================================================================

def load_config(config_path: str) -> dict:
    """
    Load tenant configuration from a JSON file.

    Expected format:
    {
        "tenants": {
            "friendly-name": {
                "tenant_name": "the-esper-subdomain",
                "enterprise_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                "api_key": "your-api-key-here"
            },
            ...
        }
    }
    """
    path = Path(config_path)
    if not path.exists():
        print(f"❌ Config file not found: {config_path}")
        print(f"\nCreate a tenants.json file with your tenant credentials.")
        print(f"See the sample config below:\n")
        print_sample_config()
        sys.exit(1)

    with open(path) as f:
        config = json.load(f)

    tenants = {}
    for name, details in config.get("tenants", {}).items():
        tenants[name] = EsperTenant(
            name=name,
            tenant_name=details["tenant_name"],
            enterprise_id=details["enterprise_id"],
            api_key=details["api_key"],
        )

    if not tenants:
        print("❌ No tenants found in config file.")
        sys.exit(1)

    return tenants


def print_sample_config():
    """Print a sample configuration file."""
    sample = {
        "tenants": {
            "acme-master": {
                "tenant_name": "acme-master",
                "enterprise_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                "api_key": "your-api-key-for-this-tenant"
            },
            "acme-region-east": {
                "tenant_name": "acme-east",
                "enterprise_id": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
                "api_key": "your-api-key-for-this-tenant"
            },
            "acme-region-west": {
                "tenant_name": "acme-west",
                "enterprise_id": "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
                "api_key": "your-api-key-for-this-tenant"
            }
        }
    }
    print(json.dumps(sample, indent=2))


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Clone Esper custom roles across tenants.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Clone "Field Tech" role from acme-master to two specific tenants
  python esper_clone_role.py \\
      --config tenants.json \\
      --source-tenant acme-master \\
      --role-name "Field Tech" \\
      --target-tenants "acme-region-east,acme-region-west"

  # Clone to ALL other tenants in the config
  python esper_clone_role.py \\
      --config tenants.json \\
      --source-tenant acme-master \\
      --role-name "Field Tech" \\
      --all-targets

  # Preview what would happen without making changes
  python esper_clone_role.py \\
      --config tenants.json \\
      --source-tenant acme-master \\
      --role-name "Field Tech" \\
      --all-targets \\
      --dry-run

  # List all roles in a tenant
  python esper_clone_role.py \\
      --config tenants.json \\
      --source-tenant acme-master \\
      --list-roles

  # Generate a sample config file
  python esper_clone_role.py --sample-config
        """,
    )

    parser.add_argument("--config", default="tenants.json",
                        help="Path to tenant configuration JSON file (default: tenants.json)")
    parser.add_argument("--source-tenant", 
                        help="Friendly name of the source tenant (from config)")
    parser.add_argument("--role-name",
                        help="Name of the custom role to clone")
    parser.add_argument("--target-tenants",
                        help="Comma-separated list of target tenant names")
    parser.add_argument("--all-targets", action="store_true",
                        help="Clone to ALL tenants in config (except source)")
    parser.add_argument("--list-roles", action="store_true",
                        help="List all custom roles in the source tenant")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview actions without making any changes")
    parser.add_argument("--verbose", action="store_true",
                        help="Show detailed API call information")
    parser.add_argument("--sample-config", action="store_true",
                        help="Print a sample tenants.json and exit")
    parser.add_argument("--export-role", 
                        help="Export role definition to a JSON file (for sharing/auditing)")

    args = parser.parse_args()

    # Handle --sample-config
    if args.sample_config:
        print_sample_config()
        return

    # Load tenants
    tenants = load_config(args.config)
    cloner = EsperRoleCloner(dry_run=args.dry_run, verbose=args.verbose)

    # Validate source tenant
    if not args.source_tenant:
        parser.error("--source-tenant is required")

    if args.source_tenant not in tenants:
        print(f"❌ Source tenant '{args.source_tenant}' not found in config.")
        print(f"   Available tenants: {', '.join(tenants.keys())}")
        sys.exit(1)

    source = tenants[args.source_tenant]

    # Handle --list-roles
    if args.list_roles:
        print(f"\n📋 Roles in tenant: {source.name}")
        print(f"{'─' * 60}")
        roles = cloner.list_roles(source)
        for role in roles:
            role_id = role.get("id") or role.get("role_id", "N/A")
            name = role.get("name", "Unnamed")
            desc = role.get("description", "")
            print(f"  • {name} (ID: {role_id})")
            if desc:
                print(f"    {desc}")
        print(f"\n  Total: {len(roles)} role(s)")
        return

    # Validate role name
    if not args.role_name:
        parser.error("--role-name is required (or use --list-roles to see available roles)")

    # Fetch the role definition from source
    role_def = cloner.fetch_role_definition(source, args.role_name)

    # Handle --export-role
    if args.export_role:
        export_path = Path(args.export_role)
        with open(export_path, "w") as f:
            json.dump(role_def, f, indent=2, default=str)
        print(f"\n💾 Role definition exported to: {export_path}")
        return

    # Determine target tenants
    if args.all_targets:
        targets = {k: v for k, v in tenants.items() if k != args.source_tenant}
    elif args.target_tenants:
        target_names = [t.strip() for t in args.target_tenants.split(",")]
        targets = {}
        for name in target_names:
            if name not in tenants:
                print(f"⚠️  Target tenant '{name}' not found in config, skipping.")
            elif name == args.source_tenant:
                print(f"⚠️  Skipping source tenant '{name}' as a target.")
            else:
                targets[name] = tenants[name]
    else:
        parser.error("Specify --target-tenants or --all-targets")

    if not targets:
        print("❌ No valid target tenants to clone to.")
        sys.exit(1)

    # Print summary
    if args.dry_run:
        print(f"\n🏜️  DRY RUN MODE — no changes will be made")
    print(f"\n{'═' * 60}")
    print(f"  Role:    {role_def['name']}")
    print(f"  Scopes:  {len(role_def['scopes'])} permissions")
    print(f"  Source:  {source.name}")
    print(f"  Targets: {', '.join(targets.keys())}")
    print(f"{'═' * 60}")

    # Clone to each target
    results = {}
    for name, target in targets.items():
        success = cloner.clone_to_tenant(target, role_def)
        results[name] = success

    # Final summary
    print(f"\n{'═' * 60}")
    print(f"  RESULTS SUMMARY")
    print(f"{'═' * 60}")
    succeeded = sum(1 for v in results.values() if v)
    failed = sum(1 for v in results.values() if not v)
    for name, success in results.items():
        status = "✅" if success else "❌"
        print(f"  {status} {name}")
    print(f"\n  {succeeded} succeeded, {failed} failed out of {len(results)} target(s)")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
