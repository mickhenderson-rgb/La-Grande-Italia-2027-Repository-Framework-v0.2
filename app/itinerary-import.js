/*
=========================================================

COMPASS-TOS

Itinerary Import

Version 1.0.0

Build 41

Bulk-load a whole trip skeleton at once, as a table, instead
of adding days one at a time. Two entry modes: a Grid Editor
(one row per day) and a Paste box (tab / pipe / comma data).

Columns: Date, From Location, To Location, Activity Type, Notes.

Notes on how this fits the app:
- Days use day.day (not dayNumber). Journey is Project.get("journey").days.
- Destinations are derived live from day.location / day.overnight, so no
  separate destination files are written here (the app never creates them).
- Day dates are derived facts: after import, Dates.recalculateJourney()
  re-sequences every date from the trip start date (respecting flights),
  so the Date column sets the start date and the number of days.
- Persistence is one journey write + one project write, not one per row.

=========================================================
*/

const ItineraryImport = {
  currentTab: "grid",

  mode: "replace",

  rows: [],

  pasteText: "",

  types: ["Travel", "Rest / Relaxation", "Explore / Sightseeing", "Accommodation", "Other"],

  open() {
    if (!Project.projectFolder) {
      Render.show(
        Layout.render(`

<div class="manager">

    <section class="hero">

        <h1>Itinerary Import</h1>

        <p>Open a trip first, then load its itinerary here.</p>

    </section>

    <div class="planner-buttons">

        <button type="button" onclick="Landing.open()">Choose a Trip</button>

    </div>

</div>

`),
      );

      return;
    }

    this.currentTab = "grid";

    this.mode = "replace";

    this.pasteText = this.pasteText || "";

    this.rows = this.seedRows();

    this.rerender();
  },

  rerender() {
    Render.show(Layout.render(this.render()));
  },

  render() {
    const proj = (Project.get("project") || {}).project || {};

    const dateRange = proj.departureDate
      ? `${proj.departureDate} → ${proj.returnDate || "?"}`
      : "Dates not set";

    const existing = (((Project.get("journey") || {}).days) || []).length;

    return `

<div class="manager">

    <section class="hero">

        <h1>Itinerary Import</h1>

        <p>Trip: <strong>${this.esc(proj.name || "Untitled Trip")}</strong> — ${this.esc(dateRange)}</p>

        <p>Load the whole trip at once, then fine-tune each day in the Planner.</p>

    </section>

    <div class="planner-buttons">

        ${this.tabButton("grid", "Grid Editor")}
        ${this.tabButton("paste", "Paste Data")}
        ${this.tabButton("help", "Help")}

    </div>

    ${existing ? this.renderModeSelector(existing) : ""}

    <div id="itin-tab-content">

        ${this.renderTabContent()}

    </div>

    <div id="itin-message"></div>

    <div class="planner-buttons">

        <button type="button" onclick="ItineraryImport.loadItinerary()">Load Itinerary</button>

        <button type="button" onclick="Router.navigate('planner')">Cancel</button>

    </div>

</div>

`;
  },

  tabButton(id, label) {
    const active = this.currentTab === id;

    const style = active ? "font-weight:700;text-decoration:underline;" : "";

    return `<button type="button" style="${style}" onclick="ItineraryImport.switchTab('${id}')">${label}</button>`;
  },

  renderModeSelector(count) {
    return `

<div class="manager-card">

    <p><strong>This trip already has ${count} day${count === 1 ? "" : "s"}.</strong> Choose what to do with them:</p>

    <label style="display:block;margin-top:6px;">
        <input type="radio" name="itin-mode" value="replace" ${this.mode === "replace" ? "checked" : ""} onchange="ItineraryImport.mode='replace'">
        Replace them with the imported itinerary
    </label>

    <label style="display:block;margin-top:6px;">
        <input type="radio" name="itin-mode" value="append" ${this.mode === "append" ? "checked" : ""} onchange="ItineraryImport.mode='append'">
        Keep them and append the new days after
    </label>

</div>

`;
  },

  renderTabContent() {
    if (this.currentTab === "paste") {
      return this.renderPasteTab();
    }

    if (this.currentTab === "help") {
      return this.renderHelpTab();
    }

    return this.renderGridTab();
  },

  renderGridTab() {
    const start = this.startSeed();

    return `

<div class="manager-card form-card">

    <div class="form-grid">

        <label class="form-field">
            Start Date
            <input type="text" id="itin-start" value="${this.esc(start)}" placeholder="YYYY-MM-DD" onchange="ItineraryImport.onStartDateChange()">
        </label>

        <label class="form-field">
            Days
            <input type="number" id="itin-days" min="1" value="${this.rows.length}" onchange="ItineraryImport.onDaysChange()">
        </label>

    </div>

    <datalist id="itin-types">
        ${this.types.map((t) => `<option value="${this.esc(t)}"></option>`).join("")}
    </datalist>

    <div style="overflow-x:auto;">

        <table style="width:100%;border-collapse:collapse;" class="itin-table">

            <thead>
                <tr style="text-align:left;">
                    <th style="padding:4px;">#</th>
                    <th style="padding:4px;">Date</th>
                    <th style="padding:4px;">From</th>
                    <th style="padding:4px;">To *</th>
                    <th style="padding:4px;">Type</th>
                    <th style="padding:4px;">Notes</th>
                    <th style="padding:4px;"></th>
                </tr>
            </thead>

            <tbody id="itin-grid-body">
                ${this.renderGridRows()}
            </tbody>

        </table>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="ItineraryImport.addGridRow()">+ Add Row</button>

    </div>

</div>

`;
  },

  renderGridRows() {
    return this.rows
      .map(
        (r, i) => `

<tr>
    <td style="padding:4px;">${i + 1}</td>
    <td style="padding:4px;"><input type="text" id="itin-date-${i}" value="${this.esc(r.date)}" style="width:120px;"></td>
    <td style="padding:4px;"><input type="text" id="itin-from-${i}" value="${this.esc(r.from)}"></td>
    <td style="padding:4px;"><input type="text" id="itin-to-${i}" value="${this.esc(r.to)}"></td>
    <td style="padding:4px;"><input type="text" id="itin-type-${i}" list="itin-types" value="${this.esc(r.type)}"></td>
    <td style="padding:4px;"><input type="text" id="itin-notes-${i}" value="${this.esc(r.notes)}"></td>
    <td style="padding:4px;"><button type="button" onclick="ItineraryImport.removeGridRow(${i})">✕</button></td>
</tr>

`,
      )
      .join("");
  },

  renderPasteTab() {
    const example = [
      "Date          | From      | To        | Type    | Notes",
      "2027-05-01    | Rome      | Rome      | Rest    | Arrive",
      "2027-05-02    | Rome      | Florence  | Travel  | Train",
      "2027-05-03    | Florence  | Florence  | Explore | Museums",
    ].join("\n");

    return `

<div class="manager-card form-card">

    <p>Paste rows as <strong>Date, From, To, Type, Notes</strong> — separated by tabs, pipes (|) or commas. A header row is detected and skipped automatically.</p>

    <textarea id="itin-paste" rows="12" style="width:100%;font-family:monospace;" placeholder="${this.esc(example)}">${this.esc(this.pasteText || "")}</textarea>

</div>

`;
  },

  renderHelpTab() {
    return `

<div class="manager-card">

    <h2>How to load an itinerary</h2>

    <p><strong>Grid Editor</strong> — set a Start Date and a number of Days, then fill each row. Only the <em>To</em> column (where you sleep that night) is required; From defaults to it. Use <strong>+ Add Row</strong> or the ✕ button to adjust.</p>

    <p><strong>Paste Data</strong> — copy a table out of a spreadsheet or document and paste it in. Columns can be separated by tabs, pipes (|) or commas.</p>

    <h3>Columns</h3>

    <ul>
        <li><strong>Date</strong> — YYYY-MM-DD or DD/MM/YYYY. The first date becomes the trip start; the rest are re-sequenced day-by-day.</li>
        <li><strong>From Location</strong> — where the day starts (optional).</li>
        <li><strong>To Location</strong> — where you stay overnight (required).</li>
        <li><strong>Activity Type</strong> — Travel, Rest, Explore, etc. (optional; defaults to Travel).</li>
        <li><strong>Notes</strong> — a short note kept against the day (optional).</li>
    </ul>

    <p>Each row becomes one day titled "From → To", which you can rename in the Planner afterwards.</p>

</div>

`;
  },

  switchTab(tab) {
    this.captureState();

    this.currentTab = tab;

    this.rerender();
  },

  captureState() {
    if (this.currentTab === "grid" && document.getElementById("itin-grid-body")) {
      this.syncGridFromDom();
    }

    if (this.currentTab === "paste") {
      const el = document.getElementById("itin-paste");

      if (el) {
        this.pasteText = el.value;
      }
    }
  },

  syncGridFromDom() {
    this.rows.forEach((r, i) => {
      const date = document.getElementById(`itin-date-${i}`);

      if (!date) {
        return;
      }

      r.date = date.value;

      r.from = document.getElementById(`itin-from-${i}`).value;

      r.to = document.getElementById(`itin-to-${i}`).value;

      r.type = document.getElementById(`itin-type-${i}`).value;

      r.notes = document.getElementById(`itin-notes-${i}`).value;
    });
  },

  refreshGridBody() {
    const body = document.getElementById("itin-grid-body");

    if (body) {
      body.innerHTML = this.renderGridRows();
    }

    const daysEl = document.getElementById("itin-days");

    if (daysEl) {
      daysEl.value = this.rows.length;
    }
  },

  onStartDateChange() {
    this.syncGridFromDom();

    const iso = this.formatDate(document.getElementById("itin-start").value) || this.startSeed();

    this.rows.forEach((r, i) => {
      r.date = this.addDays(iso, i);
    });

    this.refreshGridBody();
  },

  onDaysChange() {
    this.syncGridFromDom();

    let n = parseInt(document.getElementById("itin-days").value, 10);

    if (!n || n < 1) {
      n = 1;
    }

    const iso = this.formatDate(document.getElementById("itin-start").value) || this.startSeed();

    while (this.rows.length < n) {
      this.rows.push(this.blankRow());
    }

    if (this.rows.length > n) {
      this.rows = this.rows.slice(0, n);
    }

    this.rows.forEach((r, i) => {
      if (!r.date) {
        r.date = this.addDays(iso, i);
      }
    });

    this.refreshGridBody();
  },

  addGridRow() {
    this.syncGridFromDom();

    const iso = this.formatDate(this.startSeed()) || this.startSeed();

    const row = this.blankRow();

    row.date = iso ? this.addDays(iso, this.rows.length) : "";

    this.rows.push(row);

    this.refreshGridBody();
  },

  removeGridRow(index) {
    this.syncGridFromDom();

    this.rows.splice(index, 1);

    if (this.rows.length === 0) {
      this.rows.push(this.blankRow());
    }

    this.refreshGridBody();
  },

  blankRow() {
    return { date: "", from: "", to: "", type: "", notes: "" };
  },

  startSeed() {
    const proj = (Project.get("project") || {}).project || {};

    return proj.departureDate || "";
  },

  seedRows() {
    const proj = (Project.get("project") || {}).project || {};

    const journeyDays = ((Project.get("journey") || {}).days) || [];

    const start = proj.departureDate || "";

    let count = journeyDays.length;

    if (!count && proj.departureDate && proj.returnDate) {
      count = this.daysBetween(proj.departureDate, proj.returnDate);
    }

    if (!count || count < 1) {
      count = 1;
    }

    const rows = [];

    for (let i = 0; i < count; i++) {
      const d = journeyDays[i];

      rows.push({
        date: (d && d.date) || (start ? this.addDays(start, i) : ""),
        from: (d && d.location) || "",
        to: (d && d.overnight) || "",
        type: (d && d.activityType) || "",
        notes: (d && d.notes) || "",
      });
    }

    return rows;
  },

  // --- Pure helpers (unit-tested directly) ---

  formatDate(raw) {
    const s = String(raw || "").trim();

    if (!s) {
      return null;
    }

    let y;
    let m;
    let d;

    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);

    if (iso) {
      y = parseInt(iso[1], 10);

      m = parseInt(iso[2], 10);

      d = parseInt(iso[3], 10);
    } else {
      const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);

      if (!dmy) {
        return null;
      }

      d = parseInt(dmy[1], 10);

      m = parseInt(dmy[2], 10);

      y = parseInt(dmy[3], 10);
    }

    if (m < 1 || m > 12 || d < 1 || d > 31) {
      return null;
    }

    const date = new Date(Date.UTC(y, m - 1, d));

    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
      return null;
    }

    const mm = String(m).padStart(2, "0");

    const dd = String(d).padStart(2, "0");

    return `${y}-${mm}-${dd}`;
  },

  addDays(dateString, days) {
    const iso = this.formatDate(dateString) || dateString;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      return "";
    }

    const parts = iso.split("-").map((n) => parseInt(n, 10));

    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    date.setUTCDate(date.getUTCDate() + days);

    const yyyy = date.getUTCFullYear();

    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");

    const dd = String(date.getUTCDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
  },

  daysBetween(startDate, endDate) {
    const a = new Date(startDate + "T00:00:00Z");

    const b = new Date(endDate + "T00:00:00Z");

    return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  },

  slugify(text) {
    return String(text || "")
      .toLowerCase()
      .trim()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  },

  splitCsvLine(line) {
    const cells = [];

    let current = "";

    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';

          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        cells.push(current);

        current = "";
      } else {
        current += ch;
      }
    }

    cells.push(current);

    return cells.map((c) => c.trim());
  },

  parsePaste(text) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return [];
    }

    let delimiter = ",";

    if (lines.some((l) => l.includes("\t"))) {
      delimiter = "\t";
    } else if (lines.some((l) => l.includes("|"))) {
      delimiter = "|";
    }

    const split = (line) =>
      delimiter === ","
        ? this.splitCsvLine(line)
        : line.split(delimiter).map((c) => c.trim());

    const looksLikeHeader = (cells) => {
      const joined = cells.join(" ").toLowerCase();

      return joined.includes("date") && (joined.includes("to") || joined.includes("location") || joined.includes("from"));
    };

    let dataLines = lines;

    if (looksLikeHeader(split(lines[0]))) {
      dataLines = lines.slice(1);
    }

    return dataLines.map((line) => {
      const cells = split(line);

      return {
        date: cells[0] || "",
        from: cells[1] || "",
        to: cells[2] || "",
        type: cells[3] || "",
        notes: cells[4] || "",
      };
    });
  },

  validateRows(rows) {
    const errors = [];

    const warnings = [];

    rows.forEach((r, i) => {
      const n = i + 1;

      const dateRaw = String(r.date || "").trim();

      const from = String(r.from || "").trim();

      const to = String(r.to || "").trim();

      if (!this.formatDate(dateRaw)) {
        errors.push({ row: n, field: "date", message: `Invalid or missing date "${dateRaw}"` });
      }

      if (!to) {
        errors.push({ row: n, field: "to", message: "Missing 'To Location' (overnight stop)" });
      }

      if (!from) {
        warnings.push({ row: n, message: "No 'From Location' — will use the To Location" });
      }

      if (!String(r.type || "").trim()) {
        warnings.push({ row: n, message: "Activity Type blank — will default to 'Travel'" });
      }
    });

    return { errors, warnings };
  },

  createDays(rows, startNumber) {
    return rows.map((r, i) => {
      const from = String(r.from || "").trim();

      const to = String(r.to || "").trim();

      const type = String(r.type || "").trim() || "Travel";

      const notes = String(r.notes || "").trim();

      const title = from ? `${from} → ${to}` : to;

      return {
        day: startNumber + i,
        date: "",
        title: title,
        location: (from || to).toLowerCase(),
        overnight: to.toLowerCase(),
        locked: false,
        items: [],
        activityType: type,
        notes: notes,
      };
    });
  },

  // --- Load flow (browser) ---

  loadItinerary() {
    let rows;

    if (this.currentTab === "paste") {
      const el = document.getElementById("itin-paste");

      this.pasteText = el ? el.value : this.pasteText;

      rows = this.parsePaste(this.pasteText);
    } else {
      this.syncGridFromDom();

      rows = this.rows.slice();
    }

    rows = rows.filter((r) => {
      const any = [r.date, r.from, r.to, r.type, r.notes].map((v) => String(v || "").trim()).join("");

      return any.length > 0;
    });

    if (rows.length === 0) {
      this.showMessage(this.messageCard("Nothing to load", "Add at least one row with a destination before loading.", true));

      return;
    }

    const { errors, warnings } = this.validateRows(rows);

    if (errors.length > 0) {
      this.showMessage(this.renderErrors(errors));

      return;
    }

    if (warnings.length > 0) {
      const text = warnings.map((w) => `Day ${w.row}: ${w.message}`).join("\n");

      UI.confirm({
        title: "Create the itinerary anyway?",
        body: "These are not critical:\n\n" + text,
        confirmLabel: "Create anyway",
        cancelLabel: "Go back and fix them",
        onConfirm: () => this.applyItinerary(rows),
      });

      return;
    }

    this.applyItinerary(rows);
  },

  // Everything past the warnings question. Split out because the question
  // cannot block the way confirm() did.
  applyItinerary(rows) {
    const journey = Project.get("journey") || { version: "1.0", days: [] };

    const existing = Array.isArray(journey.days) ? journey.days : [];

    const projectData = Project.get("project");

    const firstIso = this.formatDate(rows[0].date);

    let finalDays;

    if (this.mode === "append" && existing.length > 0) {
      const startNumber = existing.reduce((max, d) => Math.max(max, d.day), 0) + 1;

      finalDays = existing.concat(this.createDays(rows, startNumber));
    } else {
      finalDays = this.createDays(rows, 1);

      if (projectData && projectData.project && firstIso) {
        const currentStart = projectData.project.departureDate;

        if (!currentStart) {
          projectData.project.departureDate = firstIso;
        } else if (currentStart !== firstIso) {
          // Asked, then BOTH answers carry on with the import - the
          // difference is only whether the trip's start date moves. As a
          // confirm(), "Cancel" looked like it abandoned the whole import.
          UI.confirm({
            title: `Update the trip start date to ${firstIso}?`,
            body: `The trip currently starts ${currentStart}, and this itinerary starts ${firstIso}.`,
            confirmLabel: `Use ${firstIso}`,
            cancelLabel: `Keep ${currentStart}`,
            onConfirm: () => {
              projectData.project.departureDate = firstIso;

              this.commitItinerary(rows, finalDays, journey, projectData);
            },
            onCancel: () => this.commitItinerary(rows, finalDays, journey, projectData),
          });

          return;
        }
      }
    }

    this.commitItinerary(rows, finalDays, journey, projectData);
  },

  // Everything past the start-date question.
  commitItinerary(rows, finalDays, journey, projectData) {

    journey.version = journey.version || "1.0";

    journey.days = finalDays;

    Project.load("journey", journey);

    Dates.recalculateJourney();

    if (projectData && projectData.project) {
      const days = (Project.get("journey") || {}).days || [];

      if (days.length > 0) {
        projectData.project.returnDate = days[days.length - 1].date;
      }

      projectData.statistics = projectData.statistics || {};

      projectData.statistics.plannedDays = days.length;

      projectData.statistics.plannedNights = Math.max(days.length - 1, 0);

      Project.update("project", projectData);
    }

    const destinations = new Set(
      rows.map((r) => String(r.to || r.from || "").trim().toLowerCase()).filter(Boolean),
    );

    this.renderSuccess(finalDays.length, destinations.size);

    setTimeout(() => Router.navigate("planner"), 1800);
  },

  showMessage(html) {
    const el = document.getElementById("itin-message");

    if (el) {
      el.innerHTML = html;

      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  },

  messageCard(heading, body, isError) {
    return `

<div class="manager-card" style="${isError ? "border-left:4px solid #b3541e;" : ""}">

    <h3>${isError ? "❌" : "⚠️"} ${this.esc(heading)}</h3>

    <p>${this.esc(body)}</p>

</div>

`;
  },

  renderErrors(errors) {
    const list = errors
      .map((e) => `<li>Day ${e.row}: ${this.esc(e.message)}</li>`)
      .join("");

    return `

<div class="manager-card" style="border-left:4px solid #b3541e;">

    <h3>❌ Itinerary has errors</h3>

    <p>Fix these rows, then load again:</p>

    <ul>${list}</ul>

</div>

`;
  },

  renderSuccess(dayCount, destCount) {
    Render.show(
      Layout.render(`

<div class="manager">

    <section class="hero">

        <h1>✅ Itinerary loaded</h1>

        <p>Created ${dayCount} day${dayCount === 1 ? "" : "s"} across ${destCount} destination${destCount === 1 ? "" : "s"}.</p>

        <p>Opening the Planner so you can fine-tune each day…</p>

    </section>

    <div class="planner-buttons">

        <button type="button" onclick="Router.navigate('planner')">Go to Planner now</button>

    </div>

</div>

`),
    );
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
