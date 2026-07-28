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

    Repository.setStatus("Application Ready");

    Landing.open();
  },
);
