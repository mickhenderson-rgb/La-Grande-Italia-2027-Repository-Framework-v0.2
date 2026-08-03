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

    try {
      const response = await fetch(`${window.API_BASE}/api/whoami`);

      if (response.ok) {
        const result = await response.json();

        Project.currentUser = result.user || "";
      }
    } catch (error) {
      console.warn("Could not determine current user:", error);
    }

    Repository.setStatus("Application Ready");

    Landing.open();
  },
);
