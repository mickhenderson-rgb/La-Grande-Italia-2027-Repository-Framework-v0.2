/*
=========================================================

COMPASS-TOS

Router

Version 1.0.0

=========================================================
*/

const Router = {
  currentPage: "dashboard",

  routes: {
    dashboard() {
      Render.show(Dashboard.render());

      Dashboard.initialise();
    },
  },

  navigate(route) {
    if (!this.routes[route]) {
      console.error(
        "Unknown route:",

        route,
      );

      return;
    }

    this.currentPage = route;

    this.routes[route]();
  },
};
