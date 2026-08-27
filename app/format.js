/*
=========================================================

COMPASS-TOS

Format

Version 1.0.0

One place that decides how money, dates and place names
LOOK. Nothing here fetches, converts or calculates - it
turns a value the app already holds into the text a person
reads.

It exists because the same value was being formatted three
different ways depending on which screen you were on:

  money   Budget said "AUD 3,611", the day view said
          "AUD 3611.15", expenses said "AUD 38.5" - the
          same car rental, three answers.

  dates   Planner cards printed the raw ISO "2027-08-27",
          the dashboard said "Sun, 23 Aug 2026", the map
          rail said "7-9 Sep".

  places  "vigano san martino" appeared lowercase in a day
          title and Title Case two lines below it.

Each module had grown its own money()/pretty(), so a fix in
one never reached the others. These are the house answers.

Deliberately NOT here: currency conversion (Currency owns
that, it needs live rates), date arithmetic (Dates owns
that - trip days are recalculated from facts), and any
escaping (the caller escapes, because only it knows whether
the value is going into text or an attribute).

=========================================================
*/

const Format = {
  // "AUD 3,611.15"
  //
  // Thousands separators and two decimals, always. A price is a price
  // whether it's an estimate or a receipt, and rounding "3,611.15" to
  // "3,611" on one screen made two screens disagree about the same
  // booking.
  //
  // The currency CODE, not a symbol: this app routinely shows several
  // currencies side by side, and "$" is ambiguous across three of the ones
  // in regular use here.
  money(amount, currency) {
    const value = Number(amount);

    const safe = Number.isFinite(value) ? value : 0;

    return `${currency || "EUR"} ${safe.toLocaleString("en-AU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  },

  // "Fri 27th Aug"
  //
  // Short form everywhere. The year is left off on purpose - a trip sits
  // inside one year, and the screens where the year genuinely matters (the
  // countdown, trip setup) say it in full themselves.
  //
  // Returns "" for a missing date and the input untouched for something
  // unparseable, so a bad value shows as itself rather than as "Invalid
  // Date" or a crash.
  date(value) {
    const text = String(value || "").trim();

    if (!text) {
      return "";
    }

    const parsed = this.parseISO(text);

    if (!parsed) {
      return text;
    }

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return `${days[parsed.getDay()]} ${parsed.getDate()}${this.ordinal(parsed.getDate())} ${months[parsed.getMonth()]}`;
  },

  // A date range, collapsed where the two ends share a month:
  //   same day        -> "Fri 27th Aug"
  //   same month      -> "27th - 29th Aug"
  //   crossing months -> "Fri 27th Aug - Tue 1st Sep"
  dateRange(from, to) {
    const a = this.parseISO(from);

    const b = this.parseISO(to);

    if (!a || !b) {
      return this.date(from) || this.date(to);
    }

    if (a.getTime() === b.getTime()) {
      return this.date(from);
    }

    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
      return `${a.getDate()}${this.ordinal(a.getDate())} - ${this.date(to)}`;
    }

    return `${this.date(from)} - ${this.date(to)}`;
  },

  // Parses YYYY-MM-DD as a LOCAL date.
  //
  // new Date("2027-08-27") is parsed as UTC, which in Australia lands on
  // the 27th at 10am - harmless - but west of Greenwich shows the 26th.
  // Building it from parts avoids the whole question.
  parseISO(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (!m) {
      const loose = new Date(value);

      return Number.isNaN(loose.getTime()) ? null : loose;
    }

    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

    return Number.isNaN(date.getTime()) ? null : date;
  },

  ordinal(day) {
    // 11th, 12th and 13th are the exceptions that break the last-digit rule.
    if (day >= 11 && day <= 13) {
      return "th";
    }

    const last = day % 10;

    return last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  },

  // "vigano san martino" -> "Vigano San Martino"
  //
  // Locations are stored lowercase and slugged, which is right for matching
  // and wrong for reading. Every module had grown its own copy of this;
  // this is the one that stays.
  //
  // Hyphens AND underscores become spaces: imported location slugs use
  // hyphens, budget category keys use underscores, and the fifteen copies
  // of this that existed handled one or the other but never both.
  //
  // Deliberately naive about "of"/"the" - "Isle Of Skye" is a small price
  // for never having to maintain a word list, and a place typed properly
  // in the first place passes through unchanged.
  place(value) {
    return String(value || "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  },
};
