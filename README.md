# VibePlanner

VibePlanner is a local-first Electron desktop app that orchestrates Codex CLI workflows inside a user-selected project directory.

## What It Does

- verifies a local Codex CLI install and ChatGPT login
- creates or attaches a project workspace
- copies a Markdown brief into a portable `vibeplanner/` folder
- launches a fixed core agent team through `codex exec`
- tracks bugs, runs, research artifacts, agent messages, and logs locally
- supports browser smoke checks through Playwright

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- Vitest
- Playwright

## Local Development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run test
npm run lint
npm run build
```

## Packaging

```bash
npm run package
```

For local macOS packaging without signing:

```bash
npx electron-builder --dir
```

## Notes

- VibePlanner is local-first and stores project state inside the selected project root.
- Codex execution is intentionally constrained to the approved workspace.
- External research sources are treated as references and patterns, not copied code.
