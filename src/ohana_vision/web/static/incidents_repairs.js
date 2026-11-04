"use strict";

// Propositions, décisions et suivi des réparations supervisées.
// Ces méthodes sont ajoutées au contrôleur des incidents au chargement de
// ce module (voir application.js).

import {API, requestJson} from "./api.js";
import {IncidentsController} from "./incidents.js";
import {mixInto} from "./incidents_shared.js";
import {escapeHtml, formatDate} from "./utils.js";

class RepairMethods {
    async proposeRepair(incidentId, button) {
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(API.tsunadeRepair(incidentId), {
                method: "POST",
                // Tsunade selects the catalogue repair; Vision never names one.
                body: JSON.stringify({}),
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

    async decideRepair(incidentId, repairId, decision, button) {
        // A refusal is final: Agent will never execute this proposal.
        if (decision === "refuse" && !window.confirm("Refuser définitivement cette réparation ? Elle ne sera jamais exécutée.")) {
            return;
        }
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(
                decision === "refuse" ? API.tsunadeRepairRefuse(incidentId) : API.tsunadeRepairDefer(incidentId),
                {
                    method: "POST",
                    body: JSON.stringify({
                        repair_id: repairId,
                        source: "vision",
                        answered_by: "utilisateur Vision",
                    }),
                },
            );
            this.details.delete(incidentId);
            this.expandedDetails.delete(incidentId);
            this.showCommandStatus(
                decision === "refuse"
                    ? "Réparation refusée ; aucune action ne sera exécutée."
                    : "Décision reportée ; la réparation reste en attente sans être exécutée.",
            );
            await this.load();
        } catch (error) {
            this.showError(`Décision impossible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    async authorizeRepair(incidentId, repairId, button, risk = "low") {
        // Action policy: a low-risk repair is one click; anything riskier
        // needs an explicit confirmation of the displayed consequences.
        if (risk !== "low" && !window.confirm("Cette réparation présente un risque " + (risk === "high" ? "élevé" : "moyen") + ". Autoriser son exécution après avoir lu ses conséquences ?")) {
            return;
        }
        button.disabled = true;
        this.showError("");
        try {
            const repair = await requestJson(API.tsunadeRepairAuthorize(incidentId), {
                method: "POST",
                body: JSON.stringify({
                    repair_id: repairId,
                    source: "vision",
                    authorized_by: "utilisateur Vision",
                }),
            });
            this.details.delete(incidentId);
            this.expandedDetails.delete(incidentId);
            // Report what actually happened, then follow the verification
            // instead of leaving "en attente" on screen after it ended.
            if (repair?.status === "failed") {
                this.showCommandStatus(
                    `Réparation en échec : ${repair.result ?? "exécution impossible"}`,
                    "warning",
                );
            } else {
                this.followedRepair = {incidentId, repairId};
                this.showCommandStatus(
                    "Réparation exécutée ; vérification Shikamaru en attente.",
                    "running",
                );
            }
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
            this.showCommandStatus("Expérience enregistrée dans la mémoire de Tsunade.");
            await this.load();
        } catch (error) {
            this.showError(`Mémorisation impossible : ${this.errorMessage(error)}`);
        } finally {
            button.disabled = false;
        }
    }

    sentence(text) {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    pendingRepairRisk(repair) {
        // Shown before any decision: authorizing must never require opening
        // the dossier to discover what the action will do.
        const riskLabels = {low: "faible", medium: "moyen", high: "élevé"};
        const consequences = Array.isArray(repair.consequences) ? repair.consequences.slice(0, 8) : [];
        return `<div class="incident-card__repair-risk">
            <p><strong>Risque ${escapeHtml(riskLabels[repair.risk] ?? repair.risk ?? "inconnu")}</strong>${repair.expected_result ? ` · Résultat attendu : ${escapeHtml(repair.expected_result)}` : ""}</p>
            ${consequences.length ? `<ul>${consequences.map((consequence) => `<li>${escapeHtml(consequence)}</li>`).join("")}</ul>` : ""}
            ${this.knownRepair(repair.known_repair)}
        </div>`;
    }

    knownRepair(known) {
        // Phase 3: the proposal reproduces a known repair; its track record and
        // the explicit criteria it shares are shown before any decision.
        if (!known) {
            return "";
        }
        const lastSuccess = known.last_success_at
            ? `, dernière réussite le ${formatDate(known.last_success_at)}`
            : "";
        const criteria = Array.isArray(known.criteria) ? known.criteria.slice(0, 8) : [];
        return `<div class="incident-card__known-repair">
            <p><strong>Réparation connue</strong> · ${escapeHtml(known.success_count)} réussite(s) et ${escapeHtml(known.failure_count)} échec(s) sur ${escapeHtml(known.attempt_count)} tentative(s)${escapeHtml(lastSuccess)}</p>
            ${known.caution ? `<p class="incident-card__known-repair-caution">${escapeHtml(known.caution)}</p>` : ""}
            ${criteria.length ? `<ul>${criteria.map((criterion) => `<li>${escapeHtml(criterion)}</li>`).join("")}</ul>` : ""}
        </div>`;
    }

    repairStatus(repair) {
        const labels = {
            proposed: "En attente de validation",
            authorized: "Autorisée, exécution en cours",
            refused: "Refusée, aucune action exécutée",
            expired: "Proposition expirée, aucune action exécutée",
            verifying: "Exécutée, vérification Shikamaru en attente",
            succeeded: "Réussie et confirmée par Shikamaru",
            failed: "Échec confirmé",
            unverified: "Exécutée, résultat non confirmé par Shikamaru",
        };
        const deferral = repair.deferred_until ? ` · reportée jusqu’à ${formatDate(repair.deferred_until)}` : "";
        const deadline = repair.status === "verifying" && repair.verification_deadline
            ? ` · vérification attendue avant ${formatDate(repair.verification_deadline)}`
            : "";
        const source = repair.authorization_source
            ? ` · ${repair.status === "refused" ? "refusée" : "autorisée"} depuis ${repair.authorization_source}`
            : "";
        return `${labels[repair.status] ?? repair.status}${deferral}${deadline}${source}`;
    }

    repairs(repairs) {
        const riskLabels = {low: "Faible", medium: "Moyen", high: "Élevé"};
        return `<div class="incident-repairs"><strong>Réparations supervisées</strong>${repairs.map((repair) => `
            <article class="incident-repair">
                <dl>
                    <div><dt>Action proposée</dt><dd>${escapeHtml(this.readableIdentifier(repair.operation))} · ${escapeHtml(repair.target)}</dd></div>
                    <div><dt>Niveau de risque</dt><dd>${escapeHtml(riskLabels[repair.risk] ?? repair.risk)}</dd></div>
                    <div><dt>État</dt><dd>${escapeHtml(this.repairStatus(repair))}</dd></div>
                </dl>
                ${this.repairJourney(repair)}
                ${Array.isArray(repair.consequences) && repair.consequences.length ? `<div><strong>Conséquences</strong><ul>${repair.consequences.map((consequence) => `<li>${escapeHtml(consequence)}</li>`).join("")}</ul></div>` : ""}
                ${repair.result ? `<p class="incident-repair__result"><strong>${repair.status === "succeeded" ? "Réparation réussie" : "Résultat"}</strong> · ${escapeHtml(repair.result)}</p>` : ""}
            </article>`).join("")}</div>`;
    }

    repairJourney(repair) {
        const rows = [];
        const add = (label, date, detail = "") => rows.push(`<li><strong>${escapeHtml(label)}</strong>
            <time>${escapeHtml(date ? formatDate(date) : "Date non renseignée")}</time>
            ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}</li>`);
        add("Proposition", repair.proposed_at, repair.action ?? repair.operation);
        if (repair.authorized_at || repair.status === "refused") {
            add(repair.status === "refused" ? "Refus" : "Autorisation", repair.authorized_at,
                [repair.authorization_source, repair.authorized_by].filter(Boolean).join(" · "));
        }
        if (repair.deferred_until) add("Report — échéance", repair.deferred_until);
        if (repair.executed_at) add("Exécution / tentative", repair.executed_at);
        if (repair.verified_at) {
            const label = {succeeded: "Vérification Shikamaru réussie", failed: "Échec enregistré",
                unverified: "Résultat non confirmé", expired: "Expiration de la proposition"}[repair.status]
                ?? "Résultat enregistré";
            add(label, repair.verified_at, repair.result);
        } else if (repair.status === "verifying") {
            add("Vérification Shikamaru attendue avant", repair.verification_deadline);
        }
        return `<ol class="incident-repair-journey">${rows.join("")}</ol>
            ${!repair.executed_at ? "<p>Aucune exécution enregistrée.</p>" : ""}`;
    }

    canRequestRepair(incident, repairs) {
        // Agent checks the real preconditions; this only hides pointless requests.
        const pending = repairs.some((repair) => ["proposed", "authorized", "verifying"].includes(repair.status));
        return incident.state === "active"
            && incident.latest_decision?.epistemic_status === "confirmed_by_probe"
            && !pending;
    }

    awaitsExperience(incident) {
        return incident.state === "resolved"
            && ((incident.repairs ?? []).some((repair) => repair.status === "succeeded")
                || (incident.manual_actions ?? []).some((action) => action.status === "confirmed"));
    }

    /** Replace the authorization banner with the verified outcome. */
    updateFollowedRepair() {
        if (!this.followedRepair) {
            return;
        }
        const {incidentId, repairId} = this.followedRepair;
        const incident = this.incidents.find((item) => item.incident_id === incidentId);
        const repair = (incident?.repairs ?? []).find((item) => item.repair_id === repairId);
        if (!repair || ["verifying", "authorized", "proposed"].includes(repair.status)) {
            return;
        }
        this.followedRepair = null;
        const outcomes = {
            succeeded: ["Réparation confirmée par Shikamaru.", "success"],
            failed: [`Réparation en échec : ${repair.result ?? "capacité toujours dégradée"}`, "warning"],
            unverified: ["Réparation non confirmée par Shikamaru dans le délai.", "warning"],
        };
        const [message, tone] = outcomes[repair.status]
            ?? [`Réparation : ${this.repairStatus(repair)}`, "success"];
        const experienceIncident = this.details.get(incidentId)?.experience_candidate ? incidentId : null;
        this.showCommandStatus(message, tone, experienceIncident);
    }
}

mixInto(IncidentsController, RepairMethods);
