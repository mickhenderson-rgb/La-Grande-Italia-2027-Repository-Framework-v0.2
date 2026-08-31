/*
=========================================================

COMPASS-TOS

Dashboard ("Today")

Version 2.0.0

Phase-aware landing screen: a countdown/progress hero,
weather + currency at a glance, the next Booked thing
("Locked in"), up to three still-undecided bookings
("Waiting on you"), and a route strip of overnight stops.

The countdown number/label adapts per phase - the design
brief only specified the Planning-phase wording ("days
until <first city>"); Travel and Journal are this session's
own reasonable extension of the same idea, not a literal
part of the handoff.

=========================================================
*/

const Dashboard = {
  render() {
    const trip = this.trip();

    const phase = Phase.current();

    return `

<div class="dashboard">

    ${this.renderHero(trip, phase)}

    <div class="dash-pair">
        <div class="manager-card" id="dash-weather-card">${this.renderWeatherCard()}</div>
        <div class="manager-card" id="dash-currency-card">${this.renderCurrencyCard()}</div>
    </div>

    ${this.renderReadiness()}

    ${this.renderLockedIn()}

    ${this.renderWaitingOnYou()}

    ${this.renderRoute()}

    ${this.renderQuickLinks()}

    <div class="planner-buttons desktop-only">

        <button type="button" onclick="TripExport.open()">📤 Export for AI Research</button>

    </div>

</div>

`;
  },

  // What still needs sorting, in one line.
  //
  // The Dashboard did not mention Readiness AT ALL - grep -c said zero -
  // while the trip it was describing had thirteen findings, five of them
  // bookings on the wrong dates. That is the most useful number the app
  // can show, and it was the one number missing from the screen you land
  // on.
  //
  // Silent when there is nothing wrong: a green "all clear" on every
  // visit is a banner people stop reading, and then stop seeing when it
  // turns red.
  renderReadiness() {
    if (typeof Readiness === "undefined") {
      return "";
    }

    let findings = [];

    try {
      findings = Readiness.findings();
    } catch (error) {
      // A half-built trip must not take the whole dashboard down.
      console.error("Readiness summary failed:", error);

      return "";
    }

    if (findings.length === 0) {
      return "";
    }

    const blocking = findings.filter((f) => f.level === "blocking").length;

    const rest = findings.length - blocking;

    // Only worth breaking down when there is more than one KIND. All
    // thirteen being blocking rendered "13 things to sort out - 13 need
    // sorting", which says the same thing twice.
    const parts = [];

    if (blocking > 0 && rest > 0) {
      parts.push(`${blocking} need${blocking === 1 ? "s" : ""} sorting`);

      parts.push(`${rest} worth a look`);
    } else if (blocking > 0) {
      parts.push(`all need${blocking === 1 ? "s" : ""} sorting`);
    } else {
      parts.push("worth a look");
    }

    return `

<button type="button" class="dash-readiness${blocking > 0 ? " is-blocking" : ""}" onclick="Router.navigate('readiness')">

    <span class="dash-readiness-count">${findings.length}</span>

    <span>
        <strong>${findings.length === 1 ? "thing" : "things"} to sort out</strong>
        <span class="dash-readiness-detail">${this.esc(parts.join(" · "))}</span>
    </span>

</button>

`;
  },

  // Where to go next.
  //
  // Needed the moment the embedded Planner came out: there was no route
  // from here to the day list at all, because the Dashboard had been
  // relying on simply BEING it.
  renderQuickLinks() {
    const links = [
      { id: "planner", icon: "🧭", label: "Planner" },
      { id: "map", icon: "🗺", label: "Trip Map" },
      { id: "accommodation", icon: "🛏", label: "Accommodation" },
      { id: "budget", icon: "💰", label: "Budget" },
    ];

    // A guest never sees money - the sidebar hides Budget for exactly
    // this reason, and a shortcut here must not become the way round it.
    const visible = links.filter(
      (l) => !(l.id === "budget" && typeof Project !== "undefined" && Project.currentPermission === "guest"),
    );

    return `

<div class="dash-links">

    ${visible
      .map(
        (l) =>
          `<button type="button" onclick="Router.navigate('${l.id}')"><span aria-hidden="true">${l.icon}</span> ${this.esc(l.label)}</button>`,
      )
      .join("")}

</div>

`;
  },

  initialise() {
    this.loadLiveWeather();

    this.loadLiveCurrency();
  },

  trip() {
    const projectData = Project.get("project");

    return (projectData && projectData.project) || {};
  },

  journeyDays() {
    const journey = Project.get("journey");

    return journey && Array.isArray(journey.days) ? journey.days : [];
  },

  // --- Hero: countdown + progress rail ---

  renderHero(trip, phase) {
    const days = this.journeyDays();

    const firstCity = days.length > 0 ? this.pretty(days[0].location || days[0].overnight) : "";

    const countdown = this.countdown(trip, phase, days);

    return `

<section class="hero dash-hero">

    <div class="dash-hero-top">
        <h2>${this.esc(trip.name || "Untitled Trip")}</h2>
    </div>

    <div class="dash-countdown-number">${countdown.number}</div>

    <div class="dash-countdown-label"><em>${this.esc(countdown.label)}</em></div>

    <p class="dash-departure-line">${this.esc(this.departureLine(trip, days))}</p>

    ${this.partyLine()}

    ${this.renderProgressRail()}

</section>

`;
  },

  // Who is coming, and whether that changes partway. Silent when nobody
  // has been added - a trip planned alone should not carry a "1 person"
  // line it never asked for.
  partyLine() {
    if (typeof Participants === "undefined") {
      return "";
    }

    const line = Participants.summaryLine();

    if (!line) {
      return "";
    }

    return `<p class="dash-departure-line">👥 ${this.esc(line)}</p>`;
  },

  // Where you're counting down TO.
  //
  // This used to be days[0].location, which is where the trip STARTS -
  // so an Italy trip departing Sydney read "355 days until Sydney".
  //
  // The rule, in order:
  //   1. the first place you actually STAY, past the origin - a real
  //      stopover, meaning two nights or more. One night in Doha is a
  //      layover, not a destination.
  //   2. failing that, where the last flight leg lands - if the whole
  //      journey is flights and short hops, that's the destination.
  //   3. failing that, just "departure", which is always true.
  //
  // The country you'd spend longest in was the intended third rule, but
  // no country is recorded anywhere - locations are free text - so it
  // can't be answered without geocoding every day. Noted rather than
  // faked.
  MIN_STOPOVER_NIGHTS: 2,

  countdownDestination() {
    const stops = this.computeStops();

    // stops[0] is where you begin, so skip it.
    const onward = stops.slice(1);

    const realStop = onward.filter((stop) => this.stopNights(stop) >= this.MIN_STOPOVER_NIGHTS)[0];

    if (realStop) {
      return this.pretty(realStop.location);
    }

    const flownTo = this.finalFlightDestination();

    if (flownTo) {
      return this.pretty(flownTo);
    }

    // A single onward stop of one night still beats saying nothing.
    if (onward.length > 0) {
      return this.pretty(onward[0].location);
    }

    // Nothing grouped into a stop at all - which happens on a journey whose
    // days carry a location but no overnight (an import that never set one,
    // or a single-city trip). Where you END UP is the honest answer, and it
    // can't reintroduce the original bug: a trip that actually goes
    // somewhere was already answered by rule 1.
    const lastPlace = this.lastNamedPlace();

    if (lastPlace) {
      return this.pretty(lastPlace);
    }

    return "departure";
  },

  lastNamedPlace() {
    const days = this.journeyDays();

    for (let i = days.length - 1; i >= 0; i--) {
      if (JourneyEditor.isTransit(days[i])) {
        continue;
      }

      const place = days[i].overnight || days[i].location;

      if (place) {
        return place;
      }
    }

    return "";
  },

  stopNights(stop) {
    if (!stop || !Array.isArray(stop.dayRange)) {
      return 0;
    }

    return stop.dayRange[1] - stop.dayRange[0] + 1;
  },

  // The last leg of the last flight of the trip - i.e. where the flying
  // ends, which for a trip built around one long haul is the answer.
  finalFlightDestination() {
    const flights = this.allItems("flights")
      .slice()
      .sort((a, b) => (a.day || 0) - (b.day || 0));

    for (let i = flights.length - 1; i >= 0; i--) {
      const to = Flights.overallTo(flights[i]);

      if (to) {
        return to;
      }
    }

    return "";
  },

  countdown(trip, phase, days) {
    if (!trip.departureDate) {
      return { number: "–", label: "no departure date set" };
    }

    if (phase === "Planning") {
      const diffDays = this.daysBetween(this.todayISO(), trip.departureDate);

      return { number: String(Math.max(diffDays, 0)), label: `days until ${this.countdownDestination()}` };
    }

    if (phase === "Travel") {
      const today = this.todayISO();

      const current = days.find((d) => d.date === today);

      const dayNumber = current ? current.day : Math.max(1, this.daysBetween(trip.departureDate, today) + 1);

      return { number: String(dayNumber), label: `of ${days.length || "?"} days` };
    }

    // Journal phase - trip is over.
    const sinceReturn = trip.returnDate ? this.daysBetween(trip.returnDate, this.todayISO()) : null;

    return {
      number: sinceReturn !== null && sinceReturn > 0 ? String(sinceReturn) : "✓",
      label: sinceReturn !== null && sinceReturn > 0 ? "days since you got back" : "trip complete",
    };
  },

  departureLine(trip, days) {
    if (!trip.departureDate) {
      return "";
    }

    const dateLabel = this.formatDateLong(trip.departureDate);

    const firstFlight = this.liveItems("flights", days.length > 0 ? days[0].day : 1)[0];

    if (firstFlight) {
      const arrival = Flights.overallArrival(firstFlight);

      if (arrival.time) {
        const airport = Flights.overallTo(firstFlight);

        const where = airport ? ` ${airport}` : "";

        return `${dateLabel} · lands${where} ${arrival.time}`;
      }
    }

    return dateLabel;
  },

  renderProgressRail() {
    const segments = [
      { key: "flights", label: "Flights" },
      { key: "accommodation", label: "Stay" },
      { key: "transport", label: "Rail" },
      { key: "activities", label: "Days" },
      { key: "restaurants", label: "Table" },
    ];

    const bars = segments
      .map((seg) => {
        const items = this.allItems(seg.key);

        const hasBooked = items.some((item) => item.status === "Booked" || item.status === "Travel" || item.status === "Review");

        return `<div class="dash-rail-segment ${hasBooked ? "is-booked" : ""}" title="${seg.label}"></div>`;
      })
      .join("");

    return `<div class="dash-rail">${bars}</div>`;
  },

  // --- Weather + Currency pair ---

  renderWeatherCard() {
    const days = this.journeyDays();

    const locationId = this.currentOrNextDestination(days);

    if (!locationId) {
      return `<h3>Weather</h3><p class="dash-card-meta">No destination set yet.</p>`;
    }

    const seasonal = typeof Weather !== "undefined" ? Weather.getSeasonal(locationId) : null;

    const seasonalLine = seasonal
      ? `${seasonal.average_low ?? "?"}–${seasonal.average_high ?? "?"}°C typical`
      : "Open the destination to see the typical weather for these dates.";

    return `

<h3>Weather · ${this.pretty(locationId)}</h3>

<p class="dash-card-value" id="dash-weather-value">${seasonalLine}</p>

<p class="dash-card-meta" id="dash-weather-meta">Checking live forecast…</p>

`;
  },

  async loadLiveWeather() {
    const days = this.journeyDays();

    const locationId = this.currentOrNextDestination(days);

    const metaEl = document.getElementById("dash-weather-meta");

    if (!locationId || !metaEl || typeof Data === "undefined") {
      return;
    }

    try {
      const detail = await Data.loadJSON(`data/projects/${Data.currentProjectFolder}/destinations/${locationId}.json`);

      const coords = detail && detail.coordinates;

      if (!coords || coords.latitude === null || coords.longitude === null) {
        metaEl.textContent = "No live forecast available.";

        return;
      }

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current_weather=true&timezone=auto`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Open-Meteo responded ${response.status}`);
      }

      const data = await response.json();

      const temp = data && data.current_weather ? data.current_weather.temperature : null;

      metaEl.textContent = temp !== null ? `${temp}° right now` : "No live forecast available.";
    } catch (error) {
      console.error("Dashboard weather fetch failed:", error);

      metaEl.textContent = "No live forecast available.";
    }
  },

  renderCurrencyCard() {
    const trip = this.trip();

    const home = String(trip.currency || "USD").toUpperCase();

    const display = typeof Currency !== "undefined" ? Currency.displayCurrency() : home;

    if (home === display) {
      return `<h3>Currency</h3><p class="dash-card-value">${home}</p><p class="dash-card-meta">All amounts shown in your home currency.</p>`;
    }

    return `

<h3>Currency</h3>

<p class="dash-card-value" id="dash-currency-value">1 ${home} = …</p>

<p class="dash-card-meta">Live rate to ${display}</p>

`;
  },

  async loadLiveCurrency() {
    const trip = this.trip();

    const home = String(trip.currency || "USD").toUpperCase();

    const display = typeof Currency !== "undefined" ? Currency.displayCurrency() : home;

    const valueEl = document.getElementById("dash-currency-value");

    if (!valueEl || home === display || typeof Currency === "undefined") {
      return;
    }

    try {
      const rates = await Currency.fetchRates(home, [display]);

      const rate = rates[display];

      valueEl.textContent = rate ? `1 ${home} = ${rate.toFixed(2)} ${display}` : "Rate unavailable";
    } catch (error) {
      console.error("Dashboard currency fetch failed:", error);

      valueEl.textContent = "Rate unavailable";
    }
  },

  currentOrNextDestination(days) {
    if (days.length === 0) {
      return "";
    }

    const today = this.todayISO();

    const current = days.find((d) => d.date === today);

    if (current) {
      return current.location || current.overnight || "";
    }

    return days[0].location || days[0].overnight || "";
  },

  // --- Locked in: the next Booked flight/transport item ---

  renderLockedIn() {
    const candidates = [
      ...this.allItems("flights").filter((i) => i.status === "Booked").map((i) => ({ item: i, date: Flights.overallDeparture(i).date, kind: "flight" })),
      ...this.allItems("transport").filter((i) => i.status === "Booked").map((i) => ({ item: i, date: i.schedule && i.schedule.date, kind: "transport" })),
    ].filter((c) => c.date);

    const today = this.todayISO();

    candidates.sort((a, b) => a.date.localeCompare(b.date));

    const next = candidates.find((c) => c.date >= today) || candidates[candidates.length - 1];

    if (!next) {
      return "";
    }

    const label = next.kind === "flight"
      ? Flights.routeSummary(next.item)
      : `${next.item.mode || "Transport"}: ${[next.item.from, next.item.to].filter(Boolean).join(" → ")}`;

    const dep = next.kind === "flight" ? Flights.overallDeparture(next.item) : (next.item.schedule || {});

    const arr = next.kind === "flight" ? Flights.overallArrival(next.item) : {};

    // Where it leaves from and lands, which is the leg itself - not
    // departure.location, which is a TERMINAL now and was blank on almost
    // every trip before that. The right half of this card used to render
    // empty for exactly that reason.
    const depPlace = next.kind === "flight" ? Flights.overallFrom(next.item) : next.item.from || "";

    const arrPlace = next.kind === "flight" ? Flights.overallTo(next.item) : next.item.to || "";

    // A terminal earns its place here - it is what you need at the airport
    // and the one thing the code cannot tell you.
    const withTerminal = (place, part) => {
      const terminal = next.kind === "flight" ? Flights.legTerminal(part) : "";

      return terminal ? `${place} · ${terminal}` : place;
    };

    return `

<div class="manager-card dash-locked-in">

    <h3>Locked in</h3>

    <div class="dash-locked-row">
        <div>
            <div class="dash-locked-time">${this.esc(dep.time || "")}</div>
            <div class="dash-locked-place">${this.esc(withTerminal(depPlace, dep) || Format.date(dep.date))}</div>
        </div>
        <div class="dash-locked-arrow">→</div>
        <div>
            <div class="dash-locked-time">${this.esc(arr.time || "")}</div>
            <div class="dash-locked-place">${this.esc(withTerminal(arrPlace, arr))}</div>
        </div>
    </div>

    <p class="dash-card-meta">${this.esc(label)}</p>

</div>

`;
  },

  // --- Waiting on you: up to 3 unbooked decisions, soonest first ---

  waitingCopy(collectionKey, item) {
    if (collectionKey === "accommodation") {
      return `Where you sleep in ${this.pretty(item.destination)}`;
    }

    if (collectionKey === "activities") {
      return `${item.name || "Something to do"} in ${this.pretty(item.destination)}`;
    }

    if (collectionKey === "restaurants") {
      return `Where you'll eat in ${this.pretty(item.destination)}`;
    }

    if (collectionKey === "transport") {
      return [item.from, item.to].filter(Boolean).join(" → ") || "Getting between destinations";
    }

    if (collectionKey === "flights") {
      return `Flight to ${Flights.overallTo(item) || "your next stop"}`;
    }

    return item.name || "A decision";
  },

  renderWaitingOnYou() {
    const unbookedStatuses = ["Research", "Shortlisted", "Selected"];

    const icons = { accommodation: "🛏", activities: "🎯", restaurants: "🍝", transport: "🚗", flights: "✈" };

    const decisions = [];

    ["accommodation", "activities", "restaurants", "transport", "flights"].forEach((key) => {
      this.allItems(key)
        .filter((item) => unbookedStatuses.includes(item.status))
        .forEach((item) => {
          const day = Array.isArray(item.dayRange) ? item.dayRange[0] : item.day;

          decisions.push({ key, item, day: day || 999, icon: icons[key] });
        });
    });

    decisions.sort((a, b) => a.day - b.day);

    const top = decisions.slice(0, 3);

    if (top.length === 0) {
      return "";
    }

    const rows = top
      .map((d) => `

<div class="dash-waiting-row" onclick="${this.editAction(d.key, d.item.id)}">
    <span class="dash-waiting-icon">${d.icon}</span>
    <span class="dash-waiting-text">
        <span class="dash-waiting-title">${this.esc(this.waitingCopy(d.key, d.item))}</span>
        <span class="dash-waiting-meta">Day ${d.day === 999 ? "?" : d.day}</span>
    </span>
    <span class="dash-waiting-chev">›</span>
</div>

`)
      .join("");

    return `

<div class="manager-card">

    <h3>Waiting on you</h3>

    ${rows}

</div>

`;
  },

  editAction(collectionKey, id) {
    const modules = { accommodation: "Accommodation", activities: "Activities", restaurants: "Restaurants", transport: "Transport", flights: "Flights" };

    return `${modules[collectionKey]}.edit('${id}')`;
  },

  // --- Route: overnight stops with night counts ---

  renderRoute() {
    const stops = this.computeStops();

    if (stops.length === 0) {
      return "";
    }

    const chips = stops
      .map((stop) => {
        const nights = stop.dayRange[1] - stop.dayRange[0] + 1;

        return `<div class="dash-route-chip"><div class="dash-route-place">${this.pretty(stop.location)}</div><div class="dash-route-nights">${nights} night${nights === 1 ? "" : "s"}</div></div>`;
      })
      .join("");

    return `<div class="dash-route-strip">${chips}</div>`;
  },

  // Same grouping rule as TripMap.computeStops() (consecutive days at the
  // same overnight location = one stop) - a smaller standalone copy since
  // TripMap's version needs its own module state (coords, status) set up
  // first and this only needs the location + night count.
  computeStops() {
    const stops = [];

    let current = null;

    this.journeyDays().forEach((day) => {
      const overnight = String(day.overnight || "").toLowerCase();

      if (!overnight || JourneyEditor.isTransit(day)) {
        if (current) {
          stops.push(current);

          current = null;
        }

        return;
      }

      if (current && current.location === overnight) {
        current.dayRange[1] = day.day;
      } else {
        if (current) {
          stops.push(current);
        }

        current = { location: overnight, dayRange: [day.day, day.day] };
      }
    });

    if (current) {
      stops.push(current);
    }

    return stops;
  },

  // --- Small data helpers ---

  allItems(collectionKey) {
    const data = Project.get(collectionKey);

    return data && Array.isArray(data.items) ? data.items : [];
  },

  liveItems(collectionKey, dayNumber) {
    if (collectionKey === "flights") {
      // Every day the flight touches, not just the day it left on - the
      // dashboard's "today" on an arrival day was showing nothing.
      return this.allItems("flights").filter((item) => Flights.touchesDay(item, dayNumber));
    }

    return Planner.matchByDayRange(Project.get(collectionKey), dayNumber);
  },

  todayISO() {
    return Phase.todayISO();
  },

  daysBetween(fromISO, toISO) {
    const from = new Date(fromISO + "T00:00:00Z");

    const to = new Date(toISO + "T00:00:00Z");

    return Math.round((to - from) / 86400000);
  },

  formatDateLong(dateString) {
    const date = new Date(dateString + "T00:00:00Z");

    if (isNaN(date.getTime())) {
      return dateString;
    }

    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  },

  // Delegates to the shared formatter - see app/format.js. Kept as a
  // local method so every existing this.pretty(...) call still works.
  pretty(value) {
    return Format.place(value);
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
