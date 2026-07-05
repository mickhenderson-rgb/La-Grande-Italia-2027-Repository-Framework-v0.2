/*
=========================================================

COMPASS-TOS

Destination View

Version 1.0.0

=========================================================
*/

const Destination = {
  current: null,

  open(id) {
    this.current = id;

    Render.show(Layout.render(this.render(id)));
  },

  render(id) {
    return `

<div class="destination">

    <div class="hero">

        <h1>

            ${this.title(id)}

        </h1>

        <p>

            Destination Workspace

        </p>

    </div>

    <div class="destination-grid">

        ${this.card("Accommodation", "🛏")}

        ${this.card("Restaurants", "🍝")}

        ${this.card("Activities", "🎯")}

        ${this.card("Transport", "🚗")}

        ${this.card("Parking", "🅿")}

        ${this.card("Budget", "💰")}

        ${this.card("Notes", "📝")}

        ${this.card("Journal", "📖")}

    </div>

    <div class="planner-buttons">

        <button onclick="Router.navigate('dashboard')">

            ← Dashboard

        </button>

    </div>

</div>

`;
  },

  card(title, icon) {
    return `

<div class="destination-card">

    <div class="destination-icon">

        ${icon}

    </div>

    <h3>

        ${title}

    </h3>

    <p>

        Coming Soon

    </p>

</div>

`;
  },

  title(id) {
    return id

      .replaceAll("-", " ")

      .replace(/\b\w/g, (c) => c.toUpperCase());
  },
};
