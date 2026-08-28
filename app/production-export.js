/*
=========================================================

COMPASS-TOS

Production Export

Version 1.0.0

The journal as a folder of files, zipped: photos as they
were uploaded, writing as plain text, in trip order.

WHY, WHEN THERE IS ALREADY A PHOTO BOOK

Because the photo book decides the layout, and every real
book-making tool wants to decide that itself. Blurb,
Lightroom, Canva, InDesign, a designer, or the person at the
print shop all want the same thing: the pictures, the words,
and the order. Not a PDF they have to pull apart.

So this is the other half of "export for production". The
photo book is for when the app's layout is the layout. This
is for when it is not.

WHAT DECIDES THE ORDER

The filenames, and nothing else. Every tool in that list
sorts by name on import, so the name carries the order:

  photos/0001_day-01_arrive-in-milan.jpg
  photos/0002_day-01_arrive-in-milan.jpg
  photos/0003_day-02_lake-como.jpg

Zero-padded to four digits, so 0010 sorts after 0009 rather
than between 0001 and 0002 - which is what a plain 1, 2, 10
would do, silently, on every one of those tools.

Each photo gets a .txt SIDECAR of the same basename, which
is the long-standing convention for carrying a caption
alongside an image. captions.csv carries the same
information in one file for tools that take a bulk import,
and journal.txt is the whole trip as readable prose for
anyone who just wants to read it.

MEMORY, HONESTLY

The archive is assembled in memory before it is handed over.
A hundred photos at 1.5 MB each is 150 MB, which a desktop
browser handles and a phone may not. The page says the
running total as it goes rather than letting a tab die
without explanation.

=========================================================
*/

const ProductionExport = {
  open() {
    Render.show(Layout.render(this.render()));
  },

  render() {
    return `

<div class="manager">

    <section class="hero">

        <h1>

            Export for Production

        </h1>

        <p>

            A zip of your photos and writing, in trip order, ready to drop into
            a book app, a designer's hands, or a print shop.

        </p>

    </section>

    <div class="manager-card form-card">

        <h2>What goes in</h2>

        <label class="form-checkbox">
            <input type="checkbox" id="px-sidecars" checked>
            A caption file beside each photo
            <span class="form-hint">
                Same name as the photo, ending .txt - the usual way to carry a
                caption with an image.
            </span>
        </label>

        <label class="form-checkbox">
            <input type="checkbox" id="px-csv" checked>
            captions.csv
            <span class="form-hint">For anything that takes a bulk caption import.</span>
        </label>

        <label class="form-checkbox">
            <input type="checkbox" id="px-journal" checked>
            journal.txt — the whole trip as readable text
        </label>

        <div class="exp-progress" id="px-progress" hidden>
            <div class="exp-progress-track">
                <div class="exp-progress-bar" id="px-progress-bar" style="width: 0%"></div>
            </div>
        </div>

        <div id="px-status" class="form-hint" role="status" aria-live="polite" style="margin-top: 12px;"></div>

    </div>

    <div class="manager-card">

        <h2>What you get</h2>

        <pre class="px-tree">trip-name-production.zip
├── README.txt
├── journal.txt
├── captions.csv
└── photos/
    ├── 0001_day-01_arrive-in-milan.jpg
    ├── 0001_day-01_arrive-in-milan.txt
    ├── 0002_day-01_arrive-in-milan.jpg
    └── 0003_day-02_lake-como.jpg</pre>

        <p class="form-hint">
            The numbers are the order. Most tools sort by filename when you
            import a folder, so dropping <code>photos/</code> in gives you the
            trip in sequence without any sorting on your part.
        </p>

    </div>

    <div class="planner-buttons">

        <button type="button" id="px-go" onclick="ProductionExport.build()">

            Build the Zip

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

  async build() {
    const wantSidecars = document.getElementById("px-sidecars").checked;

    const wantCsv = document.getElementById("px-csv").checked;

    const wantJournal = document.getElementById("px-journal").checked;

    const statusEl = document.getElementById("px-status");

    const bar = document.getElementById("px-progress-bar");

    const wrap = document.getElementById("px-progress");

    const button = document.getElementById("px-go");

    const journey = Project.get("journey");

    const journal = Project.get("journal");

    const projectData = Project.get("project");

    const days = journey && Array.isArray(journey.days) ? journey.days : [];

    const entries = journal && Array.isArray(journal.entries) ? journal.entries : [];

    const chosen = days.filter((day) => {
      const entry = entries.find((e) => e.day === day.day);

      return !!(entry && ((entry.photos && entry.photos.length > 0) || (entry.notes && entry.notes.trim())));
    });

    if (chosen.length === 0) {
      if (statusEl) {
        statusEl.textContent = "Nothing to export yet - add some photos or writing to the journal first.";
      }

      return;
    }

    const totalPhotos = chosen.reduce((n, day) => {
      const entry = entries.find((e) => e.day === day.day);

      return n + (entry && entry.photos ? entry.photos.length : 0);
    }, 0);

    if (wrap) {
      wrap.hidden = false;
    }

    if (button) {
      button.disabled = true;

      button.textContent = "Building…";
    }

    let bytesSoFar = 0;

    let seq = 0;

    let skipped = 0;

    try {
      const files = [];

      const csvRows = ["file,day,date,caption"];

      const journalParts = [];

      for (const day of chosen) {
        const entry = entries.find((e) => e.day === day.day) || { notes: "", photos: [] };

        const dayTag = `day-${String(day.day).padStart(2, "0")}`;

        const slug = this.slug(day.title || "");

        const stem = slug ? `${dayTag}_${slug}` : dayTag;

        if (wantJournal) {
          journalParts.push(this.dayText(day, entry));
        }

        for (const photo of (entry.photos || [])) {
          seq += 1;

          if (statusEl) {
            statusEl.textContent =
              `Photo ${seq} of ${totalPhotos}… ${this.mb(bytesSoFar)} MB so far`;
          }

          if (bar) {
            bar.style.width = ((seq / totalPhotos) * 100).toFixed(1) + "%";
          }

          // Yields so the bar paints and the tab stays responsive.
          await new Promise((resolve) => setTimeout(resolve, 0));

          const bytes = await this.fetchPhoto(photo);

          if (!bytes) {
            skipped += 1;

            continue;
          }

          bytesSoFar += bytes.length;

          const base = `${String(seq).padStart(4, "0")}_${stem}`;

          const name = `photos/${base}.${this.extensionFor(bytes)}`;

          files.push({ name: name, bytes: bytes });

          const caption = photo.caption || "";

          if (wantSidecars && caption) {
            files.push({ name: `photos/${base}.txt`, bytes: Zip.textBytes(caption + "\n") });
          }

          if (wantCsv) {
            csvRows.push(
              [name, day.day, day.date || "", caption].map((v) => this.csvCell(v)).join(","),
            );
          }
        }
      }

      if (wantCsv) {
        files.push({ name: "captions.csv", bytes: Zip.textBytes(csvRows.join("\n") + "\n") });
      }

      if (wantJournal) {
        files.push({ name: "journal.txt", bytes: Zip.textBytes(this.journalText(projectData, journalParts)) });
      }

      files.push({
        name: "README.txt",
        bytes: Zip.textBytes(this.readme(projectData, seq - skipped, chosen.length, skipped)),
      });

      if (statusEl) {
        statusEl.textContent = "Zipping…";
      }

      await new Promise((resolve) => setTimeout(resolve, 0));

      const blob = Zip.build(files, new Date());

      this.download(blob, `${this.slug((projectData && projectData.project && projectData.project.name) || "trip")}-production.zip`);

      if (statusEl) {
        statusEl.textContent =
          `Done - ${seq - skipped} ${seq - skipped === 1 ? "photo" : "photos"} across ` +
          `${chosen.length} ${chosen.length === 1 ? "day" : "days"}, ${this.mb(blob.size)} MB.` +
          (skipped > 0 ? ` ${skipped} skipped (stored elsewhere, not uploaded here).` : "") +
          " Check your downloads.";
      }
    } catch (error) {
      console.error("Production export failed:", error);

      if (statusEl) {
        statusEl.textContent =
          "The export stopped part way through" +
          (bytesSoFar > 50 * 1024 * 1024 ? " - it may have run out of memory. Try it on a computer rather than a phone." : ".") +
          " Nothing was saved.";
      }
    } finally {
      if (button) {
        button.disabled = false;

        button.textContent = "Build the Zip";
      }

      if (bar) {
        bar.style.width = "100%";
      }
    }
  },

  // The ARCHIVE copy, as raw bytes.
  //
  // Not base64 like the journal export: base64 is a third larger, and this
  // archive is the one place where the whole payload sits in memory at
  // once. Bytes go straight into the zip.
  async fetchPhoto(photo) {
    const source = photo.archiveUrl || photo.url;

    if (!String(source || "").startsWith("data/projects/")) {
      return null;
    }

    try {
      const response = await fetch(source);

      if (!response.ok) {
        throw new Error("status " + response.status);
      }

      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      console.warn("Could not read photo for the production export:", source, error);

      return null;
    }
  },

  // Sniffed from the bytes, not taken from the URL. A file saved as .jpg
  // that is actually a PNG confuses exactly the tools this export exists
  // to feed, and the first few bytes never lie.
  extensionFor(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      return "jpg";
    }

    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return "png";
    }

    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      return "webp";
    }

    return "jpg";
  },

  dayText(day, entry) {
    const heading = `Day ${day.day}${day.date ? " - " + Format.date(day.date) : ""}${day.title ? " - " + Format.place(day.title) : ""}`;

    const rule = "".padEnd(heading.length, "=");

    const body = (entry.notes || "").trim() || "(no writing for this day)";

    const author = entry.notesAuthor ? `\n\n- ${entry.notesAuthor}` : "";

    return `${heading}\n${rule}\n\n${body}${author}\n`;
  },

  journalText(projectData, parts) {
    const trip = (projectData && projectData.project) || {};

    return `${trip.name || "Trip"}\n\n${parts.join("\n\n")}\n`;
  },

  readme(projectData, photoCount, dayCount, skipped) {
    const trip = (projectData && projectData.project) || {};

    return [
      `${trip.name || "Trip"} - production export`,
      "",
      `${photoCount} photos across ${dayCount} days.`,
      skipped > 0
        ? `${skipped} photo(s) are not included: they are links to somewhere else rather than files uploaded to this app.`
        : "",
      "",
      "ORDER",
      "",
      "The number at the front of each filename is the order they happened in.",
      "Most book and layout tools sort by filename when you import a folder, so",
      "dropping photos/ in gives you the trip in sequence with no sorting to do.",
      "",
      "Four digits, so 0010 comes after 0009. Numbering them 1, 2, 10 would put",
      "10 between 1 and 2 on every one of those tools.",
      "",
      "CAPTIONS",
      "",
      "Each photo has a .txt file of the same name beside it holding its caption.",
      "captions.csv has the same thing in one file if your tool imports in bulk.",
      "",
      "TEXT",
      "",
      "journal.txt is the whole trip as readable prose, day by day.",
      "",
      "PHOTOS",
      "",
      "These are the archive copies - the largest kept, not the smaller ones the",
      "app shows on screen.",
      "",
    ]
      .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
      .join("\n");
  },

  // Safe on every filesystem, and sorts predictably.
  slug(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40);
  },

  csvCell(value) {
    const text = String(value == null ? "" : value);

    // Quote anything that would otherwise break the row apart, and double
    // any quote inside it - the rule every CSV reader expects.
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  },

  mb(bytes) {
    return (bytes / 1024 / 1024).toFixed(1);
  },

  download(blob, filename) {
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    // Not in this tick - revoking before the browser has begun the download
    // cancels it silently. This is the bug the journal export had until
    // v1.18.0, and a several-hundred-megabyte archive needs the room even
    // more than a single HTML file did.
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  },
};
