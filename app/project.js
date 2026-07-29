/*
=========================================================

COMPASS-TOS

Project

Version 1.0.0

Author:
OpenAI + Mick Henderson

=========================================================
*/

const Project = {
  version: "1.0",

  loaded: false,

  modified: false,

  filename: "",

  projectFolder: "",

  persistenceEnabled: true,

  currentUser: "",

  lastSaveStatus: "idle",

  data: {
    project: {},

    journey: {},

    events: {},

    locations: {},

    bookings: {},

    accommodation: {},

    activities: {},

    transport: {},

    budget: {},

    journal: {},
  },

  initialise() {
    console.log("Project Initialised");
  },

  load(dataset, value) {
    this.data[dataset] = value;

    this.modified = false;
  },

  get(dataset) {
    return this.data[dataset];
  },

  update(dataset, value) {
    this.data[dataset] = value;

    this.modified = true;

    this.persist(dataset, value);
  },

  async persist(dataset, value) {
    if (!this.persistenceEnabled || !this.projectFolder) {
      return;
    }

    this.setSaveStatusEl("Saving…");

    try {
      const response = await fetch(`/api/data/${this.projectFolder}/${dataset}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });

      if (!response.ok) {
        throw new Error(`Save failed with status ${response.status}`);
      }

      this.lastSaveStatus = "saved";

      this.modified = false;

      this.setSaveStatusEl("Saved");

      console.log(`[Project] Saved ${dataset}.json`);
    } catch (error) {
      this.lastSaveStatus = "error";

      this.setSaveStatusEl("Not saved - server offline?");

      console.warn(
        `[Project] Could not save ${dataset}.json - is server.js running? Changes are only in memory until it is.`,
      );
    }
  },

  setSaveStatusEl(text) {
    const el = document.getElementById("save-status");

    if (el) {
      el.textContent = text;
    }
  },

  isModified() {
    return this.modified;
  },

  markSaved() {
    this.modified = false;
  },

  currentProject() {
    return this.data.project;
  },

  statistics() {
    return {
      plannedDays: this.data.project.statistics?.plannedDays || 0,

      plannedNights: this.data.project.statistics?.plannedNights || 0,

      booked: this.data.project.statistics?.bookedEvents || 0,

      locked: this.data.project.statistics?.lockedEvents || 0,
    };
  },
};
