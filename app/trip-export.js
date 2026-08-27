/*
=========================================================

COMPASS-TOS

Trip Export

Version 1.0.0

Build 53

Exports the trip (or a single destination) as a clean Markdown
briefing - dates, itinerary, budget targets, and what's already
booked vs. still a research gap - so it can be pasted straight
into an AI chat to search for accommodation, hire cars,
activities and similar.

Purely a client-side read of data already loaded into Project;
no server changes.

=========================================================
*/

const TripExport = {
  scopeLocationId: null,

  returnAction: "Router.navigate('dashboard')",

  open() {
    this.scopeLocationId = null;

    this.returnAction = "Router.navigate('dashboard')";

    Render.show(Layout.render(this.renderView()));
  },

  openForDestination(locationId) {
    this.scopeLocationId = locationId;

    this.returnAction = `Destination.open('${locationId}')`;

    Render.show(Layout.render(this.renderView()));
  },

  renderView() {
    const markdown = this.scopeLocationId ? this.buildDestinationMarkdown(this.scopeLocationId) : this.buildTripMarkdown();

    const heading = this.scopeLocationId
      ? `Export ${this.pretty(this.scopeLocationId)} for AI Research`
      : "Export Trip for AI Research";

    return `

<div class="manager">

    <section class="hero">

        <h1>${this.escHtml(heading)}</h1>

        <p>Copy this into an AI chat (or download it) and ask it to search for accommodation, hire cars, activities and similar - it already knows your dates, budget and what's still a gap.</p>

    </section>

    <div class="manager-card">

        <textarea id="export-text" readonly rows="22" style="width: 100%; font-family: monospace; font-size: 0.85em; white-space: pre;">${this.escHtml(markdown)}</textarea>

        <div class="planner-buttons" style="margin-top: 10px;">

            <button type="button" onclick="TripExport.copyToClipboard()">Copy to Clipboard</button>

            <button type="button" onclick="TripExport.downloadMarkdown()">Download .md</button>

            <button type="button" onclick="${this.returnAction}">← Back</button>

        </div>

        <span id="export-copy-note" class="muted" style="font-size: 0.85em;"></span>

    </div>

</div>

`;
  },

  copyToClipboard() {
    const field = document.getElementById("export-text");

    const note = document.getElementById("export-copy-note");

    if (!field) {
      return;
    }

    field.select();

    const done = (ok) => {
      if (note) {
        note.textContent = ok ? "Copied to clipboard!" : "Couldn't auto-copy — press Ctrl+C to copy the selected text.";
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(field.value).then(
        () => done(true),
        () => {
          try {
            done(document.execCommand("copy"));
          } catch (error) {
            done(false);
          }
        },
      );
    } else {
      try {
        done(document.execCommand("copy"));
      } catch (error) {
        done(false);
      }
    }
  },

  downloadMarkdown() {
    const field = document.getElementById("export-text");

    if (!field) {
      return;
    }

    const projectData = Project.get("project");

    const tripSlug = this.slugify((projectData && projectData.project && projectData.project.name) || "trip");

    const filenameScope = this.scopeLocationId ? `-${this.slugify(this.scopeLocationId)}` : "";

    const blob = new Blob([field.value], { type: "text/markdown" });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = `${tripSlug}${filenameScope}-export.md`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  },

  // --- Data gathering (shared by both scopes) ---

  getItems(data) {
    return data && Array.isArray(data.items) ? data.items : [];
  },

  journeyDays() {
    const journey = Project.get("journey");

    return journey && Array.isArray(journey.days) ? journey.days : [];
  },

  // Unique destinations in the order they're first visited, each with the
  // day numbers spent there (by location OR overnight, matching how the
  // Destination Workspace itself defines a "destination").
  destinationsInTrip() {
    const seen = new Map();

    this.journeyDays().forEach((day) => {
      [day.location, day.overnight].forEach((raw) => {
        const id = String(raw || "").toLowerCase();

        if (!id || id === "flight") {
          return;
        }

        if (!seen.has(id)) {
          seen.set(id, []);
        }

        if (!seen.get(id).includes(day.day)) {
          seen.get(id).push(day.day);
        }
      });
    });

    return Array.from(seen.entries()).map(([id, days]) => ({ id, days: days.sort((a, b) => a - b) }));
  },

  dateForDay(dayNumber) {
    const day = this.journeyDays().find((d) => d.day === dayNumber);

    return day ? day.date : "";
  },

  itemsForDestination(collection, locationId) {
    return this.getItems(Project.get(collection)).filter((item) => String(item.destination || "").toLowerCase() === locationId);
  },

  dayKeyedItemsForDestination(collection, dayNumbers) {
    return this.getItems(Project.get(collection)).filter((item) => dayNumbers.includes(item.day));
  },

  // --- Markdown building blocks ---
  //
  // `esc()` is deliberately NOT HTML-escaping - it's used while building
  // the actual plain-text/Markdown export, which must come out exactly as
  // typed (a hotel called "Bob & Sons" should stay "Bob & Sons" in the
  // copied/downloaded text, not become "Bob &amp; Sons"). Real HTML
  // escaping only happens once, in escHtml(), when that finished
  // Markdown string is embedded into the page's <textarea>.

  esc(value) {
    return String(value ?? "");
  },

  escHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  // Delegates to the shared formatter - see app/format.js. Kept as a
  // local method so every existing this.pretty(...) call still works.
  pretty(value) {
    return Format.place(value);
  },

  slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "trip";
  },

  // Delegates to the shared formatter - see app/format.js.
  money(amount, currency) {
    return Format.money(amount, currency);
  },

  priceOf(item) {
    if (!item.price || !(Number(item.price.amount) > 0)) {
      return "";
    }

    const per = item.price.per ? ` / ${item.price.per}` : "";

    return `${this.money(item.price.amount, item.price.currency)}${per}`;
  },

  itemLine(item, nameField) {
    const name = item[nameField] || "Unnamed";

    const price = this.priceOf(item);

    const status = item.status || "Research";

    return `  - **${name}** — ${status}${price ? ` — ${price}` : ""}`;
  },

  categorySection(title, items, nameField, emptyHint) {
    if (items.length === 0) {
      return `- **${title}:** none researched yet${emptyHint ? ` — ${emptyHint}` : ""}`;
    }

    const lines = items.map((it) => this.itemLine(it, nameField)).join("\n");

    return `- **${title}:**\n${lines}`;
  },

  transportLine(item) {
    const route = [item.from, item.to].filter(Boolean).join(" → ");

    const price = this.priceOf(item);

    const when = Array.isArray(item.dayRange) && item.dayRange[1] !== item.dayRange[0]
      ? `Day ${item.dayRange[0]}–${item.dayRange[1]}, ${this.dateForDay(item.dayRange[0])} to ${this.dateForDay(item.dayRange[1])} (${item.dayRange[1] - item.dayRange[0] + 1} days)`
      : `Day ${item.day}, ${this.dateForDay(item.day)}`;

    return `  - **${item.mode || "Transport"}**${route ? `: ${route}` : ""} — ${item.status || "Research"}${price ? ` — ${price}` : ""} (${when})`;
  },

  flightLine(item) {
    const legs = Flights.getLegs(item);

    const name = legs.map((leg) => `${leg.airline || ""} ${leg.flightNumber || ""}`.trim()).filter(Boolean).join(" / ") || "Flight";

    const route = Flights.routeSummary(item);

    const price = this.priceOf(item);

    return `  - **${name}**${route ? `: ${route}` : ""} — ${item.status || "Research"}${price ? ` — ${price}` : ""} (Day ${item.day})`;
  },

  budgetRange(category) {
    if (!category || (!category.low && !category.high)) {
      return "not set";
    }

    return `${category.low || 0}–${category.high || 0}`;
  },

  tripHeader() {
    const projectData = Project.get("project");

    const trip = (projectData && projectData.project) || {};

    const days = this.journeyDays();

    const first = days[0];

    const last = days[days.length - 1];

    const currency = trip.currency || "USD";

    const lines = [];

    lines.push(`# ${trip.name || "Trip"} — Briefing for AI Research`);

    lines.push("");

    lines.push(`_Exported from COMPASS-TOS._`);

    lines.push("");

    lines.push(`## Trip Overview`);

    lines.push(`- Dates: ${trip.departureDate || (first && first.date) || "not set"} to ${trip.returnDate || (last && last.date) || "not set"} (${days.length} day${days.length === 1 ? "" : "s"})`);

    lines.push(`- Home currency: ${currency}`);

    lines.push(`- Total budget cap: ${trip.budgetCap ? this.money(trip.budgetCap, currency) : "not set"}`);

    return lines.join("\n");
  },

  budgetSection() {
    const budget = Project.get("budget");

    if (!budget) {
      return "";
    }

    const currency = budget.currency || "USD";

    const cat = budget.categories || {};

    const lines = [];

    lines.push(`## Budget Targets (planning estimates, trip-wide - use as guidance, not per-item limits)`);

    lines.push(`- Overall: ${currency} ${this.budgetRange({ low: budget.estimate_low, high: budget.estimate_high })}`);

    lines.push(`- Accommodation: ${currency} ${this.budgetRange(cat.accommodation)}`);

    lines.push(`- Activities: ${currency} ${this.budgetRange(cat.activities)}`);

    lines.push(`- Food: ${currency} ${this.budgetRange(cat.food)}`);

    if (cat.transport) {
      lines.push(
        `- Transport: car hire ${this.budgetRange(cat.transport.car_hire)}, train ${this.budgetRange(cat.transport.train)}, ferry ${this.budgetRange(cat.transport.ferry)}, fuel/tolls/parking ${this.budgetRange(cat.transport.fuel_tolls_parking)}`,
      );
    }

    lines.push(`- Contingency: ${currency} ${this.budgetRange(cat.contingency)}`);

    return lines.join("\n");
  },

  itineraryTable() {
    const lines = [`## Day-by-Day Itinerary`];

    this.journeyDays().forEach((day) => {
      const overnight = day.overnight && day.overnight !== day.location ? `, overnight in ${this.pretty(day.overnight)}` : "";

      lines.push(`- **Day ${day.day}** (${day.date || "date TBD"}): ${this.esc(day.title) || this.pretty(day.location)}${overnight}`);
    });

    return lines.join("\n");
  },

  // Builds the shared "what's here / what's needed" block for one
  // destination. Used both by the whole-trip export (once per place) and
  // the single-destination export.
  destinationBlock(entry) {
    const locationId = entry.id;

    const days = entry.days;

    const dates = days.map((d) => this.dateForDay(d)).filter(Boolean);

    const nights = this.journeyDays().filter((d) => String(d.overnight || "").toLowerCase() === locationId).length;

    const accommodation = this.itemsForDestination("accommodation", locationId);

    const activities = this.itemsForDestination("activities", locationId);

    const restaurants = this.itemsForDestination("restaurants", locationId);

    const transport = this.dayKeyedItemsForDestination("transport", days);

    const flights = this.dayKeyedItemsForDestination("flights", days);

    const lines = [];

    lines.push(`### ${this.pretty(locationId)}${dates.length ? ` (${dates[0]} to ${dates[dates.length - 1]})` : ""}`);

    if (nights > 0) {
      lines.push(`${nights} night${nights === 1 ? "" : "s"} here.`);
    }

    lines.push("");

    lines.push(this.categorySection("Accommodation", accommodation, "name", nights > 0 ? `need somewhere for ${nights} night${nights === 1 ? "" : "s"}` : ""));

    lines.push(this.categorySection("Activities", activities, "name"));

    lines.push(this.categorySection("Restaurants", restaurants, "name"));

    if (transport.length > 0) {
      lines.push(`- **Transport (arriving/leaving):**\n${transport.map((t) => this.transportLine(t)).join("\n")}`);
    } else {
      lines.push(`- **Transport (arriving/leaving):** none researched yet — may need a hire car, train, ferry or similar`);
    }

    if (flights.length > 0) {
      lines.push(`- **Flights:**\n${flights.map((f) => this.flightLine(f)).join("\n")}`);
    }

    return lines.join("\n");
  },

  gapsSummary(entries) {
    const gaps = entries
      .map((entry) => {
        const locationId = entry.id;

        const missing = [];

        if (this.itemsForDestination("accommodation", locationId).length === 0) {
          missing.push("accommodation");
        }

        if (this.itemsForDestination("activities", locationId).length === 0) {
          missing.push("activities");
        }

        if (this.dayKeyedItemsForDestination("transport", entry.days).length === 0) {
          missing.push("transport");
        }

        return missing.length > 0 ? `- **${this.pretty(locationId)}:** still needs ${missing.join(", ")}` : `- **${this.pretty(locationId)}:** fully researched`;
      })
      .join("\n");

    return `## Research Gaps (Summary)\n${gaps || "Nothing planned yet."}`;
  },

  buildTripMarkdown() {
    const entries = this.destinationsInTrip();

    const parts = [
      this.tripHeader(),
      this.budgetSection(),
      this.itineraryTable(),
      `## Destinations & What's Needed\n\n${entries.map((e) => this.destinationBlock(e)).join("\n\n")}`,
      this.gapsSummary(entries),
    ];

    return parts.filter(Boolean).join("\n\n");
  },

  buildDestinationMarkdown(locationId) {
    const entries = this.destinationsInTrip();

    const entry = entries.find((e) => e.id === locationId) || { id: locationId, days: [] };

    const projectData = Project.get("project");

    const trip = (projectData && projectData.project) || {};

    const parts = [
      `# ${this.pretty(locationId)} — Briefing for AI Research\n\n_Part of "${trip.name || "Trip"}", exported from COMPASS-TOS._`,
      this.budgetSection(),
      this.destinationBlock(entry),
    ];

    return parts.filter(Boolean).join("\n\n");
  },
};
