"use strict";

import {
    deviceIconPath,
    escapeHtml,
    formatDate,
    formatLatency,
    healthStatusLabel,
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
    }

    initialize() {
        this.elements.close?.addEventListener(
            "click",
            () => {
                this.close();
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
                Boolean(device.node_id);

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
