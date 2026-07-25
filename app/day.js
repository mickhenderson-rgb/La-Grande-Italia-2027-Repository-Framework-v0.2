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
                onclick="Accommodation.open(Day.current)">

                Accommodation

            </button>

            <button
                type="button"
                onclick="PlanningItem.open(Day.current,'activity')">

                Activities

            </button>

            <button
                type="button"
                onclick="PlanningItem.open(Day.current,'restaurant')">

                Restaurants

            </button>

        </div>

    </section>

    <div class="workspace-grid">

        ${this.panel("🚗", "Transport", summary.transport, `PlanningItem.open(Day.current,'transport')`)}

        ${this.panel("🛏", "Accommodation", summary.accommodation, `Accommodation.open(Day.current)`)}

        ${this.panel("🎯", "Activities", summary.activity, `PlanningItem.open(Day.current,'activity')`)}

        ${this.panel("🍝", "Restaurants", summary.restaurant, `PlanningItem.open(Day.current,'restaurant')`)}

        ${this.panel("💰", "Expenses", summary.expense, `PlanningItem.open(Day.current,'expense')`)}

        ${this.panel("📝", "Notes", summary.note, `PlanningItem.open(Day.current,'note')`)}

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
      transport: this.countType(items, "transport"),
      accommodation: this.countType(items, "accommodation"),
      activity: this.countType(items, "activity"),
      restaurant: this.countType(items, "restaurant"),
      expense: this.countType(items, "expense"),
      note: this.countType(items, "note"),
    };
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
