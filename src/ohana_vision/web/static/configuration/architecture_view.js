"use strict";

import {
    deviceIconPath,
    escapeHtml,
} from "../utils.js";

import {
    ARCHITECTURE_MINIMUM_COLUMNS,
    ARCHITECTURE_MINIMUM_ROWS,
} from "./shared.js";

/**
 * ConfigurationController methods: Architecture grid rendering, viewport and drag & drop.
 */
export const ArchitectureViewMethods = {
    renderArchitecture() {
        if (
            !this.infrastructure
            || !this.elements.architectureBoard
        ) {
            return;
        }

        this.ensureTopology();
        this.renderDiscoveredDevices();
        const topology =
            this.infrastructure.topology;
        const layout = this.architectureLayout();
        const nodesById = new Map(
            this.infrastructure.nodes.map(
                (node) => [node.id, node],
            ),
        );
        const servicesByNode = new Map();

        this.infrastructure.services.forEach(
            (service) => {
                const services =
                    servicesByNode.get(service.node)
                    ?? [];
                services.push(service);
                servicesByNode.set(
                    service.node,
                    services,
                );
            },
        );

        const maximumColumn = Math.max(
            ARCHITECTURE_MINIMUM_COLUMNS - 1,
            ...Object.values(layout.positions)
                .map((position) => position.column),
        );
        const maximumRow = Math.max(
            ARCHITECTURE_MINIMUM_ROWS - 1,
            ...Object.values(layout.positions)
                .map((position) => position.row),
        );
        const columnCount = maximumColumn + 1;
        const rowCount = maximumRow + 1;
        const cellWidth = 240;
        const cellHeight = 150;
        const deviceCards = topology.devices.map(
            (device) => {
                const position =
                    layout.positions[device.id];
                const node =
                    nodesById.get(device.node);
                const services =
                    servicesByNode.get(
                        device.node,
                    ) ?? [];
                const selected =
                    this.selectedArchitectureItem
                        ?.mode === "device"
                    && this.selectedArchitectureItem
                        .id === device.id;
                const pending =
                    this.pendingLinkSource
                        === device.id;
                const serviceSummary = services.length
                    ? `${services.length} service${services.length > 1 ? "s" : ""}`
                    : "Aucun service";

                return `
                    <button
                        aria-label="${escapeHtml(device.label)}, ${escapeHtml(serviceSummary)}"
                        class="architecture-map-device ${selected ? "is-selected" : ""} ${pending ? "is-link-source" : ""}"
                        data-architecture-device="${escapeHtml(device.id)}"
                        draggable="${this.architectureInteractionMode === "move"}"
                        style="grid-column:${position.column + 1};grid-row:${position.row + 1}"
                        type="button"
                    >
                        <span class="architecture-map-device__icon" aria-hidden="true" style="--architecture-device-icon:url('${deviceIconPath(device.kind)}')"></span>
                        <strong>${escapeHtml(device.label)}</strong>
                        <small>${escapeHtml(node?.endpoint?.address ?? device.address ?? device.kind)}</small>
                        <span class="architecture-map-device__services">${escapeHtml(serviceSummary)}</span>
                    </button>
                `;
            },
        );
        const linkLines = topology.links.map(
            (link) => {
                const source =
                    layout.positions[link.source];
                const target =
                    layout.positions[link.target];

                if (!source || !target) {
                    return "";
                }

                const selected =
                    this.selectedArchitectureItem
                        ?.mode === "link"
                    && this.selectedArchitectureItem
                        .id === link.id;
                const visualKind =
                    this.architectureLinkVisualKind(
                        link,
                    );
                const x1 =
                    source.column * cellWidth
                    + cellWidth / 2;
                const y1 =
                    source.row * cellHeight
                    + cellHeight / 2;
                const x2 =
                    target.column * cellWidth
                    + cellWidth / 2;
                const y2 =
                    target.row * cellHeight
                    + cellHeight / 2;

                return `
                    <g
                        aria-label="${escapeHtml(link.label ?? link.id)}"
                        class="architecture-map-link ${selected ? "is-selected" : ""}"
                        data-architecture-link="${escapeHtml(link.id)}"
                        role="button"
                        tabindex="0"
                    >
                        <line class="architecture-map-link__hitbox" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>
                        <line class="architecture-map-link__line architecture-map-link__line--${escapeHtml(visualKind)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>
                    </g>
                `;
            },
        );

        this.elements.architectureBoard
            .innerHTML = `
                <div
                    class="architecture-map"
                    data-architecture-columns="${columnCount}"
                    data-architecture-rows="${rowCount}"
                    style="--architecture-columns:${columnCount};--architecture-rows:${rowCount}"
                >
                    <svg
                        aria-label="Liaisons de l’architecture"
                        class="architecture-map__links"
                        preserveAspectRatio="none"
                        role="img"
                        viewBox="0 0 ${columnCount * cellWidth} ${rowCount * cellHeight}"
                    >
                        ${linkLines.join("")}
                    </svg>
                    <div class="architecture-map__grid">
                        ${deviceCards.join("") || "<p class=\"empty-state\">Aucun équipement déclaré.</p>"}
                    </div>
                </div>
            `;

        this.applyArchitectureViewport();
        if (!this.architectureViewportInitialized) {
            window.requestAnimationFrame(() => {
                this.fitArchitectureViewport();
            });
        }

        this.updateArchitectureModeControls();
        this.populateNodeOptions();
        this.populateDeviceOptions();
    },

    discoveredDevicesToPosition() {
        if (!this.infrastructure || !this.liveTopology) {
            return [];
        }

        this.ensureTopology();
        const declaredDeviceIds = new Set(
            this.infrastructure.topology.devices.map(
                (device) => device.id,
            ),
        );

        return (this.liveTopology.devices ?? [])
            .filter((device) => (
                device.metadata?.managed_by
                    === "zwave_discovery"
                && !declaredDeviceIds.has(
                    device.device_id,
                )
            ));
    },

    renderDiscoveredDevices() {
        const count =
            this.discoveredDevicesToPosition().length;
        const visible = count > 0;

        if (this.elements.architectureDiscoveryNotice) {
            this.elements.architectureDiscoveryNotice.hidden =
                !visible;
        }

        if (this.elements.architectureDiscoveryCount) {
            this.elements.architectureDiscoveryCount.textContent =
                `${count} équipement${count > 1 ? "s" : ""} à positionner`;
        }

        if (this.elements.architecturePositionDiscovered) {
            this.elements.architecturePositionDiscovered.disabled =
                !visible;
        }
    },

    positionDiscoveredDevices() {
        const discovered =
            this.discoveredDevicesToPosition();

        if (discovered.length === 0) {
            return;
        }

        const topology = this.infrastructure.topology;
        const discoveredIds = new Set(
            discovered.map((device) => device.device_id),
        );

        discovered.forEach((device) => {
            topology.devices.push({
                id: device.device_id,
                label: device.label,
                kind: device.kind,
                node: device.node_id ?? null,
                address: device.address ?? null,
                metadata: {
                    ...(device.metadata ?? {}),
                },
            });
        });

        const declaredDeviceIds = new Set(
            topology.devices.map((device) => device.id),
        );
        const declaredLinkIds = new Set(
            topology.links.map((link) => link.id),
        );
        const discoveredLinks = (
            this.liveTopology.links ?? []
        ).filter((link) => (
            link.metadata?.managed_by
                === "zwave_discovery"
            && (
                discoveredIds.has(link.source_device_id)
                || discoveredIds.has(link.target_device_id)
            )
            && declaredDeviceIds.has(link.source_device_id)
            && declaredDeviceIds.has(link.target_device_id)
            && !declaredLinkIds.has(link.link_id)
        ));

        discoveredLinks.forEach((link) => {
            topology.links.push({
                id: link.link_id,
                source: link.source_device_id,
                target: link.target_device_id,
                kind: link.kind,
                direction: link.direction,
                label: link.label ?? null,
                bandwidth_mbps:
                    link.bandwidth_mbps ?? null,
                metadata: {
                    ...(link.metadata ?? {}),
                },
            });
        });

        this.positionDevicesAroundGateway(
            [...discoveredIds],
            discoveredLinks,
        );
        this.renderArchitecture();
        this.showNotice(
            `${discovered.length} équipement${discovered.length > 1 ? "s" : ""} `
            + "positionné"
            + `${discovered.length > 1 ? "s" : ""}. `
            + "Appliquez l’architecture pour conserver ce placement.",
        );
    },

    positionDevicesAroundGateway(deviceIds, links) {
        const layout = this.architectureLayout();

        deviceIds.forEach((deviceId) => {
            delete layout.positions[deviceId];
        });

        const occupied = new Set(
            Object.values(layout.positions).map(
                (position) =>
                    `${position.column}:${position.row}`,
            ),
        );
        const gatewayId = links
            .map((link) => (
                deviceIds.includes(link.source_device_id)
                    ? link.target_device_id
                    : link.source_device_id
            ))
            .find((deviceId) => layout.positions[deviceId]);
        const anchor = layout.positions[gatewayId] ?? {
            column: 0,
            row: 0,
        };
        const candidates = [];

        for (
            let radius = 1;
            candidates.length < deviceIds.length;
            radius += 1
        ) {
            for (
                let rowOffset = -radius;
                rowOffset <= radius;
                rowOffset += 1
            ) {
                for (
                    let columnOffset = -radius;
                    columnOffset <= radius;
                    columnOffset += 1
                ) {
                    if (
                        Math.max(
                            Math.abs(columnOffset),
                            Math.abs(rowOffset),
                        ) !== radius
                    ) {
                        continue;
                    }

                    const column =
                        anchor.column + columnOffset;
                    const row = anchor.row + rowOffset;
                    const key = `${column}:${row}`;

                    if (
                        column < 0
                        || row < 0
                        || occupied.has(key)
                    ) {
                        continue;
                    }

                    candidates.push({ column, row });
                    occupied.add(key);

                    if (
                        candidates.length
                            === deviceIds.length
                    ) {
                        break;
                    }
                }

                if (
                    candidates.length
                        === deviceIds.length
                ) {
                    break;
                }
            }
        }

        deviceIds.forEach((deviceId, index) => {
            layout.positions[deviceId] =
                candidates[index];
        });
    },

    serviceCard(service) {
        const selected =
            this.selectedArchitectureItem
                ?.mode === "service"
            && this.selectedArchitectureItem
                .id === service.id;

        return `
            <button
                class="architecture-service ${selected ? "is-selected" : ""}"
                data-architecture-service="${escapeHtml(service.id)}"
                data-service-type="${escapeHtml(service.type)}"
                type="button"
            >
                <strong>${escapeHtml(service.name)}</strong>
                <small>${escapeHtml(service.implementation ?? service.type)}${service.port ? ` · port ${escapeHtml(String(service.port))}` : ""}${service.critical ? " · critique" : ""}</small>
            </button>
        `;
    },

    handleArchitectureClick(event) {
        if (this.architecturePanMoved) {
            this.architecturePanMoved = false;
            return;
        }

        const element = event.target.closest(
            "[data-architecture-device], "
            + "[data-architecture-service], "
            + "[data-architecture-link]",
        );

        if (!element) {
            return;
        }

        if (element.dataset.architectureDevice) {
            if (
                this.architectureInteractionMode
                    === "link"
            ) {
                this.selectLinkEndpoint(
                    element.dataset
                        .architectureDevice,
                );
                return;
            }

            this.editDevice(
                element.dataset.architectureDevice,
            );
        } else if (
            element.dataset.architectureService
        ) {
            this.editService(
                element.dataset.architectureService,
            );
        } else {
            this.editLink(
                element.dataset.architectureLink,
            );
        }
    },

    applyArchitectureViewport() {
        const map = this.elements.architectureBoard
            ?.querySelector(".architecture-map");

        if (!map) {
            return;
        }

        const {scale, x, y} =
            this.architectureViewport;
        map.style.transform =
            `translate(${x}px, ${y}px) scale(${scale})`;
    },

    fitArchitectureViewport() {
        const board = this.elements.architectureBoard;
        const map = board?.querySelector(
            ".architecture-map",
        );

        if (!board || !map) {
            return;
        }

        map.style.transform = "none";
        const boardBounds = board.getBoundingClientRect();
        const mapWidth = map.offsetWidth;
        const mapHeight = map.offsetHeight;
        const devices = [
            ...map.querySelectorAll(
                ".architecture-map-device",
            ),
        ];

        if (
            boardBounds.width <= 0
            || boardBounds.height <= 0
            || mapWidth <= 0
            || mapHeight <= 0
        ) {
            this.applyArchitectureViewport();
            return;
        }

        const content = devices.length
            ? {
                x: Math.min(
                    ...devices.map((device) =>
                        device.offsetLeft,
                    ),
                ),
                y: Math.min(
                    ...devices.map((device) =>
                        device.offsetTop,
                    ),
                ),
                right: Math.max(
                    ...devices.map((device) =>
                        device.offsetLeft
                        + device.offsetWidth,
                    ),
                ),
                bottom: Math.max(
                    ...devices.map((device) =>
                        device.offsetTop
                        + device.offsetHeight,
                    ),
                ),
            }
            : {
                x: 0,
                y: 0,
                right: mapWidth,
                bottom: mapHeight,
            };
        const contentWidth =
            content.right - content.x;
        const contentHeight =
            content.bottom - content.y;
        const padding = 48;
        const scale = Math.min(
            (boardBounds.width - padding * 2)
                / contentWidth,
            (boardBounds.height - padding * 2)
                / contentHeight,
            1,
        );
        const boundedScale = Math.max(0.35, scale);

        this.architectureViewport = {
            scale: boundedScale,
            x: (
                boardBounds.width
                - contentWidth * boundedScale
            ) / 2
                - content.x * boundedScale,
            y: (
                boardBounds.height
                - contentHeight * boundedScale
            ) / 2
                - content.y * boundedScale,
        };
        this.architectureViewportInitialized = true;
        this.applyArchitectureViewport();
    },

    zoomArchitecture(factor, clientPoint = null) {
        const board = this.elements.architectureBoard;

        if (!board) {
            return;
        }

        const bounds = board.getBoundingClientRect();
        const point = clientPoint ?? {
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
        };
        const localX = point.x - bounds.left;
        const localY = point.y - bounds.top;
        const previous = this.architectureViewport;
        const scale = Math.min(
            3,
            Math.max(0.35, previous.scale * factor),
        );
        const appliedFactor = scale / previous.scale;

        this.architectureViewport = {
            scale,
            x: localX
                - (localX - previous.x)
                * appliedFactor,
            y: localY
                - (localY - previous.y)
                * appliedFactor,
        };
        this.architectureViewportInitialized = true;
        this.applyArchitectureViewport();
    },

    handleArchitectureWheel(event) {
        if (
            !this.elements.architectureBoard
                ?.querySelector(".architecture-map")
        ) {
            return;
        }

        event.preventDefault();
        this.zoomArchitecture(
            event.deltaY < 0 ? 1.2 : 1 / 1.2,
            {
                x: event.clientX,
                y: event.clientY,
            },
        );
    },

    handleArchitecturePointerDown(event) {
        if (
            event.button !== 0
            || event.target.closest(
                "[data-architecture-device], "
                + "[data-architecture-service], "
                + "[data-architecture-link], button, input, select",
            )
        ) {
            return;
        }

        this.architecturePanning = true;
        this.architecturePanMoved = false;
        this.architecturePanStart = {
            clientX: event.clientX,
            clientY: event.clientY,
            x: this.architectureViewport.x,
            y: this.architectureViewport.y,
        };
        this.elements.architectureBoard
            .setPointerCapture(event.pointerId);
        this.elements.architectureBoard
            .classList.add("is-panning");
    },

    handleArchitecturePointerMove(event) {
        if (
            !this.architecturePanning
            || !this.architecturePanStart
        ) {
            return;
        }

        const deltaX =
            event.clientX
            - this.architecturePanStart.clientX;
        const deltaY =
            event.clientY
            - this.architecturePanStart.clientY;

        if (Math.hypot(deltaX, deltaY) > 3) {
            this.architecturePanMoved = true;
        }

        this.architectureViewport = {
            ...this.architectureViewport,
            x: this.architecturePanStart.x + deltaX,
            y: this.architecturePanStart.y + deltaY,
        };
        this.architectureViewportInitialized = true;
        this.applyArchitectureViewport();
    },

    handleArchitecturePointerUp(event) {
        if (!this.architecturePanning) {
            return;
        }

        this.architecturePanning = false;
        this.architecturePanStart = null;
        if (
            this.elements.architectureBoard
                .hasPointerCapture(event.pointerId)
        ) {
            this.elements.architectureBoard
                .releasePointerCapture(event.pointerId);
        }
        this.elements.architectureBoard
            .classList.remove("is-panning");
    },

    setArchitectureMode(mode) {
        this.architectureInteractionMode = mode;
        this.pendingLinkSource = null;
        this.updateArchitectureModeControls();
        this.renderArchitecture();
    },

    updateArchitectureModeControls() {
        const linkMode =
            this.architectureInteractionMode === "link";
        this.elements.architectureModeMove
            ?.classList.toggle(
                "is-active",
                !linkMode,
            );
        this.elements.architectureModeLink
            ?.classList.toggle(
                "is-active",
                linkMode,
            );
        this.elements.architectureModeMove
            ?.setAttribute(
                "aria-pressed",
                String(!linkMode),
            );
        this.elements.architectureModeLink
            ?.setAttribute(
                "aria-pressed",
                String(linkMode),
            );

        if (!this.elements.architectureModeStatus) {
            return;
        }

        if (!linkMode) {
            this.elements.architectureModeStatus
                .textContent =
                    "Mode Déplacer : faites glisser "
                    + "un équipement vers une case.";
        } else if (this.pendingLinkSource) {
            const source =
                this.infrastructure.topology.devices
                    .find(
                        (device) =>
                            device.id
                            === this.pendingLinkSource,
                    );
            this.elements.architectureModeStatus
                .textContent =
                    `${source?.label ?? this.pendingLinkSource} sélectionné : choisissez l’équipement de destination.`;
        } else {
            this.elements.architectureModeStatus
                .textContent =
                    "Mode Relier : sélectionnez "
                    + "l’équipement source, puis "
                    + "la destination.";
        }
    },

    selectLinkEndpoint(deviceId) {
        if (!this.pendingLinkSource) {
            this.pendingLinkSource = deviceId;
            this.renderArchitecture();
            return;
        }

        if (this.pendingLinkSource === deviceId) {
            this.pendingLinkSource = null;
            this.renderArchitecture();
            return;
        }

        const source = this.pendingLinkSource;
        this.pendingLinkSource = null;
        const existingLink =
            this.infrastructure.topology.links.find(
                (link) =>
                    (
                        link.source === source
                        && link.target === deviceId
                    )
                    || (
                        link.source === deviceId
                        && link.target === source
                    ),
            );

        if (existingLink) {
            this.editLink(existingLink.id);
            this.showNotice(
                "Cette liaison existe déjà : "
                + "vous pouvez la modifier.",
            );
            return;
        }

        const id = this.uniqueId(
            `${source}-${deviceId}`,
            this.infrastructure.topology.links,
        );
        this.infrastructure.topology.links.push({
            id,
            source,
            target: deviceId,
            kind: "ethernet",
            direction: "bidirectional",
            label: null,
            bandwidth_mbps: null,
            metadata: {},
        });
        this.editLink(id);
        this.showNotice(
            "Liaison créée. Précisez ses "
            + "caractéristiques puis appliquez "
            + "l’architecture.",
        );
    },

    handleArchitectureDragStart(event) {
        const device = event.target.closest(
            "[data-architecture-device]",
        );

        if (
            !device
            || this.architectureInteractionMode
                !== "move"
        ) {
            event.preventDefault();
            return;
        }

        this.draggedArchitectureDevice =
            device.dataset.architectureDevice;
        event.dataTransfer?.setData(
            "text/plain",
            this.draggedArchitectureDevice,
        );
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
        }
        device.classList.add("is-dragging");
    },

    handleArchitectureDragOver(event) {
        if (
            this.architectureInteractionMode === "move"
            && this.draggedArchitectureDevice
        ) {
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
            }
        }
    },

    handleArchitectureDrop(event) {
        if (
            this.architectureInteractionMode !== "move"
            || !this.draggedArchitectureDevice
        ) {
            return;
        }

        const map = event.target.closest(
            ".architecture-map",
        );

        if (!map) {
            return;
        }

        event.preventDefault();
        const bounds = map.getBoundingClientRect();
        const columnCount = Number(
            map.dataset.architectureColumns,
        );
        const rowCount = Number(
            map.dataset.architectureRows,
        );
        const column = Math.min(
            columnCount - 1,
            Math.max(
                0,
                Math.floor(
                    (
                        event.clientX - bounds.left
                    ) / bounds.width * columnCount,
                ),
            ),
        );
        const row = Math.min(
            rowCount - 1,
            Math.max(
                0,
                Math.floor(
                    (
                        event.clientY - bounds.top
                    ) / bounds.height * rowCount,
                ),
            ),
        );
        this.moveArchitectureDevice(
            this.draggedArchitectureDevice,
            column,
            row,
        );
        this.draggedArchitectureDevice = null;
    },

    moveArchitectureDevice(deviceId, column, row) {
        const layout = this.architectureLayout();
        const previous = layout.positions[deviceId];
        const occupant = Object.entries(
            layout.positions,
        ).find(
            ([otherId, position]) =>
                otherId !== deviceId
                && position.column === column
                && position.row === row,
        );

        if (occupant && previous) {
            layout.positions[occupant[0]] = {
                column: previous.column,
                row: previous.row,
            };
        }

        layout.positions[deviceId] = {
            column,
            row,
        };
        this.renderArchitecture();
        this.showNotice(
            "Position modifiée. Appliquez "
            + "l’architecture pour la conserver.",
        );
    },
};
