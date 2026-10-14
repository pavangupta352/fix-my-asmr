// Live preview. Runs the exact chain the export uses, plus a dry path delayed by the
// same latency, so Before/After switches cleanly without a jump in time.
import { Chain, Delay } from './dsp.js';

class FixPreview extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chain = new Chain(sampleRate);
    this.dry = new Delay(this.chain.latency);
    this.mix = 1;
    this.target = 1;
    this.dL = new Float32Array(128);
    this.dR = new Float32Array(128);
    this.peak = [0, 0];
    this.xy = [0, 0, 0]; // sums of l*r, l*l, r*r for how alike the sides are
    this.blocks = 0;
    this.port.onmessage = ({ data }) => {
      if (data.noise) this.chain.den.setProfile(data.noise);
      if (data.params) this.chain.set(data.params);
      if (data.after !== undefined) this.target = data.after ? 1 : 0;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0], out = outputs[0];
    const L = out[0], R = out[1], n = L.length;
    if (!input || !input.length) { L.fill(0); R.fill(0); return true; }
    L.set(input[0]);
    R.set(input[1] || input[0]);
    const dL = this.dL, dR = this.dR;
    dL.set(L); dR.set(R);
    this.chain.process(L, R, n);
    this.dry.process(dL, dR, n);
    let m = this.mix, pl = this.peak[0], pr = this.peak[1], sxy = this.xy[0], sxx = this.xy[1], syy = this.xy[2];
    const t = this.target;
    for (let i = 0; i < n; i++) {
      if (m !== t) m = t > m ? Math.min(t, m + 1 / 960) : Math.max(t, m - 1 / 960); // 20 ms crossfade
      const l = dL[i] + (L[i] - dL[i]) * m, r = dR[i] + (R[i] - dR[i]) * m;
      L[i] = l; R[i] = r;
      const al = l < 0 ? -l : l, ar = r < 0 ? -r : r;
      if (al > pl) pl = al;
      if (ar > pr) pr = ar;
      sxy += l * r; sxx += l * l; syy += r * r;
    }
    this.mix = m;
    if (++this.blocks === 6) {
      this.port.postMessage([pl, pr, sxx > 1e-9 && syy > 1e-9 ? sxy / Math.sqrt(sxx * syy) : 0]);
      pl = pr = sxy = sxx = syy = 0;
      this.blocks = 0;
    }
    this.peak[0] = pl; this.peak[1] = pr;
    this.xy[0] = sxy; this.xy[1] = sxx; this.xy[2] = syy;
    return true;
  }
}

registerProcessor('fix-preview', FixPreview);
