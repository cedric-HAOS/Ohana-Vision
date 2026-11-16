"use strict";

// Tableau de triage des incidents Tsunade : une ligne par incident avec la
// cause probable, sa certitude et l'action proposée, regroupée par équipement,
// gravité ou jour ; le dossier de la ligne choisie s'affiche à droite.
// Ces méthodes sont ajoutées au contrôleur des incidents au chargement de
// ce module (voir application.js).

import {API, fetchJson} from "./api.js";
import {IncidentsController} from "./incidents.js";
import {CAPABILITY_LABELS, DIAGNOSTIC_LEVELS, INCIDENT_GROUPINGS, WORKFLOW_LABELS, mixInto} from "./incidents_shared.js";
import {escapeHtml} from "./utils.js";

const TABLE_COLUMNS = 4;
const SHORT_REPAIR_STATUS = Object.freeze({
    proposed: "proposée",
    authorized: "autorisée",
    refused: "refusée",
    expired: "proposition expirée",
    verifying: "vérification en cours",
    succeeded: "réussie",
    failed: "en échec",
    unverified: "non confirmée",
});

class TableMethods {
    renderIncidentList() {
        this.elements.filters.forEach((button) => {
            const active = button.dataset.incidentsFilter === this.filter;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        this.elements.groupings.forEach((button) => {
            const active = button.dataset.incidentsGroup === this.groupBy;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        if (!this.elements.rows) {
            return;
        }
        if (!this.loaded) {
            this.elements.rows.innerHTML = this.tableMessage("Chargement des incidents Tsunade…");
            return;
        }
        const visible = this.sortedIncidents(this.tableIncidents().filter(
            (incident) => this.matchesFilter(incident) && this.matchesQuery(incident),
        ));
        if (!visible.some((incident) => incident.incident_id === this.selectedIncident)) {
            this.selectedIncident = visible[0]?.incident_id ?? null;
        }
        this.elements.rows.innerHTML = (visible.length
            ? this.incidentRows(visible)
            : this.tableMessage(this.query.trim()
                ? "Aucun incident ne correspond à la recherche."
                : "Aucun incident dans cet état."))
            + this.olderIncidentsRow();
        this.renderIncidentDetail();
    }

    /** The latest incidents from Agent, then the older resolved pages loaded. */
    tableIncidents() {
        const listed = new Set(this.incidents.map((incident) => incident.incident_id));
        return [
            ...this.incidents,
            ...this.olderIncidents.filter((incident) => !listed.has(incident.incident_id)),
        ];
    }

    /** Oldest resolved incident held: the next page starts before it. */
    olderAnchor() {
        let anchor = null;
        for (const incident of this.tableIncidents()) {
            if (incident.state !== "resolved") continue;
            const started = Date.parse(incident.started_at ?? "");
            if (!Number.isFinite(started)) continue;
            if (!anchor || started < anchor.started) {
                anchor = {id: incident.incident_id, started};
            }
        }
        return anchor?.id ?? null;
    }

    /** Say how much history is searchable and offer the older resolved page. */
    olderIncidentsRow() {
        if (this.filter === "active") {
            return "";
        }
        const held = this.tableIncidents().length;
        const total = Number(this.summary?.incident_count);
        const known = Number.isFinite(total) && total >= held;
        const scope = known
            ? `${held} incident${held > 1 ? "s" : ""} chargé${held > 1 ? "s" : ""} sur ${total}`
            : `${held} incident${held > 1 ? "s" : ""} chargé${held > 1 ? "s" : ""}`;
        const more = !this.olderExhausted && this.olderAnchor() && (!known || held < total);
        return `<tr class="incidents-table__more"><td colspan="${TABLE_COLUMNS}">
            <span>${escapeHtml(scope)} : la recherche et les regroupements portent sur ceux-ci.</span>
            ${more ? '<button class="configuration-secondary-button" data-tsunade-older type="button">Charger les 100 incidents résolus plus anciens</button>' : ""}
        </td></tr>`;
    }

    async loadOlderIncidents(button) {
        const anchor = this.olderAnchor();
        if (!anchor) {
            return;
        }
        button.disabled = true;
        button.textContent = "Chargement…";
        try {
            const payload = await fetchJson(API.tsunadeOlderIncidents(anchor));
            const held = new Set(this.tableIncidents().map((incident) => incident.incident_id));
            const page = Array.isArray(payload?.incidents) ? payload.incidents : [];
            this.olderIncidents.push(...page.filter((incident) => !held.has(incident.incident_id)));
            this.olderExhausted = payload?.has_more !== true;
        } catch (error) {
            this.showError(
                `Historique plus ancien indisponible : ${this.errorMessage(error)}. `
                + "Il demande une version d’Ohana-Agent qui sert les pages d’incidents plus anciens.",
            );
        } finally {
            this.renderIncidentList();
        }
    }

    matchesFilter(incident) {
        if (this.filter === "all") {
            return true;
        }
        if (this.filter === "active") {
            // A form being filled stays in view when the incident closes.
            return incident.state === "active"
                || (this.manualForms.has(incident.incident_id) && this.manualDeclarable(incident));
        }
        return incident.workflow_state === this.filter;
    }

    /** Every word of the search must appear somewhere in the row or its decision. */
    matchesQuery(incident) {
        const words = this.normalizedText(this.query).split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            return true;
        }
        const decision = this.latestTsunadeDecision(incident) ?? {};
        const text = this.normalizedText([
            this.equipmentLabel(incident.node_id),
            this.incidentProblem(incident),
            incident.node_id,
            incident.service_id,
            incident.capability_id,
            incident.message,
            incident.opening_message,
            decision.interpretation,
            decision.conclusion,
            decision.recommended_action,
            incident.assessment?.recommended_action,
            this.parisDay(incident.started_at),
            ...(Array.isArray(incident.repairs) ? incident.repairs.map((repair) => repair.action) : []),
        ].filter(Boolean).join(" "));
        return words.every((word) => text.includes(word));
    }

    normalizedText(value) {
        return String(value ?? "")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .trim();
    }

    /** Active incidents first by priority, then the most recent; by date only per day. */
    sortedIncidents(incidents) {
        const started = (incident) => Date.parse(incident.started_at ?? "") || 0;
        return [...incidents].sort((a, b) => {
            if (this.groupBy !== "day") {
                const activeOrder = Number(b.state === "active") - Number(a.state === "active");
                if (activeOrder !== 0) return activeOrder;
                const priority = (a.assessment?.priority ?? 9) - (b.assessment?.priority ?? 9);
                if (priority !== 0) return priority;
            }
            return started(b) - started(a);
        });
    }

    incidentRows(incidents) {
        if (this.groupBy === "none") {
            return incidents.map((incident) => this.incidentRow(incident)).join("");
        }
        const groups = new Map();
        for (const incident of incidents) {
            const key = this.incidentGroupKey(incident);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(incident);
        }
        return Array.from(groups, ([key, members]) => {
            const active = members.filter((incident) => incident.state === "active").length;
            const count = `${members.length} incident${members.length > 1 ? "s" : ""}`
                + (active ? ` · ${active} actif${active > 1 ? "s" : ""}` : "");
            return `<tr class="incidents-table__group"><th colspan="${TABLE_COLUMNS}" scope="colgroup">${escapeHtml(key)} <span>${escapeHtml(count)}</span></th></tr>`
                + members.map((incident) => this.incidentRow(incident)).join("");
        }).join("");
    }

    incidentGroupKey(incident) {
        if (this.groupBy === "severity") {
            return this.displaySeverity(incident, String(incident.severity ?? "degraded").toLowerCase()).label;
        }
        if (this.groupBy === "day") {
            return this.dayLabel(incident.started_at);
        }
        return this.equipmentLabel(incident.node_id);
    }

    incidentRow(incident) {
        const id = incident.incident_id;
        const selected = id === this.selectedIncident;
        const severity = this.displaySeverity(incident, String(incident.severity ?? "degraded").toLowerCase());
        const workflow = String(incident.workflow_state ?? "new").toLowerCase();
        const cause = this.incidentCause(incident);
        const duration = this.incidentDuration(incident);
        return `<tr class="incidents-table__row ${incident.state === "resolved" ? "is-resolved" : "is-active"}${selected ? " is-selected" : ""}" data-tsunade-select="${escapeHtml(id)}" tabindex="0"${selected ? ' aria-current="true"' : ""}>
            <td class="incidents-table__subject"><strong>${escapeHtml(this.equipmentLabel(incident.node_id))}</strong><span>${escapeHtml(this.incidentProblem(incident))}</span><span class="incidents-table__state"><span class="incidents-table__severity incidents-table__severity--${escapeHtml(severity.tone)}">${escapeHtml(severity.label)}</span><span class="incident-badge incident-badge--${escapeHtml(workflow)}">${escapeHtml(WORKFLOW_LABELS[workflow] ?? workflow)}</span></span></td>
            <td>${this.certaintyBadge(incident)}<span class="incidents-table__clip${cause.muted ? " is-muted" : ""}">${escapeHtml(cause.text)}</span>${cause.stale ? "<small>Conclusion à actualiser</small>" : ""}</td>
            <td><span class="incidents-table__clip">${this.incidentActionSummary(incident)}</span></td>
            <td class="incidents-table__time"><time datetime="${escapeHtml(incident.started_at ?? "")}">${escapeHtml(this.shortDate(incident.started_at))}</time><span>${escapeHtml(incident.state === "active" && duration !== "—" ? `depuis ${duration}` : duration)}</span></td>
        </tr>`;
    }

    /**
     * Name what is watched, never the last message: once resolved, the
     * message says "DNS resolution succeeded", which hides the problem.
     */
    incidentProblem(incident) {
        if (incident.capability_id === "logs.health") {
            return CAPABILITY_LABELS["logs.health"];
        }
        const capability = CAPABILITY_LABELS[incident.capability_id];
        if (incident.service_id && incident.service_id !== incident.node_id) {
            // A service unknown to the topology only has its identifier: the
            // watched capability says what failed.
            const identifier = this.readableIdentifier(incident.service_id);
            const label = this.serviceLabel(incident.node_id, incident.service_id);
            return label === identifier && capability ? `${capability} · ${identifier}` : label;
        }
        return capability ?? this.readableIdentifier(incident.capability_id);
    }

    /** The specific interpretation first: the conclusion is often a generic sentence. */
    incidentCause(incident) {
        if (incident.expertise_state === "ai_queued" || incident.assessment?.state === "analyzing") {
            return {text: "Analyse en cours", muted: true, stale: false};
        }
        const record = this.latestTsunadeDecisionRecord(incident);
        const decision = record?.payload;
        if (!decision) {
            const symptom = incident.opening_message;
            return {
                text: symptom ? `Pas encore analysé · constat : ${symptom}` : "Pas encore analysé",
                muted: true,
                stale: false,
            };
        }
        return {
            text: decision.interpretation || decision.conclusion || decision.reason
                || "Les éléments disponibles ne permettent pas de conclure.",
            muted: false,
            stale: incident.state === "active" && this.decisionFreshness(incident, record) === "stale",
        };
    }

    certaintyBadge(incident) {
        const decision = this.latestTsunadeDecision(incident);
        if (!decision) {
            return '<span class="incident-certainty incident-certainty--none">Pas d’analyse</span>';
        }
        const level = String(decision.diagnostic_level ?? "").toUpperCase();
        const known = DIAGNOSTIC_LEVELS[level];
        const label = known?.label ?? (level ? this.readableIdentifier(level.toLowerCase()) : "Non précisée");
        const confidence = Number(decision.confidence);
        const percent = decision.confidence != null && Number.isFinite(confidence)
            ? ` · ${Math.round(confidence * 100)} %`
            : "";
        return `<span class="incident-certainty incident-certainty--${escapeHtml(known?.tone ?? "unknown")}">${escapeHtml(label + percent)}</span>`;
    }

    /** What waits on the user comes first, then the repair or the recommendation. */
    incidentActionSummary(incident) {
        const repairs = Array.isArray(incident.repairs) ? incident.repairs : [];
        const proposed = repairs.find((repair) => repair.status === "proposed" && !repair.authorized_at);
        if (incident.state === "active" && proposed) {
            return `<strong class="incidents-table__awaiting">À autoriser :</strong> ${escapeHtml(this.sentence(proposed.action ?? "réparation supervisée"))}`;
        }
        if (incident.state === "active" && incident.assessment?.next_action === "decisions") {
            return '<strong class="incidents-table__awaiting">Demande à examiner dans Shizune</strong>';
        }
        const repair = repairs[0];
        if (repair && incident.state === "resolved") {
            const status = SHORT_REPAIR_STATUS[repair.status] ?? repair.status;
            return escapeHtml(`${this.sentence(repair.action ?? "réparation supervisée")} : ${status}`);
        }
        const recommended = this.latestTsunadeDecision(incident)?.recommended_action
            || incident.assessment?.recommended_action;
        return recommended ? escapeHtml(recommended) : '<span class="is-muted">—</span>';
    }

    incidentDuration(incident, now = Date.now()) {
        const start = Date.parse(incident.started_at ?? "");
        const end = incident.ended_at ? Date.parse(incident.ended_at) : now;
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
            return "—";
        }
        const minutes = Math.round((end - start) / 60000);
        if (minutes < 1) return "moins d’1 min";
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        if (hours < 48) return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
        return `${Math.floor(hours / 24)} j`;
    }

    parisParts(value, options) {
        const date = new Date(String(value ?? ""));
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        return new Intl.DateTimeFormat("fr-FR", {timeZone: "Europe/Paris", ...options}).format(date);
    }

    shortDate(value) {
        return this.parisParts(value, {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}) ?? "—";
    }

    parisDay(value) {
        return this.parisParts(value, {dateStyle: "short"}) ?? "";
    }

    dayLabel(value, now = new Date()) {
        const day = this.parisDay(value);
        if (!day) {
            return "Date inconnue";
        }
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        if (day === this.parisDay(now)) return `Aujourd’hui · ${day}`;
        if (day === this.parisDay(yesterday)) return `Hier · ${day}`;
        const label = this.parisParts(value, {weekday: "long", day: "numeric", month: "long", year: "numeric"});
        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    tableMessage(message) {
        return `<tr><td class="incidents-table__empty" colspan="${TABLE_COLUMNS}">${escapeHtml(message)}</td></tr>`;
    }

    renderIncidentDetail() {
        if (!this.elements.detail) {
            return;
        }
        const incident = this.tableIncidents().find((item) => item.incident_id === this.selectedIncident);
        this.elements.detail.innerHTML = incident
            ? this.incidentCard(incident)
            : '<p class="incidents-detail__hint">Sélectionnez un incident pour afficher sa cause, l’action proposée et son dossier.</p>';
    }

    /** Select a row and open its dossier beside the table. */
    async selectIncident(incidentId) {
        if (!incidentId) {
            return;
        }
        const changed = incidentId !== this.selectedIncident;
        this.selectedIncident = incidentId;
        this.renderIncidentList();
        if (changed) {
            this.elements.detail?.scrollTo?.({top: 0});
        }
        if (!this.expandedDetails.has(incidentId)) {
            await this.loadDetails(incidentId, {disabled: false});
        }
    }

    /** Arrow keys move through the rows, Enter or Space opens the focused one. */
    handleRowKey(event) {
        const row = event.target.closest?.("[data-tsunade-select]");
        if (!row) {
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            void this.selectIncident(row.dataset.tsunadeSelect);
            return;
        }
        const step = {ArrowDown: 1, ArrowUp: -1}[event.key];
        if (!step) {
            return;
        }
        event.preventDefault();
        const rows = Array.from(this.elements.rows.querySelectorAll("[data-tsunade-select]"));
        rows[rows.indexOf(row) + step]?.focus();
    }

    selectGrouping(name) {
        this.groupBy = INCIDENT_GROUPINGS.includes(name) ? name : "equipment";
        this.storeValue("ohana.tsunade.group", this.groupBy);
        this.renderIncidentList();
    }
}

mixInto(IncidentsController, TableMethods);
