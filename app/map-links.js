/*
=========================================================

COMPASS-TOS

Map Links

Version 1.0.0

Build 52

Shared "Open in Google Maps" / "Open in Waze" deep links for
single-destination items (Accommodation, Activities,
Restaurants) - so a hotel, activity or restaurant can be handed
straight to the traveller's real navigation app of choice.

Transport already has its own from/to route-based version of
this (two coordinates, a travel mode) and is left as-is.

No origin is sent - both apps fall back to the phone's current
location, which is what you want when tapping this on the day.

=========================================================
*/

const MapLinks = {
  hasCoordinates(location) {
    return !!location && typeof location.latitude === "number" && typeof location.longitude === "number";
  },

  // Delegates to the shared formatter - see app/format.js. Kept as a
  // local method so every existing this.pretty(...) call still works.
  pretty(value) {
    return Format.place(value);
  },

  // Best available text for the destination: a saved address always wins
  // (most precise); otherwise the item's name plus its trip destination,
  // e.g. "Hotel Milano, Rome", which disambiguates far better than the
  // name alone.
  destinationText(item) {
    const address = item && item.location && item.location.address;

    if (address && String(address).trim()) {
      return String(address).trim();
    }

    const name = (item && item.name) || "";

    const place = item && item.destination ? this.pretty(item.destination) : "";

    return [name, place].filter(Boolean).join(", ");
  },

  hasDestination(item) {
    return this.hasCoordinates(item && item.location) || !!this.destinationText(item);
  },

  googleMapsUrl(item) {
    const destination = this.hasCoordinates(item.location)
      ? `${item.location.latitude},${item.location.longitude}`
      : encodeURIComponent(this.destinationText(item));

    return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  },

  wazeUrl(item) {
    if (this.hasCoordinates(item.location)) {
      return `https://waze.com/ul?ll=${item.location.latitude},${item.location.longitude}&navigate=yes`;
    }

    return `https://waze.com/ul?q=${encodeURIComponent(this.destinationText(item))}&navigate=yes`;
  },

  // A pair of <a class="map-btn"> links, or "" when there's genuinely
  // nothing to navigate to (no address, no name, no destination).
  renderButtons(item) {
    if (!this.hasDestination(item)) {
      return "";
    }

    return `

<a class="map-btn" href="${this.googleMapsUrl(item)}" target="_blank" rel="noopener">Open in Google Maps</a>

<a class="map-btn" href="${this.wazeUrl(item)}" target="_blank" rel="noopener" title="Opens directly on mobile with the Waze app installed. On desktop it will prompt to download.">Open in Waze</a>

`;
  },

  // A single compact link for tight layouts (e.g. the Planner snapshot),
  // opening Google Maps directions - Waze is one tap further via the same
  // destination once there, which keeps the snapshot uncluttered.
  renderCompactLink(item, label) {
    if (!this.hasDestination(item)) {
      return "";
    }

    return `<a class="snap-link" href="${this.googleMapsUrl(item)}" target="_blank" rel="noopener">${label || "Directions"}</a>`;
  },
};
