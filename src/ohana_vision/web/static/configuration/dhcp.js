"use strict";

import {
    API,
    requestJson,
} from "../api.js";

import {
    escapeHtml,
    hideError,
    showError,
} from "../utils.js";

import {
    DHCP_CATEGORY_LABELS,
    DNS_NAME_PATTERN,
} from "./shared.js";

/**
 * ConfigurationController methods: DHCP settings, reservations and leases.
 */
export const DhcpMethods = {
    renderDHCP() {
        if (!this.dhcp) {
            return;
        }

        this.setDHCPControlsEnabled(true);

        const settings = this.dhcp.settings;
        const reservations =
            this.dhcp.reservations ?? [];
        const leases = this.dhcp.leases ?? [];

        this.elements.dhcpServer.textContent =
            this.dhcp.server_node_id;
        this.elements.dhcpRangeSummary.textContent =
            `${settings.range_start} – `
            + settings.range_end;
        this.elements.dhcpLeaseDurationSummary
            .textContent =
                `Bail ${settings.lease_duration}`;
        this.elements.dhcpActiveLeasesCount
            .textContent = String(leases.length);
        this.elements.dhcpReservationsCount
            .textContent =
                `${reservations.length} `
                + (
                    reservations.length > 1
                        ? "réservations"
                        : "réservation"
                );

        this.setValue(
            "dhcp-interface",
            settings.interface,
        );
        this.setValue(
            "dhcp-lease-duration",
            settings.lease_duration,
        );
        this.setValue(
            "dhcp-range-start",
            settings.range_start,
        );
        this.setValue(
            "dhcp-range-end",
            settings.range_end,
        );
        this.setValue(
            "dhcp-subnet-mask",
            settings.subnet_mask,
        );
        this.setValue(
            "dhcp-gateway",
            settings.gateway,
        );
        this.setValue(
            "dhcp-dns-servers",
            settings.dns_servers.join(", "),
        );
        this.setValue(
            "dhcp-ntp-servers",
            settings.ntp_servers.join(", "),
        );
        this.setValue(
            "dhcp-domain",
            settings.domain,
        );

        this.renderDHCPTable(
            reservations,
            leases,
        );
    },

    renderDHCPUnavailable(message) {
        this.setDHCPControlsEnabled(false);

        if (this.elements.dhcpServer) {
            this.elements.dhcpServer.textContent = "Indisponible";
        }
        if (this.elements.dhcpRangeSummary) {
            this.elements.dhcpRangeSummary.textContent = "—";
        }
        if (this.elements.dhcpLeaseDurationSummary) {
            this.elements.dhcpLeaseDurationSummary.textContent =
                "Administration non chargée";
        }
        if (this.elements.dhcpActiveLeasesCount) {
            this.elements.dhcpActiveLeasesCount.textContent = "—";
        }
        if (this.elements.dhcpReservationsCount) {
            this.elements.dhcpReservationsCount.textContent =
                "Réessayez avec Actualiser";
        }
        if (this.elements.dhcpTable) {
            this.elements.dhcpTable.innerHTML = `
                <tr>
                    <td colspan="6">
                        ${escapeHtml(message)}
                    </td>
                </tr>
            `;
        }
    },

    setDHCPControlsEnabled(enabled) {
        this.elements.dhcpSettingsForm
            ?.querySelectorAll(
                "input, select, button",
            )
            .forEach((control) => {
                control.disabled = !enabled;
            });

        if (this.elements.dhcpAddReservation) {
            this.elements.dhcpAddReservation.disabled =
                !enabled;
        }
    },

    renderDHCPTable(
        reservations,
        leases,
    ) {
        if (!this.elements.dhcpTable) {
            return;
        }

        const activeByMac = new Map(
            leases.map((lease) => [
                lease.mac_address.toUpperCase(),
                lease,
            ]),
        );
        const reservedMacs = new Set(
            reservations.map((reservation) =>
                reservation.mac_address.toUpperCase(),
            ),
        );
        const rows = reservations.map(
            (reservation) => {
                const active = activeByMac.has(
                    reservation.mac_address
                        .toUpperCase(),
                );

                return {
                    address: reservation.address,
                    markup: this.reservationRow(
                        reservation,
                        active,
                    ),
                };
            },
        );

        leases
            .filter(
                (lease) => !reservedMacs.has(
                    lease.mac_address.toUpperCase(),
                ),
            )
            .forEach((lease) => {
                rows.push({
                    address: lease.address,
                    markup:
                        this.dynamicLeaseRow(lease),
                });
            });

        rows.sort((first, second) => {
            return this.compareIPAddresses(
                first.address,
                second.address,
            );
        });

        this.elements.dhcpTable.innerHTML =
            rows.length
                ? rows.map(
                    (row) => row.markup,
                ).join("")
                : (
                    "<tr><td colspan=\"6\">"
                    + "Aucun bail DHCP."
                    + "</td></tr>"
                );
    },

    reservationRow(reservation, active) {
        const mac = escapeHtml(
            reservation.mac_address,
        );
        const validHostname =
            this.isValidDNSName(
                reservation.hostname,
            );

        return `
            <tr>
                <td>
                    <span class="configuration-table__device">
                        <strong>${escapeHtml(reservation.hostname)}</strong>
                        <small>${escapeHtml(DHCP_CATEGORY_LABELS[reservation.category] ?? reservation.category)}${validHostname ? "" : " · Nom DNS invalide"}</small>
                    </span>
                </td>
                <td>${escapeHtml(reservation.address)}</td>
                <td><code>${mac}</code></td>
                <td>Réservé</td>
                <td>
                    <span class="status-badge ${validHostname ? (active ? "status-badge--healthy" : "status-badge--unknown") : "status-badge--error"}">
                        ${validHostname ? (active ? "Actif" : "Inactif") : "À corriger"}
                    </span>
                </td>
                <td>
                    <span class="configuration-table__actions">
                        <button class="configuration-icon-button" data-dhcp-edit="${mac}" type="button">Modifier</button>
                        <button class="configuration-icon-button" data-dhcp-delete="${mac}" type="button">Supprimer</button>
                    </span>
                </td>
            </tr>
        `;
    },

    dynamicLeaseRow(lease) {
        const mac = escapeHtml(lease.mac_address);
        const hostname = lease.hostname
            ?? "Client sans nom";

        return `
            <tr>
                <td>
                    <span class="configuration-table__device">
                        <strong>${escapeHtml(hostname)}</strong>
                        <small>Bail dynamique</small>
                    </span>
                </td>
                <td>${escapeHtml(lease.address)}</td>
                <td><code>${mac}</code></td>
                <td>Dynamique</td>
                <td><span class="status-badge status-badge--healthy">Actif</span></td>
                <td>
                    <span class="configuration-table__actions">
                        <button aria-label="Ajouter ${escapeHtml(hostname)} comme réservation" class="configuration-icon-button configuration-icon-button--add" data-dhcp-add="${mac}" title="Ajouter comme réservation" type="button">+</button>
                    </span>
                </td>
            </tr>
        `;
    },

    compareIPAddresses(firstAddress, secondAddress) {
        const firstValue = this.ipv4AddressValue(
            firstAddress,
        );
        const secondValue = this.ipv4AddressValue(
            secondAddress,
        );

        if (firstValue !== secondValue) {
            return firstValue - secondValue;
        }

        return String(firstAddress).localeCompare(
            String(secondAddress),
        );
    },

    ipv4AddressValue(address) {
        const octets = String(address)
            .split(".")
            .map((octet) => Number(octet));

        if (
            octets.length !== 4
            || octets.some(
                (octet) =>
                    !Number.isInteger(octet)
                    || octet < 0
                    || octet > 255,
            )
        ) {
            return Number.MAX_SAFE_INTEGER;
        }

        return octets.reduce(
            (value, octet) => value * 256 + octet,
            0,
        );
    },

    async saveDHCPSettings() {
        if (
            !this.dhcp
            || !this.elements.dhcpSettingsForm
                ?.reportValidity()
        ) {
            return;
        }

        if (
            !window.confirm(
                "Appliquer cette configuration DHCP ? "
                + "Agent validera dnsmasq avant son "
                + "rechargement.",
            )
        ) {
            return;
        }

        const previousDHCP =
            structuredClone(this.dhcp);
        this.dhcp.settings = {
            interface:
                this.value("dhcp-interface"),
            lease_duration:
                this.value(
                    "dhcp-lease-duration",
                ),
            range_start:
                this.value("dhcp-range-start"),
            range_end:
                this.value("dhcp-range-end"),
            subnet_mask:
                this.value("dhcp-subnet-mask"),
            gateway:
                this.value("dhcp-gateway"),
            dns_servers:
                this.listValue(
                    "dhcp-dns-servers",
                ),
            ntp_servers:
                this.listValue(
                    "dhcp-ntp-servers",
                ),
            domain:
                this.value("dhcp-domain"),
        };

        await this.applyDHCP(
            "Configuration DHCP appliquée.",
            previousDHCP,
        );
    },

    openReservation(reservation = null, options = {}) {
        const dialog =
            this.elements.dhcpReservationDialog;

        if (!dialog) {
            return;
        }

        const editing = Boolean(
            reservation && !options.isNew,
        );

        this.elements
            .dhcpReservationDialogTitle
            .textContent = editing
                ? "Modifier la réservation"
                : "Ajouter une réservation";

        this.setValue(
            "dhcp-reservation-original-mac",
            editing
                ? reservation.mac_address
                : "",
        );
        this.setValue(
            "dhcp-reservation-hostname",
            reservation?.hostname ?? "",
        );
        this.setValue(
            "dhcp-reservation-address",
            reservation?.address ?? "",
        );
        this.setValue(
            "dhcp-reservation-mac",
            reservation?.mac_address ?? "",
        );
        this.setValue(
            "dhcp-reservation-category",
            reservation?.category
                ?? "infrastructure",
        );
        this.validateReservationHostname();

        dialog.showModal();
    },

    closeReservation() {
        this.elements.dhcpReservationDialog
            ?.close();
    },

    async saveReservation() {
        this.validateReservationHostname();

        if (
            !this.dhcp
            || !this.elements
                .dhcpReservationForm
                ?.reportValidity()
        ) {
            return;
        }

        const originalMac = this.value(
            "dhcp-reservation-original-mac",
        ).toUpperCase();
        const reservation = {
            hostname: this.value(
                "dhcp-reservation-hostname",
            ).toLowerCase(),
            address: this.value(
                "dhcp-reservation-address",
            ),
            mac_address: this.value(
                "dhcp-reservation-mac",
            ).toUpperCase(),
            category: this.value(
                "dhcp-reservation-category",
            ),
            description: "",
        };

        if (
            !window.confirm(
                `Enregistrer la réservation DHCP de ${reservation.hostname} ?`,
            )
        ) {
            return;
        }

        const previousDHCP =
            structuredClone(this.dhcp);
        const reservations = [
            ...(this.dhcp.reservations ?? []),
        ];
        const existingIndex =
            reservations.findIndex(
                (item) =>
                    item.mac_address.toUpperCase()
                    === originalMac,
            );

        if (existingIndex >= 0) {
            reservations[existingIndex] =
                reservation;
        } else {
            reservations.push(reservation);
        }

        this.dhcp.reservations = reservations;
        this.closeReservation();
        await this.applyDHCP(
            "Réservation DHCP enregistrée.",
            previousDHCP,
        );
    },

    validateReservationHostname() {
        const field =
            this.elements.dhcpReservationHostname;

        if (!field) {
            return true;
        }

        const hostname = field.value.trim();
        const valid = this.isValidDNSName(hostname);

        field.setCustomValidity(
            !hostname || valid
                ? ""
                : this.dnsNameValidationMessage(
                    hostname,
                ),
        );
        field.setAttribute(
            "aria-invalid",
            valid ? "false" : "true",
        );

        return valid;
    },

    isValidDNSName(value) {
        return DNS_NAME_PATTERN.test(
            String(value).trim(),
        );
    },

    dnsNameValidationMessage(value) {
        const hostname = String(value).trim();
        const suggestion = hostname
            .toLowerCase()
            .replace(/[\s_]+/g, "-");
        const example = suggestion
            && suggestion !== hostname
            && this.isValidDNSName(suggestion)
                ? ` Essayez « ${suggestion} ».`
                : "";

        return (
            "Utilisez uniquement des lettres, des chiffres, "
            + "des tirets et des points. Un nom DNS ne peut "
            + "pas commencer par un tiret."
            + example
        );
    },

    invalidDHCPReservations() {
        return (this.dhcp?.reservations ?? [])
            .filter(
                (reservation) =>
                    !this.isValidDNSName(
                        reservation.hostname,
                    ),
            );
    },

    handleDHCPTableClick(event) {
        const button = event.target.closest(
            "[data-dhcp-edit], [data-dhcp-delete], "
            + "[data-dhcp-add]",
        );

        if (!button || !this.dhcp) {
            return;
        }

        const editMac =
            button.dataset.dhcpEdit;
        const deleteMac =
            button.dataset.dhcpDelete;
        const addMac =
            button.dataset.dhcpAdd;

        if (addMac) {
            const lease = (this.dhcp.leases ?? [])
                .find((item) =>
                    item.mac_address.toUpperCase()
                    === addMac.toUpperCase(),
                );

            if (lease) {
                this.openReservation({
                    hostname: lease.hostname ?? "",
                    address: lease.address,
                    mac_address: lease.mac_address,
                    category: "infrastructure",
                }, {isNew: true});
            }
            return;
        }

        const mac = editMac ?? deleteMac;
        const reservation =
            this.dhcp.reservations.find(
                (item) =>
                    item.mac_address.toUpperCase()
                    === mac.toUpperCase(),
            );

        if (!reservation) {
            return;
        }

        if (editMac) {
            this.openReservation(reservation);
            return;
        }

        if (
            window.confirm(
                `Supprimer la réservation de ${reservation.hostname} ?`,
            )
        ) {
            const previousDHCP =
                structuredClone(this.dhcp);
            this.dhcp.reservations =
                this.dhcp.reservations.filter(
                    (item) => item !== reservation,
                );
            void this.applyDHCP(
                "Réservation DHCP supprimée.",
                previousDHCP,
            );
        }
    },

    async applyDHCP(
        message,
        previousDHCP = null,
    ) {
        hideError(this.elements.error);

        const invalidReservations =
            this.invalidDHCPReservations();

        if (invalidReservations.length) {
            if (previousDHCP) {
                this.dhcp = previousDHCP;
                this.renderDHCP();
            }

            const invalidNames =
                invalidReservations
                    .map((reservation) =>
                        `« ${reservation.hostname} »`,
                    )
                    .join(", ");

            showError(
                this.elements.error,
                "Modification DHCP refusée : "
                + "nom DNS invalide pour "
                + `${invalidNames}. Utilisez des tirets `
                + "à la place des espaces ou underscores.",
            );
            return;
        }

        try {
            this.dhcp = await requestJson(
                API.administrationDHCP,
                {
                    method: "PUT",
                    body: JSON.stringify(
                        this.dhcpPayload(),
                    ),
                },
            );
            this.renderDHCP();
            this.showNotice(message);
        } catch (error) {
            if (previousDHCP) {
                this.dhcp = previousDHCP;
                this.renderDHCP();
            }

            showError(
                this.elements.error,
                "Modification DHCP refusée : "
                + this.errorMessage(error),
            );
        }
    },

    dhcpPayload() {
        return {
            schema_version: 1,
            implementation: "dnsmasq",
            server_node_id:
                this.dhcp.server_node_id,
            settings: this.dhcp.settings,
            reservations:
                this.dhcp.reservations,
        };
    },
};
