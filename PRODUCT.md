# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: plain HTML, CSS and JavaScript (ES modules) with no build step and no framework, plus one vendored media library for reading and writing video containers. Deployed as a static site on GitHub Pages. Chosen so anyone can read, fork and host it without installing tooling.

## Users

ASMR artists who record on their phones, mainly iPhones (the first known user records on an iPhone 17), and who want immersive "3D" sound. They are creators, not audio engineers. They use the tool on a phone right after recording and on a computer while editing, with equal priority.

## Product Purpose

A free, open-source tool that fixes the audio problems phone recordings cause for ASMR. The artist picks a video or audio file, the tool checks the audio, applies the right fixes in one click, lets them hear before and after, and saves a fixed file. Video stays untouched; only the audio changes.

The trigger case: an iPhone 17 user reports that back-camera recordings come out with left and right swapped. The full list of fixes depends on the research in `reports/`.

Success means an artist with no audio knowledge gets a fixed, upload-ready file in a few minutes, on any device, without installing anything or uploading their recording anywhere.

## Positioning

Everything runs on the artist's own device inside the browser: no upload, no account, no cost. Processing is chosen to keep quiet, non-voice ASMR triggers intact, which general speech-cleanup tools are not built for.

## Operating Context

- Recordings come from the iPhone Camera app or other recording apps, then go into editors and to platforms such as YouTube, TikTok and Instagram.
- Files can be long and large (high-resolution, possibly HDR video).
- The tool is opened in Safari on iPhone or in desktop browsers, from a GitHub Pages link.

## Capabilities and Constraints

- Static hosting only: no server, no backend processing.
- Must open iPhone video files (.MOV/.MP4) and common audio files.
- Must work on iPhone Safari and on current desktop browsers.
- One default action fixes the common problems; other options stay optional.
- Undecided: exact fix list (pending research), license, offline/installable support.

## Brand Commitments

Name: Fix My ASMR (delegated choice; matches the project folder). No voice, logo or other identity assets exist yet.

## Evidence on Hand

None yet: no users, testimonials, measurements or benchmarks. Research notes and a report live in `research_notes/` and `reports/`. Do not invent usage numbers, quality claims or endorsements.

## Product Principles

- Private by default: recordings never leave the device.
- One obvious action: the default fix should suit most recordings without settings.
- Do no harm to triggers: never remove quiet sounds silently; always offer a before/after listen.
- Leave the picture alone: only the audio is changed.
- Plain words: explain problems and fixes without audio jargon.
