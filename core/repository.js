/*
=========================================================

La Grande Italia 2027

repository.js

Repository 1.0.4

=========================================================
*/

const Repository = {
  version: "1.0.4",

  status: "initialising",

  data: {
    trip: null,

    itinerary: null,

    navigation: null,

    destinations: null,

    bookings: null,

    budget: null,

    activities: null,
  },

  modules: {
    componentsLoaded: false,

    dataLoaded: false,

    navigationLoaded: false,

    applicationLoaded: false,
  },

  log(message) {
    console.log(
      "[Repository]",

      message,
    );
  },

  setStatus(status) {
    this.status = status;

    this.log(status);
  },
};
