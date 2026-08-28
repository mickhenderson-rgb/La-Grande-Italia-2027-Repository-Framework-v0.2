/*
=========================================================

COMPASS-TOS

Photo Book

Version 1.0.0

A print-ready book of the journal. Open it, print it to
PDF, and the PDF is what a printer wants.

WHY THIS IS NOT A PDF GENERATOR

Because the browser already has one, and it is better than
anything that would fit in this app. A PDF library would be
a dependency, and this project has none by design; hand-
rolling one would be weeks of work to produce something
worse than Ctrl+P. What the browser cannot do on its own is
lay a book out - page sizes in inches, full-bleed images,
text kept inside the safe area, one page per sheet. That is
what this module is.

WHAT A PRINTER ACTUALLY ASKS FOR

Taken from a supplier that publishes its specifications
(photobooks.pro), because guessing at these is how you get a
book back with people's heads cropped off:

  bleed     1/8 inch on every edge; anything meant to reach
            the edge must extend into it
  safe      keep text and faces 3/4 inch in from the trim -
            hardcover binding takes up to 1/4 inch per edge
  DPI       300 preferred, 600 maximum
  pages     single pages, NOT spreads, page 1 on the right
  colour    leave the profile alone; do not convert

Note that photobookshop.com.au, which was the original
prompt for this, does NOT accept general PDF uploads - their
own support says to email business@photobookshop.com.au for
the exact dimensions of a custom order. So this deliberately
does not target one supplier. Pick a size, and if the
supplier wants something else, the size list is one object
at the top of this file.

RESOLUTION, HONESTLY

Journal photos are archived at 3200px on the long edge,
which is 10.67 inches at 300 DPI. So:

  8 x 8    388 DPI   comfortably above spec
  10 x 10  312 DPI   above spec
  8.5 x 11 284 DPI   slightly under, prints fine
  A4       268 DPI   slightly under, prints fine
  12 x 12  261 DPI   noticeably under - print smaller

The app tells you this on the page rather than letting you
find out from the finished book.

=========================================================
*/

const PhotoBook = {
  // Trim sizes, in inches. Bleed is added on top of these.
  //
  // Kept small on purpose: these are the sizes the archive resolution can
  // actually fill. Adding a 16x12 would be offering something that comes
  // back soft.
  SIZES: {
    "8x8": { label: "8 × 8 in (square)", w: 8, h: 8 },
    "10x10": { label: "10 × 10 in (square)", w: 10, h: 10 },
    "8.5x11": { label: "8.5 × 11 in (portrait)", w: 8.5, h: 11 },
    a4: { label: "A4 (8.27 × 11.7 in)", w: 8.27, h: 11.7 },
    "11x8.5": { label: "11 × 8.5 in (landscape)", w: 11, h: 8.5 },
  },

  // 1/8 inch on every edge, per the spec above. The page is drawn at trim
  // + bleed, and the printer cuts the bleed away.
  BLEED: 0.125,

  // 3/4 inch. Anything a person needs to READ lives inside this; hardcover
  // binding can eat a quarter inch per edge and the rest is the margin
  // between "technically not trimmed" and "not uncomfortably close".
  SAFE: 0.75,

  // What the archive copy can fill before it starts to soften.
  ARCHIVE_PX: 3200,

  open() {
    Render.show(Layout.render(this.render()));
  },

  render() {
    const options = Object.keys(this.SIZES)
      .map((key) => {
        const size = this.SIZES[key];

        const dpi = this.dpiFor(size);

        return `<option value="${this.esc(key)}"${key === "8x8" ? " selected" : ""}>${this.esc(size.label)} — ${dpi} DPI</option>`;
      })
      .join("");

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Photo Book

        </h1>

        <p>

            Lays the journal out as book pages, then opens your print dialog.
            Choose <strong>Save as PDF</strong> and you have a file a printer can use.

        </p>

    </section>

    <div class="manager-card form-card">

        <h2>Book size</h2>

        <label class="form-field">
            Size
            <select id="pb-size">${options}</select>
            <span class="form-hint">
                The DPI shown is what your archived photos will actually print at.
                300 is the printer's preference; below about 250 starts to soften.
            </span>
        </label>

        <label class="form-checkbox">
            <input type="checkbox" id="pb-include-notes" checked>
            Include the day's writing
        </label>

        <label class="form-checkbox">
            <input type="checkbox" id="pb-one-per-page" checked>
            One photo per page, full bleed
            <span class="form-hint">
                Off puts up to four photos on a page with a white border - fewer
                pages, smaller pictures.
            </span>
        </label>

        <div class="exp-progress" id="pb-progress" hidden>
            <div class="exp-progress-track">
                <div class="exp-progress-bar" id="pb-progress-bar" style="width: 0%"></div>
            </div>
        </div>

        <div id="pb-status" class="form-hint" role="status" aria-live="polite" style="margin-top: 12px;"></div>

    </div>

    <div class="manager-card">

        <h2>Before you print</h2>

        <ul class="pb-tips">
            <li><strong>Scale:</strong> 100%, or "Actual size". Anything else moves the trim.</li>
            <li><strong>Margins:</strong> None. The bleed is already drawn in.</li>
            <li><strong>Background graphics:</strong> ON, or every photo prints as a white box.</li>
            <li><strong>Destination:</strong> Save as PDF.</li>
        </ul>

        <p class="form-hint">
            These live in the print dialog, not in this app - a web page cannot set
            them for you. The book itself repeats them on its first page, which is
            not part of the book and should be deleted from the PDF before ordering.
        </p>

    </div>

    <div class="planner-buttons">

        <button type="button" id="pb-go" onclick="PhotoBook.build()">

            Build the Book

        </button>

        <button type="button" onclick="ProductionExport.open()">

            Export for Production →

        </button>

        <button type="button" onclick="Journal.open()">

            ← Back to Journal

        </button>

    </div>

</div>

`;
  },

  // What a full-bleed photo will actually print at, in this size.
  dpiFor(size) {
    const longestEdge = Math.max(size.w, size.h) + this.BLEED * 2;

    return Math.round(this.ARCHIVE_PX / longestEdge);
  },

  async build() {
    const sizeKey = document.getElementById("pb-size").value;

    const size = this.SIZES[sizeKey] || this.SIZES["8x8"];

    const includeNotes = document.getElementById("pb-include-notes").checked;

    const onePerPage = document.getElementById("pb-one-per-page").checked;

    const statusEl = document.getElementById("pb-status");

    const bar = document.getElementById("pb-progress-bar");

    const wrap = document.getElementById("pb-progress");

    const button = document.getElementById("pb-go");

    const journey = Project.get("journey");

    const journal = Project.get("journal");

    const projectData = Project.get("project");

    const days = journey && Array.isArray(journey.days) ? journey.days : [];

    const entries = journal && Array.isArray(journal.entries) ? journal.entries : [];

    // Only days with something to show. A book of empty pages is not a book.
    const chosen = days.filter((day) => {
      const entry = entries.find((e) => e.day === day.day);

      return !!(entry && ((entry.photos && entry.photos.length > 0) || (includeNotes && entry.notes && entry.notes.trim())));
    });

    if (chosen.length === 0) {
      if (statusEl) {
        statusEl.textContent = "Nothing to put in a book yet - add some photos or writing to the journal first.";
      }

      return;
    }

    const totalPhotos = chosen.reduce((n, day) => {
      const entry = entries.find((e) => e.day === day.day);

      return n + (entry && entry.photos ? entry.photos.length : 0);
    }, 0);

    let done = 0;

    const step = (text) => {
      if (statusEl) {
        statusEl.textContent = text;
      }

      if (bar && totalPhotos > 0) {
        bar.style.width = ((done / totalPhotos) * 100).toFixed(1) + "%";
      }
    };

    if (wrap) {
      wrap.hidden = false;
    }

    if (button) {
      button.disabled = true;

      button.textContent = "Building…";
    }

    try {
      const pages = [];

      pages.push(this.renderTitlePage(projectData, chosen));

      for (const day of chosen) {
        const entry = entries.find((e) => e.day === day.day) || { notes: "", photos: [] };

        if (includeNotes && entry.notes && entry.notes.trim()) {
          pages.push(this.renderTextPage(day, entry));
        }

        const photos = entry.photos || [];

        if (onePerPage) {
          for (const photo of photos) {
            done += 1;

            step(`Placing photo ${done} of ${totalPhotos}…`);

            // Yields so the bar paints - embedding a full-resolution
            // archive photo is the slow part of this whole module.
            await new Promise((resolve) => setTimeout(resolve, 0));

            pages.push(await this.renderPhotoPage(photo));
          }
        } else {
          for (let i = 0; i < photos.length; i += 4) {
            const group = photos.slice(i, i + 4);

            done += group.length;

            step(`Placing photo ${done} of ${totalPhotos}…`);

            await new Promise((resolve) => setTimeout(resolve, 0));

            pages.push(await this.renderGridPage(group));
          }
        }
      }

      // Books are bound in sheets, and an odd page count leaves a stray
      // blank the binder chooses the position of. Choosing it here is
      // better than letting them.
      if (pages.length % 2 === 1) {
        pages.push(`<section class="pb-page pb-blank"></section>`);
      }

      step("Opening the print dialog…");

      const html = this.buildDocument(projectData, size, pages);

      this.openForPrint(html);

      if (statusEl) {
        statusEl.textContent =
          `${pages.length} pages at ${size.label}, ${this.dpiFor(size)} DPI. ` +
          `Print it with scale 100%, no margins, background graphics ON.`;
      }
    } catch (error) {
      console.error("Photo book failed:", error);

      if (statusEl) {
        statusEl.textContent = "The book stopped part way through. Nothing was saved - try again.";
      }
    } finally {
      if (button) {
        button.disabled = false;

        button.textContent = "Build the Book";
      }

      if (bar) {
        bar.style.width = "100%";
      }
    }
  },

  renderTitlePage(projectData, chosen) {
    const trip = (projectData && projectData.project) || {};

    const name = trip.name || "Our Trip";

    const first = chosen[0];

    const last = chosen[chosen.length - 1];

    const dates = this.coverDates(first && first.date, last && last.date);

    return `

<section class="pb-page pb-title">

    <div class="pb-safe pb-centre">

        <h1>${this.esc(name)}</h1>

        ${dates ? `<p class="pb-dates">${this.esc(dates)}</p>` : ""}

    </div>

</section>

`;
  },

  // "17 - 25 August 2027", not "17th - Fri 25th Aug".
  //
  // Format.dateRange is the house answer for a UI row, where space is
  // tight, the year is obvious from the trip you are looking at, and a
  // weekday helps you find tomorrow. A book cover is the opposite of all
  // three: it is read once, years later, by someone who needs the YEAR and
  // does not care that it was a Friday.
  coverDates(fromDate, toDate) {
    const a = Format.parseISO(fromDate);

    const b = Format.parseISO(toDate || fromDate);

    if (!a) {
      return "";
    }

    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    const month = (d) => months[d.getMonth()];

    if (!b || a.getTime() === b.getTime()) {
      return a.getDate() + " " + month(a) + " " + a.getFullYear();
    }

    if (a.getFullYear() !== b.getFullYear()) {
      return (
        a.getDate() + " " + month(a) + " " + a.getFullYear() +
        " - " + b.getDate() + " " + month(b) + " " + b.getFullYear()
      );
    }

    if (a.getMonth() !== b.getMonth()) {
      return (
        a.getDate() + " " + month(a) +
        " - " + b.getDate() + " " + month(b) + " " + b.getFullYear()
      );
    }

    return a.getDate() + " - " + b.getDate() + " " + month(b) + " " + b.getFullYear();
  },

  renderTextPage(day, entry) {
    const title = day.title ? Format.place(day.title) : `Day ${day.day}`;

    const when = day.date ? Format.date(day.date) : "";

    const author = entry.notesAuthor ? `<p class="pb-author">— ${this.esc(entry.notesAuthor)}</p>` : "";

    return `

<section class="pb-page pb-text">

    <div class="pb-safe">

        <p class="pb-day">Day ${day.day}${when ? ` · ${this.esc(when)}` : ""}</p>

        <h2>${this.esc(title)}</h2>

        <div class="pb-notes">${this.paragraphs(entry.notes)}</div>

        ${author}

    </div>

</section>

`;
  },

  async renderPhotoPage(photo) {
    const src = await this.embed(photo);

    if (!src) {
      return "";
    }

    // The caption sits INSIDE the safe area over the photo, not below it -
    // a full-bleed page has no below.
    const caption = photo.caption
      ? `<div class="pb-safe pb-caption-wrap"><p class="pb-caption">${this.esc(photo.caption)}</p></div>`
      : "";

    return `

<section class="pb-page pb-photo-page">

    <img class="pb-bleed-photo" src="${src}" alt="">

    ${caption}

</section>

`;
  },

  async renderGridPage(photos) {
    const cells = [];

    for (const photo of photos) {
      const src = await this.embed(photo);

      if (!src) {
        continue;
      }

      cells.push(`

<figure class="pb-cell">

    <img src="${src}" alt="">

    ${photo.caption ? `<figcaption>${this.esc(photo.caption)}</figcaption>` : ""}

</figure>

`);
    }

    if (cells.length === 0) {
      return "";
    }

    return `

<section class="pb-page pb-grid-page">

    <div class="pb-safe pb-grid pb-grid-${cells.length}">${cells.join("")}</div>

</section>

`;
  },

  // The ARCHIVE copy, always. This is the one place in the app where the
  // extra pixels are the entire point - a display copy at 1600px would be
  // 194 DPI on an 8x8, which is visibly soft in print.
  async embed(photo) {
    const source = photo.archiveUrl || photo.url;

    if (!String(source || "").startsWith("data/projects/")) {
      // A remote photo cannot be embedded, and a book is printed offline.
      // Skipping is the only honest option; the page count reflects it.
      return null;
    }

    try {
      return await JournalExport.toBase64(source);
    } catch (error) {
      console.warn("Could not embed photo for the book:", source, error);

      return null;
    }
  },

  paragraphs(text) {
    return String(text || "")
      .split(/\n\s*\n/)
      .filter((p) => p.trim())
      .map((p) => `<p>${this.esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
      .join("");
  },

  buildDocument(projectData, size, pages) {
    const trip = (projectData && projectData.project) || {};

    // Trim plus bleed on every edge - the size the PAGE is drawn at. The
    // printer trims the bleed away and is left with the size you chose.
    const pageW = (size.w + this.BLEED * 2).toFixed(3);

    const pageH = (size.h + this.BLEED * 2).toFixed(3);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${this.esc(trip.name || "Photo Book")}</title>
<style>
  /* The page IS the unit here. Every measurement is in inches because
     that is what a printer works in, and because a page defined in pixels
     changes size with the print dialog's DPI assumption. */
  @page {
    size: ${pageW}in ${pageH}in;
    margin: 0;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #ececec;
    font-family: Georgia, "Times New Roman", serif;
    color: #1c2530;
  }

  .pb-page {
    position: relative;
    width: ${pageW}in;
    height: ${pageH}in;
    overflow: hidden;
    background: #ffffff;
    page-break-after: always;
    break-after: page;
    margin: 0 auto 12px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.25);
  }

  /* 3/4 inch in from the TRIM, which is itself 1/8 inch in from the page
     edge - so 7/8 inch from where the paper actually ends. Everything a
     person reads lives in here. */
  .pb-safe {
    position: absolute;
    top: ${(this.SAFE + this.BLEED).toFixed(3)}in;
    right: ${(this.SAFE + this.BLEED).toFixed(3)}in;
    bottom: ${(this.SAFE + this.BLEED).toFixed(3)}in;
    left: ${(this.SAFE + this.BLEED).toFixed(3)}in;
  }

  .pb-centre {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .pb-title h1 { font-size: 34pt; font-weight: normal; letter-spacing: 0.02em; margin: 0; }
  .pb-dates { font-size: 13pt; color: #5a646f; margin-top: 14pt; }

  .pb-day { font-size: 9pt; letter-spacing: 0.14em; text-transform: uppercase; color: #7a828c; margin: 0; }
  .pb-text h2 { font-size: 21pt; font-weight: normal; margin: 6pt 0 16pt; }
  .pb-notes p { font-size: 11.5pt; line-height: 1.65; margin: 0 0 11pt; }
  .pb-author { font-size: 10pt; color: #7a828c; margin-top: 16pt; }

  /* Covers the whole page INCLUDING the bleed, so there is no white sliver
     if the trim wanders. object-fit: cover crops rather than distorts -
     a squashed photo is worse than a cropped one. */
  .pb-bleed-photo {
    position: absolute;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pb-caption-wrap { display: flex; align-items: flex-end; }
  .pb-caption {
    margin: 0;
    font-size: 9.5pt;
    color: #ffffff;
    background: rgba(0,0,0,0.55);
    padding: 5pt 9pt;
    border-radius: 3pt;
  }

  .pb-grid { display: grid; gap: 0.22in; }
  .pb-grid-1 { grid-template-columns: 1fr; }
  .pb-grid-2 { grid-template-columns: 1fr; }
  .pb-grid-3, .pb-grid-4 { grid-template-columns: 1fr 1fr; }
  .pb-cell { margin: 0; display: flex; flex-direction: column; min-height: 0; }
  .pb-cell img { width: 100%; height: 100%; object-fit: cover; min-height: 0; }
  .pb-cell figcaption { font-size: 8.5pt; color: #5a646f; padding-top: 4pt; }

  .pb-blank { background: #ffffff; }

  /* Screen-only. It must not survive into the PDF, so it is hidden at
     print time rather than merely styled differently. */
  .pb-instructions {
    max-width: ${pageW}in;
    margin: 16px auto;
    padding: 14px 18px;
    background: #fffbe6;
    border: 1px solid #e0d49a;
    border-radius: 6px;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.5;
  }

  @media print {
    html, body { background: #ffffff; }
    .pb-instructions { display: none; }
    .pb-page { margin: 0; box-shadow: none; }
  }
</style>
</head>
<body>

<div class="pb-instructions">
  <strong>Printing this:</strong> scale <strong>100%</strong> (not "fit to page"),
  margins <strong>None</strong>, and <strong>background graphics ON</strong> — without
  that last one every photo prints as a white box. Choose <strong>Save as PDF</strong>.
  This yellow box does not print.
  <br><br>
  Page size is ${size.label} plus ⅛ in bleed on every edge, which is what the
  printer trims away. Text sits ¾ in inside the trim.
</div>

${pages.join("")}

</body>
</html>`;
  },

  // A new tab, not a download.
  //
  // A book is meant to go through the browser's print dialog, and you
  // cannot print a file that is sitting in the downloads folder without
  // opening it first. This just skips that step - and lets you SEE the
  // pages before committing them to a PDF.
  openForPrint(html) {
    const blob = new Blob([html], { type: "text/html" });

    const url = URL.createObjectURL(blob);

    const tab = window.open(url, "_blank");

    if (!tab) {
      // Pop-up blocked. Fall back to a download rather than failing
      // silently, which is what the journal export used to do.
      const link = document.createElement("a");

      link.href = url;
      link.download = "photo-book.html";

      document.body.appendChild(link);

      link.click();

      document.body.removeChild(link);
    }

    // Long enough for the tab to have loaded it. Revoking in this tick
    // cancels the whole thing - the same bug the journal export had.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
