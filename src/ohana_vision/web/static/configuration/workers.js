"use strict";

import {
    API,
    fetchJson,
    requestJson,
} from "../api.js";

import {
    escapeHtml,
    hideError,
    showError,
} from "../utils.js";

import {
    formatTlsFingerprint,
} from "./shared.js";

/**
 * ConfigurationController methods: Katsuyu workers, Wake-on-LAN and Tsunade log policy.
 */
export const WorkersMethods = {
    async refreshWorkerPairings() {
        if (!this.workerPairingsAvailable) {
            this.renderWorkerPairings();
            return;
        }
        try {
            const [pairingPayload, workersPayload] = await Promise.all([
                fetchJson(API.administrationWorkerPairings),
                fetchJson(API.administrationWorkers),
            ]);
            this.workerPairings = pairingPayload.pairings ?? [];
            this.workers = workersPayload.workers ?? [];
            this.workerPairingsLoadError = null;
            if (this.workerWakeOnLanAvailable) {
                try {
                    this.workerWakeOnLan = await fetchJson(
                        API.administrationWakeOnLan,
                    );
                    this.workerWakeOnLanLoadError = null;
                } catch (error) {
                    this.workerWakeOnLanLoadError = this.errorMessage(error);
                }
            }
            if (this.tsunadeLogPolicyAvailable) {
                try {
                    this.tsunadeLogPolicy = await fetchJson(
                        API.tsunadeLogPolicy,
                    );
                    this.tsunadeLogPolicyLoadError = null;
                } catch (error) {
                    this.tsunadeLogPolicyLoadError = this.errorMessage(error);
                }
            }
            this.renderWorkerPairings();
            this.renderWorkers();
            this.renderWakeOnLan();
            this.renderTsunadeLogPolicy();
        } catch (error) {
            this.workerPairingsLoadError = this.errorMessage(error);
            this.renderWorkerPairings();
            this.renderWorkers();
            this.renderWakeOnLan();
            this.renderTsunadeLogPolicy();
        }
    },

    renderWorkerPairings() {
        const table = this.elements.workerPairingsTable;
        if (!table) {
            return;
        }
        const pending = this.workerPairings.filter(
            (pairing) => pairing.status === "PENDING",
        );
        if (this.elements.workerPairingsPendingCount) {
            this.elements.workerPairingsPendingCount.textContent =
                String(pending.length);
        }
        if (this.workerPairingsLoadError) {
            table.innerHTML = `<tr><td colspan="6">${escapeHtml(this.workerPairingsLoadError)}</td></tr>`;
            return;
        }
        if (!pending.length) {
            table.innerHTML = '<tr><td colspan="6">Aucune demande en attente.</td></tr>';
            return;
        }
        table.innerHTML = pending.map((pairing) => {
            const pairingId = escapeHtml(pairing.pairing_id);
            const capabilities = (pairing.capabilities ?? []).join(", ");
            const expiresAt = new Date(pairing.expires_at).toLocaleString("fr-FR");
            const fingerprint = formatTlsFingerprint(pairing.tls_ca_sha256);
            return `<tr>
                <td><strong>${escapeHtml(pairing.worker_id)}</strong><small>${escapeHtml(pairing.platform)} · ${escapeHtml(pairing.worker_version)}</small></td>
                <td><strong>${escapeHtml(pairing.verification_code)}</strong></td>
                <td><code class="configuration-table__fingerprint">${escapeHtml(fingerprint)}</code></td>
                <td>${escapeHtml(capabilities)}</td>
                <td>${escapeHtml(expiresAt)}</td>
                <td><span class="configuration-table__actions">
                    <button class="button" data-worker-pairing-action="approve" data-worker-pairing-id="${pairingId}" type="button">Autoriser</button>
                    <button class="configuration-danger-button" data-worker-pairing-action="reject" data-worker-pairing-id="${pairingId}" type="button">Refuser</button>
                </span></td>
            </tr>`;
        }).join("");
    },

    renderWakeOnLan() {
        const policy = this.workerWakeOnLan;
        const hasWakeMac = this.workers.some(
            (worker) => Boolean(worker.wake_on_lan_mac_address),
        );

        if (this.elements.workerWakePolicyNotice) {
            let message;

            if (this.workerWakeOnLanLoadError) {
                message = this.workerWakeOnLanLoadError;
            } else if (policy?.enabled) {
                message =
                    "Politique fournie par Agent/Tsunade. "
                    + "La MAC reste annoncée par Katsuyu.";
            } else if (!hasWakeMac) {
                message =
                    "Wake-on-LAN désactivé. Katsuyu doit d’abord "
                    + "annoncer une adresse MAC compatible WOL.";
            } else {
                message =
                    "Wake-on-LAN désactivé. "
                    + "Vous pouvez l’activer pour permettre à Tsunade "
                    + "de réveiller Katsuyu.";
            }

            this.elements.workerWakePolicyNotice.textContent = message;
        }

        if (this.elements.workerWakeEnabled) {
            this.elements.workerWakeEnabled.textContent = policy
                ? (policy.enabled ? "Activé" : "Désactivé")
                : "—";
        }

        if (this.elements.workerWakeBroadcast) {
            this.elements.workerWakeBroadcast.textContent =
                policy?.broadcast_address ?? "—";
        }

        if (this.elements.workerWakePort) {
            this.elements.workerWakePort.textContent =
                policy?.port ?? "—";
        }

        if (this.elements.workerWakeTimeout) {
            this.elements.workerWakeTimeout.textContent = policy
                ? `${policy.wait_timeout_seconds} s`
                : "—";
        }

        if (this.elements.workerWakeHeartbeat) {
            this.elements.workerWakeHeartbeat.textContent = policy
                ? `${policy.available_for_seconds} s`
                : "—";
        }

        const toggle = this.elements.workerWakeToggle;

        if (!toggle) {
            return;
        }

        if (!policy || !this.workerWakeWriteAvailable) {
            toggle.textContent = "Configuration indisponible";
            toggle.disabled = true;
            toggle.title =
                "Cette version d’Agent ne permet pas de modifier "
                + "la politique Wake-on-LAN.";
            return;
        }

        if (policy.enabled) {
            toggle.textContent = "Désactiver le Wake-on-LAN";
            toggle.disabled = false;
            toggle.title = "";
            return;
        }

        toggle.textContent = "Activer le Wake-on-LAN";
        toggle.disabled = !hasWakeMac;

        toggle.title = hasWakeMac
            ? ""
            : "Katsuyu doit d’abord annoncer une adresse MAC WOL.";
    },

    async toggleWakeOnLan() {
        const policy = this.workerWakeOnLan;

        if (
            !policy
            || !this.workerWakeWriteAvailable
        ) {
            return;
        }

        const enabled = !policy.enabled;

        if (enabled) {
            const hasWakeMac = this.workers.some(
                (worker) =>
                    Boolean(worker.wake_on_lan_mac_address),
            );

            if (!hasWakeMac) {
                showError(
                    this.elements.error,
                    "Impossible d’activer le Wake-on-LAN : "
                    + "aucun worker Katsuyu n’a encore annoncé "
                    + "d’adresse MAC WOL.",
                );
                return;
            }
        }

        const confirmation = enabled
            ? (
                "Activer le Wake-on-LAN ?\n\n"
                + "Tsunade pourra réveiller Bubule lorsqu’un job "
                + "nécessitant Katsuyu doit être exécuté."
            )
            : (
                "Désactiver le Wake-on-LAN ?\n\n"
                + "Tsunade ne pourra plus démarrer Bubule "
                + "automatiquement."
            );

        if (!window.confirm(confirmation)) {
            return;
        }

        hideError(this.elements.error);

        if (this.elements.workerWakeToggle) {
            this.elements.workerWakeToggle.disabled = true;
        }

        try {
            this.workerWakeOnLan = await requestJson(
                API.administrationWakeOnLan,
                {
                    method: "PUT",
                    body: JSON.stringify({
                        enabled,
                    }),
                },
            );

            /*
            * Agent rend l'opération de réveil disponible
            * lorsque la politique WOL est active.
            *
            * Sans cette mise à jour locale, le bouton
            * "Tester le réveil" resterait indisponible
            * jusqu'au prochain rechargement complet.
            */
            this.workerWakeAvailable = enabled;

            this.renderWakeOnLan();
            this.renderWorkers();

            this.showNotice(
                enabled
                    ? (
                        "Wake-on-LAN activé. "
                        + "Tsunade peut maintenant réveiller Bubule."
                    )
                    : (
                        "Wake-on-LAN désactivé. "
                        + "Bubule ne sera plus réveillé automatiquement."
                    ),
            );
        } catch (error) {
            showError(
                this.elements.error,
                "Impossible de modifier le Wake-on-LAN : "
                + this.errorMessage(error),
            );

            this.renderWakeOnLan();
        }
    },

    renderTsunadeLogPolicy() {
        const policy = this.tsunadeLogPolicy;
        const disabled =
            !policy
            || !this.tsunadeLogPolicyWriteAvailable;

        if (this.elements.tsunadeLogPolicyNotice) {
            this.elements.tsunadeLogPolicyNotice.textContent =
                this.tsunadeLogPolicyLoadError
                    ?? (
                        policy?.enabled
                            ? "Contrôle planifié par Agent/Tsunade."
                            : "Contrôle automatique désactivé."
                    );
        }

        if (this.elements.tsunadeLogEnabled) {
            this.elements.tsunadeLogEnabled.checked =
                policy?.enabled === true;
            this.elements.tsunadeLogEnabled.disabled = disabled;
        }

        if (this.elements.tsunadeLogTime) {
            const draft = this.backupScheduleDraft(
                policy?.schedule ?? "0 5 * * *",
            );
            this.elements.tsunadeLogTime.value = draft.time;
            this.elements.tsunadeLogTime.disabled = disabled;
        }

        if (this.elements.tsunadeLogWindowHours) {
            this.elements.tsunadeLogWindowHours.value =
                String(policy?.window_hours ?? 24);
            this.elements.tsunadeLogWindowHours.disabled = disabled;
        }

        if (this.elements.tsunadeLogMaxMiB) {
            this.elements.tsunadeLogMaxMiB.value = String(
                Math.max(
                    1,
                    Math.round(
                        (policy?.max_bytes_per_source ?? 2097152)
                        / 1048576,
                    ),
                ),
            );
            this.elements.tsunadeLogMaxMiB.disabled = disabled;
        }

        if (this.elements.tsunadeLogTimeout) {
            this.elements.tsunadeLogTimeout.value =
                String(policy?.timeout_seconds ?? 900);
            this.elements.tsunadeLogTimeout.disabled = disabled;
        }

        if (this.elements.tsunadeLogSources) {
            const selectedSources = new Set(
                policy?.sources ?? [],
            );
            const sources = policy?.sources?.length
                ? policy.sources
                : ["infra-01", "ha-01", "linky-01", "zwave-01"];
            this.elements.tsunadeLogSources.innerHTML = sources.map(
                (source) => `
                    <label class="configuration-check worker-log-source">
                        <input
                            data-tsunade-log-source="${escapeHtml(source)}"
                            type="checkbox"
                            ${selectedSources.has(source) ? "checked" : ""}
                            ${disabled ? "disabled" : ""}
                        >
                        ${escapeHtml(source)}
                    </label>
                `,
            ).join("");
        }

        if (this.elements.tsunadeLogSave) {
            this.elements.tsunadeLogSave.disabled = disabled;
        }
    },

    async saveTsunadeLogPolicy() {
        if (
            !this.tsunadeLogPolicy
            || !this.tsunadeLogPolicyWriteAvailable
        ) {
            return;
        }

        const [
            hour,
            minute,
        ] = this.value("tsunade-log-time").split(":").map(Number);
        const sources = Array.from(
            this.elements.tsunadeLogSources?.querySelectorAll(
                "[data-tsunade-log-source]",
            ) ?? [],
        )
            .filter((element) => element.checked)
            .map((element) => element.dataset.tsunadeLogSource);

        hideError(this.elements.error);

        try {
            this.tsunadeLogPolicy = await requestJson(
                API.tsunadeLogPolicy,
                {
                    method: "PUT",
                    body: JSON.stringify({
                        enabled: this.checked("tsunade-log-enabled"),
                        schedule: `${minute} ${hour} * * *`,
                        sources,
                        window_hours: Number(
                            this.value("tsunade-log-window-hours"),
                        ),
                        max_bytes_per_source:
                            Number(this.value("tsunade-log-max-mib"))
                            * 1048576,
                        timeout_seconds: Number(
                            this.value("tsunade-log-timeout"),
                        ),
                    }),
                },
            );
            this.tsunadeLogPolicyLoadError = null;
            this.renderTsunadeLogPolicy();
            this.showNotice(
                "Contrôles de journaux enregistrés.",
            );
        } catch (error) {
            showError(
                this.elements.error,
                "Impossible d’enregistrer les contrôles de journaux : "
                + this.errorMessage(error),
            );
            this.renderTsunadeLogPolicy();
        }
    },

    renderWorkers() {
        const table = this.elements.workersTable;
        if (!table) {
            return;
        }
        if (this.workerPairingsLoadError) {
            this.clearWorkerAvailabilityRefresh();
            table.innerHTML = `<tr><td colspan="8">${escapeHtml(this.workerPairingsLoadError)}</td></tr>`;
            return;
        }
        if (!this.workers.length) {
            this.clearWorkerAvailabilityRefresh();
            table.innerHTML = '<tr><td colspan="8">Aucun worker enregistré.</td></tr>';
            this.elements.workerAvailabilitySummary.textContent = "UNAVAILABLE";
            this.elements.workerWakeSummary.textContent = "aucun worker connu";
            return;
        }
        const primary = this.workers[0];
        this.elements.workerAvailabilitySummary.textContent = primary.availability;
        this.elements.workerWakeSummary.textContent = primary.woken_by_ohana
            ? "réveillé par Ohana"
            : "démarrage non déclenché par Ohana";
        table.innerHTML = this.workers.map((worker) => {
            const lastSeen = worker.last_seen_at
                ? new Date(worker.last_seen_at).toLocaleString("fr-FR")
                : "Jamais";
            const lastWake = worker.wake_requested_at
                ? new Date(worker.wake_requested_at).toLocaleString("fr-FR")
                : "—";
            const wake = worker.woken_by_ohana ? "Ohana" : "Humain / système";
            const mac = worker.wake_on_lan_mac_address ?? "Non détectée";
            const canWake = this.workerWakeAvailable
                && this.workerWakeOnLan?.enabled
                && worker.availability === "UNAVAILABLE"
                && Boolean(worker.wake_on_lan_mac_address);
            let wakeAction = "—";
            if (worker.availability === "WAKING") {
                wakeAction = '<button class="configuration-secondary-button" type="button" disabled>Réveil en cours</button>';
            } else if (worker.availability === "AVAILABLE") {
                wakeAction = '<button class="configuration-secondary-button" type="button" disabled>Déjà disponible</button>';
            } else if (canWake) {
                wakeAction = `<button class="configuration-secondary-button" data-worker-wake="${escapeHtml(worker.worker_id)}" type="button">Tester le réveil</button>`;
            } else if (!worker.wake_on_lan_mac_address) {
                wakeAction = "MAC WOL indisponible";
            } else if (!this.workerWakeOnLan?.enabled) {
                wakeAction = "WOL désactivé";
            }
            return `<tr>
                <td><strong>${escapeHtml(worker.worker_id)}</strong><small>${escapeHtml(worker.platform)} · ${escapeHtml(worker.worker_version)}</small></td>
                <td><strong>${escapeHtml(worker.availability)}</strong></td>
                <td><code>${escapeHtml(mac)}</code></td>
                <td>${escapeHtml(wake)}</td>
                <td>${escapeHtml(lastWake)}</td>
                <td>${escapeHtml(lastSeen)}</td>
                <td>${escapeHtml((worker.capabilities ?? []).join(", "))}</td>
                <td>${wakeAction}</td>
            </tr>`;
        }).join("");
        this.watchWakingWorkers();
    },

    async testWorkerWake(workerId) {
        if (!workerId || !this.workerWakeAvailable) {
            return;
        }
        const worker = this.workers.find(
            (candidate) => candidate.worker_id === workerId,
        );
        if (!worker || worker.availability !== "UNAVAILABLE") {
            return;
        }
        try {
            const result = await requestJson(
                API.administrationWorkerWake(workerId),
                { method: "POST" },
            );
            this.showNotice(
                `Wake-on-LAN envoyé à ${workerId}. État : ${result.availability ?? "WAKING"}.`,
            );
            this.resetWorkerAvailabilityRefreshDeadline();
            await this.refreshWorkerPairings();
        } catch (error) {
            showError(
                this.elements.error,
                `Impossible de réveiller ${workerId} : ${this.errorMessage(error)}`,
            );
        }
    },

    hasWakingWorker() {
        return this.workers.some(
            (worker) => worker.availability === "WAKING",
        );
    },

    resetWorkerAvailabilityRefreshDeadline() {
        const timeoutSeconds =
            this.workerWakeOnLan?.wait_timeout_seconds
            ?? 180;
        this.workerAvailabilityRefreshDeadline =
            Date.now() + timeoutSeconds * 1000;
    },

    clearWorkerAvailabilityRefresh() {
        if (this.workerAvailabilityRefreshTimer) {
            window.clearTimeout(
                this.workerAvailabilityRefreshTimer,
            );
            this.workerAvailabilityRefreshTimer = null;
        }
        this.workerAvailabilityRefreshDeadline = 0;
    },

    watchWakingWorkers() {
        if (
            !this.workerPairingsAvailable
            || !this.hasWakingWorker()
        ) {
            this.clearWorkerAvailabilityRefresh();
            return;
        }

        if (!this.workerAvailabilityRefreshDeadline) {
            this.resetWorkerAvailabilityRefreshDeadline();
        }

        if (
            Date.now()
            >= this.workerAvailabilityRefreshDeadline
        ) {
            this.clearWorkerAvailabilityRefresh();
            return;
        }

        if (this.workerAvailabilityRefreshTimer) {
            return;
        }

        this.workerAvailabilityRefreshTimer =
            window.setTimeout(
                async () => {
                    this.workerAvailabilityRefreshTimer = null;
                    if (!this.hasWakingWorker()) {
                        this.clearWorkerAvailabilityRefresh();
                        return;
                    }
                    await this.refreshWorkerPairings();
                    if (this.hasWakingWorker()) {
                        this.watchWakingWorkers();
                    }
                },
                this.workerAvailabilityRefreshIntervalMs,
            );
    },

    async decideWorkerPairing(pairingId, action) {
        if (!pairingId || !["approve", "reject"].includes(action)) {
            return;
        }
        const verb = action === "approve" ? "autoriser" : "refuser";
        const pairing = this.workerPairings.find(
            (candidate) => candidate.pairing_id === pairingId,
        );
        const securityDetail = pairing
            ? `\n\nCode : ${pairing.verification_code}\nSHA-256 : ${formatTlsFingerprint(pairing.tls_ca_sha256)}`
            : "";
        if (!window.confirm(`Confirmer : ${verb} cet appairage Katsuyu ?${securityDetail}`)) {
            return;
        }
        try {
            await requestJson(
                API.administrationWorkerPairingAction(pairingId, action),
                { method: "POST" },
            );
            this.showNotice(
                action === "approve"
                    ? "L’appairage est autorisé. Katsuyu peut maintenant récupérer son jeton."
                    : "La demande d’appairage a été refusée.",
            );
            await this.refreshWorkerPairings();
        } catch (error) {
            showError(
                this.elements.error,
                `Impossible de ${verb} l’appairage : ${this.errorMessage(error)}`,
            );
        }
    },
};
