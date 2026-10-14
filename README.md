# Fix My ASMR

A free, open-source tool that fixes the sound of ASMR recorded on a phone. It swaps left and right when they're wrong, lowers hiss, removes rumble and mains hum, and evens out the volume, then saves a new copy with the picture untouched. It runs in your browser, on your own device, and never uploads anything.

**Open the app: https://pavangupta352.github.io/fix-my-asmr/**

## What it does

- A side check plays a moment where a sound happens on one side, so you can compare it with the picture. If they disagree, one tap swaps left and right.
- A dead channel gets filled from the working one, and flipped polarity gets fixed.
- A gentle 35 Hz cut removes table thumps and handling noise and keeps deep taps.
- Mains hum at 50 or 60 Hz is found and notched out along with its overtones, and nothing else.
- Hiss reduction learns the background from your quietest moments and lowers it by 6 to 12 dB. It's tuned to leave whispers, crinkles and mouth sounds alone, which speech-cleanup AI tends to remove.
- Volume is measured the broadcast way (ITU-R BS.1770) and brought to about −26 LUFS. In a sample of 35 popular ASMR videos the median was −31, and YouTube never turns quiet videos up. The tool holds back if the loudest taps would get squashed.
- An optional 3D width setting spreads high sounds a little wider for more ear-to-ear feel. The mono sum stays the same.
- Some problems can only be pointed out: distorted moments, auto-gain pumping, an almost-mono recording, a Spatial Audio track, and a video rotated after filming. Each one comes with the setting that prevents it next time.
- You can rotate or mirror the picture without re-encoding it. Turning it upside down or mirroring it swaps the sound too, so the two keep matching.

The defaults suit most recordings, and "Adjust everything" opens every control.

## Is an iPhone recording really flipped?

Usually not. An iPhone records stereo from the camera's point of view. With the back camera facing you, your right hand appears on the left of the picture and is heard in the left ear. That's correct for viewers, and binaural ASMR mics follow the same rule. It only feels flipped if you think of it as your own right.

Real swaps happen when a video shot flat or overhead is rotated in an editor afterwards, when the picture is mirrored, when a recording app sets its stereo direction wrong, or with an external stereo mic. The side check in the app tells you which case you're in. The [research report](reports/iPhone%2017%20ASMR%20audio%20issues.md) explains why, with sources.

## Using it

1. Open [the app](https://pavangupta352.github.io/fix-my-asmr/) in a browser.
2. Choose a video or audio file, or drop it on the page.
3. Read what it found, play the side check, and listen to Before and After.
4. Tap Fix and save. Video comes out as MOV with the original picture and uncompressed, sample-exact audio. Audio-only files come out as M4A or WAV.

On iPhone, save the video to Files first (in Photos, tap Share, then Save to Files) and choose it from Files in the app. iOS converts videos picked straight from the photo library into a lower-quality copy. When the fix is done, tap Save to Photos or share, then Save Video.

Hour-long 4K videos work, because the app streams the file from disk instead of loading it into memory. Keep the tab open while it saves.

## Browser support

| Works | Doesn't work |
|---|---|
| iPhone and iPad on iOS 26 or newer (any browser) | iOS 18 and older |
| Chrome and Edge 94+ on desktop and Android | Firefox on Android |
| Safari 26+ on Mac, Firefox 130+ on desktop | |

Firefox and Linux browsers can't encode AAC, so audio-only files save as WAV there. Browsers that can't play HEVC video (Firefox, some Edge setups) still fix and save the file, just without a video preview.

## Record better next time

The app shows these with its results. For iPhone on iOS 26 and 27:

- Set Settings, Camera, Record Sound to Stereo. Spatial Audio adds an Apple-only track that many editors mishandle.
- Turn Wind Noise Reduction and Audio Zoom off.
- Use Mic Mode Wide Spectrum or Standard, never Voice Isolation.
- Film in landscape on a stand with rotation lock on, and don't turn the phone mid-take.
- Snap with your arm out to your right at the start of each take, so checking sides takes seconds.
- Keep loud triggers a hand's width from the phone. Distortion can't be fixed afterwards.
- For real 3D sound, use a binaural mic. Phone stereo has no ears between its mics.

## How it works

- [Mediabunny](https://mediabunny.dev) reads and writes the file in a Web Worker. Video packets are copied as they are; only the audio track is decoded, processed and written again.
- The audio processing in [dsp.js](dsp.js) is plain JavaScript with no dependencies. It works chunk by chunk, so memory stays small however long the recording is. The same code runs in an AudioWorklet for the live Before/After preview, so what you hear is what gets saved.
- Video output uses PCM audio in MOV. Re-encoded AAC from browsers lands 44 ms late in FFmpeg-based tools because no edit list is written, while PCM is exact everywhere.
- Mediabunny drops iPhone Dolby Vision (`dvvC`) and ambient viewing (`amve`) metadata, and Apple warns that HDR clips then look too bright on Apple devices. After writing, the app copies those boxes and the original capture date back into the file.
- Output goes straight to a file you pick in Chrome. Safari and Firefox write it to the browser's private storage first, then hand it to Download or the share sheet.
- iPhone Spatial Audio tracks use Apple's APAC codec, which nothing outside Apple can decode. The fixed copy keeps the regular stereo track, the one editors and apps play.

## Run it locally

It's a static site with no build step. Serve the folder with any web server:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. Run the audio-engine checks with Node:

```sh
node test/dsp.test.mjs
```

## Host your own copy

Fork the repository, then in GitHub go to Settings, Pages, and deploy from the `main` branch, root folder. The site needs no special headers.

## License

MIT, see [LICENSE](LICENSE). Mediabunny is included unmodified in `vendor/` under the Mozilla Public License 2.0 ([vendor/mediabunny.LICENSE](vendor/mediabunny.LICENSE)). The Barlow typeface in `assets/fonts/` is under the SIL Open Font License ([assets/fonts/OFL.txt](assets/fonts/OFL.txt)).
