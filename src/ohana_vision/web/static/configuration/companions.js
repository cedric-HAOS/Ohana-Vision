"use strict";

import {
    API,
    fetchJson,
    requestJson,
} from "../api.js";

import {
    escapeHtml,
    showError,
} from "../utils.js";

/**
 * ConfigurationController methods: Shizune companion pairings.
 */
export const CompanionsMethods = {
    async refreshCompanions() {
        if (!this.companionsAvailable) {
            this.renderCompanions();
            return;
        }
        try {
            const [pairings, companions] = await Promise.all([
                fetchJson(API.administrationCompanionPairings),
                fetchJson(API.administrationCompanions),
            ]);
            this.companionPairings = pairings.pairings ?? [];
            this.companions = companions.devices ?? [];
            this.companionsLoadError = null;
        } catch (error) {
            this.companionsLoadError = this.errorMessage(error);
        }
        this.renderCompanions();
    },

    renderCompanions() {
        const pairingTable = this.elements.companionPairingsTable;
        const devicesTable = this.elements.companionsTable;
        if (!pairingTable || !devicesTable) {
            return;
        }
        const pending = this.companionPairings.filter(
            (pairing) => pairing.status === "PENDING",
        );
        if (this.elements.companionPairingsPendingCount) {
            this.elements.companionPairingsPendingCount.textContent =
                String(pending.length);
        }
        if (this.companionsLoadError) {
            const message = escapeHtml(this.companionsLoadError);
            pairingTable.innerHTML = `<tr><td colspan="6">${message}</td></tr>`;
            devicesTable.innerHTML = `<tr><td colspan="5">${message}</td></tr>`;
            return;
        }
        pairingTable.innerHTML = pending.length
            ? pending.map((pairing) => {
                const id = escapeHtml(pairing.pairing_id);
                const expires = new Date(pairing.expires_at)
                    .toLocaleString("fr-FR");
                const fingerprint = String(pairing.tls_ca_sha256 ?? "");
                const shortFingerprint = fingerprint.slice(0, 16)
                    .match(/.{1,4}/g)?.join(" ") ?? "indisponible";
                return `<tr>
                    <td><strong>${escapeHtml(pairing.device_name)}</strong><small>${escapeHtml(pairing.device_id)}</small></td>
                    <td><strong>${escapeHtml(pairing.verification_code)}</strong></td>
                    <td title="${escapeHtml(fingerprint)}"><code>${escapeHtml(shortFingerprint)}</code></td>
                    <td>${escapeHtml(pairing.platform)} · ${escapeHtml(pairing.app_version)}</td>
                    <td>${escapeHtml(expires)}</td>
                    <td><span class="configuration-table__actions">
                        <button class="button" data-companion-pairing-action="approve" data-companion-pairing-id="${id}" type="button">Autoriser</button>
                        <button class="configuration-danger-button" data-companion-pairing-action="reject" data-companion-pairing-id="${id}" type="button">Refuser</button>
                    </span></td>
                </tr>`;
            }).join("")
            : '<tr><td colspan="6">Aucune demande Shizune en attente.</td></tr>';
        devicesTable.innerHTML = this.companions.length
            ? this.companions.map((device) => {
                const lastSeen = device.last_seen_at
                    ? new Date(device.last_seen_at).toLocaleString("fr-FR")
                    : "Jamais";
                const expires = new Date(device.expires_at).toLocaleString("fr-FR");
                const active = !device.revoked_at
                    && new Date(device.expires_at) > new Date();
                return `<tr>
                    <td><strong>${escapeHtml(device.device_name)}</strong><small>${escapeHtml(device.device_id)}</small></td>
                    <td>${active ? "Active" : "Révoquée / expirée"}</td>
                    <td>${escapeHtml(lastSeen)}</td>
                    <td>${escapeHtml(expires)}</td>
                    <td>${active ? `<button class="configuration-danger-button" data-companion-revoke="${escapeHtml(device.device_id)}" type="button">Révoquer</button>` : "—"}</td>
                </tr>`;
            }).join("")
            : '<tr><td colspan="5">Aucun iPhone associé.</td></tr>';
    },

    async decideCompanionPairing(pairingId, action) {
        if (!pairingId || !["approve", "reject"].includes(action)) {
            return;
        }
        const pairing = this.companionPairings.find(
            (candidate) => candidate.pairing_id === pairingId,
        );
        const verb = action === "approve" ? "autoriser" : "refuser";
        if (!window.confirm(
            `Confirmer : ${verb} cet iPhone Shizune ?\n\nCode : ${pairing?.verification_code ?? "inconnu"}\nEmpreinte : ${String(pairing?.tls_ca_sha256 ?? "").slice(0, 16).match(/.{1,4}/g)?.join(" ") ?? "indisponible"}`,
        )) {
            return;
        }
        try {
            await requestJson(
                API.administrationCompanionPairingAction(pairingId, action),
                { method: "POST" },
            );
            this.showNotice(
                action === "approve"
                    ? "L’iPhone est autorisé à récupérer son jeton Shizune limité."
                    : "La demande Shizune a été refusée.",
            );
            await this.refreshCompanions();
        } catch (error) {
            showError(
                this.elements.error,
                `Impossible de ${verb} l’iPhone : ${this.errorMessage(error)}`,
            );
        }
    },

    async revokeCompanion(deviceId) {
        if (!deviceId || !window.confirm(
            "Révoquer immédiatement cette session Shizune ?",
        )) {
            return;
        }
        try {
            await requestJson(API.administrationCompanionRevoke(deviceId), {
                method: "POST",
            });
            this.showNotice("La session Shizune et son jeton APNs sont révoqués.");
            await this.refreshCompanions();
        } catch (error) {
            showError(
                this.elements.error,
                `Impossible de révoquer la session : ${this.errorMessage(error)}`,
            );
        }
    },
};
