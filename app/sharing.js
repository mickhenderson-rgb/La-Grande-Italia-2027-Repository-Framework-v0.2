/*
=========================================================

COMPASS-TOS

Sharing

Version 1.0.0

Build 47 (Phase 2)

Owner-only trip sharing. Invite a collaborator by username or
email as read-only or read/write; unregistered emails get an
invite link and are added automatically when they sign up.

=========================================================
*/

const Sharing = {
  tripId: "",

  tripName: "",

  async open(tripId, tripName) {
    this.tripId = tripId;

    this.tripName = tripName || tripId;

    Render.show(this.renderLoading());

    await this.refresh();
  },

  async refresh() {
    try {
      const response = await fetch(`${window.API_BASE}/api/trips/${this.tripId}/share`);

      const data = await response.json();

      if (!response.ok) {
        Render.show(this.renderError(data.error || "Could not load sharing."));

        return;
      }

      Render.show(this.render(data.collaborators || [], data.pending || []));
    } catch (error) {
      Render.show(this.renderError("Couldn't reach the server."));
    }
  },

  renderLoading() {
    return `<div class="landing"><div class="landing-card"><p>Loading sharing…</p></div></div>`;
  },

  renderError(message) {
    return `

<div class="landing">

    <div class="landing-card">

        <p>${this.esc(message)}</p>

        <button type="button" onclick="Landing.open()">← Back to Trips</button>

    </div>

</div>

`;
  },

  render(collaborators, pending) {
    const rows = collaborators
      .map(
        (c) => `

<div class="planner-buttons" style="justify-content: space-between; align-items: center; border-top: 1px solid #efe9df; padding: 6px 0;">

    <span>${this.esc(c.username)} <span class="badge">${c.permission === "write" ? "Read / Write" : "Read-only"}</span></span>

    <button type="button" style="font-size: 0.8em; padding: 4px 10px;" onclick="Sharing.remove('${c.userId}')">Remove</button>

</div>

`,
      )
      .join("");

    const pendingRows = pending
      .map(
        (p) => `

<div style="border-top: 1px solid #efe9df; padding: 6px 0; font-size: 0.9em; color: #6b6357;">

    ${this.esc(p.email)} <span class="badge">${p.permission === "write" ? "Read / Write" : "Read-only"}</span> — pending (they'll join when they sign up)

</div>

`,
      )
      .join("");

    return `

<div class="landing">

    <div class="landing-card" style="max-width: 480px; text-align: left;">

        <h1 style="text-align: center;">Share Trip</h1>

        <p class="muted" style="text-align: center;">${this.esc(this.tripName)}</p>

        <label class="form-field form-field-wide">
            Username or email
            <input type="text" id="share-identifier" placeholder="e.g. Lisa_H or lisa@example.com">
        </label>

        <label class="form-field form-field-wide">
            Permission
            <select id="share-permission">
                <option value="read">Read-only</option>
                <option value="write">Read / Write</option>
            </select>
        </label>

        <div id="share-msg" class="form-hint" style="min-height: 1.2em; margin: 8px 0;"></div>

        <button type="button" style="width: 100%;" onclick="Sharing.share()">Share</button>

        <h3 style="margin-top: 18px;">People with access</h3>

        ${collaborators.length === 0 && pending.length === 0 ? `<p class="muted">Not shared with anyone yet.</p>` : ""}

        ${rows}

        ${pendingRows}

        <div class="planner-buttons" style="margin-top: 16px;">

            <button type="button" onclick="Landing.open()">← Back to Trips</button>

        </div>

    </div>

</div>

`;
  },

  async share() {
    const identifier = document.getElementById("share-identifier").value.trim();

    const permission = document.getElementById("share-permission").value;

    const msg = document.getElementById("share-msg");

    if (!identifier) {
      msg.textContent = "Enter a username or email.";

      return;
    }

    msg.textContent = "Sharing…";

    try {
      const response = await fetch(`${window.API_BASE}/api/trips/${this.tripId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, permission }),
      });

      const data = await response.json();

      if (!response.ok) {
        msg.textContent = data.error || "Could not share.";

        return;
      }

      if (data.pending) {
        const link = `${window.location.origin}${window.API_BASE}/?invite=${data.token}`;

        msg.innerHTML = `They don't have an account yet — send them this link to join and get access:<br><input type="text" readonly value="${this.esc(link)}" style="width: 100%; margin-top: 6px;" onclick="this.select()">`;
      }

      await this.refresh();
    } catch (error) {
      msg.textContent = "Couldn't reach the server.";
    }
  },

  async remove(userId) {
    try {
      await fetch(`${window.API_BASE}/api/trips/${this.tripId}/share/${userId}`, { method: "DELETE" });
    } catch (error) {
      // Ignore - refresh will show the current state either way.
    }

    await this.refresh();
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
