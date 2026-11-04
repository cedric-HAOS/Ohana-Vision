"use strict";

// Décision de Tsunade, expertise, preuves et commandes proposées.
// Ces méthodes sont ajoutées au contrôleur des incidents au chargement de
// ce module (voir application.js).

import {API, fetchJson} from "./api.js";
import {IncidentsController} from "./incidents.js";
import {TSUNADE_DECISION_LABELS, TSUNADE_DECISION_SOURCE_LABELS, mixInto} from "./incidents_shared.js";
import {escapeHtml, formatDate} from "./utils.js";

class DecisionMethods {
    latestTsunadeDecision(incident) {
        return this.latestTsunadeDecisionRecord(incident)?.payload ?? null;
    }

    completeDecisionRecord(record, details) {
        if (!record?.occurredAt) return record;
        const date = Date.parse(record.occurredAt);
        if (!Number.isFinite(date)) return record;
        const event = [...(details?.events ?? [])].reverse().find((item) =>
            item.kind === "diagnostic" && Date.parse(item.occurred_at) === date);
        return event ? {...record, payload: {...event.payload, ...record.payload}} : record;
    }

    latestTsunadeDecisionRecord(incident) {
        if (incident?.latest_decision) {
            return {occurredAt: incident.latest_decision.occurred_at, payload: incident.latest_decision};
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
                return {
                    occurredAt: events[index]?.occurred_at ?? null,
                    payload,
                };
            }
        }

        if (incident?.latest_decision && typeof incident.latest_decision === "object") {
            return {
                occurredAt: incident.latest_decision.occurred_at
                    ?? incident.latest_decision.decided_at
                    ?? null,
                payload: incident.latest_decision,
            };
        }

        return null;
    }

    decisionFreshness(incident, decisionRecord) {
        const decisionAt = Date.parse(decisionRecord?.payload?.basis_observed_at ?? decisionRecord?.occurredAt ?? "");
        const observedAt = Date.parse(incident?.last_observed_at ?? "");

        if (!Number.isFinite(decisionAt) || !Number.isFinite(observedAt)) {
            return "unknown";
        }
        return observedAt > decisionAt ? "stale" : "current";
    }

    compactDecision(incident, record) {
        const assessment = incident.assessment;
        if (assessment?.followup) {
            const followup = assessment.followup;
            const stale = assessment.state === "stale" || assessment.decision_current === false
                || (record && this.decisionFreshness(incident, record) === "stale");
            const reason = assessment.reason || assessment.conclusion || record?.payload?.reason;
            const followupLabel = {
                pending: "Collecte à autoriser", authorized: "Collecte autorisée",
                queued: "Collecte en attente ou en cours", reviewing: "Réévaluation en attente ou en cours",
                completed: "Suivi précédent terminé", incomplete: "Suivi terminé, contexte insuffisant",
                failed: "Suivi interrompu", refused: "Collecte refusée",
                cancelled: "Collecte annulée", expired: "Demande expirée",
            }[followup.status] ?? "Suivi de l’investigation";
            // The card header already shows assessment.label: repeating it
            // printed "Investigation terminée — suite à préciser" twice.
            return `<section class="incident-compact-decision">
                ${stale ? '<span>De nouveaux éléments sont disponibles depuis la dernière conclusion.</span>'
                    : reason && assessment.state !== "analyzing" ? `<span>${escapeHtml(reason)}</span>` : ""}
                ${assessment.decided_at ? `<small>Dernière décision du ${escapeHtml(formatDate(assessment.decided_at))}</small>` : ""}
                <small>${escapeHtml(followupLabel)}${followup.detail ? ` : ${escapeHtml(followup.detail)}` : ""}</small>
                ${followup.failed_at ? `<small>Interruption du ${escapeHtml(formatDate(followup.failed_at))}</small>` : ""}
                ${assessment.recommended_action ? `<small>Suite recommandée : ${escapeHtml(assessment.recommended_action)}</small>` : ""}
                ${followup.window_extension_available ? "<small>Le bouton ci-dessous autorise une nouvelle collecte en lecture seule : même motif, mêmes limites de volume, fenêtre portée à 24 heures.</small>" : ""}
            </section>`;
        }
        if (!record || incident.expertise_state === "ai_queued") return "";
        const stale = incident.assessment?.state === "stale"
            || this.decisionFreshness(incident, record) === "stale";
        const decision = record.payload;
        const confidence = Number(decision.confidence);
        const confidenceText = decision.confidence != null && Number.isFinite(confidence)
            ? ` · confiance ${Math.round(confidence * 100)} %` : "";
        if (stale) return `<p class="incident-compact-decision"><small>Conclusion précédente du ${escapeHtml(formatDate(record.occurredAt))}${escapeHtml(confidenceText)}. De nouveaux éléments sont disponibles.</small></p>`;
        return `<section class="incident-compact-decision">
            <strong>${escapeHtml(stale ? "Analyse à actualiser" : TSUNADE_DECISION_LABELS[decision.decision] ?? "Analyse incomplète")}</strong>
            <span>${escapeHtml(stale ? "De nouveaux éléments sont disponibles depuis la dernière conclusion." : decision.reason || decision.conclusion || "Les éléments disponibles ne permettent pas de conclure.")}</span>
            <small>${escapeHtml(stale ? "Conclusion précédente" : "Décision")} du ${escapeHtml(formatDate(record.occurredAt))}${escapeHtml(confidenceText)}</small>
        </section>`;
    }

    incidentGuidance(incident, decisionRecord, expertiseState) {
        if (expertiseState === "ai_queued") {
            return {
                tone: "waiting",
                title: "Analyse en cours",
                detail: "Katsuyu prépare une nouvelle analyse. Aucune autre action n’est nécessaire pour le moment.",
                buttonLabel: "Analyse Katsuyu en attente",
                buttonClass: "configuration-secondary-button",
            };
        }

        const decision = decisionRecord?.payload;
        if (!decision) {
            return {
                tone: "attention",
                title: "À faire : analyser cet incident",
                detail: "Aucune décision Tsunade n’est encore disponible.",
                buttonLabel: "Analyser cet incident",
                buttonClass: "configuration-primary-button",
            };
        }

        if (this.decisionFreshness(incident, decisionRecord) === "stale") {
            return {
                tone: "attention",
                title: "À faire : actualiser l’analyse",
                detail: "Une observation plus récente n’est pas encore prise en compte par cette décision.",
                buttonLabel: "Actualiser l’analyse",
                buttonClass: "configuration-primary-button",
            };
        }

        const value = String(decision.decision ?? "watch");
        if (value === "action_required") {
            return {
                tone: "critical",
                title: "Action requise",
                detail: decision.recommended_action ?? "Consultez la recommandation de Tsunade avant d’intervenir.",
                buttonLabel: "Réévaluer l’incident",
                buttonClass: "configuration-secondary-button",
            };
        }
        if (value === "investigate") {
            return {
                tone: "attention",
                title: "À faire : approfondir",
                detail: decision.recommended_action ?? "Demandez une analyse approfondie de cet incident.",
                buttonLabel: "Approfondir l’analyse",
                buttonClass: "configuration-primary-button",
            };
        }
        return {
            tone: "current",
            title: "Rien à faire maintenant",
            detail: value === "stable"
                ? "La situation est stable et l’analyse couvre la dernière observation."
                : "Tsunade poursuit la surveillance avec une analyse à jour.",
            buttonLabel: "Relancer l’analyse",
            buttonClass: "configuration-secondary-button",
        };
    }

    incidentGuidanceView(guidance) {
        return `<aside class="incident-guidance incident-guidance--${escapeHtml(guidance.tone)}">
            <strong>${escapeHtml(guidance.title)}</strong>
            <span>${escapeHtml(guidance.detail)}</span>
        </aside>`;
    }

    tsunadeDecision(incident, decisionRecord = this.latestTsunadeDecisionRecord(incident)) {
        const decision = decisionRecord?.payload;

        if (!decision) {
            return "";
        }

        const value = String(decision.decision ?? "watch");
        const source = String(decision.decision_source ?? decision.origin ?? "Origine non renseignée");
        const confidence = Number(decision.confidence);

        const confidenceLabel = Number.isFinite(confidence)
            ? `${Math.round(confidence * 100)} %`
            : "—";

        const reevaluation = decision.reevaluate_after === "next_logs_health_check"
            ? "Au prochain contrôle des journaux"
            : decision.reevaluate_after
                ? this.readableIdentifier(decision.reevaluate_after)
                : "Selon évolution";
        const freshness = this.decisionFreshness(incident, decisionRecord);
        const observationLabel = incident.capability_id === "logs.health"
            ? "le contrôle des journaux"
            : "le dernier constat";
        const freshnessLabel = freshness === "current"
            ? `À jour avec ${observationLabel} du ${formatDate(incident.last_observed_at)}`
            : freshness === "stale"
                ? `À actualiser : ${observationLabel} du ${formatDate(incident.last_observed_at)} est plus récent`
                : "Fraîcheur non vérifiable";

        return `
            <section class="incident-tsunade-decision incident-tsunade-decision--${escapeHtml(value)}">
                <header>
                    <div>
                        <span>Décision Tsunade</span>
                        <strong>${escapeHtml(
                            TSUNADE_DECISION_LABELS[value] ?? this.readableIdentifier(value)
                        )}</strong>
                    </div>
                    <div class="incident-tsunade-decision__meta">
                        <small>${escapeHtml(
                            TSUNADE_DECISION_SOURCE_LABELS[source] ?? this.readableIdentifier(source)
                        )} · confiance ${escapeHtml(confidenceLabel)}</small>
                        ${decisionRecord.occurredAt
                            ? `<time>Décision du ${escapeHtml(formatDate(decisionRecord.occurredAt))}</time>`
                            : ""}
                    </div>
                </header>

                <p class="incident-decision-freshness incident-decision-freshness--${escapeHtml(freshness)}">${escapeHtml(freshnessLabel)}</p>

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
                ${this.decisionEvidence(decision)}
            </section>`;
    }

    latestTsunadeExpertise(incident) {
        // A current decision must not inherit hypotheses from an older cycle.
        if (Object.hasOwn(incident ?? {}, "latest_decision")) {
            const payload = incident.latest_decision;
            return payload && (Array.isArray(payload.hypotheses) || Array.isArray(payload.proposals))
                ? {payload, occurredAt: payload.occurred_at ?? null} : null;
        }
        const events = Array.isArray(incident?.events)
            ? incident.events
            : [];

        for (let index = events.length - 1; index >= 0; index -= 1) {
            const payload = events[index]?.payload;

            if (
                payload
                && typeof payload === "object"
                && (
                    Array.isArray(payload.hypotheses)
                    || Array.isArray(payload.proposals)
                )
            ) {
                return {
                    occurredAt: events[index]?.occurred_at,
                    payload,
                };
            }
        }

        const decision = this.latestTsunadeDecision(incident);
        if (
            decision
            && (
                Array.isArray(decision.hypotheses)
                || Array.isArray(decision.proposals)
            )
        ) {
            return {
                occurredAt: null,
                payload: decision,
            };
        }

        return null;
    }

    tsunadeExpertise(incident) {
        const expertise = this.latestTsunadeExpertise(incident);

        if (!expertise) {
            return "";
        }
        // Deterministic procedures also carry proposals: only a Katsuyu result
        // is an AI analysis with hypotheses.
        const payload = expertise.payload;
        const fromKatsuyu = payload.decision_source === "katsuyu_ai"
            || payload.origin === "katsuyu_ai";
        const analysisLabel = fromKatsuyu ? "Analyse Katsuyu"
            : payload.decision_source === "deterministic" ? "Analyse déterministe de Tsunade"
                : "Analyse — origine non renseignée";

        return `
            <section class="incident-katsuyu-analysis">
                <header>
                    <div>
                        <span>${escapeHtml(analysisLabel)}</span>
                        <strong>${payload.hypotheses?.length ? "Hypothèses à confirmer" : "Propositions"}</strong>
                    </div>
                    ${expertise.occurredAt
                        ? `<time>${escapeHtml(formatDate(expertise.occurredAt))}</time>`
                        : ""}
                </header>
                ${this.expertiseDetails(expertise.payload)}
            </section>`;
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
        const commands = Array.isArray(payload.investigation_commands)
            ? payload.investigation_commands.slice(0, 8)
            : [];
        const status = payload.epistemic_status === "hypothesis"
            ? '<span class="incident-evidence-status">Hypothèse — cause non confirmée</span>'
            : ["confirmed_by_probe", "confirmed_by_supervisor"].includes(payload.epistemic_status)
                ? '<span class="incident-evidence-status is-confirmed">Confirmé par investigation déterministe</span>'
                : "";
        const failure = payload.cycle_status === "ai_failed" && payload.error
            ? `<div class="incident-ai-failure">
                <strong>Erreur technique Katsuyu</strong>
                <code>${escapeHtml(payload.error)}</code>
            </div>`
            : "";
        const hypothesisList = hypotheses.length
            ? `<ol class="incident-hypotheses">${hypotheses.map((hypothesis, index) => `
                <li>
                    <header>
                        <span>Hypothèse ${escapeHtml(index + 1)}</span>
                        <strong>${escapeHtml(Math.round(Number(hypothesis.confidence ?? 0) * 100))} %</strong>
                    </header>
                    <p>${escapeHtml(hypothesis.statement ?? "Hypothèse sans résumé")}</p>
                    ${this.evidenceList("Causes possibles", hypothesis.possible_causes)}
                    ${this.evidenceList("Indices concordants", hypothesis.supporting_evidence)}
                    ${this.evidenceList("Indices contradictoires", hypothesis.contradicting_evidence)}
                </li>`).join("")}</ol>`
            : "";
        const proposalList = proposals.length
            ? `<div class="incident-proposals"><strong>Propositions non autorisées</strong><ul>${proposals.map((proposal) => `<li>${escapeHtml(proposal)}</li>`).join("")}</ul></div>`
            : "";
        const commandList = commands.length
            ? `<div class="incident-command-proposals">
                <strong>Commandes proposées</strong>
                ${commands.map((command) => this.commandProposal(command)).join("")}
            </div>`
            : "";
        return `${status}${failure}${hypothesisList}${proposalList}${commandList}`;
    }

    decisionEvidence(payload) {
        const list = (title, values) => !Array.isArray(values) || !values.length ? ""
            : `<div><strong>${escapeHtml(title)}</strong><ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></div>`;
        const facts = list("Faits rapportés dans cette décision", payload.facts);
        const limits = list("Éléments manquants pour confirmer", payload.confirmation_gap)
            + list("Contexte manquant", payload.missing_context)
            + list("Investigations non abouties", payload.failed_investigations);
        const collection = payload.collection_facts;
        const collectionView = collection && typeof collection === "object"
            ? `<div><strong>Collecte</strong><p>Source : ${escapeHtml(collection.source ?? "Non renseignée")}</p>
                ${Number.isInteger(collection.matched_lines) ? `<p>Lignes correspondantes : ${escapeHtml(collection.matched_lines)}</p>` : ""}
                ${Number.isInteger(collection.anomaly_count) ? `<p>Anomalies relevées : ${escapeHtml(collection.anomaly_count)}</p>` : ""}
                <p>${collection.truncated === true ? "Collecte tronquée : couverture partielle." : collection.truncated === false ? "Collecte non tronquée dans le périmètre demandé." : "Complétude non renseignée."}</p>
                ${collection.anomaly_count === 0 ? "<p>Aucune anomalie relevée dans cette collecte ne prouve la résolution de l’incident.</p>" : ""}</div>` : "";
        const inconclusive = payload.verdict === "INSUFFICIENT_CONTEXT"
            ? "<p><strong>Analyse non concluante : contexte insuffisant.</strong></p>" : "";
        const origin = payload.origin ?? payload.decision_source;
        return `<section class="incident-evidence"><h4>Faits et limites de la décision</h4>
            <p>Source : Agent / Tsunade · ${escapeHtml(TSUNADE_DECISION_SOURCE_LABELS[origin] ?? origin ?? "Origine non renseignée")}</p>
            ${facts || "<p>Aucun fait détaillé fourni dans cette décision.</p>"}
            ${inconclusive}${collectionView}${limits}
            ${!limits && !inconclusive && !collectionView ? "<p>Aucune limite renseignée ; cela ne garantit pas une analyse exhaustive.</p>" : ""}
        </section>`;
    }

    investigationEvidence(details) {
        const events = (details?.events ?? []).filter((event) => event.kind === "investigation");
        if (!events.length) return "";
        return `<details class="incident-evidence"><summary>Preuves des investigations (${events.length})</summary>
            <ol>${events.map((event) => {
                const payload = event.payload ?? {};
                // Supervisor evidence carries configuration_inspection at the
                // payload root; probe evidence uses a nested result document.
                const result = payload.result ?? payload;
                return `<li><strong>${escapeHtml(payload.operation ?? payload.source ?? "Investigation Agent")}</strong>
                    <time>${escapeHtml(formatDate(payload.finished_at ?? event.occurred_at))}</time>
                    <p>${escapeHtml(event.summary)}</p>
                    ${payload.status ? `<p>État de la collecte : ${escapeHtml(payload.status)} (ne qualifie pas la santé de la capacité)</p>` : ""}
                    ${payload.error ? `<p>Limite : ${escapeHtml(payload.error)}</p>` : ""}
                    ${result.reason ? `<p>Précision : ${escapeHtml(result.reason)}</p>` : ""}
                    ${result.truncated === true ? "<p>Collecte tronquée : couverture partielle.</p>" : ""}
                    <details><summary>Résultat structuré fourni par Agent</summary><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre></details>
                </li>`;
            }).join("")}</ol></details>`;
    }

    commandProposal(command) {
        if (!command || typeof command !== "object") {
            return "";
        }
        const commandText = String(command.command ?? "").trim();

        if (!commandText) {
            return "";
        }

        const encodedCommand = window.btoa(
            unescape(encodeURIComponent(commandText)),
        );

        return `
            <article class="incident-command-proposal">
                <header>
                    <div>
                        <span>${escapeHtml(command.safety ?? "Lecture seule")}</span>
                        <strong>${escapeHtml(command.title ?? "Commande proposée")}</strong>
                    </div>
                    <small>${escapeHtml(command.target ?? "Cible à confirmer")}</small>
                </header>
                ${command.expected
                    ? `<p>${escapeHtml(command.expected)}</p>`
                    : ""}
                <pre><code>${escapeHtml(commandText)}</code></pre>
                <button
                    class="configuration-secondary-button"
                    data-tsunade-copy-command="${escapeHtml(encodedCommand)}"
                    type="button"
                >Copier la commande</button>
            </article>`;
    }

    evidenceList(label, values) {
        if (!Array.isArray(values) || values.length === 0) {
            return "";
        }
        return `<small><strong>${escapeHtml(label)} :</strong> ${values.slice(0, 8).map((value) => escapeHtml(value)).join(" · ")}</small>`;
    }

    async copyCommand(button) {
        const encodedCommand = button.dataset.tsunadeCopyCommand;

        if (!encodedCommand) {
            return;
        }

        const command = decodeURIComponent(
            escape(window.atob(encodedCommand)),
        );
        await navigator.clipboard.writeText(command);
        const previousLabel = button.textContent;

        button.textContent = "Commande copiée";
        window.setTimeout(() => {
            button.textContent = previousLabel;
        }, 1600);
    }

    async loadDecisionDetails() {
        // An open dossier is reloaded with the list so its evolution and
        // repairs never lag behind the card; closed ones are dropped.
        const current = new Set(this.incidents.map((incident) => incident.incident_id));
        for (const incidentId of Array.from(this.details.keys())) {
            if (!current.has(incidentId) || this.expandedDetails.has(incidentId)) {
                this.details.delete(incidentId);
            }
        }
        // Only the dossier carries the experience candidate: fetch it for
        // resolved incidents whose repair succeeded, again when the cached
        // dossier predates the resolution.
        for (const incident of this.incidents) {
            if (this.awaitsExperience(incident) && this.details.get(incident.incident_id)?.state !== "resolved") {
                this.details.delete(incident.incident_id);
            }
        }
        const pending = this.incidents.filter(
            (incident) => (
                this.expandedDetails.has(incident.incident_id)
                || !Object.hasOwn(incident, "latest_decision")
                || this.awaitsExperience(incident)
            ) && !this.details.has(incident.incident_id),
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
}

mixInto(IncidentsController, DecisionMethods);
