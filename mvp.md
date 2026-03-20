# MVP: First Playable NES-Inspired Sequencer

## MVP Goal

Build a first playable web app that captures the core idea of the project:

- five NES-inspired voices
- one visible row per voice
- live playback with looping
- per-voice waveform visualization
- short PCM sample recording for the fifth voice

The MVP should prioritize responsiveness, clarity, and a complete end-to-end loop over perfect hardware authenticity.

The first playable version should ship in `Inspired mode` by default. `Authentic mode` should be planned as a later follow-up with stricter NES-style PCM and channel constraints.

## Scope

### Included

- 2 pulse voices
- 1 triangle voice
- 1 noise voice
- 1 PCM sample voice
- transport controls: play, stop, BPM, loop length
- a 16-step sequencer grid
- note entry for pulse and triangle rows
- trigger entry for noise and sample rows
- live waveform rendering for all five rows
- short microphone recording for the sample voice
- basic trim controls for the recorded sample
- local save/load of song state
- explicit `engineMode` behavior in the song model, even if the UI stays focused on `Inspired mode` for the first pass

### Excluded

- exact NES mixer curve emulation
- full `Authentic mode` PCM/DPCM behavior
- pulse sweep and envelope emulation
- advanced tracker effect columns
- multi-pattern arrangement mode
- export to audio file
- cloud sync

## User Stories

- As a user, I can press play and hear a looping 8-bit pattern.
- As a user, I can assign notes to the two pulse rows and the triangle row.
- As a user, I can place rhythmic triggers on the noise row.
- As a user, I can record a short PCM sound with my microphone and trigger it from the sample row.
- As a user, I can understand that the first version uses an `Inspired mode` sample workflow rather than strict NES-authentic PCM rules.
- As a user, I can see a waveform for each voice while the sequence is playing.
- As a user, I can save my current song locally and load it later.

## MVP UX

### Main Layout

- top transport bar
- five voice rows in the main editor
- sample recorder panel for the PCM voice
- lightweight status area for audio state and save/load feedback

### Voice Rows

Each row should include:

- voice label
- mute toggle
- basic voice controls
- waveform canvas
- 16-step grid

Voice-specific controls:

- Pulse 1 / Pulse 2: note entry, duty cycle, volume
- Triangle: note entry, volume
- Noise: trigger grid, noise rate or mode, volume
- PCM: trigger grid, sample loaded indicator, volume

## MVP Technical Plan

### Audio

- create a single `AudioContext`
- initialize audio only after explicit user interaction
- use an `AudioWorklet` for synthesis and timing
- expose one analyser path per voice for waveform drawing

### Sequencing

- represent the song as fixed-length step data
- support 16 steps per loop
- support BPM-based transport
- keep playback looping continuously

### Sample Recording

- request microphone permission
- record a short mono sample
- preview the captured waveform
- trim start and end points
- assign the trimmed buffer to the PCM voice
- keep PCM playback rate-based in the first pass, while leaving room for later note-mapped behavior in `Inspired mode`

### Persistence

- save the song document to localStorage
- reload the most recent saved project
- keep the initial storage format simple and versioned

## Suggested Data Shape

```ts
type Song = {
  bpm: number;
  loopLength: number;
  stepsPerBeat: number;
  tracks: Track[];
  samples: SampleAsset[];
};

type StepEvent = {
  step: number;
  gate?: boolean;
  note?: string;
  volume?: number;
  duty?: 0.125 | 0.25 | 0.5 | 0.75;
  noisePeriod?: number;
  sampleId?: string;
};
```

## Acceptance Criteria

- The app can play a 16-step loop across all five voices without obvious timing jitter during normal use.
- Each voice row shows a moving waveform while playback is active.
- Pulse and triangle rows can store and play fixed notes.
- Noise and PCM rows can store and play step triggers.
- The user can record, trim, and reuse a short PCM sample.
- The user can save a song locally and reload it successfully after refresh.
- The product direction keeps `Inspired mode` and future `Authentic mode` behavior distinct in the design docs and data model.

## Build Order

1. Add one pulse voice with audible playback and waveform rendering.
2. Add the remaining pulse, triangle, and noise voices.
3. Build the transport and 16-step sequencer grid.
4. Add the PCM recorder, trimming, and trigger lane.
5. Add local persistence and general polish.
