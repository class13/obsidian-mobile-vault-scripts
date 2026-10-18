# Repository Guidelines

## Project Structure & Module Organization

This repository is a small, plain-JavaScript Obsidian community plugin:

- `main.js` contains the plugin class, settings tab, confirmation modal, vault scans, and maintenance commands.
- `manifest.json` contains Obsidian plugin metadata and compatibility settings.
- `README.md` documents installation, settings, commands, and known limitations.
- `Vault/` is a local fixture or working-vault directory; do not assume it contains production source.

There is currently no separate `src/`, test suite, asset directory, or build output.

## Build, Test, and Development Commands

No build step or package manager is configured. Development is done by editing `main.js` and reloading the plugin in Obsidian.

Useful checks:

```bash
node --check main.js
git diff --check
```

The first command validates JavaScript syntax; the second catches whitespace errors in the patch. For behavioral verification, copy or symlink the repository into `<vault>/.obsidian/plugins/mobile-vault-scripts/`, enable the plugin, and exercise each command from Obsidian’s command palette.

## Coding Style & Naming Conventions

Use four-space indentation, semicolons, double-quoted strings, and trailing commas only where the existing style already uses them. Keep the CommonJS format required by Obsidian (`require("obsidian")` and `module.exports`). Use `PascalCase` for classes, `camelCase` for methods and variables, and kebab-case for command IDs. Preserve the plugin’s mobile-safe, confirmation-before-destructive-action behavior.

## Testing Guidelines

There is no automated test framework or coverage requirement. Manually test changes in a disposable Obsidian vault, including missing folders, empty files, invalid filenames, completed versus incomplete tasks, and rerunning commands to check for duplicate or unintended changes.

## Commit & Pull Request Guidelines

Existing commits use short, lowercase, descriptive summaries such as `added README.md` and `added command "..."`. Follow that concise style and keep each commit focused.

Pull requests should explain the user-visible behavior, identify affected files, document manual verification steps, and mention any changes to supported Obsidian versions or plugin settings. Include screenshots only when UI or settings changes need visual confirmation.

## Security & Configuration Tips

Maintenance commands modify or delete vault files. Test destructive operations on a backup or disposable vault first, and avoid committing personal vault content or `.obsidian` data.
