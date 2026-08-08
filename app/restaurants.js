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

  returnDestinationId: null,

  workflow: ["Research", "Shortlisted", "Selected", "Booked", "Travel", "Review"],

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

    this.returnDestinationId = null;

    Render.show(Layout.render(this.render()));
  },

  openForDestination(locationId) {
    this.currentDay = null;

    this.currentDestination = String(locationId || "").toLowerCase();

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

  refresh() {
    if (this.currentDay) {
      this.open(this.currentDay);
    } else if (this.returnDestinationId) {
      this.openForDestination(this.returnDestinationId);
    } else {
      Router.navigate("dashboard");
    }
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
            onclick="${this.backAction()}">

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
    const booked = items.filter((item) => item.status === "Booked" || item.status === "Travel");

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
    const priceLevel = item.priceLevel ? "€".repeat(item.priceLevel) : "Price not entered";

    const nextStage = this.nextStage(item.status);

    return `

<div class="research-item">

    <strong>

        ${this.esc(item.name) || "Unnamed Restaurant"}

    </strong>

    <p>

        ${item.cuisine || "Uncategorised"} · ${priceLevel}${Currency.inlineConversion(item.price)}

    </p>

    <p>

        ${this.esc(item.location?.address)}

    </p>

    <p>

        Status:
        <span class="badge badge--${String(item.status || "").toLowerCase()}">${item.status}</span>
        ${item.addedBy ? `<span class="badge">Added by ${this.esc(item.addedBy)}</span>` : ""}

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

    const item = data && Array.isArray(data.items) ? data.items.find((x) => x.id === id) : null;

    if (!item) {
      return;
    }

    const next = this.nextStage(item.status);

    if (!next) {
      return;
    }

    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/restaurants/${id}`, {
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
        console.error("Could not advance restaurant status:", error);

        alert("Couldn't save that change. Check the connection and try again.");
      });
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

    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/restaurants/${id}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Remove failed with status ${response.status}`);
        }

        const data = Project.get("restaurants");

        if (data && Array.isArray(data.items)) {
          data.items = data.items.filter((item) => item.id !== id);
        }

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not remove restaurant:", error);

        alert("Couldn't remove that item. Check the connection and try again.");
      });
  },

  blankItem() {
    const day = this.currentDay || {};

    return {
      id: "",
      destination: this.currentDestination,
      dayRange: [day.day || 1, day.day || 1],
      type: "restaurant",
      addedBy: Project.currentUser || "",
      name: "",
      cuisine: "",
      status: "Research",
      locked: false,
      priceLevel: 2,
      price: { amount: 0, currency: "EUR" },
      website: "",
      bookingReference: "",
      location: { locationId: "", address: "", latitude: null, longitude: null },
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
                <select id="rst-price-currency">${Currency.currencyOptions(item.price?.currency || "EUR")}</select>
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
                <input type="date" id="rst-res-date" value="${this.esc(item.reservation?.date || Dates.getDayDate(item.dayRange?.[0]))}">
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

        <button type="button" onclick="${this.backAction()}">

            Cancel

        </button>

    </div>

</div>

`;
  },

  cuisineOptions(current) {
    return this.cuisines
      .map((c) => `<option value="${c}" ${c === current ? "selected" : ""}>${c}</option>`)
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

    const fields = {
      destination: isNew ? this.currentDestination : undefined,
      type: "restaurant",
      addedBy: isNew ? Project.currentUser || "" : undefined,
      name,
      cuisine: document.getElementById("rst-cuisine").value,
      priceLevel: parseInt(document.getElementById("rst-price-level").value, 10) || 1,
      price: {
        amount: parseFloat(document.getElementById("rst-price-amount").value) || 0,
        currency: document.getElementById("rst-price-currency").value.trim() || "EUR",
      },
      website: document.getElementById("rst-website").value.trim(),
      bookingReference: document.getElementById("rst-reference").value.trim(),
      status: document.getElementById("rst-status").value,
      locked: isNew ? false : undefined,
      location: {
        locationId: "",
        address: document.getElementById("rst-address").value.trim(),
        latitude: null,
        longitude: null,
      },
      reservation: {
        date: document.getElementById("rst-res-date").value,
        time: document.getElementById("rst-res-time").value,
        partySize: parseInt(document.getElementById("rst-party-size").value, 10) || 1,
      },
      planning: {
        priority: document.getElementById("rst-priority").value,
        notes: document.getElementById("rst-notes").value.trim(),
        pros,
        cons,
      },
      actual: isNew ? { paid: false, attended: false, rating: null, review: "" } : undefined,
    };

    Object.keys(fields).forEach((key) => {
      if (fields[key] === undefined) {
        delete fields[key];
      }
    });

    const url = isNew
      ? `${window.API_BASE}/api/items/${Data.currentProjectFolder}/restaurants`
      : `${window.API_BASE}/api/items/${Data.currentProjectFolder}/restaurants/${id}`;

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
        const data = Project.get("restaurants");

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

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not save restaurant:", error);

        alert("Couldn't save that item. Check the connection and try again.");
      });
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
