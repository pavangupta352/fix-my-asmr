// Module worker: reads the recording, measures its sound, and writes the fixed copy.
// The picture is copied packet for packet; only the audio track is rebuilt.
import * as MB from './vendor/mediabunny.min.mjs';
import { Analyzer, Chain } from './dsp.js';

let job = null;
let conversion = null;

const post = (type, data = {}, transfer = []) => postMessage({ type, ...data }, transfer);

onmessage = async ({ data }) => {
  try {
    if (data.type === 'analyze') await analyze(data.file);
    else if (data.type === 'export') await exportFixed(data);
    else if (data.type === 'cancel' && conversion) await conversion.cancel();
  } catch (err) {
    if (err instanceof MB.ConversionCanceledError) post('canceled');
    else post('error', { stage: data.type, message: String((err && err.message) || err) });
  }
};

// Copies one decoded block into planar left/right buffers (mono is duplicated).
function readStereo(s, bufs) {
  const n = s.numberOfFrames;
  if (bufs.L.length < n) { bufs.L = new Float32Array(n); bufs.R = new Float32Array(n); }
  s.copyTo(bufs.L, { planeIndex: 0, format: 'f32-planar' });
  if (s.numberOfChannels > 1) s.copyTo(bufs.R, { planeIndex: 1, format: 'f32-planar' });
  else bufs.R.set(bufs.L.subarray(0, n));
  return n;
}

async function analyze(file) {
  const input = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(file) });
  if (!(await input.canRead())) throw new Error('unsupported-file');
  const format = await input.getFormat();
  const video = await input.getPrimaryVideoTrack();
  const audios = await input.getAudioTracks();
  const primary = await input.getPrimaryAudioTrack();
  let audio = null;
  for (const t of [primary, ...audios]) {
    if (t && (await t.getCodec()) && (await t.canDecode())) { audio = t; break; }
  }
  if (!audio) throw new Error(audios.length ? 'audio-not-decodable' : 'no-audio');

  const extra = [];
  for (const t of audios) if (t !== audio) extra.push({ codec: await t.getCodec(), channels: await t.getNumberOfChannels() });
  const duration = await input.computeDuration();
  const sampleRate = await audio.getSampleRate();
  const channels = await audio.getNumberOfChannels();
  const info = {
    name: file.name,
    size: file.size,
    container: format.name,
    duration,
    audio: { codec: await audio.getCodec(), sampleRate, channels },
    // iPhone Spatial Audio rides along as an extra 4-channel track in a codec only Apple decodes.
    spatial: extra.some((e) => !e.codec && e.channels === 4),
    extraTracks: extra.length,
    video: video ? {
      codec: await video.getCodec(),
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      rotation: await video.getRotation(),
      color: await video.getColorSpace(),
    } : null,
  };
  post('info', { info });

  const an = new Analyzer(sampleRate);
  const sink = new MB.AudioSampleSink(audio);
  const bufs = { L: new Float32Array(4096), R: new Float32Array(4096) };
  let frames = 0, last = 0, audioEnd = 0;
  for await (const s of sink.samples()) {
    const n = readStereo(s, bufs);
    const ts = s.timestamp;
    s.close();
    an.push(bufs.L, bufs.R, n);
    frames += n;
    audioEnd = Math.max(audioEnd, ts + n / sampleRate);
    const now = performance.now();
    if (now - last > 120) { last = now; post('progress', { stage: 'analyze', value: duration ? ts / duration : 0 }); }
  }
  const stats = an.finish();
  job = { file, input, audio, video, info, stats, frames, audioEnd };
  const tl = new Float32Array(stats.timeline.length * 5);
  stats.timeline.forEach((t, i) => tl.set(t, i * 5));
  const { timeline, noise, ...summary } = stats;
  post('analysis', { stats: summary, timeline: tl, noise: noise.map((a) => a.slice()) }, [tl.buffer]);
}

async function exportFixed({ params, target, audioFormat }) {
  if (!job) throw new Error('nothing-loaded');
  const { input, audio, video, info, stats, frames, audioEnd } = job;
  const sr = info.audio.sampleRate;
  const outCh = info.audio.channels === 1 ? 1 : 2;

  // Video keeps its container family but always gets sample-exact PCM sound in MOV:
  // re-encoded AAC lands 2112 samples late in FFmpeg-based tools (no edit list).
  let format, codec, ext;
  if (video) { format = new MB.MovOutputFormat({ fastStart: false }); codec = 'pcm-s24'; ext = 'mov'; }
  else if (audioFormat === 'm4a' && (await MB.canEncodeAudio('aac', { numberOfChannels: outCh, sampleRate: sr }))) {
    format = new MB.Mp4OutputFormat({ fastStart: false }); codec = 'aac'; ext = 'm4a';
  } else { format = new MB.WavOutputFormat(); codec = 'pcm-s24'; ext = 'wav'; }

  const name = info.name.replace(/\.[^.]+$/, '') + ' (fixed).' + ext;
  const out = await openTarget(target, name);
  const output = new MB.Output({ format, target: new MB.StreamTarget(out.writable, { chunked: true, chunkSize: 8 << 20 }) });

  const chain = new Chain(sr, stats.noise);
  chain.set(params);
  chain.m = chain.mTarget.slice(); chain.g = chain.gTarget; chain.w = params.width || 0; // no fade-in of settings

  // The chain delays sound by chain.latency samples. Drop that many from the start
  // and push the same amount of silence through at the end, so timing stays exact.
  const bufs = { L: new Float32Array(4096), R: new Float32Array(4096) };
  let skip = chain.latency, t0 = null, emitted = 0, seen = 0, flushed = false;
  const emit = (n, out) => {
    chain.process(bufs.L, bufs.R, n);
    const off = Math.min(skip, n);
    skip -= off;
    if (off === n) return;
    const m = n - off, data = new Float32Array(m * outCh);
    data.set(bufs.L.subarray(off, n), 0);
    if (outCh === 2) data.set(bufs.R.subarray(off, n), m);
    out.push(new MB.AudioSample({ data, format: 'f32-planar', numberOfChannels: outCh, sampleRate: sr, timestamp: t0 + emitted / sr }));
    emitted += m;
  };
  const process = (s) => {
    if (t0 === null) t0 = s.timestamp;
    const end = s.timestamp + s.numberOfFrames / sr;
    const n = readStereo(s, bufs);
    s.close();
    seen += n;
    const res = [];
    emit(n, res);
    // Last block (same decoder as the analysis pass, so its end time matches).
    if (!flushed && (end >= audioEnd - 0.001 || seen >= frames)) {
      flushed = true;
      for (let left = chain.latency; left > 0;) {
        const m = Math.min(left, bufs.L.length);
        bufs.L.fill(0, 0, m); bufs.R.fill(0, 0, m);
        emit(m, res);
        left -= m;
      }
    }
    return res.length ? res : null;
  };

  conversion = await MB.Conversion.init({
    input, output, showWarnings: false,
    video: (t) => (t === video ? { rotate: params.rotate || 0, flip: !!params.mirror } : { discard: true }),
    audio: (t) => (t === audio ? {
      forceTranscode: true, codec, numberOfChannels: outCh, process, processedNumberOfChannels: outCh, processedSampleRate: sr,
      ...(codec === 'aac' ? { quality: MB.QUALITY_VERY_HIGH } : {}),
    } : { discard: true }),
  });
  if (!conversion.isValid) throw new Error('cannot-convert: ' + conversion.discardedTracks.map((d) => d.reason).join(', '));
  let last = 0;
  conversion.onProgress = (p) => {
    const now = performance.now();
    if (now - last > 120) { last = now; post('progress', { stage: 'export', value: p }); }
  };
  await conversion.execute();
  conversion = null;
  const size = await out.finish(ext === 'mov' ? (head, tail, end) => restoreVideoMetadata(head, tail, end, job.file) : null);
  post('exported', { name, size, ext, limiterDb: chain.lim.reduction, target: target.kind, debug: { seen, frames, emitted, flushed, t0 } });
}

// Output sink. Writes straight to the file the user picked (Chrome) or to the
// origin-private file system (Safari, Firefox), and remembers the first 64 KiB plus
// the most recent chunks so the trailing `moov` box can be patched without reading back.
async function openTarget(target, name) {
  let write, truncate, close;
  if (target.kind === 'handle') {
    const w = await target.handle.createWritable();
    write = (data, at) => w.write({ type: 'write', position: at, data });
    truncate = (size) => w.truncate(size);
    close = () => w.close();
  } else {
    const root = await navigator.storage.getDirectory();
    for await (const key of root.keys()) if (key.startsWith('fixed-')) await root.removeEntry(key).catch(() => {});
    const fh = await root.getFileHandle(target.name, { create: true });
    const h = await fh.createSyncAccessHandle();
    h.truncate(0);
    write = (data, at) => { h.write(data, { at }); };
    truncate = (size) => h.truncate(size);
    close = () => { h.flush(); h.close(); };
  }
  const HEAD = 1 << 16, head = new Uint8Array(HEAD), tail = [];
  let end = 0, tailBytes = 0;
  const writable = new WritableStream({
    async write({ data, position }) {
      await write(data, position);
      end = Math.max(end, position + data.length);
      if (position < HEAD) head.set(data.subarray(0, Math.min(data.length, HEAD - position)), position);
      tail.push({ position, data });
      tailBytes += data.length;
      while (tailBytes > 40 << 20 && tail.length > 2) tailBytes -= tail.shift().data.length;
    },
  });
  return {
    writable,
    async finish(patch) {
      const fixed = patch && (await patch(head, tail, end).catch(() => null));
      if (fixed) { await truncate(fixed.offset + fixed.bytes.length); await write(fixed.bytes, fixed.offset); end = fixed.offset + fixed.bytes.length; }
      await close();
      return end;
    },
  };
}

// ---------------------------------------------------------------- moov patch
// Mediabunny drops Dolby Vision ('dvcC'/'dvvC') and ambient-viewing ('amve') boxes and
// stamps the file with today's date. iPhone HDR clips need those boxes to display at the
// right brightness on Apple devices, so copy them (and the original dates) back in.

const KEEP = ['dvcC', 'dvvC', 'dvwC', 'amve', 'mdcv', 'clli'];
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const type = (b, o) => String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
const setU32 = (b, o, v) => { b[o] = v >>> 24; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; };

function boxSize(b, o, limit) {
  const s = u32(b, o);
  if (s === 1) return u32(b, o + 8) * 2 ** 32 + u32(b, o + 12);
  return s === 0 ? limit - o : s;
}
function children(b, start, endAt) {
  const out = [];
  for (let o = start; o + 8 <= endAt;) {
    const s = boxSize(b, o, endAt);
    if (s < 8 || o + s > endAt) break;
    out.push({ o, s, t: type(b, o) });
    o += s;
  }
  return out;
}
const child = (b, box, t, skip = 8) => children(b, box.o + skip, box.o + box.s).find((c) => c.t === t);

// Path from moov down to the first sample entry of the video track.
function videoEntryPath(m) {
  const moov = { o: 0, s: m.length, t: 'moov' };
  for (const trak of children(m, 8, m.length).filter((c) => c.t === 'trak')) {
    const mdia = child(m, trak, 'mdia'); if (!mdia) continue;
    const hdlr = child(m, mdia, 'hdlr');
    if (!hdlr || String.fromCharCode(...m.subarray(hdlr.o + 16, hdlr.o + 20)) !== 'vide') continue;
    const minf = child(m, mdia, 'minf'), stbl = minf && child(m, minf, 'stbl'), stsd = stbl && child(m, stbl, 'stsd');
    if (!stsd) return null;
    const entry = children(m, stsd.o + 16, stsd.o + stsd.s)[0];
    return entry ? [moov, trak, mdia, minf, stbl, stsd, entry] : null;
  }
  return null;
}

async function readInputMoov(file) {
  for (let o = 0; o + 8 <= file.size;) {
    const h = new Uint8Array(await file.slice(o, o + 16).arrayBuffer());
    const s = boxSize(h, 0, file.size - o);
    if (s < 8) return null;
    if (type(h, 0) === 'moov') return s > 64 << 20 ? null : new Uint8Array(await file.slice(o, o + s).arrayBuffer());
    o += s;
  }
  return null;
}

function mvhdTimes(m) {
  const mvhd = children(m, 8, m.length).find((c) => c.t === 'mvhd');
  if (!mvhd) return null;
  const v = m[mvhd.o + 8], p = mvhd.o + 12;
  return v === 1
    ? { mvhd, v, c: u32(m, p) * 2 ** 32 + u32(m, p + 4), mod: u32(m, p + 8) * 2 ** 32 + u32(m, p + 12) }
    : { mvhd, v, c: u32(m, p), mod: u32(m, p + 4) };
}

async function restoreVideoMetadata(head, tail, end, file) {
  // Locate the output moov: it follows mdat, whose final size the muxer patched into the head.
  let mdatAt = -1;
  for (let o = 0; o + 16 <= head.length;) {
    const s = boxSize(head, o, end);
    if (s < 8) return null;
    if (type(head, o) === 'mdat') { mdatAt = o; break; }
    o += s;
  }
  if (mdatAt < 0) return null;
  const moovAt = mdatAt + boxSize(head, mdatAt, end);
  if (end - moovAt > 40 << 20 || moovAt >= end) return null;
  const outMoov = new Uint8Array(end - moovAt), have = new Uint8Array(end - moovAt);
  for (const { position, data } of tail) {
    const a = Math.max(position, moovAt), z = Math.min(position + data.length, end);
    if (a < z) { outMoov.set(data.subarray(a - position, z - position), a - moovAt); have.fill(1, a - moovAt, z - moovAt); }
  }
  if (have.includes(0) || type(outMoov, 0) !== 'moov' || u32(outMoov, 0) !== outMoov.length) return null;

  const inMoov = await readInputMoov(file);
  if (!inMoov) return null;
  const inPath = videoEntryPath(inMoov), outPath = videoEntryPath(outMoov);
  if (!inPath || !outPath) return null;
  const inEntry = inPath[6], outEntry = outPath[6];
  const present = new Set(children(outMoov, outEntry.o + 86, outEntry.o + outEntry.s).map((c) => c.t));
  const add = children(inMoov, inEntry.o + 86, inEntry.o + inEntry.s).filter((c) => KEEP.includes(c.t) && !present.has(c.t));

  let m = outMoov;
  if (add.length) {
    const extra = add.reduce((n, c) => n + c.s, 0);
    const grown = new Uint8Array(m.length + extra);
    const at = outEntry.o + outEntry.s;
    grown.set(m.subarray(0, at), 0);
    let w = at;
    for (const c of add) { grown.set(inMoov.subarray(c.o, c.o + c.s), w); w += c.s; }
    grown.set(m.subarray(at), w);
    for (const box of outPath) setU32(grown, box.o, u32(grown, box.o) + extra); // moov..entry all contain the insert
    m = grown;
  }
  // Original capture dates, so Photos sorts the fixed copy next to the original.
  const src = mvhdTimes(inMoov), dst = mvhdTimes(m);
  if (src && dst && src.c > 0) {
    const p = dst.mvhd.o + 12;
    if (dst.v === 1) { setU32(m, p, Math.floor(src.c / 2 ** 32)); setU32(m, p + 4, src.c >>> 0); setU32(m, p + 8, Math.floor(src.mod / 2 ** 32)); setU32(m, p + 12, src.mod >>> 0); }
    else if (src.c < 2 ** 32) { setU32(m, p, src.c); setU32(m, p + 4, Math.min(src.mod, 2 ** 32 - 1)); }
  }
  return { offset: moovAt, bytes: m };
}
