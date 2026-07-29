/*
=========================================================

COMPASS-TOS

Dashboard

Sprint 1

=========================================================
*/

const Dashboard = {
  render() {
    const projectData = Project.get("project");

    const trip = (projectData && projectData.project) || {};

    const budget = Project.get("budget");

    return `

<div class="dashboard">

    <section class="hero">

        <h1>

            COMPASS

        </h1>

        <p class="subtitle">

            Travel Operating System

        </p>

        <h2>

            ${this.esc(trip.name || "Untitled Trip")}

        </h2>

        ${trip.subtitle ? `<p class="subtitle">${this.esc(trip.subtitle)}</p>` : ""}

    </section>

    <section class="summary-grid">

        <div class="summary-card">

            <h3>Departure</h3>

            <p id="departureDate">

                ${this.formatDate(trip.departureDate)}

            </p>

        </div>

        <div class="summary-card">

            <h3>Countdown</h3>

            <p id="countdown">

                Calculating...

            </p>

        </div>

        <div class="summary-card">

            <h3>Budget Estimate</h3>

            <p>

                ${this.renderBudgetSummary(budget)}

            </p>

        </div>

        <div class="summary-card">

            <h3>Progress</h3>

            <p>

                ${this.renderProgress(trip.progress)}

            </p>

        </div>

    </section>

    ${Planner.render()}

</div>

`;
  },

  renderBudgetSummary(budget) {
    if (!budget || typeof budget.estimate_low !== "number") {
      return "Not set";
    }

    const currency = budget.currency || "";

    return `${currency} ${budget.estimate_low.toLocaleString()} - ${budget.estimate_high.toLocaleString()}`;
  },

  renderProgress(progress) {
    if (!progress || !progress.flights) {
      return "Not started";
    }

    return `Flights: ${progress.flights}`;
  },

  formatDate(dateString) {
    if (!dateString) {
      return "Not set";
    }

    const date = new Date(dateString + "T00:00:00Z");

    if (isNaN(date.getTime())) {
      return dateString;
    }

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  },

  esc(value) {
    return String(value ?? "").replace(/"/g, "&quot;");
  },

  initialise() {
    this.updateCountdown();
  },

  updateCountdown() {
    const projectData = Project.get("project");

    const trip = (projectData && projectData.project) || {};

    const target = document.getElementById("countdown");

    if (!target) {
      return;
    }

    if (!trip.departureDate) {
      target.textContent = "No date set";

      return;
    }

    const departure = new Date(trip.departureDate + "T00:00:00Z");

    const today = new Date();

    const diff = departure - today;

    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    target.textContent = days >= 0 ? `${days} Days` : `${Math.abs(days)} Days Ago`;
  },
};
