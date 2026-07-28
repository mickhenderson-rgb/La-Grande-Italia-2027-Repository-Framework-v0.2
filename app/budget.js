/*
=========================================================

COMPASS-TOS

Budget

Version 1.0.0

Build 15

Compares planning estimates (facts, stored in budget.json)
against actual spend calculated live from every category's
research items. Nothing calculated is stored back to JSON.

=========================================================
*/

const Budget = {
  transportModeMap: {
    "Car Rental": "car_hire",
    Train: "train",
    Ferry: "ferry",
    Drive: "fuel_tolls_parking",
  },

  open() {
    Render.show(Layout.render(this.render()));
  },

  render() {
    const budget = Project.get("budget");

    if (!budget) {
      return `<div class="manager"><section class="hero"><h1>Budget</h1><p>No budget data found.</p></section></div>`;
    }

    const actual = this.calculateActual();

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Budget

        </h1>

        <p>

            Estimate ${this.money(budget.estimate_low, budget.currency)} – ${this.money(budget.estimate_high, budget.currency)}
            · Actual so far ${this.money(actual.total, budget.currency)}

        </p>

    </section>

    <div class="manager-grid">

        ${this.renderCategory("Accommodation", budget.categories.accommodation, actual.accommodation, budget.currency)}

        ${this.renderCategory("Transport", this.sumSubcategories(budget.categories.transport), actual.transport, budget.currency)}

        ${this.renderCategory("Food", budget.categories.food, actual.food, budget.currency)}

        ${this.renderCategory("Activities", budget.categories.activities, actual.activities, budget.currency)}

        ${this.renderCategory("Contingency", budget.categories.contingency, 0, budget.currency)}

        ${this.renderTransportBreakdown(budget.categories.transport, actual.transportByMode, budget.currency)}

        ${this.renderExpensesCard(actual.expenses, budget.currency)}

        ${this.renderNotes(budget.notes)}

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Budget.edit()">

            Edit Estimate

        </button>

        <button type="button" onclick="Router.navigate('dashboard')">

            ← Dashboard

        </button>

    </div>

</div>

`;
  },

  sumSubcategories(category) {
    let low = 0;

    let high = 0;

    Object.values(category).forEach((sub) => {
      low += sub.low || 0;

      high += sub.high || 0;
    });

    return { low, high };
  },

  calculateActual() {
    const accommodation = this.sumPrices(Project.get("accommodation"));

    const activities = this.sumPrices(Project.get("activities"));

    const food = this.sumPrices(Project.get("restaurants"));

    const transportItems = this.getItems(Project.get("transport"));

    let transport = 0;

    const transportByMode = {};

    transportItems.forEach((item) => {
      const amount = item.price?.amount || 0;

      transport += amount;

      const bucket = this.transportModeMap[item.mode] || "other";

      transportByMode[bucket] = (transportByMode[bucket] || 0) + amount;
    });

    const expenses = this.getItems(Project.get("expenses")).reduce(
      (sum, item) => sum + (item.amount || 0),
      0,
    );

    return {
      accommodation,
      activities,
      food,
      transport,
      transportByMode,
      expenses,
      total: accommodation + activities + food + transport + expenses,
    };
  },

  getItems(data) {
    return data && Array.isArray(data.items) ? data.items : [];
  },

  sumPrices(data) {
    return this.getItems(data).reduce((sum, item) => sum + (item.price?.amount || 0), 0);
  },

  renderCategory(title, estimate, actualAmount, currency) {
    const low = estimate.low || 0;

    const high = estimate.high || 0;

    const status = actualAmount > high ? "Over Estimate" : actualAmount >= low ? "Within Range" : "Under Estimate";

    return `

<div class="manager-card">

<h2>

${title}

</h2>

<table>

<tr>

<td>Estimate</td>

<td>${this.money(low, currency)} – ${this.money(high, currency)}</td>

</tr>

<tr>

<td>Actual</td>

<td>${this.money(actualAmount, currency)}</td>

</tr>

<tr>

<td>Status</td>

<td><span class="badge">${status}</span></td>

</tr>

</table>

</div>

`;
  },

  renderTransportBreakdown(transportCategory, actualByMode, currency) {
    let rows = "";

    Object.entries(transportCategory).forEach(([key, estimate]) => {
      const actual = actualByMode[key] || 0;

      rows += `

<tr>

<td>${this.pretty(key)}</td>

<td>${this.money(estimate.low, currency)} – ${this.money(estimate.high, currency)}</td>

<td>${this.money(actual, currency)}</td>

</tr>

`;
    });

    return `

<div class="manager-card">

<h2>

Transport Breakdown

</h2>

<table>

<tr>

<th>Type</th>

<th>Estimate</th>

<th>Actual</th>

</tr>

${rows}

</table>

</div>

`;
  },

  renderExpensesCard(expensesTotal, currency) {
    return `

<div class="manager-card">

<h2>

Logged Expenses

</h2>

<p>

Day-to-day incidental spending (coffee, tips, parking, etc.), logged per day.

</p>

<table>

<tr>

<td>Total Logged</td>

<td>${this.money(expensesTotal, currency)}</td>

</tr>

</table>

<button type="button" onclick="Expenses.openAll()">

View All Expenses

</button>

</div>

`;
  },

  renderNotes(notes) {
    if (!Array.isArray(notes) || notes.length === 0) {
      return "";
    }

    let items = "";

    notes.forEach((note) => {
      items += `<li>${this.esc(note)}</li>`;
    });

    return `

<div class="manager-card">

<h2>

Budget Notes

</h2>

<ul>

${items}

</ul>

</div>

`;
  },

  money(amount, currency) {
    const value = Number(amount) || 0;

    return `${currency || "EUR"} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  },

  pretty(value) {
    return String(value || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  },

  esc(value) {
    return String(value ?? "").replace(/"/g, "&quot;");
  },

  edit() {
    const budget = Project.get("budget");

    if (!budget) {
      return;
    }

    Render.show(Layout.render(this.renderForm(budget)));
  },

  renderForm(budget) {
    return `

<div class="manager">

    <section class="hero">

        <h1>

            Edit Budget Estimate

        </h1>

        <p>

            These are planning estimates only \u2014 actuals are calculated live from
            Accommodation, Activities, Transport, Restaurants and Expenses.

        </p>

    </section>

    <div class="manager-card form-card">

        <div class="form-grid">

            <label class="form-field">
                Currency
                <input type="text" id="bgt-currency" value="${this.esc(budget.currency)}" maxlength="3">
            </label>

            ${this.rangeFields("bgt-overall", budget.estimate_low, budget.estimate_high, "Overall Estimate")}

            ${this.rangeFields("bgt-accommodation", budget.categories.accommodation.low, budget.categories.accommodation.high, "Accommodation")}

            ${this.rangeFields("bgt-food", budget.categories.food.low, budget.categories.food.high, "Food")}

            ${this.rangeFields("bgt-activities", budget.categories.activities.low, budget.categories.activities.high, "Activities")}

            ${this.rangeFields("bgt-contingency", budget.categories.contingency.low, budget.categories.contingency.high, "Contingency")}

        </div>

        <h3>Transport Breakdown</h3>

        <div class="form-grid">

            ${Object.entries(budget.categories.transport)
              .map(([key, val]) => this.rangeFields(`bgt-transport-${key}`, val.low, val.high, this.pretty(key)))
              .join("")}

        </div>

        <label class="form-field form-field-wide">
            Notes (one per line)
            <textarea id="bgt-notes" rows="4">${(budget.notes || []).join("\n")}</textarea>
        </label>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Budget.save()">

            Save

        </button>

        <button type="button" onclick="Budget.open()">

            Cancel

        </button>

    </div>

</div>

`;
  },

  rangeFields(prefix, low, high, label) {
    return `

<label class="form-field">
    ${label} Low
    <input type="number" id="${prefix}-low" value="${low ?? 0}" min="0">
</label>

<label class="form-field">
    ${label} High
    <input type="number" id="${prefix}-high" value="${high ?? 0}" min="0">
</label>

`;
  },

  readRange(prefix) {
    return {
      low: parseFloat(document.getElementById(`${prefix}-low`).value) || 0,
      high: parseFloat(document.getElementById(`${prefix}-high`).value) || 0,
    };
  },

  save() {
    const budget = Project.get("budget");

    if (!budget) {
      return;
    }

    budget.currency = document.getElementById("bgt-currency").value.trim() || "EUR";

    const overall = this.readRange("bgt-overall");

    budget.estimate_low = overall.low;

    budget.estimate_high = overall.high;

    budget.categories.accommodation = this.readRange("bgt-accommodation");

    budget.categories.food = this.readRange("bgt-food");

    budget.categories.activities = this.readRange("bgt-activities");

    budget.categories.contingency = this.readRange("bgt-contingency");

    Object.keys(budget.categories.transport).forEach((key) => {
      budget.categories.transport[key] = this.readRange(`bgt-transport-${key}`);
    });

    budget.notes = document
      .getElementById("bgt-notes")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    Project.update("budget", budget);

    this.open();
  },
};
