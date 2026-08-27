"use strict";

export const API = Object.freeze({
    version: "/api/version",
    shizuneVersion: "/shizune/version.json",
    runtime: "/api/runtime",
    observations: "/api/observations",
    hostHealth: "/api/host-health",
    incidents: "/api/incidents",
    tsunadeIncidents: "/api/administration/tsunade/incidents",
    tsunadeIncident: (incidentId) =>
        `/api/administration/tsunade/incidents/${encodeURIComponent(incidentId)}`,
    tsunadeDiagnose: (incidentId) =>
        `/api/administration/tsunade/incidents/${encodeURIComponent(incidentId)}/diagnose`,
    tsunadeLogCheck: "/api/administration/tsunade/incidents/logs/check",
    tsunadeLogPolicy: "/api/administration/tsunade/incidents/logs",
    administrationJob: (jobId) =>
        `/api/administration/jobs/${encodeURIComponent(jobId)}`,
    tsunadeLogInvestigate: (incidentId) =>
        `/api/administration/tsunade/incidents/${encodeURIComponent(incidentId)}/logs/investigate`,
    tsunadeRepair: (incidentId) =>
        `/api/administration/tsunade/incidents/${encodeURIComponent(incidentId)}/repairs`,
    tsunadeRepairAuthorize: (incidentId) =>
        `/api/administration/tsunade/incidents/${encodeURIComponent(incidentId)}/repairs/authorize`,
    tsunadeExperience: (incidentId) =>
        `/api/administration/tsunade/incidents/${encodeURIComponent(incidentId)}/experience`,
    incidentAcknowledge(incidentId) {
        return `${this.incidents}/${encodeURIComponent(incidentId)}/acknowledge`;
    },
    incidentSilence(incidentId) {
        return `${this.incidents}/${encodeURIComponent(incidentId)}/silence`;
    },
    timeline: "/api/timeline",
    topology: "/api/topology",
    administrationCapabilities:
        "/api/administration/capabilities",
    administrationDHCP:
        "/api/administration/dhcp",
    administrationNetwork:
        "/api/administration/network",
    administrationNetworkConfirm(transactionId) {
        return `${this.administrationNetwork}/${encodeURIComponent(transactionId)}/confirm`;
    },
    administrationNetworkRollback(transactionId) {
        return `${this.administrationNetwork}/${encodeURIComponent(transactionId)}/rollback`;
    },
    administrationInfrastructure:
        "/api/administration/infrastructure",
    administrationPlugins:
        "/api/administration/plugins",
    administrationPlugin(identifier) {
        return `/api/administration/plugins/${encodeURIComponent(identifier)}`;
    },
    administrationPluginTest(identifier) {
        return `${this.administrationPlugin(identifier)}/test`;
    },
    administrationBackupICloudConnect:
        "/api/administration/plugins/backup/icloud/connect",
    administrationBackupRun(targetId) {
        return `/api/administration/plugins/backup/targets/${encodeURIComponent(targetId)}/run`;
    },
    administrationWorkerPairings:
        "/api/administration/workers/pairings",
    administrationWorkers:
        "/api/administration/workers",
    administrationWakeOnLan:
        "/api/administration/workers/wake-on-lan",
    administrationWorkerWake(workerId) {
        return `${this.administrationWorkers}/${encodeURIComponent(workerId)}/wake`;
    },
    administrationWorkerPairingAction(pairingId, action) {
        return `${this.administrationWorkerPairings}/${encodeURIComponent(pairingId)}/${action}`;
    },
    administrationCompanionPairings:
        "/api/administration/companions/pairings",
    administrationCompanions:
        "/api/administration/companions",
    administrationCompanionPairingAction(pairingId, action) {
        return `${this.administrationCompanionPairings}/${encodeURIComponent(pairingId)}/${action}`;
    },
    administrationCompanionRevoke(deviceId) {
        return `${this.administrationCompanions}/${encodeURIComponent(deviceId)}/revoke`;
    },
});

/**
 * Fetch a JSON document from the Ohana-Vision backend.
 *
 * @param {string} url
 * @returns {Promise<unknown>}
 */
export async function fetchJson(url) {
    return requestJson(
        url,
        {
            method: "GET",
        },
    );
}

/**
 * Send and receive a JSON document.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<unknown>}
 */
export async function requestJson(
    url,
    options = {},
) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: "application/json",
            ...(
                options.body
                    ? {
                        "Content-Type":
                            "application/json",
                    }
                    : {}
            ),
            ...(options.headers ?? {}),
        },
    });

    if (!response.ok) {
        let detail =
            `${response.status} ${response.statusText}`;

        try {
            const payload = await response.json();

            if (
                payload
                && typeof payload === "object"
                && "detail" in payload
                && payload.detail
            ) {
                detail = String(payload.detail);
            }
        } catch {
            // Keep the generic HTTP error message.
        }

        throw new Error(detail);
    }

    return response.json();
}
