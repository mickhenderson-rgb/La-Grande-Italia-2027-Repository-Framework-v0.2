/*
=========================================================

COMPASS-TOS

Journal

Version 1.0.0

Build 16

One entry per day. Can be written before the trip (planning
notes), during, and after (reflections) - the same entry
just evolves over time. Photos are stored as links/captions
(facts) since this is a static local app with no file
upload/storage backend.

=========================================================
*/

const Journal = {
  currentDay: null,

  open() {
    Render.show(Layout.render(this.renderList()));
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

        ${this.esc(day.date)}

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

  renderEntry(day) {
    const entry = this.getEntry(day.day);

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Journal · Day ${day.day}

        </h1>

        <h2>

            ${this.esc(day.title)}

        </h2>

        <p>

            ${this.esc(day.date)}

        </p>

    </section>

    <div class="manager-grid">

        <div class="manager-card form-card">

            <h2>Notes</h2>

            <label class="form-field form-field-wide">
                Planning notes, reflections, memories...
                <textarea id="jrn-notes" rows="8">${this.esc(entry.notes)}</textarea>
            </label>

        </div>

        <div class="manager-card form-card">

            <h2>Location</h2>

            <div class="form-grid">

                <label class="form-field">
                    Name
                    <input type="text" id="jrn-location-name" value="${this.esc(entry.location?.name)}" placeholder="e.g. Lake Como">
                </label>

                <label class="form-field">
                    Address / Details
                    <input type="text" id="jrn-location-address" value="${this.esc(entry.location?.address)}">
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

                ${entry.photos.map((photo) => this.renderPhoto(photo)).join("") || "<p>No photos linked yet.</p>"}

            </div>

            <div class="form-grid">

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

        </div>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Journal.save(${day.day})">

            Save Entry

        </button>

        <button type="button" onclick="Journal.open()">

            ← Journal List

        </button>

        <button type="button" onclick="Day.open(${day.day})">

            Day Workspace

        </button>

    </div>

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

    <div class="research-actions">

        <button type="button" onclick="Journal.removeChecklistItem('${item.id}')">

            Remove

        </button>

    </div>

</div>

`;
  },

  renderPhoto(photo) {
    return `

<div class="research-item">

    <strong>${this.esc(photo.caption) || "Untitled"}</strong>

    <p>${this.esc(photo.url)}</p>

    <div class="research-actions">

        <a class="map-btn" href="${this.esc(photo.url)}" target="_blank" rel="noopener">Open Link</a>

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
    const text = document.getElementById("jrn-new-checklist").value.trim();

    if (!text) {
      return;
    }

    const result = this.ensureEntry(dayNumber);

    if (!result) {
      return;
    }

    result.entry.checklist.push({
      id: `CHK-${Date.now()}`,
      text,
      checked: false,
    });

    Project.update("journal", result.data);

    this.openDay(dayNumber);
  },

  toggleChecklistItem(id, checked) {
    const data = Project.get("journal");

    if (!data || !Array.isArray(data.entries)) {
      return;
    }

    data.entries.forEach((entry) => {
      const item = entry.checklist.find((i) => i.id === id);

      if (item) {
        item.checked = checked;
      }
    });

    Project.update("journal", data);
  },

  removeChecklistItem(id) {
    const data = Project.get("journal");

    if (!data || !Array.isArray(data.entries)) {
      return;
    }

    data.entries.forEach((entry) => {
      entry.checklist = entry.checklist.filter((i) => i.id !== id);
    });

    Project.update("journal", data);

    this.openDay(this.currentDay.day);
  },

  addPhoto(dayNumber) {
    const url = document.getElementById("jrn-new-photo-url").value.trim();

    const caption = document.getElementById("jrn-new-photo-caption").value.trim();

    if (!url) {
      alert("Please enter a photo link before adding.");
      return;
    }

    const result = this.ensureEntry(dayNumber);

    if (!result) {
      return;
    }

    result.entry.photos.push({
      id: `PHT-${Date.now()}`,
      url,
      caption,
    });

    Project.update("journal", result.data);

    this.openDay(dayNumber);
  },

  removePhoto(id) {
    const data = Project.get("journal");

    if (!data || !Array.isArray(data.entries)) {
      return;
    }

    data.entries.forEach((entry) => {
      entry.photos = entry.photos.filter((p) => p.id !== id);
    });

    Project.update("journal", data);

    this.openDay(this.currentDay.day);
  },

  save(dayNumber) {
    const result = this.ensureEntry(dayNumber);

    if (!result) {
      return;
    }

    result.entry.notes = document.getElementById("jrn-notes").value.trim();

    result.entry.location = {
      name: document.getElementById("jrn-location-name").value.trim(),
      address: document.getElementById("jrn-location-address").value.trim(),
    };

    Project.update("journal", result.data);

    this.openDay(dayNumber);
  },

  esc(value) {
    return String(value ?? "").replace(/"/g, "&quot;");
  },
};
