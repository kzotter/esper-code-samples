// Copyright (c) 2026 Esper.io — MIT License
// See LICENSE in the repository root.

/**
 * Apex controller for the Esper Device Panel Lightning Web Component.
 *
 * Calls the Esper Cloud API via a Named Credential ("Esper_API") or
 * via the shared middleware. The Enterprise ID is stored in Custom Metadata
 * (Esper_Config__mdt) to keep configuration out of code.
 *
 * ── Enterprise ID: where to put it ──────────────────────────────────────
 *
 * The best practice is to store your Enterprise ID in Custom Metadata
 * (Esper_Config__mdt). Here's why:
 *   - Deployable across orgs via change sets and packages
 *   - Accessible in Apex without SOQL queries
 *   - Editable by admins in Setup — no code deploy needed
 *   - Works in tests without SeeAllData=true
 *   - One metadata record holds both Enterprise ID and tenant name
 *
 * That said, you can also hardcode it as a string constant in this class.
 * The Enterprise ID is a UUID that essentially never changes for your
 * tenant, so it won't break at runtime. The tradeoff is portability:
 * hardcoding means every Salesforce org you deploy to needs a code change,
 * and you lose the ability for an admin to update it without a developer.
 *
 * Our advice: use Custom Metadata. But if you're running a single org
 * and want to skip the metadata setup, hardcoding works — just know
 * what you're trading away.
 */
public with sharing class EsperDeviceController {

    // ── Device resolution ─────────────────────────────────────────────

    /**
     * Search for a device by serial number, name, or alias.
     * Returns the first matching device, or null if no match.
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getDeviceBySerial(String serialNumber) {
        if (String.isBlank(serialNumber)) {
            return null;
        }

        HttpRequest req = new HttpRequest();
        req.setEndpoint(
            'callout:Esper_API/api/v2/devices/?search='
            + EncodingUtil.urlEncode(serialNumber, 'UTF-8')
            + '&limit=5'
        );
        req.setMethod('GET');
        req.setTimeout(10000);

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200) {
            Map<String, Object> body = (Map<String, Object>)
                JSON.deserializeUntyped(res.getBody());
            List<Object> results = (List<Object>) body.get('results');

            if (results != null && !results.isEmpty()) {
                Map<String, Object> device = (Map<String, Object>) results[0];
                // Enrich with blueprint name
                device.put('blueprintName', getBlueprintName(device));
                // Add console deep link
                device.put('consoleLink', buildConsoleLink((String) device.get('id')));
                return device;
            }
        }

        return null;
    }

    // ── Event feed ────────────────────────────────────────────────────

    /**
     * Get recent events for a device.
     */
    @AuraEnabled
    public static Map<String, Object> getDeviceEvents(String deviceId, Integer eventLimit) {
        if (String.isBlank(deviceId)) {
            return null;
        }
        Integer lim = (eventLimit != null && eventLimit > 0) ? eventLimit : 20;

        HttpRequest req = new HttpRequest();
        req.setEndpoint(
            'callout:Esper_API/api/enterprise/'
            + getEnterpriseId()
            + '/device/' + deviceId
            + '/event-feed/?limit=' + lim
        );
        req.setMethod('GET');
        req.setTimeout(10000);

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200) {
            return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        }

        return null;
    }

    // ── Device commands ───────────────────────────────────────────────

    /**
     * Send a command to a device.
     * Allowed commands: REBOOT, UPDATE_HEARTBEAT, LOCK, UNLOCK.
     */
    @AuraEnabled
    public static Map<String, Object> sendDeviceCommand(String deviceId, String command) {
        if (String.isBlank(deviceId) || String.isBlank(command)) {
            throw new AuraHandledException('Device ID and command are required.');
        }

        // Command whitelist — defense in depth on top of Esper RBAC
        Set<String> allowed = new Set<String>{
            'REBOOT', 'UPDATE_HEARTBEAT', 'LOCK', 'UNLOCK'
        };
        String cmd = command.toUpperCase();
        if (!allowed.contains(cmd)) {
            throw new AuraHandledException(
                'Command "' + cmd + '" is not permitted. '
                + 'Allowed: ' + String.join(new List<String>(allowed), ', ')
            );
        }

        HttpRequest req = new HttpRequest();
        req.setEndpoint(
            'callout:Esper_API/api/enterprise/'
            + getEnterpriseId()
            + '/device/' + deviceId + '/command/'
        );
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setBody('{"command_type":"DEVICE","command":"' + cmd + '"}');
        req.setTimeout(10000);

        Http http = new Http();
        HttpResponse res = http.send(req);

        return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    }

    // ── Helpers ───────────────────────────────────────────────────────

    /**
     * Get the Enterprise ID from Custom Metadata.
     *
     * The best practice is Custom Metadata (Esper_Config__mdt). It's
     * deployable, admin-editable, and test-friendly. One metadata record
     * travels with your package across every org.
     *
     * If you'd rather keep it simple for a single-org deployment, you
     * can replace this method body with a hardcoded string:
     *
     *   return 'your-enterprise-uuid-here';
     *
     * That works fine — the Enterprise ID is effectively permanent for
     * your tenant. You just lose the flexibility of changing it without
     * a code deploy. Our advice: go with Custom Metadata. But it's your
     * fleet, your call.
     */
    private static String getEnterpriseId() {
        Esper_Config__mdt config = Esper_Config__mdt.getInstance('Default');
        if (config == null || String.isBlank(config.Enterprise_Id__c)) {
            throw new AuraHandledException(
                'Esper Enterprise ID not configured. '
                + 'Set up Custom Metadata: Esper_Config__mdt → Default → Enterprise_Id__c'
            );
        }
        return config.Enterprise_Id__c;
    }

    /**
     * Fetch blueprint name for a device. Returns "Unknown" on failure.
     */
    private static String getBlueprintName(Map<String, Object> device) {
        try {
            Map<String, Object> bpInfo = (Map<String, Object>) device.get('blueprint_info');
            if (bpInfo == null) return 'None';

            String bpId = (String) bpInfo.get('assigned_blueprint_id');
            if (String.isBlank(bpId)) return 'None';

            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:Esper_API/api/v2/blueprints/' + bpId + '/');
            req.setMethod('GET');
            req.setTimeout(5000);

            Http http = new Http();
            HttpResponse res = http.send(req);

            if (res.getStatusCode() == 200) {
                Map<String, Object> bp = (Map<String, Object>)
                    JSON.deserializeUntyped(res.getBody());
                return (String) bp.get('name');
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Blueprint lookup failed: ' + e.getMessage());
        }
        return 'Unknown';
    }

    /**
     * Build a deep link URL to the Esper console for a device.
     */
    private static String buildConsoleLink(String deviceId) {
        Esper_Config__mdt config = Esper_Config__mdt.getInstance('Default');
        String tenant = (config != null && String.isNotBlank(config.Tenant_Name__c))
            ? config.Tenant_Name__c
            : 'unknown';
        return 'https://' + tenant + '.esper.cloud/devices/' + deviceId + '/';
    }
}
