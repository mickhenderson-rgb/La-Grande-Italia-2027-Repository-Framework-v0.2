/*
=========================================================

COMPASS-TOS

Accommodation Manager

Version 3.0.0

Build 10C

=========================================================
*/

const Accommodation = {
  currentDay: null,

  currentDestination: "",

  editingId: null,

  showAll: false,

  returnDestinationId: null,

  open(day) {
    this.currentDay = day;

    this.currentDestination = String(
      day.location || day.overnight || "",
    ).toLowerCase();

    this.showAll = false;

    this.returnDestinationId = null;

    this.editingId = null;

    Render.show(Layout.render(this.render()));
  },

  openAll() {
    this.currentDay = null;

    this.currentDestination = "";

    this.showAll = true;

    this.returnDestinationId = null;

    this.editingId = null;

    Render.show(Layout.render(this.render()));
  },

  openForDestination(locationId) {
    this.currentDay = null;

    this.currentDestination = String(locationId || "").toLowerCase();

    this.showAll = false;

    this.returnDestinationId = locationId;

    this.editingId = null;

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
    const items = this.getAccommodation();

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Accommodation Research

        </h1>

        <h2>

            ${this.showAll ? "All Destinations" : this.pretty(this.currentDestination)}

        </h2>

        <p>

            ${items.length} accommodation option${items.length === 1 ? "" : "s"}

        </p>

    </section>

    <div class="planner-buttons">

        <button
            type="button"
            onclick="Accommodation.add()">

            + Add Accommodation

        </button>

        <button
            type="button"
            onclick="${this.backAction()}">

            ← Back

        </button>

    </div>

    <div class="manager-grid">

        ${this.showAll ? "" : this.renderCurrent(items)}

        ${this.renderResearch(items)}

        ${this.renderBooking(items)}

        ${this.showAll ? "" : this.renderNotes(items)}

    </div>

</div>

`;
  },

  getAccommodation() {
    const data = Project.get("accommodation");

    if (!data || !Array.isArray(data.items)) {
      return [];
    }

    if (this.showAll) {
      return data.items;
    }

    return data.items.filter((item) => {
      return (
        String(item.destination || "").toLowerCase() === this.currentDestination
      );
    });
  },

  renderCurrent(items) {
    const selected = items.find((item) => item.selected);

    if (!selected) {
      return `

<div class="manager-card">

<h2>

Current Accommodation

</h2>

<p>

No accommodation selected.

</p>

</div>

`;
    }

    return `

<div class="manager-card">

<h2>

Current Accommodation

</h2>

<strong>

${selected.name || "Unnamed Accommodation"}

</strong>

<p>

${selected.provider || ""}

</p>

<p>

Status: ${selected.status}

</p>

<p>

${selected.dates?.checkIn || "?"} → ${selected.dates?.checkOut || "?"}

</p>

</div>

`;
  },

  renderResearch(items) {
    if (items.length === 0) {
      return `

<div class="manager-card">

<h2>

Research List

</h2>

<p>

No accommodation has been added for this destination.

</p>

<button
    type="button"
    onclick="Accommodation.add()">

Add Accommodation

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
    onclick="Accommodation.add()">

+ Add Accommodation

</button>

</div>

`;

    return html;
  },

  renderItem(item) {
    const amount =
      item.price && item.price.amount > 0
        ? `${item.price.currency} ${item.price.amount} / ${item.price.per || "night"}`
        : "Price not entered";

    return `

<div class="research-item${item.selected ? " is-selected" : ""}">

    <strong>

        ${item.name || "Unnamed Accommodation"}
        ${this.showAll ? `<span class="badge">${this.pretty(item.destination)}</span>` : ""}

    </strong>

    <p>

        ${item.provider || "Unknown Provider"}

    </p>

    <p>

        ${amount}${Currency.inlineConversion(item.price)}

    </p>

    <p>

        Status:
        <span class="badge badge--${String(item.status || "").toLowerCase()}">${item.status}</span>
        ${item.selected ? '<span class="badge">Selected</span>' : ""}
        ${item.addedBy ? `<span class="badge">Added by ${this.esc(item.addedBy)}</span>` : ""}

    </p>

    <div class="research-actions">

        ${
          this.showAll
            ? ""
            : `<button type="button" onclick="Accommodation.select('${item.id}')">${item.selected ? "Selected" : "Select"}</button>`
        }

        <button
            type="button"
            onclick="Accommodation.edit('${item.id}')">

            Edit

        </button>

        <button
            type="button"
            onclick="Accommodation.remove('${item.id}')">

            Delete

        </button>

    </div>

</div>

`;
  },

  renderBooking(items) {
    const booked = items.filter((item) => item.status === "Booked").length;

    const selected = items.filter((item) => item.selected).length;

    return `

<div class="manager-card">

<h2>

Booking Status

</h2>

<table>

<tr>

<td>

Research

</td>

<td>

${items.length}

</td>

</tr>

<tr>

<td>

Selected

</td>

<td>

${selected}

</td>

</tr>

<tr>

<td>

Booked

</td>

<td>

${booked}

</td>

</tr>

</table>

</div>

`;
  },

  renderNotes(items) {
    const selected = items.find((item) => item.selected);

    return `

<div class="manager-card">

<h2>

Planning Notes

</h2>

<textarea
rows="10"
readonly>

${selected ? selected.planning.notes : ""}

</textarea>

</div>

`;
  },

  add() {
    this.editingId = null;

    Render.show(Layout.render(this.renderForm(this.blankItem())));
  },

  edit(id) {
    const data = Project.get("accommodation");

    if (!data || !Array.isArray(data.items)) {
      return;
    }

    const item = data.items.find((x) => x.id === id);

    if (!item) {
      return;
    }

    this.editingId = id;

    Render.show(Layout.render(this.renderForm(item)));
  },

  select(id) {
    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/accommodation/${id}/select`, {
      method: "POST",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Select failed with status ${response.status}`);
        }

        const data = Project.get("accommodation");

        if (data && Array.isArray(data.items)) {
          data.items.forEach((item) => {
            if (item.destination === this.currentDestination || item.id === id) {
              item.selected = item.id === id;

              if (item.id === id && item.status === "Research") {
                item.status = "Selected";
              }
            }
          });
        }

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not select accommodation:", error);

        alert("Couldn't save that selection. Check the connection and try again.");
      });
  },

  refresh() {
    if (this.showAll) {
      this.openAll();
    } else if (this.currentDay) {
      this.open(this.currentDay);
    } else if (this.returnDestinationId) {
      this.openForDestination(this.returnDestinationId);
    } else {
      this.openAll();
    }
  },

  remove(id) {
    const answer = confirm("Remove this accommodation option?");

    if (!answer) {
      return;
    }

    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/accommodation/${id}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Remove failed with status ${response.status}`);
        }

        const data = Project.get("accommodation");

        if (data && Array.isArray(data.items)) {
          data.items = data.items.filter((item) => item.id !== id);
        }

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not remove accommodation:", error);

        alert("Couldn't remove that item. Check the connection and try again.");
      });
  },

  blankItem() {
    const day = this.currentDay || {};

    return {
      id: "",
      destination: this.currentDestination,
      dayRange: [day.day || 1, day.day || 1],
      type: "accommodation",
      addedBy: Project.currentUser || "",
      name: "",
      status: "Research",
      selected: false,
      locked: false,
      provider: "",
      website: "",
      bookingReference: "",
      price: { amount: 0, currency: "EUR", per: "night" },
      location: { locationId: "", address: "", latitude: null, longitude: null },
      features: {
        parking: false,
        breakfast: false,
        kitchen: false,
        washingMachine: false,
        airConditioning: false,
        wifi: false,
      },
      dates: { checkIn: "", checkOut: "", freeCancellationUntil: "" },
      planning: { priority: "High", notes: "", pros: [], cons: [] },
      actual: {
        paid: false,
        checkedIn: false,
        checkedOut: false,
        rating: null,
        review: "",
        wouldStayAgain: null,
      },
    };
  },

  renderForm(item) {
    const isNew = !item.id;

    return `

<div class="manager">

    <section class="hero">

        <h1>

            ${isNew ? "Add Accommodation" : "Edit Accommodation"}

        </h1>

        <h2>

            ${this.showAll ? "All Destinations" : this.pretty(this.currentDestination)}

        </h2>

    </section>

    <div class="manager-card form-card">

        <div class="form-grid">

            <label class="form-field">
                Destination
                <input type="text" id="acc-destination" value="${this.esc(item.destination)}" placeholder="e.g. milan">
            </label>

            <label class="form-field">
                Name
                <input type="text" id="acc-name" value="${this.esc(item.name)}" placeholder="e.g. Hotel Milano Scala">
            </label>

            <label class="form-field">
                Days (from - to)
                <input type="text" id="acc-day-range" value="${(item.dayRange || []).join(" - ")}" placeholder="e.g. 4 - 6">
            </label>

            <label class="form-field">
                Provider / Site
                <input type="text" id="acc-provider" value="${this.esc(item.provider)}" placeholder="Booking.com, Airbnb...">
            </label>

            <label class="form-field">
                Website / Link
                <input type="text" id="acc-website" value="${this.esc(item.website)}">
            </label>

            <label class="form-field">
                Booking Reference
                <input type="text" id="acc-reference" value="${this.esc(item.bookingReference)}">
            </label>

            <label class="form-field">
                Status
                <select id="acc-status">
                    ${this.statusOptions(item.status)}
                </select>
            </label>

            <label class="form-field">
                Priority
                <select id="acc-priority">
                    ${this.priorityOptions(item.planning?.priority)}
                </select>
            </label>

            <label class="form-field">
                Price Amount
                <input type="number" id="acc-price-amount" value="${item.price?.amount ?? 0}" min="0" step="0.01">
            </label>

            <label class="form-field">
                Currency
                <select id="acc-price-currency">${Currency.currencyOptions(item.price?.currency || "EUR")}</select>
            </label>

            <label class="form-field">
                Per
                <select id="acc-price-per">
                    <option value="night" ${item.price?.per === "night" ? "selected" : ""}>Night</option>
                    <option value="stay" ${item.price?.per === "stay" ? "selected" : ""}>Total Stay</option>
                </select>
            </label>

            <label class="form-field">
                Address
                <input type="text" id="acc-address" value="${this.esc(item.location?.address)}">
            </label>

            <label class="form-field">
                Check In
                <input type="date" id="acc-checkin" value="${this.esc(item.dates?.checkIn || Dates.getDayDate(item.dayRange?.[0]))}">
            </label>

            <label class="form-field">
                Check Out
                <input type="date" id="acc-checkout" value="${this.esc(item.dates?.checkOut || Dates.getDayDate(item.dayRange?.[1]))}">
            </label>

            <label class="form-field">
                Free Cancellation Until
                <input type="date" id="acc-cancellation" value="${this.esc(item.dates?.freeCancellationUntil)}">
            </label>

        </div>

        <h3>Features</h3>

        <div class="form-grid form-grid-checkboxes">

            ${this.checkbox("acc-parking", "Parking", item.features?.parking)}
            ${this.checkbox("acc-breakfast", "Breakfast", item.features?.breakfast)}
            ${this.checkbox("acc-kitchen", "Kitchen", item.features?.kitchen)}
            ${this.checkbox("acc-washing", "Washing Machine", item.features?.washingMachine)}
            ${this.checkbox("acc-aircon", "Air Conditioning", item.features?.airConditioning)}
            ${this.checkbox("acc-wifi", "Wifi", item.features?.wifi)}

        </div>

        <label class="form-field form-field-wide">
            Notes
            <textarea id="acc-notes" rows="4">${this.esc(item.planning?.notes)}</textarea>
        </label>

        <label class="form-field form-field-wide">
            Pros (one per line)
            <textarea id="acc-pros" rows="3">${(item.planning?.pros || []).join("\n")}</textarea>
        </label>

        <label class="form-field form-field-wide">
            Cons (one per line)
            <textarea id="acc-cons" rows="3">${(item.planning?.cons || []).join("\n")}</textarea>
        </label>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Accommodation.save('${item.id || ""}')">

            Save

        </button>

        <button type="button" onclick="${this.showAll ? 'Accommodation.openAll()' : this.currentDay ? 'Accommodation.open(Accommodation.currentDay)' : `Accommodation.openForDestination('${this.returnDestinationId}')`}">

            Cancel

        </button>

    </div>

</div>

`;
  },

  statusOptions(current) {
    const statuses = ["Research", "Shortlisted", "Selected", "Booked", "Travel", "Review"];

    return statuses
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

  checkbox(id, label, checked) {
    return `

<label class="form-checkbox">
    <input type="checkbox" id="${id}" ${checked ? "checked" : ""}>
    ${label}
</label>

`;
  },

  save(id) {
    const name = document.getElementById("acc-name").value.trim();

    if (!name) {
      alert("Please enter a name before saving.");
      return;
    }

    const destination = document.getElementById("acc-destination").value.trim().toLowerCase();

    if (!destination) {
      alert("Please enter a destination before saving.");
      return;
    }

    const pros = document
      .getElementById("acc-pros")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const cons = document
      .getElementById("acc-cons")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const rangeParts = document
      .getElementById("acc-day-range")
      .value.split("-")
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !isNaN(n));

    const isNew = !id;

    const existing = isNew ? this.blankItem() : null;

    const fields = {
      destination,
      type: "accommodation",
      addedBy: isNew ? Project.currentUser || "" : undefined,
      name,
      provider: document.getElementById("acc-provider").value.trim(),
      website: document.getElementById("acc-website").value.trim(),
      bookingReference: document.getElementById("acc-reference").value.trim(),
      status: document.getElementById("acc-status").value,
      selected: isNew ? false : undefined,
      locked: isNew ? false : undefined,
      price: {
        amount: parseFloat(document.getElementById("acc-price-amount").value) || 0,
        currency: document.getElementById("acc-price-currency").value.trim() || "EUR",
        per: document.getElementById("acc-price-per").value,
      },
      location: {
        locationId: "",
        address: document.getElementById("acc-address").value.trim(),
        latitude: null,
        longitude: null,
      },
      dates: {
        checkIn: document.getElementById("acc-checkin").value,
        checkOut: document.getElementById("acc-checkout").value,
        freeCancellationUntil: document.getElementById("acc-cancellation").value,
      },
      features: {
        parking: document.getElementById("acc-parking").checked,
        breakfast: document.getElementById("acc-breakfast").checked,
        kitchen: document.getElementById("acc-kitchen").checked,
        washingMachine: document.getElementById("acc-washing").checked,
        airConditioning: document.getElementById("acc-aircon").checked,
        wifi: document.getElementById("acc-wifi").checked,
      },
      planning: {
        priority: document.getElementById("acc-priority").value,
        notes: document.getElementById("acc-notes").value.trim(),
        pros,
        cons,
      },
      actual: isNew ? existing.actual : undefined,
    };

    if (rangeParts.length === 2) {
      fields.dayRange = rangeParts;
    } else if (rangeParts.length === 1) {
      fields.dayRange = [rangeParts[0], rangeParts[0]];
    } else if (isNew) {
      fields.dayRange = existing.dayRange;
    }

    // Remove undefined keys so PUT (edit) doesn't blow away fields it
    // shouldn't touch, since the server does an Object.assign merge.
    Object.keys(fields).forEach((key) => {
      if (fields[key] === undefined) {
        delete fields[key];
      }
    });

    const url = isNew
      ? `${window.API_BASE}/api/items/${Data.currentProjectFolder}/accommodation`
      : `${window.API_BASE}/api/items/${Data.currentProjectFolder}/accommodation/${id}`;

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
        const data = Project.get("accommodation");

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
        console.error("Could not save accommodation:", error);

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
