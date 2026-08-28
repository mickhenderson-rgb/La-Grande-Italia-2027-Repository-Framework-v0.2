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

        <!-- A bar that MOVES, not just text that changes. Embedding a
             hundred photos takes a while, and a line reading "Embedding
             photo 41..." updating every few seconds is indistinguishable
             from a page that has locked up. -->
        <div class="exp-progress" id="exp-progress" hidden>
            <div class="exp-progress-track">
                <div class="exp-progress-bar" id="exp-progress-bar" style="width: 0%"></div>
            </div>
        </div>

        <div id="exp-status" class="form-hint" role="status" aria-live="polite" style="margin-top: 12px;"></div>

    </div>

    <div class="planner-buttons">

        <button type="button" id="exp-go" onclick="JournalExport.generate()">

            Generate &amp; Download

        </button>

        <button type="button" onclick="PhotoBook.open()">

            Photo Book →

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

    // Counted BEFORE the loop so the bar shows a real fraction. A bar that
    // cannot say how far along it is may as well be a spinner.
    const chosen = days.filter((day) => {
      if (!onlyWithContent) {
        return true;
      }

      const entry = entries.find((e) => e.day === day.day);

      return !!(
        entry &&
        ((entry.notes && entry.notes.trim()) ||
          (entry.checklist && entry.checklist.length > 0) ||
          (entry.photos && entry.photos.length > 0))
      );
    });

    const totalPhotos = !includePhotos
      ? 0
      : chosen.reduce((n, day) => {
          const entry = entries.find((e) => e.day === day.day);

          return n + (entry && entry.photos ? entry.photos.length : 0);
        }, 0);

    // Days are quick; embedding a photo is the slow part. Weighting them
    // equally would make the bar sprint to 20% and then appear to stop.
    const totalWork = chosen.length + totalPhotos * 4;

    let workDone = 0;

    const progress = this.progressUI();

    progress.start();

    const step = (text) => {
      if (statusEl) {
        statusEl.textContent = text;
      }

      progress.set(totalWork > 0 ? workDone / totalWork : 1);
    };

    try {
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

        workDone += 1;

        step(`Day ${day.day} of ${days[days.length - 1].day}…`);

        // Yields to the browser so the bar actually paints. Without this the
        // whole export can run inside one frame and the page looks frozen
        // right up until the file appears.
        await new Promise((resolve) => setTimeout(resolve, 0));

        let photosHtml = "";

        if (includePhotos && entry.photos.length > 0) {
          const photoParts = [];

          for (const photo of entry.photos) {
            photoCount++;

            workDone += 4;

            step(`Embedding photo ${photoCount} of ${totalPhotos}…`);

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

      workDone = totalWork;

      step("Building the document…");

      await new Promise((resolve) => setTimeout(resolve, 0));

      const html = this.buildDocument(projectData, sections);

      this.download(html, this.filename(projectData));

      if (statusEl) {
        const size = Math.round(html.length / 1024);

        statusEl.textContent =
          `Done - ${sections.length} ${sections.length === 1 ? "day" : "days"}, ` +
          `${photoCount} ${photoCount === 1 ? "photo" : "photos"}, ${size} KB. ` +
          `Check your downloads.`;
      }
    } catch (error) {
      // An export that dies halfway used to leave the last "Embedding
      // photo 41..." on screen forever, which is indistinguishable from
      // one still working.
      console.error("Export failed:", error);

      if (statusEl) {
        statusEl.textContent = "The export stopped part way through. Nothing was saved - try again.";
      }
    } finally {
      progress.done();
    }
  },

  // The bar, the button and the cursor - all the things that should say
  // "working" and then stop saying it, however the export ends.
  progressUI() {
    const wrap = document.getElementById("exp-progress");

    const bar = document.getElementById("exp-progress-bar");

    const button = document.getElementById("exp-go");

    return {
      start() {
        if (wrap) {
          wrap.hidden = false;
        }

        if (bar) {
          bar.style.width = "0%";
        }

        if (button) {
          button.disabled = true;

          button.textContent = "Working…";
        }
      },

      set(fraction) {
        if (bar) {
          const pct = Math.max(0, Math.min(1, fraction)) * 100;

          bar.style.width = pct.toFixed(1) + "%";
        }
      },

      done() {
        if (button) {
          button.disabled = false;

          button.textContent = "Generate & Download";
        }

        if (bar) {
          bar.style.width = "100%";
        }
      },
    };
  },

  async renderExportPhoto(photo) {
    // The archive copy is the whole point of keeping one: an export is the
    // only place the extra pixels matter. Photos added before archives
    // existed have none, so fall back to the display copy rather than
    // losing them.
    const source = photo.archiveUrl || photo.url;

    const isUpload = String(source || "").startsWith("data/projects/");

    const attribution = photo.addedBy
      ? `<p class="export-attribution">Added by ${this.esc(photo.addedBy)}</p>`
      : "";

    if (!isUpload) {
      return `

<div class="export-photo">

    <a href="${this.esc(source)}" target="_blank" rel="noopener">${this.esc(photo.caption) || "View Photo"}</a>

    ${attribution}

</div>

`;
    }

    try {
      const dataUrl = await this.toBase64(source);

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

    // NOT revoked in this tick. A browser starts the download
    // asynchronously after the click, and revoking the object URL before
    // it has begun cancels it - silently, with no error anywhere. The
    // export ran to completion, said nothing was wrong, and no file
    // appeared, which is what "it just seems to hang" looks like from the
    // outside.
    //
    // A minute is far longer than any download needs to start, and the
    // blob is released either way.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
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
