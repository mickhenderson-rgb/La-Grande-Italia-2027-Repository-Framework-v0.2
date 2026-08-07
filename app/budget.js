/*
=========================================================

COMPASS-TOS

Budget

Version 2.0.0

Build 45

Currency-aware actual-spend view. Confirmed bookings (Booked
and Travel) are grouped per category and per native currency,
so nothing gets summed across currencies by accident. A
dropdown converts every subtotal - and the grand total - into
a single display currency using live Frankfurter rates via the
Currency module (Build 42). Planning estimates (facts, stored
in budget.json) are still shown and editable; nothing
calculated is written back.

=========================================================
*/

const Budget = {
  displayCurrency: "",

  rateError: false,

  open() {
    this.displayCurrency = Currency.displayCurrency();

    this.loadAndRender();
  },

  setDisplay(currency) {
    this.displayCurrency = String(currency || "").toUpperCase();

    this.loadAndRender();
  },

  loadAndRender() {
    this.rateError = false;

    Render.show(Layout.render(this.renderView()));

    const items = this.getAllItems();

    const froms = [...new Set(items.map((e) => e.currency).filter((c) => c && c !== this.displayCurrency))];

    const missing = froms.filter((f) => Currency.cachedRate(f, this.displayCurrency) === null);

    if (missing.length === 0) {
      return;
    }

    Promise.all(
      missing.map((f) =>
        Currency.fetchRates(f, [this.displayCurrency]).catch(() => {
          this.rateError = true;
        }),
      ),
    ).then(() => {
      Render.show(Layout.render(this.renderView()));
    });
  },

  // --- Data ---

  getItems(data) {
    return data && Array.isArray(data.items) ? data.items : [];
  },

  isConfirmed(item) {
    return item.status === "Booked" || item.status === "Travel";
  },

  calculateNights(item) {
    if (Array.isArray(item.dayRange) && item.dayRange.length === 2) {
      return Math.max(1, item.dayRange[1] - item.dayRange[0] + 1);
    }

    if (item.schedule && item.schedule.nights) {
      return Math.max(1, item.schedule.nights);
    }

    return 1;
  },

  flightName(item) {
    const name = `${item.airline || ""} ${item.flightNumber || ""}`.trim();

    return name || "Flight";
  },

  transportName(item) {
    const route = [item.from, item.to].filter(Boolean).join(" → ");

    return route ? `${item.mode || "Transport"}: ${route}` : item.mode || "Transport";
  },

  getAllItems() {
    const items = [];

    const add = (category, name, amount, currency, detail) => {
      const value = Number(amount) || 0;

      if (!(value > 0)) {
        return;
      }

      items.push({
        category,
        name: name,
        amount: value,
        currency: String(currency || "EUR").toUpperCase(),
        detail: detail || "",
      });
    };

    this.getItems(Project.get("flights"))
      .filter((it) => this.isConfirmed(it))
      .forEach((it) => add("flights", this.flightName(it), it.price && it.price.amount, it.price && it.price.currency));

    this.getItems(Project.get("accommodation"))
      .filter((it) => this.isConfirmed(it))
      .forEach((it) => {
        const base = Number(it.price && it.price.amount) || 0;

        const perNight = String(it.price && it.price.per).toLowerCase() === "night";

        const nights = this.calculateNights(it);

        const total = perNight ? base * nights : base;

        const detail = perNight && nights > 1 ? `${this.money(base, it.price.currency)} × ${nights} nights` : "";

        add("accommodation", it.name || "Accommodation", total, it.price && it.price.currency, detail);
      });

    this.getItems(Project.get("activities"))
      .filter((it) => this.isConfirmed(it))
      .forEach((it) => add("activities", it.name || "Activity", it.price && it.price.amount, it.price && it.price.currency));

    this.getItems(Project.get("restaurants"))
      .filter((it) => this.isConfirmed(it))
      .forEach((it) => add("restaurants", it.name || "Restaurant", it.price && it.price.amount, it.price && it.price.currency));

    this.getItems(Project.get("transport"))
      .filter((it) => this.isConfirmed(it))
      .forEach((it) => add("transport", this.transportName(it), it.price && it.price.amount, it.price && it.price.currency));

    this.getItems(Project.get("expenses")).forEach((it) =>
      add("expenses", it.description || it.category || "Expense", it.amount, it.currency),
    );

    return items;
  },

  groupByCategory(items) {
    const out = {};

    items.forEach((e) => {
      out[e.category] = out[e.category] || {};

      out[e.category][e.currency] = out[e.category][e.currency] || [];

      out[e.category][e.currency].push(e);
    });

    return out;
  },

  convertAmount(amount, from, to) {
    if (String(from).toUpperCase() === String(to).toUpperCase()) {
      return amount;
    }

    const rate = Currency.cachedRate(from, to);

    return rate === null ? null : amount * rate;
  },

  // --- Rendering ---

  currencyList() {
    const trip = String((Project.get("budget") || {}).currency || this.displayCurrency).toUpperCase();

    return [...new Set([this.displayCurrency, trip, ...(Currency.currencies || [])])].filter(Boolean);
  },

  renderView() {
    const budget = Project.get("budget") || {};

    const items = this.getAllItems();

    const grouped = this.groupByCategory(items);

    const order = [
      ["flights", "Flights"],
      ["accommodation", "Accommodation"],
      ["activities", "Activities"],
      ["restaurants", "Restaurants"],
      ["transport", "Transport"],
      ["expenses", "Expenses (logged)"],
    ];

    let grandTotal = 0;

    let grandComplete = true;

    const sections = order
      .map(([key, label]) => {
        const section = this.renderCategorySection(label, grouped[key] || {});

        if (section.converted === null) {
          if (section.hasItems) {
            grandComplete = false;
          }
        } else {
          grandTotal += section.converted;
        }

        return section.html;
      })
      .join("");

    const grandDisplay =
      items.length === 0
        ? ""
        : grandComplete
          ? this.formatConverted(grandTotal, this.displayCurrency)
          : "Some live rates unavailable - see native subtotals above";

    const estimateLine =
      budget.estimate_low || budget.estimate_high
        ? `Planning estimate: ${this.money(budget.estimate_low, budget.currency)} – ${this.money(budget.estimate_high, budget.currency)}`
        : "No planning estimate set yet.";

    return `

<div class="manager">

    <section class="hero">

        <h1>Budget</h1>

        <p>Confirmed spend (Booked &amp; Travel) shown in each item's own currency, with totals converted to your chosen currency using live rates.</p>

        <p class="form-hint">${estimateLine}</p>

    </section>

    <div class="manager-card" style="max-width: 520px;">

        <label class="form-field">
            Display totals in
            <select onchange="Budget.setDisplay(this.value)">
                ${this.currencyList()
                  .map((c) => `<option value="${c}" ${c === this.displayCurrency ? "selected" : ""}>${c}</option>`)
                  .join("")}
            </select>
        </label>

    </div>

    ${
      items.length === 0
        ? `<div class="manager-card"><p>No confirmed items yet. Mark flights, accommodation, activities, restaurants or transport as <strong>Booked</strong> (or log expenses) to see your budget here.</p></div>`
        : sections
    }

    ${
      items.length === 0
        ? ""
        : `

<div class="manager-card" style="border-top: 3px solid #34495E;">

    <h2>Grand Total in ${this.esc(this.displayCurrency)}</h2>

    <p style="font-size: 1.4em; font-weight: 700;">${this.esc(grandDisplay)}</p>

</div>

`
    }

    <div class="planner-buttons">

        <button type="button" onclick="Budget.edit()">Edit Estimate</button>

        <button type="button" onclick="Expenses.openAll()">View Expenses</button>

        <button type="button" onclick="Router.navigate('dashboard')">← Dashboard</button>

    </div>

</div>

`;
  },

  renderCategorySection(label, byCurrency) {
    const currencies = Object.keys(byCurrency);

    if (currencies.length === 0) {
      return {
        html: `

<div class="manager-card">

    <h2>${this.esc(label)}</h2>

    <p class="form-hint">(No items booked)</p>

</div>

`,
        converted: 0,
        hasItems: false,
      };
    }

    let rows = "";

    let convertedTotal = 0;

    let convertComplete = true;

    currencies.forEach((cur) => {
      let subtotal = 0;

      byCurrency[cur].forEach((e) => {
        subtotal += e.amount;

        rows += `

<tr>

<td>${this.esc(e.name)}${e.detail ? ` <span class="form-hint">(${this.esc(e.detail)})</span>` : ""}</td>

<td style="text-align: right;">${this.money(e.amount, cur)}</td>

</tr>

`;
      });

      rows += `

<tr>

<td><strong>Subtotal (${this.esc(cur)})</strong></td>

<td style="text-align: right;"><strong>${this.money(subtotal, cur)}</strong></td>

</tr>

`;

      const converted = this.convertAmount(subtotal, cur, this.displayCurrency);

      if (converted === null) {
        convertComplete = false;
      } else {
        convertedTotal += converted;
      }
    });

    const convertedCell = convertComplete
      ? this.formatConverted(convertedTotal, this.displayCurrency)
      : this.rateError
        ? "Rate unavailable"
        : "…";

    return {
      html: `

<div class="manager-card">

    <h2>${this.esc(label)}</h2>

    <table style="width: 100%;">

        ${rows}

        <tr>

        <td style="border-top: 2px solid #C79C5D;"><strong>Subtotal in ${this.esc(this.displayCurrency)}</strong></td>

        <td style="border-top: 2px solid #C79C5D; text-align: right;"><strong>${convertedCell}</strong></td>

        </tr>

    </table>

</div>

`,
      converted: convertComplete ? convertedTotal : null,
      hasItems: true,
    };
  },

  formatConverted(amount, currency) {
    const value = Number(amount) || 0;

    return `${String(currency).toUpperCase()} $${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
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
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  // --- Planning estimate editor (unchanged from Build 15) ---

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

            These are planning estimates only — actuals are calculated live from
            Accommodation, Activities, Transport, Restaurants and Expenses.

        </p>

    </section>

    <div class="manager-card form-card">

        <div class="form-grid">

            <label class="form-field">
                Currency
                <select id="bgt-currency">${Currency.currencyOptions(budget.currency)}</select>
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
