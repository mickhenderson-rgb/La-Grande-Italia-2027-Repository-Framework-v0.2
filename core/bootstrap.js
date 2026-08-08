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

    // Check for an existing session. If not signed in, show the right
    // entry screen (register when invited or on first-run setup, else login)
    // and stop here - nothing else loads until there's a session.
    const auth = await Auth.check();

    if (!auth.user) {
      const invite = new URLSearchParams(window.location.search).get("invite");

      if (invite) {
        Auth.showRegister(invite);
      } else if (auth.needsBootstrap || auth.registrationMode === "open") {
        Auth.showRegister("");
      } else {
        Auth.showLogin();
      }

      return;
    }

    Project.currentUser = auth.user.username || "";

    Repository.setStatus("Application Ready");

    Landing.open();
  },
);
