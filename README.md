# Mobile Vault Scripts

An Obsidian plugin that exposes a small set of vault-maintenance commands designed to work on mobile as well as desktop.

It currently supports:

- Consolidating voice note files into daily notes
- Optionally deleting processed voice note files after consolidation
- Deleting empty or whitespace-only files
- Removing completed Markdown tasks
- Moving overdue task due dates to today

## What It Does

### Voice note consolidation

The plugin scans a configured voice notes folder for Markdown files named like:

- `YYYY-MM-DD HHMMSS.md`
- `YYYY-MM-DD HH:MM:SS.md`

Each matching file is appended to the daily note for the same date:

- If `Daily notes folder` is set, output goes to `<daily-notes-folder>/YYYY-MM-DD.md`
- If it is empty, output goes to `YYYY-MM-DD.md` at the vault root

Files with invalid names or empty content are skipped.

### Empty file cleanup

The plugin can delete files that are either:

- zero bytes, or
- contain only whitespace

This scan ignores `.obsidian/` and is limited to text-like file types such as `md`, `txt`, `json`, `js`, `ts`, `css`, `yaml`, `csv`, and `canvas`.

### Completed task cleanup

The plugin removes Markdown task lines that start with:

```text
- [x]
```

Only Markdown files are modified. Files under `.obsidian/` are ignored.

### Overdue due-date update

The plugin updates overdue due dates on incomplete Markdown task lines to today’s date.

Supported due-date formats:

- `📅 YYYY-MM-DD`
- `due:: YYYY-MM-DD`

Only incomplete tasks are changed. Completed tasks are left alone.

## Commands

After enabling the plugin in Obsidian, these commands are available from the command palette:

- `Mobile Vault Scripts: Consolidate voice notes into daily notes`
- `Mobile Vault Scripts: Consolidate voice notes and delete processed files`
- `Mobile Vault Scripts: Delete empty or whitespace-only files`
- `Mobile Vault Scripts: Remove completed tasks from markdown files`
- `Mobile Vault Scripts: Move overdue task due dates to today`

Each destructive action shows a confirmation modal before changes are applied.

## Settings

The plugin exposes two settings:

- `Voice notes folder`
  Default: `Voice Notes`
- `Daily notes folder`
  Default: empty, which means daily notes are created in the vault root

Folder paths are normalized automatically, so leading and trailing `/` characters are removed.

## Installation

### Manual install

1. Copy this folder into your vault at:

   ```text
   <vault>/.obsidian/plugins/mobile-vault-scripts/
   ```

2. Ensure the folder contains at least:

   ```text
   manifest.json
   main.js
   ```

3. In Obsidian, open `Settings -> Community plugins`.
4. Enable community plugins if needed.
5. Enable `Mobile Vault Scripts`.

## Development

This repository currently ships the plugin as plain JavaScript:

- `manifest.json` defines the plugin metadata
- `main.js` contains the plugin implementation

There is no build step configured in this repository at the moment.

## Notes and Limitations

- Voice note consolidation only processes Markdown files directly inside the configured voice notes folder.
- Empty-file cleanup can affect non-Markdown text files if they are blank or whitespace-only.
- Completed-task cleanup only removes lines beginning with `- [x]`; other completed task syntaxes are not currently removed.
- Overdue due-date updates compare dates in `YYYY-MM-DD` format and only modify dates earlier than today.
