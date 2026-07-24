/*
=========================================================

COMPASS-TOS

Destination Workspace

Version 1.0.0

=========================================================
*/

const Destination = {
  current: null,
  returnDay: null,

  open(locationId, originDay = null) {
    this.current = locationId;
    this.returnDay = originDay || null;

    Render.show(Layout.render(this.render(locationId)));
  },

  render(locationId) {
    const title = this.pretty(locationId);
    const summary = this.summary(locationId);

    return `

<div class="destination-workspace">

    <section class="hero">

        <h1>

            ${title}

        </h1>

        <h2>

            Destination Workspace

        </h2>

        <p>

            Research accommodation, activities, restaurants and transport for ${title}.

        </p>

    </section>

    <div class="status-grid destination-summary">

        ${this.stat(summary.accommodation, "Accommodation options")}

        ${this.stat(summary.activities, "Activities")}

        ${this.stat(summary.restaurants, "Restaurants")}

        ${this.stat(summary.transport, "Transport items")}

    </div>

    <div class="destination-grid">

        ${this.card(title, "🛏", "accommodation", summary.accommodation, "Research and shortlist places to stay.")}

        ${this.card(title, "🎯", "activity", summary.activities, "Research tours, sights and bookings.")}

        ${this.card(title, "🍝", "restaurant", summary.restaurants, "Save places worth trying.")}

        ${this.card(title, "🚗", "transport", summary.transport, "Compare travel options and connections.")}

        ${this.card(title, "📝", "note", 0, "Capture ideas and reminders.")}

        ${this.card(title, "📖", "journal", 0, "Record what actually happened on the trip.")}

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="${this.backAction()}">

            ← Back to Day

        </button>

    </div>

</div>

`;
  },

  card(destinationTitle, icon, type, count, text) {
    return `

<div class="destination-card">

    <div class="destination-icon">

        ${icon}

    </div>

    <h3>

        ${this.label(type)}

    </h3>

    <p>

        ${text}

    </p>

    <p>

        <span class="badge">

            ${count} item${count === 1 ? "" : "s"}

        </span>

    </p>

    <button
        type="button"
        onclick="PlanningItem.open(Destination.context('${type}'),'${type}')">

        Open

    </button>

</div>

`;
  },

  context(type) {
    return {
      kind: "destination",
      locationId: this.current,
      label: this.pretty(this.current),
      title: this.pretty(this.current),
      sectionType: type,
    };
  },

  backAction() {
    if (this.returnDay && typeof this.returnDay.day === "number") {
      return `Day.open(${this.returnDay.day})`;
    }

    return `Router.navigate('planner')`;
  },

  summary(locationId) {
    return {
      accommodation: this.countItems("accommodation", locationId),
      activities: this.countItems("activities", locationId),
      restaurants: this.countItems("restaurants", locationId),
      transport: this.countItems("transport", locationId),
    };
  },

  countItems(datasetName, locationId) {
    const data = Project.get(datasetName);

    if (!data) {
      return 0;
    }

    const needle = String(locationId || "").toLowerCase();

    if (Array.isArray(data.items)) {
      return data.items.filter((item) => this.matchesLocation(item, needle))
        .length;
    }

    if (Array.isArray(data)) {
      return data.filter((item) => this.matchesLocation(item, needle)).length;
    }

    if (data.locations && typeof data.locations === "object") {
      const locationData =
        data.locations[needle] || data.locations[locationId] || null;

      if (!locationData) {
        return 0;
      }

      if (Array.isArray(locationData.options)) {
        return locationData.options.length;
      }

      if (Array.isArray(locationData.items)) {
        return locationData.items.length;
      }

      return 0;
    }

    return 0;
  },

  matchesLocation(item, needle) {
    const value = String(
      item?.destination || item?.location || item?.locationId || "",
    ).toLowerCase();

    return value === needle;
  },

  stat(value, label) {
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

  label(type) {
    switch (type) {
      case "accommodation":
        return "Accommodation";

      case "activity":
        return "Activities";

      case "restaurant":
        return "Restaurants";

      case "transport":
        return "Transport";

      case "note":
        return "Notes";

      case "journal":
        return "Journal";

      default:
        return "Workspace";
    }
  },

  pretty(value) {
    return String(value || "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  },
};
