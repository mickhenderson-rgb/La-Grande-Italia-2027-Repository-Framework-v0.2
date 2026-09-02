/*
=========================================================

COMPASS-TOS

Participants

Version 1.0.0

Build 58

Who is actually on the trip, and for which days.

Not everyone does the same things, and not everyone is
there the whole time: four for the first ten days, then
one flies home; someone joins halfway for a fortnight.
That changes accommodation numbers, vehicle size, and who
is on which booking - none of which the app could express.

A PARTICIPANT IS NOT A COLLABORATOR. Sharing invites app
USERS by username or email, with read/write/guest
permissions - it is about who can SEE the plan. A
participant is someone ON the trip, who may well never log
in and should never need an account to be counted.
`linkedUser` ties the two together when the same person is
both, and stays null when they are not.

DATES, NOT A FLAG. `dayRange: [joinDay, leaveDay]` is the
same shape accommodation, activities, transport and (since
v1.28.0) flights all already speak, so a joiner and a
leaver need no new concept - they are a booking-shaped fact
about a person.

DATE OF BIRTH, NOT AN AGE OR A BAND. An age goes stale the
moment a trip moves, and Copy This Trip exists precisely so
a plan can be shifted a week or a year - every copy would
carry the original's ages. A birthday is one field that is
never wrong, and the band is derived against THAT trip's
departure date.

The bands are real thresholds, not round numbers:

  under 2   infant airfare, lap child
  2 - 11    child airfare, most attraction concessions
  12 - 17   full adult airfare from 12
  18 - 24   young-driver surcharge is under 25, and many
            suppliers will not rent at all under 21
  25 - 69   no surcharges anywhere
  70+       upper age limits exist, but they are supplier
            and country specific

Nothing here CALCULATES from a band. The app cannot know
one supplier's actual rates, so from Phase 4 Readiness will
flag what to check and you still enter the real prices.

=========================================================
*/

const Participants = {
  // Real thresholds, each one because something actually changes at it.
  // Ordered youngest first; band() takes the first that fits.
  BANDS: [
    { max: 1, key: "infant", label: "Infant", note: "Lap infant fare, usually about 10% of an adult ticket." },
    { max: 11, key: "child", label: "Child", note: "Child airfare, and most attraction and city-tax concessions." },
    { max: 17, key: "youth", label: "Youth", note: "Full adult airfare from 12; still concessions at many attractions." },
    { max: 24, key: "young-adult", label: "Young adult", note: "Young-driver surcharge applies under 25, and many suppliers will not rent at all under 21." },
    { max: 69, key: "adult", label: "Adult", note: "No age-related surcharges." },
    { max: 999, key: "senior", label: "Senior", note: "Some hire-car suppliers cap the upper age - varies by country, so worth checking." },
  ],

  // Distinct enough to tell apart at a glance on a day card, and fixed
  // rather than themed: they identify a person, not a state, so they must
  // mean the same thing in light and dark.
  COLOURS: ["#2f6fb3", "#b3572f", "#3f8f5a", "#8a4f9e", "#b3902f", "#4a6b8a", "#a34f6b", "#5a7a3f"],

  // --- Reading ---------------------------------------------------------

  all() {
    const data = Project.get("project");

    const list = data && data.project && data.project.participants;

    return Array.isArray(list) ? list : [];
  },

  // EVERY ACCOUNT THAT HAS ACTUALLY TOUCHED THIS TRIP.
  //
  // Read out of the data rather than asked for over the network: every
  // item and every photo records who added it, and that is the set that
  // matters. It needs no permission - the share list is owner-only - and
  // it works for whoever is looking.
  //
  // Sorted so the list is stable between renders rather than following
  // whatever order the collections happen to be in.
  knownAccounts() {
    const seen = {};

    const note = (who) => {
      const name = String(who || "").trim();

      if (name) {
        seen[name] = true;
      }
    };

    ["accommodation", "activities", "restaurants", "transport", "flights", "expenses"].forEach((key) => {
      const data = Project.get(key);

      (data && Array.isArray(data.items) ? data.items : []).forEach((item) => note(item.addedBy));
    });

    const journal = Project.get("journal");

    (journal && Array.isArray(journal.entries) ? journal.entries : []).forEach((entry) => {
      (entry.photos || []).forEach((photo) => note(photo.addedBy));

      (entry.trace || []).forEach((point) => note(point.by));

      note(entry.notesAuthor);
    });

    note(Project.currentUser);

    return Object.keys(seen).sort();
  },

  // Accounts with photo locations that nobody has claimed.
  //
  // THE ACTIONABLE LIST. Until an account is linked, its photos cannot be
  // told from anyone else's - which is the whole reason a day where the
  // party split reads as one person in two countries.
  unlinkedAccounts() {
    const linked = {};

    this.all().forEach((person) => {
      const said = String(person.linkedUser || "").trim().toLowerCase();

      if (said) {
        linked[said] = true;
      }
    });

    return this.knownAccounts().filter((account) => !linked[account.toLowerCase()]);
  },

  // The person behind an app login, where they said which login is
  // theirs. linkedUser has been collected since participants existed and
  // never read until now.
  //
  // Null is the ordinary answer, not a failure: most participants have no
  // login at all, and a trip shared with someone who is not a participant
  // is perfectly normal.
  byUser(username) {
    const wanted = String(username || "").trim().toLowerCase();

    if (!wanted) {
      return null;
    }

    return this.all().find((p) => String(p.linkedUser || "").trim().toLowerCase() === wanted) || null;
  },

  find(id) {
    return this.all().filter((p) => p.id === id)[0] || null;
  },

  // Everyone on the trip on a given day. A participant with no dayRange is
  // there for the whole trip - that is the ordinary case, and requiring the
  // dates up front would make the common case the fiddly one.
  presentOn(dayNumber) {
    if (typeof dayNumber !== "number") {
      return [];
    }

    return this.all().filter((p) => {
      if (!Array.isArray(p.dayRange) || p.dayRange.length < 2) {
        return true;
      }

      return dayNumber >= p.dayRange[0] && dayNumber <= p.dayRange[1];
    });
  },

  // --- Ages ------------------------------------------------------------

  // Age on a given date, from a birthday. Whole years, so a birthday that
  // has not happened yet by the trip's departure does not count.
  ageOn(dob, isoDate) {
    if (!dob || !isoDate) {
      return null;
    }

    const born = String(dob).split("-").map((n) => parseInt(n, 10));

    const at = String(isoDate).split("-").map((n) => parseInt(n, 10));

    if (born.length < 3 || at.length < 3 || born.some(isNaN) || at.some(isNaN)) {
      return null;
    }

    let age = at[0] - born[0];

    // The birthday has not come round yet this year.
    if (at[1] < born[1] || (at[1] === born[1] && at[2] < born[2])) {
      age -= 1;
    }

    return age < 0 ? null : age;
  },

  departureDate() {
    const data = Project.get("project");

    return (data && data.project && data.project.departureDate) || "";
  },

  // Derived against the trip's OWN departure date, never stored. Shift the
  // dates or copy the trip to another year and this follows.
  ageAtDeparture(participant) {
    return this.ageOn(participant && participant.dob, this.departureDate());
  },

  // The oldest person ever verified was 122. Anything past that is a
  // typo, not a person.
  MAX_PLAUSIBLE_AGE: 125,

  band(age) {
    if (typeof age !== "number" || age < 0 || age > this.MAX_PLAUSIBLE_AGE) {
      return null;
    }

    return this.BANDS.filter((b) => age <= b.max)[0] || null;
  },

  // A birthday that produces an impossible age.
  //
  // The real trip had 0001-08-20 - almost certainly 2001 - which made
  // somebody 2025 years old. That fell past the last band's ceiling, so
  // band() returned null and the app simply had no age for them.
  //
  // SILENCE IS THE WRONG ANSWER TO NONSENSE: it looks exactly like "no
  // birthday given", so the mistake is invisible until a fare is wrong.
  ageLooksWrong(participant) {
    if (!participant || !participant.dob) {
      return false;
    }

    const age = this.ageAtDeparture(participant);

    // null is a date that would not parse at all, which is also wrong.
    return age === null || age < 0 || age > this.MAX_PLAUSIBLE_AGE;
  },

  bandFor(participant) {
    return this.band(this.ageAtDeparture(participant));
  },

  // --- Party size ------------------------------------------------------

  // "4 people" / "4 until Day 10, then 3" / "3, rising to 4 on Day 12".
  //
  // Walks the days rather than reasoning about joins and leaves, because
  // several people can come and go on the same day and the count is what
  // matters, not the events.
  summaryLine() {
    const people = this.all();

    if (people.length === 0) {
      return "";
    }

    const journey = Project.get("journey");

    const days = journey && Array.isArray(journey.days) ? journey.days : [];

    if (days.length === 0) {
      return `${people.length} ${people.length === 1 ? "person" : "people"}`;
    }

    const runs = [];

    days.forEach((day) => {
      const count = this.presentOn(day.day).length;

      const last = runs[runs.length - 1];

      if (last && last.count === count) {
        last.to = day.day;

        return;
      }

      runs.push({ count: count, from: day.day, to: day.day });
    });

    if (runs.length === 1) {
      return `${runs[0].count} ${runs[0].count === 1 ? "person" : "people"}`;
    }

    return runs
      .map((run, index) =>
        index === 0
          ? `${run.count} to Day ${run.to}`
          : `${run.count} from Day ${run.from}`,
      )
      .join(", then ");
  },


  // --- Assignment: who is on a booking ---------------------------------
  //
  // AN EMPTY LIST MEANS UNASSIGNED, never "everyone". That is what every
  // item entered before this build has, and it has to keep meaning exactly
  // what it meant then - nobody has said. Reading empty as everyone would
  // silently put the whole party on every booking already in the trip, and
  // from Phase 3 that would move real money.
  assignedTo(item) {
    return item && Array.isArray(item.participants) ? item.participants : [];
  },

  isAssigned(item, participantId) {
    return this.assignedTo(item).indexOf(participantId) > -1;
  },

  // The days a picker should judge "is this person even here?" against.
  // Every module knows its own shape; this just turns any of them into a
  // list of day numbers.
  daysOf(item) {
    if (!item) {
      return [];
    }

    if (Array.isArray(item.dayRange) && item.dayRange.length >= 2) {
      const out = [];

      for (let d = item.dayRange[0]; d <= item.dayRange[1]; d += 1) {
        out.push(d);
      }

      return out;
    }

    return typeof item.day === "number" ? [item.day] : [];
  },

  presentOnAny(participant, dayNumbers) {
    if (!Array.isArray(dayNumbers) || dayNumbers.length === 0) {
      return true;
    }

    return dayNumbers.some((d) => this.presentOn(d).indexOf(participant) > -1);
  },

  // The picker itself.
  //
  // Nobody is ticked by default. Mick chose that over assume-everyone: it
  // is never wrong by accident, and the Everyone button keeps the common
  // case to one tap rather than four.
  //
  // Someone who is not on the trip on these days is still LISTED and still
  // selectable, with a note saying so. Hiding them would make a booking
  // look impossible to fix when the real mistake was the dates; disabling
  // them would refuse an edit you may be about to make legitimate.
  picker(item, options) {
    const people = this.all();

    const opts = options || {};

    const label = opts.label || "Who's going";

    if (people.length === 0) {
      return `

<div class="form-field form-field-wide">

    <span class="pt-picker-label">${this.esc(label)}</span>

    <span class="form-hint">
        Nobody is on this trip yet. Add people on the
        <a href="#" onclick="Router.navigate('participants'); return false;">Participants</a>
        page and they will appear here.
    </span>

</div>

`;
    }

    const days = this.daysOf(item);

    const selected = this.assignedTo(item);

    const rows = people
      .map((p) => {
        const here = this.presentOnAny(p, days);

        return `

<label class="pt-pick">

    <input type="checkbox" class="pt-pick-box" value="${this.esc(p.id)}" ${selected.indexOf(p.id) > -1 ? "checked" : ""}${opts.onChange ? ` onchange="${this.esc(opts.onChange)}"` : ""}>

    <span class="pt-dot" style="background: ${this.esc(p.colour || this.COLOURS[0])}"></span>

    <span>${this.esc(p.name || "Unnamed")}</span>

    ${here ? "" : `<span class="pt-away">not on the trip these days</span>`}

</label>

`;
      })
      .join("");

    return `

<div class="form-field form-field-wide">

    <span class="pt-picker-label">${this.esc(label)}</span>

    <div class="pt-picker" id="pt-picker">${rows}</div>

    <div class="pt-picker-actions">

        <button type="button" onclick="Participants.pickEveryone(this)">Everyone</button>

        <button type="button" onclick="Participants.pickNobody(this)">Nobody</button>

    </div>

    <span class="form-hint">
        Leave everyone unticked if it applies to the whole party, or has not
        been decided - that is what every booking made before this had, and
        it still means the same thing.
    </span>

</div>

`;
  },

  // The tick boxes belonging to ONE picker.
  //
  // Scoped from the button that was pressed, not the document. Both of
  // these reached document-wide until a two-picker page showed what that
  // means: Everyone on the first picker silently ticked boxes in the
  // second. One form at a time makes that harmless TODAY, which is luck
  // rather than design - and Phase 3 turns these ids into money.
  boxesNear(button) {
    const field = button && button.closest ? button.closest(".form-field") : null;

    const picker = field ? field.querySelector(".pt-picker") : null;

    return (picker || document).querySelectorAll(".pt-pick-box");
  },

  // Everyone PRESENT, not everyone on the trip: a booking on Day 14 should
  // not pick up somebody who flew home on Day 10.
  // The buttons have to fire the same hook the boxes do: setting .checked
  // in script does NOT raise a change event, so a headcount that follows
  // the picker would ignore the one button most likely to change it.
  notifyChanged(button) {
    const boxes = this.boxesNear(button);

    if (boxes.length > 0 && boxes[0].onchange) {
      boxes[0].onchange();
    }
  },

  pickEveryone(button) {
    const boxes = this.boxesNear(button);

    for (let i = 0; i < boxes.length; i += 1) {
      const away = boxes[i].parentNode.querySelector(".pt-away");

      boxes[i].checked = !away;
    }

    this.notifyChanged(button);
  },

  pickNobody(button) {
    const boxes = this.boxesNear(button);

    for (let i = 0; i < boxes.length; i += 1) {
      boxes[i].checked = false;
    }

    this.notifyChanged(button);
  },

  // Read on save. Returns [] when nobody is ticked, which is the
  // unassigned state - not a failure to read the form.
  readPicker(root) {
    // The form being saved has exactly one picker, and it is #pt-picker.
    // Falling back to the document keeps this working if a caller ever
    // renders one without the wrapper.
    const scope = root || document.getElementById("pt-picker") || document;

    const boxes = scope.querySelectorAll(".pt-pick-box");

    const out = [];

    for (let i = 0; i < boxes.length; i += 1) {
      if (boxes[i].checked) {
        out.push(boxes[i].value);
      }
    }

    return out;
  },

  // --- Assignment: showing it on a card --------------------------------

  // Nothing at all when unassigned. A card that says "nobody" where it used
  // to say nothing would make every existing booking look broken.
  chips(item) {
    const ids = this.assignedTo(item);

    if (ids.length === 0) {
      return "";
    }

    const chips = ids
      .map((id) => {
        const p = this.find(id);

        if (!p) {
          return "";
        }

        return `<span class="pt-chip"><span class="pt-dot" style="background: ${this.esc(p.colour || this.COLOURS[0])}"></span>${this.esc(p.name || "Unnamed")}</span>`;
      })
      .join("");

    return chips ? `<span class="pt-chips">${chips}</span>` : "";
  },

  names(item) {
    const names = this.assignedTo(item)
      .map((id) => (this.find(id) || {}).name)
      .filter(Boolean);

    return names.join(", ");
  },

  // --- The page --------------------------------------------------------

  open() {
    Render.show(Layout.render(this.render()));
  },

  render() {
    const people = this.all();

    const legacy = this.legacyTravellers();

    return `

<div class="manager">

    <section class="hero">

        <h1>Participants</h1>

        <p>
            Who is on this trip, and for which days. Someone who joins late
            or leaves early only counts for the days they are actually here
            - which is what keeps accommodation numbers, vehicle size and
            per-person costs honest.
        </p>

        ${people.length > 0 ? `<p>👥 ${this.esc(this.summaryLine())}</p>` : ""}

    </section>

    ${legacy.length > 0 ? this.renderLegacyNotice(legacy) : ""}

    <div class="manager-card">

        ${people.length === 0 ? this.renderEmpty() : this.renderList(people)}

    </div>

</div>

`;
  },

  renderEmpty() {
    return `

<div class="empty-state">

    <span class="empty-icon" aria-hidden="true">👥</span>

    <p>Nobody added yet. A trip works perfectly well without this - add people when you want the app to keep track of who is doing what.</p>

    <button type="button" class="btn-primary" onclick="Participants.add()">Add someone</button>

</div>

`;
  },

  // The three "Traveller 1/2/3" rows every trip was created with since
  // Build 29. Nothing has ever read them, so they are offered rather than
  // migrated silently - an unnamed person appearing in your party without
  // explanation is worse than a placeholder sitting in a file.
  legacyTravellers() {
    const data = Project.get("project");

    const list = data && data.project && data.project.travellers;

    return Array.isArray(list) ? list : [];
  },

  renderLegacyNotice(legacy) {
    return `

<div class="manager-card">

    <h2>${legacy.length} placeholder ${legacy.length === 1 ? "entry" : "entries"} found</h2>

    <p>
        This trip was created with ${legacy.length} unnamed placeholder
        ${legacy.length === 1 ? "traveller" : "travellers"} that nothing in the app
        has ever used. Bring them across as real people to name, or discard them.
    </p>

    <div class="planner-buttons">

        <button type="button" class="btn-primary" onclick="Participants.adoptLegacy()">Bring ${legacy.length === 1 ? "it" : "them"} across</button>

        <button type="button" onclick="Participants.discardLegacy()">Discard</button>

    </div>

</div>

`;
  },

  renderList(people) {
    const rows = people.map((p) => this.renderRow(p)).join("");

    return `

<h2>On this trip</h2>

${this.renderUnlinkedNote()}

<div class="research-list">${rows}</div>

<button type="button" onclick="Participants.add()">+ Add someone</button>

`;
  },

  // Silent when there is nothing to do, which is most of the time.
  //
  // Deliberately not a Readiness finding: it is not a problem with the
  // TRIP, it is a thing you can only fix while looking at this page.
  renderUnlinkedNote() {
    const loose = this.unlinkedAccounts();

    if (loose.length === 0 || this.all().length === 0) {
      return "";
    }

    return `

<p class="form-hint pt-unlinked">
    ${loose.length === 1 ? "One login has" : `${loose.length} logins have`} added things to this trip and
    ${loose.length === 1 ? "is" : "are"} not linked to anyone above:
    <strong>${loose.map((a) => this.esc(a)).join(", ")}</strong>.
    Until they are, their photo locations cannot be told apart from everyone else's.
</p>

`;
  },

  renderRow(p) {
    const age = this.ageAtDeparture(p);

    const band = this.bandFor(p);

    const span = this.spanLabel(p);

    return `

<div class="research-item">

    <strong>

        <span class="pt-dot" style="background: ${this.esc(p.colour || this.COLOURS[0])}"></span>
        ${this.esc(p.name || "Unnamed")}
        ${p.linkedUser ? `<span class="badge">${this.esc(p.linkedUser)}</span>` : ""}
        ${band ? `<span class="badge">${this.esc(band.label)}</span>` : ""}

    </strong>

    <p>${this.esc(span)}${age === null ? "" : ` · ${age} at departure`}</p>

    ${
      this.ageLooksWrong(p)
        ? `<p class="pt-age-wrong">⚠ That date of birth gives an age of ${age}. Check the year.</p>`
        : band
          ? `<p class="form-hint">${this.esc(band.note)}</p>`
          : `<p class="form-hint">No date of birth, so no age-related prompts for this person.</p>`
    }

    <div class="research-actions">

        <button type="button" onclick="Participants.edit('${this.jsArg(p.id)}')">Edit</button>

        <button type="button" class="btn-danger" onclick="Participants.remove('${this.jsArg(p.id)}')">Remove</button>

    </div>

</div>

`;
  },

  spanLabel(p) {
    const days = this.tripDays();

    if (!Array.isArray(p.dayRange) || p.dayRange.length < 2) {
      return "Whole trip";
    }

    const from = p.dayRange[0];

    const to = p.dayRange[1];

    if (from <= 1 && (!days || to >= days)) {
      return "Whole trip";
    }

    const nights = to - from + 1;

    return `Day ${from} to Day ${to} · ${nights} ${nights === 1 ? "day" : "days"}`;
  },

  tripDays() {
    const journey = Project.get("journey");

    return journey && Array.isArray(journey.days) ? journey.days.length : 0;
  },

  // --- The form --------------------------------------------------------

  add() {
    Render.show(Layout.render(this.renderForm(this.blank())));
  },

  edit(id) {
    const p = this.find(id);

    if (!p) {
      return;
    }

    Render.show(Layout.render(this.renderForm(p)));
  },

  blank() {
    const used = this.all().length;

    return {
      id: "",
      name: "",
      dob: "",
      // Null rather than [1, lastDay]: "whole trip" has to survive the trip
      // getting longer. A stored range would quietly stop covering the end.
      dayRange: null,
      linkedUser: "",
      colour: this.COLOURS[used % this.COLOURS.length],
    };
  },

  renderForm(p) {
    const isNew = !p.id;

    const days = this.tripDays() || 1;

    const whole = !Array.isArray(p.dayRange) || p.dayRange.length < 2;

    return `

<div class="manager">

    <section class="hero">

        <h1>${isNew ? "Add someone" : "Edit " + this.esc(p.name || "participant")}</h1>

    </section>

    <div class="manager-card form-card">

        <div class="form-grid">

            <label class="form-field form-field-wide">
                Name
                <input type="text" id="pt-name" value="${this.esc(p.name)}" placeholder="e.g. Sam">
            </label>

            <label class="form-field">
                Date of Birth (optional)
                <input type="date" id="pt-dob" value="${this.esc(p.dob)}">
                <span class="form-hint">
                    Only used to work out their age on the departure date, so the
                    app can prompt you about child fares, young-driver surcharges
                    and city-tax exemptions. Leave it blank and none of those
                    prompts appear for this person.
                </span>
            </label>

            <label class="form-field">
                App username (optional)
                <input type="text" id="pt-user" list="pt-user-options" value="${this.esc(p.linkedUser)}" placeholder="Leave blank if they don't use the app">
                <datalist id="pt-user-options">
                    ${this.knownAccounts().map((a) => `<option value="${this.esc(a)}"></option>`).join("")}
                </datalist>
                <span class="form-hint">
                    Suggestions are the accounts that have added something to this
                    trip. Linking is what lets the map tell this person's photo
                    locations from everyone else's.
                    Only if this person also has a login and the trip is shared
                    with them. Being on the trip and being able to open it are
                    two different things - neither one implies the other.
                </span>
            </label>

            <label class="form-field form-field-wide">
                <span class="form-check">
                    <input type="checkbox" id="pt-whole" onchange="Participants.onWholeToggled()" ${whole ? "checked" : ""}>
                    Here for the whole trip
                </span>
                <span class="form-hint">Untick for someone joining late or leaving early.</span>
            </label>

            <label class="form-field">
                First Day
                <input type="number" id="pt-from" min="1" max="${days}" value="${whole ? 1 : p.dayRange[0]}" ${whole ? "disabled" : ""}>
            </label>

            <label class="form-field">
                Last Day
                <input type="number" id="pt-to" min="1" max="${days}" value="${whole ? days : p.dayRange[1]}" ${whole ? "disabled" : ""}>
                <span class="form-hint">The last day they are still here - not the day after.</span>
            </label>

        </div>

        <p class="ui-msg" id="pt-msg" hidden></p>

        <div class="planner-buttons">

            <button type="button" class="btn-primary" onclick="Participants.save('${this.jsArg(p.id)}')">Save</button>

            <button type="button" onclick="Participants.open()">Cancel</button>

        </div>

    </div>

</div>

`;
  },

  onWholeToggled() {
    const box = document.getElementById("pt-whole");

    const from = document.getElementById("pt-from");

    const to = document.getElementById("pt-to");

    if (!box || !from || !to) {
      return;
    }

    from.disabled = box.checked;

    to.disabled = box.checked;
  },

  save(id) {
    const name = document.getElementById("pt-name").value.trim();

    if (!name) {
      UI.warn("Give this person a name.", { slot: "pt-msg", focus: "pt-name" });

      return;
    }

    const whole = document.getElementById("pt-whole").checked;

    const from = parseInt(document.getElementById("pt-from").value, 10) || 1;

    const to = parseInt(document.getElementById("pt-to").value, 10) || from;

    if (!whole && to < from) {
      UI.warn("The last day cannot be before the first day.", { slot: "pt-msg", focus: "pt-to" });

      return;
    }

    const dob = document.getElementById("pt-dob").value;

    // A birthday in the future is a typo - almost always a year typed as
    // 2027 instead of 1927 - and it would silently make them an infant.
    if (dob && this.ageOn(dob, this.departureDate()) === null && this.departureDate()) {
      UI.warn("That date of birth is after the trip departs. Check the year.", { slot: "pt-msg", focus: "pt-dob" });

      return;
    }

    const data = Project.get("project");

    if (!data || !data.project) {
      return;
    }

    const list = Array.isArray(data.project.participants) ? data.project.participants : [];

    const existing = list.filter((p) => p.id === id)[0];

    const record = existing || this.blank();

    record.id = record.id || this.newId(list);

    record.name = name;

    record.dob = dob || "";

    record.linkedUser = document.getElementById("pt-user").value.trim();

    record.dayRange = whole ? null : [from, to];

    record.colour = record.colour || this.COLOURS[list.length % this.COLOURS.length];

    if (!existing) {
      list.push(record);
    }

    data.project.participants = list;

    Project.update("project", data);

    UI.ok(`${name} saved.`);

    this.open();
  },

  // Sequential rather than random: these ids go into every booking's
  // participants array, so they want to be readable when you are looking
  // at a data file trying to work out what went wrong.
  newId(list) {
    let n = list.length + 1;

    const taken = list.map((p) => p.id);

    while (taken.indexOf("p" + n) > -1) {
      n += 1;
    }

    return "p" + n;
  },

  remove(id) {
    const p = this.find(id);

    if (!p) {
      return;
    }

    UI.confirm({
      title: `Remove ${p.name || "this person"}?`,
      body: "They will be taken off the trip. Anything they were assigned to stays, with them removed from it.",
      confirmLabel: "Remove",
      tone: "danger",
      onConfirm: () => this.removeConfirmed(id),
    });
  },

  removeConfirmed(id) {
    const data = Project.get("project");

    if (!data || !data.project || !Array.isArray(data.project.participants)) {
      return;
    }

    data.project.participants = data.project.participants.filter((p) => p.id !== id);

    Project.update("project", data);

    UI.ok("Removed.");

    this.open();
  },

  // --- The old placeholders --------------------------------------------

  adoptLegacy() {
    const data = Project.get("project");

    if (!data || !data.project) {
      return;
    }

    const legacy = this.legacyTravellers();

    const list = Array.isArray(data.project.participants) ? data.project.participants : [];

    legacy.forEach((old, index) => {
      list.push({
        id: this.newId(list),
        // Kept EMPTY rather than carried across. "Traveller 1" is not a
        // name, and a list of them looks filled in when it is not.
        name: "",
        dob: "",
        dayRange: null,
        linkedUser: "",
        colour: this.COLOURS[(list.length + index) % this.COLOURS.length],
      });
    });

    delete data.project.travellers;

    data.project.participants = list;

    Project.update("project", data);

    UI.ok(`${legacy.length} ${legacy.length === 1 ? "entry" : "entries"} brought across - give them names.`);

    this.open();
  },

  discardLegacy() {
    UI.confirm({
      title: "Discard the placeholders?",
      body: "They hold no information beyond a number, and nothing in the app has ever read them.",
      confirmLabel: "Discard",
      tone: "danger",
      onConfirm: () => {
        const data = Project.get("project");

        if (!data || !data.project) {
          return;
        }

        delete data.project.travellers;

        Project.update("project", data);

        UI.ok("Placeholders discarded.");

        this.open();
      },
    });
  },

  esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  jsArg(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, "&quot;");
  },
};
