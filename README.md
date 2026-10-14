# Fix My ASMR

A free, open-source tool that fixes the sound of ASMR recorded on a phone. It checks whether left and right match the picture, lowers hiss, removes rumble and mains hum, and evens out the volume. Then it saves a new copy. The picture is copied as it is, unless you ask for a version made for TikTok and Reels. Everything runs in your browser, on your own device, and nothing is uploaded.

Open the app: https://pavangupta352.github.io/fix-my-asmr/

## What it does

- The side check plays a moment where a sound happens on one side, so you can compare it with the picture. If the take starts with a finger snap, it plays the snap first. One tap swaps left and right when they disagree.
- An automatic picture check looks at small frames before and during the strongest one-sided sounds and reports whether the movement was on the same side as the sound. It only suggests; you decide.
- A dead channel is filled from the working one, and flipped polarity is fixed.
- A gentle 35 Hz cut removes table thumps and handling noise and keeps deep taps.
- Mains hum at 50 or 60 Hz is found and notched out along with its overtones.
- Hiss reduction learns the background from your quietest moments and lowers it by 6 to 12 dB. It is tuned to leave whispers, crinkles and mouth sounds alone, which speech-cleanup AI tends to remove.
- Volume is measured the broadcast way (ITU-R BS.1770) and brought to about −26 LUFS. In a sample of 35 popular ASMR videos the median was −31, and YouTube never turns quiet videos up. The tool holds back if the loudest taps would get squashed.
- 3D width spreads high sounds a little wider. For recordings that are almost mono, a widening option adds space to the highs instead, and a phone speaker plays them exactly as before.
- Some problems can only be pointed out, each with the setting that prevents it next time: distortion, auto-gain pumping, muffled sound from AirPods or another Bluetooth mic, the silent gaps Voice Isolation leaves, frame-rate drops from Auto FPS, a very dark picture, a Spatial Audio track, and a video rotated after filming.

"Adjust everything" opens every control: tone (warmth, clarity and air), softening harsh S sounds, how much counts as hiss, levels per side, trimming the start and end (including "Start after the snap"), moving the sound up to 250 ms against the picture, and rotating or mirroring the picture. Turning the picture upside down or mirroring it swaps the sound too, so the two keep matching. Style choices such as volume, tone and file type are remembered for the next recording.

## Saving

| Save as | What you get |
|---|---|
| Same format | The picture copied as it is, in the same kind of file (MOV, MKV or WebM), with lossless sound. Best for editing. |
| Smaller MP4 | The picture copied as it is, with high-quality AAC sound. Close to the original size. |
| TikTok & Reels | A standard H.264 MP4 with a steady frame rate, sized for phones. HDR is converted so it doesn't look washed out, and any rotation or mirroring is built into the picture. Takes longer. |

Audio files save as M4A or WAV. iPhone Dolby Vision information and the original capture date are kept, so the fixed copy sorts next to the original in Photos.

## Is an iPhone recording really flipped?

Usually not. An iPhone records stereo from the camera's point of view. With the back camera facing you, your right hand appears on the left of the picture and is heard in the left ear. That's correct for viewers, and binaural ASMR mics follow the same rule. It only feels flipped if you think of it as your own right.

Real swaps happen when a video shot flat or overhead is rotated in an editor afterwards, when the picture is mirrored, when a recording app sets its stereo direction wrong, or with an external stereo mic. The side check tells you which case you're in. The [research report](reports/iPhone%2017%20ASMR%20audio%20issues.md) explains why, with sources.

## Using it

1. Open [the app](https://pavangupta352.github.io/fix-my-asmr/) in a browser.
2. Choose a video or audio file, or drop it on the page.
3. Read what it found, play the side check, and listen to Before and After.
4. Pick how to save it and tap Fix and save.

On iPhone, save the video to Files first (in Photos, tap Share, then Save to Files) and choose it from Files in the app. iOS converts videos picked straight from the photo library into a lower-quality copy. When the fix is done, tap Save to Photos or share, then Save Video. To keep the app one tap away, tap Share, then Add to Home Screen. After the first visit it also works offline.

Long 4K videos work, because the app streams the file from disk instead of loading it into memory. Keep the tab open while it saves.

## Files and browsers

It opens MOV, MP4, M4V, MKV and WebM video, and WAV, AIFF, CAF, M4A, MP3, AAC, FLAC, Ogg and Opus audio. Apple Lossless opens in Safari and on iPhone. AVI files and videos with Dolby Digital sound need converting first; the app says so.

Tested in Chrome and Safari 27 on a Mac, Safari on the iOS 26.5 iPhone 17 simulator, and in the Firefox 157 and WebKit 27 builds that Playwright ships. Other iPhone browsers, Chrome included, normally run on Safari's engine. Not tested yet on a real iPhone, on Windows or on Android; those use the same browser features, and the app checks each one before relying on it.

Where a browser can't do something, the app falls back instead of failing:

- Firefox can't make AAC sound, and neither can some Linux browsers, so only the lossless choices (same format, WAV) are offered there.
- Safari's H.264 encoder can stall in its default profile. The app checks for that once and, if needed, makes the TikTok & Reels version in Constrained Baseline, which plays everywhere.
- If an encoder fails partway, the save steps down to the next format and says so.
- Private browsing and the in-app browsers inside Instagram and TikTok may have no private file storage. The fixed copy is then built in memory, which suits shorter clips best.
- Browsers that can't play the video (HEVC in Firefox, for example) still fix and save it, just without a preview.

## Record better next time

The app shows the full list with its results. For iPhone on iOS 26 and 27:

- Settings, Camera, Record Sound: Stereo. Spatial Audio adds an Apple-only track that many editors mishandle.
- Turn Wind Noise Reduction and Audio Zoom off, and use Mic Mode Wide Spectrum or Standard, never Voice Isolation.
- Settings, Camera, Record Video: Auto FPS off and Lock Camera on, so the frame rate stays steady and the lens doesn't switch when your hands come close. Turn Macro Control on and tap the macro button off for close work.
- Film in landscape on a stand with rotation lock on, and don't turn the phone mid-take.
- Snap with your arm out to your right at the start of each take, so checking sides takes seconds.
- Keep loud triggers a hand's width from the phone. Distortion can't be fixed afterwards.
- For real 3D sound, use a binaural mic. Phone stereo has no ears between its mics.

## How it works

- [Mediabunny](https://mediabunny.dev) reads and writes the file in a Web Worker. For Same format and Smaller MP4, video packets are copied untouched and only the audio is decoded, processed and written again.
- The audio processing in [dsp.js](dsp.js) is plain JavaScript with no dependencies. It works block by block, so memory stays small however long the recording is. The same code runs in an AudioWorklet for the live Before/After preview, so what you hear is what gets saved. With neutral settings the output matches the input bit for bit.
- Browser AAC encoders add a short delay at the start (2112 samples on Apple's). The app measures it by encoding and decoding a test burst, then writes an edit list, so AAC files stay in sync in Apple's players and in FFmpeg-based tools alike.
- Trims and sync moves are checked against test clips with clicks and flashes; sound and picture land on the same sample in FFmpeg and in Apple's decoder.
- The picture check and frame-rate check read only a few small frames and the packet timestamps, so they take a second or two even on long videos.
- AIFF and uncompressed CAF are read straight from the file in blocks. Apple Lossless goes through the browser's own decoder.
- Mediabunny drops iPhone Dolby Vision (`dvvC`) and ambient viewing (`amve`) metadata. After writing, the app copies those boxes and the capture date back into the file.
- Output goes straight to a file you pick in Chrome. Other browsers write it to private storage first, or to memory, then hand it to Download or the share sheet.
- iPhone Spatial Audio tracks use Apple's APAC codec, which nothing outside Apple can decode. The fixed copy keeps the regular stereo track, the one editors and apps play.
- A service worker keeps a copy of the app for offline use. It fetches from the network first, so updates arrive on the next visit.

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
