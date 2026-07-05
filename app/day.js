/*
=========================================================

COMPASS-TOS

Day Workspace

Version 2.0.0

=========================================================
*/

const Day = {
  current: null,

  open(dayNumber) {
    const journey = Project.get("journey");

    if (!journey || !journey.days) {
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
    return `

<div class="day-workspace">

    <section class="hero">

        <h1>

            Day ${day.day}

        </h1>

        <h2>

            ${day.title}

        </h2>

        <p>

            📍 ${day.location}

        </p>

        <p>

            🛏 Overnight

            ${day.overnight}

        </p>

    </section>

    <div class="workspace-grid">

        ${this.panel(day, "transport", "🚗", "Transport", "No transport selected")}

        ${this.panel(day, "accommodation", "🛏", "Accommodation", "No accommodation selected")}

        ${this.panel(day, "activity", "🎯", "Activities", "No activities planned")}

        ${this.panel(day, "restaurant", "🍝", "Restaurants", "No restaurants selected")}

        ${this.panel(day, "expense", "💰", "Expenses", "No expenses recorded")}

        ${this.panel(day, "note", "📝", "Notes", "No notes")}

    </div>

    <div class="planner-buttons">

        <button onclick="Router.navigate('dashboard')">

            ← Dashboard

        </button>

    </div>

</div>

`;
  },

  panel(day, type, icon, title, text) {
    return `

<div class="workspace-panel">

    <h3>

        ${icon}

        ${title}

    </h3>

    <p>

        ${text}

    </p>

    <button

        onclick="PlanningItem.open(Day.current,'${type}')">

        Manage

    </button>

</div>

`;
  },
};
