/*
=========================================================

COMPASS-TOS

Router

Version 2.0.0

=========================================================
*/

const Router = {
  currentPage: "dashboard",

  navigate(page) {
    this.currentPage = page;

    switch (page) {
      case "dashboard":
        Render.show(Layout.render(Dashboard.render()));

        Dashboard.initialise();

        break;

      case "planner":
        Render.show(Layout.render(Planner.render()));

        break;

      default:
        Destination.open(page);

        break;
    }
  },
};
