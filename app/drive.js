/*
  DRIVING DAYS - kilometres and time. Phase 1 of docs/driving-routes-spec.md.

  Deliberately no money here. Fuel and tolls are phases 2 and 3, and the
  thing worth having first is the answer to "is tomorrow four hours or
  seven", which needs no vehicle, no rates and no settings.

  WHY A DAY NEEDS ITS OWN WAYPOINT LIST.

  A drive is currently only implied: Rome on day 25, Naples on day 26, so
  you must have driven. That is enough to draw a line and useless for
  distance, because it cannot know you went via Orvieto for lunch - and a
  DAY TRIP defeats it completely. Out to a winery and back sleeps you in
  the same place you woke, so start and end are identical and the implied
  distance is zero.

  So a driving day carries an ordered list of places. Everything else -
  kilometres, time, and later fuel and tolls - falls out of that list.

  Only days you actually drive have one. That is what separates "the hire
  car is booked days 2 to 22" from "I drive on eight of those days".
*/
const Drive = {
  // The working copy while the editor is open. Never the saved day.
  draft: null,

  // Phase 1 stores waypoints and the route it worked out. vehicleId and
  // driverId land in phase 2; the shape is left open for them rather than
  // being reshuffled later.
  //
  // A stored route is a CACHE of a paid lookup, not a fact about the trip.
  // fetchedAt is what lets it be shown as "worked out on the 2nd" rather
  // than as something the app knows to be true today.
  driveFor(day) {
    return day && day.drive && Array.isArray(day.drive.waypoints) ? day.drive : null;
  },

  // A night on a ferry is not a day at the wheel.
  canDrive(day) {
    return !!day && !(typeof JourneyEditor !== "undefined" && JourneyEditor.isTransit(day));
  },

  days() {
    const journey = Project.get("journey");

    return journey && Array.isArray(journey.days) ? journey.days : [];
  },

  dayNumbered(dayNumber) {
    return this.days().find((d) => d.day === dayNumber) || null;
  },

  // --- Seeding -------------------------------------------------------

  // Where you START is where you woke up, which is the PREVIOUS night's
  // overnight - not this day's location field. On the real trip day 2's
  // location reads "In Transit", so trusting it would seed a drive from
  // nowhere.
  startPlace(day) {
    const previous = this.dayNumbered(day.day - 1);

    if (previous && this.realPlace(previous.overnight)) {
      return previous.overnight;
    }

    return this.realPlace(day.location) ? day.location : "";
  },

  realPlace(value) {
    const said = String(value || "").trim();

    if (!said) {
      return false;
    }

    return !(typeof JourneyEditor !== "undefined" && JourneyEditor.isTransitWord(said));
  },

  // Two points to begin with: woke here, sleep there. Add your own in
  // between, or send the end back to the start for a day trip.
  seedWaypoints(day) {
    const start = this.startPlace(day);

    const end = this.realPlace(day.overnight) ? day.overnight : "";

    return [
      { label: start, lat: null, lng: null },
      { label: end, lat: null, lng: null },
    ];
  },

  // --- Opening -------------------------------------------------------

  open(dayNumber) {
    const day = this.dayNumbered(dayNumber);

    if (!day) {
      return;
    }

    const existing = this.driveFor(day);

    this.draft = {
      dayNumber: day.day,
      waypoints: existing
        ? existing.waypoints.map((w) => ({ label: w.label, lat: w.lat, lng: w.lng }))
        : this.seedWaypoints(day),
      route: existing && existing.route ? Object.assign({}, existing.route) : null,
      status: "",
    };

    Render.show(Layout.render(this.render()));
  },

  back() {
    if (typeof FormGuard !== "undefined") {
      FormGuard.release();
    }

    const dayNumber = this.draft ? this.draft.dayNumber : null;

    this.draft = null;

    if (dayNumber && typeof Day !== "undefined") {
      Day.open(dayNumber);

      return;
    }

    if (typeof Planner !== "undefined") {
      Render.show(Layout.render(Planner.render()));
    }
  },

  // --- The editor ----------------------------------------------------

  render() {
    const draft = this.draft;

    if (!draft) {
      return "";
    }

    const day = this.dayNumbered(draft.dayNumber);

    const rows = draft.waypoints
      .map((point, index) => this.renderWaypoint(point, index, draft.waypoints.length))
      .join("");

    return `

<div class="drive-editor" data-guard="drive:${draft.dayNumber}">

    <section class="hero">

        <h2>Driving &mdash; Day ${draft.dayNumber}</h2>

        <p>${day && day.date ? Format.date(day.date) : ""}${day && day.title ? ` &middot; ${this.esc(day.title)}` : ""}</p>

    </section>

    <div class="manager-card">

        <h3>Where you go</h3>

        <p class="drive-help">
            In order, from where you wake up to where you sleep. Add the places you stop
            along the way &mdash; lunch, a viewpoint, a detour &mdash; and the distance follows them.
        </p>

        <div id="drv-waypoints">
            ${rows}
        </div>

        <div class="planner-buttons">

            <button type="button" onclick="Drive.addWaypoint()">+ Add a stop</button>

            <button type="button" onclick="Drive.returnToStart()">Return to the start</button>

        </div>

    </div>

    <div class="manager-card">

        <h3>The route</h3>

        ${this.renderResult()}

        <p id="drv-status" class="drive-status">${this.esc(draft.status)}</p>

        <div class="planner-buttons">

            <button type="button" onclick="Drive.lookup()">Work out the route</button>

        </div>

    </div>

    <div class="planner-buttons">

        <button type="button" class="btn-primary" onclick="Drive.save()">Save</button>

        <button type="button" onclick="Drive.back()">Cancel</button>

        ${
          day && this.driveFor(day)
            ? `<button type="button" onclick="Drive.remove()">Remove the drive</button>`
            : ""
        }

    </div>

</div>

`;
  },

  renderWaypoint(point, index, total) {
    // A resolved point is worth saying so: it means the next lookup spends
    // no credit finding it again.
    const placed = typeof point.lat === "number" && typeof point.lng === "number";

    return `

<div class="drive-waypoint">

    <span class="drive-waypoint-index">${index + 1}</span>

    <input
        type="text"
        id="drv-wp-${index}"
        value="${this.esc(point.label || "")}"
        placeholder="${index === 0 ? "Where you start" : index === total - 1 ? "Where you sleep" : "A stop along the way"}"
        oninput="Drive.labelChanged(${index})">

    <span class="drive-waypoint-state">${placed ? "✓" : ""}</span>

    <button type="button" onclick="Drive.moveWaypoint(${index}, -1)" ${index === 0 ? "disabled" : ""} title="Move up">↑</button>

    <button type="button" onclick="Drive.moveWaypoint(${index}, 1)" ${index === total - 1 ? "disabled" : ""} title="Move down">↓</button>

    <button type="button" onclick="Drive.removeWaypoint(${index})" ${total <= 2 ? "disabled" : ""} title="Remove">✕</button>

</div>

`;
  },

  renderResult() {
    const route = this.draft && this.draft.route;

    if (!route || typeof route.km !== "number") {
      return `<p class="drive-empty">Not worked out yet.</p>`;
    }

    return `

<p class="drive-result">
    <strong>${this.formatKm(route.km)}</strong>
    &middot;
    <strong>${Geo.formatDuration(route.minutes)}</strong>
    ${route.fetchedAt ? `<span class="drive-asof">worked out ${Format.date(route.fetchedAt)}</span>` : ""}
</p>

`;
  },

  // --- Editing -------------------------------------------------------

  // Reads every box before redrawing, so typing in one and then pressing a
  // button on another does not throw the first away.
  syncFromDOM() {
    if (!this.draft) {
      return;
    }

    this.draft.waypoints.forEach((point, index) => {
      const field = document.getElementById(`drv-wp-${index}`);

      if (field) {
        point.label = field.value;
      }
    });
  },

  labelChanged(index) {
    if (!this.draft || !this.draft.waypoints[index]) {
      return;
    }

    const field = document.getElementById(`drv-wp-${index}`);

    if (!field) {
      return;
    }

    // Retyping the place invalidates the coordinates that WERE found for
    // it - keeping them would route to the old place under the new name.
    if (field.value !== this.draft.waypoints[index].label) {
      this.draft.waypoints[index].lat = null;

      this.draft.waypoints[index].lng = null;
    }

    this.draft.waypoints[index].label = field.value;
  },

  redraw() {
    Render.show(Layout.render(this.render()));
  },

  addWaypoint() {
    this.syncFromDOM();

    // Before the last one: the end of the list is where you sleep, and a
    // new stop is somewhere on the way to it.
    this.draft.waypoints.splice(this.draft.waypoints.length - 1, 0, { label: "", lat: null, lng: null });

    this.staleRoute();

    this.redraw();
  },

  removeWaypoint(index) {
    this.syncFromDOM();

    if (this.draft.waypoints.length <= 2) {
      return;
    }

    this.draft.waypoints.splice(index, 1);

    this.staleRoute();

    this.redraw();
  },

  moveWaypoint(index, delta) {
    this.syncFromDOM();

    const target = index + delta;

    if (target < 0 || target > this.draft.waypoints.length - 1) {
      return;
    }

    const moved = this.draft.waypoints.splice(index, 1)[0];

    this.draft.waypoints.splice(target, 0, moved);

    this.staleRoute();

    this.redraw();
  },

  // A day trip: out and back to the same bed. The only shape the implied
  // start-to-end model cannot express at all.
  returnToStart() {
    this.syncFromDOM();

    const first = this.draft.waypoints[0];

    this.draft.waypoints.push({ label: first.label, lat: first.lat, lng: first.lng });

    this.staleRoute();

    this.redraw();
  },

  // Any change to the list makes the stored distance wrong. Dropping it is
  // safer than leaving a number that no longer describes the route.
  staleRoute() {
    if (this.draft) {
      this.draft.route = null;

      this.draft.status = "";
    }
  },

  // --- The lookup ----------------------------------------------------

  setStatus(text) {
    if (this.draft) {
      this.draft.status = text;
    }

    const line = document.getElementById("drv-status");

    if (line) {
      line.textContent = text;
    }
  },

  // Prefers coordinates already found, then the built-in city table, and
  // only then pays for a search. The table covers most of an Italian trip
  // for nothing.
  async resolve(point) {
    if (typeof point.lat === "number" && typeof point.lng === "number") {
      return [point.lat, point.lng];
    }

    const label = String(point.label || "").trim();

    if (!label) {
      return null;
    }

    if (typeof TripMap !== "undefined" && typeof TripMap.placeCoords === "function") {
      const known = TripMap.placeCoords(label);

      if (known) {
        point.lat = known[0];

        point.lng = known[1];

        return known;
      }
    }

    const results = await Geo.search(label, { limit: 1 });

    if (results.length === 0) {
      return null;
    }

    point.lat = results[0].lat;

    point.lng = results[0].lon;

    return [point.lat, point.lng];
  },

  async lookup() {
    this.syncFromDOM();

    const named = this.draft.waypoints.filter((p) => String(p.label || "").trim());

    if (named.length < 2) {
      this.setStatus("Name at least two places before working out the route.");

      return;
    }

    this.setStatus("Working out the route…");

    try {
      const points = [];

      for (let i = 0; i < this.draft.waypoints.length; i++) {
        const point = this.draft.waypoints[i];

        if (!String(point.label || "").trim()) {
          continue;
        }

        const coords = await this.resolve(point);

        if (!coords) {
          this.setStatus(`Couldn't find "${point.label}". Try a more specific name.`);

          return;
        }

        points.push(coords);
      }

      const route = await Geo.route(points, { mode: "drive" });

      if (!route || route.distanceKm === null) {
        this.setStatus("No road route found between those places.");

        return;
      }

      this.draft.route = {
        km: route.distanceKm,
        minutes: route.durationMinutes,
        fetchedAt: this.todayISO(),
      };

      this.setStatus("");

      this.redraw();
    } catch (error) {
      console.error("Drive route lookup failed:", error);

      this.setStatus(Geo.errorMessage(error, "Couldn't work out the route."));
    }
  },

  // --- Saving --------------------------------------------------------

  save() {
    this.syncFromDOM();

    const journey = Project.get("journey");

    const day = journey.days.find((d) => d.day === this.draft.dayNumber);

    if (!day) {
      return;
    }

    // Blank rows are someone half-adding a stop and changing their mind,
    // not a place with no name.
    const waypoints = this.draft.waypoints
      .filter((p) => String(p.label || "").trim())
      .map((p) => ({ label: String(p.label).trim(), lat: p.lat, lng: p.lng }));

    if (waypoints.length < 2) {
      this.setStatus("A drive needs at least two places.");

      return;
    }

    day.drive = { waypoints, route: this.draft.route || null };

    Project.update("journey", journey);

    UI.ok("Drive saved.");

    this.back();
  },

  remove() {
    const journey = Project.get("journey");

    const day = journey.days.find((d) => d.day === this.draft.dayNumber);

    if (!day) {
      return;
    }

    delete day.drive;

    Project.update("journey", journey);

    UI.ok("Drive removed.");

    this.back();
  },

  // --- What other views ask for --------------------------------------

  // One line for a day card. Null when there is nothing to say, so callers
  // can decide between a summary and a prompt.
  summaryLine(day) {
    const drive = this.driveFor(day);

    if (!drive) {
      return null;
    }

    if (!drive.route || typeof drive.route.km !== "number") {
      return "route not worked out yet";
    }

    return `${this.formatKm(drive.route.km)} · ${Geo.formatDuration(drive.route.minutes)}`;
  },

  // The whole trip. Worth more than it looks: hire agreements often carry
  // an excess-mileage cap, and this says before you sign whether you are
  // anywhere near it.
  //
  // Only counts days whose route has actually been worked out - a total
  // that quietly included the ones that had not would understate itself
  // and look precise doing it.
  tripTotals() {
    let days = 0;

    let km = 0;

    let minutes = 0;

    let pending = 0;

    this.days().forEach((day) => {
      const drive = this.driveFor(day);

      if (!drive) {
        return;
      }

      days += 1;

      if (drive.route && typeof drive.route.km === "number") {
        km += drive.route.km;

        minutes += drive.route.minutes || 0;
      } else {
        pending += 1;
      }
    });

    return { days, km: Math.round(km), minutes: Math.round(minutes), pending };
  },

  // --- Small shared bits ---------------------------------------------

  formatKm(km) {
    return `${Math.round(km).toLocaleString()} km`;
  },

  todayISO() {
    return typeof Phase !== "undefined" && Phase.todayISO
      ? Phase.todayISO()
      : new Date().toISOString().slice(0, 10);
  },

  esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
