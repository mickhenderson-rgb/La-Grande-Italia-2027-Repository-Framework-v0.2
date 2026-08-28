/*
=========================================================

COMPASS-TOS

Zip

Version 1.0.0

Builds a .zip in the browser. No library.

WHY THIS IS ONLY ~150 LINES

Because it does not compress. A ZIP entry can be STORED
rather than deflated, and the archive is still a completely
ordinary .zip that every operating system opens by double-
clicking.

That would be a poor trade for text. It is the right trade
here, because the payload is JPEGs: already compressed, and
deflating them again buys about 1% while costing an entire
DEFLATE implementation this project would then own forever.
The text files in the archive are a few kilobytes.

So what is left is the container format, which is small and
completely specified: a local header before each file, a
central directory listing them all, and a 22-byte record at
the end saying where that directory starts.

=========================================================
*/

const Zip = {
  // Reversed-polynomial CRC-32, the one ZIP uses. The table is built once
  // on first use rather than shipped as 256 literals.
  _crcTable: null,

  crcTable() {
    if (this._crcTable) {
      return this._crcTable;
    }

    const table = new Uint32Array(256);

    for (let i = 0; i < 256; i++) {
      let c = i;

      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }

      table[i] = c >>> 0;
    }

    this._crcTable = table;

    return table;
  },

  crc32(bytes) {
    const table = this.crcTable();

    let crc = 0xffffffff;

    for (let i = 0; i < bytes.length; i++) {
      crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
  },

  // ZIP stores timestamps in the MS-DOS format from 1980: seconds in two-
  // second steps, and a year offset from 1980. It cannot represent a date
  // before then, so anything earlier is clamped rather than wrapped into a
  // nonsense year.
  dosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());

    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
  },

  textBytes(text) {
    return new TextEncoder().encode(text);
  },

  // files: [{ name, bytes }] where bytes is a Uint8Array. Names use forward
  // slashes for folders - that is what the format specifies, on every
  // platform, Windows included.
  build(files, when) {
    const stamp = this.dosDateTime(when || new Date());

    const chunks = [];

    const central = [];

    let offset = 0;

    files.forEach((file) => {
      const nameBytes = this.textBytes(file.name);

      const crc = this.crc32(file.bytes);

      const size = file.bytes.length;

      const local = new DataView(new ArrayBuffer(30));

      local.setUint32(0, 0x04034b50, true);

      local.setUint16(4, 20, true);

      // Bit 11 says the filename is UTF-8. Without it, an accented caption
      // in a filename decodes as mojibake on a machine with a different
      // code page.
      local.setUint16(6, 0x0800, true);

      local.setUint16(8, 0, true);

      local.setUint16(10, stamp.time, true);

      local.setUint16(12, stamp.date, true);

      local.setUint32(14, crc, true);

      local.setUint32(18, size, true);

      local.setUint32(22, size, true);

      local.setUint16(26, nameBytes.length, true);

      local.setUint16(28, 0, true);

      chunks.push(new Uint8Array(local.buffer), nameBytes, file.bytes);

      central.push({ nameBytes: nameBytes, crc: crc, size: size, offset: offset });

      offset += 30 + nameBytes.length + size;
    });

    const cdStart = offset;

    central.forEach((entry) => {
      const head = new DataView(new ArrayBuffer(46));

      head.setUint32(0, 0x02014b50, true);

      head.setUint16(4, 20, true);

      head.setUint16(6, 20, true);

      head.setUint16(8, 0x0800, true);

      head.setUint16(10, 0, true);

      head.setUint16(12, stamp.time, true);

      head.setUint16(14, stamp.date, true);

      head.setUint32(16, entry.crc, true);

      head.setUint32(20, entry.size, true);

      head.setUint32(24, entry.size, true);

      head.setUint16(28, entry.nameBytes.length, true);

      head.setUint16(30, 0, true);

      head.setUint16(32, 0, true);

      head.setUint16(34, 0, true);

      head.setUint16(36, 0, true);

      head.setUint32(38, 0, true);

      head.setUint32(42, entry.offset, true);

      chunks.push(new Uint8Array(head.buffer), entry.nameBytes);

      offset += 46 + entry.nameBytes.length;
    });

    const end = new DataView(new ArrayBuffer(22));

    end.setUint32(0, 0x06054b50, true);

    end.setUint16(4, 0, true);

    end.setUint16(6, 0, true);

    end.setUint16(8, central.length, true);

    end.setUint16(10, central.length, true);

    end.setUint32(12, offset - cdStart, true);

    end.setUint32(16, cdStart, true);

    end.setUint16(20, 0, true);

    chunks.push(new Uint8Array(end.buffer));

    return new Blob(chunks, { type: "application/zip" });
  },
};
