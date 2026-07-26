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

  async loadProject(projectFolder) {
    this.currentProjectFolder = projectFolder;

    console.log("Loading Project:", projectFolder);

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

    Project.load("activities", await this.loadJSON(`${base}/activities.json`));

    Project.load("transport", await this.loadJSON(`${base}/transport.json`));

    Project.load(
      "restaurants",
      await this.loadJSON(`${base}/restaurants.json`),
    );

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
