/*
=========================================================

COMPASS-TOS

Flights Manager

Version 1.0.0

Build 12

=========================================================
*/

const Flights = {
  editingId: null,

  open() {
    this.editingId = null;

    Render.show(Layout.render(this.render()));
  },

  getFlights() {
    const journey = Project.get("journey");

    if (!journey || !Array.isArray(journey.days)) {
      return [];
    }

    const flights = [];

    journey.days.forEach((day) => {
      (day.items || []).forEach((item) => {
        if (item.type === "flight") {
          flights.push({ day, item });
        }
      });
    });

    return flights;
  },

  render() {
    const flights = this.getFlights();

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Flights

        </h1>

        <p>

            ${flights.length} flight${flights.length === 1 ? "" : "s"} in the journey.
            Record arrival date and time for every flight so following days
            calculate correctly.

        </p>

    </section>

    <div class="manager-grid">

        ${flights.length === 0 ? this.emptyCard() : flights.map((f) => this.renderFlightCard(f)).join("")}

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Router.navigate('dashboard')">

            ← Dashboard

        </button>

    </div>

</div>

`;
  },

  emptyCard() {
    return `

<div class="manager-card">

<h2>No Flights</h2>

<p>No flight items exist in the journey yet.</p>

</div>

`;
  },

  renderFlightCard(f) {
    const { day, item } = f;

    const hasArrival = item.arrival && item.arrival.date;

    return `

<div class="manager-card">

    <h2>

        Day ${day.day} · ${this.esc(item.title)}

    </h2>

    <p>

        Status: <span class="badge">${item.status || "research"}</span>
        ${hasArrival ? "" : '<span class="badge">⚠ Arrival Not Set</span>'}

    </p>

    <div class="form-grid">

        <label class="form-field">
            Departure Date
            <input type="date" id="flt-dep-date-${item.id}" value="${this.esc(item.departure?.date)}">
        </label>

        <label class="form-field">
            Departure Time
            <input type="time" id="flt-dep-time-${item.id}" value="${this.esc(item.departure?.time)}">
        </label>

        <label class="form-field">
            Departure Location
            <input type="text" id="flt-dep-loc-${item.id}" value="${this.esc(item.departure?.location)}">
        </label>

        <label class="form-field">
            Arrival Date
            <input type="date" id="flt-arr-date-${item.id}" value="${this.esc(item.arrival?.date)}">
        </label>

        <label class="form-field">
            Arrival Time
            <input type="time" id="flt-arr-time-${item.id}" value="${this.esc(item.arrival?.time)}">
        </label>

        <label class="form-field">
            Arrival Location
            <input type="text" id="flt-arr-loc-${item.id}" value="${this.esc(item.arrival?.location)}">
        </label>

    </div>

    <button type="button" onclick="Flights.save(${day.day}, '${item.id}')">

        Save Flight

    </button>

</div>

`;
  },

  save(dayNumber, itemId) {
    const journey = Project.get("journey");

    if (!journey || !Array.isArray(journey.days)) {
      return;
    }

    const day = journey.days.find((d) => d.day === dayNumber);

    if (!day) {
      return;
    }

    const item = (day.items || []).find((i) => i.id === itemId);

    if (!item) {
      return;
    }

    item.departure = {
      date: document.getElementById(`flt-dep-date-${itemId}`).value,
      time: document.getElementById(`flt-dep-time-${itemId}`).value,
      location: document.getElementById(`flt-dep-loc-${itemId}`).value.trim(),
    };

    item.arrival = {
      date: document.getElementById(`flt-arr-date-${itemId}`).value,
      time: document.getElementById(`flt-arr-time-${itemId}`).value,
      location: document.getElementById(`flt-arr-loc-${itemId}`).value.trim(),
    };

    Project.update("journey", journey);

    Dates.recalculateJourney();

    this.open();
  },

  esc(value) {
    return String(value ?? "").replace(/"/g, "&quot;");
  },
};
