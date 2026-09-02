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
      // Chosen for you when there is exactly one sensible answer, and
      // left blank when there is not - a guess between two hire cars is
      // worse than the question.
      vehicleId: existing && existing.vehicleId
        ? existing.vehicleId
        : (this.vehicleForDay(day) ? this.vehicleForDay(day).id : ""),
      country: existing && existing.country ? existing.country : this.defaultCountry(),
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

  // The wrapper is the element FormGuard watches. It is rendered ONCE and
  // then left alone - see redraw.
  render() {
    if (!this.draft) {
      return "";
    }

    return `<div class="drive-editor" data-guard="drive:${this.draft.dayNumber}">${this.renderInner()}</div>`;
  },

  renderInner() {
    const draft = this.draft;

    if (!draft) {
      return "";
    }

    const day = this.dayNumbered(draft.dayNumber);

    const rows = draft.waypoints
      .map((point, index) => this.renderWaypoint(point, index, draft.waypoints.length))
      .join("");

    return `

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

    <div class="manager-card">

        <h3>Fuel &amp; tolls</h3>

        <div class="form-grid">

            <label class="form-field">
                Vehicle
                <select id="drv-vehicle" onchange="Drive.choiceChanged()">
                    ${this.vehicleOptions(draft.vehicleId)}
                </select>
                <span class="form-hint">
                    The car you are driving that day. Its consumption and fuel type
                    live on the Transport record.
                </span>
            </label>

            <label class="form-field">
                Fuel price
                <select id="drv-country" onchange="Drive.choiceChanged()">
                    ${this.countryOptions(draft.country)}
                </select>
                <span class="form-hint">
                    Which country's price to use. Set them under Settings.
                </span>
            </label>

        </div>

        ${this.renderFuel()}

        ${this.renderToll()}

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

    const vehicle = document.getElementById("drv-vehicle");

    if (vehicle) {
      this.draft.vehicleId = vehicle.value;
    }

    const country = document.getElementById("drv-country");

    if (country) {
      this.draft.country = country.value;
    }
  },

  // Changing either one changes the fuel figure but NOT the route - the
  // kilometres are the same however you pay for them, so redrawing must
  // not throw away a lookup you have already paid for.
  choiceChanged() {
    this.syncFromDOM();

    this.redraw();
  },

  vehicleOptions(selected) {
    const options = this.vehicles().map((v) => {
      const label = [v.provider, v.mode, v.from && v.to ? `${v.from} to ${v.to}` : ""]
        .filter(Boolean)
        .join(" · ");

      return `<option value="${this.esc(v.id)}" ${v.id === selected ? "selected" : ""}>${this.esc(label || "Vehicle")}</option>`;
    });

    return `<option value="">${options.length ? "Not chosen" : "No hire car or drive on this trip"}</option>${options.join("")}`;
  },

  countryOptions(selected) {
    const rates = this.settings().rates;

    const options = rates.map(
      (r) =>
        `<option value="${this.esc(r.country)}" ${r.country === selected ? "selected" : ""}>${this.esc(r.country)} — ${this.esc(String(r.currency || ""))} ${this.esc(String(r.fuelPerLitre || ""))}/L</option>`,
    );

    return `<option value="">${options.length ? "Not chosen" : "No fuel prices set yet"}</option>${options.join("")}`;
  },

  renderToll() {
    const day = this.dayNumbered(this.draft.dayNumber);

    const toll = this.tollFor(this.draftAsDay(day));

    if (!toll) {
      return "";
    }

    if (toll.unavailable) {
      return `<p class="drive-empty">No toll estimate yet — ${this.esc(toll.unavailable)}.</p>`;
    }

    // A border crossing can produce BOTH: kilometres of Italian
    // autostrada and a Swiss sticker, on the same day.
    const stickers = (toll.vignettes || [])
      .map(
        (v) => `

<p class="drive-result">
    <strong>${this.esc(v.country)} uses a vignette</strong>
    <span class="drive-asof">
        ${v.cost ? `${Format.money(v.cost, v.currency)} for the sticker, ` : ""}bought once for the trip rather than per day.
        Driving without one is fined.
    </span>
</p>

`,
      )
      .join("");

    if (!toll.parts || toll.parts.length === 0) {
      return stickers;
    }

    const breakdown = toll.parts
      .map(
        (part) =>
          `${part.tolledKm} of ${part.km} km tolled in ${this.esc(part.country)}, at ${Format.money(part.perKm, part.currency)}/km = ${Format.money(part.amount, part.currency)}`,
      )
      .join("<br>");

    return `

<p class="drive-result">
    <strong>${this.describeParts(toll.parts)} tolls</strong>
    <span class="drive-asof">${breakdown}</span>
</p>

` + stickers;
  },

  // The draft dressed as a day, so the fuel and toll figures follow the
  // pickers before anything has been saved.
  draftAsDay(day) {
    return {
      day: day.day,
      drive: {
        waypoints: this.draft.waypoints,
        route: this.draft.route,
        vehicleId: this.draft.vehicleId,
        country: this.draft.country,
      },
    };
  },

  renderFuel() {
    const day = this.dayNumbered(this.draft.dayNumber);

    // Reads the DRAFT rather than the saved day, so the figure follows
    // the pickers before you have saved anything.
    const fuel = this.fuelFor(this.draftAsDay(day));

    if (!fuel || fuel.unavailable) {
      return `<p class="drive-empty">No fuel estimate yet — ${this.esc(fuel ? fuel.unavailable : "nothing to price")}.</p>`;
    }

    // The breakdown only appears when there IS one. A day inside one
    // country reads exactly as it did before the split.
    const breakdown = fuel.parts
      .map(
        (part) =>
          `${part.km} km in ${this.esc(part.country)} — ${part.litres} litres at ${Format.money(part.perLitre, part.currency)}/L = ${Format.money(part.amount, part.currency)}`,
      )
      .join("<br>");

    const missed = fuel.unpriced && fuel.unpriced.length
      ? `<br><strong>${fuel.unpriced.map((u) => `${u.km} km in ${this.esc(u.code || "an unnamed country")} has no fuel price set`).join("; ")}</strong>`
      : "";

    return `

<p class="drive-result">
    <strong>${this.describeParts(fuel.parts)}</strong>
    <span class="drive-asof">
        ${fuel.litresPer100km} L/100km${fuel.assumed ? ` (assumed — ${this.esc(fuel.assumedWhy)})` : ""}<br>
        ${breakdown}${missed}
    </span>
</p>

`;
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

  // REDRAWS ITSELF WITHOUT LOOKING LIKE IT IS LEAVING.
  //
  // Render.show calls FormGuard.confirmLeave on EVERY render, so going
  // through it to redraw a form in place asked "discard your unsaved
  // changes?" every time you added a stop or worked out a route.
  //
  // The false alarm was the smaller half. confirmLeave calls release()
  // when you say yes - so dismissing it CLEARED the dirty flag, and after
  // that, genuinely navigating away with unsaved work warned about
  // nothing. A spurious guard that disables the real one.
  //
  // So the contents are replaced and the guarded wrapper is left in place.
  // Its listeners are delegated, so they keep working on the new children,
  // and the dirty state survives - which is what should happen: adding a
  // stop IS an unsaved change.
  redraw() {
    const holder = document.querySelector(".drive-editor[data-guard]");

    if (holder) {
      holder.innerHTML = this.renderInner();

      return;
    }

    // No wrapper yet, so nothing is being redrawn and nothing is being
    // left - the ordinary first render.
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

      const route = await Geo.route(points, { mode: "drive", details: true });

      if (!route || route.distanceKm === null) {
        this.setStatus("No road route found between those places.");

        return;
      }

      this.draft.route = {
        km: route.distanceKm,
        minutes: route.durationMinutes,
        // null when the provider gave no detail, which is not the same as
        // zero. Zero is a claim that the road is free.
        tolledKm: typeof route.tolledKm === "number" ? route.tolledKm : null,
        byCountry: route.byCountry || null,
        // The shape, simplified enough to live in journey.json - see
        // compactPath. Drawn on the day map; nothing is measured from it.
        path: this.compactPath(route.path),
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

    day.drive = {
      waypoints,
      route: this.draft.route || null,
      vehicleId: this.draft.vehicleId || "",
      country: this.draft.country || "",
    };

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

    const parts = [this.formatKm(drive.route.km), Geo.formatDuration(drive.route.minutes)];

    const fuel = this.fuelFor(day);

    // Only when there IS one. A day card is not the place to explain why
    // a number is missing - the editor says that.
    // describeParts, not fuel.amount: a day that crosses a border has no
    // single amount, and reporting one side of it would be worse than
    // reporting both.
    if (fuel && !fuel.unavailable) {
      parts.push(`${this.describeParts(fuel.parts)} fuel${fuel.assumed ? " (est)" : ""}`);
    }

    const toll = this.tollFor(day);

    // A vignette is not this day's cost, so it never appears on a day card.
    if (toll && !toll.unavailable && toll.parts && toll.parts.length > 0) {
      const tolled = toll.parts.filter((p) => p.amount > 0);

      if (tolled.length > 0) {
        parts.push(`${this.describeParts(tolled)} tolls`);
      }
    }

    return parts.join(" · ");
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

  // --- The route's shape (v1.44.0) --------------------------------------

  // A 240km route comes back as a few thousand coordinate pairs. Stored
  // raw that is ~100KB per driving day in journey.json, which is read on
  // every page load - eight driving days would make the whole app slower
  // to open, for a line nobody can see the detail of.
  //
  // Ramer-Douglas-Peucker keeps the points that carry the SHAPE and drops
  // the ones that sit on a straight run. A motorway with a gentle curve
  // loses almost everything; a mountain pass keeps its hairpins. That is
  // the opposite of taking every Nth point, which would flatten exactly
  // the bends worth looking at.
  //
  // Tolerance is in degrees, which is not a real distance - but this is
  // for DRAWING, and at day-map zoom the error is under a pixel. Nothing
  // measures anything from this path: the kilometres come from the
  // provider and are stored separately.
  SIMPLIFY_TOLERANCE: 0.0005,

  MAX_PATH_POINTS: 400,

  simplifyPath(points, tolerance) {
    if (!Array.isArray(points) || points.length < 3) {
      return Array.isArray(points) ? points.slice() : [];
    }

    const keep = new Array(points.length);

    keep[0] = true;

    keep[points.length - 1] = true;

    // Iterative rather than recursive: a long route would otherwise be
    // thousands of stack frames deep.
    const stack = [[0, points.length - 1]];

    while (stack.length > 0) {
      const span = stack.pop();

      const first = span[0];

      const last = span[1];

      let worst = 0;

      let at = -1;

      for (let i = first + 1; i < last; i++) {
        const d = this.perpendicular(points[i], points[first], points[last]);

        if (d > worst) {
          worst = d;

          at = i;
        }
      }

      if (at !== -1 && worst > tolerance) {
        keep[at] = true;

        stack.push([first, at]);

        stack.push([at, last]);
      }
    }

    return points.filter((point, index) => keep[index]);
  },

  // Distance from a point to the line through a and b. Plane geometry on
  // lat/lng, which is wrong over long distances and entirely good enough
  // for deciding whether a point is worth drawing.
  perpendicular(point, a, b) {
    const x = a[0];

    const y = a[1];

    let dx = b[0] - x;

    let dy = b[1] - y;

    if (dx !== 0 || dy !== 0) {
      const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);

      if (t > 1) {
        dx = point[0] - b[0];

        dy = point[1] - b[1];
      } else if (t > 0) {
        dx = point[0] - (x + dx * t);

        dy = point[1] - (y + dy * t);
      } else {
        dx = point[0] - x;

        dy = point[1] - y;
      }
    } else {
      dx = point[0] - x;

      dy = point[1] - y;
    }

    return Math.sqrt(dx * dx + dy * dy);
  },

  // Simplify hard enough to stay under the point cap, whatever the route.
  //
  // A cap as well as a tolerance because a very long or very twisty day
  // can survive the first pass with thousands of points still in it, and
  // the whole purpose here is a bounded file.
  compactPath(points) {
    if (!Array.isArray(points) || points.length === 0) {
      return null;
    }

    const round = (out) => out.map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]);

    let out = this.simplifyPath(points, this.SIMPLIFY_TOLERANCE);

    if (out.length <= this.MAX_PATH_POINTS) {
      return round(out);
    }

    // A long or twisty day survives the first pass with too many points,
    // and the cap exists so journey.json stays bounded whatever the route.
    //
    // BINARY SEARCH, not repeated doubling. Doubling overshoots badly:
    // one step can take a route from 600 points to 2, throwing away every
    // bend to save 598 points nobody asked to lose. Searching converges on
    // a tolerance that lands just under the budget, so a complex day
    // spends its whole allowance on the detail that fits.
    let low = this.SIMPLIFY_TOLERANCE;

    let high = this.SIMPLIFY_TOLERANCE;

    // Find an upper bound that is definitely coarse enough.
    let guard = 0;

    while (this.simplifyPath(points, high).length > this.MAX_PATH_POINTS && guard < 20) {
      high *= 4;

      guard += 1;
    }

    // Then close the gap. Sixteen halvings is far finer than the rounding
    // applied below, so this cannot spin.
    for (let i = 0; i < 16; i++) {
      const mid = (low + high) / 2;

      const tried = this.simplifyPath(points, mid);

      if (tried.length > this.MAX_PATH_POINTS) {
        low = mid;
      } else {
        high = mid;

        out = tried;
      }
    }

    return round(out);
  },

  // --- The country split (v1.43.0) -------------------------------------

  // Enough of Europe to cover a driving trip, plus the places these trips
  // tend to start from. Only used to resolve a rate you named but did not
  // give a code for - which is every rate saved before the split existed.
  //
  // Not a complete ISO list on purpose: an unrecognised name is handled
  // (you type the code yourself), and a thousand-line table would be worse
  // than the two-letter box beside the field.
  COUNTRY_CODES: {
    "italy": "IT", "italia": "IT",
    "switzerland": "CH", "suisse": "CH", "schweiz": "CH", "svizzera": "CH",
    "france": "FR", "germany": "DE", "deutschland": "DE",
    "austria": "AT", "österreich": "AT", "osterreich": "AT",
    "spain": "ES", "españa": "ES", "espana": "ES",
    "portugal": "PT", "netherlands": "NL", "holland": "NL",
    "belgium": "BE", "luxembourg": "LU", "liechtenstein": "LI",
    "slovenia": "SI", "croatia": "HR", "czechia": "CZ", "czech republic": "CZ",
    "slovakia": "SK", "hungary": "HU", "poland": "PL", "denmark": "DK",
    "sweden": "SE", "norway": "NO", "finland": "FI", "ireland": "IE",
    "united kingdom": "GB", "uk": "GB", "britain": "GB", "great britain": "GB",
    "greece": "GR", "monaco": "MC", "san marino": "SM", "andorra": "AD",
    "united states": "US", "usa": "US", "canada": "CA",
    "australia": "AU", "new zealand": "NZ",
  },

  // A rate's ISO code: what you typed, else looked up from the country's
  // name. The lookup is what lets every rate saved before v1.43.0 take
  // part in the split without being re-entered.
  codeOf(rate) {
    if (!rate) {
      return "";
    }

    const said = String(rate.code || "").trim().toUpperCase();

    if (said) {
      return said;
    }

    return this.COUNTRY_CODES[String(rate.country || "").trim().toLowerCase()] || "";
  },

  rateForCode(code) {
    const wanted = String(code || "").trim().toUpperCase();

    if (!wanted) {
      return null;
    }

    return this.settings().rates.find((r) => this.codeOf(r) === wanted) || null;
  },

  // WHERE THE DAY'S KILOMETRES ACTUALLY WERE.
  //
  // The provider reports distance per country when route detail was asked
  // for, so a day driving out of Italy into Switzerland is priced on each
  // side of the border rather than entirely at whichever rate you picked.
  //
  // Falls back to the day's NAMED country when there is no usable split -
  // an older route, a response without country codes, or codes that match
  // no rate you have set. That is the v1.41.0 behaviour, and it is right
  // whenever the whole day is in one country, which is most days.
  countryLegs(drive) {
    const route = drive.route || {};

    const split = route.byCountry;

    if (split && typeof route.km === "number") {
      const codes = Object.keys(split);

      let covered = 0;

      codes.forEach((code) => {
        covered += Number(split[code].km) || 0;
      });

      // Only trusted when it ACCOUNTS FOR THE DISTANCE. A split covering
      // 180 of 240km would quietly price three quarters of the day and
      // look exact doing it. Two percent of slack absorbs the rounding the
      // provider does per segment.
      const accounted = Math.abs(covered - route.km) <= Math.max(1, route.km * 0.02);

      const known = codes.filter((code) => this.rateForCode(code));

      if (codes.length > 0 && accounted && known.length > 0) {
        return codes.map((code) => ({
          code,
          rate: this.rateForCode(code),
          km: Number(split[code].km) || 0,
          tolledKm: typeof split[code].tolledKm === "number" ? split[code].tolledKm : null,
        }));
      }
    }

    const named = drive.country || this.defaultCountry();

    return [{
      code: null,
      rate: this.rateFor(named),
      km: route.km,
      tolledKm: typeof route.tolledKm === "number" ? route.tolledKm : null,
    }];
  },

  // One line for a set of parts: "EUR 25.53", or "EUR 18.00 + CHF 9.10"
  // when a day crosses a border. Never added together - the app has no
  // business inventing an exchange rate here, and the Budget converts.
  describeParts(parts) {
    const byCurrency = {};

    (parts || []).forEach((part) => {
      byCurrency[part.currency] = (byCurrency[part.currency] || 0) + part.amount;
    });

    return Object.keys(byCurrency)
      .map((c) => Format.money(Math.round(byCurrency[c] * 100) / 100, c))
      .join(" + ");
  },

  // --- Fuel (phase 2) -------------------------------------------------

  // Indicative figures for a hire car you have not booked yet, so a day
  // shows a usable number while you are still shopping. An entered figure
  // always wins, and anything resting on this table says so.
  CLASSES: [
    { key: "economy", label: "Economy", litresPer100km: 5.5 },
    { key: "compact", label: "Compact", litresPer100km: 6.5 },
    { key: "midsize", label: "Mid-size", litresPer100km: 7.5 },
    { key: "suv", label: "SUV", litresPer100km: 8.5 },
    { key: "van", label: "Van / people mover", litresPer100km: 9.5 },
  ],

  FUEL_TYPES: ["Petrol", "Diesel", "LPG", "Electric"],

  classNamed(key) {
    return this.CLASSES.find((c) => c.key === key) || null;
  },

  // Only a vehicle you DRIVE burns fuel you buy. A train ticket has a
  // price of its own and no consumption.
  vehicles() {
    const data = Project.get("transport");

    const items = data && Array.isArray(data.items) ? data.items : [];

    return items.filter((item) => {
      const mode = String(item.mode || "").toLowerCase();

      return mode === "car rental" || mode === "drive";
    });
  },

  vehicleById(id) {
    return this.vehicles().find((v) => v.id === id) || null;
  },

  // The hire car whose booking covers this day. A trip usually has one, so
  // the drive can pick it for you rather than making you say every time.
  vehicleForDay(day) {
    const covering = this.vehicles().filter((item) => {
      const range = Array.isArray(item.dayRange) && item.dayRange.length >= 2
        ? item.dayRange
        : [item.day, item.day];

      if (typeof range[0] !== "number" || typeof range[1] !== "number") {
        return false;
      }

      return day.day >= range[0] && day.day <= range[1];
    });

    // Two cars covering one day is ambiguous, and guessing between them
    // would be worse than asking - so nothing is chosen.
    return covering.length === 1 ? covering[0] : null;
  },

  // Entered beats assumed, and the caller is told which it got so it can
  // label an estimate as one.
  consumptionOf(vehicle) {
    if (!vehicle) {
      return { litresPer100km: null, assumed: false, why: "no vehicle" };
    }

    const spec = vehicle.vehicle || {};

    const entered = Number(spec.litresPer100km);

    if (entered > 0) {
      return { litresPer100km: entered, assumed: false, why: "" };
    }

    const klass = this.classNamed(spec.class);

    if (klass) {
      return { litresPer100km: klass.litresPer100km, assumed: true, why: `typical for ${klass.label.toLowerCase()}` };
    }

    return { litresPer100km: null, assumed: false, why: "no consumption set" };
  },

  // --- Fuel prices ---------------------------------------------------

  // Kept on the project rather than on each drive: you set Italy once and
  // every Italian day uses it.
  settings() {
    const data = Project.get("project");

    const held = data && data.settings && data.settings.driving ? data.settings.driving : null;

    return {
      rates: held && Array.isArray(held.rates) ? held.rates : [],
      defaultCountry: held ? held.defaultCountry || "" : "",
      setOn: held ? held.setOn || "" : "",
    };
  },

  rateFor(country) {
    const wanted = String(country || "").trim().toLowerCase();

    if (!wanted) {
      return null;
    }

    return this.settings().rates.find((r) => String(r.country || "").trim().toLowerCase() === wanted) || null;
  },

  defaultCountry() {
    const settings = this.settings();

    if (settings.defaultCountry) {
      return settings.defaultCountry;
    }

    return settings.rates.length === 1 ? settings.rates[0].country : "";
  },

  // --- The estimate ---------------------------------------------------

  // Returns either an amount or the ONE reason it cannot produce one.
  //
  // A reason rather than a blank: "no consumption set" is something you can
  // act on, and an empty space is not.
  fuelFor(day) {
    const drive = this.driveFor(day);

    if (!drive) {
      return null;
    }

    if (!drive.route || typeof drive.route.km !== "number") {
      return { unavailable: "work out the route first" };
    }

    const vehicle = drive.vehicleId ? this.vehicleById(drive.vehicleId) : this.vehicleForDay(day);

    if (!vehicle) {
      return { unavailable: "no vehicle chosen" };
    }

    const spec = vehicle.vehicle || {};

    // An electric car burns no litres, and pricing it per litre would be
    // arithmetic on the wrong unit. Said plainly rather than shown as zero.
    if (String(spec.fuelType || "").toLowerCase() === "electric") {
      return { unavailable: "electric - not priced yet" };
    }

    const consumption = this.consumptionOf(vehicle);

    if (!consumption.litresPer100km) {
      return { unavailable: consumption.why };
    }

    const legs = this.countryLegs(drive);

    const parts = [];

    const unpriced = [];

    legs.forEach((leg) => {
      if (!leg.rate || !(Number(leg.rate.fuelPerLitre) > 0)) {
        unpriced.push({ code: leg.code, km: Math.round(leg.km * 10) / 10 });

        return;
      }

      const litres = (leg.km / 100) * consumption.litresPer100km;

      parts.push({
        code: leg.code,
        country: leg.rate.country,
        km: Math.round(leg.km * 10) / 10,
        litres: Math.round(litres * 10) / 10,
        amount: Math.round(litres * Number(leg.rate.fuelPerLitre) * 100) / 100,
        currency: String(leg.rate.currency || "EUR").toUpperCase(),
        perLitre: Number(leg.rate.fuelPerLitre),
      });
    });

    if (parts.length === 0) {
      return {
        unavailable: legs.length > 1
          ? "no fuel price for the countries this day crosses"
          : "no fuel price set",
      };
    }

    const result = {
      parts,
      // Kilometres nobody has a price for. Reported rather than dropped:
      // silently pricing 180 of 240 km would understate the day and look
      // exact doing it.
      unpriced,
      split: legs.length > 1,
      litresPer100km: consumption.litresPer100km,
      // True when ANY input was assumed rather than entered, so a caller
      // never presents a guessed number as a measured one.
      assumed: consumption.assumed,
      assumedWhy: consumption.why,
      vehicleName: vehicle.provider || vehicle.mode || "Vehicle",
    };

    // A day inside ONE country keeps the flat shape it has always had.
    // That is almost every day, and it saves every caller from unpacking a
    // list of one. A day that crosses a border has no single amount or
    // currency to report, so it deliberately has neither.
    if (parts.length === 1) {
      result.litres = parts[0].litres;

      result.amount = parts[0].amount;

      result.currency = parts[0].currency;

      result.country = parts[0].country;

      result.perLitre = parts[0].perLitre;
    }

    return result;
  },

  // Every driving day's fuel, in one figure per currency.
  //
  // Per currency because a trip through Italy and Switzerland produces
  // euros and francs, and adding them would invent a number. The Budget
  // converts; this does not.
  tripFuel() {
    const byCurrency = {};

    let priced = 0;

    let unpriced = 0;

    let anyAssumed = false;

    this.days().forEach((day) => {
      const fuel = this.fuelFor(day);

      if (!fuel) {
        return;
      }

      if (fuel.unavailable) {
        unpriced += 1;

        return;
      }

      priced += 1;

      if (fuel.assumed) {
        anyAssumed = true;
      }

      // A day that crosses a border contributes to two currencies at once,
      // which is exactly why this is keyed by currency and not summed.
      fuel.parts.forEach((part) => {
        byCurrency[part.currency] = (byCurrency[part.currency] || 0) + part.amount;
      });
    });

    Object.keys(byCurrency).forEach((c) => {
      byCurrency[c] = Math.round(byCurrency[c] * 100) / 100;
    });

    return { byCurrency, priced, unpriced, assumed: anyAssumed };
  },

  // --- Tolls (phase 3) ------------------------------------------------

  // TOLLS ARE NOT ONE KIND OF THING.
  //
  // Italy, France and Spain charge by the kilometre. Switzerland, Austria,
  // Czechia and Slovenia sell a vignette - one sticker, bought once, with
  // a fine for driving without it.
  //
  // This trip drives Italy to Le Noirmont and back, so it is not
  // hypothetical. A per-km rate applied to Switzerland would invent a
  // number AND leave out the thing you actually have to buy.
  TOLL_TYPES: [
    { key: "none", label: "No tolls" },
    { key: "perKm", label: "Per kilometre" },
    { key: "vignette", label: "Vignette (one sticker)" },
  ],

  tollOf(rate) {
    const held = rate && rate.toll ? rate.toll : null;

    return {
      type: held && held.type ? held.type : "none",
      rate: held && Number(held.rate) > 0 ? Number(held.rate) : 0,
      cost: held && Number(held.cost) > 0 ? Number(held.cost) : 0,
    };
  },

  // What this day's tolls cost. Vignettes are NOT counted here: a sticker
  // is bought once for the trip, and charging it to every driving day
  // would multiply it by however many times you drive.
  tollFor(day) {
    const drive = this.driveFor(day);

    if (!drive) {
      return null;
    }

    if (!drive.route || typeof drive.route.km !== "number") {
      return { unavailable: "work out the route first" };
    }

    const legs = this.countryLegs(drive);

    const parts = [];

    const vignettes = [];

    let needsRoute = false;

    let noRate = false;

    let noCountry = false;

    legs.forEach((leg) => {
      if (!leg.rate) {
        noCountry = true;

        return;
      }

      const toll = this.tollOf(leg.rate);

      if (toll.type === "vignette") {
        vignettes.push({
          country: leg.rate.country,
          cost: toll.cost,
          currency: String(leg.rate.currency || "EUR").toUpperCase(),
        });

        return;
      }

      if (toll.type !== "perKm" || !toll.rate) {
        noRate = true;

        return;
      }

      // The route was worked out before phase 3, so it carries no toll
      // detail. Saying so beats charging the whole distance at the toll
      // rate, which would be wrong by a factor of two or three.
      if (typeof leg.tolledKm !== "number") {
        needsRoute = true;

        return;
      }

      parts.push({
        code: leg.code,
        country: leg.rate.country,
        km: Math.round(leg.km * 10) / 10,
        tolledKm: leg.tolledKm,
        amount: Math.round(leg.tolledKm * toll.rate * 100) / 100,
        perKm: toll.rate,
        currency: String(leg.rate.currency || "EUR").toUpperCase(),
      });
    });

    if (parts.length === 0 && vignettes.length === 0) {
      if (needsRoute) {
        return { unavailable: "work the route out again to measure the toll roads" };
      }

      return { unavailable: noRate ? "no toll rate set" : (noCountry ? "no country chosen" : "no toll rate set") };
    }

    const result = { parts, vignettes, split: legs.length > 1 };

    // As with fuel: a day in one country keeps the flat shape every caller
    // already understands, and a border crossing does not pretend to have
    // one.
    if (parts.length === 1 && vignettes.length === 0) {
      result.code = parts[0].code;

      result.country = parts[0].country;

      result.km = parts[0].km;

      result.tolledKm = parts[0].tolledKm;

      result.amount = parts[0].amount;

      result.perKm = parts[0].perKm;

      result.currency = parts[0].currency;
    }

    if (parts.length === 0 && vignettes.length === 1) {
      result.vignette = true;

      result.country = vignettes[0].country;

      result.cost = vignettes[0].cost;

      result.currency = vignettes[0].currency;
    }

    return result;
  },

  // Every vignette the trip needs, once each.
  //
  // Keyed by country because you buy one sticker per country however many
  // days you spend there - which is the whole difference between a
  // vignette and a per-kilometre toll.
  vignettesNeeded() {
    const needed = {};

    this.days().forEach((day) => {
      const toll = this.tollFor(day);

      if (!toll || !toll.vignettes) {
        return;
      }

      toll.vignettes.forEach((v) => {
        needed[v.country] = v;
      });
    });

    return Object.keys(needed).map((k) => needed[k]);
  },

  // Per-kilometre tolls across the trip, per currency. Vignettes are
  // reported separately by vignettesNeeded, for the reason above.
  tripTolls() {
    const byCurrency = {};

    let priced = 0;

    let unpriced = 0;

    this.days().forEach((day) => {
      const toll = this.tollFor(day);

      if (!toll) {
        return;
      }

      if (toll.unavailable) {
        unpriced += 1;

        return;
      }

      if (!toll.parts || toll.parts.length === 0) {
        return;
      }

      priced += 1;

      toll.parts.forEach((part) => {
        byCurrency[part.currency] = (byCurrency[part.currency] || 0) + part.amount;
      });
    });

    Object.keys(byCurrency).forEach((c) => {
      byCurrency[c] = Math.round(byCurrency[c] * 100) / 100;
    });

    return { byCurrency, priced, unpriced };
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
