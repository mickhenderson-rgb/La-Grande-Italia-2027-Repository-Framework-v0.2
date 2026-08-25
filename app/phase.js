/*
=========================================================

COMPASS-TOS

Trip Phase

Version 1.0.0

Owns Planning / Travel / Journal - which of the three the
app is currently "in", used by the header chip, Dashboard
and the Day workspace to decide what to show first.

Auto-derived from the trip's departureDate/returnDate
against today (same date-only comparison TripMap's own
stateForDate() already uses independently - see the note
there; not unified in this pass, just kept consistent).
A manual override can be set from the phase sheet and wins
over the derived value until explicitly cleared - there's
no auto-expiry, by design (see the sheet's "Auto" row,
which always shows what the derived value currently is so
an override is never silently stale/invisible).

=========================================================
*/

const Phase = {
  STORAGE_KEY: "compass-phase",

  VALUES: ["Planning", "Travel", "Journal"],

  ICONS: { Planning: "📋", Travel: "✈", Journal: "📔" },

  current() {
    return this.override() || this.derive();
  },

  override() {
    try {
      const value = localStorage.getItem(this.STORAGE_KEY);

      return this.VALUES.includes(value) ? value : null;
    } catch (error) {
      return null;
    }
  },

  derive() {
    const project = (Project.get("project") || {}).project || {};

    const departureDate = project.departureDate;

    if (!departureDate) {
      return "Planning";
    }

    const today = this.todayISO();

    if (today < departureDate) {
      return "Planning";
    }

    if (project.returnDate && today > project.returnDate) {
      return "Journal";
    }

    return "Travel";
  },

  todayISO() {
    const now = new Date();

    const yyyy = now.getFullYear();

    const mm = String(now.getMonth() + 1).padStart(2, "0");

    const dd = String(now.getDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
  },

  setOverride(value) {
    if (!this.VALUES.includes(value)) {
      return;
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, value);
    } catch (error) {
      // Private browsing / storage disabled - the chip still updates for
      // this page load, it just won't be remembered next visit.
    }

    this.afterChange();
  },

  clearOverride() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      // See setOverride().
    }

    this.afterChange();
  },

  afterChange() {
    const label = document.getElementById("phaseLabel");

    if (label) {
      label.textContent = this.current();
    }

    this.closeSheet();
  },

  openSheet() {
    let sheet = document.getElementById("phase-sheet");

    if (!sheet) {
      document.body.insertAdjacentHTML("beforeend", this.renderSheet());

      sheet = document.getElementById("phase-sheet");
    } else {
      sheet.outerHTML = this.renderSheet();
    }

    document.getElementById("phase-sheet").classList.add("is-open");
  },

  closeSheet() {
    const sheet = document.getElementById("phase-sheet");

    if (sheet) {
      sheet.classList.remove("is-open");
    }
  },

  renderSheet() {
    const current = this.current();

    const isOverride = this.override() !== null;

    const derived = this.derive();

    const row = (value) => `

<button class="more-row" onclick="Phase.setOverride('${value}')">
    <span class="more-ic">${this.ICONS[value]}</span>
    <span>${current === value ? "✓ " : ""}${value}</span>
</button>

`;

    return `

<div id="phase-sheet" class="more-sheet">

    <div class="more-scrim" onclick="Phase.closeSheet()"></div>

    <div class="more-panel">

        <div class="more-handle"></div>

        <div class="more-title">Trip Phase</div>

        ${this.VALUES.map(row).join("")}

        <div class="more-grp">&nbsp;</div>

        <button class="more-row" onclick="Phase.clearOverride()">
            <span class="more-ic">🔄</span>
            <span>${!isOverride ? "✓ " : ""}Auto (currently ${derived})</span>
        </button>

    </div>

</div>

`;
  },
};
