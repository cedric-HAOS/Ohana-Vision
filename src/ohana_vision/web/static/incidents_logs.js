"use strict";

// Contrôle, analyse et investigation des journaux, anomalies acceptées.
// Ces méthodes sont ajoutées au contrôleur des incidents au chargement de
// ce module (voir application.js).

import {API, requestJson} from "./api.js";
import {IncidentsController} from "./incidents.js";
import {LOG_SOURCE_LABELS, TREND_LABELS, mixInto} from "./incidents_shared.js";
import {escapeHtml, formatDate} from "./utils.js";

class LogMethods {
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

    async extendLogInvestigation(incidentId, button) {
        // The click is the authorization: Agent re-checks the policy and
        // reuses the finished follow-up's motif and byte budget.
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(API.tsunadeLogInvestigateExtend(incidentId), {
                method: "POST",
                body: JSON.stringify({
                    source: "vision",
                    authorized_by: "utilisateur Vision",
                }),
            });
            this.details.delete(incidentId);
            this.expandedDetails.delete(incidentId);
            this.showCommandStatus(
                "Collecte sur 24 heures autorisée ; Katsuyu la traite puis Tsunade réévalue.",
                "running",
            );
            await this.load();
        } catch (error) {
            this.showError(`Extension impossible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
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
        // Sections the user unfolded stay open across the periodic refresh.
        this.elements.logHealth.querySelectorAll("details[data-log-source]").forEach((details) => {
            if (details.open) {
                this.openLogSources.add(details.dataset.logSource);
            } else {
                this.openLogSources.delete(details.dataset.logSource);
            }
        });
        const bySource = new Map(result.sources.map((source) => [source.source, source]));
        const rows = Object.entries(LOG_SOURCE_LABELS).map(([sourceId, label]) => {
            const source = bySource.get(sourceId);
            const followed = this.incidents.some((incident) => incident.state === "active"
                && incident.capability_id === "logs.health"
                && incident.equipment_id === sourceId);
            const noisy = Array.isArray(source?.findings) && source.findings.length > 0;
            const [state, mark, css] = !source
                ? ["Non analysé", "—", ""]
                : followed
                    ? ["À examiner", "!", "is-unhealthy"]
                    : noisy
                        ? ["Bruit de fond", "✓", "is-healthy"]
                        : ["Sain", "✓", "is-healthy"];
            const components = this.logComponents?.find((item) => item.source === sourceId)?.components ?? [];
            if (!components.length) {
                return `<li class="${css}"><strong>${escapeHtml(label)}</strong><span>${mark} ${escapeHtml(state)}</span></li>`;
            }
            return `<li class="${css} incidents-log-source"><details data-log-source="${escapeHtml(sourceId)}"${this.openLogSources.has(sourceId) ? " open" : ""}>
                <summary><strong>${escapeHtml(label)}</strong><span>${mark} ${escapeHtml(state)} · ${components.length} composant(s)</span></summary>
                <ul class="incidents-log-components">${components.map((component) => this.logComponentRow(sourceId, component)).join("")}</ul>
            </details></li>`;
        }).join("");
        this.elements.logHealth.innerHTML = `<ul>${rows}</ul><p>Contrôle global effectué le <strong>${escapeHtml(formatDate(result.analyzed_at ?? this.logHealth.finished_at))}</strong></p>
            <p><small>« Bruit de fond » : anomalies sans gravité ou acceptées, sans incident. Un incident n’est ouvert que pour une erreur ou un avertissement répété au moins 100 fois en 24 h.</small></p>
            ${this.acceptedLogsReport()}`;
    }

    logComponentRow(sourceId, component) {
        const severities = {critical: "critique", error: "erreur", warning: "avertissement"};
        const detail = `${component.occurrences} occurrence(s) · ${component.signatures} signature(s) · ${severities[component.severity] ?? component.severity}`;
        const button = component.accepted
            ? `<button class="configuration-secondary-button" data-tsunade-revoke-component="${escapeHtml(component.component)}" data-source="${escapeHtml(sourceId)}" type="button">Compter à nouveau</button>`
            : component.component === "other"
                ? ""
                : `<button class="configuration-secondary-button" data-tsunade-accept-component="${escapeHtml(component.component)}" data-source="${escapeHtml(sourceId)}" data-label="${escapeHtml(component.label)}" type="button" title="Ne plus compter les anomalies de ce composant, sauf les lignes critiques">Accepter</button>`;
        return `<li class="${component.accepted ? "is-accepted" : `is-${escapeHtml(component.severity)}`}">
            <span><strong>${escapeHtml(component.label)}</strong>${component.accepted ? " <em>(acceptée)</em>" : ""}<small>${escapeHtml(detail)}</small></span>
            ${button}
        </li>`;
    }

    async setLogComponent(button, accept) {
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(accept ? API.tsunadeAcceptLogComponent : API.tsunadeRevokeLogComponent, {
                method: "POST",
                body: JSON.stringify({
                    source: button.dataset.source,
                    component: accept ? button.dataset.tsunadeAcceptComponent : button.dataset.tsunadeRevokeComponent,
                    label: button.dataset.label,
                }),
            });
            this.showCommandStatus(accept
                ? "Composant accepté comme connu : ses anomalies ne comptent plus, sauf les lignes critiques."
                : "Composant de nouveau compté à partir du prochain contrôle.");
            await this.load();
        } catch (error) {
            this.showError(`Changement impossible : ${this.errorMessage(error)}`);
            button.disabled = false;
        }
    }

    acceptedLogsReport() {
        const components = this.acceptedLogComponents.map((item) => `<li><strong>${escapeHtml(LOG_SOURCE_LABELS[item.source] ?? item.source)}</strong><span>Composant ${escapeHtml(item.label ?? item.component)} (tout sauf les lignes critiques)</span><small>accepté le ${escapeHtml(formatDate(item.accepted_at))}</small><button class="configuration-secondary-button" data-tsunade-revoke-component="${escapeHtml(item.component)}" data-source="${escapeHtml(item.source)}" type="button">Compter à nouveau</button></li>`).join("");
        if (!this.acceptedLogSignatures.length && !components) {
            return "";
        }
        const items = this.acceptedLogSignatures.map((item, index) => `<li><strong>${escapeHtml(LOG_SOURCE_LABELS[item.source] ?? item.source)}</strong><span>${escapeHtml(item.summary ?? item.signature)}</span><small>acceptée le ${escapeHtml(formatDate(item.accepted_at))}</small><button class="configuration-secondary-button" data-tsunade-revoke-log="${index}" type="button">Compter à nouveau</button></li>`).join("");
        return `<details class="incidents-log-accepted"><summary>Anomalies acceptées comme connues (${this.acceptedLogSignatures.length + this.acceptedLogComponents.length})</summary><ul>${components}${items}</ul></details>`;
    }

    async acceptLogSignature(incidentId, index, button) {
        const incident = this.incidents.find((item) => item.incident_id === incidentId);
        const finding = incident?.context?.findings?.[index];
        if (!incident || !finding?.signature) {
            return;
        }
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(API.tsunadeAcceptedLogs, {
                method: "POST",
                body: JSON.stringify({source: incident.equipment_id, signature: finding.signature}),
            });
            this.showCommandStatus("Anomalie acceptée comme connue : elle ne comptera plus dans les incidents de journaux.");
            await this.load();
        } catch (error) {
            this.showError(`Acceptation impossible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    async revokeLogSignature(index, button) {
        const item = this.acceptedLogSignatures[index];
        if (!item) {
            return;
        }
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(API.tsunadeRevokeLog, {
                method: "POST",
                body: JSON.stringify({source: item.source, signature: item.signature}),
            });
            this.showCommandStatus("Anomalie de nouveau comptée à partir du prochain contrôle.");
            await this.load();
        } catch (error) {
            this.showError(`Retrait impossible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    logSynthesis(context, incidentId) {
        if (!context || typeof context !== "object") {
            return "";
        }
        const allFindings = Array.isArray(context.findings) ? context.findings : [];
        // Every anomaly is shown, grouped by component: eight of the 36 anomalies
        // of HA-01 left Tapo and Kasa out of sight.
        const findings = allFindings;
        const source = LOG_SOURCE_LABELS[context.source] ?? this.readableIdentifier(context.source);
        const state = context.status === "OK" ? "sain" : "anomalie";
        const window = this.analysisWindow(context);
        const expanded = this.expandedLogAnomalies.has(incidentId);
        const classified = Array.isArray(context.background_findings);
        const acceptable = classified && this.incidents.some((incident) => incident.incident_id === incidentId
            && incident.state === "active");
        const groups = new Map();
        findings.forEach((finding, index) => {
            const key = finding.component ?? "other";
            if (!groups.has(key)) {
                groups.set(key, {key, label: finding.component_label ?? "Autre", entries: []});
            }
            groups.get(key).entries.push({finding, index});
        });
        const itemHtml = ({finding, index}) => {
            const reference = finding.reference_occurrences == null
                ? "aucune référence antérieure"
                : `${finding.reference_occurrences} / ${window}`;
            const trend = TREND_LABELS[finding.trend] ?? this.readableIdentifier(finding.trend);
            const accept = acceptable && finding.signature
                ? `<button class="configuration-secondary-button" data-tsunade-accept-log="${escapeHtml(incidentId)}" data-finding-index="${index}" type="button" title="Ne plus compter cette anomalie dans les incidents de journaux">Accepter comme connue</button>`
                : "";
            return `<li><strong>${escapeHtml(finding.signature ?? finding.summary)}</strong><span>${escapeHtml(finding.occurrences ?? 0)} occurrence(s) / ${escapeHtml(window)}</span><small>Référence : ${escapeHtml(reference)} · Évolution : ${escapeHtml(trend)}</small>${accept}</li>`;
        };
        const items = [...groups.values()].map((group) => {
            const occurrences = group.entries.reduce((total, {finding}) => total + Number(finding.occurrences ?? 0), 0);
            const acceptComponent = acceptable && classified && group.key !== "other"
                ? `<button class="configuration-secondary-button" data-tsunade-accept-component="${escapeHtml(group.key)}" data-source="${escapeHtml(context.source)}" data-label="${escapeHtml(group.label)}" type="button" title="Ne plus compter les anomalies de ce composant, sauf les lignes critiques">Accepter ${escapeHtml(group.label)}</button>`
                : "";
            return `<li class="incident-log-component"><div class="incident-log-component__header"><strong>${escapeHtml(group.label)}</strong><small>${escapeHtml(occurrences)} occurrence(s) · ${escapeHtml(group.entries.length)} signature(s)</small>${acceptComponent}</div><ul>${group.entries.map(itemHtml).join("")}</ul></li>`;
        }).join("");
        const background = classified ? context.background_findings.length : 0;
        const accepted = Array.isArray(context.accepted_findings) ? context.accepted_findings.length : 0;
        const noun = classified ? "anomalie(s) significative(s)" : "anomalie(s) regroupée(s)";
        const anomalyLabel = (allFindings.length === 0
            ? `Aucune ${classified ? "anomalie significative" : "anomalie regroupée"}`
            : `${allFindings.length} ${noun}${allFindings.length > findings.length ? ` · ${findings.length} présentées` : ""}`)
            + (background ? ` · ${background} sans gravité non comptée(s)` : "")
            + (accepted ? ` · ${accepted} acceptée(s)` : "");
        return `<section class="incident-log-synthesis ${expanded ? "is-expanded" : ""}">
            <header>
                <div>
                    <strong>${escapeHtml(source)}</strong>
                    <span>État des journaux : ${escapeHtml(state)} · ${escapeHtml(anomalyLabel)}</span>
                </div>
                ${items ? `<button class="configuration-secondary-button" data-tsunade-log-anomalies="${escapeHtml(incidentId)}" type="button">${expanded ? "Masquer les anomalies" : "Afficher les anomalies"}</button>` : ""}
            </header>
            ${expanded
                ? items
                    ? `<ul>${items}</ul>`
                    : "<p>Aucune anomalie regroupée.</p>"
                : ""}
        </section>`;
    }

    toggleLogAnomalies(incidentId) {
        if (!incidentId) {
            return;
        }
        if (this.expandedLogAnomalies.has(incidentId)) {
            this.expandedLogAnomalies.delete(incidentId);
        } else {
            this.expandedLogAnomalies.add(incidentId);
        }
        this.render();
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
}

mixInto(IncidentsController, LogMethods);
