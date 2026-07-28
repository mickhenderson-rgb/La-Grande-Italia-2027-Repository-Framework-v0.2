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
    const isUpload = String(photo.url || "").startsWith("data/projects/");

    return `

<div class="research-item">

    ${isUpload ? `<img src="${this.esc(photo.url)}" alt="${this.esc(photo.caption)}" style="width:100%;border-radius:8px;margin-bottom:8px;">` : ""}

    <strong>${this.esc(photo.caption) || "Untitled"}</strong>

    ${isUpload ? "" : `<p>${this.esc(photo.url)}</p>`}

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
    const input = document.getElementById("jrn-new-checklist");

    const text = input.value.trim();

    if (!text) {
      return;
    }

    input.disabled = true;

    fetch(`/api/journal/${Data.currentProjectFolder}/${dayNumber}/checklist`, {
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

        alert("Couldn't save that checklist item. Check the connection and try again.");

        input.disabled = false;
      });
  },

  toggleChecklistItem(id, checked) {
    const dayNumber = this.currentDay.day;

    fetch(`/api/journal/${Data.currentProjectFolder}/${dayNumber}/checklist/${id}`, {
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

        alert("Couldn't save that change. Check the connection and try again.");

        this.openDay(dayNumber);
      });
  },

  removeChecklistItem(id) {
    const dayNumber = this.currentDay.day;

    fetch(`/api/journal/${Data.currentProjectFolder}/${dayNumber}/checklist/${id}`, {
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

        alert("Couldn't remove that item. Check the connection and try again.");
      });
  },

  addPhoto(dayNumber) {
    const url = document.getElementById("jrn-new-photo-url").value.trim();

    const caption = document.getElementById("jrn-new-photo-caption").value.trim();

    if (!url) {
      alert("Please enter a photo link before adding.");
      return;
    }

    fetch(`/api/journal/${Data.currentProjectFolder}/${dayNumber}/photo`, {
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

        alert("Couldn't save that photo link. Check the connection and try again.");
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
    this.pendingDay = dayNumber;

    document.getElementById("jrn-library-input").click();
  },

  async handleFileSelected(dayNumber, inputEl) {
    const file = inputEl.files && inputEl.files[0];

    inputEl.value = "";

    if (!file) {
      return;
    }

    const statusEl = document.getElementById("jrn-upload-status");

    if (statusEl) {
      statusEl.textContent = "Processing photo...";
    }

    try {
      const resizedDataUrl = await this.resizeImage(file, 1600, 0.8);

      if (statusEl) {
        statusEl.textContent = "Uploading...";
      }

      const url = await this.uploadPhoto(resizedDataUrl);

      const caption = this.autoCaption(file);

      const addResponse = await fetch(`/api/journal/${Data.currentProjectFolder}/${dayNumber}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, caption }),
      });

      if (!addResponse.ok) {
        throw new Error(`Save failed with status ${addResponse.status}`);
      }

      const result = await addResponse.json();

      this.syncEntryLocally(dayNumber, result.entry);

      if (statusEl) {
        statusEl.textContent = "";
      }

      this.openDay(dayNumber);
    } catch (error) {
      console.error("Photo upload failed:", error);

      if (statusEl) {
        statusEl.textContent = "Upload failed - is the server running?";
      }

      alert("Couldn't upload that photo. Check the connection and try again.");
    }
  },

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
    const response = await fetch(`/api/upload/${Data.currentProjectFolder}`, {
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
    const dayNumber = this.currentDay.day;

    fetch(`/api/journal/${Data.currentProjectFolder}/${dayNumber}/photo/${id}`, {
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

        alert("Couldn't remove that photo. Check the connection and try again.");
      });
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
