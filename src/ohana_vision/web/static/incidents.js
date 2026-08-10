"use strict";

import {
    API,
    fetchJson,
    requestJson,
} from "./api.js";

import {
    escapeHtml,
    formatDate,
} from "./utils.js";

const STATUS_LABELS = Object.freeze({
    degraded: "Dégradé",
    stale: "Données obsolètes",
    unavailable: "Indisponible",
});

/** Operate and render the persistent incident history. */
export class IncidentsController {
    constructor({state}) {
        this.state = state;
        this.incidents = [];
        this.filter = "active";
        this.loaded = false;

        this.elements = {
            error: document.querySelector("#incidents-error"),
            list: document.querySelector("#incidents-list"),
            activeCount: document.querySelector("#incidents-active-count"),
            unacknowledgedCount: document.querySelector(
                "#incidents-unacknowledged-count",
            ),
            silencedCount: document.querySelector(
                "#incidents-silenced-count",
            ),
            resolvedCount: document.querySelector(
                "#incidents-resolved-count",
            ),
            filters: Array.from(
                document.querySelectorAll("[data-incidents-filter]"),
            ),
        };
    }

    initialize() {
        this.elements.filters.forEach((button) => {
            button.addEventListener("click", () => {
                this.filter = button.dataset.incidentsFilter ?? "active";
                this.render();
            });
        });

        this.elements.list?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-incident-action]");

            if (!button) {
                return;
            }

            void this.performAction(
                button.dataset.incidentAction,
                button.dataset.incidentId,
                button,
            );
        });
    }

    async load() {
        this.showError("");

        try {
            const payload = await fetchJson(
                `${API.incidents}?state=all&limit=200`,
            );
            this.incidents = Array.isArray(payload) ? payload : [];
            this.loaded = true;
            this.render();
        } catch (error) {
            this.showError(
                `Incidents indisponibles : ${this.errorMessage(error)}`,
            );
        }
    }

    render() {
        this.renderSummary();
        this.elements.filters.forEach((button) => {
            const active = button.dataset.incidentsFilter === this.filter;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });

        if (!this.elements.list) {
            return;
        }

        const visible = this.incidents.filter((incident) => {
            return this.filter === "all" || incident.state === this.filter;
        });

        if (!this.loaded) {
            this.elements.list.innerHTML = `
                <div class="incidents-empty-state">
                    <span class="incidents-loading-indicator" aria-hidden="true"></span>
                    <h3>Chargement des incidents…</h3>
                </div>
            `;
            return;
        }

        if (visible.length === 0) {
            this.elements.list.innerHTML = `
                <div class="incidents-empty-state">
                    <h3>Aucun incident ${this.filter === "active" ? "actif" : "résolu"}</h3>
                    <p>Les dégradations détectées apparaîtront ici avec leur contexte.</p>
                </div>
            `;
            return;
        }

        this.elements.list.innerHTML = visible
            .map((incident) => this.incidentCard(incident))
            .join("");
    }

    renderSummary() {
        const now = Date.now();
        const active = this.incidents.filter(
            (incident) => incident.state === "active",
        );
        const unacknowledged = active.filter(
            (incident) => !incident.acknowledged_at,
        );
        const silenced = active.filter((incident) => {
            return this.isSilenced(incident, now);
        });
        const resolved = this.incidents.filter(
            (incident) => incident.state === "resolved",
        );

        this.setCount(this.elements.activeCount, active.length);
        this.setCount(
            this.elements.unacknowledgedCount,
            unacknowledged.length,
        );
        this.setCount(this.elements.silencedCount, silenced.length);
        this.setCount(this.elements.resolvedCount, resolved.length);
    }

    incidentCard(incident) {
        const active = incident.state === "active";
        const silenced = active && this.isSilenced(incident);
        const equipment = this.equipmentLabel(incident.node_id);
        const service = this.serviceLabel(
            incident.node_id,
            incident.service_id,
        );
        const status = String(incident.status ?? "unavailable").toLowerCase();
        const occurrences = Number(incident.occurrence_count ?? 1);

        return `
            <article class="incident-card incident-card--${escapeHtml(status)} ${active ? "is-active" : "is-resolved"}">
                <div class="incident-card__accent" aria-hidden="true"></div>
                <div class="incident-card__body">
                    <header class="incident-card__header">
                        <div>
                            <div class="incident-card__badges">
                                <span class="incident-status incident-status--${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status] ?? status)}</span>
                                ${incident.acknowledged_at ? '<span class="incident-badge">Acquitté</span>' : ""}
                                ${silenced ? '<span class="incident-badge incident-badge--silenced">Silencieux</span>' : ""}
                                ${!active ? '<span class="incident-badge incident-badge--resolved">Résolu</span>' : ""}
                            </div>
                            <h3>${escapeHtml(equipment)}</h3>
                            <p>${escapeHtml(service)} · ${escapeHtml(this.readableIdentifier(incident.capability_id))}</p>
                        </div>
                        <span class="incident-card__duration">Depuis ${escapeHtml(formatDate(incident.started_at))}</span>
                    </header>
                    ${incident.message ? `<p class="incident-card__message">${escapeHtml(incident.message)}</p>` : ""}
                    <dl class="incident-card__details">
                        <div><dt>Dernière détection</dt><dd>${escapeHtml(formatDate(incident.last_observed_at))}</dd></div>
                        <div><dt>Occurrences</dt><dd>${escapeHtml(occurrences)}</dd></div>
                        ${incident.ended_at ? `<div><dt>Résolution</dt><dd>${escapeHtml(formatDate(incident.ended_at))}</dd></div>` : ""}
                        ${silenced ? `<div><dt>Silencieux jusqu’à</dt><dd>${escapeHtml(formatDate(incident.silenced_until))}</dd></div>` : ""}
                    </dl>
                    ${active ? this.actions(incident, silenced) : ""}
                </div>
            </article>
        `;
    }

    actions(incident, silenced) {
        const id = escapeHtml(incident.incident_id);

        return `
            <div class="incident-card__actions">
                ${incident.acknowledged_at ? "" : `<button class="button" data-incident-action="acknowledge" data-incident-id="${id}" type="button">Acquitter</button>`}
                ${silenced
                    ? `<button class="configuration-secondary-button" data-incident-action="resume" data-incident-id="${id}" type="button">Réactiver</button>`
                    : `<button class="configuration-secondary-button" data-incident-action="silence" data-incident-id="${id}" type="button">Silence 1 h</button>`}
            </div>
        `;
    }

    async performAction(action, incidentId, button) {
        if (!incidentId || !action) {
            return;
        }

        button.disabled = true;
        this.showError("");

        try {
            let updated;

            if (action === "acknowledge") {
                updated = await requestJson(
                    API.incidentAcknowledge(incidentId),
                    {method: "POST", body: JSON.stringify({note: null})},
                );
            } else if (action === "silence") {
                const until = new Date(Date.now() + 60 * 60 * 1000);
                updated = await requestJson(
                    API.incidentSilence(incidentId),
                    {
                        method: "POST",
                        body: JSON.stringify({until: until.toISOString()}),
                    },
                );
            } else if (action === "resume") {
                updated = await requestJson(
                    API.incidentSilence(incidentId),
                    {method: "DELETE"},
                );
            }

            if (updated) {
                this.replaceIncident(updated);
                this.render();
            }
        } catch (error) {
            this.showError(
                `Action impossible : ${this.errorMessage(error)}`,
            );
        } finally {
            button.disabled = false;
        }
    }

    replaceIncident(updated) {
        const index = this.incidents.findIndex((incident) => {
            return incident.incident_id === updated.incident_id;
        });

        if (index >= 0) {
            this.incidents.splice(index, 1, updated);
        } else {
            this.incidents.unshift(updated);
        }
    }

    equipmentLabel(nodeId) {
        const topology = this.state.topology?.topology ?? this.state.topology;
        const devices = Array.isArray(topology?.devices)
            ? topology.devices
            : [];
        const device = devices.find((candidate) => {
            return String(candidate.node ?? candidate.node_id ?? "") === nodeId;
        });

        return String(device?.label ?? nodeId ?? "Équipement inconnu");
    }

    serviceLabel(nodeId, serviceId) {
        const nodes = Array.isArray(this.state.topology?.nodes)
            ? this.state.topology.nodes
            : [];
        const node = nodes.find((candidate) => {
            return String(candidate.id ?? candidate.node_id ?? "") === nodeId;
        });
        const services = Array.isArray(node?.services) ? node.services : [];
        const service = services.find((candidate) => {
            return String(candidate.id ?? candidate.service_id ?? "") === serviceId;
        });

        return String(
            service?.name
            ?? service?.label
            ?? this.readableIdentifier(serviceId),
        );
    }

    readableIdentifier(value) {
        return String(value ?? "—")
            .replaceAll("_", " ")
            .replaceAll("-", " ");
    }

    isSilenced(incident, now = Date.now()) {
        if (!incident.silenced_until) {
            return false;
        }

        return new Date(incident.silenced_until).getTime() > now;
    }

    showError(message) {
        if (!this.elements.error) {
            return;
        }

        this.elements.error.textContent = message;
        this.elements.error.classList.toggle("hidden", !message);
    }

    setCount(element, value) {
        if (element) {
            element.textContent = String(value);
        }
    }

    errorMessage(error) {
        return error instanceof Error ? error.message : String(error);
    }
}
