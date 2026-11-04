"use strict";

// Libellés et constantes de la vue Tsunade, et assemblage des modules de méthodes.

// Mirrors Ohana-Agent: a manual fix can be declared 10 minutes after recovery.
export const MANUAL_LATE_DECLARATION_MS = 10 * 60 * 1000;
export const SEVERITY_LABELS =Object.freeze({degraded: "Dégradé", critical: "Critique"});
export const WORKFLOW_LABELS = Object.freeze({
    new: "Nouveau",
    in_progress: "En cours",
    treated: "Traité",
    resolved: "Résolu",
});
export const EVENT_LABELS = Object.freeze({
    opened: "Ouverture",
    observed: "Observation",
    escalated: "Aggravation",
    investigation: "Investigation",
    diagnostic: "Diagnostic",
    decision: "Décision",
    action: "Action",
    result: "Résultat",
    resolved: "Résolution",
});
export const LOG_SOURCE_LABELS = Object.freeze({
    "infra-01": "INFRA-01",
    "ha-01": "HA-01",
    "linky-01": "LINKY-01",
    "zwave-01": "ZWAVE-01",
});
export const TERMINAL_JOB_STATUSES = new Set([
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
    "TIMEOUT",
]);
export const JOB_POLL_INTERVAL_MS = 1000;
export const TREND_LABELS = Object.freeze({
    new: "nouvelle anomalie",
    known: "anomalie connue",
    stable: "stable",
    increasing: "forte augmentation",
    decreasing: "en diminution",
    disappeared: "disparue",
});
export const TSUNADE_DECISION_LABELS = Object.freeze({
    stable: "Situation stable",
    watch: "Surveillance",
    investigate: "À approfondir",
    action_required: "Action nécessaire",
});

export const TSUNADE_DECISION_SOURCE_LABELS = Object.freeze({
    deterministic: "Analyse déterministe",
    katsuyu_ai: "Analyse Katsuyu",
    fallback: "Décision de repli",
});

/** Ajoute les méthodes d'une classe auxiliaire à un contrôleur (sans les constructeurs). */
export function mixInto(target, mixin) {
    for (const name of Object.getOwnPropertyNames(mixin.prototype)) {
        if (name !== "constructor") {
            Object.defineProperty(
                target.prototype,
                name,
                Object.getOwnPropertyDescriptor(mixin.prototype, name),
            );
        }
    }
}
