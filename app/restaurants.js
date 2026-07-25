/*
=========================================================

COMPASS-TOS

Restaurants Manager

Version 1.0.0

Build 14

=========================================================
*/

const Restaurants = {
  currentDay: null,

  currentDestination: "",

  workflow: [
    "Research",
    "Shortlisted",
    "Selected",
    "Booked",
    "Travel",
    "Review",
  ],

  cuisines: [
    "Italian",
    "Pizza",
    "Seafood",
    "Cafe",
    "Fine Dining",
    "Street Food",
    "Wine Bar",
    "Other",
  ],

  open(day) {
    this.currentDay = day;

    this.currentDestination = String(
      day.location || day.overnight || "",
    ).toLowerCase();

    Render.show(Layout.render(this.render()));
  },

  render() {
    const items = this.getRestaurants();

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Restaurants

        </h1>

        <h2>

            ${this.pretty(this.currentDestination)}

        </h2>

        <p>

            ${items.length} restaurant${items.length === 1 ? "" : "s"}

        </p>

    </section>

    <div class="planner-buttons">

        <button
            type="button"
            onclick="Restaurants.add()">

            + Add Restaurant

        </button>

        <button
            type="button"
            onclick="Day.open(Restaurants.currentDay.day)">

            ← Back to Day

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

  getRestaurants() {
    const data = Project.get("restaurants");

    if (!data || !Array.isArray(data.items)) {
      return [];
    }

    return data.items.filter((item) => {
      return (
        String(item.destination || "").toLowerCase() === this.currentDestination
      );
    });
  },

  renderBooked(items) {
    const booked = items.filter(
      (item) => item.status === "Booked" || item.status === "Travel",
    );

    if (booked.length === 0) {
      return `

<div class="manager-card">

<h2>

Booked Restaurants

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

Booked Restaurants

</h2>

<div class="research-list">

`;

    booked.forEach((item) => {
      html += `

<div class="research-item is-selected">

    <strong>${this.esc(item.name)}</strong>

    <p>${item.cuisine || ""}</p>

    <p>${this.esc(item.reservation?.date)} ${this.esc(item.reservation?.time)}</p>

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

No restaurants have been added for this destination.

</p>

<button
    type="button"
    onclick="Restaurants.add()">

Add Restaurant

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
    onclick="Restaurants.add()">

+ Add Restaurant

</button>

</div>

`;

    return html;
  },

  renderItem(item) {
    const priceLevel = item.priceLevel
      ? "€".repeat(item.priceLevel)
      : "Price not entered";

    const nextStage = this.nextStage(item.status);

    return `

<div class="research-item">

    <strong>

        ${this.esc(item.name) || "Unnamed Restaurant"}

    </strong>

    <p>

        ${item.cuisine || "Uncategorised"} · ${priceLevel}

    </p>

    <p>

        ${this.esc(item.location?.address)}

    </p>

    <p>

        Status:
        <span class="badge">${item.status}</span>

    </p>

    <div class="research-actions">

        ${
          nextStage
            ? `<button type="button" onclick="Restaurants.advance('${item.id}')">Mark ${nextStage}</button>`
            : ""
        }

        <button
            type="button"
            onclick="Restaurants.edit('${item.id}')">

            Edit

        </button>

        <button
            type="button"
            onclick="Restaurants.remove('${item.id}')">

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
    const data = Project.get("restaurants");

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

    Project.update("restaurants", data);

    this.open(this.currentDay);
  },

  add() {
    Render.show(Layout.render(this.renderForm(this.blankItem())));
  },

  edit(id) {
    const data = Project.get("restaurants");

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
    const answer = confirm("Remove this restaurant?");

    if (!answer) {
      return;
    }

    const data = Project.get("restaurants");

    if (!data || !Array.isArray(data.items)) {
      return;
    }

    data.items = data.items.filter((item) => item.id !== id);

    Project.update("restaurants", data);

    this.open(this.currentDay);
  },

  blankItem() {
    const day = this.currentDay || {};

    return {
      id: "",
      destination: this.currentDestination,
      dayRange: [day.day || 1, day.day || 1],
      type: "restaurant",
      name: "",
      cuisine: "",
      status: "Research",
      locked: false,
      priceLevel: 2,
      price: { amount: 0, currency: "EUR" },
      website: "",
      bookingReference: "",
      location: {
        locationId: "",
        address: "",
        latitude: null,
        longitude: null,
      },
      reservation: { date: "", time: "", partySize: 2 },
      planning: { priority: "Medium", notes: "", pros: [], cons: [] },
      actual: { paid: false, attended: false, rating: null, review: "" },
    };
  },

  renderForm(item) {
    const isNew = !item.id;

    return `

<div class="manager">

    <section class="hero">

        <h1>

            ${isNew ? "Add Restaurant" : "Edit Restaurant"}

        </h1>

        <h2>

            ${this.pretty(this.currentDestination)}

        </h2>

    </section>

    <div class="manager-card form-card">

        <div class="form-grid">

            <label class="form-field">
                Name
                <input type="text" id="rst-name" value="${this.esc(item.name)}" placeholder="e.g. Trattoria da Luigi">
            </label>

            <label class="form-field">
                Cuisine
                <select id="rst-cuisine">
                    ${this.cuisineOptions(item.cuisine)}
                </select>
            </label>

            <label class="form-field">
                Price Level (1-4)
                <input type="number" id="rst-price-level" value="${item.priceLevel ?? 2}" min="1" max="4">
            </label>

            <label class="form-field">
                Expected Cost (Total)
                <input type="number" id="rst-price-amount" value="${item.price?.amount ?? 0}" min="0" step="0.01">
            </label>

            <label class="form-field">
                Currency
                <input type="text" id="rst-price-currency" value="${this.esc(item.price?.currency || "EUR")}" maxlength="3">
            </label>

            <label class="form-field">
                Website / Link
                <input type="text" id="rst-website" value="${this.esc(item.website)}">
            </label>

            <label class="form-field">
                Booking Reference
                <input type="text" id="rst-reference" value="${this.esc(item.bookingReference)}">
            </label>

            <label class="form-field">
                Status
                <select id="rst-status">
                    ${this.statusOptions(item.status)}
                </select>
            </label>

            <label class="form-field">
                Priority
                <select id="rst-priority">
                    ${this.priorityOptions(item.planning?.priority)}
                </select>
            </label>

            <label class="form-field">
                Address
                <input type="text" id="rst-address" value="${this.esc(item.location?.address)}">
            </label>

            <label class="form-field">
                Reservation Date
                <input type="date" id="rst-res-date" value="${this.esc(item.reservation?.date)}">
            </label>

            <label class="form-field">
                Reservation Time
                <input type="time" id="rst-res-time" value="${this.esc(item.reservation?.time)}">
            </label>

            <label class="form-field">
                Party Size
                <input type="number" id="rst-party-size" value="${item.reservation?.partySize ?? 2}" min="1">
            </label>

        </div>

        <label class="form-field form-field-wide">
            Notes
            <textarea id="rst-notes" rows="4">${this.esc(item.planning?.notes)}</textarea>
        </label>

        <label class="form-field form-field-wide">
            Pros (one per line)
            <textarea id="rst-pros" rows="3">${(item.planning?.pros || []).join("\n")}</textarea>
        </label>

        <label class="form-field form-field-wide">
            Cons (one per line)
            <textarea id="rst-cons" rows="3">${(item.planning?.cons || []).join("\n")}</textarea>
        </label>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Restaurants.save('${item.id || ""}')">

            Save

        </button>

        <button type="button" onclick="Restaurants.open(Restaurants.currentDay)">

            Cancel

        </button>

    </div>

</div>

`;
  },

  cuisineOptions(current) {
    return this.cuisines
      .map(
        (c) =>
          `<option value="${c}" ${c === current ? "selected" : ""}>${c}</option>`,
      )
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
    const data = Project.get("restaurants");

    if (!data || !Array.isArray(data.items)) {
      return;
    }

    const name = document.getElementById("rst-name").value.trim();

    if (!name) {
      alert("Please enter a name before saving.");
      return;
    }

    const pros = document
      .getElementById("rst-pros")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const cons = document
      .getElementById("rst-cons")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const isNew = !id;

    const item = isNew ? this.blankItem() : data.items.find((x) => x.id === id);

    if (!item) {
      return;
    }

    if (isNew) {
      item.id = this.nextId(data.items);
      item.destination = this.currentDestination;
    }

    item.name = name;
    item.cuisine = document.getElementById("rst-cuisine").value;
    item.priceLevel =
      parseInt(document.getElementById("rst-price-level").value, 10) || 1;

    item.price = {
      amount:
        parseFloat(document.getElementById("rst-price-amount").value) || 0,
      currency:
        document.getElementById("rst-price-currency").value.trim() || "EUR",
    };
    item.website = document.getElementById("rst-website").value.trim();
    item.bookingReference = document
      .getElementById("rst-reference")
      .value.trim();
    item.status = document.getElementById("rst-status").value;

    item.location = item.location || {};
    item.location.address = document.getElementById("rst-address").value.trim();

    item.reservation = {
      date: document.getElementById("rst-res-date").value,
      time: document.getElementById("rst-res-time").value,
      partySize:
        parseInt(document.getElementById("rst-party-size").value, 10) || 1,
    };

    item.planning = {
      priority: document.getElementById("rst-priority").value,
      notes: document.getElementById("rst-notes").value.trim(),
      pros,
      cons,
    };

    if (isNew) {
      data.items.push(item);
    }

    Project.update("restaurants", data);

    this.open(this.currentDay);
  },

  nextId(items) {
    let max = 0;

    items.forEach((item) => {
      const match = /RST-(\d+)/.exec(item.id || "");

      if (match) {
        max = Math.max(max, parseInt(match[1], 10));
      }
    });

    const next = String(max + 1).padStart(4, "0");

    return `RST-${next}`;
  },

  esc(value) {
    return String(value ?? "").replace(/"/g, "&quot;");
  },

  pretty(value) {
    return String(value || "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  },
};
