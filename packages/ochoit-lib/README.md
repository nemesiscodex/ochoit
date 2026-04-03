# ochoit-lib

Browser-first TypeScript library for parsing and playing Ochoit DSL songs.

```ts
import { ochoit } from "ochoit-lib/web";

const player = ochoit(dsl);
await player.play();
```

Core APIs are available from `ochoit-lib` for parsing, validation, and serialization without Web Audio.
