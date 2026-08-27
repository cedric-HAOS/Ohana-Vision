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
const EVENT_LABELS = Object.freeze({
    opened: "Ouverture",
    observed: "Observation",
    escalated: "Aggravation",
    investigation: "Investigation",
    diagnostic: "Diagnostic",
    action: "Action",
    result: "Résultat",
    resolved: "Résolution",
});
const LOG_SOURCE_LABELS = Object.freeze({
    "ha-01": "HA-01",
    "linky-01": "LINKY-01",
    "zwave-01": "ZWAVE-01",
});
const TERMINAL_JOB_STATUSES = new Set([
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
    "TIMEOUT",
]);
const JOB_POLL_INTERVAL_MS = 1000;
const TREND_LABELS = Object.freeze({
    new: "nouvelle anomalie",
    known: "anomalie connue",
    stable: "stable",
    increasing: "forte augmentation",
    decreasing: "en diminution",
    disappeared: "disparue",
});
const TSUNADE_DECISION_LABELS = Object.freeze({
    stable: "Situation stable",
    watch: "Surveillance",
    investigate: "À approfondir",
    action_required: "Action nécessaire",
});

const TSUNADE_DECISION_SOURCE_LABELS = Object.freeze({
    deterministic: "Analyse déterministe",
    katsuyu_ai: "Analyse Katsuyu",
    fallback: "Décision de repli",
});

/** Render Agent-owned Tsunade incidents without duplicating their lifecycle. */
export class IncidentsController {
    constructor({state}) {
        this.state = state;
        this.incidents = [];
        this.details = new Map();
        this.expandedDetails = new Set();
        this.summary = {};
        this.logHealth = null;
        this.logCheckAvailable = false;
        this.filter = "active";
        this.loaded = false;
        this.elements = {
            error: document.querySelector("#incidents-error"),
            list: document.querySelector("#incidents-list"),
            activeCount: document.querySelector("#incidents-active-count"),
            newCount: document.querySelector("#incidents-unacknowledged-count"),
            treatedCount: document.querySelector("#incidents-silenced-count"),
            resolvedCount: document.querySelector("#incidents-resolved-count"),
            logControlCount: document.querySelector("#incidents-log-control-count"),
            learnedRepairCount: document.querySelector("#incidents-learned-repair-count"),
            repairSuccessRate: document.querySelector("#incidents-repair-success-rate"),
            logHealth: document.querySelector("#tsunade-log-health"),
            filters: Array.from(document.querySelectorAll("[data-incidents-filter]")),
            logCheck: document.querySelector("#tsunade-log-check"),
            commandStatus: document.querySelector("#incidents-command-status"),
        };
    }

    initialize() {
        this.elements.filters.forEach((button) => {
            button.addEventListener("click", () => {
                this.filter = button.dataset.incidentsFilter ?? "active";
                this.render();
            });
        });
        this.elements.logCheck?.addEventListener("click", () => {
            void this.checkLogs(this.elements.logCheck);
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
            const proposeButton = event.target.closest("[data-tsunade-repair-propose]");
            if (proposeButton) {
                void this.proposeRepair(proposeButton.dataset.tsunadeRepairPropose, proposeButton);
                return;
            }
            const authorizeButton = event.target.closest("[data-tsunade-repair-authorize]");
            if (authorizeButton) {
                void this.authorizeRepair(
                    authorizeButton.dataset.incidentId,
                    authorizeButton.dataset.tsunadeRepairAuthorize,
                    authorizeButton,
                );
                return;
            }
            const experienceButton = event.target.closest("[data-tsunade-experience]");
            if (experienceButton) {
                void this.confirmExperience(experienceButton.dataset.tsunadeExperience, experienceButton);
                return;
            }
            const button = event.target.closest("[data-tsunade-details]");
            if (button) {
                void this.loadDetails(button.dataset.tsunadeDetails, button);
            }
        });
        this.elements.list?.addEventListener("submit", (event) => {
            const form = event.target.closest("[data-tsunade-log-investigation]");
            if (!form) {
                return;
            }
            event.preventDefault();
            void this.investigateLogs(
                form.dataset.tsunadeLogInvestigation,
                form,
            );
        });
    }

    async load() {
        this.showError("");
        try {
            const [payload, capabilities] = await Promise.all([
                fetchJson(`${API.tsunadeIncidents}?state=all`),
                fetchJson(API.administrationCapabilities),
            ]);
            this.incidents = Array.isArray(payload?.incidents) ? payload.incidents : [];
            await this.loadDecisionDetails();
            this.summary = payload?.summary && typeof payload.summary === "object"
                ? payload.summary
                : {};
            this.logHealth = payload?.log_health ?? null;
            this.logCheckAvailable = Array.isArray(capabilities?.operations)
                && capabilities.operations.includes("incidents.logs.check");
            this.updateLogCheckButton();
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
        this.setCount(this.elements.logControlCount, this.summary.log_control_count ?? 0);
        this.setCount(this.elements.learnedRepairCount, this.summary.learned_repair_count ?? 0);
        this.setCount(
            this.elements.repairSuccessRate,
            this.summary.repair_success_rate == null
                ? "—"
                : `${Number(this.summary.repair_success_rate).toLocaleString("fr-FR")} %`,
        );
        this.renderLogHealth();
    }

    incidentCard(incident) {
        const severity = String(incident.severity ?? "degraded").toLowerCase();
        const workflow = String(incident.workflow_state ?? "new").toLowerCase();
        const expertiseState = String(incident.expertise_state ?? "idle").toLowerCase();
        const details = this.details.get(incident.incident_id);
        const repairState = details ?? incident;
        const repairs = Array.isArray(repairState.repairs) ? repairState.repairs : [];
        const proposedRepair = repairs.find((repair) => repair.status === "proposed");
        const repairSummary = repairs.length ? this.repairs(repairs) : "";
        const experience = details?.experience_candidate;
        const logSynthesis = incident.capability_id === "logs.health"
            ? this.logSynthesis(incident.context)
            : "";
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
                    ${logSynthesis}
                    ${this.tsunadeDecision(details ?? incident)}
                    ${incident.final_result ? `<p class="incident-card__result"><strong>Résultat :</strong> ${escapeHtml(incident.final_result)}</p>` : ""}
                    ${repairSummary}
                    ${experience ? `<div class="incident-experience"><strong>${escapeHtml(experience.prompt)}</strong><button class="configuration-primary-button" data-tsunade-experience="${escapeHtml(incident.incident_id)}" type="button">Enregistrer la réparation connue</button></div>` : ""}
                    ${incident.state === "active" && incident.capability_id === "logs.health" ? `
                        <form class="incident-log-investigation" data-tsunade-log-investigation="${escapeHtml(incident.incident_id)}">
                            <label>Motif à approfondir
                                <input maxlength="160" name="pattern" placeholder="Ex. Node 17" required type="text">
                            </label>
                            <button class="configuration-primary-button" type="submit">Approfondir les journaux</button>
                        </form>` : ""}
                    <div class="incident-card__actions">
                        ${incident.state === "active" ? `<button class="configuration-primary-button" data-tsunade-diagnose="${escapeHtml(incident.incident_id)}" type="button" ${expertiseState === "ai_queued" ? "disabled" : ""}>${expertiseState === "ai_queued" ? "Analyse Katsuyu en attente" : "Lancer le diagnostic"}</button>` : ""}
                        ${incident.state === "active" && this.canRestartDnsmasq(incident) && repairs.length === 0 ? `<button class="configuration-secondary-button" data-tsunade-repair-propose="${escapeHtml(incident.incident_id)}" type="button">Proposer le redémarrage de dnsmasq</button>` : ""}
                        ${proposedRepair && !proposedRepair.authorized_at ? `<button class="configuration-primary-button" data-incident-id="${escapeHtml(incident.incident_id)}" data-tsunade-repair-authorize="${escapeHtml(proposedRepair.repair_id)}" type="button">Autoriser depuis Vision</button>` : ""}
                        <button class="configuration-secondary-button" data-tsunade-details="${escapeHtml(incident.incident_id)}" type="button">${this.expandedDetails.has(incident.incident_id) ? "Masquer l’évolution" : "Afficher l’évolution"}</button>
                    </div>
                    ${this.expandedDetails.has(incident.incident_id) && details ? this.evolution(details) : ""}
                </div>
            </article>`;
    }

    latestTsunadeDecision(incident) {
        if (incident?.latest_decision && typeof incident.latest_decision === "object") {
            return incident.latest_decision;
        }
        const events = Array.isArray(incident?.events)
            ? incident.events
            : [];

        for (let index = events.length - 1; index >= 0; index -= 1) {
            const payload = events[index]?.payload;

            if (
                payload
                && typeof payload === "object"
                && payload.decision
                && payload.decision !== "pending"
            ) {
                return payload;
            }
        }

        return null;
    }

    tsunadeDecision(incident) {
        const decision = this.latestTsunadeDecision(incident);

        if (!decision) {
            return "";
        }

        const value = String(decision.decision ?? "watch");
        const source = String(decision.decision_source ?? "deterministic");
        const confidence = Number(decision.confidence);

        const confidenceLabel = Number.isFinite(confidence)
            ? `${Math.round(confidence * 100)} %`
            : "—";

        const reevaluation = decision.reevaluate_after === "next_logs_health_check"
            ? "Au prochain contrôle des journaux"
            : decision.reevaluate_after
                ? this.readableIdentifier(decision.reevaluate_after)
                : "Selon évolution";

        return `
            <section class="incident-tsunade-decision incident-tsunade-decision--${escapeHtml(value)}">
                <header>
                    <div>
                        <span>Décision Tsunade</span>
                        <strong>${escapeHtml(
                            TSUNADE_DECISION_LABELS[value] ?? this.readableIdentifier(value)
                        )}</strong>
                    </div>
                    <small>${escapeHtml(
                        TSUNADE_DECISION_SOURCE_LABELS[source] ?? this.readableIdentifier(source)
                    )} · confiance ${escapeHtml(confidenceLabel)}</small>
                </header>

                ${decision.conclusion
                    ? `<p>${escapeHtml(decision.conclusion)}</p>`
                    : ""}

                <dl>
                    ${decision.reason
                        ? `<div><dt>Justification</dt><dd>${escapeHtml(decision.reason)}</dd></div>`
                        : ""}
                    ${decision.recommended_action
                        ? `<div><dt>Suite recommandée</dt><dd>${escapeHtml(decision.recommended_action)}</dd></div>`
                        : ""}
                    <div>
                        <dt>Réévaluation</dt>
                        <dd>${escapeHtml(reevaluation)}</dd>
                    </div>
                </dl>
            </section>`;
    }

    evolution(incident) {
        const events = Array.isArray(incident.events) ? incident.events : [];
        if (events.length === 0) {
            return '<p class="incident-card__evolution">Aucune évolution enregistrée.</p>';
        }
        return `<ol class="incident-card__evolution">${events.map((event) => `
            <li><time>${escapeHtml(formatDate(event.occurred_at))}</time>
            <strong>${escapeHtml(EVENT_LABELS[event.kind] ?? this.readableIdentifier(event.kind))}</strong>
            <span>${escapeHtml(this.translatedSummary(event.summary))}</span>
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
            ? '<span class="incident-evidence-status">Analyse Katsuyu utilisée par Tsunade</span>'
            : payload.epistemic_status === "confirmed_by_probe"
                ? '<span class="incident-evidence-status is-confirmed">Confirmé par investigation déterministe</span>'
                : "";
        const hypothesisList = hypotheses.length
            ? `<ul class="incident-hypotheses">${hypotheses.map((hypothesis) => `
                <li><strong>${escapeHtml(Math.round(Number(hypothesis.confidence ?? 0) * 100))} %</strong>
                ${escapeHtml(hypothesis.statement ?? "Hypothèse sans résumé")}
                ${this.evidenceList("Causes possibles", hypothesis.possible_causes)}
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
            this.expandedDetails.delete(incidentId);
            await this.load();
        } catch (error) {
            this.showError(`Diagnostic indisponible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    async checkLogs(button) {
        button.disabled = true;
        this.showError("");
        this.showCommandStatus("");
        try {
            const created = await requestJson(API.tsunadeLogCheck, {method: "POST"});
            const job = await this.followJob(
                created,
                "Contrôle des journaux",
                {projectLogHealth: true},
            );
            await this.load();
            if (job.status === "SUCCEEDED") {
                this.showCommandStatus("Contrôle des journaux terminé par Katsuyu.");
            } else {
                const reason = job.error?.message
                    ? ` · ${job.error.message}`
                    : "";
                this.showError(
                    `Contrôle des journaux ${this.jobStatusLabel(job.status)}${reason}`,
                );
            }
        } catch (error) {
            this.showError(`Contrôle des journaux indisponible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = !this.logCheckAvailable;
        }
    }

    async followJob(
        createdJob,
        label,
        {projectLogHealth = false} = {},
    ) {
        if (!createdJob?.job_id) {
            throw new Error("Ohana-Agent n’a pas renvoyé d’identifiant de job");
        }

        let job = createdJob;

        while (true) {
            if (projectLogHealth) {
                this.logHealth = job;
                this.renderLogHealth();
            }

            const percent = Number(job.progress?.percent);
            const progress = Number.isFinite(percent)
                ? ` · ${Math.round(percent)} %`
                : "";

            this.showCommandStatus(
                `${label} · ${this.jobStatusLabel(job.status)}${progress}`,
            );

            if (TERMINAL_JOB_STATUSES.has(job.status)) {
                return job;
            }

            await new Promise(
                (resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS),
            );

            job = await fetchJson(
                API.administrationJob(job.job_id),
            );
        }
    }

    async investigateLogs(incidentId, form) {
        if (!incidentId) {
            return;
        }

        const button = form.querySelector("button[type='submit']");
        const pattern = String(
            new FormData(form).get("pattern") ?? "",
        ).trim();

        if (!pattern) {
            return;
        }

        button.disabled = true;
        this.showError("");
        this.showCommandStatus("");

        try {
            const created = await requestJson(
                API.tsunadeLogInvestigate(incidentId),
                {
                    method: "POST",
                    body: JSON.stringify({pattern}),
                },
            );

            const job = await this.followJob(
                created,
                "Investigation ciblée",
            );

            this.details.delete(incidentId);
            this.expandedDetails.delete(incidentId);

            await this.load();

            if (job.status === "SUCCEEDED") {
                this.showCommandStatus(
                    "Investigation ciblée terminée par Katsuyu.",
                );
            } else {
                const reason = job.error?.message
                    ? ` · ${job.error.message}`
                    : "";

                this.showError(
                    `Investigation des journaux `
                    + `${this.jobStatusLabel(job.status)}${reason}`,
                );
            }
        } catch (error) {
            this.showError(
                `Investigation des journaux indisponible : `
                + `${this.errorMessage(error)}`,
            );
        } finally {
            button.disabled = false;
        }
    }

    async proposeRepair(incidentId, button) {
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(API.tsunadeRepair(incidentId), {
                method: "POST",
                body: JSON.stringify({operation: "restart_service"}),
            });
            this.details.delete(incidentId);
            this.expandedDetails.delete(incidentId);
            await this.load();
            await this.loadDetails(incidentId, button);
        } catch (error) {
            this.showError(`Proposition impossible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    async authorizeRepair(incidentId, repairId, button) {
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(API.tsunadeRepairAuthorize(incidentId), {
                method: "POST",
                body: JSON.stringify({
                    repair_id: repairId,
                    source: "vision",
                    authorized_by: "utilisateur Vision",
                }),
            });
            this.details.delete(incidentId);
            this.expandedDetails.delete(incidentId);
            this.showCommandStatus("Réparation autorisée ; vérification Shikamaru en attente.");
            await this.load();
        } catch (error) {
            this.showError(`Réparation impossible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    async confirmExperience(incidentId, button) {
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(API.tsunadeExperience(incidentId), {
                method: "POST",
                body: JSON.stringify({
                    confirm: true,
                    source: "vision",
                    confirmed_by: "utilisateur Vision",
                }),
            });
            this.details.delete(incidentId);
            this.expandedDetails.delete(incidentId);
            this.showCommandStatus("Réparation enregistrée dans la mémoire de Tsunade.");
            await this.load();
        } catch (error) {
            this.showError(`Mémorisation impossible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    repairs(repairs) {
        const labels = {
            proposed: "En attente de validation",
            verifying: "Exécutée, vérification Shikamaru en attente",
            succeeded: "Réussie et confirmée par Shikamaru",
            failed: "Échec confirmé",
        };
        const riskLabels = {low: "Faible", medium: "Moyen", high: "Élevé"};
        return `<div class="incident-repairs"><strong>Réparations supervisées</strong>${repairs.map((repair) => `
            <article class="incident-repair">
                <dl>
                    <div><dt>Action proposée</dt><dd>${escapeHtml(this.readableIdentifier(repair.operation))} · ${escapeHtml(repair.target)}</dd></div>
                    <div><dt>Niveau de risque</dt><dd>${escapeHtml(riskLabels[repair.risk] ?? repair.risk)}</dd></div>
                    <div><dt>État</dt><dd>${escapeHtml(labels[repair.status] ?? repair.status)}${repair.authorization_source ? ` · autorisée depuis ${escapeHtml(repair.authorization_source)}` : ""}</dd></div>
                </dl>
                ${Array.isArray(repair.consequences) && repair.consequences.length ? `<div><strong>Conséquences</strong><ul>${repair.consequences.map((consequence) => `<li>${escapeHtml(consequence)}</li>`).join("")}</ul></div>` : ""}
                ${repair.result ? `<p class="incident-repair__result"><strong>${repair.status === "succeeded" ? "Réparation réussie" : "Résultat"}</strong> · ${escapeHtml(repair.result)}</p>` : ""}
            </article>`).join("")}</div>`;
    }

    updateLogCheckButton() {
        if (!this.elements.logCheck) {
            return;
        }
        this.elements.logCheck.disabled = !this.logCheckAvailable;
        this.elements.logCheck.title = this.logCheckAvailable
            ? "Demander un contrôle immédiat à Tsunade"
            : "Le contrôle des journaux n’est pas activé dans Ohana-Agent";
    }

    renderLogHealth() {
        if (!this.elements.logHealth) {
            return;
        }
        if (!this.logHealth) {
            this.elements.logHealth.innerHTML = "<p>Aucune analyse disponible.</p>";
            return;
        }
        const result = this.logHealth.result;
        if (!result || !Array.isArray(result.sources)) {
            const error = this.logHealth.error?.message;
            this.elements.logHealth.innerHTML = `<p>Dernier contrôle : ${escapeHtml(this.jobStatusLabel(this.logHealth.status))}${error ? ` · ${escapeHtml(error)}` : ""}</p>`;
            return;
        }
        const bySource = new Map(result.sources.map((source) => [source.source, source]));
        const rows = Object.entries(LOG_SOURCE_LABELS).map(([sourceId, label]) => {
            const source = bySource.get(sourceId);
            const healthy = source?.status === "OK";
            const state = source ? (healthy ? "Sain" : "Anomalie") : "Non analysé";
            return `<li class="${healthy ? "is-healthy" : source ? "is-unhealthy" : ""}"><strong>${escapeHtml(label)}</strong><span>${healthy ? "✓" : source ? "!" : "—"} ${escapeHtml(state)}</span></li>`;
        }).join("");
        this.elements.logHealth.innerHTML = `<ul>${rows}</ul><p>Dernière analyse : <strong>${escapeHtml(formatDate(result.analyzed_at ?? this.logHealth.finished_at))}</strong></p>`;
    }

    logSynthesis(context) {
        if (!context || typeof context !== "object") {
            return "";
        }
        const findings = Array.isArray(context.findings) ? context.findings.slice(0, 8) : [];
        const source = LOG_SOURCE_LABELS[context.source] ?? this.readableIdentifier(context.source);
        const state = context.status === "OK" ? "sain" : "anomalie";
        const window = this.analysisWindow(context);
        const items = findings.map((finding) => {
            const reference = finding.reference_occurrences == null
                ? "aucune référence antérieure"
                : `${finding.reference_occurrences} / ${window}`;
            const trend = TREND_LABELS[finding.trend] ?? this.readableIdentifier(finding.trend);
            return `<li><strong>${escapeHtml(finding.signature ?? finding.summary)}</strong><span>${escapeHtml(finding.occurrences ?? 0)} occurrence(s) / ${escapeHtml(window)}</span><small>Référence : ${escapeHtml(reference)} · Évolution : ${escapeHtml(trend)}</small></li>`;
        }).join("");
        return `<section class="incident-log-synthesis"><header><strong>${escapeHtml(source)}</strong><span>État des journaux : ${escapeHtml(state)}</span></header>${items ? `<ul>${items}</ul>` : "<p>Aucune anomalie regroupée.</p>"}</section>`;
    }

    analysisWindow(context) {
        const started = Date.parse(context.window_started_at ?? "");
        const ended = Date.parse(context.window_ended_at ?? "");
        if (!Number.isFinite(started) || !Number.isFinite(ended) || ended <= started) {
            return "période analysée";
        }
        const hours = Math.round((ended - started) / 3_600_000);
        return `${hours} h`;
    }

    jobStatusLabel(status) {
        const labels = {
            CREATED: "créé",
            QUEUED: "en attente",
            WAITING_WORKER: "Katsuyu indisponible",
            RUNNING: "en cours",
            SUCCEEDED: "terminé",
            FAILED: "en échec",
            CANCELLED: "annulé",
            TIMEOUT: "délai dépassé",
        };
        return labels[status] ?? this.readableIdentifier(status);
    }

    canRestartDnsmasq(incident) {
        return [incident.node_id, incident.service_id, incident.capability_id, incident.message]
            .join(" ")
            .toLowerCase()
            .includes("dns");
    }

    translatedSummary(summary) {
        const translations = new Map([
            ["Deterministic evidence is insufficient; Katsuyu AI was requested.", "Les éléments déterministes sont insuffisants ; une analyse Katsuyu AI a été demandée."],
            ["Optional Katsuyu AI inference failed; no decision was made.", "L’analyse Katsuyu AI facultative a échoué ; aucune décision n’a été prise."],
            ["Capability returned to healthy state.", "La capacité est revenue à un état sain."],
        ]);
        return translations.get(String(summary ?? "")) ?? String(summary ?? "");
    }

    async loadDetails(incidentId, button) {
        if (!incidentId) {
            return;
        }
        if (this.expandedDetails.has(incidentId)) {
            this.expandedDetails.delete(incidentId);
            this.render();
            return;
        }
        if (this.details.has(incidentId)) {
            this.expandedDetails.add(incidentId);
            this.render();
            return;
        }
        button.disabled = true;
        try {
            this.details.set(
                incidentId,
                await fetchJson(API.tsunadeIncident(incidentId)),
            );
            this.expandedDetails.add(incidentId);
            this.render();
        } catch (error) {
            this.showError(`Évolution indisponible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    async loadDecisionDetails() {
        const pending = this.incidents.filter(
            (incident) => !this.details.has(incident.incident_id),
        );
        const results = await Promise.allSettled(
            pending.map(async (incident) => [
                incident.incident_id,
                await fetchJson(API.tsunadeIncident(incident.incident_id)),
            ]),
        );
        results.forEach((result) => {
            if (result.status === "fulfilled") {
                const [incidentId, details] = result.value;
                this.details.set(incidentId, details);
            }
        });
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

    showCommandStatus(message) {
        if (this.elements.commandStatus) {
            this.elements.commandStatus.textContent = message;
            this.elements.commandStatus.classList.toggle("hidden", !message);
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
