# Agent notes

This project uses pnpm. Assume the app is already running, do not try to run it again.

The use of "as any" is forbidden, we want to make good use of typescript and the type system.

Always add tests after developing a feature.

Always run the tests and type checks after doing a change.

## UI

The web UI is built on [UI SDK](https://ui-sdk.dev) (`@ui-sdk/react`, `@ui-sdk/core`).

- Before using ui-sdk, follow the `ui-sdk` skill in `.agents/skills/ui-sdk`, and read `node_modules/@ui-sdk/react/docs/llms.txt`. To build a new component, also search `node_modules/@ui-sdk/react/docs/core.md` by heading, and read `rendering.md` next to it.
- Styled wrappers live in `packages/ui/src/components` and are imported as `@ochoit/ui/components/<name>`. Use them before reaching for a raw ui-sdk part.
- Design tokens live in `packages/ui/src/styles/globals.css`. Use the token utilities (`bg-surface-1`, `text-ink-muted`, `border-line`, `bg-signal`, `bg-band`, `text-voice-pulse1`, `text-screen-ink`, `rounded-control`, `rounded-panel`) instead of raw colours.
- The look is a CRT tracker, dark only. The band, inspector and dialogs are the TV's plastic case; the sequencer sits on the glass (`crt-rim` around `crt-glass`). `crt-glass` re-points the surface, ink and line tokens at the screen, so kit components inside it need no extra classes. Small glass windows on the case use `glass-well`.
- Controls on the glass use the `screen` button and toggle variants; controls on the case band use `band`.
- Fonts: `font-screen` (VT323) for display headers (voice names, "Pattern", dialog and section titles) and short display labels at 18px or larger; `font-mono` (JetBrains Mono) for the step grid (notes, step numbers, the column header) and form readouts (number fields, note picker, percentages); `font-wordmark` (Silkscreen) only for the "Ochoit" wordmark; the default sans (Atkinson Hyperlegible Next) for sentences and button text.
- Step cells stay flat at rest; only the selected and playing cells glow.
- A voice lane sets `--voice` (`voiceStyle` in `sequencer-theme.ts`); its children colour themselves with `(--voice)` classes such as `border-(--voice)`.
- Glow on animated canvases comes from the painter's halo stroke, never a CSS `filter` or canvas `shadowBlur`.
- Voice colours mean "this voice" and nothing else. Green (`go`, the `go` button variant) is only the Play button. Red (`signal`) means record or a destructive action.
- Check contrast on the real colours: text 4.5:1, control edges and focus 3:1.
- Tests stub the browser top-layer APIs in `apps/web/src/test-setup.ts`. Popup positioning and animation still need a check in a real browser.

## UI quality skills

Emil Kowalski's skills (MIT, `emilkowalski/skills`) live in `.agents/skills`:

- `emil-design-eng`: design-engineering judgment for components and motion.
- `break-ui`: stress-test a screen with realistic worst-case data. For Ochoit, that means 64-step and 128-step songs, long song and clip names, four full clips and extreme tempos, not only the 16-step demo.
- `mobile-native`: phone polish.
- `learn-taste`: turn the user's design corrections into rules.
