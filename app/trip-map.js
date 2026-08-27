/*
=========================================================

COMPASS-TOS

Trip Map

Version 1.0.0

Build 48 - Step 1 (data + stop rail, no map surface yet)

Computes overnight stops from the real journey.days schema
(grouping consecutive nights at the same overnight location,
skipping transit days where overnight === "flight"), aggregates
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

    this.days().forEach((day) => {
      const overnight = String(day.overnight || "").toLowerCase();

      // Transit / no-stay day: close any open stop and emit nothing.
      if (!overnight || overnight === "flight") {
        if (current) {
          stops.push(current);

          current = null;
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

    // Tier 3: unplotted - the rail flags it, nothing is dropped.
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

    const count = this.stops.length;

    const plotted = this.stops.filter((s) => s.coords).length;

    const parts = [];

    if (dates) {
      parts.push(dates);
    }

    parts.push(`${count} stop${count === 1 ? "" : "s"}`);

    if (plotted < count) {
      parts.push(`${count - plotted} without a location`);
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

            ${unplotted ? `<span class="tripmap-flag">⚑ NO LOCATION</span>` : ""}

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

  // The dashed line used when a leg we EXPECTED to drive turns out not to
  // be drivable (an unroutable waypoint, or genuinely no road).
  NO_ROUTE_STYLE: { color: "#34495E", weight: 3, opacity: 0.35, dashArray: "6 6" },

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

    const flownIt = flightItems.some((item) => this.itemSpansGap(item, lo, hi));

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

    // Captured now; if the map is rebuilt mid-fetch the token moves on and
    // this (now stale) loop stops drawing onto the new map.
    const token = this._routeToken;

    let totalKm = 0;

    let totalMinutes = 0;

    let routed = 0;

    // Legs drawn direct because that mode has no road route - expected,
    // not a problem worth reporting as one.
    const byOtherMeans = {};

    // Legs we expected to route and couldn't. This IS worth reporting.
    const noRoute = [];

    // Which line styles this trip actually uses, so the legend can show
    // only those.
    const usedKeys = {};

    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i];

      const to = stops[i + 1];

      const key = this.legModeKey(from, to);

      const style = this.LEG_STYLES[key] || this.LEG_STYLES.unknown;

      let leg = null;

      if (style.routeAs) {
        try {
          leg = await Geo.routeLeg(from.coords, to.coords, { mode: style.routeAs });
        } catch (error) {
          // Only a configuration error reaches here - routeLeg swallows
          // the ordinary "can't route this" case.
          console.error("Could not load routes:", error);

          setSummary(`${Geo.errorMessage(error, "Couldn't load routes.")} Showing direct lines instead.`);

          return;
        }
      }

      // The view may have been torn down or rebuilt while awaiting.
      if (!this.map || !window.L || this._routeToken !== token) {
        return;
      }

      if (leg && leg.path && leg.path.length > 1) {
        totalKm += leg.distanceKm || 0;

        totalMinutes += leg.durationMinutes || 0;

        routed += 1;

        usedKeys[key] = true;

        this._routeLayers.push(this.drawLeg(leg.path, style));

        continue;
      }

      const direct = [from.coords, to.coords];

      if (style.routeAs) {
        // We asked for a road and didn't get one.
        noRoute.push(`${this.pretty(from.location)} → ${this.pretty(to.location)}`);

        this._routeLayers.push(this.drawLeg(direct, this.NO_ROUTE_STYLE));
      } else {
        byOtherMeans[style.verb] = (byOtherMeans[style.verb] || 0) + 1;

        usedKeys[key] = true;

        this._routeLayers.push(this.drawLeg(direct, style));
      }
    }

    // Every leg is drawn now, so the provisional whole-trip line can go.
    if (this._route && this.map) {
      this.map.removeLayer(this._route);

      this._route = null;
    }

    this._drivingRoute = { distanceKm: Math.round(totalKm * 10) / 10, durationMinutes: totalMinutes };

    setSummary(this.routeSummaryText(stops.length - 1, routed, totalKm, totalMinutes, byOtherMeans, noRoute));

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
  routeSummaryText(legCount, routed, totalKm, totalMinutes, byOtherMeans, noRoute) {
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
      parts.push(`No road route found for: ${noRoute.join(", ")}`);
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
  },

  renderDayPins() {
    if (!this.map || !window.L) {
      return;
    }

    const L = window.L;

    this.clearDayLayers();

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
      .filter(Boolean);

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

        alert("Pin placed on screen, but saving it to the server failed. Check the connection and try again.");
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

  pretty(value) {
    return String(value || "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
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

.tripmap-stop-btn { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid #e4ddd0; border-radius: var(--radius, 8px); background: #ffffff; cursor: pointer; text-align: left; font: inherit; transition: border-color 0.15s, box-shadow 0.15s; }

.tripmap-stop.is-active .tripmap-stop-btn { border-color: var(--color-primary, #34495E); box-shadow: 0 0 0 2px rgba(52, 73, 94, 0.15); }

.tripmap-stop-btn:focus-visible { outline: 2px solid var(--color-primary, #34495E); outline-offset: 2px; }

.tripmap-stop-text { display: flex; flex-direction: column; gap: 2px; }

.tripmap-stop-name { font-weight: 700; color: #243447; }

.tripmap-stop-dates { font-size: 0.82em; color: #6b6357; }

.tripmap-flag { font-size: 0.72em; color: #8a5a18; font-weight: 700; letter-spacing: 0.03em; }

.tripmap-glyph { font-size: 1.2em; line-height: 1; width: 1.4em; text-align: center; flex: none; }

.tripmap-glyph.is-booked { color: var(--color-primary, #34495E); }

.tripmap-glyph.is-selected { color: var(--color-secondary, #C79C5D); }

.tripmap-glyph.is-research { color: #9aa0a6; }

.tripmap-detail { background: #ffffff; border: 1px solid #e4ddd0; border-radius: var(--radius, 8px); padding: 14px 16px; flex: 0 0 auto; max-height: 44%; overflow-y: auto; }

.tripmap-detail:focus-visible { outline: 2px solid var(--color-primary, #34495E); outline-offset: 2px; }

.tripmap-detail-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; }

.tripmap-detail-head h2 { margin: 0; font-size: 1.2em; }

.tripmap-detail-sub { margin: 2px 0 0; font-size: 0.85em; color: #6b6357; }

.tripmap-detail-flag { background: #fdf3e3; border: 1px solid #f0dcc0; border-radius: 6px; padding: 8px 10px; font-size: 0.82em; color: #8a5a18; }

.tripmap-detail-group { border-top: 1px solid #efe9df; padding: 10px 0; }

.tripmap-detail-group:first-child { border-top: none; }

.tripmap-detail-group-head { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #34495E; margin-bottom: 6px; }

.tripmap-detail-count { margin-left: auto; font-size: 0.8em; color: #6b6357; font-weight: 600; }

.tripmap-item { display: flex; align-items: center; gap: 8px; justify-content: space-between; padding: 4px 0; }

.tripmap-item-name { color: #333; font-size: 0.9em; }

.tripmap-badge { font-size: 0.72em; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }

.tripmap-badge.is-booked { background: #e1f0e3; color: #2e7d4f; }

.tripmap-badge.is-selected { background: #fbe9d0; color: #8a5a18; }

.tripmap-badge.is-research { background: #ececec; color: #555; }

.tripmap-detail-empty { color: #7a7a7a; font-style: italic; }

.tripmap-detail-actions { margin-top: 12px; }

.tripmap-detail-actions button { padding: 8px 16px; border-radius: 999px; border: 1px solid var(--color-primary, #34495E); background: var(--color-primary, #34495E); color: #fff; cursor: pointer; font: inherit; }

.tripmap-surface { height: 72vh; min-height: 500px; border-radius: var(--radius, 8px); border: 1px solid #e4ddd0; overflow: hidden; background: #e8eaee; z-index: 0; }

.tripmap-surface-wrap { display: flex; flex-direction: column; gap: 8px; }

.tripmap-route-summary { margin: 0; font-size: 12.5px; color: var(--color-muted, #6b6357); min-height: 1.2em; }

/* Empty until a trip actually uses more than one kind of line, so it takes
   no vertical space on an ordinary road trip. */
.tripmap-route-legend { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 11.5px; color: var(--color-muted, #6b6357); }

.tripmap-route-legend:empty { display: none; }

.tripmap-legend-item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }

.tripmap-map-msg { display: flex; height: 100%; align-items: center; justify-content: center; padding: 16px; color: #6b6357; font-style: italic; text-align: center; }

.leaflet-container { font: inherit; background: #e8eaee; }

.tripmap-pin-wrap { background: transparent; border: none; }

.tm-pin { width: 100%; height: 100%; border-radius: 50%; background: #ffffff; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 1; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); cursor: pointer; transition: transform 0.12s; }

.tm-pin.is-booked { border: 2px solid var(--color-primary, #34495E); color: var(--color-primary, #34495E); }

.tm-pin.is-selected { border: 3px double var(--color-secondary, #C79C5D); color: #9a7736; }

.tm-pin.is-research { border: 2px dashed #9aa0a6; color: #6b7075; background: #f4f4f5; }

.tm-pin.is-active { transform: scale(1.3); box-shadow: 0 0 0 6px rgba(52, 73, 94, 0.22), 0 1px 3px rgba(0, 0, 0, 0.4); }

.tm-plabel { display: none; position: absolute; left: 32px; top: 2px; white-space: nowrap; background: rgba(255, 255, 255, 0.94); border: 1px solid #e4ddd0; border-radius: 6px; padding: 1px 7px; font-size: 11px; font-weight: 600; color: #243447; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); pointer-events: none; }

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

.tm-daytabs-label { font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.06em; color: #6b6357; margin-right: 2px; }

.tm-daytab { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; border: 1px solid #cbd2da; background: #fff; color: #243447; font: inherit; font-size: 0.82em; cursor: pointer; }

.tm-daytab:hover { border-color: var(--color-primary, #34495E); background: #eef1f4; }

.tm-daytab-count { background: var(--color-primary, #34495E); color: #fff; border-radius: 999px; font-size: 0.85em; padding: 0 6px; min-width: 16px; text-align: center; }

.tm-back { padding: 4px 10px; border-radius: 999px; border: 1px solid #cbd2da; background: #fff; color: #243447; font: inherit; font-weight: 600; cursor: pointer; }

.tm-back:hover { border-color: var(--color-primary, #34495E); background: #eef1f4; }

.tripmap-day-title { margin: 8px 0 0; font-size: 1.15em; }

.tripmap-place-tip { font-size: 0.82em; color: #6b6357; margin: 6px 0; }

.tripmap-place-hint { font-size: 0.85em; color: #2e7d4f; background: #e1f0e3; border: 1px solid #bfe0c4; border-radius: 6px; padding: 6px 10px; margin: 6px 0; }

.tm-linkbtn { background: none; border: none; color: #8a5a18; text-decoration: underline; cursor: pointer; font: inherit; padding: 0; }

.tripmap-day-item { display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-top: 1px solid #efe9df; }

.tripmap-day-item:first-child { border-top: none; }

.tripmap-day-item.is-armed { background: #f2f8f3; border-radius: 8px; }

.tm-item-icon { font-size: 1.15em; flex: none; }

.tm-item-body { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }

.tm-item-meta { font-size: 0.78em; color: #6b6357; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

.tm-item-coords { color: #2e7d4f; }

.tm-item-nocoords { color: #8a5a18; font-weight: 600; }

.tm-place-btn { flex: none; padding: 4px 12px; border-radius: 999px; border: 1px solid var(--color-primary, #34495E); background: #fff; color: var(--color-primary, #34495E); font: inherit; font-size: 0.82em; font-weight: 600; cursor: pointer; }

.tm-place-btn:hover { background: var(--color-primary, #34495E); color: #fff; }

.tm-place-btn.is-armed { background: #2e7d4f; border-color: #2e7d4f; color: #fff; }

.tm-daypin { width: 100%; height: 100%; border-radius: 50%; background: #ffffff; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 1; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); border: 2px solid #9aa0a6; }

.tm-daypin.is-booked { border-color: var(--color-primary, #34495E); }

.tm-daypin.is-selected { border-color: var(--color-secondary, #C79C5D); }

.tm-daypin.is-research { border-color: #9aa0a6; }

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
