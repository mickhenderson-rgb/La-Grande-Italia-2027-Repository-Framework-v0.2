/*
=========================================================

COMPASS-TOS

Bootstrap

Version 1.1.0

=========================================================
*/

document.addEventListener(
  "DOMContentLoaded",

  async () => {
    console.log("BOOTSTRAP STARTED");

    Repository.setStatus("Bootstrapping");

    Project.initialise();

    await Data.loadProject("la-grande-italia-2027");

    Repository.setStatus("Application Ready");

    Router.navigate("dashboard");
  },
);
