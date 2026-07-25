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

  workflow: ["Research", "Shortlisted", "Selected", "Booked", "Travel", "Review"],

  modes: ["Drive", "Train", "Ferry", "Flight", "Transfer", "Car Rental", "Other"],

  open(day) {
    this.currentDay = day;

    Render.show(Layout.render(this.render()));
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

            Day ${this.currentDay.day} · ${this.esc(this.currentDay.title)}

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
            onclick="Day.open(Transport.currentDay.day)">

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

  getTransport() {
    const data = Project.get("transport");

    if (!data || !Array.isArray(data.items)) {
      return [];
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

    this.open(this.currentDay);
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

    this.open(this.currentDay);
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
      provider: "",
      website: "",
      bookingReference: "",
      price: { amount: 0, currency: "EUR" },
      schedule: { date: day.date || "", departTime: "", arriveTime: "" },
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

            Day ${this.currentDay.day}

        </h2>

    </section>

    <div class="manager-card form-card">

        <div class="form-grid">

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

        <button type="button" onclick="Transport.open(Transport.currentDay)">

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

    if (isNew) {
      item.id = this.nextId(data.items);
      item.day = this.currentDay.day;
    }

    item.mode = document.getElementById("trn-mode").value;
    item.from = from;
    item.to = to;
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

    item.planning = {
      priority: document.getElementById("trn-priority").value,
      notes: document.getElementById("trn-notes").value.trim(),
    };

    if (isNew) {
      data.items.push(item);
    }

    Project.update("transport", data);

    this.open(this.currentDay);
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

  esc(value) {
    return String(value ?? "").replace(/"/g, "&quot;");
  },
};
