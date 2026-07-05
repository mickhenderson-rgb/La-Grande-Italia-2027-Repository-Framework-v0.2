/*
=========================================================

COMPASS-TOS

Router

Version 1.1.0

=========================================================
*/

const Router = {
  currentPage: "dashboard",

  routes: {
    dashboard() {
      Render.show(Layout.render(Dashboard.render()));

      Dashboard.initialise();
    },

    planner() {
      Render.show(Layout.render("<h2>Planner (Coming Next Build)</h2>"));
    },

    destinations() {
      Render.show(Layout.render("<h2>Destinations (Coming Soon)</h2>"));
    },

    accommodation() {
      Render.show(Layout.render("<h2>Accommodation</h2>"));
    },

    flights() {
      Render.show(Layout.render("<h2>Flights</h2>"));
    },

    transport() {
      Render.show(Layout.render("<h2>Transport</h2>"));
    },

    budget() {
      Render.show(Layout.render("<h2>Budget</h2>"));
    },

    guide() {
      Render.show(Layout.render("<h2>Travel Guide</h2>"));
    },

    settings() {
      Render.show(Layout.render("<h2>Settings</h2>"));
    },
  },

  navigate(route) {
    if (!this.routes[route]) {
      console.error(
        "Unknown Route:",

        route,
      );

      return;
    }

    this.currentPage = route;

    this.routes[route]();
  },
};
