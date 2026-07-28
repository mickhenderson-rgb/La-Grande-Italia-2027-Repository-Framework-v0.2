/*
=========================================================

COMPASS-TOS

Landing

Version 1.0.0

Build 26

Trip selection screen. Shown before any trip is loaded,
and reachable again afterward via "Switch Trip" in the
sidebar footer, so more than one trip can live in the same
installation without hardcoding which one loads.

=========================================================
*/

const Landing = {
  async open() {
    Render.show(this.renderLoading());

    try {
      const response = await fetch("/api/projects");

      if (!response.ok) {
        throw new Error(`Could not list trips (status ${response.status})`);
      }

      const result = await response.json();

      Render.show(this.render(result.projects || []));
    } catch (error) {
      console.error("Could not load trip list:", error);

      Render.show(this.renderError());
    }
  },

  renderLoading() {
    return `

<div class="landing">

    <div class="landing-card">

        <h1>COMPASS-TOS</h1>

        <p>Loading your trips...</p>

    </div>

</div>

`;
  },

  renderError() {
    return `

<div class="landing">

    <div class="landing-card">

        <h1>COMPASS-TOS</h1>

        <p>Couldn't reach the server. Make sure it's running, then try again.</p>

        <button type="button" onclick="Landing.open()">Retry</button>

    </div>

</div>

`;
  },

  render(projects) {
    return `

<div class="landing">

    <div class="landing-header">

        <h1>COMPASS-TOS</h1>

        <p>Travel Operating System</p>

    </div>

    <div class="landing-grid">

        ${
          projects.length === 0
            ? `<div class="landing-card"><p>No trips found yet.</p></div>`
            : projects.map((p) => this.renderCard(p)).join("")
        }

    </div>

</div>

`;
  },

  renderCard(project) {
    const dates =
      project.departureDate && project.returnDate
        ? `${project.departureDate} - ${project.returnDate}`
        : "Dates not set";

    return `

<div class="landing-card">

    <h2>${this.esc(project.name)}</h2>

    <p class="muted">${this.esc(project.subtitle)}</p>

    <p>${this.esc(dates)}</p>

    <button type="button" onclick="Landing.selectTrip('${project.id}')">

        Open Trip

    </button>

</div>

`;
  },

  async selectTrip(id) {
    Render.show(this.renderLoading());

    await Data.loadProject(id);

    Dates.recalculateJourney();

    Router.navigate("dashboard");
  },

  esc(value) {
    return String(value ?? "").replace(/"/g, "&quot;");
  },
};
