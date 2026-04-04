# ochoit-lib

Browser-first TypeScript library for parsing and playing Ochoit DSL songs.

## Install

```bash
npm install ochoit-lib
```

Use:

- `ochoit-lib` for parsing, validation, and serialization
- `ochoit-lib/web` for browser playback

## Get A DSL Song

You can create and export songs from the Ochoit sequencer:

https://ochoit.nemesiscodex.org/

Use the app's DSL/share text as the input to this library.

## Play A Song

Import the playback API from `ochoit-lib/web`.

Call `ochoit.start()` from a user interaction before the first playback. Browsers will often block audio if you try to start it outside a click, tap, or keypress.

```ts
import { ochoit } from "ochoit-lib/web";

button.addEventListener("click", async () => {
  await ochoit.start();

  const player = ochoit(dsl);
  await player.play();
});
```

`play()` still resumes audio internally, but `ochoit.start()` is the recommended explicit unlock step.

## Play A Single Voice

Use the recommended `ochoit.voice(...)` API when you want to play just one channel arrangement.

Comma-separated and newline-separated arrangements are both supported.

```ts
import { ochoit } from "ochoit-lib/web";

await ochoit.voice("pulse", "3: C6, 4: E6", {
  bpm: 180,
  steps: 8,
  volume: 100,
  loop: false,
}).play();
```

The shorthand overload also works:

```ts
import { ochoit } from "ochoit-lib/web";

await ochoit("triangle", "1: C3, 5-8: G3", {
  bpm: 150,
  steps: 8,
  volume: 60,
}).play();
```

Supported voice ids are:

- `pulse`
- `pulse1`
- `pulse2`
- `triangle`
- `noise`
- `sample`
- `pcm`

## Core APIs

Core APIs are available from `ochoit-lib` for parsing, validation, and serialization without Web Audio.

```ts
import { parseSong, serializeSong } from "ochoit-lib";

const song = parseSong(dsl);
const roundTrippedDsl = serializeSong(song);
```
