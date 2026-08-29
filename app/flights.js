/*
=========================================================

COMPASS-TOS

Flights Manager

Version 3.0.0

Build 55

Flights are day-keyed (which day of the trip this flight
departs) rather than tied to a destination. A flight is now
one or more LEGS (item.legs), since a single real-world
booking (one price, one booking reference) very often
involves a stopover - Sydney -> Doha -> Milan is one
ticket, not two separate flight bookings. Each leg keeps
its own airline/flight number/from/to/departure/arrival;
arrival date on the LAST leg is a fact, not a calculation,
since it can land on a different calendar day - Dates.js
reads Flights.overallArrival() to recalculate the rest of
the journey.

Back-compat: an item saved before this build has no `legs`
array at all, just flat airline/flightNumber/from/to/
departure/arrival fields directly on the item. getLegs()
transparently wraps those as a single-leg array so nothing
written under the old schema breaks; the next time that
item is saved it's written out under the new `legs` schema.

=========================================================
*/

const Flights = {
  currentDay: null,

  showAll: false,

  saving: false,

  workflow: ["Research", "Shortlisted", "Selected", "Booked", "Travel", "Review"],

  // Working copy of the legs being edited in the currently-open form.
  // Kept separate from the saved item so add/remove-leg re-renders don't
  // need a full form re-render (which would discard other unsaved fields).
  editingLegs: [],

  open(day) {
    this.currentDay = day;

    this.showAll = false;

    Render.show(Layout.render(this.render()));
  },

  openAll() {
    this.currentDay = null;

    this.showAll = true;

    Render.show(Layout.render(this.render()));
  },

  backAction() {
    return this.currentDay ? `Day.open(${this.currentDay.day})` : `Router.navigate('dashboard')`;
  },

  refresh() {
    if (this.showAll) {
      this.openAll();
    } else if (this.currentDay) {
      this.open(this.currentDay);
    } else {
      this.openAll();
    }
  },

  render() {
    const items = this.getFlights();

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Flights

        </h1>

        <h2>

            ${this.showAll ? "All Days" : `Day ${this.currentDay.day} · ${this.esc(this.currentDay.title)}`}

        </h2>

        <p>

            ${items.length} flight${items.length === 1 ? "" : "s"}

        </p>

    </section>

    <div class="planner-buttons">

        <button type="button" onclick="Flights.add()">

            + Add Flight

        </button>

        <button type="button" onclick="${this.backAction()}">

            ← Back

        </button>

    </div>

    <div class="manager-grid">

        ${this.renderBooked(items)}

        ${this.renderResearch(items)}

        ${this.renderStatus(items)}

    </div>

</div>

`;
  },

  getFlights() {
    const data = Project.get("flights");

    if (!data || !Array.isArray(data.items)) {
      return [];
    }

    if (this.showAll) {
      return data.items;
    }

    return data.items.filter((item) => item.day === this.currentDay.day);
  },

  // --- Leg helpers: the single source of truth for reading a flight's ---
  // --- route/times, whether it's the new legs[] schema or an old flat item ---

  blankLeg(day) {
    return {
      airline: "",
      flightNumber: "",
      from: "",
      to: "",
      departure: { date: (day && day.date) || "", time: "", terminal: "" },
      arrival: { date: "", time: "", terminal: "" },
    };
  },

  getLegs(item) {
    if (Array.isArray(item.legs) && item.legs.length > 0) {
      return item.legs;
    }

    // Old flat-schema item (saved before Build 55) - wrap as a single leg.
    return [
      {
        airline: item.airline || "",
        flightNumber: item.flightNumber || "",
        from: item.from || "",
        to: item.to || "",
        departure: item.departure || { date: "", time: "", terminal: "" },
        arrival: item.arrival || { date: "", time: "", terminal: "" },
      },
    ];
  },

  overallFrom(item) {
    return this.getLegs(item)[0].from;
  },

  overallTo(item) {
    const legs = this.getLegs(item);

    return legs[legs.length - 1].to;
  },

  overallDeparture(item) {
    return this.getLegs(item)[0].departure || {};
  },

  overallArrival(item) {
    const legs = this.getLegs(item);

    return legs[legs.length - 1].arrival || {};
  },

  routeSummary(item) {
    const legs = this.getLegs(item);

    const waypoints = [legs[0].from, ...legs.map((leg) => leg.to)].filter(Boolean);

    return waypoints.join(" → ");
  },

  // A leg once carried departure.location and arrival.location as free
  // text, from before from/to had any structure. They asked you to type a
  // place the record already named, so almost nobody filled them in - and
  // the one screen reading them showed a blank half a card as a result.
  //
  // They are TERMINALS now: the one thing about where a flight touches
  // down that an airport code genuinely cannot say. Old values are still
  // read, because the few trips with anything in there are more likely to
  // have written "Terminal 3" than a city.
  legTerminal(part) {
    if (!part) {
      return "";
    }

    return part.terminal || part.location || "";
  },

  // --- Airport picker -------------------------------------------------
  //
  // A leg's from/to holds an IATA CODE once one is picked, and whatever was
  // typed when one isn't. Codes are what a ticket, a boarding pass and an
  // airline website all use, and "SYD → DOH → MXP" says more in eleven
  // characters than the old free text did in sixty - it says WHICH Milan
  // airport, which was the whole point.
  //
  // Free text still saves. A flight from a strip with no IATA code has to
  // be recordable, and every leg saved before this existed holds a phrase
  // like "Sydney Airport" that must keep working untouched.

  _apResults: {},

  _apActive: {},

  apKey(index, side) {
    return index + "-" + side;
  },

  // The grey line under the field: what the code you typed actually IS.
  // Without it, "MXP" on screen is only a guess that you typed the one you
  // meant - and MXP/MXL/MPX are all real airports on three continents.
  airportHint(value) {
    const text = String(value || "").trim();

    if (!text) {
      return "";
    }

    if (typeof Airports === "undefined") {
      return "";
    }

    // Nothing is unrecognised until the list is actually in hand. The form
    // renders before the fetch resolves, so this used to open every saved
    // flight with "SYD - not a code we recognise" against a perfectly good
    // code. Silence now, and primeAirports() fills the hints in when the
    // list lands.
    if (!Airports.ready()) {
      return "";
    }

    const airport = Airports.lookup(text);

    if (!airport) {
      return Airports.isCode(text)
        ? "Not a code we recognise - it will be saved as typed."
        : "";
    }

    return airport.n + " · " + (airport.m || airport.k);
  },

  // Fetches the airport list as soon as a flight form opens, then fills in
  // every hint the first render could not. Without this the hints under
  // saved codes stay blank until you happen to type in the field.
  primeAirports() {
    if (typeof Airports === "undefined" || Airports.ready()) {
      return;
    }

    Airports.load()
      .then(() => {
        this.editingLegs.forEach((leg, i) => {
          this.setAirportHint(i, "from");

          this.setAirportHint(i, "to");
        });
      })
      .catch(() => {
        // Leave the hints blank - the fields still work as free text.
      });
  },

  setAirportHint(index, side) {
    const input = document.getElementById("flt-leg-" + index + "-" + side);

    const hint = document.getElementById("flt-leg-" + index + "-" + side + "-hint");

    if (input && hint) {
      hint.textContent = this.airportHint(input.value);
    }
  },

  onAirportTyped(index, side, value) {
    if (typeof Airports === "undefined") {
      return;
    }

    this.setAirportHint(index, side);

    // The list is fetched the first time a flight form is opened, not on
    // page load - most sessions never touch a flight, and 391 KB is not
    // worth spending on the ones that don't.
    if (!Airports.ready()) {
      Airports.load()
        .then(() => this.onAirportTyped(index, side, value))
        .catch(() => {
          const hint = document.getElementById("flt-leg-" + index + "-" + side + "-hint");

          if (hint) {
            hint.textContent = "Airport list unavailable - type the airport name instead.";
          }
        });

      return;
    }

    const matches = Airports.search(value, 8);

    this.showAirportRows(index, side, matches, null);

    // Text search alone cannot find Bergamo from "Milan" - see the note at
    // the top of airports.js. So when the typed words find little, ask
    // where that place IS and offer the airports around it.
    //
    // Gated deliberately: only when text has nearly nothing to say, and
    // only for something long enough to be a place name rather than a
    // half-typed code. Geocoding is a paid call, and "LHR" or "london"
    // must never make one.
    if (matches.length >= 3 || String(value || "").trim().length < 4) {
      return;
    }

    Geo.onType(
      value,
      (results) => {
        if (!results || results.length === 0) {
          return;
        }

        const place = results[0];

        const near = Airports.near(Number(place.lat), Number(place.lon), {
          country: place.countryCode,
        });

        if (near.length === 0) {
          return;
        }

        // Anything text already offered is not repeated underneath.
        const seen = {};

        matches.forEach((a) => {
          seen[a.c] = true;
        });

        this.showAirportRows(
          index,
          side,
          matches,
          { place: Geo.shortLabel(place), list: near.filter((a) => !seen[a.c]) },
        );
      },
      () => {
        // No geocoder, no problem - the text matches are already shown.
      },
      { settlements: true },
    );
  },

  showAirportRows(index, side, matches, nearby) {
    const box = document.getElementById("flt-leg-" + index + "-" + side + "-sug");

    if (!box) {
      return;
    }

    const key = this.apKey(index, side);

    const rows = matches.slice();

    let html = matches.map((a, i) => this.airportRow(index, side, a, i)).join("");

    if (nearby && nearby.list.length > 0) {
      html +=
        '<span class="geo-group">Near ' + Airports.esc(nearby.place) + "</span>";

      nearby.list.forEach((a) => {
        html += this.airportRow(index, side, a, rows.length);

        rows.push(a);
      });
    }

    this._apResults[key] = rows;

    this._apActive[key] = -1;

    if (rows.length === 0) {
      box.innerHTML = "";

      box.classList.remove("is-open");

      return;
    }

    box.innerHTML = html;

    box.classList.add("is-open");
  },

  airportRow(index, side, airport, i) {
    const where = [airport.m, airport.k].filter(Boolean).join(", ");

    const distance = airport.km == null ? "" : " · " + airport.km + " km";

    // onmousedown preventDefault stops the input's blur closing the list
    // before the click lands - the same trick the day-location picker uses.
    return (
      '<span class="geo-row" role="option" onmousedown="event.preventDefault()"' +
      ' onclick="Flights.chooseAirport(' + index + ", '" + side + "', " + i + ')">' +
      '<span class="geo-row-text">' +
      '<span class="geo-row-main">' + Airports.esc(airport.c) + " - " + Airports.esc(airport.n) + "</span>" +
      '<span class="geo-row-sub">' + Airports.esc(where) + Airports.esc(distance) + "</span>" +
      "</span>" +
      '<span class="geo-row-cc">' + Airports.esc(airport.c) + "</span>" +
      "</span>"
    );
  },

  chooseAirport(index, side, i) {
    const key = this.apKey(index, side);

    const airport = (this._apResults[key] || [])[i];

    if (!airport) {
      return;
    }

    if (typeof Geo !== "undefined") {
      Geo.cancel();
    }

    const input = document.getElementById("flt-leg-" + index + "-" + side);

    if (input) {
      input.value = airport.c;
    }

    this.setAirportHint(index, side);

    this.hideAirportSuggestions(index, side);
  },

  onAirportKey(event, index, side) {
    const key = this.apKey(index, side);

    const rows = this._apResults[key] || [];

    if (rows.length === 0) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      const step = event.key === "ArrowDown" ? 1 : -1;

      const next = (this._apActive[key] + step + rows.length) % rows.length;

      this._apActive[key] = next;

      this.highlightAirport(index, side);

      return;
    }

    if (event.key === "Enter" && this._apActive[key] >= 0) {
      event.preventDefault();

      this.chooseAirport(index, side, this._apActive[key]);

      return;
    }

    if (event.key === "Escape") {
      this.hideAirportSuggestions(index, side);
    }
  },

  highlightAirport(index, side) {
    const box = document.getElementById("flt-leg-" + index + "-" + side + "-sug");

    if (!box) {
      return;
    }

    const active = this._apActive[this.apKey(index, side)];

    // .geo-row only - the "Near <city>" header is a child of this box as
    // well, and counting it would put the highlight on the wrong airport
    // for every row below the group heading.
    Array.from(box.querySelectorAll(".geo-row")).forEach((el, i) => {
      el.classList.toggle("is-active", i === active);
    });
  },

  hideAirportSuggestions(index, side) {
    const box = document.getElementById("flt-leg-" + index + "-" + side + "-sug");

    if (box) {
      box.classList.remove("is-open");
    }

    this._apActive[this.apKey(index, side)] = -1;
  },

  isDirect(item) {
    return this.getLegs(item).length <= 1;
  },

  // Minutes between one leg's arrival and the next leg's departure, or
  // null if either side is missing/unparseable - used to show layover time.
  layoverMinutes(legA, legB) {
    const arr = legA.arrival || {};

    const dep = legB.departure || {};

    if (!arr.date || !arr.time || !dep.date || !dep.time) {
      return null;
    }

    const arrMs = Date.parse(`${arr.date}T${arr.time}`);

    const depMs = Date.parse(`${dep.date}T${dep.time}`);

    if (Number.isNaN(arrMs) || Number.isNaN(depMs)) {
      return null;
    }

    return Math.round((depMs - arrMs) / 60000);
  },

  formatMinutes(minutes) {
    if (minutes == null || minutes < 0) {
      return "";
    }

    const h = Math.floor(minutes / 60);

    const m = minutes % 60;

    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  },

  layoverLine(item) {
    const legs = this.getLegs(item);

    if (legs.length <= 1) {
      return "";
    }

    const parts = [];

    for (let i = 0; i < legs.length - 1; i++) {
      const minutes = this.layoverMinutes(legs[i], legs[i + 1]);

      const stop = legs[i].to || "stop";

      parts.push(minutes != null ? `${stop} (${this.formatMinutes(minutes)})` : stop);
    }

    return parts.join(", ");
  },

  renderBooked(items) {
    const booked = items.filter((item) => item.status === "Booked" || item.status === "Travel");

    if (booked.length === 0) {
      return `

<div class="manager-card">

<h2>Booked Flights</h2>

<p>Nothing booked yet.</p>

</div>

`;
    }

    let html = `

<div class="manager-card">

<h2>Booked Flights</h2>

<div class="research-list">

`;

    booked.forEach((item) => {
      const dep = this.overallDeparture(item);

      html += `

<div class="research-item is-selected">

    <strong>${this.routeSummary(item) || "Flight"}</strong>
    ${this.showAll ? `<span class="badge">Day ${item.day}</span>` : ""}

    <p>${this.esc(Format.date(dep.date))} ${this.esc(dep.time)}</p>

</div>

`;
    });

    html += `</div></div>`;

    return html;
  },

  renderResearch(items) {
    if (items.length === 0) {
      return `

<div class="manager-card">

    <div class="empty-state">

        <span class="empty-icon" aria-hidden="true">✈</span>

        <p>No flights here yet.</p>

        <button type="button" class="btn-primary" onclick="Flights.add()">Add flight</button>

    </div>

</div>

`;
    }

    let html = `

<div class="manager-card">

<h2>Research List</h2>

<div class="research-list">

`;

    items.forEach((item) => {
      html += this.renderItem(item);
    });

    html += `

</div>

<button type="button" onclick="Flights.add()">+ Add Flight</button>

</div>

`;

    return html;
  },

  renderItem(item) {
    const amount =
      item.price && item.price.amount > 0
        ? Format.money(item.price.amount, item.price.currency)
        : "Price not entered";

    const nextStage = this.nextStage(item.status);

    const dep = this.overallDeparture(item);

    const arr = this.overallArrival(item);

    const arrivalCrosses = dep.date && arr.date && dep.date !== arr.date;

    return `

<div class="research-item">

    <strong>

        ${this.esc(this.routeSummary(item)) || "Flight"}
        ${this.showAll ? `<span class="badge">Day ${item.day}</span>` : ""}
        ${this.isDirect(item) ? `<span class="badge">Direct</span>` : `<span class="badge">${this.getLegs(item).length - 1} stop${this.getLegs(item).length - 1 === 1 ? "" : "s"}</span>`}
        ${!arr.date ? `<span class="badge">⚠ Arrival Not Set</span>` : ""}

    </strong>

    ${this.layoverLine(item) ? `<p>Via ${this.esc(this.layoverLine(item))}</p>` : ""}

    <p>

        ${amount}${Currency.inlineConversion(item.price)}

    </p>

    <p>

        Depart ${this.esc(dep.date)} ${this.esc(dep.time)}
        · Arrive ${arrivalCrosses ? this.esc(arr.date) + " " : ""}${this.esc(arr.time)}

    </p>

    <p>

        Status:
        <span class="badge badge--${String(item.status || "").toLowerCase()}">${item.status}</span>
        ${item.addedBy ? `<span class="badge">Added by ${this.esc(item.addedBy)}</span>` : ""}

    </p>

    <div class="research-actions">

        ${
          nextStage
            ? `<button type="button" onclick="Flights.advance('${item.id}')">Mark ${nextStage}</button>`
            : ""
        }

        <button type="button" onclick="Flights.edit('${item.id}')">Edit</button>

        <button type="button" onclick="Flights.remove('${item.id}')">Delete</button>

    </div>

</div>

`;
  },

  renderStatus(items) {
    const counts = {};

    this.workflow.forEach((stage) => {
      counts[stage] = 0;
    });

    items.forEach((item) => {
      if (counts.hasOwnProperty(item.status)) {
        counts[item.status] += 1;
      }
    });

    let rows = "";

    this.workflow.forEach((stage) => {
      rows += `<tr><td>${stage}</td><td>${counts[stage]}</td></tr>`;
    });

    return `

<div class="manager-card">

<h2>Booking Status</h2>

<table>${rows}</table>

</div>

`;
  },

  nextStage(current) {
    const index = this.workflow.indexOf(current);

    if (index === -1 || index >= this.workflow.length - 1) {
      return null;
    }

    return this.workflow[index + 1];
  },

  advance(id) {
    const data = Project.get("flights");

    const item = data && Array.isArray(data.items) ? data.items.find((x) => x.id === id) : null;

    if (!item) {
      return;
    }

    const next = this.nextStage(item.status);

    if (!next) {
      return;
    }

    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/flights/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Update failed with status ${response.status}`);
        }

        item.status = next;

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not advance flight status:", error);

        UI.fail("Couldn't save that change. Check the connection and try again.");
      });
  },

  add() {
    this.editingLegs = [this.blankLeg(this.currentDay)];

    Render.show(Layout.render(this.renderForm(this.blankItem())));

    this.primeAirports();
  },

  edit(id) {
    const data = Project.get("flights");

    if (!data || !Array.isArray(data.items)) {
      return;
    }

    const item = data.items.find((x) => x.id === id);

    if (!item) {
      return;
    }

    // Deep-copy so in-form edits (add/remove leg, field typing) never
    // mutate the saved item until Save is actually clicked.
    this.editingLegs = this.getLegs(item).map((leg) => JSON.parse(JSON.stringify(leg)));

    Render.show(Layout.render(this.renderForm(item)));

    this.primeAirports();
  },

  remove(id) {
    UI.confirm({
      title: "Remove this flight?",
      body: "This cannot be undone.",
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: () => this.removeConfirmed(id),
    });
  },

  removeConfirmed(id) {
    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/flights/${id}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Remove failed with status ${response.status}`);
        }

        const data = Project.get("flights");

        if (data && Array.isArray(data.items)) {
          data.items = data.items.filter((item) => item.id !== id);
        }

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not remove flight:", error);

        UI.fail("Couldn't remove that item. Check the connection and try again.");
      });
  },

  blankItem() {
    const day = this.currentDay || {};

    return {
      id: "",
      day: day.day || 1,
      legs: [this.blankLeg(day)],
      type: "flight",
      status: "Research",
      locked: false,
      price: { amount: 0, currency: "USD" },
      website: "",
      bookingReference: "",
      planning: { priority: "High", notes: "" },
      actual: { paid: false, completed: false },
    };
  },

  // --- Leg editing: DOM stays in sync with this.editingLegs, which is ---
  // --- what save() actually reads, not fixed per-field ids. ---

  renderLegRows() {
    return this.editingLegs
      .map((leg, i) => {
        const stopLabel = this.editingLegs.length > 1 ? ` — Leg ${i + 1}` : "";

        return `

<div class="flight-leg" data-leg-index="${i}">

    <div class="flight-leg-head">
        <strong>Flight${stopLabel}</strong>
        ${this.editingLegs.length > 1 ? `<button type="button" class="btn-danger btn-sm" onclick="Flights.removeLeg(${i})">Remove Leg</button>` : ""}
    </div>

    <div class="form-grid">

        <label class="form-field">
            Airline
            <input type="text" id="flt-leg-${i}-airline" value="${this.esc(leg.airline)}" placeholder="e.g. Qantas">
        </label>

        <label class="form-field">
            Flight Number
            <input type="text" id="flt-leg-${i}-number" value="${this.esc(leg.flightNumber)}" placeholder="e.g. QF1">
        </label>

        <label class="form-field">
            From
            <span class="geo-input-wrap">
                <input type="text" id="flt-leg-${i}-from" value="${this.esc(leg.from)}" placeholder="Airport, city or code - e.g. SYD"
                    autocomplete="off" spellcheck="false"
                    oninput="Flights.onAirportTyped(${i}, 'from', this.value)"
                    onfocus="Flights.onAirportTyped(${i}, 'from', this.value)"
                    onkeydown="Flights.onAirportKey(event, ${i}, 'from')"
                    onblur="Flights.hideAirportSuggestions(${i}, 'from')">
                <span id="flt-leg-${i}-from-sug" class="geo-suggestions"></span>
            </span>
            <span class="form-hint" id="flt-leg-${i}-from-hint">${this.esc(this.airportHint(leg.from))}</span>
        </label>

        <label class="form-field">
            To
            <span class="geo-input-wrap">
                <input type="text" id="flt-leg-${i}-to" value="${this.esc(leg.to)}" placeholder="Airport, city or code - e.g. DOH"
                    autocomplete="off" spellcheck="false"
                    oninput="Flights.onAirportTyped(${i}, 'to', this.value)"
                    onfocus="Flights.onAirportTyped(${i}, 'to', this.value)"
                    onkeydown="Flights.onAirportKey(event, ${i}, 'to')"
                    onblur="Flights.hideAirportSuggestions(${i}, 'to')">
                <span id="flt-leg-${i}-to-sug" class="geo-suggestions"></span>
            </span>
            <span class="form-hint" id="flt-leg-${i}-to-hint">${this.esc(this.airportHint(leg.to))}</span>
        </label>

        <label class="form-field">
            Departure Date
            <input type="date" id="flt-leg-${i}-dep-date" value="${this.esc(leg.departure && leg.departure.date)}">
        </label>

        <label class="form-field">
            Departure Time
            <input type="time" id="flt-leg-${i}-dep-time" value="${this.esc(leg.departure && leg.departure.time)}">
        </label>

        <label class="form-field">
            Departure Terminal
            <input type="text" id="flt-leg-${i}-dep-term" value="${this.esc(this.legTerminal(leg.departure))}"
                placeholder="e.g. T1">
        </label>

        <label class="form-field">
            Arrival Date
            <input type="date" id="flt-leg-${i}-arr-date" value="${this.esc(leg.arrival && leg.arrival.date)}">
            <span class="form-hint">Can be a different day - the last leg's arrival is what keeps later days in sync</span>
        </label>

        <label class="form-field">
            Arrival Time
            <input type="time" id="flt-leg-${i}-arr-time" value="${this.esc(leg.arrival && leg.arrival.time)}">
        </label>

        <label class="form-field">
            Arrival Terminal
            <input type="text" id="flt-leg-${i}-arr-term" value="${this.esc(this.legTerminal(leg.arrival))}"
                placeholder="e.g. Concourse D">
        </label>

    </div>

</div>

`;
      })
      .join("");
  },

  // Reads every leg row currently in the DOM back into this.editingLegs,
  // so an add/remove-leg re-render (or Save) never loses what's been typed.
  syncLegsFromDOM() {
    this.editingLegs = this.editingLegs.map((leg, i) => {
      const val = (id) => {
        const el = document.getElementById(id);

        return el ? el.value : "";
      };

      return {
        airline: val(`flt-leg-${i}-airline`).trim(),
        flightNumber: val(`flt-leg-${i}-number`).trim(),
        from: val(`flt-leg-${i}-from`).trim(),
        to: val(`flt-leg-${i}-to`).trim(),
        departure: {
          date: val(`flt-leg-${i}-dep-date`),
          time: val(`flt-leg-${i}-dep-time`),
          terminal: val(`flt-leg-${i}-dep-term`).trim(),
        },
        arrival: {
          date: val(`flt-leg-${i}-arr-date`),
          time: val(`flt-leg-${i}-arr-time`),
          terminal: val(`flt-leg-${i}-arr-term`).trim(),
        },
      };
    });
  },

  addLeg() {
    this.syncLegsFromDOM();

    const lastLeg = this.editingLegs[this.editingLegs.length - 1];

    // A new stopover leg naturally starts where the previous one landed.
    const nextLeg = this.blankLeg(null);

    nextLeg.from = lastLeg.to || "";

    this.editingLegs.push(nextLeg);

    this.rerenderLegs();
  },

  removeLeg(index) {
    if (this.editingLegs.length <= 1) {
      return;
    }

    this.syncLegsFromDOM();

    this.editingLegs.splice(index, 1);

    this.rerenderLegs();
  },

  rerenderLegs() {
    const container = document.getElementById("flt-legs");

    if (container) {
      container.innerHTML = this.renderLegRows();
    }
  },

  pickDay(dayNumber) {
    document.getElementById("flt-day").value = dayNumber;

    const date = Dates.getDayDate(dayNumber);

    if (date) {
      const firstLegDate = document.getElementById("flt-leg-0-dep-date");

      if (firstLegDate) {
        firstLegDate.value = date;
      }
    }
  },

  renderForm(item) {
    const isNew = !item.id;

    return `

<div class="manager">

    <section class="hero">

        <h1>

            ${isNew ? "Add Flight" : "Edit Flight"}

        </h1>

        <h2>

            ${this.showAll ? "All Days" : this.currentDay ? `Day ${this.currentDay.day}` : ""}

        </h2>

    </section>

    <div class="manager-card form-card" data-guard="flights:${item.id || 'new'}">

        ${DayReference.render("Flights", "single", { single: "Depart This Day" })}

        <div class="form-grid">

            <label class="form-field">
                Day Number
                <input type="number" id="flt-day" value="${item.day || (this.currentDay ? this.currentDay.day : 1)}" min="1">
            </label>

            <label class="form-field">
                Website / Link
                <input type="text" id="flt-website" value="${this.esc(item.website)}">
            </label>

            <label class="form-field">
                Booking Reference
                <input type="text" id="flt-reference" value="${this.esc(item.bookingReference)}">
            </label>

            <label class="form-field">
                Status
                <select id="flt-status">
                    ${this.statusOptions(item.status)}
                </select>
            </label>

            <label class="form-field">
                Priority
                <select id="flt-priority">
                    ${this.priorityOptions(item.planning?.priority)}
                </select>
            </label>

            <label class="form-field">
                Price Amount
                <input type="number" id="flt-price-amount" value="${item.price?.amount ?? 0}" min="0" step="0.01">
                <span class="form-hint">One price for the whole booking, even with a stopover</span>
            </label>

            <label class="form-field">
                Currency
                <select id="flt-price-currency">${Currency.currencyOptions(item.price?.currency || "USD")}</select>
            </label>

        </div>

        <h3>Flight Legs</h3>

        <div id="flt-legs">${this.renderLegRows()}</div>

        <button type="button" class="btn-secondary btn-sm" onclick="Flights.addLeg()">+ Add Stopover</button>

        <label class="form-field form-field-wide">
            Notes
            <textarea id="flt-notes" rows="4">${this.esc(item.planning?.notes)}</textarea>
        </label>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Flights.save('${item.id || ""}')">

            Save

        </button>

        <button type="button" onclick="${this.backAction()}">

            Cancel

        </button>

        ${!isNew ? `<button type="button" class="btn-danger" onclick="Flights.remove('${item.id}')">Delete</button>` : ""}

    </div>

</div>

`;
  },

  statusOptions(current) {
    return this.workflow
      .map((s) => `<option value="${s}" ${s === current ? "selected" : ""}>${s}</option>`)
      .join("");
  },

  priorityOptions(current) {
    const priorities = ["High", "Medium", "Low"];

    return priorities
      .map((p) => `<option value="${p}" ${p === current ? "selected" : ""}>${p}</option>`)
      .join("");
  },

  save(id) {
    this.syncLegsFromDOM();

    const invalidLeg = this.editingLegs.find((leg) => !leg.from || !leg.to);

    if (invalidLeg) {
      UI.warn("Please enter both a From and To location for every leg before saving.");
      return;
    }

    const dayNumber = parseInt(document.getElementById("flt-day").value, 10);

    if (!dayNumber || dayNumber < 1) {
      UI.warn("Please enter a valid day number before saving.");
      return;
    }

    const isNew = !id;

    const fields = {
      day: dayNumber,
      // getLegs()/overallFrom()/etc. are the only correct way to read a
      // flight's route from here on - old flat airline/from/to/departure/
      // arrival fields are simply never written again. An item saved
      // under the old schema keeps those stale fields in storage (the
      // server does a merge, not a replace) but getLegs() always prefers
      // `legs` when present, so they're inert, not a bug.
      legs: this.editingLegs,
      type: "flight",
      addedBy: isNew ? Project.currentUser || "" : undefined,
      website: document.getElementById("flt-website").value.trim(),
      bookingReference: document.getElementById("flt-reference").value.trim(),
      status: document.getElementById("flt-status").value,
      locked: isNew ? false : undefined,
      price: {
        amount: parseFloat(document.getElementById("flt-price-amount").value) || 0,
        currency: document.getElementById("flt-price-currency").value.trim() || "USD",
      },
      planning: {
        priority: document.getElementById("flt-priority").value,
        notes: document.getElementById("flt-notes").value.trim(),
      },
      actual: isNew ? { paid: false, completed: false } : undefined,
    };

    Object.keys(fields).forEach((key) => {
      if (fields[key] === undefined) {
        delete fields[key];
      }
    });

    if (this.saving) {
      return;
    }

    this.saving = true;

    // These changes are on their way to the server, so navigating away
    // from the form once it succeeds must not ask about them. Guarded so a
    // deployment that somehow lacks form-guard.js still saves.
    if (typeof FormGuard !== "undefined") {
      FormGuard.release();
    }

    const url = isNew
      ? `${window.API_BASE}/api/items/${Data.currentProjectFolder}/flights`
      : `${window.API_BASE}/api/items/${Data.currentProjectFolder}/flights/${id}`;

    fetch(url, {
      method: isNew ? "POST" : "PUT",
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
        const data = Project.get("flights");

        if (data && Array.isArray(data.items)) {
          if (isNew) {
            data.items.push(result.item);
          } else {
            const index = data.items.findIndex((i) => i.id === id);

            if (index !== -1) {
              data.items[index] = result.item;
            }
          }
        }

        Dates.recalculateJourney();

        this.saving = false;

        this.refresh();
      })
      .catch((error) => {
        this.saving = false;

        console.error("Could not save flight:", error);

        UI.fail("Couldn't save that item. Check the connection and try again.");
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
