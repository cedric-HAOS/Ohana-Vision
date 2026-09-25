"use strict";

export const DHCP_CATEGORY_LABELS = Object.freeze({
    infrastructure: "Infrastructure",
    servers: "Serveurs",
    network: "Réseau",
    home_automation: "Domotique",
    critical: "Critique",
});

export const ARCHITECTURE_MINIMUM_COLUMNS = 15;
export const ARCHITECTURE_MINIMUM_ROWS = 10;
export const DNS_NAME_PATTERN =
    /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]+(?:\.(?!-)[A-Za-z0-9-]+)*$/;
export const BACKUP_WEEKDAYS = Object.freeze([
    ["0", "Lundi"],
    ["1", "Mardi"],
    ["2", "Mercredi"],
    ["3", "Jeudi"],
    ["4", "Vendredi"],
    ["5", "Samedi"],
    ["6", "Dimanche"],
]);
export const BACKUP_MONTH_DAYS = Object.freeze(
    Array.from(
        {length: 31},
        (_, index) => String(index + 1),
    ),
);

export function formatTlsFingerprint(value) {
    const normalized = String(value ?? "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalized)) {
        return "Empreinte indisponible";
    }
    return normalized.match(/.{2}/g).join(":").toUpperCase();
}

export function agentSupportsDistributedJobs(value) {
    const parts = String(value ?? "").split(".").map(Number);
    return parts.length >= 2
        && Number.isInteger(parts[0])
        && Number.isInteger(parts[1])
        && (parts[0] > 1 || (parts[0] === 1 && parts[1] >= 16));
}


export const SERVICE_PORT_POLICIES = Object.freeze({
    dhcp: { mode: "hidden", defaultPort: null },
    dns: { mode: "hidden", defaultPort: null },
    mqtt: { mode: "optional", defaultPort: 1883 },
    ntp: { mode: "optional", defaultPort: 123 },
    home_assistant: { mode: "hidden", defaultPort: 8123 },
    home_assistant_telemetry: { mode: "hidden", defaultPort: null },
    shelly_telemetry: { mode: "hidden", defaultPort: null },
    teleinformation: { mode: "hidden", defaultPort: null },
    zwave: { mode: "optional", defaultPort: 3000 },
    wireguard: { mode: "optional", defaultPort: null },
    http: { mode: "optional", defaultPort: 80 },
    https: { mode: "optional", defaultPort: 443 },
    other: { mode: "optional", defaultPort: null },
});

export function isIpv4Address(value) {
    const parts = value.split(".");
    return parts.length === 4
        && parts.every((part) => {
            if (!/^\d{1,3}$/.test(part)) {
                return false;
            }
            const number = Number(part);
            return number >= 0 && number <= 255;
        });
}

export function isDnsHostname(value) {
    const normalized = value.trim().replace(/\.$/, "");
    return DNS_NAME_PATTERN.test(normalized)
        && normalized.split(".").every((label) => label.length <= 63);
}

export function endpointTypeForAddress(value) {
    return isIpv4Address(value.trim()) ? "ip" : "hostname";
}

export function servicePortPolicy(type) {
    return SERVICE_PORT_POLICIES[type]
        ?? SERVICE_PORT_POLICIES.other;
}

export function isHomeAssistantTelemetryPlugin(plugin) {
    return [
        "home_assistant_telemetry",
        "shelly_telemetry",
    ].includes(plugin?.id);
}

export function normalizePluginPresentation(plugin) {
    if (plugin?.id !== "shelly_telemetry") {
        return plugin;
    }

    return {
        ...plugin,
        name: "Télémétrie Home Assistant",
    };
}

export const PLUGIN_STATUS_LABELS = Object.freeze({
    active: "Actif",
    idle: "En attente",
    disabled: "Désactivé",
    degraded: "Dégradé",
    error: "En erreur",
});

export const PLUGIN_ICONS = Object.freeze({
    backup: "/ui/assets/icons/administration/archive.svg",
    dhcp: "/ui/assets/icons/network/router.svg",
    dns: "/ui/assets/icons/network/globe-2.svg",
    ntp: "/ui/assets/icons/network/clock-3.svg",
    mqtt: "/ui/assets/icons/services/radio.svg",
    network: "/ui/assets/icons/infrastructure/network.svg",
    zwave: "/ui/assets/icons/protocols/zwave.svg",
    wireguard: "/ui/assets/icons/network/shield-check.svg",
    home_assistant_telemetry: "/ui/assets/icons/observability/activity.svg",
    shelly_telemetry: "/ui/assets/icons/observability/activity.svg",
    teleinformation: "/ui/assets/icons/observability/gauge.svg",
});
