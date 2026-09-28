# ClearHear Web

Browser-based personal listening aid. Phone mic → AI noise suppression → speech clarity chain → headphones. All on-device.

## Status

Sprint 1–2 skeleton (per `../implemton.md`):

- Vite + Preact + TS, PWA plugin, dark UI
- Mic capture with browser processing disabled, 48 kHz AudioContext
- Clarity worklet: HPF/LPF, 2.5 kHz peak, 3.5 kHz shelf, 6-band profile EQ, gate, compressor, limiter, balance
- Model loader interface for Off / Gate / Speex / RNNoise / GTCRN (dynamic import from `@sapphi-red/web-noise-suppressor`)
- Wet/dry mix with delay-compensated dry path, live model crossfade
- Listen screen: Start/Stop, presets, model chips, meters, sliders, mic/output pickers
- Hearing test flow (per-ear tones, half-gain fitting) + IndexedDB profiles
- Vitest unit tests for DSP and fitting

## Dev

```
cd clearhear-web
npm install
npm run dev
```

HTTPS is required for `getUserMedia` on real phones — use a tunnel (Cloudflare / ngrok) or deploy the built site.

## Deploy

Static host with the headers in `public/_headers`. Netlify / Cloudflare Pages work out of the box.

## Not medical advice

ClearHear is an assistive listening aid, not a hearing aid or medical device.
