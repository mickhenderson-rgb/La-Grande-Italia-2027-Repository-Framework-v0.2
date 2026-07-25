/*
=========================================================

COMPASS-TOS

Settings

Version 1.0.0

Build 12

=========================================================
*/

const Settings = {
  open() {
    Render.show(Layout.render(this.render()));
  },

  render() {
    const projectData = Project.get("project");

    const trip = projectData?.project || {};

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Settings

        </h1>

        <p>

            Changing the start date recalculates every day in the journey.
            Days after a flight with a recorded arrival date will use that
            arrival date instead of a simple day-by-day count.

        </p>

    </section>

    <div class="manager-grid">

        <div class="manager-card form-card">

            <h2>Trip Dates</h2>

            <div class="form-grid">

                <label class="form-field">
                    Start Date (Departure)
                    <input type="date" id="set-departure" value="${this.esc(trip.departureDate)}">
                </label>

                <label class="form-field">
                    Return Date
                    <input type="date" id="set-return" value="${this.esc(trip.returnDate)}">
                </label>

            </div>

            <button type="button" onclick="Settings.save()">

                Save &amp; Recalculate Journey

            </button>

        </div>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Router.navigate('dashboard')">

            ← Dashboard

        </button>

    </div>

</div>

`;
  },

  save() {
    const projectData = Project.get("project");

    if (!projectData || !projectData.project) {
      return;
    }

    const departureDate = document.getElementById("set-departure").value;

    const returnDate = document.getElementById("set-return").value;

    if (!departureDate) {
      alert("Please enter a start date.");
      return;
    }

    projectData.project.departureDate = departureDate;

    projectData.project.returnDate = returnDate;

    Project.update("project", projectData);

    Dates.recalculateJourney();

    alert("Trip dates saved. Journey days have been recalculated.");

    this.open();
  },

  esc(value) {
    return String(value ?? "").replace(/"/g, "&quot;");
  },
};
