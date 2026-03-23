For context, check the files `project.md`, `mvp.md`, and `progress.md`


# Skin Progress

This tracker covers the work to make skins a first-class app feature without changing the sequencer behavior. The goal is to keep `classic` as the default and preserve all current functionality, while adding a true `8bitcn` presentation that is driven by URL query params and built from the package-owned `8bitcn` component set.

At the moment, the header skin controls and many shared inputs/buttons are already skin-aware, and share links still work with skin query params. The main remaining gap is that the `8bitcn` workstation body is not a real separate renderer yet: it still wraps the classic workstation structure. The open items below are about replacing that remaining classic body chrome with real `8bitcn` layout and dialog components, section by section, while keeping audio, song editing, import/export, and sharing behavior identical.

- [x] Define the URL-driven skin and subtheme model
- [x] Add `skin`, `theme`, and `mode` query param support
- [x] Default to `classic` when `skin` is missing or invalid
- [x] Preserve the shared song hash while updating skin query params
- [x] Add root skin provider wiring for TanStack Router and `nuqs`
- [x] Add a skin selector in the header
- [x] Add the retro subtheme selector for `8bitcn`
- [x] Add the retro light/dark mode toggle for `8bitcn`
- [x] Standardize on the package-owned `8bitcn` component set
- [x] Delete the broken app-local `apps/web/src/components/ui/8bitcn` duplicates
- [x] Convert shared visible controls to skin-aware wrappers backed by package `8bitcn` components
- [x] Keep the share-song feature working with skin and theme query params
- [x] Replace the `RetroWorkstationView` wrapper with a real 8bitcn workstation renderer
- [x] Rebuild the top-level workstation shell for `8bitcn` using package `8bitcn` layout primitives
- [x] Rebuild the transport strip and actions bar for `8bitcn` instead of reusing the classic shell
- [x] Rebuild the sequencer ruler and track row containers with package `8bitcn` components
- [x] Rebuild the sample deck panels and clip list with package `8bitcn` components
- [x] Rebuild the song metadata panel with package `8bitcn` components
- [x] Rebuild the step detail panel chrome with package `8bitcn` components
- [x] Rebuild the share DSL, examples, and arrangement dialogs with package `8bitcn` dialog/sheet/card primitives
- [x] Audit the 8bitcn skin for any remaining classic-only classes and panel chrome
- [x] Add or update tests that assert the retro workstation renders a distinct 8bitcn body, not the classic wrapper
