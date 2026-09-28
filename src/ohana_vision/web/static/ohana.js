"use strict";

// Phase 5: Ohana observes its own components. Each card reads its own
// source, so one unavailable component never hides the others.

import {API, fetchJson} from "./api.js";
import {escapeHtml} from "./utils.js";

const STATE_LABELS = Object.freeze({
    healthy: "Opérationnel",
    degraded: "À surveiller",
    critical: "Hors service",
    offline: "Hors ligne",
    unknown: "Inconnu",
});

const COMPONENT_STATES = Object.freeze({
    active: "Actif",
    waiting: "En attente",
    stale: "Muet",
});

const RUNTIME_STATES = Object.freeze({
    ready: ["healthy", "Prêt"],
    unverified: ["healthy", "Présent, non vérifié"],
    missing: ["degraded", "Absent"],
    failed: ["degraded", "En échec"],
});

const CAPABILITY_LABELS = Object.freeze({
    "ai.inference": "Analyse IA locale",
    "backup.compress": "Compression de sauvegarde",
    "backup.encrypt": "Chiffrement de sauvegarde",
    "backup.infra": "Sauvegarde INFRA-01",
    "backup.verify": "Vérification de sauvegarde",
    "logs.health_check": "Contrôle des journaux",
    "logs.investigate": "Investigation des journaux",
    "system.health": "Santé du PC",
    "trends.history_backfill": "Rattrapage préventif",
});

const PARIS_DATE = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Paris",
});

/** Format an ISO date at the Paris time, whatever the browser zone. */
export function formatParis(value) {
    if (!value) return "—";
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : PARIS_DATE.format(date);
}

const instant = (value) => (value ? new Date(String(value)).getTime() : Number.NaN);

export function formatSilence(seconds) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
    if (seconds < 60) return `${Math.round(seconds)} s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
    return `${Math.floor(seconds / 86400)} j`;
}

/** Agent: seen from Vision's own clock, then its internal components. */
export function agentCard(presence, hostHealth) {
    const components = Array.isArray(hostHealth?.agent_components)
        ? hostHealth.agent_components
        : [];
    let state = "unknown";
    let summary = "En attente d’une livraison de l’Agent.";
    if (presence?.state === "silent") {
        state = "critical";
        summary = `Aucune livraison depuis ${formatSilence(presence.silence_seconds)} : état actuel inconnu.`;
    } else if (presence?.state === "active") {
        const stale = components.filter((item) => item.state === "stale");
        state = stale.length ? "degraded" : "healthy";
        summary = stale.length
            ? `Composant muet : ${stale.map((item) => item.label).join(", ")}.`
            : "L’Agent livre ses observations et ses composants travaillent.";
    }
    const rows = presence?.state === "active"
        ? components.map((item) => ({
            label: item.label ?? item.component,
            state: item.state === "stale" ? "degraded" : item.state === "active" ? "healthy" : "unknown",
            value: COMPONENT_STATES[item.state] ?? item.state,
            detail: item.last_activity_at
                ? `Dernière activité ${formatParis(item.last_activity_at)}`
                : "Aucune activité encore",
        }))
        : [];
    return {
        id: "agent",
        title: "Agent",
        state,
        summary,
        facts: [
            ["Dernière livraison reçue", formatParis(presence?.last_received_at)],
            ["Mesuré par", "Vision (horloge propre)"],
        ],
        rows,
        emptyRows: presence?.state === "active"
            ? "Cet Agent ne publie pas encore ses composants."
            : "Les composants internes ne sont affichés qu’avec une livraison récente.",
    };
}

/** Vision: its own vitals, and how the Agent last saw it. */
export function visionCard(vitals, hostHealth) {
    const probe = hostHealth?.vision ?? null;
    let state = "unknown";
    let summary = "Vitaux de Vision indisponibles.";
    if (vitals?.state === "running") {
        const silence = vitals.ingestion_silence_seconds;
        state = typeof silence === "number" && silence > 300 ? "degraded" : "healthy";
        summary = state === "healthy"
            ? "Vision répond et ingère les observations."
            : `Vision répond mais n’a rien ingéré depuis ${formatSilence(silence)}.`;
    } else if (vitals) {
        state = "critical";
        summary = `Vision n’est pas en service (${vitals.state}).`;
    }
    const probeText = !probe
        ? "Pas de mesure récente de l’Agent"
        : probe.available
            ? `Disponible (${formatParis(probe.checked_at)})`
            : `Injoignable : ${probe.error ?? "erreur"} (${formatParis(probe.checked_at)})`;
    return {
        id: "vision",
        title: "Vision",
        state,
        summary,
        facts: [
            ["Démarré", formatParis(vitals?.started_at)],
            ["Dernière ingestion", formatParis(vitals?.last_ingested_at)],
            ["Vu par l’Agent", probeText],
        ],
        rows: [],
    };
}

/** Katsuyu: optional worker; an offline PC is informative, not a failure. */
export function katsuyuCard(workersDocument, error) {
    if (error) {
        return {
            id: "katsuyu",
            title: "Katsuyu",
            state: "unknown",
            summary: `Liste des workers indisponible : ${error}`,
            facts: [],
            rows: [],
        };
    }
    const workers = Array.isArray(workersDocument?.workers) ? workersDocument.workers : [];
    if (!workers.length) {
        return {
            id: "katsuyu",
            title: "Katsuyu",
            state: "unknown",
            summary: "Aucun worker Katsuyu associé.",
            facts: [],
            rows: [],
        };
    }
    const worker = [...workers].sort(
        (left, right) => instant(right.last_seen_at) - instant(left.last_seen_at),
    )[0];
    const runtimes = worker.runtimes ?? {};
    const broken = Object.entries(runtimes).filter(
        ([, runtime]) => RUNTIME_STATES[runtime.state]?.[0] === "degraded",
    );
    let state = "offline";
    let summary = "PC éteint ou en veille : normal, Konoha fonctionne sans lui.";
    if (worker.availability === "AVAILABLE") {
        state = broken.length ? "degraded" : "healthy";
        summary = broken.length
            ? `Runtime indisponible : ${broken.map(([type]) => CAPABILITY_LABELS[type] ?? type).join(", ")}.`
            : "Connecté ; runtimes locaux utilisables.";
    } else if (worker.availability === "WAKING") {
        state = "unknown";
        summary = "Réveil demandé par Ohana, en attente de connexion.";
    }
    const rows = (worker.activity ?? []).map((item) => {
        const runtime = runtimes[item.type];
        const [runtimeState, runtimeLabel] = runtime
            ? RUNTIME_STATES[runtime.state] ?? ["unknown", runtime.state]
            : [null, null];
        const failedLater = Boolean(item.last_failed_at)
            && (!item.last_succeeded_at
                || instant(item.last_failed_at) > instant(item.last_succeeded_at));
        const parts = [
            item.last_succeeded_at
                ? `Dernier succès ${formatParis(item.last_succeeded_at)}`
                : "Aucun succès conservé",
        ];
        if (item.last_failed_at) {
            parts.push(`dernier échec ${formatParis(item.last_failed_at)}${item.last_failure_message ? ` (${item.last_failure_message})` : ""}`);
        }
        if (runtime?.detail) parts.push(runtime.detail);
        return {
            label: CAPABILITY_LABELS[item.type] ?? item.type,
            state: runtimeState === "degraded" || failedLater ? "degraded" : runtimeState ?? (item.last_succeeded_at ? "healthy" : "unknown"),
            value: runtimeLabel ?? (failedLater ? "Dernier job en échec" : item.last_succeeded_at ? "Travaille" : "Jamais exécuté"),
            detail: parts.join(" · "),
        };
    });
    return {
        id: "katsuyu",
        title: "Katsuyu",
        state,
        summary,
        facts: [
            ["Worker", `${worker.worker_id} · ${worker.worker_version}`],
            ["Dernier contact", formatParis(worker.last_seen_at)],
            ["Runtimes déclarés", worker.runtimes_reported_at ? formatParis(worker.runtimes_reported_at) : "Jamais (Katsuyu antérieur)"],
        ],
        rows,
        emptyRows: "Aucune capacité annoncée.",
    };
}

/** Shizune: Vision's bridge and each device's last synchronisation. */
export function shizuneCard(gateway, devicesDocument, error) {
    const states = {
        available: ["healthy", "Le pont Vision → Agent a relayé le dernier appel."],
        unused: ["unknown", "Aucun appel de Shizune depuis le démarrage de Vision."],
        failing: ["degraded", `Dernier appel en échec : ${gateway?.last_failure ?? "erreur"}.`],
        unconfigured: ["unknown", "Le canal Shizune n’est pas configuré dans Vision."],
    };
    const [state, summary] = states[gateway?.state] ?? ["unknown", "État de la passerelle inconnu."];
    const devices = Array.isArray(devicesDocument?.devices)
        ? devicesDocument.devices.filter((device) => !device.revoked_at)
        : [];
    const rows = devices.map((device) => ({
        label: device.device_name ?? device.device_id,
        state: device.last_seen_at ? "healthy" : "unknown",
        // app_version is recorded at pairing, not the version running now.
        value: device.app_version ? `Associé en ${device.app_version}` : "Associé",
        detail: device.last_seen_at
            ? `Dernière synchronisation ${formatParis(device.last_seen_at)}`
            : "Jamais synchronisé",
    }));
    return {
        id: "shizune",
        title: "Shizune",
        state,
        summary,
        facts: [
            ["Dernier relais réussi", formatParis(gateway?.last_success_at)],
            ["Dernier échec", formatParis(gateway?.last_failure_at)],
        ],
        rows,
        emptyRows: error
            ? `Appareils indisponibles : ${error}`
            : "Aucun appareil associé.",
    };
}

function renderCard(card) {
    const facts = card.facts
        .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
        .join("");
    const rows = card.rows.length
        ? `<ul class="ohana-component__rows">${card.rows.map((row) => `<li data-state="${escapeHtml(row.state)}">
            <span class="ohana-component__row-label">${escapeHtml(row.label)}</span>
            <strong>${escapeHtml(row.value)}</strong>
            <small>${escapeHtml(row.detail)}</small>
          </li>`).join("")}</ul>`
        : card.emptyRows
            ? `<p class="ohana-component__empty">${escapeHtml(card.emptyRows)}</p>`
            : "";
    return `<article class="ohana-component" data-component="${escapeHtml(card.id)}" data-state="${escapeHtml(card.state)}">
        <header class="ohana-component__header">
          <h3>${escapeHtml(card.title)}</h3>
          <span class="ohana-component__badge">${escapeHtml(STATE_LABELS[card.state] ?? card.state)}</span>
        </header>
        <p class="ohana-component__summary">${escapeHtml(card.summary)}</p>
        ${facts ? `<dl class="ohana-component__facts">${facts}</dl>` : ""}
        ${rows}
      </article>`;
}

async function settle(url) {
    try {
        return {value: await fetchJson(url), error: null};
    } catch (error) {
        return {value: null, error: error?.message ?? String(error)};
    }
}

export class OhanaController {
    constructor() {
        this.loaded = false;
        this.container = document.querySelector("#ohana-components");
        this.updated = document.querySelector("#ohana-updated");
    }

    async load() {
        const [vitals, hostHealth, workers, devices] = await Promise.all([
            settle(API.runtimeVitals),
            settle(API.hostHealth),
            settle(API.administrationWorkers),
            settle(API.administrationCompanions),
        ]);
        this.render({
            vitals: vitals.value,
            hostHealth: hostHealth.value,
            workers: workers.value,
            workersError: workers.error,
            devices: devices.value,
            devicesError: devices.error,
        });
        this.loaded = true;
    }

    render({vitals, hostHealth, workers, workersError, devices, devicesError}) {
        if (!this.container) return;
        const cards = [
            agentCard(vitals?.agent, hostHealth),
            visionCard(vitals, hostHealth),
            katsuyuCard(workers, workersError),
            shizuneCard(vitals?.shizune_gateway, devices, devicesError),
        ];
        this.container.innerHTML = cards.map(renderCard).join("");
        if (this.updated) {
            this.updated.textContent = `Lu ${formatParis(vitals?.generated_at ?? new Date().toISOString())}`;
        }
    }
}
