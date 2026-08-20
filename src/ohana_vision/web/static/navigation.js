"use strict";

const CONFIGURATION_ROUTES = Object.freeze({
    "configuration-network": "configuration",
    "configuration-workers": "configuration",
    "configuration-dhcp": "configuration",
    "configuration-architecture": "configuration",
    "configuration-plugins": "configuration",
});

/**
 * Controls navigation between the main Ohana-Vision views.
 */
export class NavigationController {
    constructor({
        navigationSelector = "[data-navigation-target]",
        viewSelector = "[data-view]",
        defaultView = "overview",
    } = {}) {
        this.navigationSelector = navigationSelector;
        this.viewSelector = viewSelector;
        this.defaultView = defaultView;

        this.navigationItems = [];
        this.views = [];
        this.viewContainer = null;
        this.activeView = null;

        this.handleHashChange = this.handleHashChange.bind(this);
    }

    initialize() {
        this.navigationItems = Array.from(
            document.querySelectorAll(this.navigationSelector),
        );

        this.views = Array.from(
            document.querySelectorAll(this.viewSelector),
        );

        this.viewContainer =
            document.querySelector(
                ".application-views",
            );

        this.navigationItems.forEach((navigationItem) => {
            navigationItem.addEventListener("click", () => {
                const target =
                    navigationItem.dataset.navigationTarget;

                this.activate(target);
            });
        });

        window.addEventListener(
            "hashchange",
            this.handleHashChange,
        );

        this.activate(
            this.resolveInitialView(),
            {
                updateHash: false,
            },
        );
    }

    activate(
        viewName,
        {
            updateHash = true,
        } = {},
    ) {
        viewName = this.normalizeRoute(viewName);

        if (!viewName || !this.hasView(viewName)) {
            return false;
        }

        const visibleViews =
            this.visibleViews(viewName);

        if (this.viewContainer) {
            this.viewContainer.dataset.activeView =
                viewName;
        }

        this.views.forEach((view) => {
            const isVisible =
                visibleViews.has(
                    view.dataset.view,
                );

            view.hidden = !isVisible;
            view.classList.toggle(
                "is-active",
                isVisible,
            );
        });

        this.navigationItems.forEach((navigationItem) => {
            const isActive =
                navigationItem.dataset.navigationTarget
                === viewName;

            navigationItem.classList.toggle(
                "is-active",
                isActive,
            );

            if (isActive) {
                navigationItem.setAttribute(
                    "aria-current",
                    "page",
                );
            } else {
                navigationItem.removeAttribute(
                    "aria-current",
                );
            }
        });

        this.activeView = viewName;

        if (updateHash) {
            this.updateLocationHash(viewName);
        }

        this.dispatchNavigationChanged(viewName);

        return true;
    }

    /**
     * Return the views visible for one navigation target.
     *
     * The overview combines the dashboard, infrastructure
     * and timeline without duplicating their DOM elements.
     * Configuration routes share one view and select their
     * own panel through the configuration controller.
     *
     * @param {string} viewName
     * @returns {Set<string>}
     */
    visibleViews(viewName) {
        if (viewName === "overview") {
            return new Set([
                "overview",
                "infrastructure",
                "timeline",
            ]);
        }

        return new Set([
            this.routeView(viewName),
        ]);
    }

    normalizeRoute(viewName) {
        if (viewName === "configuration") {
            return "configuration-dhcp";
        }

        return viewName;
    }

    routeView(viewName) {
        return CONFIGURATION_ROUTES[viewName]
            ?? viewName;
    }

    hasView(viewName) {
        const routeView = this.routeView(viewName);

        return this.views.some(
            (view) => view.dataset.view === routeView,
        );
    }

    resolveInitialView() {
        const hashView =
            window.location.hash.replace(/^#/, "");

        if (hashView && this.hasView(hashView)) {
            return hashView;
        }

        if (this.hasView(this.defaultView)) {
            return this.defaultView;
        }

        return this.views[0]?.dataset.view ?? null;
    }

    handleHashChange() {
        const requestedView =
            window.location.hash.replace(/^#/, "");

        if (!requestedView) {
            this.activate(
                this.defaultView,
                {
                    updateHash: false,
                },
            );

            return;
        }

        if (!this.hasView(requestedView)) {
            this.activate(this.defaultView);
            return;
        }

        this.activate(
            requestedView,
            {
                updateHash: false,
            },
        );
    }

    updateLocationHash(viewName) {
        if (
            window.location.hash
            === `#${viewName}`
        ) {
            return;
        }

        window.location.hash = viewName;
    }

    dispatchNavigationChanged(viewName) {
        document.dispatchEvent(
            new CustomEvent(
                "ohana:navigation-changed",
                {
                    detail: {
                        view: viewName,
                    },
                },
            ),
        );
    }
}
