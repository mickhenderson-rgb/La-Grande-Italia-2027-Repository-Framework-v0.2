/*
=========================================================

COMPASS-TOS

Trip Setup

Version 1.0.0

Build 29

Create a brand new trip. Start date plus either a duration
(days) or an end date - filling in either one keeps the
other in sync automatically.

=========================================================
*/

const TripSetup = {
  open() {
    Render.show(this.render());

    this.init();
  },

  render() {
    const today = new Date().toISOString().slice(0, 10);

    return `

<div class="landing">

    <div class="landing-header">

        <h1>Create a New Trip</h1>

        <p>Set the basics now - everything else can be filled in once the trip is created.</p>

    </div>

    <div class="landing-card" style="text-align: left; max-width: 500px; margin: 0 auto;">

        <div class="form-grid">

            <label class="form-field form-field-wide">
                Trip Name
                <input type="text" id="setup-name" placeholder="e.g. Weekend in the Mountains">
            </label>

            <label class="form-field form-field-wide">
                Subtitle (optional)
                <input type="text" id="setup-subtitle" placeholder="e.g. Family getaway">
            </label>

            <label class="form-field">
                Start Date
                <input type="date" id="setup-start-date" value="${today}" onchange="TripSetup.onStartDateChange()">
            </label>

            <label class="form-field">
                Duration (days)
                <input type="number" id="setup-duration" value="5" min="1" onchange="TripSetup.onDurationChange()">
            </label>

            <label class="form-field">
                End Date
                <input type="date" id="setup-end-date" onchange="TripSetup.onEndDateChange()">
            </label>

            <label class="form-field">
                Currency
                <select id="setup-currency">${Currency.currencyOptions("USD")}</select>
            </label>

        </div>

        <div id="setup-status" class="form-hint" style="margin-top: 10px;"></div>

        <div class="planner-buttons">

            <button type="button" onclick="TripSetup.create()">

                Create Trip

            </button>

            <button type="button" onclick="TripSetup.createWithItinerary()">

                📋 Create &amp; Load Itinerary

            </button>

            <button type="button" onclick="Landing.open()">

                Cancel

            </button>

        </div>

    </div>

</div>

`;
  },

  init() {
    // Called right after render() is shown, to set the initial End Date
    // from the default Start Date + Duration.
    this.onDurationChange();
  },

  onStartDateChange() {
    // Keep the currently-set duration fixed, recalculate End Date from it.
    this.onDurationChange();
  },

  onDurationChange() {
    const startEl = document.getElementById("setup-start-date");

    const durationEl = document.getElementById("setup-duration");

    const endEl = document.getElementById("setup-end-date");

    const start = startEl.value;

    const duration = parseInt(durationEl.value, 10);

    if (!start || !duration || duration < 1) {
      return;
    }

    endEl.value = this.addDays(start, duration - 1);
  },

  onEndDateChange() {
    const startEl = document.getElementById("setup-start-date");

    const durationEl = document.getElementById("setup-duration");

    const endEl = document.getElementById("setup-end-date");

    const start = startEl.value;

    const end = endEl.value;

    if (!start || !end) {
      return;
    }

    const days = this.daysBetweenInclusive(start, end);

    if (days >= 1) {
      durationEl.value = days;
    }
  },

  addDays(dateString, days) {
    const date = new Date(dateString + "T00:00:00Z");

    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
  },

  daysBetweenInclusive(startDate, endDate) {
    const start = new Date(startDate + "T00:00:00Z");

    const end = new Date(endDate + "T00:00:00Z");

    return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  },

  create() {
    return this.submit(false);
  },

  createWithItinerary() {
    return this.submit(true);
  },

  async submit(thenImport) {
    const name = document.getElementById("setup-name").value.trim();

    const subtitle = document.getElementById("setup-subtitle").value.trim();

    const startDate = document.getElementById("setup-start-date").value;

    const endDate = document.getElementById("setup-end-date").value;

    const currency = document.getElementById("setup-currency").value.trim() || "USD";

    const statusEl = document.getElementById("setup-status");

    if (!name) {
      alert("Please enter a trip name.");
      return;
    }

    if (!startDate || !endDate) {
      alert("Please set both a start date and an end date.");
      return;
    }

    statusEl.textContent = "Creating trip...";

    try {
      const response = await fetch(`${window.API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subtitle, startDate, endDate, currency }),
      });

      const result = await response.json();

      if (!response.ok) {
        statusEl.textContent = result.error || "Could not create the trip.";

        return;
      }

      statusEl.textContent = "Trip created - opening...";

      if (thenImport) {
        await Data.loadProject(result.id);

        Dates.recalculateJourney();

        ItineraryImport.open();
      } else {
        await Landing.selectTrip(result.id);
      }
    } catch (error) {
      console.error("Could not create trip:", error);

      statusEl.textContent = "Couldn't reach the server. Check the connection and try again.";
    }
  },
};
