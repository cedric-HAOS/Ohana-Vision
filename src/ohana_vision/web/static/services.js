"use strict";

import {
    API,
    fetchJson,
} from "./api.js";

import {
    deviceIconPath,
    escapeHtml,
    formatDate,
    healthStatusLabel,
    hideError,
    normalizeHealthStatus,
    showError,
} from "./utils.js";

const STATUS_PRIORITY = Object.freeze({
    disabled: -1,
    healthy: 0,
    unknown: 1,
    degraded: 2,
    unhealthy: 3,
});

const SERVICE_TYPE_LABELS = Object.freeze({
    dhcp: "DHCP",
    dns: "DNS",
    home_assistant: "Home Assistant",
    http: "HTTP",
    mqtt: "MQTT",
    network: "Présence réseau",
    ntp: "NTP",
    home_assistant_telemetry: "Télémétrie Home Assistant",
    shelly_telemetry: "Télémétrie Home Assistant",
    teleinformation: "Téléinformation",
    wireguard: "WireGuard",
    zwave: "Z-Wave",
});

/**
 * Render the logical services map from Agent's infrastructure definition.
 */
export class ServicesController {
    constructor({
        state,
        onHostSelected = () => {},
    }) {
        if (!state) {
            throw new Error(
                "ServicesController requires application state.",
            );
        }

        this.state = state;
        this.onHostSelected = onHostSelected;
        this.infrastructure = null;
        this.loaded = false;
        this.loading = false;
        this.selectedServiceId = null;

        this.elements = {
            error: document.querySelector(
                "#services-error",
            ),
            map: document.querySelector(
                "#services-map",
            ),
            visibleCount: document.querySelector(
                "#services-visible-count",
            ),
            healthyCount: document.querySelector(
                "#services-healthy-count",
            ),
            degradedCount: document.querySelector(
                "#services-degraded-count",
            ),
            unavailableCount: document.querySelector(
                "#services-unavailable-count",
            ),
            criticalCount: document.querySelector(
                "#services-critical-count",
            ),
            search: document.querySelector(
                "#services-search",
            ),
            statusFilter: document.querySelector(
                "#services-status-filter",
            ),
            typeFilter: document.querySelector(
                "#services-type-filter",
            ),
            criticalFilter: document.querySelector(
                "#services-critical-filter",
            ),
            inspector: document.querySelector(
                "#service-inspector",
            ),
            inspectorEmpty: document.querySelector(
                "#service-inspector-empty",
            ),
            inspectorContent: document.querySelector(
                "#service-inspector-content",
            ),
            inspectorClose: document.querySelector(
                "#service-inspector-close",
            ),
        };
    }

    /** Bind the map filters and delegated actions. */
    initialize() {
        [
            this.elements.statusFilter,
            this.elements.typeFilter,
            this.elements.criticalFilter,
        ].forEach((control) => {
            control?.addEventListener(
                "change",
                () => this.render(),
            );
        });

        this.elements.search?.addEventListener(
            "input",
            () => this.render(),
        );

        this.elements.map?.addEventListener(
            "click",
            (event) => {
                const hostButton = event.target.closest(
                    "[data-service-host-device]",
                );

                if (hostButton) {
                    this.onHostSelected({
                        deviceId:
                            hostButton.dataset.serviceHostDevice
                            || null,
                        nodeId:
                            hostButton.dataset.serviceHostNode
                            || null,
                    });
                    return;
                }

                const serviceButton = event.target.closest(
                    "[data-service-map-id]",
                );

                if (serviceButton) {
                    this.selectService(
                        serviceButton.dataset.serviceMapId,
                    );
                }
            },
        );

        this.elements.inspectorClose?.addEventListener(
            "click",
            () => this.selectService(null),
        );

        this.elements.inspector?.addEventListener(
            "click",
            (event) => {
                const hostButton = event.target.closest(
                    "[data-service-host-device]",
                );

                if (!hostButton) {
                    return;
                }

                this.onHostSelected({
                    deviceId:
                        hostButton.dataset.serviceHostDevice
                        || null,
                    nodeId:
                        hostButton.dataset.serviceHostNode
                        || null,
                });
            },
        );
    }

    /**
     * Load the Agent-owned infrastructure definition.
     *
     * @param {{force?: boolean}} options
     */
    async load({force = false} = {}) {
        if (this.loading) {
            return;
        }

        if (this.loaded && !force) {
            this.render();
            return;
        }

        this.loading = true;
        this.renderLoading();
        hideError(this.elements.error);

        try {
            const infrastructure = await fetchJson(
                API.administrationInfrastructure,
            );

            this.infrastructure =
                this.normalizeInfrastructure(
                    infrastructure,
                );
            this.loaded = true;
            this.render();
        } catch (error) {
            this.loaded = false;
            this.infrastructure = null;
            this.renderUnavailable();
            showError(
                this.elements.error,
                "Carte des services indisponible : "
                + this.errorMessage(error),
            );
        } finally {
            this.loading = false;
        }
    }

    /** Mark the cached infrastructure as stale without rendering. */
    invalidate() {
        this.loaded = false;
    }

    /** Render the complete logical services map. */
    render() {
        if (!this.elements.map) {
            return;
        }

        if (!this.loaded || !this.infrastructure) {
            if (!this.loading) {
                this.renderUnavailable();
            }
            return;
        }

        const allServices = this.serviceViews();

        this.populateTypeFilter(allServices);
        this.renderSummary(allServices);

        const visibleServices = allServices.filter(
            (service) => this.matchesFilters(service),
        );
        const hosts = this.groupByHost(visibleServices);

        this.elements.visibleCount.textContent =
            `${visibleServices.length} sur ${allServices.length}`;

        if (visibleServices.length === 0) {
            this.elements.map.innerHTML = `
                <div class="services-empty-state">
                    <img
                        alt=""
                        src="/ui/assets/icons/empty-states/search-x.svg"
                    >
                    <h3>Aucun service correspondant</h3>
                    <p>
                        Modifiez les filtres pour afficher les
                        services déclarés dans l’architecture.
                    </p>
                </div>
            `;
            this.refreshInspector(allServices);
            return;
        }

        this.elements.map.innerHTML = hosts
            .map((host) => this.renderHost(host))
            .join("");

        this.refreshInspector(allServices);
    }

    /** Display a loading placeholder without rebuilding other views. */
    renderLoading() {
        if (!this.elements.map) {
            return;
        }

        this.elements.map.innerHTML = `
            <div class="services-empty-state">
                <span
                    aria-hidden="true"
                    class="services-loading-indicator"
                ></span>
                <h3>Chargement des services…</h3>
                <p>Lecture de l’architecture détenue par Ohana-Agent.</p>
            </div>
        `;
    }

    /** Display the page-level unavailable state. */
    renderUnavailable() {
        if (!this.elements.map) {
            return;
        }

        this.elements.visibleCount.textContent = "—";
        [
            this.elements.healthyCount,
            this.elements.degradedCount,
            this.elements.unavailableCount,
            this.elements.criticalCount,
        ].forEach((element) => {
            if (element) {
                element.textContent = "—";
            }
        });

        this.elements.map.innerHTML = `
            <div class="services-empty-state services-empty-state--error">
                <img
                    alt=""
                    src="/ui/assets/icons/empty-states/server-crash.svg"
                >
                <h3>Architecture indisponible</h3>
                <p>
                    La liste des services sera affichée dès que
                    l’administration d’Ohana-Agent répondra.
                </p>
            </div>
        `;
        this.selectedServiceId = null;
        this.elements.inspectorEmpty?.removeAttribute(
            "hidden",
        );
        this.elements.inspectorContent?.setAttribute(
            "hidden",
            "",
        );
        this.elements.inspector?.classList.remove(
            "has-selection",
        );
    }

    /**
     * Normalize both administration and ingestion field names.
     *
     * @param {unknown} payload
     * @returns {object}
     */
    normalizeInfrastructure(payload) {
        const value = payload && typeof payload === "object"
            ? payload
            : {};
        const topology = value.topology
            && typeof value.topology === "object"
            ? value.topology
            : {};

        return {
            ...value,
            nodes: Array.isArray(value.nodes)
                ? value.nodes
                : [],
            services: Array.isArray(value.services)
                ? value.services
                : [],
            topology: {
                ...topology,
                devices: Array.isArray(topology.devices)
                    ? topology.devices
                    : [],
            },
        };
    }

    /**
     * Build one display model for every declared service.
     *
     * @returns {Array<object>}
     */
    serviceViews() {
        const observations = Array.isArray(
            this.state.observations,
        )
            ? this.state.observations
            : [];

        return this.infrastructure.services
            .map((service) => {
                const serviceId = String(
                    service.id
                    ?? service.service_id
                    ?? "",
                );
                const nodeId = String(
                    service.node
                    ?? service.node_id
                    ?? "",
                );
                const enabled = service.enabled !== false;
                const observedCapabilityStates =
                    this.latestCapabilityStates(
                        observations,
                        serviceId,
                        nodeId,
                    );
                const timelineService = this.timelineService(
                    serviceId,
                    nodeId,
                );
                const observedByCapability = new Map(
                    observedCapabilityStates.map((capability) => [
                        capability.id,
                        capability.observation,
                    ]),
                );
                const timelineCapabilityStates = Array.isArray(
                    timelineService?.capabilities,
                )
                    ? timelineService.capabilities.map((capability) => {
                        const capabilityId = String(
                            capability.capability_id ?? "capability",
                        );

                        return {
                            id: capabilityId,
                            status: this.currentStatus(
                                capability.periods,
                            ),
                            observation:
                                observedByCapability.get(capabilityId)
                                ?? null,
                        };
                    })
                    : [];
                const capabilityStates =
                    timelineCapabilityStates.length > 0
                        ? timelineCapabilityStates
                        : observedCapabilityStates;
                const status = enabled
                    ? timelineService
                        ? this.currentStatus(timelineService.periods)
                        : this.aggregateStatus(
                            capabilityStates.map(
                                (capability) => capability.status,
                            ),
                        )
                    : "disabled";
                const host = this.resolveHost(nodeId);
                const latestObservation = capabilityStates
                    .map((capability) => capability.observation)
                    .filter(Boolean)
                    .sort((first, second) => {
                        return this.timestamp(
                            second.observed_at,
                        ) - this.timestamp(
                            first.observed_at,
                        );
                    })[0] ?? null;
                const anomalyCount = capabilityStates.filter(
                    (capability) => {
                        return capability.status === "degraded"
                            || capability.status === "unhealthy";
                    },
                ).length;

                return {
                    id: serviceId,
                    name: String(service.name ?? serviceId),
                    type: String(service.type ?? "service"),
                    nodeId,
                    port: service.port ?? null,
                    implementation:
                        service.implementation ?? null,
                    enabled,
                    critical: service.critical === true,
                    metadata:
                        service.metadata
                        && typeof service.metadata === "object"
                            ? service.metadata
                            : {},
                    status,
                    capabilityStates,
                    capabilityCount: capabilityStates.length,
                    anomalyCount,
                    latestObservation,
                    lastObservedAt:
                        latestObservation?.observed_at
                        ?? null,
                    host,
                };
            })
            .sort((first, second) => {
                return first.host.label.localeCompare(
                    second.host.label,
                    "fr",
                )
                    || first.name.localeCompare(
                        second.name,
                        "fr",
                    );
            });
    }

    /** Return the timeline entry used by the equipment details panel. */
    timelineService(serviceId, nodeId) {
        const nodes = this.state.timeline?.nodes ?? [];
        const node = Array.isArray(nodes)
            ? nodes.find((candidate) => {
                return String(candidate.node_id ?? "") === nodeId;
            })
            : nodes[nodeId];
        const services = Array.isArray(node?.services)
            ? node.services
            : [];

        return services.find((service) => {
            return String(service.service_id ?? "") === serviceId;
        }) ?? null;
    }

    /** Resolve the current status exactly like the equipment details panel. */
    currentStatus(periods) {
        if (!Array.isArray(periods)) {
            return "unknown";
        }

        const openPeriod = periods.find(
            (period) => !period.ended_at,
        );

        if (openPeriod?.status) {
            return normalizeHealthStatus(openPeriod.status);
        }

        const latestPeriod = periods
            .slice()
            .sort((first, second) => {
                return this.timestamp(second.started_at)
                    - this.timestamp(first.started_at);
            })[0];

        return normalizeHealthStatus(
            latestPeriod?.status ?? "unknown",
        );
    }

    /**
     * Keep only the most recent observation per capability.
     *
     * @param {Array<object>} observations
     * @param {string} serviceId
     * @param {string} nodeId
     * @returns {Array<object>}
     */
    latestCapabilityStates(
        observations,
        serviceId,
        nodeId,
    ) {
        const latest = new Map();

        observations.forEach((observation) => {
            if (
                String(observation.service_id ?? "")
                    !== serviceId
                || String(observation.node_id ?? "")
                    !== nodeId
            ) {
                return;
            }

            const capabilityId = String(
                observation.capability_id ?? "capability",
            );
            const current = latest.get(capabilityId);

            if (
                !current
                || this.timestamp(observation.observed_at)
                    >= this.timestamp(current.observed_at)
            ) {
                latest.set(
                    capabilityId,
                    observation,
                );
            }
        });

        return Array.from(latest.entries())
            .map(([capabilityId, observation]) => {
                return {
                    id: capabilityId,
                    status: normalizeHealthStatus(
                        observation.status,
                    ),
                    observation,
                };
            })
            .sort((first, second) => {
                return (
                    STATUS_PRIORITY[second.status]
                    - STATUS_PRIORITY[first.status]
                ) || first.id.localeCompare(
                    second.id,
                    "fr",
                );
            });
    }

    /**
     * Resolve the topology equipment hosting one node.
     *
     * @param {string} nodeId
     * @returns {object}
     */
    resolveHost(nodeId) {
        const devices = this.infrastructure.topology.devices;
        const device = devices.find((candidate) => {
            return String(
                candidate.node
                ?? candidate.node_id
                ?? "",
            ) === nodeId;
        });
        const node = this.infrastructure.nodes.find(
            (candidate) => {
                return String(
                    candidate.id
                    ?? candidate.node_id
                    ?? "",
                ) === nodeId;
            },
        );
        const metadata = device?.metadata
            && typeof device.metadata === "object"
            ? device.metadata
            : {};

        return {
            deviceId: String(
                device?.id
                ?? device?.device_id
                ?? "",
            ),
            nodeId,
            label: String(
                device?.label
                ?? node?.name
                ?? nodeId
                ?? "Équipement inconnu",
            ),
            kind: String(
                device?.kind
                ?? "server",
            ),
            role: String(
                metadata.role
                ?? "Hôte de services",
            ),
            address: String(
                device?.address
                ?? node?.endpoint?.address
                ?? "",
            ),
        };
    }

    /**
     * Group visible services by host equipment.
     *
     * @param {Array<object>} services
     * @returns {Array<object>}
     */
    groupByHost(services) {
        const groups = new Map();

        services.forEach((service) => {
            const key = service.host.deviceId
                || service.nodeId;
            const existing = groups.get(key) ?? {
                ...service.host,
                services: [],
            };

            existing.services.push(service);
            groups.set(key, existing);
        });

        return Array.from(groups.values())
            .map((host) => {
                return {
                    ...host,
                    status: this.aggregateStatus(
                        host.services
                            .filter((service) => service.enabled)
                            .map((service) => service.status),
                    ),
                };
            })
            .sort((first, second) => {
                return first.label.localeCompare(
                    second.label,
                    "fr",
                );
            });
    }

    /** Render one equipment group. */
    renderHost(host) {
        const status = host.status;
        const serviceCount = host.services.length;
        const deviceId = escapeHtml(host.deviceId);
        const nodeId = escapeHtml(host.nodeId);

        return `
            <article
                class="services-host services-host--${escapeHtml(status)}"
                data-services-host-node="${nodeId}"
            >
                <header class="services-host__header">
                    <div
                        aria-hidden="true"
                        class="services-host__icon"
                        style="--services-host-icon:url('${deviceIconPath(host.kind)}')"
                    ></div>
                    <div class="services-host__identity">
                        <button
                            class="services-host__name"
                            data-service-host-device="${deviceId}"
                            data-service-host-node="${nodeId}"
                            type="button"
                        >
                            ${escapeHtml(host.label)}
                        </button>
                        <span>
                            ${escapeHtml(
                                host.address || host.role,
                            )}
                        </span>
                    </div>
                    <span
                        aria-label="État ${escapeHtml(
                            healthStatusLabel(status),
                        )}"
                        class="services-host__status services-host__status--${escapeHtml(status)}"
                        title="${escapeHtml(
                            healthStatusLabel(status),
                        )}"
                    ></span>
                </header>

                <div class="services-host__meta">
                    <span>
                        ${serviceCount} service${serviceCount > 1 ? "s" : ""}
                    </span>
                    <span>
                        ${escapeHtml(
                            this.humanize(host.role),
                        )}
                    </span>
                </div>

                <div class="services-host__services">
                    ${host.services
                        .map((service) => {
                            return this.renderService(service);
                        })
                        .join("")}
                </div>
            </article>
        `;
    }

    /** Render one service inside its host. */
    renderService(service) {
        const status = service.status;
        const selected =
            this.selectedServiceId === service.id;
        const typeToken = this.cssToken(service.type);
        const observationSummary = service.capabilityCount > 0
            ? `${service.capabilityCount} capacité${service.capabilityCount > 1 ? "s" : ""}`
            : "Aucune observation";
        const stateSummary = status === "disabled"
            ? "Désactivé"
            : healthStatusLabel(status);

        return `
            <button
                class="service-map-item
                    service-map-item--${escapeHtml(status)}
                    ${selected ? "is-selected" : ""}"
                data-service-map-id="${escapeHtml(service.id)}"
                type="button"
            >
                <span
                    aria-hidden="true"
                    class="service-map-item__icon
                        service-map-item__icon--${escapeHtml(typeToken)}"
                ></span>

                <span class="service-map-item__content">
                    <span class="service-map-item__heading">
                        <strong>${escapeHtml(service.name)}</strong>
                        ${service.critical
                            ? `<span class="service-criticality">Critique</span>`
                            : ""
                        }
                    </span>
                    <span class="service-map-item__type">
                        ${escapeHtml(
                            this.serviceTypeLabel(service.type),
                        )}
                        ${service.port
                            ? ` · ${escapeHtml(service.port)}`
                            : ""
                        }
                    </span>
                    <span class="service-map-item__observation">
                        ${escapeHtml(observationSummary)}
                        ${service.anomalyCount > 0
                            ? ` · ${service.anomalyCount} en anomalie`
                            : ""
                        }
                    </span>
                </span>

                <span class="service-map-item__state">
                    <span
                        aria-hidden="true"
                        class="service-map-item__indicator"
                    ></span>
                    ${escapeHtml(stateSummary)}
                </span>
            </button>
        `;
    }

    /** Render the summary counters above the map. */
    renderSummary(services) {
        const enabled = services.filter(
            (service) => service.enabled,
        );
        const healthy = enabled.filter(
            (service) => service.status === "healthy",
        ).length;
        const degraded = enabled.filter(
            (service) => service.status === "degraded",
        ).length;
        const unavailable = enabled.filter(
            (service) => service.status === "unhealthy",
        ).length;
        const critical = enabled.filter((service) => {
            return service.critical
                && (
                    service.status === "degraded"
                    || service.status === "unhealthy"
                );
        }).length;

        this.elements.healthyCount.textContent = String(healthy);
        this.elements.degradedCount.textContent = String(degraded);
        this.elements.unavailableCount.textContent = String(unavailable);
        this.elements.criticalCount.textContent = String(critical);
    }

    /** Keep the type filter synchronized with the architecture. */
    populateTypeFilter(services) {
        const select = this.elements.typeFilter;

        if (!select) {
            return;
        }

        const current = select.value;
        const types = Array.from(
            new Set(
                services.map((service) => service.type),
            ),
        ).sort((first, second) => {
            return this.serviceTypeLabel(first)
                .localeCompare(
                    this.serviceTypeLabel(second),
                    "fr",
                );
        });

        select.innerHTML = [
            `<option value="all">Tous les types</option>`,
            ...types.map((type) => {
                return `
                    <option value="${escapeHtml(type)}">
                        ${escapeHtml(
                            this.serviceTypeLabel(type),
                        )}
                    </option>
                `;
            }),
        ].join("");

        select.value = types.includes(current)
            ? current
            : "all";
    }

    /** Return whether one service matches current filters. */
    matchesFilters(service) {
        const query = String(
            this.elements.search?.value ?? "",
        ).trim().toLocaleLowerCase("fr");
        const status =
            this.elements.statusFilter?.value
            ?? "all";
        const type =
            this.elements.typeFilter?.value
            ?? "all";
        const critical =
            this.elements.criticalFilter?.value
            ?? "all";
        const haystack = [
            service.id,
            service.name,
            service.type,
            this.serviceTypeLabel(service.type),
            service.host.label,
            service.host.address,
            service.implementation,
        ].join(" ").toLocaleLowerCase("fr");

        return (
            (!query || haystack.includes(query))
            && (status === "all" || service.status === status)
            && (type === "all" || service.type === type)
            && (
                critical === "all"
                || (
                    critical === "critical"
                    && service.critical
                )
                || (
                    critical === "standard"
                    && !service.critical
                )
            )
        );
    }

    /** Select one service and render its detail inspector. */
    selectService(serviceId) {
        this.selectedServiceId = serviceId || null;
        this.render();
    }

    /** Keep the inspector synchronized with the selected service. */
    refreshInspector(services) {
        const service = services.find(
            (candidate) => {
                return candidate.id === this.selectedServiceId;
            },
        );

        if (!service) {
            this.selectedServiceId = null;
            this.elements.inspectorEmpty?.removeAttribute(
                "hidden",
            );
            this.elements.inspectorContent?.setAttribute(
                "hidden",
                "",
            );
            this.elements.inspector?.classList.remove(
                "has-selection",
            );
            return;
        }

        this.elements.inspectorEmpty?.setAttribute(
            "hidden",
            "",
        );
        this.elements.inspectorContent?.removeAttribute(
            "hidden",
        );
        this.elements.inspector?.classList.add(
            "has-selection",
        );
        this.elements.inspectorContent.innerHTML =
            this.renderInspector(service);
    }

    /** Render the service inspector content. */
    renderInspector(service) {
        const statusLabel = service.status === "disabled"
            ? "Désactivé"
            : healthStatusLabel(service.status);
        const endpoint = [
            service.host.address,
            service.port,
        ].filter(Boolean).join(":") || "—";
        const capabilities = service.capabilityStates.length > 0
            ? service.capabilityStates.map((capability) => {
                const observation = capability.observation;
                return `
                    <li class="service-inspector__capability">
                        <span
                            aria-hidden="true"
                            class="service-inspector__capability-indicator
                                service-inspector__capability-indicator--${escapeHtml(
                                    capability.status,
                                )}"
                        ></span>
                        <div>
                            <strong>${escapeHtml(capability.id)}</strong>
                            <span>
                                ${escapeHtml(
                                    formatDate(observation.observed_at),
                                )}
                            </span>
                        </div>
                        <span>
                            ${escapeHtml(
                                healthStatusLabel(capability.status),
                            )}
                        </span>
                    </li>
                `;
            }).join("")
            : `
                <li class="service-inspector__empty-capability">
                    Aucune observation reçue pour ce service.
                </li>
            `;

        return `
            <div class="service-inspector__hero">
                <div
                    aria-hidden="true"
                    class="service-inspector__icon
                        service-map-item__icon--${escapeHtml(
                            this.cssToken(service.type),
                        )}"
                ></div>
                <div>
                    <p>${escapeHtml(
                        this.serviceTypeLabel(service.type),
                    )}</p>
                    <h3>${escapeHtml(service.name)}</h3>
                    <span>${escapeHtml(service.id)}</span>
                </div>
            </div>

            <div class="service-inspector__state service-inspector__state--${escapeHtml(service.status)}">
                <span aria-hidden="true"></span>
                <strong>${escapeHtml(statusLabel)}</strong>
                ${service.critical
                    ? `<em>Capacité critique</em>`
                    : `<em>Service standard</em>`
                }
            </div>

            <dl class="service-inspector__properties">
                <div>
                    <dt>Équipement hôte</dt>
                    <dd>${escapeHtml(service.host.label)}</dd>
                </div>
                <div>
                    <dt>Adresse</dt>
                    <dd>${escapeHtml(endpoint)}</dd>
                </div>
                <div>
                    <dt>Implémentation</dt>
                    <dd>${escapeHtml(
                        service.implementation || "—",
                    )}</dd>
                </div>
                <div>
                    <dt>Dernière observation</dt>
                    <dd>${escapeHtml(
                        formatDate(service.lastObservedAt),
                    )}</dd>
                </div>
            </dl>

            <section class="service-inspector__section">
                <div class="service-inspector__section-heading">
                    <h4>Capacités observées</h4>
                    <span>${service.capabilityCount}</span>
                </div>
                <ul class="service-inspector__capabilities">
                    ${capabilities}
                </ul>
            </section>

            <button
                class="service-inspector__host-action"
                data-service-host-device="${escapeHtml(
                    service.host.deviceId,
                )}"
                data-service-host-node="${escapeHtml(
                    service.nodeId,
                )}"
                type="button"
            >
                Voir l’équipement dans Infrastructure
            </button>
        `;
    }

    /** Aggregate a list of normalized health statuses. */
    aggregateStatus(statuses) {
        if (statuses.length === 0) {
            return "unknown";
        }

        return statuses.reduce((worst, status) => {
            const normalized = status === "disabled"
                ? "disabled"
                : normalizeHealthStatus(status);

            return STATUS_PRIORITY[normalized]
                > STATUS_PRIORITY[worst]
                ? normalized
                : worst;
        }, "healthy");
    }

    /** Return a localized service type label. */
    serviceTypeLabel(type) {
        return SERVICE_TYPE_LABELS[type]
            ?? this.humanize(type);
    }

    /** Make identifiers readable without inventing business labels. */
    humanize(value) {
        const normalized = String(value ?? "")
            .replaceAll("_", " ")
            .replaceAll("-", " ")
            .trim();

        if (!normalized) {
            return "Service";
        }

        return normalized.charAt(0).toLocaleUpperCase("fr")
            + normalized.slice(1);
    }

    /** Return a safe CSS suffix. */
    cssToken(value) {
        return String(value ?? "service")
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, "-")
            .replaceAll("_", "-");
    }

    /** Convert an ISO date to a sortable number. */
    timestamp(value) {
        const timestamp = new Date(String(value ?? "")).getTime();

        return Number.isFinite(timestamp)
            ? timestamp
            : 0;
    }

    /** Normalize a caught error. */
    errorMessage(error) {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }
}
