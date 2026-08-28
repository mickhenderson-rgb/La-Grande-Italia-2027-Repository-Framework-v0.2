/*
=========================================================

COMPASS-TOS

Journey Editor

Version 1.0.0

Build 20

Handles adding, inserting and deleting days in the journey.
Day numbers must stay sequential and contiguous, so any
insert/delete cascades a renumber into every other dataset
that references a day number: Transport, Expenses, Journal
(all keyed by day), and the dayRange fields used by
Accommodation, Activities and Restaurants.

=========================================================
*/

const JourneyEditor = {
  // A night spent travelling rather than staying anywhere: a red-eye
  // flight, an overnight ferry, a sleeper train.
  //
  // Before this the only way to say it was to type the literal word
  // "flight" into Overnight, which three separate modules then
  // string-matched. Anything else - "ferry from naples" was the real
  // case - was treated as a place, so the map flagged it NO LOCATION
  // because no such town exists, and Readiness was about to call it a
  // night with nowhere to sleep. Both were right about the data and
  // wrong about the trip.
  //
  // day.transit is the fact. The old "flight" spelling still counts, so
  // journeys written before this keep working without a migration.
  isTransit(day) {
    if (!day) {
      return false;
    }

    if (day.transit === true) {
      return true;
    }

    return String(day.overnight || "").trim().toLowerCase() === "flight";
  },

  blankDay(dayNumber) {
    return {
      day: dayNumber,
      date: "",
      title: "New Day",
      location: "",
      overnight: "",
      transit: false,
      locked: false,
      items: [],
    };
  },

  shiftReferences(fromDay, delta) {
    const transport = Project.get("transport");

    if (transport && Array.isArray(transport.items)) {
      transport.items.forEach((item) => {
        if (item.day >= fromDay) {
          item.day += delta;
        }
      });

      Project.update("transport", transport);
    }

    const expenses = Project.get("expenses");

    if (expenses && Array.isArray(expenses.items)) {
      expenses.items.forEach((item) => {
        if (item.day >= fromDay) {
          item.day += delta;
        }
      });

      Project.update("expenses", expenses);
    }

    const journal = Project.get("journal");

    if (journal && Array.isArray(journal.entries)) {
      journal.entries.forEach((entry) => {
        if (entry.day >= fromDay) {
          entry.day += delta;
        }
      });

      Project.update("journal", journal);
    }

    ["accommodation", "activities", "restaurants"].forEach((key) => {
      const data = Project.get(key);

      if (data && Array.isArray(data.items)) {
        data.items.forEach((item) => {
          if (Array.isArray(item.dayRange)) {
            item.dayRange = item.dayRange.map((n) => (n >= fromDay ? n + delta : n));
          }
        });

        Project.update(key, data);
      }
    });
  },

  insertDay(afterDayNumber, fields) {
    const journey = Project.get("journey");

    if (!journey || !Array.isArray(journey.days)) {
      return;
    }

    const isAppend = afterDayNumber === null;

    const newDayNumber = isAppend
      ? journey.days.reduce((max, d) => Math.max(max, d.day), 0) + 1
      : afterDayNumber + 1;

    if (!isAppend) {
      this.shiftReferences(newDayNumber, 1);

      journey.days.forEach((day) => {
        if (day.day >= newDayNumber) {
          day.day += 1;
        }
      });
    }

    const newDay = this.blankDay(newDayNumber);

    newDay.title = fields.title || "New Day";

    newDay.location = fields.location || "";

    newDay.overnight = fields.overnight || fields.location || "";

    journey.days.push(newDay);

    journey.days.sort((a, b) => a.day - b.day);

    Project.update("journey", journey);

    Dates.recalculateJourney();

    return newDayNumber;
  },

  deleteDay(dayNumber) {
    const journey = Project.get("journey");

    if (!journey || !Array.isArray(journey.days)) {
      return;
    }

    journey.days = journey.days.filter((day) => day.day !== dayNumber);

    journey.days.forEach((day) => {
      if (day.day > dayNumber) {
        day.day -= 1;
      }
    });

    Project.update("journey", journey);

    ["transport", "expenses"].forEach((key) => {
      const data = Project.get(key);

      if (data && Array.isArray(data.items)) {
        data.items = data.items.filter((item) => item.day !== dayNumber);

        data.items.forEach((item) => {
          if (item.day > dayNumber) {
            item.day -= 1;
          }
        });

        Project.update(key, data);
      }
    });

    const journal = Project.get("journal");

    if (journal && Array.isArray(journal.entries)) {
      journal.entries = journal.entries.filter((entry) => entry.day !== dayNumber);

      journal.entries.forEach((entry) => {
        if (entry.day > dayNumber) {
          entry.day -= 1;
        }
      });

      Project.update("journal", journal);
    }

    ["accommodation", "activities", "restaurants"].forEach((key) => {
      const data = Project.get(key);

      if (data && Array.isArray(data.items)) {
        data.items.forEach((item) => {
          if (Array.isArray(item.dayRange)) {
            item.dayRange = item.dayRange.map((n) => (n > dayNumber ? n - 1 : n));
          }
        });

        Project.update(key, data);
      }
    });

    Dates.recalculateJourney();
  },

  countLinkedItems(dayNumber) {
    let count = 0;

    ["transport", "expenses"].forEach((key) => {
      const data = Project.get(key);

      if (data && Array.isArray(data.items)) {
        count += data.items.filter((item) => item.day === dayNumber).length;
      }
    });

    const journal = Project.get("journal");

    if (journal && Array.isArray(journal.entries)) {
      const entry = journal.entries.find((e) => e.day === dayNumber);

      if (entry && (entry.notes || (entry.photos || []).length > 0 || (entry.checklist || []).length > 0)) {
        count += 1;
      }
    }

    return count;
  },
};
