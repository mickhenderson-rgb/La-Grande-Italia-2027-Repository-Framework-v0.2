/*
=========================================================

COMPASS-TOS

Capture

Version 1.0.0

Bottom sheet reachable from the FAB on any page - Photo,
Note, Spend, each filing against "today's" journey day
automatically (the day whose date matches today; before or
after the trip, falls back to day 1). Reuses the Journal
module's existing photo resize/upload helpers and the
Expenses item-level API rather than duplicating them.

Deliberately does not navigate away or force a re-render of
whatever page the sheet was opened from - it just saves and
closes. If that page happens to be showing a now-stale count
(e.g. the Day workspace's Journal/Expenses panels), it picks
up the change next time it's opened, same as any other
cross-module edit in this app.

=========================================================
*/

const Capture = {
  view: "menu",

  dayNumber: null,

  open(startView) {
    this.view = startView || "menu";

    this.dayNumber = this.currentDayNumber();

    let sheet = document.getElementById("capture-sheet");

    if (!sheet) {
      document.body.insertAdjacentHTML("beforeend", this.renderSheet());
    } else {
      sheet.outerHTML = this.renderSheet();
    }

    document.getElementById("capture-sheet").classList.add("is-open");
  },

  close() {
    const sheet = document.getElementById("capture-sheet");

    if (sheet) {
      sheet.classList.remove("is-open");
    }
  },

  // The journey day whose real date is today, or day 1 as a sensible
  // fallback before the trip starts / after it ends (there's no "today"
  // inside the trip in either case, but logging still has to land somewhere
  // findable rather than being silently dropped).
  currentDayNumber() {
    const journey = Project.get("journey");

    const days = journey && Array.isArray(journey.days) ? journey.days : [];

    if (days.length === 0) {
      return 1;
    }

    const todayISO = Phase.todayISO();

    const match = days.find((d) => d.date === todayISO);

    return match ? match.day : days[0].day;
  },

  rerenderPanel() {
    const panel = document.querySelector("#capture-sheet .more-panel");

    if (panel) {
      panel.outerHTML = this.renderPanel();
    }
  },

  renderSheet() {
    return `

<div id="capture-sheet" class="more-sheet">

    <div class="more-scrim" onclick="Capture.close()"></div>

    ${this.renderPanel()}

    <input type="file" id="capture-photo-input" accept="image/*" style="display:none" onchange="Capture.handlePhotoSelected(this)">

</div>

`;
  },

  renderPanel() {
    if (this.view === "note") {
      return this.renderNotePanel();
    }

    if (this.view === "spend") {
      return this.renderSpendPanel();
    }

    return this.renderMenuPanel();
  },

  renderMenuPanel() {
    return `

<div class="more-panel">

    <div class="more-handle"></div>

    <div class="more-title">Capture · Day ${this.dayNumber}</div>

    <button class="more-row" onclick="document.getElementById('capture-photo-input').click()">
        <span class="more-ic">📷</span>
        <span>Photo</span>
    </button>

    <button class="more-row" onclick="Capture.view='note'; Capture.rerenderPanel()">
        <span class="more-ic">📝</span>
        <span>Note</span>
    </button>

    <button class="more-row" onclick="Capture.view='spend'; Capture.rerenderPanel()">
        <span class="more-ic">💰</span>
        <span>Spend</span>
    </button>

</div>

`;
  },

  renderNotePanel() {
    const entry = typeof Journal !== "undefined" ? Journal.getEntry(this.dayNumber) : { notes: "" };

    return `

<div class="more-panel">

    <div class="more-handle"></div>

    <div class="more-title">Note · Day ${this.dayNumber}</div>

    <label class="form-field form-field-wide">
        <textarea id="capture-note-text" rows="4" placeholder="Quick note for today...">${this.esc(entry.notes)}</textarea>
    </label>

    <div class="planner-buttons">
        <button type="button" onclick="Capture.saveNote()">Save</button>
        <button type="button" onclick="Capture.view='menu'; Capture.rerenderPanel()">Back</button>
    </div>

</div>

`;
  },

  saveNote() {
    if (typeof Journal === "undefined") {
      this.close();

      return;
    }

    const text = document.getElementById("capture-note-text").value.trim();

    const result = Journal.ensureEntry(this.dayNumber);

    if (!result) {
      this.close();

      return;
    }

    if (text !== result.entry.notes) {
      result.entry.notesAuthor = Project.currentUser || result.entry.notesAuthor || "";
    }

    result.entry.notes = text;

    Project.update("journal", result.data);

    this.close();
  },

  renderSpendPanel() {
    return `

<div class="more-panel">

    <div class="more-handle"></div>

    <div class="more-title">Spend · Day ${this.dayNumber}</div>

    <div class="form-grid">

        <label class="form-field">
            Amount
            <input type="number" id="capture-spend-amount" min="0" step="0.01" value="0">
        </label>

        <label class="form-field">
            Currency
            <select id="capture-spend-currency">${typeof Currency !== "undefined" ? Currency.currencyOptions(Currency.displayCurrency()) : '<option value="EUR">EUR</option>'}</select>
        </label>

        <label class="form-field">
            Category
            <select id="capture-spend-category">
                ${["Food", "Transport", "Shopping", "Tips", "Entry Fees", "Other"].map((c) => `<option value="${c}">${c}</option>`).join("")}
            </select>
        </label>

        <label class="form-field form-field-wide">
            Description
            <input type="text" id="capture-spend-description" placeholder="e.g. Coffee at Navigli">
        </label>

    </div>

    <div class="planner-buttons">
        <button type="button" onclick="Capture.saveSpend()">Save</button>
        <button type="button" onclick="Capture.view='menu'; Capture.rerenderPanel()">Back</button>
    </div>

</div>

`;
  },

  saveSpend() {
    const amount = parseFloat(document.getElementById("capture-spend-amount").value) || 0;

    const fields = {
      day: this.dayNumber,
      addedBy: Project.currentUser || "",
      category: document.getElementById("capture-spend-category").value,
      description: document.getElementById("capture-spend-description").value.trim(),
      amount,
      currency: document.getElementById("capture-spend-currency").value.trim() || "EUR",
      date: "",
      notes: "",
    };

    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Save failed with status ${response.status}`);
        }

        return response.json();
      })
      .then((result) => {
        const data = Project.get("expenses");

        if (data && Array.isArray(data.items)) {
          data.items.push(result.item);
        }

        this.close();
      })
      .catch((error) => {
        console.error("Could not save expense:", error);

        alert("Couldn't save that expense. Check the connection and try again.");
      });
  },

  async handlePhotoSelected(inputEl) {
    const file = inputEl.files && inputEl.files[0];

    inputEl.value = "";

    if (!file || typeof Journal === "undefined") {
      return;
    }

    const panel = document.querySelector("#capture-sheet .more-panel");

    if (panel) {
      panel.outerHTML = `<div class="more-panel"><div class="more-handle"></div><div class="more-title">Uploading photo...</div></div>`;
    }

    try {
      const resizedDataUrl = await Journal.resizeImage(file, 1600, 0.8);

      const url = await Journal.uploadPhoto(resizedDataUrl);

      const caption = Journal.autoCaption(file);

      const addResponse = await fetch(`${window.API_BASE}/api/journal/${Data.currentProjectFolder}/${this.dayNumber}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, caption }),
      });

      if (!addResponse.ok) {
        throw new Error(`Save failed with status ${addResponse.status}`);
      }

      const result = await addResponse.json();

      Journal.syncEntryLocally(this.dayNumber, result.entry);

      this.close();
    } catch (error) {
      console.error("Capture photo upload failed:", error);

      alert("Couldn't upload that photo. Check the connection and try again.");

      this.close();
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
