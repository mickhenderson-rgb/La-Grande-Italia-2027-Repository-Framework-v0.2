/*
=========================================================

La Grande Italia 2027
Travel Operating System

Dashboard Component

Repository 1.1.1

=========================================================
*/

const Dashboard = {
  render() {
    return `

<section class="dashboard">

    <div class="hero-card">

        <h1>La Grande Italia 2027</h1>

        <h2>The Henderson Grand Tour</h2>

        <p>
            Interactive Travel Operating System
        </p>

    </div>

    <div class="dashboard-grid">

        <div class="dashboard-card">

            <h3>Departure</h3>

            <p id="departureDate">
                23 August 2027
            </p>

        </div>

        <div class="dashboard-card">

            <h3>Duration</h3>

            <p>
                48 Nights
            </p>

        </div>

        <div class="dashboard-card">

            <h3>Travellers</h3>

            <p>
                4 → 3 Adults
            </p>

        </div>

        <div class="dashboard-card">

            <h3>Budget</h3>

            <p>
                A$31K – A$35.5K
            </p>

        </div>

    </div>

    <div class="dashboard-grid">

        <div class="dashboard-card">

            <h3>Project Status</h3>

            <ul>

                <li>✅ Repository Healthy</li>

                <li>✅ Framework Stable</li>

                <li>✅ JSON Loaded</li>

                <li>✅ Navigation Loaded</li>

            </ul>

        </div>

        <div class="dashboard-card">

            <h3>Next Development Step</h3>

            <p>

                Build the Travel Planner.

            </p>

        </div>

    </div>

</section>

`;
  },
};
