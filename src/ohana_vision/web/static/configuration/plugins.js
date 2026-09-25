"use strict";

import {
    API,
    fetchJson,
    requestJson,
} from "../api.js";

import {
    escapeHtml,
    hideError,
    showError,
} from "../utils.js";

import {
    BACKUP_MONTH_DAYS,
    BACKUP_WEEKDAYS,
    PLUGIN_ICONS,
    PLUGIN_STATUS_LABELS,
    isHomeAssistantTelemetryPlugin,
    normalizePluginPresentation,
} from "./shared.js";

/**
 * ConfigurationController methods: Plugin list, inspector, configuration and backup.
 */
export const PluginsMethods = {
    async refreshPlugins() {
        if (!this.pluginsAvailable) {
            return false;
        }

        try {
            const pluginsPayload = await fetchJson(
                API.administrationPlugins,
            );
            this.plugins = (pluginsPayload.plugins ?? [])
                .map(normalizePluginPresentation);
            this.pluginsLoadError = null;

            if (
                this.selectedPluginId
                && !this.plugins.some(
                    (plugin) =>
                        plugin.id === this.selectedPluginId,
                )
            ) {
                this.selectedPluginId = null;
            }

            this.renderPlugins();
            return true;
        } catch (error) {
            this.pluginsLoadError =
                this.errorMessage(error);
            this.renderPlugins();
            return false;
        }
    },

    renderPlugins() {
        if (!this.elements.pluginCards) {
            return;
        }

        this.elements.pluginCount.textContent =
            String(this.plugins.length);

        if (!this.pluginsAvailable) {
            this.elements.pluginCards.innerHTML = `
                <div class="plugin-empty-state">
                    <img alt="" src="/ui/assets/icons/empty-states/puzzle.svg">
                    <h3>Administration indisponible</h3>
                    <p>Agent n’expose pas encore la gestion des plugins.</p>
                </div>
            `;
            this.selectedPluginId = null;
            this.renderPluginInspector();
            return;
        }

        if (this.pluginsLoadError) {
            this.elements.pluginCards.innerHTML = `
                <div class="plugin-empty-state plugin-empty-state--error">
                    <img alt="" src="/ui/assets/icons/empty-states/server-crash.svg">
                    <h3>Plugins indisponibles</h3>
                    <p>${escapeHtml(this.pluginsLoadError)}</p>
                </div>
            `;
            this.selectedPluginId = null;
            this.renderPluginInspector();
            return;
        }

        if (this.plugins.length === 0) {
            this.elements.pluginCards.innerHTML = `
                <div class="plugin-empty-state">
                    <img alt="" src="/ui/assets/icons/empty-states/puzzle.svg">
                    <h3>Aucun plugin enregistré</h3>
                    <p>Les plugins intégrés à Agent apparaîtront ici.</p>
                </div>
            `;
            this.selectedPluginId = null;
            this.renderPluginInspector();
            return;
        }

        if (
            !this.plugins.some(
                (plugin) =>
                    plugin.id === this.selectedPluginId,
            )
        ) {
            this.selectedPluginId = this.plugins[0].id;
        }

        this.elements.pluginCards.innerHTML =
            this.plugins.map((plugin) => {
                const selected =
                    plugin.id === this.selectedPluginId;
                const statusLabel =
                    PLUGIN_STATUS_LABELS[plugin.status]
                    ?? plugin.status;
                const lastExecution =
                    this.formatPluginDate(
                        plugin.last_execution_at,
                    );
                const error = plugin.last_error
                    ? `
                        <p class="plugin-card__error">
                            ${escapeHtml(plugin.last_error)}
                        </p>
                    `
                    : "";

                return `
                    <button
                        aria-pressed="${selected}"
                        class="plugin-card ${selected ? "is-selected" : ""}"
                        data-plugin-id="${escapeHtml(plugin.id)}"
                        type="button"
                    >
                        <span class="plugin-card__icon">
                            <img
                                alt=""
                                src="${escapeHtml(PLUGIN_ICONS[plugin.id] ?? "/ui/assets/icons/plugins/puzzle.svg")}"
                            >
                        </span>
                        <span class="plugin-card__content">
                            <span class="plugin-card__heading">
                                <span>
                                    <strong>${escapeHtml(plugin.name)}</strong>
                                    <small>v${escapeHtml(plugin.version)}</small>
                                </span>
                                <span class="plugin-status plugin-status--${escapeHtml(plugin.status)}">
                                    ${escapeHtml(statusLabel)}
                                </span>
                            </span>
                            <span class="plugin-card__description">
                                ${escapeHtml(plugin.description || "Plugin Ohana-Agent")}
                            </span>
                            <span class="plugin-card__metrics">
                                <span>${plugin.task_count} tâche${plugin.task_count > 1 ? "s" : ""}</span>
                                <span>${plugin.execution_count} exécution${plugin.execution_count > 1 ? "s" : ""}</span>
                                <span>${escapeHtml(lastExecution)}</span>
                            </span>
                            ${error}
                        </span>
                    </button>
                `;
            }).join("");

        this.renderPluginInspector();
    },

    selectPlugin(identifier) {
        if (
            !this.plugins.some(
                (plugin) => plugin.id === identifier,
            )
        ) {
            return;
        }

        this.selectedPluginId = identifier;
        this.renderPlugins();
    },

    selectedPlugin() {
        return this.plugins.find(
            (plugin) =>
                plugin.id === this.selectedPluginId,
        ) ?? null;
    },

    renderPluginInspector() {
        const plugin = this.selectedPlugin();

        if (
            !plugin
            || !this.elements.pluginForm
            || !this.elements.pluginInspectorContent
        ) {
            if (this.elements.pluginForm) {
                this.elements.pluginForm.hidden = true;
            }

            if (this.elements.pluginInspectorEmpty) {
                this.elements.pluginInspectorEmpty.hidden = false;
            }
            return;
        }

        this.elements.pluginInspectorEmpty.hidden = true;
        this.elements.pluginForm.hidden = false;
        this.elements.pluginTestResult.classList.add(
            "hidden",
        );
        this.elements.pluginTestResult.textContent = "";

        const statusLabel =
            PLUGIN_STATUS_LABELS[plugin.status]
            ?? plugin.status;
        const capabilities =
            plugin.capabilities.length > 0
                ? plugin.capabilities.map(
                    (capability) => `
                        <span class="plugin-capability">
                            ${escapeHtml(capability)}
                        </span>
                    `,
                ).join("")
                : '<span class="plugin-capability">Aucune capacité</span>';

        this.elements.pluginInspectorContent.innerHTML = `
            <div class="configuration-card__heading plugin-inspector__heading">
                <div>
                    <p class="panel-heading__kicker">Plugin ${escapeHtml(plugin.id)}</p>
                    <h2>${escapeHtml(plugin.name)}</h2>
                    <p>${escapeHtml(plugin.description || "Plugin Ohana-Agent")}</p>
                </div>
                <span class="plugin-status plugin-status--${escapeHtml(plugin.status)}">
                    ${escapeHtml(statusLabel)}
                </span>
            </div>
            <div class="plugin-capabilities">
                ${capabilities}
            </div>
            <div class="plugin-runtime-summary">
                <span>
                    <small>Tâches</small>
                    <strong>${plugin.task_count}</strong>
                </span>
                <span>
                    <small>Dernière exécution</small>
                    <strong>${escapeHtml(this.formatPluginDate(plugin.last_execution_at))}</strong>
                </span>
                <span>
                    <small>Prochaine exécution</small>
                    <strong>${escapeHtml(this.formatPluginDate(plugin.next_run_at, "Non planifiée"))}</strong>
                </span>
            </div>
            <div class="configuration-form-grid plugin-configuration-fields">
                ${this.pluginActivationField(plugin)}
                ${this.pluginConfigurationFields(plugin)}
            </div>
            <p class="plugin-inspector__hint">
                ${escapeHtml(this.pluginConfigurationHint(plugin))}
            </p>
        `;
        this.pluginFormDirty = false;

        document.getElementById("plugin-enabled")
            ?.addEventListener(
                "change",
                () => {
                    this.updatePluginConfigurationAvailability();
                },
            );
        document.getElementById("plugin-backup-icloud-connect")
            ?.addEventListener(
                "click",
                () => {
                    void this.connectBackupICloud();
                },
            );
        this.updatePluginConfigurationAvailability();
    },

    pluginActivationField(plugin) {
        if (
            plugin.id === "network"
            || isHomeAssistantTelemetryPlugin(plugin)
            || plugin.id === "teleinformation"
        ) {
            const scope = plugin.id === "network"
                ? "Choisissez les équipements surveillés dans Configuration → Architecture."
                : isHomeAssistantTelemetryPlugin(plugin)
                    ? "Ajoutez un service Télémétrie Home Assistant à chaque équipement concerné dans Configuration → Architecture."
                    : "Ajoutez le service Téléinformation au RPI-Linky dans Configuration → Architecture.";

            return `
                <div class="plugin-scope configuration-span-2">
                    <span class="plugin-scope__icon" aria-hidden="true"></span>
                    <span>
                        <strong>${plugin.id === "network" ? "Activation par équipement" : "Activation par service"}</strong>
                        <small>${escapeHtml(scope)}</small>
                    </span>
                </div>
            `;
        }

        return `
            <label class="configuration-check configuration-span-2">
                <input id="plugin-enabled" type="checkbox" ${plugin.enabled ? "checked" : ""}>
                ${escapeHtml(this.pluginEnabledLabel(plugin))}
            </label>
        `;
    },

    pluginEnabledLabel(plugin) {
        if (plugin.id === "backup") {
            return "Sauvegardes activées";
        }

        if (plugin.id === "dhcp") {
            return "Observation DHCP activée";
        }

        return "Plugin activé";
    },

    pluginConfigurationHint(plugin) {
        if (plugin.id === "backup") {
            return "Agent protège les systèmes HAOS et INFRA-01 dans iCloud, sans écrire d’archive persistante sur la carte microSD.";
        }

        if (plugin.id === "network") {
            return "Les équipements adressables sont découverts automatiquement depuis l’onglet Architecture.";
        }

        if (plugin.id === "dhcp") {
            return "Cette observation surveille le service et l’occupation du pool. Les baux et réservations restent gérés dans la page DHCP.";
        }

        if (plugin.id === "zwave") {
            return "Les contrôleurs Z-Wave JS UI ciblés proviennent des services Z-Wave déclarés dans l’onglet Architecture.";
        }

        if (plugin.id === "wireguard") {
            return "Le serveur WireGuard est contrôlé directement dans Freebox OS. Le service WireGuard doit être déclaré sur la Freebox dans l’onglet Architecture et Ohana-Agent doit être autorisé par la Freebox.";
        }

        if (isHomeAssistantTelemetryPlugin(plugin)) {
            return "Cette page configure la connexion Home Assistant. Les entités et l’âge maximal sont définis dans chaque service Télémétrie Home Assistant de l’architecture.";
        }

        if (plugin.id === "teleinformation") {
            return "Cette page configure la connexion Home Assistant. Les entités SINSTS, NTARF et EASF01 à EASF06 sont définies dans le service Téléinformation du RPI-Linky.";
        }

        return "Les serveurs et courtiers ciblés proviennent des services déclarés dans l’onglet Architecture.";
    },

    backupScheduleDraft(schedule) {
        const parts = String(schedule ?? "").trim().split(/\s+/);

        if (parts.length !== 5) {
            return {
                frequency: "daily",
                time: "00:00",
                weekday: "0",
                monthDay: "1",
            };
        }

        const [
            minute,
            hour,
            day,
            month,
            weekday,
        ] = parts;
        const time =
            `${String(Number(hour)).padStart(2, "0")}:`
            + String(Number(minute)).padStart(2, "0");

        if (
            day === "*"
            && month === "*"
            && weekday !== "*"
        ) {
            return {
                frequency: "weekly",
                time,
                weekday,
                monthDay: "1",
            };
        }

        if (
            day !== "*"
            && month === "*"
            && weekday === "*"
        ) {
            return {
                frequency: "monthly",
                time,
                weekday: "0",
                monthDay: day,
            };
        }

        return {
            frequency: "daily",
            time,
            weekday: "0",
            monthDay: "1",
        };
    },

    backupFrequencyControl(prefix, schedule) {
        const draft = this.backupScheduleDraft(schedule);
        const weekdayOptions = BACKUP_WEEKDAYS.map(
            ([value, label]) => `
                <option value="${value}" ${draft.weekday === value ? "selected" : ""}>
                    ${label}
                </option>
            `,
        ).join("");
        const monthDayOptions = BACKUP_MONTH_DAYS.map(
            (value) => `
                <option value="${value}" ${draft.monthDay === value ? "selected" : ""}>
                    ${value}
                </option>
            `,
        ).join("");

        return `
            <label>
                Périodicité
                <select id="${prefix}-frequency">
                    <option value="daily" ${draft.frequency === "daily" ? "selected" : ""}>Quotidien</option>
                    <option value="weekly" ${draft.frequency === "weekly" ? "selected" : ""}>Hebdomadaire</option>
                    <option value="monthly" ${draft.frequency === "monthly" ? "selected" : ""}>Mensuel</option>
                </select>
            </label>
            <label>
                Heure
                <input id="${prefix}-time" type="time" value="${escapeHtml(draft.time)}" required>
            </label>
            <label>
                Jour hebdomadaire
                <select id="${prefix}-weekday">
                    ${weekdayOptions}
                </select>
            </label>
            <label>
                Jour mensuel
                <select id="${prefix}-month-day">
                    ${monthDayOptions}
                </select>
            </label>
        `;
    },

    backupSchedulePayload(prefix) {
        const time = this.value(`${prefix}-time`);
        const [
            hour,
            minute,
        ] = time.split(":").map(Number);
        const frequency = this.value(`${prefix}-frequency`);

        if (frequency === "weekly") {
            return `${minute} ${hour} * * ${this.value(`${prefix}-weekday`)}`;
        }

        if (frequency === "monthly") {
            return `${minute} ${hour} ${this.value(`${prefix}-month-day`)} * *`;
        }

        return `${minute} ${hour} * * *`;
    },

    updatePluginConfigurationAvailability() {
        const plugin = this.selectedPlugin();
        const activationControl =
            document.getElementById("plugin-enabled");
        const enabled = (
            plugin?.id === "network"
            || isHomeAssistantTelemetryPlugin(plugin)
            || plugin?.id === "teleinformation"
        )
            ? true
            : (
                activationControl
                    ? activationControl.checked
                    : Boolean(plugin?.enabled)
            );

        this.elements.pluginInspectorContent
            ?.querySelectorAll(
                "input:not(#plugin-enabled), select, textarea",
            )
            .forEach((control) => {
                control.disabled = !enabled;
            });

        if (this.elements.pluginTest) {
            this.elements.pluginTest.disabled = !enabled;
        }
    },

    pluginConfigurationFields(plugin) {
        const configuration = plugin.configuration ?? {};
        const numberField = (
            id,
            label,
            value,
            options = "",
        ) => `
            <label>
                ${escapeHtml(label)}
                <input id="${id}" type="number" value="${escapeHtml(value)}" ${options}>
            </label>
        `;

        const common = `
            ${numberField(
                "plugin-interval-seconds",
                "Intervalle (secondes)",
                configuration.interval_seconds ?? 60,
                'min="1" required',
            )}
            ${numberField(
                "plugin-timeout",
                "Délai maximal (secondes)",
                configuration.timeout ?? 2,
                'min="0.1" step="0.1" required',
            )}
            ${numberField(
                "plugin-retries",
                "Nouvelles tentatives",
                configuration.retries ?? 1,
                'min="0" step="1" required',
            )}
        `;

        if (plugin.id === "backup") {
            const defaults = [
                ["ha-01", "HA-01", "02:00"],
                ["linky-01", "LINKY-01", "03:00"],
                ["zwave-01", "ZWAVE-01", "04:00"],
            ];
            const configuredTargets = configuration.targets ?? [];
            const targets = configuredTargets.length > 0
                ? configuredTargets
                : defaults.map(([id, label, time]) => ({
                    id,
                    label,
                    enabled: true,
                    url: `http://${id}.ohana.lan:8123`,
                    token: null,
                    password: null,
                    schedule: `${Number(time.slice(3))} ${Number(time.slice(0, 2))} * * *`,
                    verify_tls: true,
                    timeout: id === "ha-01" ? 900 : 600,
                }));
            const icloud = configuration.icloud ?? {};
            const infra = configuration.infra_01 ?? {};
            const destinationPath = String(
                configuration.rclone_remote ?? "icloud:Ohana/Backups",
            ).split(":", 2)[1] || "Ohana/Backups";
            const icloudStatus = !icloud.binary_available
                ? "rclone n’est pas encore installé sur Agent."
                : icloud.configured
                    ? "Connexion iCloud configurée."
                    : icloud.requires_two_factor
                        ? "Authentification commencée : code 2FA attendu."
                        : "Connexion iCloud non configurée.";

            return `
                <fieldset class="plugin-backup-target configuration-span-2">
                    <legend>Connexion iCloud</legend>
                    <p class="configuration-span-2">${escapeHtml(icloudStatus)}</p>
                    ${icloud.requires_two_factor ? `
                        <label class="configuration-span-2">
                            Code de validation Apple
                            <input id="plugin-backup-icloud-two-factor" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="Code 2FA">
                        </label>
                        <div class="configuration-span-2">
                            <button id="plugin-backup-icloud-connect" class="button" type="button" ${icloud.binary_available ? "" : "disabled"}>
                                Valider le code 2FA
                            </button>
                        </div>
                    ` : `
                        <details class="configuration-span-2" ${icloud.configured ? "" : "open"}>
                            <summary>${icloud.configured ? "Renouveler la connexion iCloud" : "Configurer la connexion iCloud"}</summary>
                            <div class="configuration-form-grid plugin-backup-target__advanced">
                                <label>
                                    Identifiant Apple
                                    <input id="plugin-backup-icloud-apple-id" type="email" autocomplete="username" placeholder="nom@icloud.com">
                                </label>
                                <label>
                                    Mot de passe Apple
                                    <input id="plugin-backup-icloud-password" type="password" autocomplete="current-password">
                                    <small>Ces identifiants ne sont pas conservés. Le mot de passe Apple normal est requis ; les mots de passe spécifiques aux apps ne fonctionnent pas avec rclone.</small>
                                </label>
                                <div class="configuration-span-2">
                                    <button id="plugin-backup-icloud-connect" class="button" type="button" ${icloud.binary_available ? "" : "disabled"}>
                                        ${icloud.configured ? "Reconnecter iCloud" : "Connecter iCloud"}
                                    </button>
                                </div>
                            </div>
                        </details>
                    `}
                </fieldset>
                <label class="configuration-span-2">
                    Dossier de destination iCloud
                    <input id="plugin-backup-destination-path" type="text" value="${escapeHtml(destinationPath)}" placeholder="Ohana/Backups" required>
                    <small>Chemin dans iCloud Drive. La connexion rclone « ${escapeHtml(icloud.remote_name ?? "icloud")} » est gérée automatiquement par Agent.</small>
                </label>
                <fieldset class="plugin-backup-target configuration-span-2">
                    <legend>INFRA-01</legend>
                    <label class="configuration-check configuration-span-2">
                        <input id="plugin-backup-infra-enabled" type="checkbox" ${infra.enabled === true ? "checked" : ""}>
                        Sauvegarder les configurations d’INFRA-01
                    </label>
                    ${this.backupFrequencyControl("plugin-backup-infra", infra.schedule ?? "0 1 * * *")}
                    <p>
                        Chiffrement age géré automatiquement
                        <small>
                            Ohana-Installer crée l’identité sur INFRA-01 et conserve
                            sa copie de récupération dans iCloud Drive.
                        </small>
                    </p>
                    <label>
                        Sauvegardes conservées dans iCloud
                        <input id="plugin-backup-infra-retention" type="number" min="0" max="365" step="1" value="${escapeHtml(infra.remote_retention_count ?? 0)}" required>
                        <small>0 conserve toutes les sauvegardes. La rotation ne supprime que des sauvegardes complètes après validation de la nouvelle.</small>
                    </label>
                    <p class="configuration-span-2">
                        ${infra.backup_in_progress ? "Sauvegarde en cours…" : "Archive chiffrée, vérifiée puis envoyée directement à iCloud via le stockage temporaire en RAM."}
                    </p>
                </fieldset>
                ${targets.map((target, index) => `
                    <fieldset class="plugin-backup-target configuration-span-2" data-backup-target-index="${index}">
                        <legend>${escapeHtml(target.label ?? target.id)}</legend>
                        <input id="plugin-backup-target-${index}-id" type="hidden" value="${escapeHtml(target.id)}">
                        <label class="configuration-check configuration-span-2">
                            <input id="plugin-backup-target-${index}-enabled" type="checkbox" ${target.enabled !== false ? "checked" : ""}>
                            Sauvegarder ${escapeHtml(target.label ?? target.id)}
                        </label>
                        <label>
                            Nom affiché
                            <input id="plugin-backup-target-${index}-label" type="text" value="${escapeHtml(target.label ?? target.id)}" required>
                        </label>
                        ${this.backupFrequencyControl(`plugin-backup-target-${index}`, target.schedule)}
                        <label class="configuration-span-2">
                            Adresse HAOS
                            <input id="plugin-backup-target-${index}-url" type="url" value="${escapeHtml(target.url ?? `http://${target.id}.ohana.lan:8123`)}" placeholder="http://${escapeHtml(target.id)}.ohana.lan:8123" required>
                        </label>
                        <label>
                            Délai maximal (secondes)
                            <input id="plugin-backup-target-${index}-timeout" type="number" min="1" step="1" value="${escapeHtml(target.timeout ?? 600)}" required>
                        </label>
                        <label class="configuration-check">
                            <input id="plugin-backup-target-${index}-verify-tls" type="checkbox" ${target.verify_tls !== false ? "checked" : ""}>
                            Vérifier le certificat TLS
                        </label>
                        <details class="configuration-span-2">
                            <summary>Secrets et préparation</summary>
                            <div class="configuration-form-grid plugin-backup-target__advanced">
                                <label>
                                    Jeton Home Assistant
                                    <input id="plugin-backup-target-${index}-token" type="password" value="" autocomplete="new-password" placeholder="Laisser vide pour conserver le jeton actuel">
                                    <small>${target.token_configured ? "Jeton configuré. Laissez vide pour le conserver." : "Jeton absent."}</small>
                                </label>
                                <label>
                                    Clé de chiffrement des sauvegardes
                                    <input id="plugin-backup-target-${index}-password" type="password" value="" autocomplete="new-password" placeholder="Laisser vide pour conserver la clé actuelle">
                                    <small>${target.password_configured ? "Clé configurée. Laissez vide pour la conserver." : "Clé absente."} Elle se trouve dans Home Assistant → Paramètres → Système → Sauvegardes.</small>
                                </label>
                                ${target.id === "zwave-01" ? `
                                    <label class="configuration-span-2">
                                        Action Home Assistant optionnelle avant sauvegarde
                                        <input id="plugin-backup-target-${index}-pre-action" type="text" value="${escapeHtml(target.pre_backup_action ? `${target.pre_backup_action.domain}.${target.pre_backup_action.service}` : "")}" placeholder="Laisser vide avec la planification NVM de Z-Wave JS UI">
                                        <small>Recommandé : planifiez la sauvegarde NVM directement dans Z-Wave JS UI avant l’heure HAOS.</small>
                                    </label>
                                ` : ""}
                            </div>
                        </details>
                    </fieldset>
                `).join("")}
            `;
        }

        if (plugin.id === "dhcp") {
            return `
                ${numberField(
                    "plugin-interval-seconds",
                    "Intervalle (secondes)",
                    configuration.interval_seconds ?? 60,
                    'min="1" required',
                )}
                ${numberField(
                    "plugin-timeout",
                    "Délai maximal (secondes)",
                    configuration.timeout ?? 3,
                    'min="0.1" step="0.1" required',
                )}
                <label class="configuration-check">
                    <input id="plugin-dhcp-check-service" type="checkbox" ${configuration.check_service_active !== false ? "checked" : ""}>
                    Vérifier le service dnsmasq
                </label>
                ${numberField(
                    "plugin-dhcp-maximum-pool-usage",
                    "Occupation maximale du pool (%)",
                    configuration.policy?.maximum_pool_usage_percent ?? 90,
                    'min="0.1" max="100" step="0.1" required',
                )}
            `;
        }

        if (plugin.id === "network") {
            return `
                ${common}
                ${numberField(
                    "plugin-network-failure-threshold",
                    "Échecs avant absence",
                    configuration.failure_threshold ?? 3,
                    'min="1" step="1" required',
                )}
            `;
        }

        if (plugin.id === "dns") {
            return `
                <label class="configuration-span-2">
                    Noms à résoudre
                    <input
                        id="plugin-dns-queries"
                        type="text"
                        value="${escapeHtml((configuration.queries ?? []).join(", "))}"
                        placeholder="example.com, ohana.lan"
                        required
                    >
                </label>
                ${common}
                ${numberField(
                    "plugin-dns-minimum-healthy",
                    "Serveurs sains minimum",
                    configuration.policy?.minimum_healthy_servers ?? 1,
                    'min="1" step="1" required',
                )}
            `;
        }

        if (plugin.id === "ntp") {
            return `
                ${common}
                ${numberField(
                    "plugin-ntp-maximum-offset",
                    "Décalage maximal (ms)",
                    configuration.policy?.maximum_offset_ms ?? 1000,
                    'min="0.1" step="0.1" required',
                )}
                ${numberField(
                    "plugin-ntp-maximum-stratum",
                    "Strate maximale",
                    configuration.policy?.maximum_stratum ?? 15,
                    'min="1" max="15" step="1" required',
                )}
            `;
        }

        if (plugin.id === "zwave") {
            return `
                ${common}
                <label class="configuration-check configuration-span-2">
                    <input id="plugin-zwave-verify-tls" type="checkbox" ${configuration.verify_tls !== false ? "checked" : ""}>
                    Vérifier le certificat TLS des connexions WSS
                </label>
                <small class="configuration-span-2">
                    Les services Z-Wave utilisent par défaut le serveur WebSocket sur le port 3000.
                </small>
            `;
        }

        if (plugin.id === "wireguard") {
            const tokenHint = configuration.app_token_configured
                ? "Un jeton Freebox est déjà configuré. Laissez vide pour le conserver."
                : "Autorisez Ohana-Agent sur la Freebox, puis renseignez le jeton obtenu.";

            return `
                ${common}
                <label>
                    Identifiant de l’application
                    <input id="plugin-wireguard-app-id" type="text" value="${escapeHtml(configuration.app_id ?? "fr.ohana.agent")}" required>
                </label>
                <label>
                    Version de l’application
                    <input id="plugin-wireguard-app-version" type="text" value="${escapeHtml(configuration.app_version ?? "1.8.0")}" required>
                </label>
                <label class="configuration-span-2">
                    Jeton d’autorisation Freebox
                    <input id="plugin-wireguard-app-token" type="password" value="" autocomplete="new-password">
                    <small>${escapeHtml(tokenHint)}</small>
                </label>
                <label class="configuration-check configuration-span-2">
                    <input id="plugin-wireguard-verify-tls" type="checkbox" ${configuration.verify_tls ? "checked" : ""}>
                    Vérifier le certificat TLS de Freebox OS
                </label>
            `;
        }

        if (isHomeAssistantTelemetryPlugin(plugin)) {
            const tokenHint = configuration.access_token_configured
                ? "Un jeton Home Assistant est déjà configuré. Laissez vide pour le conserver."
                : "Renseignez un jeton d’accès longue durée Home Assistant ou une variable d’environnement.";
            return `
                ${common}
                <label>
                    URL Home Assistant
                    <input id="plugin-home-assistant-telemetry-url" type="url" value="${escapeHtml(configuration.home_assistant_url ?? "http://ha-green.ohana.lan:8123")}" required>
                </label>
                <label class="configuration-span-2">
                    Jeton Home Assistant
                    <input id="plugin-home-assistant-telemetry-token" type="password" value="" autocomplete="new-password">
                    <small>${escapeHtml(tokenHint)}</small>
                </label>
                <label class="configuration-span-2">
                    Variable d’environnement du jeton
                    <input id="plugin-home-assistant-telemetry-token-environment" type="text" value="${escapeHtml(configuration.access_token_environment_variable ?? "OHANA_HOME_ASSISTANT_TOKEN")}" placeholder="OHANA_HOME_ASSISTANT_TOKEN">
                </label>
                <label class="configuration-check configuration-span-2">
                    <input id="plugin-home-assistant-telemetry-verify-tls" type="checkbox" ${configuration.verify_tls !== false ? "checked" : ""}>
                    Vérifier le certificat TLS de Home Assistant
                </label>
            `;
        }

        if (plugin.id === "teleinformation") {
            const ingestionTokenHint = configuration.ingestion_token_configured
                ? "Un jeton d’ingestion est déjà configuré. Laissez vide pour le conserver."
                : "Utilisez le même jeton dans l’add-on teleinfo2mqtt sur RPI-Linky.";
            const legacyTokenHint = configuration.access_token_configured
                ? "Un jeton Home Assistant historique est configuré."
                : "Uniquement nécessaire pour le mode historique Home Assistant.";
            return `
                ${common}
                <label>
                    Mode de réception
                    <select id="plugin-teleinformation-mode">
                        <option value="direct_http" ${configuration.mode !== "home_assistant" ? "selected" : ""}>HTTP direct depuis teleinfo2mqtt</option>
                        <option value="home_assistant" ${configuration.mode === "home_assistant" ? "selected" : ""}>Home Assistant (historique)</option>
                    </select>
                </label>
                <label>
                    Port d’écoute Agent
                    <input id="plugin-teleinformation-listen-port" type="number" min="1" max="65535" value="${escapeHtml(configuration.listen_port ?? 8770)}" required>
                </label>
                <label>
                    Adresse d’écoute
                    <input id="plugin-teleinformation-listen-host" type="text" value="${escapeHtml(configuration.listen_host ?? "0.0.0.0")}" required>
                </label>
                <label class="configuration-span-2">
                    Jeton d’ingestion RPI-Linky
                    <input id="plugin-teleinformation-ingestion-token" type="password" value="" autocomplete="new-password">
                    <small>${escapeHtml(ingestionTokenHint)}</small>
                </label>
                <label class="configuration-span-2">
                    Variable d’environnement du jeton d’ingestion
                    <input id="plugin-teleinformation-ingestion-token-environment" type="text" value="${escapeHtml(configuration.ingestion_token_environment_variable ?? "OHANA_TELEINFORMATION_INGESTION_TOKEN")}" placeholder="OHANA_TELEINFORMATION_INGESTION_TOKEN">
                </label>
                <p class="configuration-span-2 configuration-help">
                    Endpoint à configurer dans l’add-on :
                    <code>http://infra-01.ohana.lan:${escapeHtml(configuration.listen_port ?? 8770)}/v1/teleinformation/frames</code>
                </p>
                <details class="configuration-span-2 configuration-legacy-fields">
                    <summary>Mode historique Home Assistant</summary>
                    <div class="configuration-form-grid">
                        <label>
                            URL Home Assistant
                            <input id="plugin-teleinformation-home-assistant-url" type="url" value="${escapeHtml(configuration.home_assistant_url ?? "http://ha-green.ohana.lan:8123")}">
                        </label>
                        <label>
                            Jeton Home Assistant
                            <input id="plugin-teleinformation-access-token" type="password" value="" autocomplete="new-password">
                            <small>${escapeHtml(legacyTokenHint)}</small>
                        </label>
                        <label>
                            Variable d’environnement du jeton
                            <input id="plugin-teleinformation-token-environment" type="text" value="${escapeHtml(configuration.access_token_environment_variable ?? "OHANA_HOME_ASSISTANT_TOKEN")}">
                        </label>
                        <label class="configuration-check">
                            <input id="plugin-teleinformation-verify-tls" type="checkbox" ${configuration.verify_tls !== false ? "checked" : ""}>
                            Vérifier le certificat TLS
                        </label>
                    </div>
                </details>
            `;
        }

        if (plugin.id === "mqtt") {
            const authentication =
                configuration.authentication ?? {};
            const tls = configuration.tls ?? {};
            const homeAssistant =
                configuration.home_assistant ?? {};
            const passwordHint =
                authentication.password_configured
                    ? "Un mot de passe est déjà configuré. Laissez vide pour le conserver."
                    : "Laissez vide si aucune authentification n’est requise.";

            return `
                ${common}
                ${numberField(
                    "plugin-mqtt-keepalive",
                    "Keepalive (secondes)",
                    configuration.keepalive_seconds ?? 60,
                    'min="1" step="1" required',
                )}
                <label>
                    QoS
                    <select id="plugin-mqtt-qos">
                        ${[0, 1, 2].map(
                            (qos) => `
                                <option value="${qos}" ${Number(configuration.qos ?? 1) === qos ? "selected" : ""}>
                                    ${qos}
                                </option>
                            `,
                        ).join("")}
                    </select>
                </label>
                <label class="configuration-span-2">
                    Préfixe du client
                    <input id="plugin-mqtt-client-prefix" type="text" value="${escapeHtml(configuration.client_id_prefix ?? "ohana-agent")}" required>
                </label>
                <label class="configuration-span-2">
                    Préfixe du sujet
                    <input id="plugin-mqtt-topic-prefix" type="text" value="${escapeHtml(configuration.topic_prefix ?? "ohana/agent/check")}" required>
                </label>
                <label class="configuration-check configuration-span-2">
                    <input id="plugin-mqtt-ha-enabled" type="checkbox" ${homeAssistant.enabled !== false ? "checked" : ""}>
                    Publier la santé Ohana dans Home Assistant
                </label>
                <label class="configuration-check configuration-span-2">
                    <input id="plugin-mqtt-ha-discovery-enabled" type="checkbox" ${homeAssistant.discovery_enabled !== false ? "checked" : ""}>
                    Activer MQTT Discovery
                </label>
                <label>
                    Préfixe Discovery
                    <input id="plugin-mqtt-ha-discovery-prefix" type="text" value="${escapeHtml(homeAssistant.discovery_prefix ?? "homeassistant")}" required>
                </label>
                <label>
                    Topic racine Ohana
                    <input id="plugin-mqtt-ha-topic-prefix" type="text" value="${escapeHtml(homeAssistant.topic_prefix ?? "ohana")}" required>
                </label>
                ${numberField(
                    "plugin-mqtt-ha-heartbeat",
                    "Battement Home Assistant (secondes)",
                    homeAssistant.heartbeat_seconds ?? 60,
                    'min="1" step="1" required',
                )}
                <small class="configuration-span-2">
                    Publie le score global, l’état, les incidents critiques, les alertes et la fraîcheur des capacités.
                </small>
                <label>
                    Utilisateur
                    <input id="plugin-mqtt-username" type="text" value="${escapeHtml(authentication.username ?? "")}">
                </label>
                <label>
                    Mot de passe
                    <input id="plugin-mqtt-password" type="password" value="" autocomplete="new-password">
                    <small>${escapeHtml(passwordHint)}</small>
                </label>
                <label class="configuration-check">
                    <input id="plugin-mqtt-tls-enabled" type="checkbox" ${tls.enabled ? "checked" : ""}>
                    TLS activé
                </label>
                <label class="configuration-check">
                    <input id="plugin-mqtt-tls-insecure" type="checkbox" ${tls.insecure ? "checked" : ""}>
                    Autoriser un certificat non vérifié
                </label>
                <label class="configuration-span-2">
                    Autorité de certification
                    <input id="plugin-mqtt-ca-file" type="text" value="${escapeHtml(tls.ca_file ?? "")}" placeholder="/etc/ssl/certs/ohana-ca.pem">
                </label>
            `;
        }

        return common;
    },

    pluginConfigurationPayload(plugin) {
        const configuration = structuredClone(
            plugin.configuration ?? {},
        );
        if (plugin.id === "backup") {
            configuration.rclone_remote = `${configuration.icloud?.remote_name ?? "icloud"}:${this.value("plugin-backup-destination-path")}`;
            configuration.infra_01 = {
                ...(plugin.configuration?.infra_01 ?? {}),
                enabled: this.checked("plugin-backup-infra-enabled"),
                schedule: this.backupSchedulePayload("plugin-backup-infra"),
                age_binary: plugin.configuration?.infra_01?.age_binary ?? "/usr/bin/age",
                remote_retention_count: Number(this.value("plugin-backup-infra-retention")),
            };
            delete configuration.infra_01.age_recipient;
            delete configuration.infra_01.backup_in_progress;
            configuration.targets = Array.from(
                document.querySelectorAll("[data-backup-target-index]"),
            ).map((fieldset) => {
                const index = fieldset.dataset.backupTargetIndex;
                const original = (plugin.configuration?.targets ?? [])[index] ?? {};
                const action = this.value(`plugin-backup-target-${index}-pre-action`);
                const [domain, ...serviceParts] = action.split(".");
                const target = {
                    ...original,
                    id: this.value(`plugin-backup-target-${index}-id`),
                    label: this.value(`plugin-backup-target-${index}-label`),
                    enabled: this.checked(`plugin-backup-target-${index}-enabled`),
                    url: this.value(`plugin-backup-target-${index}-url`),
                    token: this.value(`plugin-backup-target-${index}-token`) || null,
                    password: this.value(`plugin-backup-target-${index}-password`) || null,
                    token_environment_variable: original.token_environment_variable ?? null,
                    password_environment_variable: original.password_environment_variable ?? null,
                    schedule: this.backupSchedulePayload(
                        `plugin-backup-target-${index}`,
                    ),
                    verify_tls: this.checked(`plugin-backup-target-${index}-verify-tls`),
                    timeout: Number(this.value(`plugin-backup-target-${index}-timeout`)),
                };
                delete target.token_configured;
                delete target.password_configured;
                if (action) {
                    target.pre_backup_action = {
                        domain,
                        service: serviceParts.join("."),
                        data: original.pre_backup_action?.data ?? {},
                    };
                } else {
                    target.pre_backup_action = null;
                }
                return target;
            });
            return {
                enabled: this.checked("plugin-enabled"),
                configuration,
            };
        }
        configuration.interval_seconds = Number(
            this.value("plugin-interval-seconds"),
        );
        configuration.timeout = Number(
            this.value("plugin-timeout"),
        );

        if (plugin.id === "dhcp") {
            delete configuration.retries;
            configuration.check_service_active =
                this.checked(
                    "plugin-dhcp-check-service",
                );
            configuration.policy = {
                maximum_pool_usage_percent: Number(
                    this.value(
                        "plugin-dhcp-maximum-pool-usage",
                    ),
                ),
            };
        } else {
            configuration.retries = Number(
                this.value("plugin-retries"),
            );
        }

        if (plugin.id === "network") {
            configuration.failure_threshold = Number(
                this.value(
                    "plugin-network-failure-threshold",
                ),
            );
        } else if (plugin.id === "dns") {
            configuration.queries = this.listValue(
                "plugin-dns-queries",
            );
            configuration.policy = {
                minimum_healthy_servers: Number(
                    this.value(
                        "plugin-dns-minimum-healthy",
                    ),
                ),
            };
        } else if (plugin.id === "ntp") {
            configuration.policy = {
                maximum_offset_ms: Number(
                    this.value(
                        "plugin-ntp-maximum-offset",
                    ),
                ),
                maximum_stratum: Number(
                    this.value(
                        "plugin-ntp-maximum-stratum",
                    ),
                ),
            };
        } else if (plugin.id === "zwave") {
            configuration.verify_tls = this.checked(
                "plugin-zwave-verify-tls",
            );
        } else if (plugin.id === "wireguard") {
            configuration.app_id = this.value(
                "plugin-wireguard-app-id",
            );
            configuration.app_version = this.value(
                "plugin-wireguard-app-version",
            );
            configuration.app_token =
                this.value("plugin-wireguard-app-token")
                || null;
            configuration.verify_tls = this.checked(
                "plugin-wireguard-verify-tls",
            );
            delete configuration.app_token_configured;
        } else if (isHomeAssistantTelemetryPlugin(plugin)) {
            configuration.home_assistant_url = this.value(
                "plugin-home-assistant-telemetry-url",
            );
            configuration.access_token =
                this.value("plugin-home-assistant-telemetry-token")
                || null;
            configuration.access_token_environment_variable =
                this.value("plugin-home-assistant-telemetry-token-environment")
                || null;
            configuration.verify_tls = this.checked(
                "plugin-home-assistant-telemetry-verify-tls",
            );
            delete configuration.devices;
            delete configuration.access_token_configured;
        } else if (plugin.id === "teleinformation") {
            configuration.mode = this.value("plugin-teleinformation-mode")
                || "direct_http";
            configuration.listen_host = this.value(
                "plugin-teleinformation-listen-host",
            ) || "0.0.0.0";
            configuration.listen_port = Number(this.value(
                "plugin-teleinformation-listen-port",
            ) || 8770);
            configuration.ingestion_token =
                this.value("plugin-teleinformation-ingestion-token")
                || null;
            configuration.ingestion_token_environment_variable =
                this.value("plugin-teleinformation-ingestion-token-environment")
                || null;
            configuration.home_assistant_url = this.value(
                "plugin-teleinformation-home-assistant-url",
            ) || "http://ha-green.ohana.lan:8123";
            configuration.access_token =
                this.value("plugin-teleinformation-access-token")
                || null;
            configuration.access_token_environment_variable =
                this.value("plugin-teleinformation-token-environment")
                || null;
            configuration.verify_tls = this.checked(
                "plugin-teleinformation-verify-tls",
            );
            delete configuration.access_token_configured;
            delete configuration.ingestion_token_configured;
        } else if (plugin.id === "mqtt") {
            configuration.keepalive_seconds = Number(
                this.value("plugin-mqtt-keepalive"),
            );
            configuration.qos = Number(
                this.value("plugin-mqtt-qos"),
            );
            configuration.client_id_prefix =
                this.value("plugin-mqtt-client-prefix");
            configuration.topic_prefix =
                this.value("plugin-mqtt-topic-prefix");
            configuration.home_assistant = {
                enabled: this.checked(
                    "plugin-mqtt-ha-enabled",
                ),
                discovery_enabled: this.checked(
                    "plugin-mqtt-ha-discovery-enabled",
                ),
                discovery_prefix: this.value(
                    "plugin-mqtt-ha-discovery-prefix",
                ),
                topic_prefix: this.value(
                    "plugin-mqtt-ha-topic-prefix",
                ),
                heartbeat_seconds: Number(
                    this.value(
                        "plugin-mqtt-ha-heartbeat",
                    ),
                ),
            };
            configuration.authentication = {
                username:
                    this.value("plugin-mqtt-username")
                    || null,
                password:
                    this.value("plugin-mqtt-password")
                    || null,
            };
            configuration.tls = {
                enabled: this.checked(
                    "plugin-mqtt-tls-enabled",
                ),
                ca_file:
                    this.value("plugin-mqtt-ca-file")
                    || null,
                insecure: this.checked(
                    "plugin-mqtt-tls-insecure",
                ),
            };
        }

        return {
            enabled: (
                plugin.id === "network"
                || isHomeAssistantTelemetryPlugin(plugin)
                || plugin.id === "teleinformation"
            )
                ? true
                : this.checked("plugin-enabled"),
            configuration,
        };
    },

    async savePluginConfiguration() {
        const plugin = this.selectedPlugin();

        if (
            !plugin
            || !window.confirm(
                `Appliquer la configuration du plugin ${plugin.name} ?`,
            )
        ) {
            return;
        }

        hideError(this.elements.error);

        try {
            const updated = await requestJson(
                API.administrationPlugin(plugin.id),
                {
                    method: "PUT",
                    body: JSON.stringify(
                        this.pluginConfigurationPayload(plugin),
                    ),
                },
            );
            this.plugins = this.plugins.map(
                (item) =>
                    item.id === updated.id
                        ? updated
                        : item,
            );
            this.selectedPluginId = updated.id;
            this.renderPlugins();
            this.showNotice(
                `Plugin ${updated.name} configuré et replanifié par Agent.`,
            );
        } catch (error) {
            showError(
                this.elements.error,
                "Configuration du plugin refusée : "
                + this.errorMessage(error),
            );
        }
    },

    async testSelectedPlugin() {
        const plugin = this.selectedPlugin();

        if (!plugin) {
            return;
        }

        if (this.pluginFormDirty) {
            this.elements.pluginTestResult.innerHTML = `
                <strong>Modifications non appliquées</strong>
                <span>Cliquez sur Appliquer avant de tester la configuration enregistrée.</span>
            `;
            this.elements.pluginTestResult.className =
                "plugin-test-result plugin-test-result--error";
            return;
        }

        hideError(this.elements.error);
        this.elements.pluginTest.disabled = true;
        this.elements.pluginTestResult.textContent =
            "Test en cours…";
        this.elements.pluginTestResult.className =
            "plugin-test-result";

        try {
            const result = await requestJson(
                API.administrationPluginTest(plugin.id),
                {
                    method: "POST",
                },
            );
            const message = result.message
                || (
                    result.success
                        ? "Test réussi."
                        : "Test échoué."
                );
            this.elements.pluginTestResult.innerHTML = `
                <strong>${result.success ? "Test réussi" : "Test échoué"}</strong>
                <span>${escapeHtml(message)}</span>
                <small>${Number(result.latency_ms).toFixed(2)} ms</small>
            `;
            this.elements.pluginTestResult.className =
                `plugin-test-result plugin-test-result--${result.success ? "success" : "error"}`;
        } catch (error) {
            this.elements.pluginTestResult.innerHTML = `
                <strong>Test impossible</strong>
                <span>${escapeHtml(this.errorMessage(error))}</span>
            `;
            this.elements.pluginTestResult.className =
                "plugin-test-result plugin-test-result--error";
        } finally {
            this.elements.pluginTest.disabled = false;
        }
    },

    async connectBackupICloud() {
        const plugin = this.selectedPlugin();
        if (plugin?.id !== "backup") {
            return;
        }
        const icloud = plugin.configuration?.icloud ?? {};
        const requiredFields = icloud.requires_two_factor
            ? [
                {
                    id: "plugin-backup-icloud-two-factor",
                    message: "Renseignez le code 2FA pour valider la connexion iCloud.",
                },
            ]
            : [
                {
                    id: "plugin-backup-icloud-apple-id",
                    message: "Renseignez l'identifiant Apple pour connecter iCloud.",
                },
                {
                    id: "plugin-backup-icloud-password",
                    message: "Renseignez le mot de passe Apple pour connecter iCloud.",
                },
            ];
        const missingField = requiredFields.find(
            (field) => !this.value(field.id).trim(),
        );
        if (missingField) {
            showError(this.elements.error, missingField.message);
            document.getElementById(missingField.id)?.focus();
            return;
        }
        const formDraft = this.captureBackupFormDraft();
        const button = document.getElementById("plugin-backup-icloud-connect");
        if (button) {
            button.disabled = true;
        }
        hideError(this.elements.error);
        try {
            const payload = icloud.requires_two_factor
                ? {
                    two_factor_code: this.value("plugin-backup-icloud-two-factor"),
                }
                : {
                    apple_id: this.value("plugin-backup-icloud-apple-id"),
                    password: this.value("plugin-backup-icloud-password"),
                };
            const result = await requestJson(
                API.administrationBackupICloudConnect,
                {
                    method: "POST",
                    body: JSON.stringify(payload),
                },
            );
            plugin.configuration.icloud = result;
            this.renderPluginInspector();
            this.restoreBackupFormDraft(formDraft);
            this.showNotice(result.message ?? "Configuration iCloud mise à jour.");
        } catch (error) {
            showError(
                this.elements.error,
                "Connexion iCloud refusée : " + this.errorMessage(error),
            );
            if (button) {
                button.disabled = false;
            }
        }
    },

    captureBackupFormDraft() {
        const fields = Array.from(
            document.querySelectorAll(
                "#plugin-enabled, [id^='plugin-backup-']",
            ),
        )
            .filter((element) =>
                element.matches("input, select, textarea")
                && !element.id.startsWith("plugin-backup-icloud-")
            )
            .map((element) => ({
                id: element.id,
                checked: element.matches("input[type='checkbox'], input[type='radio']")
                    ? element.checked
                    : null,
                value: element.value,
            }));
        const expandedTargets = Array.from(
            document.querySelectorAll(
                "[data-backup-target-index] details[open]",
            ),
        ).map((details) => details.closest("[data-backup-target-index]")?.dataset.backupTargetIndex);
        return {
            fields,
            expandedTargets,
            dirty: this.pluginFormDirty,
        };
    },

    restoreBackupFormDraft(draft) {
        for (const field of draft.fields) {
            const element = document.getElementById(field.id);
            if (!element) {
                continue;
            }
            if (field.checked === null) {
                element.value = field.value;
            } else {
                element.checked = field.checked;
            }
        }
        for (const index of draft.expandedTargets) {
            document.querySelector(
                `[data-backup-target-index="${index}"] details`,
            )?.setAttribute("open", "");
        }
        this.pluginFormDirty = Boolean(draft.dirty);
    },

    formatPluginDate(value, fallback = "Jamais") {
        if (!value) {
            return fallback;
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return fallback;
        }

        return new Intl.DateTimeFormat(
            "fr-FR",
            {
                dateStyle: "short",
                timeStyle: "medium",
            },
        ).format(date);
    },
};
