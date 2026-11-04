"use strict";

// Réparations connues, statistiques et résolution manuelle déclarée.
// Ces méthodes sont ajoutées au contrôleur des incidents au chargement de
// ce module (voir application.js).

import {API, fetchJson, requestJson} from "./api.js";
import {IncidentsController} from "./incidents.js";
import {MANUAL_LATE_DECLARATION_MS, LOG_SOURCE_LABELS, mixInto} from "./incidents_shared.js";
import {escapeHtml, formatDate} from "./utils.js";

class ExperienceMethods {
    renderExperiences() {
        const container = this.elements.experiences;
        if (!container) {
            return;
        }
        if (this.experiences === undefined) {
            container.innerHTML = "<p>Chargement des réparations connues…</p>";
            return;
        }
        if (this.experiences === null) {
            container.innerHTML = "<p>Liste indisponible avec cette version d’Ohana-Agent.</p>";
            return;
        }
        if (!this.experiences.length) {
            container.innerHTML = "<p>Aucune réparation connue. Une réparation vérifiée par Shikamaru peut être enregistrée depuis son incident.</p>";
            return;
        }
        const stateLabels = {active: "Active", disabled: "Désactivée", obsolete: "Obsolète"};
        const items = this.experiences.map((experience) => {
            const active = experience.state === "active";
            const buttons = active
                ? `<button class="configuration-secondary-button" data-tsunade-experience-state="${escapeHtml(experience.experience_id)}" data-state="disabled" type="button">Désactiver</button>
                   <button class="configuration-secondary-button" data-tsunade-experience-state="${escapeHtml(experience.experience_id)}" data-state="obsolete" type="button">Rendre obsolète</button>`
                : `<button class="configuration-secondary-button" data-tsunade-experience-state="${escapeHtml(experience.experience_id)}" data-state="active" type="button">Réactiver</button>`;
            const attempts = experience.attempt_count ?? experience.success_count + experience.failure_count;
            const lastSuccess = experience.last_success_at
                ? `Dernière réussite le ${formatDate(experience.last_success_at)}`
                : "Aucune réussite";
            const lastFailure = experience.last_failure_at
                ? ` · dernier échec le ${formatDate(experience.last_failure_at)}`
                : "";
            const reliability = experience.reliability_label
                ? ` · <span class="incidents-reliability is-${escapeHtml(experience.reliability)}">${escapeHtml(experience.reliability_label)}</span>`
                : "";
            const changed = !active && experience.state_changed_at
                ? ` depuis le ${formatDate(experience.state_changed_at)}`
                : "";
            return `<li class="${active ? "is-active" : "is-inactive"}">
                <div class="incidents-experience__title">
                    <strong>${experience.rank ? `#${escapeHtml(experience.rank)} · ` : ""}${escapeHtml(this.experienceAction(experience.action))}</strong>
                    <span class="incidents-experience__state">${escapeHtml(stateLabels[experience.state] ?? experience.state)}${escapeHtml(changed)}</span>
                </div>
                <span>${escapeHtml(LOG_SOURCE_LABELS[experience.equipment_id] ?? experience.equipment_id)} · ${escapeHtml(experience.capability_id)} · ${escapeHtml(experience.validated_diagnostic)}</span>
                <small>${escapeHtml(attempts)} tentative(s) · ${escapeHtml(experience.success_count)} réussite(s) · ${escapeHtml(experience.failure_count)} échec(s) · ${escapeHtml(lastSuccess)}${escapeHtml(lastFailure)}${reliability}</small>
                <div class="incidents-experience__actions">${buttons}</div>
            </li>`;
        }).join("");
        container.innerHTML = `<ul>${items}</ul><p><small>Classement : réparations actives d’abord, puis par fiabilité (borne basse à 95 % du taux de réussite vérifié) ; une réparation sans issue vérifiée n’est pas classée au-dessus d’une réparation éprouvée. Une réparation désactivée ou obsolète n’est plus proposée ; son historique est conservé.</small></p>`;
    }

    /** Success statistics: by period, by repair and by equipment. */
    renderRepairStatistics() {
        const container = this.elements.repairStatistics;
        if (!container) {
            return;
        }
        const statistics = this.repairStatistics;
        if (statistics === undefined) {
            container.innerHTML = "<p>Chargement des statistiques…</p>";
            return;
        }
        if (statistics === null) {
            container.innerHTML = "<p>Statistiques indisponibles avec cette version d’Ohana-Agent.</p>";
            return;
        }
        const duration = (seconds) => {
            if (seconds == null) {
                return "—";
            }
            return seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`;
        };
        const percent = (value) => (value == null ? "—" : `${Number(value).toLocaleString("fr-FR")} %`);
        const periodNames = {"7d": "7 jours", "30d": "30 jours", all: "Depuis le début"};
        const periods = Object.entries(periodNames).map(([key, label]) => {
            const item = statistics.periods?.[key];
            if (!item) {
                return "";
            }
            return `<tr>
                <th scope="row">${escapeHtml(label)}</th>
                <td>${escapeHtml(item.proposed)}</td>
                <td>${escapeHtml(item.executed)}</td>
                <td>${escapeHtml(item.succeeded)} / ${escapeHtml(item.failed)}${item.unverified ? ` / ${escapeHtml(item.unverified)} non vérifiée(s)` : ""}</td>
                <td>${percent(item.success_rate)}<small> (fiable : ${percent(item.reliable_rate)})</small></td>
            </tr>`;
        }).join("");
        const causes = (item) => (item.failure_causes ?? [])
            .map((cause) => `${cause.cause} (${cause.count})`).join(" ; ");
        const rows = (items, title) => items.map((item) => `<li>
                <div class="incidents-experience__title"><strong>${escapeHtml(title(item))}</strong><span class="incidents-experience__state">${percent(item.success_rate)}</span></div>
                <small>${escapeHtml(item.proposed)} proposée(s) · ${escapeHtml(item.refused)} refusée(s) · ${escapeHtml(item.executed)} exécutée(s) : ${escapeHtml(item.succeeded)} réussie(s), ${escapeHtml(item.failed)} échec(s)${item.unverified ? `, ${escapeHtml(item.unverified)} non vérifiée(s)` : ""} · retour à la normale en ${escapeHtml(duration(item.median_recovery_seconds))} · décision en ${escapeHtml(duration(item.median_decision_seconds))}</small>
                ${item.last_failure_at ? `<small>Dernier échec le ${escapeHtml(formatDate(item.last_failure_at))}${causes(item) ? ` — ${escapeHtml(causes(item))}` : ""}</small>` : ""}
            </li>`).join("");
        const byRepair = rows(statistics.by_repair ?? [], (item) => this.experienceAction({operation: item.operation, target: item.target}));
        const byEquipment = rows(statistics.by_equipment ?? [], (item) => LOG_SOURCE_LABELS[item.equipment_id] ?? String(item.equipment_id).toUpperCase());
        container.innerHTML = `<table class="incidents-statistics__periods">
                <thead><tr><th scope="col">Période</th><th scope="col">Proposées</th><th scope="col">Exécutées</th><th scope="col">Réussies / échecs</th><th scope="col">Taux</th></tr></thead>
                <tbody>${periods}</tbody>
            </table>
            <p><small>Le taux compte les issues vérifiées par Shikamaru ; une exécution non vérifiée n’est ni une réussite ni un échec. « Fiable » est la borne basse à 95 % : peu d’essais, peu de certitude.</small></p>
            ${byRepair ? `<h4>Par réparation</h4><ul>${byRepair}</ul>` : ""}
            ${byEquipment ? `<h4>Par équipement</h4><ul>${byEquipment}</ul>` : ""}`;
    }

    experienceAction(action) {
        const operation = String(action?.operation ?? "");
        const target = String(action?.target ?? "");
        if (action?.kind === "manual") {
            return `Action manuelle : « ${action.description ?? ""} »`;
        }
        if (operation.startsWith("restart")) {
            return `Redémarrage de ${target}`;
        }
        return [operation, target].filter(Boolean).join(" · ") || "Réparation";
    }

    async toggleSimilar(incidentId) {
        if (this.similar.has(incidentId)) {
            this.similar.delete(incidentId);
            this.render();
            return;
        }
        this.similar.set(incidentId, null);
        this.render();
        try {
            this.similar.set(incidentId, await fetchJson(API.tsunadeSimilarIncidents(incidentId)));
        } catch (error) {
            this.similar.set(incidentId, {error: this.errorMessage(error)});
        }
        this.render();
    }

    similarView(incidentId) {
        if (!this.similar?.has(incidentId)) {
            return "";
        }
        const result = this.similar.get(incidentId);
        if (result === null) {
            return '<div class="incident-similar"><small>Recherche des incidents semblables…</small></div>';
        }
        if (result.error) {
            return `<div class="incident-similar"><small>Recherche impossible : ${escapeHtml(result.error)}</small></div>`;
        }
        const outcomes = {repaired: "réparé (vérifié)", manual: "action manuelle confirmée", resolved: "revenu seul", ongoing: "en cours"};
        const items = (result.similar ?? []).map((item) => `<li>
                <strong>${escapeHtml(formatDate(item.started_at))} · ${escapeHtml(String(item.equipment_id).toUpperCase())}</strong>
                · ${escapeHtml(outcomes[item.outcome] ?? item.outcome)}${item.repair_failed ? " (une réparation a échoué)" : ""}
                · ressemblance ${escapeHtml(Math.round((item.similarity?.score ?? 0) * 100))} %
                <small>${escapeHtml([...(item.similarity?.matched ?? []), ...(item.similarity?.differences ?? [])].join(" · "))}</small>
                ${item.final_result ? `<small>${escapeHtml(item.final_result)}</small>` : ""}
            </li>`).join("");
        return `<div class="incident-similar">
            ${items ? `<ul>${items}</ul>` : "<p><small>Aucun incident passé assez semblable.</small></p>"}
            <small>${escapeHtml(result.note ?? "")}</small>
        </div>`;
    }

    async setExperienceState(experienceId, state, button) {
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(API.tsunadeExperienceState(experienceId), {
                method: "POST",
                body: JSON.stringify({state}),
            });
            const messages = {
                active: "Réparation connue réactivée : Tsunade peut de nouveau la proposer.",
                disabled: "Réparation connue désactivée : Tsunade ne la proposera plus.",
                obsolete: "Réparation connue rendue obsolète : Tsunade ne la proposera plus.",
            };
            this.showCommandStatus(messages[state] ?? "État de la réparation connue mis à jour.");
            await this.load();
        } catch (error) {
            this.showError(`Changement impossible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    /**
     * Verified repairs waiting to be saved as known repairs. The incident is
     * resolved by then, so it left "Tous les actifs": on 26 September the
     * save button was only found in the dossier of a resolved incident.
     */
    renderExperiencePending() {
        const element = this.elements.experiencePending;
        if (!element) {
            return;
        }
        const pending = this.incidents.filter(
            (incident) => this.details.get(incident.incident_id)?.experience_candidate,
        );
        element.classList.toggle("hidden", pending.length === 0);
        if (pending.length === 0) {
            element.innerHTML = "";
            return;
        }
        element.innerHTML = `<h3>Réparations à confirmer</h3>
            <p>Shikamaru a constaté le retour à l’état sain après ces réparations ou actions manuelles. Rien n’est retenu sans votre accord.</p>
            <ul>${pending.map((incident) => {
                const candidate = this.details.get(incident.incident_id)?.experience_candidate;
                const repair = (incident.repairs ?? []).find((item) => item.status === "succeeded");
                const what = candidate?.kind === "manual"
                    ? `Action manuelle « ${candidate.action?.description ?? ""} »`
                    : repair ? this.sentence(repair.action ?? "réparation supervisée") : "";
                return `<li>
                    <span><strong>${escapeHtml(this.incidentTitle(incident))}</strong>${what ? ` · ${escapeHtml(what)}` : ""}${incident.ended_at ? ` · résolu le ${escapeHtml(formatDate(incident.ended_at))}` : ""}${candidate?.caution ? `<br><small>${escapeHtml(candidate.caution)}</small>` : ""}</span>
                    ${this.experienceButton(incident.incident_id, candidate?.kind)}
                </li>`;
            }).join("")}</ul>`;
    }

    experienceButton(incidentId, kind = "repair") {
        const label = kind === "manual" ? "Conserver comme piste connue" : "Enregistrer la réparation connue";
        return `<button class="configuration-primary-button" data-tsunade-experience="${escapeHtml(incidentId)}" type="button">${label}</button>`;
    }

    manualDeclarable(incident) {
        const actions = incident.manual_actions ?? [];
        if (incident.state === "active") {
            return !actions.some((action) => action.status === "verifying");
        }
        // The Agent still accepts a declaration 10 minutes after the recovery,
        // when the user fixed the service before telling Tsunade.
        const endedAt = Date.parse(incident.ended_at ?? "");
        return incident.state === "resolved"
            && Number.isFinite(endedAt)
            && Date.now() - endedAt <= MANUAL_LATE_DECLARATION_MS
            && actions.length === 0
            && !(incident.repairs ?? []).some((repair) => repair.status === "succeeded");
    }

    canDeclareManual(incident) {
        return this.manualDeclarable(incident) && !this.manualForms?.has(incident.incident_id);
    }

    manualForm(incident) {
        if (!this.manualForms?.has(incident.incident_id) || !this.manualDeclarable(incident)) {
            return "";
        }
        const id = escapeHtml(incident.incident_id);
        return `<form class="incident-manual-form" data-tsunade-manual-form="${id}">
            <label>Qu’avez-vous fait ?
                <textarea name="description" minlength="3" maxlength="500" required rows="2">${escapeHtml(this.manualDrafts?.get(incident.incident_id) ?? "")}</textarea>
            </label>
            <small>Une note pour Tsunade : Ohana ne l’exécutera jamais. Shikamaru vérifiera ensuite le retour à l’état sain.</small>
            <div class="incident-manual-form__actions">
                <button class="configuration-primary-button" type="submit">Déclarer l’action</button>
                <button class="configuration-secondary-button" data-tsunade-manual-cancel="${id}" type="button">Annuler</button>
            </div>
        </form>`;
    }

    manualStatus(incident) {
        const action = (incident.manual_actions ?? [])[0];
        if (!action) {
            return "";
        }
        const labels = {
            verifying: "Vérification Shikamaru en attente",
            confirmed: "Retour à l’état sain constaté par Shikamaru",
            unconfirmed: "Non confirmée par Shikamaru",
        };
        return `<p class="incident-card__repair"><strong>Action manuelle « ${escapeHtml(action.description)} »</strong> · ${escapeHtml(labels[action.status] ?? action.status)}${action.status !== "verifying" && action.result ? `<br><span>${escapeHtml(action.result)}</span>` : ""}</p>`;
    }

    manualLeads(incident) {
        // Known manual leads for the same symptom: notes for the user, never
        // an action Ohana can run.
        if (incident.state !== "active" || !Array.isArray(this.experiences)) {
            return "";
        }
        const leads = this.experiences.filter((experience) => experience.state === "active"
            && experience.action?.kind === "manual"
            && experience.equipment_id === incident.equipment_id
            && experience.capability_id === incident.capability_id).slice(0, 3);
        if (!leads.length) {
            return "";
        }
        return `<div class="incident-card__known-repair">
            <p><strong>Piste connue</strong> · action manuelle, à appliquer vous-même : Ohana ne l’exécute jamais</p>
            <ul>${leads.map((lead) => `<li>« ${escapeHtml(lead.action.description)} » · ${escapeHtml(lead.success_count)} réussite(s)${lead.last_success_at ? `, dernière le ${escapeHtml(formatDate(lead.last_success_at))}` : ""}</li>`).join("")}</ul>
        </div>`;
    }

    async declareManualResolution(incidentId, form) {
        const description = String(new FormData(form).get("description") ?? "").trim();
        const button = form.querySelector('button[type="submit"]');
        if (button) {
            button.disabled = true;
        }
        this.showError("");
        try {
            const action = await requestJson(API.tsunadeManualResolution(incidentId), {
                method: "POST",
                body: JSON.stringify({description, source: "vision", declared_by: "utilisateur Vision"}),
            });
            this.manualForms.delete(incidentId);
            this.manualDrafts.delete(incidentId);
            this.showCommandStatus(action?.status === "confirmed"
                ? "Action manuelle enregistrée : Shikamaru avait déjà constaté le retour à l’état sain."
                : "Action manuelle déclarée : Shikamaru vérifie le retour à l’état sain.");
            await this.load();
        } catch (error) {
            this.showError(`Déclaration impossible : ${this.errorMessage(error)}`);
        } finally {
            if (button) {
                button.disabled = false;
            }
        }
    }
}

mixInto(IncidentsController, ExperienceMethods);
