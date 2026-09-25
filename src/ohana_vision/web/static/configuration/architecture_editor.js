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
    ARCHITECTURE_MINIMUM_COLUMNS,
    endpointTypeForAddress,
    isDnsHostname,
    isIpv4Address,
    servicePortPolicy,
} from "./shared.js";

/**
 * ConfigurationController methods: Device, service and link editors of the architecture.
 */
export const ArchitectureEditorMethods = {
    editDevice(deviceId) {
        const device =
            this.infrastructure.topology.devices
                .find((item) => item.id === deviceId);

        if (!device) {
            return;
        }

        const node =
            this.infrastructure.nodes.find(
                (item) => item.id === device.node,
            );
        this.selectArchitectureEditor(
            "device",
            device.id,
            "Équipement",
            device.label,
        );
        this.setValue(
            "architecture-device-name",
            device.label,
        );
        this.setValue(
            "architecture-device-kind",
            device.kind,
        );
        this.setValue(
            "architecture-device-role",
            device.metadata?.role ?? "",
        );
        this.setValue(
            "architecture-device-address",
            node?.endpoint?.address
                ?? device.address
                ?? "",
        );
        this.setChecked(
            "architecture-device-network-presence",
            device.metadata
                ?.network_presence_enabled !== false,
        );
        const monitoringSchedule = device.metadata?.monitoring_schedule;
        const monitoringPeriod = monitoringSchedule?.periods?.[0] ?? {};
        this.setChecked(
            "architecture-device-monitoring-schedule-enabled",
            Boolean(monitoringSchedule?.enabled !== false && monitoringSchedule?.periods?.length),
        );
        this.setValue(
            "architecture-device-monitoring-start",
            monitoringPeriod.start ?? "07:00",
        );
        this.setValue(
            "architecture-device-monitoring-end",
            monitoringPeriod.end ?? "22:00",
        );
        this.setValue(
            "architecture-device-monitoring-timezone",
            monitoringSchedule?.timezone ?? "Europe/Paris",
        );
        this.setValue(
            "architecture-device-monitoring-grace",
            monitoringSchedule?.startup_grace_seconds ?? 300,
        );
        this.setMonitoringScheduleDays(
            monitoringPeriod.days ?? [
                "monday", "tuesday", "wednesday", "thursday",
                "friday", "saturday", "sunday",
            ],
        );
        this.updateNetworkPresenceControl();
        this.updateMonitoringScheduleFields();
        this.renderAssociatedServices(device);
    },

    editNewDevice() {
        this.selectArchitectureEditor(
            "device",
            "",
            "Nouvel équipement",
            "Ajouter un équipement",
        );
        this.setValue(
            "architecture-device-name",
            "",
        );
        this.setValue(
            "architecture-device-kind",
            "server",
        );
        this.setValue(
            "architecture-device-role",
            "",
        );
        this.setValue(
            "architecture-device-address",
            "",
        );
        this.setChecked(
            "architecture-device-network-presence",
            true,
        );
        this.setChecked(
            "architecture-device-monitoring-schedule-enabled",
            false,
        );
        this.setValue("architecture-device-monitoring-start", "07:00");
        this.setValue("architecture-device-monitoring-end", "22:00");
        this.setValue("architecture-device-monitoring-timezone", "Europe/Paris");
        this.setValue("architecture-device-monitoring-grace", 300);
        this.setMonitoringScheduleDays([
            "monday", "tuesday", "wednesday", "thursday",
            "friday", "saturday", "sunday",
        ]);
        this.updateNetworkPresenceControl();
        this.updateMonitoringScheduleFields();
        this.renderAssociatedServices(null);
    },

    updateNetworkPresenceControl() {
        const control = document.getElementById(
            "architecture-device-network-presence",
        );

        if (!control) {
            return;
        }

        control.disabled = !this.value(
            "architecture-device-address",
        );
    },

    updateMonitoringScheduleFields() {
        const enabled = this.checked(
            "architecture-device-monitoring-schedule-enabled",
        );
        const fields = document.getElementById(
            "architecture-device-monitoring-schedule-fields",
        );
        if (fields) {
            fields.hidden = !enabled;
        }

        const requiredControls = [
            "architecture-device-monitoring-start",
            "architecture-device-monitoring-end",
            "architecture-device-monitoring-timezone",
        ];
        const optionalControls = [
            "architecture-device-monitoring-grace",
        ];

        for (const id of requiredControls) {
            const control = document.getElementById(id);
            if (control) {
                control.disabled = !enabled;
                control.required = enabled;
            }
        }
        for (const id of optionalControls) {
            const control = document.getElementById(id);
            if (control) {
                control.disabled = !enabled;
            }
        }
        for (const control of document.querySelectorAll(
            "[data-monitoring-day]",
        )) {
            control.disabled = !enabled;
        }
    },

    monitoringScheduleDays() {
        return Array.from(document.querySelectorAll(
            "[data-monitoring-day]",
        ))
            .filter((control) => control.checked)
            .map((control) => control.dataset.monitoringDay);
    },

    setMonitoringScheduleDays(days) {
        const selected = new Set(days ?? []);
        for (const control of document.querySelectorAll(
            "[data-monitoring-day]",
        )) {
            control.checked = selected.has(control.dataset.monitoringDay);
        }
    },

    updateHomeAssistantTelemetryServiceFields() {
        const isHomeAssistantTelemetry = this.value(
            "architecture-service-type",
        ) === "home_assistant_telemetry";
        const fields = document.getElementById(
            "architecture-service-home-assistant-telemetry-fields",
        );
        const powerEntity = document.getElementById(
            "architecture-service-home-assistant-primary-entity",
        );

        if (fields) {
            fields.hidden = !isHomeAssistantTelemetry;
        }

        if (powerEntity) {
            powerEntity.required = isHomeAssistantTelemetry;
        }
    },

    updateTeleinformationServiceFields() {
        const isTeleinformation = this.value(
            "architecture-service-type",
        ) === "teleinformation";
        const fields = document.getElementById(
            "architecture-service-teleinformation-fields",
        );
        const requiredEntityIds = [
            "architecture-service-teleinformation-meter-id",
        ];

        if (fields) {
            fields.hidden = !isTeleinformation;
        }

        for (const id of requiredEntityIds) {
            const control = document.getElementById(id);

            if (control) {
                control.required = isTeleinformation;
            }
        }
    },

    updateServicePortField() {
        const type = this.value("architecture-service-type");
        const policy = servicePortPolicy(type);
        const field = document.getElementById(
            "architecture-service-port-field",
        );
        const control = document.getElementById(
            "architecture-service-port",
        );
        const help = document.getElementById(
            "architecture-service-port-help",
        );

        if (!field || !control) {
            return;
        }

        field.hidden = policy.mode === "hidden";
        control.required = policy.mode === "required";

        if (policy.mode === "hidden") {
            control.value = policy.defaultPort === null
                ? ""
                : String(policy.defaultPort);
        } else if (!control.value && policy.defaultPort !== null) {
            control.value = String(policy.defaultPort);
        }

        if (help) {
            help.textContent = policy.defaultPort === null
                ? "Facultatif : laissez vide pour utiliser la configuration du plugin."
                : `Facultatif : ${policy.defaultPort} est utilisé par défaut.`;
        }
    },

    updateServiceSpecificFields() {
        this.updateHomeAssistantTelemetryServiceFields();
        this.updateTeleinformationServiceFields();
        this.updateServicePortField();
        if (
            this.value("architecture-service-type") === "dns"
            && !this.value("architecture-service-availability-group")
        ) {
            this.setValue("architecture-service-availability-group", "dns");
        }
    },

    editService(serviceId) {
        const service =
            this.infrastructure.services.find(
                (item) => item.id === serviceId,
            );

        if (!service) {
            return;
        }

        this.selectArchitectureEditor(
            "service",
            service.id,
            "Service",
            service.name,
        );
        this.setValue(
            "architecture-service-name",
            service.name,
        );
        this.setValue(
            "architecture-service-type",
            service.type === "shelly_telemetry"
                ? "home_assistant_telemetry"
                : service.type,
        );
        this.setValue(
            "architecture-service-port",
            service.port ?? "",
        );
        this.setValue(
            "architecture-service-node",
            service.node,
        );
        this.setValue(
            "architecture-service-implementation",
            service.implementation ?? "",
        );
        this.setValue(
            "architecture-service-availability-group",
            service.metadata?.availability_group
                ?? (service.type === "dns" ? "dns" : ""),
        );
        this.setChecked(
            "architecture-service-enabled",
            service.enabled ?? true,
        );
        this.setChecked(
            "architecture-service-critical",
            service.critical ?? false,
        );
        this.setValue(
            "architecture-service-home-assistant-primary-entity",
            service.metadata?.primary_entity_id
                ?? service.metadata?.power_entity_id
                ?? "",
        );
        this.setValue(
            "architecture-service-home-assistant-secondary-entity",
            service.metadata?.secondary_entity_id
                ?? service.metadata?.energy_entity_id
                ?? "",
        );
        this.setValue(
            "architecture-service-home-assistant-maximum-age",
            service.metadata?.maximum_age_seconds ?? 900,
        );
        this.setValue(
            "architecture-service-teleinformation-meter-id",
            service.metadata?.meter_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-source-id",
            service.metadata?.source_id ?? "rpi-linky",
        );
        this.setValue(
            "architecture-service-teleinformation-power-entity",
            service.metadata?.apparent_power_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-tariff-entity",
            service.metadata?.tariff_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-blue-off-peak-entity",
            service.metadata?.blue_off_peak_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-blue-peak-entity",
            service.metadata?.blue_peak_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-white-off-peak-entity",
            service.metadata?.white_off_peak_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-white-peak-entity",
            service.metadata?.white_peak_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-red-off-peak-entity",
            service.metadata?.red_off_peak_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-red-peak-entity",
            service.metadata?.red_peak_entity_id ?? "",
        );
        this.setValue(
            "architecture-service-teleinformation-maximum-age",
            service.metadata?.maximum_age_seconds ?? 30,
        );
        this.updateServiceSpecificFields();
    },

    editNewService(nodeId = null) {
        if (!this.infrastructure.nodes.length) {
            showError(
                this.elements.error,
                "Ajoutez d’abord un équipement "
                + "possédant un hôte ou une adresse IP.",
            );
            return;
        }

        this.selectArchitectureEditor(
            "service",
            "",
            "Nouveau service",
            "Ajouter un service",
        );
        this.setValue(
            "architecture-service-name",
            "",
        );
        this.setValue(
            "architecture-service-type",
            "dhcp",
        );
        this.setValue(
            "architecture-service-port",
            "",
        );
        this.setValue(
            "architecture-service-node",
            nodeId ?? this.infrastructure.nodes[0].id,
        );
        this.setValue(
            "architecture-service-implementation",
            "",
        );
        this.setValue(
            "architecture-service-availability-group",
            "",
        );
        this.setChecked(
            "architecture-service-enabled",
            true,
        );
        this.setChecked(
            "architecture-service-critical",
            false,
        );
        this.setValue(
            "architecture-service-home-assistant-primary-entity",
            "",
        );
        this.setValue(
            "architecture-service-home-assistant-secondary-entity",
            "",
        );
        this.setValue(
            "architecture-service-home-assistant-maximum-age",
            900,
        );
        this.setValue(
            "architecture-service-teleinformation-meter-id",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-source-id",
            "rpi-linky",
        );
        this.setValue(
            "architecture-service-teleinformation-power-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-tariff-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-blue-off-peak-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-blue-peak-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-white-off-peak-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-white-peak-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-red-off-peak-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-red-peak-entity",
            "",
        );
        this.setValue(
            "architecture-service-teleinformation-maximum-age",
            30,
        );
        this.updateServiceSpecificFields();
    },

    editNewServiceForSelection() {
        const selectedDeviceId =
            this.selectedArchitectureItem?.mode
                === "device"
                ? this.selectedArchitectureItem.id
                : null;
        const device =
            this.infrastructure.topology.devices
                .find(
                    (item) =>
                        item.id === selectedDeviceId,
                );

        if (!device?.node) {
            showError(
                this.elements.error,
                "Renseignez d’abord l’hôte ou l’adresse IP "
                + "de cet équipement et enregistrez-le.",
            );
            return;
        }

        this.editNewService(device.node);
    },

    renderAssociatedServices(device) {
        const container =
            this.elements.architectureDeviceServices;

        if (!container) {
            return;
        }

        if (!device?.node) {
            container.innerHTML = `
                <p class="empty-state">
                    Renseignez une adresse IP pour
                    pouvoir associer des services.
                </p>
            `;
            return;
        }

        const services =
            this.infrastructure.services.filter(
                (service) =>
                    service.node === device.node,
            );
        container.innerHTML = services.length
            ? services.map(
                (service) =>
                    this.serviceCard(service),
            ).join("")
            : `
                <p class="empty-state">
                    Aucun service associé.
                </p>
            `;
    },

    editLink(linkId) {
        const link =
            this.infrastructure.topology.links
                .find((item) => item.id === linkId);

        if (!link) {
            return;
        }

        this.selectArchitectureEditor(
            "link",
            link.id,
            "Liaison",
            link.label ?? link.id,
        );
        this.setValue(
            "architecture-link-label",
            link.label ?? "",
        );
        this.setValue(
            "architecture-link-source",
            link.source,
        );
        this.setValue(
            "architecture-link-target",
            link.target,
        );
        this.setValue(
            "architecture-link-kind",
            this.linkEditorKind(link),
        );
        this.setValue(
            "architecture-link-direction",
            link.direction,
        );
        this.setValue(
            "architecture-link-bandwidth",
            link.bandwidth_mbps ?? "",
        );
    },

    editNewLink() {
        const devices =
            this.infrastructure.topology.devices;

        if (devices.length < 2) {
            showError(
                this.elements.error,
                "Deux équipements sont nécessaires "
                + "pour créer une liaison.",
            );
            return;
        }

        this.selectArchitectureEditor(
            "link",
            "",
            "Nouvelle liaison",
            "Relier deux équipements",
        );
        this.setValue(
            "architecture-link-label",
            "",
        );
        this.setValue(
            "architecture-link-source",
            devices[0].id,
        );
        this.setValue(
            "architecture-link-target",
            devices[1].id,
        );
        this.setValue(
            "architecture-link-kind",
            "ethernet",
        );
        this.setValue(
            "architecture-link-direction",
            "bidirectional",
        );
        this.setValue(
            "architecture-link-bandwidth",
            "",
        );
    },

    selectArchitectureEditor(
        mode,
        id,
        kind,
        title,
    ) {
        this.selectedArchitectureItem = {
            mode,
            id,
        };
        this.elements.architectureEditorMode
            .value = mode;
        this.elements.architectureEditorId
            .value = id;
        this.elements.architectureEditorKind
            .textContent = kind;
        this.elements.architectureEditorTitle
            .textContent = title;
        this.elements.architectureDeviceFields
            .hidden = mode !== "device";
        this.elements.architectureServiceFields
            .hidden = mode !== "service";
        this.elements.architectureLinkFields
            .hidden = mode !== "link";
        this.elements.architectureEditorActions
            .hidden = false;
        this.elements.architectureDelete
            .hidden = !id;
        this.renderArchitecture();
    },

    saveArchitectureItem() {
        const mode =
            this.elements.architectureEditorMode
                .value;

        if (mode === "device") {
            this.saveDeviceDraft();
        } else if (mode === "service") {
            this.saveServiceDraft();
        } else if (mode === "link") {
            this.saveLinkDraft();
        }
    },

    saveDeviceDraft() {
        const name = this.value(
            "architecture-device-name",
        );
        const address = this.value(
            "architecture-device-address",
        );
        const role = this.value(
            "architecture-device-role",
        );
        const networkPresenceEnabled = this.checked(
            "architecture-device-network-presence",
        );
        const monitoringScheduleEnabled = this.checked(
            "architecture-device-monitoring-schedule-enabled",
        );
        const monitoringDays = this.monitoringScheduleDays();

        if (!name) {
            return;
        }

        const addressControl = document.getElementById(
            "architecture-device-address",
        );
        const validAddress = !address
            || isIpv4Address(address)
            || isDnsHostname(address);

        addressControl?.setCustomValidity(
            validAddress
                ? ""
                : "Saisissez une adresse IPv4 ou un nom DNS valide.",
        );

        if (!validAddress) {
            addressControl?.reportValidity();
            return;
        }

        if (monitoringScheduleEnabled && !monitoringDays.length) {
            showError(
                this.elements.error,
                "Sélectionnez au moins un jour de surveillance.",
            );
            return;
        }

        const currentId =
            this.elements.architectureEditorId
                .value;
        const id = currentId
            || this.uniqueId(
                this.slugify(name),
                this.infrastructure.topology
                    .devices,
            );
        let device =
            this.infrastructure.topology.devices
                .find((item) => item.id === id);

        if (!device) {
            device = {
                id,
                label: name,
                kind: this.value(
                    "architecture-device-kind",
                ),
                node: address ? id : null,
                address: address || null,
                metadata: role
                    ? {
                        role,
                    }
                    : {},
            };
            this.infrastructure.topology.devices
                .push(device);
        } else {
            device.label = name;
            device.kind = this.value(
                "architecture-device-kind",
            );
            device.address = address || null;
        }

        device.metadata ??= {};

        if (role) {
            device.metadata.role = role;
        } else {
            delete device.metadata.role;
        }

        if (address) {
            device.metadata.network_presence_enabled =
                networkPresenceEnabled;
        } else {
            delete device.metadata
                .network_presence_enabled;
        }

        if (monitoringScheduleEnabled) {
            device.metadata.monitoring_schedule = {
                enabled: true,
                timezone: this.value(
                    "architecture-device-monitoring-timezone",
                ) || "Europe/Paris",
                periods: [{
                    days: monitoringDays,
                    start: this.value("architecture-device-monitoring-start"),
                    end: this.value("architecture-device-monitoring-end"),
                }],
                startup_grace_seconds: Number(this.value(
                    "architecture-device-monitoring-grace",
                ) || 0),
            };
        } else {
            delete device.metadata.monitoring_schedule;
        }

        if (address) {
            const nodeId = device.node ?? id;
            let node =
                this.infrastructure.nodes.find(
                    (item) => item.id === nodeId,
                );

            if (!node) {
                node = {
                    id: nodeId,
                    name,
                    description: "",
                    endpoint: {
                        type: endpointTypeForAddress(address),
                        address,
                    },
                };
                this.infrastructure.nodes.push(
                    node,
                );
            } else {
                node.name = name;
                node.endpoint.type = endpointTypeForAddress(address);
                node.endpoint.address = address;
            }

            device.node = nodeId;
        }

        this.selectArchitectureEditor(
            "device",
            id,
            "Équipement",
            name,
        );
        this.renderAssociatedServices(device);
        this.showNotice(
            "Équipement modifié. Appliquez "
            + "l’architecture pour confirmer.",
        );
    },

    saveServiceDraft() {
        const name = this.value(
            "architecture-service-name",
        );

        if (!name) {
            return;
        }

        const currentId =
            this.elements.architectureEditorId
                .value;
        const id = currentId
            || this.uniqueId(
                this.slugify(name),
                this.infrastructure.services,
            );
        let service =
            this.infrastructure.services.find(
                (item) => item.id === id,
            );
        const port = this.value(
            "architecture-service-port",
        );
        const type = this.value(
            "architecture-service-type",
        );
        const metadata = {
            ...(service?.metadata ?? {}),
        };
        const availabilityGroup = this.value(
            "architecture-service-availability-group",
        );

        if (availabilityGroup) {
            metadata.availability_group = availabilityGroup;
        } else {
            delete metadata.availability_group;
        }

        const teleinformationEntityFields = {
            apparent_power_entity_id:
                "architecture-service-teleinformation-power-entity",
            tariff_entity_id:
                "architecture-service-teleinformation-tariff-entity",
            blue_off_peak_entity_id:
                "architecture-service-teleinformation-blue-off-peak-entity",
            blue_peak_entity_id:
                "architecture-service-teleinformation-blue-peak-entity",
            white_off_peak_entity_id:
                "architecture-service-teleinformation-white-off-peak-entity",
            white_peak_entity_id:
                "architecture-service-teleinformation-white-peak-entity",
            red_off_peak_entity_id:
                "architecture-service-teleinformation-red-off-peak-entity",
            red_peak_entity_id:
                "architecture-service-teleinformation-red-peak-entity",
        };

        if (type === "home_assistant_telemetry") {
            metadata.primary_entity_id = this.value(
                "architecture-service-home-assistant-primary-entity",
            );
            const secondaryEntityId = this.value(
                "architecture-service-home-assistant-secondary-entity",
            );
            const maximumAge = Number(this.value(
                "architecture-service-home-assistant-maximum-age",
            ) || 900);

            if (secondaryEntityId) {
                metadata.secondary_entity_id = secondaryEntityId;
            } else {
                delete metadata.secondary_entity_id;
            }

            metadata.maximum_age_seconds = maximumAge;
            delete metadata.power_entity_id;
            delete metadata.energy_entity_id;
            for (const field of Object.keys(teleinformationEntityFields)) {
                delete metadata[field];
            }
        } else if (type === "teleinformation") {
            metadata.meter_id = this.value(
                "architecture-service-teleinformation-meter-id",
            );
            metadata.source_id = this.value(
                "architecture-service-teleinformation-source-id",
            ) || "rpi-linky";
            for (const [field, controlId] of Object.entries(
                teleinformationEntityFields,
            )) {
                const entityId = this.value(controlId);

                if (entityId) {
                    metadata[field] = entityId;
                } else {
                    delete metadata[field];
                }
            }

            metadata.maximum_age_seconds = Number(this.value(
                "architecture-service-teleinformation-maximum-age",
            ) || 30);
            delete metadata.primary_entity_id;
            delete metadata.secondary_entity_id;
            delete metadata.power_entity_id;
            delete metadata.energy_entity_id;
        } else {
            delete metadata.primary_entity_id;
            delete metadata.secondary_entity_id;
            delete metadata.power_entity_id;
            delete metadata.energy_entity_id;
            delete metadata.maximum_age_seconds;
            delete metadata.meter_id;
            delete metadata.source_id;
            for (const field of Object.keys(teleinformationEntityFields)) {
                delete metadata[field];
            }
        }

        const portPolicy = servicePortPolicy(type);
        const resolvedPort = portPolicy.mode === "hidden"
            ? portPolicy.defaultPort
            : (port ? Number(port) : null);

        const values = {
            id,
            name,
            type,
            node: this.value(
                "architecture-service-node",
            ),
            port: resolvedPort,
            implementation: this.value(
                "architecture-service-implementation",
            ) || null,
            enabled: this.checked(
                "architecture-service-enabled",
            ),
            critical: this.checked(
                "architecture-service-critical",
            ),
            metadata,
        };

        if (service) {
            Object.assign(service, values);
        } else {
            service = values;
            this.infrastructure.services.push(
                service,
            );
        }

        this.selectArchitectureEditor(
            "service",
            id,
            "Service",
            name,
        );
        this.showNotice(
            "Service modifié. Appliquez "
            + "l’architecture pour confirmer.",
        );
    },

    saveLinkDraft() {
        const source = this.value(
            "architecture-link-source",
        );
        const target = this.value(
            "architecture-link-target",
        );

        if (!source || !target || source === target) {
            showError(
                this.elements.error,
                "Une liaison doit relier deux "
                + "équipements différents.",
            );
            return;
        }

        const currentId =
            this.elements.architectureEditorId
                .value;
        const baseId = `${source}-${target}`;
        const id = currentId
            || this.uniqueId(
                baseId,
                this.infrastructure.topology.links,
            );
        let link =
            this.infrastructure.topology.links
                .find((item) => item.id === id);
        const bandwidth = this.value(
            "architecture-link-bandwidth",
        );
        const editorKind = this.value(
            "architecture-link-kind",
        );
        const metadata = {
            ...(link?.metadata ?? {}),
        };

        if (editorKind === "fiber") {
            metadata.medium = "fiber";
        } else if (metadata.medium === "fiber") {
            delete metadata.medium;
        }

        const values = {
            id,
            source,
            target,
            kind: editorKind === "fiber"
                ? "ethernet"
                : editorKind,
            direction: this.value(
                "architecture-link-direction",
            ),
            label: this.value(
                "architecture-link-label",
            ) || null,
            bandwidth_mbps: bandwidth
                ? Number(bandwidth)
                : null,
            metadata,
        };

        if (link) {
            Object.assign(link, values);
        } else {
            link = values;
            this.infrastructure.topology.links
                .push(link);
        }

        this.selectArchitectureEditor(
            "link",
            id,
            "Liaison",
            values.label ?? id,
        );
        this.showNotice(
            "Liaison modifiée. Appliquez "
            + "l’architecture pour confirmer.",
        );
    },

    deleteArchitectureItem() {
        const selection =
            this.selectedArchitectureItem;

        if (
            !selection?.id
            || !window.confirm(
                "Supprimer cet élément de "
                + "l’architecture ?",
            )
        ) {
            return;
        }

        if (selection.mode === "service") {
            this.infrastructure.services =
                this.infrastructure.services
                    .filter(
                        (item) =>
                            item.id !== selection.id,
                    );
        } else if (selection.mode === "link") {
            this.infrastructure.topology.links =
                this.infrastructure.topology.links
                    .filter(
                        (item) =>
                            item.id !== selection.id,
                    );
        } else {
            const device =
                this.infrastructure.topology.devices
                    .find(
                        (item) =>
                            item.id === selection.id,
                    );
            const nodeId = device?.node;
            this.infrastructure.topology.devices =
                this.infrastructure.topology.devices
                    .filter(
                        (item) =>
                            item.id !== selection.id,
                    );
            this.infrastructure.topology.links =
                this.infrastructure.topology.links
                    .filter(
                        (item) =>
                            item.source
                                !== selection.id
                            && item.target
                                !== selection.id,
                    );

            if (nodeId) {
                const nodeStillUsed =
                    this.infrastructure.topology
                        .devices.some(
                            (item) =>
                                item.node === nodeId,
                        );

                if (!nodeStillUsed) {
                    this.infrastructure.services =
                        this.infrastructure.services
                            .filter(
                                (item) =>
                                    item.node !== nodeId,
                            );
                    this.infrastructure.nodes =
                        this.infrastructure.nodes
                            .filter(
                                (item) =>
                                    item.id !== nodeId,
                            );
                }
            }

            this.infrastructure.topology.layouts
                .forEach((layout) => {
                    delete layout.positions[
                        selection.id
                    ];
                });
        }

        this.clearArchitectureEditor();
        this.renderArchitecture();
        this.showNotice(
            "Suppression préparée. Appliquez "
            + "l’architecture pour confirmer.",
        );
    },

    linkEditorKind(link) {
        if (link.metadata?.medium === "fiber") {
            return "fiber";
        }

        return link.kind;
    },

    architectureLinkVisualKind(link) {
        if (
            link.metadata?.medium === "fiber"
            || link.metadata?.role === "internet_uplink"
        ) {
            return "fiber";
        }

        if (link.kind !== "ethernet") {
            return link.kind;
        }

        const bandwidth = Number(
            link.bandwidth_mbps ?? 0,
        );

        if (bandwidth >= 10000) {
            return "ethernet-10g";
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

        return "ethernet";
    },

    async applyArchitecture() {
        if (
            !this.infrastructure
            || !window.confirm(
                "Appliquer cette architecture ? "
                + "Agent vérifiera les équipements, "
                + "services et liaisons.",
            )
        ) {
            return;
        }

        hideError(this.elements.error);

        try {
            this.infrastructure =
                await requestJson(
                    API
                        .administrationInfrastructure,
                    {
                        method: "PUT",
                        body: JSON.stringify(
                            this.infrastructure,
                        ),
                    },
                );
            this.renderArchitecture();

            if (
                this.pluginsAvailable
                && !await this.refreshPlugins()
            ) {
                this.showNotice(
                    "Architecture appliquée et plugins "
                    + "replanifiés. Le compteur des tâches "
                    + "sera actualisé à la prochaine ouverture "
                    + "de la page Plugins.",
                );
                return;
            }

            this.showNotice(
                "Architecture validée, appliquée "
                + "et plugins replanifiés par Agent.",
            );
        } catch (error) {
            showError(
                this.elements.error,
                "Architecture refusée : "
                + this.errorMessage(error),
            );
        }
    },

    populateNodeOptions() {
        const select = document.getElementById(
            "architecture-service-node",
        );

        if (!select || !this.infrastructure) {
            return;
        }

        const currentValue = select.value;
        select.innerHTML =
            this.infrastructure.nodes.map(
                (node) => `
                    <option value="${escapeHtml(node.id)}">
                        ${escapeHtml(node.name)} · ${escapeHtml(node.endpoint.address)}
                    </option>
                `,
            ).join("");

        if (
            this.infrastructure.nodes.some(
                (node) =>
                    node.id === currentValue,
            )
        ) {
            select.value = currentValue;
        }
    },

    populateDeviceOptions() {
        const options =
            this.infrastructure.topology.devices
                .map((device) => `
                    <option value="${escapeHtml(device.id)}">
                        ${escapeHtml(device.label)}
                    </option>
                `)
                .join("");

        [
            "architecture-link-source",
            "architecture-link-target",
        ].forEach((id) => {
            const select =
                document.getElementById(id);

            if (!select) {
                return;
            }

            const currentValue = select.value;
            select.innerHTML = options;
            select.value = currentValue;
        });
    },

    architectureLayout() {
        let layout =
            this.infrastructure.topology.layouts
                .find(
                    (item) =>
                        item.kind === "physical",
                )
            ?? this.infrastructure.topology.layouts[0];

        if (!layout) {
            layout = {
                id: "physical",
                label: "Topologie physique",
                kind: "physical",
                positions: {},
            };
            this.infrastructure.topology.layouts.push(
                layout,
            );
        }

        layout.positions ??= {};
        const occupied = new Set(
            Object.values(layout.positions).map(
                (position) =>
                    `${position.column}:${position.row}`,
            ),
        );

        this.infrastructure.topology.devices
            .forEach((device, index) => {
                if (layout.positions[device.id]) {
                    return;
                }

                let slot = index;
                let column = slot % ARCHITECTURE_MINIMUM_COLUMNS;
                let row = Math.floor(
                    slot / ARCHITECTURE_MINIMUM_COLUMNS,
                );

                while (
                    occupied.has(`${column}:${row}`)
                ) {
                    slot += 1;
                    column = slot % ARCHITECTURE_MINIMUM_COLUMNS;
                    row = Math.floor(
                        slot / ARCHITECTURE_MINIMUM_COLUMNS,
                    );
                }

                layout.positions[device.id] = {
                    column,
                    row,
                };
                occupied.add(`${column}:${row}`);
            });

        return layout;
    },

    ensureTopology() {
        if (!this.infrastructure.topology) {
            this.infrastructure.topology = {
                metadata: {},
                devices: [],
                links: [],
                layouts: [],
            };
        }

        this.infrastructure.nodes ??= [];
        this.infrastructure.services ??= [];
        this.infrastructure.topology.devices ??= [];
        this.infrastructure.topology.links ??= [];
        this.infrastructure.topology.layouts ??= [];
    },

    clearArchitectureEditor() {
        this.selectedArchitectureItem = null;
        this.elements.architectureEditorMode
            .value = "";
        this.elements.architectureEditorId
            .value = "";
        this.elements.architectureEditorKind
            .textContent = "Sélection";
        this.elements.architectureEditorTitle
            .textContent = "Choisissez un élément";
        this.elements.architectureDeviceFields
            .hidden = true;
        this.elements.architectureServiceFields
            .hidden = true;
        this.elements.architectureLinkFields
            .hidden = true;
        this.elements.architectureEditorActions
            .hidden = true;
        this.renderAssociatedServices(null);
    },
};
