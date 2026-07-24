/*
=========================================================

COMPASS-TOS

Planning Item Manager

Version 2.0.0

=========================================================
*/

const PlanningItem = {
  currentContext: null,
  currentType: null,

  open(context, type) {
    this.currentContext = context || {};
    this.currentType = type || "planning";
    Render.show(
      Layout.render(this.render(this.currentContext, this.currentType)),
    );
  },

  render(context, type) {
    return `

<div class="manager">

    <section class="hero">

        <h1>

            ${this.typeLabel(type)}

        </h1>

        <h2>

            ${this.contextTitle(context)}

        </h2>

        <p>

            ${this.contextNote(context)}

        </p>

    </section>

    <div class="manager-grid">

        <div class="manager-card">

            <h2>Current Selection</h2>

            <p>Nothing Selected</p>

            <button type="button">Choose</button>

        </div>

        <div class="manager-card">

            <h2>Research List</h2>

            <ul>

                <li>No items yet</li>

            </ul>

            <button type="button">Add</button>

        </div>

        <div class="manager-card">

            <h2>Status</h2>

            <table>

                <tr>
                    <td>Research</td>
                    <td>Open</td>
                </tr>

                <tr>
                    <td>Shortlisted</td>
                    <td>0</td>
                </tr>

                <tr>
                    <td>Booked</td>
                    <td>0</td>
                </tr>

                <tr>
                    <td>Locked</td>
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

        <button type="button" onclick="${this.backAction(context)}">

            ← Return

        </button>

    </div>

</div>

`;
  },

  backAction(context) {
    if (context && typeof context.day === "number") {
      return `Day.open(${context.day})`;
    }

    if (context && context.kind === "destination" && context.locationId) {
      return `Destination.open('${context.locationId}', Destination.returnDay)`;
    }

    if (context && context.locationId) {
      return `Destination.open('${context.locationId}')`;
    }

    return `Router.navigate('planner')`;
  },

  contextTitle(context) {
    if (context && typeof context.day === "number") {
      return `Day ${context.day}`;
    }

    return (
      context?.label ||
      context?.title ||
      context?.name ||
      this.typeLabel(this.currentType)
    );
  },

  contextNote(context) {
    if (context && typeof context.day === "number") {
      return context.title || "";
    }

    if (context && context.locationId) {
      return `Destination Workspace · ${this.pretty(context.locationId)}`;
    }

    return "Planning Workspace";
  },

  typeLabel(type) {
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

  pretty(value) {
    return String(value || "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  },
};
