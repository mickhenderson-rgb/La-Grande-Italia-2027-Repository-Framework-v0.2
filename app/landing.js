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

        <button type="button" onclick="Landing.showInviteForm()">

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

    const isOwner = project.role !== "collaborator";

    const roleBadge = isOwner
      ? ""
      : `<p><span class="badge">Shared with you · ${project.permission === "write" ? "Read / Write" : "Read-only"}</span></p>`;

    const ownerActions = isOwner
      ? `

    <div class="planner-buttons" style="justify-content: center; gap: 8px;">

        <button type="button" onclick="Sharing.open('${project.id}', '${this.jsArg(project.name)}')" style="font-size: 0.8em; padding: 5px 14px;">Share</button>

        <button type="button" onclick="Landing.setArchived('${project.id}', ${!project.archived})" style="font-size: 0.8em; padding: 5px 14px;">${project.archived ? "Unarchive" : "Archive"}</button>

        <button type="button" onclick="Landing.confirmDelete('${project.id}', '${this.jsArg(project.name)}')" style="font-size: 0.8em; padding: 5px 14px;">Delete</button>

    </div>

`
      : "";

    return `

<div class="landing-card">

    <h2>${this.esc(project.name)}</h2>

    <p class="muted">${this.esc(project.subtitle)}</p>

    <p>${this.esc(dates)}</p>

    ${roleBadge}

    <button type="button" onclick="Landing.selectTrip('${project.id}')" style="display: block; width: 100%; margin: 14px 0 12px; padding: 14px 24px; font-size: 1.15em; font-weight: 700; background: #34495E; color: #ffffff; border: none; border-radius: var(--radius, 8px); cursor: pointer;">

        Open Trip

    </button>

    ${ownerActions}

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

  confirmDelete(id, name) {
    Render.show(this.renderDeleteConfirm(id, name));
  },

  renderDeleteConfirm(id, name) {
    return `

<div class="landing">

    <div class="landing-card" style="max-width: 440px; border: 2px solid #b3261e;">

        <h1 style="text-align: center;">⚠️ Delete this trip?</h1>

        <p style="text-align: center;"><strong>${this.esc(name)}</strong> will be deleted permanently. All of its planning data — accommodation, activities, journal entries, photos, everything — will be gone forever. This cannot be undone.</p>

        <div class="planner-buttons" style="justify-content: center; gap: 10px; margin-top: 16px;">

            <button type="button" onclick="Landing.open()">Cancel</button>

            <button type="button" onclick="Landing.reallyDelete('${id}')" style="background: #b3261e; color: #ffffff; border: none;">Yes, delete permanently</button>

        </div>

    </div>

</div>

`;
  },

  async reallyDelete(id) {
    try {
      const response = await fetch(`${window.API_BASE}/api/projects/${id}`, { method: "DELETE" });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));

        alert(data.error || "Couldn't delete that trip.");

        return;
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

  showInviteForm() {
    const result = document.getElementById("invite-result");

    if (!result) {
      return;
    }

    result.innerHTML = `

<div style="margin-top: 6px; text-align: left; max-width: 420px; margin-left: auto; margin-right: auto;">

    <input type="email" id="invite-email" placeholder="Their email (optional - to also email the invite)" style="width: 100%;">

    <div class="planner-buttons" style="justify-content: center; gap: 8px; margin-top: 6px;">

        <button type="button" onclick="Landing.generateInvite()">Get Invite Link</button>

    </div>

    <div id="invite-output" class="form-hint" style="margin-top: 8px;"></div>

</div>

`;
  },

  async generateInvite() {
    const emailEl = document.getElementById("invite-email");

    const email = emailEl ? emailEl.value.trim() : "";

    const out = document.getElementById("invite-output");

    if (out) {
      out.textContent = "Creating invite…";
    }

    try {
      const response = await fetch(`${window.API_BASE}/auth/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (out) {
          out.textContent = data.error || "Could not create the invite.";
        }

        return;
      }

      const link = `${window.location.origin}${window.API_BASE}/?invite=${data.token}`;

      const emailedNote = data.emailed && email ? `We've also emailed it to ${this.esc(email)}. ` : "";

      if (out) {
        out.innerHTML = `${emailedNote}Share this invite link any way you like — WhatsApp, text, etc. (expires in 7 days):

<div class="planner-buttons" style="justify-content: flex-start; gap: 8px; margin-top: 6px;">

    <input type="text" id="invite-link-field" readonly value="${this.esc(link)}" style="flex: 1; min-width: 200px;" onclick="this.select()">

    <button type="button" onclick="Landing.copyInviteLink()">Copy</button>

</div>

<span id="invite-copy-note" class="muted" style="font-size: 0.85em;"></span>`;
      }
    } catch (error) {
      if (out) {
        out.textContent = "Couldn't reach the server. Try again.";
      }
    }
  },

  copyInviteLink() {
    Landing.copyFieldToClipboard("invite-link-field", "invite-copy-note");
  },

  copyFieldToClipboard(fieldId, noteId) {
    const field = document.getElementById(fieldId);

    const note = document.getElementById(noteId);

    if (!field) {
      return;
    }

    field.select();

    const done = (ok) => {
      if (note) {
        note.textContent = ok ? "Copied to clipboard!" : "Couldn't auto-copy — press Ctrl+C to copy the selected link.";
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(field.value).then(
        () => done(true),
        () => {
          try {
            done(document.execCommand("copy"));
          } catch (error) {
            done(false);
          }
        },
      );
    } else {
      try {
        done(document.execCommand("copy"));
      } catch (error) {
        done(false);
      }
    }
  },

  // Safe to drop into a single-quoted JS string inside a double-quoted HTML
  // attribute (an onclick=). Escapes the JS string first, then the HTML.
  jsArg(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
