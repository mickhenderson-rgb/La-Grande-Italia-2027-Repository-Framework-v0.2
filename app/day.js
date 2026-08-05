/*
=========================================================

COMPASS-TOS

Day Workspace

Version 3.0.0

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
    const summary = this.summary(day);

    return `

<div class="day-workspace">

    <section class="hero">

        <h1>
            Day ${day.day}
        </h1>

        <h2>
            ${day.title || ""}
        </h2>

        <p>
            📍 ${this.pretty(day.location)}
        </p>

        <p>
            🛏 Overnight ${this.pretty(day.overnight)}
        </p>

        <div class="quick-links">

            <button
                type="button"
                onclick="Destination.open('${day.location}', Day.current)">

                Destination

            </button>

            <button
                type="button"
                onclick="Flights.open(Day.current)">

                Flights

            </button>

            <button
                type="button"
                onclick="Accommodation.open(Day.current)">

                Accommodation

            </button>

            <button
                type="button"
                onclick="Activities.open(Day.current)">

                Activities

            </button>

            <button
                type="button"
                onclick="Restaurants.open(Day.current)">

                Restaurants

            </button>

        </div>

    </section>

    <div class="workspace-grid">

        ${this.panel("✈", "Flights", summary.flight, `Flights.open(Day.current)`)}

        ${this.panel("🚗", "Transport", summary.transport, `Transport.open(Day.current)`)}

        ${this.panel("🛏", "Accommodation", summary.accommodation, `Accommodation.open(Day.current)`)}

        ${this.panel("🎯", "Activities", summary.activity, `Activities.open(Day.current)`)}

        ${this.panel("🍝", "Restaurants", summary.restaurant, `Restaurants.open(Day.current)`)}

        ${this.panel("💰", "Expenses", summary.expense, `Expenses.open(Day.current)`)}

        ${this.panel("📔", "Journal", summary.note, `Journal.openDay(Day.current.day)`)}

    </div>

    <div class="planner-buttons">

        <button
            type="button"
            onclick="Router.navigate('planner')">

            ← Planner

        </button>

        <button
            type="button"
            onclick="Router.navigate('dashboard')">

            Dashboard

        </button>

    </div>

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
        onclick="${action}">

        Manage

    </button>

</div>

`;
  },

  summary(day) {
    const items = Array.isArray(day.items) ? day.items : [];

    return {
      flight: this.liveCount("flights", day.day),
      transport: this.countType(items, "transport"),
      accommodation: this.countType(items, "accommodation"),
      activity: this.countType(items, "activity"),
      restaurant: this.countType(items, "restaurant"),
      expense: this.countType(items, "expense"),
      note: this.journalSummary(day),
    };
  },

  liveCount(collection, dayNumber) {
    const data = Project.get(collection);

    if (!data || !Array.isArray(data.items)) {
      return 0;
    }

    return data.items.filter((item) => item.day === dayNumber).length;
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

    return `${photoCount} photo(s), ${checklistCount} checklist item(s)`;
  },

  countType(items, type) {
    return items.filter(
      (item) => String(item.type || "").toLowerCase() === type,
    ).length
      ? `${items.filter((item) => String(item.type || "").toLowerCase() === type).length} item(s)`
      : "No items";
  },

  pretty(value) {
    return String(value || "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  },
};
