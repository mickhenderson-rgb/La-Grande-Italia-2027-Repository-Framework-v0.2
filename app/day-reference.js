/*
=========================================================

COMPASS-TOS

Day Reference Strip

Version 1.0.0

Shared, collapsible "which Planner day is this?" strip
embedded inside a booking form (Accommodation, Activities,
Restaurants, Transport, Flights). Lists every journey day
with its real calendar date and title so a day number can
be matched against an actual booking without leaving the
page. Each caller module supplies its own pickDay(...) -
this file only renders the list and wires the buttons to
call it.

=========================================================
*/

const DayReference = {
  // mode "range" shows Start/End buttons per row (calls pickDay(day, 'start'|'end'));
  // mode "single" shows one button per row (calls pickDay(day)).
  render(moduleName, mode, labels) {
    const journey = Project.get("journey");

    const days = journey && Array.isArray(journey.days) ? journey.days : [];

    if (days.length === 0) {
      return "";
    }

    const resolvedLabels =
      labels || (mode === "range" ? { start: "Start", end: "End" } : { single: "Use This Day" });

    const rows = days
      .map((day) => {
        const dateLabel = day.date ? this.formatDateLabel(day.date) : "no date set";

        const place = this.esc(day.title || this.pretty(day.overnight || day.location || ""));

        const actions =
          mode === "range"
            ? `<button type="button" class="btn-mini" onclick="${moduleName}.pickDay(${day.day}, 'start')">→ ${resolvedLabels.start}</button>
               <button type="button" class="btn-mini" onclick="${moduleName}.pickDay(${day.day}, 'end')">→ ${resolvedLabels.end}</button>`
            : `<button type="button" class="btn-mini" onclick="${moduleName}.pickDay(${day.day})">→ ${resolvedLabels.single}</button>`;

        return `

<div class="day-ref-row">

    <span class="day-ref-num">Day ${day.day}</span>

    <span class="day-ref-date">${dateLabel}</span>

    <span class="day-ref-place">${place}</span>

    <span class="day-ref-actions">${actions}</span>

</div>

`;
      })
      .join("");

    return `

<details class="day-ref">

    <summary>📅 Planner day reference — line up this entry with the real dates</summary>

    <div class="day-ref-list">${rows}</div>

</details>

`;
  },

  formatDateLabel(dateString) {
    const parts = String(dateString || "").split("-").map((n) => parseInt(n, 10));

    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
      return dateString || "";
    }

    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    const weekday = date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

    const month = date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

    return `${weekday} ${String(parts[2]).padStart(2, "0")} ${month}`;
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  pretty(value) {
    return String(value || "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  },
};
