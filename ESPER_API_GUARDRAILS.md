ESPER API GUARDRAILS (FOR GENERATIVE CODE)

1. Production Base URL
Use:
  https://{tenant}-api.esper.cloud/api/...
Always include `/api` after the host.
Do NOT use develop-api for production code.

2. Authentication
Use:
  Authorization: Bearer {API_KEY}
API keys are NOT passed as query params.
Never hardcode API keys.

3. Enterprise ID Rule
Only include enterprise_id in the path when the endpoint explicitly shows:
  /api/enterprise/{enterprise_id}/...
Do NOT assume enterprise_id is required everywhere.

4. RBAC / Roles
Roles are NOT enterprise-scoped.
Use:
  GET  /api/authz2/v1/roles/
  GET  /api/authz2/v1/roles/{role_id}/scopes
  PUT  /api/authz2/v1/roles/{role_id}/scopes
If you see code calling:
  /api/enterprise/{enterprise_id}/role/
It is incorrect.

5. Versioning
Do NOT assume “v2 everywhere”.
Use the highest version for a given endpoint family.
Do NOT mix request/response schemas across versions.

6. Pagination
Common params: limit, offset, ordering.
Response shape may differ by service.
Do NOT assume a universal envelope.

7. Error Handling
404 usually = wrong path.
401/403 usually = auth/permission issue.
Error JSON structure may vary by service.

8. Naming Discipline
Do NOT invent endpoints by normalizing names.
Use exact paths from the API reference.

9. Safe Automation Defaults
Implement dry-run mode for write operations.
Validate with GET before POST/PUT.
Prefer idempotent logic.
