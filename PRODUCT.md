# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: plain HTML, CSS and JavaScript (ES modules) with no build step and no framework, plus one vendored media library for reading and writing video containers. Deployed as a static site on GitHub Pages. Chosen so anyone can read, fork and host it without installing tooling.

## Users

ASMR artists who record on their phones, mainly iPhones (the first known user records on an iPhone 17), and who want immersive "3D" sound. They are creators, not audio engineers. They use the tool on a phone right after recording and on a computer while editing, with equal priority.

## Product Purpose

A free, open-source tool that fixes the audio problems phone recordings cause for ASMR. The artist picks a video or audio file, the tool checks the audio and the picture, applies the right fixes in one click, lets them hear before and after, and saves a fixed file. The picture is copied untouched unless the artist asks for the TikTok & Reels version, which re-encodes it.

The trigger case: an iPhone 17 user reported that back-camera recordings came out with left and right swapped. The research in `reports/` found that this is almost always the camera's point of view, which is correct for viewers, so the app checks the sides against the picture before swapping.

Success means an artist with no audio knowledge gets a fixed, upload-ready file in a few minutes, on any device, without installing anything or uploading their recording anywhere.

## Positioning

Everything runs on the artist's own device inside the browser: no upload, no account, no cost. Processing is chosen to keep quiet, non-voice ASMR triggers intact, which general speech-cleanup tools are not built for.

## Operating Context

- Recordings come from the iPhone Camera app or other recording apps, then go into editors and to platforms such as YouTube, TikTok and Instagram.
- Files can be long and large (high-resolution, possibly HDR video).
- The tool is opened in Safari on iPhone or in desktop browsers, from a GitHub Pages link.

## Capabilities and Constraints

- Static hosting only: no server, no backend processing.
- Must open iPhone video files (.MOV/.MP4), other common video (MKV, WebM) and audio files (WAV, AIFF, CAF, M4A, MP3, FLAC, Ogg, Opus; Apple Lossless where the browser can decode it).
- Must work on every current browser on phones and computers. Where a browser lacks an encoder or file storage, the app falls back to what it can do and says so, never fails silently.
- One default action fixes the common problems; other options stay optional.
- License: MIT. Fix list: side check and swap (with a snap check and an automatic picture check that only suggests), silent or cancelling sides, rumble, mains hum, hiss, volume, 3D width or mono widening, tone (warmth, clarity, air), softening harsh S sounds, trim, sound sync, rotate and mirror. Detection-only notes: distortion, auto-gain pumping, Bluetooth-mic sound, Voice Isolation gaps, frame-rate drops, very dark picture, Spatial Audio, rotation after filming.
- Save as: same format with lossless sound, a smaller MP4 with AAC, or a TikTok & Reels MP4 (H.264, steady frame rate, HDR converted to SDR).
- Works offline after the first visit (service worker). Style settings are remembered on the device.

## Brand Commitments

Name: Fix My ASMR. The mark is two small pads, blue and red, with a dot on the left one (`assets/icon.svg`).

## Evidence on Hand

None yet: no users, testimonials, measurements or benchmarks. The research report is in `reports/`. Do not invent usage numbers, quality claims or endorsements.

## Product Principles

- Private by default: recordings never leave the device.
- One obvious action: the default fix should suit most recordings without settings.
- Do no harm to triggers: never remove quiet sounds silently; always offer a before/after listen.
- Leave the picture alone unless asked: only the TikTok & Reels choice re-encodes it.
- Plain words: explain problems and fixes without audio jargon.
