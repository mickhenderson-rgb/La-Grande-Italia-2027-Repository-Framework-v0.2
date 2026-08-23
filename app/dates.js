/*
=========================================================

COMPASS-TOS

Dates Engine

Version 1.0.0

Build 12

Recalculates journey day dates from the trip start date.
Facts only: flight arrival dates come from the airline
booking, never from arithmetic, and always take
precedence over the default one-day-per-day assumption.

=========================================================
*/

const Dates = {
  addDays(dateString, days) {
    if (!dateString) {
      return "";
    }

    const parts = dateString.split("-").map((n) => parseInt(n, 10));

    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    date.setUTCDate(date.getUTCDate() + days);

    const yyyy = date.getUTCFullYear();

    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");

    const dd = String(date.getUTCDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
  },

  // Maps a journey day number to its ISO date (YYYY-MM-DD), or "" if the
  // day (or journey) doesn't exist. Used to pre-select date pickers on
  // booking forms so the native calendar opens on the relevant day.
  getDayDate(dayNumber) {
    const journey = Project.get("journey");

    if (!journey || !Array.isArray(journey.days)) {
      return "";
    }

    const day = journey.days.find((d) => d.day === dayNumber);

    return day && day.date ? day.date : "";
  },

  findArrivalDate(day) {
    const flights = Project.get("flights");

    const items = flights && Array.isArray(flights.items) ? flights.items : [];

    // A flight with a stopover is one booking - the LAST leg's arrival is
    // the fact that matters for keeping the rest of the journey in sync.
    const flight = items.find((item) => {
      if (item.day !== day.day) {
        return false;
      }

      const arrival = Flights.overallArrival(item);

      return arrival && arrival.date;
    });

    return flight ? Flights.overallArrival(flight).date : null;
  },

  recalculateJourney() {
    const projectData = Project.get("project");

    const journey = Project.get("journey");

    if (!projectData || !projectData.project || !journey || !Array.isArray(journey.days)) {
      return;
    }

    const startDate = projectData.project.departureDate;

    if (!startDate) {
      return;
    }

    journey.days.forEach((day, index) => {
      if (index === 0) {
        day.date = startDate;

        return;
      }

      const previousDay = journey.days[index - 1];

      const arrivalDate = this.findArrivalDate(previousDay);

      day.date = arrivalDate || this.addDays(previousDay.date, 1);
    });

    Project.update("journey", journey);
  },
};
