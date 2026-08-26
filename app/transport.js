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

  saving: false,

  workflow: ["Research", "Shortlisted", "Selected", "Booked", "Travel", "Review"],

  modes: ["Drive", "Walk", "Train", "Ferry", "Transfer", "Car Rental", "Other"],

  // Reference screenshot being edited in the currently-open form, kept
  // client-side until Save (a new item has no id to attach it to yet;
  // an existing item's other unsaved field edits shouldn't be discarded
  // by an image upload, so this never triggers a form re-render).
  pendingImage: null,

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

  // The single place that knows how to test "is this transport item
  // present on day N" - covers both an ordinary single day (item.day)
  // and a multi-day booking (item.dayRange = [first,last]).
  matchesDay(item, dayNumber) {
    if (Array.isArray(item.dayRange) && item.dayRange.length >= 1) {
      const first = item.dayRange[0];

      const last = item.dayRange[item.dayRange.length - 1];

      return dayNumber >= first && dayNumber <= last;
    }

    return item.day === dayNumber;
  },

  dayLabel(item) {
    if (Array.isArray(item.dayRange) && item.dayRange.length >= 1 && item.dayRange[1] !== item.dayRange[0]) {
      return `Day ${item.dayRange[0]}–${item.dayRange[1]}`;
    }

    return `Day ${item.day}`;
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

      return data.items.filter((item) => dayNumbers.some((dayNumber) => this.matchesDay(item, dayNumber)));
    }

    return data.items.filter((item) => this.matchesDay(item, this.currentDay.day));
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

    <div class="empty-state">

        <span class="empty-icon" aria-hidden="true">🚗</span>

        <p>No transport here yet.</p>

        <button type="button" class="btn-primary" onclick="Transport.add()">Add transport</button>

    </div>

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
        ${this.showAll || this.currentDestinationFilter ? `<span class="badge">${this.dayLabel(item)}</span>` : ""}

    </strong>

    ${
      Array.isArray(item.dayRange) && item.dayRange[1] !== item.dayRange[0]
        ? `<p><span class="badge">🗓 ${this.dayLabel(item)} (${item.dayRange[1] - item.dayRange[0] + 1} days)</span></p>`
        : ""
    }

    <p>

        ${item.provider || "Unknown Provider"}

    </p>

    <p>

        ${amount}${Currency.inlineConversion(item.price)}

    </p>

    ${this.renderScheduleInfo(item)}

    <p>

        Status:
        <span class="badge badge--${String(item.status || "").toLowerCase()}">${item.status}</span>
        ${item.addedBy ? `<span class="badge">Added by ${this.esc(item.addedBy)}</span>` : ""}

    </p>

    ${
      item.referenceImage && item.referenceImage.url
        ? `<p><a href="${this.esc(item.referenceImage.url)}" target="_blank" rel="noopener" class="trn-image-thumb"><img src="${this.esc(item.referenceImage.url)}" alt="Reference screenshot"></a></p>`
        : ""
    }

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

    const item = data && Array.isArray(data.items) ? data.items.find((x) => x.id === id) : null;

    if (!item) {
      return;
    }

    const next = this.nextStage(item.status);

    if (!next) {
      return;
    }

    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/transport/${id}`, {
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
        console.error("Could not advance transport status:", error);

        alert("Couldn't save that change. Check the connection and try again.");
      });
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
    this.pendingImage = null;

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

    this.pendingImage = item.referenceImage || null;

    Render.show(Layout.render(this.renderForm(item)));
  },

  remove(id) {
    const answer = confirm("Remove this transport item?");

    if (!answer) {
      return;
    }

    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/transport/${id}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Remove failed with status ${response.status}`);
        }

        const data = Project.get("transport");

        if (data && Array.isArray(data.items)) {
          data.items = data.items.filter((item) => item.id !== id);
        }

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not remove transport item:", error);

        alert("Couldn't remove that item. Check the connection and try again.");
      });
  },

  blankItem() {
    const day = this.currentDay || {};

    return {
      id: "",
      day: day.day || 1,
      // Multi-day bookings (a hire car held over several days, a multi-day
      // rail/ferry pass) set dayRange to [startDay, endDay]; an ordinary
      // single-day leg leaves this null and behaves exactly as before -
      // matches the [first,last] convention Accommodation already uses.
      dayRange: null,
      // One reference screenshot (a price quote with no bookable link, a
      // rental terms page, whatever) - { url, filename, uploadedAt } or null.
      referenceImage: null,
      type: "transport",
      addedBy: Project.currentUser || "",
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
      schedule: { date: day.date || "", departTime: "", arriveDate: "", arriveTime: "" },
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

        ${DayReference.render("Transport", "range", { start: "Start Day", end: "End Day" })}

        <div class="form-field form-field-wide">

            Reference Screenshot
            <span class="form-hint">For a price quote or terms page that doesn't have a link you can come back to</span>

            <div id="trn-image-area">${this.renderImageArea()}</div>

            <input type="file" id="trn-image-file" accept="image/*" style="display:none" onchange="Transport.handleImageSelect(event)">

        </div>

        <div class="form-grid">

            <label class="form-field">
                Start Day
                <input type="number" id="trn-day" value="${item.day || (this.currentDay ? this.currentDay.day : 1)}" min="1">
            </label>

            <label class="form-field">
                End Day
                <input type="number" id="trn-end-day" value="${(Array.isArray(item.dayRange) ? item.dayRange[1] : null) || item.day || (this.currentDay ? this.currentDay.day : 1)}" min="1">
                <span class="form-hint">Same as Start Day for a single leg; set later for a multi-day hire car, van or pass</span>
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
                To
                <input type="text" id="trn-to" value="${this.esc(item.to)}">
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
                <select id="trn-price-currency">${Currency.currencyOptions(item.price?.currency || "EUR")}</select>
            </label>

            <label class="form-field">
                Departure Date
                <input type="date" id="trn-date" value="${this.esc(item.schedule?.date || Dates.getDayDate(item.day))}">
            </label>

            <label class="form-field">
                Depart Time
                <input type="time" id="trn-depart" value="${this.esc(item.schedule?.departTime)}">
            </label>

            <label class="form-field">
                Arrival Date
                <input type="date" id="trn-arrive-date" value="${this.esc(item.schedule?.arriveDate || Dates.getDayDate(item.day))}">
                <span class="form-hint">If it lands a different day (e.g. overnight flight)</span>
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

            <label class="form-field form-field-wide">
                Route lookup
                <button type="button" class="btn-secondary btn-sm" onclick="Transport.lookupRoute()">
                    Look up distance &amp; duration
                </button>
                <span class="form-hint" id="trn-route-status">Fills in the real driving distance and time from the From and To above.</span>
            </label>

            <label class="form-field">
                Tolls Estimate
                <input type="number" id="trn-tolls" value="${item.route?.tollsEstimate ?? 0}" min="0" step="0.01">
                <span class="form-hint">Drive only</span>
            </label>

        </div>

        <details style="margin-top: 14px;">

            <summary>Advanced: exact coordinates (optional, more reliable Google Maps/Waze routing)</summary>

            <div class="form-grid" style="margin-top: 10px;">

                <label class="form-field">
                    From Latitude
                    <input type="number" id="trn-from-lat" value="${item.fromCoordinates?.latitude ?? ""}" step="any" min="-90" max="90">
                </label>

                <label class="form-field">
                    From Longitude
                    <input type="number" id="trn-from-lng" value="${item.fromCoordinates?.longitude ?? ""}" step="any" min="-180" max="180">
                </label>

                <label class="form-field">
                    To Latitude
                    <input type="number" id="trn-to-lat" value="${item.toCoordinates?.latitude ?? ""}" step="any" min="-90" max="90">
                </label>

                <label class="form-field">
                    To Longitude
                    <input type="number" id="trn-to-lng" value="${item.toCoordinates?.longitude ?? ""}" step="any" min="-180" max="180">
                </label>

            </div>

        </details>

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

        ${!isNew ? `<button type="button" class="btn-danger" onclick="Transport.remove('${item.id}')">Delete</button>` : ""}

    </div>

</div>

`;
  },

  renderImageArea() {
    if (!this.pendingImage || !this.pendingImage.url) {
      return `<button type="button" class="btn-secondary btn-sm" onclick="document.getElementById('trn-image-file').click()">+ Add Screenshot</button>`;
    }

    return `

<div class="trn-image-preview">

    <a href="${this.esc(this.pendingImage.url)}" target="_blank" rel="noopener">
        <img src="${this.esc(this.pendingImage.url)}" alt="Reference screenshot">
    </a>

    <div class="trn-image-actions">
        <button type="button" class="btn-secondary btn-sm" onclick="document.getElementById('trn-image-file').click()">Change</button>
        <button type="button" class="btn-danger btn-sm" onclick="Transport.removeImage()">Remove</button>
    </div>

</div>

`;
  },

  async handleImageSelect(event) {
    const file = event.target.files && event.target.files[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    const area = document.getElementById("trn-image-area");

    if (area) {
      area.innerHTML = "Uploading...";
    }

    try {
      const resizedDataUrl = await this.resizeImage(file, 1600, 0.8);

      const response = await fetch(`${window.API_BASE}/api/upload/${Data.currentProjectFolder}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: resizedDataUrl }),
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      const result = await response.json();

      this.pendingImage = { url: result.url, filename: file.name, uploadedAt: new Date().toISOString() };
    } catch (error) {
      console.error("Could not upload reference screenshot:", error);

      alert("Couldn't upload that image. Check the connection and try again.");
    }

    if (area) {
      area.innerHTML = this.renderImageArea();
    }
  },

  resizeImage(file, maxDimension, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error("Could not read file."));

      reader.onload = () => {
        const img = new Image();

        img.onerror = () => reject(new Error("Could not decode image."));

        img.onload = () => {
          let { width, height } = img;

          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round((height / width) * maxDimension);
              width = maxDimension;
            } else {
              width = Math.round((width / height) * maxDimension);
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");

          canvas.width = width;
          canvas.height = height;

          canvas.getContext("2d").drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL("image/jpeg", quality));
        };

        img.src = reader.result;
      };

      reader.readAsDataURL(file);
    });
  },

  removeImage() {
    this.pendingImage = null;

    const area = document.getElementById("trn-image-area");

    if (area) {
      area.innerHTML = this.renderImageArea();
    }
  },

  // 'start' fills Start Day + the Departure Date; 'end' fills End Day +
  // the Arrival Date (arrival is allowed to land a different real date,
  // e.g. an overnight ferry, so it gets its own date field rather than
  // reusing the departure one).
  pickDay(dayNumber, field) {
    const date = Dates.getDayDate(dayNumber);

    if (field === "start") {
      document.getElementById("trn-day").value = dayNumber;

      if (date) {
        document.getElementById("trn-date").value = date;
      }
    } else {
      document.getElementById("trn-end-day").value = dayNumber;

      if (date) {
        document.getElementById("trn-arrive-date").value = date;
      }
    }
  },

  // Fills the Distance and Duration fields from a real driving route.
  //
  // Uses the exact coordinates if they've been entered (most accurate),
  // otherwise geocodes the From/To text first. Walk mode routes as a
  // pedestrian; everything else routes as driving, since a train or ferry
  // leg's road distance is still a better estimate than nothing.
  async lookupRoute() {
    const status = document.getElementById("trn-route-status");

    const setStatus = (text) => {
      if (status) {
        status.textContent = text;
      }
    };

    if (typeof Geo === "undefined") {
      setStatus("Route lookup isn't available.");

      return;
    }

    const from = document.getElementById("trn-from").value.trim();

    const to = document.getElementById("trn-to").value.trim();

    if (!from || !to) {
      setStatus("Enter both a From and To location first.");

      return;
    }

    setStatus("Looking up the route…");

    try {
      const fromCoords = await this.resolvePoint("trn-from-lat", "trn-from-lng", from);

      const toCoords = await this.resolvePoint("trn-to-lat", "trn-to-lng", to);

      if (!fromCoords || !toCoords) {
        setStatus(
          `Couldn't find ${!fromCoords ? "the From" : "the To"} location. Try a more specific name, or enter coordinates under Advanced.`,
        );

        return;
      }

      const mode = document.getElementById("trn-mode").value === "Walk" ? "walk" : "drive";

      const route = await Geo.route([fromCoords, toCoords], { mode });

      if (!route || route.distanceKm === null) {
        setStatus("No route found between those two places.");

        return;
      }

      document.getElementById("trn-distance").value = route.distanceKm;

      document.getElementById("trn-duration").value = route.durationMinutes;

      setStatus(`Found: ${route.distanceKm} km, about ${Geo.formatDuration(route.durationMinutes)} by ${mode}.`);
    } catch (error) {
      console.error("Route lookup failed:", error);

      setStatus(
        error.code === "GEOAPIFY_NOT_CONFIGURED"
          ? "Route lookup isn't set up on this server."
          : "Couldn't reach the route service. Try again.",
      );
    }
  },

  // Prefers already-entered coordinates over geocoding the name - they're
  // exact, and it avoids spending a credit.
  async resolvePoint(latId, lngId, text) {
    const lat = parseFloat(document.getElementById(latId).value);

    const lng = parseFloat(document.getElementById(lngId).value);

    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      return [lat, lng];
    }

    const results = await Geo.search(text, { limit: 1 });

    return results.length > 0 ? [results[0].lat, results[0].lon] : null;
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
    const from = document.getElementById("trn-from").value.trim();

    const to = document.getElementById("trn-to").value.trim();

    if (!from || !to) {
      alert("Please enter both a From and To location before saving.");
      return;
    }

    const dayNumber = parseInt(document.getElementById("trn-day").value, 10);

    if (!dayNumber || dayNumber < 1) {
      alert("Please enter a valid start day before saving.");
      return;
    }

    const endDayRaw = parseInt(document.getElementById("trn-end-day").value, 10);

    const endDay = endDayRaw && endDayRaw >= dayNumber ? endDayRaw : dayNumber;

    if (endDayRaw && endDayRaw < dayNumber) {
      alert("End Day can't be before Start Day - saving it as a single-day item on the Start Day instead.");
    }

    const isNew = !id;

    const priceCurrency = document.getElementById("trn-price-currency").value.trim() || "EUR";

    const fields = {
      day: dayNumber,
      dayRange: endDay > dayNumber ? [dayNumber, endDay] : null,
      referenceImage: this.pendingImage || null,
      type: "transport",
      addedBy: isNew ? Project.currentUser || "" : undefined,
      mode: document.getElementById("trn-mode").value,
      from,
      to,
      fromCoordinates: this.readCoordinates("trn-from-lat", "trn-from-lng"),
      toCoordinates: this.readCoordinates("trn-to-lat", "trn-to-lng"),
      provider: document.getElementById("trn-provider").value.trim(),
      website: document.getElementById("trn-website").value.trim(),
      bookingReference: document.getElementById("trn-reference").value.trim(),
      status: document.getElementById("trn-status").value,
      locked: isNew ? false : undefined,
      price: {
        amount: parseFloat(document.getElementById("trn-price-amount").value) || 0,
        currency: priceCurrency,
      },
      schedule: {
        date: document.getElementById("trn-date").value,
        departTime: document.getElementById("trn-depart").value,
        arriveDate: document.getElementById("trn-arrive-date").value,
        arriveTime: document.getElementById("trn-arrive").value,
      },
      route: {
        distanceKm: parseFloat(document.getElementById("trn-distance").value) || 0,
        durationMinutes: parseInt(document.getElementById("trn-duration").value, 10) || 0,
        tollsEstimate: parseFloat(document.getElementById("trn-tolls").value) || 0,
        tollsCurrency: priceCurrency,
      },
      planning: {
        priority: document.getElementById("trn-priority").value,
        notes: document.getElementById("trn-notes").value.trim(),
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

    const url = isNew
      ? `${window.API_BASE}/api/items/${Data.currentProjectFolder}/transport`
      : `${window.API_BASE}/api/items/${Data.currentProjectFolder}/transport/${id}`;

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
        const data = Project.get("transport");

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

        this.saving = false;

        this.refresh();
      })
      .catch((error) => {
        this.saving = false;

        console.error("Could not save transport item:", error);

        alert("Couldn't save that item. Check the connection and try again.");
      });
  },

  renderScheduleInfo(item) {
    const schedule = item.schedule || {};

    if (!schedule.date && !schedule.departTime && !schedule.arriveTime) {
      return "";
    }

    return `

<p>

    ${schedule.date ? this.esc(schedule.date) : ""}
    ${schedule.departTime ? `Depart ${this.esc(schedule.departTime)}` : ""}
    ${schedule.arriveTime ? ` · Arrive ${schedule.arriveDate && schedule.arriveDate !== schedule.date ? this.esc(schedule.arriveDate) + " " : ""}${this.esc(schedule.arriveTime)}` : ""}

</p>

`;
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
