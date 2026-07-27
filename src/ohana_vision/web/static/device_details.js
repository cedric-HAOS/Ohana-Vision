"use strict";

import {
    escapeHtml,
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
            node: document.querySelector(
                "#device-details-node",
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
            this.elements.node,
            device.node_id
                ?? "Non supervisé",
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
        const icons = {
            internet: `
                <svg
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                >
                    <circle
                        cx="16"
                        cy="16"
                        r="12"
                    ></circle>
                    <path
                        d="M16 4c-5 5-5 19 0 24"
                    ></path>
                    <path
                        d="M16 4c5 5 5 19 0 24"
                    ></path>
                    <path d="M5 11h22"></path>
                    <path d="M5 21h22"></path>
                </svg>
            `,
            router: `
                <svg
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                >
                    <rect
                        x="4"
                        y="12"
                        width="24"
                        height="13"
                        rx="3"
                    ></rect>
                    <path d="M9 12V5"></path>
                    <path d="M23 12V5"></path>
                    <circle
                        cx="11"
                        cy="19"
                        r="1.5"
                    ></circle>
                    <circle
                        cx="17"
                        cy="19"
                        r="1.5"
                    ></circle>
                </svg>
            `,
            switch: `
                <svg
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                >
                    <rect
                        x="3"
                        y="8"
                        width="26"
                        height="17"
                        rx="3"
                    ></rect>
                    <rect
                        x="7"
                        y="14"
                        width="3"
                        height="4"
                    ></rect>
                    <rect
                        x="12"
                        y="14"
                        width="3"
                        height="4"
                    ></rect>
                    <rect
                        x="17"
                        y="14"
                        width="3"
                        height="4"
                    ></rect>
                    <rect
                        x="22"
                        y="14"
                        width="3"
                        height="4"
                    ></rect>
                </svg>
            `,
            access_point: `
                <svg
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                >
                    <circle
                        cx="16"
                        cy="25"
                        r="2"
                    ></circle>
                    <path
                        d="M11 21a7 7 0 0 1 10 0"
                    ></path>
                    <path
                        d="M7 17a12 12 0 0 1 18 0"
                    ></path>
                    <path
                        d="M3 13a18 18 0 0 1 26 0"
                    ></path>
                </svg>
            `,
            raspberry_pi: `
                <svg
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                >
                    <rect
                        x="5"
                        y="5"
                        width="22"
                        height="22"
                        rx="4"
                    ></rect>
                    <path
                        d="M10 10h12v12H10z"
                    ></path>
                    <path
                        d="M2 9h3M2 16h3M2 23h3"
                    ></path>
                    <path
                        d="M27 9h3M27 16h3M27 23h3"
                    ></path>
                </svg>
            `,
            home_assistant: `
                <svg
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                >
                    <path
                        d="
                            M4 15
                            16 5
                            l12 10
                            v13
                            h-8
                            v-8
                            h-8
                            v8
                            H4z
                        "
                    ></path>
                </svg>
            `,
            camera: `
                <svg
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                >
                    <rect
                        x="4"
                        y="9"
                        width="24"
                        height="16"
                        rx="3"
                    ></rect>
                    <circle
                        cx="16"
                        cy="17"
                        r="5"
                    ></circle>
                    <path
                        d="M12 25v3h8"
                    ></path>
                </svg>
            `,
            storage: `
                <svg
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                >
                    <path
                        d="
                            M5 8
                            c0-5 22-5 22 0
                            v16
                            c0 5-22 5-22 0z
                        "
                    ></path>
                    <path
                        d="M5 8c0 5 22 5 22 0"
                    ></path>
                    <path
                        d="M5 16c0 5 22 5 22 0"
                    ></path>
                </svg>
            `,
            solar: `
                <svg
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                >
                    <circle
                        cx="16"
                        cy="16"
                        r="6"
                    ></circle>
                    <path
                        d="M16 3v5M16 24v5"
                    ></path>
                    <path
                        d="M3 16h5M24 16h5"
                    ></path>
                    <path
                        d="m7 7 4 4M21 21l4 4"
                    ></path>
                    <path
                        d="m25 7-4 4M11 21l-4 4"
                    ></path>
                </svg>
            `,
        };

        return (
            icons[kind]
            ?? `
                <svg
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                >
                    <rect
                        x="5"
                        y="5"
                        width="22"
                        height="22"
                        rx="5"
                    ></rect>
                </svg>
            `
        );
    }

    setText(element, value) {
        if (!element) {
            return;
        }

        element.textContent =
            String(value ?? "—");
    }
}