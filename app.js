import { surface, glyph, glyphSize, svg, plate } from './relief.js';

// Fix My ASMR: main thread. File in, findings out, live before/after, save.
// Heavy work (decoding, analysis, writing the file) runs in engine.js; the live preview
// runs dsp.js inside an AudioWorklet (worklet.js), so what you hear is what gets saved.

const $ = (id) => document.getElementById(id);
const ui = {
  stage: $('stage'), pads: $('pads'), pick: $('pick'), file: $('file'), work: $('work'),
  name: $('file-name'), facts: $('file-facts'), another: $('another'),
  progress: $('progress'), progressLabel: $('progress-label'), progressBar: $('progress-bar'), cancel: $('cancel'),
  error: $('error'), desk: $('desk'), screen: $('screen'), audioOnly: $('audio-only'),
  play: $('play'), time: $('time'), tl: $('tl-canvas'), scrub: $('scrub'), timeline: $('timeline'), playhead: $('playhead'), marks: $('marks'), markList: $('mark-list'),
  sides: $('sides'), sidesText: $('sides-text'), sidesHint: $('sides-hint'), sidesPlay: $('sides-play'), sidesAnswer: $('sides-answer'), sidesSame: $('sides-same'), sidesOpp: $('sides-opposite'),
  fixes: $('fixes'), adjust: $('adjust-body'), saveas: $('saveas'), save: $('save'), go: $('go'), goLabel: $('go-label'), saveNote: $('save-note'),
  done: $('done'), doneTitle: $('done-title'), doneText: $('done-text'), nextTime: $('next-time'), share: $('share'), download: $('download'), again: $('again'),
  hp: $('hp-test'), hpLive: $('hp-live'), veil: $('dropveil'),
};
// The pads are the ears and never move: L is your left ear, R your right.
const pads = { L: { el: $('pad-l') }, R: { el: $('pad-r') } };
for (const p of Object.values(pads)) { p.side = p.el.querySelector('.lit.side'); p.both = p.el.querySelector('.lit.both'); p.level = 0; p.shared = 0; }
const chips = { L: $('chip-l'), R: $('chip-r') };
const slots = { L: $('slot-left'), R: $('slot-right') };

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isSafari = isIOS || /^((?!chrome|chromium|android|edg).)*safari/i.test(navigator.userAgent);
if (isIOS) document.querySelectorAll('.ios-only').forEach((e) => { e.hidden = false; });

// Popular ASMR uploads sit around -31 LUFS (median of 35 measured); YouTube never turns quiet videos up.
const VOLUME = { soft: -32, comfortable: -26, strong: -19 };
const HISS = { gentle: 6, medium: 10, strong: 12 };
const WIDTH = { subtle: 0.35, strong: 0.5 };
const MONO = { subtle: 0.5, strong: 1 };
const MIME = { mov: 'video/quicktime', mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', m4a: 'audio/mp4', wav: 'audio/wav' };

// Style choices carry over to the next recording; per-file fixes (sides, trim, picture) don't.
const PREF_KEYS = ['target', 'width', 'eqLow', 'eqMid', 'eqHigh', 'deess', 'hissSens', 'limit', 'saveMode', 'audioFormat'];
const PREF_STORE = 'fix-my-asmr:settings';
function loadPrefs() {
  try { const p = JSON.parse(localStorage.getItem(PREF_STORE)); return p && typeof p === 'object' ? p : {}; } catch { return {}; }
}
function savePrefs() {
  if (!S?.opt) return;
  try { localStorage.setItem(PREF_STORE, JSON.stringify(Object.fromEntries(PREF_KEYS.map((k) => [k, S.opt[k]])))); } catch { /* private mode: settings just aren't remembered */ }
}
const toDb = (x) => 20 * Math.log10(Math.max(x, 1e-12));
const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const fmtSize = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.max(1, Math.round(b / 1e6)) + ' MB');
const fmtCut = (s) => { const t = Math.max(0, s), m = Math.floor(t / 60), x = t - m * 60; return `${m}:${x < 10 ? '0' : ''}${x.toFixed(1)}`; };
const sideName = (s) => (s === 'left' ? 'left' : 'right');
const num = (x) => (Math.round(x) < 0 ? '−' : '') + Math.abs(Math.round(x)); // true minus sign

let worker = null;
let S = null; // everything about the current recording

// ---------------------------------------------------------------- support check

function unsupportedReason() {
  if (!('Worker' in window) || !('AudioDecoder' in window) || !('WritableStream' in window)) {
    return isIOS
      ? 'This needs iOS 26 or newer. Update your iPhone, or open this page on a computer.'
      : 'This browser is missing features the fixer needs. Use a current version of Chrome, Edge, Firefox or Safari.';
  }
  return null;
}

// ---------------------------------------------------------------- loading a file

ui.pick.addEventListener('click', () => ui.file.click());
ui.another.addEventListener('click', () => ui.file.click());
ui.again.addEventListener('click', () => ui.file.click());
ui.file.addEventListener('change', () => { if (ui.file.files[0]) load(ui.file.files[0]); ui.file.value = ''; });

let dragDepth = 0;
addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth++; ui.veil.hidden = false; } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; ui.veil.hidden = true; } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0; ui.veil.hidden = true;
  const f = e.dataTransfer.files[0];
  if (f) load(f);
});

function resetSession() {
  if (S) {
    S.media?.pause();
    if (S.url) URL.revokeObjectURL(S.url);
    if (S.outUrl) URL.revokeObjectURL(S.outUrl);
    S.ctx?.close().catch(() => {});
  }
  worker?.terminate();
  worker = null;
}

function load(file) {
  if (S?.saving) return;
  const why = unsupportedReason();
  resetSession();
  const isVideo = file.type.startsWith('video/') || /\.(mov|mp4|m4v|mkv|webm)$/i.test(file.name);
  const media = document.createElement(isVideo ? 'video' : 'audio');
  media.preload = 'auto';
  if (isVideo) { media.playsInline = true; media.setAttribute('playsinline', ''); }
  for (const old of ui.screen.querySelectorAll('video, audio')) old.remove();
  ui.screen.prepend(media);
  media.addEventListener('play', () => { setPlayIcon(true); ui.stage.classList.add('is-playing'); kick(); });
  media.addEventListener('pause', () => { setPlayIcon(false); ui.stage.classList.remove('is-playing'); kick(); });
  media.addEventListener('ended', () => setPlayIcon(false));
  media.addEventListener('seeked', kick);
  media.addEventListener('error', () => {
    ui.audioOnly.hidden = false;
    ui.audioOnly.firstElementChild.textContent = 'This browser can’t play this file, so there’s no preview. Saving still applies every fix.';
  });
  S = {
    file, isVideo, url: URL.createObjectURL(file), media,
    info: null, stats: null, video: null, opt: null, sides: null, checks: 0, after: true, saving: false,
  };
  ui.stage.dataset.state = 'loaded';
  scheduleRender();
  ui.work.hidden = false;
  ui.desk.hidden = true;
  ui.done.hidden = true;
  ui.save.hidden = false;
  ui.error.hidden = true;
  ui.name.textContent = file.name;
  ui.facts.textContent = fmtSize(file.size);
  arrangeChips(false, false);
  scheduleRender();
  scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  if (why) return showError(why);

  S.media.src = S.url;
  ui.audioOnly.hidden = isVideo;
  showProgress('Checking the sound…', 0, false);
  keepAwake(true);
  worker = new Worker('engine.js', { type: 'module' });
  worker.onmessage = onEngine;
  worker.onerror = (e) => showError('The fixer stopped unexpectedly. ' + (e.message || ''));
  worker.postMessage({ type: 'analyze', file });
}

async function onEngine({ data }) {
  if (data.type === 'info') { S.info = data.info; renderFacts(); }
  else if (data.type === 'video') { S.video = data.video; if (S.stats) { renderSides(); renderFixes(); } }
  else if (data.type === 'progress') {
    const pct = Math.round(Math.min(1, data.value) * 100);
    if (data.stage === 'analyze') showProgress(`Checking the sound… ${pct}%`, pct, false);
    else saveProgress(data.value);
  } else if (data.type === 'analysis') onAnalysis(data);
  else if (data.type === 'exported') onExported(data);
  else if (data.type === 'canceled') { endSave(); ui.saveNote.textContent = 'Stopped. Nothing was saved.'; }
  else if (data.type === 'error') {
    // Apple Lossless, compressed AIFF/CAF and the like: Safari can often decode these itself.
    if (data.stage === 'analyze' && !S.triedDecode && /^(unsupported-file|audio-not-decodable:[^:]*:audio)/.test(data.message) && !/\.avi$/i.test(S.file.name)) {
      S.triedDecode = true;
      const got = await decodeFallback(+(data.message.match(/:(\d{4,6})$/)?.[1]) || 0);
      if (got === true) return;
      if (got === 'too-big') { keepAwake(false); return showError('This file is too large for this browser to read directly. Export it as WAV or M4A and try again.'); }
    }
    keepAwake(false);
    if (S.saving) endSave();
    showError(friendlyError(data.message, data.stage, data.stack));
  }
}

async function decodeFallback(rate) {
  if (S.file.size > 150e6) return 'too-big';
  try {
    showProgress('Reading the sound…', 0, false);
    const ctx = new OfflineAudioContext(2, 1, rate || 48000);
    const buf = await ctx.decodeAudioData(await S.file.arrayBuffer());
    const channels = [];
    for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) { const a = new Float32Array(buf.length); buf.copyFromChannel(a, c); channels.push(a); }
    worker.postMessage({ type: 'analyzePcm', name: S.file.name, size: S.file.size, sampleRate: buf.sampleRate, channels }, channels.map((a) => a.buffer));
    return true;
  } catch { return false; }
}

function friendlyError(msg, stage, stack) {
  if (/unsupported-file/.test(msg)) {
    return /\.avi$/i.test(S?.file?.name || '')
      ? 'AVI files can’t be opened in a browser. Convert it to MP4 first (HandBrake does this for free), then try again.'
      : 'This file can’t be opened here. Try a video or audio file such as MOV, MP4, M4A, WAV, AIFF, MP3 or FLAC.';
  }
  if (/no-audio/.test(msg)) return 'This file has no sound track to fix.';
  const nd = msg.match(/audio-not-decodable:([^:]*):(video|audio)/);
  if (nd) {
    const kind = { ac3: ' (Dolby Digital)', eac3: ' (Dolby Digital Plus)', alac: ' (Apple Lossless)' }[nd[1]] || '';
    if (nd[2] === 'video') return `This browser can’t read the sound in this video${kind}. Export the video again with AAC sound, then try again.`;
    return isSafari
      ? `This kind of audio${kind} can’t be read here. Export the file as WAV or M4A, then try again.`
      : `This browser can’t read this kind of audio${kind}. Open this page in Safari, or export the file as WAV or M4A.`;
  }
  if (/cannot-convert: video/.test(msg)) return 'This browser can’t make that kind of video. Choose Same format or Smaller MP4 under Save as, or try Chrome or Safari.';
  if (/cannot-convert/.test(msg)) return "This browser can't write the fixed file. Try a current version of Chrome or Safari.";
  if (/quota|QuotaExceeded|space/i.test(msg)) return 'There isn’t enough free storage on this device for the fixed copy. Free up some space and try again.';
  console.error('Fix My ASMR:', msg, stack || '');
  return stage === 'export'
    ? 'Saving stopped before it finished. Try again, or choose Same format under Save as.'
    : 'This recording couldn’t be checked. Try again, or try another copy of the file.';
}

function showError(text) {
  ui.progress.hidden = true;
  ui.error.textContent = text;
  ui.error.hidden = false;
}

function showProgress(label, pct, cancelable) {
  ui.progress.hidden = false;
  ui.progressLabel.textContent = label;
  ui.progressBar.setAttribute('aria-valuenow', String(pct));
  ui.progressBar.firstElementChild.style.transform = `scaleX(${pct / 100})`;
  ui.cancel.hidden = !cancelable;
}

function renderFacts() {
  const i = S.info, bits = [];
  if (i.duration) bits.push(fmtTime(i.duration));
  if (i.video) {
    const short = Math.min(i.video.width, i.video.height);
    bits.push(short >= 2160 ? '4K' : short >= 1440 ? '1440p' : short >= 1080 ? '1080p' : short >= 720 ? '720p' : `${i.video.width}×${i.video.height}`);
    if (['hlg', 'pq'].includes(i.video.color?.transfer)) bits.push('HDR');
  }
  bits.push(i.audio.channels === 1 ? 'mono' : 'stereo');
  if (i.spatial) bits.push('Spatial Audio');
  bits.push(fmtSize(i.size));
  ui.facts.textContent = bits.join(' · ');
  if (i.video) {
    const w = i.video.width, h = i.video.height;
    ui.screen.style.aspectRatio = `${w} / ${h}`;
  }
}

// ---------------------------------------------------------------- analysis -> recommendations

function onAnalysis({ stats, timeline, noise }) {
  keepAwake(false);
  S.stats = stats;
  S.timeline = timeline;
  S.noise = noise;
  const pk = [];
  for (let i = 0; i < timeline.length; i += 5) pk.push(Math.max(timeline[i], timeline[i + 1]));
  pk.sort((a, b) => a - b);
  S.p999Db = toDb(pk.length ? pk[Math.min(pk.length - 1, Math.floor(pk.length * 0.999))] : 1);
  S.opt = recommend(stats);
  ui.progress.hidden = true;
  ui.desk.hidden = false;
  renderAll();
  aacEncodable().then((ok) => { if (S?.stats === stats) { S.aac = ok; renderSaveAs(); } });
  drawTimeline();
  setupPreview();
}

function gainFor(target) {
  const lufs = S.stats.integratedLufs;
  if (target == null || !Number.isFinite(lufs)) return 0;
  // Never push the loudest moments more than ~3 dB into the -1.5 dB limiter: taps stay crisp.
  return Math.min(target - lufs, 1.5 - S.p999Db);
}

function recommend(st) {
  const o = {
    swap: false, invert: st.correlation < -0.5, copySide: st.silentChannel === 'left' ? 'right' : st.silentChannel === 'right' ? 'left' : null,
    trimL: 0, trimR: 0, evenOut: false,
    rumble: 35, hum: st.hum?.hz || 0, hissDb: 0, hissSens: 8, width: 0, target: VOLUME.comfortable, limit: true,
    eqLow: 0, eqMid: 0, eqHigh: 0, deess: 0, monoWiden: 0,
    delayMs: 0, trim: null, rotate: 0, mirror: false, saveMode: 'original', audioFormat: 'm4a',
  };
  // Remembered style choices, each checked against the type it should have.
  const saved = loadPrefs();
  for (const k of PREF_KEYS) {
    const v = saved[k];
    if (v === undefined) continue;
    if (k === 'target' ? v === null || Number.isFinite(v) : typeof v === typeof o[k] && (typeof v !== 'number' || Number.isFinite(v))) o[k] = v;
  }
  if (!['original', 'small', 'social'].includes(o.saveMode)) o.saveMode = 'original';
  if (!['m4a', 'wav'].includes(o.audioFormat)) o.audioFormat = 'm4a';
  const floorAfter = st.floorDb + gainFor(o.target);
  if (st.floorDb > -100) o.hissDb = floorAfter > -46 ? HISS.medium : floorAfter > -58 ? HISS.gentle : 0;
  return o;
}

function params() {
  const o = S.opt;
  // Turning the picture upside down or mirroring it moves things to the other side,
  // so the sound has to swap too or it would stop matching.
  const flips = (o.mirror ? 1 : 0) ^ (o.rotate === 180 ? 1 : 0);
  return {
    swap: !!((o.swap ? 1 : 0) ^ flips), invert: o.invert, copySide: o.copySide,
    trimL: o.trimL, trimR: o.trimR, rumbleHz: o.rumble, humHz: o.hum, hissDb: o.hissDb, hissSens: o.hissSens,
    eqLow: o.eqLow, eqMid: o.eqMid, eqHigh: o.eqHigh, deess: o.deess, monoWiden: o.monoWiden,
    width: o.width, gainDb: gainFor(o.target), limit: o.limit, rotate: o.rotate, mirror: o.mirror,
    delayMs: S.isVideo ? o.delayMs : 0, trim: o.trim,
  };
}

// What a save would produce: the fixes plus the file type. Changing either after saving offers a new save.
const exportKey = () => JSON.stringify([params(), S.isVideo ? S.opt.saveMode : S.opt.audioFormat]);

function markDirty() {
  if (ui.done.hidden) return;
  const dirty = S.savedKey !== exportKey();
  ui.save.hidden = !dirty;
  if (dirty) ui.goLabel.textContent = 'Save again with these changes';
  else updateGoLabel();
}

function changed() {
  savePrefs();
  renderFixes();
  renderAdjust();
  renderSaveAs();
  drawTrim();
  markDirty();
  S.node?.port.postMessage({ params: params() });
  arrangeChips(S.after && params().swap);
}

// ---------------------------------------------------------------- rendering findings

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
}

let uid = 0;
function seg(label, name, options, value, onPick) {
  const fs = h('fieldset', { class: 'seg' }, h('legend', { class: 'sr-only' }, label));
  for (const [val, text] of options) {
    const input = h('input', { type: 'radio', name: `${name}-${uid}`, value: String(val), 'data-k': `${name}:${val}` });
    input.checked = val === value;
    input.addEventListener('change', () => onPick(val));
    fs.append(h('label', {}, input, h('span', {}, text)));
  }
  uid++;
  return fs;
}

function toggle(label, checked, onFlip) {
  const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label, 'data-k': label });
  input.checked = checked;
  input.addEventListener('change', () => onFlip(input.checked));
  return h('label', { class: 'switch' }, input, h('span', { 'aria-hidden': 'true' }));
}

const STAMP = { fixing: 'Fixing', fixed: 'Fixed', 'not-needed': 'Not needed', off: 'Off', cant: "Can't fix", note: 'Note' };
function row(key, title, text, stamp, ...control) {
  if (stamp === 'fixing' && S.savedParams === JSON.stringify(params())) stamp = 'fixed';
  const prev = S.stamps?.[key];
  const st = h('span', { class: 'stamp' + (prev && prev !== stamp ? ' pressed' : ''), 'data-s': stamp }, plate(stamp === 'off' || stamp === 'not-needed'), STAMP[stamp]);
  S.stamps[key] = stamp;
  return h('li', { class: 'fix' }, h('h4', {}, title), st, h('p', {}, text), control.length ? h('div', { class: 'ctl' }, ...control) : null);
}

function renderAll() {
  renderSides();
  renderFixes();
  renderAdjust();
  renderSaveAs();
  updateGoLabel();
}

// Moments to check: a deliberate snap at the start first, then the strongest one-sided sounds.
function sideList() {
  const st = S.stats, out = [];
  if (st.snap && Math.abs(st.snap.ild) >= 6) out.push({ t: st.snap.t, ild: st.snap.ild, snap: true });
  for (const m of st.sideMoments) if (!out.some((x) => Math.abs(x.t - m.t) < 2)) out.push(m);
  return out;
}

function renderSides() {
  const moments = sideList(), snap = moments[0]?.snap ? moments[0] : null;
  ui.sides.classList.toggle('answered', !!S.sides);
  ui.sidesHint.hidden = true;
  if (!S.isVideo) {
    ui.sidesText.textContent = 'There’s no picture to compare with. For a listener facing you, a sound on your right should come from their left. Swap only if yours is the other way round.';
    ui.sidesPlay.hidden = true; ui.sidesAnswer.hidden = true;
    return;
  }
  if (!moments.length) {
    ui.sidesText.textContent = 'No clearly one-sided sounds were found to compare. If you know the sides are swapped, turn on Swap below.';
    ui.sidesPlay.hidden = true; ui.sidesAnswer.hidden = true;
    return;
  }
  ui.sidesPlay.hidden = false;
  if (S.sides === 'same') ui.sidesText.textContent = 'Sides match the picture. Nothing to swap.';
  else if (S.sides === 'swapped') ui.sidesText.textContent = 'Swapped. Play the check again to hear the corrected sides.';
  else if (snap && !S.checks) ui.sidesText.textContent = `There’s a snap at ${snap.t < 60 ? fmtCut(snap.t) : fmtTime(snap.t)}, louder on the ${snap.ild > 0 ? 'left' : 'right'}. Play it, watch which side of the picture it happens on, and listen for which ear you hear it in.`;
  else ui.sidesText.textContent = 'Play a moment where a sound happens on one side. Watch where it happens in the picture and listen for which ear you hear it in.';
  // The automatic picture check only suggests; the listener decides.
  const pc = S.video?.picture, n = pc ? pc.agree + pc.disagree : 0;
  if (!S.sides && n >= 2) {
    ui.sidesHint.hidden = false;
    ui.sidesHint.replaceChildren(h('b', {}, 'Picture check: '), !pc.disagree ? `in ${pc.agree} of ${n} moments, the movement in the picture was on the same side as the sound. The sides look right.`
      : !pc.agree ? `in ${pc.disagree} of ${n} moments, the movement was on the opposite side to the sound. The sides may be swapped. Listen to make sure.`
      : 'the picture didn’t give a clear answer, so trust your ears.');
  }
  ui.sidesPlay.lastChild.textContent = S.checks ? 'Play another check' : snap ? 'Play the snap' : 'Play a side check';
}

function renderFixes() {
  const st = S.stats, o = S.opt, p = params();
  S.stamps = S.stamps || {};
  const out = [];

  const swapText = !S.isVideo ? 'Trades the two sides.'
    : S.sides === 'same' ? 'Sides already match the picture.'
    : S.sides === 'swapped' ? 'Swapped so each sound comes from the same side as in the picture.'
    : 'Not checked yet. Use the side check, or swap here if you already know.';
  out.push(row('swap', 'Left and right', swapText, o.swap ? 'fixing' : S.sides === 'same' ? 'not-needed' : 'off',
    h('span', { class: 'lbl' }, 'Swap left and right'), toggle('Swap left and right', o.swap, (v) => { o.swap = v; S.sides = v ? 'swapped' : S.sides === 'swapped' ? null : S.sides; renderSides(); changed(); })));

  if (st.silentChannel) {
    out.push(row('copy', 'One side is silent', `The ${st.silentChannel} side has no sound. Both ears get the ${sideName(st.silentChannel === 'left' ? 'right' : 'left')} side instead.`,
      o.copySide ? 'fixing' : 'off', h('span', { class: 'lbl' }, 'Fill the silent side'), toggle('Fill the silent side', !!o.copySide, (v) => { o.copySide = v ? (st.silentChannel === 'left' ? 'right' : 'left') : null; changed(); })));
  }
  if (st.correlation < -0.5) {
    out.push(row('phase', 'The two sides cancel out', 'On phone speakers the sound turns thin or disappears. Flipping one side brings it back.',
      o.invert ? 'fixing' : 'off', h('span', { class: 'lbl' }, 'Fix cancelling sides'), toggle('Fix cancelling sides', o.invert, (v) => { o.invert = v; changed(); })));
  }

  out.push(row('rumble', 'Low rumble', `Cuts table thumps and handling noise below ${o.rumble || 35} Hz. Deep taps stay.`,
    o.rumble ? 'fixing' : 'off', h('span', { class: 'lbl' }, 'Remove rumble'), toggle('Remove low rumble', !!o.rumble, (v) => { o.rumble = v ? 35 : 0; changed(); })));

  if (st.hum?.hz) {
    out.push(row('hum', `Electrical hum (${st.hum.hz} Hz)`, 'A steady buzz from power lines or a charger. Removes it and its overtones.',
      o.hum ? 'fixing' : 'off', h('span', { class: 'lbl' }, 'Remove hum'), toggle('Remove hum', !!o.hum, (v) => { o.hum = v ? st.hum.hz : 0; changed(); })));
  } else {
    out.push(row('hum', 'Electrical hum', 'None found.', o.hum ? 'fixing' : 'not-needed'));
  }

  const hissLevel = st.floorDb <= -100 ? 'There’s no background hiss to speak of.' : `Between sounds the background sits at ${num(st.floorDb)} dB.`;
  const hissPick = o.hissDb === 0 ? 'off' : Object.keys(HISS).find((k) => HISS[k] === o.hissDb) || 'custom';
  out.push(row('hiss', 'Background hiss', `${hissLevel} Gentle lowers steady hiss and keeps whispers and soft triggers.`,
    o.hissDb ? 'fixing' : st.floorDb <= -70 ? 'not-needed' : 'off',
    seg('Hiss reduction', 'hiss', [['off', 'Off'], ['gentle', 'Gentle'], ['medium', 'Medium'], ['strong', 'Strong']], hissPick, (v) => { o.hissDb = v === 'off' ? 0 : HISS[v]; changed(); })));

  const lufs = st.integratedLufs;
  const g = p.gainDb, capped = o.target != null && g < o.target - lufs - 0.5;
  const volPick = o.target == null ? 'off' : Object.keys(VOLUME).find((k) => VOLUME[k] === o.target) || 'custom';
  const volText = !Number.isFinite(lufs) ? 'The recording is silent.'
    : o.target == null ? `Now ${num(lufs)} LUFS. Volume stays as recorded.`
    : `Now ${num(lufs)} LUFS, ${g >= 0 ? 'raised' : 'lowered'} to about ${num(lufs + g)}.` + (capped ? ' Held back a little so the loudest taps stay crisp.' : '');
  out.push(row('volume', 'Volume', volText, o.target == null ? 'off' : Math.abs(g) < 0.5 ? 'not-needed' : 'fixing',
    seg('Volume', 'vol', [['off', 'Off'], ['soft', 'Soft'], ['comfortable', 'Comfortable'], ['strong', 'Strong']], volPick, (v) => { o.target = v === 'off' ? null : VOLUME[v]; changed(); })));

  const mono = st.correlation > 0.98;
  if (mono) {
    const monoPick = o.monoWiden === 0 ? 'off' : Object.keys(MONO).find((k) => MONO[k] === o.monoWiden) || 'custom';
    out.push(row('mono', 'Almost mono', 'Both sides carry nearly the same sound. Widening adds gentle space to the high sounds; on a phone speaker it sounds the same as before.',
      o.monoWiden ? 'fixing' : 'off',
      seg('Widen a mono recording', 'mono', [['off', 'Off'], ['subtle', 'Subtle'], ['strong', 'Strong']], monoPick, (v) => { o.monoWiden = v === 'off' ? 0 : MONO[v]; changed(); })));
  } else {
    const widthPick = o.width === 0 ? 'off' : Object.keys(WIDTH).find((k) => WIDTH[k] === o.width) || 'custom';
    out.push(row('width', '3D width', 'Spreads high sounds a little wider for more ear-to-ear feel. Check it on headphones.',
      o.width ? 'fixing' : 'off',
      seg('3D width', 'width', [['off', 'Off'], ['subtle', 'Subtle'], ['strong', 'Strong']], widthPick, (v) => { o.width = v === 'off' ? 0 : WIDTH[v]; changed(); })));
  }

  // Measured only where both sides carry the same sound, so deliberate one-ear passages don't count.
  const lean = st.balanceDb >= 2 ? 'left' : st.balanceDb <= -2 ? 'right' : null;
  if (lean && !st.silentChannel) {
    out.push(row('balance', 'One side is louder', `The ${lean} side is ${num(Math.abs(st.balanceDb))} dB louder overall. That's fine if it was on purpose. A covered mic hole can also cause it.`,
      o.evenOut ? 'fixing' : 'off', h('span', { class: 'lbl' }, 'Even out left and right'), toggle('Even out left and right', o.evenOut, (v) => {
        o.evenOut = v;
        const half = Math.abs(st.balanceDb) / 2;
        o.trimL = v ? (lean === 'left' ? -half : half) : 0;
        o.trimR = v ? (lean === 'left' ? half : -half) : 0;
        changed();
      })));
  }

  if (st.clipping.count) {
    const n = clipMarks().length;
    out.push(row('clip', `Distorted in ${n} ${n === 1 ? 'place' : 'places'}`, 'These moments overloaded the mic while recording and can’t be repaired. They’re numbered on the timeline. Next time keep loud triggers a little further from the phone.', 'cant'));
  }
  const bw = st.bandwidth;
  if (bw?.narrow) {
    out.push(row('narrow', 'Muffled, like a Bluetooth mic', 'The high, crisp detail is missing, which is typical of AirPods and other Bluetooth mics. It can’t be added back.', 'cant'));
  }
  if (S.isVideo && st.gated?.gaps >= 8 && st.gated.share > 0.05) {
    out.push(row('gated', 'Complete silence between sounds', 'The background keeps dropping to total silence. That usually means Voice Isolation or another noise filter was on while recording, and it removes soft triggers for good.', 'note'));
  }
  if (st.pumping?.likely) out.push(row('pump', 'The background dips after loud sounds', `After loud moments the hiss drops about ${num(st.pumping.dropDb)} dB, then creeps back. That's the iPhone's automatic level control, and it can't be undone afterwards. Hiss reduction makes it less noticeable.`, 'note'));
  const fps = S.video?.fps;
  if (fps && fps.lowSeconds >= 2) out.push(row('fps', 'The frame rate dropped', `For ${fps.lowSeconds} seconds the video ran below ${fps.nominal} fps, at times as low as ${fps.lowest}. iPhone’s Auto FPS does this in dim light, and some editors drift out of sync on clips like this. TikTok & Reels under Save as gives a steady frame rate.`, 'note'));
  if (S.video?.brightness != null && S.video.brightness < 0.08) out.push(row('dark', 'Very dark picture', 'If that isn’t the look you wanted: dark video turns grainy after upload, and more light keeps the frame rate steady.', 'note'));
  if (S.info.video?.rotation === 180) out.push(row('rot', 'Set to play upside down', 'This video is flagged to play rotated 180°. If it was turned in an editor after filming, the sides are now swapped; use the side check.', 'note'));
  if (isIOS && S.info.video?.codec === 'avc' && !S.info.spatial) out.push(row('picker', 'Possibly a converted copy', 'If you picked this from Photos, iPhone may have converted it to a lower-quality copy. For the original, save it to Files first and choose it from there.', 'note'));
  if (S.info.spatial) out.push(row('spatial', 'Spatial Audio track', 'Your iPhone also saved a Spatial Audio track. The fixed copy keeps the regular stereo track, the one editors and apps play.', 'note'));
  if (S.info.video && ['hlg', 'pq'].includes(S.info.video.color?.transfer)) out.push(row('hdr', 'HDR picture', 'The picture is copied untouched, including its HDR and Dolby Vision information.', 'note'));

  keepFocus(ui.fixes, () => ui.fixes.replaceChildren(...out));
}

// Re-rendering replaces controls; put keyboard focus back on the same one, or on its
// neighbour when the control itself went away.
const FOCUS_NEXT = { 'cut-reset': 'cut-start' };
function keepFocus(root, render) {
  const a = document.activeElement, k = root.contains(a) ? a.dataset.k : null;
  render();
  if (!k) return;
  const at = (key) => root.querySelector(`[data-k="${CSS.escape(key)}"]`);
  (at(k) || (FOCUS_NEXT[k] && at(FOCUS_NEXT[k])))?.focus({ preventScroll: true });
}
const announce = (text) => { $('route-live').textContent = text; };

// ---------------------------------------------------------------- Adjust panel (pro controls)

function slider(label, min, max, step, value, fmt, onInput) {
  const id = `adj-${uid++}`;
  const out = h('output', { for: id }, fmt(value));
  const input = h('input', { type: 'range', id, min, max, step, value, 'aria-valuetext': fmt(value), 'data-k': label });
  input.addEventListener('input', () => {
    const text = fmt(+input.value);
    out.textContent = text;
    input.setAttribute('aria-valuetext', text);
    onInput(+input.value);
  });
  return h('div', { class: 'adj-row' }, h('label', { for: id }, label), out, input);
}
function select(label, value, options, onPick) {
  const id = `adj-${uid++}`;
  const s = h('select', { id, 'data-k': label }, options.map(([v, t]) => { const op = h('option', { value: String(v) }, t); op.selected = v === value; return op; }));
  s.addEventListener('change', () => onPick(options.find(([v]) => String(v) === s.value)[0]));
  return h('div', { class: 'adj-row' }, h('label', { for: id }, label), s);
}
function check(label, value, onFlip) {
  return h('div', { class: 'adj-row' }, h('span', { class: 'lbl' }, label), toggle(label, value, onFlip));
}

function renderAdjust() {
  const o = S.opt, quiet = () => { savePrefs(); renderFixes(); markDirty(); S.node?.port.postMessage({ params: params() }); arrangeChips(S.after && params().swap); };
  const db = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} dB`;
  const groups = [
    h('div', { class: 'adj-group' }, h('h4', {}, 'Sides'),
      check('Swap left and right', o.swap, (v) => { o.swap = v; S.sides = v ? 'swapped' : null; renderSides(); changed(); }),
      check('Flip polarity of the right side', o.invert, (v) => { o.invert = v; quiet(); }),
      select('Use one side for both ears', o.copySide, [[null, 'No'], ['left', 'Left side'], ['right', 'Right side']], (v) => { o.copySide = v; quiet(); }),
      slider('Left level', -12, 6, 0.5, o.trimL, db, (v) => { o.trimL = v; quiet(); }),
      slider('Right level', -12, 6, 0.5, o.trimR, db, (v) => { o.trimR = v; quiet(); })),
    h('div', { class: 'adj-group' }, h('h4', {}, 'Clean-up'),
      select('Rumble cut', o.rumble, [[0, 'Off'], [35, '35 Hz'], [60, '60 Hz'], [80, '80 Hz'], [120, '120 Hz']], (v) => { o.rumble = v; quiet(); }),
      select('Hum removal', o.hum, [[0, 'Off'], [50, '50 Hz'], [60, '60 Hz']], (v) => { o.hum = v; quiet(); }),
      slider('Hiss reduction', 0, 18, 1, o.hissDb, (v) => (v ? `${v} dB` : 'Off'), (v) => { o.hissDb = v; quiet(); }),
      select('Faint sounds near the hiss', o.hissSens, [[5, 'Keep more of them'], [8, 'Normal'], [12, 'Clean more hiss']], (v) => { o.hissSens = v; quiet(); })),
    h('div', { class: 'adj-group' }, h('h4', {}, 'Tone'),
      slider('Warmth', -6, 6, 0.5, o.eqLow, db, (v) => { o.eqLow = v; quiet(); }),
      slider('Clarity', -6, 6, 0.5, o.eqMid, db, (v) => { o.eqMid = v; quiet(); }),
      slider('Air', -6, 6, 0.5, o.eqHigh, db, (v) => { o.eqHigh = v; quiet(); }),
      select('Soften harsh S sounds', o.deess, [[0, 'Off'], [1, 'Gently'], [2, 'More']], (v) => { o.deess = v; quiet(); })),
    h('div', { class: 'adj-group' }, h('h4', {}, 'Level and width'),
      check('Change volume', o.target != null, (v) => { o.target = v ? VOLUME.comfortable : null; changed(); }),
      o.target != null ? slider('Volume target', -36, -14, 1, o.target, (v) => `${num(v)} LUFS`, (v) => { o.target = v; quiet(); }) : null,
      check('Peak limiter', o.limit, (v) => { o.limit = v; quiet(); }),
      S.stats.correlation > 0.98
        ? slider('Widen a mono recording', 0, 100, 5, Math.round(o.monoWiden * 100), (v) => (v ? `${v}%` : 'Off'), (v) => { o.monoWiden = v / 100; quiet(); })
        : slider('3D width', 0, 100, 5, Math.round(o.width * 100), (v) => (v ? `${v}%` : 'Off'), (v) => { o.width = v / 100; quiet(); })),
    timingGroup(),
  ];
  if (S.isVideo) {
    groups.push(h('div', { class: 'adj-group' }, h('h4', {}, 'Picture'),
      select('Rotate picture', o.rotate, [[0, 'No'], [90, '90° clockwise'], [180, 'Upside down'], [270, '90° anticlockwise']], (v) => { o.rotate = v; changed(); }),
      check('Mirror picture', o.mirror, (v) => { o.mirror = v; changed(); }),
      h('p', { class: 'adj-note' }, 'Turning the picture upside down or mirroring it also swaps the sound, so the two keep matching. ' + (o.saveMode === 'social'
        ? 'With TikTok & Reels chosen, the turn is built into the new picture.'
        : 'Only the file’s orientation info changes; the picture itself isn’t changed.'))));
  }
  groups.push(h('div', { class: 'adj-group' },
    h('button', { class: 'ghost small', type: 'button', 'data-k': 'reset', onclick: resetSettings }, 'Reset to recommended settings')));
  keepFocus(ui.adjust, () => ui.adjust.replaceChildren(...groups));
}

// Trim and sync. Both are applied when saving; playback stops at the end point.
function timingGroup() {
  const o = S.opt, d = S.duration || S.info.duration, tr = o.trim || { start: 0, end: d };
  const snap = S.stats.snap && S.stats.snap.t < d - 2 ? S.stats.snap : null;
  const point = (label, which) => h('div', { class: 'adj-row' },
    h('span', { class: 'lbl' }, label, ' ', h('span', { class: 'cut-at' }, fmtCut(tr[which]))),
    h('button', { class: 'ghost small', type: 'button', 'data-k': `cut-${which}`, 'aria-label': `Set ${which} to playhead`, onclick: () => setTrim(which, S.media.currentTime) }, 'Set to playhead'));
  return h('div', { class: 'adj-group' }, h('h4', {}, 'Timing'),
    point('Start', 'start'),
    point('End', 'end'),
    snap || o.trim ? h('div', { class: 'adj-actions' },
      snap ? h('button', { class: 'ghost small', type: 'button', 'data-k': 'cut-snap', onclick: () => setTrim('start', snap.t + 0.6) }, 'Start after the snap') : null,
      o.trim ? h('button', { class: 'ghost small', type: 'button', 'data-k': 'cut-reset', onclick: () => { o.trim = null; changed(); announce('Keeping the whole recording.'); } }, 'Keep the whole recording') : null) : null,
    S.isVideo ? slider('Sound sync', -250, 250, 5, o.delayMs, (v) => (v ? `Sound ${Math.abs(v)} ms ${v > 0 ? 'later' : 'earlier'}` : 'In sync'), (v) => { o.delayMs = v; savePrefs(); markDirty(); }) : null,
    S.isVideo ? h('p', { class: 'adj-note' }, 'Moves the sound against the picture if the two are out of step. You’ll hear the change in the saved file.') : null);
}

function setTrim(which, t) {
  const o = S.opt, d = S.duration || S.info.duration, tr = o.trim ? { ...o.trim } : { start: 0, end: d };
  tr[which] = Math.max(0, Math.min(d, t));
  if (tr.end - tr.start < 1) {
    if (which === 'start') tr.start = Math.max(0, tr.end - 1); else tr.end = Math.min(d, tr.start + 1);
  }
  o.trim = tr.start < 0.05 && tr.end > d - 0.05 ? null : tr;
  changed();
  announce(`${which === 'start' ? 'Start' : 'End'} set to ${fmtCut(tr[which])}.`);
}

function drawTrim() {
  const tr = S?.opt?.trim, a = $('trim-a'), b = $('trim-b'), d = S?.duration;
  a.hidden = b.hidden = !tr || !d;
  if (!tr || !d) return;
  a.style.width = `${(tr.start / d) * 100}%`;
  b.style.width = `${(1 - tr.end / d) * 100}%`;
}

function resetSettings() {
  try { localStorage.removeItem(PREF_STORE); } catch { /* nothing stored */ }
  const o = S.opt, keep = { swap: o.swap, copySide: o.copySide, invert: o.invert, rotate: o.rotate, mirror: o.mirror, trim: o.trim, delayMs: o.delayMs, evenOut: o.evenOut, trimL: o.trimL, trimR: o.trimR };
  S.opt = { ...recommend(S.stats), ...keep };
  changed();
  announce('Back to the recommended settings.');
}

function renderSaveAs() {
  const o = S.opt, v = S.info.video, hdr = ['hlg', 'pq'].includes(v?.color?.transfer), big = v && Math.max(v.width, v.height) > 1920;
  const c = S.info.container;
  const notes = {
    original: (c === 'Matroska' ? 'An MKV like the one you chose, with the best sound.'
      : c === 'WebM' ? 'A WebM like the one you chose.'
      : 'A MOV with the best sound. Best for editing; the file gets bigger.') + ' The picture isn’t changed.',
    small: 'An MP4 with high-quality sound. The picture isn’t changed, and the file stays close to its original size.',
    social: `An MP4 that TikTok and Instagram take without trouble, with a steady frame rate${big ? ', sized for phones' : ''}.${hdr ? ' HDR colour is converted so it doesn’t look washed out.' : ''} Takes longer to save.`,
    m4a: 'Small, and plays everywhere.',
    wav: 'The best sound. A large file, best for editing.',
  };
  let opts = S.isVideo ? [['original', 'Same format'], ['small', 'Smaller MP4'], ['social', 'TikTok & Reels']] : [['m4a', 'M4A'], ['wav', 'WAV']];
  let pick = S.isVideo ? o.saveMode : o.audioFormat;
  // Without an AAC encoder (Firefox, Chrome on Linux) only the lossless choices can be made.
  if (S.aac === false) {
    opts = opts.filter(([v]) => v === 'original' || v === 'wav');
    pick = opts[0][0];
    notes[pick] += ' Smaller files need Safari, Chrome or Edge on a phone, Mac or Windows.';
  }
  keepFocus(ui.saveas, () => ui.saveas.replaceChildren(
    h('h3', { id: 'saveas-title' }, 'Save as'),
    seg('Save as', 'saveas', opts, pick, (val) => {
      if (S.isVideo) o.saveMode = val; else o.audioFormat = val;
      savePrefs(); renderSaveAs(); markDirty();
      if (S.isVideo) renderAdjust();
    }),
    h('p', { class: 'saveas-note' }, notes[pick])));
}

function updateGoLabel() {
  ui.goLabel.textContent = S.isVideo ? 'Fix and save video' : 'Fix and save audio';
  ui.saveNote.textContent = 'Saves a new copy. Your original stays as it was.';
}

// ---------------------------------------------------------------- the pads: rendered surfaces + meters

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Each pad is a lit relief: the letter pressed in, a raised dot marking the left ear. The meter
// layers are the same relief again with the letter painted in light (the channel's own colour,
// and purple for sound both ears share), so the pressed walls keep their light and shadow.
function renderPads() {
  const state = ui.stage.dataset.state, lift = state === 'empty' && innerWidth <= 640 ? 0.1 : 0;
  for (const [ch, p] of Object.entries(pads)) {
    const r = p.el.getBoundingClientRect(), w = Math.round(r.width), hh = Math.round(r.height);
    if (!w || !hh || (p.w === w && p.h === hh && p.lift === lift)) continue;
    Object.assign(p, { w, h: hh, lift });
    const rx = parseFloat(getComputedStyle(p.el).borderTopLeftRadius) || 24;
    const size = glyphSize(ch, w, hh);
    const depth = Math.max(6, Math.min(14, size * 0.03)), soft = Math.max(1.6, Math.min(3.6, size * 0.012));
    const letter = { node: glyph(ch, w, hh, { lift }), level: hh < 200 ? 0.32 : 0.45 };
    const marks = [letter];
    if (ch === 'L') {
      const o = Math.max(16, Math.min(30, hh * 0.06));
      marks.push({ node: svg('circle', { cx: o, cy: o, r: Math.max(6, Math.min(w, hh) * 0.022) }), level: 1 });
    }
    const color = cssVar(ch === 'L' ? '--l' : '--r'), seed = ch === 'L' ? 11 : 23;
    const lit = (paint) => surface({ w, h: hh, rx, color, depth, soft, seed, marks: marks.map((m) => (m === letter ? { ...m, paint } : m)) });
    p.relief?.remove();
    p.relief = surface({ w, h: hh, rx, color, depth, soft, seed, marks });
    p.el.prepend(p.relief);
    p.side.replaceChildren(lit(cssVar(ch === 'L' ? '--l-lit' : '--r-lit')));
    p.both.replaceChildren(lit(cssVar('--both')));
    setLevel(p, p.level, p.shared);
  }
}

function renderSocket() {
  const s = Math.round($('socket').getBoundingClientRect().width), b = Math.round(ui.pick.getBoundingClientRect().width);
  if (!s || !b || renderSocket.size === s) return;
  renderSocket.size = s;
  $('socket-relief').replaceChildren(surface({ w: s, h: s, rx: s / 2, color: cssVar('--ground'), marks: [{ node: svg('circle', { cx: s / 2, cy: s / 2, r: s * 0.43 }), level: 0.3 }] }));
  $('pick-face').replaceChildren(surface({ w: b, h: b, rx: b / 2, color: cssVar('--text'), face: 1, depth: 7, grain: 0.012 }));
}

// Molded faces for the light keys (Fix and save, Share, Play), from the same material as the pick.
function moldFace(btn) {
  const face = h('span', { class: 'face', 'aria-hidden': 'true' });
  btn.prepend(face);
  new ResizeObserver(() => {
    const r = btn.getBoundingClientRect(), w = Math.round(r.width), hh = Math.round(r.height);
    if (!w || !hh || (face.dataset.size === `${w}x${hh}`)) return;
    face.dataset.size = `${w}x${hh}`;
    const rx = parseFloat(getComputedStyle(btn).borderTopLeftRadius) || 16;
    face.replaceChildren(surface({ w, h: hh, rx: Math.min(rx, hh / 2), color: cssVar('--text'), face: 1, depth: 6, soft: 1.6, grain: 0.012 }));
  }).observe(btn);
}
[ui.go, ui.share, ui.play].forEach(moldFace);
document.querySelectorAll('.tips .stamp').forEach((st) => st.prepend(plate(false)));

let relayout = 0;
const scheduleRender = () => { if (!relayout) relayout = requestAnimationFrame(() => { relayout = 0; renderPads(); renderSocket(); }); };
new ResizeObserver(scheduleRender).observe(ui.pads);
document.fonts.ready.then(() => { renderPads(); renderSocket(); });

// Swapping re-routes the recording: the two tags trade places under the ears.
function arrangeChips(swapped, animate = true) {
  const want = swapped ? [chips.R, chips.L] : [chips.L, chips.R];
  if (slots.L.firstElementChild === want[0]) return;
  const before = [chips.L.getBoundingClientRect(), chips.R.getBoundingClientRect()];
  slots.L.replaceChildren(want[0]);
  slots.R.replaceChildren(want[1]);
  $('route-live').textContent = swapped ? 'Swapped: your left ear plays the recorded right side, your right ear the recorded left.' : 'Sides as recorded.';
  if (!animate || reduceMotion.matches) return;
  const opts = { duration: 640, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' };
  [chips.L, chips.R].forEach((c, i) => {
    const a = before[i], b = c.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top, lane = i === 0 ? -16 : 16;
    c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: `translate(${dx / 2}px, ${dy / 2 + lane}px) scale(1.06)`, offset: 0.5 }, { transform: 'none' }], opts);
  });
}

function setLevel(pad, v, shared) {
  const y = (1 - v) * 100, z = (1 - shared) * 100;
  pad.side.style.transform = `translateY(${y}%)`;
  pad.side.firstElementChild?.style.setProperty('transform', `translateY(${-y}%)`);
  pad.both.style.transform = `translateY(${z}%)`;
  pad.both.firstElementChild?.style.setProperty('transform', `translateY(${-z}%)`);
}

let raf = 0;
function tick() {
  raf = 0;
  if (!S) return;
  const m = S.media, playing = !m.paused && !m.ended;
  const pk = S.peaks || [0, 0, 0];
  const lv = (v) => (playing ? Math.min(1, Math.max(0, (toDb(v) + 54) / 54)) : 0);
  // Purple fills the part both ears share: the quieter side's level, scaled by how alike they are.
  const shared = Math.min(lv(pk[0]), lv(pk[1])) * Math.max(0, pk[2] || 0);
  let moving = false;
  for (const [pad, v] of [[pads.L, pk[0]], [pads.R, pk[1]]]) {
    const target = lv(v);
    pad.level = target > pad.level ? target : Math.max(target, pad.level - 0.025);
    pad.shared = Math.min(pad.level, shared > pad.shared ? shared : Math.max(shared, pad.shared - 0.025));
    setLevel(pad, pad.level, pad.shared);
    if (pad.level > 0.001) moving = true;
  }
  if (S.duration) {
    ui.playhead.style.transform = `translateX(${(m.currentTime / S.duration) * ui.timeline.clientWidth - 1}px)`;
    ui.time.textContent = `${fmtTime(m.currentTime)} / ${fmtTime(S.duration)}`;
    if (document.activeElement !== ui.scrub) ui.scrub.value = String(Math.round((m.currentTime / S.duration) * 1000));
    ui.scrub.setAttribute('aria-valuetext', `${fmtTime(m.currentTime)} of ${fmtTime(S.duration)}`);
  }
  if (S.stopAt != null && m.currentTime >= S.stopAt) { m.pause(); S.stopAt = null; ui.sidesAnswer.hidden = false; ui.sidesSame.focus({ preventScroll: true }); }
  else if (S.stopAt == null && playing && S.opt?.trim && m.currentTime >= S.opt.trim.end) m.pause();
  if (playing || moving) raf = requestAnimationFrame(tick);
}
const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

// ---------------------------------------------------------------- preview playback

async function setupPreview() {
  const m = S.media;
  S.duration = S.info.duration || m.duration || 0;
  try {
    let ctx;
    try { ctx = new AudioContext({ sampleRate: S.info.audio.sampleRate, latencyHint: 'interactive' }); }
    catch { ctx = new AudioContext({ latencyHint: 'interactive' }); }
    S.ctx = ctx;
    await ctx.audioWorklet.addModule('worklet.js');
    const node = new AudioWorkletNode(ctx, 'fix-preview', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'discrete' });
    ctx.createMediaElementSource(m).connect(node).connect(ctx.destination);
    node.port.onmessage = ({ data }) => { if (S) S.peaks = data; };
    node.port.postMessage({ noise: S.noise, params: params(), after: S.after });
    S.node = node;
  } catch (err) {
    // Without the worklet the media still plays, just without the live fix.
    S.node = null;
    ui.saveNote.textContent = 'Live preview isn’t available in this browser, but saving still applies every fix.';
  }
  arrangeChips(S.after && params().swap, false);
}

function setPlayIcon(playing) {
  ui.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  ui.play.querySelector(':scope > svg use').setAttribute('href', playing ? '#i-pause' : '#i-play');
}

async function play(from) {
  const m = S.media;
  if (S.ctx && S.ctx.state !== 'running') S.ctx.resume().catch(() => {});
  if (from != null) m.currentTime = from;
  try { await m.play(); } catch { /* autoplay refusal: the user can press play again */ }
}

ui.play.addEventListener('click', () => {
  if (!S) return;
  S.stopAt = null;
  const tr = S.opt?.trim, at = S.media.currentTime;
  if (!S.media.paused) S.media.pause();
  else play(tr && (at < tr.start - 0.05 || at >= tr.end - 0.05) ? tr.start : undefined);
});

for (const r of document.querySelectorAll('input[name="ab"]')) {
  r.addEventListener('change', () => {
    S.after = r.value === 'after';
    S.node?.port.postMessage({ after: S.after });
    arrangeChips(S.after && params().swap);
  });
}
function setAfter(v) {
  S.after = v;
  document.querySelector(`input[name="ab"][value="${v ? 'after' : 'before'}"]`).checked = true;
  S.node?.port.postMessage({ after: v });
}

ui.sidesPlay.addEventListener('click', () => {
  const ms = sideList();
  if (!ms.length) return;
  const mo = ms[S.checks % ms.length];
  S.checks++;
  setAfter(true);
  arrangeChips(params().swap);
  ui.sidesAnswer.hidden = true;
  S.stopAt = mo.t + (mo.snap ? 1.2 : 1.6);
  renderSides();
  play(Math.max(0, mo.t - (mo.snap ? 0.6 : 1)));
});
ui.sidesSame.addEventListener('click', () => { S.sides = S.opt.swap ? 'swapped' : 'same'; ui.sidesAnswer.hidden = true; renderSides(); changed(); });
ui.sidesOpp.addEventListener('click', () => {
  S.opt.swap = !S.opt.swap;
  S.sides = S.opt.swap ? 'swapped' : 'same';
  ui.sidesAnswer.hidden = true;
  renderSides();
  changed();
});

// ---------------------------------------------------------------- timeline (real levels from the analysis)

function clipMarks() {
  const ev = S.stats.clipping.events, out = [];
  for (const e of ev) if (!out.length || e.t - out[out.length - 1].t > 2) out.push(e);
  return out.slice(0, 12);
}

function drawTimeline() {
  const c = ui.tl, w = c.clientWidth, hgt = c.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  if (!w || !S?.timeline) return;
  c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, hgt);
  const css = getComputedStyle(document.documentElement);
  const colL = css.getPropertyValue('--l-sig').trim(), colR = css.getPropertyValue('--r-sig').trim(), colB = css.getPropertyValue('--both').trim(), line = css.getPropertyValue('--line-2').trim();
  const tl = S.timeline, n = tl.length / 5, cols = Math.max(1, Math.floor(w / 2)), mid = hgt / 2, room = mid - 3;
  const y = (v) => Math.min(1, Math.max(0, (toDb(v) + 60) / 60)) * room;
  for (let cIdx = 0; cIdx < cols; cIdx++) {
    const i0 = Math.floor((cIdx / cols) * n), i1 = Math.max(i0 + 1, Math.floor(((cIdx + 1) / cols) * n));
    let pl = 0, pr = 0, sl = 0, sr = 0, cc = 0, k = 0;
    for (let i = i0; i < i1 && i < n; i++, k++) {
      pl = Math.max(pl, tl[i * 5]); pr = Math.max(pr, tl[i * 5 + 1]);
      sl += tl[i * 5 + 2] ** 2; sr += tl[i * 5 + 3] ** 2; cc += tl[i * 5 + 4];
    }
    if (!k) continue;
    const x = cIdx * 2, a = y(Math.sqrt(sl / k)), b = y(Math.sqrt(sr / k)), both = Math.min(a, b) * Math.max(0, cc / k);
    g.globalAlpha = 0.38; g.fillStyle = colL; g.fillRect(x, mid - y(pl), 1.5, y(pl));
    g.fillStyle = colR; g.fillRect(x, mid, 1.5, y(pr));
    g.globalAlpha = 1;
    g.fillStyle = colB; g.fillRect(x, mid - both, 1.5, both * 2);
    g.fillStyle = colL; g.fillRect(x, mid - a, 1.5, a - both);
    g.fillStyle = colR; g.fillRect(x, mid + both, 1.5, b - both);
  }
  g.fillStyle = line; g.fillRect(0, mid - 0.5, w, 1);
  g.font = '700 11px Barlow, sans-serif'; g.fillStyle = colL; g.fillText('L', 8, 15); g.fillStyle = colR; g.fillText('R', 8, hgt - 7);

  const marks = S.stats.clipping.count ? clipMarks() : [];
  ui.marks.replaceChildren(...marks.map((e, i) => {
    const b = h('button', { class: 'mark', type: 'button', 'aria-label': `Distortion ${i + 1} at ${fmtTime(e.t)}`, style: `left:${(e.t / S.duration) * 100}%` }, String(i + 1));
    b.addEventListener('click', (ev) => { ev.stopPropagation(); play(Math.max(0, e.t - 1.5)); });
    return b;
  }));
  ui.markList.hidden = !marks.length;
  ui.markList.replaceChildren(...marks.map((e, i) => h('li', {}, h('b', {}, String(i + 1)), ` ${fmtTime(e.t)} · ${e.ch === 0 ? 'left' : 'right'}`)));
}

ui.scrub.addEventListener('input', () => {
  if (!S?.duration) return;
  S.media.currentTime = (+ui.scrub.value / 1000) * S.duration;
  kick();
});
new ResizeObserver(() => { if (S?.timeline) drawTimeline(); }).observe(ui.timeline);

// ---------------------------------------------------------------- saving

let saveStart = 0;
// The file type a save produces. AAC-based choices fall back to the original family where the
// browser can't encode AAC; the engine makes the same call.
async function outFormat() {
  const o = S.opt, aac = S.aac ?? (await aacEncodable());
  if (!S.isVideo) return { ext: o.audioFormat === 'm4a' && aac ? 'm4a' : 'wav', mode: 'original' };
  if (o.saveMode !== 'original' && aac) return { ext: 'mp4', mode: o.saveMode };
  const c = S.info.container;
  return { ext: c === 'Matroska' ? 'mkv' : c === 'WebM' ? 'webm' : 'mov', mode: 'original' };
}

ui.go.addEventListener('click', async () => {
  if (!S?.stats || S.saving) return;
  const base = S.file.name.replace(/\.[^.]+$/, '');
  const { ext, mode } = await outFormat();
  const name = `${base} (fixed).${ext}`;
  const mime = MIME[ext];
  let target = null;
  if ('showSaveFilePicker' in window && !isIOS) {
    try {
      const handle = await showSaveFilePicker({ suggestedName: name, types: [{ description: ext.toUpperCase() + ' file', accept: { [mime]: ['.' + ext] } }] });
      target = { kind: 'handle', handle };
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  if (!target) target = { kind: 'opfs', name: `fixed-${Date.now()}.${ext}` };
  S.saving = true; S.target = target; S.pendingKey = exportKey(); S.pendingParams = JSON.stringify(params());
  S.media.pause();
  ui.go.disabled = true;
  ui.done.hidden = true;
  ui.error.hidden = true;
  saveStart = performance.now();
  showProgress('Saving the fixed copy… 0%', 0, true);
  ui.progress.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  keepAwake(true);
  if (target.kind === 'opfs') navigator.storage.persist?.().catch(() => {});
  worker.postMessage({ type: 'export', params: params(), target, audioFormat: ext, mode });
});

async function aacEncodable() {
  try { return (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: S.info.audio.sampleRate, numberOfChannels: Math.min(2, S.info.audio.channels), bitrate: 256000 })).supported; }
  catch { return false; }
}

function saveProgress(p) {
  const pct = Math.round(Math.min(1, p) * 100);
  const secs = (performance.now() - saveStart) / 1000;
  let eta = '';
  if (p > 0.03 && secs > 3) {
    const left = (secs / p) * (1 - p);
    eta = left > 90 ? ` · about ${Math.round(left / 60)} min left` : left > 8 ? ` · about ${Math.round(left / 5) * 5} s left` : '';
  }
  showProgress(`${S.opt.saveMode === 'social' && S.isVideo ? 'Making the TikTok & Reels copy' : 'Saving the fixed copy'}… ${pct}%${eta}`, pct, true);
}

ui.cancel.addEventListener('click', () => worker?.postMessage({ type: 'cancel' }));

function endSave() {
  S.saving = false;
  keepAwake(false);
  ui.go.disabled = false;
  ui.progress.hidden = true;
}

async function onExported(d) {
  endSave();
  S.savedKey = S.pendingKey;
  S.savedParams = S.pendingParams;
  renderFixes();
  ui.done.hidden = false;
  ui.save.hidden = true;
  ui.share.hidden = true;
  ui.download.hidden = true;
  const lim = (d.limiterDb < -0.5 ? ' The loudest few peaks were softened slightly so they don’t distort.' : '')
    + (d.notice === 'aac-unavailable' ? ' This browser can’t make MP4 sound, so it was saved in the original format instead.' : '')
    + (d.notice === 'social-unavailable' ? ' This browser couldn’t remake the picture for TikTok & Reels, so this is a Smaller MP4 with the picture unchanged.' : '');
  if (d.target === 'handle') {
    ui.doneTitle.textContent = 'Saved';
    ui.doneText.textContent = `“${d.name}” (${fmtSize(d.size)}) is saved where you chose.${lim}`;
  } else {
    const stored = d.blob || (await (await (await navigator.storage.getDirectory()).getFileHandle(S.target.name)).getFile());
    const file = new File([stored], d.name, { type: MIME[d.ext] || '' });
    if (S.outUrl) URL.revokeObjectURL(S.outUrl);
    S.outUrl = URL.createObjectURL(file);
    S.outFile = file;
    ui.download.href = S.outUrl;
    ui.download.download = d.name;
    ui.download.hidden = false;
    const canShare = navigator.canShare?.({ files: [file] });
    ui.share.hidden = !canShare;
    ui.doneTitle.textContent = 'Ready';
    ui.doneText.textContent = `“${d.name}” (${fmtSize(d.size)}).${isIOS ? ' Tap Save to Photos or share, then choose Save Video.' : ''}${lim}`;
  }
  const tips = nextTime();
  ui.nextTime.hidden = !tips.length;
  ui.nextTime.lastElementChild.replaceChildren(...tips.map((t) => h('li', {}, t)));
  ui.done.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
}

// Things the fix can't undo, mapped to the setting that prevents them next time.
function nextTime() {
  const st = S.stats, i = S.info, out = [];
  if (i.spatial) out.push('Set Settings, Camera, Record Sound to Stereo. One clean track, no Spatial Audio glitches.');
  if (st.clipping.count) out.push('Keep the loudest triggers a hand’s width from the phone. Those distorted moments can’t be repaired.');
  if (st.pumping?.likely || st.floorDb > -58) out.push('For a quieter, steadier background, try Blackmagic Camera (free), and turn Wind Noise Reduction and Audio Zoom off.');
  if (st.correlation > 0.98) out.push('Film in landscape so the phone can record real left and right.');
  if (st.silentChannel || Math.abs(st.balanceDb) >= 2) out.push('Check that the case, mount or your fingers aren’t covering a mic hole.');
  if (S.sides === 'swapped') out.push('Snap with your arm out to your right at the start of each take. It makes checking sides instant.');
  if (st.bandwidth?.narrow) out.push('Record with the iPhone’s own mics or a wired mic. AirPods and other Bluetooth mics record narrow, phone-call sound.');
  if (S.isVideo && st.gated?.gaps >= 8 && st.gated.share > 0.05) out.push('Before each take, check that Mic Mode in Control Center isn’t set to Voice Isolation.');
  if ((S.video?.fps?.lowSeconds || 0) >= 2) out.push('Turn off Auto FPS (Settings, Camera, Record Video) and add a soft light, so the frame rate stays steady.');
  else if ((S.video?.brightness ?? 1) < 0.08) out.push('Add a soft light in front of you so the picture stays clean after upload.');
  return out;
}

ui.share.addEventListener('click', async () => {
  try { await navigator.share({ files: [S.outFile], title: S.outFile.name }); }
  catch (err) { if (err.name !== 'AbortError') ui.doneText.textContent = 'Sharing didn’t work here. Use Download instead.'; }
});

addEventListener('beforeunload', (e) => { if (S?.saving) e.preventDefault(); });

// Offline use: a service worker keeps a copy of the app once it has been opened.
if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------------------------------------------------------------- keep the screen awake during long jobs

let wake = null;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S?.saving) keepAwake(true); });
async function keepAwake(on) {
  try {
    if (on && !wake && 'wakeLock' in navigator) wake = await navigator.wakeLock.request('screen');
    else if (!on && wake) { await wake.release(); wake = null; }
  } catch { wake = null; }
}

// ---------------------------------------------------------------- headphone test

let hpCtx = null;
ui.hp.addEventListener('click', async () => {
  const ctx = S?.ctx || (hpCtx ||= new AudioContext());
  await ctx.resume().catch(() => {});
  const t = ctx.currentTime + 0.08;
  pluck(ctx, t, -1, 660);
  pluck(ctx, t + 0.9, 1, 880);
  setTimeout(() => { pulse(pads.L); ui.hpLive.textContent = 'Left'; }, 80);
  setTimeout(() => { pulse(pads.R); ui.hpLive.textContent = 'Right'; }, 980);
});

function pluck(ctx, t, pan, f) {
  const g = ctx.createGain(), p = new StereoPannerNode(ctx, { pan });
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  for (const [mult, amp] of [[1, 1], [2, 0.3], [3, 0.12]]) {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.value = f * mult; og.gain.value = amp;
    o.connect(og).connect(g);
    o.start(t); o.stop(t + 0.75);
  }
  g.connect(p).connect(ctx.destination);
}

function pulse(pad) {
  pad.el.classList.remove('ping');
  void pad.el.offsetWidth;
  pad.el.classList.add('ping');
  if (reduceMotion.matches) return;
  const opts = { duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }, y = (1 - pad.level) * 100;
  pad.side.animate([{ transform: 'translateY(0%)' }, { transform: `translateY(${y}%)` }], opts);
  pad.side.firstElementChild?.animate([{ transform: 'translateY(0%)' }, { transform: `translateY(${-y}%)` }], opts);
}
