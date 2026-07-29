/*
=========================================================

COMPASS-TOS

Expenses

Version 1.0.0

Build 19

Per-day actual spending log. Distinct from Budget, which
compares planning estimates against research/booking prices.
Expenses captures real day-to-day spend (coffee, tips,
parking, incidentals) as facts, and feeds into Budget's
overall actual total.

=========================================================
*/

const Expenses = {
  currentDay: null,

  showAll: false,

  categories: ["Food", "Transport", "Shopping", "Tips", "Entry Fees", "Other"],

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
    } else {
      this.open(this.currentDay);
    }
  },

  render() {
    const items = this.getExpenses();

    const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Expenses

        </h1>

        <h2>

            ${this.showAll ? "All Days" : `Day ${this.currentDay.day} · ${this.esc(this.currentDay.title)}`}

        </h2>

        <p>

            ${items.length} expense${items.length === 1 ? "" : "s"} logged · Total ${this.money(total)}

        </p>

    </section>

    <div class="planner-buttons">

        <button
            type="button"
            onclick="Expenses.add()">

            + Log Expense

        </button>

        <button
            type="button"
            onclick="${this.backAction()}">

            ← Back

        </button>

    </div>

    <div class="manager-grid">

        ${this.renderList(items)}

        ${this.renderByCategory(items)}

    </div>

</div>

`;
  },

  getExpenses() {
    const data = Project.get("expenses");

    if (!data || !Array.isArray(data.items)) {
      return [];
    }

    if (this.showAll) {
      return data.items;
    }

    return data.items.filter((item) => item.day === this.currentDay.day);
  },

  renderList(items) {
    if (items.length === 0) {
      return `

<div class="manager-card">

<h2>

Logged Expenses

</h2>

<p>

No expenses logged yet.

</p>

</div>

`;
    }

    let html = `

<div class="manager-card">

<h2>

Logged Expenses

</h2>

<div class="research-list">

`;

    items.forEach((item) => {
      html += `

<div class="research-item">

    <strong>

        ${this.esc(item.description) || "Untitled"}
        ${this.showAll ? `<span class="badge">Day ${item.day}</span>` : ""}

    </strong>

    <p>

        ${item.category || "Other"} · ${this.money(item.amount, item.currency)}

    </p>

    <p>

        ${this.esc(item.date)}
        ${item.addedBy ? `· <span class="badge">Logged by ${this.esc(item.addedBy)}</span>` : ""}

    </p>

    <div class="research-actions">

        <button type="button" onclick="Expenses.edit('${item.id}')">

            Edit

        </button>

        <button type="button" onclick="Expenses.remove('${item.id}')">

            Delete

        </button>

    </div>

</div>

`;
    });

    html += `

</div>

</div>

`;

    return html;
  },

  renderByCategory(items) {
    const totals = {};

    this.categories.forEach((c) => {
      totals[c] = 0;
    });

    items.forEach((item) => {
      const cat = this.categories.includes(item.category) ? item.category : "Other";

      totals[cat] += item.amount || 0;
    });

    let rows = "";

    this.categories.forEach((c) => {
      rows += `

<tr>

<td>${c}</td>

<td>${this.money(totals[c])}</td>

</tr>

`;
    });

    return `

<div class="manager-card">

<h2>

By Category

</h2>

<table>

${rows}

</table>

</div>

`;
  },

  add() {
    Render.show(Layout.render(this.renderForm(this.blankItem())));
  },

  edit(id) {
    const data = Project.get("expenses");

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
    const answer = confirm("Remove this expense?");

    if (!answer) {
      return;
    }

    const data = Project.get("expenses");

    if (!data || !Array.isArray(data.items)) {
      return;
    }

    data.items = data.items.filter((item) => item.id !== id);

    Project.update("expenses", data);

    this.refresh();
  },

  blankItem() {
    const day = this.currentDay || {};

    return {
      id: "",
      day: day.day || 1,
      addedBy: Project.currentUser || "",
      category: "Food",
      description: "",
      amount: 0,
      currency: "EUR",
      date: day.date || "",
      notes: "",
    };
  },

  renderForm(item) {
    const isNew = !item.id;

    return `

<div class="manager">

    <section class="hero">

        <h1>

            ${isNew ? "Log Expense" : "Edit Expense"}

        </h1>

        <h2>

            ${this.showAll ? "All Days" : `Day ${this.currentDay.day}`}

        </h2>

    </section>

    <div class="manager-card form-card">

        <div class="form-grid">

            <label class="form-field">
                Day Number
                <input type="number" id="exp-day" value="${item.day || (this.currentDay ? this.currentDay.day : 1)}" min="1">
            </label>

            <label class="form-field">
                Category
                <select id="exp-category">
                    ${this.categoryOptions(item.category)}
                </select>
            </label>

            <label class="form-field">
                Description
                <input type="text" id="exp-description" value="${this.esc(item.description)}" placeholder="e.g. Coffee at Navigli">
            </label>

            <label class="form-field">
                Amount
                <input type="number" id="exp-amount" value="${item.amount ?? 0}" min="0" step="0.01">
            </label>

            <label class="form-field">
                Currency
                <input type="text" id="exp-currency" value="${this.esc(item.currency || "EUR")}" maxlength="3">
            </label>

            <label class="form-field">
                Date
                <input type="date" id="exp-date" value="${this.esc(item.date)}">
            </label>

        </div>

        <label class="form-field form-field-wide">
            Notes
            <textarea id="exp-notes" rows="3">${this.esc(item.notes)}</textarea>
        </label>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Expenses.save('${item.id || ""}')">

            Save

        </button>

        <button type="button" onclick="${this.showAll ? 'Expenses.openAll()' : 'Expenses.open(Expenses.currentDay)'}">

            Cancel

        </button>

    </div>

</div>

`;
  },

  categoryOptions(current) {
    return this.categories
      .map((c) => `<option value="${c}" ${c === current ? "selected" : ""}>${c}</option>`)
      .join("");
  },

  save(id) {
    const data = Project.get("expenses");

    if (!data || !Array.isArray(data.items)) {
      return;
    }

    const description = document.getElementById("exp-description").value.trim();

    if (!description) {
      alert("Please enter a description before saving.");
      return;
    }

    const dayNumber = parseInt(document.getElementById("exp-day").value, 10);

    if (!dayNumber || dayNumber < 1) {
      alert("Please enter a valid day number before saving.");
      return;
    }

    const isNew = !id;

    const item = isNew ? this.blankItem() : data.items.find((x) => x.id === id);

    if (!item) {
      return;
    }

    if (isNew) {
      item.id = this.nextId(data.items);
    }

    item.day = dayNumber;
    item.category = document.getElementById("exp-category").value;
    item.description = description;
    item.amount = parseFloat(document.getElementById("exp-amount").value) || 0;
    item.currency = document.getElementById("exp-currency").value.trim() || "EUR";
    item.date = document.getElementById("exp-date").value;
    item.notes = document.getElementById("exp-notes").value.trim();

    if (isNew) {
      data.items.push(item);
    }

    Project.update("expenses", data);

    this.refresh();
  },

  nextId(items) {
    let max = 0;

    items.forEach((item) => {
      const match = /EXP-(\d+)/.exec(item.id || "");

      if (match) {
        max = Math.max(max, parseInt(match[1], 10));
      }
    });

    const next = String(max + 1).padStart(4, "0");

    return `EXP-${next}`;
  },

  money(amount, currency) {
    const value = Number(amount) || 0;

    return `${currency || "EUR"} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  },

  esc(value) {
    return String(value ?? "").replace(/"/g, "&quot;");
  },
};
