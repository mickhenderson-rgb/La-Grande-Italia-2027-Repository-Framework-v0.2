/*
=========================================================

COMPASS-TOS

Day Workspace

Version 4.0.0

Two shapes, chosen by whether the day is today (per
Phase.todayISO()): "Right now" / "Later today" / capture
tiles for today, or the category panels (only for
categories that actually have something booked, plus a
dashed "add" prompt for the ones that don't) for any other
day.

Bug fixed along the way: every panel's item count used to
read `day.items`, an array that's never actually written
anywhere in the app (confirmed via a full grep - it's
vestigial from an earlier schema) - so every count except
Flights (which already read live) silently showed "No
items" regardless of what was actually booked. liveItemsFor()
below is now the single source of truth, matching each
collection's real day-matching rule (Planner.matchByDayRange
for the three destination-based collections, Transport's own
matchesDay for its day-range-or-single-day items, plain
item.day equality for the two day-keyed collections).

=========================================================
*/

const Day = {
  current: null,

  open(dayNumber) {
    const journey = Project.get("journey");

    if (!journey || !Array.isArray(journey.days)) {
      return;
    }

    const day = journey.days.find((d) => d.day === dayNumber);

    if (!day) {
      return;
    }

    this.current = day;

    Render.show(Layout.render(this.render(day)));
  },

  render(day) {
    return day.date && day.date === Phase.todayISO() ? this.renderToday(day) : this.renderOtherDay(day);
  },

  // --- Data: the single source of truth for "what's on this day", per collection ---

  liveItemsFor(collectionKey, dayNumber) {
    const data = Project.get(collectionKey);

    const items = data && Array.isArray(data.items) ? data.items : [];

    if (collectionKey === "flights" || collectionKey === "expenses") {
      return items.filter((item) => item.day === dayNumber);
    }

    if (collectionKey === "transport") {
      return items.filter((item) => Transport.matchesDay(item, dayNumber));
    }

    // accommodation / activities / restaurants - destination-agnostic
    // day-range match, same rule the Planner's own day cards use.
    return Planner.matchByDayRange(data, dayNumber);
  },

  summary(day) {
    return {
      flight: this.formatCount(this.liveItemsFor("flights", day.day).length),
      transport: this.formatCount(this.liveItemsFor("transport", day.day).length),
      accommodation: this.formatCount(this.liveItemsFor("accommodation", day.day).length),
      activity: this.formatCount(this.liveItemsFor("activities", day.day).length),
      restaurant: this.formatCount(this.liveItemsFor("restaurants", day.day).length),
      expense: this.formatCount(this.liveItemsFor("expenses", day.day).length),
      note: this.journalSummary(day),
    };
  },

  // "1 item" / "3 items" - never "1 item(s)".
  formatCount(n) {
    if (!n) {
      return "No items";
    }

    return `${n} ${n === 1 ? "item" : "items"}`;
  },

  journalSummary(day) {
    if (typeof Journal === "undefined") {
      return "No entry yet";
    }

    const entry = Journal.getEntry(day.day);

    const hasNotes = entry.notes && entry.notes.trim().length > 0;

    const photoCount = entry.photos.length;

    const checklistCount = entry.checklist.length;

    if (!hasNotes && photoCount === 0 && checklistCount === 0) {
      return "No entry yet";
    }

    return `${photoCount} ${photoCount === 1 ? "photo" : "photos"}, ${checklistCount} checklist ${checklistCount === 1 ? "item" : "items"}`;
  },

  // Every item on this day that has an actual clock time, across the
  // collections where a time makes sense, sorted earliest-first.
  // Accommodation has no clock time (only a check-in/check-out DAY) so
  // it's surfaced separately via accommodationTransitions(), not here.
  timedItems(dayNumber) {
    const out = [];

    this.liveItemsFor("flights", dayNumber).forEach((item) => {
      const dep = Flights.overallDeparture(item);

      if (dep.time) {
        out.push({ time: dep.time, icon: "✈", label: Flights.routeSummary(item) || "Flight", action: `Flights.edit('${item.id}')` });
      }
    });

    this.liveItemsFor("transport", dayNumber).forEach((item) => {
      const time = item.schedule && item.schedule.departTime;

      if (time) {
        const route = [item.from, item.to].filter(Boolean).join(" → ");

        out.push({ time, icon: "🚗", label: route ? `${item.mode || "Transport"}: ${route}` : item.mode || "Transport", action: `Transport.edit('${item.id}')` });
      }
    });

    this.liveItemsFor("activities", dayNumber).forEach((item) => {
      const time = item.schedule && item.schedule.time;

      if (time) {
        out.push({ time, icon: "🎯", label: item.name || "Activity", action: `Activities.edit('${item.id}')` });
      }
    });

    this.liveItemsFor("restaurants", dayNumber).forEach((item) => {
      const time = item.reservation && item.reservation.time;

      if (time) {
        out.push({ time, icon: "🍝", label: item.name || "Restaurant", action: `Restaurants.edit('${item.id}')` });
      }
    });

    return out.sort((a, b) => a.time.localeCompare(b.time));
  },

  // Accommodation has no clock time - it's a whole-day fact, not an
  // event within the day - so check-in/check-out surfaces as its own
  // line rather than fighting for a slot in the timed list.
  accommodationTransitions(dayNumber) {
    return this.liveItemsFor("accommodation", dayNumber)
      .filter((item) => Array.isArray(item.dayRange))
      .map((item) => {
        if (item.dayRange[0] === dayNumber && item.dayRange[1] === dayNumber) {
          return { icon: "🔑", label: `Staying at ${this.esc(item.name) || "your accommodation"} tonight`, action: `Accommodation.edit('${item.id}')` };
        }

        if (item.dayRange[0] === dayNumber) {
          return { icon: "🔑", label: `Checking in: ${this.esc(item.name) || "your accommodation"}`, action: `Accommodation.edit('${item.id}')` };
        }

        if (item.dayRange[1] === dayNumber) {
          return { icon: "🧳", label: `Checking out: ${this.esc(item.name) || "your accommodation"}`, action: `Accommodation.edit('${item.id}')` };
        }

        return null;
      })
      .filter(Boolean);
  },

  // --- "Today" shape ---

  renderToday(day) {
    const now = new Date();

    const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const timed = this.timedItems(day.day);

    const upcomingIndex = timed.findIndex((item) => item.time >= nowHHMM);

    const rightNow = upcomingIndex === -1 ? null : timed[upcomingIndex];

    const later = upcomingIndex === -1 ? [] : timed.slice(upcomingIndex + 1);

    const transitions = this.accommodationTransitions(day.day);

    return `

<div class="day-workspace">

    ${this.renderHeader(day)}

    ${transitions.length > 0 ? `<div class="day-transitions">${transitions.map((t) => this.renderTransitionRow(t)).join("")}</div>` : ""}

    <div class="day-now-card">

        <div class="day-now-label">Right now</div>

        ${
          rightNow
            ? `<div class="day-now-time">${this.esc(rightNow.time)}</div>
               <div class="day-now-title">${rightNow.icon} ${this.esc(rightNow.label)}</div>
               <div class="planner-buttons"><button type="button" onclick="${rightNow.action}">Open</button></div>`
            : `<div class="day-now-title">Nothing scheduled right now.</div>`
        }

    </div>

    ${
      later.length > 0
        ? `<div class="day-later">
             <h3>Later today</h3>
             ${later.map((item) => this.renderLaterRow(item)).join("")}
           </div>`
        : ""
    }

    <div class="day-capture-tiles">

        <button type="button" class="day-capture-tile" onclick="Capture.open('spend')">
            <span class="day-capture-icon">💰</span>
            <span>Log spend</span>
        </button>

        <button type="button" class="day-capture-tile" onclick="Capture.open()">
            <span class="day-capture-icon">📷</span>
            <span>Capture</span>
        </button>

        <button type="button" class="day-capture-tile" onclick="Capture.open('note')">
            <span class="day-capture-icon">📝</span>
            <span>Note</span>
        </button>

    </div>

    ${this.renderFooterLinks()}

</div>

`;
  },

  renderTransitionRow(t) {
    return `

<div class="day-transition-row" onclick="${t.action}">
    <span>${t.icon}</span>
    <span>${this.esc(t.label)}</span>
</div>

`;
  },

  renderLaterRow(item) {
    return `

<div class="day-later-row" onclick="${item.action}">
    <span class="day-later-time">${this.esc(item.time)}</span>
    <span class="day-later-title">${item.icon} ${this.esc(item.label)}</span>
</div>

`;
  },

  // --- "Any other day" shape ---

  // Categories that get the has-items/dashed-prompt treatment. Flights,
  // Expenses and Journal stay as plain always-shown panels below - they
  // aren't "things you plan for this specific day" in the same sense.
  promptedPanels: [
    { key: "accommodation", icon: "🛏", title: "Accommodation", prompt: "+ Add a place to stay", action: "Accommodation.open(Day.current)" },
    { key: "activities", icon: "🎯", title: "Activities", prompt: "+ Add something to do", action: "Activities.open(Day.current)" },
    { key: "restaurants", icon: "🍝", title: "Restaurants", prompt: "+ Add somewhere to eat", action: "Restaurants.open(Day.current)" },
    { key: "transport", icon: "🚗", title: "Transport", prompt: "+ Add how you're getting around", action: "Transport.open(Day.current)" },
  ],

  renderOtherDay(day) {
    const summary = this.summary(day);

    const promptedHtml = this.promptedPanels
      .map((cfg) => {
        const count = this.liveItemsFor(cfg.key, day.day).length;

        return count > 0
          ? this.panel(cfg.icon, cfg.title, this.formatCount(count), cfg.action)
          : this.dashedPrompt(cfg.icon, cfg.prompt, cfg.action);
      })
      .join("");

    return `

<div class="day-workspace">

    ${this.renderHeader(day)}

    <div class="workspace-grid">

        ${this.panel("✈", "Flights", summary.flight, `Flights.open(Day.current)`)}

        ${promptedHtml}

        ${this.panel("💰", "Expenses", summary.expense, `Expenses.open(Day.current)`)}

        ${this.panel("📔", "Journal", summary.note, `Journal.openDay(Day.current.day)`)}

    </div>

    ${this.renderFooterLinks()}

</div>

`;
  },

  dashedPrompt(icon, text, action) {
    return `

<button type="button" class="day-dashed-prompt" onclick="${action}">
    <span>${icon}</span>
    <span>${text}</span>
</button>

`;
  },

  // --- Shared ---

  renderHeader(day) {
    return `

<section class="hero">

    <h1>
        Day ${day.day}
    </h1>

    <h2>
        ${this.esc(day.title)}
    </h2>

    ${day.location ? `<p>📍 ${this.pretty(day.location)}</p>` : `<p class="subtitle">No destination set yet</p>`}

    ${JourneyEditor.isTransit(day) ? `<p>🌙 In transit overnight</p>` : day.overnight ? `<p>🛏 Overnight ${this.pretty(day.overnight)}</p>` : ""}

    <div class="quick-links">

        <!-- Edit Day lives here as well as on the planner card, because the
             planner card's copy is the ONLY other one and mobile.css hides
             it - which left no way at all to fix a day's location or
             overnight from a phone. That matters: a day the map can't place
             is flagged NO LOCATION and the only fix is this form. -->
        <button type="button" onclick="Planner.showEditDayForm(${day.day})">Edit Day</button>

        <button type="button" onclick="Destination.open('${this.jsArg(day.location)}', Day.current)">Destination</button>

        <button type="button" onclick="Flights.open(Day.current)">Flights</button>

        <button type="button" onclick="Accommodation.open(Day.current)">Accommodation</button>

        <button type="button" onclick="Activities.open(Day.current)">Activities</button>

        <button type="button" onclick="Restaurants.open(Day.current)">Restaurants</button>

    </div>

</section>

`;
  },

  renderFooterLinks() {
    return `

<div class="planner-buttons">

    <button type="button" onclick="Router.navigate('planner')">← Planner</button>

    <button type="button" onclick="Router.navigate('dashboard')">Dashboard</button>

</div>

`;
  },

  panel(icon, title, text, action) {
    return `

<div class="workspace-panel">

    <h3>
        ${icon} ${title}
    </h3>

    <p>
        ${text}
    </p>

    <button
        type="button"
        onclick="${action}"
        aria-label="Manage ${title}">

        Manage

    </button>

</div>

`;
  },

  // Delegates to the shared formatter - see app/format.js. Kept as a
  // local method so every existing this.pretty(...) call still works.
  pretty(value) {
    return Format.place(value);
  },

  // For a value going inside a quoted JS string in an onclick attribute -
  // a different job from esc(), which is for HTML text.
  //
  // day.location is free text, so an apostrophe ("king's cross") ended the
  // string early and broke the button outright; a crafted one could run
  // whatever it liked. Backslash first, then the quote, then the HTML
  // escaping the attribute itself still needs.
  jsArg(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
