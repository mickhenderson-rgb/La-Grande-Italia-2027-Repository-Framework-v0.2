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
