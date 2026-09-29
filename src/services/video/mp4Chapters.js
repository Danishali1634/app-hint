/**
 * @file Chapter markers for the downloaded MP4 — the steps, clickable in the
 * video player's chapter menu (VLC, mpv, IINA, PotPlayer, MPC-HC and every
 * other ffmpeg-based player).
 *
 * WHY A POST-PROCESS: mp4-muxer can't write chapters, so they are added to the
 * finished file as a Nero chapter list — `moov/udta/chpl`:
 *   chpl (full box, version 1) · 4 reserved bytes · count (u8)
 *   per chapter: start (u64, 100 ns units) · title length (u8) · UTF-8 title
 *
 * The file is "fast start" (moov BEFORE mdat), so growing moov moves the media
 * data: every chunk offset (stco / co64) is shifted by the added bytes.
 * Anything unexpected in the file → it is returned unchanged (chapters are a
 * bonus; they must never break the download).
 */

/** Boxes that contain other boxes (on the path to udta and to stco / co64). */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta']);
const MAX_CHAPTERS = 255; // count is one byte
const MAX_TITLE_BYTES = 255; // length is one byte

const encoder = new TextEncoder();

/** Boxes directly inside [start, end). */
function readBoxes(view, start, end) {
  const boxes = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = view.getUint32(pos);
    const type = String.fromCharCode(
      view.getUint8(pos + 4),
      view.getUint8(pos + 5),
      view.getUint8(pos + 6),
      view.getUint8(pos + 7),
    );
    let header = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(pos + 8));
      header = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < header || pos + size > end) throw new Error(`Bad MP4 box ${type}`);
    boxes.push({ type, start: pos, size, header });
    pos += size;
  }
  return boxes;
}

/** A UTF-8 title of at most 255 bytes (cut on a character, with "…"). */
function titleBytes(title) {
  let text = title || '';
  let bytes = encoder.encode(text);
  if (bytes.length <= MAX_TITLE_BYTES) return bytes;
  const chars = [...text];
  while (chars.length && bytes.length > MAX_TITLE_BYTES) {
    chars.pop();
    text = `${chars.join('').trimEnd()}…`;
    bytes = encoder.encode(text);
  }
  return bytes;
}

/** The chpl box for these chapters. */
function chplBox(chapters) {
  const titles = chapters.map((c) => titleBytes(c.title));
  const size = 8 + 4 + 4 + 1 + titles.reduce((n, t) => n + 8 + 1 + t.length, 0);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, size);
  bytes.set(encoder.encode('chpl'), 4);
  view.setUint8(8, 1); // version 1; flags (3 bytes) and reserved (4 bytes) stay 0
  view.setUint8(16, chapters.length);
  let pos = 17;
  chapters.forEach((chapter, i) => {
    view.setBigUint64(pos, BigInt(Math.max(0, Math.round(chapter.startMs * 10_000))));
    view.setUint8(pos + 8, titles[i].length);
    bytes.set(titles[i], pos + 9);
    pos += 9 + titles[i].length;
  });
  return bytes;
}

/** A box with this payload. */
function wrapBox(type, payload) {
  const bytes = new Uint8Array(8 + payload.length);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(encoder.encode(type), 4);
  bytes.set(payload, 8);
  return bytes;
}

/** Adds `delta` to every chunk offset (stco / co64) inside this box tree. */
function shiftChunkOffsets(view, box, delta) {
  for (const child of readBoxes(view, box.start + box.header, box.start + box.size)) {
    if (child.type === 'stco' || child.type === 'co64') {
      const count = view.getUint32(child.start + child.header + 4);
      let pos = child.start + child.header + 8;
      for (let i = 0; i < count; i++) {
        if (child.type === 'stco') {
          view.setUint32(pos, view.getUint32(pos) + delta);
          pos += 4;
        } else {
          view.setBigUint64(pos, view.getBigUint64(pos) + BigInt(delta));
          pos += 8;
        }
      }
    } else if (CONTAINERS.has(child.type)) {
      shiftChunkOffsets(view, child, delta);
    }
  }
}

/**
 * The MP4 with these chapters in it (or the input unchanged if it can't be done).
 * @param {ArrayBuffer} buffer   a finished MP4 (mp4-muxer output)
 * @param {{ startMs: number, title: string }[]} chapters  sorted by start
 * @returns {ArrayBuffer}
 */
export function addMp4Chapters(buffer, chapters) {
  const list = chapters.filter((c) => Number.isFinite(c.startMs)).slice(0, MAX_CHAPTERS);
  if (list.length === 0) return buffer;
  try {
    const source = new Uint8Array(buffer.slice(0)); // a copy: offsets are patched in place
    const view = new DataView(source.buffer);
    const top = readBoxes(view, 0, source.length);
    const moov = top.find((b) => b.type === 'moov');
    const mdat = top.find((b) => b.type === 'mdat');
    if (!moov || !mdat || moov.header !== 8) return buffer;

    const udta = readBoxes(view, moov.start + 8, moov.start + moov.size).find(
      (b) => b.type === 'udta',
    );
    if (udta && udta.header !== 8) return buffer;
    const chpl = chplBox(list);
    // Into the existing udta, or a new udta at the end of moov.
    const insert = udta ? chpl : wrapBox('udta', chpl);
    const at = udta ? udta.start + udta.size : moov.start + moov.size;
    const delta = insert.length;

    if (moov.start < mdat.start) shiftChunkOffsets(view, moov, delta);
    view.setUint32(moov.start, moov.size + delta);
    if (udta) view.setUint32(udta.start, udta.size + delta);

    const out = new Uint8Array(source.length + delta);
    out.set(source.subarray(0, at), 0);
    out.set(insert, at);
    out.set(source.subarray(at), at + delta);
    return out.buffer;
  } catch (err) {
    console.warn('Could not add chapters to the video', err);
    return buffer;
  }
}
