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
    // No trip is loaded on the selection screen, so show the app name.
    document.title = "COMPASS-TOS";

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

        <button type="button" onclick="Landing.createInvite()">

            + Invite Someone

        </button>

        <div id="invite-result" class="form-hint" style="margin-top: 10px;"></div>

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

    <button type="button" onclick="Landing.selectTrip('${project.id}')" style="display: block; width: 100%; margin: 14px 0 12px; padding: 14px 24px; font-size: 1.15em; font-weight: 700; background: #34495E; color: #ffffff; border: none; border-radius: var(--radius, 8px); cursor: pointer;">

        Open Trip

    </button>

    <div class="planner-buttons" style="justify-content: center; gap: 8px;">

        <button type="button" onclick="Landing.setArchived('${project.id}', ${!project.archived})" style="font-size: 0.8em; padding: 5px 14px;">

            ${project.archived ? "Unarchive" : "Archive"}

        </button>

        <button type="button" onclick="Landing.deleteTrip('${project.id}', '${this.esc(project.name)}')" style="font-size: 0.8em; padding: 5px 14px;">

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

  async createInvite() {
    const email = (prompt("Email of the person you're inviting (recommended - the invite is tied to it):", "") || "").trim();

    const result = document.getElementById("invite-result");

    if (result) {
      result.textContent = "Creating invite…";
    }

    try {
      const response = await fetch(`${window.API_BASE}/auth/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (result) {
          result.textContent = data.error || "Could not create the invite.";
        }

        return;
      }

      const link = `${window.location.origin}${window.API_BASE}/?invite=${data.token}`;

      if (result) {
        result.innerHTML = `Invite link — send this to ${email ? this.esc(email) : "them"} (expires in 7 days):<br><input type="text" readonly value="${this.esc(link)}" style="width: 100%; margin-top: 6px;" onclick="this.select()">`;
      }
    } catch (error) {
      if (result) {
        result.textContent = "Couldn't reach the server. Try again.";
      }
    }
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
