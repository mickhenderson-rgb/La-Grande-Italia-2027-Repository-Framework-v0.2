/*
=========================================================

COMPASS-TOS

Router

Version 2.1.0

=========================================================
*/

const Router = {
  currentPage: "dashboard",

  navigate(page) {
    this.currentPage = page;

    switch ((page || "").toLowerCase()) {
      case "dashboard":
        Render.show(Layout.render(Dashboard.render()));

        Dashboard.initialise();

        break;

      case "planner":
        Render.show(Layout.render(Planner.render()));

        break;

      case "accommodation":
        Accommodation.openAll();

        break;

      case "transport":
        Transport.openAll();

        break;

      case "budget":
        Budget.open();

        break;

      case "journal":
        Journal.open();

        break;

      case "guide":
        alert("Travel Guide will be added later.");

        break;

      case "settings":
        Settings.open();

        break;

      case "flights":
        Flights.openAll();

        break;

      case "destinations":
        Destination.openList();

        break;

      default:
        Render.show(Layout.render(Dashboard.render()));

        Dashboard.initialise();

        break;
    }
  },
};
