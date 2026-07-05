/*
=========================================================

COMPASS-TOS

Day View

Version 1.0.0

=========================================================
*/

const DayView = {
  currentDay: null,

  open(dayNumber) {
    const journey = Project.get("journey");

    if (!journey || !journey.days) {
      return;
    }

    const day = journey.days.find((d) => d.day === dayNumber);

    if (!day) {
      return;
    }

    this.currentDay = day;

    Render.show(Layout.render(this.render(day)));
  },

  render(day) {
    let items = "";

    if (day.items) {
      day.items.forEach((item) => {
        items += `

<div class="day-item">

    <div>

        <strong>

            ${this.icon(item.type)}

            ${item.title}

        </strong>

    </div>

    <div>

        Status

        <strong>

            ${item.status}

        </strong>

    </div>

</div>

`;
      });
    }

    return `

<div class="day-view">

    <div class="hero">

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

    </div>

    <section class="planning">

        <h2>

            Planning Items

        </h2>

        ${items}

    </section>

    <div class="planner-buttons">

        <button onclick="Router.navigate('dashboard')">

            ← Dashboard

        </button>

    </div>

</div>

`;
  },

  icon(type) {
    switch (type) {
      case "flight":
        return "✈";

      case "accommodation":
        return "🛏";

      case "activity":
        return "🎯";

      case "restaurant":
        return "🍝";

      case "transport":
        return "🚗";

      default:
        return "📌";
    }
  },
};
