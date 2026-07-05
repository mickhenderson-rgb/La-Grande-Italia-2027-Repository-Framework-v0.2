/*
=========================================================

COMPASS-TOS

Accommodation Manager

Version 1.0.0

=========================================================
*/

const Accommodation = {
  open(day) {
    Render.show(Layout.render(this.render(day)));
  },

  render(day) {
    return `

<div class="manager">

    <div class="hero">

        <h1>

            Accommodation

        </h1>

        <p>

            Day ${day.day}

        </p>

    </div>

    <div class="manager-grid">

        ${this.currentAccommodation()}

        ${this.shortlist()}

        ${this.bookingStatus()}

        ${this.notes()}

    </div>

</div>

`;
  },

  currentAccommodation() {
    return `

<div class="manager-card">

<h2>

Current Accommodation

</h2>

<p>

None Selected

</p>

<button>

Choose Accommodation

</button>

</div>

`;
  },

  shortlist() {
    return `

<div class="manager-card">

<h2>

Shortlist

</h2>

<ul>

<li>Brera Apartments</li>

<li>Hotel Milano</li>

<li>Airbnb Apartment</li>

</ul>

<button>

Add Accommodation

</button>

</div>

`;
  },

  bookingStatus() {
    return `

<div class="manager-card">

<h2>

Booking

</h2>

<table>

<tr>

<td>Status</td>

<td>Research</td>

</tr>

<tr>

<td>Booked</td>

<td>No</td>

</tr>

<tr>

<td>Paid</td>

<td>No</td>

</tr>

<tr>

<td>Locked</td>

<td>No</td>

</tr>

</table>

</div>

`;
  },

  notes() {
    return `

<div class="manager-card">

<h2>

Planning Notes

</h2>

<textarea

rows="8"

placeholder="Accommodation notes...">

</textarea>

</div>

`;
  },
};
