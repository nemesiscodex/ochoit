# Project: NES 8-Bit Music System Simulator

## Overview

This project is a web-based music playground built on the existing TanStack Start frontend stack in this repository. The goal is to simulate the feel of the Nintendo Entertainment System audio pipeline in a browser, with a clear visual interface and an approachable composition workflow.

The first target is a NES-inspired 5-voice system:

- Voice 1: pulse wave
- Voice 2: pulse wave
- Voice 3: triangle wave
- Voice 4: noise
- Voice 5: PCM sample playback

The app should let a user compose short patterns, play them back in sync, and see each voice's waveform update live while audio is playing.

## Product Vision

Build a browser-based chiptune workstation that feels playful and immediate:

- one row per voice
- visible waveform output for every voice
- a simple sequencer to define what each voice plays
- live transport controls for playback, loop, and tempo
- microphone recording for the PCM voice so a user can capture a short sound and trigger it in the sequence

The initial version should be NES-inspired rather than a perfect hardware emulator. That keeps the first release focused on musical usability while leaving room for a later "authentic mode" with stricter hardware behavior.

The long-term direction should separate two engine modes clearly:

- `Inspired mode`: musical workflow first, friendlier PCM editing, and convenience features that make composition easier
- `Authentic mode`: stricter NES-like channel limits, rate-based DPCM behavior, and hardware-oriented terminology

## Core Experience

The intended user flow is:

1. Open the app and initialize audio.
2. Enter notes or triggers for each of the five voices.
3. Press play and hear a looping 8-bit pattern.
4. Watch each voice waveform animate in real time.
5. Record a short PCM sample and place it on the sample lane.
6. Copy a shareable link and reopen the same song state from the URL.

## Main Systems

### 1. Audio Engine

The app needs a browser-side audio engine that represents the five NES-style voices and mixes them together.

Core pieces:

- `PulseVoice` for voice 1
- `PulseVoice` for voice 2
- `TriangleVoice` for voice 3
- `NoiseVoice` for voice 4
- `SampleVoice` for voice 5
- `Mixer` to combine outputs
- `Transport` to manage tempo, looping, and playback position
- `Sequencer` to feed note and trigger data into the audio engine

Recommended web platform features:

- Web Audio API
- AudioWorklet for sample-accurate generation and timing
- `AnalyserNode` for waveform visualization
- `getUserMedia()` for microphone capture
- `AudioBuffer` for PCM sample storage and playback

### 2. Sequencer UI

The editor should present one row per voice, with time running left to right in fixed steps.

Each row should support:

- note or trigger entry
- step-based playback
- voice-specific controls
- live waveform display

Expected voice behavior:

- Pulse rows: note, volume, duty cycle
- Triangle row: note, volume
- Noise row: trigger, noise rate or mode, volume
- PCM row in `Inspired mode`: trigger recorded sample, preview sample, trim sample, and shape pitch by playback rate rather than musical note entry
- PCM row in `Authentic mode`: trigger short sampled hits using fixed-rate DPCM-style behavior instead of note-mapped playback

### Inspired Mode PCM Decision

For the current product direction, `Inspired mode` PCM is explicitly trigger-first rather than note-first.

- each PCM step stores a sample reference plus playback rate
- playback rate acts as the musical convenience control for pitch shifting
- PCM stays a one-shot lane for rhythmic stabs, vocals, and hits
- direct note mapping is out of scope for this mode in the current editor

This keeps the sample lane easy to understand beside the pulse and triangle note lanes, while still allowing expressive pitch-shifted playback without introducing a second melodic editing system.

### Authentic Mode PCM/DPCM Constraints

`Authentic mode` should be treated as a separate playback contract rather than a stricter toggle on top of `Inspired mode`.

- the fifth lane becomes hardware-oriented `DPCM` terminology rather than a general-purpose PCM lane
- each trigger targets a converted DPCM asset plus a fixed NES playback-rate preset, not an arbitrary `0.25x` to `4x` playback multiplier
- pitch changes come only from the chosen DPCM rate preset, so there is no direct note entry and no free-rate pitch sweep
- source samples can still be recorded or imported in the editor, but authentic playback converts them into constrained one-bit DPCM-style data before scheduling
- trimming remains useful during authoring, but the converted playback asset is expected to be short, percussive, and quantized for hardware-style playback rather than treated like a flexible sampler
- authentic UI copy should describe the lane as one-shot hits, rates, and converted sample assets instead of melodic sample performance

In practical terms, the difference from `Inspired mode` is:

- `Inspired mode` stores `sampleId + playbackRate` for expressive one-shots and pitch-shifted edits
- `Authentic mode` is planned around `sampleId + rate preset` with stricter playback behavior, hardware wording, and no arbitrary pitch control
- `Inspired mode` is the musical workflow-first default, while `Authentic mode` is a later follow-up for users who want stricter NES-style limits

### 3. Visualization Layer

Each voice row should display the generated waveform in real time so the user can both hear and see what that voice is doing.

Suggested approach:

- one canvas per voice row
- one analyser per voice path
- lightweight animation loop tied to playback state

## Repository Fit

This repository is already set up as a Better-T-Stack / TanStack Start monorepo with shared UI primitives.

Implementation should primarily live in:

- `apps/web` for the main interface and app logic
- `packages/ui` for shared reusable UI primitives if needed

Likely module areas inside `apps/web`:

- audio engine
- sequencer state
- transport controls
- waveform rendering
- sample recording and editing
- persistence

## Technical Direction

Recommended baseline architecture:

- TanStack Start for the frontend application shell
- TypeScript for audio and UI models
- Canvas for waveform rendering
- Web Audio API plus AudioWorklet for synthesis and scheduling
- URL-hash sharing first, with heavier local persistence only if larger song libraries or longer sample archives need it later

## Non-Goals For The First Version

These should stay out of scope until the core experience works:

- exact APU hardware emulation
- advanced effect columns
- full song arrangement across many patterns
- export to ROM or NSF
- multiplayer or collaborative editing
- polished sample mastering tools

## Success Criteria

The project is on track when a user can:

- program a short loop across all five voices
- hear distinct pulse, triangle, noise, and sample behavior
- watch each voice waveform while the loop is playing
- record and trim a short PCM sound
- copy a shareable song link and reload that song from the URL
- understand whether the current song is using `Inspired` or `Authentic` playback rules
