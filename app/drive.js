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

    if (toll.vignette) {
      return `

<p class="drive-result">
    <strong>${this.esc(toll.country)} uses a vignette</strong>
    <span class="drive-asof">
        ${toll.cost ? `${Format.money(toll.cost, toll.currency)} for the sticker, ` : ""}bought once for the trip rather than per day.
        Driving without one is fined.
    </span>
</p>

`;
    }

    if (toll.unavailable) {
      return `<p class="drive-empty">No toll estimate yet — ${this.esc(toll.unavailable)}.</p>`;
    }

    return `

<p class="drive-result">
    <strong>${Format.money(toll.amount, toll.currency)} tolls</strong>
    <span class="drive-asof">
        ${toll.tolledKm} of ${toll.km} km on toll roads, at ${Format.money(toll.perKm, toll.currency)}/km in ${this.esc(toll.country)}
    </span>
</p>

`;
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

    return `

<p class="drive-result">
    <strong>${Format.money(fuel.amount, fuel.currency)}</strong>
    <span class="drive-asof">
        ${fuel.litres} litres at ${fuel.litresPer100km} L/100km${fuel.assumed ? ` (assumed — ${this.esc(fuel.assumedWhy)})` : ""},
        ${Format.money(fuel.perLitre, fuel.currency)}/L in ${this.esc(fuel.country)}
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
    if (fuel && !fuel.unavailable) {
      parts.push(`${Format.money(fuel.amount, fuel.currency)} fuel${fuel.assumed ? " (est)" : ""}`);
    }

    const toll = this.tollFor(day);

    // A vignette is not this day's cost, so it never appears on a day card.
    if (toll && !toll.unavailable && !toll.vignette && toll.amount > 0) {
      parts.push(`${Format.money(toll.amount, toll.currency)} tolls`);
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

    const country = drive.country || this.defaultCountry();

    const rate = this.rateFor(country);

    if (!rate || !(Number(rate.fuelPerLitre) > 0)) {
      return { unavailable: "no fuel price set" };
    }

    const litres = (drive.route.km / 100) * consumption.litresPer100km;

    return {
      litres: Math.round(litres * 10) / 10,
      amount: Math.round(litres * Number(rate.fuelPerLitre) * 100) / 100,
      currency: String(rate.currency || "EUR").toUpperCase(),
      country: rate.country,
      perLitre: Number(rate.fuelPerLitre),
      litresPer100km: consumption.litresPer100km,
      // True when ANY input was assumed rather than entered, so a caller
      // never presents a guessed number as a measured one.
      assumed: consumption.assumed,
      assumedWhy: consumption.why,
      vehicleName: vehicle.provider || vehicle.mode || "Vehicle",
    };
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

      byCurrency[fuel.currency] = (byCurrency[fuel.currency] || 0) + fuel.amount;
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

    const rate = this.rateFor(drive.country || this.defaultCountry());

    if (!rate) {
      return { unavailable: "no country chosen" };
    }

    const toll = this.tollOf(rate);

    if (toll.type === "vignette") {
      return { vignette: true, country: rate.country, cost: toll.cost, currency: String(rate.currency || "EUR").toUpperCase() };
    }

    if (toll.type !== "perKm" || !toll.rate) {
      return { unavailable: "no toll rate set" };
    }

    // The route was worked out before phase 3, so it carries no toll
    // detail. Saying so beats charging the whole distance at the toll
    // rate, which would be wrong by a factor of two or three.
    if (typeof drive.route.tolledKm !== "number") {
      return { unavailable: "work the route out again to measure the toll roads" };
    }

    return {
      tolledKm: drive.route.tolledKm,
      km: drive.route.km,
      amount: Math.round(drive.route.tolledKm * toll.rate * 100) / 100,
      perKm: toll.rate,
      currency: String(rate.currency || "EUR").toUpperCase(),
      country: rate.country,
    };
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

      if (toll && toll.vignette) {
        needed[toll.country] = { country: toll.country, cost: toll.cost, currency: toll.currency };
      }
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

      if (!toll || toll.vignette) {
        return;
      }

      if (toll.unavailable) {
        unpriced += 1;

        return;
      }

      priced += 1;

      byCurrency[toll.currency] = (byCurrency[toll.currency] || 0) + toll.amount;
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
