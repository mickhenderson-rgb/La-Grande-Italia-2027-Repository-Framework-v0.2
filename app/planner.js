/*
=========================================================

COMPASS-TOS

Journey Planner

Version 2.0.0

=========================================================
*/

const Planner = {
  render() {
    const journey = Project.get("journey");

    if (!journey || !journey.days) {
      return `

<div class="planner">

    <h2>Journey Planner</h2>

    <p>No journey loaded.</p>

</div>

`;
    }

    let html = `

<div class="planner">

    <h2>Journey Timeline</h2>

`;

    journey.days.forEach((day) => {
      html += this.renderDay(day);
    });

    html += `

</div>

`;

    return html;
  },

  renderDay(day) {
    let items = "";

    if (day.items) {
      day.items.forEach((item) => {
        items += `

<div class="planner-item">

    <div class="planner-item-title">

        ${this.icon(item.type)}
        ${item.title}

    </div>

    <div class="planner-item-status">

        ${item.status}

    </div>

</div>

`;
      });
    }

    return `

<div class="planner-day">

    <div class="planner-day-header">

        <div>

            <strong>

                DAY ${day.day}

            </strong>

        </div>

        <div>

            ${day.date}

        </div>

    </div>

    <h3>

        ${day.title}

    </h3>

    <p>

        📍 ${day.location}

    </p>

    <p>

        🛏 Overnight:

        ${day.overnight}

    </p>

    ${items}

    <div class="planner-buttons">

       <button
    onclick="DayView.open(${day.day})">

    Open Day

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
