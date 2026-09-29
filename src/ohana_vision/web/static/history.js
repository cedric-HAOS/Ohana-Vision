"use strict";

// Phase 3 hardening: Tsunade's incident history — search, equipment sheet
// and a 30-day timeline. Read only; every figure comes from the Agent.

import {API, fetchJson} from "./api.js";
import {escapeHtml, formatDate} from "./utils.js";

export const OUTCOME_LABELS = Object.freeze({
    ongoing: "En cours",
    repaired: "Réparé (vérifié)",
    manual: "Action manuelle confirmée",
    resolved: "Revenu seul",
});

const SEVERITY_LABELS = Object.freeze({critical: "Critique", degraded: "Dégradé"});

const PERIODS = Object.freeze([
    ["7", "7 jours"],
    ["30", "30 jours"],
    ["90", "90 jours"],
    ["", "Tout l’historique"],
]);

/** Duration in French: 45 s, 12 min, 3 h 05, 2 j 4 h. */
export function formatDuration(seconds) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
    if (seconds < 60) return `${Math.round(seconds)} s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) {
        return `${Math.floor(seconds / 3600)} h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;
    }
    return `${Math.floor(seconds / 86400)} j ${Math.floor((seconds % 86400) / 3600)} h`;
}

const instant = (value) => new Date(String(value)).getTime();

/** Place each incident of the window on its equipment's row (percentages). */
export function timelineRows(timeline) {
    const since = instant(timeline?.since);
    const until = instant(timeline?.until);
    const span = until - since;
    if (!Number.isFinite(span) || span <= 0) return [];
    const rows = new Map();
    const place = (start, end) => {
        const left = Math.max(0, Math.min(100, ((start - since) / span) * 100));
        const right = Math.max(0, Math.min(100, ((end - since) / span) * 100));
        return {left, width: Math.max(right - left, 0.4)};
    };
    for (const incident of timeline.incidents ?? []) {
        const row = rows.get(incident.equipment_id) ?? {equipment_id: incident.equipment_id, bars: [], repairs: []};
        const start = instant(incident.started_at);
        const end = incident.ended_at ? instant(incident.ended_at) : until;
        row.bars.push({...place(start, end), incident});
        rows.set(incident.equipment_id, row);
    }
    for (const repair of timeline.repairs ?? []) {
        const row = rows.get(repair.equipment_id) ?? {equipment_id: repair.equipment_id, bars: [], repairs: []};
        row.repairs.push({left: place(instant(repair.executed_at), instant(repair.executed_at)).left, repair});
        rows.set(repair.equipment_id, row);
    }
    return [...rows.values()].sort((left, right) => left.equipment_id.localeCompare(right.equipment_id));
}

function equipmentLabel(id) {
    return String(id ?? "").toUpperCase();
}

export class HistoryController {
    constructor() {
        this.container = document.querySelector("#history-content");
        this.filters = {period: "30", equipment_id: "", capability_id: "", outcome: ""};
        this.sheet = null;
        this.loaded = false;
        this.container?.addEventListener("change", (event) => {
            const field = event.target.closest("[data-history-filter]");
            if (field) {
                this.filters[field.dataset.historyFilter] = field.value;
                void this.load();
            }
        });
        this.container?.addEventListener("click", (event) => {
            const equipment = event.target.closest("[data-history-equipment]");
            if (equipment) {
                void this.openSheet(equipment.dataset.historyEquipment);
                return;
            }
            if (event.target.closest("[data-history-close-sheet]")) {
                this.sheet = null;
                this.render();
            }
        });
    }

    query() {
        const parameters = new URLSearchParams();
        if (this.filters.period) {
            const since = new Date(Date.now() - Number(this.filters.period) * 86_400_000);
            parameters.set("since", since.toISOString());
        }
        for (const key of ["equipment_id", "capability_id", "outcome"]) {
            if (this.filters[key]) parameters.set(key, this.filters[key]);
        }
        const text = parameters.toString();
        return text ? `${API.tsunadeHistory}?${text}` : API.tsunadeHistory;
    }

    async load() {
        if (!this.container) return;
        try {
            const [history, timeline] = await Promise.all([
                fetchJson(this.query()),
                fetchJson(API.tsunadeTimeline),
            ]);
            this.history = history;
            this.timeline = timeline;
            this.error = null;
        } catch (error) {
            this.error = error?.message ?? String(error);
        }
        this.loaded = true;
        this.render();
    }

    async openSheet(equipmentId) {
        try {
            this.sheet = await fetchJson(API.tsunadeEquipmentHistory(equipmentId));
        } catch (error) {
            this.sheet = {error: error?.message ?? String(error), equipment_id: equipmentId};
        }
        this.render();
        this.container?.querySelector(".history-sheet")?.scrollIntoView({block: "nearest"});
    }

    render() {
        if (!this.container) return;
        if (this.error) {
            this.container.innerHTML = `<p class="history-empty">Historique indisponible : ${escapeHtml(this.error)}</p>`;
            return;
        }
        const facets = this.history?.facets ?? {equipment_id: [], capability_id: []};
        const select = (key, options, all) => `<select data-history-filter="${key}">
            <option value="">${escapeHtml(all)}</option>
            ${options.map(([value, label]) => `<option value="${escapeHtml(value)}"${this.filters[key] === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}
        </select>`;
        const filters = `<form class="history-filters" onsubmit="return false">
            <label>Période ${`<select data-history-filter="period">${PERIODS.map(([value, label]) => `<option value="${value}"${this.filters.period === value ? " selected" : ""}>${label}</option>`).join("")}</select>`}</label>
            <label>Équipement ${select("equipment_id", facets.equipment_id.map((id) => [id, equipmentLabel(id)]), "Tous")}</label>
            <label>Capacité ${select("capability_id", facets.capability_id.map((id) => [id, id]), "Toutes")}</label>
            <label>Issue ${select("outcome", Object.entries(OUTCOME_LABELS), "Toutes")}</label>
        </form>`;
        const incidents = this.history?.incidents ?? [];
        const table = incidents.length
            ? `<div class="history-table-wrapper"><table class="history-table">
                <thead><tr><th>Début</th><th>Équipement</th><th>Capacité</th><th>Gravité</th><th>Durée</th><th>Issue</th></tr></thead>
                <tbody>${incidents.map((item) => `<tr data-outcome="${escapeHtml(item.outcome)}">
                    <td>${escapeHtml(formatDate(item.started_at))}</td>
                    <td><button class="history-link" data-history-equipment="${escapeHtml(item.equipment_id)}" type="button">${escapeHtml(equipmentLabel(item.equipment_id))}</button></td>
                    <td>${escapeHtml(item.capability_id)}<small>${escapeHtml(item.opening_message ?? item.message ?? "")}</small></td>
                    <td>${escapeHtml(SEVERITY_LABELS[item.severity] ?? item.severity)}</td>
                    <td>${escapeHtml(formatDuration(item.duration_seconds))}</td>
                    <td><span class="history-outcome">${escapeHtml(OUTCOME_LABELS[item.outcome] ?? item.outcome)}</span>${item.repair_failed ? "<small>une réparation a échoué</small>" : ""}</td>
                </tr>`).join("")}</tbody>
            </table></div>`
            : "<p class=\"history-empty\">Aucun incident pour ces critères.</p>";
        this.container.innerHTML = `${filters}
            <p class="history-count">${incidents.length} incident(s)${incidents.length >= (this.history?.limit ?? Infinity) ? " (limite atteinte)" : ""}</p>
            ${table}
            ${this.renderSheet()}
            ${this.renderTimeline()}`;
    }

    renderSheet() {
        const sheet = this.sheet;
        if (!sheet) return "";
        if (sheet.error) {
            return `<section class="history-sheet"><p>Fiche indisponible : ${escapeHtml(sheet.error)}</p></section>`;
        }
        const repairs = sheet.repairs ?? {};
        const rate = repairs.success_rate === null || repairs.success_rate === undefined
            ? "aucune réparation vérifiée"
            : `${repairs.success_rate} % de réussite`;
        return `<section class="history-sheet" aria-label="Fiche ${escapeHtml(equipmentLabel(sheet.equipment_id))}">
            <header><h3>${escapeHtml(equipmentLabel(sheet.equipment_id))}</h3>
                <button class="configuration-secondary-button" data-history-close-sheet type="button">Fermer</button></header>
            <dl class="history-sheet__facts">
                <div><dt>Incidents</dt><dd>${sheet.incident_count} dont ${sheet.open_count} en cours</dd></div>
                <div><dt>Durée cumulée</dt><dd>${escapeHtml(formatDuration(sheet.total_duration_seconds))}</dd></div>
                <div><dt>Réparations exécutées</dt><dd>${repairs.executed ?? 0} · ${escapeHtml(rate)}</dd></div>
                <div><dt>Actions manuelles</dt><dd>${sheet.manual_actions?.declared ?? 0} déclarée(s), ${sheet.manual_actions?.confirmed ?? 0} confirmée(s)</dd></div>
            </dl>
            <h4>Par capacité</h4>
            <ul>${(sheet.by_capability ?? []).map((item) => `<li>${escapeHtml(item.capability_id)} : ${item.count} incident(s), dernier le ${escapeHtml(formatDate(item.last_started_at))}</li>`).join("")}</ul>
            <h4>Réparations connues</h4>
            ${(sheet.known_repairs ?? []).length
        ? `<ul>${sheet.known_repairs.map((item) => `<li>${escapeHtml(item.action?.operation ?? "")} ${escapeHtml(item.action?.target ?? item.action?.description ?? "")} · ${escapeHtml(item.state)} · ${item.success_count} réussite(s), ${item.failure_count} échec(s)</li>`).join("")}</ul>`
        : "<p>Aucune réparation connue pour cet équipement.</p>"}
        </section>`;
    }

    renderTimeline() {
        const rows = timelineRows(this.timeline);
        if (!rows.length) {
            return "<section class=\"history-timeline\"><h3>30 derniers jours</h3><p class=\"history-empty\">Aucun incident sur 30 jours.</p></section>";
        }
        return `<section class="history-timeline" aria-label="Frise des 30 derniers jours">
            <h3>30 derniers jours</h3>
            <p class="history-timeline__range">${escapeHtml(formatDate(this.timeline.since))} → ${escapeHtml(formatDate(this.timeline.until))}</p>
            ${rows.map((row) => `<div class="history-timeline__row">
                <button class="history-link" data-history-equipment="${escapeHtml(row.equipment_id)}" type="button">${escapeHtml(equipmentLabel(row.equipment_id))}</button>
                <div class="history-timeline__track">
                    ${row.bars.map((bar) => `<span class="history-timeline__bar" data-severity="${escapeHtml(bar.incident.severity)}" data-outcome="${escapeHtml(bar.incident.outcome)}" style="left:${bar.left.toFixed(2)}%;width:${bar.width.toFixed(2)}%" title="${escapeHtml(`${bar.incident.capability_id} · ${formatDate(bar.incident.started_at)} · ${formatDuration(bar.incident.duration_seconds)} · ${OUTCOME_LABELS[bar.incident.outcome] ?? bar.incident.outcome}`)}"></span>`).join("")}
                    ${row.repairs.map((mark) => `<span class="history-timeline__repair" data-status="${escapeHtml(mark.repair.status)}" style="left:${mark.left.toFixed(2)}%" title="${escapeHtml(`Réparation ${mark.repair.operation} ${mark.repair.target} · ${mark.repair.status} · ${formatDate(mark.repair.executed_at)}`)}"></span>`).join("")}
                </div>
            </div>`).join("")}
            <p class="history-timeline__legend"><span class="history-timeline__bar" data-severity="degraded"></span> dégradé <span class="history-timeline__bar" data-severity="critical"></span> critique <span class="history-timeline__repair" data-status="succeeded"></span> réparation</p>
        </section>`;
    }
}
