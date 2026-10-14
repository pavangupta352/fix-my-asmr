// Run: node test/dsp.test.mjs   (no dependencies)
import assert from 'node:assert/strict';
import { Analyzer, Chain, Denoiser, Limiter, FFT, toDb } from '../dsp.js';

const fs = 48000;
const sine = (n, f, a, phase = 0) => Float32Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / fs + phase));
const noise = (n, a, seed = 1) => { let s = seed; return Float32Array.from({ length: n }, () => { s = (s * 16807) % 2147483647; return a * ((s / 2147483647) * 2 - 1); }); };
const blocks = (L, R, size, fn) => { for (let i = 0; i < L.length; i += size) { const n = Math.min(size, L.length - i); fn(L.subarray(i, i + n), R.subarray(i, i + n), n); } };

// FFT round trip
{
  const f = new FFT(2048), re = Float64Array.from(noise(2048, 1)), im = new Float64Array(2048), x = re.slice();
  f.run(re, im); f.run(re, im, true);
  for (let i = 0; i < 2048; i++) assert.ok(Math.abs(re[i] / 2048 - x[i]) < 1e-9);
}

// BS.1770: 1 kHz sine at -20 dBFS on both channels reads -20 LUFS
{
  const a = new Analyzer(fs), L = sine(fs * 5, 1000, 0.1), R = sine(fs * 5, 1000, 0.1);
  blocks(L, R, 1000, (l, r, n) => a.push(l, r, n));
  const res = a.finish();
  assert.ok(Math.abs(res.integratedLufs + 20) < 0.1, `loudness ${res.integratedLufs}`);
  assert.ok(res.correlation > 0.99, 'identical channels read as mono');
}

// Denoiser at 0 dB is transparent: output == input delayed by its latency
{
  const d = new Denoiser(fs), L = noise(20000, 0.3, 3), R = noise(20000, 0.3, 7), oL = L.slice(), oR = R.slice();
  blocks(oL, oR, 128, (l, r, n) => d.process(l, r, n));
  let err = 0;
  for (let i = d.latency + 4096; i < 20000; i++) err = Math.max(err, Math.abs(oL[i] - L[i - d.latency]), Math.abs(oR[i] - R[i - d.latency]));
  assert.ok(err < 1e-5, `reconstruction error ${err}`);
}

// Denoiser lowers steady hiss and keeps a tone well above it
{
  const n = fs * 4, an = new Analyzer(fs);
  const hissL = noise(n, 0.01, 11), hissR = noise(n, 0.01, 13);
  blocks(hissL.slice(), hissR.slice(), 4096, (l, r, k) => an.push(l, r, k));
  const prof = an.finish().noise;
  const d = new Denoiser(fs); d.setProfile(prof); d.setAmount(12);
  const tone = sine(n, 1000, 0.2);
  const L = Float32Array.from(hissL, (v, i) => v + (i > n / 2 ? tone[i] : 0)), R = hissR.slice();
  blocks(L, R, 512, (l, r, k) => d.process(l, r, k));
  const rms = (x, a, b) => Math.sqrt(x.subarray(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
  const hissDrop = toDb(rms(R, fs, fs * 2)) - toDb(rms(hissR, fs, fs * 2));
  const toneKeep = toDb(rms(L, fs * 3, fs * 4)) - toDb(rms(Float32Array.from(tone.subarray(fs * 3 - d.latency, fs * 4 - d.latency)), 0, fs));
  assert.ok(hissDrop < -8, `hiss only dropped ${hissDrop.toFixed(1)} dB`);
  assert.ok(Math.abs(toneKeep) < 1, `tone changed by ${toneKeep.toFixed(2)} dB`);
}

// Limiter never exceeds its ceiling
{
  const lim = new Limiter(fs, -1), L = sine(fs, 300, 1.5), R = noise(fs, 1.4, 5);
  blocks(L, R, 128, (l, r, n) => lim.process(l, r, n));
  const ceil = Math.pow(10, -1 / 20);
  assert.ok(Math.max(...L.map(Math.abs), ...R.map(Math.abs)) <= ceil + 1e-6);
}

// Chain: swap trades sides (after the latency)
{
  const c = new Chain(fs); c.set({ swap: true, limit: false, rumbleHz: 0 });
  c.m = c.mTarget.slice(); // skip the click-free ramp for the test
  const L = sine(fs, 440, 0.5), R = new Float32Array(fs);
  blocks(L, R, 128, (l, r, n) => c.process(l, r, n));
  const tail = (x) => Math.sqrt(x.subarray(fs / 2).reduce((s, v) => s + v * v, 0) / (fs / 2));
  assert.ok(tail(R) > 0.3 && tail(L) < 1e-4, 'left content moved to the right side');
}

// Hum detector finds 60 Hz mains hum under quiet hiss, and stays quiet on plain hiss
{
  const n = fs * 12, base = noise(n, 0.002, 21);
  const hum = Float32Array.from(base, (v, i) => v + 0.01 * Math.sin((2 * Math.PI * 60 * i) / fs) + 0.005 * Math.sin((2 * Math.PI * 180 * i) / fs));
  const a1 = new Analyzer(fs); blocks(hum, hum.slice(), 4096, (l, r, k) => a1.push(l, r, k));
  const a2 = new Analyzer(fs); blocks(base, base.slice(), 4096, (l, r, k) => a2.push(l, r, k));
  assert.equal(a1.finish().hum.hz, 60);
  assert.equal(a2.finish().hum.hz, null);
}

// One-sided sounds over quiet hiss: not read as mono, and side-check moments are found
{
  const n = fs * 12, L = noise(n, 0.002, 31), R = noise(n, 0.002, 37);
  for (let i = 0; i < n; i++) if (Math.floor(i / fs) % 4 === 0) L[i] += 0.05 * Math.sin((2 * Math.PI * 800 * i) / fs);
  const a = new Analyzer(fs); blocks(L, R, 4096, (l, r, k) => a.push(l, r, k));
  const s = a.finish();
  assert.ok(!(s.correlation > 0.98), `read as mono (${s.correlation})`);
  assert.ok(s.sideMoments.length > 0, 'no one-sided moments found');
}

console.log('dsp: all checks passed');
