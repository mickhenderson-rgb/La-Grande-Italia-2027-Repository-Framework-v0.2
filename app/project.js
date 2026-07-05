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
