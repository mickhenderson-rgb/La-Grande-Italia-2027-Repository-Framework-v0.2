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

  // Fuel is split out from Transport so the Driving estimate has
  // something to be measured against - see Drive.tripFuel(). Lumping it
  // in with taxis and train tickets made that impossible.
  categories: ["Food", "Transport", "Fuel", "Tolls", "Shopping", "Tips", "Entry Fees", "Other"],

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

    // Same reason as renderByCategory: never add different currencies
    // together, and never label a mixed sum with one currency's code.
    const totalsByCurrency = {};

    items.forEach((item) => {
      const code = item.currency || "EUR";

      totalsByCurrency[code] = (totalsByCurrency[code] || 0) + (item.amount || 0);
    });

    const total = Object.keys(totalsByCurrency)
      .sort()
      .map((code) => this.money(totalsByCurrency[code], code))
      .join(" + ");

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

            ${items.length} expense${items.length === 1 ? "" : "s"} logged${total ? ` · Total ${total}` : ""}

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

        ${this.esc(Format.date(item.date))}
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

  // Totals are kept PER CURRENCY, not added together.
  //
  // This used to sum every amount into one number and print it with the
  // default label - so an expense logged in AUD showed correctly on its
  // own card and then appeared as EUR in this table, and a trip with two
  // currencies had them added as though a euro were a dollar. Wrong money
  // stated confidently is worse than no total.
  //
  // Converting them into one figure would need a live rate, which this
  // screen doesn't have (Budget does that job). Listing each currency on
  // its own line is honest and needs nothing.
  renderByCategory(items) {
    const totals = {};

    this.categories.forEach((c) => {
      totals[c] = {};
    });

    items.forEach((item) => {
      const cat = this.categories.includes(item.category) ? item.category : "Other";

      const currency = item.currency || "EUR";

      totals[cat][currency] = (totals[cat][currency] || 0) + (item.amount || 0);
    });

    let rows = "";

    this.categories.forEach((c) => {
      const currencies = Object.keys(totals[c]).sort();

      const cell =
        currencies.length === 0
          ? "—"
          : currencies.map((code) => this.money(totals[c][code], code)).join("<br>");

      rows += `

<tr>

<td>${c}</td>

<td>${cell}</td>

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
    UI.confirm({
      title: "Remove this expense?",
      body: "This cannot be undone.",
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: () => this.removeConfirmed(id),
    });
  },

  removeConfirmed(id) {
    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/expenses/${id}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Remove failed with status ${response.status}`);
        }

        const data = Project.get("expenses");

        if (data && Array.isArray(data.items)) {
          data.items = data.items.filter((item) => item.id !== id);
        }

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not remove expense:", error);

        UI.fail("Couldn't remove that item. Check the connection and try again.");
      });
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

    <div class="manager-card form-card" data-guard="expenses:${item.id || 'new'}">

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
                <select id="exp-currency">${Currency.currencyOptions(item.currency || "EUR")}</select>
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
    const description = document.getElementById("exp-description").value.trim();

    if (!description) {
      UI.warn("Please enter a description before saving.");
      return;
    }

    const dayNumber = parseInt(document.getElementById("exp-day").value, 10);

    if (!dayNumber || dayNumber < 1) {
      UI.warn("Please enter a valid day number before saving.");
      return;
    }

    const isNew = !id;

    const fields = {
      day: dayNumber,
      addedBy: isNew ? Project.currentUser || "" : undefined,
      category: document.getElementById("exp-category").value,
      description,
      amount: parseFloat(document.getElementById("exp-amount").value) || 0,
      currency: document.getElementById("exp-currency").value.trim() || "EUR",
      date: document.getElementById("exp-date").value,
      notes: document.getElementById("exp-notes").value.trim(),
    };

    Object.keys(fields).forEach((key) => {
      if (fields[key] === undefined) {
        delete fields[key];
      }
    });

    // These changes are on their way to the server, so navigating away
    // from the form once it succeeds must not ask about them. Guarded so a
    // deployment that somehow lacks form-guard.js still saves.
    if (typeof FormGuard !== "undefined") {
      FormGuard.release();
    }

    const url = isNew
      ? `${window.API_BASE}/api/items/${Data.currentProjectFolder}/expenses`
      : `${window.API_BASE}/api/items/${Data.currentProjectFolder}/expenses/${id}`;

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
        const data = Project.get("expenses");

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
        console.error("Could not save expense:", error);

        UI.fail("Couldn't save that item. Check the connection and try again.");
      });
  },

  // Delegates to the shared formatter - see app/format.js.
  money(amount, currency) {
    return Format.money(amount, currency);
  },

  // Full escaping, not just quotes.
  //
  // This escaped only " until v1.11.2, so any < in user text went into
  // innerHTML as markup. Trips are SHARED, so a hotel name or an expense
  // description written by one person renders in everyone else browser
  // with their session - a stored XSS, not a cosmetic problem. Other
  // modules were upgraded as they were touched; these were missed.
  //
  // & must be replaced first, or the & introduced by the later
  // replacements gets escaped a second time.
  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
