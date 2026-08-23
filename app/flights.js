/*
=========================================================

COMPASS-TOS

Flights Manager

Version 2.0.0

Build 38

Full research workflow (Research -> Shortlisted -> Selected
-> Booked -> Travel -> Review), matching Accommodation and
Activities. Flights are day-keyed (which day of the trip
this flight departs) rather than tied to a destination.
Arrival date is a fact, not a calculation, since it can
land on a different calendar day - Dates.js reads this
collection directly to recalculate the rest of the journey.

=========================================================
*/

const Flights = {
  currentDay: null,

  showAll: false,

  workflow: ["Research", "Shortlisted", "Selected", "Booked", "Travel", "Review"],

  open(day) {
    this.currentDay = day;

    this.showAll = false;

    Render.show(Layout.render(this.render()));
  },

  openAll() {
    this.currentDay = null;

    this.showAll = true;

    Render.show(Layout.render(this.render()));
  },

  backAction() {
    return this.currentDay ? `Day.open(${this.currentDay.day})` : `Router.navigate('dashboard')`;
  },

  refresh() {
    if (this.showAll) {
      this.openAll();
    } else if (this.currentDay) {
      this.open(this.currentDay);
    } else {
      this.openAll();
    }
  },

  render() {
    const items = this.getFlights();

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Flights

        </h1>

        <h2>

            ${this.showAll ? "All Days" : `Day ${this.currentDay.day} · ${this.esc(this.currentDay.title)}`}

        </h2>

        <p>

            ${items.length} flight${items.length === 1 ? "" : "s"}

        </p>

    </section>

    <div class="planner-buttons">

        <button type="button" onclick="Flights.add()">

            + Add Flight

        </button>

        <button type="button" onclick="${this.backAction()}">

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

  getFlights() {
    const data = Project.get("flights");

    if (!data || !Array.isArray(data.items)) {
      return [];
    }

    if (this.showAll) {
      return data.items;
    }

    return data.items.filter((item) => item.day === this.currentDay.day);
  },

  renderBooked(items) {
    const booked = items.filter((item) => item.status === "Booked" || item.status === "Travel");

    if (booked.length === 0) {
      return `

<div class="manager-card">

<h2>Booked Flights</h2>

<p>Nothing booked yet.</p>

</div>

`;
    }

    let html = `

<div class="manager-card">

<h2>Booked Flights</h2>

<div class="research-list">

`;

    booked.forEach((item) => {
      html += `

<div class="research-item is-selected">

    <strong>${this.esc(item.airline) || "Unnamed Flight"} ${this.esc(item.flightNumber)}</strong>
    ${this.showAll ? `<span class="badge">Day ${item.day}</span>` : ""}

    <p>${this.esc(item.from)} → ${this.esc(item.to)}</p>

    <p>${this.esc(item.departure?.date)} ${this.esc(item.departure?.time)}</p>

</div>

`;
    });

    html += `</div></div>`;

    return html;
  },

  renderResearch(items) {
    if (items.length === 0) {
      return `

<div class="manager-card">

    <div class="empty-state">

        <span class="empty-icon" aria-hidden="true">✈</span>

        <p>No flights here yet.</p>

        <button type="button" class="btn-primary" onclick="Flights.add()">Add flight</button>

    </div>

</div>

`;
    }

    let html = `

<div class="manager-card">

<h2>Research List</h2>

<div class="research-list">

`;

    items.forEach((item) => {
      html += this.renderItem(item);
    });

    html += `

</div>

<button type="button" onclick="Flights.add()">+ Add Flight</button>

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

    const arrivalCrosses =
      item.departure?.date && item.arrival?.date && item.departure.date !== item.arrival.date;

    return `

<div class="research-item">

    <strong>

        ${this.esc(item.airline) || "Unknown Airline"} ${this.esc(item.flightNumber)}
        ${this.showAll ? `<span class="badge">Day ${item.day}</span>` : ""}
        ${!item.arrival?.date ? `<span class="badge">⚠ Arrival Not Set</span>` : ""}

    </strong>

    <p>

        ${this.esc(item.from)} → ${this.esc(item.to)}

    </p>

    <p>

        ${amount}${Currency.inlineConversion(item.price)}

    </p>

    <p>

        Depart ${this.esc(item.departure?.date)} ${this.esc(item.departure?.time)}
        · Arrive ${arrivalCrosses ? this.esc(item.arrival.date) + " " : ""}${this.esc(item.arrival?.time)}

    </p>

    <p>

        Status:
        <span class="badge badge--${String(item.status || "").toLowerCase()}">${item.status}</span>
        ${item.addedBy ? `<span class="badge">Added by ${this.esc(item.addedBy)}</span>` : ""}

    </p>

    <div class="research-actions">

        ${
          nextStage
            ? `<button type="button" onclick="Flights.advance('${item.id}')">Mark ${nextStage}</button>`
            : ""
        }

        <button type="button" onclick="Flights.edit('${item.id}')">Edit</button>

        <button type="button" onclick="Flights.remove('${item.id}')">Delete</button>

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
      rows += `<tr><td>${stage}</td><td>${counts[stage]}</td></tr>`;
    });

    return `

<div class="manager-card">

<h2>Booking Status</h2>

<table>${rows}</table>

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
    const data = Project.get("flights");

    const item = data && Array.isArray(data.items) ? data.items.find((x) => x.id === id) : null;

    if (!item) {
      return;
    }

    const next = this.nextStage(item.status);

    if (!next) {
      return;
    }

    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/flights/${id}`, {
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
        console.error("Could not advance flight status:", error);

        alert("Couldn't save that change. Check the connection and try again.");
      });
  },

  add() {
    Render.show(Layout.render(this.renderForm(this.blankItem())));
  },

  edit(id) {
    const data = Project.get("flights");

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
    const answer = confirm("Remove this flight?");

    if (!answer) {
      return;
    }

    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/flights/${id}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Remove failed with status ${response.status}`);
        }

        const data = Project.get("flights");

        if (data && Array.isArray(data.items)) {
          data.items = data.items.filter((item) => item.id !== id);
        }

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not remove flight:", error);

        alert("Couldn't remove that item. Check the connection and try again.");
      });
  },

  blankItem() {
    const day = this.currentDay || {};

    return {
      id: "",
      day: day.day || 1,
      type: "flight",
      airline: "",
      flightNumber: "",
      from: "",
      to: "",
      status: "Research",
      locked: false,
      price: { amount: 0, currency: "USD" },
      website: "",
      bookingReference: "",
      departure: { date: day.date || "", time: "", location: "" },
      arrival: { date: "", time: "", location: "" },
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

            ${isNew ? "Add Flight" : "Edit Flight"}

        </h1>

        <h2>

            ${this.showAll ? "All Days" : this.currentDay ? `Day ${this.currentDay.day}` : ""}

        </h2>

    </section>

    <div class="manager-card form-card">

        ${DayReference.render("Flights", "single", { single: "Depart This Day" })}

        <div class="form-grid">

            <label class="form-field">
                Day Number
                <input type="number" id="flt-day" value="${item.day || (this.currentDay ? this.currentDay.day : 1)}" min="1">
            </label>

            <label class="form-field">
                Airline
                <input type="text" id="flt-airline" value="${this.esc(item.airline)}" placeholder="e.g. Qantas">
            </label>

            <label class="form-field">
                Flight Number
                <input type="text" id="flt-number" value="${this.esc(item.flightNumber)}" placeholder="e.g. QF1">
            </label>

            <label class="form-field">
                From
                <input type="text" id="flt-from" value="${this.esc(item.from)}" placeholder="e.g. Sydney Airport">
            </label>

            <label class="form-field">
                To
                <input type="text" id="flt-to" value="${this.esc(item.to)}" placeholder="e.g. Milan Malpensa Airport">
            </label>

            <label class="form-field">
                Website / Link
                <input type="text" id="flt-website" value="${this.esc(item.website)}">
            </label>

            <label class="form-field">
                Booking Reference
                <input type="text" id="flt-reference" value="${this.esc(item.bookingReference)}">
            </label>

            <label class="form-field">
                Status
                <select id="flt-status">
                    ${this.statusOptions(item.status)}
                </select>
            </label>

            <label class="form-field">
                Priority
                <select id="flt-priority">
                    ${this.priorityOptions(item.planning?.priority)}
                </select>
            </label>

            <label class="form-field">
                Price Amount
                <input type="number" id="flt-price-amount" value="${item.price?.amount ?? 0}" min="0" step="0.01">
            </label>

            <label class="form-field">
                Currency
                <select id="flt-price-currency">${Currency.currencyOptions(item.price?.currency || "USD")}</select>
            </label>

            <label class="form-field">
                Departure Date
                <input type="date" id="flt-dep-date" value="${this.esc(item.departure?.date || Dates.getDayDate(item.day))}">
            </label>

            <label class="form-field">
                Departure Time
                <input type="time" id="flt-dep-time" value="${this.esc(item.departure?.time)}">
            </label>

            <label class="form-field">
                Departure Location
                <input type="text" id="flt-dep-loc" value="${this.esc(item.departure?.location)}">
            </label>

            <label class="form-field">
                Arrival Date
                <input type="date" id="flt-arr-date" value="${this.esc(item.arrival?.date || Dates.getDayDate(item.day))}">
                <span class="form-hint">Can be a different day - this is what keeps later days in sync</span>
            </label>

            <label class="form-field">
                Arrival Time
                <input type="time" id="flt-arr-time" value="${this.esc(item.arrival?.time)}">
            </label>

            <label class="form-field">
                Arrival Location
                <input type="text" id="flt-arr-loc" value="${this.esc(item.arrival?.location)}">
            </label>

        </div>

        <label class="form-field form-field-wide">
            Notes
            <textarea id="flt-notes" rows="4">${this.esc(item.planning?.notes)}</textarea>
        </label>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Flights.save('${item.id || ""}')">

            Save

        </button>

        <button type="button" onclick="${this.backAction()}">

            Cancel

        </button>

        ${!isNew ? `<button type="button" class="btn-danger" onclick="Flights.remove('${item.id}')">Delete</button>` : ""}

    </div>

</div>

`;
  },

  // Sets the Day Number + Departure Date; Arrival Date is left alone since
  // it can legitimately land on a different real day (overnight flights).
  pickDay(dayNumber) {
    document.getElementById("flt-day").value = dayNumber;

    const date = Dates.getDayDate(dayNumber);

    if (date) {
      document.getElementById("flt-dep-date").value = date;
    }
  },

  statusOptions(current) {
    return this.workflow
      .map((s) => `<option value="${s}" ${s === current ? "selected" : ""}>${s}</option>`)
      .join("");
  },

  priorityOptions(current) {
    const priorities = ["High", "Medium", "Low"];

    return priorities
      .map((p) => `<option value="${p}" ${p === current ? "selected" : ""}>${p}</option>`)
      .join("");
  },

  save(id) {
    const from = document.getElementById("flt-from").value.trim();

    const to = document.getElementById("flt-to").value.trim();

    if (!from || !to) {
      alert("Please enter both From and To before saving.");
      return;
    }

    const dayNumber = parseInt(document.getElementById("flt-day").value, 10);

    if (!dayNumber || dayNumber < 1) {
      alert("Please enter a valid day number before saving.");
      return;
    }

    const isNew = !id;

    const fields = {
      day: dayNumber,
      type: "flight",
      addedBy: isNew ? Project.currentUser || "" : undefined,
      airline: document.getElementById("flt-airline").value.trim(),
      flightNumber: document.getElementById("flt-number").value.trim(),
      from,
      to,
      website: document.getElementById("flt-website").value.trim(),
      bookingReference: document.getElementById("flt-reference").value.trim(),
      status: document.getElementById("flt-status").value,
      locked: isNew ? false : undefined,
      price: {
        amount: parseFloat(document.getElementById("flt-price-amount").value) || 0,
        currency: document.getElementById("flt-price-currency").value.trim() || "USD",
      },
      departure: {
        date: document.getElementById("flt-dep-date").value,
        time: document.getElementById("flt-dep-time").value,
        location: document.getElementById("flt-dep-loc").value.trim(),
      },
      arrival: {
        date: document.getElementById("flt-arr-date").value,
        time: document.getElementById("flt-arr-time").value,
        location: document.getElementById("flt-arr-loc").value.trim(),
      },
      planning: {
        priority: document.getElementById("flt-priority").value,
        notes: document.getElementById("flt-notes").value.trim(),
      },
      actual: isNew ? { paid: false, completed: false } : undefined,
    };

    Object.keys(fields).forEach((key) => {
      if (fields[key] === undefined) {
        delete fields[key];
      }
    });

    const url = isNew
      ? `${window.API_BASE}/api/items/${Data.currentProjectFolder}/flights`
      : `${window.API_BASE}/api/items/${Data.currentProjectFolder}/flights/${id}`;

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
        const data = Project.get("flights");

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

        Dates.recalculateJourney();

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not save flight:", error);

        alert("Couldn't save that item. Check the connection and try again.");
      });
  },

  esc(value) {
    return String(value ?? "").replace(/"/g, "&quot;");
  },
};
