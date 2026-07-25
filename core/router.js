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
        PlanningItem.open(
          {
            title: "Accommodation",
          },
          "accommodation",
        );

        break;

      case "transport":
        PlanningItem.open(
          {
            title: "Transport",
          },
          "transport",
        );

        break;

      case "budget":
        alert("Budget module will be added in Build 14.");

        break;

      case "guide":
        alert("Travel Guide will be added later.");

        break;

      case "settings":
        alert("Settings will be added later.");

        break;

      case "flights":
        alert("Flights module will be added later.");

        break;

      case "destinations":
        alert("Destination research is managed from the Planner.");

        break;

      default:
        Render.show(Layout.render(Dashboard.render()));

        Dashboard.initialise();

        break;
    }
  },
};
