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
      html += `<button type="button" onclick="TripMap.jumpToToday()">Jump to today</button>`;
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

        <div id="trip-map-surface" class="tripmap-surface" role="region" aria-label="Trip route map"></div>

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
    }
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

    this.map = L.map(el, { scrollWheelZoom: true });

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

  renderRoute() {
    if (!this.map || !window.L) {
      return;
    }

    const pts = this.plottedStops().map((s) => s.coords);

    if (pts.length > 1) {
      this._route = window.L.polyline(pts, {
        color: "#34495E",
        weight: 3,
        opacity: 0.6,
      }).addTo(this.map);
    }
  },

  renderPins() {
    if (!this.map || !window.L) {
      return;
    }

    const L = window.L;

    this._markers = [];

    this.stops.forEach((stop, idx) => {
      if (!stop.coords) {
        return;
      }

      const icon = L.divIcon({
        className: "tripmap-pin-wrap",
        html:
          `<span class="tm-pin ${this.statusClass(stop.status)}">${this.statusGlyph(stop.status)}</span>` +
          `<span class="tm-plabel">${this.esc(this.pinLabel(stop))}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const marker = L.marker(stop.coords, { icon }).addTo(this.map);

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

.tripmap-actions button { padding: 6px 14px; border-radius: 999px; border: 1px solid #dcc9b7; background: #fff; cursor: pointer; font: inherit; }

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

.tripmap-map-msg { display: flex; height: 100%; align-items: center; justify-content: center; padding: 16px; color: #6b6357; font-style: italic; text-align: center; }

.leaflet-container { font: inherit; background: #e8eaee; }

.tripmap-pin-wrap { background: transparent; border: none; }

.tm-pin { width: 26px; height: 26px; border-radius: 50%; background: #ffffff; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 1; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); cursor: pointer; transition: transform 0.12s; }

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

@media (max-width: 820px) {

    .tripmap-body { grid-template-columns: 1fr; }

    .tripmap-surface { height: 340px; min-height: 0; order: -1; }

    .tripmap-info { height: auto; min-height: 0; }

}

@media (prefers-reduced-motion: reduce) {

    .tripmap-stop-btn { transition: none; }

    .tm-pin { transition: none; }

}

</style>

`;
  },
};
