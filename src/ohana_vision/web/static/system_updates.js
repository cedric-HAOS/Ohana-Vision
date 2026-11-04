"use strict";

// Operating-system updates of INFRA-01: what is pending, how fresh the
// package lists are and whether a restart is needed. Read-only: the Agent
// simulates the upgrade and never installs anything by itself.

import {API, fetchJson, requestJson} from "./api.js";
import {formatParis, renderCard} from "./ohana.js";

const STATUS_PRESENTATION = Object.freeze({
    up_to_date: ["healthy", "À jour"],
    updates_available: ["healthy", "Mises à jour disponibles"],
    security_updates: ["degraded", "Correctifs de sécurité en attente"],
    reboot_required: ["degraded", "Redémarrage requis"],
    stale_lists: ["degraded", "Listes périmées"],
});

const DECIMAL = new Intl.NumberFormat("fr-FR", {maximumFractionDigits: 1});

function listsAgeText(state) {
    if (state.lists_age_days === null || state.lists_age_days === undefined) {
        return "Jamais actualisées";
    }
    if (state.lists_age_days < 1) return "Moins d’un jour";
    return `${DECIMAL.format(state.lists_age_days)} jour(s)`;
}

function lastRunText(run) {
    if (!run) return "Aucune opération apt récente";
    const changes = Object.entries(run.changes ?? {})
        .map(([kind, total]) => `${kind} ×${total}`)
        .join(", ");
    return `${run.started_at} · ${run.command}${changes ? ` (${changes})` : ""}`;
}

/** The summary card: verdict, freshness of the lists and last apt run. */
export function summaryCard(state) {
    const [presentation, label] = STATUS_PRESENTATION[state.status] ?? ["unknown", state.status];
    const facts = [
        ["Verdict", label],
        ["Paquets en attente", `${state.pending_count} dont ${state.security_count} de sécurité`],
        ["Listes de paquets", `${formatParis(state.lists_refreshed_at)} (${listsAgeText(state)})`],
        ["Redémarrage", state.reboot_required ? "Requis" : "Non requis"],
        ["Dernière opération apt", lastRunText(state.last_apt_run)],
    ];
    return {id: "summary", title: "Système INFRA-01", state: presentation, summary: state.message, facts, rows: []};
}

/** One row per pending package, security fixes first, plus held-back ones. */
export function packageRows(state) {
    const rows = (state.packages ?? []).map((item) => ({
        label: item.name,
        state: item.security ? "degraded" : "healthy",
        value: item.candidate_version,
        detail: [
            item.security ? "sécurité" : null,
            item.new_package ? "nouveau paquet" : `installée ${item.installed_version}`,
            item.origin,
        ].filter(Boolean).join(" · "),
    }));
    if (state.packages_truncated) {
        rows.push({
            label: "…",
            state: "unknown",
            value: `${state.pending_count} au total`,
            detail: "Liste tronquée par l’Agent",
        });
    }
    for (const name of state.held_back ?? []) {
        rows.push({label: name, state: "unknown", value: "Retenu", detail: "apt le garde en arrière : mise à jour manuelle nécessaire"});
    }
    for (const name of state.reboot_packages ?? []) {
        rows.push({label: name, state: "degraded", value: "Redémarrage", detail: "À l’origine du redémarrage requis"});
    }
    return rows;
}

export function packagesCard(state) {
    return {
        id: "packages",
        title: "Paquets concernés",
        state: (state.security_count ?? 0) > 0 ? "degraded" : "healthy",
        summary: state.lists_stale
            ? "Les listes sont périmées : cette liste peut être incomplète."
            : state.pending_count
                ? `${state.pending_count} paquet(s) seront mis à jour.`
                : "Aucun paquet en attente.",
        facts: [],
        rows: packageRows(state),
        emptyRows: "Rien à mettre à jour.",
    };
}

const HELPER_STATES = Object.freeze({
    never: ["unknown", "Pas encore lancée"],
    running: ["degraded", "En cours"],
    succeeded: ["healthy", "Terminée"],
    failed: ["degraded", "En échec"],
});

function helperRow(label, run) {
    const [state, value] = HELPER_STATES[run?.state] ?? ["unknown", "Inconnue"];
    const detail = run?.state === "failed"
        ? `Échec ${formatParis(run.finished_at)} (${run.result ?? "erreur"}, code ${run.exit_status ?? "?"})`
        : run?.state === "succeeded"
            ? `Terminée ${formatParis(run.finished_at)}`
            : run?.state === "running"
                ? `Démarrée ${formatParis(run.started_at)}`
                : "Aucune exécution depuis le démarrage d’INFRA-01";
    return {label, state, value, detail};
}

/** What the two buttons may do now, and why one is unavailable. */
export function actionAvailability(state) {
    const helper = state.helper;
    if (!helper) return {available: false, reason: "L’Agent ne propose pas encore ces actions."};
    if (!helper.installed) {
        return {available: false, reason: "Les assistants ne sont pas installés : relancer Ohana-Installer sur INFRA-01."};
    }
    const running = ["refresh", "upgrade"].some((name) => helper[name]?.state === "running");
    const upgradeReason = state.lists_stale
        ? "Actualisez d’abord les listes de paquets."
        : !state.pending_count
            ? "Aucune mise à jour en attente."
            : null;
    return {
        available: true,
        running,
        refreshDisabled: running,
        upgradeDisabled: running || upgradeReason !== null,
        reason: running ? "Une opération apt est en cours." : upgradeReason,
    };
}

/** Confirmation shown before anything is installed. */
export function upgradeConfirmation(state) {
    return `Installer ${state.pending_count} mise(s) à jour sur INFRA-01 `
        + `(dont ${state.security_count} de sécurité) ?\n\n`
        + "Aucun paquet n’est supprimé et la machine ne redémarre pas. "
        + "apt peut relancer certains services mis à jour.";
}

export function actionsCard(state) {
    const availability = actionAvailability(state);
    const card = {
        id: "actions",
        title: "Actions",
        state: state.helper?.upgrade?.state === "failed" || state.helper?.refresh?.state === "failed"
            ? "degraded"
            : "healthy",
        summary: availability.reason ?? "Les listes sont à jour : vous pouvez lancer la mise à jour.",
        facts: [],
        rows: state.helper?.installed
            ? [helperRow("Actualiser les listes", state.helper.refresh), helperRow("Mettre à jour", state.helper.upgrade)]
            : [],
        availability,
    };
    card.footer = renderActions(card);
    return card;
}

function renderActions(card) {
    const {availability} = card;
    const buttons = availability.available
        ? `<div class="ohana-component__actions">
            <button class="button" type="button" data-system-update="refresh"${availability.refreshDisabled ? " disabled" : ""}>Actualiser les listes</button>
            <button class="button" type="button" data-system-update="apply"${availability.upgradeDisabled ? " disabled" : ""}>Mettre à jour</button>
          </div>`
        : "";
    return buttons;
}

const POLL_MILLISECONDS = 4000;

export class SystemUpdatesController {
    constructor() {
        this.container = document.querySelector("#system-updates-components");
        this.updated = document.querySelector("#system-updates-updated");
        this.state = null;
        this.timer = null;
        this.container?.addEventListener("click", (event) => {
            const button = event.target.closest("[data-system-update]");
            if (button && !button.disabled) void this.request(button.dataset.systemUpdate);
        });
    }

    async request(action) {
        if (action === "apply" && !window.confirm(upgradeConfirmation(this.state))) return;
        try {
            const url = action === "apply" ? API.systemUpdatesApply : API.systemUpdatesRefresh;
            const answer = await requestJson(url, {method: "POST"});
            if (answer?.busy) window.alert("Une opération apt est déjà en cours.");
        } catch (error) {
            window.alert(`Demande refusée : ${error?.message ?? error}`);
        }
        await this.load();
    }

    /** Follow a running apt operation without waiting for the 15 s refresh. */
    schedulePoll(running) {
        clearTimeout(this.timer);
        this.timer = running ? setTimeout(() => void this.load(), POLL_MILLISECONDS) : null;
    }

    async load() {
        if (!this.container) return;
        try {
            this.render(await fetchJson(API.systemUpdates));
        } catch (error) {
            this.container.innerHTML = renderCard({
                id: "error",
                title: "Système INFRA-01",
                state: "unknown",
                summary: `État des mises à jour indisponible : ${error?.message ?? error}`,
                facts: [],
                rows: [],
            });
        }
    }

    render(state) {
        this.state = state;
        const actions = actionsCard(state);
        const cards = [summaryCard(state), ...(state.helper ? [actions] : []), packagesCard(state)];
        this.container.innerHTML = cards.map(renderCard).join("");
        this.schedulePoll(Boolean(actions.availability.running));
        if (this.updated) this.updated.textContent = `Lu ${formatParis(state.read_at)}`;
    }
}
