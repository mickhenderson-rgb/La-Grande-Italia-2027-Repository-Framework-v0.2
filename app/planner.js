/*
=========================================================

COMPASS-TOS

Journey Planner

Version 3.0.0

=========================================================
*/

const Planner = {
  render() {
    const journey = Project.get("journey");

    if (!journey || !Array.isArray(journey.days) || journey.days.length === 0) {
      return `

<div class="planner">

    <h2>Journey Planner</h2>

    <p>No journey loaded.</p>

</div>

`;
    }

    const stats = this.stats(journey.days);

    let html = `

${this.snapshotStyles()}

<div class="planner">

    <section class="hero">

        <h1>
            Journey Planner
        </h1>

        <h2>
            ${journey.days.length} Day${journey.days.length === 1 ? "" : "s"}
        </h2>

        <p>
            ${stats.totalItems} planning items across the trip.
        </p>

    </section>

    <div class="status-grid">

        ${this.statBox(journey.days.length, "Days")}
        ${this.statBox(stats.totalItems, "Items")}
        ${this.statBox(stats.openItems, "Open")}
        ${this.statBox(stats.lockedItems, "Locked")}

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Planner.showAddDayForm(null)">

            + Add Day to End

        </button>

    </div>

`;

    journey.days.forEach((day) => {
      html += this.renderDay(day);
    });

    html += `

</div>

`;

    return html;
  },

  renderDay(day) {
    return `

<div class="planner-day">

    <div class="planner-day-header">

        <div>
            <strong>DAY ${day.day}</strong>
        </div>

        <div>
            ${day.date || ""}
        </div>

    </div>

    <h3>
        ${this.esc(day.title || "")}
    </h3>

    <p>
        📍 ${this.pretty(day.location)}
    </p>

    <p>
        🛏 Overnight: ${this.pretty(day.overnight)}
    </p>

    ${this.renderDayItemsSnapshot(day)}

    <div class="planner-buttons">

       <button
            type="button"
            onclick="Day.open(${day.day})">

            Open Day

        </button>

       <button
            type="button"
            onclick="Destination.open('${day.location}', {day: ${day.day}})">

            View Destination

        </button>

       <button
            type="button"
            onclick="Planner.showEditDayForm(${day.day})">

            Edit Day

        </button>

       <button
            type="button"
            onclick="Planner.showAddDayForm(${day.day})">

            + Insert Day After

        </button>

       <button
            type="button"
            onclick="Planner.confirmDeleteDay(${day.day})">

            Delete Day

        </button>

    </div>

</div>

`;
  },

  stats(days) {
    let totalItems = 0;
    let openItems = 0;
    let lockedItems = 0;

    days.forEach((day) => {
      const items = Array.isArray(day.items) ? day.items : [];
      items.forEach((item) => {
        totalItems += 1;
        const status = String(item.status || "open").toLowerCase();
        if (status === "locked") {
          lockedItems += 1;
        } else {
          openItems += 1;
        }
      });
    });

    return {
      totalItems,
      openItems,
      lockedItems,
    };
  },

  daySummary(day) {
    const items = Array.isArray(day.items) ? day.items : [];
    let total = items.length;
    let open = 0;
    let booked = 0;
    let locked = 0;

    items.forEach((item) => {
      const status = String(item.status || "open").toLowerCase();

      if (status === "booked") {
        booked += 1;
      } else if (status === "locked") {
        locked += 1;
      } else {
        open += 1;
      }
    });

    return {
      total,
      open,
      booked,
      locked,
    };
  },

  liveCategoryBadges(day) {
    const accommodation = this.bestStatus(
      this.matchByDayRange(Project.get("accommodation"), day.day),
    );

    const activities = this.bestStatus(
      this.matchByDayRange(Project.get("activities"), day.day),
    );

    const restaurants = this.bestStatus(
      this.matchByDayRange(Project.get("restaurants"), day.day),
    );

    const transportItems = this.getItems(Project.get("transport")).filter(
      (item) => item.day === day.day,
    );

    const transport = this.bestStatus(transportItems);

    const flightItems = this.getItems(Project.get("flights")).filter(
      (item) => item.day === day.day,
    );

    const flights = this.bestStatus(flightItems);

    return [
      { type: "flight", label: "Flights", status: flights, ...this.statusColor(flights) },
      { type: "accommodation", label: "Accommodation", status: accommodation, ...this.statusColor(accommodation) },
      { type: "activity", label: "Activities", status: activities, ...this.statusColor(activities) },
      { type: "restaurant", label: "Restaurants", status: restaurants, ...this.statusColor(restaurants) },
      { type: "transport", label: "Transport", status: transport, ...this.statusColor(transport) },
    ];
  },

  getItems(data) {
    return data && Array.isArray(data.items) ? data.items : [];
  },

  // Shows an item on a day purely by its own dayRange - NOT by matching the
  // item's destination text against the day's location. A booking's actual
  // town can legitimately differ from the itinerary's nominal destination
  // (a suburb of Milan when the day says "milan"; staying one town over
  // from family in Le Noirmont because Le Noirmont itself is full) - if
  // that string doesn't match, the old code hid the item from every day
  // entirely, even though you'd already told it exactly which days it
  // covers via Check-in/Check-out Day. The day range is the fact; the
  // destination label is just that, a label - trust the fact.
  matchByDayRange(data, dayNumber) {
    return this.getItems(data).filter((item) => {
      if (!Array.isArray(item.dayRange) || item.dayRange.length < 2) {
        return false;
      }

      return dayNumber >= item.dayRange[0] && dayNumber <= item.dayRange[1];
    });
  },

  statusRank: {
    Research: 0,
    Shortlisted: 1,
    Selected: 2,
    Booked: 3,
    Travel: 3,
    Review: 3,
  },

  bestStatus(items) {
    if (!items || items.length === 0) {
      return null;
    }

    let best = items[0].status;

    items.forEach((item) => {
      if ((this.statusRank[item.status] ?? 0) > (this.statusRank[best] ?? 0)) {
        best = item.status;
      }
    });

    return best;
  },

  statusColor(status) {
    if (!status) {
      return { badgeClass: "" };
    }

    const rank = this.statusRank[status] ?? 0;

    if (rank >= 3) {
      return { badgeClass: "badge-booked" };
    }

    if (rank === 2) {
      return { badgeClass: "badge-selected" };
    }

    return { badgeClass: "" };
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  statBox(value, label) {
    return `

<div class="status-box">

    <strong>
        ${value}
    </strong>

    <span class="tiny">
        ${label}
    </span>

</div>

`;
  },

  icon(type) {
    switch (type) {
      case "flight":
        return "✈";
      case "accommodation":
        return "🛏";
      case "activity":
        return "🎯";
      case "restaurant":
        return "🍝";
      case "transport":
        return "🚗";
      default:
        return "📌";
    }
  },

  pretty(value) {
    return String(value || "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  },

  showAddDayForm(afterDayNumber) {
    this.titleManuallyEdited = false;

    Render.show(Layout.render(this.renderAddDayForm(afterDayNumber)));
  },

  suggestTitleFromLocation() {
    if (this.titleManuallyEdited) {
      return;
    }

    const location = document.getElementById("pln-new-location").value;

    const titleEl = document.getElementById("pln-new-title");

    titleEl.value = this.pretty(location);
  },

  renderAddDayForm(afterDayNumber) {
    const isAppend = afterDayNumber === null;

    return `

<div class="manager">

    <section class="hero">

        <h1>

            ${isAppend ? "Add Day to End" : `Insert Day After Day ${afterDayNumber}`}

        </h1>

        <p>

            ${isAppend ? "This will be added as the last day of the trip." : "Every day after this one will be renumbered, and any transport, expenses, journal or booking entries tied to those days will move with them."}

        </p>

    </section>

    <div class="manager-card form-card">

        <div class="form-grid">

            <label class="form-field">
                Location
                <input type="text" id="pln-new-location" placeholder="e.g. destination-b" oninput="Planner.suggestTitleFromLocation()">
            </label>

            <label class="form-field">
                Title
                <input type="text" id="pln-new-title" placeholder="Auto-suggested from Location, or type your own" oninput="Planner.titleManuallyEdited = true">
            </label>

            <label class="form-field">
                Overnight
                <input type="text" id="pln-new-overnight" placeholder="Defaults to Location if left blank">
            </label>

        </div>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Planner.saveNewDay(${afterDayNumber === null ? "null" : afterDayNumber})">

            Save Day

        </button>

        <button type="button" onclick="Router.navigate('planner')">

            Cancel

        </button>

    </div>

</div>

`;
  },

  saveNewDay(afterDayNumber) {
    const title = document.getElementById("pln-new-title").value.trim();

    const location = document.getElementById("pln-new-location").value.trim().toLowerCase();

    const overnight = document.getElementById("pln-new-overnight").value.trim().toLowerCase();

    if (!title || !location) {
      alert("Please enter at least a title and location before saving.");
      return;
    }

    JourneyEditor.insertDay(afterDayNumber, { title, location, overnight });

    Router.navigate("planner");
  },

  showEditDayForm(dayNumber) {
    const journey = Project.get("journey");

    const day =
      journey && Array.isArray(journey.days)
        ? journey.days.find((d) => d.day === dayNumber)
        : null;

    if (!day) {
      alert("That day could not be found.");

      return;
    }

    Render.show(Layout.render(this.renderEditDayForm(day)));
  },

  renderEditDayForm(day) {
    return `

<div class="manager">

    <section class="hero">

        <h1>

            Edit Day ${day.day}

        </h1>

        <p>

            Update this day's title, location or overnight stop. Day numbers and dates are not affected.

        </p>

    </section>

    <form onsubmit="Planner.saveEditedDay(event, ${day.day}); return false;">

        <div class="manager-card form-card">

            <div class="form-grid">

                <label class="form-field">
                    Location
                    <input type="text" id="pln-edit-location" value="${this.esc(day.location)}" placeholder="e.g. destination-b">
                </label>

                <label class="form-field">
                    Title
                    <input type="text" id="pln-edit-title" value="${this.esc(day.title)}" placeholder="e.g. Arrive in Destination B">
                </label>

                <label class="form-field">
                    Overnight
                    <input type="text" id="pln-edit-overnight" value="${this.esc(day.overnight)}" placeholder="Defaults to Location if left blank">
                </label>

            </div>

        </div>

        <div class="planner-buttons">

            <button type="submit">

                Save Changes

            </button>

            <button type="button" onclick="Planner.closeEditDayForm()">

                Cancel

            </button>

        </div>

    </form>

</div>

`;
  },

  saveEditedDay(event, dayNumber) {
    if (event) {
      event.preventDefault();
    }

    const journey = Project.get("journey");

    const day =
      journey && Array.isArray(journey.days)
        ? journey.days.find((d) => d.day === dayNumber)
        : null;

    if (!day) {
      alert("That day could not be found.");

      return;
    }

    const title = document.getElementById("pln-edit-title").value.trim();

    const location = document.getElementById("pln-edit-location").value.trim().toLowerCase();

    const overnight = document.getElementById("pln-edit-overnight").value.trim().toLowerCase();

    if (!title || !location) {
      alert("Please enter at least a title and location before saving.");

      return;
    }

    day.title = title;

    day.location = location;

    day.overnight = overnight || location;

    Project.update("journey", journey);

    this.closeEditDayForm();
  },

  closeEditDayForm() {
    Router.navigate("planner");
  },

  confirmDeleteDay(dayNumber) {
    const linked = JourneyEditor.countLinkedItems(dayNumber);

    const message =
      linked > 0
        ? `Day ${dayNumber} has ${linked} linked item(s) (transport, expenses or journal entries). Deleting this day will delete those too, and every later day will be renumbered. Continue?`
        : `Delete Day ${dayNumber}? Every later day will be renumbered.`;

    const answer = confirm(message);

    if (!answer) {
      return;
    }

    JourneyEditor.deleteDay(dayNumber);

    Router.navigate("planner");
  },

  // =========================================================
  // Build 44 - Day card data snapshot
  // Collapsible per-category sections showing the real booked /
  // selected / researched items for each day, drawn live from the
  // research collections (no new server calls - all synchronous).
  // =========================================================

  renderDayItemsSnapshot(day) {
    const configs = [
      {
        icon: "🛫",
        label: "Flights",
        module: "Flights",
        items: this.getItems(Project.get("flights")).filter((i) => i.day === day.day),
        title: (it) => this.flightTitle(it),
        snippet: (it) => this.flightSnippet(it),
        detail: (it) => this.flightDetail(it),
      },

      {
        icon: "🏨",
        label: "Accommodation",
        module: "Accommodation",
        items: this.matchByDayRange(Project.get("accommodation"), day.day),
        title: (it) => it.name || "Accommodation",
        snippet: (it) => this.esc(it.name || "Accommodation"),
        detail: (it) => this.accommodationDetail(it),
        directions: true,
      },

      {
        icon: "🎭",
        label: "Activities",
        module: "Activities",
        items: this.matchByDayRange(Project.get("activities"), day.day),
        title: (it) => it.name || "Activity",
        snippet: (it) => this.esc(it.name || "Activity"),
        detail: (it) => this.activitiesDetail(it),
        directions: true,
      },

      {
        icon: "🍽",
        label: "Restaurants",
        module: "Restaurants",
        items: this.matchByDayRange(Project.get("restaurants"), day.day),
        title: (it) => it.name || "Restaurant",
        snippet: (it) => this.esc(it.name || "Restaurant"),
        detail: (it) => this.restaurantsDetail(it),
        directions: true,
      },

      {
        icon: "🚗",
        label: "Transport",
        module: "Transport",
        items: this.getItems(Project.get("transport")).filter((i) => Transport.matchesDay(i, day.day)),
        title: (it) => this.transportTitle(it),
        snippet: (it) => this.esc(this.transportTitle(it)),
        detail: (it) => this.transportDetail(it),
      },
    ];

    const sections = configs.map((c) => this.renderCategorySnapshot(c)).filter(Boolean);

    if (sections.length === 0) {
      return `

<p class="day-snap-empty">Nothing planned for this day yet.</p>

`;
    }

    return `

<div class="day-snap">

    ${sections.join("")}

</div>

`;
  },

  renderCategorySnapshot(cfg) {
    const items = (cfg.items || [])
      .slice()
      .sort((a, b) => this.snapRank(b.status) - this.snapRank(a.status));

    if (items.length === 0) {
      return "";
    }

    const top = items.slice(0, 3);

    const rest = items.slice(3);

    const overflow =
      rest.length > 0
        ? `<button type="button" class="snap-more-toggle" onclick="Planner.toggleMore(this)">+${rest.length} more ▼</button>

<div class="snap-more">${rest.map((it) => this.renderSnapItem(cfg, it)).join("")}</div>`
        : "";

    return `

<div class="day-snap-section">

    <button type="button" class="day-snap-head" onclick="Planner.toggleSnap(this)">

        <span class="snap-icon">${cfg.icon}</span>

        <span class="snap-label">${cfg.label}</span>

        <span class="snap-counts">${this.statusCounts(items)}</span>

        <span class="snap-chev"></span>

    </button>

    <div class="day-snap-snippet">${cfg.snippet(items[0])}</div>

    <div class="day-snap-body">

        ${top.map((it) => this.renderSnapItem(cfg, it)).join("")}

        ${overflow}

    </div>

</div>

`;
  },

  renderSnapItem(cfg, item) {
    return `

<div class="snap-item">

    <div class="snap-item-head">

        ${this.snapBadge(item.status)}

        <span class="snap-item-title" onclick="${cfg.module}.edit('${item.id}')">${this.esc(cfg.title(item))}</span>

    </div>

    ${cfg.detail(item)}

    <div class="snap-actions">

        ${cfg.directions ? MapLinks.renderCompactLink(item) : ""}

        ${this.snapLink(item.website, "Booking Site")}

        <button type="button" onclick="${cfg.module}.edit('${item.id}')">Open Details</button>

        <button type="button" class="btn-danger" onclick="Planner.deleteSnapItem('${cfg.module.toLowerCase()}', '${item.id}', '${this.jsArg(cfg.title(item))}')">Delete</button>

    </div>

</div>

`;
  },

  toggleSnap(el) {
    const section = el.closest(".day-snap-section");

    if (section) {
      section.classList.toggle("is-open");
    }
  },

  toggleMore(el) {
    const more = el.parentNode.querySelector(".snap-more");

    if (!more) {
      return;
    }

    const open = more.classList.toggle("is-open");

    el.textContent = open ? "Show fewer ▲" : `+${more.children.length} more ▼`;
  },

  // Deletes an item straight from the day snapshot - for the common "this
  // was entered against the wrong day/destination" or "we've dropped this
  // idea" case, without leaving the Planner (unlike each module's own
  // remove(), which navigates into that module's own list view).
  deleteSnapItem(collection, itemId, label) {
    const confirmed = confirm(`Delete "${label}"? This can't be undone.`);

    if (!confirmed) {
      return;
    }

    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/${collection}/${itemId}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Delete failed with status ${response.status}`);
        }

        const data = Project.get(collection);

        if (data && Array.isArray(data.items)) {
          data.items = data.items.filter((item) => item.id !== itemId);
        }

        Router.navigate("planner");
      })
      .catch((error) => {
        console.error("Could not delete item:", error);

        alert("Couldn't delete that item. Check the connection and try again.");
      });
  },

  // Safe to drop into a single-quoted JS string inside a double-quoted HTML
  // attribute (an onclick=). Escapes the JS string first, then the HTML.
  jsArg(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  snapRank(status) {
    const ranks = { Research: 1, Shortlisted: 2, Selected: 3, Review: 4, Booked: 5, Travel: 6 };

    return ranks[status] || 0;
  },

  snapSlug(status) {
    return String(status || "").toLowerCase();
  },

  snapBadge(status) {
    const s = String(status || "Research");

    const slug = this.snapSlug(s);

    const check = slug === "booked" || slug === "travel" ? "✓" : "·";

    return `<span class="snap-badge is-${slug}">${check} ${this.esc(s)}</span>`;
  },

  statusCounts(items) {
    const order = ["Booked", "Travel", "Selected", "Shortlisted", "Review", "Research"];

    const counts = {};

    items.forEach((it) => {
      const s = it.status || "Research";

      counts[s] = (counts[s] || 0) + 1;
    });

    const parts = order.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`);

    Object.keys(counts).forEach((s) => {
      if (!order.includes(s)) {
        parts.push(`${counts[s]} ${s}`);
      }
    });

    return parts.join(" · ");
  },

  snapPriceLine(item, extra) {
    const p = item.price;

    if (!p || !(Number(p.amount) > 0)) {
      return "";
    }

    let value = `${String(p.currency || "").toUpperCase()} ${p.amount}`;

    if (p.per) {
      value += ` / ${p.per}`;
    }

    if (extra) {
      value += ` ${extra}`;
    }

    return this.snapLine("Price", value);
  },

  snapLine(label, value) {
    const v = String(value == null ? "" : value).trim();

    if (!v) {
      return "";
    }

    return `<div class="snap-line"><span class="snap-key">${this.esc(label)}:</span> ${this.esc(v)}</div>`;
  },

  snapLink(website, label) {
    const url = String(website || "").trim();

    if (!url) {
      return "";
    }

    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    return `<a class="snap-link" href="${this.esc(href)}" target="_blank" rel="noopener">${this.esc(label || "Booking Link")}</a>`;
  },

  reviewLine(item) {
    if (String(item.status) !== "Review") {
      return "";
    }

    const rating = item.actual && (item.actual.rating || item.actual.rating === 0) ? `${item.actual.rating}/5` : "";

    return this.snapLine("Rating", rating) + this.snapLine("Review", item.actual ? item.actual.review : "");
  },

  flightTitle(it) {
    const name = `${it.airline || ""} ${it.flightNumber || ""}`.trim();

    const base = name || "Flight";

    return it.to ? `${base} → ${it.to}` : base;
  },

  flightSnippet(it) {
    const when = [it.departure && it.departure.date, it.departure && it.departure.time].filter(Boolean).join(" ");

    const title = this.flightTitle(it);

    return this.esc(when ? `${title} — ${when}` : title);
  },

  flightDetail(it) {
    const dep = [it.departure && it.departure.date, it.departure && it.departure.time].filter(Boolean).join(" ");

    const arr = [it.arrival && it.arrival.date, it.arrival && it.arrival.time].filter(Boolean).join(" ");

    return [
      this.snapPriceLine(it),
      this.snapLine("Departs", dep),
      this.snapLine("Arrives", arr),
      this.snapLine("Booking Ref", it.bookingReference),
      this.snapLine("Notes", it.planning && it.planning.notes),
    ].join("");
  },

  accommodationDetail(it) {
    const nights = Array.isArray(it.dayRange) ? it.dayRange[1] - it.dayRange[0] + 1 : 0;

    const extra = nights > 0 ? `(${nights} night${nights === 1 ? "" : "s"})` : "";

    return [
      this.snapPriceLine(it, extra),
      this.snapLine("Check-in", it.dates && it.dates.checkIn),
      this.snapLine("Check-out", it.dates && it.dates.checkOut),
      this.snapLine("Address", it.location && it.location.address),
      this.snapLine("Provider", it.provider),
      this.snapLine("Booking Ref", it.bookingReference),
      this.reviewLine(it),
      this.snapLine("Notes", it.planning && it.planning.notes),
    ].join("");
  },

  activitiesDetail(it) {
    const when = [it.schedule && it.schedule.date, it.schedule && it.schedule.time].filter(Boolean).join(" ");

    const duration = it.schedule && it.schedule.durationMinutes ? `${it.schedule.durationMinutes} min` : "";

    return [
      this.snapPriceLine(it),
      this.snapLine("When", when),
      this.snapLine("Duration", duration),
      this.snapLine("Location", it.location && it.location.address),
      this.snapLine("Provider", it.provider),
      this.snapLine("Booking Ref", it.bookingReference),
      this.reviewLine(it),
      this.snapLine("Notes", it.planning && it.planning.notes),
    ].join("");
  },

  restaurantsDetail(it) {
    const when = [it.reservation && it.reservation.date, it.reservation && it.reservation.time].filter(Boolean).join(" ");

    const party = it.reservation && it.reservation.partySize ? `${it.reservation.partySize} people` : "";

    return [
      this.snapPriceLine(it),
      this.snapLine("Cuisine", it.cuisine),
      this.snapLine("Reservation", when),
      this.snapLine("Party", party),
      this.snapLine("Address", it.location && it.location.address),
      this.snapLine("Booking Ref", it.bookingReference),
      this.reviewLine(it),
      this.snapLine("Notes", it.planning && it.planning.notes),
    ].join("");
  },

  transportTitle(it) {
    const route = [it.from, it.to].filter(Boolean).join(" → ");

    return route ? `${it.mode || "Transport"}: ${route}` : it.mode || "Transport";
  },

  transportDetail(it) {
    const dep = [it.schedule && it.schedule.date, it.schedule && it.schedule.departTime].filter(Boolean).join(" ");

    const arr = [it.schedule && it.schedule.arriveDate, it.schedule && it.schedule.arriveTime].filter(Boolean).join(" ");

    const route = [];

    if (it.route && it.route.distanceKm) {
      route.push(`${it.route.distanceKm} km`);
    }

    if (it.route && it.route.durationMinutes) {
      route.push(`${it.route.durationMinutes} min`);
    }

    const hiredFor =
      Array.isArray(it.dayRange) && it.dayRange[1] !== it.dayRange[0]
        ? `Day ${it.dayRange[0]}–${it.dayRange[1]} (${it.dayRange[1] - it.dayRange[0] + 1} days)`
        : "";

    return [
      this.snapPriceLine(it),
      this.snapLine("Mode", it.mode),
      this.snapLine("Hired for", hiredFor),
      this.snapLine("Depart", dep),
      this.snapLine("Arrive", arr),
      this.snapLine("Route", route.join(" · ")),
      this.snapLine("Provider", it.provider),
      this.snapLine("Booking Ref", it.bookingReference),
      this.snapLine("Notes", it.planning && it.planning.notes),
    ].join("");
  },

  snapshotStyles() {
    return `

<style>

.day-snap { margin: 10px 0; display: flex; flex-direction: column; gap: 8px; }

.day-snap-empty { color: #7a7a7a; font-style: italic; margin: 8px 0; }

.day-snap-section { border: 1px solid #e4ddd0; border-radius: var(--radius, 8px); overflow: hidden; background: #ffffff; }

.day-snap-head { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #f3eee6; border: none; cursor: pointer; text-align: left; font: inherit; }

.snap-icon { font-size: 1.1em; }

.snap-label { font-weight: 700; color: #34495E; }

.snap-counts { margin-left: auto; font-size: 0.8em; color: #6b6357; }

.snap-chev::after { content: "▼"; font-size: 0.7em; color: #6b6357; margin-left: 6px; }

.day-snap-section.is-open .snap-chev::after { content: "▲"; }

.day-snap-snippet { padding: 6px 12px; font-size: 0.85em; color: #555555; }

.day-snap-section.is-open .day-snap-snippet { display: none; }

.day-snap-body { display: none; padding: 4px 12px 12px; }

.day-snap-section.is-open .day-snap-body { display: block; }

.snap-item { border-top: 1px solid #efe9df; padding: 8px 0; }

.snap-item:first-child { border-top: none; }

.snap-item-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.snap-item-title { font-weight: 600; color: #243447; cursor: pointer; text-decoration: underline dotted; }

.snap-line { font-size: 0.85em; color: #444444; margin: 2px 0; }

.snap-key { color: #8a5a18; font-weight: 600; }

.snap-actions { margin-top: 6px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.snap-actions button { font-size: 0.8em; padding: 3px 10px; }

.snap-link { font-size: 0.8em; color: #C79C5D; font-weight: 600; }

.snap-more { display: none; }

.snap-more.is-open { display: block; }

.snap-more-toggle { margin-top: 6px; font-size: 0.8em; background: none; border: none; color: #C79C5D; cursor: pointer; padding: 0; }

.snap-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.72em; font-weight: 700; white-space: nowrap; }

.snap-badge.is-research { background: var(--status-research-bg); color: var(--status-research); }

.snap-badge.is-shortlisted { background: var(--status-shortlisted-bg); color: var(--status-shortlisted); }

.snap-badge.is-selected { background: var(--status-selected-bg); color: var(--status-selected); }

.snap-badge.is-booked { background: var(--status-booked-bg); color: var(--status-booked); }

.snap-badge.is-travel { background: var(--status-travel-bg); color: var(--status-travel); }

.snap-badge.is-review { background: var(--status-review-bg); color: var(--status-review); }

</style>

`;
  },
};
