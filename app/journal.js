/*
=========================================================

COMPASS-TOS

Journal

Version 1.0.0

Build 16

One entry per day. Written before the trip (planning
notes), during it, and after (reflections) - the same entry
evolves rather than being replaced.

TWO WAYS IN, ONE ENTRY. "Tonight" is a fast path for the
evening of a travel day: pick today's photos, write what
happened, log what you spent, move on. "Entries" is the
full list, unchanged. Both edit the SAME entry - Tonight is
a shortcut, not a second copy, because two places holding
the same day's writing is how you end up with two halves of
it.

Tonight only appears when it can mean something: you're
travelling, and one of the journey's days is actually
today. Otherwise the tab isn't there.

EXPENSES ARE NOT COPIED HERE. You can add one from Tonight
because that's when you remember it, but Expenses owns
them and is where you read them back. Copying the figures
into the note text would leave the note wrong the moment an
expense was edited.

OFFLINE: not supported, and not pretended. Photos need the
connection. Text is cached in this browser as you type and
restored if you come back, so a failed save costs you
nothing - most places you'll stay have wifi, which is when
you'd be writing anyway.

=========================================================
*/

const Journal = {
  currentDay: null,

  // Which tab is showing. Not persisted: arriving at the Journal should
  // land you where the trip is up to, not where you were last time.
  tab: null,

  open(tab) {
    this.tab = tab || (this.todayDay() ? "tonight" : "entries");

    Render.show(Layout.render(this.renderTabs()));

    if (this.tab === "tonight") {
      this.restoreCachedText();
    }
  },

  // The journey day that is actually today, or null. Tonight hangs off
  // this: no such day, no tab.
  todayDay() {
    const journey = Project.get("journey");

    const days = journey && Array.isArray(journey.days) ? journey.days : [];

    const today = typeof Phase !== "undefined" ? Phase.todayISO() : new Date().toISOString().slice(0, 10);

    return days.find((d) => d.date === today) || null;
  },

  renderTabs() {
    const today = this.todayDay();

    const tab = (id, label) =>
      `<button type="button" class="jrn-tab ${this.tab === id ? "is-active" : ""}" onclick="Journal.open('${id}')">${label}</button>`;

    const body =
      this.tab === "tonight" && today
        ? this.renderTonight(today)
        : this.tab === "export"
          ? ""
          : this.renderList();

    if (this.tab === "export") {
      // Export is its own screen rather than a panel - it has its own
      // options and its own status line.
      JournalExport.open();

      return "";
    }

    return `

<div class="manager">

    <div class="jrn-tabs">
        ${today ? tab("tonight", "Tonight") : ""}
        ${tab("entries", "Entries")}
        ${tab("export", "Export")}
    </div>

    ${body}

</div>

`;
  },

  // ---------------------------------------------------------- Tonight

  renderTonight(day) {
    const entry = this.getEntry(day.day);

    const cached = this.cachedText(day.day);

    const text = cached !== null ? cached : entry.notes;

    const spend = this.spendFor(day.day);

    return `

<section class="hero">

    <h1>${this.esc(this.weekday(day.date))}</h1>

    <h2>${this.esc(Format.place(day.overnight || day.location) || day.title)}</h2>

    <p>${this.esc(Format.date(day.date))}</p>

</section>

<div class="manager-card" id="jrn-tonight-photos">

    <h2>Today's photos</h2>

    <p class="form-hint">${entry.photos.length ? `${entry.photos.length} added so far.` : "Nothing added yet."}</p>

    <div class="planner-buttons">

        <button type="button" class="btn-primary" onclick="document.getElementById('jrn-tonight-files').click()">
            Add today's photos
        </button>

        <input type="file" id="jrn-tonight-files" accept="image/*" multiple style="display:none"
               onchange="Journal.handleFilesSelected(${day.day}, this)">

    </div>

    <p class="form-hint" id="jrn-tonight-photo-status"></p>

</div>

<div class="manager-card form-card"
     data-guard="journal-tonight:${day.day}"
     data-guard-fields="jrn-tonight-notes">

    <h2>What happened today</h2>

    <label class="form-field form-field-wide">
        <textarea id="jrn-tonight-notes" rows="10" oninput="Journal.cacheText(${day.day})"
                  placeholder="Where you went, who you met, what it smelled like. The keyboard's microphone works here.">${this.esc(text)}</textarea>
    </label>

    <p class="form-hint" id="jrn-tonight-cache-note"></p>

</div>

<div class="manager-card">

    <h2>Today's spending</h2>

    <p>${spend.summary}</p>

    <p class="form-hint">Logged in Expenses, which is where you read it back - this is just a quicker way in while you remember.</p>

    <div class="form-grid">

        <label class="form-field">
            Amount
            <input type="number" id="jrn-spend-amount" min="0" step="0.01" placeholder="0.00">
        </label>

        <label class="form-field">
            Currency
            <select id="jrn-spend-currency">${Currency.currencyOptions(this.defaultCurrency())}</select>
        </label>

        <label class="form-field">
            Category
            <select id="jrn-spend-category">${Expenses.categoryOptions("Food")}</select>
        </label>

        <label class="form-field">
            What was it?
            <input type="text" id="jrn-spend-description" placeholder="e.g. Lunch in Sorrento">
        </label>

    </div>

    <div class="planner-buttons">
        <button type="button" onclick="Journal.logSpend(${day.day})">Log it</button>
        <button type="button" onclick="Router.navigate('dashboard'); Expenses.openAll();">Open Expenses</button>
    </div>

    <p class="form-hint" id="jrn-spend-status"></p>

</div>

<div class="planner-buttons">

    <button type="button" class="btn-primary" onclick="Journal.saveTonight(${day.day})">
        Save tonight
    </button>

    <button type="button" onclick="Journal.open('entries')">All entries</button>

</div>

`;
  },

  weekday(iso) {
    const date = Format.parseISO(iso);

    if (!date) {
      return "Tonight";
    }

    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
  },

  defaultCurrency() {
    const project = (Project.get("project") || {}).project || {};

    return project.currency || "EUR";
  },

  // A count and a total, per currency - never added across currencies, for
  // the same reason Expenses itself doesn't.
  spendFor(dayNumber) {
    const data = Project.get("expenses");

    const items = (data && Array.isArray(data.items) ? data.items : []).filter((i) => i.day === dayNumber);

    if (items.length === 0) {
      return { count: 0, summary: "Nothing logged today." };
    }

    const totals = {};

    items.forEach((i) => {
      const code = i.currency || "EUR";

      totals[code] = (totals[code] || 0) + (Number(i.amount) || 0);
    });

    const money = Object.keys(totals)
      .sort()
      .map((code) => Format.money(totals[code], code))
      .join(" + ");

    return {
      count: items.length,
      summary: `${money} across ${items.length} ${items.length === 1 ? "thing" : "things"}.`,
    };
  },

  // ------------------------------------------- text cached in this browser

  cacheKey(dayNumber) {
    return `compass-journal-${Data.currentProjectFolder}-${dayNumber}`;
  },

  cacheText(dayNumber) {
    const el = document.getElementById("jrn-tonight-notes");

    if (!el) {
      return;
    }

    try {
      localStorage.setItem(this.cacheKey(dayNumber), el.value);
    } catch (error) {
      // Private browsing, or storage full. The text is still on screen;
      // there's simply no safety net, and saying so would be noise on
      // every keystroke.
    }
  },

  cachedText(dayNumber) {
    try {
      return localStorage.getItem(this.cacheKey(dayNumber));
    } catch (error) {
      return null;
    }
  },

  clearCachedText(dayNumber) {
    try {
      localStorage.removeItem(this.cacheKey(dayNumber));
    } catch (error) {
      // Nothing to clean up if it was never stored.
    }
  },

  // Says so when what's on screen came from this browser rather than the
  // server - otherwise a restored draft looks identical to a saved one.
  restoreCachedText() {
    const day = this.todayDay();

    if (!day) {
      return;
    }

    const note = document.getElementById("jrn-tonight-cache-note");

    if (!note) {
      return;
    }

    const cached = this.cachedText(day.day);

    const saved = this.getEntry(day.day).notes || "";

    if (cached !== null && cached !== saved) {
      note.textContent = "This is a draft held on this device - it hasn't been saved to the trip yet.";
    }
  },

  // --------------------------------------------------------- the actions

  // Several photos at once. The picker allows multi-select now; before
  // this, adding an evening's photos meant repeating the whole flow per
  // photo.
  //
  // Uploaded one at a time on purpose: each photo is two uploads (display
  // and archive), and firing twenty of those at a hotel wifi connection is
  // how you get half of them.
  async handleFilesSelected(dayNumber, input) {
    const files = input && input.files ? Array.prototype.slice.call(input.files) : [];

    if (files.length === 0) {
      return;
    }

    const status = document.getElementById("jrn-tonight-photo-status");

    let done = 0;

    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      if (status) {
        status.textContent = `Uploading photo ${i + 1} of ${files.length}…`;
      }

      try {
        await this.processPhotoFile(dayNumber, files[i]);

        done++;
      } catch (error) {
        console.warn("Photo failed:", error);

        failed++;
      }
    }

    input.value = "";

    if (status) {
      status.textContent = failed
        ? `Added ${done} of ${files.length}. ${failed} didn't upload - check the connection and try those again.`
        : `Added ${done} ${done === 1 ? "photo" : "photos"}.`;
    }
  },

  async logSpend(dayNumber) {
    const amount = parseFloat(document.getElementById("jrn-spend-amount").value);

    const description = document.getElementById("jrn-spend-description").value.trim();

    const status = document.getElementById("jrn-spend-status");

    if (!(amount > 0)) {
      if (status) {
        status.textContent = "Enter an amount first.";
      }

      return;
    }

    const item = {
      day: dayNumber,
      addedBy: Project.currentUser || "",
      category: document.getElementById("jrn-spend-category").value,
      description: description,
      amount: amount,
      currency: document.getElementById("jrn-spend-currency").value,
      date: (this.todayDay() || {}).date || "",
      notes: "",
    };

    try {
      const response = await fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });

      if (!response.ok) {
        throw new Error("Save failed with status " + response.status);
      }

      const result = await response.json();

      const data = Project.get("expenses");

      if (data && Array.isArray(data.items)) {
        data.items.push(result.item);
      }

      // Confirmation, not a second view of the data: you need to know it
      // landed, but Expenses is where it's read back.
      if (status) {
        status.textContent = `Logged ${Format.money(item.amount, item.currency)} - ${item.description || item.category}.`;
      }

      document.getElementById("jrn-spend-amount").value = "";

      document.getElementById("jrn-spend-description").value = "";
    } catch (error) {
      if (status) {
        status.textContent = "Couldn't save that - check the connection. Nothing was logged.";
      }
    }
  },

  async saveTonight(dayNumber) {
    const el = document.getElementById("jrn-tonight-notes");

    if (!el) {
      return;
    }

    const result = this.ensureEntry(dayNumber);

    if (!result) {
      return;
    }

    const newNotes = el.value.trim();

    if (newNotes !== result.entry.notes) {
      result.entry.notesAuthor = Project.currentUser || result.entry.notesAuthor || "";
    }

    result.entry.notes = newNotes;

    Project.update("journal", result.data);

    this.clearCachedText(dayNumber);

    if (typeof FormGuard !== "undefined") {
      FormGuard.release();
    }

    // Tomorrow, if there is one. Writing tonight is the moment you're most
    // likely to want to glance at what's next.
    const journey = Project.get("journey");

    const days = journey && Array.isArray(journey.days) ? journey.days : [];

    const tomorrow = days.find((d) => d.day === dayNumber + 1);

    if (tomorrow) {
      Day.open(tomorrow.day);

      return;
    }

    this.open("entries");
  },

  renderList() {
    const journey = Project.get("journey");

    const days = journey && Array.isArray(journey.days) ? journey.days : [];

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Journal

        </h1>

        <p>

            ${days.length} day${days.length === 1 ? "" : "s"} in the journey.
            Write planning notes before you go, then come back and add
            photos and reflections along the way.

        </p>

    </section>

    <div class="manager-grid">

        ${days.map((day) => this.renderListCard(day)).join("")}

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="JournalExport.open()">

            📥 Export Journal

        </button>

        <button type="button" onclick="Router.navigate('dashboard')">

            ← Dashboard

        </button>

    </div>

</div>

`;
  },

  renderListCard(day) {
    const entry = this.getEntry(day.day);

    const checklistTotal = entry.checklist.length;

    const checklistDone = entry.checklist.filter((i) => i.checked).length;

    const snippet = entry.notes
      ? entry.notes.slice(0, 120) + (entry.notes.length > 120 ? "…" : "")
      : "No notes yet.";

    return `

<div class="manager-card">

    <h2>

        Day ${day.day} · ${this.esc(day.title)}

    </h2>

    <p>

        ${this.esc(Format.date(day.date))}

    </p>

    <p>

        ${this.esc(snippet)}

    </p>

    <p>

        📷 ${entry.photos.length} photo${entry.photos.length === 1 ? "" : "s"}
        · ✅ ${checklistDone}/${checklistTotal} checklist
        ${entry.location?.name ? `· 📍 ${this.esc(entry.location.name)}` : ""}

    </p>

    <button type="button" onclick="Journal.openDay(${day.day})">

        Open Journal Entry

    </button>

</div>

`;
  },

  openDay(dayNumber) {
    const journey = Project.get("journey");

    const day = journey && Array.isArray(journey.days)
      ? journey.days.find((d) => d.day === dayNumber)
      : null;

    if (!day) {
      return;
    }

    this.currentDay = day;

    Render.show(Layout.render(this.renderEntry(day)));
  },

  getEntry(dayNumber) {
    const data = Project.get("journal");

    if (!data || !Array.isArray(data.entries)) {
      return this.blankEntry(dayNumber);
    }

    return data.entries.find((e) => e.day === dayNumber) || this.blankEntry(dayNumber);
  },

  blankEntry(dayNumber) {
    return {
      day: dayNumber,
      notes: "",
      location: { name: "", address: "" },
      checklist: [],
      photos: [],
    };
  },

  // What's been typed into the entry but not saved yet, carried across the
  // page's OWN re-renders.
  //
  // Adding a checklist item or a photo saves that one thing live and then
  // calls openDay(), which rebuilds the page from STORED data - so anything
  // typed into the notes was silently destroyed by ticking a checkbox.
  // Notes are the one thing in this app you can't retype: you won't
  // remember what you wrote about Tuesday.
  //
  // Same shape as Transport.pendingImage - client-side only, never
  // persisted, discarded once the real save succeeds.
  draft: null,

  // Reads the entry fields out of the DOM before an action that re-renders.
  //
  // The day defaults to whichever entry is open, because half the handlers
  // that need this (toggleChecklistItem, removePhoto) are called from a row
  // and only know an item id.
  captureDraft(dayNumber) {
    const day = dayNumber === undefined || dayNumber === null ? this.currentDay && this.currentDay.day : dayNumber;

    const notes = document.getElementById("jrn-notes");

    if (!notes || day === undefined || day === null) {
      return;
    }

    const value = (id) => {
      const el = document.getElementById(id);

      return el ? el.value : "";
    };

    this.draft = {
      day: day,
      notes: notes.value,
      locationName: value("jrn-location-name"),
      locationAddress: value("jrn-location-address"),
    };
  },

  clearDraft() {
    this.draft = null;
  },

  // The draft wins over stored values, but only for the day it belongs to.
  draftFor(dayNumber) {
    return this.draft && this.draft.day === dayNumber ? this.draft : null;
  },

  renderEntry(day) {
    const entry = this.getEntry(day.day);

    const draft = this.draftFor(day.day);

    const notesValue = draft ? draft.notes : entry.notes;

    const locationName = draft ? draft.locationName : (entry.location || {}).name;

    const locationAddress = draft ? draft.locationAddress : (entry.location || {}).address;

    return `

<div class="manager"
     data-guard="journal:${day.day}"
     data-guard-fields="jrn-notes jrn-location-name jrn-location-address">

    <section class="hero">

        <h1>

            Journal · Day ${day.day}

        </h1>

        <h2>

            ${this.esc(day.title)}

        </h2>

        <p>

            ${this.esc(Format.date(day.date))}

        </p>

    </section>

    <div class="manager-grid">

        <div class="manager-card form-card">

            <h2>Notes</h2>

            <label class="form-field form-field-wide">
                Planning notes, reflections, memories...
                <textarea id="jrn-notes" rows="8">${this.esc(notesValue)}</textarea>
            </label>

            ${entry.notesAuthor ? `<p class="form-hint">Last edited by ${this.esc(entry.notesAuthor)}</p>` : ""}

        </div>

        <div class="manager-card form-card">

            <h2>Location</h2>

            <div class="form-grid">

                <label class="form-field">
                    Name
                    <input type="text" id="jrn-location-name" value="${this.esc(locationName)}" placeholder="e.g. Lake Como">
                </label>

                <label class="form-field">
                    Address / Details
                    <input type="text" id="jrn-location-address" value="${this.esc(locationAddress)}">
                </label>

            </div>

        </div>

        <div class="manager-card">

            <h2>Checklist</h2>

            <div class="research-list">

                ${entry.checklist.map((item) => this.renderChecklistItem(item)).join("") || "<p>No checklist items yet.</p>"}

            </div>

            <div class="form-grid">

                <label class="form-field form-field-wide">
                    New Checklist Item
                    <input type="text" id="jrn-new-checklist" placeholder="e.g. Pack passport">
                </label>

            </div>

            <button type="button" onclick="Journal.addChecklistItem(${day.day})">

                + Add Checklist Item

            </button>

        </div>

        <div class="manager-card">

            <h2>Photos</h2>

            <div class="research-list">

                ${entry.photos.map((photo) => this.renderPhoto(photo)).join("") || "<p>No photos yet.</p>"}

            </div>

            <div id="jrn-upload-status" class="form-hint"></div>

            <div class="planner-buttons">

                <button type="button" onclick="Journal.triggerCapture(${day.day})">

                    📷 Take Photo

                </button>

                <button type="button" onclick="Journal.triggerLibrary(${day.day})">

                    🖼 Choose from Library

                </button>

            </div>

            <input type="file" id="jrn-camera-input" accept="image/*" capture="environment" style="display:none" onchange="Journal.handleFileSelected(${day.day}, this)">

            <input type="file" id="jrn-library-input" accept="image/*" style="display:none" onchange="Journal.handleFileSelected(${day.day}, this)">

            <details style="margin-top: 14px;">

                <summary>Add a photo by link instead</summary>

                <div class="form-grid" style="margin-top: 10px;">

                    <label class="form-field">
                        Photo Link (URL)
                        <input type="text" id="jrn-new-photo-url" placeholder="https://...">
                    </label>

                    <label class="form-field">
                        Caption
                        <input type="text" id="jrn-new-photo-caption" placeholder="e.g. Sunset over the lake">
                    </label>

                </div>

                <button type="button" onclick="Journal.addPhoto(${day.day})">

                    + Add Photo Link

                </button>

            </details>

        </div>

    </div>

    <div class="planner-buttons">

        <button type="button" id="jrn-save-btn" onclick="Journal.save(${day.day})">

            Save Entry

        </button>

        <button type="button" onclick="Journal.open()">

            ← Journal List

        </button>

        <button type="button" onclick="Day.open(${day.day})">

            Day Workspace

        </button>

    </div>

    <!-- Next to the button that caused it. The sidebar has a save
         indicator, but it is across the page on a desktop and behind a
         hamburger on a phone, so nobody ever saw it. -->
    <p class="jrn-save-note" id="jrn-save-note" role="status" aria-live="polite"></p>

</div>

`;
  },

  renderChecklistItem(item) {
    return `

<div class="research-item">

    <label class="form-checkbox">
        <input type="checkbox" ${item.checked ? "checked" : ""} onchange="Journal.toggleChecklistItem('${item.id}', this.checked)">
        ${this.esc(item.text)}
    </label>

    ${item.addedBy ? `<p class="form-hint">Added by ${this.esc(item.addedBy)}</p>` : ""}

    <div class="research-actions">

        <button type="button" onclick="Journal.removeChecklistItem('${item.id}')">

            Remove

        </button>

    </div>

</div>

`;
  },

  renderPhoto(photo) {
    const isUpload = String(photo.url || "").startsWith("data/projects/");

    return `

<div class="research-item">

    ${isUpload ? `<img src="${this.esc(photo.url)}" alt="${this.esc(photo.caption)}" style="width:100%;border-radius:8px;margin-bottom:8px;">` : ""}

    <strong>${this.esc(photo.caption) || "Untitled"}</strong>

    ${isUpload ? "" : `<p>${this.esc(photo.url)}</p>`}

    ${photo.addedBy ? `<p class="form-hint">Added by ${this.esc(photo.addedBy)}</p>` : ""}

    <div class="research-actions">

        <a class="map-btn" href="${this.esc(photo.url)}" target="_blank" rel="noopener">${isUpload ? "Open Full Size" : "Open Link"}</a>

        <button type="button" onclick="Journal.removePhoto('${photo.id}')">

            Remove

        </button>

    </div>

</div>

`;
  },

  ensureEntry(dayNumber) {
    const data = Project.get("journal");

    if (!data || !Array.isArray(data.entries)) {
      return null;
    }

    let entry = data.entries.find((e) => e.day === dayNumber);

    if (!entry) {
      entry = this.blankEntry(dayNumber);

      data.entries.push(entry);
    }

    return { data, entry };
  },

  addChecklistItem(dayNumber) {
    // Stash the typed entry before this re-renders the page from stored
    // data - otherwise adding a checklist item wipes unsaved notes.
    this.captureDraft(dayNumber);

    const input = document.getElementById("jrn-new-checklist");

    const text = input.value.trim();

    if (!text) {
      return;
    }

    input.disabled = true;

    fetch(`${window.API_BASE}/api/journal/${Data.currentProjectFolder}/${dayNumber}/checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Save failed with status ${response.status}`);
        }

        return response.json();
      })
      .then((result) => {
        this.syncEntryLocally(dayNumber, result.entry);

        this.openDay(dayNumber);
      })
      .catch((error) => {
        console.error("Could not add checklist item:", error);

        UI.fail("Couldn't save that checklist item. Check the connection and try again.");

        input.disabled = false;
      });
  },

  toggleChecklistItem(id, checked) {
    // Stash the typed entry first - this re-renders from stored data.
    this.captureDraft();

    const dayNumber = this.currentDay.day;

    fetch(`${window.API_BASE}/api/journal/${Data.currentProjectFolder}/${dayNumber}/checklist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Save failed with status ${response.status}`);
        }

        // Keep the in-memory copy in sync so other reads (e.g. Day panel
        // summaries) reflect this without needing a full page reload.
        const data = Project.get("journal");

        const entry = data && data.entries.find((e) => e.day === dayNumber);

        const item = entry && entry.checklist.find((i) => i.id === id);

        if (item) {
          item.checked = checked;
        }
      })
      .catch((error) => {
        console.error("Could not update checklist item:", error);

        UI.fail("Couldn't save that change. Check the connection and try again.");

        this.openDay(dayNumber);
      });
  },

  removeChecklistItem(id) {
    // Stash the typed entry first - this re-renders from stored data.
    this.captureDraft();

    UI.confirm({
      title: "Remove this checklist item?",
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: () => this.removeChecklistItemConfirmed(id),
    });
  },

  removeChecklistItemConfirmed(id) {
    const dayNumber = this.currentDay.day;

    fetch(`${window.API_BASE}/api/journal/${Data.currentProjectFolder}/${dayNumber}/checklist/${id}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Remove failed with status ${response.status}`);
        }

        const data = Project.get("journal");

        const entry = data && data.entries.find((e) => e.day === dayNumber);

        if (entry) {
          entry.checklist = entry.checklist.filter((i) => i.id !== id);
        }

        this.openDay(dayNumber);
      })
      .catch((error) => {
        console.error("Could not remove checklist item:", error);

        UI.fail("Couldn't remove that item. Check the connection and try again.");
      });
  },

  addPhoto(dayNumber) {
    // Stash the typed entry before this re-renders the page from stored
    // data - otherwise adding a checklist item wipes unsaved notes.
    this.captureDraft(dayNumber);

    const url = document.getElementById("jrn-new-photo-url").value.trim();

    const caption = document.getElementById("jrn-new-photo-caption").value.trim();

    if (!url) {
      UI.warn("Please enter a photo link before adding.");
      return;
    }

    fetch(`${window.API_BASE}/api/journal/${Data.currentProjectFolder}/${dayNumber}/photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, caption }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Save failed with status ${response.status}`);
        }

        return response.json();
      })
      .then((result) => {
        this.syncEntryLocally(dayNumber, result.entry);

        this.openDay(dayNumber);
      })
      .catch((error) => {
        console.error("Could not add photo link:", error);

        UI.fail("Couldn't save that photo link. Check the connection and try again.");
      });
  },

  syncEntryLocally(dayNumber, entry) {
    const data = Project.get("journal");

    if (!data || !Array.isArray(data.entries) || !entry) {
      return;
    }

    const index = data.entries.findIndex((e) => e.day === dayNumber);

    if (index === -1) {
      data.entries.push(entry);
    } else {
      data.entries[index] = entry;
    }
  },

  triggerCapture(dayNumber) {
    this.pendingDay = dayNumber;

    document.getElementById("jrn-camera-input").click();
  },

  triggerLibrary(dayNumber) {
    // Stash the typed entry first - this re-renders from stored data.
    this.captureDraft();

    this.pendingDay = dayNumber;

    document.getElementById("jrn-library-input").click();
  },

  // The single-photo button. Reads one file off the input, uploads it,
  // then rebuilds the entry page so the new photo appears.
  async handleFileSelected(dayNumber, inputEl) {
    const file = inputEl.files && inputEl.files[0];

    inputEl.value = "";

    if (!file) {
      return;
    }

    const statusEl = document.getElementById("jrn-upload-status");

    const say = (text) => {
      if (statusEl) {
        statusEl.textContent = text;
      }
    };

    try {
      await this.processPhotoFile(dayNumber, file, say);

      say("");

      this.openDay(dayNumber);
    } catch (error) {
      console.error("Photo upload failed:", error);

      say("Upload failed - check the connection.");

      UI.fail("Couldn't upload that photo. Check the connection and try again.");
    }
  },

  // Uploads ONE photo as two copies and attaches it to the day.
  //
  // Deliberately does not re-render: Tonight uploads a batch and rebuilds
  // once at the end, and a re-render per photo would throw away whatever
  // was being typed between uploads.
  //
  // `say` reports progress; callers own where that text goes.
  async processPhotoFile(dayNumber, file, say) {
    const report = say || (() => {});

    report("Processing photo…");

    const displayDataUrl = await this.resizeImage(file, this.DISPLAY_MAX_PX, this.DISPLAY_QUALITY);

    report("Uploading…");

    const url = await this.uploadPhoto(displayDataUrl);

    // The print-quality copy, second and separately: if it fails on a weak
    // connection the photo is still added, just without an archive. Losing
    // the archive is a smaller loss than losing the photo.
    let archiveUrl = "";

    try {
      report("Saving a print-quality copy…");

      const archiveDataUrl = await this.resizeImage(file, this.ARCHIVE_MAX_PX, this.ARCHIVE_QUALITY);

      archiveUrl = await this.uploadPhoto(archiveDataUrl);
    } catch (error) {
      console.warn("Could not save the print-quality copy:", error);
    }

    const caption = this.autoCaption(file);

    const taken = await this.locationOf(file);

    const addResponse = await fetch(`${window.API_BASE}/api/journal/${Data.currentProjectFolder}/${dayNumber}/photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, caption, archiveUrl, location: taken.location, takenAt: taken.takenAt }),
    });

    if (!addResponse.ok) {
      throw new Error(`Save failed with status ${addResponse.status}`);
    }

    const result = await addResponse.json();

    this.syncEntryLocally(dayNumber, result.entry);

    return result;
  },

  // Two copies of every photo, for two different jobs.
  //
  // DISPLAY is what the app shows. It has to be small, because a journal
  // day renders a dozen of them and you'll be opening it on Italian mobile
  // data.
  //
  // ARCHIVE is what a print export uses. 3200px is ~300 DPI across a 270mm
  // page, which covers any single page in a photo book plus room to crop.
  // A full double-page spread wants nearer 4700px - that, and genuinely
  // lossless originals, are a V2 problem needing real storage.
  //
  // The old single copy was 1600px, or about 200 DPI on a book page:
  // visibly soft in print, and unrecoverable once the original is off the
  // phone. Raising it without splitting the two would have traded a print
  // problem for a browsing one.
  DISPLAY_MAX_PX: 1600,

  ARCHIVE_MAX_PX: 3200,

  DISPLAY_QUALITY: 0.8,

  ARCHIVE_QUALITY: 0.88,

  resizeImage(file, maxDimension, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error("Could not read file."));

      reader.onload = () => {
        const img = new Image();

        img.onerror = () => reject(new Error("Could not decode image."));

        img.onload = () => {
          let { width, height } = img;

          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round((height / width) * maxDimension);
              width = maxDimension;
            } else {
              width = Math.round((width / height) * maxDimension);
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");

          ctx.drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL("image/jpeg", quality));
        };

        img.src = reader.result;
      };

      reader.readAsDataURL(file);
    });
  },

  async uploadPhoto(dataUrl) {
    const response = await fetch(`${window.API_BASE}/api/upload/${Data.currentProjectFolder}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    const result = await response.json();

    return result.url;
  },

  // WHERE AND WHEN A PHOTO WAS TAKEN, READ BEFORE THE CANVAS EATS IT.
  //
  // resizeImage draws onto a canvas and reads back with toDataURL, which
  // produces a clean JPEG carrying NO metadata at all. So this has to
  // happen on the original File, and it has to happen first.
  //
  // Never fatal. A photo with no location is an ordinary photo, and
  // losing the picture over a missing header would be absurd.
  async locationOf(file) {
    if (typeof Exif === "undefined") {
      return { location: null, takenAt: "" };
    }

    const found = await Exif.read(file);

    if (!found) {
      return { location: null, takenAt: "" };
    }

    return {
      location: found.lat === null ? null : { lat: found.lat, lng: found.lng, source: "photo" },
      takenAt: found.takenAt || "",
    };
  },

  // --- Breadcrumbs (v1.45.0) -------------------------------------------

  // A LOCATION STAMPED ON SOMETHING YOU LOGGED WHILE THE APP WAS OPEN.
  //
  // Photos carry their own coordinates, which is the better record - they
  // mark the places worth stopping at. Breadcrumbs fill the gaps: the
  // lunch you logged a spend for and did not photograph.
  //
  // OFF UNTIL YOU TURN IT ON. Asking for someone's location the first time
  // they jot a note, unprompted, is not a thing to spring on anyone - and
  // the setting is where the explanation lives.
  //
  // This is NOT tracking, and cannot become it: a browser only answers
  // while the page is open and awake. iOS suspends the JS the moment the
  // screen locks. What this records is where you were when you used the
  // app, which is exactly what it claims.
  breadcrumbsOn() {
    const data = Project.get("project");

    return !!(data && data.settings && data.settings.trace && data.settings.trace.breadcrumbs);
  },

  // Fire and forget. A breadcrumb is a nicety; the note or the spend it
  // rides along with is the thing that matters, so nothing here is allowed
  // to delay or fail a save.
  breadcrumb(dayNumber) {
    if (!this.breadcrumbsOn()) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => this.recordPoint(dayNumber, position),
      // Declined, or no fix. Neither is worth a message: you did not ask
      // for a breadcrumb, you asked to save a note.
      () => {},
      // A stale fix is fine for "roughly where was I" and avoids spinning
      // up the GPS for a minute to place a coffee.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  },

  recordPoint(dayNumber, position) {
    const coords = position && position.coords;

    if (!coords || typeof coords.latitude !== "number" || typeof coords.longitude !== "number") {
      return;
    }

    const result = this.ensureEntry(dayNumber);

    if (!result) {
      return;
    }

    result.entry.trace = Array.isArray(result.entry.trace) ? result.entry.trace : [];

    const point = {
      lat: Math.round(coords.latitude * 1e5) / 1e5,
      lng: Math.round(coords.longitude * 1e5) / 1e5,
      at: new Date().toISOString().slice(0, 19),
      source: "device",
    };

    // Standing in the same cafe logging three things is one place, not
    // three. Roughly 50 metres, which is inside the accuracy of a phone
    // fix indoors anyway.
    const last = result.entry.trace[result.entry.trace.length - 1];

    if (last && Math.abs(last.lat - point.lat) < 0.0005 && Math.abs(last.lng - point.lng) < 0.0005) {
      return;
    }

    result.entry.trace.push(point);

    Project.update("journal", result.data);
  },

  // Everywhere the day says you actually were, photos and breadcrumbs
  // together, in the order it happened.
  //
  // Photos first as the better record, but sorted by time so the day reads
  // as a sequence rather than as two lists stapled together.
  traceFor(dayNumber) {
    const data = Project.get("journal");

    const entries = data && Array.isArray(data.entries) ? data.entries : [];

    const entry = entries.find((e) => e.day === dayNumber);

    if (!entry) {
      return [];
    }

    const points = [];

    (entry.photos || []).forEach((photo) => {
      if (photo.location && typeof photo.location.lat === "number") {
        points.push({
          lat: photo.location.lat,
          lng: photo.location.lng,
          at: photo.takenAt || "",
          source: "photo",
          caption: photo.caption || "",
        });
      }
    });

    (entry.trace || []).forEach((point) => {
      if (typeof point.lat === "number") {
        points.push({ lat: point.lat, lng: point.lng, at: point.at || "", source: "device", caption: "" });
      }
    });

    // An undated point sorts last rather than to the front, where an empty
    // string would otherwise put it.
    return points.sort((a, b) => (a.at || "9999").localeCompare(b.at || "9999"));
  },

  autoCaption(file) {
    const timestamp = file.lastModified ? new Date(file.lastModified) : new Date();

    const formatted = timestamp.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return `Photo - ${formatted}`;
  },

  removePhoto(id) {
    // Stash the typed entry first - this re-renders from stored data.
    this.captureDraft();

    UI.confirm({
      title: "Remove this photo?",
      body: "This cannot be undone.",
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: () => this.removePhotoConfirmed(id),
    });
  },

  removePhotoConfirmed(id) {
    const dayNumber = this.currentDay.day;

    fetch(`${window.API_BASE}/api/journal/${Data.currentProjectFolder}/${dayNumber}/photo/${id}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Remove failed with status ${response.status}`);
        }

        const data = Project.get("journal");

        const entry = data && data.entries.find((e) => e.day === dayNumber);

        if (entry) {
          entry.photos = entry.photos.filter((p) => p.id !== id);
        }

        this.openDay(dayNumber);
      })
      .catch((error) => {
        console.error("Could not remove photo:", error);

        UI.fail("Couldn't remove that photo. Check the connection and try again.");
      });
  },

  save(dayNumber) {
    const result = this.ensureEntry(dayNumber);

    if (!result) {
      return;
    }

    const newNotes = document.getElementById("jrn-notes").value.trim();

    if (newNotes !== result.entry.notes) {
      result.entry.notesAuthor = Project.currentUser || result.entry.notesAuthor || "";
    }

    result.entry.notes = newNotes;

    result.entry.location = {
      name: document.getElementById("jrn-location-name").value.trim(),
      address: document.getElementById("jrn-location-address").value.trim(),
    };

    const note = document.getElementById("jrn-save-note");

    const button = document.getElementById("jrn-save-btn");

    const say = (text, ok) => {
      if (note) {
        note.textContent = text;

        note.className = "jrn-save-note" + (ok === true ? " is-ok" : ok === false ? " is-bad" : "");
      }
    };

    if (button) {
      button.disabled = true;
    }

    say("Saving…");

    // AWAITED. This used to fire the save and immediately re-render, which
    // rebuilt the sidebar and wiped the only indicator there was - so a
    // save that worked looked identical to a save that failed, and both
    // looked like nothing had happened at all.
    Project.update("journal", result.data)
      .then(() => {
        // Saved, so the stashed copy is stale and there is nothing unsaved
        // left to warn about. Order matters: clear before the re-render, or
        // renderEntry would prefer the draft over what was just written.
        this.clearDraft();

        if (typeof FormGuard !== "undefined") {
          FormGuard.release();
        }

        this.openDay(dayNumber);

        // After the re-render, because openDay() replaces the element the
        // message lives in.
        const fresh = document.getElementById("jrn-save-note");

        if (fresh) {
          fresh.textContent = "✓ Entry saved";

          fresh.className = "jrn-save-note is-ok";
        }
      })
      .catch(() => {
        // The draft is deliberately KEPT and the page deliberately NOT
        // re-rendered: what was typed is now the only copy that exists.
        if (button) {
          button.disabled = false;
        }

        say("Couldn't save - your writing is still here. Check the connection and try again.", false);
      });
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
