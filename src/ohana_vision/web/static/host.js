"use strict";

import {
    API,
    fetchJson,
} from "./api.js";

const STATUS_LABELS = Object.freeze({
    healthy: "Sain",
    degraded: "Dégradé",
    critical: "Critique",
    unknown: "Inconnu",
});

const REASON_LABELS = Object.freeze({
    cpu_degraded: "CPU fortement utilisé",
    cpu_critical: "CPU saturé",
    load_degraded: "Charge élevée",
    load_critical: "Charge critique",
    memory_degraded: "Mémoire fortement utilisée",
    memory_critical: "Mémoire saturée",
    swap_degraded: "Swap fortement utilisé",
    swap_critical: "Swap saturé",
    disk_degraded: "Disque presque plein",
    disk_critical: "Disque saturé",
    temperature_degraded: "Température élevée",
    temperature_critical: "Température critique",
    agent_restarts_degraded: "Redémarrages Agent détectés",
    agent_restarts_critical: "Boucle de redémarrage Agent",
    systemd_units_failed: "Unités systemd Ohana en échec",
});

export class HostController {
    constructor() {
        this.loaded = false;
        this.elements = {
            view: document.querySelector("#host-supervision"),
            error: document.querySelector("#host-error"),
            state: document.querySelector("#host-state"),
            stateLabel: document.querySelector("#host-state-label"),
            hostname: document.querySelector("#host-hostname"),
            platform: document.querySelector("#host-platform"),
            updated: document.querySelector("#host-updated"),
            reasons: document.querySelector("#host-reasons"),
            failedUnits: document.querySelector("#host-failed-units"),
        };

        this.metricElements = new Map(
            Array.from(
                document.querySelectorAll("[data-host-metric]"),
            ).map((element) => [
                element.dataset.hostMetric,
                element,
            ]),
        );
    }

    async load() {
        try {
            const snapshot = await fetchJson(API.hostHealth);
            this.render(snapshot);
            this.loaded = true;
        } catch (error) {
            this.showError(
                `Santé de l’hôte indisponible : ${error.message ?? error}`,
            );
        }
    }

    render(snapshot) {
        this.hideError();
        const state = String(snapshot?.state ?? "unknown").toLowerCase();

        if (this.elements.state) {
            this.elements.state.dataset.status = state;
        }
        if (this.elements.stateLabel) {
            this.elements.stateLabel.textContent = STATUS_LABELS[state]
                ?? STATUS_LABELS.unknown;
        }
        if (this.elements.hostname) {
            this.elements.hostname.textContent = snapshot?.hostname ?? "—";
        }
        if (this.elements.platform) {
            const operatingSystem = snapshot?.operating_system ?? "—";
            const kernel = snapshot?.kernel ?? "";
            this.elements.platform.textContent = [operatingSystem, kernel]
                .filter(Boolean)
                .join(" · ");
        }
        if (this.elements.updated) {
            this.elements.updated.textContent = this.formatDate(
                snapshot?.observed_at ?? snapshot?.updated_at,
            );
        }

        this.setMetric("cpu", this.percent(snapshot?.cpu_percent));
        this.setMetric("load", this.number(snapshot?.load_1m_per_cpu, 2));
        this.setMetric("memory", this.percent(snapshot?.memory_percent));
        this.setMetric("swap", this.percent(snapshot?.swap_percent));
        this.setMetric("disk", this.percent(snapshot?.disk_percent));
        this.setMetric("temperature", this.temperature(snapshot?.temperature_c));
        this.setMetric("host-uptime", snapshot?.host_uptime ?? "Inconnu");
        this.setMetric("agent-uptime", snapshot?.agent_uptime ?? "Inconnu");
        this.setMetric("agent-restarts", this.number(snapshot?.agent_restarts, 0));

        this.renderList(
            this.elements.reasons,
            snapshot?.reasons,
            (reason) => REASON_LABELS[reason] ?? reason,
            "Aucune alerte active",
        );
        this.renderList(
            this.elements.failedUnits,
            snapshot?.failed_systemd_units,
            (unit) => unit,
            "Aucune unité Ohana en échec",
        );
    }

    setMetric(name, value) {
        const element = this.metricElements.get(name);
        if (element) {
            element.textContent = value;
        }
    }

    renderList(element, values, label, emptyLabel) {
        if (!element) {
            return;
        }
        element.replaceChildren();
        const entries = Array.isArray(values) ? values : [];
        if (entries.length === 0) {
            const item = document.createElement("li");
            item.className = "host-list__empty";
            item.textContent = emptyLabel;
            element.append(item);
            return;
        }
        entries.forEach((value) => {
            const item = document.createElement("li");
            item.textContent = label(String(value));
            element.append(item);
        });
    }

    showError(message) {
        if (!this.elements.error) {
            return;
        }
        this.elements.error.textContent = message;
        this.elements.error.classList.remove("hidden");
    }

    hideError() {
        this.elements.error?.classList.add("hidden");
    }

    number(value, digits) {
        const number = Number(value);
        return Number.isFinite(number)
            ? number.toLocaleString("fr-FR", {
                minimumFractionDigits: digits,
                maximumFractionDigits: digits,
            })
            : "Inconnu";
    }

    percent(value) {
        const formatted = this.number(value, 1);
        return formatted === "Inconnu" ? formatted : `${formatted} %`;
    }

    temperature(value) {
        const formatted = this.number(value, 1);
        return formatted === "Inconnu" ? formatted : `${formatted} °C`;
    }

    formatDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? "Inconnue"
            : date.toLocaleString("fr-FR");
    }
}
