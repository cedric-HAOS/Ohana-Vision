"use strict";

class TopologyCanvas {
    static SVG_NAMESPACE = "http://www.w3.org/2000/svg";

    static DEVICE_WIDTH = 220;

    static DEVICE_HEIGHT = 128;

    static COMPACT_DEVICE_WIDTH = 124;

    static COMPACT_DEVICE_HEIGHT = 98;

    static DEVICE_LABEL_MAX_WIDTH = 128;

    static COMPACT_DEVICE_LABEL_MAX_WIDTH = 104;

    static DEVICE_LABEL_MIN_FONT_SIZE = 13;

    static MIN_ZOOM = 0.55;

    static MAX_ZOOM = 3;

    static ZOOM_STEP = 1.2;

    static ROUTE_CLEARANCE = 28;

    static ROUTE_LEAD = 52;

    static ROUTE_CORNER_RADIUS = 26;

    static ROUTE_LANE_GAP = 18;

    constructor({
        container,
        layoutLabel,
        showError,
        hideError,
        onDeviceSelected,
    }) {
        if (!container) {
            throw new Error(
                "TopologyCanvas requires a container element.",
            );
        }

        this.onDeviceSelected = onDeviceSelected;
        this.selectedDeviceId = null;

        this.svg = null;
        this.initialViewBox = null;
        this.viewBox = null;

        this.dragging = false;
        this.dragStart = null;
        this.dragViewBoxStart = null;
        this.activePointers = new Map();
        this.pinchDistance = null;

        this.container = container;
        this.layoutLabel = layoutLabel;
        this.showError = showError;
        this.hideError = hideError;

        this.topology = null;
        this.layout = null;
        this.deviceIndex = new Map();
        this.radioDeviceKinds = new Map();
        this.deviceHealth = {};
        this.devicePresence = {};
        this.collapsedRadioGroups = {
            wifi: false,
            zwave: false,
        };
        this.toolsPanelCollapsed = Boolean(
            window.matchMedia?.("(max-width: 1199px)").matches,
        );
        this.resizeObserver = new ResizeObserver(() => {
            if (!this.svg || !this.viewBox) {
                return;
            }

            this.applyViewBox();
        });
    }

    render(
        topology,
        deviceHealth = {},
        devicePresence = {},
    ) {
        this.topology = topology;
        this.deviceHealth = deviceHealth;
        this.devicePresence = devicePresence;
        this.deviceIndex = this.createDeviceIndex(
            topology.devices ?? [],
        );
        this.radioDeviceKinds =
            this.createRadioDeviceKindIndex(
                topology.devices ?? [],
                topology.links ?? [],
            );
        this.layout = this.selectLayout(
            topology.layouts ?? [],
        );

        if (!this.layout) {
            this.renderEmpty(
                "En attente de la configuration transmise par Ohana-Agent.",
            );
            return;
        }

        this.updateLayoutLabel();
        this.hideError?.();

        const svg = this.createSvg(this.layout);

        this.svg = svg;
        this.initializeViewport(this.layout);
        this.attachNavigationEvents(svg);
        this.applyViewBox();

        const positions = this.layout.positions ?? {};

        this.renderLinks(
            svg,
            topology.links ?? [],
            positions,
        );
        this.renderDevices(
            svg,
            topology.devices ?? [],
            positions,
        );

        const toolsPanel = this.createToolsPanel();

        this.container.replaceChildren(svg, toolsPanel);

        this.resizeObserver.disconnect();
        this.resizeObserver.observe(this.container);

        window.requestAnimationFrame(() => {
            this.fitVisibleDeviceLabels(svg);
            this.fitContentToViewport();

            if (this.selectedDeviceId) {
                this.setSelectedDevice(
                    this.selectedDeviceId,
                );
            }
        });
    }


    createToolsPanel() {
        const panel = document.createElement("aside");
        const controls = this.findTopologyControls();
        const radioControls =
            this.createRadioGroupControls();
        const header = document.createElement("div");
        const toggle = document.createElement("button");
        const help = document.createElement("div");

        panel.className = "topology-tools-panel";
        panel.setAttribute(
            "aria-label",
            "Outils et aide à la lecture de la topologie",
        );

        if (this.toolsPanelCollapsed) {
            panel.classList.add("topology-tools-panel--collapsed");
        }

        header.className = "topology-tools-panel__header";

        if (controls) {
            header.append(controls);
        }

        if (radioControls) {
            header.append(radioControls);
        }

        toggle.className = "topology-tools-panel__toggle";
        toggle.type = "button";
        toggle.setAttribute(
            "aria-label",
            this.toolsPanelCollapsed
                ? "Afficher l’aide à la lecture"
                : "Masquer l’aide à la lecture",
        );
        toggle.setAttribute(
            "aria-expanded",
            String(!this.toolsPanelCollapsed),
        );
        toggle.innerHTML = `
            <span aria-hidden="true">⌄</span>
        `;
        toggle.addEventListener("click", () => {
            this.toggleToolsPanel(panel, toggle);
        });
        header.append(toggle);

        help.className = "topology-tools-panel__help";
        help.innerHTML = `
            <strong class="topology-tools-panel__title">
                Aide à la lecture
            </strong>
            <div class="topology-tools-panel__sections">
                <section class="topology-tools-panel__section">
                    <span class="topology-tools-panel__heading">
                        Type de liaison
                    </span>
                    <ul class="topology-tools-panel__list">
                        <li>
                            <span class="topology-tools-panel__line topology-tools-panel__line--fiber"></span>
                            Fibre
                        </li>
                        <li>
                            <span class="topology-tools-panel__line topology-tools-panel__line--wifi"></span>
                            Wi-Fi
                        </li>
                        <li>
                            <span class="topology-tools-panel__line topology-tools-panel__line--zwave"></span>
                            Z-Wave
                        </li>
                        <li>
                            <span class="topology-tools-panel__line topology-tools-panel__line--ethernet"></span>
                            <span class="topology-tools-panel__ethernet-icon" aria-hidden="true"></span>
                            Ethernet
                        </li>
                    </ul>
                    <div class="topology-tools-panel__ethernet-speeds">
                        <span class="topology-tools-panel__speed-heading">
                            Débit · Ethernet uniquement
                        </span>
                        <span class="topology-tools-panel__speed-caption">
                            Couleur + animation = capacité
                        </span>
                        <div class="topology-tools-panel__speed-list">
                            <span class="topology-tools-panel__speed topology-tools-panel__speed--100m">100M</span>
                            <span class="topology-tools-panel__speed topology-tools-panel__speed--1g">1G</span>
                            <span class="topology-tools-panel__speed topology-tools-panel__speed--2-5g">2,5G</span>
                            <span class="topology-tools-panel__speed topology-tools-panel__speed--5g">5G</span>
                            <span class="topology-tools-panel__speed topology-tools-panel__speed--8g">8G</span>
                            <span class="topology-tools-panel__speed topology-tools-panel__speed--10g">10G</span>
                        </div>
                        <span class="topology-tools-panel__cadence-caption">
                            Cadence croissante selon le débit
                        </span>
                        <div class="topology-tools-panel__cadences" aria-hidden="true">
                            <span>
                                <i class="topology-tools-panel__cadence topology-tools-panel__cadence--slow"></i>
                                Lente
                            </span>
                            <span>
                                <i class="topology-tools-panel__cadence topology-tools-panel__cadence--medium"></i>
                                Moyenne
                            </span>
                            <span>
                                <i class="topology-tools-panel__cadence topology-tools-panel__cadence--fast"></i>
                                Rapide
                            </span>
                        </div>
                    </div>
                </section>
                <section class="topology-tools-panel__section">
                    <span class="topology-tools-panel__heading">
                        États
                    </span>
                    <ul class="topology-tools-panel__list">
                        <li><span class="topology-tools-panel__state topology-tools-panel__state--healthy"></span>Sain</li>
                        <li><span class="topology-tools-panel__state topology-tools-panel__state--degraded"></span>Dégradé</li>
                        <li><span class="topology-tools-panel__state topology-tools-panel__state--unhealthy"></span>Critique</li>
                        <li><span class="topology-tools-panel__state topology-tools-panel__state--unknown"></span>Inconnu</li>
                    </ul>
                    <span class="topology-tools-panel__heading topology-tools-panel__heading--secondary">
                        Présence réseau
                    </span>
                    <ul class="topology-tools-panel__list">
                        <li><span class="topology-tools-panel__presence topology-tools-panel__presence--present"></span>Présent</li>
                        <li><span class="topology-tools-panel__presence topology-tools-panel__presence--absent"></span>Absent</li>
                        <li><span class="topology-tools-panel__presence topology-tools-panel__presence--unknown"></span>Inconnu</li>
                    </ul>
                </section>
            </div>
        `;

        panel.append(header, help);

        return panel;
    }

    createRadioGroupControls() {
        const groupKinds = [
            {
                kind: "wifi",
                label: "Wi-Fi",
            },
            {
                kind: "zwave",
                label: "Z-Wave",
            },
        ];
        const availableKinds = groupKinds.filter(
            ({kind}) => this.radioDeviceCount(kind) > 0,
        );

        if (availableKinds.length === 0) {
            return null;
        }

        const controls = document.createElement("div");

        controls.className =
            "topology-radio-controls";
        controls.setAttribute(
            "aria-label",
            "Groupes radio de la carte",
        );

        for (const {kind, label} of availableKinds) {
            const count = this.radioDeviceCount(kind);
            const collapsed =
                this.collapsedRadioGroups[kind];
            const button = document.createElement("button");

            button.className = [
                "topology-radio-control",
                `topology-radio-control--${kind}`,
                collapsed
                    ? "topology-radio-control--collapsed"
                    : "",
            ].filter(Boolean).join(" ");
            button.type = "button";
            button.setAttribute(
                "aria-pressed",
                String(collapsed),
            );
            button.setAttribute(
                "aria-label",
                collapsed
                    ? `Déplier le groupe ${label}`
                    : `Replier le groupe ${label}`,
            );
            button.innerHTML = `
                <span class="topology-radio-control__icon" aria-hidden="true"></span>
                <span class="topology-radio-control__label">
                    ${this.escapeHtml(label)}
                </span>
                <span class="topology-radio-control__count">
                    ${count}
                </span>
            `;
            button.addEventListener("click", () => {
                this.toggleRadioGroup(kind);
            });
            controls.append(button);
        }

        return controls;
    }

    toggleRadioGroup(kind) {
        this.collapsedRadioGroups[kind] =
            !this.collapsedRadioGroups[kind];

        if (
            this.selectedDeviceId
            && this.isDeviceHidden(
                this.selectedDeviceId,
            )
        ) {
            this.selectedDeviceId = null;
        }

        if (this.topology) {
            this.render(
                this.topology,
                this.deviceHealth,
                this.devicePresence,
            );
        }
    }

    findTopologyControls() {
        return (
            this.container
                .closest(".topology-workspace")
                ?.querySelector(".topology-controls")
            ?? document.querySelector(".topology-controls")
        );
    }

    toggleToolsPanel(panel, toggle) {
        this.toolsPanelCollapsed = !this.toolsPanelCollapsed;
        panel.classList.toggle(
            "topology-tools-panel--collapsed",
            this.toolsPanelCollapsed,
        );
        toggle.setAttribute(
            "aria-expanded",
            String(!this.toolsPanelCollapsed),
        );
        toggle.setAttribute(
            "aria-label",
            this.toolsPanelCollapsed
                ? "Afficher l’aide à la lecture"
                : "Masquer l’aide à la lecture",
        );
    }

    renderError(message) {
        this.container.innerHTML = `
            <p class="empty-state">
                Impossible d’afficher la topologie.
            </p>
        `;

        this.showError?.(message);
    }

    renderEmpty(message) {
        this.container.innerHTML = `
            <p class="empty-state">
                ${this.escapeHtml(message)}
            </p>
        `;

        if (this.layoutLabel) {
            this.layoutLabel.textContent = "—";
        }

        this.hideError?.();
    }

    createDeviceIndex(devices) {
        return new Map(
            devices.map((device) => [
                device.device_id,
                device,
            ]),
        );
    }

    createRadioDeviceKindIndex(devices, links) {
        const supportedKinds = new Set([
            "wifi",
            "zwave",
        ]);
        const structuralKinds = new Set([
            "internet",
            "router",
            "switch",
            "access_point",
            "server",
            "raspberry_pi",
            "home_assistant",
            "computer",
            "storage",
        ]);
        const deviceLinks = new Map();

        for (const link of links) {
            for (const deviceId of [
                link.source_device_id,
                link.target_device_id,
            ]) {
                if (!deviceLinks.has(deviceId)) {
                    deviceLinks.set(deviceId, []);
                }

                deviceLinks.get(deviceId).push(link);
            }
        }

        const radioDevices = new Map();

        for (const device of devices) {
            const linksForDevice =
                deviceLinks.get(device.device_id) ?? [];
            const linkKinds = new Set(
                linksForDevice.map((link) => (
                    String(link.kind ?? "").toLowerCase()
                )),
            );

            if (
                structuralKinds.has(device.kind)
                || linkKinds.size !== 1
            ) {
                continue;
            }

            const [kind] = linkKinds;

            if (supportedKinds.has(kind)) {
                radioDevices.set(device.device_id, kind);
            }
        }

        return radioDevices;
    }

    radioDeviceCount(kind) {
        return [...this.radioDeviceKinds.values()]
            .filter((deviceKind) => deviceKind === kind)
            .length;
    }

    radioGroupKind(device) {
        return this.radioDeviceKinds.get(
            typeof device === "string"
                ? device
                : device?.device_id,
        );
    }

    isCompactDevice(device) {
        return Boolean(this.radioGroupKind(device));
    }

    isDeviceHidden(device) {
        const groupKind = this.radioGroupKind(device);

        return Boolean(
            groupKind
            && this.collapsedRadioGroups[groupKind],
        );
    }

    deviceDimensions(device) {
        if (this.isCompactDevice(device)) {
            return {
                width: TopologyCanvas.COMPACT_DEVICE_WIDTH,
                height: TopologyCanvas.COMPACT_DEVICE_HEIGHT,
                labelMaxWidth:
                    TopologyCanvas.COMPACT_DEVICE_LABEL_MAX_WIDTH,
            };
        }

        return {
            width: TopologyCanvas.DEVICE_WIDTH,
            height: TopologyCanvas.DEVICE_HEIGHT,
            labelMaxWidth:
                TopologyCanvas.DEVICE_LABEL_MAX_WIDTH,
        };
    }

    selectLayout(layouts) {
        if (layouts.length === 0) {
            return null;
        }

        return (
            layouts.find(
                (layout) => layout.kind === "physical",
            )
            ?? layouts[0]
        );
    }

    initializeViewport(layout) {
        const initial = {
            x: 0,
            y: 0,
            width: Number(layout.canvas_width),
            height: Number(layout.canvas_height),
        };

        this.initialViewBox = {
            ...initial,
        };

        this.viewBox = {
            ...initial,
        };
    }

    applyViewBox() {
        if (!this.svg || !this.viewBox) {
            return;
        }

        const {
            x,
            y,
            width,
            height,
        } = this.viewBox;

        this.svg.setAttribute(
            "viewBox",
            `${x} ${y} ${width} ${height}`,
        );
    }

    contentBounds() {
        if (!this.layout) {
            return null;
        }

        const positions = Object.entries(
            this.layout.positions ?? {},
        ).filter(([deviceId]) => (
            !this.isDeviceHidden(deviceId)
        ));

        if (positions.length === 0) {
            return null;
        }

        const minimumX = Math.min(
            ...positions.map(([deviceId, position]) => {
                const dimensions =
                    this.deviceDimensions(deviceId);

                return position.x - dimensions.width / 2;
            }),
        );
        const maximumX = Math.max(
            ...positions.map(([deviceId, position]) => {
                const dimensions =
                    this.deviceDimensions(deviceId);

                return position.x + dimensions.width / 2;
            }),
        );
        const minimumY = Math.min(
            ...positions.map(([deviceId, position]) => {
                const dimensions =
                    this.deviceDimensions(deviceId);

                return position.y - dimensions.height / 2;
            }),
        );
        const maximumY = Math.max(
            ...positions.map(([deviceId, position]) => {
                const dimensions =
                    this.deviceDimensions(deviceId);

                return position.y + dimensions.height / 2;
            }),
        );

        return {
            x: minimumX,
            y: minimumY,
            width: maximumX - minimumX,
            height: maximumY - minimumY,
        };
    }

    fitContentToViewport() {
        if (!this.svg) {
            return;
        }

        const content = this.contentBounds();

        if (!content) {
            return;
        }

        const bounds =
            this.svg.getBoundingClientRect();

        if (
            bounds.width <= 0
            || bounds.height <= 0
        ) {
            return;
        }

        const padding = 110;

        let width = content.width + padding * 2;
        let height = content.height + padding * 2;

        const viewportRatio =
            bounds.width / bounds.height;
        const contentRatio =
            width / height;

        if (contentRatio > viewportRatio) {
            height = width / viewportRatio;
        } else {
            width = height * viewportRatio;
        }

        const mobileViewport = Boolean(
            window.matchMedia?.("(max-width: 620px)").matches,
        );
        const compactViewport = Boolean(
            window.matchMedia?.("(max-width: 1199px)").matches,
        );
        const compactMaximumWidth = mobileViewport
            ? 960
            : 1800;

        if (
            compactViewport
            && width > compactMaximumWidth
        ) {
            width = compactMaximumWidth;
            height = width / viewportRatio;
        }

        const centerX =
            content.x + content.width / 2;
        const centerY =
            content.y + content.height / 2;
        const alignFromNetworkEntry =
            compactViewport
            && width < content.width + padding * 2;

        this.viewBox = {
            x: alignFromNetworkEntry
                ? content.x - padding
                : centerX - width / 2,
            y: centerY - height / 2,
            width,
            height,
        };

        this.initialViewBox = {
            ...this.viewBox,
        };

        this.applyViewBox();
    }

    resetView() {
        this.fitContentToViewport();
    }

    zoomIn() {
        this.zoomAtCenter(
            TopologyCanvas.ZOOM_STEP,
        );
    }

    zoomOut() {
        this.zoomAtCenter(
            1 / TopologyCanvas.ZOOM_STEP,
        );
    }

    zoomAtCenter(factor) {
        if (!this.viewBox) {
            return;
        }

        const centerX =
            this.viewBox.x + this.viewBox.width / 2;
        const centerY =
            this.viewBox.y + this.viewBox.height / 2;

        this.zoomAtPoint(
            factor,
            centerX,
            centerY,
        );
    }

    zoomAtPoint(factor, pointX, pointY) {
        if (!this.viewBox || !this.initialViewBox) {
            return;
        }

        const currentZoom =
            this.initialViewBox.width
            / this.viewBox.width;
        const requestedZoom =
            currentZoom * factor;
        const clampedZoom = Math.min(
            TopologyCanvas.MAX_ZOOM,
            Math.max(
                TopologyCanvas.MIN_ZOOM,
                requestedZoom,
            ),
        );

        if (clampedZoom === currentZoom) {
            return;
        }

        const newWidth =
            this.initialViewBox.width
            / clampedZoom;
        const newHeight =
            this.initialViewBox.height
            / clampedZoom;

        const relativeX =
            (pointX - this.viewBox.x)
            / this.viewBox.width;
        const relativeY =
            (pointY - this.viewBox.y)
            / this.viewBox.height;

        this.viewBox = {
            x: pointX - relativeX * newWidth,
            y: pointY - relativeY * newHeight,
            width: newWidth,
            height: newHeight,
        };

        this.applyViewBox();
    }

    clientPointToSvg(clientX, clientY) {
        if (!this.svg || !this.viewBox) {
            return {
                x: 0,
                y: 0,
            };
        }

        const bounds =
            this.svg.getBoundingClientRect();

        return {
            x:
                this.viewBox.x
                + (
                    (clientX - bounds.left)
                    / bounds.width
                )
                * this.viewBox.width,
            y:
                this.viewBox.y
                + (
                    (clientY - bounds.top)
                    / bounds.height
                )
                * this.viewBox.height,
        };
    }

    attachNavigationEvents(svg) {
        svg.addEventListener(
            "wheel",
            (event) => {
                this.handleWheel(event);
            },
            {
                passive: false,
            },
        );

        svg.addEventListener(
            "pointerdown",
            (event) => {
                this.handlePointerDown(event);
            },
        );

        svg.addEventListener(
            "pointermove",
            (event) => {
                this.handlePointerMove(event);
            },
        );

        svg.addEventListener(
            "pointerup",
            (event) => {
                this.handlePointerUp(event);
            },
        );

        svg.addEventListener(
            "pointercancel",
            (event) => {
                this.handlePointerUp(event);
            },
        );

        svg.addEventListener(
            "dblclick",
            (event) => {
                this.handleDoubleClick(event);
            },
        );
    }

    handleWheel(event) {
        event.preventDefault();

        const point = this.clientPointToSvg(
            event.clientX,
            event.clientY,
        );

        const factor =
            event.deltaY < 0
                ? TopologyCanvas.ZOOM_STEP
                : 1 / TopologyCanvas.ZOOM_STEP;

        this.zoomAtPoint(
            factor,
            point.x,
            point.y,
        );
    }

    handlePointerDown(event) {
        if (event.button !== 0) {
            return;
        }

        this.activePointers.set(
            event.pointerId,
            {
                x: event.clientX,
                y: event.clientY,
            },
        );

        this.svg.setPointerCapture(
            event.pointerId,
        );

        if (this.activePointers.size === 2) {
            this.dragging = false;
            this.dragStart = null;
            this.dragViewBoxStart = null;
            this.pinchDistance =
                this.currentPinchDistance();
            return;
        }

        if (event.target.closest(".topology-device")) {
            return;
        }

        this.dragging = true;
        this.dragStart = {
            x: event.clientX,
            y: event.clientY,
        };
        this.dragViewBoxStart = {
            ...this.viewBox,
        };
        this.svg.classList.add(
            "topology-canvas--dragging",
        );
    }

    handlePointerMove(event) {
        if (this.activePointers.has(event.pointerId)) {
            this.activePointers.set(
                event.pointerId,
                {
                    x: event.clientX,
                    y: event.clientY,
                },
            );
        }

        if (this.activePointers.size === 2) {
            this.handlePinchZoom();
            return;
        }

        if (
            !this.dragging
            || !this.dragStart
            || !this.dragViewBoxStart
        ) {
            return;
        }

        const bounds =
            this.svg.getBoundingClientRect();

        const deltaX =
            event.clientX - this.dragStart.x;
        const deltaY =
            event.clientY - this.dragStart.y;

        const svgDeltaX =
            deltaX
            * (
                this.dragViewBoxStart.width
                / bounds.width
            );
        const svgDeltaY =
            deltaY
            * (
                this.dragViewBoxStart.height
                / bounds.height
            );

        this.viewBox = {
            ...this.dragViewBoxStart,
            x: this.dragViewBoxStart.x - svgDeltaX,
            y: this.dragViewBoxStart.y - svgDeltaY,
        };

        this.applyViewBox();
    }

    handlePointerUp(event) {
        this.activePointers.delete(event.pointerId);
        this.pinchDistance = null;
        this.dragging = false;
        this.dragStart = null;
        this.dragViewBoxStart = null;

        if (
            this.svg.hasPointerCapture(
                event.pointerId,
            )
        ) {
            this.svg.releasePointerCapture(
                event.pointerId,
            );
        }

        this.svg.classList.remove(
            "topology-canvas--dragging",
        );
    }

    currentPinchDistance() {
        const pointers = [
            ...this.activePointers.values(),
        ];

        if (pointers.length !== 2) {
            return null;
        }

        return Math.hypot(
            pointers[1].x - pointers[0].x,
            pointers[1].y - pointers[0].y,
        );
    }

    handlePinchZoom() {
        const pointers = [
            ...this.activePointers.values(),
        ];
        const distance = this.currentPinchDistance();

        if (
            pointers.length !== 2
            || !distance
            || !this.pinchDistance
        ) {
            this.pinchDistance = distance;
            return;
        }

        const midpoint = this.clientPointToSvg(
            (pointers[0].x + pointers[1].x) / 2,
            (pointers[0].y + pointers[1].y) / 2,
        );
        const factor = distance / this.pinchDistance;

        this.zoomAtPoint(
            factor,
            midpoint.x,
            midpoint.y,
        );
        this.pinchDistance = distance;
    }

    handleDoubleClick(event) {
        if (
            event.target.closest(".topology-device")
        ) {
            return;
        }

        const point = this.clientPointToSvg(
            event.clientX,
            event.clientY,
        );

        this.zoomAtPoint(
            TopologyCanvas.ZOOM_STEP,
            point.x,
            point.y,
        );
    }

    createSvg(layout) {
        const svg = this.createSvgElement("svg");

        svg.classList.add("topology-canvas");
        svg.setAttribute(
            "viewBox",
            `0 0 ${layout.canvas_width} `
            + `${layout.canvas_height}`,
        );
        svg.setAttribute("role", "img");
        svg.setAttribute(
            "aria-label",
            "Carte graphique de l’infrastructure Ohana-House",
        );
        svg.setAttribute(
            "preserveAspectRatio",
            "xMidYMid meet",
        );

        svg.append(
            this.createDefinitions(),
            this.createLayer("topology-canvas__links"),
            this.createLayer("topology-canvas__devices"),
        );

        return svg;
    }

    createDefinitions() {
        const definitions = this.createSvgElement("defs");

        const filter = this.createSvgElement("filter");

        filter.setAttribute("id", "device-shadow");
        filter.setAttribute("x", "-30%");
        filter.setAttribute("y", "-30%");
        filter.setAttribute("width", "160%");
        filter.setAttribute("height", "180%");

        const shadow = this.createSvgElement(
            "feDropShadow",
        );

        shadow.setAttribute("dx", "0");
        shadow.setAttribute("dy", "10");
        shadow.setAttribute("stdDeviation", "12");
        shadow.setAttribute(
            "flood-color",
            "rgb(0 0 0 / 35%)",
        );

        filter.append(shadow);
        definitions.append(
            filter,
            this.createDirectionMarker(
                "topology-arrow-end",
            ),
        );

        return definitions;
    }


    createDirectionMarker(markerId) {
        const marker = this.createSvgElement("marker");

        marker.setAttribute("id", markerId);
        marker.setAttribute("viewBox", "0 0 10 10");
        marker.setAttribute("refX", "8");
        marker.setAttribute("refY", "5");
        marker.setAttribute("markerWidth", "7");
        marker.setAttribute("markerHeight", "7");
        marker.setAttribute("orient", "auto-start-reverse");
        marker.setAttribute("markerUnits", "strokeWidth");

        const arrow = this.createSvgElement("path");

        arrow.classList.add("topology-link__arrow");
        arrow.setAttribute(
            "d",
            "M 1 1 L 9 5 L 1 9 z",
        );
        arrow.setAttribute("fill", "context-stroke");

        marker.append(arrow);

        return marker;
    }

    createLayer(className) {
        const layer = this.createSvgElement("g");

        layer.classList.add(className);

        return layer;
    }

    renderLinks(svg, links, positions) {
        const layer = svg.querySelector(
            ".topology-canvas__links",
        );
        const routedLinks = [];

        for (const [order, link] of links.entries()) {
            const sourcePosition =
                positions[link.source_device_id];
            const targetPosition =
                positions[link.target_device_id];

            if (!sourcePosition || !targetPosition) {
                continue;
            }

            if (
                this.isDeviceHidden(link.source_device_id)
                || this.isDeviceHidden(link.target_device_id)
            ) {
                continue;
            }

            routedLinks.push({
                link,
                order,
                sourcePosition,
                targetPosition,
                routing: {
                    source: {
                        deviceId: link.source_device_id,
                        side: this.linkSide(
                            link.source_device_id,
                            sourcePosition,
                            targetPosition,
                            positions,
                        ),
                        offset: 0,
                    },
                    target: {
                        deviceId: link.target_device_id,
                        side: this.linkSide(
                            link.target_device_id,
                            targetPosition,
                            sourcePosition,
                            positions,
                        ),
                        offset: 0,
                    },
                },
            });
        }

        const radioBusGroups = [
            "wifi",
            "zwave",
        ].flatMap((kind) => {
            return this.radioBusGroups(
                routedLinks,
                kind,
            );
        });
        const groupedRadioLinks = new Set(
            radioBusGroups.flatMap((group) => group.links),
        );
        const individualLinks = routedLinks.filter(
            (routedLink) => !groupedRadioLinks.has(routedLink),
        );

        this.distributeLinkAnchors(individualLinks);
        this.routeLinks(individualLinks, positions);

        for (const routedLink of individualLinks) {
            layer.append(
                this.createLink(
                    routedLink.link,
                    routedLink.sourcePosition,
                    routedLink.targetPosition,
                    this.linkHealth(routedLink.link),
                    routedLink.order,
                    routedLink.routing,
                ),
            );
        }

        for (const group of radioBusGroups) {
            this.renderRadioBusGroup(layer, group);
        }
    }

    radioBusGroups(routedLinks, kind) {
        const groups = new Map();

        for (const routedLink of routedLinks) {
            if (this.linkVisualKind(routedLink.link) !== kind) {
                continue;
            }

            const sourceRadioKind = this.radioGroupKind(
                routedLink.link.source_device_id,
            );
            const targetRadioKind = this.radioGroupKind(
                routedLink.link.target_device_id,
            );

            if (
                (sourceRadioKind === kind)
                === (targetRadioKind === kind)
            ) {
                continue;
            }

            const gatewayId = sourceRadioKind === kind
                ? routedLink.link.target_device_id
                : routedLink.link.source_device_id;
            const gatewayEndpoint =
                routedLink.link.source_device_id === gatewayId
                    ? "source"
                    : "target";
            const leafEndpoint = gatewayEndpoint === "source"
                ? "target"
                : "source";

            if (!groups.has(gatewayId)) {
                groups.set(gatewayId, []);
            }

            groups.get(gatewayId).push({
                routedLink,
                gatewayEndpoint,
                leafEndpoint,
            });
        }

        return [...groups.entries()]
            .map(([gatewayId, links]) => {
                const sharedEntries = links.filter((entry) => {
                    const gatewayPosition =
                        entry.routedLink[
                            `${entry.gatewayEndpoint}Position`
                        ];
                    const leafPosition = entry.routedLink[
                        `${entry.leafEndpoint}Position`
                    ];
                    const side = this.relativeLinkSide(
                        gatewayPosition,
                        leafPosition,
                    );

                    return links.filter((candidate) => {
                        const candidateGatewayPosition =
                            candidate.routedLink[
                                `${candidate.gatewayEndpoint}Position`
                            ];
                        const candidateLeafPosition =
                            candidate.routedLink[
                                `${candidate.leafEndpoint}Position`
                            ];

                        return this.relativeLinkSide(
                            candidateGatewayPosition,
                            candidateLeafPosition,
                        ) === side;
                    }).length >= 3;
                });

                if (sharedEntries.length < 3) {
                    return null;
                }

                return {
                    gatewayId,
                    kind,
                    links: sharedEntries.map(
                        ({routedLink}) => routedLink,
                    ),
                    entries: sharedEntries,
                };
            })
            .filter(Boolean);
    }

    renderRadioBusGroup(layer, group) {
        const sideGroups = new Map();

        for (const entry of group.entries) {
            const gatewayPosition =
                entry.routedLink[`${entry.gatewayEndpoint}Position`];
            const leafPosition =
                entry.routedLink[`${entry.leafEndpoint}Position`];
            const side = this.relativeLinkSide(
                gatewayPosition,
                leafPosition,
            );

            if (!sideGroups.has(side)) {
                sideGroups.set(side, []);
            }

            sideGroups.get(side).push(entry);
        }

        for (const [side, entries] of sideGroups) {
            this.renderRadioBusSide(
                layer,
                group.gatewayId,
                group.kind,
                side,
                entries,
            );
        }
    }

    relativeLinkSide(origin, target) {
        const deltaX = target.x - origin.x;
        const deltaY = target.y - origin.y;

        if (Math.abs(deltaX) >= Math.abs(deltaY)) {
            return deltaX >= 0 ? "right" : "left";
        }

        return deltaY >= 0 ? "bottom" : "top";
    }

    oppositeLinkSide(side) {
        return {
            top: "bottom",
            right: "left",
            bottom: "top",
            left: "right",
        }[side] ?? "left";
    }

    renderRadioBusSide(
        layer,
        gatewayId,
        kind,
        side,
        entries,
    ) {
        const firstEntry = entries[0];
        const gatewayPosition =
            firstEntry.routedLink[
                `${firstEntry.gatewayEndpoint}Position`
            ];
        const gatewayRouting = {
            deviceId: gatewayId,
            side,
            offset: 0,
        };
        const gatewayAnchor = this.linkAnchor(
            gatewayPosition,
            gatewayRouting,
        );
        const sideVector = this.linkSideVector(side);
        const busOrigin = {
            x:
                gatewayAnchor.x
                + sideVector.x * TopologyCanvas.ROUTE_LEAD,
            y:
                gatewayAnchor.y
                + sideVector.y * TopologyCanvas.ROUTE_LEAD,
        };
        const junctions = [];

        for (const entry of entries) {
            const {routedLink} = entry;
            const leafDeviceId =
                routedLink.link[
                    `${entry.leafEndpoint}_device_id`
                ];
            const leafPosition =
                routedLink[`${entry.leafEndpoint}Position`];

            routedLink.routing[entry.gatewayEndpoint] = {
                deviceId: gatewayId,
                side,
                offset: 0,
            };
            routedLink.routing[entry.leafEndpoint] = {
                deviceId: leafDeviceId,
                side: this.oppositeLinkSide(side),
                offset: 0,
            };

            const leafAnchor = this.linkAnchor(
                leafPosition,
                routedLink.routing[entry.leafEndpoint],
            );
            const horizontal = side === "left" || side === "right";
            const junction = horizontal
                ? {x: busOrigin.x, y: leafAnchor.y}
                : {x: leafAnchor.x, y: busOrigin.y};

            junctions.push(junction);
            routedLink.routing.path = this.roundedLinkPath([
                junction,
                leafAnchor,
            ]);

            layer.append(
                this.createLink(
                    routedLink.link,
                    routedLink.sourcePosition,
                    routedLink.targetPosition,
                    this.linkHealth(routedLink.link),
                    routedLink.order,
                    routedLink.routing,
                ),
            );
        }

        const horizontal = side === "left" || side === "right";
        const sortedJunctions = [...junctions].sort(
            (first, second) => horizontal
                ? first.y - second.y
                : first.x - second.x,
        );
        const trunkStart = sortedJunctions[0];
        const trunkEnd = sortedJunctions.at(-1);
        const connectorEnd = horizontal
            ? {x: busOrigin.x, y: gatewayAnchor.y}
            : {x: gatewayAnchor.x, y: busOrigin.y};

        layer.prepend(
            this.createRadioBus(
                gatewayId,
                kind,
                [
                    this.roundedLinkPath([
                        gatewayAnchor,
                        connectorEnd,
                    ]),
                    this.roundedLinkPath([
                        trunkStart,
                        trunkEnd,
                    ]),
                ].join(" "),
            ),
        );
    }

    createRadioBus(gatewayId, kind, pathData) {
        const group = this.createSvgElement("g");

        group.classList.add(
            "topology-link",
            "topology-link--radio-bus",
            `topology-link--${kind}-bus`,
            `topology-link--visual-${kind}`,
        );
        group.dataset.sourceDeviceId = gatewayId;
        group.dataset.targetDeviceId = gatewayId;
        group.dataset.visualKind = kind;

        const glow = this.createSvgElement("path");

        glow.classList.add("topology-link__glow");
        glow.setAttribute("d", pathData);

        const path = this.createSvgElement("path");

        path.classList.add("topology-link__path");
        path.setAttribute("d", pathData);
        group.append(glow, path);

        return group;
    }

    distributeLinkAnchors(routedLinks) {
        this.distributeLinkEndpoint(
            routedLinks,
            "source",
        );
        this.distributeLinkEndpoint(
            routedLinks,
            "target",
        );
    }

    distributeLinkEndpoint(routedLinks, endpoint) {
        const groups = new Map();

        for (const routedLink of routedLinks) {
            const link = routedLink.link;
            const deviceId = endpoint === "source"
                ? link.source_device_id
                : link.target_device_id;
            const side = routedLink.routing[endpoint].side;
            const key = `${deviceId}:${side}`;

            if (!groups.has(key)) {
                groups.set(key, []);
            }

            groups.get(key).push(routedLink);
        }

        for (const group of groups.values()) {
            this.assignLinkOffsets(group, endpoint);
        }
    }

    assignLinkOffsets(routedLinks, endpoint) {
        if (routedLinks.length === 1) {
            return;
        }

        const side =
            routedLinks[0].routing[endpoint].side;
        const deviceId =
            routedLinks[0].routing[endpoint].deviceId;
        const horizontalSide =
            side === "top" || side === "bottom";
        const oppositeEndpoint = endpoint === "source"
            ? "targetPosition"
            : "sourcePosition";

        routedLinks.sort((first, second) => {
            const firstPosition = first[oppositeEndpoint];
            const secondPosition = second[oppositeEndpoint];
            const firstValue = horizontalSide
                ? firstPosition.x
                : firstPosition.y;
            const secondValue = horizontalSide
                ? secondPosition.x
                : secondPosition.y;

            if (firstValue !== secondValue) {
                return firstValue - secondValue;
            }

            return String(first.link.link_id).localeCompare(
                String(second.link.link_id),
            );
        });

        const availableSpan = horizontalSide
            ? this.deviceDimensions(deviceId).width - 48
            : this.deviceDimensions(deviceId).height - 40;
        const step = availableSpan
            / (routedLinks.length - 1);
        const start = -availableSpan / 2;

        routedLinks.forEach((routedLink, index) => {
            routedLink.routing[endpoint].offset =
                start + step * index;
        });
    }

    routeLinks(routedLinks, positions) {
        const obstacles = this.linkObstacles(positions);
        const occupiedSegments = [];
        const routingOrder = [...routedLinks].sort(
            (first, second) => (
                this.linkDistance(first)
                - this.linkDistance(second)
            ),
        );

        for (const routedLink of routingOrder) {
            const source = this.linkAnchor(
                routedLink.sourcePosition,
                routedLink.routing.source,
            );
            const target = this.linkAnchor(
                routedLink.targetPosition,
                routedLink.routing.target,
            );
            const sourceLead = this.linkLead(
                source,
                routedLink.routing.source.side,
            );
            const targetLead = this.linkLead(
                target,
                routedLink.routing.target.side,
            );
            const candidates = this.linkRouteCandidates(
                sourceLead,
                targetLead,
                obstacles,
            );
            let route = null;
            let routeScore = Infinity;

            for (const candidate of candidates) {
                const candidateScore =
                    this.linkRouteScore(
                        candidate,
                        obstacles,
                        occupiedSegments,
                    );

                if (candidateScore < routeScore) {
                    route = candidate;
                    routeScore = candidateScore;
                }
            }
            const points = this.simplifyLinkPoints([
                source,
                ...(route ?? [sourceLead, targetLead]),
                target,
            ]);

            routedLink.routing.path =
                this.roundedLinkPath(points);
            occupiedSegments.push(
                ...this.linkPathSegments(
                    route ?? [sourceLead, targetLead],
                ),
            );
        }
    }

    linkDistance(routedLink) {
        return Math.hypot(
            routedLink.targetPosition.x
                - routedLink.sourcePosition.x,
            routedLink.targetPosition.y
                - routedLink.sourcePosition.y,
        );
    }

    linkObstacles(positions) {
        return Object.entries(positions)
            .filter(([deviceId]) => (
                !this.isDeviceHidden(deviceId)
            ))
            .map(([deviceId, position]) => {
                const dimensions =
                    this.deviceDimensions(deviceId);

                return {
                    deviceId,
                    left:
                        position.x
                        - dimensions.width / 2
                        - TopologyCanvas.ROUTE_CLEARANCE,
                    right:
                        position.x
                        + dimensions.width / 2
                        + TopologyCanvas.ROUTE_CLEARANCE,
                    top:
                        position.y
                        - dimensions.height / 2
                        - TopologyCanvas.ROUTE_CLEARANCE,
                    bottom:
                        position.y
                        + dimensions.height / 2
                        + TopologyCanvas.ROUTE_CLEARANCE,
                };
            });
    }

    linkRouteCandidates(source, target, obstacles) {
        const candidates = [
            [
                source,
                {x: target.x, y: source.y},
                target,
            ],
            [
                source,
                {x: source.x, y: target.y},
                target,
            ],
        ];
        const horizontalLanes = new Set([
            source.y,
            target.y,
            (source.y + target.y) / 2,
        ]);
        const verticalLanes = new Set([
            source.x,
            target.x,
            (source.x + target.x) / 2,
        ]);

        for (const obstacle of obstacles) {
            horizontalLanes.add(
                obstacle.top
                - TopologyCanvas.ROUTE_LANE_GAP,
            );
            horizontalLanes.add(
                obstacle.bottom
                + TopologyCanvas.ROUTE_LANE_GAP,
            );
            verticalLanes.add(
                obstacle.left
                - TopologyCanvas.ROUTE_LANE_GAP,
            );
            verticalLanes.add(
                obstacle.right
                + TopologyCanvas.ROUTE_LANE_GAP,
            );
        }

        for (const laneY of horizontalLanes) {
            candidates.push([
                source,
                {x: source.x, y: laneY},
                {x: target.x, y: laneY},
                target,
            ]);
        }

        for (const laneX of verticalLanes) {
            candidates.push([
                source,
                {x: laneX, y: source.y},
                {x: laneX, y: target.y},
                target,
            ]);
        }

        return candidates.map(
            (candidate) => this.simplifyLinkPoints(
                candidate,
            ),
        );
    }

    linkRouteScore(
        points,
        obstacles,
        occupiedSegments,
    ) {
        const segments = this.linkPathSegments(points);
        let obstacleHits = 0;
        let overlap = 0;
        let crossings = 0;
        let length = 0;

        for (const segment of segments) {
            length += Math.hypot(
                segment.target.x - segment.source.x,
                segment.target.y - segment.source.y,
            );

            for (const obstacle of obstacles) {
                if (
                    this.linkSegmentIntersectsObstacle(
                        segment,
                        obstacle,
                    )
                ) {
                    obstacleHits += 1;
                }
            }

            for (const occupied of occupiedSegments) {
                overlap += this.linkSegmentOverlap(
                    segment,
                    occupied,
                );

                if (
                    this.linkSegmentsCross(
                        segment,
                        occupied,
                    )
                ) {
                    crossings += 1;
                }
            }
        }

        return obstacleHits * 100000000
            + overlap * 600
            + crossings * 160
            + length
            + Math.max(0, points.length - 2) * 24;
    }

    linkPathSegments(points) {
        const segments = [];

        for (
            let index = 1;
            index < points.length;
            index += 1
        ) {
            segments.push({
                source: points[index - 1],
                target: points[index],
            });
        }

        return segments;
    }

    linkSegmentIntersectsObstacle(segment, obstacle) {
        const horizontal =
            segment.source.y === segment.target.y;

        if (horizontal) {
            const minimumX = Math.min(
                segment.source.x,
                segment.target.x,
            );
            const maximumX = Math.max(
                segment.source.x,
                segment.target.x,
            );

            return segment.source.y >= obstacle.top
                && segment.source.y <= obstacle.bottom
                && maximumX >= obstacle.left
                && minimumX <= obstacle.right;
        }

        const minimumY = Math.min(
            segment.source.y,
            segment.target.y,
        );
        const maximumY = Math.max(
            segment.source.y,
            segment.target.y,
        );

        return segment.source.x >= obstacle.left
            && segment.source.x <= obstacle.right
            && maximumY >= obstacle.top
            && minimumY <= obstacle.bottom;
    }

    linkSegmentOverlap(first, second) {
        const firstHorizontal =
            first.source.y === first.target.y;
        const secondHorizontal =
            second.source.y === second.target.y;

        if (
            firstHorizontal
            && secondHorizontal
            && first.source.y === second.source.y
        ) {
            return this.linkIntervalOverlap(
                first.source.x,
                first.target.x,
                second.source.x,
                second.target.x,
            );
        }

        if (
            !firstHorizontal
            && !secondHorizontal
            && first.source.x === second.source.x
        ) {
            return this.linkIntervalOverlap(
                first.source.y,
                first.target.y,
                second.source.y,
                second.target.y,
            );
        }

        return 0;
    }

    linkIntervalOverlap(
        firstStart,
        firstEnd,
        secondStart,
        secondEnd,
    ) {
        return Math.max(
            0,
            Math.min(
                Math.max(firstStart, firstEnd),
                Math.max(secondStart, secondEnd),
            )
            - Math.max(
                Math.min(firstStart, firstEnd),
                Math.min(secondStart, secondEnd),
            ),
        );
    }

    linkSegmentsCross(first, second) {
        const firstHorizontal =
            first.source.y === first.target.y;
        const secondHorizontal =
            second.source.y === second.target.y;

        if (firstHorizontal === secondHorizontal) {
            return false;
        }

        const horizontal = firstHorizontal
            ? first
            : second;
        const vertical = firstHorizontal
            ? second
            : first;
        const horizontalMinimum = Math.min(
            horizontal.source.x,
            horizontal.target.x,
        );
        const horizontalMaximum = Math.max(
            horizontal.source.x,
            horizontal.target.x,
        );
        const verticalMinimum = Math.min(
            vertical.source.y,
            vertical.target.y,
        );
        const verticalMaximum = Math.max(
            vertical.source.y,
            vertical.target.y,
        );

        return vertical.source.x > horizontalMinimum
            && vertical.source.x < horizontalMaximum
            && horizontal.source.y > verticalMinimum
            && horizontal.source.y < verticalMaximum;
    }

    simplifyLinkPoints(points) {
        const simplified = [];

        for (const point of points) {
            const previous = simplified.at(-1);

            if (
                previous
                && previous.x === point.x
                && previous.y === point.y
            ) {
                continue;
            }

            simplified.push(point);

            while (simplified.length >= 3) {
                const first = simplified.at(-3);
                const middle = simplified.at(-2);
                const last = simplified.at(-1);
                const horizontal =
                    first.y === middle.y
                    && middle.y === last.y;
                const vertical =
                    first.x === middle.x
                    && middle.x === last.x;

                if (!horizontal && !vertical) {
                    break;
                }

                simplified.splice(-2, 1);
            }
        }

        return simplified;
    }

    roundedLinkPath(points) {
        if (points.length < 2) {
            return null;
        }

        const commands = [
            `M ${this.formatLinkPoint(points[0])}`,
        ];

        for (
            let index = 1;
            index < points.length - 1;
            index += 1
        ) {
            const previous = points[index - 1];
            const corner = points[index];
            const next = points[index + 1];
            const previousDistance = Math.hypot(
                corner.x - previous.x,
                corner.y - previous.y,
            );
            const nextDistance = Math.hypot(
                next.x - corner.x,
                next.y - corner.y,
            );
            const radius = Math.min(
                TopologyCanvas.ROUTE_CORNER_RADIUS,
                previousDistance / 2,
                nextDistance / 2,
            );

            if (radius === 0) {
                continue;
            }

            const before = {
                x:
                    corner.x
                    + (
                        previous.x - corner.x
                    ) * radius / previousDistance,
                y:
                    corner.y
                    + (
                        previous.y - corner.y
                    ) * radius / previousDistance,
            };
            const after = {
                x:
                    corner.x
                    + (
                        next.x - corner.x
                    ) * radius / nextDistance,
                y:
                    corner.y
                    + (
                        next.y - corner.y
                    ) * radius / nextDistance,
            };

            commands.push(
                `L ${this.formatLinkPoint(before)}`,
                `Q ${this.formatLinkPoint(corner)} `
                    + this.formatLinkPoint(after),
            );
        }

        commands.push(
            `L ${this.formatLinkPoint(points.at(-1))}`,
        );

        return commands.join(" ");
    }

    formatLinkPoint(point) {
        return [
            Math.round(point.x * 100) / 100,
            Math.round(point.y * 100) / 100,
        ].join(" ");
    }

    createLink(
        link,
        sourcePosition,
        targetPosition,
        health,
        order = 0,
        routing = null,
    ) {
        const group = this.createSvgElement("g");
        const normalizedKind = this.normalizeClassName(
            link.kind,
        );
        const normalizedVisualKind =
            this.normalizeClassName(
                this.linkVisualKind(link),
            );
        const normalizedHealth =
            this.normalizeHealthStatus(health);
        const normalizedDirection =
            this.normalizeClassName(link.direction);

        group.classList.add(
            "topology-link",
            `topology-link--${normalizedKind}`,
            `topology-link--visual-${normalizedVisualKind}`,
            `topology-link--direction-${normalizedDirection}`,
            `topology-link--health-${normalizedHealth}`,
            this.linkUsesFlowOverlay(normalizedVisualKind)
                ? "topology-link--flow-overlay"
                : "topology-link--flow-dashed",
        );
        group.dataset.linkId = link.link_id;
        group.dataset.sourceDeviceId =
            link.source_device_id;
        group.dataset.targetDeviceId =
            link.target_device_id;
        group.dataset.visualKind =
            normalizedVisualKind;

        const bandwidth = Number(
            link.bandwidth_mbps,
        );

        if (Number.isFinite(bandwidth)) {
            group.dataset.bandwidthMbps =
                String(bandwidth);
        }

        group.style.setProperty(
            "--topology-order",
            order,
        );

        const coordinates = this.linkCoordinates(
            sourcePosition,
            targetPosition,
            routing,
        );

        const glow = this.createSvgElement("path");

        glow.classList.add("topology-link__glow");
        glow.setAttribute("d", coordinates.path);

        const path = this.createSvgElement("path");

        path.classList.add("topology-link__path");
        path.setAttribute("d", coordinates.path);
        this.applyLinkDirection(path, link.direction);

        const flow = this.createSvgElement("path");

        flow.classList.add("topology-link__flow");
        flow.setAttribute("d", coordinates.path);

        group.append(
            glow,
            path,
            flow,
        );

        return group;
    }


    linkUsesFlowOverlay(visualKind) {
        return !new Set([
            "wifi",
            "wireguard",
            "zigbee",
            "zwave",
            "mqtt",
            "logical",
            "usb",
            "serial",
            "other",
        ]).has(visualKind);
    }

    linkVisualKind(link) {
        if (
            link.metadata?.role === "internet_uplink"
            || link.metadata?.medium === "fiber"
        ) {
            return "fiber";
        }

        if (link.kind === "ethernet") {
            const bandwidth = Number(
                link.bandwidth_mbps ?? 0,
            );

            if (bandwidth >= 10000) {
                return "ethernet-10g";
            }

            if (bandwidth >= 8000) {
                return "ethernet-8g";
            }

            if (bandwidth >= 5000) {
                return "ethernet-5g";
            }

            if (bandwidth >= 2500) {
                return "ethernet-2-5g";
            }

            if (bandwidth >= 1000) {
                return "ethernet-1g";
            }

            if (bandwidth >= 100) {
                return "ethernet-100m";
            }
        }

        return link.kind ?? "other";
    }


    applyLinkDirection(path, direction) {
        if (direction === "source_to_target") {
            path.setAttribute(
                "marker-end",
                "url(#topology-arrow-end)",
            );
            return;
        }

        // Bidirectional links intentionally have no arrow.
        // Their two-way nature is the topology default and
        // adding markers would overload the physical view.
    }

    linkHealth(link) {
        const sourceDevice = this.deviceIndex.get(
            link.source_device_id,
        );
        const targetDevice = this.deviceIndex.get(
            link.target_device_id,
        );

        const sourceStatus = this.deviceStatus(
            sourceDevice,
        );
        const targetStatus = this.deviceStatus(
            targetDevice,
        );

        const statuses = [
            sourceStatus,
            targetStatus,
        ];

        if (statuses.includes("unhealthy")) {
            return "unhealthy";
        }

        if (statuses.includes("degraded")) {
            return "degraded";
        }

        if (
            statuses.every(
                (status) => status === "healthy",
            )
        ) {
            return "healthy";
        }

        return "unknown";
    }

    linkSide(
        deviceId,
        position,
        oppositePosition,
        positions = null,
    ) {
        const candidates = this.linkSideCandidates(
            position,
            oppositePosition,
        );

        if (!positions) {
            return candidates[0];
        }

        return candidates.find((side) => (
            this.linkLeadIsClear(
                deviceId,
                position,
                side,
                positions,
            )
        )) ?? candidates[0];
    }

    linkSideCandidates(position, oppositePosition) {
        const deltaX =
            oppositePosition.x - position.x;
        const deltaY =
            oppositePosition.y - position.y;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const direction = {
            x: deltaX / distance,
            y: deltaY / distance,
        };
        const sides = [
            "top",
            "right",
            "bottom",
            "left",
        ];

        return sides.sort((first, second) => {
            const firstVector =
                this.linkSideVector(first);
            const secondVector =
                this.linkSideVector(second);
            const firstScore =
                firstVector.x * direction.x
                + firstVector.y * direction.y;
            const secondScore =
                secondVector.x * direction.x
                + secondVector.y * direction.y;

            return secondScore - firstScore;
        });
    }

    linkLeadIsClear(
        deviceId,
        position,
        side,
        positions,
    ) {
        const anchor = this.linkAnchor(
            position,
            {
                deviceId,
                side,
                offset: 0,
            },
        );
        const lead = this.linkLead(anchor, side);
        const segment = {
            source: anchor,
            target: lead,
        };
        const padding = 8;

        return Object.entries(positions).every(
            ([otherDeviceId, otherPosition]) => {
                if (otherDeviceId === deviceId) {
                    return true;
                }

                if (this.isDeviceHidden(otherDeviceId)) {
                    return true;
                }

                return !this.linkSegmentIntersectsObstacle(
                    segment,
                    {
                        left:
                            otherPosition.x
                            - this.deviceDimensions(
                                otherDeviceId,
                            ).width / 2
                            - padding,
                        right:
                            otherPosition.x
                            + this.deviceDimensions(
                                otherDeviceId,
                            ).width / 2
                            + padding,
                        top:
                            otherPosition.y
                            - this.deviceDimensions(
                                otherDeviceId,
                            ).height / 2
                            - padding,
                        bottom:
                            otherPosition.y
                            + this.deviceDimensions(
                                otherDeviceId,
                            ).height / 2
                            + padding,
                    },
                );
            },
        );
    }

    linkAnchor(position, endpointRouting) {
        const offset = endpointRouting.offset ?? 0;
        const dimensions = this.deviceDimensions(
            endpointRouting.deviceId,
        );

        if (endpointRouting.side === "top") {
            return {
                x: position.x + offset,
                y:
                    position.y
                    - dimensions.height / 2,
            };
        }

        if (endpointRouting.side === "bottom") {
            return {
                x: position.x + offset,
                y:
                    position.y
                    + dimensions.height / 2,
            };
        }

        if (endpointRouting.side === "left") {
            return {
                x:
                    position.x
                    - dimensions.width / 2,
                y: position.y + offset,
            };
        }

        return {
            x:
                position.x
                + dimensions.width / 2,
            y: position.y + offset,
        };
    }

    linkLead(anchor, side) {
        const vector = this.linkSideVector(side);

        return {
            x:
                anchor.x
                + vector.x * TopologyCanvas.ROUTE_LEAD,
            y:
                anchor.y
                + vector.y * TopologyCanvas.ROUTE_LEAD,
        };
    }

    linkSideVector(side) {
        const vectors = {
            top: {x: 0, y: -1},
            right: {x: 1, y: 0},
            bottom: {x: 0, y: 1},
            left: {x: -1, y: 0},
        };

        return vectors[side] ?? vectors.right;
    }

    linkCoordinates(
        sourcePosition,
        targetPosition,
        routing = null,
    ) {
        if (routing?.path) {
            const source = this.linkAnchor(
                sourcePosition,
                routing.source,
            );
            const target = this.linkAnchor(
                targetPosition,
                routing.target,
            );

            return {
                sourceX: source.x,
                sourceY: source.y,
                targetX: target.x,
                targetY: target.y,
                labelX: (source.x + target.x) / 2,
                labelY: (source.y + target.y) / 2,
                path: routing.path,
            };
        }

        const deltaX =
            targetPosition.x - sourcePosition.x;
        const deltaY =
            targetPosition.y - sourcePosition.y;

        const mostlyVertical =
            Math.abs(deltaY) >= Math.abs(deltaX);

        if (mostlyVertical) {
            const direction = Math.sign(deltaY) || 1;
            const sourceDimensions =
                this.deviceDimensions(sourcePosition.deviceId);
            const targetDimensions =
                this.deviceDimensions(targetPosition.deviceId);
            const sourceX = sourcePosition.x;
            const sourceY =
                sourcePosition.y
                + (
                    direction
                    * sourceDimensions.height
                    / 2
                );
            const targetX = targetPosition.x;
            const targetY =
                targetPosition.y
                - (
                    direction
                    * targetDimensions.height
                    / 2
                );
            const middleY = (sourceY + targetY) / 2;

            return {
                sourceX,
                sourceY,
                targetX,
                targetY,
                labelX: (sourceX + targetX) / 2,
                labelY: middleY,
                path: [
                    `M ${sourceX} ${sourceY}`,
                    `C ${sourceX} ${middleY}`,
                    `${targetX} ${middleY}`,
                    `${targetX} ${targetY}`,
                ].join(" "),
            };
        }

        const direction = Math.sign(deltaX) || 1;
        const sourceDimensions =
            this.deviceDimensions(sourcePosition.deviceId);
        const targetDimensions =
            this.deviceDimensions(targetPosition.deviceId);
        const sourceX =
            sourcePosition.x
            + (
                direction
                * sourceDimensions.width
                / 2
            );
        const sourceY = sourcePosition.y;
        const targetX =
            targetPosition.x
            - (
                direction
                * targetDimensions.width
                / 2
            );
        const targetY = targetPosition.y;
        const middleX = (sourceX + targetX) / 2;

        return {
            sourceX,
            sourceY,
            targetX,
            targetY,
            labelX: middleX,
            labelY: (sourceY + targetY) / 2,
            path: [
                `M ${sourceX} ${sourceY}`,
                `C ${middleX} ${sourceY}`,
                `${middleX} ${targetY}`,
                `${targetX} ${targetY}`,
            ].join(" "),
        };
    }

    renderDevices(svg, devices, positions) {
        const layer = svg.querySelector(
            ".topology-canvas__devices",
        );

        for (const [order, device] of devices.entries()) {
            const position = positions[device.device_id];

            if (!position) {
                continue;
            }

            if (this.isDeviceHidden(device)) {
                continue;
            }

            const renderedDevice = this.createDevice(
                device,
                position,
                order,
            );

            layer.append(renderedDevice);
        }
    }

    fitVisibleDeviceLabels(svg) {
        for (const label of svg.querySelectorAll(
            ".topology-device__label",
        )) {
            this.fitDeviceLabel(label);
        }
    }

    createDevice(device, position, order = 0) {
        const dimensions = this.deviceDimensions(device);
        const width = dimensions.width;
        const height = dimensions.height;
        const compact = this.isCompactDevice(device);
        const normalizedKind = this.normalizeClassName(
            device.kind,
        );
        const radioGroupKind = this.radioGroupKind(device);
        const health = this.deviceStatus(device);
        const presence =
            this.devicePresenceStatus(device);

        const group = this.createSvgElement("g");

        group.classList.add(
            "topology-device",
            `topology-device--${normalizedKind}`,
            `topology-device--health-${health}`,
        );
        group.dataset.deviceId = device.device_id;

        if (compact) {
            group.classList.add("topology-device--compact");
        }

        if (radioGroupKind) {
            group.classList.add(
                `topology-device--radio-${radioGroupKind}`,
            );
            group.dataset.radioGroup = radioGroupKind;
        }

        if (presence) {
            group.classList.add(
                `topology-device--presence-${presence}`,
            );
            group.dataset.presenceStatus =
                presence;
        }

        group.style.setProperty(
            "--topology-order",
            order,
        );
        group.style.setProperty(
            "--topology-motion-delay",
            `${this.deviceMotionDelay(device.device_id)}s`,
        );
        group.setAttribute("tabindex", "0");

        if (device.device_id === this.selectedDeviceId) {
            group.classList.add(
                "topology-device--selected",
            );
        }
        group.setAttribute(
            "transform",
            `translate(`
            + `${position.x - width / 2} `
            + `${position.y - height / 2}`
            + `)`,
        );
        group.setAttribute("role", "button");
        group.setAttribute("aria-selected", "false");
        group.setAttribute(
            "aria-label",
            [
                device.label,
                this.formatKind(device.kind),
                this.formatHealthStatus(health),
                presence
                    ? this.formatPresenceStatus(
                        presence,
                    )
                    : null,
            ].filter(Boolean).join(", "),
        );

        const title = this.createDeviceTitle(
            device,
            health,
            presence,
        );
        const halo = this.createDeviceHalo(
            width,
            height,
        );
        const card = this.createDeviceCard(
            width,
            height,
        );
        const iconBackground =
            this.createIconBackground(compact);
        const icon = this.createDeviceIcon(
            device.kind,
            compact,
        );
        const kind = this.createDeviceKind(device.kind);
        const label = this.createDeviceLabel(
            device.label,
            compact,
        );
        const detail = this.createDeviceDetail(device);
        const healthIndicator =
            this.createHealthIndicator(
                health,
                compact,
            );
        const presenceIndicator =
            this.createPresenceIndicator(
                presence,
                compact,
            );

        if (compact) {
            detail.classList.add(
                "topology-device__detail--hidden",
            );
        }

        group.append(
            title,
            halo,
            card,
            iconBackground,
            icon,
            kind,
            label,
            detail,
            healthIndicator,
            ...(presenceIndicator
                ? [presenceIndicator]
                : []),
        );
        group.addEventListener("click", (event) => {
            event.stopPropagation();
            this.selectDevice(device.device_id);
        });

        group.addEventListener("keydown", (event) => {
            if (
                event.key === "Enter"
                || event.key === " "
            ) {
                event.preventDefault();
                event.stopPropagation();
                this.selectDevice(device.device_id);
            }
        });

        group.addEventListener(
            "pointerdown",
            (event) => {
                event.stopPropagation();
            },
        );
        return group;
    }

    deviceMotionDelay(deviceId) {
        const normalizedId = String(deviceId ?? "");
        let seed = 0;

        for (const character of normalizedId) {
            seed = (seed + character.codePointAt(0)) % 5;
        }

        return -(seed * 0.45);
    }


    createDeviceTitle(
        device,
        health,
        presence,
    ) {
        const title = this.createSvgElement("title");
        const details = [
            device.label,
            this.formatKind(device.kind),
            this.deviceRole(device),
            this.deviceTechnicalDetail(device),
            this.formatHealthStatus(health),
            presence
                ? this.formatPresenceStatus(
                    presence,
                )
                : null,
        ].filter(Boolean);

        title.textContent = details.join(" — ");

        return title;
    }

    devicePresenceStatus(device) {
        const presence =
            this.devicePresence[device.device_id];

        if (
            device.metadata
                ?.network_presence_enabled === false
        ) {
            return null;
        }

        if (!device.address && !presence) {
            return null;
        }

        return this.normalizePresenceStatus(
            presence?.status,
        );
    }

    normalizePresenceStatus(status) {
        const normalized = String(
            status ?? "unknown",
        ).toLowerCase();
        const supported = new Set([
            "present",
            "absent",
            "unknown",
        ]);

        return supported.has(normalized)
            ? normalized
            : "unknown";
    }

    formatPresenceStatus(status) {
        const labels = {
            present: "Présence réseau : présent",
            absent: "Présence réseau : absent",
            unknown: "Présence réseau : inconnue",
        };

        return labels[
            this.normalizePresenceStatus(status)
        ];
    }

    createPresenceIndicator(status, compact = false) {
        if (!status) {
            return null;
        }

        const normalized =
            this.normalizePresenceStatus(status);
        const group = this.createSvgElement("g");

        group.classList.add(
            "topology-device__presence",
            `topology-device__presence--${normalized}`,
        );
        group.setAttribute(
            "transform",
            compact
                ? "translate(106 21)"
                : "translate(198 25)",
        );
        group.setAttribute("role", "img");
        group.setAttribute(
            "aria-label",
            this.formatPresenceStatus(normalized),
        );

        const title = this.createSvgElement(
            "title",
        );
        title.textContent =
            this.formatPresenceStatus(normalized);

        const ring = this.createSvgElement(
            "circle",
        );
        ring.classList.add(
            "topology-device__presence-ring",
        );
        ring.setAttribute("r", 8);

        const indicator = this.createSvgElement(
            "circle",
        );
        indicator.classList.add(
            "topology-device__presence-indicator",
        );
        indicator.setAttribute("r", 4);

        group.append(
            title,
            ring,
            indicator,
        );

        return group;
    }

    createDeviceHalo(width, height) {
        const halo = this.createSvgElement("rect");

        halo.classList.add("topology-device__halo");
        halo.setAttribute("x", -8);
        halo.setAttribute("y", -8);
        halo.setAttribute("width", width + 16);
        halo.setAttribute("height", height + 16);
        halo.setAttribute("rx", 24);
        halo.setAttribute("ry", 24);

        return halo;
    }

    createDeviceCard(width, height) {
        const card = this.createSvgElement("rect");

        card.classList.add("topology-device__card");
        card.setAttribute("width", width);
        card.setAttribute("height", height);
        card.setAttribute("rx", 18);
        card.setAttribute("ry", 18);
        card.setAttribute(
            "filter",
            "url(#device-shadow)",
        );

        return card;
    }

    createIconBackground(compact = false) {
        const background = this.createSvgElement(
            "circle",
        );

        background.classList.add(
            "topology-device__icon-background",
        );
        background.setAttribute("cx", compact ? 28 : 42);
        background.setAttribute("cy", compact ? 32 : 48);
        background.setAttribute("r", compact ? 18 : 25);

        return background;
    }

    createDeviceKind(kind) {
        const text = this.createSvgElement("text");

        text.classList.add("topology-device__kind");
        text.setAttribute("x", 78);
        text.setAttribute("y", 29);
        text.textContent = this.formatKind(kind);

        return text;
    }

    createDeviceLabel(label, compact = false) {
        const text = this.createSvgElement("text");
        const normalizedLabel = String(label ?? "");
        const labelLength = Array.from(
            normalizedLabel,
        ).length;

        text.classList.add("topology-device__label");

        if (labelLength >= 17) {
            text.classList.add(
                "topology-device__label--long",
            );
        }

        if (labelLength >= 23) {
            text.classList.add(
                "topology-device__label--very-long",
            );
        }

        text.setAttribute("x", compact ? 62 : 78);
        text.setAttribute("y", compact ? 80 : 58);

        if (compact) {
            text.setAttribute("text-anchor", "middle");
        }
        text.dataset.fullLabel = normalizedLabel;
        text.dataset.compact = String(compact);
        text.textContent = normalizedLabel;

        return text;
    }

    fitDeviceLabel(text) {
        if (
            !text
            || typeof text.getComputedTextLength
                !== "function"
        ) {
            return;
        }

        const fullLabel = text.dataset.fullLabel
            ?? text.textContent
            ?? "";
        const maximumWidth =
            text.dataset.compact === "true"
                ? TopologyCanvas.COMPACT_DEVICE_LABEL_MAX_WIDTH
                : TopologyCanvas.DEVICE_LABEL_MAX_WIDTH;
        let measuredWidth;

        try {
            measuredWidth = text.getComputedTextLength();
        } catch {
            return;
        }

        if (
            !Number.isFinite(measuredWidth)
            || measuredWidth <= maximumWidth
            || measuredWidth <= 0
        ) {
            return;
        }

        const computedFontSize = Number.parseFloat(
            window.getComputedStyle(text).fontSize,
        );
        const currentFontSize =
            Number.isFinite(computedFontSize)
                ? computedFontSize
                : 21;
        const fittedFontSize = Math.max(
            TopologyCanvas.DEVICE_LABEL_MIN_FONT_SIZE,
            currentFontSize
                * maximumWidth
                / measuredWidth,
        );

        text.style.fontSize = `${fittedFontSize}px`;

        try {
            measuredWidth = text.getComputedTextLength();
        } catch {
            return;
        }

        if (measuredWidth <= maximumWidth) {
            return;
        }

        const characters = Array.from(fullLabel);
        let lowerBound = 0;
        let upperBound = characters.length;

        while (lowerBound < upperBound) {
            const midpoint = Math.ceil(
                (lowerBound + upperBound) / 2,
            );

            text.textContent = [
                ...characters.slice(0, midpoint),
                "…",
            ].join("");

            if (
                text.getComputedTextLength()
                <= maximumWidth
            ) {
                lowerBound = midpoint;
            } else {
                upperBound = midpoint - 1;
            }
        }

        text.textContent = [
            ...characters.slice(0, lowerBound),
            "…",
        ].join("");
    }

    createDeviceDetail(device) {
        const text = this.createSvgElement("text");

        text.classList.add("topology-device__detail");
        text.setAttribute("x", 78);
        text.setAttribute("y", 84);
        text.textContent = this.deviceDetail(device);

        return text;
    }

    deviceDetail(device) {
        return this.deviceTechnicalDetail(device)
            ?? this.deviceRole(device)
            ?? device.device_id;
    }

    deviceRole(device) {
        if (!device.metadata?.role) {
            return null;
        }

        return this.formatMetadataLabel(
            device.metadata.role,
        );
    }

    deviceTechnicalDetail(device) {
        if (device.address) {
            return device.address;
        }

        if (device.metadata?.model) {
            return device.metadata.model;
        }

        if (device.node_id) {
            return device.node_id;
        }

        return null;
    }

    deviceStatus(device) {
        if (!device) {
            return "unknown";
        }

        const status =
            this.deviceHealth[device.device_id]
            ?? "unknown";

        return this.normalizeHealthStatus(status);
    }

    normalizeHealthStatus(status) {
        const normalized = String(
            status ?? "unknown",
        ).toLowerCase();

        const aliases = {
            unavailable: "unhealthy",
            stale: "degraded",
        };
        const visualStatus = aliases[normalized]
            ?? normalized;

        const supportedStatuses = new Set([
            "healthy",
            "degraded",
            "unhealthy",
            "unknown",
        ]);

        return supportedStatuses.has(visualStatus)
            ? visualStatus
            : "unknown";
    }

    formatHealthStatus(status) {
        const labels = {
            healthy: "Sain",
            degraded: "Dégradé",
            unhealthy: "Indisponible",
            unknown: "Inconnu",
        };

        return labels[
            this.normalizeHealthStatus(status)
        ];
    }

    createHealthIndicator(status, compact = false) {
        const normalized =
            this.normalizeHealthStatus(status);

        const group = this.createSvgElement("g");

        group.classList.add(
            "topology-device__health",
            `topology-device__health--${normalized}`,
        );
        group.setAttribute(
            "transform",
            compact
                ? "translate(54 34)"
                : "translate(151 104)",
        );

        const background = this.createSvgElement(
            "rect",
        );

        background.classList.add(
            "topology-device__health-background",
        );
        background.setAttribute("x", 0);
        background.setAttribute("y", -15);
        background.setAttribute("width", compact ? 43 : 58);
        background.setAttribute("height", 25);
        background.setAttribute("rx", 12.5);

        const indicator = this.createSvgElement(
            "circle",
        );

        indicator.classList.add(
            "topology-device__health-indicator",
        );
        indicator.setAttribute("cx", 12);
        indicator.setAttribute("cy", -2);
        indicator.setAttribute("r", 4);

        const label = this.createSvgElement("text");

        label.classList.add(
            "topology-device__health-label",
        );
        label.setAttribute("x", compact ? 21 : 22);
        label.setAttribute("y", -1);
        label.textContent = this.healthShortLabel(
            normalized,
            compact,
        );

        group.append(
            background,
            indicator,
            label,
        );

        return group;
    }

    healthShortLabel(status, compact = false) {
        if (compact) {
            const compactLabels = {
                healthy: "OK",
                degraded: "!",
                unhealthy: "KO",
                unknown: "?",
            };

            return compactLabels[status] ?? "?";
        }

        const labels = {
            healthy: "OK",
            degraded: "WARN",
            unhealthy: "DOWN",
            unknown: "N/A",
        };

        return labels[status] ?? "N/A";
    }

    createDeviceIcon(kind, compact = false) {
        const foreignObject = this.createSvgElement(
            "foreignObject",
        );
        const icon = document.createElement("span");
        const iconPath = this.deviceIconPath(kind);

        foreignObject.classList.add(
            "topology-device__icon",
        );
        foreignObject.setAttribute("x", compact ? 15 : 27);
        foreignObject.setAttribute("y", compact ? 19 : 33);
        foreignObject.setAttribute("width", 30);
        foreignObject.setAttribute("height", 30);
        foreignObject.setAttribute(
            "aria-hidden",
            "true",
        );

        icon.classList.add(
            "topology-device__official-icon",
        );
        icon.style.setProperty(
            "--topology-device-icon",
            `url("${iconPath}")`,
        );

        foreignObject.append(icon);

        return foreignObject;
    }

    deviceIconPath(kind) {
        const iconPaths = {
            internet:
                "/ui/assets/icons/network/globe-2.svg",
            router:
                "/ui/assets/icons/network/router.svg",
            switch:
                "/ui/assets/icons/infrastructure/network.svg",
            access_point:
                "/ui/assets/icons/network/wifi.svg",
            server:
                "/ui/assets/icons/infrastructure/server.svg",
            raspberry_pi:
                "/ui/assets/icons/hardware/cpu.svg",
            home_assistant:
                "/ui/assets/icons/hardware/house.svg",
            camera:
                "/ui/assets/icons/hardware/camera.svg",
            smart_device:
                "/ui/assets/icons/hardware/plug-zap.svg",
            zwave_module:
                "/ui/assets/icons/protocols/zwave.svg",
            solar:
                "/ui/assets/icons/hardware/battery-charging.svg",
            computer:
                "/ui/assets/icons/containers-cloud/monitor-cog.svg",
            storage:
                "/ui/assets/icons/hardware/hard-drive.svg",
            other:
                "/ui/assets/icons/infrastructure/boxes.svg",
        };
        const normalizedKind = String(
            kind ?? "other",
        ).toLowerCase();

        return iconPaths[normalizedKind]
            ?? iconPaths.other;
    }

    createInternetIcon() {
        const group = this.createSvgElement("g");
        const globe = this.createSvgElement("circle");
        const vertical = this.createSvgElement("path");
        const horizontal = this.createSvgElement("path");

        globe.setAttribute("cx", 15);
        globe.setAttribute("cy", 15);
        globe.setAttribute("r", 12);

        vertical.setAttribute(
            "d",
            "M 15 3 C 9 9 9 21 15 27 "
            + "M 15 3 C 21 9 21 21 15 27",
        );
        horizontal.setAttribute(
            "d",
            "M 4 10 H 26 M 4 20 H 26",
        );

        group.append(
            globe,
            vertical,
            horizontal,
        );

        return group;
    }

    createRouterIcon() {
        const group = this.createSvgElement("g");
        const body = this.createSvgElement("rect");
        const antennaLeft = this.createSvgElement("path");
        const antennaRight = this.createSvgElement("path");
        const lightOne = this.createSvgElement("circle");
        const lightTwo = this.createSvgElement("circle");

        body.setAttribute("x", 3);
        body.setAttribute("y", 11);
        body.setAttribute("width", 24);
        body.setAttribute("height", 13);
        body.setAttribute("rx", 3);

        antennaLeft.setAttribute("d", "M 8 11 V 4");
        antennaRight.setAttribute("d", "M 22 11 V 4");

        lightOne.setAttribute("cx", 10);
        lightOne.setAttribute("cy", 18);
        lightOne.setAttribute("r", 1.5);

        lightTwo.setAttribute("cx", 16);
        lightTwo.setAttribute("cy", 18);
        lightTwo.setAttribute("r", 1.5);

        group.append(
            body,
            antennaLeft,
            antennaRight,
            lightOne,
            lightTwo,
        );

        return group;
    }

    createSwitchIcon() {
        const group = this.createSvgElement("g");
        const body = this.createSvgElement("rect");

        body.setAttribute("x", 2);
        body.setAttribute("y", 7);
        body.setAttribute("width", 26);
        body.setAttribute("height", 17);
        body.setAttribute("rx", 3);

        group.append(body);

        for (let index = 0; index < 4; index += 1) {
            const port = this.createSvgElement("rect");

            port.setAttribute(
                "x",
                6 + index * 5,
            );
            port.setAttribute("y", 13);
            port.setAttribute("width", 3);
            port.setAttribute("height", 4);
            port.setAttribute("rx", 0.5);

            group.append(port);
        }

        return group;
    }

    createAccessPointIcon() {
        const group = this.createSvgElement("g");
        const base = this.createSvgElement("circle");
        const waveOne = this.createSvgElement("path");
        const waveTwo = this.createSvgElement("path");
        const waveThree = this.createSvgElement("path");

        base.setAttribute("cx", 15);
        base.setAttribute("cy", 24);
        base.setAttribute("r", 2);

        waveOne.setAttribute(
            "d",
            "M 10 20 A 7 7 0 0 1 20 20",
        );
        waveTwo.setAttribute(
            "d",
            "M 6 16 A 12 12 0 0 1 24 16",
        );
        waveThree.setAttribute(
            "d",
            "M 2 12 A 18 18 0 0 1 28 12",
        );

        group.append(
            base,
            waveOne,
            waveTwo,
            waveThree,
        );

        return group;
    }

    createHomeIcon() {
        const group = this.createSvgElement("g");
        const home = this.createSvgElement("path");

        home.setAttribute(
            "d",
            "M 3 14 L 15 4 L 27 14 "
            + "V 27 H 19 V 19 H 11 V 27 H 3 Z",
        );

        group.append(home);

        return group;
    }

    createComputerIcon() {
        const group = this.createSvgElement("g");
        const screen = this.createSvgElement("rect");
        const stand = this.createSvgElement("path");

        screen.setAttribute("x", 3);
        screen.setAttribute("y", 4);
        screen.setAttribute("width", 24);
        screen.setAttribute("height", 17);
        screen.setAttribute("rx", 2);

        stand.setAttribute(
            "d",
            "M 15 21 V 26 M 9 27 H 21",
        );

        group.append(screen, stand);

        return group;
    }

    createServerIcon() {
        const group = this.createSvgElement("g");

        for (let index = 0; index < 3; index += 1) {
            const unit = this.createSvgElement("rect");

            unit.setAttribute("x", 4);
            unit.setAttribute(
                "y",
                3 + index * 9,
            );
            unit.setAttribute("width", 22);
            unit.setAttribute("height", 7);
            unit.setAttribute("rx", 1.5);

            group.append(unit);
        }

        return group;
    }

    createStorageIcon() {
        const group = this.createSvgElement("g");
        const disk = this.createSvgElement("path");

        disk.setAttribute(
            "d",
            "M 4 7 C 4 2 26 2 26 7 "
            + "V 23 C 26 28 4 28 4 23 Z "
            + "M 4 7 C 4 12 26 12 26 7 "
            + "M 4 15 C 4 20 26 20 26 15",
        );

        group.append(disk);

        return group;
    }

    createCameraIcon() {
        const group = this.createSvgElement("g");
        const body = this.createSvgElement("rect");
        const lens = this.createSvgElement("circle");
        const mount = this.createSvgElement("path");

        body.setAttribute("x", 3);
        body.setAttribute("y", 7);
        body.setAttribute("width", 24);
        body.setAttribute("height", 16);
        body.setAttribute("rx", 3);

        lens.setAttribute("cx", 15);
        lens.setAttribute("cy", 15);
        lens.setAttribute("r", 5);

        mount.setAttribute("d", "M 11 23 V 27 H 19");

        group.append(body, lens, mount);

        return group;
    }

    createSmartDeviceIcon() {
        const group = this.createSvgElement("g");
        const plug = this.createSvgElement("path");

        plug.setAttribute(
            "d",
            "M 9 4 V 11 M 21 4 V 11 "
            + "M 7 11 H 23 V 15 "
            + "A 8 8 0 0 1 15 23 "
            + "A 8 8 0 0 1 7 15 Z "
            + "M 15 23 V 28",
        );

        group.append(plug);

        return group;
    }

    createSolarIcon() {
        const group = this.createSvgElement("g");
        const sun = this.createSvgElement("circle");
        const rays = this.createSvgElement("path");

        sun.setAttribute("cx", 15);
        sun.setAttribute("cy", 15);
        sun.setAttribute("r", 6);

        rays.setAttribute(
            "d",
            "M 15 2 V 6 M 15 24 V 28 "
            + "M 2 15 H 6 M 24 15 H 28 "
            + "M 6 6 L 9 9 M 21 21 L 24 24 "
            + "M 24 6 L 21 9 M 9 21 L 6 24",
        );

        group.append(sun, rays);

        return group;
    }

    createGenericIcon() {
        const group = this.createSvgElement("g");
        const shape = this.createSvgElement("rect");

        shape.setAttribute("x", 4);
        shape.setAttribute("y", 4);
        shape.setAttribute("width", 22);
        shape.setAttribute("height", 22);
        shape.setAttribute("rx", 5);

        group.append(shape);

        return group;
    }

    formatBandwidth(value) {
        const bandwidth = Number(value);

        if (!Number.isFinite(bandwidth)) {
            return "—";
        }

        if (bandwidth >= 1000) {
            const gigabits = bandwidth / 1000;

            return `${Number.isInteger(gigabits)
                ? gigabits
                : gigabits.toFixed(1)} Gb`;
        }

        return `${bandwidth} Mb`;
    }

    updateLayoutLabel() {
        if (!this.layoutLabel || !this.layout) {
            return;
        }

        this.layoutLabel.textContent =
            this.layout.label;
    }

    normalizeClassName(value) {
        return String(value ?? "other")
            .trim()
            .toLowerCase()
            .replaceAll("_", "-")
            .replace(/[^a-z0-9-]/g, "");
    }

    formatKind(value) {
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

        return labels[value] ?? this.formatMetadataLabel(
            value ?? "other",
        );
    }

    formatMetadataLabel(value) {
        const normalized = String(value ?? "")
            .replaceAll("_", " ")
            .trim();

        if (!normalized) {
            return "";
        }

        return (
            normalized.charAt(0).toUpperCase()
            + normalized.slice(1)
        );
    }

    selectDevice(deviceId) {
        this.setSelectedDevice(deviceId);
        this.onDeviceSelected?.(deviceId);
    }

    setSelectedDevice(deviceId) {
        this.selectedDeviceId = deviceId;

        const devices = this.container.querySelectorAll(
            ".topology-device",
        );
        const links = this.container.querySelectorAll(
            ".topology-link",
        );
        const connectedDeviceIds = new Set([deviceId]);

        for (const link of links) {
            const connected =
                link.dataset.sourceDeviceId === deviceId
                || link.dataset.targetDeviceId === deviceId;

            link.classList.toggle(
                "topology-link--focused",
                connected,
            );
            link.classList.toggle(
                "topology-link--dimmed",
                !connected,
            );

            if (connected) {
                connectedDeviceIds.add(
                    link.dataset.sourceDeviceId,
                );
                connectedDeviceIds.add(
                    link.dataset.targetDeviceId,
                );
            }
        }

        for (const device of devices) {
            const selected =
                device.dataset.deviceId === deviceId;
            const connected = connectedDeviceIds.has(
                device.dataset.deviceId,
            );

            device.classList.toggle(
                "topology-device--selected",
                selected,
            );
            device.classList.toggle(
                "topology-device--connected",
                connected && !selected,
            );
            device.classList.toggle(
                "topology-device--dimmed",
                !connected,
            );

            device.setAttribute(
                "aria-selected",
                String(selected),
            );
        }
    }

    createSvgElement(tagName) {
        return document.createElementNS(
            TopologyCanvas.SVG_NAMESPACE,
            tagName,
        );
    }

    escapeHtml(value) {
        const element = document.createElement("div");

        element.textContent = String(value ?? "");

        return element.innerHTML;
    }
}

window.TopologyCanvas = TopologyCanvas;
