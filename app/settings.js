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

    this.loadAccess();
  },

  // Fetched rather than rendered from what we already hold, because the
  // trip list's summary is names only - this needs the permission each
  // person actually has.
  async loadAccess() {
    const slot = () => document.getElementById("set-access");

    try {
      const response = await fetch(
        `${window.API_BASE}/api/trips/${Data.currentProjectFolder}/share`,
      );

      // 403 is the ordinary answer for a collaborator, not a failure:
      // the list is owner-only. Saying so is better than an error that
      // suggests something is broken.
      if (response.status === 403) {
        const denied = slot();

        if (denied) {
          denied.innerHTML = `<p class="form-hint">Only the trip's owner can see the full list of who has access.</p>`;
        }

        return;
      }

      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }

      const data = await response.json();

      const el = slot();

      if (el) {
        el.innerHTML = this.renderAccess(data);
      }
    } catch (error) {
      console.error("Could not load who has access:", error);

      const el = slot();

      if (el) {
        el.innerHTML = `<p class="form-hint">Couldn't load who has access.</p>`;
      }
    }
  },

  renderAccess(data) {
    const rows = [];

    if (data.owner) {
      rows.push(`<li><strong>${this.esc(data.owner.username)}</strong> <span class="badge">Owner</span></li>`);
    }

    (data.collaborators || []).forEach((c) => {
      rows.push(
        `<li>${this.esc(c.username)} <span class="badge">${this.esc(this.accessLabel(c.permission))}</span></li>`,
      );
    });

    // Owner-only, and the server sends an empty list to anybody else - an
    // unaccepted invite is a third party's email address.
    (data.pending || []).forEach((p) => {
      rows.push(
        `<li>${this.esc(p.email)} <span class="badge">Invited, not joined</span></li>`,
      );
    });

    if (rows.length === 0) {
      return `<p class="form-hint">Nobody else. This trip is yours alone.</p>`;
    }

    return `<ul class="set-access-list">${rows.join("")}</ul>`;
  },

  accessLabel(permission) {
    if (permission === "write") { return "Can edit"; }

    if (permission === "guest") { return "Guest - no costs"; }

    return "Can view";
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

            <h2>Who has access</h2>

            <div id="set-access"><p class="form-hint">Loading…</p></div>

        </div>

        <div class="manager-card form-card">

            <h2>Trip Name</h2>

            <div class="form-grid">

                <label class="form-field form-field-wide">
                    Name
                    <input type="text" id="set-name" value="${this.esc(trip.name)}">
                    <span class="form-hint">
                        What the trip is called everywhere you see it. Its web
                        address keeps the original name, so any link you have
                        already shared goes on working.
                    </span>
                </label>

            </div>

            <p class="ui-msg" id="set-name-msg" hidden></p>

            <div class="planner-buttons">

                <button type="button" class="btn-primary" onclick="Settings.saveName()">Save Name</button>

            </div>

        </div>

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

            <p class="ui-msg" id="set-dates-msg" hidden></p>

        </div>

        <div class="manager-card form-card">

            <h2>Change Password</h2>

            <p class="form-hint">
                Changing your password signs you out everywhere else you're
                logged in. You'll stay signed in here.
            </p>

            <div class="form-grid">

                <label class="form-field">
                    Current Password
                    <input type="password" id="set-pw-current" autocomplete="current-password">
                </label>

                <label class="form-field">
                    New Password
                    <input type="password" id="set-pw-new" autocomplete="new-password">
                    <span class="form-hint">At least 10 characters.</span>
                </label>

                <label class="form-field">
                    Confirm New Password
                    <input type="password" id="set-pw-confirm" autocomplete="new-password">
                </label>

            </div>

            <button type="button" onclick="Settings.changePassword()">

                Update Password

            </button>

            <p id="set-pw-msg" class="form-hint"></p>

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

  // Uses an inline status line rather than a dialog - this is the same
  // pattern Auth/Sharing use for credential work, and it keeps the typed
  // fields on screen if something's wrong.
  async changePassword() {
    const msg = document.getElementById("set-pw-msg");

    const currentPassword = document.getElementById("set-pw-current").value;

    const newPassword = document.getElementById("set-pw-new").value;

    const confirmPassword = document.getElementById("set-pw-confirm").value;

    if (!currentPassword || !newPassword) {
      msg.textContent = "Fill in your current and new password.";

      return;
    }

    // Mirrors the server's policy so an obvious problem is caught without
    // a round trip. The server re-checks regardless - this is convenience,
    // not the actual control.
    if (newPassword.length < 10) {
      msg.textContent = "New password must be at least 10 characters.";

      return;
    }

    if (newPassword !== confirmPassword) {
      msg.textContent = "New passwords don't match.";

      return;
    }

    msg.textContent = "Updating…";

    try {
      const response = await fetch(`${window.API_BASE}/auth/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        msg.textContent = data.error || "Could not update the password.";

        return;
      }

      document.getElementById("set-pw-current").value = "";

      document.getElementById("set-pw-new").value = "";

      document.getElementById("set-pw-confirm").value = "";

      msg.textContent = "Password updated. Other devices have been signed out.";
    } catch (error) {
      console.error("Password change failed:", error);

      msg.textContent = "Couldn't reach the server. Try again.";
    }
  },

  async saveName() {
    const field = document.getElementById("set-name");

    const name = field ? field.value.trim() : "";

    if (!name) {
      UI.warn("A trip needs a name.", { slot: "set-name-msg", focus: "set-name" });

      return;
    }

    try {
      const response = await fetch(
        `${window.API_BASE}/api/projects/${Data.currentProjectFolder}/rename`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name }),
        },
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        UI.warn(result.error || `Could not rename the trip (status ${response.status}).`, {
          slot: "set-name-msg",
          focus: "set-name",
        });

        return;
      }

      // The server owns both copies of the name, so the in-memory one is
      // updated to match rather than saved back over it - a PUT here
      // would race the rename it just did.
      const projectData = Project.get("project");

      if (projectData && projectData.project) {
        projectData.project.name = name;

        Project.load("project", projectData);
      }

      UI.ok(`Renamed to "${name}".`);

      this.open();
    } catch (error) {
      console.error("Could not rename the trip:", error);

      UI.warn("Couldn't reach the server. Check the connection and try again.", { slot: "set-name-msg" });
    }
  },

  save() {
    const projectData = Project.get("project");

    if (!projectData || !projectData.project) {
      return;
    }

    const departureDate = document.getElementById("set-departure").value;

    const returnDate = document.getElementById("set-return").value;

    if (!departureDate) {
      UI.warn("Please enter a start date.", { slot: "set-dates-msg", focus: "set-departure" });
      return;
    }

    projectData.project.departureDate = departureDate;

    projectData.project.returnDate = returnDate;

    Project.update("project", projectData);

    Dates.recalculateJourney();

    UI.ok("Trip dates saved. Journey days have been recalculated.");

    this.open();
  },

  // Full escaping, not just quotes.
  //
  // This escaped only " until v1.11.2, so any < in user text went into
  // innerHTML as markup. Trips are SHARED, so a hotel name or an expense
  // description written by one person renders in everyone else browser
  // with their session - a stored XSS, not a cosmetic problem. Other
  // modules were upgraded as they were touched; these were missed.
  //
  // & must be replaced first, or the & introduced by the later
  // replacements gets escaped a second time.
  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
