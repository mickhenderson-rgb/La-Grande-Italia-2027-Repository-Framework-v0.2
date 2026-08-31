/*
=========================================================

COMPASS-TOS

Readiness

Version 1.0.0

Answers the question you actually have three months out:
what is still not sorted?

Every module already tracks status per item, but nothing
answered across them - so "which nights have nowhere to
sleep" or "which moves between cities have no ticket"
meant opening five screens and holding it in your head.

Two rules this screen follows:

  1. It DERIVES everything, live, and stores nothing. No
     readiness score is written to JSON - the house rule
     is that JSON holds facts, and "3 things outstanding"
     is not a fact, it's a reading of the facts.

  2. It only reports things it can be sure about. A day
     with no activities is not a problem - plenty of days
     shouldn't have any. A night with nowhere to sleep
     is. Where the app can't tell, it says nothing rather
     than inventing a warning, because a checklist that
     cries wolf gets ignored and then the real gap gets
     ignored with it.

Findings are ranked by how much trouble they cause if
missed, not by category.

=========================================================
*/

const Readiness = {
  // Highest first. The number is only for sorting; what the user sees is
  // the group heading.
  LEVELS: {
    blocking: { rank: 3, label: "Needs sorting", hint: "These leave a real gap in the trip." },

    money: { rank: 2, label: "Costs unknown", hint: "Planned, but the budget can't count it yet." },

    tidy: { rank: 1, label: "Worth a look", hint: "Nothing's broken - these are just loose ends." },
  },

  open() {
    Render.show(Layout.render(this.render()));
  },

  days() {
    const journey = Project.get("journey");

    return journey && Array.isArray(journey.days) ? journey.days : [];
  },

  items(collection) {
    const data = Project.get(collection);

    return data && Array.isArray(data.items) ? data.items : [];
  },

  // A booking counts as settled once it's Booked or beyond. Selected is
  // still a decision, not a reservation.
  isBooked(item) {
    return item.status === "Booked" || item.status === "Travel" || item.status === "Review";
  },

  hasPrice(item) {
    return Boolean(item.price && Number(item.price.amount) > 0);
  },

  spansDay(item, dayNumber) {
    if (Array.isArray(item.dayRange) && item.dayRange.length >= 1) {
      const a = item.dayRange[0];

      const b = item.dayRange[item.dayRange.length - 1];

      return a <= dayNumber && b >= dayNumber;
    }

    return item.day === dayNumber;
  },

  // ---------------------------------------------------------- the checks

  // Every night of the trip needs somewhere to sleep. The LAST day is
  // excluded: you check out that morning and go home, so it has no night.
  //
  // Accommodation is matched on its day range, treating dayRange[1] as the
  // check-out day - the same reading Budget uses for nights. A stay from
  // Day 3 to Day 6 covers the nights of days 3, 4 and 5.
  checkAccommodation(findings) {
    const days = this.days();

    if (days.length < 2) {
      return;
    }

    const stays = this.items("accommodation");

    // The last day is a departure day, not a night.
    days.slice(0, -1).forEach((day) => {
      // A night on a ferry or a red-eye needs no bed, so asking where
      // you're sleeping would be a permanent false alarm.
      if (JourneyEditor.isTransit(day)) {
        return;
      }

      const covered = stays.some((stay) => {
        if (!Array.isArray(stay.dayRange) || stay.dayRange.length < 2) {
          return this.spansDay(stay, day.day);
        }

        // Nights run from check-in up to (not including) check-out.
        return stay.dayRange[0] <= day.day && stay.dayRange[1] > day.day && (stay.selected || this.isBooked(stay));
      });

      if (!covered) {
        findings.push({
          level: "blocking",
          title: `Day ${day.day}: nowhere to sleep`,
          detail: `${this.pretty(day.title || day.overnight) || "Untitled day"} has no accommodation selected or booked.`,
          action: `Day.open(${day.day})`,
          actionLabel: "Open day",
        });
      }
    });
  },

  // A change of overnight location means you have to physically get there.
  // If nothing is booked across that gap, that's a hole in the plan.
  //
  // Deliberately quiet where it can't be sure: a day with no overnight at
  // all (a transit day) is skipped rather than guessed at.
  checkTravelBetweenStops(findings) {
    const days = this.days();

    const moves = [];

    let previous = null;

    days.forEach((day) => {
      const overnight = String(day.overnight || "").toLowerCase();

      if (!overnight || JourneyEditor.isTransit(day)) {
        return;
      }

      if (previous && previous.location !== overnight) {
        moves.push({ from: previous, to: { location: overnight, day: day.day } });
      }

      previous = { location: overnight, day: day.day };
    });

    const transport = this.items("transport");

    const flights = this.items("flights");

    moves.forEach((move) => {
      const lo = move.from.day;

      const hi = move.to.day;

      const covered = transport.concat(flights).some((item) => {
        for (let d = lo; d <= hi; d++) {
          if (this.spansDay(item, d)) {
            return true;
          }
        }

        return false;
      });

      if (!covered) {
        findings.push({
          level: "blocking",
          title: `${this.pretty(move.from.location)} → ${this.pretty(move.to.location)}: no way to get there`,
          detail: `Nothing booked between Day ${lo} and Day ${hi}.`,
          action: `Router.navigate('transport')`,
          actionLabel: "Open transport",
        });
      }
    });
  },

  // Something selected but never booked, close to departure, is the
  // classic way a trip goes wrong. Only raised once departure is known and
  // near - months out it's just noise.
  checkUnbooked(findings) {
    const daysOut = this.daysUntilDeparture();

    if (daysOut === null || daysOut > 60) {
      return;
    }

    const collections = [
      { key: "flights", label: "Flight", nav: "flights" },
      { key: "accommodation", label: "Accommodation", nav: "accommodation" },
      { key: "transport", label: "Transport", nav: "transport" },
    ];

    collections.forEach((c) => {
      const pending = this.items(c.key).filter((item) => item.selected || item.status === "Selected").filter((item) => !this.isBooked(item));

      if (pending.length === 0) {
        return;
      }

      findings.push({
        level: "blocking",
        title: `${pending.length} ${c.label.toLowerCase()} ${pending.length === 1 ? "choice" : "choices"} not booked yet`,
        detail: `Decided but not reserved, and departure is ${daysOut === 0 ? "today" : `in ${daysOut} day${daysOut === 1 ? "" : "s"}`}.`,
        action: `Router.navigate('${c.nav}')`,
        actionLabel: `Open ${c.label.toLowerCase()}`,
      });
    });
  },

  // The budget can only count what has a number on it.
  // Two places BOOKED for the same nights in the same town.
  //
  // The Budget counts one option per stay (v1.25.0), which is right for
  // options and wrong for two rooms genuinely booked - and it cannot tell
  // the difference. Rather than have the Budget guess, this asks.
  //
  // Grouped exactly as the Budget groups: destination plus BOTH days. If
  // the two ever disagreed about what "the same stay" means, this would
  // warn about something the Budget had not actually merged.
  //
  // Booked and beyond only. Two Shortlisted options for the same nights
  // is not a problem - it is what shortlisting is.
  checkDoubleBooked(findings) {
    const groups = {};

    this.items("accommodation").forEach((item) => {
      if (!this.isBooked(item)) {
        return;
      }

      const where = String(item.destination || "").trim().toLowerCase();

      const from = item.dayRange && item.dayRange[0];

      const to = item.dayRange && item.dayRange[1];

      // Not comparable, so not counted - the same rule the Budget uses.
      if (!where || typeof from !== "number" || typeof to !== "number") {
        return;
      }

      const key = where + "|" + from + "|" + to;

      groups[key] = groups[key] || { where: where, from: from, to: to, items: [] };

      groups[key].items.push(item);
    });

    Object.keys(groups).forEach((key) => {
      const group = groups[key];

      if (group.items.length < 2) {
        return;
      }

      const names = group.items.map((i) => i.name || "Unnamed").join(", ");

      const nights = Math.max(group.to - group.from, 1);

      findings.push({
        level: "money",
        title:
          group.items.length +
          " bookings for the same nights in " +
          this.pretty(group.where),
        // Says what the app has DONE about it, not merely that it noticed -
        // otherwise the reader has to go and work out for themselves
        // whether the budget is wrong.
        detail:
          `Day ${group.from} to ${group.to} (${nights} ${nights === 1 ? "night" : "nights"}): ${names}. ` +
          "The Budget counts only the dearest, on the assumption these are alternatives. " +
          "If both are real - two rooms, say - the budget is short by the other one.",
        action: "Router.navigate('accommodation')",
        actionLabel: "Open accommodation",
      });
    });
  },

  checkMissingPrices(findings) {
    // Both forms spelled out. A single plural label produced "1 activities
    // with no price", and accommodation/transport don't pluralise the way
    // the others do, so a rule wouldn't have worked anyway.
    const collections = [
      { key: "flights", one: "flight", many: "flights", nav: "flights", opens: "Open flights" },
      { key: "accommodation", one: "place to stay", many: "places to stay", nav: "accommodation", opens: "Open accommodation" },
      { key: "transport", one: "transport booking", many: "transport bookings", nav: "transport", opens: "Open transport" },
      { key: "activities", one: "activity", many: "activities", nav: "dashboard", opens: "Open activities" },
      { key: "restaurants", one: "restaurant", many: "restaurants", nav: "dashboard", opens: "Open restaurants" },
    ];

    collections.forEach((c) => {
      // Only things you've committed to - an unpriced Research idea is
      // exactly what Research is for.
      const committed = this.items(c.key).filter((item) => item.selected || item.status === "Selected" || this.isBooked(item));

      const unpriced = committed.filter((item) => !this.hasPrice(item));

      if (unpriced.length === 0) {
        return;
      }

      findings.push({
        level: "money",
        title: `${unpriced.length} ${unpriced.length === 1 ? c.one : c.many} with no price`,
        detail: "Chosen, but the budget can't include them until they have an amount.",
        action: `Router.navigate('${c.nav}')`,
        // Name the destination. A bare "Open" makes you read the finding
        // again to work out what you're opening, and every row said it.
        actionLabel: c.opens,
      });
    });
  },

  // Deliberately NOT checked here: whether a stop can be placed on the
  // map. Working that out means TripMap's coordinate lookup, and the only
  // way to borrow it is to hand TripMap this trip's data - which would
  // reach into another screen's state to answer a question that screen
  // already answers for itself, on its own rail. Left there.

  // A day with no title reads as a blank row everywhere it appears.
  checkUntitledDays(findings) {
    const untitled = this.days().filter((day) => !String(day.title || "").trim());

    if (untitled.length === 0) {
      return;
    }

    findings.push({
      level: "tidy",
      title: `${untitled.length} ${untitled.length === 1 ? "day has" : "days have"} no title`,
      detail: `Day ${untitled.map((d) => d.day).join(", ")}.`,
      action: `Router.navigate('planner')`,
      actionLabel: "Open planner",
    });
  },

  // ------------------------------------------------------------- results


  // =========================================================
  // PARTICIPANT CHECKS (Phase 4)
  //
  // Every one of these follows rule 2 in the header: report only what the
  // app can be SURE about. A checklist that cries wolf gets ignored, and
  // the real gap gets ignored with it.
  //
  // So each check stays silent unless the trip has told it enough:
  // capacity says nothing until a room has both a guest count and people
  // on it; the unaccommodated check says nothing while a night's rooms are
  // unassigned, because unassigned means the whole party; and the age
  // prompts say nothing unless the trip actually has the thing the age
  // affects - a hire car, a flight, a city tax.
  // =========================================================

  // Named people only, and only when there are any. An unnamed placeholder
  // is not somebody to warn about - the same rule Budget.headcountFor
  // applies to pricing.
  participantList() {
    if (typeof Participants === "undefined") {
      return [];
    }

    return Participants.all().filter((p) => String(p.name || "").trim() !== "");
  },

  assignedNames(item) {
    if (typeof Participants === "undefined") {
      return [];
    }

    return Participants.assignedTo(item)
      .map((id) => (Participants.find(id) || {}).name)
      .filter(Boolean);
  },

  // "Mick", "Mick and Kate", "Mick, Kate and Jo".
  nameList(names) {
    if (names.length <= 1) {
      return names[0] || "";
    }

    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  },

  // A room booked for fewer people than are going to sleep in it.
  //
  // Only fires when BOTH numbers are real: you have ticked people, and the
  // guest count says fewer. Since v1.31.0 ticking people fills the count
  // in, so this catches the case where it was then typed back down - or
  // where people were added to an older booking.
  checkRoomCapacity(findings) {
    if (this.participantList().length === 0) {
      return;
    }

    this.items("accommodation").forEach((stay) => {
      const names = this.assignedNames(stay);

      const guests = Number(stay.guests);

      if (names.length === 0 || !(guests > 0) || guests >= names.length) {
        return;
      }

      findings.push({
        level: "blocking",
        title: `${stay.name || "A stay"} is booked for ${guests}, but ${names.length} are going`,
        detail: `${this.nameList(names)} are on this booking. Either the room is too small or the guest count needs raising - and the city tax is charged per head, so the budget is short either way.`,
        action: `Accommodation.edit('${this.jsArg(stay.id)}')`,
        actionLabel: "Open booking",
      });
    });
  },

  // Somebody with no bed on a night when everybody else has one.
  //
  // DELIBERATELY QUIET while a night's rooms are unassigned: unassigned
  // means the whole party, so there is no gap to report. It only speaks
  // when the rooms that night name people AND somebody present is on none
  // of them - which is a real hole, not a guess.
  checkUnaccommodatedPeople(findings) {
    const people = this.participantList();

    const days = this.days();

    if (people.length === 0 || days.length < 2) {
      return;
    }

    const stays = this.items("accommodation");

    days.slice(0, -1).forEach((day) => {
      if (JourneyEditor.isTransit(day)) {
        return;
      }

      // Nights run from check-in up to but not including check-out.
      const covering = stays.filter(
        (stay) =>
          Array.isArray(stay.dayRange) &&
          stay.dayRange.length >= 2 &&
          stay.dayRange[0] <= day.day &&
          stay.dayRange[1] > day.day &&
          (stay.selected || this.isBooked(stay)),
      );

      if (covering.length === 0) {
        return;
      }

      // One unassigned room covers everyone. Nothing to say.
      if (covering.some((stay) => Participants.assignedTo(stay).length === 0)) {
        return;
      }

      const housed = {};

      covering.forEach((stay) => {
        Participants.assignedTo(stay).forEach((id) => {
          housed[id] = true;
        });
      });

      const homeless = Participants.presentOn(day.day)
        .filter((p) => String(p.name || "").trim() !== "")
        .filter((p) => !housed[p.id]);

      if (homeless.length === 0) {
        return;
      }

      findings.push({
        level: "blocking",
        title: `Day ${day.day}: ${this.nameList(homeless.map((p) => p.name))} ${homeless.length === 1 ? "has" : "have"} no bed`,
        detail: `Every room that night names who is in it, and ${homeless.length === 1 ? "this person is" : "these people are"} on none of them.`,
        action: `Day.open(${day.day})`,
        actionLabel: "Open day",
      });
    });
  },

  // More people on a vehicle than it holds.
  //
  // Silent when seats is 0, which means "does not apply" rather than "a
  // vehicle with no seats" - a train ticket has no capacity to run out of.
  checkVehicleSeats(findings) {
    if (this.participantList().length === 0) {
      return;
    }

    this.items("transport").forEach((leg) => {
      const seats = Number(leg.seats);

      const names = this.assignedNames(leg);

      if (!(seats > 0) || names.length <= seats) {
        return;
      }

      findings.push({
        level: "blocking",
        title: `${leg.mode || "Transport"}${leg.from ? " from " + this.pretty(leg.from) : ""}: ${names.length} people, ${seats} seats`,
        detail: `${this.nameList(names)} are on this leg. Either a bigger vehicle or a second one.`,
        action: `Transport.edit('${this.jsArg(leg.id)}')`,
        actionLabel: "Open transport",
      });
    });
  },

  // Somebody who joins late or leaves early, with no travel of their own.
  //
  // "Worth a look" rather than blocking, on purpose. They might be driving
  // themselves, or live nearby, and the app cannot tell - so this is a
  // reminder, not an accusation.
  checkJoinerTravel(findings) {
    const people = this.participantList();

    const days = this.days();

    if (people.length === 0 || days.length === 0) {
      return;
    }

    const lastDay = days[days.length - 1].day;

    const travel = this.items("flights").concat(this.items("transport"));

    people.forEach((p) => {
      if (!Array.isArray(p.dayRange) || p.dayRange.length < 2) {
        return;
      }

      const joinsLate = p.dayRange[0] > 1;

      const leavesEarly = p.dayRange[1] < lastDay;

      if (!joinsLate && !leavesEarly) {
        return;
      }

      const onSomething = travel.some((item) => Participants.isAssigned(item, p.id));

      if (onSomething) {
        return;
      }

      const what = joinsLate && leavesEarly
        ? `joins on Day ${p.dayRange[0]} and leaves on Day ${p.dayRange[1]}`
        : joinsLate
          ? `joins on Day ${p.dayRange[0]}`
          : `leaves on Day ${p.dayRange[1]}`;

      findings.push({
        level: "tidy",
        title: `${p.name} ${what}, with no travel recorded`,
        detail: `No flight or transport names ${p.name}. If they are making their own way there this is nothing - otherwise it is a leg nobody has booked.`,
        action: "Router.navigate('flights')",
        actionLabel: "Open flights",
      });
    });
  },

  // A booking whose DATE disagrees with the DAY it sits on.
  //
  // The app plans in days and every booking holds a real date, and until
  // now nothing compared the two. The sample trip shows exactly why:
  // Hotel Artemide sits on days 1-3 and is booked 2-5 May, while day 3 is
  // 19 August. Three and a half months out, and completely invisible -
  // you would arrive in Rome to a room booked for the spring.
  //
  // Both directions are wrong and both are worth knowing: the booking may
  // be for the wrong date, or it may be on the wrong day. The app cannot
  // tell which, so it reports the disagreement rather than picking a
  // culprit.
  //
  // COMMITTED ITEMS ONLY - Selected or beyond. A Research option's dates
  // are provisional by definition, and flagging those would be the crying
  // wolf this screen exists to avoid.
  DATE_FIELDS: [
    {
      key: "accommodation",
      module: "Accommodation",
      label: "Check-in",
      date: (it) => it.dates && it.dates.checkIn,
      day: (it) => (Array.isArray(it.dayRange) ? it.dayRange[0] : it.day),
    },
    {
      key: "accommodation",
      module: "Accommodation",
      label: "Check-out",
      date: (it) => it.dates && it.dates.checkOut,
      day: (it) => (Array.isArray(it.dayRange) ? it.dayRange[1] : null),
    },
    {
      key: "transport",
      module: "Transport",
      label: "Departure",
      // Transport has no name field - it is a mode and a route. "Transport:
      // departure is..." tells you nothing about WHICH leg.
      name: (it) => [it.mode, [it.from, it.to].filter(Boolean).join(" to ")].filter(Boolean).join(" "),
      date: (it) => it.schedule && it.schedule.date,
      day: (it) => (Array.isArray(it.dayRange) ? it.dayRange[0] : it.day),
    },
    {
      key: "activities",
      module: "Activities",
      label: "Date",
      date: (it) => it.schedule && it.schedule.date,
      day: (it) => (Array.isArray(it.dayRange) ? it.dayRange[0] : it.day),
    },
    {
      key: "restaurants",
      module: "Restaurants",
      label: "Reservation",
      date: (it) => it.reservation && it.reservation.date,
      day: (it) => (Array.isArray(it.dayRange) ? it.dayRange[0] : it.day),
    },
  ],

  // Past pure research - Shortlisted or beyond.
  //
  // Shortlisted is exactly when a wrong date starts costing money: it is
  // the moment you stop comparing and start booking, clicking the link on
  // the one you liked. Waiting for Selected flags the error AFTER the
  // money has gone.
  //
  // Research stays silent, because those dates really are provisional -
  // you enter five hotels in a sitting and tidy the dates later.
  pastResearch(item) {
    if (!item) {
      return false;
    }

    return (
      Boolean(item.selected) ||
      item.status === "Shortlisted" ||
      item.status === "Selected" ||
      this.isBooked(item)
    );
  },

  // Where a booking's own dates disagree with the days it sits on.
  //
  // Lives here rather than inside the check, because the SAME fact has to
  // reach three places: a border on the card you book from, a flag on the
  // day, and the full explanation on this screen. One source, three
  // surfaces - if the rule changes, it changes once.
  //
  // Returns [] for anything still in Research, and for a booking or a day
  // with no date: silent unless BOTH are known.
  dateIssuesFor(item, collectionKey) {
    if (!this.pastResearch(item)) {
      return [];
    }

    if (collectionKey === "flights") {
      return this.flightDateIssues(item);
    }

    const out = [];

    this.DATE_FIELDS.filter((f) => f.key === collectionKey).forEach((field) => {
      const booked = String(field.date(item) || "").trim();

      const dayNumber = field.day(item);

      const expected = this.dayDate(dayNumber);

      if (!booked || !expected || booked === expected) {
        return;
      }

      out.push({ label: field.label, booked: booked, expected: expected, day: dayNumber });
    });

    return out;
  },

  flightDateIssues(item) {
    if (typeof Flights === "undefined" || !this.pastResearch(item)) {
      return [];
    }

    const span = Flights.daySpan(item);

    // Each end against ITS OWN day. Since v1.28.0 a flight can land on a
    // later day than it left, and comparing the arrival against the
    // departure day would flag every long-haul flight ever entered.
    return [
      { label: "Departure", booked: Flights.overallDeparture(item).date, day: span.from },
      { label: "Arrival", booked: Flights.overallArrival(item).date, day: span.to },
    ]
      .map((pair) => Object.assign({}, pair, { booked: String(pair.booked || "").trim(), expected: this.dayDate(pair.day) }))
      .filter((pair) => pair.booked && pair.expected && pair.booked !== pair.expected);
  },

  // Does anything ON this day disagree about its dates? For the day card,
  // which wants a yes or no rather than the detail.
  dayHasDateIssue(dayNumber) {
    const collections = ["accommodation", "transport", "activities", "restaurants", "flights"];

    return collections.some((key) =>
      this.items(key).some((item) => {
        const issues = this.dateIssuesFor(item, key);

        return issues.some((issue) => issue.day === dayNumber);
      }),
    );
  },

  dayDate(dayNumber) {
    if (typeof dayNumber !== "number") {
      return "";
    }

    const day = this.days().filter((d) => d.day === dayNumber)[0];

    return (day && day.date) || "";
  },

  checkDatesMatchDays(findings) {
    const seen = {};

    // Driven by the shared helper, so the screen and the cards can never
    // disagree about what counts as a mismatch.
    this.DATE_FIELDS.forEach((field) => {
      this.items(field.key).forEach((item) => {
        const issue = this.dateIssuesFor(item, field.key)
          .filter((i) => i.label === field.label)[0];

        if (!issue) {
          return;
        }

        const booked = issue.booked;

        const dayNumber = issue.day;

        const expected = issue.expected;

        const name = (field.name ? field.name(item) : item.name) || item.name || field.module;

        const id = field.key + "|" + item.id + "|" + field.label;

        if (seen[id]) {
          return;
        }

        seen[id] = true;

        findings.push({
          level: "blocking",
          title: `${name}: ${field.label.toLowerCase()} is ${Format.date(booked)}, but Day ${dayNumber} is ${Format.date(expected)}`,
          detail: `The booking and the day it sits on disagree. Either the booking is for the wrong date, or it is on the wrong day - and the app cannot tell which, so it is worth opening both.`,
          action: `${field.module}.edit('${this.jsArg(item.id)}')`,
          actionLabel: `Open ${field.module.toLowerCase()}`,
        });
      });
    });

    this.checkFlightDates(findings);
  },

  // Flights are their own shape: legs rather than a schedule, and since
  // v1.28.0 an arrival that may land on a LATER day than it departed.
  // Comparing the arrival against the departure day would flag every
  // long-haul flight ever entered.
  checkFlightDates(findings) {
    if (typeof Flights === "undefined") {
      return;
    }

    this.items("flights").forEach((item) => {
      this.flightDateIssues(item).forEach((pair) => {
        const booked = pair.booked;

        const expected = pair.expected;

        findings.push({
          level: "blocking",
          title: `${Flights.routeSummary(item) || "Flight"}: ${pair.label.toLowerCase()} is ${Format.date(booked)}, but Day ${pair.day} is ${Format.date(expected)}`,
          detail: "The flight and the day it sits on disagree. Either the flight is for the wrong date, or it is on the wrong day - and the app cannot tell which.",
          action: "Flights.edit('" + this.jsArg(item.id) + "')",
          actionLabel: "Open flight",
        });
      });
    });
  },

  // A flight that falls outside the trip's own days.
  //
  // Mick's call: the trip ends when the SHARED itinerary ends, so two
  // days flying home are not trip days - but the flight is real and the
  // app should not silently drop it. So it is recorded and flagged rather
  // than either ignored or allowed to stretch the trip.
  //
  // Only speaks about a flight somebody is ASSIGNED to. An unassigned
  // flight outside the days is far more likely to be a typo in a date
  // than a person's journey home, and Flights already flags a missing
  // arrival date on its own.
  checkTravelOutsideTrip(findings) {
    const people = this.participantList();

    const days = this.days();

    if (people.length === 0 || days.length === 0 || typeof Flights === "undefined") {
      return;
    }

    const firstDate = days[0].date;

    const lastDate = days[days.length - 1].date;

    if (!firstDate || !lastDate) {
      return;
    }

    this.items("flights").forEach((item) => {
      const names = this.assignedNames(item);

      if (names.length === 0) {
        return;
      }

      const arrival = Flights.overallArrival(item);

      const departure = Flights.overallDeparture(item);

      const after = arrival.date && arrival.date > lastDate;

      const before = departure.date && departure.date < firstDate;

      if (!after && !before) {
        return;
      }

      const route = Flights.routeSummary(item) || "A flight";

      findings.push({
        level: "tidy",
        title: after
          ? `${this.nameList(names)} land${names.length === 1 ? "s" : ""} on ${Format.date(arrival.date)}, after the trip ends`
          : `${this.nameList(names)} depart${names.length === 1 ? "s" : ""} on ${Format.date(departure.date)}, before the trip starts`,
        detail: `${route}. The trip runs ${Format.date(firstDate)} to ${Format.date(lastDate)}, and this sits outside it - which is exactly right for a journey home or out, and worth a second look if it was meant to be a trip day.`,
        action: `Flights.edit('${this.jsArg(item.id)}')`,
        actionLabel: "Open flight",
      });
    });
  },

  // Age prompts.
  //
  // These NEVER calculate. The app cannot know one airline's child fare or
  // one comune's exemption, so it says what to check and you enter the
  // real number - which is the same rule the bands were built under.
  //
  // Grouped one finding per prompt rather than one per person: four people
  // times four prompts would bury the checks that matter.
  //
  // And each stays silent unless the trip HAS the thing the age affects.
  // Telling somebody about a young-driver surcharge on a trip with no car
  // is exactly the crying wolf this screen exists to avoid.
  checkAgePrompts(findings) {
    const people = this.participantList();

    if (people.length === 0 || typeof Participants === "undefined") {
      return;
    }

    const banded = people
      .map((p) => ({ person: p, band: Participants.bandFor(p) }))
      .filter((x) => x.band);

    if (banded.length === 0) {
      return;
    }

    const inBand = (keys) =>
      banded.filter((x) => keys.indexOf(x.band.key) > -1).map((x) => x.person.name);

    const hasCar = this.items("transport").some(
      (t) => ["Drive", "Car Rental"].indexOf(t.mode) > -1,
    );

    const hasFlights = this.items("flights").length > 0;

    const hasCityTax = this.items("accommodation").some(
      (s) => s.cityTax && Number(s.cityTax.perPersonPerNight) > 0,
    );

    const young = inBand(["young-adult"]);

    if (young.length > 0 && hasCar) {
      findings.push({
        level: "tidy",
        title: `${this.nameList(young)} may cost more to put on a hire car`,
        detail: "The young-driver surcharge applies under 25, and plenty of suppliers will not rent at all under 21 - or not a larger vehicle until 23 to 25. Worth checking before the booking rather than at the desk.",
        action: "Router.navigate('transport')",
        actionLabel: "Open transport",
      });
    }

    const senior = inBand(["senior"]);

    if (senior.length > 0 && hasCar) {
      findings.push({
        level: "tidy",
        title: `Check the hire company's upper age limit for ${this.nameList(senior)}`,
        detail: "Some suppliers cap the age they will rent to, and it varies by country and by company rather than following one rule. Italy usually has none; Ireland and Greece are the strict ones.",
        action: "Router.navigate('transport')",
        actionLabel: "Open transport",
      });
    }

    const children = inBand(["infant", "child"]);

    if (children.length > 0 && hasFlights) {
      findings.push({
        level: "tidy",
        title: `Child fares may apply for ${this.nameList(children)}`,
        detail: "Under 2 usually travels as a lap infant at about a tenth of the adult fare, and 2 to 11 at roughly three quarters. Full adult fare from 12. The app does not adjust any price - enter what the airline actually quotes.",
        action: "Router.navigate('flights')",
        actionLabel: "Open flights",
      });
    }

    if (children.length > 0 && hasCityTax) {
      findings.push({
        level: "tidy",
        title: `${this.nameList(children)} may be exempt from city tax`,
        detail: "Italian city tax exemptions are set per comune, not nationally - commonly somewhere between under 6 and under 12, and different in each city you are staying in. Check each one and adjust the guest count on that booking if it applies.",
        action: "Router.navigate('accommodation')",
        actionLabel: "Open accommodation",
      });
    }
  },

  findings() {
    const findings = [];

    // Each check is independent and defensive: one collection missing on a
    // part-built trip must not take the whole page down with it.
    const checks = [
      this.checkAccommodation,
      this.checkTravelBetweenStops,
      this.checkUnbooked,
      this.checkMissingPrices,
      this.checkDoubleBooked,
      // Phase 4 - the party checks. Each one stays silent unless the trip
      // has told it enough to be sure; see their own comments.
      this.checkRoomCapacity,
      this.checkUnaccommodatedPeople,
      this.checkVehicleSeats,
      this.checkJoinerTravel,
      this.checkDatesMatchDays,
      this.checkTravelOutsideTrip,
      this.checkAgePrompts,
      this.checkUntitledDays,
    ];

    checks.forEach((check) => {
      try {
        check.call(this, findings);
      } catch (error) {
        console.error("A readiness check failed:", error);
      }
    });

    // A guest share sees the plan but never the money - Budget and
    // Currency are hidden from their nav for exactly this reason, and a
    // new screen mustn't quietly become the way round that.
    const visible =
      typeof Project !== "undefined" && Project.currentPermission === "guest"
        ? findings.filter((f) => f.level !== "money")
        : findings;

    return visible.sort((a, b) => this.LEVELS[b.level].rank - this.LEVELS[a.level].rank);
  },

  daysUntilDeparture() {
    const project = (Project.get("project") || {}).project || {};

    if (!project.departureDate) {
      return null;
    }

    const today = typeof Phase !== "undefined" ? Phase.todayISO() : new Date().toISOString().slice(0, 10);

    const ms = Date.parse(project.departureDate) - Date.parse(today);

    if (Number.isNaN(ms)) {
      return null;
    }

    return Math.round(ms / 86400000);
  },

  // ------------------------------------------------------------ rendering

  render() {
    const findings = this.findings();

    const daysOut = this.daysUntilDeparture();

    return `

<div class="manager">

    <section class="hero">

        <h1>Trip Readiness</h1>

        <h2>${this.countdownLine(daysOut)}</h2>

        <p>${this.headline(findings)}</p>

    </section>

    <div class="planner-buttons">

        <button type="button" onclick="Router.navigate('dashboard')">← Dashboard</button>

    </div>

    ${findings.length === 0 ? this.renderAllClear() : this.renderGroups(findings)}

</div>

`;
  },

  countdownLine(daysOut) {
    if (daysOut === null) {
      return "No departure date set";
    }

    if (daysOut > 1) {
      return `${daysOut} days until departure`;
    }

    if (daysOut === 1) {
      return "Departing tomorrow";
    }

    if (daysOut === 0) {
      return "Departing today";
    }

    return "Trip underway";
  },

  headline(findings) {
    if (findings.length === 0) {
      return "Nothing outstanding.";
    }

    const blocking = findings.filter((f) => f.level === "blocking").length;

    if (blocking === 0) {
      return `${findings.length} loose ${findings.length === 1 ? "end" : "ends"} - nothing blocking.`;
    }

    return `${blocking} ${blocking === 1 ? "thing needs" : "things need"} sorting.`;
  },

  renderAllClear() {
    return `

<div class="manager-card">

    <div class="empty-state">

        <span class="empty-icon" aria-hidden="true">✓</span>

        <p>Every night has a bed, every move has a booking, and everything chosen has a price.</p>

        <button type="button" class="btn-primary" onclick="Router.navigate('planner')">Back to the plan</button>

    </div>

</div>

`;
  },

  renderGroups(findings) {
    // Fixed order regardless of what's present, so the page doesn't
    // reshuffle itself between visits.
    return ["blocking", "money", "tidy"]
      .map((level) => {
        const group = findings.filter((f) => f.level === level);

        if (group.length === 0) {
          return "";
        }

        return `

<div class="manager-card">

    <h2>${this.LEVELS[level].label}</h2>

    <p class="form-hint">${this.LEVELS[level].hint}</p>

    <div class="research-list">

        ${group.map((f) => this.renderFinding(f)).join("")}

    </div>

</div>

`;
      })
      .join("");
  },

  // Escaping happens HERE, at the single point every finding passes
  // through, rather than in each check. Findings carry trip names, day
  // titles and locations - all user text - and a check that forgot to
  // escape would be an XSS hole that only shows up on someone else's
  // shared trip. One place to get right, impossible to forget.
  renderFinding(finding) {
    return `

<div class="research-item readiness-item readiness-item--${finding.level}">

    <strong>${this.esc(finding.title)}</strong>

    <p>${this.esc(finding.detail)}</p>

    <div class="research-actions">

        <button type="button" onclick="${finding.action}">${finding.actionLabel}</button>

    </div>

</div>

`;
  },

  // Delegates to the shared formatter - see app/format.js. Kept as a
  // local method so every existing this.pretty(...) call still works.
  pretty(value) {
    return Format.place(value);
  },

  // These two are the only actions in this file that put an item id into
  // an onclick string - every other one is a fixed nav name or a day
  // number. Ids are server-generated (ACC-0001), so a quote cannot
  // actually get in there today; this is the house helper the other
  // modules use, applied for the same reason they apply it.
  jsArg(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, "&quot;");
  },

  esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
