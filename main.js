const {
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  MarkdownView,
  Setting,
  TFile,
  TFolder
} = require("obsidian");

const DEFAULT_SETTINGS = {
  voiceNotesFolder: "Voice Notes",
  dailyNotesFolder: ""
};

const TEXT_EXTENSIONS = new Set([
  "",
  "md",
  "txt",
  "json",
  "js",
  "ts",
  "css",
  "scss",
  "html",
  "xml",
  "yaml",
  "yml",
  "csv",
  "tsv",
  "canvas"
]);

class ConfirmModal extends Modal {
  constructor(app, options) {
    super(app);
    this.options = options;
    this.isResolved = false;
    this.resultPromise = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }

  onOpen() {
    const { contentEl } = this;
    const { title, message, ctaText } = this.options;

    contentEl.empty();
    contentEl.createEl("h2", { text: title });

    for (const line of message.split("\n")) {
      if (!line.trim()) {
        contentEl.createEl("p");
        continue;
      }
      contentEl.createEl("p", { text: line });
    }

    const buttonRow = contentEl.createDiv({
      cls: "mobile-vault-scripts-confirm-buttons"
    });

    const cancelButton = buttonRow.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.finish(false);
      this.close();
    });

    const confirmButton = buttonRow.createEl("button", { text: ctaText });
    confirmButton.addClass("mod-cta");
    confirmButton.addEventListener("click", () => {
      this.finish(true);
      this.close();
    });
  }

  onClose() {
    this.finish(false);
    this.contentEl.empty();
  }

  finish(result) {
    if (this.isResolved) {
      return;
    }
    this.isResolved = true;
    this.resolveResult(result);
  }

  async waitForResult() {
    this.open();
    return this.resultPromise;
  }
}

class MobileVaultScriptsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Mobile Vault Scripts" });

    new Setting(containerEl)
      .setName("Voice notes folder")
      .setDesc("Folder containing individual voice note markdown files.")
      .addText((text) =>
        text
          .setPlaceholder("Voice Notes")
          .setValue(this.plugin.settings.voiceNotesFolder)
          .onChange(async (value) => {
            this.plugin.settings.voiceNotesFolder = this.plugin.normalizeFolderPath(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily notes folder")
      .setDesc("Leave empty to write daily notes to the vault root.")
      .addText((text) =>
        text
          .setPlaceholder("Daily Notes")
          .setValue(this.plugin.settings.dailyNotesFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNotesFolder = this.plugin.normalizeFolderPath(value);
            await this.plugin.saveSettings();
          })
      );
  }
}

module.exports = class MobileVaultScriptsPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.voiceNotesFolder = this.normalizeFolderPath(this.settings.voiceNotesFolder);
    this.settings.dailyNotesFolder = this.normalizeFolderPath(this.settings.dailyNotesFolder);

    this.addCommand({
      id: "consolidate-voice-notes",
      name: "Consolidate voice notes",
      icon: "microphone",
      callback: async () => {
        await this.runVoiceNoteConsolidation();
      }
    });

    this.addCommand({
      id: "delete-empty-files",
      name: "Delete empty files",
      icon: "file-x",
      callback: async () => {
        await this.deleteEmptyFiles();
      }
    });

    this.addCommand({
      id: "remove-completed-tasks",
      name: "Remove completed tasks",
      icon: "check-check",
      callback: async () => {
        await this.removeCompletedTasks();
      }
    });

    this.addCommand({
      id: "move-task-due-dates-to-today",
      name: "Set due dates to today",
      icon: "calendar-clock",
      callback: async () => {
        await this.moveTaskDueDatesToToday();
      }
    });

    this.addCommand({
      id: "move-focused-task-due-date-to-tomorrow",
      name: "Set due date to tomorrow",
      icon: "calendar-arrow-up",
      editorCallback: (editor, view) => {
        this.moveFocusedTaskDueDateToTomorrow(editor, view);
      }
    });

    this.addCommand({
      id: "move-focused-task-to-due-date-daily-note",
      name: "Move to due-date note",
      icon: "calendar-arrow-down",
      editorCallback: (editor, view) => {
        this.moveFocusedTaskToDueDateDailyNote(editor, view);
      }
    });

    this.addCommand({
      id: "pull-tasks-due-today-into-daily-note",
      name: "Pull today's tasks",
      icon: "calendar-check",
      editorCallback: (editor, view) => {
        this.pullTasksDueTodayIntoDailyNote(editor, view);
      }
    });

    this.addCommand({
      id: "sort-focused-task-list",
      name: "Sort tasks",
      icon: "arrow-down-up",
      editorCallback: (editor, view) => {
        this.sortFocusedTaskList(editor, view);
      }
    });

    this.addCommand({
      id: "move-focused-task-to-top-of-unfinished-tasks",
      name: "Move to top of unfinished",
      icon: "arrow-up-to-line",
      editorCallback: (editor, view) => {
        this.moveFocusedTaskToIncompleteBoundary(editor, view, "top");
      }
    });

    this.addCommand({
      id: "move-focused-task-to-bottom-of-unfinished-tasks",
      name: "Move to bottom of unfinished",
      icon: "arrow-down-to-line",
      editorCallback: (editor, view) => {
        this.moveFocusedTaskToIncompleteBoundary(editor, view, "bottom");
      }
    });

    this.addSettingTab(new MobileVaultScriptsSettingTab(this.app, this));
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  normalizeFolderPath(value) {
    return (value || "").trim().replace(/^\/+|\/+$/g, "");
  }

  isManagedVaultPath(path) {
    return !path.startsWith(".obsidian/");
  }

  parseVoiceNoteFilename(filename) {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2}) ((?:\d{6})|(?:\d{2}:\d{2}:\d{2}))\.md$/);
    if (!match) {
      return null;
    }
    return {
      date: match[1],
      time: match[2]
    };
  }

  getDailyNotePath(date) {
    return this.settings.dailyNotesFolder
      ? `${this.settings.dailyNotesFolder}/${date}.md`
      : `${date}.md`;
  }

  async ensureFolderExists(folderPath) {
    const normalized = this.normalizeFolderPath(folderPath);
    if (!normalized) {
      return;
    }

    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  async appendToDailyNote(date, content) {
    const targetPath = this.getDailyNotePath(date);
    const folderPath = targetPath.includes("/") ? targetPath.substring(0, targetPath.lastIndexOf("/")) : "";
    await this.ensureFolderExists(folderPath);

    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing instanceof TFile) {
      const currentContent = await this.app.vault.read(existing);
      const separator = currentContent.endsWith("\n") ? "\n" : "\n\n";
      await this.app.vault.modify(existing, `${currentContent}${separator}${content}\n`);
      return;
    }

    await this.app.vault.create(targetPath, `${content}\n`);
  }

  getVoiceNoteFiles() {
    const folderPath = this.settings.voiceNotesFolder;
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      return null;
    }

    return folder.children
      .filter((child) => child instanceof TFile && child.extension === "md")
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async runVoiceNoteConsolidation() {
    const voiceNoteFiles = this.getVoiceNoteFiles();
    if (voiceNoteFiles === null) {
      new Notice(`Voice notes folder not found: ${this.settings.voiceNotesFolder}`);
      return;
    }

    if (!voiceNoteFiles.length) {
      new Notice("No voice note files found.");
      return;
    }

    const confirmed = await new ConfirmModal(this.app, {
      title: "Consolidate and delete voice notes?",
      message: `Found ${voiceNoteFiles.length} voice note file(s).\nProcessed files will be appended to daily notes and then deleted.`,
      ctaText: "Run and Delete"
    }).waitForResult();

    if (!confirmed) {
      return;
    }

    let processed = 0;
    let skipped = 0;
    const processedFiles = [];

    for (const file of voiceNoteFiles) {
      const parsed = this.parseVoiceNoteFilename(file.name);
      if (!parsed) {
        skipped += 1;
        continue;
      }

      const content = (await this.app.vault.read(file)).trim();
      if (!content) {
        skipped += 1;
        continue;
      }

      await this.appendToDailyNote(parsed.date, content);
      processed += 1;
      processedFiles.push(file);
    }

    for (const file of processedFiles) {
      await this.app.vault.trash(file, false);
    }

    new Notice(`Voice notes done. Processed ${processed}, skipped ${skipped}. Deleted ${processedFiles.length} processed file(s).`, 8000);
  }

  isTextCandidate(file) {
    if (file.stat.size === 0) {
      return true;
    }
    return TEXT_EXTENSIONS.has((file.extension || "").toLowerCase());
  }

  async findEmptyFiles() {
    const matches = [];
    for (const file of this.app.vault.getFiles()) {
      if (!this.isManagedVaultPath(file.path)) {
        continue;
      }
      if (!this.isTextCandidate(file)) {
        continue;
      }
      if (file.stat.size === 0) {
        matches.push(file);
        continue;
      }

      try {
        const content = await this.app.vault.cachedRead(file);
        if (!/\S/.test(content)) {
          matches.push(file);
        }
      } catch (error) {
        console.error("Skipping file during empty-file scan:", file.path, error);
      }
    }
    return matches;
  }

  async deleteEmptyFiles() {
    const matches = await this.findEmptyFiles();
    if (!matches.length) {
      new Notice("No empty or whitespace-only files found.");
      return;
    }

    const preview = matches.slice(0, 5).map((file) => file.path).join("\n");
    const extra = matches.length > 5 ? `\nAnd ${matches.length - 5} more.` : "";
    const confirmed = await new ConfirmModal(this.app, {
      title: "Delete empty files?",
      message: `Found ${matches.length} empty or whitespace-only file(s).\n\n${preview}${extra}`,
      ctaText: "Delete"
    }).waitForResult();

    if (!confirmed) {
      return;
    }

    for (const file of matches) {
      await this.app.vault.trash(file, false);
    }

    new Notice(`Deleted ${matches.length} empty file(s).`, 8000);
  }

  stripCompletedTasks(content) {
    const lines = content.split(/\r?\n/);
    const keptLines = lines.filter((line) => !line.trimStart().startsWith("- [x]"));
    return {
      updated: keptLines.join("\n"),
      removed: lines.length - keptLines.length
    };
  }

  getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    const day = `${now.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  getTomorrowDateString() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = `${tomorrow.getMonth() + 1}`.padStart(2, "0");
    const day = `${tomorrow.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  isIncompleteTaskLine(line) {
    const match = line.match(/^\s*[-*]\s+\[([^\]])\]/);
    if (!match) {
      return false;
    }
    return match[1].toLowerCase() !== "x";
  }

  getTaskStatus(line) {
    const match = line.match(/^\s*[-*]\s+\[([ xX])\]/);
    if (!match) {
      return null;
    }
    return match[1].toLowerCase() === "x" ? "completed" : "incomplete";
  }

  moveFocusedTaskToIncompleteBoundary(editor, view, boundary) {
    if (!(view instanceof MarkdownView)) {
      new Notice("Focus a Markdown task list first.");
      return;
    }

    const cursor = editor.getCursor();
    const currentLine = editor.getLine(cursor.line);
    if (!this.isIncompleteTaskLine(currentLine)) {
      new Notice("Focus an incomplete task.");
      return;
    }

    let startLine = cursor.line;
    while (startLine > 0 && this.getTaskStatus(editor.getLine(startLine - 1))) {
      startLine -= 1;
    }

    let endLine = cursor.line;
    while (endLine < editor.lastLine() && this.getTaskStatus(editor.getLine(endLine + 1))) {
      endLine += 1;
    }

    const taskLines = [];
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      taskLines.push({
        line: editor.getLine(lineNumber),
        incomplete: this.isIncompleteTaskLine(editor.getLine(lineNumber))
      });
    }

    const currentIndex = cursor.line - startLine;
    const incompleteIndexesBeforeMove = taskLines
      .map((task, index) => (task.incomplete ? index : -1))
      .filter((index) => index !== -1);
    const boundaryIndex = boundary === "top"
      ? incompleteIndexesBeforeMove[0]
      : incompleteIndexesBeforeMove[incompleteIndexesBeforeMove.length - 1];
    if (boundaryIndex === currentIndex) {
      new Notice(`This task is already at the ${boundary} of the unfinished tasks.`);
      return;
    }

    const remainingLines = [...taskLines];
    const [focusedTask] = remainingLines.splice(currentIndex, 1);
    const incompleteIndexes = remainingLines
      .map((task, index) => (task.incomplete ? index : -1))
      .filter((index) => index !== -1);

    if (!incompleteIndexes.length) {
      new Notice("This is the only unfinished task in the list.");
      return;
    }

    const targetIndex = boundary === "top"
      ? incompleteIndexes[0]
      : incompleteIndexes[incompleteIndexes.length - 1] + 1;

    remainingLines.splice(targetIndex, 0, focusedTask);
    const replacement = remainingLines.map((task) => task.line).join("\n");
    editor.replaceRange(
      replacement,
      { line: startLine, ch: 0 },
      { line: endLine, ch: editor.getLine(endLine).length }
    );

    const newCursorLine = startLine + targetIndex;
    editor.setCursor({
      line: newCursorLine,
      ch: Math.min(cursor.ch, editor.getLine(newCursorLine).length)
    });
    new Notice(`Moved task to the ${boundary} of the unfinished tasks.`);
  }

  sortFocusedTaskList(editor, view) {
    if (!(view instanceof MarkdownView)) {
      new Notice("Focus a Markdown task list first.");
      return;
    }

    const cursor = editor.getCursor();
    const currentLine = editor.getLine(cursor.line);
    if (!this.getTaskStatus(currentLine)) {
      new Notice("The focused line is not a task.");
      return;
    }

    let startLine = cursor.line;
    while (startLine > 0 && this.getTaskStatus(editor.getLine(startLine - 1))) {
      startLine -= 1;
    }

    let endLine = cursor.line;
    while (endLine < editor.lastLine() && this.getTaskStatus(editor.getLine(endLine + 1))) {
      endLine += 1;
    }

    const today = this.getTodayDateString();
    const taskLines = [];
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      const line = editor.getLine(lineNumber);
      const status = this.getTaskStatus(line);
      const dueDate = this.getTaskDueDate(line);
      taskLines.push({
        line,
        originalIndex: lineNumber - startLine,
        status,
        dueDate,
        priority: status === "completed"
          ? 0
          : !dueDate || dueDate === today
            ? 1
            : 2
      });
    }

    const sortedLines = [...taskLines].sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      if (a.priority === 2 && a.dueDate !== b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      return a.originalIndex - b.originalIndex;
    });
    const changed = sortedLines.some((task, index) => task.originalIndex !== index);
    if (!changed) {
      new Notice("This task list is already sorted.");
      return;
    }

    const replacement = sortedLines.map((task) => task.line).join("\n");
    editor.replaceRange(
      replacement,
      { line: startLine, ch: 0 },
      { line: endLine, ch: editor.getLine(endLine).length }
    );

    const focusedTask = sortedLines.findIndex((task) => task.originalIndex === cursor.line - startLine);
    const newCursorLine = startLine + focusedTask;
    const newCursorCh = Math.min(cursor.ch, editor.getLine(newCursorLine).length);
    editor.setCursor({ line: newCursorLine, ch: newCursorCh });
    new Notice("Sorted task list: done, undated or due today, then due by date.");
  }

  hasTaskDueDate(line) {
    return /(📅\s*\d{4}-\d{2}-\d{2})|(due::\s*\d{4}-\d{2}-\d{2})/i.test(line);
  }

  updateOverdueTaskLineDueDate(line, today) {
    if (!this.isIncompleteTaskLine(line)) {
      return { updated: line, changed: false };
    }

    let changed = false;
    let updated = line.replace(/(📅\s*)(\d{4}-\d{2}-\d{2})/g, (match, prefix, dueDate) => {
      if (dueDate < today) {
        changed = true;
        return `${prefix}${today}`;
      }
      return match;
    });

    updated = updated.replace(/(due::\s*)(\d{4}-\d{2}-\d{2})/gi, (match, prefix, dueDate) => {
      if (dueDate < today) {
        changed = true;
        return `${prefix}${today}`;
      }
      return match;
    });

    return { updated, changed };
  }

  addDueDateToUndatedTaskLine(line, today) {
    if (!this.isIncompleteTaskLine(line) || this.hasTaskDueDate(line)) {
      return { updated: line, changed: false };
    }

    return { updated: `${line} 📅 ${today}`, changed: true };
  }

  getTaskDueDate(line) {
    const match = line.match(/(?:📅\s*|due::\s*)(\d{4}-\d{2}-\d{2})/i);
    return match ? match[1] : null;
  }

  getDailyNoteDate(file) {
    if (!file || file.path !== this.getDailyNotePath(file.basename)) {
      return null;
    }

    return /^\d{4}-\d{2}-\d{2}$/.test(file.basename) ? file.basename : null;
  }

  removeTaskLines(content, lineNumbers) {
    const lines = content.split(/\r?\n/);
    const linesToRemove = new Set(lineNumbers);
    return lines.filter((line, index) => !linesToRemove.has(index)).join("\n");
  }

  async pullTasksDueTodayIntoDailyNote(editor, view) {
    if (!(view instanceof MarkdownView) || !view.file) {
      new Notice("Focus a daily note first.");
      return;
    }

    const dailyNoteDate = this.getDailyNoteDate(view.file);
    if (!dailyNoteDate) {
      new Notice("The focused file is not a configured daily note.");
      return;
    }

    const tasksByFile = new Map();
    let totalTasks = 0;

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.path === view.file.path || !this.isManagedVaultPath(file.path)) {
        continue;
      }

      const content = await this.app.vault.cachedRead(file);
      const lines = content.split(/\r?\n/);
      const matchingLines = [];

      lines.forEach((line, lineNumber) => {
        if (this.isIncompleteTaskLine(line) && this.getTaskDueDate(line) === dailyNoteDate) {
          matchingLines.push({ line, lineNumber });
        }
      });

      if (matchingLines.length) {
        tasksByFile.set(file, { content, matchingLines });
        totalTasks += matchingLines.length;
      }
    }

    if (!totalTasks) {
      new Notice(`No open tasks due ${dailyNoteDate} found outside this daily note.`);
      return;
    }

    const confirmed = await new ConfirmModal(this.app, {
      title: "Pull tasks into this daily note?",
      message: `This will move ${totalTasks} open task(s) due ${dailyNoteDate} to the current cursor location in ${view.file.path}.`,
      ctaText: "Move"
    }).waitForResult();

    if (!confirmed) {
      return;
    }

    const tasks = [];
    for (const [file, { content, matchingLines }] of tasksByFile.entries()) {
      tasks.push(...matchingLines.map(({ line }) => line));
      const updated = this.removeTaskLines(
        content,
        matchingLines.map(({ lineNumber }) => lineNumber)
      );
      await this.app.vault.modify(file, updated);
    }

    const cursor = editor.getCursor();
    const inserted = `${tasks.join("\n")}\n`;
    editor.replaceRange(inserted, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: 0 });
    editor.setCursor({ line: cursor.line + tasks.length, ch: 0 });
    new Notice(`Moved ${totalTasks} open task(s) due ${dailyNoteDate} into this daily note.`);
  }

  async appendTaskToDailyNote(date, taskLine) {
    const targetPath = this.getDailyNotePath(date);
    const folderPath = targetPath.includes("/")
      ? targetPath.substring(0, targetPath.lastIndexOf("/"))
      : "";
    await this.ensureFolderExists(folderPath);

    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing instanceof TFile) {
      const currentContent = await this.app.vault.read(existing);
      const separator = currentContent ? (currentContent.endsWith("\n") ? "" : "\n") : "";
      await this.app.vault.modify(existing, `${currentContent}${separator}${taskLine}\n`);
      return;
    }

    if (existing) {
      throw new Error(`Daily note path is not a file: ${targetPath}`);
    }

    await this.app.vault.create(targetPath, `${taskLine}\n`);
  }

  removeFocusedEditorLine(editor, lineNumber) {
    const lastLine = editor.lastLine();
    if (lastLine === 0) {
      editor.replaceRange(
        "",
        { line: lineNumber, ch: 0 },
        { line: lineNumber, ch: editor.getLine(lineNumber).length }
      );
      return;
    }

    if (lineNumber < lastLine) {
      editor.replaceRange(
        "",
        { line: lineNumber, ch: 0 },
        { line: lineNumber + 1, ch: 0 }
      );
      return;
    }

    editor.replaceRange(
      "",
      { line: lineNumber - 1, ch: editor.getLine(lineNumber - 1).length },
      { line: lineNumber, ch: editor.getLine(lineNumber).length }
    );
  }

  getSelectedEditorLineNumbers(editor) {
    const selections = typeof editor.listSelections === "function"
      ? editor.listSelections()
      : [];
    if (!selections.length) {
      return [editor.getCursor().line];
    }

    const selection = selections[0];
    if (selection.anchor.line === selection.head.line && selection.anchor.ch === selection.head.ch) {
      return [editor.getCursor().line];
    }

    const start = selection.anchor.line < selection.head.line
      || (selection.anchor.line === selection.head.line && selection.anchor.ch < selection.head.ch)
      ? selection.anchor
      : selection.head;
    const end = start === selection.anchor ? selection.head : selection.anchor;
    const endLine = end.ch === 0 && end.line > start.line ? end.line - 1 : end.line;
    const lineNumbers = [];
    for (let lineNumber = start.line; lineNumber <= endLine; lineNumber += 1) {
      lineNumbers.push(lineNumber);
    }
    return lineNumbers;
  }

  async moveFocusedTaskToDueDateDailyNote(editor, view) {
    if (!(view instanceof MarkdownView) || !view.file) {
      new Notice("Focus a Markdown task first.");
      return;
    }

    const selectedLineNumbers = this.getSelectedEditorLineNumbers(editor);
    const tasksByDate = new Map();
    const alreadyInDueDateNote = [];
    let skipped = 0;

    for (const lineNumber of selectedLineNumbers) {
      const taskLine = editor.getLine(lineNumber);
      if (!this.isIncompleteTaskLine(taskLine)) {
        skipped += 1;
        continue;
      }

      const dueDate = this.getTaskDueDate(taskLine);
      if (!dueDate) {
        skipped += 1;
        continue;
      }

      if (this.getDailyNotePath(dueDate) === view.file.path) {
        alreadyInDueDateNote.push(lineNumber);
        continue;
      }

      if (!tasksByDate.has(dueDate)) {
        tasksByDate.set(dueDate, []);
      }
      tasksByDate.get(dueDate).push({ line: taskLine, lineNumber });
    }

    const tasks = [...tasksByDate.values()].flat();
    if (!tasks.length) {
      if (selectedLineNumbers.length > 1) {
        new Notice("No selected incomplete tasks with due dates need moving.");
      } else if (alreadyInDueDateNote.length) {
        new Notice("This task is already in its due-date daily note.");
      } else if (skipped) {
        new Notice("The selected line is not an incomplete task with a due date.");
      }
      return;
    }

    const destinationSummary = [...tasksByDate.entries()]
      .map(([date, dateTasks]) => `${date}: ${dateTasks.length} task(s)`)
      .join("\n");

    const confirmed = await new ConfirmModal(this.app, {
      title: selectedLineNumbers.length > 1
        ? "Move selected tasks to due-date notes?"
        : "Move task to its due-date daily note?",
      message: `${tasks.length} task(s) will be removed from ${view.file.path} and appended to:
${destinationSummary}`,
      ctaText: "Move"
    }).waitForResult();

    if (!confirmed) {
      return;
    }

    try {
      for (const [dueDate, dateTasks] of tasksByDate.entries()) {
        for (const { line } of dateTasks) {
          await this.appendTaskToDailyNote(dueDate, line);
        }
      }

      for (const lineNumber of tasks.map(({ lineNumber }) => lineNumber).sort((a, b) => b - a)) {
        this.removeFocusedEditorLine(editor, lineNumber);
      }

      const skippedMessage = skipped + alreadyInDueDateNote.length
        ? ` Skipped ${skipped + alreadyInDueDateNote.length} line(s).`
        : "";
      new Notice(`Moved ${tasks.length} task(s) to their due-date daily note(s).${skippedMessage}`);
    } catch (error) {
      console.error("Could not move task(s) to daily note(s):", error);
      new Notice("Could not move the selected task(s) to their daily note(s).", 8000);
    }
  }

  moveFocusedTaskDueDateToTomorrow(editor, view) {
    if (!(view instanceof MarkdownView)) {
      new Notice("Focus a Markdown task first.");
      return;
    }

    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    if (!this.getTaskStatus(line)) {
      new Notice("The focused line is not a task.");
      return;
    }

    const tomorrow = this.getTomorrowDateString();
    const updated = this.hasTaskDueDate(line)
      ? line
          .replace(/(📅\s*)\d{4}-\d{2}-\d{2}/g, `$1${tomorrow}`)
          .replace(/(due::\s*)\d{4}-\d{2}-\d{2}/gi, `$1${tomorrow}`)
      : `${line} 📅 ${tomorrow}`;

    editor.replaceRange(
      updated,
      { line: cursor.line, ch: 0 },
      { line: cursor.line, ch: line.length }
    );
    editor.setCursor({
      line: cursor.line,
      ch: Math.min(cursor.ch, updated.length)
    });
    new Notice(`Set task due date to ${tomorrow}.`);
  }

  updateTaskDueDatesToToday(content, today) {
    let overdueTasks = 0;
    let undatedTasks = 0;
    const updated = content
      .split(/\r?\n/)
      .map((line) => {
        const overdueResult = this.updateOverdueTaskLineDueDate(line, today);
        if (overdueResult.changed) {
          overdueTasks += 1;
          return overdueResult.updated;
        }

        const undatedResult = this.addDueDateToUndatedTaskLine(line, today);
        if (undatedResult.changed) {
          undatedTasks += 1;
        }
        return undatedResult.updated;
      })
      .join("\n");

    return {
      updated,
      changedTasks: overdueTasks + undatedTasks,
      overdueTasks,
      undatedTasks
    };
  }

  async removeCompletedTasks() {
    const affectedFiles = [];
    let totalRemoved = 0;

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.isManagedVaultPath(file.path)) {
        continue;
      }

      const original = await this.app.vault.cachedRead(file);
      const { updated, removed } = this.stripCompletedTasks(original);
      if (!removed) {
        continue;
      }

      affectedFiles.push({ file, updated });
      totalRemoved += removed;
    }

    if (!affectedFiles.length) {
      new Notice("No completed tasks found.");
      return;
    }

    const preview = affectedFiles.slice(0, 5).map(({ file }) => file.path).join("\n");
    const extra = affectedFiles.length > 5 ? `\nAnd ${affectedFiles.length - 5} more.` : "";
    const confirmed = await new ConfirmModal(this.app, {
      title: "Remove completed tasks?",
      message: `This will remove ${totalRemoved} completed task line(s) from ${affectedFiles.length} markdown file(s).\n\n${preview}${extra}`,
      ctaText: "Remove"
    }).waitForResult();

    if (!confirmed) {
      return;
    }

    for (const { file, updated } of affectedFiles) {
      await this.app.vault.modify(file, updated);
    }

    new Notice(`Removed ${totalRemoved} completed task(s) from ${affectedFiles.length} file(s).`, 8000);
  }

  async moveTaskDueDatesToToday() {
    const today = this.getTodayDateString();
    const affectedFiles = [];
    let totalOverdue = 0;
    let totalUndated = 0;

    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!this.isManagedVaultPath(file.path)) {
        continue;
      }

      const original = await this.app.vault.cachedRead(file);
      const {
        updated,
        changedTasks,
        overdueTasks,
        undatedTasks
      } = this.updateTaskDueDatesToToday(original, today);
      if (!changedTasks) {
        continue;
      }

      affectedFiles.push({ file, updated });
      totalOverdue += overdueTasks;
      totalUndated += undatedTasks;
    }

    if (!affectedFiles.length) {
      new Notice(`No overdue or undated incomplete tasks found for ${today}.`);
      return;
    }

    const preview = affectedFiles.slice(0, 5).map(({ file }) => file.path).join("\n");
    const extra = affectedFiles.length > 5 ? `\nAnd ${affectedFiles.length - 5} more.` : "";
    const confirmed = await new ConfirmModal(this.app, {
      title: "Move overdue and undated tasks to today?",
      message: `This will move ${totalOverdue} overdue task(s) and assign ${today} to ${totalUndated} undated task(s) across ${affectedFiles.length} markdown file(s).\n\n${preview}${extra}`,
      ctaText: "Update"
    }).waitForResult();

    if (!confirmed) {
      return;
    }

    for (const { file, updated } of affectedFiles) {
      await this.app.vault.modify(file, updated);
    }

    new Notice(`Updated ${totalOverdue} overdue task(s) and dated ${totalUndated} undated task(s) for ${today} in ${affectedFiles.length} file(s).`, 8000);
  }
};
