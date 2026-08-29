/*
=========================================================

COMPASS-TOS

Budget

Version 3.0.0

Build 45 (spend tiers)

Separates every priced item into three tiers by status:

  ESTIMATED  - Research, Shortlisted, Selected
  ALLOCATED  - Booked
  ACTUAL     - Travel, Review (plus logged expenses)

Each tier is shown in its native currencies with per-currency
subtotals, then converted to a single display currency using
live Frankfurter rates via the Currency module (Build 42). An
optional trip budget cap (stored in the trip's home currency)
drives a remaining-budget figure against actual spend.

Planning estimates in budget.json are still editable; nothing
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

    const entries = this.collectEntries();

    const froms = new Set(entries.map((e) => e.currency));

    froms.add(this.tripCurrency());

    const missing = [...froms].filter(
      (c) => c && c !== this.displayCurrency && Currency.cachedRate(c, this.displayCurrency) === null,
    );

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

  getTier(status) {
    if (["Research", "Shortlisted", "Selected"].includes(status)) {
      return "estimated";
    }

    if (status === "Booked") {
      return "allocated";
    }

    if (["Travel", "Review"].includes(status)) {
      return "actual";
    }

    return null;
  },

  // Nights, NOT days.
  //
  // dayRange[1] is the day you CHECK OUT, not the last night you sleep
  // there - the accommodation form says so in as many words ("3 nights
  // from Day 1 is Check-out Day 4"). So Day 1 to Day 4 is three nights,
  // and the difference IS the answer; adding one counted the checkout day
  // as a night you paid for.
  //
  // That mattered because accommodation defaults to per-night pricing, so
  // every stay in every trip was billed one night over.
  //
  // The floor of 1 covers a stay whose check-out day hasn't been set yet
  // (a new item starts as [day, day]), which the form itself calls a
  // single-night stay.
  calculateNights(item) {
    if (Array.isArray(item.dayRange) && item.dayRange.length === 2) {
      return Math.max(1, item.dayRange[1] - item.dayRange[0]);
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

  getCategoryLabel(key) {
    const labels = {
      flights: "Flights",
      accommodation: "Accommodation",
      activities: "Activities",
      restaurants: "Restaurants",
      transport: "Transport",
      expenses: "Expenses (logged)",
    };

    return labels[key] || key;
  },

  collectEntries() {
    const entries = [];

    const add = (tier, category, name, amount, currency, detail, status) => {
      const value = Number(amount) || 0;

      if (!(value > 0)) {
        return;
      }

      entries.push({
        tier,
        category,
        name,
        amount: value,
        currency: String(currency || "EUR").toUpperCase(),
        detail: detail || "",
        status,
      });
    };

    this.getItems(Project.get("flights")).forEach((it) => {
      const tier = this.getTier(it.status);

      if (tier) {
        add(tier, "flights", this.flightName(it), it.price && it.price.amount, it.price && it.price.currency, "", it.status);
      }
    });

    this.getItems(Project.get("accommodation")).forEach((it) => {
      const tier = this.getTier(it.status);

      if (!tier) {
        return;
      }

      const base = Number(it.price && it.price.amount) || 0;

      const perNight = String(it.price && it.price.per).toLowerCase() === "night";

      const nights = this.calculateNights(it);

      const total = perNight ? base * nights : base;

      const detail =
        perNight && nights > 1
          ? `${this.money(base, it.price.currency)}/night × ${nights} = ${this.money(total, it.price.currency)}`
          : "";

      add(tier, "accommodation", it.name || "Accommodation", total, it.price && it.price.currency, detail, it.status);
    });

    this.getItems(Project.get("activities")).forEach((it) => {
      const tier = this.getTier(it.status);

      if (tier) {
        add(tier, "activities", it.name || "Activity", it.price && it.price.amount, it.price && it.price.currency, "", it.status);
      }
    });

    this.getItems(Project.get("restaurants")).forEach((it) => {
      const tier = this.getTier(it.status);

      if (tier) {
        add(tier, "restaurants", it.name || "Restaurant", it.price && it.price.amount, it.price && it.price.currency, "", it.status);
      }
    });

    this.getItems(Project.get("transport")).forEach((it) => {
      const tier = this.getTier(it.status);

      if (tier) {
        add(tier, "transport", this.transportName(it), it.price && it.price.amount, it.price && it.price.currency, "", it.status);
      }
    });

    // Logged expenses are money already spent - they belong in Actual.
    this.getItems(Project.get("expenses")).forEach((it) =>
      add("actual", "expenses", it.description || it.category || "Expense", it.amount, it.currency, "", "Logged"),
    );

    return entries;
  },

  getAllItems() {
    const entries = this.collectEntries();

    return {
      estimated: entries.filter((e) => e.tier === "estimated"),
      allocated: entries.filter((e) => e.tier === "allocated"),
      actual: entries.filter((e) => e.tier === "actual"),
    };
  },

  groupByTierAndCurrency(tiered) {
    const group = (list) => {
      const out = {};

      list.forEach((e) => {
        out[e.category] = out[e.category] || {};

        out[e.category][e.currency] = out[e.category][e.currency] || [];

        out[e.category][e.currency].push(e);
      });

      return out;
    };

    return {
      estimated: group(tiered.estimated),
      allocated: group(tiered.allocated),
      actual: group(tiered.actual),
    };
  },

  convertAmount(amount, from, to) {
    if (String(from).toUpperCase() === String(to).toUpperCase()) {
      return amount;
    }

    const rate = Currency.cachedRate(from, to);

    return rate === null ? null : amount * rate;
  },

  tripCurrency() {
    const projectData = Project.get("project");

    const fromProject = projectData && projectData.project ? projectData.project.currency : null;

    return String(fromProject || (Project.get("budget") || {}).currency || "EUR").toUpperCase();
  },

  getBudgetCap() {
    const projectData = Project.get("project");

    const cap = projectData && projectData.project ? projectData.project.budgetCap : null;

    if (cap === null || cap === undefined || cap === "") {
      return null;
    }

    const value = Number(cap);

    return isNaN(value) ? null : value;
  },

  setBudgetCap() {
    const el = document.getElementById("bgt-cap");

    const raw = el ? el.value.trim() : "";

    const projectData = Project.get("project");

    if (projectData && projectData.project) {
      projectData.project.budgetCap = raw === "" ? null : Number(raw) || null;

      Project.update("project", projectData);
    }

    this.loadAndRender();
  },

  // --- Rendering ---

  currencyList() {
    const trip = this.tripCurrency();

    return [...new Set([this.displayCurrency, trip, ...(Currency.currencies || [])])].filter(Boolean);
  },

  renderCurrencySelector() {
    return `

<label class="form-field">
    Display totals in
    <select onchange="Budget.setDisplay(this.value)">
        ${this.currencyList()
          .map((c) => `<option value="${c}" ${c === this.displayCurrency ? "selected" : ""}>${c}</option>`)
          .join("")}
    </select>
</label>

`;
  },

  renderBudgetCapInput() {
    const cap = this.getBudgetCap();

    const tripCur = this.tripCurrency();

    return `

<label class="form-field">
    Trip Budget Cap (optional, in ${this.esc(tripCur)})
    <input type="number" id="bgt-cap" min="0" step="1" value="${cap === null ? "" : cap}">
</label>

<div class="planner-buttons">

    <button type="button" onclick="Budget.setBudgetCap()">Set Cap</button>

</div>

`;
  },

  renderView() {
    const tiered = this.getAllItems();

    const totalCount = tiered.estimated.length + tiered.allocated.length + tiered.actual.length;

    const estimated = this.renderTierSection("Estimated Costs", "Research, Shortlisted, Selected", tiered.estimated, true);

    const allocated = this.renderTierSection("Allocated Costs", "Booked", tiered.allocated, false);

    const actual = this.renderTierSection("Actual Spend", "Travel, Review, logged expenses", tiered.actual, true);

    const body =
      totalCount === 0
        ? `<div class="manager-card"><p>No items added yet. Add flights, accommodation, activities, restaurants or transport (or log expenses) to see your budget here.</p></div>`
        : estimated.html + allocated.html + actual.html + this.renderSummary(estimated, allocated, actual);

    return `

<div class="manager">

    <section class="hero">

        <h1>Budget</h1>

        <p>Items split into three tiers - Estimated (still deciding), Allocated (booked) and Actual (travelling / done) - each shown in its own currency, with totals converted to your chosen currency using live rates.</p>

    </section>

    <div class="manager-card" style="max-width: 520px;">

        ${this.renderCurrencySelector()}

        ${this.renderBudgetCapInput()}

    </div>

    ${body}

    <div class="planner-buttons">

        <button type="button" onclick="Budget.edit()">Edit Estimate</button>

        <button type="button" onclick="Expenses.openAll()">View Expenses</button>

        <button type="button" onclick="Router.navigate('dashboard')">← Dashboard</button>

    </div>

</div>

`;
  },

  renderTierSection(title, subtitle, entries, showStatus) {
    if (entries.length === 0) {
      return {
        html: `

<div class="manager-card">

    <h2>${this.esc(title)} <span class="form-hint">(${this.esc(subtitle)})</span></h2>

    <p class="form-hint">(No items in this tier)</p>

</div>

`,
        converted: 0,
        complete: true,
      };
    }

    const byCategory = {};

    entries.forEach((e) => {
      byCategory[e.category] = byCategory[e.category] || [];

      byCategory[e.category].push(e);
    });

    const order = ["flights", "accommodation", "activities", "restaurants", "transport", "expenses"];

    let catHtml = "";

    order.forEach((cat) => {
      const list = byCategory[cat];

      if (!list) {
        return;
      }

      const rows = list
        .map((e) => {
          const priceText = e.detail || this.money(e.amount, e.currency);

          const statusTag = showStatus && e.status ? ` <span class="form-hint">(${this.esc(e.status)})</span>` : "";

          return `

<tr>

<td>${this.esc(e.name)}${statusTag}</td>

<td style="text-align: right;">${this.esc(priceText)}</td>

</tr>

`;
        })
        .join("");

      catHtml += `

<h3>${this.esc(this.getCategoryLabel(cat))}</h3>

<table style="width: 100%;">${rows}</table>

`;
    });

    const byCurrency = {};

    entries.forEach((e) => {
      byCurrency[e.currency] = (byCurrency[e.currency] || 0) + e.amount;
    });

    let curLines = "";

    let convertedTotal = 0;

    let complete = true;

    Object.keys(byCurrency).forEach((cur) => {
      curLines += `<div>${this.esc(cur)}: <strong>${this.money(byCurrency[cur], cur)}</strong></div>`;

      const converted = this.convertAmount(byCurrency[cur], cur, this.displayCurrency);

      if (converted === null) {
        complete = false;
      } else {
        convertedTotal += converted;
      }
    });

    const convertedCell = complete
      ? this.formatConverted(convertedTotal, this.displayCurrency)
      : this.rateError
        ? "Rate unavailable"
        : "…";

    return {
      html: `

<div class="manager-card">

    <h2>${this.esc(title)} <span class="form-hint">(${this.esc(subtitle)})</span></h2>

    ${catHtml}

    <div style="border-top: 2px solid #C79C5D; margin-top: 8px; padding-top: 8px;">

        <p><strong>Subtotal by currency:</strong></p>

        ${curLines}

        <p style="margin-top: 6px;"><strong>Subtotal in ${this.esc(this.displayCurrency)}: ${convertedCell}</strong></p>

    </div>

</div>

`,
      converted: complete ? convertedTotal : null,
      complete,
    };
  },

  renderSummary(estimated, allocated, actual) {
    const display = this.displayCurrency;

    const fmt = (tier) => (tier.complete ? this.formatConverted(tier.converted, display) : "Rates unavailable");

    const cap = this.getBudgetCap();

    const tripCur = this.tripCurrency();

    let capRows;

    if (cap === null) {
      capRows = `

<tr><td>Trip Budget Cap</td><td style="text-align: right;">Not set</td></tr>

<tr><td>Actual Spend</td><td style="text-align: right;">${fmt(actual)}</td></tr>

`;
    } else {
      const capDisplay = this.convertAmount(cap, tripCur, display);

      if (capDisplay === null || !actual.complete) {
        capRows = `

<tr><td>Trip Budget Cap</td><td style="text-align: right;">${this.money(cap, tripCur)}</td></tr>

<tr><td>Actual Spend</td><td style="text-align: right;">${fmt(actual)}</td></tr>

<tr><td>Remaining</td><td style="text-align: right;">Live rate needed to compare</td></tr>

`;
      } else {
        const remaining = capDisplay - actual.converted;

        const over = remaining < 0;

        const colour = over ? "#b3261e" : "#2e7d4f";

        const verdict = over
          ? `✗ (OVER BUDGET by ${this.formatConverted(Math.abs(remaining), display)})`
          : "✓ (under budget)";

        capRows = `

<tr><td>Trip Budget Cap</td><td style="text-align: right;">${this.formatConverted(capDisplay, display)}</td></tr>

<tr><td>Actual Spend</td><td style="text-align: right;">${this.formatConverted(actual.converted, display)}</td></tr>

<tr><td><strong>Remaining</strong></td><td style="text-align: right; color: ${colour};"><strong>${this.formatConverted(remaining, display)} ${verdict}</strong></td></tr>

`;
      }
    }

    return `

<div class="manager-card" style="border-top: 3px solid #34495E;">

    <h2>Summary ${typeof Guide !== "undefined" ? Guide.hint("statuses", "How an item's status decides which budget tier it lands in") : ""}</h2>

    <table style="width: 100%;">

        <tr><td>Estimated</td><td style="text-align: right;">${fmt(estimated)}</td></tr>

        <tr><td>Allocated</td><td style="text-align: right;">${fmt(allocated)}</td></tr>

        <tr><td>Actual</td><td style="text-align: right;">${fmt(actual)}</td></tr>

        <tr><td colspan="2"><hr></td></tr>

        ${capRows}

    </table>

</div>

`;
  },

  formatConverted(amount, currency) {
    const value = Number(amount) || 0;

    const sign = value < 0 ? "-" : "";

    return `${sign}${Format.money(Math.abs(value), currency)}`;
  },

  // Delegates to the shared formatter - see app/format.js.
  money(amount, currency) {
    return Format.money(amount, currency);
  },

  // Delegates to the shared formatter - see app/format.js. Kept as a
  // local method so every existing this.pretty(...) call still works.
  pretty(value) {
    return Format.place(value);
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
