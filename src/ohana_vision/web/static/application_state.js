"use strict";

const state = {
    runtime: null,
    observations: [],
    topology: null,
    timeline: null,
    deviceHealth: {},
    devicePresence: {},
    selectedDeviceId: null,
    timelineRangeHours: 6,
};

/**
 * Return the shared frontend state.
 *
 * The returned object must not be replaced. Modules may update
 * its declared properties.
 *
 * @returns {{
 *     runtime: object | null,
 *     observations: Array<object>,
 *     topology: object | null,
 *     timeline: object | null,
 *     deviceHealth: Record<string, string>,
 *     devicePresence: Record<string, object>,
 *     selectedDeviceId: string | null,
 *     timelineRangeHours: number,
 * }}
 */
export function applicationState() {
    return state;
}

/**
 * Store the current infrastructure timeline.
 *
 * @param {object|null} timeline
 */
export function setTimeline(
    timeline,
) {
    state.timeline = timeline;
}

/**
 * Reset the frontend state.
 *
 * Mainly intended for tests and controlled reinitialization.
 */
export function resetApplicationState() {
    state.runtime = null;
    state.observations = [];
    state.topology = null;
    state.timeline = null;
    state.deviceHealth = {};
    state.devicePresence = {};
    state.selectedDeviceId = null;
    state.timelineRangeHours = 6;
}