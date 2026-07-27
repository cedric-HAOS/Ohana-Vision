"use strict";

export const API = Object.freeze({
    runtime: "/api/runtime",
    observations: "/api/observations",
    timeline: "/api/timeline",
    topology: "/api/topology",
    administrationCapabilities:
        "/api/administration/capabilities",
    administrationDHCP:
        "/api/administration/dhcp",
    administrationInfrastructure:
        "/api/administration/infrastructure",
    administrationPlugins:
        "/api/administration/plugins",
    administrationPlugin(identifier) {
        return `/api/administration/plugins/${encodeURIComponent(identifier)}`;
    },
    administrationPluginTest(identifier) {
        return `${this.administrationPlugin(identifier)}/test`;
    },
});

/**
 * Fetch a JSON document from the Ohana-Vision backend.
 *
 * @param {string} url
 * @returns {Promise<unknown>}
 */
export async function fetchJson(url) {
    return requestJson(
        url,
        {
            method: "GET",
        },
    );
}

/**
 * Send and receive a JSON document.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<unknown>}
 */
export async function requestJson(
    url,
    options = {},
) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: "application/json",
            ...(
                options.body
                    ? {
                        "Content-Type":
                            "application/json",
                    }
                    : {}
            ),
            ...(options.headers ?? {}),
        },
    });

    if (!response.ok) {
        let detail =
            `${response.status} ${response.statusText}`;

        try {
            const payload = await response.json();

            if (
                payload
                && typeof payload === "object"
                && "detail" in payload
                && payload.detail
            ) {
                detail = String(payload.detail);
            }
        } catch {
            // Keep the generic HTTP error message.
        }

        throw new Error(detail);
    }

    return response.json();
}
