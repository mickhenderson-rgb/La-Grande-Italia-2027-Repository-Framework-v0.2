/*
=========================================================

COMPASS-TOS

Weather

Version 1.0.0

Build 21

Two different questions, answered by two different
sources, and never confused for each other:

  "What is it usually like?"  - climate normals, worked
      out from OBSERVED weather on the same calendar dates
      across the last ten years (Open-Meteo's archive of
      ERA5 reanalysis). This is what matters when a trip
      is months away.

  "What will it be like?"     - a live forecast, which is
      only meaningful about a fortnight out. Beyond that
      it is hidden rather than shown as if it meant
      something: a Milan trip 355 days away used to
      display next week's Sydney-time forecast next to an
      empty "Seasonal Average", which is exactly the wrong
      half.

Both come from Open-Meteo, free and with no API key, so
nothing secret ships and nothing has to be proxied.

NOT used: Open-Meteo's Climate API. It returns CMIP6 model
projections for climate-change analysis, and its own docs
say it is unsuitable for "typical weather on a calendar
date" - a single modelled day is not a normal. The archive
of observations, averaged, is.

Normals are cached in memory for the session and never
written to weather.json: an average is a derived value,
and the house rule is that JSON holds facts. Anything
typed into weather.json by hand still wins, because
somebody chose it deliberately.

=========================================================
*/

const Weather = {
  current: null,

  // How many past years to average. Ten is a practical compromise: a
  // meteorological "normal" is conventionally thirty, but ten is plenty to
  // smooth out a freak year and costs ten small requests instead of
  // thirty.
  NORMAL_YEARS: 10,

  // Beyond this, a forecast is not information. Open-Meteo publishes
  // sixteen days; past a fortnight the useful answer is the normal.
  FORECAST_HORIZON_DAYS: 14,

  _normals: {},

  // Climate normals for a place and a calendar window, from OBSERVED
  // weather - not a model, and not a forecast.
  //
  // One request per year rather than one long range: the archive returns a
  // row per day, so ten separate ~7-day windows is a few hundred rows
  // instead of ten years of them.
  async fetchNormals(coords, startMonthDay, endMonthDay) {
    const key = [coords.latitude, coords.longitude, startMonthDay, endMonthDay].join("|");

    if (this._normals[key]) {
      return this._normals[key];
    }

    // Whole past years only. The archive lags real time by a few days, and
    // this sidesteps that entirely rather than handling it.
    const thisYear = new Date().getFullYear();

    const years = [];

    for (let i = 1; i <= this.NORMAL_YEARS; i++) {
      years.push(thisYear - i);
    }

    const responses = await Promise.all(
      years.map((year) =>
        fetch(this.archiveUrl(coords, year + "-" + startMonthDay, year + "-" + endMonthDay))
          .then((r) => (r.ok ? r.json() : null))
          // One bad year must not lose the other nine.
          .catch(() => null),
      ),
    );

    const normals = this.averageDaily(responses.filter(Boolean));

    if (normals) {
      normals.years = responses.filter(Boolean).length;

      this._normals[key] = normals;
    }

    return normals;
  },

  archiveUrl(coords, startDate, endDate) {
    const daily = [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_hours",
      "sunrise",
      "sunset",
    ].join(",");

    return (
      "https://archive-api.open-meteo.com/v1/archive" +
      "?latitude=" + coords.latitude +
      "&longitude=" + coords.longitude +
      "&start_date=" + startDate +
      "&end_date=" + endDate +
      "&daily=" + daily +
      "&timezone=auto"
    );
  },

  // Flattens N years of daily rows into one set of averages.
  //
  // Rain is reported two ways on purpose. A mean of millimetres is
  // misleading - one thunderstorm in ten years lifts the average and makes
  // a dry fortnight look wet - so what's actually useful is how OFTEN it
  // rained, which is a count, not a mean.
  averageDaily(years) {
    const highs = [];

    const lows = [];

    const rainDays = [];

    let sunrise = "";

    let sunset = "";

    years.forEach((payload) => {
      const daily = payload && payload.daily;

      if (!daily || !Array.isArray(daily.time)) {
        return;
      }

      daily.time.forEach((_, i) => {
        const hi = daily.temperature_2m_max ? daily.temperature_2m_max[i] : null;

        const lo = daily.temperature_2m_min ? daily.temperature_2m_min[i] : null;

        const mm = daily.precipitation_sum ? daily.precipitation_sum[i] : null;

        if (typeof hi === "number") {
          highs.push(hi);
        }

        if (typeof lo === "number") {
          lows.push(lo);
        }

        if (typeof mm === "number") {
          // 1mm is the conventional threshold for "a rain day" - below that
          // is drizzle that doesn't change what you'd pack.
          rainDays.push(mm >= 1 ? 1 : 0);
        }
      });

      // Sunrise and sunset barely move between years for the same calendar
      // date - it's astronomy - so the most recent year's first day is as
      // good as an average, and reads as a real time rather than a mean.
      if (!sunrise && daily.sunrise && daily.sunrise[0]) {
        sunrise = this.timeOnly(daily.sunrise[0]);

        sunset = this.timeOnly(daily.sunset && daily.sunset[0]);
      }
    });

    if (highs.length === 0 && lows.length === 0) {
      return null;
    }

    return {
      average_high: this.mean(highs),
      average_low: this.mean(lows),
      rain_day_percent: rainDays.length ? Math.round((this.sum(rainDays) / rainDays.length) * 100) : null,
      sunrise: sunrise,
      sunset: sunset,
    };
  },

  mean(values) {
    return values.length ? Math.round((this.sum(values) / values.length) * 10) / 10 : null;
  },

  sum(values) {
    return values.reduce((total, v) => total + v, 0);
  },

  // "2026-08-27T06:14" -> "06:14"
  timeOnly(value) {
    const text = String(value || "");

    const at = text.indexOf("T");

    return at === -1 ? text : text.slice(at + 1, at + 6);
  },

  // This module had no escaper at all - it only ever printed numbers
  // from its own JSON. It now renders values from an external API and a
  // user-editable file, so it needs the house one.
  esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  // The calendar window this destination is visited in, as MM-DD, so the
  // normals are for the right fortnight rather than the whole year.
  windowFor(locationId) {
    const journey = Project.get("journey");

    const days = journey && Array.isArray(journey.days) ? journey.days : [];

    const dates = days
      .filter((d) => String(d.overnight || d.location || "").toLowerCase() === String(locationId || "").toLowerCase())
      .map((d) => d.date)
      .filter(Boolean)
      .sort();

    if (dates.length === 0) {
      return null;
    }

    return { start: dates[0].slice(5), end: dates[dates.length - 1].slice(5) };
  },

  // How far off the first day at this destination is, in days. Null when
  // there's no date to measure against.
  daysUntil(locationId) {
    const journey = Project.get("journey");

    const days = journey && Array.isArray(journey.days) ? journey.days : [];

    const dates = days
      .filter((d) => String(d.overnight || d.location || "").toLowerCase() === String(locationId || "").toLowerCase())
      .map((d) => d.date)
      .filter(Boolean)
      .sort();

    if (dates.length === 0) {
      return null;
    }

    const today = typeof Phase !== "undefined" ? Phase.todayISO() : new Date().toISOString().slice(0, 10);

    const ms = Date.parse(dates[0]) - Date.parse(today);

    return Number.isNaN(ms) ? null : Math.round(ms / 86400000);
  },

  open(locationId) {
    this.current = locationId;

    Render.show(Layout.render(this.render()));

    this.loadLive(locationId);

    this.loadNormals(locationId);
  },

  // Fills in the seasonal card from observed history, but only when
  // nothing was typed into weather.json by hand - a figure somebody chose
  // deliberately outranks one we averaged.
  async loadNormals(locationId) {
    if (this.getSeasonal(locationId)) {
      return;
    }

    const card = document.getElementById("weather-seasonal-card");

    if (!card) {
      return;
    }

    const window = this.windowFor(locationId);

    if (!window) {
      card.innerHTML = this.seasonalMessage(
        "This destination has no dates in the itinerary yet, so there's no season to look up.",
      );

      return;
    }

    const coords = await this.coordsFor(locationId);

    if (!coords) {
      card.innerHTML = this.seasonalMessage(
        "No coordinates saved for this destination yet. Set them on the day in the Planner and the typical weather will fill in.",
      );

      return;
    }

    card.innerHTML = this.seasonalMessage("Working out the typical weather for these dates…");

    try {
      const normals = await this.fetchNormals(coords, window.start, window.end);

      if (!normals) {
        card.innerHTML = this.seasonalMessage("No historical weather available for this place.");

        return;
      }

      card.innerHTML = this.renderSeasonalBody(normals, normals.years);
    } catch (error) {
      card.innerHTML = this.seasonalMessage("Couldn't reach the weather archive (offline, or the request failed).");
    }
  },

  async coordsFor(locationId) {
    const detail = await Data.loadJSON(`data/projects/${Data.currentProjectFolder}/destinations/${locationId}.json`);

    const coords = detail && detail.coordinates ? detail.coordinates : null;

    return coords && coords.latitude !== null && coords.longitude !== null ? coords : null;
  },

  seasonalMessage(text) {
    return `<h2>Typical Weather</h2><p>${this.esc(text)}</p>`;
  },

  render() {
    const seasonal = this.getSeasonal(this.current);

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Weather

        </h1>

        <h2>

            ${this.pretty(this.current)}

        </h2>

    </section>

    <div class="manager-grid">

        ${this.renderSeasonal(seasonal)}

        <div class="manager-card" id="weather-live-card">

            <h2>Live Forecast</h2>

            <p id="weather-live-status">Checking for a live forecast...</p>

        </div>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Destination.open('${this.current}')">

            ← Back to Destination

        </button>

    </div>

</div>

`;
  },

  // The card, with an id so loadNormals() can fill it in once the archive
  // answers. When weather.json already holds hand-entered figures they're
  // rendered straight away and the fetch is skipped entirely.
  renderSeasonal(seasonal) {
    return `

<div class="manager-card" id="weather-seasonal-card">

${seasonal ? this.renderSeasonalBody(seasonal, null) : "<h2>Typical Weather</h2><p>Looking up the typical weather for these dates\u2026</p>"}

</div>

`;
  },

  // One body for both sources, so hand-entered and computed figures can't
  // drift into looking like different things. `years` is the number of past
  // years averaged, or null when the numbers were typed in.
  renderSeasonalBody(seasonal, years) {
    const row = (label, value) => (value === null || value === undefined || value === "" ? "" : `<tr><td>${label}</td><td>${this.esc(value)}</td></tr>`);

    const rain =
      typeof seasonal.rain_day_percent === "number"
        ? `${seasonal.rain_day_percent}% of days`
        : null;

    return `

<h2>Typical Weather</h2>

<table>

${row("High", seasonal.average_high === null || seasonal.average_high === undefined ? "" : seasonal.average_high + "\u00B0C")}

${row("Low", seasonal.average_low === null || seasonal.average_low === undefined ? "" : seasonal.average_low + "\u00B0C")}

${row("Rain", rain)}

${row("Sunrise", seasonal.sunrise)}

${row("Sunset", seasonal.sunset)}

</table>

<p class="form-hint">${
  years
    ? `Averaged from what actually happened on these dates over the last ${years} year${years === 1 ? "" : "s"}. Not a forecast \u2014 a picture of what's normal.`
    : "Saved reference figures for this destination, not a live forecast."
}</p>

`;
  },

  getSeasonal(locationId) {
    const data = Project.get("weather");

    if (!data) {
      return null;
    }

    const key = this.pretty(locationId);

    return data[key] || null;
  },

  async loadLive(locationId) {
    const statusEl = document.getElementById("weather-live-status");

    // A forecast more than a fortnight out is not information, and showing
    // one implies otherwise. The Italy trip - 355 days away - displayed
    // next week's three-day forecast beside an empty seasonal card, which
    // is precisely the wrong half of the answer.
    const away = this.daysUntil(locationId);

    if (away !== null && away > this.FORECAST_HORIZON_DAYS) {
      const card = document.getElementById("weather-live-card");

      if (card) {
        card.innerHTML =
          "<h2>Live Forecast</h2><p>Still " +
          away +
          " days away. A forecast only means something about a fortnight out - until then, the typical weather above is the better guide.</p>";
      }

      if (statusEl) {
        statusEl.textContent = "";
      }

      return;
    }

    const detail = await Data.loadJSON(`data/projects/${Data.currentProjectFolder}/destinations/${locationId}.json`);

    const coords = detail && detail.coordinates ? detail.coordinates : null;

    if (!coords || coords.latitude === null || coords.longitude === null) {
      if (statusEl) {
        statusEl.textContent =
          "No coordinates saved for this destination yet, so a live forecast isn't available. Showing seasonal averages only.";
      }

      return;
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Weather request failed");
      }

      const forecast = await response.json();

      this.renderLive(forecast);
    } catch (error) {
      if (statusEl) {
        statusEl.textContent = "Couldn't reach the live weather service (offline, or the request failed).";
      }
    }
  },

  renderLive(forecast) {
    const card = document.getElementById("weather-live-card");

    if (!card || !forecast || !forecast.current_weather) {
      return;
    }

    const current = forecast.current_weather;

    const days = forecast.daily && forecast.daily.time ? forecast.daily.time.length : 0;

    let forecastRows = "";

    for (let i = 0; i < Math.min(days, 3); i++) {
      forecastRows += `

<tr>

<td>${forecast.daily.time[i]}</td>

<td>${forecast.daily.temperature_2m_min[i]}°C - ${forecast.daily.temperature_2m_max[i]}°C</td>

</tr>

`;
    }

    card.innerHTML = `

<h2>Live Forecast</h2>

<table>

<tr>

<td>Right Now</td>

<td>${current.temperature}°C</td>

</tr>

${forecastRows}

</table>

<p>Source: Open-Meteo</p>

`;
  },

  // Delegates to the shared formatter - see app/format.js. Kept as a
  // local method so every existing this.pretty(...) call still works.
  pretty(value) {
    return Format.place(value);
  },
};
