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

  openList() {
    this.current = null;
    this.returnDay = null;

    Render.show(Layout.render(this.renderList()));
  },

  renderList() {
    const journey = Project.get("journey");
    const days = journey && Array.isArray(journey.days) ? journey.days : [];
    const seen = new Set();
    const destinations = [];

    days.forEach((day) => {
      const id = String(day.location || "").toLowerCase();

      if (id && !seen.has(id)) {
        seen.add(id);
        destinations.push(id);
      }
    });

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Destinations

        </h1>

        <p>

            ${destinations.length} destination${destinations.length === 1 ? "" : "s"} in the journey.

        </p>

    </section>

    <div class="manager-grid">

        ${destinations
          .map(
            (id) => `

<div class="manager-card">

    <h2>${this.pretty(id)}</h2>

    <button type="button" onclick="Destination.open('${id}')">

        Open Destination

    </button>

</div>

`,
          )
          .join("")}

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Router.navigate('dashboard')">

            ← Dashboard

        </button>

    </div>

</div>

`;
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

        ${this.card(title, "📔", "journal", summary.journal, "Notes, checklist and photos for days spent here.")}

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
        onclick="${this.openAction(type)}">

        Open

    </button>

</div>

`;
  },

  openAction(type) {
    const id = this.current;

    switch (type) {
      case "accommodation":
        return `Accommodation.openForDestination('${id}')`;

      case "activity":
        return `Activities.openForDestination('${id}')`;

      case "restaurant":
        return `Restaurants.openForDestination('${id}')`;

      case "transport":
        return `Transport.openForDestination('${id}')`;

      case "journal":
        return `Journal.open()`;

      default:
        return `Router.navigate('dashboard')`;
    }
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
      transport: this.countTransport(locationId),
      journal: this.countJournal(locationId),
    };
  },

  dayNumbersForDestination(locationId) {
    const journey = Project.get("journey");

    const needle = String(locationId || "").toLowerCase();

    if (!journey || !Array.isArray(journey.days)) {
      return [];
    }

    return journey.days
      .filter((d) => String(d.location || "").toLowerCase() === needle)
      .map((d) => d.day);
  },

  countTransport(locationId) {
    const data = Project.get("transport");

    if (!data || !Array.isArray(data.items)) {
      return 0;
    }

    const dayNumbers = this.dayNumbersForDestination(locationId);

    return data.items.filter((item) => dayNumbers.includes(item.day)).length;
  },

  countJournal(locationId) {
    const data = Project.get("journal");

    if (!data || !Array.isArray(data.entries)) {
      return 0;
    }

    const dayNumbers = this.dayNumbersForDestination(locationId);

    return data.entries.filter((entry) => {
      if (!dayNumbers.includes(entry.day)) {
        return false;
      }

      const hasNotes = entry.notes && entry.notes.trim().length > 0;

      return hasNotes || entry.photos.length > 0 || entry.checklist.length > 0;
    }).length;
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
