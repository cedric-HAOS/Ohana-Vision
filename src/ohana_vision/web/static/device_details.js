"use strict";

import {
    API,
    fetchJson,
    requestJson,
} from "./api.js";
import {
    deviceIconPath,
    escapeHtml,
    formatDate,
    formatLatency,
    healthStatusLabel,
    isDeviceSupervised,
} from "./utils.js";

/**
 * Controls the selected-device details panel.
 */
export class DeviceDetailsController {
    constructor({
        state,
        onSelectionChanged = () => {},
    }) {
        if (!state) {
            throw new Error(
                "DeviceDetailsController requires application state.",
            );
        }

        this.state = state;
        this.onSelectionChanged =
            onSelectionChanged;

        this.elements = {
            panel: document.querySelector(
                "#device-details",
            ),
            close: document.querySelector(
                "#device-details-close",
            ),
            backup: document.querySelector(
                "#device-details-backup",
            ),
            backupStatus: document.querySelector(
                "#device-details-backup-status",
            ),
            backupProgress: document.querySelector(
                "#device-details-backup-progress",
            ),
            title: document.querySelector(
                "#device-details-title",
            ),
            kind: document.querySelector(
                "#device-details-kind",
            ),
            health: document.querySelector(
                "#device-details-health",
            ),
            healthLabel: document.querySelector(
                "#device-details-health-label",
            ),
            id: document.querySelector(
                "#device-details-id",
            ),
            address: document.querySelector(
                "#device-details-address",
            ),
            role: document.querySelector(
                "#device-details-role",
            ),
            servicesCount: document.querySelector(
                "#device-services-count",
            ),
            servicesList: document.querySelector(
                "#device-services-list",
            ),
            linksCount: document.querySelector(
                "#device-links-count",
            ),
            linksList: document.querySelector(
                "#device-links-list",
            ),
            icon: document.querySelector(
                "#device-details-icon",
            ),
            primary: document.querySelector(
                "#device-details-primary",
            ),
            supervision: document.querySelector(
                "#device-details-supervision",
            ),
            presenceSection: document.querySelector(
                "#device-presence-section",
            ),
            presenceStatus: document.querySelector(
                "#device-presence-status",
            ),
            presenceMessage: document.querySelector(
                "#device-presence-message",
            ),
            presenceObservedAt: document.querySelector(
                "#device-presence-observed-at",
            ),
            presenceMethod: document.querySelector(
                "#device-presence-method",
            ),
            presenceLatency: document.querySelector(
                "#device-presence-latency",
            ),
            presenceFailures: document.querySelector(
                "#device-presence-failures",
            ),
        };

        this.handleKeydown =
            this.handleKeydown.bind(this);
        this.backupTarget = null;
        this.backupSelectionGeneration = 0;
        this.backupProgressTimer = null;
    }

    initialize() {
        this.elements.close?.addEventListener(
            "click",
            () => {
                this.close();
            },
        );
        this.elements.backup?.addEventListener(
            "click",
            () => {
                void this.runBackup();
            },
        );

        document.addEventListener(
            "keydown",
            this.handleKeydown,
        );
    }

    select(deviceId) {
        if (!this.state.topology) {
            return false;
        }

        const device = this.deviceById(
            deviceId,
        );

        if (!device) {
            this.close();
            return false;
        }

        this.state.selectedDeviceId =
            deviceId;

        this.onSelectionChanged(
            deviceId,
        );

        this.render(device);
        void this.loadBackupTarget(device);

        return true;
    }

    refresh() {
        const deviceId =
            this.state.selectedDeviceId;

        if (!deviceId) {
            return;
        }

        this.select(deviceId);
    }

    close() {
        this.backupSelectionGeneration += 1;
        this.clearBackupProgressTimer();
        this.hideBackupAction();
        this.state.selectedDeviceId = null;

        this.onSelectionChanged(null);

        this.elements.panel?.classList.add(
            "hidden",
        );

        this.elements.panel?.setAttribute(
            "aria-hidden",
            "true",
        );
    }

    handleKeydown(event) {
        if (event.key === "Escape") {
            this.close();
        }
    }

    render(device) {
        const health =
            this.state.deviceHealth[
                device.device_id
            ]
            ?? "unknown";

        if (this.elements.icon) {
            this.elements.icon.className =
                "device-details__icon "
                + `device-details__icon--${device.kind}`;

            this.elements.icon.innerHTML =
                this.deviceIconMarkup(
                    device.kind,
                );
        }

        if (this.elements.primary) {
            this.elements.primary.textContent =
                this.primaryDeviceDetail(
                    device,
                );
        }

        if (this.elements.supervision) {
            const isSupervised =
                isDeviceSupervised(
                    device,
                    this.state.observations ?? [],
                );

            this.elements.supervision.textContent =
                isSupervised
                    ? "Supervisé"
                    : "Non supervisé";

            this.elements.supervision.className =
                "device-details__supervision "
                + (
                    isSupervised
                        ? (
                            "device-details__supervision"
                            + "--active"
                        )
                        : (
                            "device-details__supervision"
                            + "--inactive"
                        )
                );
        }

        this.setText(
            this.elements.title,
            device.label,
        );

        this.setText(
            this.elements.kind,
            this.formatDeviceKind(
                device.kind,
            ),
        );

        this.setText(
            this.elements.id,
            device.device_id,
        );

        this.setText(
            this.elements.address,
            device.address ?? "—",
        );

        this.setText(
            this.elements.role,
            this.metadataValue(
                device,
                "role",
            ),
        );

        if (this.elements.health) {
            this.elements.health.className =
                "device-details__health "
                + `device-details__health--${health}`;
        }

        this.setText(
            this.elements.healthLabel,
            healthStatusLabel(health),
        );

        this.renderPresence(device);
        this.renderServices(device);
        this.renderLinks(device);

        this.elements.panel?.classList.remove(
            "hidden",
        );

        this.elements.panel?.setAttribute(
            "aria-hidden",
            "false",
        );
    }

    async loadBackupTarget(
        device,
        {keepProgress = false} = {},
    ) {
        const generation =
            ++this.backupSelectionGeneration;
        this.clearBackupProgressTimer();
        if (!keepProgress) {
            this.hideBackupAction();
        }

        try {
            const plugin = await fetchJson(
                API.administrationPlugin("backup"),
            );
            if (
                generation
                !== this.backupSelectionGeneration
                || this.state.selectedDeviceId
                !== device.device_id
            ) {
                return;
            }

            const targets = Array.isArray(
                plugin?.configuration?.targets,
            )
                ? plugin.configuration.targets
                : [];
            const target = targets.find(
                (candidate) => (
                    candidate?.id
                    === device.device_id
                ),
            );

            if (!plugin?.enabled || !target?.enabled) {
                this.hideBackupAction();
                return;
            }

            this.backupTarget = target;
            if (target.backup_in_progress === true) {
                this.showBackupInProgress(device);
                this.scheduleBackupProgressRefresh(device);
                return;
            }

            this.hideBackupAction();
            this.backupTarget = target;
            if (this.elements.backup) {
                this.elements.backup.classList.remove(
                    "hidden",
                );
                this.elements.backup.disabled = false;
                this.elements.backup.setAttribute(
                    "aria-label",
                    `Déclencher immédiatement une sauvegarde HAOS de ${device.label}`,
                );
                this.elements.backup.title =
                    `Cible Sauvegardes HAOS : ${target.id}`;
            }
        } catch {
            if (keepProgress) {
                this.scheduleBackupProgressRefresh(device);
            } else {
                this.hideBackupAction();
            }
        }
    }

    async runBackup() {
        const target = this.backupTarget;
        const device = this.deviceById(
            this.state.selectedDeviceId,
        );
        if (!target || !device) {
            return;
        }

        if (!window.confirm(
            `Déclencher maintenant une sauvegarde complète de ${device.label} ?`,
        )) {
            return;
        }

        this.elements.backup.disabled = true;
        this.setBackupStatus(
            `Démarrage de la sauvegarde ${device.label}…`,
            "pending",
        );
        try {
            await requestJson(
                API.administrationBackupRun(target.id),
                {method: "POST"},
            );
            this.showBackupInProgress(device);
            this.scheduleBackupProgressRefresh(device);
        } catch (error) {
            this.setBackupStatus(
                `Impossible de démarrer la sauvegarde : ${error.message}`,
                "error",
            );
        } finally {
            if (
                this.backupTarget?.id
                === target.id
                && this.elements.backup
                && this.elements.backupProgress
                    ?.classList.contains("hidden")
            ) {
                this.elements.backup.disabled = false;
            }
        }
    }

    hideBackupAction() {
        this.backupTarget = null;
        this.elements.backup?.classList.add("hidden");
        if (this.elements.backup) {
            this.elements.backup.disabled = true;
        }
        this.elements.backupProgress?.classList.add(
            "hidden",
        );
        this.elements.backupStatus?.classList.add(
            "hidden",
        );
        this.elements.backupStatus?.removeAttribute(
            "data-status",
        );
        this.setText(this.elements.backupStatus, "");
    }

    showBackupInProgress(device) {
        this.elements.backup?.classList.add("hidden");
        if (this.elements.backup) {
            this.elements.backup.disabled = true;
        }
        this.elements.backupProgress?.classList.remove(
            "hidden",
        );
        this.elements.backupProgress?.setAttribute(
            "aria-label",
            `Sauvegarde HAOS de ${device.label} en cours`,
        );
        this.elements.backupStatus?.classList.add(
            "hidden",
        );
    }

    scheduleBackupProgressRefresh(device) {
        this.clearBackupProgressTimer();
        this.backupProgressTimer = window.setTimeout(
            () => {
                if (
                    this.state.selectedDeviceId
                    === device.device_id
                ) {
                    void this.loadBackupTarget(
                        device,
                        {keepProgress: true},
                    );
                }
            },
            3000,
        );
    }

    clearBackupProgressTimer() {
        if (this.backupProgressTimer !== null) {
            window.clearTimeout(
                this.backupProgressTimer,
            );
            this.backupProgressTimer = null;
        }
    }

    setBackupStatus(message, status) {
        this.setText(
            this.elements.backupStatus,
            message,
        );
        this.elements.backupStatus?.classList.remove(
            "hidden",
        );
        this.elements.backupStatus?.setAttribute(
            "data-status",
            status,
        );
    }

    renderPresence(device) {
        const presence =
            this.state.devicePresence[
                device.device_id
            ];
        const isAddressable = Boolean(
            device.address
            || presence?.address,
        );
        const isEnabled =
            device.metadata
                ?.network_presence_enabled !== false;

        this.elements.presenceSection
            ?.classList.toggle(
                "hidden",
                !isAddressable,
            );

        if (!isAddressable) {
            return;
        }

        const status = isEnabled
            ? this.normalizePresenceStatus(
                presence?.status,
            )
            : "disabled";

        if (this.elements.presenceStatus) {
            this.elements.presenceStatus.className =
                "device-details__presence-status "
                + `device-details__presence-status--${status}`;
        }

        this.setText(
            this.elements.presenceStatus,
            this.presenceStatusLabel(status),
        );
        this.setText(
            this.elements.presenceMessage,
            isEnabled
                ? (
                    presence?.message
                    ?? this.presenceFallbackMessage(
                        status,
                    )
                )
                : (
                    "La surveillance de présence "
                    + "est désactivée pour cet équipement."
                ),
        );
        this.setText(
            this.elements.presenceObservedAt,
            isEnabled
                ? formatDate(
                    presence?.observed_at,
                )
                : "—",
        );
        this.setText(
            this.elements.presenceMethod,
            isEnabled
                ? this.presenceMethodLabel(
                    presence?.method,
                )
                : "—",
        );
        this.setText(
            this.elements.presenceLatency,
            isEnabled
                ? formatLatency(
                    presence?.latency_ms,
                )
                : "—",
        );
        this.setText(
            this.elements.presenceFailures,
            isEnabled
                ? this.presenceFailureLabel(
                    presence,
                )
                : "—",
        );
    }

    normalizePresenceStatus(status) {
        const normalized = String(
            status ?? "unknown",
        ).toLowerCase();

        return [
            "present",
            "absent",
            "unknown",
            "disabled",
        ].includes(normalized)
            ? normalized
            : "unknown";
    }

    presenceStatusLabel(status) {
        const labels = {
            present: "Présent",
            absent: "Absent",
            unknown: "Inconnu",
            disabled: "Non surveillée",
        };

        return labels[
            this.normalizePresenceStatus(status)
        ];
    }

    presenceFallbackMessage(status) {
        const messages = {
            present: "L’équipement répond sur le réseau.",
            absent: "L’équipement ne répond plus après confirmation.",
            unknown: "Aucune présence fiable n’est encore confirmée.",
        };

        return messages[
            this.normalizePresenceStatus(status)
        ];
    }

    presenceMethodLabel(method) {
        if (!method) {
            return "—";
        }

        const labels = {
            icmp: "ICMP",
            arp: "ARP",
            "icmp+arp": "ICMP + ARP",
        };
        const normalized = String(
            method,
        ).toLowerCase();

        return labels[normalized]
            ?? String(method).toUpperCase();
    }

    presenceFailureLabel(presence) {
        const failures = Number(
            presence?.consecutive_failures,
        );
        const threshold = Number(
            presence?.failure_threshold,
        );

        if (!Number.isFinite(failures)) {
            return "—";
        }

        if (!Number.isFinite(threshold)) {
            return String(failures);
        }

        return `${failures} / ${threshold}`;
    }

    renderServices(device) {
        const services = this.servicesForDevice(
            device,
        );

        this.setText(
            this.elements.servicesCount,
            services.length,
        );

        if (!this.elements.servicesList) {
            return;
        }

        if (services.length === 0) {
            this.elements.servicesList.innerHTML = `
                <li class="device-details__empty">
                    Aucun service observé.
                </li>
            `;
            return;
        }

        this.elements.servicesList.innerHTML =
            services.map((service) => {
                const status = this.currentStatus(
                    service.periods,
                );
                const capabilities =
                    service.capabilities ?? [];
                const details = [
                    service.service_id,
                    service.type,
                    capabilities.length
                        ? `${capabilities.length} capacité${capabilities.length > 1 ? "s" : ""}`
                        : null,
                ].filter(Boolean).join(" · ");

                return `
                    <li class="device-details__service">
                        <div>
                            <strong>${escapeHtml(service.name ?? service.service_id)}</strong>
                            <span>${escapeHtml(details)}</span>
                        </div>
                        <small class="device-details__service-status device-details__service-status--${escapeHtml(status)}">
                            ${escapeHtml(healthStatusLabel(status))}
                        </small>
                    </li>
                `;
            }).join("");
    }

    servicesForDevice(device) {
        if (!device.node_id) {
            return [];
        }

        const configuredServices = Array.isArray(
            device.metadata?.services,
        )
            ? device.metadata.services
            : [];
        const nodes = this.state.timeline?.nodes ?? [];
        const node = Array.isArray(nodes)
            ? nodes.find(
                (candidate) =>
                    candidate.node_id
                    === device.node_id,
            )
            : nodes[device.node_id];
        const observedServices = Array.isArray(
            node?.services,
        )
            ? node.services
            : [];
        const observedById = new Map(
            observedServices.map((service) => [
                service.service_id,
                service,
            ]),
        );

        if (configuredServices.length > 0) {
            return configuredServices.map(
                (service) => ({
                    ...service,
                    ...(
                        observedById.get(
                            service.service_id,
                        ) ?? {}
                    ),
                }),
            );
        }

        return observedServices;
    }

    currentStatus(periods) {
        if (!Array.isArray(periods)) {
            return "unknown";
        }

        const openPeriod = periods.find(
            (period) => !period.ended_at,
        );

        if (openPeriod?.status) {
            return openPeriod.status;
        }

        const latestPeriod = periods
            .slice()
            .sort((first, second) => {
                return new Date(
                    second.started_at,
                ).getTime() - new Date(
                    first.started_at,
                ).getTime();
            })[0];

        return latestPeriod?.status ?? "unknown";
    }

    renderLinks(device) {
        const links = this.linksForDevice(
            device.device_id,
        );

        this.setText(
            this.elements.linksCount,
            links.length,
        );

        if (!this.elements.linksList) {
            return;
        }

        if (links.length === 0) {
            this.elements.linksList.innerHTML = `
                <li class="device-details__empty">
                    Aucune connexion déclarée.
                </li>
            `;
            return;
        }

        this.elements.linksList.innerHTML =
            links
                .map((link) => {
                    return this.renderLink(
                        device,
                        link,
                    );
                })
                .join("");
    }

    renderLink(device, link) {
        const neighborId =
            this.neighborForLink(
                link,
                device.device_id,
            );

        const neighbor =
            this.deviceById(
                neighborId,
            );

        const neighborLabel =
            neighbor?.label
            ?? neighborId;

        const neighborKind =
            this.formatDeviceKind(
                neighbor?.kind
                ?? "other",
            );

        const linkLabel =
            link.label
            ?? this.formatDeviceKind(
                link.kind,
            );

        const direction =
            link.source_device_id
            === device.device_id
                ? "sortant"
                : "entrant";

        return `
            <li class="device-details__link">
                <div
                    class="device-details__link-icon"
                    data-kind="${escapeHtml(
                        neighbor?.kind
                        ?? "other",
                    )}"
                >
                    ${this.deviceIconMarkup(
                        neighbor?.kind
                        ?? "other",
                    )}
                </div>

                <div
                    class="device-details__link-content"
                >
                    <strong>
                        ${escapeHtml(
                            neighborLabel,
                        )}
                    </strong>

                    <span>
                        ${escapeHtml(
                            neighborKind,
                        )}
                    </span>
                </div>

                <div
                    class="device-details__link-meta"
                >
                    <span>
                        ${escapeHtml(
                            linkLabel,
                        )}
                    </span>

                    <small>
                        ${escapeHtml(
                            direction,
                        )}
                    </small>
                </div>
            </li>
        `;
    }

    linksForDevice(deviceId) {
        return (
            this.state.topology?.links
            ?? []
        ).filter((link) => {
            return (
                link.source_device_id
                === deviceId
                || link.target_device_id
                === deviceId
            );
        });
    }

    neighborForLink(link, deviceId) {
        if (
            link.source_device_id
            === deviceId
        ) {
            return link.target_device_id;
        }

        return link.source_device_id;
    }

    deviceById(deviceId) {
        return (
            this.state.topology?.devices
            ?? []
        ).find((device) => {
            return (
                device.device_id
                === deviceId
            );
        });
    }

    metadataValue(device, key) {
        return (
            device.metadata?.[key]
            ?? "—"
        );
    }

    primaryDeviceDetail(device) {
        return (
            device.address
            ?? device.node_id
            ?? device.device_id
        );
    }

    formatDeviceKind(kind) {
        const labels = {
            internet: "Internet",
            router: "Passerelle",
            switch: "Switch",
            access_point: "Point d’accès",
            server: "Serveur",
            raspberry_pi: "Raspberry Pi",
            home_assistant: "Home Assistant",
            camera: "Caméra",
            smart_device: "Objet connecté",
            zwave_module: "Module Z-Wave",
            solar: "Solaire",
            computer: "Ordinateur",
            storage: "Stockage",
            other: "Équipement",
        };

        return (
            labels[kind]
            ?? String(
                kind ?? "Équipement",
            )
        );
    }

    deviceIconMarkup(kind) {
        return `
            <span
                aria-hidden="true"
                class="device-details__official-icon"
                style="--device-details-icon:url('${deviceIconPath(kind)}')"
            ></span>
        `;
    }

    setText(element, value) {
        if (!element) {
            return;
        }

        element.textContent =
            String(value ?? "—");
    }
}
