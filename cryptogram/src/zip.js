'use strict';

const { crc32 } = require('./dpi-meta');

function u16(n) {
  return [n & 255, (n >>> 8) & 255];
}
function u32(n) {
  return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
}

function dosDateTime(d) {
  const date = d || new Date();
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | ((date.getSeconds() / 2) | 0);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

/** STORE-only ZIP writer */
function createZip(files) {
  const { dosTime, dosDate } = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    let p = 0;
    const write = (arr) => {
      for (let i = 0; i < arr.length; i++) local[p++] = arr[i];
    };
    write([0x50, 0x4b, 0x03, 0x04]); // local header
    write(u16(20)); // version needed
    write(u16(0)); // flags
    write(u16(0)); // method STORE
    write(u16(dosTime));
    write(u16(dosDate));
    write(u32(crc));
    write(u32(data.length));
    write(u32(data.length));
    write(u16(nameBytes.length));
    write(u16(0)); // extra
    for (let i = 0; i < nameBytes.length; i++) local[p++] = nameBytes[i];
    local.set(data, p);

    const central = new Uint8Array(46 + nameBytes.length);
    p = 0;
    const wc = (arr) => {
      for (let i = 0; i < arr.length; i++) central[p++] = arr[i];
    };
    wc([0x50, 0x4b, 0x01, 0x02]);
    wc(u16(20));
    wc(u16(20));
    wc(u16(0));
    wc(u16(0));
    wc(u16(dosTime));
    wc(u16(dosDate));
    wc(u32(crc));
    wc(u32(data.length));
    wc(u32(data.length));
    wc(u16(nameBytes.length));
    wc(u16(0));
    wc(u16(0));
    wc(u16(0));
    wc(u16(0));
    wc(u32(0));
    wc(u32(offset));
    for (let i = 0; i < nameBytes.length; i++) central[p++] = nameBytes[i];

    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }

  const centralSize = centralParts.reduce((s, x) => s + x.length, 0);
  const end = new Uint8Array(22);
  let p = 0;
  const we = (arr) => {
    for (let i = 0; i < arr.length; i++) end[p++] = arr[i];
  };
  we([0x50, 0x4b, 0x05, 0x06]);
  we(u16(0));
  we(u16(0));
  we(u16(files.length));
  we(u16(files.length));
  we(u32(centralSize));
  we(u32(offset));
  we(u16(0));

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of localParts) {
    out.set(part, o);
    o += part.length;
  }
  for (const part of centralParts) {
    out.set(part, o);
    o += part.length;
  }
  out.set(end, o);
  return out;
}

function downloadBlob(filename, data, mime) {
  const blob = new Blob([data], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createZip, downloadBlob };
}
