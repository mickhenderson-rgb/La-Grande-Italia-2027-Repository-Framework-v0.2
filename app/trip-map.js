/*
=========================================================

COMPASS-TOS

Trip Map

Version 1.0.0

Build 48 - Step 1 (data + stop rail, no map surface yet)

Computes overnight stops from the real journey.days schema
(grouping consecutive nights at the same overnight location,
skipping transit nights - see JourneyEditor.isTransit), aggregates
a booked / selected / research status per stop from the live
research collections, and renders an accessible, clickable stop
rail with a per-stop detail panel. The Leaflet map surface is
added in Step 2 - this layer has zero external dependencies and
is the permanent no-map fallback.

=========================================================
*/

const TripMap = {
  trip: null,

  journey: null,

  stops: [],

  selectedStopIndex: 0,

  _keyHandler: null,

  map: null,

  _markers: null,

  _route: null,

  // The fetched driving route ({distanceKm, durationMinutes}), kept
  // in memory only - not persisted into trip JSON, both because it's a
  // derived value and because Geoapify's terms don't explicitly cover
  // storing results. The server caches it for 24h, so revisiting the map
  // costs nothing.
  _drivingRoute: null,

  // One polyline per leg (solid where drivable, dashed where not).
  _routeLayers: [],

  // Bumped on every map build so an in-flight route loop can tell it has
  // been superseded and stop drawing.
  _routeToken: 0,

  mode: "overview",

  selectedDay: null,

  _dayMarkers: null,

  _armedItem: null,

  _placeHandler: null,

  // A small built-in lookup so common cities plot even when a trip
  // has no per-day coordinates. Per-day journey lat/lng (added in the
  // Italy test trip, and the Build 49 shape) always take precedence.
  cityCoords: {
    // Cities / towns used by real trips, plus common Italian/European anchors.
    // Region names (dolomites, tuscany) use a representative central point.
    rome: [41.9028, 12.4964],
    milan: [45.4642, 9.19],
    venice: [45.4408, 12.3155],
    florence: [43.7696, 11.2558],
    bologna: [44.4939, 11.3426],
    naples: [40.8518, 14.2681],
    verona: [45.4384, 10.9916],
    turin: [45.0703, 7.6869],
    genoa: [44.4056, 8.9463],
    pisa: [43.7228, 10.4017],
    siena: [43.3188, 11.3308],
    bari: [41.1171, 16.8719],
    "le noirmont": [47.2306, 6.9628],
    "vigano san martino": [45.7197, 9.8036],
    dolomites: [46.4102, 11.844],
    tuscany: [43.46, 11.15],
    sorrento: [40.6263, 14.3757],
    palermo: [38.1157, 13.3615],
    cefalu: [38.0397, 14.023],
    "cefalù": [38.0397, 14.023],
    syracuse: [37.0755, 15.2866],
    siracusa: [37.0755, 15.2866],
    taormina: [37.8526, 15.2876],
    tropea: [38.6776, 15.8969],
    maratea: [39.9936, 15.7203],
    locorotondo: [40.7546, 17.3266],
    matera: [40.6664, 16.6043],
    vienna: [48.2082, 16.3738],
    ljubljana: [46.0569, 14.5058],
  },

  open() {
    this.trip = Project.get("project");

    this.journey = Project.get("journey");

    this.mode = "overview";

    this.selectedDay = null;

    this._armedItem = null;

    this.computeStops();

    this.computeTemporal();

    this.restoreLastViewed();

    Render.show(Layout.render(this.getBodyHTML()));

    this.renderRail();

    this.renderDetail(this.selectedStopIndex);

    this.renderHeaderControls();

    this.registerKeyboard();

    this.loadMap();

    this.primeAirports();
  },

  // resolveCoords can place a stop from the airport a flight lands at, but
  // only once the airport list is in hand - and the first render happens
  // before the fetch resolves. So: if anything is currently unplotted, wait
  // for the list and redraw, but ONLY if it actually placed something.
  // Redrawing for no gain would be a pointless flicker.
  primeAirports() {
    if (typeof Airports === "undefined" || Airports.ready()) {
      return;
    }

    const unplacedBefore = this.stops.filter((stop) => !stop.coords).length;

    if (unplacedBefore === 0) {
      return;
    }

    Airports.load()
      .then(() => {
        this.computeStops();

        if (this.stops.filter((stop) => !stop.coords).length < unplacedBefore) {
          // open() restores the selected stop itself, and calls back into
          // here - harmlessly, since the list is loaded by then.
          this.open();
        }
      })
      .catch(() => {
        // No list, no extra placements. The rail still flags them.
      });
  },

  // =========================================================
  // Data layer
  // =========================================================

  days() {
    return this.journey && Array.isArray(this.journey.days)
      ? this.journey.days
      : [];
  },

  computeStops() {
    const stops = [];

    let current = null;

    this.days().forEach((day, index) => {
      const overnight = String(day.overnight || "").toLowerCase();

      // Transit / no-stay day: close any open stop and emit nothing.
      // JourneyEditor.isTransit covers the explicit flag AND the old
      // literal "flight" spelling, so an overnight ferry or sleeper train
      // no longer arrives here as an unplottable "place".
      const transit = JourneyEditor.isTransit(day);

      if (!overnight || transit) {
        if (current) {
          stops.push(current);

          current = null;
        }

        // A day with NO overnight at all is simply unanswered, and gets
        // nothing. Only a night you have SAID is transit earns a row -
        // otherwise every half-filled day would become one.
        // Day one is where the whole trip sets off from.
        //
        // Its OVERNIGHT is genuinely a plane - you do not sleep in Sydney
        // that night - but its LOCATION is the origin, and a map of the
        // trip that omits where you left from starts at your first hotel.
        //
        // The Italy trip gave it away: day 52's overnight IS "sydney", so
        // the map ended in Sydney without ever starting there.
        //
        // ONLY day one. Every transit day would drop a stop wherever each
        // flight happened to take off from - days 50 and 51 would put Rome
        // and In Transit back on as places you stayed.
        let covered = false;

        if (index === 0) {
          const origin = String(day.location || "").toLowerCase();

          if (origin && !JourneyEditor.isTransitWord(origin)) {
            stops.push({
              location: origin,
              title: this.pretty(origin),
              dayRange: [day.day, day.day],
              days: [day],
              coords: null,
              status: "Research",
              isOrigin: true,
            });

            covered = true;
          }
        }

        // A transit night is still a NIGHT, and belongs in the list.
        //
        // Skipping it entirely left a hole in the dates: Rome to the 10th,
        // Palermo from the 12th, and the 11th nowhere at all - even though
        // you spend it on a ferry with a cabin. It gets a row so the trip
        // reads continuously, and NO COORDINATES so it gets no pin: there
        // is nowhere honest to put one.
        //
        // Not when the origin row above already speaks for this day: night
        // one is spent on a plane out of Sydney, and saying so twice under
        // the same date reads as two different nights.
        //
        // A day with NO overnight at all is simply unanswered, and gets
        // nothing. Only a night you have SAID is transit earns a row -
        // otherwise every half-filled day would become one.
        //
        // Consecutive transit nights group, the same way stays do.
        if (transit && !covered) {
          const last = stops[stops.length - 1];

          if (last && last.isTransit && last.dayRange[1] === day.day - 1) {
            last.dayRange[1] = day.day;

            last.days.push(day);
          } else {
            stops.push({
              location: "",
              title: "In transit",
              dayRange: [day.day, day.day],
              days: [day],
              coords: null,
              status: "Research",
              isTransit: true,
            });
          }
        }

        return;
      }

      if (current && current.location === overnight) {
        current.dayRange[1] = day.day;

        current.days.push(day);
      } else {
        if (current) {
          stops.push(current);
        }

        current = {
          location: overnight,

          title: day.title || this.pretty(overnight),

          dayRange: [day.day, day.day],

          days: [day],

          coords: null,

          status: "Research",
        };
      }
    });

    if (current) {
      stops.push(current);
    }

    stops.forEach((stop) => {
      stop.coords = this.resolveCoords(stop);

      stop.status = this.getStopStatus(stop);
    });

    this.stops = stops;

    if (this.selectedStopIndex >= stops.length) {
      this.selectedStopIndex = 0;
    }
  },

  resolveCoords(stop) {
    // A NIGHT IN TRANSIT HAS NO PLACE. Not "no place yet" - none.
    //
    // Every tier below would happily find it one: day 26 of the Italy trip
    // carries Rome lat/lng because that is where the day STARTS, so the
    // ferry night was pinned in Rome. That split the Rome-to-Palermo leg in
    // two, and the train through Naples - which only exists as a chain
    // across the whole leg - was lost, leaving a ferry sailing out of Rome.
    if (stop.isTransit) {
      return null;
    }

    // Tier 1: per-day lat/lng on the journey day.
    const dayWithCoords = stop.days.find(
      (d) => typeof d.lat === "number" && typeof d.lng === "number",
    );

    if (dayWithCoords) {
      return [dayWithCoords.lat, dayWithCoords.lng];
    }

    // Tier 2: built-in city table, keyed by the overnight slug.
    const fromTable = this.cityCoords[stop.location];

    if (fromTable) {
      return fromTable.slice();
    }

    // Tier 3: an airport this stop flies into or out of.
    //
    // cityCoords is a hand-kept list of 28 European towns. It was fine
    // while every trip was Italian, and useless the moment one started in
    // Sydney and stopped in Doha - neither is in it, so both stops came
    // out unplotted, were filtered from plottedStops(), and the flight
    // legs between them were never drawn at all. The flights had not been
    // misclassified; they had nowhere to be drawn.
    //
    // A leg now carries an IATA code, so the app knows exactly where DOH
    // is. Only reached when the first two tiers found nothing, so it can
    // never override a real pin.
    const fromFlight = this.airportCoordsForStop(stop);

    if (fromFlight) {
      return fromFlight;
    }

    // Tier 4: unplotted - the rail flags it, nothing is dropped.
    return null;
  },

  collectionsForStatus: ["accommodation", "activities", "restaurants", "transport", "flights"],

  itemsInDayRange(collectionKey, stop) {
    const data = Project.get(collectionKey);

    const items = data && Array.isArray(data.items) ? data.items : [];

    const lo = stop.dayRange[0];

    const hi = stop.dayRange[1];

    return items.filter((item) => {
      let a;

      let b;

      if (Array.isArray(item.dayRange) && item.dayRange.length >= 1) {
        a = item.dayRange[0];

        b = item.dayRange[item.dayRange.length - 1];
      } else if (typeof item.day === "number") {
        a = item.day;

        b = item.day;
      } else {
        return false;
      }

      // True range overlap (not membership) - robust to multi-night spans.
      return a <= hi && b >= lo;
    });
  },

  statusRankOf(status) {
    switch (String(status || "")) {
      case "Booked":
      case "Travel":
      case "Review":
        return 4;

      case "Selected":
        return 3;

      case "Shortlisted":
        return 2;

      default:
        return 1;
    }
  },

  getStopStatus(stop) {
    let best = 1;

    this.collectionsForStatus.forEach((key) => {
      this.itemsInDayRange(key, stop).forEach((item) => {
        const rank = this.statusRankOf(item.status);

        if (rank > best) {
          best = rank;
        }
      });
    });

    if (best >= 4) {
      return "Booked";
    }

    if (best === 3) {
      return "Selected";
    }

    return "Research";
  },

  stopItems(stop) {
    const groups = [];

    const config = [
      { key: "accommodation", icon: "🛏", label: "Accommodation" },
      { key: "flights", icon: "✈", label: "Flights" },
      { key: "transport", icon: "🚗", label: "Transport" },
      { key: "activities", icon: "🎭", label: "Activities" },
      { key: "restaurants", icon: "🍽", label: "Restaurants" },
    ];

    config.forEach((c) => {
      const items = this.itemsInDayRange(c.key, stop);

      if (items.length > 0) {
        groups.push({ ...c, items });
      }
    });

    return groups;
  },

  // =========================================================
  // Trip state + temporal treatment (Step 3): halo today's stop, fade
  // past stops, "Jump to today", plus a preview toggle so the
  // in-progress look can be seen before the trip actually begins.
  // =========================================================

  _previewToday: null,

  todayIso() {
    const now = new Date();

    const yyyy = now.getFullYear();

    const mm = String(now.getMonth() + 1).padStart(2, "0");

    const dd = String(now.getDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
  },

  effectiveToday() {
    return this._previewToday || this.todayIso();
  },

  stateForDate(today) {
    const p = this.trip && this.trip.project ? this.trip.project : {};

    if (!p.departureDate || today < p.departureDate) {
      return "planning";
    }

    if (p.returnDate && today > p.returnDate) {
      return "completed";
    }

    return "in-progress";
  },

  effectiveState() {
    return this.stateForDate(this.effectiveToday());
  },

  realState() {
    return this.stateForDate(this.todayIso());
  },

  tripMidpointIso() {
    const p = this.trip && this.trip.project ? this.trip.project : {};

    const a = this.parseIso(p.departureDate);

    const b = this.parseIso(p.returnDate);

    if (!a) {
      return this.todayIso();
    }

    if (!b) {
      return p.departureDate;
    }

    const d1 = Date.UTC(a.y, a.m - 1, a.d);

    const d2 = Date.UTC(b.y, b.m - 1, b.d);

    const mid = new Date(d1 + Math.floor((d2 - d1) / 2));

    const yyyy = mid.getUTCFullYear();

    const mm = String(mid.getUTCMonth() + 1).padStart(2, "0");

    const dd = String(mid.getUTCDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
  },

  computeTemporal() {
    const today = this.effectiveToday();

    this.stops.forEach((stop) => {
      const first = stop.days[0] && stop.days[0].date;

      const last = stop.days[stop.days.length - 1] && stop.days[stop.days.length - 1].date;

      if (last && today > last) {
        stop.temporal = "past";
      } else if (first && today < first) {
        stop.temporal = "future";
      } else {
        stop.temporal = "today";
      }
    });
  },

  railTemporalClass(stop) {
    if (this.effectiveState() !== "in-progress") {
      return "";
    }

    if (stop.temporal === "today") {
      return " is-today";
    }

    if (stop.temporal === "past") {
      return " is-past";
    }

    return "";
  },

  stateChip() {
    const s = this.effectiveState();

    const label = s === "in-progress" ? "In progress" : s === "completed" ? "Completed" : "Planning";

    const preview = this._previewToday ? " · preview" : "";

    return `<span class="tripmap-state is-${s}">${label}${preview}</span>`;
  },

  updateStateChip() {
    const el = document.getElementById("trip-map-statechip");

    if (el) {
      el.innerHTML = this.stateChip();
    }
  },

  renderHeaderControls() {
    const el = document.getElementById("trip-map-actions");

    if (!el) {
      return;
    }

    let html = "";

    if (this.effectiveState() === "in-progress") {
      html += `<button type="button" class="tm-btn-primary" onclick="TripMap.jumpToToday()">Jump to today</button>`;
    }

    if (this._previewToday) {
      html += `<button type="button" onclick="TripMap.togglePreview()">Exit preview</button>`;
    } else if (this.realState() !== "in-progress") {
      html += `<button type="button" onclick="TripMap.togglePreview()">Preview in-progress</button>`;
    }

    html += `<button type="button" onclick="window.print()">Print</button>`;

    el.innerHTML = html;
  },

  jumpToToday() {
    let idx = this.stops.findIndex((s) => s.temporal === "today" && s.coords);

    if (idx === -1) {
      idx = this.stops.findIndex((s) => s.temporal === "today");
    }

    if (idx === -1) {
      idx = 0;
    }

    this.selectStop(idx);
  },

  togglePreview() {
    this._previewToday = this._previewToday ? null : this.tripMidpointIso();

    this.computeTemporal();

    this.renderRail();

    this.renderDetail(this.selectedStopIndex);

    this.applyTemporalToPins();

    this.renderHeaderControls();

    this.updateStateChip();

    if (this._previewToday) {
      this.jumpToToday();
    }
  },

  applyTemporalToPins() {
    if (!this._markers) {
      return;
    }

    const inProgress = this.effectiveState() === "in-progress";

    this._markers.forEach((marker, i) => {
      if (!marker) {
        return;
      }

      const el = marker.getElement();

      if (!el) {
        return;
      }

      const pin = el.querySelector(".tm-pin");

      if (!pin) {
        return;
      }

      const t = this.stops[i].temporal;

      pin.classList.toggle("is-past", inProgress && t === "past");

      pin.classList.toggle("is-today", inProgress && t === "today");
    });
  },

  // =========================================================
  // Rendering
  // =========================================================

  tripName() {
    return this.trip && this.trip.project && this.trip.project.name
      ? this.trip.project.name
      : "Trip Map";
  },

  headerMeta() {
    const p = this.trip && this.trip.project ? this.trip.project : {};

    const dates = this.formatTripDates(p.departureDate, p.returnDate);

    // Places you STOP. A transit night has a row of its own so the trip
    // reads continuously, but you do not stop there - counting it would
    // put the header one ahead of the places you can actually name.
    const count = this.stops.filter((s) => !s.isTransit).length;

    const plotted = this.stops.filter((s) => s.coords).length;

    const parts = [];

    if (dates) {
      parts.push(dates);
    }

    parts.push(`${count} stop${count === 1 ? "" : "s"}`);

    // A transit night has no coordinates ON PURPOSE - counting it as a
    // missing location would tell you to go and fix something that is
    // already right.
    const missing = this.stops.filter((s) => !s.coords && !s.isTransit).length;

    if (missing > 0) {
      parts.push(`${missing} without a location`);
    }

    return parts.join("  ·  ");
  },

  getBodyHTML() {
    if (this.stops.length === 0) {
      return `

${this.styles()}

<div id="trip-map-root" class="tripmap">

    <header class="tripmap-header">

        <div class="tripmap-heading">

            <h1>${this.esc(this.tripName())}</h1>

            <p class="tripmap-meta">No overnight stops found for this trip.</p>

        </div>

    </header>

    <p class="tripmap-empty">Add days with an overnight location in the Planner to see them on the Trip Map.</p>

</div>

`;
    }

    return `

${this.styles()}

<div id="trip-map-root" class="tripmap">

    <header class="tripmap-header">

        <div class="tripmap-heading">

            <h1>${this.esc(this.tripName())}</h1>

            <p class="tripmap-meta">${this.esc(this.headerMeta())} <span id="trip-map-statechip">${this.stateChip()}</span></p>

        </div>

        <div class="tripmap-actions" id="trip-map-actions"></div>

    </header>

    <div class="tripmap-body">

        <div class="tripmap-info">

            <section class="tripmap-detail" id="trip-map-detail" tabindex="-1" aria-live="polite"></section>

            <ol class="tripmap-rail" id="trip-map-rail" aria-label="Trip stops in day order"></ol>

        </div>

        <div class="tripmap-surface-wrap">

            <div id="trip-map-surface" class="tripmap-surface" role="region" aria-label="Trip route map"></div>

            <p class="tripmap-route-summary" id="tm-route-summary" aria-live="polite"></p>

            <p class="tripmap-route-legend" id="tm-route-legend"></p>

        </div>

    </div>

</div>

`;
  },

  renderRail() {
    const rail = document.getElementById("trip-map-rail");

    if (!rail) {
      return;
    }

    const total = this.stops.length;

    rail.innerHTML = this.stops
      .map((stop, idx) => {
        const active = idx === this.selectedStopIndex;

        const unplotted = !stop.coords;

        return `

<li class="tripmap-stop${active ? " is-active" : ""}${this.railTemporalClass(stop)}">

    <button
        type="button"
        class="tripmap-stop-btn"
        id="trip-map-stop-${idx}"
        aria-current="${active ? "true" : "false"}"
        aria-label="${this.esc(this.stopAriaLabel(stop, idx, total))}"
        onclick="TripMap.selectStop(${idx})">

        <span class="tripmap-glyph ${this.statusClass(stop.status)}" aria-hidden="true">${this.statusGlyph(stop.status)}</span>

        <span class="tripmap-stop-text">

            <span class="tripmap-stop-name">${this.esc(stop.title)}</span>

            <span class="tripmap-stop-dates">${this.esc(this.formatDateRange(stop))}</span>

            ${
              stop.isTransit
                ? `<span class="tripmap-transit">🌙 In transit overnight</span>`
                : unplotted
                  ? `<span class="tripmap-flag">⚑ NO LOCATION</span>`
                  : ""
            }

        </span>

    </button>

</li>

`;
      })
      .join("");
  },

  renderDetail(idx) {
    const panel = document.getElementById("trip-map-detail");

    if (!panel) {
      return;
    }

    const stop = this.stops[idx];

    if (!stop) {
      panel.innerHTML = "";

      return;
    }

    const groups = this.stopItems(stop);

    const body =
      groups.length === 0
        ? `<p class="tripmap-detail-empty">Nothing planned for this stop yet.</p>`
        : groups.map((g) => this.renderDetailGroup(g)).join("");

    const unplotted = !stop.coords
      ? `<p class="tripmap-detail-flag">⚑ This stop has no map location yet. Add coordinates (or use a recognised city name) to plot it in Step 2.</p>`
      : "";

    panel.innerHTML = `

<div class="tripmap-detail-head">

    <span class="tripmap-glyph ${this.statusClass(stop.status)}" aria-hidden="true">${this.statusGlyph(stop.status)}</span>

    <div>

        <h2>${this.esc(stop.title)}</h2>

        <p class="tripmap-detail-sub">${this.esc(this.formatDateRange(stop))}  ·  ${this.esc(this.statusLabel(stop.status))}</p>

    </div>

</div>

${this.renderDayTabs(stop)}

${unplotted}

<div class="tripmap-detail-items">

    ${body}

</div>

<div class="tripmap-detail-actions">

    <button type="button" onclick="Router.navigate('planner')">Open in Planner</button>

</div>

`;
  },

  renderDetailGroup(group) {
    const rows = group.items
      .map((item) => {
        const name = this.esc(this.itemName(group.key, item));

        const status = String(item.status || "Research");

        return `

<div class="tripmap-item">

    <span class="tripmap-item-name">${name}</span>

    <span class="tripmap-badge ${this.statusClass(this.bucket(status))}">${this.esc(status)}</span>

</div>

`;
      })
      .join("");

    return `

<div class="tripmap-detail-group">

    <div class="tripmap-detail-group-head">

        <span aria-hidden="true">${group.icon}</span>

        <span>${this.esc(group.label)}</span>

        <span class="tripmap-detail-count">${group.items.length}</span>

    </div>

    ${rows}

</div>

`;
  },

  itemName(key, item) {
    if (key === "flights") {
      return item.title || "Flight";
    }

    if (key === "transport") {
      const route = [item.from, item.to].filter(Boolean).join(" → ");

      return route ? `${item.mode || "Transport"}: ${route}` : item.mode || "Transport";
    }

    return item.name || item.title || this.pretty(key);
  },

  // =========================================================
  // Selection + keyboard
  // =========================================================

  selectStop(idx) {
    if (idx < 0) {
      idx = 0;
    }

    if (idx > this.stops.length - 1) {
      idx = this.stops.length - 1;
    }

    // Selecting a stop leaves day mode and restores the overview map.
    if (this.mode === "day") {
      this.mode = "overview";

      this.selectedDay = null;

      this._armedItem = null;

      this.restoreOverviewMap();
    }

    this.selectedStopIndex = idx;

    this.renderRail();

    this.renderDetail(idx);

    this.saveLastViewed(idx);

    this.highlightMarker(idx);

    const btn = document.getElementById(`trip-map-stop-${idx}`);

    if (btn) {
      btn.focus();
    }
  },

  registerKeyboard() {
    if (this._keyHandler) {
      document.removeEventListener("keydown", this._keyHandler);
    }

    this._keyHandler = (event) => this.handleKey(event);

    document.addEventListener("keydown", this._keyHandler);
  },

  teardown() {
    if (this._keyHandler) {
      document.removeEventListener("keydown", this._keyHandler);

      this._keyHandler = null;
    }

    if (this.map) {
      try {
        this.map.remove();
      } catch (error) {
        // ignore teardown errors
      }

      this.map = null;

      this._markers = null;

      this._route = null;

      // The whole map is gone, so the layers went with it - just drop the
      // references, and move the token so any in-flight route loop stops.
      this._routeLayers = [];

      this._routeToken += 1;

      this._dayMarkers = null;
    }

    this.mode = "overview";

    this.selectedDay = null;

    this._armedItem = null;
  },

  // =========================================================
  // Map (Step 2) - Leaflet substrate + custom pin/route overlay.
  // Leaflet is vendored locally and lazy-loaded only when the map
  // view opens. Everything degrades to the rail if it fails.
  // =========================================================

  loadMap() {
    const plotted = this.stops.filter((s) => s.coords);

    if (plotted.length === 0) {
      this.mapMessage("No stops have map coordinates yet — see the list below.");

      return;
    }

    this.ensureLeaflet(
      () => this.initMap(),
      () => this.mapMessage("Map unavailable — showing the stop list below."),
    );
  },

  ensureLeaflet(onReady, onFail) {
    if (window.L) {
      onReady();

      return;
    }

    const base = window.API_BASE || "";

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");

      link.id = "leaflet-css";

      link.rel = "stylesheet";

      link.href = `${base}/assets/vendor/leaflet/leaflet.css`;

      document.head.appendChild(link);
    }

    let script = document.getElementById("leaflet-js");

    if (!script) {
      script = document.createElement("script");

      script.id = "leaflet-js";

      script.src = `${base}/assets/vendor/leaflet/leaflet.js`;

      document.head.appendChild(script);
    }

    script.addEventListener("load", () => onReady());

    script.addEventListener("error", () => onFail());

    // If it was already loaded between checks, fire now.
    if (window.L) {
      onReady();
    }
  },

  initMap() {
    const el = document.getElementById("trip-map-surface");

    if (!el || !window.L) {
      return;
    }

    const L = window.L;

    if (this.map) {
      try {
        this.map.remove();
      } catch (error) {
        // ignore
      }

      this.map = null;
    }

    el.innerHTML = "";

    const rm = this.reducedMotion();

    this.map = L.map(el, {
      scrollWheelZoom: true,
      zoomAnimation: !rm,
      fadeAnimation: !rm,
      markerZoomAnimation: !rm,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(this.map);

    this.renderRoute();

    this.renderPins();

    this.fitMap();

    this.highlightMarker(this.selectedStopIndex);

    this.applyTemporalToPins();

    // Leaflet must re-measure once the grid/flex column has settled,
    // otherwise a map created inside a just-laid-out column renders short.
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();

        this.fitMap();
      }
    }, 60);
  },

  plottedStops() {
    return this.stops.filter((s) => s.coords);
  },

  // Straight lines between stops, drawn immediately so the map is never
  // empty while the real roads are still being fetched.
  renderRoute() {
    if (!this.map || !window.L) {
      return;
    }

    // Supersede any route loop still running from a previous build.
    this._routeToken += 1;

    this.clearRouteLayers();

    const pts = this.plottedStops().map((s) => s.coords);

    if (pts.length > 1) {
      this._route = window.L.polyline(pts, {
        color: "#34495E",
        weight: 3,
        opacity: 0.35,
        dashArray: "6 6",
      }).addTo(this.map);
    }

    this.loadDrivingRoute();
  },

  // How each way of getting between two stops is drawn.
  //
  // `routeAs` is the Geoapify travel mode to ask for, or null for "don't
  // ask". Rail and sea are null on purpose: Geoapify has no rail mode at
  // all, and offers ferries only as something to AVOID, never as a mode.
  // Asking `drive` for either is worse than useless - a ferry crossing
  // comes back routed the long way round by land, which reads as a real
  // answer while being completely wrong.
  //
  // So a train or ferry leg is drawn as a direct line by DESIGN, not as a
  // failure, and it costs no credit to find that out.
  LEG_STYLES: {
    drive: { routeAs: "drive", verb: "driving", color: "#34495E", weight: 4, opacity: 0.75 },

    walk: { routeAs: "walk", verb: "walking", color: "#34495E", weight: 4, opacity: 0.75 },

    train: { routeAs: null, verb: "by train", color: "#8E44AD", weight: 3, opacity: 0.7, dashArray: "12 5" },

    ferry: { routeAs: null, verb: "by ferry", color: "#2980B9", weight: 3, opacity: 0.7, dashArray: "2 7" },

    flight: { routeAs: null, verb: "by air", color: "#7F8C8D", weight: 2, opacity: 0.6, dashArray: "10 8" },

    // Nothing booked for this gap yet, or "Other". Try the road and fall
    // back quietly - this is the only case where a failed lookup is news.
    unknown: { routeAs: "drive", verb: "driving", color: "#34495E", weight: 4, opacity: 0.75 },
  },

  // The line used when a leg we EXPECTED to drive turns out not to be
  // drivable (an unroutable waypoint, or genuinely no road).
  //
  // Deliberately RED, and not a faded version of the drive colour. It was
  // #34495E at 35% opacity, which composites over map tiles to #b0b5b8 -
  // and the flight line composites to #adb4b2. Three channels apart. On
  // the Italy trip the doha -> milan flight and the FAILED milan -> le
  // noirmont drive therefore read as one continuous dotted line ending in
  // the wrong city. This is not a way of travelling, it is a problem to
  // fix, so it is drawn like one.
  NO_ROUTE_STYLE: { color: "#b3261e", weight: 3, opacity: 0.8, dashArray: "2 8" },

  // Transport.modes -> a LEG_STYLES key. Car Rental and Transfer are cars
  // on roads, so they route exactly like Drive.
  TRANSPORT_MODE_KEYS: {
    drive: "drive",
    "car rental": "drive",
    transfer: "drive",
    walk: "walk",
    train: "train",
    ferry: "ferry",
  },

  // The airport a stop is at, for a stop with no coordinates of its own.
  //
  // Matched by DAY, the same join legModeKey uses: a flight whose days
  // overlap this stop is a flight that put you here. The arrival airport
  // is tried before the departure one, because you sleep where you land.
  //
  // Deliberately approximate. It is only consulted for a stop that would
  // otherwise be a blank, and an airport 20 km from the city centre is a
  // far better answer than no line on the map.
  airportCoordsForStop(stop) {
    if (typeof Airports === "undefined" || !Airports.ready() || typeof Flights === "undefined") {
      return null;
    }

    const flights = Project.get("flights");

    const items = flights && Array.isArray(flights.items) ? flights.items : [];

    const lo = stop.dayRange[0];

    const hi = stop.dayRange[1];

    const want = Airports.normalise(stop.location);

    const candidates = [];

    for (let i = 0; i < items.length; i++) {
      if (!this.itemSpansGap(items[i], lo, hi)) {
        continue;
      }

      const legs = Flights.getLegs(items[i]);

      // Arrivals before departures, and the LAST leg first, because on a
      // through booking the final arrival is where you end up.
      for (let j = legs.length - 1; j >= 0; j--) {
        candidates.push(legs[j].to);
      }

      for (let j = 0; j < legs.length; j++) {
        candidates.push(legs[j].from);
      }
    }

    // First choice: an airport that is demonstrably THIS place.
    //
    // Order alone is not enough on a through booking. Sydney -> Doha ->
    // Milan is one item spanning the Doha stopover, so "the last arrival"
    // put the Doha stop at Malpensa - 4,000 km out, and confidently.
    // Matching the name settles which of a booking's airports is this one.
    if (want) {
      for (let i = 0; i < candidates.length; i++) {
        const airport = Airports.lookup(candidates[i]);

        if (!airport) {
          continue;
        }

        if (
          Airports.normalise(airport.m).indexOf(want) >= 0 ||
          Airports.normalise(airport.n).indexOf(want) >= 0
        ) {
          return [airport.y, airport.x];
        }
      }
    }

    // Otherwise the first airport this booking touches, in the order above.
    // A stop named something no airport echoes still beats a blank.
    for (let i = 0; i < candidates.length; i++) {
      const coords = Airports.coordsOf(candidates[i]);

      if (coords) {
        return coords;
      }
    }

    return null;
  },

  // Works out HOW you get from one stop to the next, by looking for the
  // booking that covers the gap between them.
  //
  // Stops come from day.overnight and know nothing about Transport, so
  // this is the join: a transport or flight item whose days overlap the
  // window between leaving `from` and arriving at `to`. Where several
  // overlap, the one whose destination matches the next stop wins.
  legModeKey(from, to) {
    const lo = from.dayRange[1];

    const hi = to.dayRange[0];

    const target = String(to.location || "").toLowerCase();

    // Flights first: a flight across the gap settles it regardless of any
    // ground transport booked around it.
    const flights = Project.get("flights");

    const flightItems = flights && Array.isArray(flights.items) ? flights.items : [];

    const flownIt = flightItems.some(
      (item) => this.itemSpansGap(item, lo, hi) && this.flightServesLeg(item, target, to),
    );

    if (flownIt) {
      return "flight";
    }

    const transport = Project.get("transport");

    const items = (transport && Array.isArray(transport.items) ? transport.items : []).filter((item) =>
      this.itemSpansGap(item, lo, hi),
    );

    if (items.length === 0) {
      return "unknown";
    }

    // Prefer the booking that actually ends where the next stop is - a
    // three-day window can contain a local taxi as well as the train that
    // moved you between cities.
    const arriving = items.filter((item) => String(item.to || "").toLowerCase() === target);

    const chosen = (arriving.length > 0 ? arriving : items)[0];

    return this.TRANSPORT_MODE_KEYS[String(chosen.mode || "").toLowerCase()] || "unknown";
  },

  // How many transport records cover this leg's window.
  //
  // Two or more that fail to chain is a route the data does not describe;
  // one is just a direct hop and says nothing.
  transportInWindow(from, to) {
    const data = Project.get("transport");

    const all = data && Array.isArray(data.items) ? data.items : [];

    return all.filter((item) => this.itemSpansGap(item, from.dayRange[1], to.dayRange[0])).length;
  },

  // Free text to coordinates: "Rome Termini" -> rome, "Naples Centrale"
  // -> naples, "MXP" -> Malpensa.
  //
  // A transport record names STATIONS AND TERMINALS, not the towns the
  // journey is keyed on, so an exact lookup finds almost nothing. The
  // longest matching city name wins, so "san martino" is not beaten by a
  // shorter key that happens to appear inside it.
  placeCoords(text) {
    const said = String(text || "").trim().toLowerCase();

    if (!said) {
      return null;
    }

    if (this.cityCoords[said]) {
      return this.cityCoords[said].slice();
    }

    let best = null;

    Object.keys(this.cityCoords).forEach((key) => {
      if (said.indexOf(key) === -1) {
        return;
      }

      if (!best || key.length > best.length) {
        best = key;
      }
    });

    if (best) {
      return this.cityCoords[best].slice();
    }

    // An airport code or name, for a leg written as "MXP" or "Milan
    // Malpensa T1".
    if (typeof Airports !== "undefined") {
      const airport = Airports.coordsOf(said);

      if (airport) {
        return airport;
      }
    }

    return null;
  },

  // Is this transport item leaving from where we currently are?
  //
  // Either string containing the other, because one side is a town
  // ("rome") and the other a station ("Rome Termini").
  samePlace(a, b) {
    const x = String(a || "").trim().toLowerCase();

    const y = String(b || "").trim().toLowerCase();

    if (!x || !y) {
      return false;
    }

    return x === y || x.indexOf(y) > -1 || y.indexOf(x) > -1;
  },

  // The path a leg made of several transport hops should draw.
  //
  // Rome to Palermo is a train to Naples and then a ferry, and the map
  // drew one straight line over the top of it.
  //
  // CHAINED from the leg's origin rather than "everything in the window":
  // the same window holds a train to Sorrento, which goes nowhere near
  // Sicily and would bend the line into Campania.
  transportPath(from, to) {
    const data = Project.get("transport");

    const all = data && Array.isArray(data.items) ? data.items : [];

    const lo = from.dayRange[1];

    const hi = to.dayRange[0];

    const inWindow = all.filter((item) => this.itemSpansGap(item, lo, hi));

    if (inWindow.length < 2 || !from.coords || !to.coords) {
      return null;
    }

    // A route that ARRIVES, found by trying branches and backing out of
    // the ones that do not.
    //
    // Greedy-first-match was not enough on the real trip: the window for
    // Rome to Palermo also holds a train to Sorrento, so following the
    // first item out of Naples walked into Campania and stopped there.
    // Taking the chain anyway would have drawn a confident line through
    // the wrong end of the country.
    //
    // Recursion is bounded by the used-set: every step consumes one item.
    const walk = (here, used, waypoints) => {
      if (this.samePlace(here, to.location)) {
        return waypoints;
      }

      for (let i = 0; i < inWindow.length; i++) {
        if (used[i] || !this.samePlace(inWindow[i].from, here)) {
          continue;
        }

        used[i] = true;

        const next = inWindow[i].to;

        // Unresolvable is SKIPPED as a waypoint, not guessed at - bending
        // the line towards the wrong town is worse than not bending it -
        // but the chain still walks THROUGH it, because a hop the map
        // cannot draw is still a hop that gets you there.
        const coords = this.samePlace(next, to.location) ? null : this.placeCoords(next);

        const found = walk(
          next,
          used,
          waypoints.concat([
            {
              code: this.pretty(next),
              coords: coords,
              airport: null,
              // The MODE of the hop that got here, so a train leg draws
              // as a train and the ferry after it as a ferry. One style
              // for the whole chain would paint the train blue.
              modeKey: this.TRANSPORT_MODE_KEYS[String(inWindow[i].mode || "").toLowerCase()] || "unknown",
              arrived: this.samePlace(next, to.location),
            },
          ]),
        );

        if (found) {
          return found;
        }

        used[i] = false;
      }

      return null;
    };

    const hops = walk(from.location, {}, []);

    // NOTHING RATHER THAN A GUESS. If no chain actually reaches the
    // destination, the data does not describe this journey - so the leg
    // draws the straight line it always did rather than a dogleg into
    // wherever the transport happened to lead.
    if (!hops || hops.length < 2) {
      return null;
    }

    // ONE SEGMENT PER HOP, each with its own mode.
    //
    // A single polyline could only carry one style, so Rome-Naples by
    // train and Naples-Palermo by ferry came out entirely one colour -
    // "no train on the map", because the train was painted as a ferry.
    const segments = [];

    let here = from.coords;

    hops.forEach((hop) => {
      // A hop whose place will not resolve cannot be drawn TO, but the
      // journey still passes through it - so the line carries on to the
      // next place that does resolve rather than stopping dead.
      const next = hop.arrived ? to.coords : hop.coords;

      if (!next) {
        return;
      }

      segments.push({ path: [here, next], modeKey: hop.modeKey });

      here = next;
    });

    if (segments.length < 2) {
      return null;
    }

    return {
      segments: segments,
      path: [from.coords].concat(segments.map((seg) => seg.path[1])),
      stopovers: hops.filter((h) => h.coords && !h.arrived),
    };
  },

  // The flight that serves this leg, or null.
  //
  // Exactly the predicate legModeKey uses to decide the leg is flown, so
  // the line drawn and the mode reported can never disagree.
  flightForLeg(from, to) {
    const flights = Project.get("flights");

    const items = flights && Array.isArray(flights.items) ? flights.items : [];

    const lo = from.dayRange[1];

    const hi = to.dayRange[0];

    const target = String(to.location || "").toLowerCase();

    return (
      items.filter(
        (item) => this.itemSpansGap(item, lo, hi) && this.flightServesLeg(item, target, to),
      )[0] || null
    );
  },

  // The airports a booking touches BETWEEN its first departure and its
  // last arrival - the places you changed planes.
  //
  // legs[0].to through legs[n-2].to. The last leg's arrival is where you
  // end up, which is the stop itself, so it is not a stopover.
  stopoverAirports(item) {
    if (typeof Airports === "undefined" || !item) {
      return [];
    }

    const legs = Flights.getLegs(item);

    const out = [];

    for (let i = 0; i < legs.length - 1; i++) {
      const code = legs[i].to;

      const coords = Airports.coordsOf(code);

      // An unresolvable airport is skipped rather than guessed at. A leg
      // saved before v1.17.0 holds free text like "Sydney Airport", and
      // bending the line towards a wrong place is worse than not bending
      // it at all.
      if (coords) {
        out.push({ code: code, coords: coords, airport: Airports.lookup(code) });
      }
    }

    return out;
  },

  // The path a flown leg should actually draw.
  //
  // Endpoints are the STOPS, not the airports, so the line still meets
  // both pins - only the middle is the flight's own shape. A direct
  // flight yields nothing and the caller draws the straight line it
  // always did.
  flightPath(from, to) {
    const item = this.flightForLeg(from, to);

    if (!item || !from.coords || !to.coords) {
      return null;
    }

    const overs = this.stopoverAirports(item);

    if (overs.length === 0) {
      return null;
    }

    return {
      path: [from.coords].concat(overs.map((o) => o.coords)).concat([to.coords]),
      stopovers: overs,
    };
  },

  // Does this flight belong to THIS leg, or to a different one that merely
  // shares a day with it?
  //
  // itemSpansGap only asks about dates, and dates overlap constantly: land
  // in Milan on day 3, drive on to Le Noirmont the same day, and the
  // ARRIVAL flight marks the drive as flown - so no road is ever requested
  // and the leg is drawn as a grey dashed hop.
  //
  // A flight is only ruled out when it demonstrably belongs elsewhere: it
  // names a destination, that destination is not this stop, and it IS
  // another stop on the trip. A flight recorded as landing at "Malpensa"
  // still counts towards a stop called "milan", because nothing better
  // claims it - guessing airport-to-city would fail far more often than
  // this does.
  flightServesLeg(item, target, toStop) {
    const to = String(item.to || "").toLowerCase().trim();

    if (!to || to === target) {
      return true;
    }

    // Since v1.17.0 a leg records an IATA CODE, and a code never matches a
    // stop by name - not even loosely. MXP is not called Milan, it is in a
    // town called Ferno, and the stop is called "milan". Distance is the
    // only honest test: an airport within reach of a stop belongs to that
    // stop, whatever either of them is named.
    if (typeof Airports !== "undefined") {
      const coords = Airports.coordsOf(item.to);

      if (coords && toStop && toStop.coords) {
        return (
          Airports.distanceKm(coords[0], coords[1], toStop.coords[0], toStop.coords[1]) <=
          Airports.NEAR_KM
        );
      }
    }

    return !this.stops.some((stop) => String(stop.location || "").toLowerCase() === to);
  },

  itemSpansGap(item, lo, hi) {
    let a;

    let b;

    if (Array.isArray(item.dayRange) && item.dayRange.length >= 1) {
      a = item.dayRange[0];

      b = item.dayRange[item.dayRange.length - 1];
    } else if (typeof item.day === "number") {
      a = item.day;

      b = item.day;
    } else {
      return false;
    }

    return a <= hi && b >= lo;
  },

  // Replaces the provisional straight lines with the real shape of the
  // trip, ONE LEG AT A TIME, using the mode you actually booked.
  //
  // Two things are going on here, and they were separate bugs:
  //
  // 1. This once asked for the whole trip in a single routing request, so
  //    one undrivable waypoint killed every leg. The Italy trip hit that
  //    two ways at once - a flight leg with no road (sydney -> doha) and a
  //    mountain-range centroid that won't snap to a street (dolomites).
  //    Per-leg costs the same (routing bills per waypoint pair either way)
  //    and caches better.
  //
  // 2. It assumed every gap was a drive. A train or ferry leg would burn a
  //    credit to be told "no route", then be reported as a failure - when
  //    it was never drivable and we already knew that from your own
  //    Transport entry.
  async loadDrivingRoute() {
    const stops = this.plottedStops();

    if (stops.length < 2 || typeof Geo === "undefined") {
      return;
    }

    const summary = document.getElementById("tm-route-summary");

    const setSummary = (text) => {
      if (summary) {
        summary.textContent = text;
      }
    };

    setSummary("Working out the route…");

    // Flight legs are recognised by which airport they land at, so the
    // airport list has to be in hand before the legs are classified. It is
    // cached by the service worker after the first time anything asks, so
    // this is a fetch once per release, not once per map.
    if (typeof Airports !== "undefined" && !Airports.ready()) {
      try {
        await Airports.load();
      } catch (error) {
        // Falls back to matching by name, which is what it did before.
      }
    }

    // Captured now; if the map is rebuilt mid-fetch the token moves on and
    // this (now stale) loop stops drawing onto the new map.
    const token = this._routeToken;

    let totalKm = 0;

    let totalMinutes = 0;

    let routed = 0;

    // Legs drawn direct because that mode has no road route - expected,
    // not a problem worth reporting as one.
    const byOtherMeans = {};

    const disconnected = [];

    // Legs we expected to route and couldn't, because there is no road.
    // Worth reporting, and the fix is usually a misplaced pin.
    const noRoute = [];

    // Legs where the REQUEST failed - a rate limit, a timeout, the service
    // having a moment. A completely different thing needing completely
    // different advice. Conflating the two is how a perfectly good pin on
    // Le Noirmont got reported as a missing road, and then "fixed itself"
    // on the next load.
    let unreachable = 0;

    // Which line styles this trip actually uses, so the legend can show
    // only those.
    const usedKeys = {};

    const legCount = stops.length - 1;

    // Legs are routed SEVERAL AT A TIME.
    //
    // One at a time, a 15-stop trip took 30-40 seconds to finish drawing -
    // thirteen round trips to the routing service, each waiting for the
    // last, on a phone. Nothing about them is sequential: no leg's request
    // depends on any other leg's answer.
    //
    // Four at once, not thirteen: a routing API is a shared, rate-limited
    // resource, and firing every leg simultaneously is how a trip earns a
    // 429 and comes back with nothing. Four keeps a long trip well under
    // ten seconds while staying a polite client.
    const CONCURRENCY = 4;

    // Results are collected BY INDEX and read back in order afterwards, so
    // the summary lists legs in trip order however the answers arrive.
    const results = new Array(legCount);

    let cursor = 0;

    let stopped = false;

    let fatal = null;

    const routeOne = async () => {
      while (!stopped) {
        const i = cursor;

        cursor += 1;

        if (i >= legCount) {
          return;
        }

        const from = stops[i];

        const to = stops[i + 1];

        const key = this.legModeKey(from, to);

        const style = this.LEG_STYLES[key] || this.LEG_STYLES.unknown;

        let leg = null;

        let failed = null;

        if (style.routeAs) {
          try {
            leg = await Geo.routeLeg(from.coords, to.coords, { mode: style.routeAs });
          } catch (error) {
            if (error && error.code === "GEOAPIFY_NOT_CONFIGURED") {
              // The key is missing or wrong for every leg, so the other
              // workers stop rather than repeating this twelve more times.
              stopped = true;

              fatal = error;

              return;
            }

            // Everything else is THIS leg failing, not the trip failing:
            // a rate limit, a timeout, the service having a moment. It is
            // emphatically NOT "there is no road here", and must not be
            // reported as one.
            failed = error;
          }
        }

        // The view may have been torn down or rebuilt while awaiting.
        if (!this.map || !window.L || this._routeToken !== token) {
          stopped = true;

          return;
        }

        results[i] = { key: key, style: style, leg: leg, from: from, to: to, failed: failed };

        // Drawn as it arrives rather than all at the end, so the map fills
        // in while the rest are still in flight.
        if (leg && leg.path && leg.path.length > 1) {
          this._routeLayers.push(this.drawLeg(leg.path, style));
        } else {
          // A flown leg draws its own shape: through the airports you
          // actually changed at, rather than straight over them. Sydney to
          // Milan via Singapore is two flights and should look like two.
          // A flight's own stopovers first, then a chain of transport
          // hops - a leg is one or the other, never both.
          const flown = style.routeAs
            ? null
            : this.flightPath(from, to) || this.transportPath(from, to);

          // Several transport records cover this leg and none of them chain
          // to the far end - worth saying, because the straight line that
          // results looks identical to having drawn nothing special.
          results[i].disconnected = !flown && !style.routeAs && this.transportInWindow(from, to) > 1;

          if (flown && flown.segments) {
            // Each hop in its own colour: the train purple, the ferry blue.
            flown.segments.forEach((seg) => {
              const segStyle = this.LEG_STYLES[seg.modeKey] || style;

              this._routeLayers.push(this.drawLeg(seg.path, segStyle));

              usedKeys[seg.modeKey] = true;
            });
          } else {
            this._routeLayers.push(
              this.drawLeg(
                flown ? flown.path : [from.coords, to.coords],
                style.routeAs ? this.NO_ROUTE_STYLE : style,
              ),
            );
          }

          if (flown) {
            this.markStopovers(flown.stopovers);
          }
        }

        const done = results.filter(Boolean).length;

        if (done < legCount) {
          setSummary(`Working out the route… ${done} of ${legCount} legs`);
        }
      }
    };

    const workers = [];

    for (let w = 0; w < Math.min(CONCURRENCY, legCount); w++) {
      workers.push(routeOne());
    }

    await Promise.all(workers);

    if (fatal) {
      console.error("Could not load routes:", fatal);

      setSummary(`${Geo.errorMessage(fatal, "Couldn't load routes.")} Showing direct lines instead.`);

      return;
    }

    // Torn down mid-flight - the token moved on, so this map is stale.
    if (!this.map || !window.L || this._routeToken !== token) {
      return;
    }

    // Tallied in trip order, so "No road route found for: A → B, C → D"
    // reads the way the trip runs rather than the order the network
    // happened to answer in.
    for (let i = 0; i < legCount; i++) {
      const result = results[i];

      if (!result) {
        continue;
      }

      const leg = result.leg;

      if (leg && leg.path && leg.path.length > 1) {
        totalKm += leg.distanceKm || 0;

        totalMinutes += leg.durationMinutes || 0;

        routed += 1;

        usedKeys[result.key] = true;

        continue;
      }

      // Transport WAS found for this leg and did not chain to the far end,
      // so transportPath refused it and the leg drew a straight line. That
      // refusal is right, and silent - a straight line where you expected a
      // dogleg otherwise looks like the feature never shipped.
      if (result.disconnected) {
        disconnected.push(
          `${this.pretty(result.from.location)} → ${this.pretty(result.to.location)}`,
        );
      }

      if (result.failed) {
        unreachable += 1;
      } else if (result.style.routeAs) {
        noRoute.push(`${this.pretty(result.from.location)} → ${this.pretty(result.to.location)}`);
      } else {
        byOtherMeans[result.style.verb] = (byOtherMeans[result.style.verb] || 0) + 1;

        usedKeys[result.key] = true;
      }
    }

    // Every leg is drawn now, so the provisional whole-trip line can go.
    if (this._route && this.map) {
      this.map.removeLayer(this._route);

      this._route = null;
    }

    this._drivingRoute = { distanceKm: Math.round(totalKm * 10) / 10, durationMinutes: totalMinutes };

    setSummary(
      this.routeSummaryText(legCount, routed, totalKm, totalMinutes, byOtherMeans, noRoute, unreachable, disconnected),
    );

    this.renderRouteLegend(usedKeys, noRoute.length > 0);
  },

  // A key for the line colours, showing ONLY what this trip actually uses -
  // a legend listing ferries on a trip with no ferries is just noise.
  // The summary line above already says the same thing in words, so this
  // is decoration for the map, not the accessible source of truth.
  renderRouteLegend(usedKeys, showNoRoute) {
    const el = document.getElementById("tm-route-legend");

    if (!el) {
      return;
    }

    const entries = Object.keys(usedKeys)
      .filter((key) => key !== "unknown")
      .map((key) => ({ style: this.LEG_STYLES[key], label: this.LEG_STYLES[key].verb }));

    if (showNoRoute) {
      entries.push({ style: this.NO_ROUTE_STYLE, label: "no road route" });
    }

    // One mode and nothing unusual - the map explains itself.
    if (entries.length < 2) {
      el.innerHTML = "";

      return;
    }

    el.innerHTML = entries
      .map((entry) => {
        const s = entry.style;

        const dash = s.dashArray ? ` stroke-dasharray="${s.dashArray}"` : "";

        return `<span class="tripmap-legend-item"><svg width="26" height="8" aria-hidden="true" focusable="false"><line x1="0" y1="4" x2="26" y2="4" stroke="${s.color}" stroke-width="${s.weight}" stroke-opacity="${s.opacity}"${dash} /></svg>${this.esc(entry.label)}</span>`;
      })
      .join("");
  },

  // A small marker at each place you changed planes.
  //
  // Without one the dogleg is just an unexplained bend in a line. With
  // one it says SIN, which is the whole point of drawing it.
  //
  // Deliberately NOT a stop pin: a stopover has no accommodation, no
  // days and nothing to sleep in, and dressing it as a stop would be a
  // lie the rest of the app would then have to answer for.
  markStopovers(stopovers) {
    if (!this.map || !window.L || !Array.isArray(stopovers)) {
      return;
    }

    stopovers.forEach((over) => {
      const icon = window.L.divIcon({
        className: "tm-over-wrap",
        html:
          `<span class="tm-over" aria-hidden="true"></span>` +
          `<span class="tm-plabel" aria-hidden="true">${this.esc(over.code)}</span>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      const marker = window.L.marker(over.coords, { icon: icon, keyboard: false }).addTo(this.map);

      if (over.airport && over.airport.n) {
        marker.bindTooltip(`Changed at ${over.airport.n}`);
      }

      // Tracked with the route layers, so a redraw clears them with
      // everything else rather than stacking a new set on the old.
      this._routeLayers.push(marker);
    });
  },

  drawLeg(latlngs, style) {
    const opts = {
      color: style.color,
      weight: style.weight,
      opacity: style.opacity,
    };

    if (style.dashArray) {
      opts.dashArray = style.dashArray;
    }

    return window.L.polyline(latlngs, opts).addTo(this.map);
  },

  // One line that says what the map is showing. Order matters: what was
  // measured, then what's travelled another way (normal), then what
  // couldn't be worked out (the only part that's a problem).
  routeSummaryText(legCount, routed, totalKm, totalMinutes, byOtherMeans, noRoute, unreachable, disconnected) {
    const parts = [];

    if (routed > 0) {
      const km = Math.round(totalKm * 10) / 10;

      const scope = routed === legCount ? "the whole route" : `${routed} of ${legCount} legs`;

      parts.push(`On the road for ${scope}: ${km} km · about ${Geo.formatDuration(totalMinutes)}`);
    }

    const others = Object.keys(byOtherMeans).map((verb) => {
      const n = byOtherMeans[verb];

      return `${n} ${n === 1 ? "leg" : "legs"} ${verb}`;
    });

    if (others.length > 0) {
      parts.push(`${others.join(", ")} - shown as direct lines`);
    }

    if (noRoute.length > 0) {
      // Named legs plus what to DO about them. Every instance of this so
      // far has been a pin dropped somewhere with no road - a mountain
      // range centroid, or a place name that geocoded to the wrong thing -
      // rather than two towns with genuinely no road between them.
      const which = noRoute.length === 1 ? "this leg" : "these legs";

      parts.push(
        `No road route found for: ${noRoute.join(", ")} - check the pins on ${which}, one of them is probably not on a road`,
      );
    }

    if (unreachable > 0) {
      const legs = unreachable === 1 ? "leg" : "legs";

      parts.push(
        `Couldn't reach the routing service for ${unreachable} ${legs} - shown as direct lines. Reopen the map to try again`,
      );
    }

    // Transport WAS found for these legs and none of it chained end to
    // end, so the leg drew a straight line rather than a dogleg through
    // somewhere the data does not actually connect to.
    //
    // Said out loud because the refusal is invisible: a straight line looks
    // exactly like having drawn nothing special, and the usual cause is a
    // booking left on the wrong day when the trip was reshuffled.
    if (disconnected && disconnected.length > 0) {
      const which = disconnected.length === 1 ? "this leg" : "these legs";

      parts.push(
        `The transport on ${disconnected.join(", ")} doesn't join up end to end, so ${which} ${disconnected.length === 1 ? "is" : "are"} drawn direct - check Readiness for a booking on the wrong day`,
      );
    }

    return parts.length > 0 ? parts.join(". ") + "." : "Nothing to route yet.";
  },

  clearRouteLayers() {
    if (this.map && this._routeLayers) {
      this._routeLayers.forEach((layer) => {
        this.map.removeLayer(layer);
      });
    }

    this._routeLayers = [];
  },

  renderPins() {
    if (!this.map || !window.L) {
      return;
    }

    const L = window.L;

    this._markers = [];

    // Larger tap target on touch/narrow screens.
    const size = (window.innerWidth || 1024) < 768 ? 34 : 26;

    const half = Math.round(size / 2);

    this.stops.forEach((stop, idx) => {
      if (!stop.coords) {
        return;
      }

      // aria-hidden in the markup (not after addTo - the icon element does
      // not exist until the map gets a view) so pins are silent to screen
      // readers; the labelled stop rail is the accessible interface.
      const icon = L.divIcon({
        className: "tripmap-pin-wrap",
        html:
          `<span class="tm-pin ${this.statusClass(stop.status)}" aria-hidden="true">${this.statusGlyph(stop.status)}</span>` +
          `<span class="tm-plabel" aria-hidden="true">${this.esc(this.pinLabel(stop))}</span>`,
        iconSize: [size, size],
        iconAnchor: [half, half],
      });

      // keyboard: false keeps pins out of the tab order.
      const marker = L.marker(stop.coords, { icon, keyboard: false }).addTo(this.map);

      marker.on("click", () => this.selectStop(idx));

      this._markers[idx] = marker;
    });
  },

  pinLabel(stop) {
    return `${this.pretty(stop.location)}  ${this.formatDateRange(stop)}`;
  },

  fitMap() {
    if (!this.map) {
      return;
    }

    const pts = this.plottedStops().map((s) => s.coords);

    if (pts.length === 1) {
      this.map.setView(pts[0], 9);
    } else if (pts.length > 1) {
      this.map.fitBounds(pts, { padding: [45, 45] });
    }
  },

  highlightMarker(idx) {
    if (!this.map || !this._markers) {
      return;
    }

    this._markers.forEach((marker, i) => {
      if (!marker) {
        return;
      }

      const el = marker.getElement();

      if (el) {
        const pin = el.querySelector(".tm-pin");

        if (pin) {
          pin.classList.toggle("is-active", i === idx);
        }
      }

      marker.setZIndexOffset(i === idx ? 1000 : 0);
    });

    const stop = this.stops[idx];

    if (stop && stop.coords) {
      this.map.panTo(stop.coords, { animate: !this.reducedMotion() });
    }
  },

  reducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  },

  mapMessage(text) {
    const el = document.getElementById("trip-map-surface");

    if (el) {
      el.innerHTML = `<div class="tripmap-map-msg">${this.esc(text)}</div>`;
    }
  },

  // =========================================================
  // Day map (Build 49) - drill from a stop into a single day, plot
  // that day's items, and click-to-place coordinates onto an item.
  // Saves via the atomic PUT /api/items/<folder>/<collection>/<id>
  // (API_BASE-prefixed, shallow-merges). No Plus Code / geocoding.
  // =========================================================

  dayItemColl: [
    { key: "accommodation", icon: "🛏" },
    { key: "activities", icon: "🎭" },
    { key: "restaurants", icon: "🍽" },
    { key: "transport", icon: "🚗" },
  ],

  stopForDay(dayNum) {
    return this.stops.find((s) => dayNum >= s.dayRange[0] && dayNum <= s.dayRange[1]);
  },

  getItemsForDay(dayNum) {
    const out = [];

    this.dayItemColl.forEach((c) => {
      const data = Project.get(c.key);

      const items = data && Array.isArray(data.items) ? data.items : [];

      items.forEach((item) => {
        let a;

        let b;

        if (Array.isArray(item.dayRange) && item.dayRange.length >= 1) {
          a = item.dayRange[0];

          b = item.dayRange[item.dayRange.length - 1];
        } else if (typeof item.day === "number") {
          a = item.day;

          b = item.day;
        } else {
          return;
        }

        // Range overlap (dayRange is [first,last], NOT enumerated).
        if (dayNum >= a && dayNum <= b) {
          out.push({ collection: c.key, icon: c.icon, item });
        }
      });
    });

    return out;
  },

  itemCoords(item) {
    const loc = item && item.location;

    if (loc && typeof loc.latitude === "number" && typeof loc.longitude === "number") {
      return [loc.latitude, loc.longitude];
    }

    return null;
  },

  formatOneDay(iso) {
    const p = this.parseIso(iso);

    if (!p) {
      return "";
    }

    return `${p.d} ${this.months[p.m - 1]}`;
  },

  renderDayTabs(stop) {
    if (!stop.days || stop.days.length === 0) {
      return "";
    }

    const tabs = stop.days
      .map((d) => {
        const label = this.formatOneDay(d.date) || `Day ${d.day}`;

        const n = this.getItemsForDay(d.day).length;

        return `<button type="button" class="tm-daytab" onclick="TripMap.enterDayMode(${d.day})">${this.esc(label)}${n ? `<span class="tm-daytab-count">${n}</span>` : ""}</button>`;
      })
      .join("");

    return `

<div class="tripmap-daytabs" role="group" aria-label="Open a day map">

    <span class="tm-daytabs-label">Day maps</span>

    ${tabs}

</div>

`;
  },

  enterDayMode(dayNum) {
    this.mode = "day";

    this.selectedDay = dayNum;

    this._armedItem = null;

    this.renderDayDetail(dayNum);

    if (this.map) {
      this.clearOverviewLayers();

      this.renderDayPins();

      this.fitDay(dayNum);

      this.enableMapPlacement();
    }
  },

  exitDayMode() {
    this.mode = "overview";

    this.selectedDay = null;

    this._armedItem = null;

    this.restoreOverviewMap();

    this.renderDetail(this.selectedStopIndex);
  },

  restoreOverviewMap() {
    if (!this.map) {
      return;
    }

    this.disableMapPlacement();

    this.clearDayLayers();

    this.renderRoute();

    this.renderPins();

    this.fitMap();

    this.highlightMarker(this.selectedStopIndex);

    this.applyTemporalToPins();
  },

  clearOverviewLayers() {
    if (!this.map) {
      return;
    }

    if (this._markers) {
      this._markers.forEach((m) => {
        if (m) {
          this.map.removeLayer(m);
        }
      });
    }

    if (this._route) {
      this.map.removeLayer(this._route);

      this._route = null;
    }

    // Supersede any route loop still drawing legs onto the overview.
    this._routeToken += 1;

    this.clearRouteLayers();
  },

  clearDayLayers() {
    if (this.map && this._dayMarkers) {
      this._dayMarkers.forEach((m) => {
        if (m) {
          this.map.removeLayer(m);
        }
      });
    }

    this._dayMarkers = null;

    if (this.map && this._driveLayers) {
      this._driveLayers.forEach((layer) => {
        if (layer) {
          this.map.removeLayer(layer);
        }
      });
    }

    this._driveLayers = null;
  },

  // THE DAY'S DRIVE: the road you take, and the places you stop on it.
  //
  // The line is the simplified path stored with the drive (v1.44.0), so
  // it draws instantly and works offline. A day with no drive planned
  // draws nothing at all - most days are not driving days.
  //
  // Underneath the item pins deliberately: the road is context for what
  // you are doing that day, not the subject of the map.
  renderDayDrive() {
    if (!this.map || !window.L || typeof Drive === "undefined") {
      return;
    }

    const L = window.L;

    const day = Drive.dayNumbered(this.selectedDay);

    const drive = day ? Drive.driveFor(day) : null;

    if (!drive) {
      return;
    }

    this._driveLayers = this._driveLayers || [];

    const route = drive.route || {};

    // The real road when it was worked out; the waypoints themselves
    // otherwise. A straight line between two towns is a poor drawing of a
    // drive, so it is dashed - the same way the app already distinguishes
    // a route it knows from one it is guessing at.
    const placed = drive.waypoints
      .filter((w) => typeof w.lat === "number" && typeof w.lng === "number")
      .map((w) => [w.lat, w.lng]);

    const hasRoad = Array.isArray(route.path) && route.path.length > 1;

    const line = hasRoad ? route.path : placed;

    if (line.length > 1) {
      const drawn = L.polyline(line, {
        color: "#7A5C3E",
        weight: 4,
        opacity: 0.85,
        dashArray: hasRoad ? null : "8 8",
      }).addTo(this.map);

      this._driveLayers.push(drawn);
    }

    // Numbered so the order you drive them is readable, which a row of
    // identical dots is not.
    placed.forEach((coords, index) => {
      const first = index === 0;

      const last = index === placed.length - 1;

      const label = drive.waypoints.filter((w) => typeof w.lat === "number")[index];

      const marker = L.marker(coords, {
        icon: L.divIcon({
          className: "tripmap-pin-wrap",
          html:
            `<span class="tm-drivepin${first ? " is-start" : last ? " is-end" : ""}" aria-hidden="true">${index + 1}</span>` +
            `<span class="tm-plabel" aria-hidden="true">${this.esc(this.pretty(label ? label.label : ""))}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        keyboard: false,
      }).addTo(this.map);

      marker.bindTooltip(`${first ? "Start" : last ? "Finish" : "Stop " + (index + 1)}: ${this.pretty(label ? label.label : "")}`);

      this._driveLayers.push(marker);
    });
  },

  // Every point the day's drive touches, for fitting the map to it.
  driveBounds(dayNum) {
    if (typeof Drive === "undefined") {
      return [];
    }

    const day = Drive.dayNumbered(dayNum);

    const drive = day ? Drive.driveFor(day) : null;

    if (!drive) {
      return [];
    }

    const route = drive.route || {};

    if (Array.isArray(route.path) && route.path.length > 1) {
      return route.path;
    }

    return drive.waypoints
      .filter((w) => typeof w.lat === "number" && typeof w.lng === "number")
      .map((w) => [w.lat, w.lng]);
  },

  renderDayPins() {
    if (!this.map || !window.L) {
      return;
    }

    const L = window.L;

    this.clearDayLayers();

    // clearDayLayers takes the drive's layers with it - they share a
    // lifetime - so it is redrawn here rather than left to whoever
    // happened to call this.
    this.renderDayDrive();

    this._dayMarkers = [];

    this.getItemsForDay(this.selectedDay).forEach((entry) => {
      const coords = this.itemCoords(entry.item);

      if (!coords) {
        return;
      }

      const bucket = this.bucket(entry.item.status || "Research");

      const icon = L.divIcon({
        className: "tripmap-pin-wrap",
        html:
          `<span class="tm-daypin ${this.statusClass(bucket)}" aria-hidden="true">${entry.icon}</span>` +
          `<span class="tm-plabel" aria-hidden="true">${this.esc(this.itemName(entry.collection, entry.item))}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      this._dayMarkers.push(L.marker(coords, { icon, keyboard: false }).addTo(this.map));
    });
  },

  fitDay(dayNum) {
    if (!this.map) {
      return;
    }

    const pts = this.getItemsForDay(dayNum)
      .map((e) => this.itemCoords(e.item))
      .filter(Boolean)
      // Without the road, a driving day with one hotel on it zooms to
      // that hotel and puts the entire drive off screen.
      .concat(this.driveBounds(dayNum));

    if (pts.length === 1) {
      this.map.setView(pts[0], 15);
    } else if (pts.length > 1) {
      this.map.fitBounds(pts, { padding: [50, 50], maxZoom: 15 });
    } else {
      const stop = this.stopForDay(dayNum);

      if (stop && stop.coords) {
        this.map.setView(stop.coords, 13);
      }
    }

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 60);
  },

  renderDayDetail(dayNum) {
    const panel = document.getElementById("trip-map-detail");

    if (!panel) {
      return;
    }

    const day = this.days().find((d) => d.day === dayNum);

    const dateLabel = day ? this.formatOneDay(day.date) : `Day ${dayNum}`;

    const items = this.getItemsForDay(dayNum);

    const rows =
      items.length === 0
        ? `<p class="tripmap-detail-empty">No items for this day yet. Add them in the Planner, then place them on the map here.</p>`
        : items.map((e) => this.renderDayItemRow(e)).join("");

    const hint = this._armedItem
      ? `<p class="tripmap-place-hint">📍 Click the map to drop “${this.esc(this.armedItemName())}”. <button type="button" class="tm-linkbtn" onclick="TripMap.disarm()">cancel</button></p>`
      : this.map
        ? `<p class="tripmap-place-tip">Press <strong>Place</strong> on an item, then click the map to drop its pin.</p>`
        : "";

    panel.innerHTML = `

<div class="tripmap-detail-head">

    <button type="button" class="tm-back" onclick="TripMap.exitDayMode()">← All stops</button>

</div>

<h2 class="tripmap-day-title">${this.esc(day ? day.title : dateLabel)}</h2>

<p class="tripmap-detail-sub">${this.esc(dateLabel)}</p>

${hint}

<div class="tripmap-detail-items">

    ${rows}

</div>

`;
  },

  renderDayItemRow(entry) {
    const { collection, item, icon } = entry;

    const name = this.esc(this.itemName(collection, item));

    const status = String(item.status || "Research");

    const coords = this.itemCoords(item);

    const armed =
      this._armedItem &&
      this._armedItem.collection === collection &&
      String(this._armedItem.id) === String(item.id);

    const coordLine = coords
      ? `<span class="tm-item-coords">📍 ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}</span>`
      : `<span class="tm-item-nocoords">⚑ no location</span>`;

    const placeBtn = this.map
      ? `<button type="button" class="tm-place-btn${armed ? " is-armed" : ""}" onclick="TripMap.armPlace('${collection}', '${this.esc(String(item.id))}')">${coords ? "Move" : "Place"}</button>`
      : "";

    return `

<div class="tripmap-day-item${armed ? " is-armed" : ""}">

    <span class="tm-item-icon" aria-hidden="true">${icon}</span>

    <span class="tm-item-body">

        <span class="tripmap-item-name">${name}</span>

        <span class="tm-item-meta">${coordLine} · <span class="tripmap-badge ${this.statusClass(this.bucket(status))}">${this.esc(status)}</span></span>

    </span>

    ${placeBtn}

</div>

`;
  },

  armPlace(collection, id) {
    this._armedItem = { collection, id };

    this.renderDayDetail(this.selectedDay);
  },

  disarm() {
    this._armedItem = null;

    this.renderDayDetail(this.selectedDay);
  },

  armedItemName() {
    if (!this._armedItem) {
      return "";
    }

    const data = Project.get(this._armedItem.collection);

    const item =
      data && Array.isArray(data.items)
        ? data.items.find((i) => String(i.id) === String(this._armedItem.id))
        : null;

    return item ? this.itemName(this._armedItem.collection, item) : "";
  },

  enableMapPlacement() {
    if (!this.map) {
      return;
    }

    if (!this._placeHandler) {
      this._placeHandler = (e) => this.onMapPlace(e.latlng);
    }

    this.map.off("click", this._placeHandler);

    this.map.on("click", this._placeHandler);
  },

  disableMapPlacement() {
    if (this.map && this._placeHandler) {
      this.map.off("click", this._placeHandler);
    }
  },

  onMapPlace(latlng) {
    if (!this._armedItem || !latlng) {
      return;
    }

    this.saveItemCoords(this._armedItem.collection, this._armedItem.id, latlng.lat, latlng.lng);
  },

  saveItemCoords(collection, id, lat, lng) {
    const data = Project.get(collection);

    const item =
      data && Array.isArray(data.items)
        ? data.items.find((i) => String(i.id) === String(id))
        : null;

    if (!item) {
      return;
    }

    const location = Object.assign({}, item.location || {}, {
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
    });

    // Optimistic in-memory update + re-render.
    item.location = location;

    this._armedItem = null;

    this.renderDayDetail(this.selectedDay);

    this.renderDayPins();

    // Persist to the item via the atomic merge endpoint (API_BASE prefixed).
    const base = window.API_BASE || "";

    fetch(`${base}/api/items/${Project.projectFolder}/${collection}/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location }),
    })
      .then((r) => {
        if (!r.ok) {
          throw new Error("status " + r.status);
        }
      })
      .catch((error) => {
        console.warn("[trip-map] item location save failed:", error);

        UI.fail("Pin placed on screen, but saving it to the server failed. Check the connection and try again.");
      });
  },

  handleKey(event) {
    // If we've navigated away from the Trip Map, unbind and stop.
    if (!document.getElementById("trip-map-root")) {
      this.teardown();

      return;
    }

    const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";

    if (tag === "input" || tag === "textarea" || tag === "select" || (event.target && event.target.isContentEditable)) {
      return;
    }

    // When the map itself has focus, let Leaflet handle arrows (pan) and
    // +/- (zoom) - only steer the stop rail when focus is outside the map.
    if (event.target && event.target.closest && event.target.closest(".leaflet-container")) {
      return;
    }

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();

        this.selectStop(this.selectedStopIndex - 1);

        break;

      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();

        this.selectStop(this.selectedStopIndex + 1);

        break;

      case "Home":
        event.preventDefault();

        this.selectStop(0);

        break;

      case "End":
        event.preventDefault();

        this.selectStop(this.stops.length - 1);

        break;

      case "Enter":
        event.preventDefault();

        {
          const panel = document.getElementById("trip-map-detail");

          if (panel) {
            panel.focus();
          }
        }

        break;

      default:
        break;
    }
  },

  // =========================================================
  // Persistence
  // =========================================================

  storageKey() {
    const folder = Project.projectFolder || "unknown";

    return `tripMap_lastViewedStop_${folder}`;
  },

  restoreLastViewed() {
    try {
      const raw = localStorage.getItem(this.storageKey());

      const idx = raw === null ? 0 : parseInt(raw, 10);

      this.selectedStopIndex = Number.isFinite(idx) && idx >= 0 ? idx : 0;
    } catch (error) {
      this.selectedStopIndex = 0;
    }
  },

  saveLastViewed(idx) {
    try {
      localStorage.setItem(this.storageKey(), String(idx));
    } catch (error) {
      // localStorage may be unavailable (private mode) - non-fatal.
    }
  },

  // =========================================================
  // Status glyphs / labels (never colour alone)
  // =========================================================

  bucket(status) {
    const rank = this.statusRankOf(status);

    if (rank >= 4) {
      return "Booked";
    }

    if (rank === 3) {
      return "Selected";
    }

    return "Research";
  },

  statusGlyph(bucket) {
    switch (bucket) {
      case "Booked":
        return "●";

      case "Selected":
        return "◎";

      default:
        return "◌";
    }
  },

  statusClass(bucket) {
    switch (bucket) {
      case "Booked":
        return "is-booked";

      case "Selected":
        return "is-selected";

      default:
        return "is-research";
    }
  },

  statusLabel(bucket) {
    switch (bucket) {
      case "Booked":
        return "Booked";

      case "Selected":
        return "Selected";

      default:
        return "Research";
    }
  },

  stopAriaLabel(stop, idx, total) {
    const bits = [
      `Stop ${idx + 1} of ${total}`,
      stop.title,
      this.formatDateRange(stop),
      stop.coords ? this.statusLabel(stop.status) : "no location set",
    ];

    return bits.join(", ");
  },

  // =========================================================
  // Date formatting (from real journey day.date ISO values)
  // =========================================================

  months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],

  parseIso(iso) {
    if (!iso || typeof iso !== "string") {
      return null;
    }

    const parts = iso.split("-").map((n) => parseInt(n, 10));

    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
      return null;
    }

    return { y: parts[0], m: parts[1], d: parts[2] };
  },

  formatDateRange(stop) {
    const first = this.parseIso(stop.days[0] && stop.days[0].date);

    const last = this.parseIso(stop.days[stop.days.length - 1] && stop.days[stop.days.length - 1].date);

    if (!first) {
      return `Day ${stop.dayRange[0]}${stop.dayRange[1] !== stop.dayRange[0] ? `–${stop.dayRange[1]}` : ""}`;
    }

    if (!last || (first.y === last.y && first.m === last.m && first.d === last.d)) {
      return `${first.d} ${this.months[first.m - 1]}`;
    }

    if (first.m === last.m) {
      return `${first.d}–${last.d} ${this.months[last.m - 1]}`;
    }

    return `${first.d} ${this.months[first.m - 1]} – ${last.d} ${this.months[last.m - 1]}`;
  },

  formatTripDates(start, end) {
    const a = this.parseIso(start);

    const b = this.parseIso(end);

    if (!a) {
      return "";
    }

    if (!b) {
      return `${a.d} ${this.months[a.m - 1]} ${a.y}`;
    }

    if (a.y === b.y && a.m === b.m) {
      return `${a.d}–${b.d} ${this.months[b.m - 1]} ${b.y}`;
    }

    if (a.y === b.y) {
      return `${a.d} ${this.months[a.m - 1]} – ${b.d} ${this.months[b.m - 1]} ${b.y}`;
    }

    return `${a.d} ${this.months[a.m - 1]} ${a.y} – ${b.d} ${this.months[b.m - 1]} ${b.y}`;
  },

  // =========================================================
  // Helpers
  // =========================================================

  esc(value) {
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

  styles() {
    return `

<style>

.tripmap { display: flex; flex-direction: column; gap: 12px; }

.tripmap-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }

.tripmap-heading h1 { margin: 0 0 4px; }

.tripmap-meta { margin: 0; color: var(--muted, #6b6357); font-size: 0.92em; }

.tripmap-actions { display: flex; gap: 8px; }

.tripmap-actions button { padding: 7px 15px; border-radius: 999px; border: 1px solid #c9cfd6; background: #ffffff; color: #243447; cursor: pointer; font: inherit; font-weight: 600; }

.tripmap-actions button:hover { background: #eef1f4; border-color: var(--color-primary, #34495E); }

.tripmap-actions button.tm-btn-primary { background: var(--color-primary, #34495E); border-color: var(--color-primary, #34495E); color: #ffffff; }

.tripmap-actions button.tm-btn-primary:hover { background: #2b3d4f; border-color: #2b3d4f; }

.tripmap-note { background: #f3eee6; border: 1px solid #e4ddd0; border-radius: var(--radius, 8px); padding: 8px 12px; font-size: 0.86em; color: #6b6357; }

.tripmap-empty { color: #7a7a7a; font-style: italic; }

.tripmap-body { display: grid; grid-template-columns: minmax(290px, 1fr) 2fr; gap: 16px; align-items: stretch; }

.tripmap-info { display: flex; flex-direction: column; gap: 12px; height: 72vh; min-height: 500px; min-width: 0; }

.tripmap-rail { list-style: none; margin: 0; padding: 0 4px 0 0; display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; overflow-y: auto; }

.tripmap-stop { margin: 0; }

/* Tokens, not literals. These were hard-coded #ffffff on a #e4ddd0 border
   with #243447 text, so in dark mode the whole stop list stayed a stack of
   white cards on a dark page - the one surface in the app that never got
   the theme. */
.tripmap-stop-btn { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--color-border, #e2e5ea); border-radius: var(--radius, 8px); background: var(--color-surface, #ffffff); cursor: pointer; text-align: left; font: inherit; transition: border-color 0.15s, box-shadow 0.15s; }

.tripmap-stop.is-active .tripmap-stop-btn { border-color: var(--color-primary, #34495E); box-shadow: 0 0 0 2px rgba(52, 73, 94, 0.15); }

.tripmap-stop-btn:focus-visible { outline: 2px solid var(--color-primary, #34495E); outline-offset: 2px; }

.tripmap-stop-text { display: flex; flex-direction: column; gap: 2px; }

.tripmap-stop-name { font-weight: 700; color: var(--color-text, #2C3E50); }

.tripmap-stop-dates { font-size: 0.82em; color: var(--color-muted, #6b7280); }

.tripmap-flag { font-size: 0.72em; color: #8a5a18; font-weight: 700; letter-spacing: 0.03em; }

/* A transit night has no pin ON PURPOSE, so it must not borrow the
   amber of a location you forgot to fill in. Quiet and grey: a
   statement about the trip, not a job on your list. */
.tripmap-transit { font-size: 0.72em; color: var(--color-muted, #6b7280); font-weight: 600; letter-spacing: 0.03em; }

.tripmap-glyph { font-size: 1.2em; line-height: 1; width: 1.4em; text-align: center; flex: none; }

.tripmap-glyph.is-booked { color: var(--color-primary, #34495E); }

.tripmap-glyph.is-selected { color: var(--color-secondary, #C79C5D); }

.tripmap-glyph.is-research { color: #9aa0a6; }

.tripmap-detail { background: var(--color-surface, #ffffff); border: 1px solid var(--color-border, #e2e5ea); border-radius: var(--radius, 8px); padding: 14px 16px; flex: 0 0 auto; max-height: 44%; overflow-y: auto; }

.tripmap-detail:focus-visible { outline: 2px solid var(--color-primary, #34495E); outline-offset: 2px; }

.tripmap-detail-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; }

.tripmap-detail-head h2 { margin: 0; font-size: 1.2em; }

.tripmap-detail-sub { margin: 2px 0 0; font-size: 0.85em; color: var(--color-muted, #6b7280); }

.tripmap-detail-flag { background: #fdf3e3; border: 1px solid #f0dcc0; border-radius: 6px; padding: 8px 10px; font-size: 0.82em; color: #8a5a18; }

.tripmap-detail-group { border-top: 1px solid var(--color-rule, #ececec); padding: 10px 0; }

.tripmap-detail-group:first-child { border-top: none; }

.tripmap-detail-group-head { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--color-primary, #34495E); margin-bottom: 6px; }

.tripmap-detail-count { margin-left: auto; font-size: 0.8em; color: var(--color-muted, #6b7280); font-weight: 600; }

.tripmap-item { display: flex; align-items: center; gap: 8px; justify-content: space-between; padding: 4px 0; }

.tripmap-item-name { color: #333; font-size: 0.9em; }

.tripmap-badge { font-size: 0.72em; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }

.tripmap-badge.is-booked { background: #e1f0e3; color: #2e7d4f; }

.tripmap-badge.is-selected { background: #fbe9d0; color: #8a5a18; }

.tripmap-badge.is-research { background: #ececec; color: #555; }

.tripmap-detail-empty { color: var(--color-muted, #6b7280); font-style: italic; }

.tripmap-detail-actions { margin-top: 12px; }

.tripmap-detail-actions button { padding: 8px 16px; border-radius: 999px; border: 1px solid var(--color-primary, #34495E); background: var(--color-primary, #34495E); color: #fff; cursor: pointer; font: inherit; }

.tripmap-surface { height: 72vh; min-height: 500px; border-radius: var(--radius, 8px); border: 1px solid var(--color-border, #e2e5ea); overflow: hidden; background: #e8eaee; z-index: 0; }

.tripmap-surface-wrap { display: flex; flex-direction: column; gap: 8px; }

.tripmap-route-summary { margin: 0; font-size: 12.5px; color: var(--color-muted, #6b6357); min-height: 1.2em; }

/* Empty until a trip actually uses more than one kind of line, so it takes
   no vertical space on an ordinary road trip. */
.tripmap-route-legend { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11.5px; color: var(--color-muted, #6b6357); }

.tripmap-route-legend:empty { display: none; }

.tripmap-legend-item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }

.tripmap-map-msg { display: flex; height: 100%; align-items: center; justify-content: center; padding: 16px; color: var(--color-muted, #6b7280); font-style: italic; text-align: center; }

.leaflet-container { font: inherit; background: #e8eaee; }

.tripmap-pin-wrap { background: transparent; border: none; }

/* MAP INK - fixed, not themed.
   Everything below is drawn ON MAP TILES, and the tiles are the same light
   beige whichever theme the app is in. So these follow the map, not the
   app.
   Getting that backwards is what made the stop label unreadable in dark
   mode: a hard-coded white pill with themed text, which in dark mode meant
   #e8eaed on #ffffff - a contrast ratio of 1.21:1, against the 4.5:1 that
   body text needs. The same slip left the Booked pin glyph at 2.77:1 on
   its own themed background.
   The values here are the LIGHT palette, written out rather than
   referenced, because that is the point: they must not move when the theme
   does. */
/* A stopover: somewhere you changed planes, not somewhere you stayed.
   Smaller and hollow on purpose, so it never reads as a stop. FIXED
   colours like the pins - these sit on map tiles, and the tiles are the
   same beige whichever theme the app is in (see C17). */
.tm-over { display: block; width: 12px; height: 12px; border-radius: 50%; background: #ffffff; border: 2px solid #b3572f; box-sizing: border-box; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35); }

.tm-pin { width: 100%; height: 100%; border-radius: 50%; background: #ffffff; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 1; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); cursor: pointer; transition: transform 0.12s; }

.tm-pin.is-booked { border: 2px solid #34495E; color: #34495E; }

.tm-pin.is-selected { border: 3px double #C79C5D; color: #9a7736; }

.tm-pin.is-research { border: 2px dashed #9aa0a6; color: #6b7075; background: #f4f4f5; }

.tm-pin.is-active { transform: scale(1.3); box-shadow: 0 0 0 6px rgba(52, 73, 94, 0.22), 0 1px 3px rgba(0, 0, 0, 0.4); }

.tm-plabel { display: none; position: absolute; left: 32px; top: 2px; white-space: nowrap; background: rgba(255, 255, 255, 0.96); border: 1px solid #c8ccd2; border-radius: 6px; padding: 1px 7px; font-size: 11px; font-weight: 600; color: #2C3E50; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); pointer-events: none; }

.tripmap-pin-wrap:hover .tm-plabel, .tm-pin.is-active + .tm-plabel { display: block; }

.tripmap-state { display: inline-block; margin-left: 6px; padding: 1px 9px; border-radius: 999px; font-size: 0.72em; font-weight: 700; letter-spacing: 0.02em; vertical-align: middle; }

.tripmap-state.is-planning { background: #eef1f4; color: #46586b; }

.tripmap-state.is-in-progress { background: #e1f0e3; color: #2e7d4f; }

.tripmap-state.is-completed { background: #f3eee6; color: #8a5a18; }

.tripmap-stop.is-past { opacity: 0.5; }

.tripmap-stop.is-today .tripmap-stop-btn { border-color: #2e7d4f; box-shadow: 0 0 0 2px rgba(46, 125, 79, 0.22); }

.tm-pin.is-past { opacity: 0.45; }

.tm-pin.is-today { box-shadow: 0 0 0 7px rgba(46, 125, 79, 0.28), 0 1px 3px rgba(0, 0, 0, 0.4); }

.tripmap-daytabs { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 8px 0 4px; }

.tm-daytabs-label { font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-muted, #6b7280); margin-right: 2px; }

.tm-daytab { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; border: 1px solid #cbd2da; background: var(--color-surface, #ffffff); color: var(--color-text, #2C3E50); font: inherit; font-size: 0.82em; cursor: pointer; }

.tm-daytab:hover { border-color: var(--color-primary, #34495E); background: #eef1f4; }

.tm-daytab-count { background: var(--color-primary, #34495E); color: #fff; border-radius: 999px; font-size: 0.85em; padding: 0 6px; min-width: 16px; text-align: center; }

.tm-back { padding: 4px 10px; border-radius: 999px; border: 1px solid #cbd2da; background: var(--color-surface, #ffffff); color: var(--color-text, #2C3E50); font: inherit; font-weight: 600; cursor: pointer; }

.tm-back:hover { border-color: var(--color-primary, #34495E); background: #eef1f4; }

.tripmap-day-title { margin: 8px 0 0; font-size: 1.15em; }

.tripmap-place-tip { font-size: 0.82em; color: var(--color-muted, #6b7280); margin: 6px 0; }

.tripmap-place-hint { font-size: 0.85em; color: #2e7d4f; background: #e1f0e3; border: 1px solid #bfe0c4; border-radius: 6px; padding: 6px 10px; margin: 6px 0; }

.tm-linkbtn { background: none; border: none; color: #8a5a18; text-decoration: underline; cursor: pointer; font: inherit; padding: 0; }

.tripmap-day-item { display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-top: 1px solid var(--color-rule, #ececec); }

.tripmap-day-item:first-child { border-top: none; }

.tripmap-day-item.is-armed { background: #f2f8f3; border-radius: 8px; }

.tm-item-icon { font-size: 1.15em; flex: none; }

.tm-item-body { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }

.tm-item-meta { font-size: 0.78em; color: var(--color-muted, #6b7280); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

.tm-item-coords { color: #2e7d4f; }

.tm-item-nocoords { color: #8a5a18; font-weight: 600; }

.tm-place-btn { flex: none; padding: 4px 12px; border-radius: 999px; border: 1px solid var(--color-primary, #34495E); background: var(--color-surface, #ffffff); color: var(--color-primary, #34495E); font: inherit; font-size: 0.82em; font-weight: 600; cursor: pointer; }

.tm-place-btn:hover { background: var(--color-primary, #34495E); color: #fff; }

.tm-place-btn.is-armed { background: #2e7d4f; border-color: #2e7d4f; color: #fff; }

.tm-daypin { width: 100%; height: 100%; border-radius: 50%; background: var(--color-surface, #ffffff); box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 1; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); border: 2px solid #9aa0a6; }

.tm-daypin.is-booked { border-color: var(--color-primary, #34495E); }

.tm-daypin.is-selected { border-color: var(--color-secondary, #C79C5D); }

.tm-daypin.is-research { border-color: #9aa0a6; }

/* Waypoints on a driving day. Numbered rather than iconed, because the
   ORDER is the information - a row of identical dots does not say which
   way round you drive them.

   FIXED colours like the other pins: these sit on map tiles, which are the
   same beige in both themes, so following the app theme would make them
   vanish in one of them. */
.tm-drivepin { width: 100%; height: 100%; border-radius: 50%; background: #7A5C3E; color: #ffffff; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; line-height: 1; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); border: 2px solid #ffffff; }

/* Where you set off and where you sleep are the two that matter most. */
.tm-drivepin.is-start { background: #ffffff; color: #7A5C3E; border-color: #7A5C3E; }

.tm-drivepin.is-end { background: #2e7d4f; }

@media (max-width: 820px) {

    .tripmap-body { grid-template-columns: 1fr; }

    .tripmap-surface { height: 340px; min-height: 0; order: -1; }

    .tripmap-info { height: auto; min-height: 0; }

    .tripmap-detail { max-height: none; overflow-y: visible; }

    .tripmap-rail { overflow-y: visible; flex: none; }

    .tm-pin { font-size: 18px; }

    .tripmap-actions { flex-wrap: wrap; }

}

@media (prefers-reduced-motion: reduce) {

    .tripmap-stop-btn { transition: none; }

    .tm-pin { transition: none; }

}

</style>

`;
  },
};
