"use strict";

import {API, fetchJson, requestJson} from "./api.js";
import {escapeHtml, formatDate} from "./utils.js";
import {SEVERITY_LABELS, WORKFLOW_LABELS, EVENT_LABELS, TERMINAL_JOB_STATUSES, JOB_POLL_INTERVAL_MS, TSUNADE_DECISION_SOURCE_LABELS} from "./incidents_shared.js";

/** Render Agent-owned Tsunade incidents without duplicating their lifecycle. */
export class IncidentsController {
    constructor({state}) {
        this.state = state;
        this.incidents = [];
        this.details = new Map();
        this.expandedDetails = new Set();
        this.summary = {};
        this.logHealth = null;
        this.acceptedLogSignatures = [];
        // Log anomalies read by component (Agent >= 1.42): null on an older Agent.
        this.acceptedLogComponents = [];
        this.logComponents = null;
        // Phase 3: success statistics of repairs; null on an older Agent.
        this.repairStatistics = undefined;
        this.openLogSources = new Set();
        // undefined until loaded; null when the Agent has no experience route.
        this.experiences = undefined;
        // Same convention for the Phase 4 preventive synthesis.
        this.preventive = undefined;
        // Phase 10: backup targets and their declared restoration tests.
        this.restoreTests = null;
        // Manual forms survive the periodic re-render, with their draft.
        this.manualForms = new Set();
        this.manualDrafts = new Map();
        // Phase 3 hardening: similar past incidents, read when asked.
        this.similar = new Map();
        this.logCheckAvailable = false;
        this.expandedLogAnomalies = new Set();
        this.filter = "active";
        // Side column: one tab open at a time, remembered for the session.
        this.sideTab = this.storedSideTab();
        // Preventive rules the user unfolded: kept across the periodic refresh.
        this.openPreventiveRules = new Set();
        this.loaded = false;
        this.focusedIncident = new URLSearchParams(window.location.search).get("incident");
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
            experiences: document.querySelector("#tsunade-experiences"),
            preventive: document.querySelector("#tsunade-preventive"),
            filters: Array.from(document.querySelectorAll("[data-incidents-filter]")),
            logCheck: document.querySelector("#tsunade-log-check"),
            commandStatus: document.querySelector("#incidents-command-status"),
            experiencePending: document.querySelector("#incidents-experience-pending"),
            repairStatistics: document.querySelector("#tsunade-repair-statistics"),
            cycleSummary: document.querySelector("#incidents-cycle-summary"),
            watchCount: document.querySelector("#incidents-watch-count"),
            logState: document.querySelector("#incidents-log-state"),
            tabs: Array.from(document.querySelectorAll("[data-tsunade-tab]")),
            panels: Array.from(document.querySelectorAll("[data-tsunade-panel]")),
            tabTargets: Array.from(document.querySelectorAll("[data-tsunade-tab-target]")),
        };
    }

    initialize() {
        this.elements.tabs.forEach((tab, index) => {
            tab.addEventListener("click", () => this.selectSideTab(tab.dataset.tsunadeTab));
            tab.addEventListener("keydown", (event) => {
                const step = {ArrowRight: 1, ArrowLeft: -1}[event.key];
                if (!step) {
                    return;
                }
                event.preventDefault();
                const next = this.elements.tabs[(index + step + this.elements.tabs.length) % this.elements.tabs.length];
                this.selectSideTab(next.dataset.tsunadeTab);
                next.focus();
            });
        });
        this.elements.tabTargets.forEach((chip) => {
            chip.addEventListener("click", () => this.selectSideTab(chip.dataset.tsunadeTabTarget));
        });
        this.renderSideTabs();
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
            const copyButton = event.target.closest("[data-tsunade-copy-command]");
            if (copyButton) {
                void this.copyCommand(copyButton);
                return;
            }

            const similarButton = event.target.closest("[data-tsunade-similar]");
            if (similarButton) {
                void this.toggleSimilar(similarButton.dataset.tsunadeSimilar);
                return;
            }

            const diagnoseButton = event.target.closest("[data-tsunade-diagnose]");
            if (diagnoseButton) {
                void this.diagnose(
                    diagnoseButton.dataset.tsunadeDiagnose,
                    diagnoseButton,
                );
                return;
            }
            const extendButton = event.target.closest("[data-tsunade-log-extend]");
            if (extendButton) {
                void this.extendLogInvestigation(
                    extendButton.dataset.tsunadeLogExtend,
                    extendButton,
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
                    authorizeButton.dataset.repairRisk,
                );
                return;
            }
            const decisionButton = event.target.closest("[data-tsunade-repair-decision]");
            if (decisionButton) {
                void this.decideRepair(
                    decisionButton.dataset.incidentId,
                    decisionButton.dataset.repairId,
                    decisionButton.dataset.tsunadeRepairDecision,
                    decisionButton,
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
                return;
            }

            const manualOpen = event.target.closest("[data-tsunade-manual-open]");
            if (manualOpen) {
                this.manualForms.add(manualOpen.dataset.tsunadeManualOpen);
                this.render();
                return;
            }
            const manualCancel = event.target.closest("[data-tsunade-manual-cancel]");
            if (manualCancel) {
                this.manualForms.delete(manualCancel.dataset.tsunadeManualCancel);
                this.manualDrafts.delete(manualCancel.dataset.tsunadeManualCancel);
                this.render();
                return;
            }

            const acceptButton = event.target.closest("[data-tsunade-accept-log]");
            if (acceptButton) {
                void this.acceptLogSignature(
                    acceptButton.dataset.tsunadeAcceptLog,
                    Number(acceptButton.dataset.findingIndex),
                    acceptButton,
                );
                return;
            }

            const logAnomaliesButton = event.target.closest(
                "[data-tsunade-log-anomalies]",
            );
            if (logAnomaliesButton) {
                this.toggleLogAnomalies(
                    logAnomaliesButton.dataset.tsunadeLogAnomalies,
                );
            }
        });
        // The save button also lives outside the list: in the pending section
        // and in the outcome banner, visible whatever the selected filter.
        [this.elements.experiencePending, this.elements.commandStatus].forEach((element) => {
            element?.addEventListener("click", (event) => {
                const experienceButton = event.target.closest("[data-tsunade-experience]");
                if (experienceButton) {
                    void this.confirmExperience(experienceButton.dataset.tsunadeExperience, experienceButton);
                }
            });
        });
        // Accepting a component also works from a dossier, outside the tab.
        [this.elements.logHealth, this.elements.list].forEach((element) => {
            element?.addEventListener("click", (event) => {
                const acceptButton = event.target.closest("[data-tsunade-accept-component]");
                if (acceptButton) {
                    void this.setLogComponent(acceptButton, true);
                    return;
                }
                const revokeComponent = event.target.closest("[data-tsunade-revoke-component]");
                if (revokeComponent) {
                    void this.setLogComponent(revokeComponent, false);
                }
            });
        });
        this.elements.logHealth?.addEventListener("click", (event) => {
            const revokeButton = event.target.closest("[data-tsunade-revoke-log]");
            if (revokeButton) {
                void this.revokeLogSignature(
                    Number(revokeButton.dataset.tsunadeRevokeLog),
                    revokeButton,
                );
            }
        });
        this.elements.preventive?.addEventListener("submit", (event) => {
            const form = event.target.closest("[data-tsunade-restore-form]");
            if (form) {
                event.preventDefault();
                void this.declareRestoreTest(form);
            }
        });
        this.elements.preventive?.addEventListener("click", (event) => {
            const verifyButton = event.target.closest("[data-tsunade-archive-verify]");
            if (verifyButton) {
                void this.requestArchiveCheck(verifyButton);
                return;
            }
            const button = event.target.closest("[data-tsunade-preventive-backfill]");
            if (button) {
                void this.requestPreventiveBackfill(button);
                return;
            }
            const muteButton = event.target.closest("[data-tsunade-preventive-mute]");
            if (muteButton) {
                void this.setPreventiveMute(muteButton);
            }
        });
        this.elements.experiences?.addEventListener("click", (event) => {
            const stateButton = event.target.closest("[data-tsunade-experience-state]");
            if (stateButton) {
                void this.setExperienceState(
                    stateButton.dataset.tsunadeExperienceState,
                    stateButton.dataset.state,
                    stateButton,
                );
            }
        });
        this.elements.list?.addEventListener("input", (event) => {
            const form = event.target.closest("[data-tsunade-manual-form]");
            if (form) {
                this.manualDrafts.set(form.dataset.tsunadeManualForm, event.target.value);
            }
        });
        this.elements.list?.addEventListener("submit", (event) => {
            const manualForm = event.target.closest("[data-tsunade-manual-form]");
            if (manualForm) {
                event.preventDefault();
                void this.declareManualResolution(manualForm.dataset.tsunadeManualForm, manualForm);
                return;
            }
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
        // Requested with the incidents: on INFRA-01 the incident details take
        // several seconds, and the section said "none" meanwhile.
        const experiencesRequest = fetchJson(API.tsunadeExperiences)
            .then((payload) => (Array.isArray(payload?.experiences) ? payload.experiences : []))
            .catch(() => null);
        if (this.experiences === undefined) {
            void experiencesRequest.then((experiences) => {
                if (this.experiences === undefined) {
                    this.experiences = experiences;
                    this.renderExperiences();
                }
            });
        }
        void fetchJson(API.tsunadeRepairStatistics)
            .then((payload) => (payload && typeof payload === "object" ? payload : null))
            .catch(() => null)
            .then((statistics) => {
                this.repairStatistics = statistics;
                this.renderRepairStatistics();
            });
        const preventiveRequest = fetchJson(API.tsunadePreventive)
            .then((payload) => (payload && typeof payload === "object" ? payload : null))
            .catch(() => null);
        void preventiveRequest.then((preventive) => {
            this.preventive = preventive;
            this.renderPreventive();
            this.renderStatusbar();
        });
        void fetchJson(API.tsunadeRestoreTests)
            .then((payload) => (payload && Array.isArray(payload.targets) ? payload : null))
            .catch(() => null)
            .then((restoreTests) => {
                this.restoreTests = restoreTests;
                this.renderPreventive();
            });
        const acceptedRequest = fetchJson(API.tsunadeAcceptedLogs)
            .then((accepted) => ({
                signatures: Array.isArray(accepted?.signatures) ? accepted.signatures : [],
                components: Array.isArray(accepted?.components) ? accepted.components : [],
            }))
            .catch(() => ({signatures: [], components: []}));
        try {
            const [payload, capabilities] = await Promise.all([
                fetchJson(`${API.tsunadeIncidents}?state=all`),
                fetchJson(API.administrationCapabilities),
            ]);
            this.incidents = Array.isArray(payload?.incidents) ? payload.incidents : [];
            if (this.focusedIncident) {
                const incident = this.incidents.find(item => item.incident_id === this.focusedIncident);
                if (incident) {
                    this.filter = incident.state === "resolved" ? "resolved" : "active";
                    this.details.set(incident.incident_id, await fetchJson(API.tsunadeIncident(incident.incident_id)));
                    this.expandedDetails.add(incident.incident_id);
                }
                this.focusedIncident = null;
            }
            await this.loadDecisionDetails();
            this.updateFollowedRepair();
            this.summary = payload?.summary && typeof payload.summary === "object"
                ? payload.summary
                : {};
            this.logHealth = payload?.log_health ?? null;
            const accepted = await acceptedRequest;
            this.acceptedLogSignatures = accepted.signatures;
            this.acceptedLogComponents = accepted.components;
            this.logComponents = Array.isArray(payload?.log_components) ? payload.log_components : null;
            // An Agent older than 1.38.0 has no route: the section says so.
            this.experiences = await experiencesRequest;
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

    storedSideTab() {
        try {
            return window.sessionStorage.getItem("ohana.tsunade.tab") || "preventive";
        } catch {
            return "preventive";
        }
    }

    selectSideTab(name) {
        this.sideTab = name;
        try {
            window.sessionStorage.setItem("ohana.tsunade.tab", name);
        } catch {
            // Storage can be blocked: the tab still works for this page.
        }
        this.renderSideTabs();
    }

    renderSideTabs() {
        const known = this.elements.panels.some((panel) => panel.dataset.tsunadePanel === this.sideTab);
        const current = known ? this.sideTab : "preventive";
        this.elements.tabs.forEach((tab) => {
            const active = tab.dataset.tsunadeTab === current;
            tab.classList.toggle("is-active", active);
            tab.setAttribute("aria-selected", String(active));
            tab.tabIndex = active ? 0 : -1;
        });
        this.elements.panels.forEach((panel) => {
            panel.hidden = panel.dataset.tsunadePanel !== current;
        });
    }

    /** One-line state: what to watch and when the logs were last checked. */
    renderStatusbar() {
        if (this.elements.watchCount) {
            const watch = this.preventive?.watch;
            this.elements.watchCount.textContent = Array.isArray(watch) ? String(watch.length) : "—";
        }
        if (this.elements.logState) {
            const job = this.logHealth;
            let label = "—";
            if (job && !TERMINAL_JOB_STATUSES.has(job.status)) {
                label = "en cours";
            } else if (job?.status === "FAILED" || job?.status === "TIMEOUT") {
                label = "échec";
            } else if (job?.finished_at) {
                const finished = new Date(job.finished_at);
                if (!Number.isNaN(finished.getTime())) {
                    const options = {timeZone: "Europe/Paris"};
                    const day = (date) => new Intl.DateTimeFormat("fr-FR", {...options, dateStyle: "short"}).format(date);
                    const time = new Intl.DateTimeFormat("fr-FR", {...options, timeStyle: "short"}).format(finished);
                    label = day(finished) === day(new Date()) ? time : `${day(finished)} ${time}`;
                }
            }
            this.elements.logState.textContent = label;
        }
    }

    render() {
        this.renderSummary();
        this.renderRepairStatistics();
        this.renderExperiences();
        this.renderPreventive();
        this.renderExperiencePending();
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
                // A form being filled stays in view when the incident closes.
                return incident.state === "active"
                    || (this.manualForms.has(incident.incident_id) && this.manualDeclarable(incident));
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
        visible.sort((a, b) => (a.assessment?.priority ?? 9) - (b.assessment?.priority ?? 9));
        let previousGroup = null;
        this.elements.list.innerHTML = visible
            .map((incident) => {
                const group = this.incidentGroup(incident);
                const heading = group !== previousGroup
                    ? `<h3 class="incidents-group-heading">${escapeHtml(group)}</h3>` : "";
                previousGroup = group;
                return heading + this.incidentCard(incident);
            })
            .join("");
    }

    incidentGroup(incident) {
        const state = incident.assessment?.state;
        if (incident.state === "resolved") return "Résolus";
        if (state === "analyzing") return "Analyses en cours";
        if (state === "stale") return "Diagnostics à actualiser";
        if (state === "watch") return "Sous surveillance";
        if (state === "investigate") return "À approfondir";
        return "À examiner en priorité";
    }

    renderSummary() {
        const active = this.incidents.filter((incident) => incident.state === "active");
        const analyzing = active.filter((incident) => incident.assessment?.state === "analyzing").length;
        const stale = active.filter((incident) => incident.assessment?.state === "stale").length;
        if (this.elements.cycleSummary) {
            this.elements.cycleSummary.textContent = this.logHealth && !TERMINAL_JOB_STATUSES.has(this.logHealth.status)
                ? "Contrôle des journaux en cours ou en attente de Katsuyu."
                : analyzing ? `${analyzing} analyse(s) Katsuyu en cours ou en attente du lot de 05:00.`
                    : stale ? `${stale} analyse(s) à actualiser avec les derniers éléments.`
                        : this.logHealth?.finished_at
                            ? `Dernier contrôle des journaux : ${formatDate(this.logHealth.finished_at)}`
                            : "Aucun contrôle des journaux disponible.";
        }
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
        this.renderStatusbar();
    }

    incidentCard(incident) {
        const severity = String(incident.severity ?? "degraded").toLowerCase();
        const displaySeverity = this.displaySeverity(incident, severity);
        const workflow = String(incident.workflow_state ?? "new").toLowerCase();
        const expertiseState = String(incident.expertise_state ?? "idle").toLowerCase();
        const details = this.details.get(incident.incident_id);
        const decisionRecord = this.completeDecisionRecord(this.latestTsunadeDecisionRecord(
            Object.hasOwn(incident, "latest_decision") ? incident : details ?? incident,
        ), details);
        const guidance = this.incidentGuidance(incident, decisionRecord, expertiseState);
        const assessment = incident.assessment;
        // The periodically reloaded list carries the current repairs; a cached
        // dossier kept a repair "En attente" with its buttons on a resolved
        // incident after its failed authorization (Z-Wave JS, 26 September).
        const repairState = Array.isArray(incident.repairs) ? incident : details ?? incident;
        const repairs = Array.isArray(repairState.repairs) ? repairState.repairs : [];
        const proposedRepair = repairs.find((repair) => repair.status === "proposed");
        const repairSummary = repairs.length ? this.repairs(repairs) : "";
        const experience = details?.experience_candidate;
        const logSynthesis = incident.capability_id === "logs.health"
            ? this.logSynthesis(incident.context, incident.incident_id)
            : "";
        return `
            <article class="incident-card incident-card--${escapeHtml(displaySeverity.tone)} ${incident.state === "resolved" ? "is-resolved" : "is-active"}">
                <div class="incident-card__accent" aria-hidden="true"></div>
                <div class="incident-card__body">
                    <header class="incident-card__header">
                        <div>
                            <div class="incident-card__badges">
                                <span class="incident-status">${escapeHtml(displaySeverity.label)}</span>
                                <span class="incident-badge incident-badge--${escapeHtml(workflow)}">${escapeHtml(WORKFLOW_LABELS[workflow] ?? workflow)}</span>
                            </div>
                            <h3>${escapeHtml(this.incidentTitle(incident))}</h3>
                            <p>${escapeHtml(assessment?.label ?? guidance.title)}</p>
                        </div>
                        ${incident.capability_id !== "logs.health" ? `<span class="incident-card__dates">
                            <span>Incident ouvert le</span>
                            <strong>${escapeHtml(formatDate(incident.started_at))}</strong>
                        </span>` : ""}
                    </header>
                    <p class="incident-card__message">${escapeHtml(incident.message ?? "Incident sans résumé")}</p>
                    ${!assessment && (expertiseState === "ai_queued" || !decisionRecord)
                        ? this.incidentGuidanceView(guidance)
                        : ""}
                    ${this.compactDecision(incident, decisionRecord)}
                    <div class="incident-card__actions">
                    ${incident.state === "active" && (assessment?.next_action === "diagnose" || !assessment) ? `<button class="${escapeHtml(guidance.buttonClass)}" data-tsunade-diagnose="${escapeHtml(incident.incident_id)}" type="button" ${expertiseState === "ai_queued" ? "disabled" : ""}>${escapeHtml(guidance.buttonLabel)}</button>` : ""}
                        ${assessment?.next_action === "decisions" ? '<a class="configuration-primary-button" href="/shizune/">Examiner la demande dans Shizune</a>' : ""}
                        ${incident.state === "active" && assessment?.followup?.window_extension_available ? `<button class="configuration-primary-button" data-tsunade-log-extend="${escapeHtml(incident.incident_id)}" type="button">Autoriser : étendre aux 24 h précédentes</button>` : ""}
                        ${this.canRequestRepair(incident, repairs) ? `<button class="configuration-secondary-button" data-tsunade-repair-propose="${escapeHtml(incident.incident_id)}" type="button">Demander la réparation connue</button>` : ""}
                        ${proposedRepair && !proposedRepair.authorized_at ? `<button class="configuration-primary-button" data-incident-id="${escapeHtml(incident.incident_id)}" data-tsunade-repair-authorize="${escapeHtml(proposedRepair.repair_id)}" data-repair-risk="${escapeHtml(proposedRepair.risk ?? "low")}" type="button">Autoriser depuis Vision</button>
                        ${proposedRepair.deferred_until ? "" : `<button class="configuration-secondary-button" data-incident-id="${escapeHtml(incident.incident_id)}" data-repair-id="${escapeHtml(proposedRepair.repair_id)}" data-tsunade-repair-decision="defer" type="button">Plus tard</button>`}
                        <button class="configuration-secondary-button" data-incident-id="${escapeHtml(incident.incident_id)}" data-repair-id="${escapeHtml(proposedRepair.repair_id)}" data-tsunade-repair-decision="refuse" type="button">Refuser</button>` : ""}
                        ${this.canDeclareManual(incident) ? `<button class="configuration-secondary-button" data-tsunade-manual-open="${escapeHtml(incident.incident_id)}" type="button">J’ai corrigé manuellement</button>` : ""}
                        <button class="configuration-secondary-button" data-tsunade-details="${escapeHtml(incident.incident_id)}" type="button">${this.expandedDetails.has(incident.incident_id) ? "Fermer le dossier" : "Voir le dossier"}</button>
                        <button class="configuration-secondary-button" data-tsunade-similar="${escapeHtml(incident.incident_id)}" type="button">${this.similar?.has(incident.incident_id) ? "Masquer les incidents semblables" : "Incidents semblables"}</button>
                    </div>
                    ${this.similarView(incident.incident_id)}
                    ${this.manualForm(incident)}
                    ${this.manualStatus(incident)}
                    ${this.manualLeads(incident)}
                    ${repairs.length ? `<p class="incident-card__repair"><strong>${escapeHtml(this.sentence(repairs[0].action ?? "réparation supervisée"))}</strong> · ${escapeHtml(this.repairStatus(repairs[0]))}${repairs[0].status === "failed" && repairs[0].result ? `<br><span>${escapeHtml(repairs[0].result)}</span>` : ""}</p>` : ""}
                    ${proposedRepair ? this.pendingRepairRisk(proposedRepair) : ""}
                    ${experience ? `<div class="incident-experience"><strong>${escapeHtml(experience.prompt)}</strong>${experience.caution ? `<small>${escapeHtml(experience.caution)}</small>` : ""}${this.experienceButton(incident.incident_id, experience.kind)}</div>` : ""}
                    ${this.expandedDetails.has(incident.incident_id) ? `
                    <div class="incident-dossier">
                    ${this.incidentJourney(incident, details, decisionRecord)}
                    ${this.tsunadeDecision(details ?? incident, decisionRecord)}
                    ${this.investigationEvidence(details)}
                    <dl class="incident-card__details">
                        <div><dt>Incident ouvert le</dt><dd>${escapeHtml(formatDate(incident.started_at))}</dd></div>
                        <div><dt>Dernière évolution</dt><dd>${escapeHtml(formatDate(incident.last_observed_at))}</dd></div>
                        <div><dt>Occurrences</dt><dd>${escapeHtml(incident.occurrence_count ?? 1)}</dd></div>
                        <div><dt>Récurrences</dt><dd>${escapeHtml(incident.recurrence_count ?? 0)}</dd></div>
                        ${incident.ended_at ? `<div><dt>Résolution</dt><dd>${escapeHtml(formatDate(incident.ended_at))}</dd></div>` : ""}
                    </dl>
                    ${logSynthesis}
                    ${this.tsunadeExpertise({...details, latest_decision: decisionRecord?.payload ?? null})}
                    ${incident.final_result ? `<p class="incident-card__result"><strong>Résultat :</strong> ${escapeHtml(incident.final_result)}</p>` : ""}
                    ${repairSummary}
                    ${incident.state === "active" && incident.capability_id === "logs.health" ? `
                        <form class="incident-log-investigation" data-tsunade-log-investigation="${escapeHtml(incident.incident_id)}">
                            <label>Motif à approfondir
                                <input maxlength="160" name="pattern" placeholder="Ex. Node 17" required type="text">
                            </label>
                            <button class="configuration-primary-button" type="submit">Approfondir les journaux</button>
                        </form>` : ""}
                    ${this.expandedDetails.has(incident.incident_id) && details ? this.evolution(details) : ""}
                    </div>` : ""}
                </div>
            </article>`;
    }

    /**
     * Name the affected service, not the raw observation message: a chrony
     * outage was titled "timed out". The message stays shown below the title.
     */
    incidentTitle(incident) {
        const assessmentTitle = incident.assessment?.title;
        if (
            assessmentTitle
            && ["network.reachable", "logs.health"].includes(incident.capability_id)
        ) {
            return assessmentTitle;
        }
        if (!incident.service_id) {
            return assessmentTitle ?? this.equipmentLabel(incident.node_id);
        }
        return `${this.serviceLabel(incident.node_id, incident.service_id)} · `
            + this.equipmentLabel(incident.node_id);
    }

    displaySeverity(incident, severity) {
        if (incident.capability_id === "logs.health") {
            return {label: "Journaux", tone: "degraded"};
        }
        return {
            label: SEVERITY_LABELS[severity] ?? severity,
            tone: severity,
        };
    }

    incidentJourney(incident, details, decisionRecord) {
        // Summarize recorded events only: an action event can be a proposal,
        // and a result does not by itself prove a successful verification.
        const labels = {
            opened: "Observation initiale", observed: "Dernière observation",
            escalated: "Aggravation", investigation: "Investigation",
            diagnostic: "Diagnostic", decision: "Décision",
            action: "Action ou proposition", result: "Résultat / vérification",
            resolved: "Résolution", monitoring_removed: "Fin de supervision",
        };
        const stages = new Map();
        for (const event of details?.events ?? []) {
            if (!Object.hasOwn(labels, event.kind)) continue;
            const previous = stages.get(event.kind);
            const count = (previous?.count ?? 0) + 1;
            if (!previous || (Date.parse(event.occurred_at) || 0) >= (Date.parse(previous.event.occurred_at) || 0)) {
                stages.set(event.kind, {event, count});
            } else {
                previous.count = count;
            }
        }
        const assessment = incident.assessment;
        const nextActions = {
            diagnose: "Actualiser l’analyse", decisions: "Examiner la demande dans Shizune",
            details: "Consulter les détails du dossier",
        };
        const next = assessment?.next_action === null
            ? "Aucune action demandée par Agent"
            : assessment?.next_action === "details"
                ? assessment.recommended_action || nextActions.details
                : nextActions[assessment?.next_action] || "Non renseignée par Agent";
        const source = decisionRecord?.payload?.decision_source ?? decisionRecord?.payload?.origin;
        const provenance = TSUNADE_DECISION_SOURCE_LABELS[source] ?? source ?? "Origine de l’analyse non renseignée";
        const rows = [...stages.values()].sort((a, b) =>
            (Date.parse(a.event.occurred_at) || 0) - (Date.parse(b.event.occurred_at) || 0));
        return `<section class="incident-journey" aria-label="Parcours de l’incident">
            <h4>Parcours de l’incident</h4>
            <p><strong>Prochaine action :</strong> ${escapeHtml(next)}</p>
            <p><strong>Source :</strong> Agent · ${escapeHtml(provenance)}</p>
            ${assessment?.decision_current === false ? '<p>La décision ne couvre pas les derniers éléments reçus.</p>' : ""}
            ${rows.length ? `<p>Dernier événement de chaque type ; toutes les occurrences restent dans la chronologie ci-dessous.</p>
            <ol>${rows.map(({event, count}) => `<li>
                <strong>${escapeHtml(labels[event.kind])}${count > 1 ? ` (${count})` : ""}</strong>
                <time>${escapeHtml(event.occurred_at ? formatDate(event.occurred_at) : "Date non renseignée")}</time>
                <span>${escapeHtml(this.translatedSummary(event.summary ?? "Sans résumé"))}</span>
            </li>`).join("")}</ol>` : `<p>${details ? "Aucune étape enregistrée." : "Parcours disponible après chargement du dossier."}</p>`}
        </section>`;
    }

    evolution(incident) {
        const events = Array.isArray(incident.events) ? incident.events : [];
        if (events.length === 0) {
            return '<p class="incident-card__evolution">Aucune évolution enregistrée.</p>';
        }
        return `<ol class="incident-card__evolution">${events.map((event) => `
            <li>
                <header>
                    <time>${escapeHtml(formatDate(event.occurred_at))}</time>
                    <strong>${escapeHtml(EVENT_LABELS[event.kind] ?? this.readableIdentifier(event.kind))}</strong>
                </header>
                <p>${escapeHtml(this.translatedSummary(event.summary))}</p>
                ${this.expertiseDetails(event.payload)}
            </li>`).join("")}</ol>`;
    }

    async diagnose(incidentId, button) {
        if (!incidentId) {
            return;
        }
        button.disabled = true;
        this.showError("");
        this.showCommandStatus("Analyse demandée à Tsunade…", "running");
        try {
            const outcome = await requestJson(API.tsunadeDiagnose(incidentId), {
                method: "POST",
            });

            if (outcome?.status === "AI_QUEUED") {
                if (!outcome.ai_job_id) {
                    throw new Error("Tsunade n’a pas renvoyé l’identifiant de l’analyse Katsuyu");
                }
                const job = await this.followJob(
                    {
                        job_id: outcome.ai_job_id,
                        status: "QUEUED",
                    },
                    "Analyse Katsuyu",
                );
                this.details.delete(incidentId);
                this.expandedDetails.delete(incidentId);
                await this.load();
                if (job.status === "SUCCEEDED") {
                    this.showCommandStatus("Analyse Katsuyu terminée ; la décision Tsunade est à jour.");
                } else {
                    const reason = job.error?.message
                        ? ` · ${job.error.message}`
                        : "";
                    this.showError(
                        `Analyse Katsuyu ${this.jobStatusLabel(job.status)}${reason}`,
                    );
                    this.showCommandStatus("");
                }
                return;
            }

            this.details.delete(incidentId);
            this.expandedDetails.delete(incidentId);
            await this.load();
            if (outcome?.status === "DETERMINISTIC") {
                this.showCommandStatus("Diagnostic Tsunade terminé sans analyse Katsuyu.");
            } else if (outcome?.status === "INSUFFICIENT_CONTEXT") {
                this.showCommandStatus(
                    outcome.diagnosis
                        ?? "Tsunade ne dispose pas d’assez de contexte et aucun worker Katsuyu compatible n’est disponible.",
                    "warning",
                );
            } else {
                this.showCommandStatus("Diagnostic Tsunade terminé.");
            }
        } catch (error) {
            this.showCommandStatus("");
            this.showError(`Diagnostic indisponible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
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
                "running",
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

    jobStatusLabel(status) {
        const labels = {
            CREATED: "créé",
            QUEUED: "en attente",
            WAITING_WORKER: "en attente du prochain lot de 05:00 (Bubule éteint)",
            RUNNING: "en cours",
            SUCCEEDED: "terminé",
            FAILED: "en échec",
            CANCELLED: "annulé",
            TIMEOUT: "délai dépassé",
        };
        return labels[status] ?? this.readableIdentifier(status);
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

    showCommandStatus(message, tone = "success", experienceIncident = null) {
        window.clearTimeout(this.commandStatusTimer);
        if (message && tone === "success") {
            // A confirmation is transient; warnings and running states stay.
            this.commandStatusTimer = window.setTimeout(() => this.showCommandStatus(""), 30000);
        }
        if (this.elements.commandStatus) {
            this.elements.commandStatus.innerHTML = message
                ? escapeHtml(message) + (experienceIncident ? ` ${this.experienceButton(experienceIncident)}` : "")
                : "";
            this.elements.commandStatus.classList.toggle("hidden", !message);
            this.elements.commandStatus.classList.toggle(
                "is-running",
                Boolean(message) && tone === "running",
            );
            this.elements.commandStatus.classList.toggle(
                "is-warning",
                Boolean(message) && tone === "warning",
            );
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
