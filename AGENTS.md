# Agent notes

This project uses pnpm. Assume the app is already running, do not try to run it again.

The use of "as any" is forbidden, we want to make good use of typescript and the type system.

Always add tests after developing a feature.

Always run the tests and type checks after doing a change.

## UI

The web UI is built on [UI SDK](https://ui-sdk.dev) (`@ui-sdk/react`, `@ui-sdk/core`).

- Before using ui-sdk, follow the `ui-sdk` skill in `.agents/skills/ui-sdk`, and read `node_modules/@ui-sdk/react/docs/llms.txt`. To build a new component, also search `node_modules/@ui-sdk/react/docs/core.md` by heading, and read `rendering.md` next to it.
- Styled wrappers live in `packages/ui/src/components` and are imported as `@ochoit/ui/components/<name>`. Use them before reaching for a raw ui-sdk part.
- Design tokens live in `packages/ui/src/styles/globals.css`. Use the token utilities (`bg-surface-1`, `text-ink-muted`, `border-line`, `bg-signal`, `bg-band`, `text-voice-pulse1`, `rounded-control`, `rounded-panel`) instead of raw colours.
- Voice colours mean "this voice" and nothing else. Red (`signal`) means play, record or a destructive action.
- Tests stub the browser top-layer APIs in `apps/web/src/test-setup.ts`. Popup positioning and animation still need a check in a real browser.
