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

  // The signed-in user's role/permission on the currently loaded trip.
  // Set by Data.loadProject() from /api/projects. Defaults to full access
  // so a failed lookup never hides something it shouldn't - the server
  // enforces the real restriction regardless; these two only drive which
  // sidebar items the client shows.
  currentRole: "owner",

  currentPermission: "write",

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

    // RETURNED, not fired and forgotten. A caller that re-renders straight
    // after saving was racing it: Layout.render() rebuilds the sidebar, so
    // the "Saved" this eventually writes into #save-status landed on an
    // element that had already been replaced by a fresh "Ready". Worse, a
    // FAILED save was silent for the same reason - the journal said
    // nothing and looked exactly like a save that had worked.
    return this.persist(dataset, value);
  },

  async persist(dataset, value) {
    if (!this.persistenceEnabled || !this.projectFolder) {
      return;
    }

    let failed = null;

    this.setSaveStatusEl("Saving…");

    try {
      const response = await fetch(`${window.API_BASE}/api/data/${this.projectFolder}/${dataset}`, {
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

      // Kept so it can be rethrown below. The status element alone is not
      // enough: it lives in the sidebar, which is behind a hamburger on a
      // phone and is rebuilt by the next render anyway.
      failed = error;

      console.warn(
        `[Project] Could not save ${dataset}.json - is server.js running? Changes are only in memory until it is.`,
      );
    }

    // Thrown AFTER the status line is written, so callers that ignore the
    // promise behave exactly as they always did, and callers that await it
    // can tell the person in front of them.
    if (failed) {
      throw failed;
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
