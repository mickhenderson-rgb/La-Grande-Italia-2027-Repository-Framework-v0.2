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
    // Asked here as well as in Render.show so that declining to leave an
    // unsaved form doesn't leave currentPage pointing at a screen we never
    // actually rendered. Agreeing releases the guard, so this never
    // prompts twice for one gesture.
    if (typeof FormGuard !== "undefined" && !FormGuard.confirmLeave()) {
      return;
    }

    this.currentPage = page;

    switch ((page || "").toLowerCase()) {
      case "dashboard":
        Render.show(Layout.render(Dashboard.render()));

        Dashboard.initialise();

        break;

      case "planner":
        Render.show(Layout.render(Planner.render()));

        break;

      case "map":
        TripMap.open();

        break;

      case "itinerary":
        ItineraryImport.open();

        break;

      case "currency":
        Currency.open();

        break;

      case "accommodation":
        Accommodation.openAll();

        break;

      case "transport":
        Transport.openAll();

        break;

      case "readiness":
        Readiness.open();

        break;

      case "budget":
        Budget.open();

        break;

      case "journal":
        Journal.open();

        break;

      case "guide":
        Guide.open();

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
