"""Tests for the static topology canvas component."""

from fastapi.testclient import TestClient

from ohana_vision.web import create_app


def make_client() -> TestClient:
    """Create an Ohana-Vision application client."""
    return TestClient(create_app())


def test_topology_canvas_uses_svg() -> None:
    """The topology canvas must render an SVG document."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert '"http://www.w3.org/2000/svg"' in response.text
    assert '"svg"' in response.text


def test_topology_canvas_renders_curved_links() -> None:
    """The topology canvas must render curved topology links."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "renderLinks(" in response.text
    assert "createLink(" in response.text
    assert "linkCoordinates(" in response.text
    assert '"path"' in response.text


def test_topology_canvas_routes_links_around_devices() -> None:
    """Link routing must use free lanes and distinct card anchors."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "distributeLinkAnchors(" in response.text
    assert "linkRouteCandidates(" in response.text
    assert "linkRouteScore(" in response.text
    assert "linkSegmentIntersectsObstacle(" in response.text
    assert "roundedLinkPath(" in response.text


def test_topology_canvas_does_not_render_link_connectors() -> None:
    """Links must join device cards without endpoint circles."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "createLinkConnector(" not in response.text
    assert '"topology-link__connector"' not in response.text


def test_topology_canvas_renders_devices() -> None:
    """The topology canvas must render topology devices."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "renderDevices(" in response.text
    assert "createDevice(" in response.text
    assert '"rect"' in response.text


def test_topology_canvas_prefers_physical_layout() -> None:
    """The topology canvas must prefer the physical layout."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert 'layout.kind === "physical"' in response.text


def test_topology_canvas_waits_for_agent_configuration() -> None:
    """The empty topology must explain that Agent has not synchronized yet."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "En attente de la configuration transmise par Ohana-Agent." in response.text


def test_topology_canvas_skips_unpositioned_elements() -> None:
    """Elements without layout positions must be safely ignored."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "if (!sourcePosition || !targetPosition)" in response.text
    assert "if (!position)" in response.text


def test_topology_canvas_renders_device_icons() -> None:
    """The topology canvas must render icons by device kind."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "createDeviceIcon(" in response.text
    assert "createInternetIcon(" in response.text
    assert "createRouterIcon(" in response.text
    assert "createSwitchIcon(" in response.text
    assert "createAccessPointIcon(" in response.text
    assert "createHomeIcon(" in response.text
    assert "createComputerIcon(" in response.text


def test_topology_canvas_does_not_render_link_labels() -> None:
    """Topology links must stay readable without inline labels."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "createLinkLabel(" not in response.text
    assert "linkLabel(" not in response.text
    assert '"topology-link__label"' not in response.text


def test_topology_canvas_uses_device_metadata() -> None:
    """Device cards must use topology metadata for details."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "device.metadata?.role" in response.text


def test_topology_canvas_applies_device_health() -> None:
    """The topology canvas must apply health to device cards."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "deviceStatus(" in response.text
    assert "normalizeHealthStatus(" in response.text
    assert "createHealthIndicator(" in response.text
    assert "topology-device--health-" in response.text


def test_topology_canvas_renders_network_presence() -> None:
    """Addressable devices must expose a discrete presence indicator."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")
    stylesheet = client.get("/ui/styles/topology.css")

    assert response.status_code == 200
    assert "devicePresenceStatus(" in response.text
    assert "createPresenceIndicator(" in response.text
    assert "topology-device--presence-" in response.text
    assert "topology-device__presence-indicator" in response.text
    assert "Présence réseau" in response.text
    assert "network_presence_enabled" in response.text
    assert stylesheet.status_code == 200
    assert ".topology-device__presence {" in stylesheet.text
    assert ".topology-device--presence-present {" in stylesheet.text
    assert ".topology-device--presence-absent {" in stylesheet.text


def test_topology_canvas_applies_link_health() -> None:
    """The topology canvas must derive health for links."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "linkHealth(" in response.text
    assert "topology-link--health-" in response.text


def test_topology_canvas_supports_domain_health_statuses() -> None:
    """The canvas must support every domain health status."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert '"healthy"' in response.text
    assert '"degraded"' in response.text
    assert '"unhealthy"' in response.text
    assert '"unknown"' in response.text


def test_topology_canvas_supports_device_selection() -> None:
    """Topology devices must support pointer selection."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "onDeviceSelected" in response.text
    assert "selectDevice(" in response.text
    assert "setSelectedDevice(" in response.text
    assert "topology-device--selected" in response.text


def test_topology_canvas_supports_keyboard_selection() -> None:
    """Topology devices must be selectable with the keyboard."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert '"Enter"' in response.text
    assert '" "' in response.text
    assert 'setAttribute("tabindex", "0")' in response.text


def test_static_ui_contains_device_details_panel() -> None:
    """The dashboard must expose the premium device details panel."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert 'id="device-details"' in response.text
    assert 'id="device-details-icon"' in response.text
    assert 'id="device-details-title"' in response.text
    assert 'id="device-details-primary"' in response.text
    assert 'id="device-details-health"' in response.text
    assert 'id="device-details-supervision"' in response.text
    assert 'id="device-services-list"' in response.text
    assert 'id="device-services-count"' in response.text
    assert 'id="device-details-manufacturer"' not in response.text
    assert 'id="device-details-model"' not in response.text
    assert 'id="device-links-list"' in response.text


def test_device_details_renders_hosted_services() -> None:
    """Selected devices must expose configured hosted services."""
    client = make_client()

    response = client.get("/ui/device_details.js")

    assert response.status_code == 200
    assert "renderServices(device)" in response.text
    assert "servicesForDevice(device)" in response.text
    assert "device.metadata?.services" in response.text
    assert "service.name ?? service.service_id" in response.text
    assert "this.state.timeline?.nodes" in response.text
    assert "device-details__service" in response.text


def test_topology_canvas_supports_zoom() -> None:
    """The topology canvas must support controlled zoom."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "zoomIn(" in response.text
    assert "zoomOut(" in response.text
    assert "zoomAtPoint(" in response.text
    assert "MIN_ZOOM" in response.text
    assert "MAX_ZOOM" in response.text


def test_topology_canvas_supports_pan() -> None:
    """The topology canvas must support pointer panning."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "handlePointerDown(" in response.text
    assert "handlePointerMove(" in response.text
    assert "handlePointerUp(" in response.text
    assert "setPointerCapture(" in response.text


def test_topology_canvas_supports_wheel_navigation() -> None:
    """The topology canvas must support mouse wheel zoom."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "handleWheel(" in response.text
    assert '"wheel"' in response.text
    assert "passive: false" in response.text


def test_topology_canvas_can_reset_view() -> None:
    """The topology canvas must restore its initial viewport."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "resetView(" in response.text
    assert "initialViewBox" in response.text


def test_topology_canvas_can_fit_content_to_viewport() -> None:
    """The topology canvas must fit devices to the visible area."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "contentBounds(" in response.text
    assert "fitContentToViewport(" in response.text
    assert "getBoundingClientRect(" in response.text
    assert "requestAnimationFrame(" in response.text


def test_topology_canvas_styles_link_kinds() -> None:
    """Topology links must expose protocol-specific styles."""
    client = make_client()

    response = client.get("/ui/styles/topology.css")

    assert response.status_code == 200
    assert ".topology-link--visual-ethernet" in response.text
    assert ".topology-link--visual-ethernet-100m" in response.text
    assert ".topology-link--visual-ethernet-1g" in response.text
    assert ".topology-link--visual-ethernet-2-5g" in response.text
    assert ".topology-link--visual-ethernet-5g" in response.text
    assert ".topology-link--visual-ethernet-8g" in response.text
    assert ".topology-link--visual-ethernet-10g" in response.text
    assert ".topology-link--visual-wifi" in response.text
    assert ".topology-link--visual-fiber" in response.text
    assert ".topology-link--visual-wireguard" in response.text
    assert ".topology-link--visual-mqtt" in response.text
    assert ".topology-link--visual-usb" in response.text
    assert ".topology-link--visual-serial" in response.text


def test_topology_canvas_derives_fiber_and_bandwidth_styles() -> None:
    """Links must expose fibre and negotiated Ethernet capacities."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "linkVisualKind(link)" in response.text
    assert 'link.metadata?.role === "internet_uplink"' in response.text
    assert 'return "fiber"' in response.text
    assert 'return "ethernet-100m"' in response.text
    assert 'return "ethernet-1g"' in response.text
    assert 'return "ethernet-2-5g"' in response.text
    assert 'return "ethernet-5g"' in response.text
    assert 'return "ethernet-8g"' in response.text
    assert 'return "ethernet-10g"' in response.text
    assert "`topology-link--visual-${normalizedVisualKind}`" in response.text
    assert "group.dataset.visualKind" in response.text
    assert "group.dataset.bandwidthMbps" in response.text


def test_topology_links_use_capacity_colours() -> None:
    """Link colours must communicate technology and bandwidth."""
    client = make_client()

    response = client.get("/ui/styles/topology.css")

    assert response.status_code == 200
    assert ".topology-link--visual-fiber" in response.text
    assert "--link-color: #a78bfa;" in response.text
    assert ".topology-link--visual-wifi" in response.text
    assert "--link-color: #38bdf8;" in response.text
    assert ".topology-link--visual-ethernet-100m" in response.text
    assert "--link-color: #ff6b6b;" in response.text
    assert ".topology-link--visual-ethernet-1g" in response.text
    assert "--link-color: #ff9f43;" in response.text
    assert ".topology-link--visual-ethernet-2-5g" in response.text
    assert "--link-color: #ffd166;" in response.text
    assert ".topology-link--visual-ethernet-5g" in response.text
    assert "--link-color: #55d68b;" in response.text
    assert ".topology-link--visual-ethernet-8g" in response.text
    assert "--link-color: #38d9c5;" in response.text
    assert ".topology-link--visual-ethernet-10g" in response.text
    assert "--link-color: #4debff;" in response.text
    assert ".topology-link--health-healthy {" not in response.text
    assert ".topology-link--health-degraded {" not in response.text
    assert ".topology-link--health-unhealthy {" not in response.text


def test_topology_canvas_renders_only_directional_arrows() -> None:
    """Only genuinely directional links must display an arrow."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "createDirectionMarker(" in response.text
    assert "applyLinkDirection(" in response.text
    assert 'direction === "source_to_target"' in response.text
    assert '"marker-end"' in response.text
    assert '"marker-start"' not in response.text
    assert "Bidirectional links intentionally have no arrow." in response.text


def test_topology_canvas_applies_derived_link_health() -> None:
    """Rendered links must receive their derived endpoint health."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "this.linkHealth(routedLink.link)" in response.text


def test_topology_canvas_renders_health_halos() -> None:
    """Device cards must expose a health halo layer."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "createDeviceHalo(" in response.text
    assert '"topology-device__halo"' in response.text


def test_topology_canvas_focuses_connected_path() -> None:
    """Selecting a device must highlight its direct topology path."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "sourceDeviceId" in response.text
    assert "targetDeviceId" in response.text
    assert '"topology-link--focused"' in response.text
    assert '"topology-link--dimmed"' in response.text
    assert '"topology-device--connected"' in response.text
    assert '"topology-device--dimmed"' in response.text


def test_topology_styles_animate_attention_states_accessibly() -> None:
    """Degraded and unhealthy halos must respect reduced motion."""
    client = make_client()

    response = client.get("/ui/styles/topology.css")

    assert response.status_code == 200
    assert "@keyframes topology-halo-pulse" in response.text
    assert "@keyframes topology-halo-alert" in response.text
    assert "prefers-reduced-motion: reduce" in response.text


def test_topology_canvas_staggers_animation_order() -> None:
    """Topology elements must expose a stable animation order."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert '"--topology-order"' in response.text
    assert "links.entries()" in response.text
    assert "devices.entries()" in response.text


def test_topology_styles_use_discreet_motion() -> None:
    """Topology motion must be contextual and unobtrusive."""
    client = make_client()

    response = client.get("/ui/styles/topology.css")

    assert response.status_code == 200
    assert "@keyframes topology-device-enter" in response.text
    assert "@keyframes topology-link-enter" in response.text
    assert "@keyframes topology-link-flow" in response.text
    assert "@keyframes topology-connector-pulse" not in response.text
    assert ".topology-link--focused" in response.text


def test_topology_device_entry_animation_preserves_svg_position() -> None:
    """Device entry motion must not override the SVG positioning transform."""
    client = make_client()

    response = client.get("/ui/styles/topology.css")

    assert response.status_code == 200
    animation = response.text.split(
        "@keyframes topology-device-enter",
        maxsplit=1,
    )[1].split("@keyframes topology-link-enter", maxsplit=1)[0]
    assert "transform:" not in animation


def test_topology_canvas_supports_pinch_zoom() -> None:
    """Touch users must be able to zoom with two pointers."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "activePointers" in response.text
    assert "currentPinchDistance(" in response.text
    assert "handlePinchZoom(" in response.text
    assert "Math.hypot(" in response.text


def test_topology_canvas_has_no_fixed_minimum_width() -> None:
    """The SVG must scale to narrow responsive viewports."""
    client = make_client()

    topology = client.get("/ui/styles/topology.css")
    responsive = client.get("/ui/styles/responsive.css")

    assert topology.status_code == 200
    assert responsive.status_code == 200
    assert "min-width: 64rem" not in topology.text
    assert "min-width: 48rem" not in responsive.text
    assert "min-width: 0" in topology.text


def test_topology_controls_keep_touch_sized_targets() -> None:
    """Map controls must remain comfortably usable by touch."""
    client = make_client()

    response = client.get("/ui/styles/topology.css")

    assert response.status_code == 200
    assert "min-width: 2.75rem" in response.text
    assert "height: 2.75rem" in response.text


def test_topology_canvas_assigns_stable_motion_delay() -> None:
    """Device halos must receive a stable desynchronisation delay."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "deviceMotionDelay(deviceId)" in response.text
    assert "device.device_id" in response.text
    assert '"--topology-motion-delay"' in response.text


def test_topology_css_implements_quiet_monitoring() -> None:
    """Only health halos must carry the quiet monitoring motion."""
    client = make_client()

    response = client.get("/ui/styles/topology.css")

    assert response.status_code == 200
    assert "topology-halo-breathe 5s" in response.text
    assert "topology-halo-pulse 2s" in response.text
    assert "topology-halo-alert 900ms" in response.text
    assert "animation-play-state: paused" in response.text
    assert "prefers-reduced-motion: reduce" in response.text


def test_topology_canvas_maps_domain_health_statuses_to_visual_states() -> None:
    """Domain unavailable and stale states must use visible topology styles."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert 'unavailable: "unhealthy"' in response.text
    assert 'stale: "degraded"' in response.text


def test_topology_canvas_renders_premium_device_cards() -> None:
    """Equipment cards must expose a rich but compact hierarchy."""
    client = make_client()

    javascript = client.get("/ui/topology_canvas.js")
    stylesheet = client.get("/ui/styles/topology.css")

    assert javascript.status_code == 200
    assert stylesheet.status_code == 200
    assert "createDeviceTitle(" in javascript.text
    assert "deviceRole(device)" in javascript.text
    assert "deviceTechnicalDetail(device)" in javascript.text
    assert 'group.setAttribute("role", "button")' in javascript.text
    assert "createDeviceAccent(" not in javascript.text
    assert "--device-accent: var(--accent);" in stylesheet.text
    assert ".topology-device--router {" not in stylesheet.text
    assert "letter-spacing: -0.01em;" in stylesheet.text


def test_topology_canvas_supports_collapsible_radio_groups() -> None:
    """Wi-Fi and Z-Wave leaves must be compact and collapsible."""
    client = make_client()

    javascript = client.get("/ui/topology_canvas.js")
    stylesheet = client.get("/ui/styles/topology.css")

    assert javascript.status_code == 200
    assert stylesheet.status_code == 200
    assert "COMPACT_DEVICE_WIDTH" in javascript.text
    assert "createRadioDeviceKindIndex(" in javascript.text
    assert "collapsedRadioGroups" in javascript.text
    assert "createRadioGroupControls(" in javascript.text
    assert "toggleRadioGroup(kind)" in javascript.text
    assert "isDeviceHidden(" in javascript.text
    assert "topology-device--compact" in javascript.text
    assert "topology-device--radio-wifi" in stylesheet.text
    assert "topology-device--radio-zwave" in stylesheet.text
    assert "topology-radio-control--wifi" in stylesheet.text
    assert "topology-radio-control--zwave" in stylesheet.text
    assert ".topology-link--visual-zwave" in stylesheet.text


def test_topology_canvas_uses_harmonized_zwave_buses() -> None:
    """Z-Wave nodes must share subtle radio trunks around their gateway."""
    client = make_client()

    javascript = client.get("/ui/topology_canvas.js")
    stylesheet = client.get("/ui/styles/topology.css")

    assert javascript.status_code == 200
    assert stylesheet.status_code == 200
    assert "zWaveBusGroups(" in javascript.text
    assert "renderZWaveBusGroup(" in javascript.text
    assert "createZWaveBus(" in javascript.text
    assert "COMPACT_DEVICE_LABEL_MAX_WIDTH = 104" in javascript.text
    assert 'text.setAttribute("text-anchor", "middle")' in javascript.text
    assert ".topology-link--zwave-bus" in stylesheet.text


def test_topology_canvas_supports_the_zwave_module_kind() -> None:
    """Z-Wave modules must have their own label and official radio icon."""
    client = make_client()

    page = client.get("/ui/")
    canvas = client.get("/ui/topology_canvas.js")
    utils = client.get("/ui/utils.js")

    assert page.status_code == 200
    assert canvas.status_code == 200
    assert utils.status_code == 200
    assert '<option value="zwave_module">Module Z-Wave</option>' in page.text
    assert 'zwave_module: "Module Z-Wave"' in canvas.text
    assert (
        'zwave_module: "/ui/assets/icons/protocols/radio-tower.svg"'
        in utils.text
    )


def test_topology_canvas_sizes_shared_link_anchors_from_their_device() -> None:
    """Several links on one device must not use an undefined identifier."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert (
        "const deviceId =\n"
        "            routedLinks[0].routing[endpoint].deviceId;" in response.text
    )
    assert "this.deviceDimensions(deviceId).width - 48" in response.text


def test_topology_device_title_preserves_complete_information() -> None:
    """Compact cards must retain full details in their SVG title."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert 'const title = this.createSvgElement("title")' in response.text
    assert 'details.join(" — ")' in response.text


def test_topology_device_long_labels_stay_inside_cards() -> None:
    """Long equipment names must be resized before they can overflow."""
    client = make_client()

    javascript = client.get("/ui/topology_canvas.js")
    stylesheet = client.get("/ui/styles/topology.css")

    assert javascript.status_code == 200
    assert stylesheet.status_code == 200
    assert "static DEVICE_LABEL_MAX_WIDTH = 128;" in javascript.text
    assert "fitDeviceLabel(" in javascript.text
    assert "getComputedTextLength()" in javascript.text
    assert "topology-device__label--long" in javascript.text
    assert "topology-device__label--very-long" in javascript.text
    assert ".topology-device__label--long {" in stylesheet.text
    assert ".topology-device__label--very-long {" in stylesheet.text


def test_topology_canvas_preserves_card_readability_on_compact_screens() -> None:
    """Compact screens must start with a readable, pannable viewport."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert 'window.matchMedia?.("(max-width: 620px)").matches' in response.text
    assert 'window.matchMedia?.("(max-width: 1199px)").matches' in response.text
    assert "compactMaximumWidth = mobileViewport" in response.text
    assert "? 960" in response.text
    assert ": 1800" in response.text
    assert "alignFromNetworkEntry" in response.text
    assert "content.x - padding" in response.text


def test_topology_canvas_renders_unified_tools_panel() -> None:
    """The topology must expose one unified controls and help panel."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "createToolsPanel()" in response.text
    assert 'className = "topology-tools-panel"' in response.text
    assert "findTopologyControls()" in response.text
    assert 'closest(".topology-workspace")' in response.text
    assert "Aide à la lecture" in response.text
    assert "Type de liaison" in response.text
    assert "États" in response.text
    assert "Fibre" in response.text
    assert "Débit · Ethernet uniquement" in response.text
    assert "Couleur + animation = capacité" in response.text
    assert "Cadence croissante selon le débit" in response.text
    assert ">100M<" in response.text
    assert ">1G<" in response.text
    assert ">2,5G<" in response.text
    assert ">5G<" in response.text
    assert ">8G<" in response.text
    assert ">10G<" in response.text
    assert "Saturation" not in response.text
    assert "WAN" not in response.text
    assert "Équipements" not in response.text
    assert "replaceChildren(svg, toolsPanel)" in response.text


def test_topology_tools_panel_can_collapse() -> None:
    """The reading help must be collapsible without hiding map controls."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "toolsPanelCollapsed" in response.text
    assert 'window.matchMedia?.("(max-width: 1199px)").matches' in response.text
    assert "toggleToolsPanel(panel, toggle)" in response.text
    assert '"aria-expanded"' in response.text
    assert '"topology-tools-panel--collapsed"' in response.text
    assert "Afficher l’aide à la lecture" in response.text
    assert "Masquer l’aide à la lecture" in response.text


def test_topology_tools_panel_is_fixed_and_responsive() -> None:
    """The tools panel must remain fixed outside the zoomed SVG."""
    client = make_client()

    response = client.get("/ui/styles/topology.css")

    assert response.status_code == 200
    assert ".topology-tools-panel" in response.text
    assert "position: absolute;" in response.text
    assert "top: 0.75rem;" in response.text
    assert "left: 0.75rem;" in response.text
    assert ".topology-tools-panel .topology-controls" in response.text
    assert "position: static;" in response.text
    assert ".topology-tools-panel__line--fiber" in response.text
    assert ".topology-tools-panel__line--wifi" in response.text
    assert ".topology-tools-panel__line--ethernet" in response.text
    assert ".topology-tools-panel__ethernet-speeds" in response.text
    assert ".topology-tools-panel__speed--100m" in response.text
    assert ".topology-tools-panel__speed--1g" in response.text
    assert ".topology-tools-panel__speed--2-5g" in response.text
    assert ".topology-tools-panel__speed--5g" in response.text
    assert ".topology-tools-panel__speed--8g" in response.text
    assert ".topology-tools-panel__speed--10g" in response.text
    assert "background: #a78bfa;" in response.text
    assert "border-top: 3px dotted #38bdf8;" in response.text
    assert "background: #8fa4b8;" in response.text
    assert "--speed-color: #ff6b6b;" in response.text
    assert "--speed-color: #4debff;" in response.text
    assert ".topology-tools-panel__line--wan" not in response.text
    assert ".topology-tools-panel--collapsed" in response.text
    assert "@media (max-width: 620px)" in response.text


def test_topology_focus_animates_solid_and_dashed_links() -> None:
    """Selected equipment must expose visible motion on every link type."""
    client = make_client()

    canvas = client.get("/ui/topology_canvas.js")
    stylesheet = client.get("/ui/styles/topology.css")

    assert canvas.status_code == 200
    assert stylesheet.status_code == 200
    assert '"topology-link--flow-overlay"' in canvas.text
    assert '"topology-link--flow-dashed"' in canvas.text
    assert 'flow.classList.add("topology-link__flow")' in canvas.text
    assert ".topology-link__flow" in stylesheet.text
    assert ".topology-link--focused.topology-link--flow-overlay" in stylesheet.text
    assert ".topology-link--focused.topology-link--flow-dashed" in stylesheet.text
    assert "@keyframes topology-link-flow" in stylesheet.text


def test_ethernet_capacity_controls_permanent_animation_cadence() -> None:
    """Ethernet motion must represent capacity, never measured traffic."""
    client = make_client()

    response = client.get("/ui/styles/topology.css")

    assert response.status_code == 200
    assert ".topology-link--ethernet.topology-link--flow-overlay" in response.text
    assert "--flow-duration: 5.6s;" in response.text
    assert "--flow-duration: 4.4s;" in response.text
    assert "--flow-duration: 3.6s;" in response.text
    assert "--flow-duration: 2.8s;" in response.text
    assert "--flow-duration: 2.1s;" in response.text
    assert "--flow-duration: 1.6s;" in response.text
    assert "animation:" in response.text
    assert "var(--flow-duration)" in response.text
    assert "@media (prefers-reduced-motion: reduce)" in response.text
