/*
=========================================================

COMPASS-TOS

Accommodation Manager

Version 3.0.0

Build 10C

=========================================================
*/

const Accommodation = {
  currentDay: null,

  currentDestination: "",

  editingId: null,

  showAll: false,

  returnDestinationId: null,

  saving: false,

  open(day) {
    this.currentDay = day;

    this.currentDestination = String(
      day.location || day.overnight || "",
    ).toLowerCase();

    this.showAll = false;

    this.returnDestinationId = null;

    this.editingId = null;

    Render.show(Layout.render(this.render()));
  },

  openAll() {
    this.currentDay = null;

    this.currentDestination = "";

    this.showAll = true;

    this.returnDestinationId = null;

    this.editingId = null;

    Render.show(Layout.render(this.render()));
  },

  openForDestination(locationId) {
    this.currentDay = null;

    this.currentDestination = String(locationId || "").toLowerCase();

    this.showAll = false;

    this.returnDestinationId = locationId;

    this.editingId = null;

    Render.show(Layout.render(this.render()));
  },

  backAction() {
    if (this.currentDay) {
      return `Day.open(${this.currentDay.day})`;
    }

    if (this.returnDestinationId) {
      return `Destination.open('${this.returnDestinationId}')`;
    }

    return `Router.navigate('dashboard')`;
  },

  render() {
    const items = this.getAccommodation();

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Accommodation Research

        </h1>

        <h2>

            ${this.showAll ? "All Destinations" : this.pretty(this.currentDestination)}

        </h2>

        <p>

            ${items.length} accommodation option${items.length === 1 ? "" : "s"}

        </p>

    </section>

    <div class="planner-buttons">

        <button
            type="button"
            onclick="Accommodation.add()">

            + Add Accommodation

        </button>

        <button
            type="button"
            onclick="${this.backAction()}">

            ← Back

        </button>

    </div>

    <div class="manager-grid">

        ${this.showAll ? "" : this.renderCurrent(items)}

        ${this.renderResearch(items)}

        ${this.renderBooking(items)}

        ${this.showAll ? "" : this.renderNotes(items)}

    </div>

</div>

`;
  },

  getAccommodation() {
    const data = Project.get("accommodation");

    if (!data || !Array.isArray(data.items)) {
      return [];
    }

    if (this.showAll) {
      return data.items;
    }

    return data.items.filter((item) => {
      return (
        String(item.destination || "").toLowerCase() === this.currentDestination
      );
    });
  },

  renderCurrent(items) {
    const selected = items.find((item) => item.selected);

    if (!selected) {
      return `

<div class="manager-card">

<h2>

Current Accommodation

</h2>

<p>

No accommodation selected.

</p>

</div>

`;
    }

    return `

<div class="manager-card">

<h2>

Current Accommodation

</h2>

<strong>

${this.esc(selected.name) || "Unnamed Accommodation"}

</strong>

<p>

${this.esc(selected.provider)}

</p>

<p>

Status: ${selected.status}

</p>

<p>

${Format.date(selected.dates?.checkIn) || "?"} → ${Format.date(selected.dates?.checkOut) || "?"}

</p>

</div>

`;
  },

  renderResearch(items) {
    if (items.length === 0) {
      return `

<div class="manager-card">

    <div class="empty-state">

        <span class="empty-icon" aria-hidden="true">🛏</span>

        <p>No accommodation here yet.</p>

        <button type="button" class="btn-primary" onclick="Accommodation.add()">Add accommodation</button>

    </div>

</div>

`;
    }

    let html = `

<div class="manager-card">

<h2>

Research List

</h2>

<div class="research-list">

`;

    // Grouped by WHEN you stay, not the order they happened to be typed
    // in. Options for the same nights belong together - that is how you
    // compare them, and it is how the Budget already groups them.
    this.groupByStay(items).forEach((group) => {
      html += `<h3 class="acc-stay-head">${this.esc(group.label)}</h3>`;

      group.items.forEach((item) => {
        html += this.renderItem(item);
      });
    });

    html += `

</div>

<button
    type="button"
    onclick="Accommodation.add()">

+ Add Accommodation

</button>

</div>

`;

    return html;
  },

  // Options for one stay, in trip order.
  //
  // Keyed on the day range alone rather than destination too: the same
  // nights in the same town is the same stay whether you typed "milan"
  // or the name of a suburb, and the whole point is to see the options
  // side by side.
  groupByStay(items) {
    const groups = [];

    const byKey = {};

    items.forEach((item) => {
      const range = Array.isArray(item.dayRange) ? item.dayRange : null;

      const from = range && typeof range[0] === "number" ? range[0] : null;

      const to = range && typeof range[1] === "number" ? range[1] : null;

      // No dates is its own group at the END: it is not comparable to
      // anything, and hiding it among dated stays is how it stays
      // forgotten.
      const key = from === null ? "zz-undated" : from + "-" + to;

      if (!byKey[key]) {
        byKey[key] = { key: key, from: from, to: to, label: this.stayLabel(from, to), items: [] };

        groups.push(byKey[key]);
      }

      byKey[key].items.push(item);
    });

    return groups.sort((a, b) => {
      if (a.from === null) { return 1; }

      if (b.from === null) { return -1; }

      return a.from - b.from || a.to - b.to;
    });
  },

  stayLabel(from, to) {
    if (from === null) {
      return "No dates set";
    }

    const nights = Math.max(1, (to || from) - from);

    const dates = [Dates.getDayDate(from), Dates.getDayDate(to || from)]
      .filter(Boolean)
      .map((d) => Format.date(d));

    const when = dates.length === 2 ? ` · ${dates[0]} to ${dates[1]}` : "";

    return `Day ${from} to ${to || from}${when} · ${nights} ${nights === 1 ? "night" : "nights"}`;
  },

  // A booking link you can actually click.
  //
  // The URL has been stored since the field existed and rendered as
  // plain text, so comparing three shortlisted hotels meant copying each
  // one out by hand. Same helper the Planner's day snapshot already uses.
  bookingLink(item) {
    const url = String((item && item.website) || "").trim();

    if (!url) {
      return "";
    }

    // Typed without a scheme it is a relative path, which would navigate
    // inside the app rather than out to the hotel.
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    // No arrow in the label: .snap-link::after already adds one, and
    // having both rendered "Open booking site ↗ ↗".
    return `<a class="snap-link acc-booking-link" href="${this.esc(href)}" target="_blank" rel="noopener">Open booking site</a>`;
  },

  // A border and a flag when this booking's dates disagree with the days
  // it sits on.
  //
  // Readiness has the detail, but this is the card you BOOK from - you
  // click the link here and pay. A warning on a screen you have to go and
  // visit is a warning you get after the money has gone.
  //
  // Guarded on Readiness because accommodation.js loads before it.
  dateFlag(item) {
    if (typeof Readiness === "undefined") {
      return "";
    }

    const issues = Readiness.dateIssuesFor(item, "accommodation");

    if (issues.length === 0) {
      return "";
    }

    const which = issues.map((i) => i.label.toLowerCase()).join(" and ");

    return `<span class="badge badge--datewarn">⚠ ${this.esc(which)} ${issues.length === 1 ? "does" : "do"} not match the day</span>`;
  },

  hasDateIssue(item) {
    return typeof Readiness !== "undefined" && Readiness.dateIssuesFor(item, "accommodation").length > 0;
  },

  renderItem(item) {
    const amount =
      item.price && item.price.amount > 0
        ? `${Format.money(item.price.amount, item.price.currency)} / ${item.price.per || "night"}`
        : "Price not entered";

    return `

<div class="research-item${item.selected ? " is-selected" : ""}${this.hasDateIssue(item) ? " has-date-issue" : ""}">

    <strong>

        ${this.esc(item.name) || "Unnamed Accommodation"}
        ${this.showAll ? `<span class="badge">${this.pretty(item.destination)}</span>` : ""}
        ${this.dateFlag(item)}

    </strong>

    <p>

        ${this.esc(item.provider) || "Unknown Provider"}
        ${this.bookingLink(item)}

    </p>

    <p>

        ${amount}${Currency.inlineConversion(item.price)}

    </p>

    <p>

        Status:
        <span class="badge badge--${String(item.status || "").toLowerCase()}">${item.status}</span>
        ${Participants.chips(item)}
        ${item.selected ? '<span class="badge">Selected</span>' : ""}
        ${item.addedBy ? `<span class="badge">Added by ${this.esc(item.addedBy)}</span>` : ""}

    </p>

    <div class="research-actions">

        ${
          this.showAll
            ? ""
            : `<button type="button" onclick="Accommodation.select('${item.id}')">${item.selected ? "Selected" : "Select"}</button>`
        }

        ${MapLinks.renderButtons(item)}

        <button
            type="button"
            onclick="Accommodation.edit('${item.id}')">

            Edit

        </button>

        <button
            type="button"
            onclick="Accommodation.remove('${item.id}')">

            Delete

        </button>

    </div>

</div>

`;
  },

  renderBooking(items) {
    const booked = items.filter((item) => item.status === "Booked").length;

    const selected = items.filter((item) => item.selected).length;

    return `

<div class="manager-card">

<h2>

Booking Status

</h2>

<table>

<tr>

<td>

Research

</td>

<td>

${items.length}

</td>

</tr>

<tr>

<td>

Selected

</td>

<td>

${selected}

</td>

</tr>

<tr>

<td>

Booked

</td>

<td>

${booked}

</td>

</tr>

</table>

</div>

`;
  },

  renderNotes(items) {
    const selected = items.find((item) => item.selected);

    return `

<div class="manager-card">

<h2>

Planning Notes

</h2>

<textarea
rows="10"
readonly>

${selected ? selected.planning.notes : ""}

</textarea>

</div>

`;
  },

  add() {
    this.editingId = null;

    Render.show(Layout.render(this.renderForm(this.blankItem())));
  },

  edit(id) {
    const data = Project.get("accommodation");

    if (!data || !Array.isArray(data.items)) {
      return;
    }

    const item = data.items.find((x) => x.id === id);

    if (!item) {
      return;
    }

    this.editingId = id;

    Render.show(Layout.render(this.renderForm(item)));
  },

  select(id) {
    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/accommodation/${id}/select`, {
      method: "POST",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Select failed with status ${response.status}`);
        }

        const data = Project.get("accommodation");

        if (data && Array.isArray(data.items)) {
          data.items.forEach((item) => {
            if (item.destination === this.currentDestination || item.id === id) {
              item.selected = item.id === id;

              if (item.id === id && item.status === "Research") {
                item.status = "Selected";
              }
            }
          });
        }

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not select accommodation:", error);

        UI.fail("Couldn't save that selection. Check the connection and try again.");
      });
  },

  refresh() {
    if (this.showAll) {
      this.openAll();
    } else if (this.currentDay) {
      this.open(this.currentDay);
    } else if (this.returnDestinationId) {
      this.openForDestination(this.returnDestinationId);
    } else {
      this.openAll();
    }
  },

  // Called after a successful save instead of refresh() directly. A
  // day-scoped view (open(day)) filters by day.location/overnight - if
  // that's blank (every new trip's default) or just different from what
  // was typed as the item's Destination, a plain refresh() would re-open
  // the same day and the item would vanish from the list it was just
  // saved from (it's still correctly saved and still shows on the Planner,
  // which matches by day range, not destination text - only this module's
  // own list view is affected). Follow the item to where it'll actually
  // show instead of leaving the user looking at a now-empty filtered view.
  refreshAfterSave(item) {
    if (
      !this.showAll &&
      this.currentDay &&
      item &&
      item.destination &&
      item.destination.toLowerCase() !== this.currentDestination
    ) {
      this.openForDestination(item.destination);

      return;
    }

    this.refresh();
  },

  remove(id) {
    UI.confirm({
      title: "Remove this accommodation option?",
      body: "This cannot be undone.",
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: () => this.removeConfirmed(id),
    });
  },

  removeConfirmed(id) {
    fetch(`${window.API_BASE}/api/items/${Data.currentProjectFolder}/accommodation/${id}`, {
      method: "DELETE",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Remove failed with status ${response.status}`);
        }

        const data = Project.get("accommodation");

        if (data && Array.isArray(data.items)) {
          data.items = data.items.filter((item) => item.id !== id);
        }

        this.refresh();
      })
      .catch((error) => {
        console.error("Could not remove accommodation:", error);

        UI.fail("Couldn't remove that item. Check the connection and try again.");
      });
  },

  // Guests follows the picker, because a room booked for the four people
  // you just ticked is four guests - and the city tax is charged per head,
  // so getting it from a field nobody remembers to change is how a trip
  // ends up a couple of hundred euro short.
  //
  // Only ever a FILL-IN. Typing over it afterwards sticks, and unticking
  // everybody leaves the number alone rather than resetting it to nothing.
  syncGuests() {
    const field = document.getElementById("acc-guests");

    if (!field) {
      return;
    }

    const picked = Participants.readPicker().length;

    if (picked > 0) {
      field.value = picked;
    }
  },

  // Check-out is the day you LEAVE, so a one-night stay checks out the
  // day after it checks in.
  //
  // This used to be getDayDate(dayRange[1]) alone, and a new card starts
  // with dayRange [n, n] - so it offered the same date for both, which is
  // a zero-night booking and had to be corrected by hand every time.
  defaultCheckOut(item) {
    const range = item && item.dayRange;

    const from = Array.isArray(range) ? range[0] : null;

    const to = Array.isArray(range) ? range[1] : null;

    if (typeof to === "number" && typeof from === "number" && to > from) {
      return Dates.getDayDate(to);
    }

    // Same day, or no range at all: the night after the check-in date.
    const checkIn = Dates.getDayDate(typeof from === "number" ? from : 1);

    return checkIn ? Dates.addDays(checkIn, 1) : "";
  },

  // Opens whatever is in the WEBSITE BOX right now, not what was saved.
  //
  // This is the one that was actually missing: you paste a URL, look at
  // it sitting in the field, click it - and nothing happens, because a
  // text input is not a link. Checking it before saving is the whole
  // point, so it reads the live value.
  openWebsite() {
    const field = document.getElementById("acc-website");

    const url = field ? field.value.trim() : "";

    if (!url) {
      UI.warn("Enter a website address first.", { focus: "acc-website" });

      return;
    }

    // Without a scheme the browser treats it as a path inside the app.
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    window.open(href, "_blank", "noopener");
  },

  blankItem() {
    const day = this.currentDay || {};

    return {
      id: "",
      destination: this.currentDestination,
      dayRange: [day.day || 1, day.day || 1],
      type: "accommodation",
      addedBy: Project.currentUser || "",
      // Empty means unassigned, which is what everything entered before
      // Phase 2 carries. It must never be read as "everyone".
      participants: [],
      name: "",
      status: "Research",
      selected: false,
      locked: false,
      provider: "",
      website: "",
      bookingReference: "",
      price: { amount: 0, currency: "EUR", per: "night" },
      guests: 2,
      cityTax: { perPersonPerNight: 0, maxNights: 0, currency: "EUR" },
      location: { locationId: "", address: "", latitude: null, longitude: null },
      features: {
        parking: false,
        breakfast: false,
        kitchen: false,
        washingMachine: false,
        airConditioning: false,
        wifi: false,
      },
      dates: { checkIn: "", checkOut: "", freeCancellationUntil: "" },
      planning: { priority: "High", notes: "", pros: [], cons: [] },
      actual: {
        paid: false,
        checkedIn: false,
        checkedOut: false,
        rating: null,
        review: "",
        wouldStayAgain: null,
      },
    };
  },

  renderForm(item) {
    const isNew = !item.id;

    return `

<div class="manager">

    <section class="hero">

        <h1>

            ${isNew ? "Add Accommodation" : "Edit Accommodation"}

        </h1>

        <h2>

            ${this.showAll ? "All Destinations" : this.pretty(this.currentDestination)}

        </h2>

    </section>

    <div class="manager-card form-card" data-guard="accommodation:${item.id || 'new'}">

        ${DayReference.render("Accommodation", "range", { start: "Check-in", end: "Check-out" })}

        <div class="form-grid">

            <label class="form-field">
                Destination
                <input type="text" id="acc-destination" value="${this.esc(item.destination)}" placeholder="e.g. milan">
            </label>

            <label class="form-field">
                Name
                <input type="text" id="acc-name" value="${this.esc(item.name)}" placeholder="e.g. Hotel Milano Scala">
            </label>

            <label class="form-field">
                Check-in Day
                <input type="number" id="acc-day-start" value="${(item.dayRange && item.dayRange[0]) || 1}" min="1">
            </label>

            <label class="form-field">
                ${typeof Guide !== "undefined" ? Guide.label("Check-out Day", "day-numbers", "Why day numbers, and what Check-out Day means") : "Check-out Day"}
                <input type="number" id="acc-day-end" value="${(item.dayRange && item.dayRange[1]) || 1}" min="1">
                <span class="form-hint">The day you leave - so 3 nights from Day 1 is Check-out Day 4</span>
            </label>

            <label class="form-field">
                Provider / Site
                <input type="text" id="acc-provider" value="${this.esc(item.provider)}" placeholder="Booking.com, Airbnb...">
            </label>

            <label class="form-field">
                Website / Link
                <span class="field-with-button">
                    <input type="text" id="acc-website" value="${this.esc(item.website)}">
                    <button type="button" class="btn-secondary btn-sm" onclick="Accommodation.openWebsite()">Open ↗</button>
                </span>
                <span class="form-hint">
                    Paste the booking page. The button opens whatever is in the
                    box right now, so you can check the link before saving.
                </span>
            </label>

            <label class="form-field">
                Booking Reference
                <input type="text" id="acc-reference" value="${this.esc(item.bookingReference)}">
            </label>

            <label class="form-field">
                Status
                <select id="acc-status">
                    ${this.statusOptions(item.status)}
                </select>
            </label>

            <label class="form-field">
                Priority
                <select id="acc-priority">
                    ${this.priorityOptions(item.planning?.priority)}
                </select>
            </label>

            <label class="form-field">
                Price Amount
                <input type="number" id="acc-price-amount" value="${item.price?.amount ?? 0}" min="0" step="0.01">
            </label>

            <label class="form-field">
                Currency
                <select id="acc-price-currency">${Currency.currencyOptions(item.price?.currency || "EUR")}</select>
            </label>

            <label class="form-field">
                Per
                <select id="acc-price-per">
                    <option value="night" ${item.price?.per === "night" ? "selected" : ""}>Night</option>
                    <option value="stay" ${item.price?.per === "stay" ? "selected" : ""}>Total Stay</option>
                </select>
            </label>

            <label class="form-field">
                Guests
                <input type="number" id="acc-guests" value="${item.guests ?? 2}" min="1" step="1">
                <span class="form-hint">
                    How many people are staying - the city tax is charged per
                    person. Ticking people above fills this in; type over it if
                    the booking says something different.
                </span>
            </label>

            <label class="form-field">
                City Tax
                <input type="number" id="acc-tax-rate" value="${item.cityTax?.perPersonPerNight ?? 0}" min="0" step="0.01">
                <span class="form-hint">
                    Per person, per night. Italy's tassa di soggiorno is usually
                    EUR 1-7 and is paid at the property, not with the booking - so
                    it is not in the price above.
                </span>
            </label>

            <label class="form-field">
                City Tax Capped After
                <input type="number" id="acc-tax-cap" value="${item.cityTax?.maxNights ?? 0}" min="0" step="1">
                <span class="form-hint">
                    Consecutive nights, after which you stop paying. Leave at 0
                    for no cap. Rome stops at 10, Florence at 7, Venice at 5 -
                    but every comune sets its own and they change, so check the
                    city you are actually staying in rather than trusting these.
                </span>
            </label>

            <label class="form-field">
                City Tax Currency
                <select id="acc-tax-currency">${Currency.currencyOptions(item.cityTax?.currency || item.price?.currency || "EUR")}</select>
                <span class="form-hint">
                    Usually the same as the room, and it defaults to it. Not always:
                    a Rome hotel booked through an Australian site is priced in AUD
                    while the tax is still EUR cash at the desk.
                </span>
            </label>

            <label class="form-field">
                Address
                <input type="text" id="acc-address" value="${this.esc(item.location?.address)}">
            </label>

            <label class="form-field">
                Check In
                <input type="date" id="acc-checkin" value="${this.esc(item.dates?.checkIn || Dates.getDayDate(item.dayRange?.[0]))}">
            </label>

            <label class="form-field">
                Check Out
                <input type="date" id="acc-checkout" value="${this.esc(item.dates?.checkOut || this.defaultCheckOut(item))}">
            </label>

            <label class="form-field">
                Free Cancellation Until
                <input type="date" id="acc-cancellation" value="${this.esc(item.dates?.freeCancellationUntil)}">
            </label>

        </div>

        <h3>Features</h3>

        <div class="form-grid form-grid-checkboxes">

            ${this.checkbox("acc-parking", "Parking", item.features?.parking)}
            ${this.checkbox("acc-breakfast", "Breakfast", item.features?.breakfast)}
            ${this.checkbox("acc-kitchen", "Kitchen", item.features?.kitchen)}
            ${this.checkbox("acc-washing", "Washing Machine", item.features?.washingMachine)}
            ${this.checkbox("acc-aircon", "Air Conditioning", item.features?.airConditioning)}
            ${this.checkbox("acc-wifi", "Wifi", item.features?.wifi)}

        </div>

        ${Participants.picker(item, { label: "Who's staying here", onChange: "Accommodation.syncGuests()" })}


        <label class="form-field form-field-wide">
            Notes
            <textarea id="acc-notes" rows="4">${this.esc(item.planning?.notes)}</textarea>
        </label>

        <label class="form-field form-field-wide">
            Pros (one per line)
            <textarea id="acc-pros" rows="3">${(item.planning?.pros || []).join("\n")}</textarea>
        </label>

        <label class="form-field form-field-wide">
            Cons (one per line)
            <textarea id="acc-cons" rows="3">${(item.planning?.cons || []).join("\n")}</textarea>
        </label>

    </div>

    <div class="planner-buttons">

        <button type="button" onclick="Accommodation.save('${item.id || ""}')">

            Save

        </button>

        <button type="button" onclick="${this.showAll ? 'Accommodation.openAll()' : this.currentDay ? 'Accommodation.open(Accommodation.currentDay)' : `Accommodation.openForDestination('${this.returnDestinationId}')`}">

            Cancel

        </button>

        ${!isNew ? `<button type="button" class="btn-danger" onclick="Accommodation.remove('${item.id}')">Delete</button>` : ""}

    </div>

</div>

`;
  },

  // Fills a day-reference row's day number (and, when the journey has a
  // date for it, the matching date picker too) into the open form. Never
  // clobbers a date field with "" - the number is still set, but a manually
  // adjusted date stays put if that day just doesn't have one yet.
  pickDay(dayNumber, field) {
    const date = Dates.getDayDate(dayNumber);

    if (field === "start") {
      document.getElementById("acc-day-start").value = dayNumber;

      if (date) {
        document.getElementById("acc-checkin").value = date;
      }
    } else {
      document.getElementById("acc-day-end").value = dayNumber;

      if (date) {
        document.getElementById("acc-checkout").value = date;
      }
    }
  },

  statusOptions(current) {
    const statuses = ["Research", "Shortlisted", "Selected", "Booked", "Travel", "Review"];

    return statuses
      .map(
        (status) =>
          `<option value="${status}" ${status === current ? "selected" : ""}>${status}</option>`,
      )
      .join("");
  },

  priorityOptions(current) {
    const priorities = ["High", "Medium", "Low"];

    return priorities
      .map(
        (priority) =>
          `<option value="${priority}" ${priority === current ? "selected" : ""}>${priority}</option>`,
      )
      .join("");
  },

  checkbox(id, label, checked) {
    return `

<label class="form-checkbox">
    <input type="checkbox" id="${id}" ${checked ? "checked" : ""}>
    ${label}
</label>

`;
  },

  save(id) {
    const name = document.getElementById("acc-name").value.trim();

    if (!name) {
      UI.warn("Please enter a name before saving.");
      return;
    }

    const destination = document.getElementById("acc-destination").value.trim().toLowerCase();

    if (!destination) {
      UI.warn("Please enter a destination before saving.");
      return;
    }

    const pros = document
      .getElementById("acc-pros")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const cons = document
      .getElementById("acc-cons")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    // Two explicit number fields, not a free-text "N - N" range: that used
    // to silently break if the separator wasn't a plain hyphen (an en-dash
    // "–" - which autocorrect/mobile keyboards commonly substitute, and
    // which the rest of the app uses for displaying ranges - made split("-")
    // fail silently and saved a single-day stay with no warning at all).
    const dayStart = parseInt(document.getElementById("acc-day-start").value, 10);

    if (!dayStart || dayStart < 1) {
      UI.warn("Please enter a valid Check-in Day before saving.");
      return;
    }

    const dayEndRaw = parseInt(document.getElementById("acc-day-end").value, 10);

    const dayEnd = dayEndRaw && dayEndRaw >= dayStart ? dayEndRaw : dayStart;

    if (dayEndRaw && dayEndRaw < dayStart) {
      UI.warn("Check-out Day can't be before Check-in Day - saving as a single-night stay on the Check-in Day instead.");
    }

    const isNew = !id;

    const existing = isNew ? this.blankItem() : null;

    const fields = {
      destination,
      type: "accommodation",
      addedBy: isNew ? Project.currentUser || "" : undefined,
      // Read on every save, new or not. [] when nobody is ticked, which is
      // the unassigned state rather than a failure to read the form.
      participants: Participants.readPicker(),
      name,
      provider: document.getElementById("acc-provider").value.trim(),
      website: document.getElementById("acc-website").value.trim(),
      bookingReference: document.getElementById("acc-reference").value.trim(),
      status: document.getElementById("acc-status").value,
      selected: isNew ? false : undefined,
      locked: isNew ? false : undefined,
      price: {
        amount: parseFloat(document.getElementById("acc-price-amount").value) || 0,
        currency: document.getElementById("acc-price-currency").value.trim() || "EUR",
        per: document.getElementById("acc-price-per").value,
      },
      // At least one - a stay with nobody in it is a typo, and it would
      // silently zero the tax.
      guests: Math.max(1, parseInt(document.getElementById("acc-guests").value, 10) || 1),
      // Its own currency, defaulting to the room's. They usually match, and
      // v1.26.0 assumed they always would - but a Rome hotel booked through
      // an Australian site is priced in AUD while the tax is EUR cash at the
      // desk, which is the ordinary case rather than an exotic one.
      cityTax: {
        perPersonPerNight: parseFloat(document.getElementById("acc-tax-rate").value) || 0,
        // 0 is no cap. Negative would be a typo that silently zeroed the
        // tax, so it is floored rather than trusted.
        maxNights: Math.max(0, parseInt(document.getElementById("acc-tax-cap").value, 10) || 0),
        currency:
          document.getElementById("acc-tax-currency").value.trim() ||
          document.getElementById("acc-price-currency").value.trim() ||
          "EUR",
      },
      location: {
        locationId: "",
        address: document.getElementById("acc-address").value.trim(),
        latitude: null,
        longitude: null,
      },
      dates: {
        checkIn: document.getElementById("acc-checkin").value,
        checkOut: document.getElementById("acc-checkout").value,
        freeCancellationUntil: document.getElementById("acc-cancellation").value,
      },
      features: {
        parking: document.getElementById("acc-parking").checked,
        breakfast: document.getElementById("acc-breakfast").checked,
        kitchen: document.getElementById("acc-kitchen").checked,
        washingMachine: document.getElementById("acc-washing").checked,
        airConditioning: document.getElementById("acc-aircon").checked,
        wifi: document.getElementById("acc-wifi").checked,
      },
      planning: {
        priority: document.getElementById("acc-priority").value,
        notes: document.getElementById("acc-notes").value.trim(),
        pros,
        cons,
      },
      actual: isNew ? existing.actual : undefined,
    };

    fields.dayRange = [dayStart, dayEnd];

    // Remove undefined keys so PUT (edit) doesn't blow away fields it
    // shouldn't touch, since the server does an Object.assign merge.
    Object.keys(fields).forEach((key) => {
      if (fields[key] === undefined) {
        delete fields[key];
      }
    });

    // Guards against a rapid double-click/double-tap on Save creating two
    // items - the button itself isn't disabled (it's usually replaced by
    // the next render anyway), this just ignores a second call that comes
    // in while the first one is still in flight.
    if (this.saving) {
      return;
    }

    this.saving = true;

    // These changes are on their way to the server, so navigating away
    // from the form once it succeeds must not ask about them. Guarded so a
    // deployment that somehow lacks form-guard.js still saves.
    if (typeof FormGuard !== "undefined") {
      FormGuard.release();
    }

    const url = isNew
      ? `${window.API_BASE}/api/items/${Data.currentProjectFolder}/accommodation`
      : `${window.API_BASE}/api/items/${Data.currentProjectFolder}/accommodation/${id}`;

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
        const data = Project.get("accommodation");

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

        this.saving = false;

        this.refreshAfterSave(result.item);
      })
      .catch((error) => {
        this.saving = false;

        console.error("Could not save accommodation:", error);

        UI.fail("Couldn't save that item. Check the connection and try again.");
      });
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

  // Delegates to the shared formatter - see app/format.js. Kept as a
  // local method so every existing this.pretty(...) call still works.
  pretty(value) {
    return Format.place(value);
  },
};
