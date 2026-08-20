"""Tests for the Ohana-Vision static web interface."""

import pytest
from fastapi.testclient import TestClient

from ohana_vision.web import create_app


def make_client() -> TestClient:
    """Create an Ohana-Vision application client."""
    return TestClient(create_app())


def test_static_ui_is_available() -> None:
    """The dashboard entry point must be served."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "<title>Ohana Vision</title>" in response.text


def test_static_ui_contains_dashboard_sections() -> None:
    """The dashboard must expose its main sections."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert 'id="overview"' in response.text
    assert 'id="infrastructure"' in response.text
    assert 'id="topology-heading"' in response.text
    assert 'id="observations"' in response.text
    assert 'id="timeline"' in response.text
    assert 'id="timeline-heading"' in response.text


def test_static_styles_are_available() -> None:
    """The dashboard stylesheet must be served."""
    client = make_client()

    response = client.get("/ui/styles.css")

    assert response.status_code == 200
    assert "text/css" in response.headers["content-type"]
    assert ".dashboard" in response.text


def test_static_javascript_is_available() -> None:
    """The frontend JavaScript entry point must be served."""
    client = make_client()

    response = client.get("/ui/app.js")

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert 'from "./application.js"' in response.text
    assert "ApplicationController" in response.text
    assert "application.initialize()" in response.text


def test_static_ui_references_local_assets() -> None:
    """The entry page must reference locally served assets."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert 'href="/ui/styles.css"' in response.text
    assert 'src="/ui/app.js"' in response.text


def test_static_ui_unknown_asset_returns_404() -> None:
    """Unknown static resources must return HTTP 404."""
    client = make_client()

    response = client.get("/ui/unknown.js")

    assert response.status_code == 404


def test_static_ui_contains_topology_canvas_container() -> None:
    """The dashboard must expose the topology canvas container."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert 'id="topology-container"' in response.text
    assert 'id="topology-layout-label"' in response.text
    assert 'id="topology-error"' in response.text


def test_topology_canvas_javascript_is_available() -> None:
    """The topology canvas component must be served."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "class TopologyCanvas" in response.text
    assert "window.TopologyCanvas" in response.text


def test_static_ui_contains_device_details_panel() -> None:
    """The dashboard must expose the device details panel."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert 'id="device-details"' in response.text
    assert 'id="device-details-title"' in response.text
    assert 'id="device-details-close"' in response.text
    assert 'id="device-links-list"' in response.text


def test_static_ui_contains_topology_controls() -> None:
    """The dashboard must expose topology navigation controls."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert 'id="topology-zoom-in"' in response.text
    assert 'id="topology-zoom-out"' in response.text
    assert 'id="topology-reset-view"' in response.text


def test_static_ui_contains_dashboard_grid() -> None:
    """The dashboard must expose its new general layout."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert 'class="application-sidebar"' in response.text
    assert 'class="dashboard-header"' in response.text
    assert 'class="dashboard-kpis"' in response.text
    assert "dashboard-primary" in response.text
    assert "dashboard-primary--topology" in response.text
    assert 'class="dashboard-right-panel"' not in response.text
    assert 'class="dashboard-timeline"' in response.text


def test_static_ui_preserves_interactive_components() -> None:
    """The new layout must preserve existing dashboard components."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert 'id="websocket-status"' in response.text
    assert 'id="topology-container"' in response.text
    assert 'id="device-details"' in response.text
    assert 'id="topology-zoom-in"' in response.text
    assert 'id="recent-observations-list"' in response.text


def test_static_ui_contains_dashboard_kpis() -> None:
    """The dashboard must expose its main KPI cards."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert 'id="availability-value"' in response.text
    assert 'id="devices-count"' in response.text
    assert 'id="alerts-count"' in response.text
    assert 'id="capability-distribution-total"' in response.text
    assert "Capacités supervisées" in response.text
    assert 'id="services-count"' not in response.text
    assert 'id="incidents-count"' not in response.text
    assert 'id="availability-summary-value"' not in response.text
    assert 'id="global-health-label"' not in response.text
    assert 'id="capabilities-count"' not in response.text
    assert 'id="activity-count"' not in response.text


def test_static_ui_marks_topology_as_primary_content() -> None:
    """The topology must be the primary dashboard content."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert "dashboard-primary--topology" in response.text
    assert 'id="topology-health-indicator"' in response.text
    assert 'id="topology-health-label"' in response.text
    assert "Topologie Ohana-House" in response.text


def test_static_ui_contains_capability_distribution() -> None:
    """The overview must expose the supervised capability distribution."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert 'id="capability-distribution-ring"' in response.text
    assert 'id="capability-distribution-summary"' in response.text


def test_static_styles_support_responsive_dashboard() -> None:
    """The responsive module must expose dashboard breakpoints."""
    client = make_client()

    response = client.get(
        "/ui/styles/responsive.css",
    )

    assert response.status_code == 200
    assert "@media (max-width: 1200px)" in response.text
    assert "@media (max-width: 1000px)" in response.text
    assert "@media (max-width: 720px)" in response.text


def test_static_styles_respect_reduced_motion() -> None:
    """The responsive module must preserve reduced motion."""
    client = make_client()

    response = client.get(
        "/ui/styles/responsive.css",
    )

    assert response.status_code == 200
    assert "@media (prefers-reduced-motion: reduce)" in response.text
    assert "animation-duration: 1ms !important" in response.text
    assert "transition-duration: 1ms !important" in response.text


def test_static_ui_exposes_only_functional_navigation_entries() -> None:
    """The sidebar must expose only implemented application views."""
    response = make_client().get("/ui/")

    assert response.status_code == 200

    content = response.text

    assert 'data-navigation-target="overview"' in content
    assert 'data-navigation-target="infrastructure"' in content
    assert 'data-navigation-target="services"' in content
    assert 'data-navigation-target="timeline"' in content
    assert 'data-navigation-target="observations"' in content
    assert 'data-navigation-target="incidents"' in content


def test_static_ui_does_not_expose_unimplemented_navigation_entries() -> None:
    """The sidebar must not advertise unavailable application views."""
    response = make_client().get("/ui/")

    assert response.status_code == 200

    content = response.text

    assert 'data-navigation-target="alerts"' not in content
    assert 'data-navigation-target="reports"' not in content
    assert 'data-navigation-target="system"' not in content
    assert 'data-navigation-target="settings"' not in content


def test_static_ui_declares_all_navigation_views() -> None:
    """Every navigation destination must have a corresponding view."""
    response = make_client().get("/ui/")

    assert response.status_code == 200

    content = response.text

    assert 'data-view="overview"' in content
    assert 'data-view="infrastructure"' in content
    assert 'data-view="services"' in content
    assert 'data-view="timeline"' in content
    assert 'data-view="observations"' in content
    assert 'data-view="incidents"' in content
    assert 'id="incidents-list"' in content
    assert 'id="incidents-active-count"' in content


def test_static_ui_exposes_incident_center() -> None:
    """The incident center must be packaged with its operator actions."""
    client = make_client()
    script = client.get("/ui/incidents.js")
    stylesheet = client.get("/ui/styles/incidents.css")

    assert script.status_code == 200
    assert stylesheet.status_code == 200
    assert "IncidentsController" in script.text
    assert "API.incidentAcknowledge" in script.text
    assert "API.incidentSilence" in script.text
    assert 'data-incident-action="acknowledge"' in script.text
    assert 'data-incident-action="silence"' in script.text


def test_static_ui_exposes_graphical_configuration_views() -> None:
    """Configuration pages must be available without YAML or inner tabs."""
    response = make_client().get("/ui/")

    assert response.status_code == 200
    assert 'data-navigation-target="configuration-network"' in response.text
    assert 'data-navigation-target="configuration-workers"' in response.text
    assert 'data-navigation-target="configuration-dhcp"' in response.text
    assert 'data-navigation-target="configuration-architecture"' in response.text
    assert 'data-navigation-target="configuration-plugins"' in response.text
    assert 'data-view="configuration"' in response.text
    assert "data-configuration-tab=" not in response.text
    assert 'id="network-settings-form"' in response.text
    assert 'id="network-interface"' in response.text
    assert 'id="network-address"' in response.text
    assert 'id="network-confirm"' in response.text
    assert 'id="network-rollback"' in response.text
    assert 'id="dhcp-settings-form"' in response.text
    assert 'id="dhcp-reservations-table"' in response.text
    assert 'id="architecture-board"' in response.text
    assert 'id="architecture-mode-move"' in response.text
    assert 'id="architecture-mode-link"' in response.text
    assert 'id="architecture-zoom-in"' in response.text
    assert 'id="architecture-zoom-out"' in response.text
    assert 'id="architecture-zoom-reset"' in response.text
    assert 'id="architecture-add-service-to-device"' in response.text
    assert 'id="architecture-device-role"' in response.text
    assert 'id="architecture-device-network-presence"' in response.text
    assert 'id="device-details-node"' not in response.text
    assert 'id="plugins-configuration-panel"' in response.text
    assert 'id="workers-configuration-panel"' in response.text
    assert 'id="plugin-cards"' in response.text
    assert 'id="plugin-configuration-form"' in response.text
    assert 'id="plugin-test"' in response.text
    assert '<option value="fiber">Fibre</option>' in response.text
    assert '<option value="10000">10Gbps</option>' in response.text
    assert '<option value="8000">8Gbps</option>' not in response.text
    assert '<option value="5000">5Gbps</option>' not in response.text
    assert '<option value="2500">2.5Gbps</option>' in response.text
    assert '<option value="1000">1Gbps</option>' in response.text
    assert '<option value="100">100Mbps</option>' in response.text


def test_static_ui_exposes_configuration_controller() -> None:
    """The configuration controller must be packaged and served."""
    response = make_client().get("/ui/configuration.js")

    assert response.status_code == 200
    assert "ConfigurationController" in response.text
    assert "administrationDHCP" in response.text
    assert "administrationInfrastructure" in response.text
    assert "administrationPlugins" in response.text
    assert "administrationPluginTest" in response.text
    assert "renderPlugins()" in response.text
    assert "savePluginConfiguration" in response.text
    assert "testSelectedPlugin" in response.text
    assert "pluginConfigurationPayload" in response.text
    assert "async reload()" in response.text
    assert "async refreshPlugins()" in response.text
    assert "await this.refreshPlugins()" in response.text
    assert "structuredClone(this.dhcp)" in response.text
    assert "handleArchitectureDrop" in response.text
    assert "handleArchitectureWheel" in response.text
    assert "handleArchitecturePointerMove" in response.text
    assert "fitArchitectureViewport" in response.text
    assert "querySelectorAll(" in response.text
    assert '".architecture-map-device"' in response.text
    assert "selectLinkEndpoint" in response.text
    assert "layout.positions[deviceId]" in response.text
    assert "ARCHITECTURE_MINIMUM_COLUMNS = 15" in response.text
    assert "ARCHITECTURE_MINIMUM_ROWS = 10" in response.text
    assert "compareIPAddresses(" in response.text
    assert "nodeStillUsed" in response.text
    assert 'metadata.medium = "fiber"' in response.text
    assert 'return "ethernet-8g"' not in response.text
    assert 'return "ethernet-5g"' not in response.text
    assert 'return "ethernet-100m"' in response.text
    assert "Enregistrer la " in response.text
    assert "DHCP de ${reservation.hostname} ?" in response.text
    assert 'data-dhcp-add="${mac}"' in response.text
    assert "this.openReservation({" in response.text
    assert "}, {isNew: true});" in response.text
    assert "reservation && !options.isNew" in response.text
    assert "hostname: lease.hostname" in response.text
    assert "mac_address: lease.mac_address" in response.text


def test_architecture_exposes_discovered_devices_to_position() -> None:
    """Discovered Z-Wave devices require an explicit placement action."""
    client = make_client()
    page = client.get("/ui/")
    script = client.get("/ui/configuration.js")
    stylesheet = client.get("/ui/styles/configuration.css")

    assert page.status_code == 200
    assert script.status_code == 200
    assert stylesheet.status_code == 200
    assert 'id="architecture-discovery-notice" hidden' in page.text
    assert 'id="architecture-discovery-count"' in page.text
    assert 'id="architecture-position-discovered"' in page.text
    assert "0 équipement à positionner" in page.text
    assert "Positionner automatiquement" in page.text
    assert "this.liveTopology = await fetchJson(" in script.text
    assert "API.topology" in script.text
    assert "discoveredDevicesToPosition()" in script.text
    assert '=== "zwave_discovery"' in script.text
    assert "positionDiscoveredDevices()" in script.text
    assert "positionDevicesAroundGateway(" in script.text
    assert "Appliquez l’architecture pour conserver ce placement." in script.text
    assert ".architecture-discovery-notice" in stylesheet.text
    assert ".architecture-discovery-count" in stylesheet.text


def test_dhcp_reservation_validates_dns_hostname_before_submission() -> None:
    """DHCP reservation form must reject underscores before calling Agent."""
    html = make_client().get("/")
    script = make_client().get("/ui/configuration.js")

    assert html.status_code == 200
    assert script.status_code == 200
    assert 'id="dhcp-reservation-hostname-help"' in html.text
    assert 'maxlength="253"' in html.text
    assert "DNS_NAME_PATTERN" in script.text
    assert "validateReservationHostname()" in script.text
    assert "invalidDHCPReservations()" in script.text
    assert "Utilisez des tirets" in script.text
    assert "Nom DNS invalide" in script.text
    assert "esp-lave-vaiselle" not in script.text


def test_configuration_persists_device_role_in_metadata() -> None:
    """The architecture editor must preserve and update a device role."""
    response = make_client().get("/ui/configuration.js")

    assert response.status_code == 200
    assert '"architecture-device-role"' in response.text
    assert "device.metadata?.role" in response.text
    assert "device.metadata.role = role" in response.text
    assert "delete device.metadata.role" in response.text


def test_timeline_exposes_compact_current_state_mode() -> None:
    """Overview must render only the latest state of each timeline node."""
    response = make_client().get("/ui/timeline.js")

    assert response.status_code == 200
    assert "setCompactMode(compactMode)" in response.text
    assert "renderCurrentStates()" in response.text
    assert "group.periods.at(-1)" in response.text
    assert "timeline-current-state" in response.text


def test_configuration_keeps_dhcp_page_accessible_when_unavailable() -> None:
    """A DHCP read failure must not hide its dedicated configuration page."""
    response = make_client().get("/ui/configuration.js")

    assert response.status_code == 200
    assert "renderDHCPUnavailable" in response.text
    assert "setDHCPControlsEnabled(false)" in response.text
    assert "activateSection(sectionName)" in response.text
    assert "dhcpTab.disabled" not in response.text
    assert "La page DHCP reste accessible" in response.text


def test_configuration_controls_network_presence_per_device() -> None:
    """Network presence selection must live in the equipment editor."""
    page = make_client().get("/ui/")
    script = make_client().get("/ui/configuration.js")

    assert page.status_code == 200
    assert script.status_code == 200
    assert 'id="architecture-device-network-presence"' in page.text
    assert "Surveiller la présence réseau" in page.text
    assert "network_presence_enabled" in script.text
    assert "updateNetworkPresenceControl" in script.text
    assert "Activation par équipement" in script.text
    assert "Présence réseau activée" not in script.text
    assert "plugin-network-failure-threshold" in script.text
    assert 'plugin.id === "network"' in script.text


def test_configuration_uses_dhcp_plugin_specific_fields() -> None:
    """The DHCP observation form must match Agent's strict model."""
    response = make_client().get("/ui/configuration.js")

    assert response.status_code == 200
    assert "plugin-dhcp-check-service" in response.text
    assert "plugin-dhcp-maximum-pool-usage" in response.text
    assert "delete configuration.retries" in response.text
    assert "Les baux et réservations restent gérés" in response.text


def test_configuration_deletes_device_dependencies_coherently() -> None:
    """Deleting a device must remove its dependent architecture data."""
    response = make_client().get("/ui/configuration.js")

    assert response.status_code == 200
    assert "item.id !== selection.id" in response.text
    assert "item.source" in response.text
    assert "item.target" in response.text
    assert "item.node !== nodeId" in response.text
    assert "item.id !== nodeId" in response.text
    assert "nodeStillUsed" in response.text
    assert "delete layout.positions[" in response.text


def test_infrastructure_view_disables_desktop_vertical_scrolling() -> None:
    """The full infrastructure map must fit without a page scrollbar."""
    response = make_client().get("/ui/styles/responsive.css")

    assert response.status_code == 200
    assert 'data-active-view="infrastructure"' in response.text
    assert "overflow: hidden;" in response.text
    assert ".topology-container" in response.text
    assert "height: 100%;" in response.text


def test_observations_and_configuration_use_full_height_layouts() -> None:
    """Dense pages must fill the viewport while their content scrolls locally."""
    responsive = make_client().get("/ui/styles/responsive.css")
    observations = make_client().get("/ui/styles/observations.css")
    configuration = make_client().get("/ui/styles/configuration.css")

    assert responsive.status_code == 200
    assert observations.status_code == 200
    assert configuration.status_code == 200
    assert 'data-active-view="observations"' in responsive.text
    assert 'data-active-view="configuration-architecture"' in responsive.text
    assert 'data-active-view="configuration-plugins"' in responsive.text
    assert "grid-template-rows: auto auto auto minmax(0, 1fr)" in observations.text
    assert "overflow-y: auto" in observations.text
    assert ".configuration-card--architecture-workspace" in configuration.text
    assert ".plugin-browser" in configuration.text
    assert (
        "grid-template-columns: minmax(20rem, 25rem) minmax(0, 1fr)"
        in configuration.text
    )


def test_static_ui_loads_navigation_as_javascript_module() -> None:
    """The frontend must load the modular navigation controller."""
    client = make_client()

    page_response = client.get("/ui/")
    navigation_response = client.get("/ui/navigation.js")

    assert page_response.status_code == 200
    assert navigation_response.status_code == 200

    assert 'type="module"' in page_response.text
    assert "export class NavigationController" in navigation_response.text


def test_static_ui_exposes_navigation_controller() -> None:
    """The UI must expose its navigation controller."""
    client = make_client()

    response = client.get("/ui/navigation.js")

    assert response.status_code == 200
    assert "export class NavigationController" in response.text
    assert "ohana:navigation-changed" in response.text
    assert "hashchange" in response.text


def test_application_script_connects_navigation() -> None:
    """The application must initialize frontend navigation."""
    client = make_client()

    response = client.get("/ui/application.js")

    assert response.status_code == 200
    assert "NavigationController" in response.text
    assert 'from "./navigation.js"' in response.text
    assert '"ohana:navigation-changed"' in response.text
    assert "this.navigation.initialize()" in response.text


def test_static_ui_exposes_frontend_api_module() -> None:
    """The frontend must expose its API client module."""
    response = make_client().get("/ui/api.js")

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "export const API" in response.text
    assert 'version: "/api/version"' in response.text
    assert 'runtime: "/api/runtime"' in response.text
    assert 'observations: "/api/observations"' in response.text
    assert 'timeline: "/api/timeline"' in response.text
    assert 'topology: "/api/topology"' in response.text
    assert "export async function fetchJson" in response.text


def test_static_ui_exposes_frontend_utils_module() -> None:
    """The frontend must expose shared utility functions."""
    response = make_client().get("/ui/utils.js")

    assert response.status_code == 200
    assert "export function escapeHtml" in response.text
    assert "export function formatDate" in response.text
    assert "export function formatLatency" in response.text
    assert "export function normalizeHealthStatus" in response.text


def test_static_ui_exposes_shared_application_state() -> None:
    """The frontend must expose a shared application state."""
    response = make_client().get(
        "/ui/application_state.js",
    )

    assert response.status_code == 200
    assert "export function applicationState" in response.text
    assert "export function resetApplicationState" in response.text
    assert "devicePresence" in response.text


def test_application_uses_frontend_foundation_modules() -> None:
    """The application orchestrator must import shared modules."""
    response = make_client().get("/ui/application.js")

    assert response.status_code == 200
    assert 'from "./api.js"' in response.text
    assert 'from "./utils.js"' in response.text
    assert 'from "./application_state.js"' in response.text


def test_static_ui_exposes_observations_module() -> None:
    """The frontend must expose its observations module."""
    client = make_client()

    response = client.get("/ui/observations.js")

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "export class ObservationsController" in response.text
    assert "renderRecent(" in response.text
    assert "renderCount(" in response.text
    assert "groupObservations(" in response.text
    assert "filterObservations(" in response.text
    assert "Voir les ${count} évaluations" in response.text

    page = client.get("/ui/")
    assert 'id="observation-status-filter"' in page.text
    assert 'id="observation-node-filter"' in page.text
    assert 'id="observation-service-filter"' in page.text


def test_application_uses_observations_controller() -> None:
    """The application must delegate observation rendering."""
    response = make_client().get("/ui/application.js")

    assert response.status_code == 200
    assert "ObservationsController" in response.text
    assert 'from "./observations.js"' in response.text
    assert "this.observations.render(" in response.text
    assert "this.observations.showError(" in response.text


def test_application_uses_timeline_controller() -> None:
    """The application must delegate timeline rendering."""
    response = make_client().get("/ui/application.js")

    assert response.status_code == 200
    assert "TimelineController" in response.text
    assert 'from "./timeline.js"' in response.text
    assert "this.timeline.initialize()" in response.text
    assert "this.timeline.render()" in response.text


def test_timeline_module_uses_shared_application_state() -> None:
    """The timeline must use periods from shared state."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200
    assert "this.state.timeline?.nodes" in response.text


def test_timeline_delegates_node_selection() -> None:
    """Timeline interactions must delegate node selection."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200
    assert "onNodeSelected" in response.text
    assert "button.dataset.timelineNode" in response.text
    assert "button.dataset.nodeId" in response.text


def test_static_ui_exposes_topology_module() -> None:
    """The frontend must expose its topology module."""
    response = make_client().get(
        "/ui/topology.js",
    )

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "export class TopologyController" in response.text
    assert "new window.TopologyCanvas" in response.text
    assert "buildDeviceHealth" in response.text
    assert "selectDeviceByNode" in response.text


def test_topology_module_loads_backend_resources() -> None:
    """The topology controller must combine topology and shared state."""
    response = make_client().get(
        "/ui/topology.js",
    )

    assert response.status_code == 200
    assert 'from "./api.js"' in response.text
    assert "fetchJson(" in response.text
    assert "API.topology" in response.text
    assert "this.state.timeline" in response.text
    assert "this.state.observations" in response.text
    assert "buildDevicePresence" in response.text
    assert '"network.reachable"' in response.text


def test_topology_module_controls_canvas() -> None:
    """The topology controller must expose canvas controls."""
    response = make_client().get(
        "/ui/topology.js",
    )

    assert response.status_code == 200
    assert "this.canvas.zoomIn()" in response.text
    assert "this.canvas.zoomOut()" in response.text
    assert "this.canvas.resetView()" in response.text
    assert "this.canvas.setSelectedDevice" in response.text


def test_application_uses_topology_controller() -> None:
    """The application must delegate topology management."""
    response = make_client().get("/ui/application.js")

    assert response.status_code == 200
    assert "TopologyController" in response.text
    assert 'from "./topology.js"' in response.text
    assert "this.topology.load()" in response.text
    assert "this.topology.initialize()" in response.text
    assert "this.topology.reflow()" in response.text


def test_static_ui_exposes_device_details_module() -> None:
    """The frontend must expose its device-details module."""
    response = make_client().get(
        "/ui/device_details.js",
    )

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "export class DeviceDetailsController" in response.text
    assert "select(deviceId)" in response.text
    assert "render(device)" in response.text
    assert "renderLinks(device)" in response.text
    assert "close()" in response.text


def test_device_details_module_uses_shared_state() -> None:
    """Device details must use topology state."""
    response = make_client().get(
        "/ui/device_details.js",
    )

    assert response.status_code == 200
    assert "this.state.topology" in response.text
    assert "this.state.deviceHealth" in response.text
    assert "this.state.devicePresence" in response.text
    assert "this.state.selectedDeviceId" in response.text


def test_device_details_refresh_preserves_the_backup_action() -> None:
    """Realtime card refreshes must not reload and hide the backup action."""
    response = make_client().get(
        "/ui/device_details.js",
    )

    assert response.status_code == 200
    refresh_source = response.text.split(
        "    refresh() {",
        maxsplit=1,
    )[1].split(
        "    close() {",
        maxsplit=1,
    )[0]
    assert "this.render(device);" in refresh_source
    assert "this.select(deviceId);" not in refresh_source
    assert "loadBackupTarget" not in refresh_source
    assert "hideBackupAction" not in refresh_source


def test_device_details_manual_backup_uses_the_exact_configured_target() -> None:
    """A device card must never fall back to another HAOS backup target."""
    response = make_client().get("/ui/device_details.js")

    assert response.status_code == 200
    assert 'API.administrationPlugin("backup")' in response.text
    assert "candidate?.id" in response.text
    assert "=== device.device_id" in response.text
    assert "!plugin?.enabled || !target?.enabled" in response.text
    assert "API.administrationBackupRun(target.id)" in response.text
    assert "target.backup_in_progress === true" in response.text
    assert "showBackupInProgress(device)" in response.text
    assert "scheduleBackupProgressRefresh(device)" in response.text

    page = make_client().get("/")
    assert 'id="device-details-backup-progress"' in page.text
    assert "Backup in progress" in page.text


def test_device_details_module_renders_network_presence() -> None:
    """Device details must expose the latest network presence check."""
    response = make_client().get(
        "/ui/device_details.js",
    )

    assert response.status_code == 200
    assert "renderPresence(device)" in response.text
    assert "this.state.devicePresence" in response.text
    assert "presenceStatusLabel" in response.text
    assert "presenceMethodLabel" in response.text
    assert "presenceFailureLabel" in response.text
    assert "network_presence_enabled" in response.text
    assert '"disabled"' in response.text
    assert "formatDate" in response.text
    assert "formatLatency" in response.text
    assert "device-details-node" not in response.text


def test_device_details_module_renders_connections() -> None:
    """Device details must render infrastructure links."""
    response = make_client().get(
        "/ui/device_details.js",
    )

    assert response.status_code == 200
    assert "linksForDevice" in response.text
    assert "neighborForLink" in response.text
    assert "device-details__link" in response.text
    assert "source_device_id" in response.text
    assert "target_device_id" in response.text


def test_application_uses_device_details_controller() -> None:
    """The application must delegate device selection."""
    response = make_client().get(
        "/ui/application.js",
    )

    assert response.status_code == 200
    assert "DeviceDetailsController" in response.text
    assert 'from "./device_details.js"' in response.text
    assert "this.deviceDetails.initialize()" in response.text
    assert "this.deviceDetails" in response.text
    assert ".select(" in response.text
    assert ".refresh()" in response.text


def test_static_ui_exposes_dashboard_module() -> None:
    """The frontend must expose its dashboard module."""
    response = make_client().get(
        "/ui/dashboard.js",
    )

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "export class DashboardController" in response.text
    assert "renderRuntime(runtime)" in response.text
    assert "renderKpis()" in response.text
    assert "renderActiveAlerts()" in response.text
    assert "updateViewHeader(viewName)" in response.text


def test_dashboard_module_calculates_health_kpis() -> None:
    """The dashboard must calculate infrastructure health."""
    response = make_client().get(
        "/ui/dashboard.js",
    )

    assert response.status_code == 200
    assert "deviceHealthStatistics()" in response.text
    assert "globalTopologyHealth(" in response.text
    assert "availabilityPercentage(" in response.text
    assert "formatGlobalTopologyHealth(" in response.text


def test_dashboard_module_renders_runtime_statistics() -> None:
    """The dashboard must render runtime statistics."""
    response = make_client().get(
        "/ui/dashboard.js",
    )

    assert response.status_code == 200
    assert "observations_received" in response.text
    assert "observations_accepted" in response.text
    assert "observations_rejected" in response.text
    assert "renderAcceptanceRate(" in response.text


def test_dashboard_module_delegates_alert_selection() -> None:
    """Active alerts must delegate device selection."""
    response = make_client().get(
        "/ui/dashboard.js",
    )

    assert response.status_code == 200
    assert "onDeviceSelected" in response.text
    assert "data-device-id" in response.text
    assert "button.dataset.deviceId" in response.text


def test_application_uses_dashboard_controller() -> None:
    """The application must delegate dashboard rendering."""
    response = make_client().get(
        "/ui/application.js",
    )

    assert response.status_code == 200
    assert "DashboardController" in response.text
    assert 'from "./dashboard.js"' in response.text
    assert "this.dashboard.renderRuntime(" in response.text
    assert "this.dashboard" in response.text
    assert ".renderKpis()" in response.text
    assert ".renderActiveAlerts()" in response.text


def test_static_ui_exposes_websocket_module() -> None:
    """The frontend must expose its WebSocket module."""
    response = make_client().get(
        "/ui/websocket.js",
    )

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "export class WebSocketController" in response.text
    assert "initialize()" in response.text
    assert "connect()" in response.text
    assert "stop()" in response.text


def test_websocket_module_builds_realtime_url() -> None:
    """The WebSocket module must support HTTP and HTTPS."""
    response = make_client().get(
        "/ui/websocket.js",
    )

    assert response.status_code == 200
    assert "websocketUrl()" in response.text
    assert '"https:"' in response.text
    assert '"wss:"' in response.text
    assert '"ws:"' in response.text
    assert "window.location.host" in response.text


def test_websocket_module_handles_connection_states() -> None:
    """The WebSocket module must render connection states."""
    response = make_client().get(
        "/ui/websocket.js",
    )

    assert response.status_code == 200
    assert '"connecting"' in response.text
    assert '"online"' in response.text
    assert '"offline"' in response.text
    assert "connection-status" in response.text


def test_websocket_module_reconnects_after_close() -> None:
    """The WebSocket module must reconnect after disconnection."""
    response = make_client().get(
        "/ui/websocket.js",
    )

    assert response.status_code == 200
    assert "scheduleReconnect()" in response.text
    assert "setTimeout" in response.text
    assert "clearTimeout" in response.text
    assert "reconnectDelayMs" in response.text


def test_websocket_module_delegates_messages() -> None:
    """Realtime messages must be delegated to the application."""
    response = make_client().get(
        "/ui/websocket.js",
    )

    assert response.status_code == 200
    assert "JSON.parse(" in response.text
    assert 'message.type === "connected"' in response.text
    assert "this.onMessage(message)" in response.text


def test_application_uses_websocket_controller() -> None:
    """The application must delegate realtime communication."""
    response = make_client().get("/ui/application.js")

    assert response.status_code == 200
    assert "WebSocketController" in response.text
    assert 'from "./websocket.js"' in response.text
    assert "this.websocket.initialize()" in response.text
    assert "this.handleRealtimeMessage" in response.text


def test_application_refreshes_observations_without_reloading_editor() -> None:
    """Frequent observations must not reload topology configuration."""
    response = make_client().get("/ui/application.js")

    assert response.status_code == 200
    assert '=== "observation.accepted"' in response.text
    assert "void this.refreshObservationState()" in response.text
    assert "this.topology.refreshStatus()" in response.text

    observation_refresh = response.text.split(
        "async refreshObservationState()",
        maxsplit=1,
    )[1].split(
        "async refreshInfrastructure()",
        maxsplit=1,
    )[0]

    assert "this.configuration.reload()" not in observation_refresh
    assert "this.topology.load()" not in observation_refresh


def test_application_reloads_topology_only_for_infrastructure_event() -> None:
    """An infrastructure snapshot may rebuild the topology canvas."""
    response = make_client().get("/ui/application.js")

    assert response.status_code == 200
    assert '=== "infrastructure.updated"' in response.text
    assert "void this.refreshInfrastructure()" in response.text

    infrastructure_refresh = response.text.split(
        "async refreshInfrastructure()",
        maxsplit=1,
    )[1].split(
        "async refresh()",
        maxsplit=1,
    )[0]

    assert "this.topology.load()" in infrastructure_refresh
    assert "this.configuration.reload()" not in infrastructure_refresh


def test_static_ui_exposes_application_module() -> None:
    """The frontend must expose its application orchestrator."""
    response = make_client().get(
        "/ui/application.js",
    )

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "export class ApplicationController" in response.text
    assert "createControllers()" in response.text
    assert "initializeControllers()" in response.text
    assert "async refresh()" in response.text


def test_application_module_coordinates_frontend_controllers() -> None:
    """The application must coordinate all frontend controllers."""
    response = make_client().get(
        "/ui/application.js",
    )

    assert response.status_code == 200

    assert "DashboardController" in response.text
    assert "DeviceDetailsController" in response.text
    assert "NavigationController" in response.text
    assert "ObservationsController" in response.text
    assert "TimelineController" in response.text
    assert "TopologyController" in response.text
    assert "WebSocketController" in response.text


def test_application_module_refreshes_backend_resources() -> None:
    """The application must refresh its backend-backed state."""
    response = make_client().get(
        "/ui/application.js",
    )

    assert response.status_code == 200
    assert "this.loadRuntime()" in response.text
    assert "this.loadObservations()" in response.text
    assert "this.topology.load()" in response.text
    assert "Promise.allSettled" in response.text


def test_topology_refreshes_status_without_reloading_definition() -> None:
    """Realtime statuses must update the existing topology canvas."""
    response = make_client().get("/ui/topology.js")

    assert response.status_code == 200
    assert "async refreshStatus()" in response.text
    assert "this.canvas.updateStatus(" in response.text

    status_refresh = response.text.split(
        "async refreshStatus()",
        maxsplit=1,
    )[1].split(
        "setSelectedDevice(",
        maxsplit=1,
    )[0]

    assert "API.topology" not in status_refresh
    assert "this.canvas.render(" not in status_refresh


def test_topology_canvas_updates_realtime_statuses_in_place() -> None:
    """Status changes must not replay the canvas entrance animations."""
    response = make_client().get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "updateStatus(" in response.text
    assert "updateDeviceStatus(" in response.text

    status_update = response.text.split(
        "updateStatus(",
        maxsplit=1,
    )[1].split(
        "updateDeviceStatus(",
        maxsplit=1,
    )[0]

    assert "replaceChildren(" not in status_update


def test_topology_reconciles_health_from_recent_observations() -> None:
    """The map must not depend only on a possibly stale timeline."""
    response = make_client().get("/ui/topology.js")

    assert response.status_code == 200
    assert "buildObservationHealthIndex(" in response.text
    assert "resolveDeviceHealth(" in response.text
    assert '?.target_type === "device"' in response.text
    assert "normalizeHealthStatus(" in response.text


def test_topology_uses_targeted_zwave_node_health() -> None:
    """Discovered devices must use explicit Agent device health updates."""
    response = make_client().get("/ui/topology.js")

    assert response.status_code == 200
    assert "buildTargetDeviceHealthIndex(" in response.text
    assert "contributes_to_device_health" in response.text
    assert "targetDeviceHealth[" in response.text


def test_discovered_zwave_devices_are_supervised() -> None:
    """Targeted Z-Wave health must count in details and dashboard KPIs."""
    client = make_client()

    utils = client.get("/ui/utils.js")
    details = client.get("/ui/device_details.js")
    dashboard = client.get("/ui/dashboard.js")

    assert utils.status_code == 200
    assert details.status_code == 200
    assert dashboard.status_code == 200
    assert "export function isDeviceSupervised(" in utils.text
    assert '=== "zwave_discovery"' in utils.text
    assert 'metadata.target_type === "device"' in utils.text
    assert "metadata.contributes_to_device_health" in utils.text
    assert "isDeviceSupervised(" in details.text
    assert "isDeviceSupervised(" in dashboard.text


def test_application_entry_point_is_minimal() -> None:
    """The frontend entry point must only start the application."""
    response = make_client().get("/ui/app.js")

    assert response.status_code == 200
    assert 'from "./application.js"' in response.text
    assert "new ApplicationController()" in response.text
    assert "application.initialize()" in response.text

    assert "fetchJson(" not in response.text
    assert "new WebSocket(" not in response.text
    assert "new TopologyController(" not in response.text
    assert "renderKpis(" not in response.text


def test_static_ui_does_not_preserve_hidden_observations_table() -> None:
    """The obsolete hidden observations table must be removed."""
    client = make_client()

    response = client.get("/ui/")

    assert response.status_code == 200
    assert 'id="observations-body"' not in response.text
    assert '<table class="visually-hidden">' not in response.text


@pytest.mark.parametrize(
    "stylesheet",
    [
        "foundations.css",
        "layout.css",
        "components.css",
        "navigation.css",
        "dashboard.css",
        "topology.css",
        "host.css",
        "device-details.css",
        "observations.css",
        "timeline.css",
        "responsive.css",
    ],
)
def test_static_ui_exposes_modular_stylesheets(
    stylesheet: str,
) -> None:
    """Every responsibility stylesheet must be served."""
    response = make_client().get(
        f"/ui/styles/{stylesheet}",
    )

    assert response.status_code == 200
    assert "text/css" in response.headers["content-type"]


def test_static_ui_keeps_single_stylesheet_entrypoint() -> None:
    """The HTML must keep one stable stylesheet entrypoint."""
    response = make_client().get("/ui/")

    assert response.status_code == 200
    assert 'href="/ui/styles.css"' in response.text
    assert 'href="/ui/styles/' not in response.text


def test_stylesheet_imports_foundations_before_components() -> None:
    """Foundations must load before generic components."""
    response = make_client().get("/ui/styles.css")

    assert response.status_code == 200

    foundations_import = '@import url("./styles/foundations.css");'
    components_import = '@import url("./styles/components.css");'

    assert foundations_import in response.text
    assert components_import in response.text
    assert response.text.index(
        foundations_import,
    ) < response.text.index(
        components_import,
    )


def test_foundations_stylesheet_contains_global_rules() -> None:
    """Global CSS foundations must live in their own module."""
    response = make_client().get(
        "/ui/styles/foundations.css",
    )

    assert response.status_code == 200
    assert ":root {" in response.text
    assert "box-sizing: border-box" in response.text
    assert "html {" in response.text
    assert "body {" in response.text
    assert "button," in response.text


def test_components_stylesheet_contains_generic_components() -> None:
    """Reusable components must live in their own module."""
    response = make_client().get(
        "/ui/styles/components.css",
    )

    assert response.status_code == 200
    assert ".button {" in response.text
    assert ".status-badge {" in response.text
    assert ".alert {" in response.text
    assert ".empty-state {" in response.text
    assert ".hidden {" in response.text
    assert ".visually-hidden {" in response.text


def test_stylesheet_imports_layout_and_navigation_modules() -> None:
    """Layout and navigation must use dedicated modules."""
    response = make_client().get("/ui/styles.css")

    assert response.status_code == 200

    imports = [
        '@import url("./styles/foundations.css");',
        '@import url("./styles/layout.css");',
        '@import url("./styles/components.css");',
        '@import url("./styles/navigation.css");',
    ]

    for stylesheet_import in imports:
        assert stylesheet_import in response.text

    positions = [
        response.text.index(stylesheet_import) for stylesheet_import in imports
    ]

    assert positions == sorted(positions)


def test_layout_stylesheet_contains_application_structure() -> None:
    """Application structure must live in the layout module."""
    response = make_client().get(
        "/ui/styles/layout.css",
    )

    assert response.status_code == 200
    assert ".application-shell {" in response.text
    assert ".application-sidebar {" in response.text
    assert ".application-content {" in response.text
    assert ".application-views {" in response.text
    assert ".application-view[hidden] {" in response.text


def test_navigation_stylesheet_contains_sidebar_navigation() -> None:
    """Sidebar navigation must live in its dedicated module."""
    response = make_client().get(
        "/ui/styles/navigation.css",
    )

    assert response.status_code == 200
    assert ".sidebar-brand {" in response.text
    assert ".sidebar-navigation {" in response.text
    assert ".sidebar-navigation__title {" in response.text
    assert ".sidebar-navigation__item {" in response.text
    assert ".sidebar-navigation__item.is-active {" in response.text
    assert ".sidebar-navigation__icon {" in response.text
    assert ".sidebar-footer {" in response.text


def test_stylesheet_imports_dashboard_and_observations_modules() -> None:
    """Dashboard and observations must use dedicated modules."""
    response = make_client().get("/ui/styles.css")

    assert response.status_code == 200

    dashboard_import = '@import url("./styles/dashboard.css");'
    observations_import = '@import url("./styles/observations.css");'

    assert dashboard_import in response.text
    assert observations_import in response.text

    assert response.text.index(
        dashboard_import,
    ) < response.text.index(
        observations_import,
    )


def test_dashboard_stylesheet_contains_dashboard_structure() -> None:
    """Dashboard-specific rules must live in their module."""
    response = make_client().get(
        "/ui/styles/dashboard.css",
    )

    assert response.status_code == 200
    assert ".dashboard-header {" in response.text
    assert ".dashboard-layout {" in response.text
    assert ".dashboard-kpis {" in response.text
    assert ".dashboard-kpi {" in response.text
    assert ".dashboard-primary {" in response.text
    assert ".dashboard-right-panel {" in response.text


def test_dashboard_stylesheet_contains_side_panel_components() -> None:
    """Dashboard side panels must live in the dashboard module."""
    response = make_client().get(
        "/ui/styles/dashboard.css",
    )

    assert response.status_code == 200
    assert ".side-panel-card {" in response.text
    assert ".side-panel-card__heading {" in response.text
    assert ".side-panel-card__count {" in response.text
    assert ".active-alerts {" in response.text
    assert ".active-alert {" in response.text
    assert ".processing-indicators {" in response.text


def test_observations_stylesheet_contains_recent_observations() -> None:
    """Recent observations must live in their own module."""
    response = make_client().get(
        "/ui/styles/observations.css",
    )

    assert response.status_code == 200
    assert ".recent-observations {" in response.text
    assert ".recent-observation {" in response.text
    assert ".recent-observation--healthy {" in response.text
    assert ".recent-observation__content {" in response.text
    assert ".recent-observation__meta {" in response.text
    assert ".observations-compact" not in response.text


def test_stylesheet_imports_topology_module() -> None:
    """Topology styles must use a dedicated module."""
    response = make_client().get("/ui/styles.css")

    assert response.status_code == 200

    topology_import = '@import url("./styles/topology.css");'

    assert topology_import in response.text


def test_topology_stylesheet_contains_topology_structure() -> None:
    """Topology structure must live in its own module."""
    response = make_client().get(
        "/ui/styles/topology.css",
    )

    assert response.status_code == 200
    assert ".topology-section {" in response.text
    assert ".topology-container {" in response.text
    assert ".topology-canvas {" in response.text
    assert ".topology-workspace {" in response.text
    assert ".topology-controls {" in response.text
    assert ".topology-control {" in response.text


def test_topology_stylesheet_contains_devices_and_links() -> None:
    """Topology devices and links must live in the topology module."""
    response = make_client().get(
        "/ui/styles/topology.css",
    )

    assert response.status_code == 200
    assert ".topology-device {" in response.text
    assert ".topology-device__card {" in response.text
    assert ".topology-device--health-healthy {" in response.text
    assert ".topology-link__path {" in response.text
    assert ".topology-link__connector {" not in response.text
    assert ".dashboard-primary--topology {" in response.text
    assert ".topology-heading-status {" in response.text


def test_stylesheet_imports_device_details_module() -> None:
    """Device details styles must use a dedicated module."""
    response = make_client().get("/ui/styles.css")

    assert response.status_code == 200

    device_details_import = '@import url("./styles/device-details.css");'

    assert device_details_import in response.text


def test_device_details_stylesheet_contains_panel_structure() -> None:
    """The equipment details panel must live in its module."""
    response = make_client().get(
        "/ui/styles/device-details.css",
    )

    assert response.status_code == 200
    assert ".device-details {" in response.text
    assert ".device-details__hero {" in response.text
    assert ".device-details__identity {" in response.text
    assert ".device-details__close {" in response.text
    assert ".device-details__summary {" in response.text
    assert ".device-details__section {" in response.text


def test_device_details_stylesheet_contains_health_and_links() -> None:
    """Health, properties and links must live in the details module."""
    response = make_client().get(
        "/ui/styles/device-details.css",
    )

    assert response.status_code == 200
    assert ".device-details__health {" in response.text
    assert ".device-details__health--healthy {" in response.text
    assert ".device-details__properties {" in response.text
    assert ".device-details__presence-status {" in response.text
    assert ".device-details__presence-properties {" in response.text
    assert ".device-details__links {" in response.text
    assert ".device-details__link {" in response.text
    assert "@keyframes device-details-enter" in response.text


def test_stylesheet_imports_timeline_module() -> None:
    """Timeline styles must use a dedicated module."""
    response = make_client().get("/ui/styles.css")

    assert response.status_code == 200

    timeline_import = '@import url("./styles/timeline.css");'

    assert timeline_import in response.text


def test_timeline_stylesheet_contains_timeline_structure() -> None:
    """Timeline structure must live in its dedicated module."""
    response = make_client().get(
        "/ui/styles/timeline.css",
    )

    assert response.status_code == 200
    assert ".dashboard-timeline {" in response.text
    assert ".timeline-grid {" in response.text
    assert ".timeline-header {" in response.text
    assert ".timeline-axis {" in response.text
    assert ".timeline-rows {" in response.text
    assert ".timeline-row {" in response.text
    assert ".timeline-row__track {" in response.text


def test_timeline_stylesheet_contains_period_states() -> None:
    """Timeline health periods must live in the timeline module."""
    response = make_client().get(
        "/ui/styles/timeline.css",
    )

    assert response.status_code == 200
    assert ".timeline-period {" in response.text
    assert ".timeline-period--healthy {" in response.text
    assert ".timeline-period--degraded {" in response.text
    assert ".timeline-period--unhealthy {" in response.text
    assert ".timeline-period--unknown {" in response.text
    assert ".timeline-row__current {" in response.text
    assert ".timeline-row__current--healthy {" in response.text
    assert ".timeline-row__current--degraded {" in response.text
    assert ".timeline-row__current--unhealthy {" in response.text


def test_stylesheet_imports_responsive_module_last() -> None:
    """Responsive rules must load after responsibility modules."""
    response = make_client().get("/ui/styles.css")

    assert response.status_code == 200

    responsive_import = '@import url("./styles/responsive.css");'

    assert responsive_import in response.text

    imports = [
        line.strip()
        for line in response.text.splitlines()
        if line.strip().startswith("@import")
    ]

    assert imports[-1] == responsive_import


def test_responsive_stylesheet_contains_application_breakpoints() -> None:
    """Responsive adaptations must live in one module."""
    response = make_client().get(
        "/ui/styles/responsive.css",
    )

    assert response.status_code == 200
    assert "@media (max-width: 1200px)" in response.text
    assert "@media (max-width: 1000px)" in response.text
    assert "@media (max-width: 900px)" in response.text
    assert "@media (max-width: 720px)" in response.text
    assert "@media (max-width: 460px)" in response.text
    assert "@media (min-width: 1001px)" in response.text


def test_responsive_stylesheet_preserves_reduced_motion() -> None:
    """Reduced-motion accessibility must remain available."""
    response = make_client().get(
        "/ui/styles/responsive.css",
    )

    assert response.status_code == 200
    assert "@media (prefers-reduced-motion: reduce)" in response.text
    assert "animation-duration: 1ms !important" in response.text
    assert "transition-duration: 1ms !important" in response.text


def test_responsive_device_details_keeps_backup_progress_on_one_row() -> None:
    """The longer progress label must not wrap the device identity on mobile."""
    response = make_client().get(
        "/ui/styles/responsive.css",
    )

    assert response.status_code == 200
    assert ".device-details__hero {" in response.text
    assert "column-gap: 0.65rem;" in response.text
    assert ".device-details__backup-progress {" in response.text
    assert "padding-inline: 0.45rem;" in response.text
    assert "font-size: 0.68rem;" in response.text


def test_stylesheet_entrypoint_imports_all_responsibility_modules() -> None:
    """The CSS entrypoint must import every responsibility module."""
    response = make_client().get("/ui/styles.css")

    assert response.status_code == 200

    expected_imports = [
        '@import url("./design-system.css");',
        '@import url("./styles/foundations.css");',
        '@import url("./styles/layout.css");',
        '@import url("./styles/components.css");',
        '@import url("./styles/navigation.css");',
        '@import url("./styles/dashboard.css");',
        '@import url("./styles/observations.css");',
        '@import url("./styles/incidents.css");',
        '@import url("./styles/topology.css");',
        '@import url("./styles/services.css");',
        '@import url("./styles/host.css");',
        '@import url("./styles/device-details.css");',
        '@import url("./styles/timeline.css");',
        '@import url("./styles/configuration.css");',
        '@import url("./styles/responsive.css");',
    ]

    imports = [
        line.strip()
        for line in response.text.splitlines()
        if line.strip().startswith("@import")
    ]

    assert imports == expected_imports


def test_stylesheet_entrypoint_contains_no_media_queries() -> None:
    """Responsive rules must not remain in the CSS entrypoint."""
    response = make_client().get("/ui/styles.css")

    assert response.status_code == 200
    assert "@media" not in response.text


def test_responsive_stylesheet_uses_consolidated_breakpoints() -> None:
    """Duplicate desktop and mobile breakpoints must be merged."""
    response = make_client().get(
        "/ui/styles/responsive.css",
    )

    assert response.status_code == 200
    assert response.text.count("@media (min-width: 1001px)") == 1
    assert response.text.count("@media (max-width: 720px)") == 1


def test_stylesheet_entrypoint_does_not_duplicate_module_rules() -> None:
    """Module-owned structural rules must leave the entrypoint."""
    response = make_client().get("/ui/styles.css")

    assert response.status_code == 200

    selectors = [
        ".application-shell {",
        ".sidebar-brand {",
        ".dashboard-header {",
        ".recent-observation {",
        ".topology-section {",
        ".device-details {",
        ".timeline-grid {",
    ]

    for selector in selectors:
        assert selector not in response.text


def test_static_ui_exposes_timeline_period_model() -> None:
    """The frontend must expose its timeline period model."""
    response = make_client().get(
        "/ui/timeline_period.js",
    )

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "export class TimelinePeriod" in response.text
    assert "constructor({" in response.text
    assert "static fromPayload(payload)" in response.text


def test_timeline_period_maps_api_contract() -> None:
    """The period model must map the explicit API fields."""
    response = make_client().get(
        "/ui/timeline_period.js",
    )

    assert response.status_code == 200
    assert "payload.status" in response.text
    assert "payload.started_at" in response.text
    assert "payload.ended_at" in response.text
    assert "payload.duration_seconds" in response.text
    assert "payload.is_open" in response.text


def test_timeline_period_validates_period_boundaries() -> None:
    """The period model must reject invalid boundaries."""
    response = make_client().get(
        "/ui/timeline_period.js",
    )

    assert response.status_code == 200
    assert "endedAt < this.startedAt" in response.text
    assert "must not precede startedAt" in response.text
    assert "must not define endedAt" in response.text
    assert "must define endedAt" in response.text


def test_timeline_period_supports_visible_window_clipping() -> None:
    """The period model must support continuous timeline rendering."""
    response = make_client().get(
        "/ui/timeline_period.js",
    )

    assert response.status_code == 200
    assert "effectiveEnd(referenceDate)" in response.text
    assert "overlaps(" in response.text
    assert "clippedTo(" in response.text
    assert "Math.max(" in response.text
    assert "Math.min(" in response.text


def test_application_state_supports_timeline() -> None:
    """Application state must expose the timeline."""
    response = make_client().get(
        "/ui/application_state.js",
    )

    assert response.status_code == 200

    assert "timeline: null" in response.text
    assert "function setTimeline" in response.text


def test_application_loads_timeline_endpoint() -> None:
    """The application controller must load the timeline API."""
    response = make_client().get(
        "/ui/application.js",
    )

    assert response.status_code == 200

    assert "API.timeline" in response.text
    assert "setTimeline(" in response.text
    assert "loadTimeline(" in response.text


def test_api_declares_timeline_endpoint() -> None:
    """Timeline endpoint must be part of the frontend API."""
    response = make_client().get(
        "/ui/api.js",
    )

    assert response.status_code == 200

    assert 'timeline: "/api/timeline"' in response.text


def test_timeline_controller_imports_period_model() -> None:
    """Timeline controller must use the period model."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200
    assert 'from "./timeline_period.js"' in response.text


def test_timeline_controller_tracks_periods() -> None:
    """Timeline controller must synchronize node periods."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200

    assert "this.periodGroups = []" in response.text
    assert "updatePeriods()" in response.text
    assert "TimelinePeriod" in response.text
    assert ".fromPayload(" in response.text
    assert "node.periods" in response.text


def test_timeline_controller_exposes_loaded_periods() -> None:
    """Timeline controller must expose loaded periods."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200

    assert "getPeriods()" in response.text


def test_timeline_controller_uses_api_node_groups() -> None:
    """Timeline controller must consume node groups from the API."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200
    assert "this.state.timeline?.nodes" in response.text
    assert "this.periodGroups" in response.text
    assert "node.node_id" in response.text
    assert "node.periods" in response.text


def test_timeline_controller_supports_period_rendering() -> None:
    """Timeline controller must support rendering periods."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200
    assert "renderPeriod(" in response.text
    assert "timeline-period--" in response.text


def test_timeline_controller_uses_node_periods() -> None:
    """Timeline controller must use periods grouped by API nodes."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200
    assert "this.state.timeline?.nodes" in response.text
    assert "node.node_id" in response.text
    assert "node.periods" in response.text
    assert "this.periodGroups" in response.text


def test_timeline_controller_renders_period_rows() -> None:
    """Timeline controller must render one row per node."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200
    assert "renderPeriodRow(" in response.text
    assert "period.overlaps(" in response.text
    assert "this.renderPeriod(" in response.text


def test_timeline_controller_contains_no_observation_pipeline() -> None:
    """The timeline must no longer render raw observations."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200
    assert "this.state.observations" not in response.text
    assert "groupObservationsByNode" not in response.text
    assert "isObservationVisible" not in response.text
    assert "renderEvent(" not in response.text


def test_timeline_controller_uses_period_counter() -> None:
    """The timeline must count rendered health periods."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200
    assert "renderPeriodCount(" in response.text
    assert "#timeline-period-count" in response.text
    assert "renderEventCount(" not in response.text


def test_timeline_rendering_is_triggered_by_timeline_loading() -> None:
    """Timeline loading must trigger the timeline rendering."""
    response = make_client().get(
        "/ui/application.js",
    )

    assert response.status_code == 200
    assert "setTimeline(" in response.text
    assert "this.timeline.render();" in response.text
    assert (
        "onObservationsChanged: () => {\n                    this.timeline"
        not in response.text
    )


def test_static_ui_exposes_timeline_period_count() -> None:
    """The timeline must expose a period counter."""
    response = make_client().get("/ui/")

    assert response.status_code == 200
    assert 'id="timeline-period-count"' in response.text
    assert 'id="timeline-event-count"' not in response.text


def test_timeline_module_contains_no_legacy_event_rendering() -> None:
    """The timeline must contain no legacy observation rendering."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200

    legacy_terms = [
        "renderEvent(",
        "renderRow(",
        "groupObservationsByNode",
        "isObservationVisible",
        "timeline-event",
        "this.state.observations",
    ]

    for term in legacy_terms:
        assert term not in response.text


def test_timeline_styles_contain_no_legacy_events() -> None:
    """The timeline stylesheet must only style periods."""
    response = make_client().get(
        "/ui/styles/timeline.css",
    )

    assert response.status_code == 200
    assert ".timeline-period" in response.text
    assert ".timeline-event" not in response.text


def test_navigation_overview_combines_main_dashboard_views() -> None:
    """Overview must show dashboard, infrastructure and timeline."""
    response = make_client().get(
        "/ui/navigation.js",
    )

    assert response.status_code == 200
    assert "visibleViews(viewName)" in response.text
    assert 'viewName === "overview"' in response.text
    assert '"overview"' in response.text
    assert '"infrastructure"' in response.text
    assert '"timeline"' in response.text


def test_navigation_specialized_views_remain_independent() -> None:
    """Specialized and configuration routes must remain available."""
    response = make_client().get(
        "/ui/navigation.js",
    )

    assert response.status_code == 200
    assert "return new Set([" in response.text
    assert "this.routeView(viewName)" in response.text
    assert '"configuration-network": "configuration"' in response.text
    assert '"configuration-dhcp": "configuration"' in response.text
    assert '"configuration-architecture": "configuration"' in response.text
    assert '"configuration-plugins": "configuration"' in response.text


def test_application_reflows_visible_topology_after_navigation() -> None:
    """Overview and Infrastructure must reflow the topology."""
    response = make_client().get(
        "/ui/application.js",
    )

    assert response.status_code == 200
    assert 'viewName === "overview"' in response.text
    assert 'viewName === "infrastructure"' in response.text
    assert "this.topology.reflow()" in response.text


def test_navigation_exposes_active_view_to_layout() -> None:
    """Navigation must expose the active view to CSS."""
    response = make_client().get(
        "/ui/navigation.js",
    )

    assert response.status_code == 200
    assert "this.viewContainer" in response.text
    assert ".dataset.activeView" in response.text


def test_layout_supports_combined_overview() -> None:
    """The overview must combine its three visible sections."""
    response = make_client().get(
        "/ui/styles/layout.css",
    )

    assert response.status_code == 200
    assert 'data-active-view="overview"' in response.text
    assert "min-height: 0" in response.text


def test_frontend_contains_no_console_logging() -> None:
    """Production frontend modules must not write to the console."""
    modules = [
        "/ui/api.js",
        "/ui/application.js",
        "/ui/application_state.js",
        "/ui/dashboard.js",
        "/ui/device_details.js",
        "/ui/navigation.js",
        "/ui/observations.js",
        "/ui/timeline.js",
        "/ui/timeline_period.js",
        "/ui/topology.js",
        "/ui/topology_canvas.js",
        "/ui/utils.js",
        "/ui/websocket.js",
    ]

    client = make_client()

    for module in modules:
        response = client.get(module)

        assert response.status_code == 200
        assert "console.log(" not in response.text
        assert "console.info(" not in response.text
        assert "console.warn(" not in response.text
        assert "console.error(" not in response.text
        assert "debugger;" not in response.text


def test_timeline_controller_renders_loading_errors() -> None:
    """Timeline loading failures must be visible to users."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200
    assert "renderError(message)" in response.text
    assert "timeline-empty--error" in response.text
    assert 'role="alert"' in response.text


def test_application_routes_timeline_errors_to_the_ui() -> None:
    """Application must not hide timeline loading failures."""
    response = make_client().get(
        "/ui/application.js",
    )

    assert response.status_code == 200
    assert "this.timeline.renderError(" in response.text
    assert "console.error(" not in response.text


def test_design_system_styles_are_available() -> None:
    """The official Ohana design tokens must be served."""
    client = make_client()

    response = client.get("/ui/design-system.css")

    assert response.status_code == 200
    assert "text/css" in response.headers["content-type"]
    assert "--ohana-brand-primary" in response.text
    assert "--ohana-background-canvas" in response.text
    assert "--ohana-health-healthy" in response.text
    assert "--ohana-space-4" in response.text


def test_static_styles_import_design_system() -> None:
    """The application stylesheet must load the design system."""
    client = make_client()

    response = client.get("/ui/styles.css")

    assert response.status_code == 200
    assert '@import url("./design-system.css");' in response.text


def test_foundation_styles_use_design_system_tokens() -> None:
    """Global foundations must use the official design tokens."""
    client = make_client()

    response = client.get("/ui/styles/foundations.css")

    assert response.status_code == 200
    assert "var(--ohana-font-family-sans)" in response.text
    assert "var(--ohana-background-canvas)" in response.text
    assert "var(--ohana-text-primary)" in response.text
    assert "var(--ohana-border-focus)" in response.text


def test_health_states_are_supported_by_ui_styles() -> None:
    """The UI must support every official Ohana-Vision health state."""
    client = make_client()

    response = client.get("/ui/styles/observations.css")

    assert response.status_code == 200
    assert ".recent-observation--healthy" in response.text
    assert ".recent-observation--degraded" in response.text
    assert ".recent-observation--unhealthy" in response.text
    assert ".recent-observation--unknown" in response.text


def test_official_navigation_icon_is_available() -> None:
    """Official Ohana navigation icons must be served."""
    client = make_client()

    response = client.get(
        "/ui/assets/icons/navigation/layout-dashboard.svg",
    )

    assert response.status_code == 200
    assert "image/svg+xml" in response.headers["content-type"]


def test_sidebar_uses_official_navigation_icons() -> None:
    """Sidebar navigation must use official Ohana icons."""
    client = make_client()

    html_response = client.get("/ui/")
    css_response = client.get("/ui/styles/navigation.css")

    assert html_response.status_code == 200
    assert css_response.status_code == 200

    assert "sidebar-navigation__icon--overview" in html_response.text
    assert "sidebar-navigation__icon--infrastructure" in html_response.text
    assert "sidebar-navigation__icon--timeline" in html_response.text
    assert "sidebar-navigation__icon--observations" in html_response.text

    assert "../assets/icons/navigation/layout-dashboard.svg" in css_response.text
    assert "../assets/icons/navigation/network.svg" in css_response.text
    assert "../assets/icons/navigation/clock-3.svg" in css_response.text
    assert "../assets/icons/navigation/eye.svg" in css_response.text


def test_dashboard_kpis_use_official_icons() -> None:
    """Dashboard KPIs must use official Ohana icons."""
    client = make_client()

    html_response = client.get("/ui/")
    css_response = client.get("/ui/styles/dashboard.css")

    assert html_response.status_code == 200
    assert css_response.status_code == 200

    expected_classes = [
        "dashboard-kpi__icon--availability",
        "dashboard-kpi__icon--devices",
        "dashboard-kpi__icon--alerts",
    ]

    for class_name in expected_classes:
        assert class_name in html_response.text

    expected_icons = [
        "../assets/icons/observability/gauge.svg",
        "../assets/icons/infrastructure/network.svg",
        "../assets/icons/observability/bell-ring.svg",
    ]

    for icon_path in expected_icons:
        assert icon_path in css_response.text


def test_topology_zoom_in_uses_official_icon() -> None:
    """Topology zoom-in action must use the official Ohana icon."""
    client = make_client()

    html_response = client.get("/ui/")
    css_response = client.get("/ui/styles/topology.css")

    assert html_response.status_code == 200
    assert css_response.status_code == 200

    assert "topology-control--zoom-in" in html_response.text
    assert "topology-control__icon" in html_response.text

    assert "../assets/icons/actions/plus.svg" in css_response.text


def test_dashboard_header_uses_official_refresh_icon() -> None:
    """Dashboard header refresh action must use the official Ohana icon."""
    client = make_client()

    html_response = client.get("/ui/")
    css_response = client.get("/ui/styles/dashboard.css")

    assert html_response.status_code == 200
    assert css_response.status_code == 200

    assert "dashboard-header__refresh-button" in html_response.text
    assert "dashboard-header__refresh-icon" in html_response.text

    assert "../assets/icons/administration/refresh-cw.svg" in css_response.text


def test_sidebar_uses_official_brand_asset() -> None:
    """Sidebar brand must use the official Ohana symbol."""
    response = make_client().get("/ui/")

    assert response.status_code == 200
    assert 'src="/ui/assets/logos/symbol.svg"' in response.text
    assert 'class="sidebar-brand__icon"' in response.text


def test_sidebar_styles_define_modern_navigation_states() -> None:
    """Sidebar must expose hover, active and keyboard states."""
    response = make_client().get(
        "/ui/styles/navigation.css",
    )

    assert response.status_code == 200
    assert ".sidebar-navigation__item:hover {" in response.text
    assert ".sidebar-navigation__item.is-active {" in response.text
    assert ".sidebar-navigation__item.is-active::before {" in response.text
    assert ".sidebar-navigation__item:focus-visible {" in response.text
    assert "var(--ohana-border-focus)" in response.text


def test_connection_status_uses_official_health_states() -> None:
    """Realtime connection states must use official health tokens."""
    client = make_client()

    response = client.get("/ui/styles.css")

    assert response.status_code == 200

    assert ".connection-status--online {" in response.text
    assert ".connection-status--connecting {" in response.text
    assert ".connection-status--offline {" in response.text

    assert "var(--ohana-health-healthy)" in response.text
    assert "var(--ohana-health-degraded)" in response.text
    assert "var(--ohana-health-critical)" in response.text
    assert "@keyframes connection-status-pulse" in response.text


def test_sidebar_exposes_product_version() -> None:
    """Sidebar footer must expose the product and its version."""
    response = make_client().get("/ui/")

    assert response.status_code == 200
    assert "sidebar-version__product" in response.text
    assert "sidebar-version__number" in response.text
    assert "Ohana-Vision" in response.text
    assert 'id="vision-version"' in response.text
    assert "v1.7.1" not in response.text


def test_sidebar_version_uses_discrete_footer_styles() -> None:
    """Product version must use dedicated sidebar footer styles."""
    response = make_client().get(
        "/ui/styles/navigation.css",
    )

    assert response.status_code == 200
    assert ".sidebar-version {" in response.text
    assert ".sidebar-version__product {" in response.text
    assert ".sidebar-version__number {" in response.text
    assert "var(--ohana-font-family-mono)" in response.text


def test_official_sidebar_symbol_is_available() -> None:
    """The official Ohana symbol must be served."""
    response = make_client().get(
        "/ui/assets/logos/symbol.svg",
    )

    assert response.status_code == 200
    assert "image/svg+xml" in response.headers["content-type"]


def test_dashboard_cards_use_design_system_surfaces() -> None:
    """Dashboard cards must use official Design System surfaces."""
    client = make_client()

    dashboard_response = client.get("/ui/styles/dashboard.css")
    components_response = client.get("/ui/styles/components.css")

    assert dashboard_response.status_code == 200
    assert components_response.status_code == 200

    assert "var(--ohana-background-surface)" in dashboard_response.text
    assert "var(--ohana-border-subtle)" in dashboard_response.text
    assert "var(--ohana-radius-md)" in dashboard_response.text
    assert "var(--ohana-shadow-sm)" in dashboard_response.text

    assert "var(--ohana-health-critical-soft)" in components_response.text


def test_dashboard_kpis_use_design_system_tokens() -> None:
    """Dashboard KPIs must use the official Design System tokens."""
    response = make_client().get(
        "/ui/styles/dashboard.css",
    )

    assert response.status_code == 200

    assert ".dashboard-kpi {" in response.text
    assert "var(--ohana-background-surface-raised)" in response.text
    assert "var(--ohana-border-subtle)" in response.text
    assert "var(--ohana-shadow-sm)" in response.text
    assert "var(--ohana-health-healthy)" in response.text
    assert "var(--ohana-health-degraded)" in response.text
    assert "var(--ohana-health-critical)" in response.text
    assert "font-variant-numeric: tabular-nums;" in response.text


def test_side_panel_cards_use_design_system_tokens() -> None:
    """Side panel cards must use official Design System tokens."""
    response = make_client().get(
        "/ui/styles/dashboard.css",
    )

    assert response.status_code == 200

    assert ".side-panel-card {" in response.text
    assert ".active-alert {" in response.text
    assert ".processing-indicator {" in response.text

    assert "var(--ohana-background-surface-raised)" in response.text
    assert "var(--ohana-health-healthy-soft)" in response.text
    assert "var(--ohana-health-degraded)" in response.text
    assert "var(--ohana-health-critical)" in response.text
    assert "font-variant-numeric: tabular-nums;" in response.text


def test_dashboard_cards_define_interactive_states() -> None:
    """Dashboard cards must expose consistent interaction states."""
    client = make_client()

    dashboard_response = client.get(
        "/ui/styles/dashboard.css",
    )
    responsive_response = client.get(
        "/ui/styles/responsive.css",
    )

    assert dashboard_response.status_code == 200
    assert responsive_response.status_code == 200

    assert ".dashboard-kpi--updating {" in dashboard_response.text
    assert ".dashboard-kpi--warning {" in dashboard_response.text
    assert ".dashboard-kpi--critical {" in dashboard_response.text

    assert ".active-alert:hover {" in dashboard_response.text
    assert ".active-alert:focus-visible {" in dashboard_response.text
    assert ".active-alert:active {" in dashboard_response.text

    assert ".processing-indicator--error {" in dashboard_response.text
    assert "var(--ohana-health-critical-soft)" in dashboard_response.text

    assert ".dashboard-kpi--updating" in responsive_response.text
    assert "transform: none;" in responsive_response.text


def test_timeline_header_uses_design_system_tokens() -> None:
    """Timeline controls and legend must use the Design System."""
    response = make_client().get(
        "/ui/styles/timeline.css",
    )

    assert response.status_code == 200

    assert ".timeline-header {" in response.text
    assert ".timeline-range {" in response.text
    assert ".timeline-range__button--active {" in response.text
    assert ".timeline-range__button:focus-visible {" in response.text
    assert ".timeline-legend {" in response.text

    assert "var(--ohana-brand-primary-soft)" in response.text
    assert "var(--ohana-health-healthy-soft)" in response.text
    assert "var(--ohana-health-degraded-soft)" in response.text
    assert "var(--ohana-health-critical-soft)" in response.text
    assert "var(--ohana-health-unknown-soft)" in response.text


def test_timeline_axis_and_rows_use_design_system() -> None:
    """Timeline axis and rows must use the Design System."""
    response = make_client().get(
        "/ui/styles/timeline.css",
    )

    assert response.status_code == 200

    assert ".timeline-axis {" in response.text
    assert ".timeline-axis__labels {" in response.text
    assert ".timeline-row {" in response.text
    assert ".timeline-row__node:focus-visible {" in response.text
    assert ".timeline-row__track {" in response.text
    assert "#timeline-content {" in response.text

    assert "var(--ohana-font-family-mono)" in response.text
    assert "var(--ohana-background-canvas)" in response.text
    assert "var(--ohana-border-subtle)" in response.text
    assert "var(--ohana-health-healthy-soft)" in response.text
    assert "var(--ohana-health-degraded-soft)" in response.text
    assert "var(--ohana-health-critical-soft)" in response.text
    assert "var(--ohana-health-unknown-soft)" in response.text


def test_timeline_renders_period_durations() -> None:
    """Timeline periods must render as duration segments."""
    client = make_client()

    javascript_response = client.get(
        "/ui/timeline.js",
    )
    stylesheet_response = client.get(
        "/ui/styles/timeline.css",
    )

    assert javascript_response.status_code == 200
    assert stylesheet_response.status_code == 200

    assert "period.clippedTo(" in javascript_response.text
    assert "right - left" in javascript_response.text
    assert "width: ${width}%;" in javascript_response.text
    assert '"timeline-period--open"' in javascript_response.text

    assert ".timeline-period--open {" in stylesheet_response.text
    assert ".timeline-period--open::after {" in stylesheet_response.text
    assert "min-width: 0.5%;" in stylesheet_response.text
    assert "transform: translateY(-50%);" in stylesheet_response.text


def test_overview_places_current_state_timeline_beside_topology() -> None:
    """Overview must reserve its remaining height for topology and state list."""
    client = make_client()

    layout_response = client.get(
        "/ui/styles/layout.css",
    )
    timeline_response = client.get(
        "/ui/styles/timeline.css",
    )

    assert layout_response.status_code == 200
    assert timeline_response.status_code == 200

    assert '"topology timeline"' in layout_response.text
    assert "minmax(0, 1fr)" in layout_response.text
    assert 'data-active-view="overview"' in layout_response.text
    assert ".timeline-current-states" in timeline_response.text
    assert "overflow-y: auto;" in timeline_response.text
    assert ".timeline-range," in timeline_response.text


def test_timeline_periods_expose_accessible_details() -> None:
    """Timeline periods must expose status, dates and duration."""
    client = make_client()

    javascript_response = client.get(
        "/ui/timeline.js",
    )
    stylesheet_response = client.get(
        "/ui/styles/timeline.css",
    )
    responsive_response = client.get(
        "/ui/styles/responsive.css",
    )

    assert javascript_response.status_code == 200
    assert stylesheet_response.status_code == 200
    assert responsive_response.status_code == 200

    assert "function formatTimelineDuration(" in javascript_response.text
    assert "`État : ${statusLabel}`" in javascript_response.text
    assert "`Début : ${startedAtLabel}`" in javascript_response.text
    assert "`Fin : ${endedAtLabel}`" in javascript_response.text
    assert "`Durée : ${durationLabel}`" in javascript_response.text

    assert 'data-period-status="${escapeHtml(' in javascript_response.text
    assert 'data-period-open="${String(' in javascript_response.text

    assert ".timeline-period:focus-visible {" in stylesheet_response.text
    assert ".timeline-period:active {" in stylesheet_response.text
    assert ".timeline-period--open::after {" in stylesheet_response.text

    assert ".timeline-period:focus-visible," in responsive_response.text


def test_timeline_controller_renders_empty_state() -> None:
    """Timeline must explain when the selected range has no periods."""
    response = make_client().get(
        "/ui/timeline.js",
    )

    assert response.status_code == 200

    assert "renderEmpty(" in response.text
    assert 'class="timeline-empty"' in response.text
    assert 'role="status"' in response.text
    assert "timeline-empty__icon--empty" in response.text
    assert "Aucune période sur cette plage" in response.text


def test_timeline_empty_and_error_states_use_design_system() -> None:
    """Timeline empty and error states must use official tokens."""
    response = make_client().get(
        "/ui/styles/timeline.css",
    )

    assert response.status_code == 200

    assert ".timeline-empty {" in response.text
    assert ".timeline-empty__icon {" in response.text
    assert ".timeline-empty__content {" in response.text
    assert ".timeline-empty--error {" in response.text

    assert "var(--ohana-health-unknown)" in response.text
    assert "var(--ohana-health-critical)" in response.text
    assert "../assets/icons/navigation/clock-3.svg" in response.text
    assert "../assets/icons/observability/activity.svg" in response.text


def test_topology_uses_official_equipment_icons() -> None:
    """Topology cards must map device kinds to local official icons."""
    client = make_client()

    response = client.get("/ui/topology_canvas.js")

    assert response.status_code == 200
    assert "deviceIconPath" in response.text
    assert "/ui/assets/icons/network/globe-2.svg" in response.text
    assert "/ui/assets/icons/network/router.svg" in response.text
    assert "/ui/assets/icons/infrastructure/network.svg" in response.text
    assert "/ui/assets/icons/hardware/cpu.svg" in response.text
    assert "/ui/assets/icons/hardware/house.svg" in response.text


def test_topology_styles_official_equipment_cards() -> None:
    """Topology styles must expose the official masked icon treatment."""
    client = make_client()

    response = client.get("/ui/styles/topology.css")

    assert response.status_code == 200
    assert ".topology-device__official-icon" in response.text
    assert "mask-image: var(--topology-device-icon)" in response.text
    assert ".topology-device:focus-visible" in response.text


def test_responsive_stylesheet_does_not_restore_fixed_topology_width() -> None:
    """Global responsive rules must preserve the fluid topology canvas."""
    response = make_client().get("/ui/styles/responsive.css")

    assert response.status_code == 200
    assert "width: 64rem" not in response.text
    assert "min-width: 48rem" not in response.text
    assert ".topology-container," in response.text
    assert ".topology-canvas {" in response.text


def test_responsive_stylesheet_preserves_touch_targets() -> None:
    """Mobile overrides must not shrink interactive controls below 44 px."""
    response = make_client().get("/ui/styles/responsive.css")

    assert response.status_code == 200
    assert "min-width: 2rem" not in response.text
    assert "height: 2rem" not in response.text
    assert "min-height: 2.75rem" in response.text


def test_responsive_stylesheet_adapts_timeline_and_observations() -> None:
    """Dense realtime views must remain usable on narrow screens."""
    response = make_client().get("/ui/styles/responsive.css")

    assert response.status_code == 200
    assert "#timeline-content" in response.text
    assert "overscroll-behavior-inline: contain;" in response.text
    assert ".timeline-range__button" in response.text
    assert ".recent-observation__meta" in response.text
    assert "grid-column: 2;" in response.text


def test_observations_list_is_not_limited_to_six_items() -> None:
    """Render every observation and let the list container handle scrolling."""
    response = make_client().get("/ui/observations.js")

    assert response.status_code == 200
    assert ".slice(0, 6)" not in response.text
    assert "this.elements.recentList.innerHTML = recent" in response.text


def test_plugin_ui_supports_observation_plugins() -> None:
    """Expose dedicated controls for configurable Agent plugins."""
    client = make_client()
    html_response = client.get("/ui/")
    js_response = client.get("/ui/configuration.js")

    assert html_response.status_code == 200
    assert js_response.status_code == 200
    assert '<option value="wireguard">WireGuard</option>' in html_response.text
    assert 'plugin.id === "zwave"' in js_response.text
    assert 'plugin.id === "wireguard"' in js_response.text
    assert "plugin-zwave-verify-tls" in js_response.text
    assert "plugin-wireguard-app-token" in js_response.text
    assert "plugin-wireguard-verify-tls" in js_response.text
    assert '"home_assistant_telemetry"' in js_response.text
    assert '"shelly_telemetry"' in js_response.text
    assert "plugin-home-assistant-telemetry-url" in js_response.text
    assert "plugin-shelly-devices" not in js_response.text
    assert (
        '<option value="home_assistant_telemetry">Télémétrie Home Assistant</option>'
        in html_response.text
    )
    assert "architecture-service-home-assistant-primary-entity" in html_response.text
    assert "architecture-service-home-assistant-secondary-entity" in html_response.text
    assert "architecture-service-home-assistant-maximum-age" in html_response.text
    assert "shelly_telemetry_enabled" not in js_response.text
    assert 'service.type === "shelly_telemetry"' in js_response.text
    assert (
        '<option value="teleinformation">Téléinformation</option>' in html_response.text
    )
    assert "architecture-service-teleinformation-fields" in html_response.text
    assert "architecture-device-monitoring-schedule-enabled" in html_response.text
    assert "architecture-device-monitoring-start" in html_response.text
    assert "architecture-device-monitoring-end" in html_response.text
    assert "architecture-device-monitoring-timezone" in html_response.text
    assert "architecture-service-teleinformation-meter-id" in html_response.text
    assert "architecture-service-teleinformation-source-id" in html_response.text
    assert "plugin-teleinformation-mode" in js_response.text
    assert "plugin-teleinformation-listen-port" in js_response.text
    assert "plugin-teleinformation-ingestion-token" in js_response.text
    assert "architecture-service-teleinformation-power-entity" in html_response.text
    assert "architecture-service-teleinformation-tariff-entity" in html_response.text
    assert "architecture-service-teleinformation-blue-off-peak-entity" in (
        html_response.text
    )
    assert "architecture-service-teleinformation-red-peak-entity" in (
        html_response.text
    )
    assert 'plugin.id === "teleinformation"' in js_response.text
    assert "plugin-teleinformation-home-assistant-url" in js_response.text
    assert "plugin-teleinformation-access-token" in js_response.text
    assert "plugin-teleinformation-token-environment" in js_response.text
    assert "plugin-teleinformation-verify-tls" in js_response.text
    assert 'type === "teleinformation"' in js_response.text
    assert "teleinformation.freshness" not in html_response.text


def test_plugin_ui_configures_haos_backups() -> None:
    """Expose safe, per-target backup controls in the Agent plugin editor."""
    response = make_client().get("/ui/configuration.js")

    assert response.status_code == 200
    assert 'plugin.id === "backup"' in response.text
    assert "plugin-backup-destination-path" in response.text
    assert "plugin-backup-target-${index}-enabled" in response.text
    assert "plugin-backup-target-${index}-url" in response.text
    assert "plugin-backup-target-${index}-time" in response.text
    assert "token_configured" in response.text
    assert "password_configured" in response.text
    assert "plugin-backup-target-${index}-token" in response.text
    assert "plugin-backup-target-${index}-password" in response.text
    assert "Clé de chiffrement des sauvegardes" in response.text
    assert "Paramètres → Système → Sauvegardes" in response.text
    assert "plugin-backup-icloud-apple-id" in response.text
    assert "plugin-backup-icloud-password" in response.text
    assert "plugin-backup-icloud-two-factor" in response.text
    assert "administrationBackupICloudConnect" in response.text
    assert "captureBackupFormDraft" in response.text
    assert "restoreBackupFormDraft" in response.text
    assert "Ces identifiants ne sont pas conservés" in response.text
    assert "Modifications non appliquées" in response.text
    assert "Cliquez sur Appliquer avant de tester" in response.text
    assert "event.target?.id?.startsWith" in response.text
    assert "Renseignez l'identifiant Apple" in response.text
    assert "Renseignez le code 2FA" in response.text
    assert 'placeholder="nom@icloud.com" required' not in response.text
    assert 'autocomplete="current-password" required' not in response.text
    assert 'placeholder="Code 2FA" required' not in response.text
    assert "planification NVM de Z-Wave JS UI" in response.text
    assert "configuration.rclone_remote" in response.text


def test_sidebar_exposes_agent_version_placeholder() -> None:
    """Sidebar footer must reserve a line for the connected Agent version."""
    response = make_client().get("/ui/")

    assert response.status_code == 200
    assert 'class="sidebar-versions"' in response.text
    assert "Ohana-Agent" in response.text
    assert 'id="agent-version"' in response.text


def test_application_loads_agent_version_from_capabilities() -> None:
    """Frontend must read the Agent version from its administration contract."""
    response = make_client().get("/ui/application.js")

    assert response.status_code == 200
    assert "async loadAgentVersion()" in response.text
    assert "API.administrationCapabilities" in response.text
    assert "capabilities?.agent_version" in response.text
    assert '"indisponible"' in response.text


def test_dashboard_applies_critical_capability_health_to_kpis() -> None:
    """Critical service observations must participate in dashboard health."""
    response = make_client().get("/ui/dashboard.js")

    assert response.status_code == 200
    assert "criticalServicePolicies()" in response.text
    assert "criticalCapabilityHealthByDevice()" in response.text
    assert "effectiveDeviceHealth()" in response.text
    assert "normalizeHealthStatus(status)" in response.text
    assert "service.critical !== true" in response.text
    assert "observation.node_id" in response.text
    assert "observation.service_id" in response.text
    assert "observation.capability_id" in response.text


def test_zwave_form_documents_home_assistant_websocket_port() -> None:
    """Z-Wave plugin form must describe the Home Assistant server endpoint."""
    response = make_client().get("/ui/configuration.js")

    assert response.status_code == 200
    assert "serveur WebSocket sur le port 3000" in response.text
    assert "connexions WSS" in response.text


def test_static_ui_exposes_services_map_page() -> None:
    """The supervision sidebar must expose the dedicated services page."""
    response = make_client().get("/ui/")

    assert response.status_code == 200
    assert 'data-navigation-target="services"' in response.text
    assert 'data-view="services"' in response.text
    assert 'id="services-map"' in response.text
    assert 'id="service-inspector"' in response.text
    assert 'id="services-critical-count"' in response.text


def test_architecture_service_editor_exposes_availability_group() -> None:
    """Redundant service instances must share an editable logical group."""
    html_response = make_client().get("/ui/")
    script_response = make_client().get("/ui/configuration.js")

    assert html_response.status_code == 200
    assert 'id="architecture-service-availability-group"' in html_response.text
    assert "Groupe de disponibilité" in html_response.text
    assert script_response.status_code == 200
    assert "service.metadata?.availability_group" in script_response.text
    assert "metadata.availability_group = availabilityGroup" in script_response.text
    assert "delete metadata.availability_group" in script_response.text
    assert 'this.setValue("architecture-service-availability-group", "dns")' in (
        script_response.text
    )


def test_services_map_javascript_is_available() -> None:
    """The logical services controller must be packaged and served."""
    response = make_client().get("/ui/services.js")

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "class ServicesController" in response.text
    assert "API.administrationInfrastructure" in response.text
    assert "latestCapabilityStates(" in response.text
    assert "timelineService(" in response.text
    assert "this.currentStatus(timelineService.periods)" in response.text
    assert "timelineService?.capabilities" in response.text
    assert "groupByHost(" in response.text
    assert "service.critical" in response.text


def test_services_map_stylesheet_is_available() -> None:
    """The services map must use its own modular stylesheet."""
    response = make_client().get("/ui/styles/services.css")

    assert response.status_code == 200
    assert "text/css" in response.headers["content-type"]
    assert ".services-workspace" in response.text
    assert ".services-host" in response.text
    assert ".service-map-item" in response.text
    assert ".service-inspector" in response.text


def test_application_wires_services_controller() -> None:
    """The frontend must refresh services from observations and the timeline."""
    response = make_client().get("/ui/application.js")

    assert response.status_code == 200
    assert 'from "./services.js"' in response.text
    assert "new ServicesController" in response.text
    assert 'viewName === "services"' in response.text
    assert "this.services.load({" in response.text
    assert "this.services.render();" in response.text


def test_static_ui_exposes_host_health_page() -> None:
    """The supervision sidebar must expose the Agent host health page."""
    response = make_client().get("/ui/")

    assert response.status_code == 200
    assert 'data-navigation-target="host"' in response.text
    assert 'data-view="host"' in response.text
    assert 'id="host-state-label"' in response.text
    assert 'data-host-metric="host-uptime"' in response.text
    assert 'data-host-metric="agent-uptime"' in response.text
    assert 'data-host-health-icon="healthy"' in response.text
    assert 'data-host-health-icon="degraded"' in response.text
    assert 'data-host-health-icon="critical"' in response.text
    assert "host-health-healthy.png" in response.text
    assert "host-health-degraded.png" in response.text
    assert "host-health-critical.png" in response.text
    assert "/100" not in response.text


def test_host_health_javascript_is_available() -> None:
    """The host health controller must be packaged and served."""
    response = make_client().get("/ui/host.js")

    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "class HostController" in response.text
    assert "API.hostHealth" in response.text
    assert "host_uptime" in response.text
    assert "agent_uptime" in response.text
    assert "RESOURCE_THRESHOLDS" in response.text
    assert "data-host-meter" in response.text


def test_host_health_stylesheet_is_available() -> None:
    """The host health page must use its own modular stylesheet."""
    response = make_client().get("/ui/styles/host.css")

    assert response.status_code == 200
    assert "text/css" in response.headers["content-type"]
    assert ".host-view" in response.text
    assert ".host-primary-metrics" in response.text
    assert ".host-health-icon" in response.text
    assert "width: 9rem" in response.text


@pytest.mark.parametrize(
    "asset_name",
    (
        "host-health-healthy.png",
        "host-health-degraded.png",
        "host-health-critical.png",
    ),
)
def test_host_health_pictograms_are_packaged(asset_name: str) -> None:
    """The approved host-state pictograms must be served by Vision."""
    response = make_client().get(f"/ui/assets/icons/health/{asset_name}")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert len(response.content) > 10_000


def test_application_wires_host_health_controller() -> None:
    """The frontend must load and refresh the latest host health snapshot."""
    application = make_client().get("/ui/application.js")
    api = make_client().get("/ui/api.js")

    assert application.status_code == 200
    assert 'from "./host.js"' in application.text
    assert "new HostController" in application.text
    assert 'viewName === "host"' in application.text
    assert "this.host.load()" in application.text
    assert api.status_code == 200
    assert 'hostHealth: "/api/host-health"' in api.text


def test_mqtt_plugin_form_configures_home_assistant_health_export() -> None:
    """MQTT settings must expose the approved Home Assistant export options."""
    response = make_client().get("/ui/configuration.js")

    assert response.status_code == 200
    assert "plugin-mqtt-ha-enabled" in response.text
    assert "plugin-mqtt-ha-discovery-enabled" in response.text
    assert "plugin-mqtt-ha-discovery-prefix" in response.text
    assert "plugin-mqtt-ha-topic-prefix" in response.text
    assert "plugin-mqtt-ha-heartbeat" in response.text
    assert "configuration.home_assistant =" in response.text
    assert "Publier la santé Ohana dans Home Assistant" in response.text


def test_application_loads_vision_version_from_backend() -> None:
    """Frontend must render the running backend version instead of a static value."""
    response = make_client().get("/ui/application.js")

    assert response.status_code == 200
    assert "async loadVisionVersion()" in response.text
    assert "API.version" in response.text
    assert "payload?.version" in response.text


def test_frontend_limits_observations_and_coalesces_realtime_refreshes() -> None:
    """Frequent plugin observations must not saturate hidden views."""
    response = make_client().get("/ui/application.js")

    assert response.status_code == 200
    assert "?limit=100" in response.text
    assert "observationRefreshInFlight" in response.text
    assert "observationRefreshPending" in response.text
    assert "timelineRefreshIntervalMs = 5000" in response.text
    assert "timelineHistoryHours = 24" in response.text
    assert "?since=${encodeURIComponent(" in response.text
    assert 'activeView === "observations"' in response.text
    assert 'activeView === "timeline"' in response.text
    assert "this.services.render();" in response.text
    assert "this.services.invalidate()" in response.text


def test_realtime_observation_forces_timeline_reload() -> None:
    """A fresh accepted observation must refresh stale service statuses."""
    response = make_client().get("/ui/application.js")

    assert response.status_code == 200
    assert "this.loadTimeline({\n                        force: true," in response.text


def test_equipment_views_share_the_official_icon_catalog() -> None:
    """Topology, architecture and details must use the same icon source."""
    client = make_client()

    utilities = client.get("/ui/utils.js")
    configuration = client.get("/ui/configuration.js")
    details = client.get("/ui/device_details.js")
    services = client.get("/ui/services.js")

    assert utilities.status_code == 200
    assert configuration.status_code == 200
    assert details.status_code == 200
    assert services.status_code == 200
    assert "DEVICE_ICON_PATHS" in utilities.text
    assert "export function deviceIconPath" in utilities.text
    assert "deviceIconPath(device.kind)" in configuration.text
    assert "deviceIconPath(kind)" in details.text
    assert "deviceIconPath(host.kind)" in services.text
    assert "architecture-map-device__icon" in configuration.text
    assert "device-details__official-icon" in details.text
    assert "--services-host-icon" in services.text


def test_architecture_editor_supports_dns_hosts_and_contextual_ports() -> None:
    client = make_client()
    html_response = client.get("/ui/")
    js_response = client.get("/ui/configuration.js")

    assert "Hôte ou adresse IP" in html_response.text
    assert "she-01.ohana.lan" in html_response.text
    assert 'id="architecture-service-port-field" hidden' in html_response.text
    assert "SERVICE_PORT_POLICIES" in js_response.text
    assert "endpointTypeForAddress" in js_response.text
    assert 'return isIpv4Address(value.trim()) ? "ip" : "hostname";' in (
        js_response.text
    )
    assert 'home_assistant_telemetry: { mode: "hidden"' in js_response.text
    assert 'mqtt: { mode: "optional", defaultPort: 1883 }' in js_response.text


def test_backup_ui_exposes_infra_01_encryption_and_schedule() -> None:
    client = make_client()
    response = client.get("/ui/configuration.js")

    assert response.status_code == 200
    assert "plugin-backup-infra-enabled" in response.text
    assert "plugin-backup-infra-recipient" not in response.text
    assert "plugin-backup-infra-retention" in response.text
    assert "remote_retention_count" in response.text
    assert "Chiffrement age géré automatiquement" in response.text
    assert "copie de récupération dans iCloud Drive" in response.text
    assert 'return "Sauvegardes activées";' in response.text
    assert "configuration.infra_01" in response.text
    assert "delete configuration.infra_01.backup_in_progress" in response.text
    assert "delete configuration.infra_01.age_recipient" in response.text


def test_device_details_supports_manual_infra_01_backup() -> None:
    client = make_client()
    response = client.get("/ui/device_details.js")

    assert response.status_code == 200
    assert 'device.device_id === "infra-01"' in response.text
    assert "plugin.configuration.infra_01" in response.text
