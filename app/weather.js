/*
=========================================================

COMPASS-TOS

Weather

Version 1.0.0

Build 21

Shows seasonal averages (facts, from weather.json) for
every destination immediately, then attempts a live
forecast from Open-Meteo (free, no API key) if the
destination has saved coordinates and the device is
online. Falls back gracefully if either is missing.

=========================================================
*/

const Weather = {
  current: null,

  open(locationId) {
    this.current = locationId;

    Render.show(Layout.render(this.render()));

    this.loadLive(locationId);
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

  renderSeasonal(seasonal) {
    if (!seasonal) {
      return `

<div class="manager-card">

<h2>Seasonal Average</h2>

<p>No seasonal reference data saved for this destination yet.</p>

</div>

`;
    }

    return `

<div class="manager-card">

<h2>Seasonal Average</h2>

<table>

<tr>

<td>High</td>

<td>${seasonal.average_high ?? "?"}°C</td>

</tr>

<tr>

<td>Low</td>

<td>${seasonal.average_low ?? "?"}°C</td>

</tr>

${
  seasonal.sunrise
    ? `<tr><td>Sunrise</td><td>${seasonal.sunrise}</td></tr>`
    : ""
}

${
  seasonal.sunset
    ? `<tr><td>Sunset</td><td>${seasonal.sunset}</td></tr>`
    : ""
}

</table>

<p>These are typical seasonal figures, not a live forecast.</p>

</div>

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

  pretty(value) {
    return String(value || "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  },
};
