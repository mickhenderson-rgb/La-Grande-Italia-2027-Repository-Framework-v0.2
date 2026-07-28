/*
=========================================================

COMPASS-TOS

Transport Manager

Version 1.0.0

Build 13

=========================================================
*/

const Transport = {
  currentDay: null,

  showAll: false,

  currentDestinationFilter: null,

  returnDestinationId: null,

  workflow: ["Research", "Shortlisted", "Selected", "Booked", "Travel", "Review"],

  modes: ["Drive", "Walk", "Train", "Ferry", "Flight", "Transfer", "Car Rental", "Other"],

  open(day) {
    this.currentDay = day;

    this.showAll = false;

    this.currentDestinationFilter = null;

    this.returnDestinationId = null;

    Render.show(Layout.render(this.render()));
  },

  openAll() {
    this.currentDay = null;

    this.showAll = true;

    this.currentDestinationFilter = null;

    this.returnDestinationId = null;

    Render.show(Layout.render(this.render()));
  },

  openForDestination(locationId) {
    this.currentDay = null;

    this.showAll = false;

    this.currentDestinationFilter = String(locationId || "").toLowerCase();

    this.returnDestinationId = locationId;

    Render.show(Layout.render(this.render()));
  },

  backAction() {
    if (this.currentDay) {
      return `Day.open(${this.currentDay.day})`;
    }

    if (this.returnDestinationId) {
      return `Destination.open('${this.returnDestinationId}')`;
    }

    return `Router.navigate('dashboard')`;
  },

  render() {
    const items = this.getTransport();

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Transport

        </h1>

        <h2>

            ${this.showAll ? "All Days" : this.currentDestinationFilter ? `Transport · ${this.pretty(this.currentDestinationFilter)}` : `Day ${this.currentDay.day} · ${this.esc(this.currentDay.title)}`}

        </h2>

        <p>

            ${items.length} transport item${items.length === 1 ? "" : "s"}

        </p>

    </section>

    <div class="planner-buttons">

        <button
            type="button"
            onclick="Transport.add()">

            + Add Transport

        </button>

        <button
            type="button"
            onclick="${this.backAction()}">

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

  getTransport() {
    const data = Project.get("transport");

    if (!data || !Array.isArray(data.items)) {
      return [];
    }

    if (this.showAll) {
      return data.items;
    }

    if (this.currentDestinationFilter) {
      const journey = Project.get("journey");

      const dayNumbers = (journey && Array.isArray(journey.days) ? journey.days : [])
        .filter((d) => String(d.location || "").toLowerCase() === this.currentDestinationFilter)
        .map((d) => d.day);

      return data.items.filter((item) => dayNumbers.includes(item.day));
    }

    return data.items.filter((item) => item.day === this.currentDay.day);
  },

  renderBooked(items) {
    const booked = items.filter((item) => item.status === "Booked" || item.status === "Travel");

    if (booked.length === 0) {
      return `

<div class="manager-card">

<h2>

Booked Transport

</h2>

<p>

Nothing booked yet.

</p>

</div>

`;
    }

    let html = `

<div class="manager-card">

<h2>

Booked Transport

</h2>

<div class="research-list">

`;

    booked.forEach((item) => {
      html += `

<div class="research-item is-selected">

    <strong>${item.mode || "Transport"}: ${this.esc(item.from)} → ${this.esc(item.to)}</strong>

    <p>${this.esc(item.schedule?.date)} ${this.esc(item.schedule?.departTime)}</p>

</div>

`;
    });

    html += `

</div>

</div>

`;

    return html;
  },

  renderResearch(items) {
    if (items.length === 0) {
      return `

<div class="manager-card">

<h2>

Research List

</h2>

<p>

No transport has been added for this day.

</p>

<button
    type="button"
    onclick="Transport.add()">

Add Transport

</button>

</div>

`;
    }

    let html = `

<div class="manager-card">

<h2>

Research List

</h2>

<div class="research-list">

`;

    items.forEach((item) => {
      html += this.renderItem(item);
    });

    html += `

</div>

<button
    type="button"
    onclick="Transport.add()">

+ Add Transport

</button>

</div>

`;

    return html;
  },

  renderItem(item) {
    const amount =
      item.price && item.price.amount > 0
        ? `${item.price.currency} ${item.price.amount}`
        : "Price not entered";

    const nextStage = this.nextStage(item.status);

    return `

<div class="research-item">

    <strong>

        ${item.mode || "Transport"}: ${this.esc(item.from)} → ${this.esc(item.to)}
        ${this.showAll || this.currentDestinationFilter ? `<span class="badge">Day ${item.day}</span>` : ""}

    </strong>

    <p>

        ${item.provider || "Unknown Provider"}

    </p>

    <p>

        ${amount}

    </p>

    <p>

        Status:
        <span class="badge">${item.status}</span>

    </p>

    ${this.renderRouteInfo(item)}

    <div class="research-actions">

        ${
          nextStage
            ? `<button type="button" onclick="Transport.advance('${item.id}')">Mark ${nextStage}</button>`
            : ""
        }

        <button
            type="button"
            onclick="Transport.edit('${item.id}')">

            Edit

        </button>

        <button
            type="button"
            onclick="Transport.remove('${item.id}')">

            Delete

        </button>

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
      rows += `

<tr>

<td>${stage}</td>

<td>${counts[stage]}</td>

</tr>

`;
    });

    return `

<div class="manager-card">

<h2>

Booking Status

</h2>

<table>

${rows}

</table>

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
    const data = Project.get("transport");

    if (!data || !Array.isArray(data.items)) {
      return;
    }

    const item = data.items.find((x) => x.id === id);

    if (!item) {
      return;
    }

    const next = this.nextStage(item.status);

    if (next) {
      item.status = next;
    }

    Project.update("transport", data);

    this.refresh();
  },

  refresh() {
    if (this.showAll) {
      this.openAll();
    } else if (this.currentDay) {
      this.open(this.currentDay);
    } else if (this.currentDestinationFilter) {
      this.openForDestination(this.returnDestinationId);
    } else {
      this.openAll();
    }
  },

  add() {
    Render.show(Layout.render(this.renderForm(this.blankItem())));
  },

  edit(id) {
    const data = Project.get("transport");

    if (!data || !Array.isArray(data.items)) {
      return;
    }

    const item = data.items.find((x) => x.id === id);

    if (!item) {
      return;
    }

    Render.show(Layout.render(this.renderForm(item)));
  },

  remove(id) {
    const answer = confirm("Remove this transport item?");

    if (!answer) {
      return;
    }

    const data = Project.get("transport");

    if (!data || !Array.isArray(data.items)) {
      return;
    }

    data.items = data.items.filter((item) => item.id !== id);

    Project.update("transport", data);

    this.refresh();
  },

  blankItem() {
    const day = this.currentDay || {};

    return {
      id: "",
      day: day.day || 1,
      type: "transport",
      mode: "Drive",
      status: "Research",
      locked: false,
      from: "",
      to: "",
      fromCoordinates: { latitude: null, longitude: null },
      toCoordinates: { latitude: null, longitude: null },
      provider: "",
      website: "",
      bookingReference: "",
      price: { amount: 0, currency: "EUR" },
      schedule: { date: day.date || "", departTime: "", arriveTime: "" },
      route: { distanceKm: 0, durationMinutes: 0, tollsEstimate: 0, tollsCurrency: "EUR" },
      planning: { priority: "High", notes: "" },
      actual: { paid: false, completed: false },
    };
  },

  renderForm(item) {
    const isNew = !item.id;

    return `

<div class="manager">

    <section class="hero">

        <h1>

            ${isNew ? "Add Transport" : "Edit Transport"}

        </h1>

        <h2>

            ${this.showAll ? "All Days" : this.currentDay ? `Day ${this.currentDay.day}` : this.pretty(this.currentDestinationFilter)}

        </h2>

    </section>

    <div class="manager-card form-card">

        <div class="form-grid">

            <label class="form-field">
                Day Number
                <input type="number" id="trn-day" value="${item.day || (this.currentDay ? this.currentDay.day : 1)}" min="1">
            </label>

            <label class="form-field">
                Mode
                <select id="trn-mode">
                    ${this.modeOptions(item.mode)}
                </select>
            </label>

            <label class="form-field">
                From
                <input type="text" id="trn-from" value="${this.esc(item.from)}">
            </label>

            <label class="form-field">
                From Latitude
                <input type="number" id="trn-from-lat" value="${item.fromCoordinates?.latitude ?? ""}" step="0.000001">
                <span class="form-hint">Optional, more reliable routing</span>
            </label>

            <label class="form-field">
                From Longitude
                <input type="number" id="trn-from-lng" value="${item.fromCoordinates?.longitude ?? ""}" step="0.000001">
                <span class="form-hint">Optional</span>
            </label>

            <label class="form-field">
                To
                <input type="text" id="trn-to" value="${this.esc(item.to)}">
            </label>

            <label class="form-field">
                To Latitude
                <input type="number" id="trn-to-lat" value="${item.toCoordinates?.latitude ?? ""}" step="0.000001">
                <span class="form-hint">Optional, more reliable routing</span>
            </label>

            <label class="form-field">
                To Longitude
                <input type="number" id="trn-to-lng" value="${item.toCoordinates?.longitude ?? ""}" step="0.000001">
                <span class="form-hint">Optional</span>
            </label>

            <label class="form-field">
                Provider / Site
                <input type="text" id="trn-provider" value="${this.esc(item.provider)}">
            </label>

            <label class="form-field">
                Website / Link
                <input type="text" id="trn-website" value="${this.esc(item.website)}">
            </label>

            <label class="form-field">
                Booking Reference
                <input type="text" id="trn-reference" value="${this.esc(item.bookingReference)}">
            </label>

            <label class="form-field">
                Status
                <select id="trn-status">
                    ${this.statusOptions(item.status)}
                </select>
            </label>

            <label class="form-field">
                Priority
                <select id="trn-priority">
                    ${this.priorityOptions(item.planning?.priority)}
                </select>
            </label>

            <label class="form-field">
                Price Amount
                <input type="number" id="trn-price-amount" value="${item.price?.amount ?? 0}" min="0" step="0.01">
            </label>

            <label class="form-field">
                Currency
                <input type="text" id="trn-price-currency" value="${this.esc(item.price?.currency || "EUR")}" maxlength="3">
            </label>

            <label class="form-field">
                Date
                <input type="date" id="trn-date" value="${this.esc(item.schedule?.date)}">
            </label>

            <label class="form-field">
                Depart Time
                <input type="time" id="trn-depart" value="${this.esc(item.schedule?.departTime)}">
            </label>

            <label class="form-field">
                Arrive Time
                <input type="time" id="trn-arrive" value="${this.esc(item.schedule?.arriveTime)}">
            </label>

            <label class="form-field">
                Distance (km)
                <input type="number" id="trn-distance" value="${item.route?.distanceKm ?? 0}" min="0" step="0.1">
                <span class="form-hint">Drive/Walk only</span>
            </label>

            <label class="form-field">
                Duration (Minutes)
                <input type="number" id="trn-duration" value="${item.route?.durationMinutes ?? 0}" min="0">
                <span class="form-hint">Drive/Walk only</span>
            </label>

            <label class="form-field">
                Tolls Estimate
                <input type="number" id="trn-tolls" value="${item.route?.tollsEstimate ?? 0}" min="0" step="0.01">
                <span class="form-hint">Drive only</span>
            </label>

        </div>

        <label class="form-field form-field-wide">
            Notes
            <textarea id="trn-notes" rows="4">${this.esc(item.planning?.notes)}</textarea>
        </label>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Transport.save('${item.id || ""}')">

            Save

        </button>

        <button type="button" onclick="${this.backAction()}">

            Cancel

        </button>

    </div>

</div>

`;
  },

  modeOptions(current) {
    return this.modes
      .map((mode) => `<option value="${mode}" ${mode === current ? "selected" : ""}>${mode}</option>`)
      .join("");
  },

  statusOptions(current) {
    return this.workflow
      .map(
        (status) =>
          `<option value="${status}" ${status === current ? "selected" : ""}>${status}</option>`,
      )
      .join("");
  },

  priorityOptions(current) {
    const priorities = ["High", "Medium", "Low"];

    return priorities
      .map(
        (priority) =>
          `<option value="${priority}" ${priority === current ? "selected" : ""}>${priority}</option>`,
      )
      .join("");
  },

  save(id) {
    const data = Project.get("transport");

    if (!data || !Array.isArray(data.items)) {
      return;
    }

    const from = document.getElementById("trn-from").value.trim();

    const to = document.getElementById("trn-to").value.trim();

    if (!from || !to) {
      alert("Please enter both a From and To location before saving.");
      return;
    }

    const isNew = !id;

    const item = isNew ? this.blankItem() : data.items.find((x) => x.id === id);

    if (!item) {
      return;
    }

    const dayNumber = parseInt(document.getElementById("trn-day").value, 10);

    if (!dayNumber || dayNumber < 1) {
      alert("Please enter a valid day number before saving.");
      return;
    }

    if (isNew) {
      item.id = this.nextId(data.items);
    }

    item.day = dayNumber;

    item.mode = document.getElementById("trn-mode").value;
    item.from = from;
    item.to = to;

    item.fromCoordinates = this.readCoordinates("trn-from-lat", "trn-from-lng");
    item.toCoordinates = this.readCoordinates("trn-to-lat", "trn-to-lng");
    item.provider = document.getElementById("trn-provider").value.trim();
    item.website = document.getElementById("trn-website").value.trim();
    item.bookingReference = document.getElementById("trn-reference").value.trim();
    item.status = document.getElementById("trn-status").value;

    item.price = {
      amount: parseFloat(document.getElementById("trn-price-amount").value) || 0,
      currency: document.getElementById("trn-price-currency").value.trim() || "EUR",
    };

    item.schedule = {
      date: document.getElementById("trn-date").value,
      departTime: document.getElementById("trn-depart").value,
      arriveTime: document.getElementById("trn-arrive").value,
    };

    item.route = {
      distanceKm: parseFloat(document.getElementById("trn-distance").value) || 0,
      durationMinutes: parseInt(document.getElementById("trn-duration").value, 10) || 0,
      tollsEstimate: parseFloat(document.getElementById("trn-tolls").value) || 0,
      tollsCurrency: item.price?.currency || "EUR",
    };

    item.planning = {
      priority: document.getElementById("trn-priority").value,
      notes: document.getElementById("trn-notes").value.trim(),
    };

    if (isNew) {
      data.items.push(item);
    }

    Project.update("transport", data);

    this.refresh();
  },

  nextId(items) {
    let max = 0;

    items.forEach((item) => {
      const match = /TRN-(\d+)/.exec(item.id || "");

      if (match) {
        max = Math.max(max, parseInt(match[1], 10));
      }
    });

    const next = String(max + 1).padStart(4, "0");

    return `TRN-${next}`;
  },

  renderRouteInfo(item) {
    const isRoutable = item.mode === "Drive" || item.mode === "Walk";

    if (!isRoutable) {
      return "";
    }

    const route = item.route || {};

    const hasFacts = route.distanceKm > 0 || route.durationMinutes > 0;

    return `

<p>

    ${
      hasFacts
        ? `${route.distanceKm || 0} km · ${route.durationMinutes || 0} min${route.tollsEstimate > 0 ? ` · Tolls ~${route.tollsCurrency || "EUR"} ${route.tollsEstimate}` : ""}`
        : "No route facts entered yet."
    }
    ${this.hasCoordinates(item.toCoordinates) ? ` · <span class="badge">📍 Precise routing</span>` : ""}

</p>

<div class="research-actions">

    <a class="map-btn" href="${this.googleMapsUrl(item)}" target="_blank" rel="noopener">Open in Google Maps</a>

    <a class="map-btn" href="${this.wazeUrl(item)}" target="_blank" rel="noopener" title="Opens directly on mobile with the Waze app installed. On desktop it will prompt to download.">Open in Waze</a>

</div>

<p class="form-hint">Waze opens directly on mobile with the app installed; on desktop it prompts an app download instead.</p>

`;
  },

  hasCoordinates(coords) {
    return coords && coords.latitude !== null && coords.longitude !== null;
  },

  readCoordinates(latId, lngId) {
    const latRaw = document.getElementById(latId).value;

    const lngRaw = document.getElementById(lngId).value;

    const latitude = latRaw === "" ? null : parseFloat(latRaw);

    const longitude = lngRaw === "" ? null : parseFloat(lngRaw);

    if (latitude === null || longitude === null || isNaN(latitude) || isNaN(longitude)) {
      return { latitude: null, longitude: null };
    }

    return { latitude, longitude };
  },

  googleMapsUrl(item) {
    const mode = item.mode === "Walk" ? "walking" : "driving";

    const origin = this.hasCoordinates(item.fromCoordinates)
      ? `${item.fromCoordinates.latitude},${item.fromCoordinates.longitude}`
      : encodeURIComponent(item.from || "");

    const destination = this.hasCoordinates(item.toCoordinates)
      ? `${item.toCoordinates.latitude},${item.toCoordinates.longitude}`
      : encodeURIComponent(item.to || "");

    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`;
  },

  wazeUrl(item) {
    if (this.hasCoordinates(item.toCoordinates)) {
      return `https://waze.com/ul?ll=${item.toCoordinates.latitude},${item.toCoordinates.longitude}&navigate=yes`;
    }

    const destination = encodeURIComponent(item.to || "");

    return `https://waze.com/ul?q=${destination}&navigate=yes`;
  },

  pretty(value) {
    return String(value || "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  },

  esc(value) {
    return String(value ?? "").replace(/"/g, "&quot;");
  },
};
