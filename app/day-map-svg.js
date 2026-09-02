/*
  A DAY'S MAP, AS A PICTURE THAT TRAVELS WITH THE DOCUMENT.

  The journal export is one self-contained HTML file with the photos
  inlined - it has to open in twenty years on a laptop with no internet
  and no idea what this app was. A live Leaflet map cannot go in it: it
  needs the library, a tile server, and a network.

  So the day is drawn as INLINE SVG. It carries no tiles, which means no
  coastlines and no roads - what it shows is the SHAPE of the day: the
  route driven, the places stopped at in order, and where each person's
  photographs were taken. A diagram rather than a map, and the labels
  carry the names that tiles would otherwise have supplied.

  Everything it costs is arithmetic. No request, no credit, no dependency,
  and it prints at any size because it is vector - which matters, because
  the same builder feeds the photo book.

  WHY NOT A STATIC MAP IMAGE. The provider can render real tiles as a PNG,
  which would look better. It costs a credit per day, needs a new proxy
  route, and bakes a raster into a document meant to last. Worth adding
  later as an option; not worth making the only way to get a map.
*/
const DayMapSvg = {
  WIDTH: 720,

  HEIGHT: 460,

  PAD: 46,

  // Web Mercator, so the picture matches the shape people know from every
  // other map. Latitude is not linear: a degree of longitude narrows
  // towards the poles, and plotting lat/lng raw stretches an Italian day
  // noticeably east-west.
  mercator(lat, lng) {
    const clamped = Math.max(-85, Math.min(85, lat));

    const radians = (clamped * Math.PI) / 180;

    return {
      x: lng,
      y: Math.log(Math.tan(Math.PI / 4 + radians / 2)) * (180 / Math.PI),
    };
  },

  // Everything the day has to show, or null when it has nothing.
  gather(dayNumber) {
    const day = typeof Drive !== "undefined" ? Drive.dayNumbered(dayNumber) : null;

    const drive = day && Drive.driveFor ? Drive.driveFor(day) : null;

    const route = drive && drive.route ? drive.route : null;

    const path = route && Array.isArray(route.path) && route.path.length > 1 ? route.path : [];

    const waypoints = drive
      ? drive.waypoints
        .filter((w) => typeof w.lat === "number" && typeof w.lng === "number")
        .map((w) => ({ lat: w.lat, lng: w.lng, label: w.label || "" }))
      : [];

    const photos = typeof Journal !== "undefined" && Journal.traceFor ? Journal.traceFor(dayNumber) : [];

    if (path.length === 0 && waypoints.length === 0 && photos.length === 0) {
      return null;
    }

    return { path, waypoints, photos, route };
  },

  // The projection for this day: everything shown, with room for labels.
  //
  // A single point would otherwise divide by a zero span, so it is given a
  // small window around itself rather than being special-cased away.
  frame(points) {
    const projected = points.map((p) => this.mercator(p.lat, p.lng));

    // The REAL middle latitude, kept separately. minY/maxY below are
    // Mercator y values, which are not latitudes and are around five
    // degrees adrift at Italian ones.
    const lats = points.map((p) => p.lat);

    const midLat = (Math.min.apply(Math, lats) + Math.max.apply(Math, lats)) / 2;

    let minX = Infinity;

    let maxX = -Infinity;

    let minY = Infinity;

    let maxY = -Infinity;

    projected.forEach((p) => {
      minX = Math.min(minX, p.x);

      maxX = Math.max(maxX, p.x);

      minY = Math.min(minY, p.y);

      maxY = Math.max(maxY, p.y);
    });

    let spanX = maxX - minX;

    let spanY = maxY - minY;

    if (spanX < 0.0001) {
      minX -= 0.01;

      spanX = 0.02;
    }

    if (spanY < 0.0001) {
      minY -= 0.01;

      spanY = 0.02;
    }

    // ONE scale for both axes, taken from whichever is tighter. Scaling
    // each axis to fill the box would stretch the day out of shape, and a
    // map of the wrong shape is worse than a small one.
    const usableW = this.WIDTH - this.PAD * 2;

    const usableH = this.HEIGHT - this.PAD * 2;

    const scale = Math.min(usableW / spanX, usableH / spanY);

    // The canvas is then CROPPED to what is actually drawn. Keeping the
    // full box and centring in it left a tall narrow day - which most
    // driving days are - sitting in a wide frame half full of nothing.
    const offsetX = this.PAD;

    const offsetY = this.PAD;

    const width = Math.round(spanX * scale + this.PAD * 2);

    const height = Math.round(spanY * scale + this.PAD * 2);

    return {
      to: (lat, lng) => {
        const p = this.mercator(lat, lng);

        return {
          x: Math.round((offsetX + (p.x - minX) * scale) * 10) / 10,
          // Flipped: SVG counts down the page and latitude counts up.
          y: Math.round((offsetY + (maxY - p.y) * scale) * 10) / 10,
        };
      },
      width,
      height,
      // Metres per pixel, for the scale bar.
      //
      // MERCATOR INFLATES DISTANCE BY 1/cos(latitude). Treating a degree of
      // Mercator y as a flat 111.32km made the bar read 214km for a route
      // that is 157km - a scale bar that lies is worse than none, and this
      // one lied confidently.
      //
      // Measured at the middle latitude of what is drawn, which is right to
      // within a percent over any distance a day can be driven.
      metresPerPixel: (111320 * Math.cos((midLat * Math.PI) / 180)) / scale,
    };
  },

  render(dayNumber) {
    const data = this.gather(dayNumber);

    if (!data) {
      return "";
    }

    const all = data.path
      .map((p) => ({ lat: p[0], lng: p[1] }))
      .concat(data.waypoints)
      .concat(data.photos.map((p) => ({ lat: p.lat, lng: p.lng })));

    const frame = this.frame(all);

    const parts = [];

    parts.push(`<rect x="0" y="0" width="${frame.width}" height="${frame.height}" fill="#f4f1ea"/>`);

    if (data.path.length > 1) {
      const d = data.path
        .map((p, i) => {
          const at = frame.to(p[0], p[1]);

          return `${i === 0 ? "M" : "L"}${at.x} ${at.y}`;
        })
        .join(" ");

      // Drawn twice: a pale casing under the line so it stays readable
      // where it crosses itself, which a day with a there-and-back does.
      parts.push(`<path d="${d}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>`);

      parts.push(`<path d="${d}" fill="none" stroke="#7A5C3E" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`);
    } else if (data.waypoints.length > 1) {
      // No road worked out, so the line between the stops is a guess and
      // is drawn as one.
      const d = data.waypoints
        .map((w, i) => {
          const at = frame.to(w.lat, w.lng);

          return `${i === 0 ? "M" : "L"}${at.x} ${at.y}`;
        })
        .join(" ");

      parts.push(`<path d="${d}" fill="none" stroke="#b0a99c" stroke-width="2.5" stroke-dasharray="8 7" stroke-linejoin="round"/>`);
    }

    data.waypoints.forEach((w, index) => {
      const at = frame.to(w.lat, w.lng);

      const first = index === 0;

      const last = index === data.waypoints.length - 1;

      const fill = first ? "#ffffff" : last ? "#2e7d4f" : "#7A5C3E";

      const ink = first ? "#7A5C3E" : "#ffffff";

      parts.push(`<circle cx="${at.x}" cy="${at.y}" r="11" fill="${fill}" stroke="#7A5C3E" stroke-width="2"/>`);

      parts.push(
        `<text x="${at.x}" y="${at.y + 4}" text-anchor="middle" font-family="system-ui, sans-serif"` +
        ` font-size="12" font-weight="700" fill="${ink}">${index + 1}</text>`,
      );

      if (w.label) {
        // Labels sit above the pin, and the last one below, so a two-stop
        // day whose ends are close does not print one on top of the other.
        const dy = last && data.waypoints.length > 1 ? 28 : -17;

        parts.push(
          `<text x="${at.x}" y="${at.y + dy}" text-anchor="middle" font-family="system-ui, sans-serif"` +
          ` font-size="12.5" fill="#3a3a3a" paint-order="stroke" stroke="#f4f1ea" stroke-width="3.5">` +
          `${this.esc(this.pretty(w.label))}</text>`,
        );
      }
    });

    // PHOTOGRAPHS LAST, FANNED OUT AROUND WHATEVER THEY LAND ON.
    //
    // Drawn underneath at first, on the reasoning that forty pictures
    // should not bury a three-stop itinerary. That was backwards -
    // photographs cluster AT the stops, so every one that mattered
    // vanished under an 11px pin and the map showed a route with nobody
    // on it. Drawn on top instead, they covered the pin numbers.
    //
    // Both are the same problem: at this scale a photograph taken at a
    // stop IS the stop, to within a couple of pixels. So coincident points
    // are fanned onto a small ring - the standard way a map shows several
    // things in one place. The offset is a few pixels and claims nothing
    // about where the photograph was actually taken.
    this.fan(data.photos.map((p) => ({ point: p, at: frame.to(p.lat, p.lng) })), data.waypoints.map((w) => frame.to(w.lat, w.lng)))
      .forEach((placed) => {
        parts.push(
          `<circle cx="${placed.x}" cy="${placed.y}" r="4" fill="${this.esc(placed.point.colour || "#2f6fb3")}"` +
          ` stroke="#ffffff" stroke-width="1.5" opacity="${placed.point.source === "device" ? "0.75" : "1"}"/>`,
        );
      });

    parts.push(this.scaleBar(frame));

    return `

<svg class="daymap" viewBox="0 0 ${frame.width} ${frame.height}" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="${this.esc(this.describe(dayNumber, data))}">
${parts.join("\n")}
</svg>

`;
  },

  // Spreads points that land on the same spot onto a small ring, so
  // several things in one place stay countable.
  //
  // A waypoint pin occupies its own group from the start, so the FIRST
  // photograph taken at a stop is already pushed clear of the number.
  fan(placed, pinAt) {
    // BY DISTANCE, NOT BY GRID.
    //
    // Bucketing into cells was tried first and left dots sitting on pin
    // numbers: a photograph a pixel the wrong side of a cell boundary
    // escaped its pin's group and stayed exactly where the number was.
    // Distance has no boundaries to fall the wrong side of.
    const NEAR_PIN = 17;

    const NEAR_EACH = 13;

    const groups = pinAt.map((at) => ({ centre: at, taken: 1 }));

    const near = (a, b) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));

    return placed.map((item) => {
      let group = null;

      // A pin wins over another photograph: a picture taken at a stop
      // belongs to that stop, not to whichever photo landed first.
      for (let i = 0; i < pinAt.length; i++) {
        if (near(item.at, groups[i].centre) <= NEAR_PIN) {
          group = groups[i];

          break;
        }
      }

      if (!group) {
        for (let i = pinAt.length; i < groups.length; i++) {
          if (near(item.at, groups[i].centre) <= NEAR_EACH) {
            group = groups[i];

            break;
          }
        }
      }

      if (!group) {
        group = { centre: item.at, taken: 0 };

        groups.push(group);
      }

      const slot = group.taken;

      group.taken += 1;

      if (slot === 0) {
        return { point: item.point, x: item.at.x, y: item.at.y };
      }

      // A ring just outside an 11px pin, so a photograph taken at a stop
      // sits beside its number rather than over it. Six to a ring, then a
      // wider one - which no real day is likely to need.
      const ring = Math.ceil(slot / 6);

      const within = (slot - 1) % 6;

      const radius = 15 + (ring - 1) * 10;

      const angle = (within / 6) * Math.PI * 2 - Math.PI / 2;

      return {
        point: item.point,
        x: Math.round((group.centre.x + Math.cos(angle) * radius) * 10) / 10,
        y: Math.round((group.centre.y + Math.sin(angle) * radius) * 10) / 10,
      };
    });
  },

  // WITHOUT THIS THE PICTURE HAS NO SIZE. There are no tiles and no
  // familiar coastline, so nothing else says whether the day covers three
  // kilometres or three hundred.
  scaleBar(frame) {
    // Never more than a third of a narrow picture: a bar wider than what
    // it measures reads as part of the drawing.
    const target = Math.min(150, Math.max(60, frame.width * 0.34));

    const metres = frame.metresPerPixel * target;

    // A round number, so the bar reads "50 km" rather than "47.3 km".
    const magnitude = Math.pow(10, Math.floor(Math.log(metres) / Math.LN10));

    const nice = [1, 2, 5, 10].map((m) => m * magnitude).filter((v) => v <= metres * 1.4);

    const chosen = nice.length ? nice[nice.length - 1] : magnitude;

    const width = Math.round(chosen / frame.metresPerPixel);

    const label = chosen >= 1000 ? `${Math.round(chosen / 1000)} km` : `${Math.round(chosen)} m`;

    const y = frame.height - 17;

    const x = 16;

    // On its own plate. The bottom-left corner is where a place label can
    // also land, and a scale bar crossing a town name makes both unreadable.
    const plate = width + 62;

    return `
<rect x="${x - 8}" y="${y - 13}" width="${plate}" height="26" rx="5" fill="#f4f1ea" opacity="0.88"/>
<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y}" stroke="#3a3a3a" stroke-width="2"/>
<line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}" stroke="#3a3a3a" stroke-width="2"/>
<line x1="${x + width}" y1="${y - 4}" x2="${x + width}" y2="${y + 4}" stroke="#3a3a3a" stroke-width="2"/>
<text x="${x + width + 8}" y="${y + 4}" font-family="system-ui, sans-serif" font-size="12" fill="#3a3a3a">${label}</text>
`;
  },

  // What the picture says, for a screen reader and for anyone whose
  // browser will not draw it.
  describe(dayNumber, data) {
    const parts = [];

    if (data.waypoints.length > 1) {
      parts.push(
        `Route from ${this.pretty(data.waypoints[0].label)} to ${this.pretty(data.waypoints[data.waypoints.length - 1].label)}`,
      );
    }

    if (data.route && typeof data.route.km === "number") {
      parts.push(`${Math.round(data.route.km)} km`);
    }

    if (data.photos.length > 0) {
      parts.push(`${data.photos.length} photo location${data.photos.length === 1 ? "" : "s"}`);
    }

    return parts.length ? parts.join(", ") : `Map of day ${dayNumber}`;
  },

  // --- What travels beside the map ------------------------------------

  // The places, in the order they were driven.
  places(dayNumber) {
    const data = this.gather(dayNumber);

    return data ? data.waypoints.map((w) => this.pretty(w.label)).filter(Boolean) : [];
  },

  // Who has photographs on this day, with their colour so the list and
  // the dots agree.
  people(dayNumber) {
    if (typeof Journal === "undefined" || !Journal.peopleIn) {
      return [];
    }

    return Journal.peopleIn(dayNumber).people;
  },

  pretty(value) {
    return typeof Format !== "undefined" && Format.place
      ? Format.place(value)
      : String(value || "");
  },

  esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
