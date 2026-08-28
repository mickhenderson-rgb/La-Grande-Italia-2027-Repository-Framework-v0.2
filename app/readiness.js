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
          detail: `${day.title || this.pretty(day.overnight) || "Untitled day"} has no accommodation selected or booked.`,
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

  findings() {
    const findings = [];

    // Each check is independent and defensive: one collection missing on a
    // part-built trip must not take the whole page down with it.
    const checks = [
      this.checkAccommodation,
      this.checkTravelBetweenStops,
      this.checkUnbooked,
      this.checkMissingPrices,
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

  esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
