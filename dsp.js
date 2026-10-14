// Streaming stereo DSP for Fix My ASMR. No dependencies.
// Everything works on blocks of Float32Array samples and keeps its own state, so the
// same code runs in the export worker (whole file, chunk by chunk) and in the live
// preview AudioWorklet (128-sample render quanta).

export const toDb = (x) => 20 * Math.log10(Math.max(x, 1e-12));
export const fromDb = (d) => Math.pow(10, d / 20);
const powDb = (p) => 10 * Math.log10(Math.max(p, 1e-24));

// ---------------------------------------------------------------- biquads

export class Biquad {
  constructor(c = [1, 0, 0, 0, 0]) { this.set(c); this.z1 = 0; this.z2 = 0; }
  set([b0, b1, b2, a1, a2]) { this.b0 = b0; this.b1 = b1; this.b2 = b2; this.a1 = a1; this.a2 = a2; }
  run(x, n) {
    const { b0, b1, b2, a1, a2 } = this;
    let z1 = this.z1, z2 = this.z2;
    for (let i = 0; i < n; i++) {
      const xi = x[i], y = b0 * xi + z1;
      z1 = b1 * xi - a1 * y + z2;
      z2 = b2 * xi - a2 * y;
      x[i] = y;
    }
    // Flush denormals so long silences don't slow the loop down.
    this.z1 = Math.abs(z1) < 1e-25 ? 0 : z1;
    this.z2 = Math.abs(z2) < 1e-25 ? 0 : z2;
  }
}

// RBJ cookbook designs, normalised to a0 = 1.
export function highpass(fs, f0, q) {
  const w = (2 * Math.PI * f0) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  return [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0];
}
export function notch(fs, f0, q) {
  const w = (2 * Math.PI * f0) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  return [1 / a0, (-2 * c) / a0, 1 / a0, (-2 * c) / a0, (1 - al) / a0];
}
// ITU-R BS.1770 K-weighting, valid at any sample rate (same formulas as libebur128).
export function kWeighting(fs) {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  f0 = 38.13547087602444; Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const hp = [1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  return [shelf, hp];
}

// ---------------------------------------------------------------- FFT

// In-place radix-2 complex FFT on Float64Arrays.
export class FFT {
  constructor(n) {
    this.n = n;
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos((2 * Math.PI * i) / n); this.sin[i] = Math.sin((2 * Math.PI * i) / n); }
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
  }
  run(re, im, inverse = false) {
    const { n, rev, cos } = this, sin = this.sin, sg = inverse ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0, t = 0; k < half; k++, t += step) {
          const wr = cos[t], wi = sg * sin[t], a = start + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }
}

const N_FFT = 2048;
const HUM50 = [50, 100, 150, 200], HUM60 = [60, 120, 180, 240], HUM_REF = [44, 56, 70, 90, 110, 135, 165, 210];
const sqrtHann = (n) => Float64Array.from({ length: n }, (_, i) => Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)));

// Splits a packed FFT of (left + i*right) into per-channel power spectra.
function stereoPower(re, im, n, pL, pR) {
  for (let k = 0; k <= n / 2; k++) {
    const nk = (n - k) & (n - 1);
    const lr = (re[k] + re[nk]) / 2, li = (im[k] - im[nk]) / 2;
    const rr = (im[k] + im[nk]) / 2, ri = (re[nk] - re[k]) / 2;
    pL[k] = lr * lr + li * li;
    pR[k] = rr * rr + ri * ri;
  }
}

// ---------------------------------------------------------------- analysis

// One pass over the whole recording. Cheap enough to run before every fix:
// loudness (BS.1770), peaks, clipping, stereo correlation and balance, a
// background-noise spectrum taken from the quietest moments, and a 10 Hz level
// timeline for drawing real per-channel levels.
export class Analyzer {
  constructor(fs) {
    this.fs = fs;
    this.k = [0, 1].map(() => kWeighting(fs).map((c) => new Biquad(c)));
    this.lf = [0, 1].map(() => new Biquad(highpass(fs, 60, Math.SQRT1_2))); // removes LF; LF = x - hp(x)
    this.sub = Math.round(fs / 10); // 100 ms
    this.subPos = 0;
    this.acc = new Float64Array(12); // per 100 ms: kL kR, sumL sumR, sqL sqR, xLR, lfL lfR, pkL pkR, (spare)
    this.subZ = []; // K-weighted mean squares per 100 ms (for 400 ms gating blocks)
    this.timeline = []; // per 100 ms: [pkL, pkR, rmsL, rmsR, lfRms]
    this.frames = 0;
    this.peak = [0, 0];
    this.clip = { count: 0, events: [] };
    this.clipRun = [0, 0];
    this.fft = new FFT(N_FFT);
    this.win = sqrtHann(N_FFT);
    this.ring = [new Float32Array(N_FFT), new Float32Array(N_FFT)];
    this.ringPos = 0;
    this.sinceFrame = 0;
    this.re = new Float64Array(N_FFT); this.im = new Float64Array(N_FFT);
    this.pL = new Float64Array(N_FFT / 2 + 1); this.pR = new Float64Array(N_FFT / 2 + 1);
    // Per-bin power sums bucketed by frame level (1 dB buckets, -140..0 dB) so the
    // quietest-10% noise spectrum can be computed at the end without storing frames.
    this.bucketCount = new Float64Array(141);
    this.bucketSum = [new Float64Array(141 * (N_FFT / 2 + 1)), new Float64Array(141 * (N_FFT / 2 + 1))];
    this.scratch = new Float32Array(4096);
    // Mains hum: 1-second Goertzel windows on a decimated mono mix, compared with
    // nearby non-harmonic frequencies during the quietest seconds.
    this.dec = Math.max(1, Math.round(fs / 6000));
    this.gzF = [...HUM50, ...HUM60, ...HUM_REF];
    this.gzC = Float64Array.from(this.gzF, (f) => 2 * Math.cos((2 * Math.PI * f * this.dec) / fs));
    this.gz1 = new Float64Array(this.gzF.length); this.gz2 = new Float64Array(this.gzF.length);
    this.decAcc = 0; this.decN = 0; this.gzN = 0; this.gzMs = 0;
    this.gzLen = Math.round(fs / this.dec);
    this.humWins = [];
  }

  goertzel(l, r) {
    this.decAcc += l + r;
    this.gzMs += l * l + r * r;
    if (++this.decN < this.dec) return;
    const x = this.decAcc / (2 * this.dec), c = this.gzC, s1 = this.gz1, s2 = this.gz2;
    this.decAcc = 0; this.decN = 0;
    for (let k = 0; k < c.length; k++) { const s0 = x + c[k] * s1[k] - s2[k]; s2[k] = s1[k]; s1[k] = s0; }
    if (++this.gzN < this.gzLen) return;
    const pw = new Float32Array(c.length);
    for (let k = 0; k < c.length; k++) { pw[k] = s1[k] * s1[k] + s2[k] * s2[k] - c[k] * s1[k] * s2[k]; s1[k] = 0; s2[k] = 0; }
    this.humWins.push({ ms: this.gzMs, pw });
    this.gzN = 0; this.gzMs = 0;
  }

  hum() {
    const w = this.humWins.slice().sort((a, b) => a.ms - b.ms);
    const quiet = w.slice(0, Math.max(3, Math.floor(w.length * 0.3)));
    if (quiet.length < 3) return { hz: null, db: 0 };
    const avg = (from, to) => { let s = 0; for (const q of quiet) for (let k = from; k < to; k++) s += q.pw[k]; return s / (quiet.length * (to - from)); };
    const n50 = HUM50.length, n60 = HUM60.length;
    const ref = avg(n50 + n60, this.gzF.length) + 1e-30;
    const d50 = powDb(avg(0, n50) / ref), d60 = powDb(avg(n50, n50 + n60) / ref);
    const hz = Math.max(d50, d60) > 12 && Math.abs(d50 - d60) > 6 ? (d50 > d60 ? 50 : 60) : null;
    return { hz, db: Math.max(d50, d60) };
  }

  push(L, R, n) {
    const { fs, acc, ring } = this;
    const kl = this.scratch.length < n * 4 ? (this.scratch = new Float32Array(n * 4)) : this.scratch;
    const kL = kl.subarray(0, n), kR = kl.subarray(n, 2 * n), hL = kl.subarray(2 * n, 3 * n), hR = kl.subarray(3 * n, 4 * n);
    kL.set(L.subarray(0, n)); kR.set(R.subarray(0, n)); hL.set(L.subarray(0, n)); hR.set(R.subarray(0, n));
    for (const f of this.k[0]) f.run(kL, n);
    for (const f of this.k[1]) f.run(kR, n);
    this.lf[0].run(hL, n); this.lf[1].run(hR, n);
    for (let i = 0; i < n; i++) {
      const l = L[i], r = R[i];
      acc[0] += kL[i] * kL[i]; acc[1] += kR[i] * kR[i];
      acc[2] += l; acc[3] += r; acc[4] += l * l; acc[5] += r * r; acc[6] += l * r;
      const ll = l - hL[i], lr = r - hR[i];
      acc[7] += ll * ll + lr * lr;
      const al = l < 0 ? -l : l, ar = r < 0 ? -r : r;
      if (al > acc[9]) acc[9] = al;
      if (ar > acc[10]) acc[10] = ar;
      this.clipCheck(0, al); this.clipCheck(1, ar);
      this.goertzel(l, r);
      ring[0][this.ringPos] = l; ring[1][this.ringPos] = r;
      this.ringPos = (this.ringPos + 1) & (N_FFT - 1);
      if (++this.sinceFrame === N_FFT / 2) { this.sinceFrame = 0; this.spectrum(); }
      if (++this.subPos === this.sub) this.closeSub();
      this.frames++;
    }
  }

  clipCheck(ch, a) {
    if (a >= 0.98) {
      if (++this.clipRun[ch] === 3) {
        this.clip.count++;
        const t = this.frames / this.fs;
        const ev = this.clip.events;
        if (!ev.length || t - ev[ev.length - 1].t > 0.5) { if (ev.length < 400) ev.push({ t, ch }); }
      }
    } else this.clipRun[ch] = 0;
  }

  closeSub() {
    const a = this.acc, n = this.subPos;
    this.subZ.push(a[0] / n, a[1] / n);
    const rmsL = Math.sqrt(a[4] / n), rmsR = Math.sqrt(a[5] / n);
    this.timeline.push([a[9], a[10], rmsL, rmsR, Math.sqrt(a[7] / (2 * n)), a[6] / n]);
    if (a[9] > this.peak[0]) this.peak[0] = a[9];
    if (a[10] > this.peak[1]) this.peak[1] = a[10];
    a.fill(0);
    this.subPos = 0;
  }

  spectrum() {
    const { re, im, win, ring, pL, pR } = this;
    let pos = this.ringPos;
    for (let j = 0; j < N_FFT; j++, pos = (pos + 1) & (N_FFT - 1)) { re[j] = ring[0][pos] * win[j] * win[j]; im[j] = ring[1][pos] * win[j] * win[j]; }
    this.fft.run(re, im);
    stereoPower(re, im, N_FFT, pL, pR);
    let e = 0;
    for (let k = 1; k <= N_FFT / 2; k++) e += pL[k] + pR[k];
    // Level of this frame relative to a full-scale sine through the Hann window.
    const ref = (N_FFT / 4) * (N_FFT / 4) * 2;
    const b = Math.max(0, Math.min(140, Math.round(140 + powDb(e / ref))));
    this.bucketCount[b]++;
    const off = b * (N_FFT / 2 + 1), sL = this.bucketSum[0], sR = this.bucketSum[1];
    for (let k = 0; k <= N_FFT / 2; k++) { sL[off + k] += pL[k]; sR[off + k] += pR[k]; }
  }

  finish() {
    if (this.subPos > 0) this.closeSub();
    const fs = this.fs, z = this.subZ, nSub = z.length / 2;
    // Integrated loudness: 400 ms blocks every 100 ms, absolute then relative gate.
    const blocks = [];
    for (let i = 0; i + 4 <= nSub; i++) {
      let s = 0;
      for (let j = i; j < i + 4; j++) s += z[2 * j] + z[2 * j + 1];
      blocks.push(s / 4);
    }
    const lufs = (p) => -0.691 + powDb(p);
    const abs = blocks.filter((p) => lufs(p) > -70);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);
    let integrated = -Infinity;
    if (abs.length) {
      const gate = lufs(mean(abs)) - 10;
      const rel = abs.filter((p) => lufs(p) > gate);
      integrated = lufs(mean(rel));
    }

    // Noise spectrum: mean power over the quietest ~10% of spectral frames.
    const total = this.bucketCount.reduce((a, b) => a + b, 0);
    let cum = 0, cut = 0;
    for (; cut <= 140; cut++) { cum += this.bucketCount[cut]; if (cum >= total * 0.1) break; }
    const nb = N_FFT / 2 + 1, noise = [new Float32Array(nb), new Float32Array(nb)];
    let cnt = 0;
    for (let b = 0; b <= cut && b <= 140; b++) {
      cnt += this.bucketCount[b];
      for (let k = 0; k < nb; k++) { noise[0][k] += this.bucketSum[0][b * nb + k]; noise[1][k] += this.bucketSum[1][b * nb + k]; }
    }
    if (cnt) for (let k = 0; k < nb; k++) { noise[0][k] /= cnt; noise[1][k] /= cnt; }

    // Per-100 ms stats for the quiet floor, stereo image and balance.
    const tl = this.timeline;
    const rms = tl.map((t) => Math.sqrt((t[2] * t[2] + t[3] * t[3]) / 2));
    const sorted = rms.slice().sort((a, b) => a - b);
    const pct = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
    const floorDb = Math.max(-120, toDb(pct(0.1))), loudDb = Math.max(-120, toDb(pct(0.9)));
    // Stereo stats use blocks where the louder side is well above the floor, so hiss doesn't
    // dominate them. Judging by the louder side keeps one-sided sounds in the set.
    const side = tl.map((t) => Math.max(t[2], t[3]));
    const stereo = (cut) => {
      let ll = 0, rr = 0, lr = 0, n = 0, cl = 0, cr = 0;
      tl.forEach((t, i) => {
        if (side[i] < cut) return;
        n++; ll += t[2] * t[2]; rr += t[3] * t[3]; lr += t[5];
        if (t[5] / (t[2] * t[3] + 1e-24) > 0.6) { cl += t[2] * t[2]; cr += t[3] * t[3]; }
      });
      return { n, ll, rr, lr, cl, cr };
    };
    let st = stereo(Math.max(fromDb(floorDb + 10), 1e-5));
    if (st.n < 10) st = stereo(1e-5);
    // NaN when one side is silent or the file is silent: neither mono nor out of phase.
    const corr = st.ll > 0 && st.rr > 0 ? st.lr / Math.sqrt(st.ll * st.rr) : NaN;
    const moments = [];
    tl.forEach((t, i) => {
      const ild = toDb(t[2]) - toDb(t[3]);
      if (Math.abs(ild) > 6 && side[i] > fromDb(floorDb + 10)) moments.push({ t: i / 10, ild, level: side[i] });
    });
    const cLL = st.cl, cRR = st.cr;
    const balanceDb = cLL && cRR ? powDb(cLL) - powDb(cRR) : 0;
    // Strongest one-sided moments at least 5 s apart: used for the "which side?" check.
    moments.sort((a, b) => Math.abs(b.ild) * b.level - Math.abs(a.ild) * a.level);
    const picks = [];
    for (const m of moments) { if (picks.every((p) => Math.abs(p.t - m.t) > 5)) picks.push(m); if (picks.length === 6) break; }
    const lfRms = Math.sqrt(mean(tl.map((t) => t[4] * t[4])));
    const fullRms = Math.sqrt(mean(tl.map((t) => (t[2] * t[2] + t[3] * t[3]) / 2)));
    return {
      sampleRate: fs,
      duration: this.frames / fs,
      integratedLufs: integrated,
      peakDb: [toDb(this.peak[0]), toDb(this.peak[1])],
      clipping: this.clip,
      correlation: corr,
      balanceDb,
      silentChannel: this.peak[0] < 1e-4 && this.peak[1] > 1e-3 ? 'left' : this.peak[1] < 1e-4 && this.peak[0] > 1e-3 ? 'right' : null,
      floorDb,
      loudDb,
      rumbleDb: toDb(lfRms) - toDb(fullRms),
      hum: this.hum(),
      noise,
      sideMoments: picks,
      // per 100 ms: peak L, peak R, rms L, rms R, how alike the two sides are (-1..1)
      timeline: tl.map((t) => [t[0], t[1], t[2], t[3], Math.max(-1, Math.min(1, t[5] / (t[2] * t[3] + 1e-24)))]),
      pumping: pumping(rms, floorDb),
    };
  }
}

// After each loud onset, compare the quietest 100 ms in the half-second before with the
// half-second after. A phone's auto-gain ducks the background after loud sounds, then
// lets it creep back. No published detector exists; this is a heuristic, report-only.
function pumping(rms, floorDb) {
  const loud = fromDb(floorDb + 25), drops = [];
  for (let i = 6; i < rms.length - 6; i++) {
    if (rms[i] < loud || rms[i - 1] * 4 > rms[i]) continue;
    const pre = Math.min(...rms.slice(i - 6, i - 1)), post = Math.min(...rms.slice(i + 1, i + 6));
    if (pre < loud && post < loud && pre > 0 && post > 0) drops.push(toDb(pre) - toDb(post));
    i += 5;
  }
  const mean = drops.reduce((a, b) => a + b, 0) / Math.max(1, drops.length);
  return { events: drops.length, dropDb: mean, likely: drops.length >= 20 && mean >= 3 };
}

// ---------------------------------------------------------------- processing

// Gentle spectral gate for hiss. A soft knee around (noise + sensitivity) with a
// gain floor, instant attack and slow release per bin, and smoothing across
// neighbouring bins, which keeps "musical noise" down and lets transients through.
export class Denoiser {
  constructor(fs) {
    this.fs = fs;
    this.n = N_FFT; this.hop = N_FFT / 4;
    this.latency = N_FFT;
    this.fft = new FFT(N_FFT);
    this.win = sqrtHann(N_FFT);
    this.inL = new Float32Array(N_FFT); this.inR = new Float32Array(N_FFT);
    this.outL = new Float32Array(N_FFT); this.outR = new Float32Array(N_FFT);
    this.pos = 0;
    this.re = new Float64Array(N_FFT); this.im = new Float64Array(N_FFT);
    const nb = N_FFT / 2 + 1;
    this.pL = new Float64Array(nb); this.pR = new Float64Array(nb);
    this.mL = new Float64Array(nb);
    this.sL = new Float64Array(nb).fill(1);
    this.tmp = new Float64Array(nb);
    this.noise = null;
    this.setAmount(0);
    this.release = Math.exp(-this.hop / (fs * 0.09));
  }
  setProfile(noise) {
    // Profile was measured with a Hann (sqrtHann^2) window; this STFT analyses with
    // sqrtHann only, whose power is 1.5x larger for white-ish noise. Scale to match.
    this.noise = noise ? noise.map((a) => Float64Array.from(a, (p) => p * 1.5)) : null;
  }
  setAmount(reductionDb, sensitivityDb = 8) {
    this.floor = fromDb(-Math.max(0, reductionDb));
    this.sens = sensitivityDb;
    this.active = reductionDb > 0;
  }
  process(L, R, n) {
    const { hop, inL, inR, outL, outR } = this;
    for (let i = 0; i < n; i++) {
      inL[N_FFT - hop + this.pos] = L[i]; inR[N_FFT - hop + this.pos] = R[i];
      L[i] = outL[this.pos]; R[i] = outR[this.pos];
      if (++this.pos === hop) { this.pos = 0; this.frame(); }
    }
  }
  frame() {
    const { n, hop, win, re, im, inL, inR, outL, outR } = this;
    for (let j = 0; j < n; j++) { re[j] = inL[j] * win[j]; im[j] = inR[j] * win[j]; }
    if (this.active && this.noise) {
      this.fft.run(re, im);
      this.gains(re, im);
      this.fft.run(re, im, true);
      for (let j = 0; j < n; j++) { re[j] /= n; im[j] /= n; }
    }
    outL.copyWithin(0, hop); outR.copyWithin(0, hop);
    outL.fill(0, n - hop); outR.fill(0, n - hop);
    // sqrtHann analysis * sqrtHann synthesis = Hann; Hann at 75% overlap sums to 2.
    for (let j = 0; j < n; j++) { const w = win[j] * 0.5; outL[j] += re[j] * w; outR[j] += im[j] * w; }
    inL.copyWithin(0, hop); inR.copyWithin(0, hop);
  }
  gains(re, im) {
    const { n, pL, pR, mL, sL, tmp, noise, sens, floor, release } = this, nb = n / 2 + 1;
    stereoPower(re, im, n, pL, pR);
    // One mask for both sides, from their combined power, so hiss is lowered evenly and
    // the stereo image doesn't wander.
    const knee = 6, lo = sens - knee / 2;
    for (let k = 0; k < nb; k++) mL[k] = Math.min(1, Math.max(0, (powDb((pL[k] + pR[k]) / (noise[0][k] + noise[1][k] + 1e-24)) - lo) / knee));
    for (let k = 0; k < nb; k++) {
      let acc = 0, c = 0;
      for (let d = -2; d <= 2; d++) { const kk = k + d; if (kk >= 0 && kk < nb) { acc += mL[kk]; c++; } }
      tmp[k] = acc / c;
    }
    for (let k = 0; k < nb; k++) sL[k] = tmp[k] >= sL[k] ? tmp[k] : sL[k] * release + tmp[k] * (1 - release);
    for (let k = 0; k < nb; k++) {
      const gL = floor + (1 - floor) * sL[k], gR = gL;
      const nk = (n - k) & (n - 1);
      const lr = (re[k] + re[nk]) / 2, li = (im[k] - im[nk]) / 2;
      const rr = (im[k] + im[nk]) / 2, ri = (re[nk] - re[k]) / 2;
      re[k] = gL * lr - gR * ri; im[k] = gL * li + gR * rr;
      if (nk !== k) { re[nk] = gL * lr + gR * ri; im[nk] = -gL * li + gR * rr; }
    }
  }
}

// Look-ahead peak limiter: sliding-window minimum of the required gain, fast
// exponential attack that lands before the peak leaves the delay line, slow release.
export class Limiter {
  constructor(fs, ceilingDb = -1, lookaheadMs = 5, releaseMs = 150) {
    this.la = Math.max(1, Math.round((fs * lookaheadMs) / 1000));
    this.size = this.la + 1;
    this.ceil = fromDb(ceilingDb);
    this.dL = new Float32Array(this.size); this.dR = new Float32Array(this.size);
    this.qv = new Float64Array(this.size + 1); this.qi = new Float64Array(this.size + 1);
    this.qh = 0; this.qt = 0; this.t = 0;
    this.env = 1;
    this.att = Math.exp(-4 / this.la);
    this.rel = Math.exp(-1 / ((fs * releaseMs) / 1000));
    this.latency = this.la;
    this.reduction = 0; // deepest gain reduction since last read, in dB
  }
  process(L, R, n) {
    const { size, ceil, dL, dR, qv, qi, att, rel } = this, cap = qv.length;
    let env = this.env, minEnv = 1;
    for (let i = 0; i < n; i++) {
      const l = L[i], r = R[i];
      const pk = Math.max(l < 0 ? -l : l, r < 0 ? -r : r);
      const req = pk > ceil ? ceil / pk : 1, t = this.t;
      // monotonic deque of (gain, time) for the window minimum
      while (this.qt !== this.qh && qv[(this.qt - 1 + cap) % cap] >= req) this.qt = (this.qt - 1 + cap) % cap;
      qv[this.qt] = req; qi[this.qt] = t; this.qt = (this.qt + 1) % cap;
      while (qi[this.qh] <= t - size) this.qh = (this.qh + 1) % cap;
      const target = qv[this.qh];
      env = target < env ? target + (env - target) * att : target + (env - target) * rel;
      if (env < minEnv) minEnv = env;
      const k = t % size;
      let ol = dL[k] * env, or = dR[k] * env;
      dL[k] = l; dR[k] = r;
      if (ol > ceil) ol = ceil; else if (ol < -ceil) ol = -ceil;
      if (or > ceil) or = ceil; else if (or < -ceil) or = -ceil;
      L[i] = ol; R[i] = or;
      this.t = t + 1;
    }
    this.env = env;
    this.reduction = Math.min(this.reduction, toDb(minEnv));
  }
}

// Fixed delay, used to keep the dry (Before) path aligned with the processed path.
export class Delay {
  constructor(samples) { this.n = samples; this.bL = new Float32Array(samples + 1); this.bR = new Float32Array(samples + 1); this.p = 0; }
  process(L, R, n) {
    const { bL, bR } = this, size = bL.length;
    for (let i = 0; i < n; i++) {
      const w = this.p, rd = (w + 1) % size;
      bL[w] = L[i]; bR[w] = R[i];
      L[i] = bL[rd]; R[i] = bR[rd];
      this.p = rd;
    }
  }
}

export const DEFAULTS = {
  swap: false,          // trade left and right
  invert: false,        // flip polarity of the right side (out-of-phase fix)
  copySide: null,       // 'left' | 'right': copy one side to both (dead channel)
  trimL: 0, trimR: 0,   // per-side level trim, dB
  rumbleHz: 0,          // high-pass corner, 0 = off
  humHz: 0,             // 50 | 60 mains hum notches, 0 = off
  hissDb: 0,            // hiss reduction depth, dB (0 = off)
  hissSens: 8,          // how far above the hiss a sound must be to pass untouched, dB
  width: 0,             // 0..1 extra stereo width in the highs
  gainDb: 0,            // static gain (loudness match)
  limit: true,          // peak limiter at -1 dBFS
};

// The full chain. Order: channel fixes -> rumble/hum filters -> hiss -> width ->
// gain -> limiter. Constant latency (hiss + limiter), so export can trim it exactly.
export class Chain {
  constructor(fs, noise = null) {
    this.fs = fs;
    this.p = { ...DEFAULTS };
    this.den = new Denoiser(fs);
    this.den.setProfile(noise);
    // chisle: sample-peak ceiling at -1.5 dBFS approximates -1 dBTP; add 4x oversampled
    // detection if platform encoders show overs in practice.
    this.lim = new Limiter(fs, -1.5);
    this.latency = this.den.latency + this.lim.latency;
    this.hp = [[], []];
    this.hum = [[], []];
    this.wHp = [new Biquad(), new Biquad()]; // side-signal high-pass for width
    this.m = [1, 0, 0, 1]; // current 2x2 channel matrix (L' = m0 L + m1 R, R' = m2 L + m3 R)
    this.g = 1; this.w = 0;
    this.bufS = new Float32Array(4096);
    this.set({});
  }
  set(p) {
    const fs = this.fs, old = this.p;
    this.p = { ...this.p, ...p };
    const q = this.p;
    if (q.rumbleHz !== old.rumbleHz || !this.hp[0].length && q.rumbleHz) {
      // 12 dB/octave Butterworth: removes thumps and DC, keeps deep taps. Keeps running state.
      this.hp = [0, 1].map((ch) => {
        if (!q.rumbleHz) return [];
        const b = this.hp[ch][0] || new Biquad();
        b.set(highpass(fs, q.rumbleHz, Math.SQRT1_2));
        return [b];
      });
    }
    if (q.humHz !== old.humHz || !this.hum[0].length && q.humHz) {
      this.hum = [0, 1].map(() => q.humHz ? [1, 2, 3, 4].filter((h) => q.humHz * h < fs / 2).map((h) => new Biquad(notch(fs, q.humHz * h, 30))) : []);
    }
    this.den.setAmount(q.hissDb, q.hissSens);
    for (const b of this.wHp) b.set(highpass(fs, 700, Math.SQRT1_2));
    this.mTarget = this.matrix(q);
    this.gTarget = fromDb(q.gainDb);
  }
  matrix(q) {
    const tl = fromDb(q.trimL), tr = fromDb(q.trimR);
    let m = q.swap ? [0, 1, 1, 0] : [1, 0, 0, 1];
    if (q.copySide === 'left') m = q.swap ? [0, 1, 0, 1] : [1, 0, 1, 0];
    if (q.copySide === 'right') m = q.swap ? [1, 0, 1, 0] : [0, 1, 0, 1];
    const s = q.invert ? -1 : 1;
    // trims apply to the output sides, polarity flip to the output right side
    return [m[0] * tl, m[1] * tl, m[2] * tr * s, m[3] * tr * s];
  }
  process(L, R, n) {
    // channel matrix, ramped so toggling Swap mid-playback doesn't click
    const m = this.m, mt = this.mTarget;
    const ramp = m.some((v, i) => v !== mt[i]);
    for (let i = 0; i < n; i++) {
      if (ramp) for (let j = 0; j < 4; j++) { const d = mt[j] - m[j]; m[j] = Math.abs(d) < 1e-3 ? mt[j] : m[j] + d * 0.01; }
      const l = L[i], r = R[i];
      L[i] = m[0] * l + m[1] * r; R[i] = m[2] * l + m[3] * r;
    }
    for (const b of this.hp[0]) b.run(L, n);
    for (const b of this.hp[1]) b.run(R, n);
    for (const b of this.hum[0]) b.run(L, n);
    for (const b of this.hum[1]) b.run(R, n);
    this.den.process(L, R, n);
    // Width: add extra side signal above ~700 Hz (head-shadow-like cue); mid untouched.
    const wt = this.p.width;
    if (wt > 0 || this.w > 0) {
      const S = this.bufS.length < n ? (this.bufS = new Float32Array(n)) : this.bufS;
      for (let i = 0; i < n; i++) S[i] = (L[i] - R[i]) / 2;
      this.wHp[0].run(S, n);
      for (let i = 0; i < n; i++) {
        this.w += (wt - this.w) * 0.001;
        const e = S[i] * this.w;
        L[i] += e; R[i] -= e;
      }
    }
    let g = this.g;
    const gt = this.gTarget;
    for (let i = 0; i < n; i++) { g += (gt - g) * 0.0005; L[i] *= g; R[i] *= g; }
    this.g = g;
    if (this.p.limit) this.lim.process(L, R, n);
  }
}
