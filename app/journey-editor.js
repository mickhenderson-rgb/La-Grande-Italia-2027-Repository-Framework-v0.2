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

    // An explicit answer, either way, always wins. Saving the day's form
    // writes true or false, so once you have touched that checkbox the
    // guess below never runs again - a red-eye you deliberately kept a
    // room either side of stays your business.
    if (day.transit === true) {
      return true;
    }

    if (day.transit === false) {
      return false;
    }

    // Nobody has said. A flight still in the air over this night says it:
    // you are not sleeping anywhere, so Readiness should not ask where and
    // the map should not draw a stop. Before this you had to know to go
    // into Edit Day and tick it yourself, and until you did, the day you
    // spent in the air was flagged as a night with nowhere to sleep.
    if (this.airborneOvernight(day)) {
      return true;
    }

    // Spellings that ARE an answer, not a place.
    //
    // "flight" is the pre-transit-flag spelling, kept so journeys written
    // before day.transit existed need no migration. "in transit" turned up
    // in the real Italy trip on days 1, 50 and 51 - the app asked where you
    // were sleeping while you were on a plane, and the map had a town
    // called In Transit it could not find.
    const said = String(day.overnight || "").trim().toLowerCase();

    return said === "flight" || said === "in transit" || said === "transit";
  },

  // True when a flight is still in the air across this day's night: it
  // took off on this day or earlier and lands on a LATER one.
  //
  // Guarded on Flights because journey-editor.js loads first, and this is
  // called from the map's per-day loop - so it must not throw on a page
  // that has not loaded the flights module.
  airborneOvernight(day) {
    if (!day || typeof day.day !== "number" || typeof Flights === "undefined") {
      return false;
    }

    const data = Project.get("flights");

    const items = data && Array.isArray(data.items) ? data.items : [];

    return items.some((item) => {
      const span = Flights.daySpan(item);

      return span.from <= day.day && span.to > day.day;
    });
  },

  blankDay(dayNumber) {
    return {
      day: dayNumber,
      date: "",
      title: "New Day",
      location: "",
      overnight: "",
      // Deliberately absent rather than false. isTransit reads three states:
      // true, false, and nobody-has-said - and only the third one lets a
      // flight added later mark its own airborne night for you.
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
