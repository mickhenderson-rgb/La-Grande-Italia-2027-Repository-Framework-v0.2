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

  findArrivalDate(day) {
    const items = Array.isArray(day.items) ? day.items : [];

    const flight = items.find(
      (item) => item.type === "flight" && item.arrival && item.arrival.date,
    );

    return flight ? flight.arrival.date : null;
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
