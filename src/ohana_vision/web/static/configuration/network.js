"use strict";

import {
    API,
    fetchJson,
    requestJson,
} from "../api.js";

import {
    hideError,
    showError,
} from "../utils.js";

import {
    isIpv4Address,
} from "./shared.js";

/**
 * ConfigurationController methods: INFRA-01 network settings.
 */
export const NetworkMethods = {
    async refreshNetwork() {
        if (!this.networkAvailable) {
            return;
        }
        try {
            this.network = await fetchJson(API.administrationNetwork);
            this.networkLoadError = null;
            this.renderNetwork();
        } catch (error) {
            this.networkLoadError = this.errorMessage(error);
            showError(
                this.elements.error,
                "Réseau de l’Agent indisponible : " + this.networkLoadError,
            );
        }
    },

    renderNetwork() {
        const state = this.network;
        const enabled = Boolean(state && this.networkAvailable);
        this.setNetworkControlsEnabled(enabled);

        this.setText("network-interface-summary", state?.interface ?? "Indisponible");
        this.setText("network-connection-summary", state?.connection_name ?? "NetworkManager");
        this.setText("network-address-summary", state?.address ?? "—");
        this.setText(
            "network-method-summary",
            state?.method === "auto" ? "DHCP" : state ? "Adresse statique" : "—",
        );
        this.setText(
            "network-state-summary",
            state?.active ? "Connecté" : state ? "Déconnecté" : "Indisponible",
        );
        this.setText(
            "network-gateway-summary",
            state?.gateway ? `Passerelle ${state.gateway}` : "Aucune passerelle",
        );

        if (!state) {
            this.setValue("network-interface", "");
            return;
        }
        this.setValue("network-interface", state.interface ?? "");
        this.setValue("network-method", state.method ?? "manual");
        this.setValue("network-address", state.address ?? "");
        this.setValue("network-gateway", state.gateway ?? "");
        this.setValue("network-dns", (state.dns_servers ?? []).join(", "));
        this.updateNetworkMethodFields();
        this.renderNetworkPendingChange(state.pending_change);
    },

    setNetworkControlsEnabled(enabled) {
        this.elements.networkForm
            ?.querySelectorAll("input, select, button")
            .forEach((control) => {
                control.disabled = !enabled;
            });
    },

    updateNetworkMethodFields() {
        const manual = this.value("network-method") !== "auto";
        this.elements.networkManualFields.forEach((field) => {
            field.hidden = !manual;
            field.querySelectorAll("input").forEach((input) => {
                input.required = manual;
            });
        });
    },

    renderNetworkPendingChange(pending) {
        const visible = Boolean(pending?.transaction_id);
        this.elements.networkPendingChange?.classList.toggle("hidden", !visible);
        this.elements.networkPendingActions?.classList.toggle("hidden", !visible);
        if (!visible) {
            if (this.elements.networkPendingChange) {
                this.elements.networkPendingChange.textContent = "";
            }
            return;
        }
        const requestedAddress = pending.requested?.address ?? "la nouvelle adresse";
        this.elements.networkPendingChange.textContent =
            `Modification en attente pour ${requestedAddress}. `
            + `Retour automatique prévu à ${new Date(pending.expires_at).toLocaleTimeString("fr-FR")}.`;
    },

    networkPayload() {
        const method = this.value("network-method");
        return {
            schema_version: 1,
            rollback_seconds: Number(this.value("network-rollback-seconds")),
            settings: {
                interface: this.value("network-interface").trim(),
                method,
                address: method === "manual"
                    ? this.value("network-address").trim()
                    : null,
                gateway: method === "manual"
                    ? this.value("network-gateway").trim()
                    : null,
                dns_servers: method === "manual"
                    ? this.listValue("network-dns")
                    : [],
            },
        };
    },

    async saveNetworkSettings() {
        const payload = this.networkPayload();
        const currentAddress = this.network?.address ?? null;
        const nextAddress = payload.settings.address;
        if (!window.confirm(
            "Appliquer cette configuration réseau ? La connexion peut être interrompue. "
            + "L’ancienne configuration sera restaurée automatiquement sans confirmation.",
        )) {
            return;
        }
        hideError(this.elements.error);
        const redirectUrl = this.networkRedirectUrl(nextAddress);
        try {
            const change = await requestJson(
                API.administrationNetwork,
                {
                    method: "PUT",
                    body: JSON.stringify(payload),
                },
            );
            this.network = change.state;
            this.network.pending_change = {
                transaction_id: change.transaction_id,
                expires_at: change.expires_at,
                requested: payload.settings,
            };
            this.renderNetwork();
            this.showNotice(
                "La configuration a été appliquée. Reconnectez-vous et confirmez avant le retour automatique.",
            );
            if (redirectUrl && nextAddress !== currentAddress) {
                window.setTimeout(() => window.location.assign(redirectUrl), 1500);
            }
        } catch (error) {
            const message = this.errorMessage(error);
            if (redirectUrl && /failed to fetch|networkerror|réseau/i.test(message)) {
                window.setTimeout(() => window.location.assign(redirectUrl), 1500);
                return;
            }
            showError(this.elements.error, "Modification réseau refusée : " + message);
        }
    },

    networkRedirectUrl(address) {
        if (!address) {
            return null;
        }
        const host = String(address).split("/", 1)[0];
        if (!isIpv4Address(host)) {
            return null;
        }
        const port = window.location.port ? `:${window.location.port}` : "";
        return `${window.location.protocol}//${host}${port}/#configuration-network`;
    },

    async confirmNetworkChange() {
        const transactionId = this.network?.pending_change?.transaction_id;
        if (!transactionId) {
            return;
        }
        try {
            this.network = await requestJson(
                API.administrationNetworkConfirm(transactionId),
                { method: "POST" },
            );
            this.renderNetwork();
            this.showNotice("La nouvelle configuration réseau est confirmée.");
        } catch (error) {
            showError(this.elements.error, "Confirmation impossible : " + this.errorMessage(error));
        }
    },

    async rollbackNetworkChange() {
        const transactionId = this.network?.pending_change?.transaction_id;
        if (!transactionId || !window.confirm("Restaurer immédiatement l’ancienne configuration réseau ?")) {
            return;
        }
        try {
            this.network = await requestJson(
                API.administrationNetworkRollback(transactionId),
                { method: "POST" },
            );
            this.renderNetwork();
            this.showNotice("L’ancienne configuration réseau a été restaurée.");
        } catch (error) {
            showError(this.elements.error, "Restauration impossible : " + this.errorMessage(error));
        }
    },
};
