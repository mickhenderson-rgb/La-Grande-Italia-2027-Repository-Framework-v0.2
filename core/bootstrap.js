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

    // Not Landing.open() unconditionally any more: the URL may name a trip
    // and a section, and refreshing three screens deep used to drop you
    // back at the trip list.
    await Router.start();
  },
);
