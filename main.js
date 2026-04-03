const {
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
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
      name: "Consolidate voice notes into daily notes",
      callback: async () => {
        await this.runVoiceNoteConsolidation(false);
      }
    });

    this.addCommand({
      id: "consolidate-voice-notes-and-cleanup",
      name: "Consolidate voice notes and delete processed files",
      callback: async () => {
        await this.runVoiceNoteConsolidation(true);
      }
    });

    this.addCommand({
      id: "delete-empty-files",
      name: "Delete empty or whitespace-only files",
      callback: async () => {
        await this.deleteEmptyFiles();
      }
    });

    this.addCommand({
      id: "remove-completed-tasks",
      name: "Remove completed tasks from markdown files",
      callback: async () => {
        await this.removeCompletedTasks();
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

  async runVoiceNoteConsolidation(cleanup) {
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
      title: cleanup ? "Consolidate and delete voice notes?" : "Consolidate voice notes?",
      message: cleanup
        ? `Found ${voiceNoteFiles.length} voice note file(s).\nProcessed files will be appended to daily notes and then deleted.`
        : `Found ${voiceNoteFiles.length} voice note file(s).\nTheir contents will be appended to daily notes.`,
      ctaText: cleanup ? "Run and Delete" : "Run"
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

    if (cleanup) {
      for (const file of processedFiles) {
        await this.app.vault.trash(file, false);
      }
    }

    const cleanupSuffix = cleanup ? ` Deleted ${processedFiles.length} processed file(s).` : "";
    new Notice(`Voice notes done. Processed ${processed}, skipped ${skipped}.${cleanupSuffix}`, 8000);
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
};
