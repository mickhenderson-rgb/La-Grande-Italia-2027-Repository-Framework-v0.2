/*
=========================================================

COMPASS-TOS

Data Manager

Version 1.0.0

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
      console.error(
        "Unable to load",

        path,
      );

      return null;
    }
  },

  async loadProject(projectFolder) {
    console.log(
      "Loading Project:",

      projectFolder,
    );

    const base = `data/projects/${projectFolder}`;

    Project.load(
      "project",

      await this.loadJSON(`${base}/project.json`),
    );

    Project.load(
      "journey",

      await this.loadJSON(`${base}/journey.json`),
    );

    Project.load(
      "events",

      await this.loadJSON(`${base}/events.json`),
    );

    Project.load(
      "locations",

      await this.loadJSON(`${base}/project-locations.json`),
    );

    Project.load(
      "bookings",

      await this.loadJSON(`${base}/bookings.json`),
    );

    Project.load(
      "budget",

      await this.loadJSON(`${base}/budget.json`),
    );

    console.log("Project Loaded");
  },
};
