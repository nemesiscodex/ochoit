For context, check the files `project.md` and `mvp.md`


# Progress

- [x] Capture the project vision and high-level architecture in `project.md`
- [x] Define the first playable product scope in `mvp.md`
- [x] Create a progress tracker for the work ahead
- [x] Decide the initial song data model and file/version format
- [x] Define the app information architecture and main screen layout
- [x] Create the audio engine foundation in `apps/web`
- [x] Initialize `AudioContext` from a user gesture
- [x] Add AudioWorklet-based transport and scheduling
- [x] Implement pulse voice 1
- [x] Build the transport bar with play, stop, BPM, and loop length
- [x] Add per-voice analysers for waveform capture
- [x] Build a reusable waveform canvas component
- [x] Build five sequencer rows with one row per voice
- [x] Implement pulse voice 2
- [x] Implement triangle voice
- [x] Implement noise voice
- [x] Implement PCM sample voice
- [x] Add note entry UI for pulse and triangle voices
- [x] Add trigger UI for noise and PCM voices
- [x] Add per-voice mute and volume controls
- [x] Add duty cycle controls for pulse voices
- [x] Add noise rate or mode controls
- [x] Add microphone permission and recording flow
- [x] Add sample preview and trim controls
- [ ] Connect recorded PCM samples to the sample lane
- [ ] Decide `Inspired mode` PCM behavior, including whether samples can be mapped to musical notes
- [ ] Define `Authentic mode` PCM/DPCM constraints and how they differ from `Inspired mode`
- [ ] Save and load songs from localStorage
- [ ] Test playback timing under normal UI interaction
- [ ] Polish the editor UI for desktop and mobile
- [ ] Decide when to introduce a more authentic NES emulation mode
