# Mobile Vault Scripts

An Obsidian plugin that exposes a small set of vault-maintenance commands designed to work on mobile as well as desktop.

It currently supports:

- Consolidating voice note files into daily notes
- Deleting processed voice note files after consolidation
- Deleting empty or whitespace-only files
- Removing completed Markdown tasks
- Moving overdue and undated task due dates to today
- Moving a focused task to the daily note matching its due date
- Moving a focused task to the top or bottom of unfinished tasks

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

### Task due-date update

The plugin updates overdue due dates and assigns today’s date to undated incomplete Markdown task lines.

Supported due-date formats:

- `📅 YYYY-MM-DD`
- `due:: YYYY-MM-DD`

Only incomplete tasks are changed. Completed tasks are left alone. Tasks with a due date of today or a future date are left unchanged.

It appends the due date in this format:

- `📅 YYYY-MM-DD`

Tasks that already include either `📅 YYYY-MM-DD` or `due:: YYYY-MM-DD` are left unchanged.

## Commands

After enabling the plugin in Obsidian, these commands are available from the command palette:

- `Mobile Vault Scripts: Consolidate voice notes`
- `Mobile Vault Scripts: Delete empty files`
- `Mobile Vault Scripts: Remove completed tasks`
- `Mobile Vault Scripts: Set due dates to today`
- `Mobile Vault Scripts: Set due date to tomorrow`
- `Mobile Vault Scripts: Move to due-date note`
- `Mobile Vault Scripts: Pull today's tasks`
- `Mobile Vault Scripts: Sort tasks`
- `Mobile Vault Scripts: Move to top of unfinished`
- `Mobile Vault Scripts: Move to bottom of unfinished`

Each destructive action shows a confirmation modal before changes are applied.

The focused task-list command works on the uninterrupted block of `- [ ]` and `- [x]` lines containing the cursor. It stably orders completed tasks first, incomplete tasks without a due date or due today second, and other incomplete tasks with a supported due date last, sorting the latter dated tasks by due date ascending. Other lines are boundaries and are not changed.

The unfinished-task commands work on the uninterrupted task block containing the cursor. They move the focused incomplete task to the first or last incomplete task position in that block, while keeping completed tasks in the same block and leaving other lines unchanged.

The focused due-date command moves the current task’s `📅 YYYY-MM-DD` or `due:: YYYY-MM-DD` marker to tomorrow. If the task has no due date, it adds `📅 YYYY-MM-DD` for tomorrow.

The task relocation command moves the focused incomplete task, or all selected incomplete tasks, to the daily note for each task's `📅 YYYY-MM-DD` or `due:: YYYY-MM-DD` date. Tasks without a supported due date are left unchanged. The daily note folder setting controls where destination notes are created.

The daily-note pull command must be run from a configured `YYYY-MM-DD.md` daily note. It moves all incomplete tasks with that note's date as their `📅 YYYY-MM-DD` or `due:: YYYY-MM-DD` date to the current cursor location and removes them from their original files.

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
- The task due-date command compares dates in `YYYY-MM-DD` format, changes overdue dates to today, and appends `📅 YYYY-MM-DD` to incomplete tasks that have no supported due-date marker.
