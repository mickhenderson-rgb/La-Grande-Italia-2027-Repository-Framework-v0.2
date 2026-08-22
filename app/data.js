/*
=========================================================

COMPASS-TOS

Data Manager

Version 1.1.0

=========================================================
*/

const Data = {
  async loadJSON(path) {
    try {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(path);
      }

      return await response.json();
    } catch (error) {
      console.error("Unable to load", path);

      return null;
    }
  },

  // Looks up the signed-in user's role/permission on this trip (owner,
  // or a collaborator's write/read/guest) via the same list the Landing
  // page uses, so the sidebar can hide money-related pages for a guest.
  // Defaults (Project.js) stay full-access if this can't be determined -
  // access itself is always enforced server-side regardless.
  async loadTripPermission(projectFolder) {
    try {
      const response = await fetch(`${window.API_BASE}/api/projects`);

      if (!response.ok) {
        return;
      }

      const result = await response.json();

      const mine = (result.projects || []).find((p) => p.id === projectFolder);

      if (mine) {
        Project.currentRole = mine.role || "owner";

        Project.currentPermission = mine.permission || "write";
      }
    } catch (error) {
      console.warn("Could not determine trip permission:", error);
    }
  },

  async loadProject(projectFolder) {
    this.currentProjectFolder = projectFolder;

    Project.projectFolder = projectFolder;

    console.log("Loading Project:", projectFolder);

    await this.loadTripPermission(projectFolder);

    const base = `data/projects/${projectFolder}`;

    // Core

    Project.load("project", await this.loadJSON(`${base}/project.json`));

    Project.load("journey", await this.loadJSON(`${base}/journey.json`));

    // Planning

    Project.load("events", await this.loadJSON(`${base}/events.json`));

    Project.load(
      "locations",
      await this.loadJSON(`${base}/project-locations.json`),
    );

    // Research

    Project.load(
      "accommodation",
      await this.loadJSON(`${base}/accommodation.json`),
    );

    Project.load(
      "activities",
      await this.loadJSON(`${base}/activities.json`),
    );

    Project.load(
      "transport",
      await this.loadJSON(`${base}/transport.json`),
    );

    Project.load(
      "restaurants",
      await this.loadJSON(`${base}/restaurants.json`),
    );

    Project.load("flights", await this.loadJSON(`${base}/flights.json`));

    // Travel

    Project.load("bookings", await this.loadJSON(`${base}/bookings.json`));

    Project.load("budget", await this.loadJSON(`${base}/budget.json`));

    Project.load("expenses", await this.loadJSON(`${base}/expenses.json`));

    Project.load("journal", await this.loadJSON(`${base}/journal.json`));

    Project.load("weather", await this.loadJSON(`${base}/weather.json`));


    console.log("Project Loaded");

    console.log(Project.get("accommodation"));
  },
};
