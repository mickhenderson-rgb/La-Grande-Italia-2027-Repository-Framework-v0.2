/*
=========================================================

COMPASS-TOS

Bootstrap

Version 1.0.0

=========================================================
*/

document.addEventListener(
  "DOMContentLoaded",

  async () => {
    console.log("BOOTSTRAP STARTED");

    Repository.setStatus("Bootstrapping");

    await RepositoryManager.load(
      "trip",

      "data/trip.json",
    );

    await RepositoryManager.load(
      "navigation",

      "data/navigation.json",
    );

    await RepositoryManager.load(
      "destinations",

      "data/destinations.json",
    );

    await RepositoryManager.load(
      "bookings",

      "data/bookings.json",
    );

    await RepositoryManager.load(
      "budget",

      "data/budget.json",
    );

    Repository.setStatus("Repository Ready");

    await Application.initialise();

    Router.navigate("dashboard");
  },
);
