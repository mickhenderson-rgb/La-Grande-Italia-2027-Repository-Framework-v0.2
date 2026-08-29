/*
=========================================================

COMPASS-TOS

Web Story

Version 1.0.0

The trip as a vertical, tap-through story - one screen at a
time, the way a phone wants to be read. A11's second half.

THREE EXPORTS, THREE JOBS

  Journal export   one document, read top to bottom
  Photo book       pages, for a printer
  Web story        screens, for a phone

They are not variations on each other. A book is landscape,
paginated and printed at 300 DPI; a story is portrait,
tapped through, and read at arm's length on a screen that
is awake. The same photos, laid out for opposite media.

THE DISPLAY COPY, NOT THE ARCHIVE

The photo book takes the 3200px archive because print eats
pixels. This takes the 1600px display copy, because no phone
shows more than that and the archive would roughly double
the file for nothing a viewer could see. It is the one place
in the app where the SMALLER copy is the right one.

SELF-CONTAINED, LIKE THE JOURNAL EXPORT

One HTML file with the photos inlined. Mail it, drop it in
Dropbox, put it on a web host - it works with no server and
no app, and it keeps working when this app is gone.

READ WITHOUT INSTRUCTIONS

Scrolling works, because it is a vertical page with scroll
snapping. Tapping works, because that is what people do to a
story. Arrow keys work, because it might be opened on a
laptop. None of those need to be explained, and none of them
is the only way in.

=========================================================
*/

const WebStory = {
  open() {
    Render.show(Layout.render(this.render()));
  },

  render() {
    return `

<div class="manager">

    <section class="hero">

        <h1>

            Web Story

        </h1>

        <p>

            The trip as a tap-through story, one screen at a time. One HTML file
            with the photos inside it - send it to someone and it just opens.

        </p>

    </section>

    <div class="manager-card form-card">

        <h2>What goes in</h2>

        <label class="form-checkbox">
            <input type="checkbox" id="ws-include-notes" checked>
            The day's writing, on its own screen
        </label>

        <label class="form-checkbox">
            <input type="checkbox" id="ws-captions" checked>
            Photo captions
        </label>

        <label class="form-field">
            Who it is by
            <input type="text" id="ws-byline" placeholder="Optional - shown on the first screen">
        </label>

        <div class="exp-progress" id="ws-progress" hidden>
            <div class="exp-progress-track">
                <div class="exp-progress-bar" id="ws-progress-bar" style="width: 0%"></div>
            </div>
        </div>

        <div id="ws-status" class="form-hint" role="status" aria-live="polite" style="margin-top: 12px;"></div>

    </div>

    <div class="manager-card">

        <h2>How it reads</h2>

        <ul class="pb-tips">
            <li><strong>Scroll</strong> — it snaps one screen at a time.</li>
            <li><strong>Tap</strong> the right side to go on, the left to go back.</li>
            <li><strong>Arrow keys</strong>, if it is opened on a computer.</li>
        </ul>

        <p class="form-hint">
            Photos use the on-screen copies rather than the full-size archives -
            no phone shows more, and it keeps the file roughly half the size.
        </p>

    </div>

    <div class="planner-buttons">

        <button type="button" id="ws-go" class="btn-primary" onclick="WebStory.build()">

            Build the Story

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
    const includeNotes = document.getElementById("ws-include-notes").checked;

    const includeCaptions = document.getElementById("ws-captions").checked;

    const byline = document.getElementById("ws-byline").value.trim();

    const statusEl = document.getElementById("ws-status");

    const bar = document.getElementById("ws-progress-bar");

    const wrap = document.getElementById("ws-progress");

    const button = document.getElementById("ws-go");

    const journey = Project.get("journey");

    const journal = Project.get("journal");

    const projectData = Project.get("project");

    const days = journey && Array.isArray(journey.days) ? journey.days : [];

    const entries = journal && Array.isArray(journal.entries) ? journal.entries : [];

    const chosen = days.filter((day) => {
      const entry = entries.find((e) => e.day === day.day);

      return !!(entry && ((entry.photos && entry.photos.length > 0) || (includeNotes && entry.notes && entry.notes.trim())));
    });

    if (chosen.length === 0) {
      if (statusEl) {
        statusEl.textContent = "Nothing to tell yet - add some photos or writing to the journal first.";
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

    let done = 0;

    let skipped = 0;

    try {
      const slides = [];

      slides.push(this.renderCover(projectData, chosen, byline));

      for (const day of chosen) {
        const entry = entries.find((e) => e.day === day.day) || { notes: "", photos: [] };

        if (includeNotes && entry.notes && entry.notes.trim()) {
          slides.push(this.renderTextSlide(day, entry));
        }

        for (const photo of (entry.photos || [])) {
          done += 1;

          if (statusEl) {
            statusEl.textContent = `Photo ${done} of ${totalPhotos}…`;
          }

          if (bar) {
            bar.style.width = ((done / totalPhotos) * 100).toFixed(1) + "%";
          }

          await new Promise((resolve) => setTimeout(resolve, 0));

          const slide = await this.renderPhotoSlide(day, photo, includeCaptions);

          if (slide) {
            slides.push(slide);
          } else {
            skipped += 1;
          }
        }
      }

      slides.push(this.renderEnd(projectData, chosen));

      if (statusEl) {
        statusEl.textContent = "Putting it together…";
      }

      await new Promise((resolve) => setTimeout(resolve, 0));

      const html = this.buildDocument(projectData, slides);

      this.download(html, this.filename(projectData));

      if (statusEl) {
        const size = Math.round(html.length / 1024);

        statusEl.textContent =
          `Done - ${slides.length} screens, ${done - skipped} ${done - skipped === 1 ? "photo" : "photos"}, ` +
          `${size} KB.` +
          (skipped > 0 ? ` ${skipped} skipped (stored elsewhere, not uploaded here).` : "") +
          " Check your downloads.";
      }
    } catch (error) {
      console.error("Web story failed:", error);

      if (statusEl) {
        statusEl.textContent = "The story stopped part way through. Nothing was saved - try again.";
      }
    } finally {
      if (button) {
        button.disabled = false;

        button.textContent = "Build the Story";
      }

      if (bar) {
        bar.style.width = "100%";
      }
    }
  },

  renderCover(projectData, chosen, byline) {
    const trip = (projectData && projectData.project) || {};

    const first = chosen[0];

    const last = chosen[chosen.length - 1];

    const dates =
      typeof PhotoBook !== "undefined"
        ? PhotoBook.coverDates(first && first.date, last && last.date)
        : "";

    return `

<section class="ws-slide ws-cover">

    <div class="ws-inner">

        <h1>${this.esc(trip.name || "Our Trip")}</h1>

        ${dates ? `<p class="ws-dates">${this.esc(dates)}</p>` : ""}

        ${byline ? `<p class="ws-by">${this.esc(byline)}</p>` : ""}

        <p class="ws-hint" aria-hidden="true">Scroll, or tap the right side</p>

    </div>

</section>

`;
  },

  renderTextSlide(day, entry) {
    const title = day.title ? Format.place(day.title) : `Day ${day.day}`;

    const when = day.date ? Format.date(day.date) : "";

    return `

<section class="ws-slide ws-text">

    <div class="ws-inner">

        <p class="ws-day">Day ${day.day}${when ? ` · ${this.esc(when)}` : ""}</p>

        <h2>${this.esc(title)}</h2>

        <div class="ws-notes">${this.paragraphs(entry.notes)}</div>

        ${entry.notesAuthor ? `<p class="ws-by">— ${this.esc(entry.notesAuthor)}</p>` : ""}

    </div>

</section>

`;
  },

  async renderPhotoSlide(day, photo, includeCaptions) {
    // The DISPLAY copy, not the archive. See the note at the top - this is
    // the one export where the smaller file is the correct one.
    const source = photo.url || photo.archiveUrl;

    if (!String(source || "").startsWith("data/projects/")) {
      return null;
    }

    let dataUrl;

    try {
      dataUrl = await JournalExport.toBase64(source);
    } catch (error) {
      console.warn("Could not embed photo in the story:", source, error);

      return null;
    }

    const when = day.date ? Format.date(day.date) : "";

    const caption =
      includeCaptions && photo.caption
        ? `<p class="ws-caption">${this.esc(photo.caption)}</p>`
        : "";

    return `

<section class="ws-slide ws-photo">

    <img src="${dataUrl}" alt="${this.esc(photo.caption || "")}">

    <div class="ws-scrim"></div>

    <div class="ws-inner ws-bottom">

        <p class="ws-day">Day ${day.day}${when ? ` · ${this.esc(when)}` : ""}</p>

        ${caption}

    </div>

</section>

`;
  },

  renderEnd(projectData, chosen) {
    const trip = (projectData && projectData.project) || {};

    const nights = Math.max(chosen.length - 1, 0);

    return `

<section class="ws-slide ws-end">

    <div class="ws-inner">

        <h2>${this.esc(trip.name || "That was the trip")}</h2>

        <p class="ws-dates">${chosen.length} ${chosen.length === 1 ? "day" : "days"}${nights ? `, ${nights} ${nights === 1 ? "night" : "nights"}` : ""}</p>

    </div>

</section>

`;
  },

  paragraphs(text) {
    return String(text || "")
      .split(/\n\s*\n/)
      .filter((p) => p.trim())
      .map((p) => `<p>${this.esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
      .join("");
  },

  filename(projectData) {
    const trip = (projectData && projectData.project) || {};

    const slug = String(trip.name || "trip")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    return `${slug || "trip"}-story.html`;
  },

  buildDocument(projectData, slides) {
    const trip = (projectData && projectData.project) || {};

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d1117">
<title>${this.esc(trip.name || "Our Trip")}</title>
<style>
  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #0d1117;
    color: #f2f4f7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* Scroll snapping is what makes this a story rather than a long page,
     and it costs nothing: with JS off or broken, this is still a
     perfectly readable vertical scroll. */
  .ws-deck {
    height: 100dvh;
    overflow-y: scroll;
    scroll-snap-type: y mandatory;
    scroll-behavior: smooth;
  }

  .ws-slide {
    position: relative;
    height: 100dvh;
    scroll-snap-align: start;
    scroll-snap-stop: always;
    display: flex;
    overflow: hidden;
  }

  /* Safe-area insets so nothing hides under a notch or a home indicator. */
  .ws-inner {
    position: relative;
    z-index: 2;
    margin: auto;
    width: 100%;
    max-width: 34rem;
    padding: calc(2rem + env(safe-area-inset-top)) 1.6rem calc(2rem + env(safe-area-inset-bottom));
  }

  .ws-bottom { margin: auto 0 0; }

  .ws-photo img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 0;
  }

  /* Text over a photo is unreadable often enough that a scrim is not
     optional - and a gradient rather than a flat wash, so the top of the
     picture stays untouched. */
  .ws-scrim {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 32%, rgba(0,0,0,0) 62%);
  }

  .ws-cover, .ws-end { background: linear-gradient(160deg, #16202b, #0d1117); text-align: center; }

  .ws-cover h1 { font-size: clamp(2rem, 9vw, 3.2rem); font-weight: 700; margin: 0 0 0.6rem; line-height: 1.15; }
  .ws-end h2 { font-size: clamp(1.6rem, 7vw, 2.4rem); margin: 0 0 0.5rem; }

  .ws-dates { color: #aeb8c4; font-size: 1rem; margin: 0; }
  .ws-by { color: #8d97a3; font-size: 0.92rem; margin: 1.2rem 0 0; }

  .ws-hint {
    color: #6f7a86;
    font-size: 0.82rem;
    margin-top: 3rem;
    animation: ws-breathe 2.6s ease-in-out infinite;
  }

  @keyframes ws-breathe { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }

  @media (prefers-reduced-motion: reduce) {
    .ws-hint { animation: none; opacity: 0.7; }
    .ws-deck { scroll-behavior: auto; }
  }

  .ws-day {
    margin: 0 0 0.5rem;
    font-size: 0.74rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #9fb0c2;
  }

  .ws-text h2 { font-size: clamp(1.5rem, 6.5vw, 2.1rem); margin: 0 0 1rem; font-weight: 600; }
  .ws-notes p { font-size: 1.02rem; line-height: 1.72; margin: 0 0 0.9rem; color: #dfe5ec; }

  .ws-caption { margin: 0; font-size: 1.02rem; line-height: 1.5; }

  /* Progress: one segment per screen, filled as you go. */
  .ws-bars {
    position: fixed;
    top: calc(0.5rem + env(safe-area-inset-top));
    left: 0.6rem;
    right: 0.6rem;
    z-index: 10;
    display: flex;
    gap: 3px;
    pointer-events: none;
  }

  .ws-bars i {
    flex: 1 1 0;
    height: 2px;
    border-radius: 2px;
    background: rgba(255,255,255,0.28);
  }

  .ws-bars i.is-seen { background: rgba(255,255,255,0.92); }

  /* Tap zones. Deliberately NOT covering the middle, so a caption stays
     selectable and a photo stays long-pressable to save. */
  .ws-tap {
    position: fixed;
    top: 0;
    bottom: 0;
    width: 28%;
    z-index: 9;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .ws-tap.is-prev { left: 0; }
  .ws-tap.is-next { right: 0; }
  .ws-tap:focus-visible { outline: 2px solid #ffffff; outline-offset: -4px; }
</style>
</head>
<body>

<div class="ws-bars" id="ws-bars" aria-hidden="true"></div>

<button type="button" class="ws-tap is-prev" id="ws-prev" aria-label="Previous"></button>
<button type="button" class="ws-tap is-next" id="ws-next" aria-label="Next"></button>

<main class="ws-deck" id="ws-deck">
${slides.join("")}
</main>

<script>
  (function () {
    var deck = document.getElementById("ws-deck");

    var slides = Array.prototype.slice.call(deck.querySelectorAll(".ws-slide"));

    var bars = document.getElementById("ws-bars");

    slides.forEach(function () { bars.appendChild(document.createElement("i")); });

    var marks = Array.prototype.slice.call(bars.children);

    var current = 0;

    function mark(i) {
      current = i;

      marks.forEach(function (m, n) { m.className = n <= i ? "is-seen" : ""; });
    }

    function go(i) {
      var next = Math.max(0, Math.min(slides.length - 1, i));

      slides[next].scrollIntoView({ behavior: "smooth", block: "start" });

      mark(next);
    }

    document.getElementById("ws-next").onclick = function () { go(current + 1); };

    document.getElementById("ws-prev").onclick = function () { go(current - 1); };

    document.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(current + 1); }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); go(current - 1); }
      if (e.key === "Home") { e.preventDefault(); go(0); }
      if (e.key === "End") { e.preventDefault(); go(slides.length - 1); }
    });

    // Scrolling by hand has to move the progress too, or the bars lie the
    // moment someone swipes instead of tapping.
    if (typeof IntersectionObserver === "function") {
      var seen = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { mark(slides.indexOf(entry.target)); }
        });
      }, { threshold: 0.6 });

      slides.forEach(function (s) { seen.observe(s); });
    }

    mark(0);
  })();
</script>

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

    // Not in this tick - see JournalExport.download. Revoking before the
    // browser has begun cancels the download silently.
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
