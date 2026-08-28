/*
=========================================================

COMPASS-TOS

Currency

Version 1.0.0

Build 42

Live exchange-rate conversion via the Frankfurter API
(free, no key, ECB mid-market rates) plus a standalone
calculator.

How it fits the app:
- Prices are stored as { amount, currency, per } on each
  research item. inlineConversion() takes that object and
  returns a "≈ AUD $x" suffix shown next to the price.
- The display currency comes from project.displayCurrency,
  falling back to the trip currency, so existing trips work
  with no migration and no server change.
- All rate fetching happens in the browser (Frankfurter is
  called directly). Rates are cached in memory per
  currency-pair for one hour. Nothing blocks on the network:
  list prices render immediately with a placeholder that is
  filled in once rates arrive; if the API is unreachable the
  placeholder is quietly dropped and the calculator says so.

=========================================================
*/

const Currency = {
  cacheMaxAge: 3600000,

  cache: {},

  lastRefreshDate: null,

  lastRefreshTs: null,

  // Frankfurter's hosted API moved to the .dev domain with a /v1 prefix.
  // The old api.frankfurter.app now 301-redirects there, and that redirect
  // carries no CORS header, so a browser fetch to the old host fails CORS.
  // Call the canonical endpoint directly to avoid the redirect entirely.
  apiBase: "https://api.frankfurter.dev/v1",

  currencies: [
    "AUD", "USD", "EUR", "GBP", "JPY", "CHF", "CNY", "INR",
    "CAD", "NZD", "SGD", "THB", "HKD", "IDR", "MYR", "MXN",
    "ZAR", "SEK", "NOK", "DKK", "PLN", "CZK", "TRY", "AED",
  ],

  _seq: 0,

  _pending: [],

  _scheduled: false,

  displayCurrency() {
    const project = (Project.get("project") || {}).project || {};

    return String(project.displayCurrency || project.currency || "USD").toUpperCase();
  },

  pairKey(from, to) {
    return `${String(from).toUpperCase()}>${String(to).toUpperCase()}`;
  },

  cachedRate(from, to) {
    const entry = this.cache[this.pairKey(from, to)];

    if (entry && Date.now() - entry.ts < this.cacheMaxAge) {
      return entry.rate;
    }

    return null;
  },

  isCacheFresh(from, to) {
    return this.cachedRate(from, to) !== null;
  },

  async fetchRates(fromCurrency, toCurrencies) {
    const from = String(fromCurrency).toUpperCase();

    const wanted = (Array.isArray(toCurrencies) ? toCurrencies : [toCurrencies])
      .map((c) => String(c).toUpperCase())
      .filter((c) => c && c !== from);

    const out = {};

    const missing = [];

    wanted.forEach((to) => {
      const rate = this.cachedRate(from, to);

      if (rate !== null) {
        out[to] = rate;
      } else {
        missing.push(to);
      }
    });

    if (missing.length === 0) {
      return out;
    }

    const url = `${this.apiBase}/latest?base=${from}&symbols=${missing.join(",")}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Frankfurter responded ${response.status}`);
    }

    const data = await response.json();

    const rates = data && data.rates ? data.rates : {};

    const now = Date.now();

    Object.keys(rates).forEach((to) => {
      this.cache[this.pairKey(from, to)] = { rate: rates[to], ts: now, date: data.date };

      out[to] = rates[to];
    });

    this.lastRefreshDate = data.date || this.lastRefreshDate;

    this.lastRefreshTs = now;

    return out;
  },

  convert(amount, fromCurrency, toCurrency, rates) {
    if (String(fromCurrency).toUpperCase() === String(toCurrency).toUpperCase()) {
      return amount;
    }

    const rate = rates ? rates[String(toCurrency).toUpperCase()] : null;

    if (rate === null || rate === undefined) {
      return null;
    }

    return amount * rate;
  },

  // Was a third money formatter: "AUD $160.00", code AND symbol, sitting
  // beside Budget's "AUD 160.00" for the very same figure. Delegates now,
  // so a conversion reads the same as every other amount in the app.
  format(amount, currency) {
    return Format.money(amount, currency);
  },

  // <option> list for a currency <select>, with `selected` pre-chosen.
  // The current value is always included even if it isn't in the common
  // list, so an existing item's currency is never silently dropped.
  currencyOptions(selected) {
    const sel = String(selected || "").toUpperCase();

    const list = [...new Set([sel, ...this.currencies].filter(Boolean))];

    return list
      .map((c) => `<option value="${c}" ${c === sel ? "selected" : ""}>${c}</option>`)
      .join("");
  },

  // --- Inline conversion for research-module list prices ---

  inlineConversion(price) {
    if (!price || typeof price !== "object") {
      return "";
    }

    const amount = Number(price.amount || 0);

    if (!(amount > 0)) {
      return "";
    }

    const from = String(price.currency || "").toUpperCase();

    const to = this.displayCurrency();

    if (!from || from === to) {
      return "";
    }

    const cached = this.cachedRate(from, to);

    if (cached !== null) {
      return ` <span class="fx-convert">≈ ${this.esc(this.format(amount * cached, to))}</span>`;
    }

    const id = `fx-${++this._seq}`;

    this._pending.push({ id, amount, from, to });

    this.scheduleHydrate();

    return ` <span class="fx-convert" id="${id}" title="Fetching live rate…">≈ …</span>`;
  },

  scheduleHydrate() {
    if (this._scheduled) {
      return;
    }

    this._scheduled = true;

    setTimeout(() => {
      this._scheduled = false;

      this.hydrate();
    }, 0);
  },

  async hydrate() {
    const pending = this._pending;

    this._pending = [];

    if (pending.length === 0) {
      return;
    }

    const byFrom = {};

    pending.forEach((p) => {
      byFrom[p.from] = byFrom[p.from] || new Set();

      byFrom[p.from].add(p.to);
    });

    for (const from of Object.keys(byFrom)) {
      try {
        await this.fetchRates(from, Array.from(byFrom[from]));
      } catch (error) {
        console.warn("[Currency] Live rate fetch failed:", error.message);
      }
    }

    pending.forEach((p) => {
      const el = document.getElementById(p.id);

      if (!el) {
        return;
      }

      const rate = this.cachedRate(p.from, p.to);

      if (rate !== null) {
        el.textContent = `≈ ${this.format(p.amount * rate, p.to)}`;

        el.removeAttribute("title");
      } else {
        el.textContent = "";

        el.setAttribute("title", "Live rate unavailable");
      }
    });
  },

  // --- Standalone calculator ---

  open() {
    Render.show(Layout.render(this.render()));

    this.recalculate();
  },

  render() {
    const from = this.displayCurrency();

    const project = (Project.get("project") || {}).project || {};

    const tripCurrency = String(project.currency || from).toUpperCase();

    const options = (selected) =>
      this.currencies
        .map((c) => `<option value="${c}" ${c === selected ? "selected" : ""}>${c}</option>`)
        .join("");

    return `

<div class="manager">

    <section class="hero">

        <h1>Currency Calculator</h1>

        <p>Live mid-market rates from Frankfurter (European Central Bank). Rates are cached for an hour.</p>

    </section>

    <div class="manager-card form-card" style="max-width:520px;">

        <div class="form-grid">

            <label class="form-field">
                I have
                <input type="number" id="cur-amount" value="100" min="0" step="0.01" oninput="Currency.recalculate()">
            </label>

            <label class="form-field">
                From
                <select id="cur-from" onchange="Currency.recalculate()">
                    ${options(tripCurrency)}
                </select>
            </label>

            <label class="form-field">
                To
                <select id="cur-to" onchange="Currency.recalculate()">
                    ${options(from)}
                </select>
            </label>

        </div>

        <div class="planner-buttons" style="margin-top:6px;">

            <button type="button" onclick="Currency.swap()">⇅ Swap</button>

        </div>

        <div class="status-grid" style="margin-top:10px;">

            <div class="status-box" style="min-width:100%;">
                <strong id="cur-result" style="font-size:1.4em;">—</strong>
                <span class="tiny">Result</span>
            </div>

        </div>

        <p class="tiny" id="cur-refreshed">Rates not fetched yet.</p>

        <div id="cur-msg" class="form-hint"></div>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Currency.setDisplayCurrency()">Set “To” as Display Currency</button>

        <button type="button" onclick="Router.navigate('dashboard')">Close</button>

    </div>

</div>

`;
  },

  async recalculate() {
    const amountEl = document.getElementById("cur-amount");

    const fromEl = document.getElementById("cur-from");

    const toEl = document.getElementById("cur-to");

    const resultEl = document.getElementById("cur-result");

    if (!amountEl || !fromEl || !toEl || !resultEl) {
      return;
    }

    const amount = parseFloat(amountEl.value);

    const from = fromEl.value;

    const to = toEl.value;

    if (isNaN(amount)) {
      resultEl.textContent = "Enter an amount";

      return;
    }

    if (from === to) {
      resultEl.textContent = this.format(amount, to);

      this.updateRefreshed();

      return;
    }

    resultEl.textContent = "Converting…";

    try {
      const rates = await this.fetchRates(from, [to]);

      const converted = this.convert(amount, from, to, rates);

      if (converted === null) {
        resultEl.textContent = `No rate available for ${to}`;
      } else {
        resultEl.textContent = this.format(converted, to);
      }

      this.updateRefreshed();
    } catch (error) {
      resultEl.textContent = "Rates unavailable — check your connection.";

      this.setMessage("Live rates couldn’t be reached. You can still enter amounts manually and compare by hand.");
    }
  },

  swap() {
    const fromEl = document.getElementById("cur-from");

    const toEl = document.getElementById("cur-to");

    if (!fromEl || !toEl) {
      return;
    }

    const temp = fromEl.value;

    fromEl.value = toEl.value;

    toEl.value = temp;

    this.recalculate();
  },

  updateRefreshed() {
    const el = document.getElementById("cur-refreshed");

    if (!el) {
      return;
    }

    if (this.lastRefreshDate) {
      el.textContent = `Rates dated ${this.lastRefreshDate} (fetched this session).`;
    } else {
      el.textContent = "Showing amounts without a live rate.";
    }
  },

  setDisplayCurrency() {
    const toEl = document.getElementById("cur-to");

    if (!toEl) {
      return;
    }

    const to = toEl.value;

    const projectData = Project.get("project");

    if (projectData && projectData.project) {
      projectData.project.displayCurrency = to;

      Project.update("project", projectData);

      this.setMessage(`Display currency set to ${to}. Converted prices across the app will now show in ${to}.`);
    } else {
      this.setMessage("No trip is loaded, so the display currency wasn’t saved.");
    }
  },

  setMessage(text) {
    const el = document.getElementById("cur-msg");

    if (el) {
      el.textContent = text;
    }
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
