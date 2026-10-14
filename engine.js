// Module worker: reads the recording, measures its sound and picture, and writes the fixed copy.
// By default the picture is copied packet for packet and only the audio track is rebuilt.
import * as MB from './vendor/mediabunny.min.mjs';
import { Analyzer, Chain } from './dsp.js';

let job = null;
let conversion = null;
let cancelled = false;

const post = (type, data = {}, transfer = []) => postMessage({ type, ...data }, transfer);

onmessage = async ({ data }) => {
  try {
    if (data.type === 'analyze') await analyze(data.file);
    else if (data.type === 'analyzePcm') await analyzePcm(data);
    else if (data.type === 'export') await exportFixed(data);
    else if (data.type === 'cancel') { cancelled = true; if (conversion) await conversion.cancel(); }
  } catch (err) {
    if (err instanceof MB.ConversionCanceledError || err?.message === 'canceled') post('canceled');
    else post('error', { stage: data.type, message: String((err && err.message) || err), stack: String(err?.stack || '').slice(0, 1500) });
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

function sendAnalysis(stats) {
  const tl = new Float32Array(stats.timeline.length * 5);
  stats.timeline.forEach((t, i) => tl.set(t, i * 5));
  const { timeline, noise, ...summary } = stats;
  post('analysis', { stats: summary, timeline: tl, noise: noise.map((a) => a.slice()) }, [tl.buffer]);
}

async function analyze(file) {
  const input = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(file) });
  if (!(await input.canRead())) {
    const raw = await readPcmHeader(file);
    if (raw && !raw.compressed) return analyzeRaw(file, raw);
    // AIFF-C or CAF holding compressed sound (often Apple Lossless): the page can try decoding it.
    throw new Error(raw ? `audio-not-decodable:${raw.codec}:audio:${raw.sampleRate}` : 'unsupported-file');
  }
  const format = await input.getFormat();
  const video = await input.getPrimaryVideoTrack();
  const audios = await input.getAudioTracks();
  const primary = await input.getPrimaryAudioTrack();
  let audio = null;
  for (const t of [primary, ...audios]) {
    if (t && (await t.getCodec()) && (await t.canDecode())) { audio = t; break; }
  }
  if (!audio) {
    const codecs = await Promise.all(audios.map((t) => t.getCodec()));
    const rate = audios.length ? await audios[0].getSampleRate() : 0;
    throw new Error(!audios.length ? 'no-audio' : `audio-not-decodable:${codecs.join(',') || 'unknown'}:${video ? 'video' : 'audio'}:${rate}`);
  }

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
  let frames = 0, last = 0, audioEnd = 0, audioStart = null;
  for await (const s of sink.samples()) {
    const n = readStereo(s, bufs);
    const ts = s.timestamp;
    if (audioStart === null) audioStart = ts;
    s.close();
    an.push(bufs.L, bufs.R, n);
    frames += n;
    audioEnd = Math.max(audioEnd, ts + n / sampleRate);
    const now = performance.now();
    if (now - last > 120) { last = now; post('progress', { stage: 'analyze', value: duration ? ts / duration : 0 }); }
  }
  const stats = an.finish();
  job = { file, input, audio, video, info, stats, frames, audioEnd, audioStart: audioStart ?? 0 };
  sendAnalysis(stats);
  if (video) { job.picture = await analyzeVideo(video, stats, duration); post('video', { video: job.picture }); }
}

// Files the browser decoded itself (Apple Lossless, AIFF, CAF): the samples arrive in memory.
async function analyzePcm({ name, size, sampleRate, channels }) {
  const L = channels[0], R = channels[1] || channels[0];
  const info = {
    name, size, container: 'decoded', duration: L.length / sampleRate,
    audio: { codec: 'decoded', sampleRate, channels: channels.length > 1 ? 2 : 1 },
    spatial: false, extraTracks: 0, video: null,
  };
  post('info', { info });
  const an = new Analyzer(sampleRate);
  let last = 0;
  for (let i = 0; i < L.length; i += 8192) {
    const n = Math.min(8192, L.length - i);
    an.push(L.subarray(i, i + n), R.subarray(i, i + n), n);
    const now = performance.now();
    if (now - last > 120) { last = now; post('progress', { stage: 'analyze', value: i / L.length }); }
  }
  const stats = an.finish();
  job = { pcm: { L, R }, info, stats, frames: L.length, audioEnd: L.length / sampleRate, audioStart: 0 };
  sendAnalysis(stats);
}

// ---------------------------------------------------------------- AIFF and CAF
// Mediabunny can't open these. Their uncompressed sound is simple to read straight from the
// file in blocks, so they work in every browser without loading the whole file into memory.

async function readPcmHeader(file) {
  const read = async (o, n) => new DataView(await file.slice(o, o + n).arrayBuffer());
  const tag = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (file.size < 12) return null;
  const top = await read(0, 12);
  if (tag(top, 0) === 'FORM' && ['AIFF', 'AIFC'].includes(tag(top, 8))) {
    let fmt = null, data = null;
    for (let o = 12; o + 8 <= file.size && !(fmt && data !== null);) {
      const h = await read(o, 8), t = tag(h, 0), size = h.getUint32(4);
      if (t === 'COMM') {
        const c = await read(o + 8, Math.min(size, 64));
        const exp = c.getUint16(8) & 0x7fff, mant = c.getUint32(10) * 2 ** 32 + c.getUint32(14);
        fmt = { channels: c.getUint16(0), frames: c.getUint32(2), bits: c.getUint16(6), sampleRate: Math.round(mant * 2 ** (exp - 16383 - 63)), comp: tag(top, 8) === 'AIFC' ? tag(c, 18) : 'NONE' };
      } else if (t === 'SSND') data = o + 16 + (await read(o + 8, 4)).getUint32(0);
      o += 8 + size + (size & 1);
    }
    if (!fmt || data === null) return null;
    const bits = { fl32: 32, FL32: 32, fl64: 64, FL64: 64, in24: 24, in32: 32 }[fmt.comp] || fmt.bits;
    if (!['NONE', 'twos', 'sowt', 'fl32', 'FL32', 'fl64', 'FL64', 'in24', 'in32'].includes(fmt.comp)) return { compressed: true, codec: fmt.comp.trim().toLowerCase(), sampleRate: fmt.sampleRate };
    return { kind: 'AIFF', offset: data, frames: fmt.frames, channels: fmt.channels, sampleRate: fmt.sampleRate, bits, float: /^(fl|FL)/.test(fmt.comp), little: fmt.comp === 'sowt' };
  }
  if (tag(top, 0) === 'caff') {
    let desc = null;
    for (let o = 8; o + 12 <= file.size;) {
      const h = await read(o, 12), t = tag(h, 0), size = Number(h.getBigInt64(4));
      if (t === 'desc') {
        const d = await read(o + 12, 32);
        desc = { sampleRate: d.getFloat64(0), id: tag(d, 8), flags: d.getUint32(12), bpp: d.getUint32(16), channels: d.getUint32(24), bits: d.getUint32(28) };
      } else if (t === 'data') {
        if (!desc) return null;
        if (desc.id !== 'lpcm' || ![8, 16, 24, 32, 64].includes(desc.bits)) return { compressed: true, codec: desc.id.trim().toLowerCase(), sampleRate: Math.round(desc.sampleRate) };
        const start = o + 16, bytes = size < 0 ? file.size - start : Math.min(size - 4, file.size - start);
        const bpf = desc.bpp || (desc.bits / 8) * desc.channels;
        return { kind: 'CAF', offset: start, frames: Math.floor(bytes / bpf), channels: desc.channels, sampleRate: Math.round(desc.sampleRate), bits: desc.bits, float: !!(desc.flags & 1), little: !!(desc.flags & 2) };
      }
      if (size < 0) break;
      o += 12 + size;
    }
  }
  return null;
}

function sampleReader(raw, dv) {
  const le = raw.little;
  if (raw.float) return raw.bits === 64 ? (o) => dv.getFloat64(o, le) : (o) => dv.getFloat32(o, le);
  if (raw.bits === 8) return (o) => dv.getInt8(o) / 128;
  if (raw.bits === 16) return (o) => dv.getInt16(o, le) / 32768;
  if (raw.bits === 32) return (o) => dv.getInt32(o, le) / 2147483648;
  return le
    ? (o) => (dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getInt8(o + 2) << 16)) / 8388608
    : (o) => ((dv.getInt8(o) << 16) | (dv.getUint8(o + 1) << 8) | dv.getUint8(o + 2)) / 8388608;
}

// Fills bufs with up to 4096 frames at a time (the chain's block size) and yields the count.
async function* rawBlocks(file, raw, a, z, bufs) {
  const bps = raw.bits / 8, bpf = bps * raw.channels, chunk = 1 << 16;
  for (let i = a; i < z; i += chunk) {
    const want = Math.min(chunk, z - i);
    const dv = new DataView(await file.slice(raw.offset + i * bpf, raw.offset + (i + want) * bpf).arrayBuffer());
    const got = Math.floor(dv.byteLength / bpf), get = sampleReader(raw, dv);
    for (let f0 = 0; f0 < got; f0 += 4096) {
      const n = Math.min(4096, got - f0);
      for (let f = 0; f < n; f++) {
        const o = (f0 + f) * bpf;
        bufs.L[f] = get(o);
        bufs.R[f] = raw.channels > 1 ? get(o + bps) : bufs.L[f];
      }
      yield n;
    }
    if (got < want) return;
  }
}

function* memBlocks({ L, R }, a, z, bufs) {
  for (let i = a; i < z; i += 4096) {
    const n = Math.min(4096, z - i);
    bufs.L.set(L.subarray(i, i + n)); bufs.R.set(R.subarray(i, i + n));
    yield n;
  }
}

async function analyzeRaw(file, raw) {
  const info = {
    name: file.name, size: file.size, container: raw.kind, duration: raw.frames / raw.sampleRate,
    audio: { codec: raw.float ? 'pcm-f' + raw.bits : 'pcm-s' + raw.bits, sampleRate: raw.sampleRate, channels: Math.min(raw.channels, 2) },
    spatial: false, extraTracks: 0, video: null,
  };
  post('info', { info });
  const an = new Analyzer(raw.sampleRate);
  const bufs = { L: new Float32Array(4096), R: new Float32Array(4096) };
  let done = 0, last = 0;
  for await (const n of rawBlocks(file, raw, 0, raw.frames, bufs)) {
    an.push(bufs.L, bufs.R, n);
    done += n;
    const now = performance.now();
    if (now - last > 120) { last = now; post('progress', { stage: 'analyze', value: done / raw.frames }); }
  }
  const stats = an.finish();
  job = { file, raw, info, stats, frames: done, audioEnd: done / raw.sampleRate, audioStart: 0 };
  sendAnalysis(stats);
}

// ---------------------------------------------------------------- picture checks

// Reads only packet timestamps (no decoding) for frame-rate drops, then grabs small frames
// before and during the strongest one-sided sounds to see which side of the picture moved.
async function analyzeVideo(video, stats, duration) {
  const res = { fps: null, picture: null, brightness: null };
  try {
    const ts = [];
    for await (const p of new MB.EncodedPacketSink(video).packets(undefined, undefined, { metadataOnly: true })) {
      ts.push(p.timestamp);
      if (ts.length > 500000) break;
    }
    ts.sort((a, b) => a - b);
    if (ts.length > 60) {
      const gaps = [];
      for (let i = 1; i < ts.length; i++) if (ts[i] > ts[i - 1]) gaps.push(ts[i] - ts[i - 1]);
      const sorted = gaps.slice().sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      const nominal = 1 / med, start = ts[0], secs = Math.max(1, Math.floor(ts[ts.length - 1] - start));
      const counts = new Array(secs).fill(0);
      for (const t of ts) { const k = Math.floor(t - start); if (k < secs) counts[k]++; }
      const low = counts.filter((c) => c < nominal * 0.85).length;
      const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 100, 119.88, 120, 240];
      const close = common.reduce((best, r) => (Math.abs(r - nominal) < Math.abs(best - nominal) ? r : best));
      const near = Math.abs(close - nominal) / close < 0.015 ? close : null;
      res.fps = {
        nominal: near || Math.round(nominal * 100) / 100,
        lowSeconds: low,
        seconds: secs,
        lowest: Math.min(...counts),
        variable: gaps.filter((g) => Math.abs(g - med) > med * 0.1).length / gaps.length,
      };
    }
  } catch { /* timing is a bonus check */ }
  try {
    const dw = await video.getDisplayWidth(), dh = await video.getDisplayHeight();
    const w = 96, h = Math.max(24, Math.round((96 * dh) / dw / 2) * 2);
    const moments = (stats.sideMoments || []).slice(0, 6);
    const times = [];
    for (const m of moments) times.push(Math.max(0, m.t - 0.4), m.t + 0.05);
    const even = Array.from({ length: 8 }, (_, i) => ((i + 0.5) / 8) * (duration || 1));
    times.push(...even);
    // Decode in time order (each packet at most once), then put the frames back in request order.
    const order = times.map((t, i) => i).sort((a, b) => times[a] - times[b]);
    const frames = new Array(times.length).fill(null);
    const sink = new MB.CanvasSink(video, { width: w, height: h, fit: 'fill' });
    let k = 0;
    for await (const wc of sink.canvasesAtTimestamps(order.map((i) => times[i]))) frames[order[k++]] = wc ? luma(wc.canvas, w, h) : null;
    const lit = frames.slice(moments.length * 2).filter(Boolean);
    if (lit.length) res.brightness = lit.reduce((s, f) => s + f.mean, 0) / lit.length;
    let agree = 0, disagree = 0, unsure = 0;
    moments.forEach((m, i) => {
      const a = frames[i * 2], b = frames[i * 2 + 1];
      if (!a || !b) { unsure++; return; }
      let left = 0, right = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = Math.abs(a.px[y * w + x] - b.px[y * w + x]);
        if (x < w * 0.45) left += d; else if (x > w * 0.55) right += d;
      }
      if ((left + right) / (w * h) < 0.004) { unsure++; return; } // nothing moved
      const ratio = left / (right + 1e-9), pic = ratio > 1.5 ? 1 : ratio < 1 / 1.5 ? -1 : 0;
      if (!pic) { unsure++; return; }
      if (pic === (m.ild > 0 ? 1 : -1)) agree++; else disagree++;
    });
    res.picture = { checked: moments.length, agree, disagree, unsure };
  } catch (e) { res.pictureError = String(e?.message || e); }
  return res;
}

function luma(canvas, w, h) {
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const px = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < px.length; i++) { px[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255; sum += px[i]; }
  return { px, mean: sum / px.length };
}

// ---------------------------------------------------------------- export

// How far the browser's AAC encoder delays the start (priming). Measured once by encoding
// and decoding a short burst; Apple's encoder (Safari, Chrome on Mac) uses 2112 samples.
let priming = null;
async function aacPriming(sr, ch) {
  if (priming !== null) return priming;
  priming = 2112;
  try {
    const n = 16384, len = Math.round(sr * 0.02), chunks = [];
    let config = null;
    const enc = new AudioEncoder({ output: (c, meta) => { chunks.push(c); if (meta?.decoderConfig) config = meta.decoderConfig; }, error: () => {} });
    enc.configure({ codec: 'mp4a.40.2', sampleRate: sr, numberOfChannels: ch, bitrate: 192000 });
    const data = new Float32Array(n * ch), ref = new Float32Array(len);
    let seed = 12345;
    for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) >>> 0; ref[i] = 0.5 * (seed / 2 ** 31 - 1) * Math.sin((Math.PI * i) / len); }
    for (let c = 0; c < ch; c++) data.set(ref, c * n);
    enc.encode(new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: 0, data }));
    await enc.flush(); enc.close();
    const parts = [];
    const dec = new AudioDecoder({ output: (a) => { const f = new Float32Array(a.numberOfFrames); a.copyTo(f, { planeIndex: 0, format: 'f32-planar' }); parts.push(f); a.close(); }, error: () => {} });
    dec.configure(config);
    for (const c of chunks) dec.decode(c);
    await dec.flush(); dec.close();
    const y = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
    parts.reduce((o, p) => (y.set(p, o), o + p.length), 0);
    let best = 0, lag = priming;
    for (let l = 0; l < 6000 && l + len < y.length; l++) {
      let s = 0;
      for (let i = 0; i < len; i++) s += ref[i] * y[l + i];
      if (s > best) { best = s; lag = l; }
    }
    if (best > 0) priming = lag;
  } catch { /* keep Apple's 2112 */ }
  return priming;
}

// Safari's H.264 encoder (macOS 27, iOS 26, and every iPhone browser) takes a few frames in
// Main or High profile, never returns any, and the encode then waits forever. Check once with the
// same pacing Mediabunny uses; if it stalls, every H.264 encoder this worker opens uses
// Constrained Baseline instead, which that encoder handles.
let avcChecked = false;
async function fixAvcEncoder() {
  if (avcChecked || typeof VideoEncoder === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
  avcChecked = true;
  const within = (promise, ms) => Promise.race([promise.then(() => true), new Promise((r) => setTimeout(() => r(false), ms))]);
  let got = 0, ok = true, enc = null;
  try {
    enc = new VideoEncoder({ output: () => { got++; }, error: () => { ok = false; } });
    enc.configure({ codec: 'avc1.64001f', width: 640, height: 360, bitrate: 2e6, framerate: 30, latencyMode: 'quality' });
    const cv = new OffscreenCanvas(640, 360), cx = cv.getContext('2d');
    for (let i = 0; i < 24 && ok; i++) {
      cx.fillStyle = `hsl(${i * 15} 70% 50%)`; cx.fillRect(0, 0, 640, 360);
      const f = new VideoFrame(cv, { timestamp: i * 33333 });
      enc.encode(f, { keyFrame: i === 0 }); f.close();
      if (enc.encodeQueueSize >= 4) ok = await within(new Promise((r) => enc.addEventListener('dequeue', r, { once: true })), 1000);
    }
    if (ok) ok = (await within(enc.flush(), 2000)) && got > 0;
  } catch { return; } finally { try { enc?.close(); } catch { /* already closed */ } }
  if (ok) return;
  const configure = VideoEncoder.prototype.configure;
  VideoEncoder.prototype.configure = function (config) {
    const c = config?.codec || '';
    return configure.call(this, /^avc[13]\.[0-9a-f]{6}$/i.test(c) ? { ...config, codec: c.slice(0, 5) + '42e0' + c.slice(9) } : config);
  };
}

// What to write. "original" keeps the picture untouched in its own container family with
// lossless sound; "small" is MP4 + AAC with an edit list so the AAC delay can't shift sync;
// "social" re-encodes the picture to standard H.264 for TikTok and Instagram (HDR becomes SDR).
async function plan(mode, audioFormat, outCh, sr) {
  const { video, info } = job;
  const aac = await MB.canEncodeAudio('aac', { numberOfChannels: outCh, sampleRate: sr });
  if (!video) {
    return audioFormat === 'm4a' && aac
      ? { format: new MB.Mp4OutputFormat({ fastStart: false }), codec: 'aac', ext: 'm4a', patch: { priming: true } }
      : { format: new MB.WavOutputFormat(), codec: 'pcm-s24', ext: 'wav' };
  }
  if ((mode === 'small' || mode === 'social') && aac) {
    return {
      format: new MB.Mp4OutputFormat({ fastStart: false }), codec: 'aac', ext: 'mp4',
      patch: { priming: true, dolby: mode === 'small', dates: true }, social: mode === 'social',
    };
  }
  const notice = mode === 'small' || mode === 'social' ? 'aac-unavailable' : null;
  if (info.container === 'Matroska') return { format: new MB.MkvOutputFormat(), codec: 'pcm-s24', ext: 'mkv', notice };
  if (info.container === 'WebM') return { format: new MB.WebMOutputFormat(), codec: 'opus', ext: 'webm', notice };
  return { format: new MB.MovOutputFormat({ fastStart: false }), codec: 'pcm-s24', ext: 'mov', patch: { dolby: true, dates: true }, notice };
}

async function exportFixed(data) {
  if (!job) throw new Error('nothing-loaded');
  cancelled = false;
  // Each step down needs less from the browser: TikTok & Reels needs H.264 and AAC encoders, the
  // smaller MP4 and M4A need AAC, the original format and WAV need neither. Some browsers claim an
  // encoder they can't run, so a failed save tries the next step and says what happened.
  const tries = job.video
    ? { social: ['social', 'small', 'original'], small: ['small', 'original'] }[data.mode] || ['original']
    : data.audioFormat === 'm4a' ? ['m4a', 'wav'] : ['wav'];
  let notice = null;
  for (let i = 0; ; i++) {
    try {
      return await exportOnce(job.video ? data : { ...data, audioFormat: tries[i] }, job.video ? tries[i] : 'original', notice);
    } catch (err) {
      if (cancelled || err instanceof MB.ConversionCanceledError || err?.message === 'canceled' || i === tries.length - 1) throw err;
      conversion = null;
      notice = tries[i] === 'social' ? 'social-unavailable' : 'aac-unavailable';
    }
  }
}

async function exportOnce({ params, target, audioFormat }, mode, notice = null) {
  const { info } = job;
  const sr = info.audio.sampleRate;
  const outCh = info.audio.channels === 1 ? 1 : 2;
  const p = await plan(mode, audioFormat, outCh, sr);
  const name = info.name.replace(/\.[^.]+$/, '') + ' (fixed).' + p.ext;
  const out = await openTarget(target, name);
  try {
    await writeFixed(out, p, params, sr, outCh, target, name, notice);
  } catch (err) {
    await out.abort();
    throw err;
  }
}

async function writeFixed(out, p, params, sr, outCh, target, name, notice) {
  const { info, stats, frames, audioEnd } = job;
  const output = new MB.Output({ format: p.format, target: new MB.StreamTarget(out.writable, { chunked: true, chunkSize: 8 << 20 }) });

  const chain = new Chain(sr, stats.noise);
  chain.set(params);
  chain.m = chain.mTarget.slice(); chain.g = chain.gTarget; chain.w = params.width || 0; // no fade-in of settings

  // The chain delays sound by chain.latency samples: drop that many at the start and push the
  // same amount of silence through at the end. A sync offset moves that cut point.
  const delay = Math.round(((params.delayMs || 0) / 1000) * sr);
  const bufs = { L: new Float32Array(4096), R: new Float32Array(4096) };
  let skip = chain.latency - delay, pad = 0, t0 = null, emitted = 0;
  if (skip < 0) { pad = -skip; skip = 0; }
  const emit = (n, res) => {
    chain.process(bufs.L, bufs.R, n);
    const off = Math.min(skip, n);
    skip -= off;
    if (off === n) return;
    const m = n - off, data = new Float32Array(m * outCh);
    data.set(bufs.L.subarray(off, n), 0);
    if (outCh === 2) data.set(bufs.R.subarray(off, n), m);
    res.push(new MB.AudioSample({ data, format: 'f32-planar', numberOfChannels: outCh, sampleRate: sr, timestamp: t0 + emitted / sr }));
    emitted += m;
  };
  const silence = (count, res, through) => {
    for (let left = count; left > 0;) {
      const m = Math.min(left, bufs.L.length);
      bufs.L.fill(0, 0, m); bufs.R.fill(0, 0, m);
      if (through) emit(m, res);
      else {
        res.push(new MB.AudioSample({ data: new Float32Array(m * outCh), format: 'f32-planar', numberOfChannels: outCh, sampleRate: sr, timestamp: t0 + emitted / sr }));
        emitted += m;
      }
      left -= m;
    }
  };

  const trim = params.trim && (params.trim.start > 0 || params.trim.end < info.duration) ? { start: Math.max(0, params.trim.start || 0), end: Math.min(info.duration, params.trim.end || info.duration) } : null;

  if (job.pcm || job.raw) {
    // Sound we read ourselves (decoded in memory, or AIFF/CAF from the file): feed the encoder directly.
    const source = new MB.AudioSampleSource(p.codec === 'aac' ? { codec: 'aac', quality: MB.QUALITY_VERY_HIGH } : { codec: p.codec });
    output.addAudioTrack(source);
    await output.start();
    const total = job.pcm ? job.pcm.L.length : job.frames;
    const a = trim ? Math.round(trim.start * sr) : 0, z = trim ? Math.min(total, Math.round(trim.end * sr)) : total;
    const blocks = job.pcm ? memBlocks(job.pcm, a, z, bufs) : rawBlocks(job.file, job.raw, a, z, bufs);
    t0 = 0;
    const res = [];
    silence(pad, res, false);
    let done = 0, last = 0;
    const drain = async () => { for (const s of res.splice(0)) { await source.add(s); s.close(); } };
    for await (const n of blocks) {
      if (cancelled) throw new Error('canceled');
      emit(n, res);
      done += n;
      await drain();
      const now = performance.now();
      if (now - last > 120) { last = now; post('progress', { stage: 'export', value: done / Math.max(1, z - a) }); }
    }
    silence(chain.latency, res, true);
    await drain();
    source.close();
    await output.finalize();
  } else {
    const { input, audio, video } = job;
    // Samples reach `process` already cut to the trim range and moved onto the output timeline.
    // Work out where the last one ends there, so the chain's tail can be flushed right after it.
    const start = trim ? trim.start : Math.max(0, await input.getFirstTimestamp([video, audio].filter(Boolean)));
    const endIn = Math.min(audioEnd, trim ? trim.end : Infinity);
    let seen = 0, flushed = false, endOut = Infinity;
    const process = (s) => {
      if (t0 === null) { t0 = s.timestamp; endOut = t0 + endIn - Math.max(start, job.audioStart); }
      const end = s.timestamp + s.numberOfFrames / sr;
      const n = readStereo(s, bufs);
      s.close();
      seen += n;
      const res = [];
      if (pad) { silence(pad, res, false); pad = 0; }
      emit(n, res);
      // Last block (same decoder as the analysis pass, so its end time matches).
      if (!flushed && (end >= endOut - 0.0005 || seen >= frames)) {
        flushed = true;
        silence(chain.latency, res, true);
      }
      return res.length ? res : null;
    };
    const audioOpts = {
      forceTranscode: true, codec: p.codec, numberOfChannels: outCh, process, processedNumberOfChannels: outCh, processedSampleRate: sr,
      ...(p.codec === 'aac' || p.codec === 'opus' ? { quality: MB.QUALITY_VERY_HIGH } : {}),
    };
    let videoOpts = { rotate: params.rotate || 0, flip: !!params.mirror };
    if (p.social) {
      await fixAvcEncoder();
      // Re-encode to H.264 at up to 1920 on the long side, with rotation and mirroring baked
      // into the pixels. Drawing HDR frames into the encoder's canvas converts them to SDR.
      const turned = (params.rotate || 0) % 180 !== 0;
      const dw = turned ? info.video.height : info.video.width, dh = turned ? info.video.width : info.video.height;
      const scale = Math.min(1, 1920 / Math.max(dw, dh));
      const W = Math.round((dw * scale) / 2) * 2, H = Math.round((dh * scale) / 2) * 2;
      // iPhone video has a variable frame rate (Auto FPS mixes 24 and 30 in dim light); editors and
      // apps expect a steady one, so frames are repeated or dropped onto the clip's usual rate.
      const fps = job.picture?.fps?.nominal;
      videoOpts = {
        codec: 'avc', forceTranscode: true, allowTransformationMetadata: false,
        rotate: params.rotate || 0, flip: !!params.mirror,
        width: W, height: H, fit: 'contain', quality: MB.QUALITY_HIGH,
        ...(fps >= 10 && fps <= 120 ? { frameRate: fps } : {}),
      };
      if (['hlg', 'pq'].includes(info.video.color?.transfer)) {
        // HDR: redraw every frame onto an ordinary sRGB canvas, which tone-maps it to SDR.
        let cv = null, cx = null;
        Object.assign(videoOpts, {
          processedWidth: W, processedHeight: H,
          process: (s) => {
            if (!cv || cv.width !== s.codedWidth || cv.height !== s.codedHeight) {
              cv = new OffscreenCanvas(s.codedWidth, s.codedHeight);
              cx = cv.getContext('2d', { colorSpace: 'srgb' });
            }
            cx.drawImage(s.toCanvasImageSource(), 0, 0, cv.width, cv.height);
            return cv;
          },
        });
      }
    }
    conversion = await MB.Conversion.init({
      input, output, showWarnings: false, ...(trim ? { trim } : {}),
      video: (t) => (t === video ? videoOpts : { discard: true }),
      audio: (t) => (t === audio ? audioOpts : { discard: true }),
    });
    const lost = conversion.discardedTracks.find((d) => d.track === video || d.track === audio);
    if (!conversion.isValid || lost) throw new Error('cannot-convert: ' + (lost ? (lost.track === video ? 'video ' : 'audio ') + lost.reason : conversion.discardedTracks.map((d) => d.reason).join(', ')));
    let last = 0;
    conversion.onProgress = (v) => {
      const now = performance.now();
      if (now - last > 120) { last = now; post('progress', { stage: 'export', value: v }); }
    };
    await conversion.execute();
    conversion = null;
  }

  const prime = p.patch?.priming ? await aacPriming(sr, outCh) : 0;
  const patch = p.patch ? (head, tail, end) => patchMoov(head, tail, end, job.file, { ...p.patch, priming: prime, frames: emitted, sampleRate: sr }) : null;
  const { size, blob } = await out.finish(patch);
  post('exported', { name, size, blob, ext: p.ext, mode: p.social ? 'social' : p.ext === 'mp4' ? 'small' : 'original', notice: p.notice || notice, limiterDb: chain.lim.reduction, target: target.kind });
}

// Output sink. Writes straight to the file the user picked (Chrome) or to the
// origin-private file system (Safari, Firefox), and remembers the first 64 KiB plus
// the most recent chunks so the trailing `moov` box can be patched without reading back.
// Where that file system is missing (private browsing, in-app browsers), the copy is built in
// memory instead and handed back as a Blob.
async function openTarget(target, name) {
  let write, truncate, close, abort, parts = null;
  if (target.kind === 'handle') {
    const w = await target.handle.createWritable();
    write = (data, at) => w.write({ type: 'write', position: at, data });
    truncate = (size) => w.truncate(size);
    close = () => w.close();
    abort = () => w.abort();
  } else {
    let h = null;
    try {
      const root = await navigator.storage.getDirectory();
      for await (const key of root.keys()) if (key.startsWith('fixed-')) await root.removeEntry(key).catch(() => {});
      const fh = await root.getFileHandle(target.name, { create: true });
      h = await fh.createSyncAccessHandle();
      h.truncate(0);
    } catch { h = null; }
    if (h) {
      write = (data, at) => { h.write(data, { at }); };
      truncate = (size) => h.truncate(size);
      close = () => { h.flush(); h.close(); };
      abort = () => h.close();
    } else {
      // Sorted, non-overlapping pieces. A write over earlier bytes (header fix-ups) lands in place.
      parts = [];
      write = (data, at) => {
        const copy = data.slice();
        for (const p of parts) {
          const a = Math.max(at, p.at), z = Math.min(at + copy.length, p.at + p.data.length);
          if (a < z) p.data.set(copy.subarray(a - at, z - at), a - p.at);
        }
        const last = parts[parts.length - 1], tip = last ? last.at + last.data.length : 0;
        if (at + copy.length > tip) { const from = Math.max(at, tip); parts.push({ at: from, data: copy.subarray(from - at) }); }
      };
      truncate = (size) => {
        parts = parts.filter((p) => p.at < size);
        const last = parts[parts.length - 1];
        if (last && last.at + last.data.length > size) last.data = last.data.subarray(0, size - last.at);
      };
      close = () => {};
      abort = () => { parts = []; };
    }
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
      if (!parts) return { size: end };
      const pieces = [];
      let at = 0;
      for (const p of parts) { if (p.at > at) pieces.push(new Uint8Array(p.at - at)); pieces.push(p.data); at = p.at + p.data.length; }
      parts = null;
      return { size: end, blob: new Blob(pieces) };
    },
    // A failed or cancelled save must let go of the file, or the next save can't open it.
    async abort() { try { await abort(); } catch { /* already closed */ } },
  };
}

// ---------------------------------------------------------------- moov patch
// Mediabunny drops Dolby Vision ('dvcC'/'dvvC') and ambient-viewing ('amve') boxes, stamps
// the file with today's date, and writes no edit list for AAC priming. Fix all three in the
// trailing moov, which can grow freely because nothing points past it.

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
const handler = (m, mdia) => { const h = child(m, mdia, 'hdlr'); return h ? String.fromCharCode(...m.subarray(h.o + 16, h.o + 20)) : ''; };

function trakOf(m, kind) {
  for (const trak of children(m, 8, m.length).filter((c) => c.t === 'trak')) {
    const mdia = child(m, trak, 'mdia');
    if (mdia && handler(m, mdia) === kind) return { trak, mdia };
  }
  return null;
}

// Path from moov down to the first sample entry of the video track.
function videoEntryPath(m) {
  const t = trakOf(m, 'vide');
  if (!t) return null;
  const minf = child(m, t.mdia, 'minf'), stbl = minf && child(m, minf, 'stbl'), stsd = stbl && child(m, stbl, 'stsd');
  if (!stsd) return null;
  const entry = children(m, stsd.o + 16, stsd.o + stsd.s)[0];
  return entry ? [{ o: 0, s: m.length, t: 'moov' }, t.trak, t.mdia, minf, stbl, stsd, entry] : null;
}

// Inserts bytes at `at` (and removes `cut` bytes there), growing every box in `path`.
function splice(m, at, bytes, path, cut = 0) {
  const delta = bytes.length - cut, out = new Uint8Array(m.length + delta);
  out.set(m.subarray(0, at), 0);
  out.set(bytes, at);
  out.set(m.subarray(at + cut), at + bytes.length);
  for (const box of path) setU32(out, box.o, u32(out, box.o) + delta);
  return out;
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

const fullBox = (m, box) => ({ v: m[box.o + 8], p: box.o + 12 });
function times(m, box) { // mvhd/mdhd: creation, modification, timescale, duration
  const { v, p } = fullBox(m, box);
  return v === 1
    ? { v, p, c: u32(m, p) * 2 ** 32 + u32(m, p + 4), mod: u32(m, p + 8) * 2 ** 32 + u32(m, p + 12), scale: u32(m, p + 16), dur: u32(m, p + 20) * 2 ** 32 + u32(m, p + 24) }
    : { v, p, c: u32(m, p), mod: u32(m, p + 4), scale: u32(m, p + 8), dur: u32(m, p + 12) };
}

async function patchMoov(head, tail, end, file, { dolby, dates, priming, frames, sampleRate }) {
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
  let m = new Uint8Array(end - moovAt);
  const have = new Uint8Array(end - moovAt);
  for (const { position, data } of tail) {
    const a = Math.max(position, moovAt), z = Math.min(position + data.length, end);
    if (a < z) { m.set(data.subarray(a - position, z - position), a - moovAt); have.fill(1, a - moovAt, z - moovAt); }
  }
  if (have.includes(0) || type(m, 0) !== 'moov' || u32(m, 0) !== m.length) return null;

  const inMoov = dolby || dates ? await readInputMoov(file) : null;
  if (dolby && inMoov) {
    const inPath = videoEntryPath(inMoov), outPath = videoEntryPath(m);
    if (inPath && outPath) {
      const inEntry = inPath[6], outEntry = outPath[6];
      const present = new Set(children(m, outEntry.o + 86, outEntry.o + outEntry.s).map((c) => c.t));
      const add = children(inMoov, inEntry.o + 86, inEntry.o + inEntry.s).filter((c) => KEEP.includes(c.t) && !present.has(c.t));
      if (add.length) {
        const bytes = new Uint8Array(add.reduce((n, c) => n + c.s, 0));
        add.reduce((w, c) => (bytes.set(inMoov.subarray(c.o, c.o + c.s), w), w + c.s), 0);
        m = splice(m, outEntry.o + outEntry.s, bytes, outPath);
      }
    }
  }
  // Original capture dates, so Photos sorts the fixed copy next to the original.
  const mvhdOut = children(m, 8, m.length).find((c) => c.t === 'mvhd');
  const mvhdIn = inMoov && children(inMoov, 8, inMoov.length).find((c) => c.t === 'mvhd');
  if (dates && mvhdOut && mvhdIn) {
    const src = times(inMoov, mvhdIn), dst = times(m, mvhdOut);
    if (src.c > 0) {
      if (dst.v === 1) { setU32(m, dst.p, Math.floor(src.c / 2 ** 32)); setU32(m, dst.p + 4, src.c >>> 0); setU32(m, dst.p + 8, Math.floor(src.mod / 2 ** 32)); setU32(m, dst.p + 12, src.mod >>> 0); }
      else if (src.c < 2 ** 32) { setU32(m, dst.p, src.c); setU32(m, dst.p + 4, Math.min(src.mod, 2 ** 32 - 1)); }
    }
  }
  // AAC priming: an edit list that starts the audio after the encoder's warm-up samples and
  // ends it on the last real one. An existing list (audio starting late) keeps its empty edit.
  if (priming > 0 && frames > 0 && mvhdOut) {
    const t = trakOf(m, 'soun'), mdhd = t && child(m, t.mdia, 'mdhd'), tkhd = t && child(m, t.trak, 'tkhd');
    if (t && mdhd && tkhd) {
      const mv = times(m, mvhdOut), md = times(m, mdhd);
      const seg = Math.round((frames / sampleRate) * mv.scale), mediaTime = Math.round((priming / sampleRate) * md.scale);
      const old = child(m, t.trak, 'edts'), elstOld = old && child(m, old, 'elst');
      const entries = [];
      if (elstOld) {
        const v = m[elstOld.o + 8], n = u32(m, elstOld.o + 12), w = v === 1 ? 20 : 12;
        for (let i = 0, q = elstOld.o + 16; i < n; i++, q += w) {
          const dur = v === 1 ? u32(m, q) * 2 ** 32 + u32(m, q + 4) : u32(m, q);
          const time = v === 1 ? u32(m, q + 12) : u32(m, q + 4); // -1 reads as 0xffffffff
          entries.push({ dur, empty: time === 0xffffffff });
        }
      }
      const list = [...entries.filter((e) => e.empty), { dur: seg, time: mediaTime }];
      if (entries.filter((e) => !e.empty).length <= 1 && list.every((e) => e.dur < 2 ** 32)) {
        const size = 16 + 12 * list.length, box = new Uint8Array(8 + size);
        setU32(box, 0, 8 + size); box.set([101, 100, 116, 115], 4); // 'edts'
        setU32(box, 8, size); box.set([101, 108, 115, 116], 12); // 'elst', version 0
        setU32(box, 20, list.length);
        list.forEach((e, i) => {
          const q = 24 + 12 * i;
          setU32(box, q, e.dur); setU32(box, q + 4, e.empty ? 0xffffffff : e.time); setU32(box, q + 8, 0x00010000);
        });
        const path = [{ o: 0 }, t.trak];
        m = old ? splice(m, old.o, box, path, old.s) : splice(m, tkhd.o + tkhd.s, box, path);
        // The track's duration follows its edits (tkhd sits before edts, so it hasn't moved).
        const total = list.reduce((a, e) => a + e.dur, 0);
        if (m[tkhd.o + 8] === 1) { setU32(m, tkhd.o + 36, Math.floor(total / 2 ** 32)); setU32(m, tkhd.o + 40, total >>> 0); }
        else if (total < 2 ** 32) setU32(m, tkhd.o + 28, total);
      }
    }
  }
  return { offset: moovAt, bytes: m };
}
