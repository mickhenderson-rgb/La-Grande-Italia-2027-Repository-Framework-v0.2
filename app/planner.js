/*
=========================================================

COMPASS-TOS

Journey Planner

Version 3.0.0

=========================================================
*/

const Planner = {
  render() {
    const journey = Project.get("journey");

    if (!journey || !Array.isArray(journey.days) || journey.days.length === 0) {
      return `

<div class="planner">

    <h2>Journey Planner</h2>

    <p>No journey loaded.</p>

</div>

`;
    }

    const stats = this.stats(journey.days);

    let html = `

<div class="planner">

    <section class="hero">

        <h1>
            Journey Planner
        </h1>

        <h2>
            ${journey.days.length} Day${journey.days.length === 1 ? "" : "s"}
        </h2>

        <p>
            ${stats.totalItems} planning items across the trip.
        </p>

    </section>

    <div class="status-grid">

        ${this.statBox(journey.days.length, "Days")}
        ${this.statBox(stats.totalItems, "Items")}
        ${this.statBox(stats.openItems, "Open")}
        ${this.statBox(stats.lockedItems, "Locked")}

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Planner.showAddDayForm(null)">

            + Add Day to End

        </button>

    </div>

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
    const summary = this.daySummary(day);

    let items = "";

    if (Array.isArray(day.items) && day.items.length > 0) {
      day.items.forEach((item) => {
        items += `

<div class="planner-item">

    <div class="planner-item-title">

        ${this.icon(item.type)}
        ${item.title}

    </div>

    <div class="planner-item-status">

        ${item.status || "open"}

    </div>

</div>

`;
      });
    } else {
      items = `

<div class="planner-item">

    <div class="planner-item-title">
        📌 No items yet
    </div>

    <div class="planner-item-status">
        Open
    </div>

</div>

`;
    }

    return `

<div class="planner-day">

    <div class="planner-day-header">

        <div>
            <strong>DAY ${day.day}</strong>
        </div>

        <div>
            ${day.date || ""}
        </div>

    </div>

    <h3>
        ${day.title || ""}
    </h3>

    <p>
        📍 ${this.pretty(day.location)}
    </p>

    <p>
        🛏 Overnight: ${this.pretty(day.overnight)}
    </p>

    <div class="status-grid">

        ${this.statBox(summary.total, "Items")}
        ${this.statBox(summary.open, "Open")}
        ${this.statBox(summary.booked, "Booked")}
        ${this.statBox(summary.locked, "Locked")}

    </div>

    <div class="planner-items">

        ${items}

    </div>

    <div class="planner-buttons">

       <button
            type="button"
            onclick="Day.open(${day.day})">

            Open Day

        </button>

       <button
            type="button"
            onclick="Destination.open('${day.location}', {day: ${day.day}})">

            View Destination

        </button>

       <button
            type="button"
            onclick="Planner.showAddDayForm(${day.day})">

            + Insert Day After

        </button>

       <button
            type="button"
            onclick="Planner.confirmDeleteDay(${day.day})">

            Delete Day

        </button>

    </div>

</div>

`;
  },

  stats(days) {
    let totalItems = 0;
    let openItems = 0;
    let lockedItems = 0;

    days.forEach((day) => {
      const items = Array.isArray(day.items) ? day.items : [];
      items.forEach((item) => {
        totalItems += 1;
        const status = String(item.status || "open").toLowerCase();
        if (status === "locked") {
          lockedItems += 1;
        } else {
          openItems += 1;
        }
      });
    });

    return {
      totalItems,
      openItems,
      lockedItems,
    };
  },

  daySummary(day) {
    const items = Array.isArray(day.items) ? day.items : [];
    let total = items.length;
    let open = 0;
    let booked = 0;
    let locked = 0;

    items.forEach((item) => {
      const status = String(item.status || "open").toLowerCase();

      if (status === "booked") {
        booked += 1;
      } else if (status === "locked") {
        locked += 1;
      } else {
        open += 1;
      }
    });

    return {
      total,
      open,
      booked,
      locked,
    };
  },

  statBox(value, label) {
    return `

<div class="status-box">

    <strong>
        ${value}
    </strong>

    <span class="tiny">
        ${label}
    </span>

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

  pretty(value) {
    return String(value || "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  },

  showAddDayForm(afterDayNumber) {
    Render.show(Layout.render(this.renderAddDayForm(afterDayNumber)));
  },

  renderAddDayForm(afterDayNumber) {
    const isAppend = afterDayNumber === null;

    return `

<div class="manager">

    <section class="hero">

        <h1>

            ${isAppend ? "Add Day to End" : `Insert Day After Day ${afterDayNumber}`}

        </h1>

        <p>

            ${isAppend ? "This will be added as the last day of the trip." : "Every day after this one will be renumbered, and any transport, expenses, journal or booking entries tied to those days will move with them."}

        </p>

    </section>

    <div class="manager-card form-card">

        <div class="form-grid">

            <label class="form-field">
                Title
                <input type="text" id="pln-new-title" placeholder="e.g. Explore Destination B">
            </label>

            <label class="form-field">
                Location
                <input type="text" id="pln-new-location" placeholder="e.g. destination-b">
            </label>

            <label class="form-field">
                Overnight
                <input type="text" id="pln-new-overnight" placeholder="Defaults to Location if left blank">
            </label>

        </div>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Planner.saveNewDay(${afterDayNumber === null ? "null" : afterDayNumber})">

            Save Day

        </button>

        <button type="button" onclick="Router.navigate('planner')">

            Cancel

        </button>

    </div>

</div>

`;
  },

  saveNewDay(afterDayNumber) {
    const title = document.getElementById("pln-new-title").value.trim();

    const location = document
      .getElementById("pln-new-location")
      .value.trim()
      .toLowerCase();

    const overnight = document
      .getElementById("pln-new-overnight")
      .value.trim()
      .toLowerCase();

    if (!title || !location) {
      alert("Please enter at least a title and location before saving.");
      return;
    }

    JourneyEditor.insertDay(afterDayNumber, { title, location, overnight });

    Router.navigate("planner");
  },

  confirmDeleteDay(dayNumber) {
    const linked = JourneyEditor.countLinkedItems(dayNumber);

    const message =
      linked > 0
        ? `Day ${dayNumber} has ${linked} linked item(s) (transport, expenses or journal entries). Deleting this day will delete those too, and every later day will be renumbered. Continue?`
        : `Delete Day ${dayNumber}? Every later day will be renumbered.`;

    const answer = confirm(message);

    if (!answer) {
      return;
    }

    JourneyEditor.deleteDay(dayNumber);

    Router.navigate("planner");
  },
};
