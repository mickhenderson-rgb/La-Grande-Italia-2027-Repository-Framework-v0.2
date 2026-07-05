/*
=========================================================

COMPASS-TOS

Dashboard

Sprint 1

=========================================================
*/

const Dashboard = {
  render() {
    return `

<div class="dashboard">

    <section class="hero">

        <h1>

            COMPASS

        </h1>

        <p class="subtitle">

            Travel Operating System

        </p>

        <h2>

            La Grande Italia 2027

        </h2>

    </section>

    <section class="summary-grid">

        <div class="summary-card">

            <h3>Departure</h3>

            <p id="departureDate">

                23 August 2027

            </p>

        </div>

        <div class="summary-card">

            <h3>Countdown</h3>

            <p id="countdown">

                Calculating...

            </p>

        </div>

        <div class="summary-card">

            <h3>Current Budget</h3>

            <p>

                A$31,482

            </p>

        </div>

        <div class="summary-card">

            <h3>Progress</h3>

            <p>

                Flights Pending

            </p>

        </div>

   ${Planner.render()}

</div>

`;
  },

  initialise() {
    this.updateCountdown();
  },

  updateCountdown() {
    const departure = new Date("2027-08-23");

    const today = new Date();

    const diff = departure - today;

    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    const target = document.getElementById("countdown");

    if (target) {
      target.textContent = `${days} Days`;
    }
  },
};
