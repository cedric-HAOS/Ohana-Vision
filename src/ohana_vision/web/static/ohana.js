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

const ASSOCIATION_WARNING_DAYS = 14;

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

const DECIMAL = new Intl.NumberFormat("fr-FR", {maximumFractionDigits: 1});

/** Format a size in bytes with French units (Ko, Mo, Go). */
export function formatBytes(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    const units = ["o", "Ko", "Mo", "Go", "To"];
    let size = value;
    let unit = 0;
    while (Math.abs(size) >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
    }
    return `${DECIMAL.format(size)} ${units[unit]}`;
}

const VERSION_STATES = Object.freeze({
    current: ["healthy", "À jour"],
    outdated: ["degraded", "Mise à jour disponible"],
    ahead: ["healthy", "Plus récente"],
    unknown: ["unknown", "Version recommandée inconnue"],
});

/** Compare dotted versions; null when either is not numeric. */
export function compareVersions(installed, latest) {
    const parse = (value) => String(value ?? "").split(".").map((part) => Number(part));
    const mine = parse(installed);
    const theirs = parse(latest);
    if (!installed || !latest || [...mine, ...theirs].some((part) => !Number.isInteger(part))) {
        return "unknown";
    }
    for (let index = 0; index < Math.max(mine.length, theirs.length); index += 1) {
        const left = mine[index] ?? 0;
        const right = theirs[index] ?? 0;
        if (left !== right) return left < right ? "outdated" : "ahead";
    }
    return "current";
}

function versionRow(label, installed, recommended, state) {
    const [rowState, value] = VERSION_STATES[state] ?? VERSION_STATES.unknown;
    return {
        label,
        state: rowState,
        value,
        detail: recommended
            ? `Installée ${installed ?? "—"} · recommandée ${recommended}`
            : `Installée ${installed ?? "—"}`,
    };
}

/** Phase 5 hardening: the Agent's scheduler, queues, storage and version. */
export function agentDetailRows(details) {
    if (!details || typeof details !== "object") return [];
    const rows = [];
    const scheduler = details.scheduler;
    if (scheduler) {
        rows.push({
            label: "Retard du planificateur",
            state: scheduler.state === "late" ? "degraded" : "healthy",
            value: scheduler.state === "late" ? "En retard" : "À l’heure",
            detail: `${scheduler.overdue_tasks} tâche(s) en attente · ${scheduler.enabled_tasks} tâches · dernier cycle ${formatParis(scheduler.last_tick_at)}`,
        });
    }
    const outbox = details.queues?.vision_outbox;
    if (outbox && outbox.pending !== null && outbox.pending !== undefined) {
        rows.push({
            label: "File vers Vision",
            state: outbox.state === "backlog" ? "degraded" : "healthy",
            value: `${outbox.pending} en attente`,
            detail: "Observations gardées par l’Agent jusqu’à leur livraison",
        });
    }
    const jobs = details.queues?.jobs;
    if (jobs) {
        rows.push({
            label: "Travaux Katsuyu",
            state: jobs.retention_overdue ? "degraded" : "healthy",
            value: `${jobs.active} actif(s)`,
            detail: `Plafond ${jobs.max_active} · rétention ${jobs.retention_days} j${jobs.oldest_finished_at ? ` · plus ancien ${formatParis(jobs.oldest_finished_at)}` : ""}${jobs.retention_overdue ? " · purge en retard" : ""}`,
        });
    }
    const storage = details.storage;
    if (storage) {
        const growth = storage.growth?.agent;
        const perDay = typeof growth?.bytes_per_day === "number"
            ? ` · ${growth.bytes_per_day >= 0 ? "+" : ""}${formatBytes(growth.bytes_per_day)}/jour sur ${growth.days} j`
            : "";
        rows.push({
            label: "Bases de l’Agent",
            state: "healthy",
            value: formatBytes(storage.total_bytes),
            detail: `Disque libre ${formatBytes(storage.disk?.free_bytes)}${perDay}`,
        });
    }
    const agent = details.versions?.agent;
    if (agent) {
        rows.push(versionRow("Version de l’Agent", agent.installed, agent.recommended, agent.state));
    }
    return rows;
}

export function formatSilence(seconds) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
    if (seconds < 60) return `${Math.round(seconds)} s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
    return `${Math.floor(seconds / 86400)} j`;
}

/** Agent: seen from Vision's own clock, then its internal components. */
export function agentCard(presence, hostHealth, details = null) {
    const components = Array.isArray(hostHealth?.agent_components)
        ? hostHealth.agent_components
        : [];
    const detailRows = agentDetailRows(details);
    let state = "unknown";
    let summary = "En attente d’une livraison de l’Agent.";
    if (presence?.state === "silent") {
        state = "critical";
        summary = `Aucune livraison depuis ${formatSilence(presence.silence_seconds)} : état actuel inconnu.`;
    } else if (presence?.state === "active") {
        const stale = components.filter((item) => item.state === "stale");
        // A version to install is information, not a degraded Agent.
        const strained = detailRows.filter(
            (row) => row.state === "degraded" && !row.label.startsWith("Version"),
        );
        state = stale.length || strained.length ? "degraded" : "healthy";
        summary = stale.length
            ? `Composant muet : ${stale.map((item) => item.label).join(", ")}.`
            : strained.length
                ? `À surveiller : ${strained.map((row) => row.label).join(", ")}.`
                : "L’Agent livre ses observations et ses composants travaillent.";
    }
    const rows = presence?.state === "active"
        ? [
            ...components.map((item) => ({
                label: item.label ?? item.component,
                state: item.state === "stale" ? "degraded" : item.state === "active" ? "healthy" : "unknown",
                value: COMPONENT_STATES[item.state] ?? item.state,
                detail: item.last_activity_at
                    ? `Dernière activité ${formatParis(item.last_activity_at)}`
                    : "Aucune activité encore",
            })),
            ...detailRows,
        ]
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
export function visionCard(vitals, hostHealth, agentDetails = null) {
    const probe = hostHealth?.vision ?? null;
    const lag = vitals?.ingestion_lag;
    const storage = vitals?.storage;
    const slowIngestion = typeof lag?.p95_seconds === "number" && lag.p95_seconds > 60;
    let state = "unknown";
    let summary = "Vitaux de Vision indisponibles.";
    if (vitals?.state === "running") {
        const silence = vitals.ingestion_silence_seconds;
        const silent = typeof silence === "number" && silence > 300;
        state = silent || slowIngestion || storage?.retention_overdue ? "degraded" : "healthy";
        summary = silent
            ? `Vision répond mais n’a rien ingéré depuis ${formatSilence(silence)}.`
            : slowIngestion
                ? `Vision ingère avec retard (95 % sous ${DECIMAL.format(lag.p95_seconds)} s).`
                : storage?.retention_overdue
                    ? "La purge des anciennes observations est en retard."
                    : "Vision répond et ingère les observations.";
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
        rows: vitals ? visionDetailRows(vitals, agentDetails) : [],
    };
}

/** Phase 5 hardening: ingestion delay, database, retention, clients, version. */
export function visionDetailRows(vitals, agentDetails) {
    const rows = [];
    const lag = vitals.ingestion_lag;
    if (lag) {
        rows.push({
            label: "Retard d’ingestion",
            state: typeof lag.p95_seconds === "number" && lag.p95_seconds > 60 ? "degraded" : lag.samples ? "healthy" : "unknown",
            value: lag.samples ? `${DECIMAL.format(lag.p50_seconds)} s (médiane)` : "Aucune mesure récente",
            detail: lag.samples
                ? `95 % sous ${DECIMAL.format(lag.p95_seconds)} s · maximum ${DECIMAL.format(lag.max_seconds)} s · ${lag.samples} observations en 15 min`
                : "Écart entre l’observation et sa réception",
        });
    }
    const storage = vitals.storage;
    if (storage && !storage.error) {
        const growth = agentDetails?.storage?.growth?.vision;
        const perDay = typeof growth?.bytes_per_day === "number"
            ? ` · ${growth.bytes_per_day >= 0 ? "+" : ""}${formatBytes(growth.bytes_per_day)}/jour sur ${growth.days} j`
            : "";
        rows.push({
            label: "Base de Vision",
            state: "healthy",
            value: formatBytes(storage.database_bytes),
            detail: `Journal WAL ${formatBytes(storage.wal_bytes)}${perDay}`,
        });
        rows.push({
            label: "Rétention",
            state: storage.retention_overdue ? "degraded" : "healthy",
            value: storage.retention_overdue
                ? "Purge en retard"
                : storage.retention_days ? `${storage.retention_days} jours` : "Sans limite",
            detail: `Plus ancienne observation ${formatParis(storage.oldest_observed_at)}`,
        });
    }
    const websocket = vitals.websocket;
    if (websocket && typeof websocket.clients === "number") {
        rows.push({
            label: "Pages ouvertes",
            state: "healthy",
            value: `${websocket.clients} connexion(s) WebSocket`,
            detail: "Pages de Vision recevant les mises à jour en direct",
        });
    }
    if (vitals.version) {
        const recommended = agentDetails?.versions?.vision?.recommended ?? null;
        rows.push(versionRow("Version de Vision", vitals.version, recommended, compareVersions(vitals.version, recommended)));
    }
    return rows;
}

/** Katsuyu: optional worker; an offline PC is informative, not a failure. */
/** Phase 5 hardening: Katsuyu's workspace, AI runtime detail and version. */
export function katsuyuHostRows(worker, latestKatsuyu) {
    const rows = [];
    const host = worker.host ?? null;
    const workspace = host?.workspace;
    if (workspace) {
        const lowSpace = typeof workspace.free_bytes === "number" && workspace.free_bytes < 20 * 1024 ** 3;
        rows.push({
            label: "Espace de travail",
            state: lowSpace ? "degraded" : "healthy",
            value: `${formatBytes(workspace.free_bytes)} libres`,
            detail: `${workspace.path} · occupé ${formatBytes(workspace.used_bytes)}`,
        });
    }
    const ai = host?.ai;
    if (ai) {
        const parts = [
            ai.model ? `${ai.model} (${formatBytes(ai.model_bytes)})` : null,
            ai.runtime,
            ai.last_inference_at
                ? `dernière analyse ${formatParis(ai.last_inference_at)} en ${DECIMAL.format(ai.last_inference_seconds ?? 0)} s`
                : "aucune analyse depuis le démarrage",
        ].filter(Boolean);
        const missing = ai.model_bytes === null || ai.model_bytes === undefined;
        rows.push({
            label: "Runtime IA (détail)",
            state: ai.last_error || missing ? "degraded" : ai.model_verified ? "healthy" : "unknown",
            value: ai.last_error
                ? "En échec"
                : missing ? "Modèle absent" : ai.model_verified ? "Modèle vérifié" : "Vérifié au premier job",
            detail: ai.last_error ? `${parts.join(" · ")} · ${ai.last_error}` : parts.join(" · "),
        });
    }
    const latest = host?.update?.latest_version ?? latestKatsuyu ?? null;
    const row = versionRow("Version de Katsuyu", worker.worker_version, latest, compareVersions(worker.worker_version, latest));
    if (host?.update?.automatic !== undefined && host?.update?.automatic !== null) {
        row.detail += host.update.automatic ? " · mise à jour automatique" : " · mise à jour manuelle";
    }
    rows.push(row);
    return rows;
}

export function katsuyuCard(workersDocument, error, latestKatsuyu = null) {
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
        rows: [...rows, ...katsuyuHostRows(worker, latestKatsuyu)],
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
    const now = Date.now();
    const rows = devices.map((device) => {
        // An association expires: the device must then be paired again.
        const remaining = (instant(device.expires_at) - now) / 86_400_000;
        const expiring = Number.isFinite(remaining) && remaining < ASSOCIATION_WARNING_DAYS;
        const expiry = Number.isFinite(remaining)
            ? remaining <= 0
                ? " · association expirée"
                : ` · association valable jusqu’au ${formatParis(device.expires_at)}`
            : "";
        return {
            label: device.device_name ?? device.device_id,
            state: expiring ? "degraded" : device.last_seen_at ? "healthy" : "unknown",
            // app_version is recorded at pairing, not the version running now.
            value: expiring
                ? remaining <= 0 ? "À réassocier" : `Expire dans ${Math.ceil(remaining)} j`
                : device.app_version ? `Associé en ${device.app_version}` : "Associé",
            detail: (device.last_seen_at
                ? `Dernière synchronisation ${formatParis(device.last_seen_at)}`
                : "Jamais synchronisé") + expiry,
        };
    });
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
        const [vitals, hostHealth, workers, devices, agentDetails] = await Promise.all([
            settle(API.runtimeVitals),
            settle(API.hostHealth),
            settle(API.administrationWorkers),
            settle(API.administrationCompanions),
            settle(API.agentVitals),
        ]);
        this.render({
            vitals: vitals.value,
            hostHealth: hostHealth.value,
            workers: workers.value,
            workersError: workers.error,
            devices: devices.value,
            devicesError: devices.error,
            // An older Agent has no detail: the cards keep their Phase 5 content.
            agentDetails: agentDetails.value,
        });
        this.loaded = true;
    }

    render({vitals, hostHealth, workers, workersError, devices, devicesError, agentDetails = null}) {
        if (!this.container) return;
        const cards = [
            agentCard(vitals?.agent, hostHealth, agentDetails),
            visionCard(vitals, hostHealth, agentDetails),
            katsuyuCard(workers, workersError, agentDetails?.versions?.katsuyu_latest ?? null),
            shizuneCard(vitals?.shizune_gateway, devices, devicesError),
        ];
        this.container.innerHTML = cards.map(renderCard).join("");
        if (this.updated) {
            this.updated.textContent = `Lu ${formatParis(vitals?.generated_at ?? new Date().toISOString())}`;
        }
    }
}
