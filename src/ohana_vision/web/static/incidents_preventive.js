"use strict";

// Maintenance préventive de la vue Tsunade : tendances à surveiller, restaurations
// testées, session iCloud et intégrité des archives. Ces méthodes sont ajoutées au
// contrôleur des incidents au chargement de ce module (voir application.js).

import {API, requestJson} from "./api.js";
import {IncidentsController} from "./incidents.js";
import {mixInto} from "./incidents_shared.js";
import {escapeHtml, formatDate} from "./utils.js";

class PreventiveMethods {
    renderPreventive() {
        const container = this.elements.preventive;
        if (!container) {
            return;
        }
        if (this.preventive === undefined) {
            container.innerHTML = "<p>Évaluation des tendances…</p>";
            return;
        }
        if (this.preventive === null) {
            container.innerHTML = "<p>Maintenance préventive indisponible avec cette version d’Ohana-Agent.</p>";
            return;
        }
        const preventive = this.preventive;
        const watch = Array.isArray(preventive.watch) ? preventive.watch : [];
        // Older Agents have no mute: the button needs the drift's subject.
        const muteButton = (item, mute) => item.subject
            ? `<button class="configuration-secondary-button" data-tsunade-preventive-mute="${mute ? "mute" : "unmute"}" data-rule="${escapeHtml(item.rule)}" data-subject="${escapeHtml(item.subject)}" data-title="${escapeHtml(item.title)}" type="button">${mute ? "Ignorer 30 jours" : "Surveiller de nouveau"}</button>`
            : "";
        const drifts = watch.length
            ? `<ul class="incidents-preventive__watch">${watch.map((item) => `<li class="${item.urgent ? "is-urgent" : ""}">
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.detail ?? "")}</small>
                ${Array.isArray(item.correlated_with) && item.correlated_with.length
        ? `<small>Simultané avec : ${escapeHtml(item.correlated_with.join(" ; "))} (simultanéité, pas une cause).</small>`
        : ""}
                ${Array.isArray(item.correlated_upstream) && item.correlated_upstream.length
        ? `<small>Dépendance déclarée en amont, dérive simultanée : ${escapeHtml(item.correlated_upstream.join(" ; "))} (simultanéité, pas une cause).</small>`
        : ""}
                ${Array.isArray(item.correlated_downstream) && item.correlated_downstream.length
        ? `<small>Des équipements qui en dépendent dérivent aussi : ${escapeHtml(item.correlated_downstream.join(" ; "))} (simultanéité, pas une cause).</small>`
        : ""}
                ${Array.isArray(item.upstream_incident) && item.upstream_incident.length
        ? `<small>Incident ouvert en amont (dépendance déclarée) : ${escapeHtml(item.upstream_incident.join(" ; "))}.</small>`
        : ""}
                ${muteButton(item, true)}
            </li>`).join("")}</ul>`
            : "<p>Aucune dérive détectée.</p>";
        const followed = Array.isArray(preventive.followed_by_incident) ? preventive.followed_by_incident : [];
        const muted = Array.isArray(preventive.muted) ? preventive.muted : [];
        const apart = [
            followed.length
                ? `<p><small>Déjà suivi par un incident ouvert : ${escapeHtml(followed.map((item) => item.title).join(" ; "))}.</small></p>`
                : "",
            muted.length
                ? `<ul class="incidents-preventive__muted">${muted.map((item) => `<li>
                    <small><strong>${escapeHtml(item.title)}</strong> · ignoré jusqu’au ${escapeHtml(formatDate(item.muted_until))}</small>
                    ${muteButton(item, false)}
                </li>`).join("")}</ul>`
                : "",
        ].join("");
        const stateLabels = {ok: "Normal", watch: "À surveiller", insufficient_data: "Historique insuffisant"};
        // The periodic refresh must not fold the rules the user just opened.
        container.querySelectorAll("details[data-check]").forEach((details) => {
            if (details.open) {
                this.openPreventiveRules.add(details.dataset.check);
            } else {
                this.openPreventiveRules.delete(details.dataset.check);
            }
        });
        const rows = (Array.isArray(preventive.checks) ? preventive.checks : []).map((check) => `<tr class="is-${escapeHtml(check.state)}">
                <td>
                    <details data-check="${escapeHtml(check.id)}"${this.openPreventiveRules.has(check.id) ? " open" : ""}>
                        <summary>${escapeHtml(check.title)}</summary>
                        <small>${escapeHtml(check.rule)}</small>
                    </details>
                </td>
                <td><span class="incidents-experience__state">${escapeHtml(stateLabels[check.state] ?? check.state)}</span></td>
                <td><small>${escapeHtml(this.preventiveFacts(check))}</small></td>
            </tr>`).join("");
        container.innerHTML = `<p><strong>${escapeHtml(preventive.headline)}</strong></p>
            ${drifts}
            ${apart}
            <p class="incidents-preventive__conclusion">${escapeHtml(preventive.conclusion)}</p>
            <h4 class="incidents-preventive__rules-title">Règles appliquées sur ${escapeHtml(preventive.window_days)} jours</h4>
            <p><small>Évaluées le ${escapeHtml(formatDate(preventive.generated_at))}. Un clic sur une règle en montre le critère.</small></p>
            <table class="incidents-preventive__rules">
                <thead><tr><th scope="col">Règle</th><th scope="col">État</th><th scope="col">Mesure</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p><small>La maintenance préventive signale seulement : elle n’ouvre pas d’incident et ne déclenche aucune réparation.</small></p>
            ${this.restoreTestsBlock()}
            ${this.preventiveBackfill(preventive.backfill)}`;
    }

    restoreTestsBlock() {
        const evidence = this.restoreTests;
        if (!evidence) {
            return "";
        }
        const labels = {ok: "réussie", partial: "partielle", failed: "échouée"};
        const targets = evidence.targets;
        const rows = targets.map((entry) => {
            const last = entry.last_test;
            return `<li class="is-${escapeHtml(entry.state)}"><strong>${escapeHtml(String(entry.target).toUpperCase())}</strong> : ${escapeHtml(entry.text)}
                <small>${escapeHtml(this.integrityLine(entry.integrity))} <button class="configuration-secondary-button" data-tsunade-archive-verify="${escapeHtml(entry.target)}" type="button">Vérifier maintenant</button></small>
                <small>${entry.last_backup_success_at ? `Dernière sauvegarde réussie le ${escapeHtml(formatDate(entry.last_backup_success_at))}. ` : ""}${last ? `Dernier test : ${escapeHtml(labels[last.outcome] ?? last.outcome)} le ${escapeHtml(formatDate(last.tested_at))}${last.reference ? ` (${escapeHtml(last.reference)})` : ""}${last.source === "installer" ? ", rapport d’Ohana-Installer" : ""}.` : "Aucun test déclaré."}</small></li>`;
        }).join("");
        const options = targets.map((entry) => `<option value="${escapeHtml(entry.target)}">${escapeHtml(String(entry.target).toUpperCase())}</option>`).join("");
        return `<div class="incidents-preventive__restore">
            <h4 class="incidents-preventive__rules-title">Sauvegardes restaurées</h4>
            <p><small>Une sauvegarde n’est fiable que si elle a été restaurée. Ohana ne le déduit jamais : vous déclarez ici le résultat d’une restauration réellement faite (au plus ${escapeHtml(evidence.max_age_days)} jours d’ancienneté).</small></p>
            ${this.icloudLine(evidence.icloud)}
            ${rows ? `<ul>${rows}</ul>` : "<p><small>Aucune sauvegarde réussie observée pour l’instant.</small></p>"}
            ${rows ? `<form data-tsunade-restore-form class="incidents-preventive__restore-form">
                <label>Cible <select name="target" required>${options}</select></label>
                <label>Résultat <select name="outcome" required>
                    <option value="ok">Restauration réussie</option>
                    <option value="partial">Restauration partielle</option>
                    <option value="failed">Restauration échouée</option>
                </select></label>
                <label>Date du test <input name="tested_at" type="date"></label>
                <label>Archive utilisée <input name="reference" maxlength="200" placeholder="nom ou dossier horodaté" type="text"></label>
                <label>Note <input name="note" maxlength="1000" placeholder="obligatoire si partielle ou échouée" type="text"></label>
                <button class="configuration-secondary-button" type="submit">Déclarer ce test</button>
            </form>` : ""}
        </div>`;
    }

    icloudLine(icloud) {
        if (!icloud) {
            return `<p class="incidents-preventive__icloud"><small>Session iCloud : pas encore contrôlée (contrôle toutes les heures).</small></p>`;
        }
        const labels = {
            connected: "session ouverte",
            session_expired: "session expirée : reconnectez iCloud dans Configuration, Plugins, Sauvegardes",
            unreachable: "iCloud injoignable",
            not_configured: "non configuré",
            error: "erreur de rclone",
        };
        const since = icloud.connected
            ? ""
            : ` depuis le ${escapeHtml(formatDate(icloud.since))}`;
        const last = !icloud.connected && icloud.last_success_at
            ? ` Dernière session valide : ${escapeHtml(formatDate(icloud.last_success_at))}.`
            : "";
        return `<p class="incidents-preventive__icloud ${icloud.connected ? "is-connected" : "is-broken"}"><strong>Session iCloud</strong> : ${escapeHtml(labels[icloud.state] ?? icloud.state)}${since}. <small>Contrôlée le ${escapeHtml(formatDate(icloud.checked_at))}.${last}</small></p>`;
    }

    integrityLine(integrity) {
        if (!integrity) {
            return "Intégrité de l’archive pas encore contrôlée.";
        }
        const labels = {
            ok: "archive relue, taille et empreinte conformes",
            missing: "archive absente",
            size_mismatch: "taille différente de celle enregistrée",
            hash_mismatch: "empreinte différente de celle enregistrée",
            not_encrypted: "archive non chiffrée",
            unreadable: "remote illisible, rien de prouvé",
        };
        const encrypted = integrity.encrypted === true ? ", chiffrement age confirmé" : "";
        return `Intégrité : ${labels[integrity.outcome] ?? integrity.outcome}${integrity.outcome === "ok" ? encrypted : ""} (${integrity.backup_ref || "aucune archive"}, ${formatDate(integrity.checked_at)}).`;
    }

    async requestArchiveCheck(button) {
        button.disabled = true;
        this.showError("");
        try {
            const target = button.dataset.tsunadeArchiveVerify;
            const result = await requestJson(API.tsunadeArchiveVerify, {
                method: "POST",
                body: JSON.stringify(target ? {target} : {}),
            });
            this.showCommandStatus(result?.busy
                ? "Un contrôle d’archives est déjà en cours."
                : "Contrôle lancé : le résultat s’affichera à la prochaine actualisation.");
        } catch (error) {
            this.showError(`Contrôle impossible : ${this.errorMessage(error)}`);
        }
        button.disabled = false;
    }

    async declareRestoreTest(form) {
        const data = new FormData(form);
        const payload = {
            target: String(data.get("target")),
            outcome: String(data.get("outcome")),
            reference: String(data.get("reference") ?? ""),
            note: String(data.get("note") ?? ""),
        };
        const day = String(data.get("tested_at") ?? "");
        const today = new Date().toLocaleDateString("sv-SE");
        if (day && day !== today) {
            // Today's test keeps the real time; an earlier day is dated at noon.
            payload.tested_at = `${day}T12:00:00`;
        }
        const submit = form.querySelector("button[type=submit]");
        submit.disabled = true;
        this.showError("");
        try {
            await requestJson(API.tsunadeRestoreTests, {
                method: "POST",
                body: JSON.stringify(payload),
            });
            this.showCommandStatus("Test de restauration enregistré.");
            await this.load();
        } catch (error) {
            this.showError(`Déclaration impossible : ${this.errorMessage(error)}`);
            submit.disabled = false;
        }
    }

    preventiveBackfill(backfill) {
        if (!backfill?.available) {
            return "";
        }
        const labels = {
            CREATED: "en attente de Katsuyu",
            QUEUED: "en attente de Katsuyu",
            WAITING_WORKER: "en attente de Katsuyu",
            RUNNING: "en cours",
            SUCCEEDED: "terminé",
            FAILED: "échoué",
            TIMEOUT: "expiré sans Katsuyu",
            CANCELLED: "annulé",
        };
        const job = backfill.job;
        let status = "Aucun rattrapage demandé pour l’instant.";
        let busy = false;
        if (job) {
            busy = ["CREATED", "QUEUED", "WAITING_WORKER", "RUNNING"].includes(job.status);
            status = `Dernier rattrapage : ${labels[job.status] ?? job.status}, demandé le ${formatDate(job.created_at)}`;
            if (job.status === "SUCCEEDED") {
                status += job.days
                    ? ` · ${job.days} jour(s) lu(s) dans Home Assistant${job.entity_id ? ` (${job.entity_id})` : ""}`
                    : " · aucune statistique trouvée dans Home Assistant";
            } else if (job.error) {
                status += ` · ${job.error}`;
            }
            status += ".";
        }
        return `<div class="incidents-preventive__backfill">
            <p><small>${escapeHtml(status)} Un jour mesuré par l’Agent n’est jamais remplacé.</small></p>
            <button class="configuration-secondary-button" data-tsunade-preventive-backfill type="button"${busy ? " disabled" : ""}>Rattraper l’historique avec Katsuyu</button>
        </div>`;
    }

    async setPreventiveMute(button) {
        const mute = button.dataset.tsunadePreventiveMute === "mute";
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(mute ? API.tsunadePreventiveMute : API.tsunadePreventiveUnmute, {
                method: "POST",
                body: JSON.stringify({
                    rule: button.dataset.rule,
                    subject: button.dataset.subject,
                    title: button.dataset.title,
                    days: 30,
                }),
            });
            this.showCommandStatus(mute
                ? "Dérive ignorée 30 jours : elle reste visible, sans alerte."
                : "Dérive de nouveau surveillée.");
            await this.load();
        } catch (error) {
            this.showError(`Changement impossible : ${this.errorMessage(error)}`);
            button.disabled = false;
        }
    }

    async requestPreventiveBackfill(button) {
        button.disabled = true;
        this.showError("");
        try {
            await requestJson(API.tsunadePreventiveBackfill, {method: "POST"});
            this.showCommandStatus("Rattrapage demandé : Katsuyu lira l’historique de Home Assistant dès qu’il sera disponible.");
            await this.load();
        } catch (error) {
            this.showError(`Rattrapage impossible : ${this.errorMessage(error)}`);
            button.disabled = false;
        }
    }

    preventiveFacts(check) {
        const nodes = Array.isArray(check.nodes) ? check.nodes : [];
        if (!nodes.length) {
            return "Aucune donnée pour l’instant.";
        }
        const label = (id) => String(id).toUpperCase();
        const number = (value) => Number(value ?? 0).toLocaleString("fr-FR", {maximumFractionDigits: 1});
        return nodes.map((node) => {
            // Newer rules phrase their own facts on the Agent side.
            if (node.summary) {
                return node.summary;
            }
            if (check.id === "disk_growth") {
                if (node.state === "insufficient_data") {
                    return `${label(node.node_id)} : ${node.days} jour(s) mesuré(s) sur 4 nécessaires`;
                }
                const slope = Number(node.slope_points_per_day ?? 0);
                const rebuilt = node.rebuilt_days ? ` (dont ${node.rebuilt_days} reconstruit(s) depuis Home Assistant)` : "";
                return `${label(node.node_id)} : ${number(node.latest_percent)} %, ${slope >= 0 ? "+" : ""}${number(slope)} point/jour sur ${node.days} jours${rebuilt}`;
            }
            return `${label(node.node_id)} : ${node.count} en ${this.preventive.window_days} jours`;
        }).join(" · ");
    }
}

mixInto(IncidentsController, PreventiveMethods);
