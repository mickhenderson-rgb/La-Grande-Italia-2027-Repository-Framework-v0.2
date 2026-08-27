/*
=========================================================

COMPASS-TOS

Activities Manager

Version 1.0.0

Build 11

=========================================================
*/

const Activities = {
  currentDay: null,

  currentDestination: "",

  returnDestinationId: null,

  saving: false,

  workflow: ["Research", "Shortlisted", "Selected", "Booked", "Travel", "Review"],

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

  // See Accommodation.refreshAfterSave for why this exists: a day-scoped
  // view filters by day.location/overnight, which is blank on every new
  // trip by default - a plain refresh() after saving a NEW destination
  // would silently filter the just-saved item out of view.
  refreshAfterSave(item) {
    if (this.currentDay && item && item.destination && item.destination.toLowerCase() !== this.currentDestination) {
      this.openForDestination(item.destination);

      return;
    }

    this.refresh();
  },

  render() {
    const items = this.getActivities();

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Activities Research

        </h1>

        <h2>

            ${this.pretty(this.currentDestination)}

        </h2>

        <p>

            ${items.length} activit${items.length === 1 ? "y" : "ies"}

        </p>

    </section>

    <div class="planner-buttons">

        <button
            type="button"
            onclick="Activities.add()">

            + Add Activity

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

  getActivities() {
    const data = Project.get("activities");

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

Booked Activities

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

Booked Activities

</h2>

<div class="research-list">

`;

    booked.forEach((item) => {
      html += `

<div class="research-item is-selected">

    <strong>${item.name || "Unnamed Activity"}</strong>

    <p>${item.category || ""}</p>

    <p>${this.esc(item.schedule?.date)} ${this.esc(item.schedule?.time)}</p>

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

        <span class="empty-icon" aria-hidden="true">🎭</span>

        <p>No activities here yet.</p>

        <button type="button" class="btn-primary" onclick="Activities.add()">Add activity</button>

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
    onclick="Activities.add()">

+ Add Activity

</button>

</div>

`;

    return html;
  },

  renderItem(item) {
    const amount =
      item.price && item.price.amount > 0
        ? `${item.price.currency} ${item.price.amount} / ${item.price.per || "person"}`
        : "Price not entered";

    const nextStage = this.nextStage(item.status);

    return `

<div class="research-item">

    <strong>

        ${item.name || "Unnamed Activity"}

    </strong>

    <p>

        ${item.category || "Uncategorised"} · ${item.provider || "Unknown Provider"}

    </p>

    <p>

        ${amount}${Currency.inlineConversion(item.price)}

    </p>

    <p>

        Status:
        <span class="badge badge--${String(item.status || "").toLowerCase()}">${item.status}</span>
        ${item.addedBy ? `<span class="badge">Added by ${this.esc(item.addedBy)}</span>` : ""}

    </p>

    <div class="research-actions">

        ${
          nextStage
            ? `<button type="button" onclick="Activities.advance('${item.id}')">Mark ${nextStage}</button>`
            : ""
        }

        ${MapLinks.renderButtons(item)}

        <button
            type="button"
            onclick="Activities.edit('${item.id}')">

            Edit

        </button>

        <button
            type="button"
            onclick="Activities.remove('${item.id}')">

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
    const data = Project.get("activities");

    const item = data && Array.isArray(data.items) ? data.items.find((x) => x.id === id) : null;

    if (!item) {
      return;
    }

    const next = this.nextStage(item.status);

    if (!next) {
      return;
    }

    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/activities/${id}`, {
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
        console.error("Could not advance activity status:", error);

        alert("Couldn't save that change. Check the connection and try again.");
      });
  },

  add() {
    Render.show(Layout.render(this.renderForm(this.blankItem())));
  },

  edit(id) {
    const data = Project.get("activities");

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
    const answer = confirm("Remove this activity?");

    if (!answer) {
      return;
    }

    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/activities/${id}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Remove failed with status ${response.status}`);
        }

        const data = Project.get("activities");

        if (data && Array.isArray(data.items)) {
          data.items = data.items.filter((item) => item.id !== id);
        }

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not remove activity:", error);

        alert("Couldn't remove that item. Check the connection and try again.");
      });
  },

  blankItem() {
    const day = this.currentDay || {};

    return {
      id: "",
      destination: this.currentDestination,
      dayRange: [day.day || 1, day.day || 1],
      type: "activity",
      addedBy: Project.currentUser || "",
      name: "",
      category: "",
      status: "Research",
      locked: false,
      provider: "",
      website: "",
      bookingReference: "",
      price: { amount: 0, currency: "EUR", per: "person" },
      location: { locationId: "", address: "", latitude: null, longitude: null },
      schedule: { date: "", time: "", durationMinutes: 0 },
      planning: { priority: "High", notes: "", pros: [], cons: [] },
      actual: { paid: false, attended: false, rating: null, review: "" },
    };
  },

  renderForm(item) {
    const isNew = !item.id;

    return `

<div class="manager">

    <section class="hero">

        <h1>

            ${isNew ? "Add Activity" : "Edit Activity"}

        </h1>

        <h2>

            ${this.pretty(this.currentDestination)}

        </h2>

    </section>

    <div class="manager-card form-card" data-guard="activities:${item.id || 'new'}">

        ${DayReference.render("Activities", "single", { single: "Use This Day" })}

        <div class="form-grid">

            <label class="form-field">
                Day
                <input type="number" id="act-day" value="${(item.dayRange && item.dayRange[0]) || (this.currentDay ? this.currentDay.day : 1)}" min="1">
            </label>

            <label class="form-field">
                Name
                <input type="text" id="act-name" value="${this.esc(item.name)}" placeholder="e.g. Duomo Rooftop Tour">
            </label>

            <label class="form-field">
                Category
                <input type="text" id="act-category" value="${this.esc(item.category)}" placeholder="Museum, Tour, Outdoor...">
            </label>

            <label class="form-field">
                Provider / Site
                <input type="text" id="act-provider" value="${this.esc(item.provider)}">
            </label>

            <label class="form-field">
                Website / Link
                <input type="text" id="act-website" value="${this.esc(item.website)}">
            </label>

            <label class="form-field">
                Booking Reference
                <input type="text" id="act-reference" value="${this.esc(item.bookingReference)}">
            </label>

            <label class="form-field">
                Status
                <select id="act-status">
                    ${this.statusOptions(item.status)}
                </select>
            </label>

            <label class="form-field">
                Priority
                <select id="act-priority">
                    ${this.priorityOptions(item.planning?.priority)}
                </select>
            </label>

            <label class="form-field">
                Price Amount
                <input type="number" id="act-price-amount" value="${item.price?.amount ?? 0}" min="0" step="0.01">
            </label>

            <label class="form-field">
                Currency
                <select id="act-price-currency">${Currency.currencyOptions(item.price?.currency || "EUR")}</select>
            </label>

            <label class="form-field">
                Per
                <select id="act-price-per">
                    <option value="person" ${item.price?.per === "person" ? "selected" : ""}>Person</option>
                    <option value="group" ${item.price?.per === "group" ? "selected" : ""}>Group</option>
                </select>
            </label>

            <label class="form-field">
                Address
                <input type="text" id="act-address" value="${this.esc(item.location?.address)}">
            </label>

            <label class="form-field">
                Date
                <input type="date" id="act-date" value="${this.esc(item.schedule?.date || Dates.getDayDate(item.dayRange?.[0]))}">
            </label>

            <label class="form-field">
                Time
                <input type="time" id="act-time" value="${this.esc(item.schedule?.time)}">
            </label>

            <label class="form-field">
                Duration (minutes)
                <input type="number" id="act-duration" value="${item.schedule?.durationMinutes ?? 0}" min="0" step="5">
            </label>

        </div>

        <label class="form-field form-field-wide">
            Notes
            <textarea id="act-notes" rows="4">${this.esc(item.planning?.notes)}</textarea>
        </label>

        <label class="form-field form-field-wide">
            Pros (one per line)
            <textarea id="act-pros" rows="3">${(item.planning?.pros || []).join("\n")}</textarea>
        </label>

        <label class="form-field form-field-wide">
            Cons (one per line)
            <textarea id="act-cons" rows="3">${(item.planning?.cons || []).join("\n")}</textarea>
        </label>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Activities.save('${item.id || ""}')">

            Save

        </button>

        <button type="button" onclick="${this.backAction()}">

            Cancel

        </button>

        ${!isNew ? `<button type="button" class="btn-danger" onclick="Activities.remove('${item.id}')">Delete</button>` : ""}

    </div>

</div>

`;
  },

  // Sets the Day field + the Date; Time/Duration are left untouched.
  pickDay(dayNumber) {
    document.getElementById("act-day").value = dayNumber;

    const date = Dates.getDayDate(dayNumber);

    if (date) {
      document.getElementById("act-date").value = date;
    }
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
    const name = document.getElementById("act-name").value.trim();

    if (!name) {
      alert("Please enter a name before saving.");
      return;
    }

    const pros = document
      .getElementById("act-pros")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const cons = document
      .getElementById("act-cons")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const dayNumber = parseInt(document.getElementById("act-day").value, 10);

    if (!dayNumber || dayNumber < 1) {
      alert("Please enter a valid Day before saving.");
      return;
    }

    const isNew = !id;

    const fields = {
      destination: isNew ? this.currentDestination : undefined,
      dayRange: [dayNumber, dayNumber],
      type: "activity",
      addedBy: isNew ? Project.currentUser || "" : undefined,
      name,
      category: document.getElementById("act-category").value.trim(),
      provider: document.getElementById("act-provider").value.trim(),
      website: document.getElementById("act-website").value.trim(),
      bookingReference: document.getElementById("act-reference").value.trim(),
      status: document.getElementById("act-status").value,
      locked: isNew ? false : undefined,
      price: {
        amount: parseFloat(document.getElementById("act-price-amount").value) || 0,
        currency: document.getElementById("act-price-currency").value.trim() || "EUR",
        per: document.getElementById("act-price-per").value,
      },
      location: {
        locationId: "",
        address: document.getElementById("act-address").value.trim(),
        latitude: null,
        longitude: null,
      },
      schedule: {
        date: document.getElementById("act-date").value,
        time: document.getElementById("act-time").value,
        durationMinutes: parseInt(document.getElementById("act-duration").value, 10) || 0,
      },
      planning: {
        priority: document.getElementById("act-priority").value,
        notes: document.getElementById("act-notes").value.trim(),
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

    if (this.saving) {
      return;
    }

    this.saving = true;

    // These changes are on their way to the server, so navigating away
    // from the form once it succeeds must not ask about them. Guarded so a
    // deployment that somehow lacks form-guard.js still saves.
    if (typeof FormGuard !== "undefined") {
      FormGuard.release();
    }

    const url = isNew
      ? `${window.API_BASE}/api/items/${Data.currentProjectFolder}/activities`
      : `${window.API_BASE}/api/items/${Data.currentProjectFolder}/activities/${id}`;

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
        const data = Project.get("activities");

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

        this.refreshAfterSave(result.item);
      })
      .catch((error) => {
        this.saving = false;

        console.error("Could not save activity:", error);

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
