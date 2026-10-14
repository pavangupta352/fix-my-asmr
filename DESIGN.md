---
name: Fix My ASMR
description: Molded L and R earcup pads on a graphite soft-touch ground; a browser tool that fixes phone-recorded ASMR audio.
colors:
  ground: "#222222"
  ground-2: "#2a2a2a"
  ground-3: "#333333"
  line: "#3a3a3a"
  line-2: "#525252"
  text: "#efefef"
  text-2: "#b0b0b0"
  text-3: "#959595"
  key-ink: "#1c1c1c"
  focus: "#f4f5f7"
  l: "#2b52d1"
  l-lo: "#2246b8"
  l-hi: "#4c71ea"
  l-lit: "#a8dcff"
  l-ink: "#dfe7ff"
  l-sig: "#7ea8ff"
  r: "#c8452e"
  r-lo: "#ad3a25"
  r-hi: "#e2614a"
  r-lit: "#ffcdbf"
  r-sig: "#ff8b74"
  both: "#c4a3ff"
typography:
  pad-letter:
    fontFamily: "Barlow, sans-serif"
    fontSize: "about 70% of pad height (up to 112% in the short band), never wider than 84% of the pad"
    fontWeight: 800
    lineHeight: 1
  display:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(28px, 3.4vw, 40px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(24px, 3vw, 34px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.12
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "tnum"
  body-small:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  caption:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.08em"
  stamp:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.08em"
rounded:
  plate: "6px"
  field: "10px"
  control: "12px"
  seg-inner: "9px"
  seg: "13px"
  panel-sm: "14px"
  key: "16px"
  panel: "18px"
  pad-band: "22px"
  pad: "clamp(26px, 3.4vw, 44px)"
  pill: "99px"
spacing:
  gutter: "clamp(16px, 3.4vw, 40px)"
  max: "1240px"
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "18px"
  xl: "clamp(20px, 3vw, 40px)"
components:
  button-primary:
    backgroundColor: "{colors.text}"
    textColor: "{colors.key-ink}"
    rounded: "{rounded.key}"
    padding: "0 22px"
    height: "56px"
    typography: "18px / 700"
  button-ghost:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.ground-3}"
  button-ghost-small:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
    typography: "14px / 600"
  button-round:
    backgroundColor: "{colors.text}"
    textColor: "{colors.key-ink}"
    rounded: "{rounded.pill}"
    size: "52px"
  seg-track:
    backgroundColor: "{colors.ground-3}"
    rounded: "{rounded.seg}"
    padding: "4px"
  seg-option:
    textColor: "{colors.text-2}"
    rounded: "{rounded.seg-inner}"
    padding: "0 14px"
    height: "38px"
  seg-option-checked:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ground}"
  switch:
    backgroundColor: "{colors.ground-3}"
    rounded: "{rounded.pill}"
    width: "50px"
    height: "30px"
  switch-on:
    backgroundColor: "{colors.text}"
  chip-l:
    backgroundColor: "{colors.l}"
    textColor: "{colors.l-ink}"
    rounded: "{rounded.pill}"
    padding: "0 11px"
    height: "26px"
  chip-r:
    backgroundColor: "{colors.r}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0 11px"
    height: "26px"
  stamp-engaged:
    backgroundColor: "{colors.text}"
    textColor: "{colors.key-ink}"
    rounded: "{rounded.plate}"
    padding: "7px 9px 6px"
  stamp-off:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.plate}"
    padding: "7px 9px 6px"
  stamp-cue:
    backgroundColor: "{colors.ground-3}"
    textColor: "{colors.text}"
    rounded: "{rounded.plate}"
    padding: "7px 9px 6px"
  stamp-note:
    backgroundColor: "{colors.ground-3}"
    textColor: "{colors.text}"
    rounded: "{rounded.plate}"
    padding: "7px 9px 6px"
  panel:
    backgroundColor: "{colors.ground-2}"
    rounded: "{rounded.panel}"
    padding: "18px 20px"
  select:
    backgroundColor: "{colors.ground-2}"
    rounded: "{rounded.field}"
    padding: "0 34px 0 12px"
    height: "40px"
---

# Design System: Fix My ASMR

## Overview

**Creative North Star: "Molded L / R"**

The L and R that every listener checks before pressing play are the interface. Two earcup pads, cobalt on the left and vermilion on the right, sit on a neutral graphite ground like a pair of soft-touch headphones laid on a desk. Their letters are debossed at monumental scale and lit by a single light source through real height-map lighting, so the relief comes from light falling on a shape and never from painted bevels. Everything else on the page (the file, the player, the fix list, the reading sections) is quiet graphite and one family of type, so the pads keep the colour and the attention.

The system is dark only, chosen from the use scene: artists open it late at night next to recording rooms and editing tools. The ground carries a fixed 7% fractal-noise grain so it reads as a material. Depth is tactile: molded keys you press, plates that stand up when a setting is engaged and sink in when it is off. Motion is rare and physical. The pads are the ears and never move; when the recording is re-routed, the small "recorded left / recorded right" tags under them trade places.

It refuses the dark DAW with a neon waveform and the pastel moon-and-clouds "sleepy ASMR" page.

**Key Characteristics:**
- Two molded pads (cobalt L, vermilion R) are the hero and, once a file loads, a sticky meter band.
- Lit SVG relief (feDiffuseLighting and feSpecularLighting on height maps) for every molded surface.
- Neutral graphite ground with a fixed 7% grain; dark only.
- One family, self-hosted Barlow 400 to 800, on one grid.
- Channel colour discipline: blue means left, red means right, purple means sound both share.
- Tags trade places; pads never move.

## Colors

A neutral graphite field with two saturated channel colours, each carrying its own lit and signal tints, and one shared-sound purple.

### Primary
- **Cobalt Left** (l): the left pad's molded body, the left route tag, the brand mark's left cup, text selection. Darker and lighter steps (l-lo, l-hi) are reserved for the same material.
- **Vermilion Right** (r): the right pad's molded body, the right route tag, the brand mark's right cup.

### Secondary
- **Sky Lit** (l-lit): the left meter, painted into the debossed L under the same light so the letter fills with level while its walls keep their shading.
- **Coral Lit** (r-lit): the right meter, painted into the debossed R the same way.
- **Left Signal** (l-sig) and **Right Signal** (r-sig): the timeline waveform halves (L above the centre line, R below), inline channel words in prose, and (r-sig only) the error border and the "Can't fix" stamp text.
- **Cobalt Ink** (l-ink): text on the left route tag and the tactile dot in the brand mark.

### Tertiary
- **Shared Purple** (both): only for sound both channels carry. It fills the core of the timeline waveform and rises inside both pad letters as the shared-level meter.

### Neutral
- **Graphite Ground** (ground): page background, the socket's recessed ring, the sticky band and save bar backing, text on light keys' inverse states.
- **Raised Graphite** (ground-2) and **Upper Graphite** (ground-3): panels, timeline, ghost buttons, segmented track, switch track, off and cue plates. Tonal layering, not borders, separates them from the ground.
- **Seam** (line) and **Edge** (line-2): row dividers and control borders, the waveform's centre line.
- **Chalk** (text): primary text and the molded light-key material (pick, Fix and save, Share, Play), engaged plates, checked segments, switch-on, timeline playhead and distortion marks, and the side card's Picture check hint (one step brighter than the Ash instructions above it).
- **Ash** (text-2) and **Smoke** (text-3): secondary copy, 14px captions, ear names, slider read-outs and trim times, the 1px inner edge of the timeline trim shading; quiet placeholders.
- **Key Ink** (key-ink): text and icons on chalk keys and engaged plates. Set as a literal in the stylesheet, not a custom property.
- **Focus White** (focus): the 2.5px focus outline everywhere.

### Named Rules
**The Ears Rule.** Blue is left and red is right, everywhere: pads, tags, waveform, inline words. A channel colour never decorates anything that is not that channel.

**The Shared Purple Rule.** Purple appears only where both channels carry the same sound (waveform core and pad meters). It is never an accent, a link, or a state colour.

**The Quiet Ground Rule.** Outside the pads and route tags, the interface is graphite and chalk. Engaged and checked states use chalk inversion, not a channel colour.

## Typography

**Display Font:** Barlow (self-hosted woff2, weights 400, 500, 600, 700, 800; fallback ui-sans-serif, system-ui, Segoe UI, Roboto, sans-serif)
**Body Font:** Barlow
**Label/Mono Font:** Barlow, with tabular numerals set globally

**Character:** One grotesque family with a slight engineered squareness, the kind molded into hardware. Weight carries the hierarchy; size steps stay modest so the pad letters remain the only monumental type.

### Hierarchy
- **Pad letter** (800, sized to the pad): the debossed L and R, rendered in SVG inside the relief, never as live HTML text.
- **Display** (700, clamp(28px, 3.4vw, 40px), 1.12, -0.01em): reading-section headings.
- **Headline** (700, clamp(24px, 3vw, 34px), 1.12, -0.01em, max 30ch): the one plain sentence under the pads in the empty state. File names use a smaller step (700, clamp(20px, 2.2vw, 26px)), truncated with an ellipsis.
- **Title** (700, 17 to 22px): panel headings, reading sub-heads and the Sound, Picture and Habits tip group heads (19px); fix names, the Adjust summary and the Save as heading (17px); done heading (22px).
- **Body** (400, 17px, 1.55): running copy, capped at 66ch in reading sections. Secondary copy steps to 15px in Ash.
- **Caption** (400, 14px, 1.55, Ash): notes under Adjust groups, the Save as note (capped at 60ch), the save-bar note, the numbered distortion list, slider read-outs, compact ghost labels (at 600) and the footer.
- **Label** (600 to 700, 13px, 0.08em, uppercase): ear names under the pads, Adjust group headings (Sides, Clean-up, Tone, Level and width, Timing, Picture), the audio-only placeholder.
- **Stamp** (700, 11.5px, 0.08em, uppercase, line-height 1): text on state and setting plates.

### Named Rules
**The One Family Rule.** Barlow sets everything: letters, captions, buttons, canvas labels. No second face.

**The Monument Rule.** Only the pad letters are monumental. Page headings stay at or below 40px.

## Layout

A centred column capped at 1240px with a fluid gutter (clamp(16px, 3.4vw, 40px)). The empty state gives the pads 56vh (clamp 280 to 600px) as two equal columns with a 14px seam, and a round socket on the seam holds the primary action. Once a file loads, the stage becomes a sticky band at the top (pads 84 to 128px tall, 10px seam) with the ear names and route tags beneath, on a full-bleed ground and grain backing.

The work area below is a 7:5 desk: media, transport and timeline on the left (sticky under the band), side check, fix list, the Adjust disclosure and the Save as choice on the right, in that order, with a sticky save bar at the bottom of that column. Reading sections use two columns that collapse to one at 860px. The tips run as three grouped lists (Sound, Picture, Habits), two columns each, every group under its own heading with 34px above it. The footer is a short stack of 14px Ash lines above a 1px Seam; the line about working offline carries an Add to Home Screen hint that only iOS shows. At 640px the nav hides, the pads grow taller (clamp 340 to 520px) and the socket drops to straddle the pads' bottom edge.

Spacing is a small working set: 4, 8, 10, 14, 16, 18px for internal gaps and padding, with fluid section spacing from clamp(20px, 3vw, 40px) to clamp(56px, 9vh, 96px). Hit targets are at least 44px except compact ghost buttons (36px) and timeline marks (24px).

## Elevation & Depth

Depth is molded, then lit. Pads, the socket, the pick and the light keys are SVG height maps run through feDiffuseLighting and feSpecularLighting with one distant light (azimuth 235, elevation 52) and fine fractal-noise grain, so letters press in, the tactile dot stands up, and the faces carry a soft-touch sheen. State and setting plates use two shared filters from the same light: raised (+3.2) when engaged, pressed (-3.2) when off. Under the molded objects sit soft, diffuse drop shadows that read as the object resting on the desk; flat panels use tonal layering and no shadow.

### Shadow Vocabulary
- **Pad rest** (`box-shadow: 0 18px 32px -20px rgb(0 0 0 / 0.8)`): under each pad.
- **Key rest** (`box-shadow: 0 12px 22px -14px rgb(0 0 0 / 0.9)`): under the primary key; pressed shrinks to `0 6px 12px -10px`.
- **Round key** (`box-shadow: 0 8px 14px -8px rgb(0 0 0 / 0.8)`): play button.
- **Pick lift** (`filter: drop-shadow(0 8px 10px rgb(0 0 0 / 0.45))`): the socket pick; pressed shrinks to `0 3px 4px`.
- **Tag and segment** (`0 4px 8px -4px rgb(0 0 0 / 0.6)`, `0 2px 5px -1px rgb(0 0 0 / 0.55)`): route tags and the checked segment.
- **Socket ring** (`box-shadow: 0 0 0 9px var(--ground)`): a ground-coloured moat that cuts the socket out of the pads.

### Named Rules
**The Real Light Rule.** Relief comes from lighting a height map. No CSS bevels, inset highlight stacks, or text-shadow embossing.

**The Raised-Engaged Rule.** A plate stands up when its setting is on or applied and sinks in when it is off or not needed.

## Shapes

Soft, molded corners throughout, scaled to the object: pads round at clamp(26px, 3.4vw, 44px) (22px in the band), keys 16px, controls 12px, panels 14 to 18px, plates 6px. Circles mark the things you press with a thumb (socket, pick, play, timeline marks) and pills mark tags and switches. Borders are 1.5px Edge on ghost controls only; dividers are 1px Seam. The brand mark is two 6px-rounded cups with a dot on the left one, the pads in miniature.

## Components

### Buttons
Tactile and quiet; the only bright surfaces are molded chalk keys.
- **Shape:** keys 16px (primary), controls 12px, play is a 52px circle.
- **Primary (molded key):** chalk face rendered as lit relief, Key Ink text 18px/700, 56px tall, full width. Used for "Fix and save video", Share, and (as the round variant) Play.
- **Hover / Active:** lift 1px on hover, press 2px down on active with the shadow shrinking; 140ms on the shared ease. Disabled at 45% opacity.
- **Ghost:** Raised Graphite with a 1.5px Edge border, 44px, 16px/600; hover moves to Upper Graphite and a Smoke border; active presses 1px. The compact size (36px, 14px/600, 12px side padding) carries in-panel actions: Set to playhead, Start after the snap, Keep the whole recording, and Reset to recommended settings, which sits left-aligned at the end of the Adjust panel. Several compact ghosts share a wrapping row with 8px gaps.

### Chips (route tags)
- **Style:** pills 26px tall, 13px/700, cobalt with Cobalt Ink text for recorded left, vermilion with white text for recorded right, soft tag shadow.
- **State:** they sit under the ear names and trade slots when the sound is swapped.

### Segmented control and switch
- **Segmented:** Upper Graphite track (13px radius, 4px padding), 38px options in Ash; checked option inverts to chalk with ground text. It carries the fix-row presets (hiss, volume, 3D width or Almost mono) and the Save as choice.
- **Switch:** 50x30 pill, Upper Graphite with Edge border; on, it fills chalk and the knob turns ground, sliding 20px in 180ms.

### Cards / Containers
- **Corner Style:** 14 to 18px.
- **Background:** Raised Graphite on the ground.
- **Shadow Strategy:** none; tonal layering only.
- **Border:** none, except the error notice (1.5px Right Signal).
- **Internal Padding:** 18px 20px.

### Inputs / Fields
- **Select:** 40px, 10px radius, 1.5px Edge border, Raised Graphite, drawn chevron in Ash.
- **Range:** native slider tinted chalk via accent-color, 28px hit height, spanning the row under its label. The value reads out at 14px in Ash on the right of the label and is mirrored to aria-valuetext in the same words.
- **Focus:** 2.5px Focus White outline, 2 to 3px offset, on every interactive element including the timeline wrapper.

### Navigation
- **Style:** brand mark plus wordmark (18px/700) on the left, text links at 15px in Ash on the right; hover turns chalk and underlines. Hidden below 640px.

### Stamps (state and setting plates)
Small lit plates carrying 11.5px uppercase text. Engaged states (Fixing, Fixed, recommended Set values) are raised chalk plates with Key Ink text; Off and Not needed are pressed Raised Graphite plates with Ash text; cue tips and Note stamps (conditions with nothing to switch, such as complete silence between sounds, a dropped frame rate or a very dark picture) are raised Upper Graphite plates; "Can't fix" (distortion, Bluetooth-muffled sound) uses Right Signal text. A changed state re-presses with a 220ms scale from 1.12 to 1.

### Side check panel
A Raised Graphite panel (18px radius, 18px 20px padding, 10px gaps): a 19px heading, the instruction in 15px Ash, then, when the picture gave an answer, a second paragraph in Chalk led by a bold "Picture check:" label. A ghost button below plays the moment; its label follows the state ("Play the snap", "Play a side check", "Play another check"). The answer choices are ghost buttons, and the chosen one inverts to chalk.

### Fix list
Rows divided by 1px Seam with 16px vertical padding: the 17px/700 name on the left, its stamp top-right, a 15px Ash explanation, and the control on a full-width line below (a switch pushed right, or a segmented preset). On near-mono files an "Almost mono" row with Off, Subtle and Strong replaces 3D width. Rows that only report a condition carry a stamp and no control.

### Adjust panel
A disclosure under a 1px Seam with a 17px/700 summary and a drawn Ash chevron that turns over 180ms. Groups sit 18px apart (Sides, Clean-up, Tone, Level and width, Timing, and Picture for video), each led by a Label heading with 12px between rows. A row puts the 15px/600 label on the left and the control or read-out on the right; sliders span the full width beneath. Level and width shows a single width slider, mono widening or 3D width depending on the file. Timing pairs Start and End, each with its time in 500 Ash, with a compact Set to playhead button, then a wrapping row of compact actions and the Sound sync slider. Captions close a group at 14px in Ash.

### Save as
Between the Adjust panel and the save bar, opened by a 1px Seam: a 17px/700 heading, one segmented control and a 14px Ash note (max 60ch) describing the chosen format, all left-aligned with 10px gaps. Video offers Same format, Smaller MP4 and TikTok & Reels; audio offers M4A and WAV; when the browser cannot encode AAC only the lossless choice shows.

### Pads and meter (signature)
Each pad is a lit relief of its channel colour with the letter pressed in (and a raised tactile dot top-left on L). Two overlay layers repeat the same relief with the letter painted in the channel's lit tint and in Shared Purple; they reveal from the bottom by translate as level rises, so the pressed walls keep their shading. A side-check ping flashes a 18% white veil and sweeps the meter over 900ms.

### Timeline
112px, 14px radius, Raised Graphite. L waveform above a 1px Edge centre line, R below, both in signal tints (peaks at 38% opacity, RMS solid), with the shared portion drawn in Shared Purple across the middle. 2px chalk playhead; numbered chalk circles mark distortion. When the recording is trimmed, the cut-off ends are shaded with a dark veil (rgb(12 12 12 / 0.62)) finished by a 1px Ash inner edge where the kept part begins; the shading sits under the playhead and the marks.

### Route swap (signature motion)
When the sound is swapped, the two tags trade slots along separate lanes (16px apart vertically, scaling to 1.06 at the midpoint) over 640ms on cubic-bezier(0.16, 1, 0.3, 1). The pads stay still. Reduced motion skips the animation and only re-slots the tags.

## Do's and Don'ts

### Do:
- Render every molded surface (pads, socket, keys, plates) through the shared lighting in relief.js with the single light at azimuth 235, elevation 52.
- Keep blue for left, red for right and purple only for shared sound, in every view that shows channels.
- Show engaged settings as raised plates and off settings as pressed plates.
- Move the route tags, never the pads, to show re-routing.
- Use cubic-bezier(0.16, 1, 0.3, 1) for state motion (140 to 180ms on controls, 640ms for the swap, 900ms for meter sweeps) and honour prefers-reduced-motion.
- Keep the 7% grain fixed behind everything, including the sticky band.
- Put the note that explains a control's consequence directly under it as a 14px Ash caption (Adjust notes, the Save as note, the save-bar note).

### Don't:
- Don't add a light theme; the system is dark only by use scene.
- Don't fake relief with CSS bevels, inset highlight stacks or text-shadow embossing.
- Don't use purple, cobalt or vermilion as a generic accent, link or state colour.
- Don't introduce a second typeface or set the pad letters as live HTML text.
- Don't use hard offset shadows; shadows under molded objects stay soft and negative-spread.
- Don't drift toward the neon-waveform DAW or the pastel sleepy-ASMR page.
