"use strict";

import { API, fetchJson, requestJson } from "../api.js";
import { escapeHtml, showError } from "../utils.js";

const attribute = (value) => escapeHtml(value).replaceAll('"', "&quot;");

export const AdGuardSyncMethods = {
    async refreshAdGuardSync() {
        try {
            this.adguardSync = await fetchJson(API.administrationAdGuardSync);
            this.adguardSyncError = null;
        } catch (error) {
            this.adguardSync = null;
            this.adguardSyncError = this.errorMessage(error);
        }
    },

    adGuardCapabilityFields() {
        const capability = this.adguardSync;
        if (!capability) {
            return `<section class="configuration-card" data-adguard-capability><h3>Moteur de synchronisation</h3>
                <p>${escapeHtml(this.adguardSyncError || "Administration du moteur indisponible. Mettre à jour Agent et Installer.")}</p></section>`;
        }
        const state = !capability.installed ? "À installer avec Ohana-Installer"
            : capability.active ? "Planification active"
                : capability.enabled ? "Timer activé, mais inactif" : "Synchronisation désactivée";
        const instances = [ ["origin", "Origine"], ["replica", "Réplique"] ].map(([role, label]) => {
            const instance = capability[role] || {};
            return `<fieldset class="adguard-instance"><legend>${label}</legend>
                <label>Adresse du serveur AdGuard <input id="adguard-${role}-url" type="url" value="${attribute(instance.url || "")}" required ${(capability.active || capability.running) ? "disabled" : ""}></label>
                <label>Utilisateur <input id="adguard-${role}-username" type="text" autocomplete="off" value="${attribute(instance.username || "")}" required ${(capability.active || capability.running) ? "disabled" : ""}></label>
                <label>Mot de passe <input id="adguard-${role}-password" type="password" autocomplete="new-password" value="" placeholder="${instance.password_configured ? "Déjà enregistré ; vide pour conserver" : "À renseigner"}" ${(capability.active || capability.running) ? "disabled" : ""}></label>
            </fieldset>`;
        }).join("");
        return `<section class="configuration-card" data-adguard-capability>
            <h3>Moteur de synchronisation</h3><p>${escapeHtml(state)}</p>
            <p>L’activation copie les paramètres de l’origine vers la réplique. Désactivez le moteur avant de modifier ses accès. Les mots de passe enregistrés restent masqués.</p>
            <div class="configuration-form-grid">${instances}</div>
            <button class="button" type="button" id="adguard-save-access" ${!capability.installed || (capability.active || capability.running) ? "disabled" : ""}>Enregistrer et vérifier les accès</button>
            <button class="configuration-secondary-button" type="button" id="adguard-toggle" ${!capability.installed && !capability.active && !capability.enabled ? "disabled" : ""}>${capability.active || capability.enabled ? "Désactiver la synchronisation" : "Activer la synchronisation"}</button>
            <p>La surveillance ci-dessous reste indépendante du moteur.</p>
        </section>`;
    },

    renderAdGuardCapability() {
        const section = this.elements.pluginInspectorContent?.querySelector("[data-adguard-capability]");
        if (section) section.outerHTML = this.adGuardCapabilityFields();
        this.bindAdGuardCapability();
    },

    bindAdGuardCapability() {
        document.querySelectorAll("[data-adguard-capability] input").forEach((input) => {
            input.addEventListener("input", () => { this.adguardAccessDirty = true; });
        });
        document.getElementById("adguard-save-access")?.addEventListener("click", () => {
            void this.saveAdGuardAccess();
        });
        document.getElementById("adguard-toggle")?.addEventListener("click", () => {
            void this.toggleAdGuardSync();
        });
    },

    adGuardAccessPayload() {
        return Object.fromEntries(["origin", "replica"].map((role) => [role, {
            url: this.value(`adguard-${role}-url`).trim(),
            username: this.value(`adguard-${role}-username`),
            password: this.value(`adguard-${role}-password`),
        }]));
    },

    async saveAdGuardAccess() {
        if (!window.confirm("Enregistrer et vérifier les accès aux deux instances AdGuard ?")) return;
        const button = document.getElementById("adguard-save-access");
        if (button) button.disabled = true;
        try {
            this.adguardSync = await requestJson(API.administrationAdGuardSync, {
                method: "PUT", body: JSON.stringify(this.adGuardAccessPayload()),
            });
            this.adguardAccessDirty = false;
            this.renderAdGuardCapability();
        } catch (error) {
            showError(this.elements.error, this.errorMessage(error));
        } finally {
            if (button) button.disabled = false;
        }
    },

    async toggleAdGuardSync() {
        if (this.adguardAccessDirty) {
            showError(this.elements.error, "Enregistrer les accès AdGuard avant l’activation.");
            return;
        }
        const enabled = !(this.adguardSync?.active || this.adguardSync?.enabled);
        if (!window.confirm(enabled
            ? "Activer la synchronisation ? Les paramètres de l’origine seront copiés vers la réplique après validation des accès."
            : "Arrêter le timer et le cycle de synchronisation AdGuard ?")) return;
        const button = document.getElementById("adguard-toggle");
        if (button) button.disabled = true;
        try {
            this.adguardSync = await requestJson(`${API.administrationAdGuardSync}/activation`, {
                method: "PUT", body: JSON.stringify({ enabled }),
            });
            this.renderAdGuardCapability();
        } catch (error) {
            showError(this.elements.error, this.errorMessage(error));
        } finally {
            if (button) button.disabled = false;
        }
    },
};
