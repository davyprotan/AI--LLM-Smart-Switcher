# LLM Smart Switcher

Cross-platform desktop scaffold for a local LLM install/run/switch/revert tool built with Tauri, React, and TypeScript.

This first pass only creates the project structure and base files. It intentionally does not implement real hardware detection, provider switching, model installation, repair flows, or benchmark execution yet.

## Structure

```text
.
├── src/
│   ├── app/                 # App shell and shared state
│   ├── components/          # Layout and primitive UI building blocks
│   ├── constants/           # Navigation and UI variation presets
│   ├── data/                # Mock app data used for the v1 shell
│   ├── features/            # Screen-level feature folders
│   ├── lib/                 # Small client helpers
│   ├── services/            # Frontend service stubs
│   ├── styles/              # Global theme and layout styles
│   └── types/               # Shared TypeScript domain types
├── src-tauri/
│   ├── capabilities/        # Tauri window permissions
│   └── src/commands/        # Native command stubs for next pass
└── app-*.jsx / *.html       # Existing prototype files kept as reference
```

## Included Screens

- Dashboard
- Hardware
- Models
- Switcher
- Snapshots
- Settings
- Benchmark

## Notes

- The existing prototype files are intentionally untouched:
  - `app-components.jsx`
  - `app-main.jsx`
  - `app-screens.jsx`
  - `LLM Smart Switcher.html`
- The UI shell includes three comparable layout variations as placeholders:
  - `Operator`
  - `Studio`
  - `Compact`
- Tauri command stubs are in place so we can wire real native logic next without reshaping the project.

## Documentation

- [Documentation Index](/Users/davytan/PycharmProjects/AI--LLM%20Smart%20Switcher/docs/README.md)
- [Roadmap](/Users/davytan/PycharmProjects/AI--LLM%20Smart%20Switcher/docs/roadmap.md)
- [Architecture](/Users/davytan/PycharmProjects/AI--LLM%20Smart%20Switcher/docs/architecture.md)
- [Integrations](/Users/davytan/PycharmProjects/AI--LLM%20Smart%20Switcher/docs/integrations.md)
- [Safety and Rollback](/Users/davytan/PycharmProjects/AI--LLM%20Smart%20Switcher/docs/safety-and-rollback.md)
- [Testing Strategy](/Users/davytan/PycharmProjects/AI--LLM%20Smart%20Switcher/docs/testing-strategy.md)

## Next Pass

After you confirm, the next implementation step can wire:

1. Real hardware detection across macOS, Windows, and Linux.
2. Config discovery and reversible switching for each supported tool.
3. Model install/remove flows, snapshot diffing, diagnostics, and benchmark execution.
