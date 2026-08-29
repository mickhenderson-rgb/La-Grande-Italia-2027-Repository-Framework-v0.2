/*
=========================================================

COMPASS-TOS

Guide

Version 1.0.0

How to use the app. The "Travel Guide" sidebar entry has
rendered "isn't built yet - check back in a future update"
since it was added; this is what it was for.

NOT a guide to travelling. The sidebar has always grouped it
under "App", beside Settings, rather than under "Plan" with
Destinations - so it was an app-level thing from the start,
and this is faithful to that rather than a hijack of it.

TWO HALVES, AND THE FIRST ONE IS THE POINT

Static help answers "how does this work". It cannot answer
"what should I do now", which is the question someone
actually has when they open a new trip and see fifteen empty
sections.

So START HERE is live. It reads the trip in front of you and
says which of the five steps are done, which is next, and
links straight to it. On a finished trip it says so and gets
out of the way.

The rest is reference, searchable, and deliberately explains
the things the screens themselves cannot:

  - accommodation and transport are keyed to DAY NUMBERS,
    not dates, and Check-out Day is the day you LEAVE
  - an item's status is not decoration; it decides which
    Budget tier the money lands in
  - Destinations, Trip Map and Readiness have no "add"
    button because they are derived from Planner days

Every fact here was checked against the code rather than
remembered. A guide that is confidently wrong is worse than
no guide, because it is believed.

=========================================================
*/

const Guide = {
  // Set when opened via Guide.open("accommodation") from elsewhere, so a
  // "?" next to a confusing field can land on the paragraph about it.
  topic: null,

  query: "",

  open(topic) {
    this.topic = topic || null;

    this.query = "";

    Render.show(Layout.render(this.render()));

    if (this.topic) {
      this.scrollToTopic(this.topic);
    }
  },

  scrollToTopic(id) {
    const el = document.getElementById("guide-" + id);

    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });

      el.classList.add("is-target");
    }
  },

  // ---------------------------------------------------------- Start here

  // The five things that have to be true before a trip is a trip. Checked
  // against the real data, in the order they have to happen - there is no
  // point suggesting accommodation for days that do not exist yet.
  steps() {
    const projectData = Project.get("project") || {};

    const trip = projectData.project || {};

    const journey = Project.get("journey") || {};

    const days = Array.isArray(journey.days) ? journey.days : [];

    const withOvernight = days.filter((d) => String(d.overnight || "").trim()).length;

    const booked = this.countBooked();

    return [
      {
        id: "dates",
        title: "Give the trip its dates",
        done: !!trip.departureDate,
        detail: trip.departureDate
          ? `Starts ${Format.date(trip.departureDate)}.`
          : "Everything else counts from the start date, so this comes first.",
        action: "Router.navigate('settings')",
        actionLabel: "Open Settings",
      },
      {
        id: "days",
        title: "Add the days",
        done: days.length > 0,
        detail:
          days.length > 0
            ? `${days.length} ${days.length === 1 ? "day" : "days"} in the journey.`
            : "One card per day. Add them one at a time in the Planner, or paste a whole schedule in at once with Itinerary.",
        action: "Router.navigate('itinerary')",
        actionLabel: "Bulk import",
        secondAction: "Router.navigate('planner')",
        secondLabel: "Open Planner",
      },
      {
        id: "overnight",
        title: "Say where you sleep each night",
        done: days.length > 0 && withOvernight === days.length,
        detail:
          days.length === 0
            ? "Once there are days to fill in."
            : withOvernight === days.length
              ? "Every day has an overnight location."
              : `${withOvernight} of ${days.length} days have one. Destinations, the Trip Map and the weather all come from this - a day without one is invisible to all three.`,
        action: "Router.navigate('planner')",
        actionLabel: "Open Planner",
      },
      {
        id: "book",
        title: "Book something",
        done: booked > 0,
        detail:
          booked > 0
            ? `${booked} ${booked === 1 ? "item is" : "items are"} Booked.`
            : "Add flights, somewhere to stay, and how you get between stops. Set each one's status as you go - that is what moves the money between Budget's tiers.",
        action: "Router.navigate('accommodation')",
        actionLabel: "Accommodation",
        secondAction: "Router.navigate('flights')",
        secondLabel: "Flights",
      },
      {
        id: "check",
        title: "Let Readiness find the gaps",
        done: false,
        detail:
          "It reads the whole trip and lists what is missing in plain English - nights with nowhere to sleep, stops with no way to get between them. Worth a look whenever you have added a batch of things.",
        action: "Router.navigate('readiness')",
        actionLabel: "Open Readiness",
        always: true,
      },
    ];
  },

  countBooked() {
    return ["flights", "accommodation", "transport", "activities", "restaurants"].reduce((total, key) => {
      const data = Project.get(key);

      const items = data && Array.isArray(data.items) ? data.items : [];

      return total + items.filter((i) => i.status === "Booked").length;
    }, 0);
  },

  renderStartHere() {
    const steps = this.steps();

    // "always" steps are never ticked off - Readiness is worth returning to
    // rather than something you finish once.
    const outstanding = steps.filter((s) => !s.done && !s.always);

    const heading =
      outstanding.length === 0
        ? "This trip has everything it needs."
        : `Next: ${outstanding[0].title.toLowerCase()}`;

    const rows = steps
      .map((step) => {
        const mark = step.always ? "○" : step.done ? "✓" : "○";

        const cls = step.always ? "is-open" : step.done ? "is-done" : "is-open";

        const buttons = [
          `<button type="button" onclick="${step.action}">${this.esc(step.actionLabel)}</button>`,
          step.secondAction
            ? `<button type="button" onclick="${step.secondAction}">${this.esc(step.secondLabel)}</button>`
            : "",
        ].join("");

        return `

<li class="guide-step ${cls}">

    <span class="guide-step-mark" aria-hidden="true">${mark}</span>

    <div class="guide-step-body">

        <h3>${this.esc(step.title)}</h3>

        <p>${this.esc(step.detail)}</p>

        ${step.done && !step.always ? "" : `<div class="guide-step-actions">${buttons}</div>`}

    </div>

</li>

`;
      })
      .join("");

    return `

<div class="manager-card" id="guide-start">

    <h2>Start here</h2>

    <p class="guide-lead">${this.esc(heading)}</p>

    <ol class="guide-steps">${rows}</ol>

</div>

`;
  },

  // ---------------------------------------------------------- Reference

  // Written from the code, not from memory. Where a number appears here it
  // was read out of the module that owns it.
  topics() {
    return [
      {
        id: "day-numbers",
        title: "Day numbers, not dates",
        keywords: "day number date check-in check-out night accommodation transport",
        body: [
          "Accommodation and transport are keyed to the trip's DAY NUMBERS rather than to calendar dates. Day 1 is the day you leave, whatever date that turns out to be.",
          "That is deliberate: change the trip's start date in Settings and every booking stays attached to the right day of the trip instead of being stranded on a date that no longer means anything.",
          "The one that catches people: <strong>Check-out Day is the day you LEAVE</strong>. Three nights from Day 1 is Check-out Day 4, not Day 3. The form says so under the field.",
        ],
      },
      {
        id: "statuses",
        title: "What the statuses actually do",
        keywords: "status research shortlisted selected booked travel review budget tier estimated allocated actual",
        body: [
          "Every flight, stay, activity, restaurant and transport item carries one of six statuses: <strong>Research → Shortlisted → Selected → Booked → Travel → Review</strong>.",
          "They are not decoration. They decide which tier of the Budget the money lands in:",
          "<ul><li><strong>Estimated</strong> — Research, Shortlisted, Selected. Things you are still thinking about.</li><li><strong>Allocated</strong> — Booked. Committed, and the money is effectively spent.</li><li><strong>Actual</strong> — Travel, Review. What the trip really cost, alongside anything logged in Expenses.</li></ul>",
          "So moving something from Selected to Booked moves its price from Estimated to Allocated without you touching the Budget page.",
        ],
      },
      {
        id: "derived",
        title: "Why some pages have no Add button",
        keywords: "destinations trip map readiness derived add button empty",
        body: [
          "Destinations, Trip Map and Readiness are all <em>derived</em> — they read the Planner's days rather than holding anything of their own. That is why none of them has an \"Add\" button.",
          "If a stop is missing from the map, or a destination you expected is not listed, the fix is always the same: give that day an overnight location in the Planner.",
        ],
      },
      {
        id: "planner",
        title: "Planner",
        keywords: "planner day card edit insert delete overnight location transit",
        body: [
          "One card per day of the trip. Each day has a title, a location, and an <strong>overnight</strong> — where you actually sleep that night, which is what the map and Destinations read.",
          "Tick <strong>In transit overnight</strong> for a night spent on a plane, a sleeper train or a ferry. Those nights are not places, and marking them stops the map trying to route to one.",
          "Deleting a day renumbers every day after it, and takes any transport, expenses or journal entries attached to it. The confirmation says how many.",
        ],
      },
      {
        id: "itinerary",
        title: "Itinerary import",
        keywords: "itinerary import bulk paste grid csv schedule",
        body: [
          "The fastest way to start: paste or type a whole day-by-day schedule at once instead of adding days one at a time.",
          "It checks every row before it commits anything and lists each problem separately — one line per bad day — so you can fix them all in one pass.",
          "If the trip already has days you choose whether to replace them or add the new ones after.",
        ],
      },
      {
        id: "accommodation",
        title: "Accommodation",
        keywords: "accommodation hotel stay nights check-in check-out price per night",
        body: [
          "Where you are staying, keyed by check-in and check-out DAY (see \"Day numbers, not dates\").",
          "A price marked <em>per night</em> is multiplied by the nights between those two days, so the Budget shows the real total rather than the nightly rate.",
          "Several options for the same nights is normal — that is what Research and Shortlisted are for. Only one needs to end up Booked.",
        ],
      },
      {
        id: "flights",
        title: "Flights",
        keywords: "flight airline leg stopover airport IATA code terminal",
        body: [
          "One booking can have several legs. Sydney → Doha → Milan is one ticket with one price, not two flights, so add the second leg with <strong>+ Add Stopover</strong>.",
          "From and To take an <strong>airport code</strong>. Type a code, an airport name, or just a city — typing \"Milan\" offers Malpensa and Linate by name, and Bergamo because it is nearby, which no amount of typing \"Milan\" would ever have found by name alone.",
          "The last leg's arrival date is what keeps the rest of the journey in step, so it is worth getting right.",
        ],
      },
      {
        id: "budget",
        title: "Budget and Expenses",
        keywords: "budget expenses money currency cap over under tiers spend",
        body: [
          "Budget adds up everything you have entered, split into the three tiers described under \"What the statuses actually do\", converted to whichever currency you pick.",
          "Expenses is separate and is what you actually spent — logged as you go, either there or from the Journal's Tonight tab.",
          "A budget cap is optional. Set one and the summary tells you what is left, or by how much you are over.",
        ],
      },
      {
        id: "journal",
        title: "Journal",
        keywords: "journal tonight notes photos entries writing spend",
        body: [
          "One entry per day, written before, during or after — the same entry grows rather than being replaced.",
          "<strong>Tonight</strong> is the fast path for the evening of a travel day: today's photos, what happened, what you spent. It only appears when one of the trip's days is actually today.",
          "What you type is kept in this browser as you go, so a failed save costs you nothing. Photos need a connection.",
        ],
      },
      {
        id: "exports",
        title: "Getting the journal out",
        keywords: "export pdf photo book production zip print share html",
        body: [
          "Three ways out, for three different jobs:",
          "<ul><li><strong>Export</strong> — one self-contained HTML file with the photos embedded. Email it, open it anywhere, no app needed.</li><li><strong>Photo Book</strong> — lays the journal out as book pages and opens your print dialog. Save as PDF and a printer can use it.</li><li><strong>Export for Production</strong> — a zip of the photos as files and the writing as text, numbered in trip order, for dropping into a book app or handing to a designer.</li></ul>",
        ],
      },
      {
        id: "map",
        title: "Trip Map",
        keywords: "map route driving leg train ferry flight pin location coordinates",
        body: [
          "Draws the trip stop by stop, and routes each leg by how you are actually travelling it — a road for a drive, a straight line for a train, ferry or flight, because those do not follow roads.",
          "A <strong>red dotted line</strong> means it expected a road and could not find one. Nine times in ten that is a pin sitting somewhere with no road near it; drag it onto the town and it usually resolves.",
          "A stop flagged <strong>NO LOCATION</strong> has no coordinates yet, so nothing can be drawn to or from it.",
        ],
      },
      {
        id: "readiness",
        title: "Readiness",
        keywords: "readiness checklist gaps missing ready check",
        body: [
          "Reads the whole trip and lists what is missing in plain English — nights with nowhere to sleep, stops with no way to get between them, things still unbooked, prices not filled in, days with no title.",
          "Each finding links straight to the day it is about.",
        ],
      },
      {
        id: "sharing",
        title: "Sharing a trip",
        keywords: "share sharing permission guest read write collaborator access invite",
        body: [
          "From the trip list, <strong>Share</strong> gives someone else access to that one trip, by username or email. Three levels:",
          "<ul><li><strong>Read-only</strong> — sees everything, including the budget.</li><li><strong>Read / Write</strong> — can change things.</li><li><strong>Guest</strong> — the plan, the route and the activities, but <em>no costs</em>. For someone coming along who does not need to see what it all cost.</li></ul>",
          "Inviting someone to the app is a different thing, and is the <strong>+ Invite Someone</strong> button on the trip list.",
        ],
      },
      {
        id: "offline",
        title: "Offline, and where things are saved",
        keywords: "offline save server internet connection sync pwa install",
        body: [
          "Everything is saved to your own server as you go. There is no cloud account and nothing leaves the machine it is hosted on.",
          "The app is not built to work offline. Text you are writing in the Journal is kept in your browser so a dropped connection does not lose it, but saving, photos and maps all need a connection.",
          "If a save fails you get a message that stays on screen until you dismiss it — if you did not see one, it saved.",
        ],
      },
    ];
  },

  matches(topic) {
    const q = this.query.trim().toLowerCase();

    if (!q) {
      return true;
    }

    const hay = (topic.title + " " + topic.keywords + " " + topic.body.join(" ")).toLowerCase();

    // Every word has to appear somewhere, so "map route" narrows rather
    // than widens - which is what a person typing two words expects.
    return q.split(/\s+/).every((word) => hay.indexOf(word) >= 0);
  },

  onSearch(value) {
    this.query = value;

    const list = document.getElementById("guide-topics");

    const empty = document.getElementById("guide-no-results");

    if (!list) {
      return;
    }

    const found = this.topics().filter((t) => this.matches(t));

    list.innerHTML = found.map((t) => this.renderTopic(t)).join("");

    if (empty) {
      empty.hidden = found.length > 0;
    }
  },

  renderTopic(topic) {
    return `

<section class="manager-card guide-topic" id="guide-${this.esc(topic.id)}">

    <h2>${this.esc(topic.title)}</h2>

    ${topic.body.map((p) => `<p>${p}</p>`).join("")}

</section>

`;
  },

  render() {
    const topics = this.topics().filter((t) => this.matches(t));

    return `

<div class="manager">

    <section class="hero">

        <h1>

            Guide

        </h1>

        <p>

            How this app works, and what to do next with the trip you have open.

        </p>

    </section>

    ${this.renderStartHere()}

    <div class="manager-card form-card">

        <label class="form-field">
            Search the guide
            <input type="search" id="guide-search" placeholder="e.g. check-out day, budget, sharing"
                   autocomplete="off" oninput="Guide.onSearch(this.value)">
        </label>

    </div>

    <p class="guide-empty" id="guide-no-results" hidden>Nothing matches that. Try a single word.</p>

    <div id="guide-topics">${topics.map((t) => this.renderTopic(t)).join("")}</div>

    <div class="planner-buttons">

        <button type="button" onclick="Router.navigate('dashboard')">

            ← Back to Dashboard

        </button>

    </div>

</div>

`;
  },

  // A "?" that opens the guide at the paragraph explaining this field.
  // Returned as markup so a form can drop it in beside a label.
  hint(topic, label) {
    return `<button type="button" class="guide-hint" onclick="Guide.open('${this.esc(topic)}')" aria-label="${this.esc(label || "What does this mean?")}" title="${this.esc(label || "What does this mean?")}">?</button>`;
  },

  esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
