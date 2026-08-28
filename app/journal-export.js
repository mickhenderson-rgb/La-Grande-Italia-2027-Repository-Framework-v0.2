/*
=========================================================

COMPASS-TOS

Journal Export

Version 1.0.0

Build 27

Compiles the Journal into a single, self-contained HTML
file. Uploaded photos (same-origin) are embedded as base64
so the exported file works standalone with no server
dependency once downloaded - genuinely shareable. External
photo links can't be embedded this way (cross-origin, and
often not a direct image URL), so those stay as links.

=========================================================
*/

const JournalExport = {
  open() {
    Render.show(Layout.render(this.render()));
  },

  render() {
    return `

<div class="manager">

    <section class="hero">

        <h1>

            Export Journal

        </h1>

        <p>

            Creates a single HTML file you can save, print, or share -
            no server or app needed to view it afterward.

        </p>

    </section>

    <div class="manager-card form-card">

        <h2>What to include</h2>

        <label class="form-checkbox">
            <input type="checkbox" id="exp-include-notes" checked>
            Notes
        </label>

        <label class="form-checkbox">
            <input type="checkbox" id="exp-include-checklist" checked>
            Checklists
        </label>

        <label class="form-checkbox">
            <input type="checkbox" id="exp-include-photos" checked>
            Photos
        </label>

        <label class="form-checkbox">
            <input type="checkbox" id="exp-only-with-content" checked>
            Skip days with no journal content
        </label>

        <div id="exp-status" class="form-hint" style="margin-top: 12px;"></div>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="JournalExport.generate()">

            Generate &amp; Download

        </button>

        <button type="button" onclick="Journal.open()">

            ← Back to Journal

        </button>

    </div>

</div>

`;
  },

  async generate() {
    const includeNotes = document.getElementById("exp-include-notes").checked;

    const includeChecklist = document.getElementById("exp-include-checklist").checked;

    const includePhotos = document.getElementById("exp-include-photos").checked;

    const onlyWithContent = document.getElementById("exp-only-with-content").checked;

    const statusEl = document.getElementById("exp-status");

    const journey = Project.get("journey");

    const journal = Project.get("journal");

    const projectData = Project.get("project");

    const days = journey && Array.isArray(journey.days) ? journey.days : [];

    const entries = journal && Array.isArray(journal.entries) ? journal.entries : [];

    const sections = [];

    let photoCount = 0;

    for (const day of days) {
      const entry = entries.find((e) => e.day === day.day) || {
        notes: "",
        checklist: [],
        photos: [],
      };

      const hasContent =
        (entry.notes && entry.notes.trim()) ||
        entry.checklist.length > 0 ||
        entry.photos.length > 0;

      if (onlyWithContent && !hasContent) {
        continue;
      }

      if (statusEl) {
        statusEl.textContent = `Processing Day ${day.day}...`;
      }

      let photosHtml = "";

      if (includePhotos && entry.photos.length > 0) {
        const photoParts = [];

        for (const photo of entry.photos) {
          photoCount++;

          if (statusEl) {
            statusEl.textContent = `Embedding photo ${photoCount}...`;
          }

          photoParts.push(await this.renderExportPhoto(photo));
        }

        photosHtml = `<div class="export-photos">${photoParts.join("")}</div>`;
      }

      sections.push(this.renderExportDay(day, entry, {
        includeNotes,
        includeChecklist,
        photosHtml,
      }));
    }

    if (statusEl) {
      statusEl.textContent = "Building document...";
    }

    const html = this.buildDocument(projectData, sections);

    this.download(html, this.filename(projectData));

    if (statusEl) {
      statusEl.textContent = `Done - ${sections.length} ${sections.length === 1 ? "day" : "days"}, ${photoCount} ${photoCount === 1 ? "photo" : "photos"} included.`;
    }
  },

  async renderExportPhoto(photo) {
    const isUpload = String(photo.url || "").startsWith("data/projects/");

    const attribution = photo.addedBy
      ? `<p class="export-attribution">Added by ${this.esc(photo.addedBy)}</p>`
      : "";

    if (!isUpload) {
      return `

<div class="export-photo">

    <a href="${this.esc(photo.url)}" target="_blank" rel="noopener">${this.esc(photo.caption) || "View Photo"}</a>

    ${attribution}

</div>

`;
    }

    try {
      const dataUrl = await this.toBase64(photo.url);

      return `

<div class="export-photo">

    <img src="${dataUrl}" alt="${this.esc(photo.caption)}">

    <p>${this.esc(photo.caption)}</p>

    ${attribution}

</div>

`;
    } catch (error) {
      console.warn("Could not embed photo:", photo.url, error);

      return `

<div class="export-photo">

    <p>[Photo unavailable: ${this.esc(photo.caption) || photo.url}]</p>

    ${attribution}

</div>

`;
    }
  },

  toBase64(url) {
    return fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Fetch failed with status ${response.status}`);
        }

        return response.blob();
      })
      .then(
        (blob) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);

            reader.onerror = () => reject(new Error("Could not read image data."));

            reader.readAsDataURL(blob);
          }),
      );
  },

  renderExportDay(day, entry, options) {
    return `

<section class="export-day">

    <h2>Day ${day.day} - ${this.esc(day.title)}</h2>

    <p class="export-meta">${this.esc(Format.date(day.date))} ${day.location ? "- " + this.esc(this.pretty(day.location)) : ""}</p>

    ${
      options.includeNotes && entry.notes && entry.notes.trim()
        ? `<div class="export-notes">${this.esc(entry.notes).replace(/\n/g, "<br>")}</div>
           ${entry.notesAuthor ? `<p class="export-attribution">Written by ${this.esc(entry.notesAuthor)}</p>` : ""}`
        : ""
    }

    ${
      options.includeChecklist && entry.checklist.length > 0
        ? `<ul class="export-checklist">${entry.checklist
            .map(
              (item) =>
                `<li class="${item.checked ? "done" : ""}">${item.checked ? "\u2611" : "\u2610"} ${this.esc(item.text)}${item.addedBy ? ` <span class="export-attribution">(${this.esc(item.addedBy)})</span>` : ""}</li>`,
            )
            .join("")}</ul>`
        : ""
    }

    ${options.photosHtml}

</section>

`;
  },

  buildDocument(projectData, sections) {
    const trip = (projectData && projectData.project) || {};

    const title = trip.name || "Trip Journal";

    const dateRange =
      trip.departureDate && trip.returnDate ? `${trip.departureDate} to ${trip.returnDate}` : "";

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${this.esc(title)} - Journal</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #222; line-height: 1.6; }
  h1 { font-size: 2rem; margin-bottom: 4px; }
  .export-subtitle { color: #666; margin-top: 0; margin-bottom: 40px; }
  .export-day { margin-bottom: 50px; padding-bottom: 30px; border-bottom: 1px solid #ddd; }
  .export-day h2 { margin-bottom: 2px; }
  .export-meta { color: #888; font-size: 0.9rem; margin-top: 0; }
  .export-notes { margin: 16px 0; white-space: pre-wrap; }
  .export-checklist { list-style: none; padding: 0; }
  .export-checklist li { padding: 4px 0; }
  .export-checklist li.done { color: #888; text-decoration: line-through; }
  .export-photos { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 20px; }
  .export-photo img { width: 100%; border-radius: 8px; }
  .export-photo p { font-size: 0.85rem; color: #666; margin: 6px 0 0; }
  .export-attribution { font-size: 0.8rem; color: #999; font-style: italic; margin: 4px 0 0; }
  @media print { body { margin: 0; } .export-day { page-break-inside: avoid; } }
</style>
</head>
<body>
<h1>${this.esc(title)}</h1>
<p class="export-subtitle">${this.esc(dateRange)}</p>
${sections.join("\n")}
</body>
</html>`;
  },

  download(html, filename) {
    const blob = new Blob([html], { type: "text/html" });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  },

  filename(projectData) {
    const trip = (projectData && projectData.project) || {};

    const slug = String(trip.id || trip.name || "trip")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    return `${slug || "trip"}-journal.html`;
  },

  // Delegates to the shared formatter - see app/format.js. Kept as a
  // local method so every existing this.pretty(...) call still works.
  pretty(value) {
    return Format.place(value);
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
