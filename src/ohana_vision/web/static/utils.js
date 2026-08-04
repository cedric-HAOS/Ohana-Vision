"use strict";

const DEVICE_ICON_PATHS = Object.freeze({
    internet: "/ui/assets/icons/network/globe-2.svg",
    router: "/ui/assets/icons/network/router.svg",
    switch: "/ui/assets/icons/infrastructure/network.svg",
    access_point: "/ui/assets/icons/network/wifi.svg",
    server: "/ui/assets/icons/infrastructure/server.svg",
    raspberry_pi: "/ui/assets/icons/hardware/cpu.svg",
    home_assistant: "/ui/assets/icons/hardware/house.svg",
    camera: "/ui/assets/icons/hardware/camera.svg",
    smart_device: "/ui/assets/icons/hardware/plug-zap.svg",
    zwave_module: "/ui/assets/icons/protocols/zwave.svg",
    solar: "/ui/assets/icons/hardware/battery-charging.svg",
    computer: "/ui/assets/icons/containers-cloud/monitor-cog.svg",
    storage: "/ui/assets/icons/hardware/hard-drive.svg",
    other: "/ui/assets/icons/infrastructure/boxes.svg",
});

/**
 * Return the official icon path used by every equipment view.
 *
 * @param {unknown} kind
 * @returns {string}
 */
export function deviceIconPath(kind) {
    const normalizedKind = String(
        kind ?? "other",
    ).toLowerCase();

    return DEVICE_ICON_PATHS[normalizedKind]
        ?? DEVICE_ICON_PATHS.other;
}

/**
 * Return whether Vision receives health for an equipment.
 *
 * Devices attached to an Agent node are supervised through that node. Radio
 * modules discovered by the Z-Wave plugin have no node_id of their own, so
 * their targeted health observations are also a supervision source.
 *
 * @param {object | null | undefined} device
 * @param {Iterable<object>} observations
 * @returns {boolean}
 */
export function isDeviceSupervised(device, observations = []) {
    if (Boolean(device?.node_id)) {
        return true;
    }

    if (
        device?.metadata?.managed_by
        === "zwave_discovery"
    ) {
        return true;
    }

    const deviceId = String(
        device?.device_id ?? "",
    );

    return Array.from(observations).some(
        (observation) => {
            const metadata =
                observation?.metadata ?? {};

            return (
                metadata.target_type === "device"
                && metadata.contributes_to_device_health
                    === true
                && String(
                    metadata.device_id
                    ?? observation?.service_id
                    ?? "",
                ) === deviceId
            );
        },
    );
}

/**
 * Escape a value before inserting it into generated HTML.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
    const element = document.createElement("div");

    element.textContent = String(value ?? "");

    return element.innerHTML;
}

/**
 * Format an ISO date using the French locale.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function formatDate(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(String(value));

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "medium",
    }).format(date);
}

/**
 * Format a latency value.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function formatLatency(value) {
    if (value === null || value === undefined) {
        return "—";
    }

    const latency = Number(value);

    if (!Number.isFinite(latency)) {
        return "—";
    }

    return `${latency.toFixed(2)} ms`;
}

/**
 * Return the normalized health status used by the UI.
 *
 * @param {unknown} status
 * @returns {string}
 */
export function normalizeHealthStatus(status) {
    const normalized = String(
        status ?? "unknown",
    ).toLowerCase();

    if (normalized === "unavailable") {
        return "unhealthy";
    }

    const supportedStatuses = new Set([
        "healthy",
        "suspended",
        "degraded",
        "unhealthy",
        "unknown",
    ]);

    return supportedStatuses.has(normalized)
        ? normalized
        : "unknown";
}

/**
 * Return a human-readable health label.
 *
 * @param {unknown} status
 * @returns {string}
 */
export function healthStatusLabel(status) {
    const labels = {
        healthy: "Sain",
        suspended: "Suspendu",
        degraded: "Dégradé",
        unhealthy: "Indisponible",
        unknown: "Inconnu",
    };

    const normalized =
        normalizeHealthStatus(status);

    return labels[normalized] ?? labels.unknown;
}

/**
 * Build the CSS class for a status badge.
 *
 * @param {unknown} status
 * @returns {string}
 */
export function statusClass(status) {
    return (
        "status-badge "
        + `status-badge--${normalizeHealthStatus(status)}`
    );
}

/**
 * Build the HTML representation of a status badge.
 *
 * @param {unknown} status
 * @returns {string}
 */
export function statusBadge(status) {
    const normalized =
        normalizeHealthStatus(status);

    return `
        <span class="${statusClass(normalized)}">
            ${escapeHtml(normalized)}
        </span>
    `;
}

/**
 * Return the unique non-empty values from an iterable.
 *
 * @param {Iterable<unknown>} values
 * @returns {Set<unknown>}
 */
export function uniqueValues(values) {
    return new Set(
        Array.from(values).filter((value) => {
            return (
                value !== null
                && value !== undefined
                && value !== ""
            );
        }),
    );
}

/**
 * Show an error message.
 *
 * @param {HTMLElement | null} element
 * @param {unknown} message
 */
export function showError(element, message) {
    if (!element) {
        return;
    }

    element.textContent = String(message);
    element.classList.remove("hidden");
}

/**
 * Hide an error message.
 *
 * @param {HTMLElement | null} element
 */
export function hideError(element) {
    if (!element) {
        return;
    }

    element.textContent = "";
    element.classList.add("hidden");
}
