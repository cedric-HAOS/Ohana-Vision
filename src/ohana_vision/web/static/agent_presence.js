"use strict";

import {API, requestJson} from "./api.js";

// Poll Vision independently: a silent Agent cannot trigger a WebSocket update.
export class AgentPresenceController {
    constructor({onUpdate = () => {}} = {}) {
        this.onUpdate = onUpdate;
        this.element = document.querySelector("#agent-presence");
        this.title = document.querySelector("#agent-presence-title");
        this.detail = document.querySelector("#agent-presence-detail");
        this.timer = null;
        this.inFlight = false;
    }

    initialize() {
        void this.load();
        this.timer = window.setInterval(() => void this.load(), 15000);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) void this.load();
        });
    }

    async load() {
        if (this.inFlight) return;
        this.inFlight = true;
        try {
            const vitals = await requestJson(API.runtimeVitals, {
                cache: "no-store",
                signal: AbortSignal.timeout(5000),
            });
            this.render(vitals?.agent ?? {state: "unknown"});
        } catch {
            // Failure to read Vision must never be labelled an Agent failure.
            this.render({state: "unknown"});
        } finally {
            this.inFlight = false;
        }
    }

    render(presence) {
        const state = presence?.state ?? "unknown";
        if (this.element) {
            this.element.classList.toggle("hidden", state === "active");
            this.element.dataset.state = state;
        }
        const labels = {
            silent: "Agent silencieux",
            waiting: "En attente de l’Agent",
            unknown: "Surveillance de l’Agent indisponible",
        };
        if (this.title) this.title.textContent = labels[state] ?? "Agent actif";
        if (this.detail) {
            const received = presence?.last_received_at;
            const last = received
                ? `Dernière réception : ${new Date(received).toLocaleString("fr-FR", {
                    timeZone: "Europe/Paris",
                })} (Paris). `
                : "Aucune observation reçue depuis le démarrage de Vision. ";
            this.detail.textContent = state === "silent"
                ? `${last}Plus de ${Math.floor(presence.max_silence_seconds / 60)} minutes sans observation. Les données de Konoha peuvent être anciennes. Vérifier l’Agent et sa liaison avec Vision.`
                : state === "waiting"
                    ? `${last}L’état actuel de Konoha reste à confirmer.`
                    : state === "unknown"
                        ? "Vision ne permet pas de confirmer la réception des observations. L’état actuel de Konoha reste à vérifier."
                        : "";
        }
        this.onUpdate(presence);
    }
}
