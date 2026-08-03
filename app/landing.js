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
  showArchived: false,

  async open() {
    Render.show(this.renderLoading());

    try {
      const response = await fetch(`${window.API_BASE}/api/projects`);

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
    const active = projects.filter((p) => !p.archived);

    const archived = projects.filter((p) => p.archived);

    return `

<div class="landing">

    <div class="landing-header">

        <h1>COMPASS-TOS</h1>

        <p>Travel Operating System</p>

        <button type="button" onclick="TripSetup.open()">

            + Create New Trip

        </button>

    </div>

    <div class="landing-grid">

        ${
          active.length === 0
            ? `<div class="landing-card"><p>No active trips.</p></div>`
            : active.map((p) => this.renderCard(p)).join("")
        }

    </div>

    ${archived.length > 0 ? this.renderArchivedSection(archived) : ""}

</div>

`;
  },

  renderArchivedSection(archived) {
    return `

<div class="landing-header" style="margin-top: 40px;">

    <button type="button" onclick="Landing.toggleArchived()">

        ${this.showArchived ? "Hide" : "Show"} Archived Trips (${archived.length})

    </button>

</div>

${
  this.showArchived
    ? `<div class="landing-grid">${archived.map((p) => this.renderCard(p)).join("")}</div>`
    : ""
}

`;
  },

  toggleArchived() {
    this.showArchived = !this.showArchived;

    this.open();
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

    <div class="planner-buttons" style="justify-content: center; margin-top: 10px;">

        <button type="button" onclick="Landing.setArchived('${project.id}', ${!project.archived})">

            ${project.archived ? "Unarchive" : "Archive"}

        </button>

        <button type="button" onclick="Landing.deleteTrip('${project.id}', '${this.esc(project.name)}')">

            Delete

        </button>

    </div>

</div>

`;
  },

  async setArchived(id, archived) {
    try {
      const response = await fetch(`${window.API_BASE}/api/projects/${id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });

      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }

      this.open();
    } catch (error) {
      console.error("Could not update trip:", error);

      alert("Couldn't update that trip. Check the connection and try again.");
    }
  },

  async deleteTrip(id, name) {
    const confirmed = confirm(
      `Delete "${name}" permanently? This removes all its data - accommodation, activities, journal entries, photos, everything. This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${window.API_BASE}/api/projects/${id}`, { method: "DELETE" });

      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }

      this.open();
    } catch (error) {
      console.error("Could not delete trip:", error);

      alert("Couldn't delete that trip. Check the connection and try again.");
    }
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
