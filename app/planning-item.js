/*
=========================================================

COMPASS-TOS

Planning Item Manager

Version 1.0.0

=========================================================
*/

const PlanningItem = {
  open(day, type) {
    Render.show(Layout.render(this.render(day, type)));
  },

  render(day, type) {
    return `

<div class="manager">

    <section class="hero">

        <h1>${this.title(type)}</h1>

        <h2>Day ${day.day}</h2>

        <p>${day.title}</p>

    </section>

    <div class="manager-grid">

        <div class="manager-card">

            <h2>Current Selection</h2>

            <p>Nothing Selected</p>

            <button>Add</button>

        </div>

        <div class="manager-card">

            <h2>Shortlist</h2>

            <ul>

                <li>No Items</li>

            </ul>

            <button>Shortlist</button>

        </div>

        <div class="manager-card">

            <h2>Status</h2>

            <table>

                <tr>

                    <td>Status</td>

                    <td>Research</td>

                </tr>

                <tr>

                    <td>Locked</td>

                    <td>No</td>

                </tr>

                <tr>

                    <td>Completed</td>

                    <td>No</td>

                </tr>

            </table>

        </div>

        <div class="manager-card">

            <h2>Notes</h2>

            <textarea
                rows="8"
                placeholder="Notes..."></textarea>

        </div>

    </div>

    <div class="planner-buttons">

        <button onclick="Day.open(${day.day})">

            ← Return to Day

        </button>

    </div>

</div>

`;
  },

  title(type) {
    switch (type) {
      case "transport":
        return "Transport";

      case "accommodation":
        return "Accommodation";

      case "activity":
        return "Activities";

      case "restaurant":
        return "Restaurants";

      case "expense":
        return "Expenses";

      case "note":
        return "Notes";

      default:
        return "Planning";
    }
  },
};
