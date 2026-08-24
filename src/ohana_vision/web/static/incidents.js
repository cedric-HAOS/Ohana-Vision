"use strict";

import {API, fetchJson, requestJson} from "./api.js";
import {escapeHtml, formatDate} from "./utils.js";

const SEVERITY_LABELS = Object.freeze({degraded: "Dégradé", critical: "Critique"});
const WORKFLOW_LABELS = Object.freeze({
    new: "Nouveau",
    in_progress: "En cours",
    treated: "Traité",
    resolved: "Résolu",
});

/** Render Agent-owned Tsunade incidents without duplicating their lifecycle. */
export class IncidentsController {
    constructor({state}) {
        this.state = state;
        this.incidents = [];
        this.details = new Map();
        this.filter = "active";
        this.loaded = false;
        this.elements = {
            error: document.querySelector("#incidents-error"),
            list: document.querySelector("#incidents-list"),
            activeCount: document.querySelector("#incidents-active-count"),
            newCount: document.querySelector("#incidents-unacknowledged-count"),
            treatedCount: document.querySelector("#incidents-silenced-count"),
            resolvedCount: document.querySelector("#incidents-resolved-count"),
            filters: Array.from(document.querySelectorAll("[data-incidents-filter]")),
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
            const diagnoseButton = event.target.closest("[data-tsunade-diagnose]");
            if (diagnoseButton) {
                void this.diagnose(
                    diagnoseButton.dataset.tsunadeDiagnose,
                    diagnoseButton,
                );
                return;
            }
            const button = event.target.closest("[data-tsunade-details]");
            if (button) {
                void this.loadDetails(button.dataset.tsunadeDetails, button);
            }
        });
    }

    async load() {
        this.showError("");
        try {
            const payload = await fetchJson(`${API.tsunadeIncidents}?state=all`);
            this.incidents = Array.isArray(payload?.incidents) ? payload.incidents : [];
            this.loaded = true;
            this.render();
        } catch (error) {
            this.showError(`Tsunade est indisponible : ${this.errorMessage(error)}`);
            if (this.elements.list) {
                this.elements.list.innerHTML = this.emptyState(
                    "Incidents indisponibles",
                    "La liste sera rechargée dès qu’Ohana-Agent répondra.",
                );
            }
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
        if (!this.loaded) {
            this.elements.list.innerHTML = this.emptyState(
                "Chargement des incidents Tsunade…",
            );
            return;
        }
        const visible = this.incidents.filter((incident) => {
            if (this.filter === "all") {
                return true;
            }
            if (this.filter === "active") {
                return incident.state === "active";
            }
            return incident.workflow_state === this.filter;
        });
        if (visible.length === 0) {
            this.elements.list.innerHTML = this.emptyState(
                "Aucun incident dans cet état",
                "Les décisions et investigations de Tsunade apparaîtront ici.",
            );
            return;
        }
        this.elements.list.innerHTML = visible
            .map((incident) => this.incidentCard(incident))
            .join("");
    }

    renderSummary() {
        const active = this.incidents.filter((incident) => incident.state === "active");
        this.setCount(this.elements.activeCount, active.length);
        this.setCount(
            this.elements.newCount,
            active.filter((incident) => incident.workflow_state === "new").length,
        );
        this.setCount(
            this.elements.treatedCount,
            this.incidents.filter((incident) => incident.workflow_state === "treated").length,
        );
        this.setCount(
            this.elements.resolvedCount,
            this.incidents.filter((incident) => incident.state === "resolved").length,
        );
    }

    incidentCard(incident) {
        const severity = String(incident.severity ?? "degraded").toLowerCase();
        const workflow = String(incident.workflow_state ?? "new").toLowerCase();
        const expertiseState = String(incident.expertise_state ?? "idle").toLowerCase();
        const details = this.details.get(incident.incident_id);
        const findings = Array.isArray(incident.context?.findings)
            ? incident.context.findings.slice(0, 5)
            : [];
        return `
            <article class="incident-card incident-card--${escapeHtml(severity)} ${incident.state === "resolved" ? "is-resolved" : "is-active"}">
                <div class="incident-card__accent" aria-hidden="true"></div>
                <div class="incident-card__body">
                    <header class="incident-card__header">
                        <div>
                            <div class="incident-card__badges">
                                <span class="incident-status">${escapeHtml(SEVERITY_LABELS[severity] ?? severity)}</span>
                                <span class="incident-badge incident-badge--${escapeHtml(workflow)}">${escapeHtml(WORKFLOW_LABELS[workflow] ?? workflow)}</span>
                            </div>
                            <h3>${escapeHtml(this.equipmentLabel(incident.node_id))}</h3>
                            <p>${escapeHtml(this.serviceLabel(incident.node_id, incident.service_id))} · ${escapeHtml(this.readableIdentifier(incident.capability_id))}</p>
                        </div>
                        <span class="incident-card__duration">Depuis ${escapeHtml(formatDate(incident.started_at))}</span>
                    </header>
                    <p class="incident-card__message">${escapeHtml(incident.message ?? "Incident sans résumé")}</p>
                    <dl class="incident-card__details">
                        <div><dt>Dernière évolution</dt><dd>${escapeHtml(formatDate(incident.last_observed_at))}</dd></div>
                        <div><dt>Occurrences</dt><dd>${escapeHtml(incident.occurrence_count ?? 1)}</dd></div>
                        <div><dt>Récurrences</dt><dd>${escapeHtml(incident.recurrence_count ?? 0)}</dd></div>
                        ${incident.ended_at ? `<div><dt>Résolution</dt><dd>${escapeHtml(formatDate(incident.ended_at))}</dd></div>` : ""}
                    </dl>
                    ${findings.length ? `<div class="incident-card__findings"><strong>Anomalies Katsuyu</strong><ul>${findings.map((finding) => `<li>${escapeHtml(finding.summary ?? finding.signature)}</li>`).join("")}</ul></div>` : ""}
                    ${incident.final_result ? `<p class="incident-card__result"><strong>Résultat :</strong> ${escapeHtml(incident.final_result)}</p>` : ""}
                    <div class="incident-card__actions">
                        ${incident.state === "active" ? `<button class="configuration-primary-button" data-tsunade-diagnose="${escapeHtml(incident.incident_id)}" type="button" ${expertiseState === "ai_queued" ? "disabled" : ""}>${expertiseState === "ai_queued" ? "Analyse Katsuyu en attente" : "Lancer le diagnostic"}</button>` : ""}
                        <button class="configuration-secondary-button" data-tsunade-details="${escapeHtml(incident.incident_id)}" type="button">${details ? "Masquer l’évolution" : "Afficher l’évolution"}</button>
                    </div>
                    ${details ? this.evolution(details) : ""}
                </div>
            </article>`;
    }

    evolution(incident) {
        const events = Array.isArray(incident.events) ? incident.events : [];
        if (events.length === 0) {
            return '<p class="incident-card__evolution">Aucune évolution enregistrée.</p>';
        }
        return `<ol class="incident-card__evolution">${events.map((event) => `
            <li><time>${escapeHtml(formatDate(event.occurred_at))}</time>
            <strong>${escapeHtml(this.readableIdentifier(event.kind))}</strong>
            <span>${escapeHtml(event.summary)}</span>
            ${this.expertiseDetails(event.payload)}</li>`).join("")}</ol>`;
    }

    expertiseDetails(payload) {
        if (!payload || typeof payload !== "object") {
            return "";
        }
        const hypotheses = Array.isArray(payload.hypotheses)
            ? payload.hypotheses.slice(0, 8)
            : [];
        const proposals = Array.isArray(payload.proposals)
            ? payload.proposals.slice(0, 16)
            : [];
        const status = payload.epistemic_status === "hypothesis"
            ? '<span class="incident-evidence-status">Hypothèses — décision Tsunade en attente</span>'
            : payload.epistemic_status === "confirmed_by_probe"
                ? '<span class="incident-evidence-status is-confirmed">Confirmé par investigation déterministe</span>'
                : "";
        const hypothesisList = hypotheses.length
            ? `<ul class="incident-hypotheses">${hypotheses.map((hypothesis) => `
                <li><strong>${escapeHtml(Math.round(Number(hypothesis.confidence ?? 0) * 100))} %</strong>
                ${escapeHtml(hypothesis.statement ?? "Hypothèse sans résumé")}
                ${this.evidenceList("Concordants", hypothesis.supporting_evidence)}
                ${this.evidenceList("Contradictoires", hypothesis.contradicting_evidence)}</li>`).join("")}</ul>`
            : "";
        const proposalList = proposals.length
            ? `<div class="incident-proposals"><strong>Propositions non autorisées</strong><ul>${proposals.map((proposal) => `<li>${escapeHtml(proposal)}</li>`).join("")}</ul></div>`
            : "";
        return `${status}${hypothesisList}${proposalList}`;
    }

    evidenceList(label, values) {
        if (!Array.isArray(values) || values.length === 0) {
            return "";
        }
        return `<small><strong>${escapeHtml(label)} :</strong> ${values.slice(0, 8).map((value) => escapeHtml(value)).join(" · ")}</small>`;
    }

    async diagnose(incidentId, button) {
        if (!incidentId) {
            return;
        }
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(API.tsunadeDiagnose(incidentId), {
                method: "POST",
            });
            this.details.delete(incidentId);
            await this.load();
        } catch (error) {
            this.showError(`Diagnostic indisponible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    async loadDetails(incidentId, button) {
        if (!incidentId) {
            return;
        }
        if (this.details.has(incidentId)) {
            this.details.delete(incidentId);
            this.render();
            return;
        }
        button.disabled = true;
        try {
            this.details.set(
                incidentId,
                await fetchJson(API.tsunadeIncident(incidentId)),
            );
            this.render();
        } catch (error) {
            this.showError(`Évolution indisponible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    equipmentLabel(nodeId) {
        const topology = this.state.topology?.topology ?? this.state.topology;
        const devices = Array.isArray(topology?.devices) ? topology.devices : [];
        const device = devices.find(
            (candidate) => String(candidate.node ?? candidate.node_id ?? "") === nodeId,
        );
        return String(device?.label ?? nodeId ?? "Équipement inconnu");
    }

    serviceLabel(nodeId, serviceId) {
        const nodes = Array.isArray(this.state.topology?.nodes)
            ? this.state.topology.nodes
            : [];
        const node = nodes.find(
            (candidate) => String(candidate.id ?? candidate.node_id ?? "") === nodeId,
        );
        const services = Array.isArray(node?.services) ? node.services : [];
        const service = services.find(
            (candidate) => String(candidate.id ?? candidate.service_id ?? "") === serviceId,
        );
        return String(service?.name ?? service?.label ?? this.readableIdentifier(serviceId));
    }

    readableIdentifier(value) {
        return String(value ?? "—").replaceAll("_", " ").replaceAll("-", " ");
    }

    emptyState(title, message = "") {
        return `<div class="incidents-empty-state"><h3>${escapeHtml(title)}</h3>${message ? `<p>${escapeHtml(message)}</p>` : ""}</div>`;
    }

    showError(message) {
        if (this.elements.error) {
            this.elements.error.textContent = message;
            this.elements.error.classList.toggle("hidden", !message);
        }
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
