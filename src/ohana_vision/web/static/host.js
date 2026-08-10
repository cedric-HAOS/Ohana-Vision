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

const RESOURCE_THRESHOLDS = Object.freeze({
    cpu: [85, 95],
    memory: [85, 95],
    swap: [50, 80],
    disk: [85, 95],
    temperature: [75, 82],
});

export class HostController {
    constructor() {
        this.loaded = false;
        this.elements = {
            view: document.querySelector("#host-supervision"),
            error: document.querySelector("#host-error"),
            state: document.querySelector("#host-state"),
            stateVisual: document.querySelector("#host-state-visual"),
            stateLabel: document.querySelector("#host-state-label"),
            stateMessage: document.querySelector("#host-state-message"),
            hostname: document.querySelector("#host-hostname"),
            platform: document.querySelector("#host-platform"),
            updated: document.querySelector("#host-updated"),
            availabilityLabel: document.querySelector("#host-availability-label"),
            diagnosticState: document.querySelector("#host-diagnostic-state"),
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
        this.meterElements = new Map(
            Array.from(
                document.querySelectorAll("[data-host-meter]"),
            ).map((element) => [
                element.dataset.hostMeter,
                element,
            ]),
        );
        this.contextElements = new Map(
            Array.from(
                document.querySelectorAll("[data-host-context]"),
            ).map((element) => [
                element.dataset.hostContext,
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
        const requestedState = String(snapshot?.state ?? "unknown").toLowerCase();
        const state = Object.hasOwn(STATUS_LABELS, requestedState)
            ? requestedState
            : "unknown";
        const reasons = Array.isArray(snapshot?.reasons) ? snapshot.reasons : [];
        const failedUnits = Array.isArray(snapshot?.failed_systemd_units)
            ? snapshot.failed_systemd_units
            : [];

        if (this.elements.state) {
            this.elements.state.dataset.status = state;
        }
        if (this.elements.stateVisual) {
            this.elements.stateVisual.setAttribute(
                "aria-label",
                `État de santé ${STATUS_LABELS[state].toLowerCase()}`,
            );
        }
        if (this.elements.stateLabel) {
            this.elements.stateLabel.textContent = STATUS_LABELS[state];
        }
        if (this.elements.stateMessage) {
            this.elements.stateMessage.textContent = this.statusMessage(
                state,
                reasons,
            );
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
            this.elements.updated.textContent = `Mesuré ${this.formatDate(
                snapshot?.observed_at ?? snapshot?.updated_at,
            )}`;
        }

        this.renderResources(snapshot);
        this.renderAvailability(snapshot);
        this.renderDiagnostic(state, reasons, failedUnits);
    }

    renderResources(snapshot) {
        this.setMetric("cpu", this.percent(snapshot?.cpu_percent));
        this.setMetric("load", this.number(snapshot?.load_1m_per_cpu, 2));
        this.setMetric("memory", this.percent(snapshot?.memory_percent));
        this.setMetric("swap", this.percent(snapshot?.swap_percent));
        this.setMetric("disk", this.percent(snapshot?.disk_percent));
        this.setMetric("temperature", this.temperature(snapshot?.temperature_c));

        this.setMeter("cpu", snapshot?.cpu_percent);
        this.setMeter("memory", snapshot?.memory_percent);
        this.setMeter("disk", snapshot?.disk_percent);
        this.setMeter("temperature", snapshot?.temperature_c);

        const cpuCount = Number(snapshot?.cpu_count);
        this.setContext(
            "cpu",
            Number.isFinite(cpuCount) && cpuCount > 0
                ? `${cpuCount} cœur${cpuCount > 1 ? "s" : ""} · utilisation actuelle`
                : "Utilisation actuelle",
        );
        this.setContext(
            "memory",
            this.availableContext(snapshot?.memory_available_bytes, "disponible"),
        );
        this.setContext(
            "disk",
            this.availableContext(snapshot?.disk_free_bytes, "libre"),
        );
        this.setContext(
            "temperature",
            this.temperatureContext(snapshot?.temperature_c),
        );
        this.setContext(
            "swap",
            this.resourceContext("swap", snapshot?.swap_percent),
        );
    }

    renderAvailability(snapshot) {
        const restarts = Number(snapshot?.agent_restarts);
        const restartValue = Number.isFinite(restarts)
            ? this.number(restarts, 0)
            : "Inconnu";
        this.setMetric("host-uptime", snapshot?.host_uptime ?? "Inconnu");
        this.setMetric("agent-uptime", snapshot?.agent_uptime ?? "Inconnu");
        this.setMetric("agent-restarts", restartValue);
        this.setMetric("agent-restarts-summary", restartValue);
        this.setContext(
            "agent-restarts",
            Number.isFinite(restarts) && restarts === 0
                ? "Aucune interruption détectée"
                : "Depuis le démarrage",
        );

        if (this.elements.availabilityLabel) {
            this.elements.availabilityLabel.textContent = Number.isFinite(restarts)
                && restarts === 0
                ? "Stable depuis le dernier démarrage"
                : "Continuité de l’Agent sous surveillance";
        }
    }

    renderDiagnostic(state, reasons, failedUnits) {
        this.renderList(
            this.elements.reasons,
            reasons,
            (reason) => REASON_LABELS[reason] ?? reason,
            "Aucune alerte active",
        );
        this.renderList(
            this.elements.failedUnits,
            failedUnits,
            (unit) => unit,
            "Aucune unité Ohana en échec",
        );

        if (!this.elements.diagnosticState) {
            return;
        }
        if (state === "healthy" && reasons.length === 0 && failedUnits.length === 0) {
            this.elements.diagnosticState.textContent = "RAS";
            return;
        }
        const issueCount = reasons.length + failedUnits.length;
        this.elements.diagnosticState.textContent = issueCount > 0
            ? `${issueCount} anomalie${issueCount > 1 ? "s" : ""}`
            : "Indéterminé";
    }

    setMetric(name, value) {
        const element = this.metricElements.get(name);
        if (element) {
            element.textContent = value;
        }
    }

    setMeter(name, value) {
        const element = this.meterElements.get(name);
        if (!element) {
            return;
        }
        const number = Number(value);
        const bounded = Number.isFinite(number)
            ? Math.min(Math.max(number, 0), 100)
            : 0;
        element.style.setProperty("--host-value", `${bounded}%`);
        element.style.setProperty(
            "--host-meter-color",
            this.resourceColor(name, number),
        );
    }

    setContext(name, value) {
        const element = this.contextElements.get(name);
        if (element) {
            element.textContent = value;
        }
    }

    statusMessage(state, reasons) {
        if (state === "healthy") {
            return "Tous les indicateurs sont dans leur plage nominale";
        }
        if (state === "unknown") {
            return "L’état de santé ne peut pas encore être déterminé";
        }
        const firstReason = reasons[0];
        return firstReason
            ? REASON_LABELS[firstReason] ?? firstReason
            : state === "critical"
                ? "Une condition critique affecte l’hôte"
                : "L’hôte fonctionne en mode dégradé";
    }

    resourceColor(name, value) {
        const thresholds = RESOURCE_THRESHOLDS[name];
        if (!Number.isFinite(value) || !thresholds) {
            return "var(--ohana-health-unknown)";
        }
        if (value >= thresholds[1]) {
            return "var(--ohana-health-critical)";
        }
        if (value >= thresholds[0]) {
            return "var(--ohana-health-degraded)";
        }
        return "var(--ohana-brand-primary)";
    }

    resourceContext(name, value) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return "Mesure indisponible";
        }
        const color = this.resourceColor(name, number);
        if (color.includes("critical")) {
            return "Seuil critique dépassé";
        }
        if (color.includes("degraded")) {
            return "Seuil d’alerte dépassé";
        }
        return "Dans la plage nominale";
    }

    availableContext(value, suffix) {
        const formatted = this.bytes(value);
        return formatted === "Inconnu"
            ? "Capacité disponible inconnue"
            : `${formatted} ${suffix}`;
    }

    temperatureContext(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return "Sonde non renseignée";
        }
        if (number >= 82) {
            return "Seuil critique de 82 °C dépassé";
        }
        if (number >= 75) {
            return "Seuil d’alerte de 75 °C dépassé";
        }
        return "Sous le seuil d’alerte de 75 °C";
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

    bytes(value) {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0) {
            return "Inconnu";
        }
        const units = ["o", "Kio", "Mio", "Gio", "Tio"];
        let scaled = number;
        let unitIndex = 0;
        while (scaled >= 1024 && unitIndex < units.length - 1) {
            scaled /= 1024;
            unitIndex += 1;
        }
        const digits = scaled >= 10 || unitIndex === 0 ? 0 : 1;
        return `${this.number(scaled, digits)} ${units[unitIndex]}`;
    }

    formatDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? "à une date inconnue"
            : `le ${date.toLocaleString("fr-FR")}`;
    }
}
