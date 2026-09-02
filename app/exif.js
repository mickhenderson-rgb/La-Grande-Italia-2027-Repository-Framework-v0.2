/*
  WHERE A PHOTO WAS TAKEN, READ FROM THE PHOTO ITSELF.

  Every photo a phone takes records the coordinates and the moment. That
  is a genuine record of where the trip actually went - the places you
  stopped and cared enough to photograph - with no tracking, no battery
  cost and no permission beyond the photo you already chose to add.

  WHY THIS HAD TO EXIST BEFORE THE TRIP.

  Journal.resizeImage draws the photo onto a canvas and reads it back with
  toDataURL. That produces a clean JPEG and DISCARDS EVERY PIECE OF
  METADATA, GPS included. A photo added before this reader existed has no
  location and never can have - the original never reaches the server.
  Hence reading it from the File FIRST, before a canvas ever sees it.

  WHY IT IS HAND-WRITTEN.

  The app has no dependencies and is not getting any. An EXIF library
  would be tens of kilobytes to read six tags out of a header. This reads
  the header directly, and every byte of it is a documented format.

  WHAT IT DELIBERATELY DOES NOT DO.

  It does not throw. A photo with no GPS, a screenshot, a picture someone
  sent you over WhatsApp with the metadata stripped, a format that is not
  JPEG - all of them return null, because "this photo does not say where
  it was" is an ordinary answer and not a failure.
*/
const Exif = {
  // EXIF lives in the first segment of the file. Reading a quarter of a
  // megabyte is generous for a header that is normally a few kilobytes,
  // and it means a 5MB photo is not pulled into memory to find six tags.
  HEAD_BYTES: 262144,

  // Tags, by their numbers in the TIFF/EXIF specification.
  TAG_EXIF_IFD: 0x8769,
  TAG_GPS_IFD: 0x8825,
  TAG_DATE_TAKEN: 0x9003,
  GPS_LAT_REF: 1,
  GPS_LAT: 2,
  GPS_LNG_REF: 3,
  GPS_LNG: 4,

  async read(file) {
    if (!file || typeof file.slice !== "function") {
      return null;
    }

    try {
      const head = await this.headBytes(file);

      return this.parse(head);
    } catch (error) {
      // A photo whose header cannot be read is still a perfectly good
      // photo. Losing the location is not worth losing the picture.
      console.warn("EXIF read failed, continuing without a location:", error);

      return null;
    }
  },

  headBytes(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error("Could not read the file."));

      reader.onload = () => resolve(reader.result);

      reader.readAsArrayBuffer(file.slice(0, this.HEAD_BYTES));
    });
  },

  // --- The file format ------------------------------------------------

  parse(buffer) {
    const view = new DataView(buffer);

    const tiff = this.findTiffHeader(view);

    if (tiff === -1) {
      return null;
    }

    // "II" is Intel, little-endian; "MM" is Motorola, big-endian. Both are
    // in the wild - phones differ - so neither can be assumed.
    const little = view.getUint16(tiff) === 0x4949;

    if (view.getUint16(tiff + 2, little) !== 42) {
      return null;
    }

    const ifd0 = tiff + view.getUint32(tiff + 4, little);

    const root = this.readIfd(view, ifd0, tiff, little);

    const result = { lat: null, lng: null, takenAt: "" };

    if (root[this.TAG_GPS_IFD]) {
      const gps = this.readIfd(view, tiff + root[this.TAG_GPS_IFD].value, tiff, little);

      const point = this.coordsFrom(view, gps, tiff, little);

      if (point) {
        result.lat = point.lat;

        result.lng = point.lng;
      }
    }

    if (root[this.TAG_EXIF_IFD]) {
      const exif = this.readIfd(view, tiff + root[this.TAG_EXIF_IFD].value, tiff, little);

      result.takenAt = this.dateFrom(view, exif[this.TAG_DATE_TAKEN], tiff, little);
    }

    return result.lat === null && !result.takenAt ? null : result;
  },

  // The EXIF block sits in an APP1 segment, which is not always the first
  // one - a photo can carry a JFIF or ICC segment ahead of it.
  findTiffHeader(view) {
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
      // Not a JPEG. An iPhone shooting HEIC normally converts to JPEG on
      // its way into a file input, but a PNG or a screenshot lands here
      // and simply has nothing to read.
      return -1;
    }

    let offset = 2;

    while (offset + 4 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) {
        return -1;
      }

      const marker = view.getUint8(offset + 1);

      const length = view.getUint16(offset + 2);

      // APP1, and the six bytes "Exif\0\0" that identify it as the one we
      // want rather than an XMP block, which is also APP1.
      if (
        marker === 0xe1 &&
        offset + 10 < view.byteLength &&
        view.getUint32(offset + 4) === 0x45786966 &&
        view.getUint16(offset + 8) === 0x0000
      ) {
        return offset + 10;
      }

      // Start of scan: the image data begins and there are no more
      // headers to walk.
      if (marker === 0xda) {
        return -1;
      }

      if (length < 2) {
        return -1;
      }

      offset += 2 + length;
    }

    return -1;
  },

  // One image file directory: a count, then that many 12-byte entries.
  readIfd(view, offset, tiff, little) {
    const tags = {};

    if (offset < 0 || offset + 2 > view.byteLength) {
      return tags;
    }

    const count = view.getUint16(offset, little);

    // A corrupt count could otherwise send this reading megabytes of
    // whatever happens to follow.
    if (count > 512) {
      return tags;
    }

    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;

      if (entry + 12 > view.byteLength) {
        break;
      }

      const tag = view.getUint16(entry, little);

      const type = view.getUint16(entry + 2, little);

      const length = view.getUint32(entry + 4, little);

      // Four bytes or fewer live in the entry itself; anything larger is
      // a pointer to somewhere else in the file.
      const size = this.typeSize(type) * length;

      const at = size > 4 ? tiff + view.getUint32(entry + 8, little) : entry + 8;

      tags[tag] = { type, length, at, value: view.getUint32(entry + 8, little) };
    }

    return tags;
  },

  typeSize(type) {
    // 1 byte, 2 ascii, 3 short, 4 long, 5 rational, 7 undefined,
    // 9 signed long, 10 signed rational.
    const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

    return sizes[type] || 1;
  },

  rational(view, at, little) {
    const numerator = view.getUint32(at, little);

    const denominator = view.getUint32(at + 4, little);

    return denominator === 0 ? 0 : numerator / denominator;
  },

  // Degrees, minutes and seconds, as three rationals, plus a letter
  // saying which side of the equator or meridian.
  degrees(view, tag, little) {
    if (!tag || tag.length < 3) {
      return null;
    }

    const d = this.rational(view, tag.at, little);

    const m = this.rational(view, tag.at + 8, little);

    const s = this.rational(view, tag.at + 16, little);

    return d + m / 60 + s / 3600;
  },

  ascii(view, tag) {
    if (!tag || tag.type !== 2) {
      return "";
    }

    let out = "";

    for (let i = 0; i < tag.length; i++) {
      const code = view.getUint8(tag.at + i);

      if (code === 0) {
        break;
      }

      out += String.fromCharCode(code);
    }

    return out;
  },

  coordsFrom(view, gps, tiff, little) {
    const lat = this.degrees(view, gps[this.GPS_LAT], little);

    const lng = this.degrees(view, gps[this.GPS_LNG], little);

    if (lat === null || lng === null) {
      return null;
    }

    const latRef = this.ascii(view, gps[this.GPS_LAT_REF]).toUpperCase();

    const lngRef = this.ascii(view, gps[this.GPS_LNG_REF]).toUpperCase();

    const signedLat = latRef === "S" ? -lat : lat;

    const signedLng = lngRef === "W" ? -lng : lng;

    // A photo with no fix sometimes writes zeroes rather than omitting the
    // tags. Null Island is in the Gulf of Guinea and nobody's trip goes
    // there, so a pair of exact zeroes is a missing fix, not a location.
    if (signedLat === 0 && signedLng === 0) {
      return null;
    }

    if (
      !isFinite(signedLat) ||
      !isFinite(signedLng) ||
      Math.abs(signedLat) > 90 ||
      Math.abs(signedLng) > 180
    ) {
      return null;
    }

    // About a metre. Storing fifteen digits of a figure good to five is
    // most of a journal file spent on noise.
    return {
      lat: Math.round(signedLat * 1e5) / 1e5,
      lng: Math.round(signedLng * 1e5) / 1e5,
    };
  },

  // EXIF writes "2027:08:19 14:32:05" - colons in the date, which no
  // Date parser accepts. Returned as ISO so it sorts and compares like
  // every other date in the app.
  dateFrom(view, tag) {
    const said = this.ascii(view, tag).trim();

    const m = said.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);

    if (!m) {
      return "";
    }

    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  },
};
