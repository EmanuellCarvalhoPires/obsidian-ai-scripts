// Settings tab (imperative, Obsidian-standard) for the AI Scripts plugin.
import { Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type { App, Plugin } from "obsidian";
import type { ConnectorStatus } from "../ecosystem/connector";
import { installEcosystem, isEcosystemInstalled } from "../ecosystem/dependency-modal";
import { t } from "../i18n";
import { normalizeFolder } from "../types/script-types";
import type { AIScriptsSettings, ScriptDefinition, ScriptLoadResult } from "../types/script-types";

export interface SettingsHost {
  settings: AIScriptsSettings;
  saveSettings(): Promise<void>;
  getConnectorStatus(): { status: ConnectorStatus; detail?: string };
  getLoadResult(): ScriptLoadResult | undefined;
  reloadScripts(): Promise<ScriptLoadResult>;
  openMonitorView(): Promise<void>;
  openManualRunModal(initialScriptId?: string): void;
  openScriptEditorModal(existing?: ScriptDefinition): void;
  openNote(path: string): Promise<void>;
  reinstallStarterScripts(): Promise<number>;
}

function statusMeta(
  status: ConnectorStatus,
  detail?: string,
): { icon: string; state: string; title: string; desc: string } {
  switch (status) {
    case "connected":
      return {
        icon: "check-circle-2",
        state: "connected",
        title: t("settings.ecosystem.connected"),
        desc: t("settings.ecosystem.connectedDesc"),
      };
    case "waiting":
      return {
        icon: "clock",
        state: "waiting",
        title: t("settings.ecosystem.waiting"),
        desc: t("settings.ecosystem.waitingDesc"),
      };
    case "disconnected":
      return {
        icon: "plug-zap",
        state: "waiting",
        title: t("settings.ecosystem.disconnected"),
        desc: t("settings.ecosystem.disconnectedDesc"),
      };
    case "incompatible":
      return {
        icon: "x-circle",
        state: "error",
        title: t("settings.ecosystem.incompatible"),
        desc: t("settings.ecosystem.incompatibleDesc", { reason: detail ?? "" }),
      };
    case "missing":
      return {
        icon: "alert-triangle",
        state: "error",
        title: t("settings.ecosystem.missing"),
        desc: t("settings.ecosystem.missingDesc"),
      };
  }
}

export class AIScriptsSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly host: SettingsHost,
  ) {
    super(app, plugin);
    this.icon = "terminal";
  }

  refresh(): void {
    try {
      if (this.containerEl && this.containerEl.isShown()) {
        this.display();
      }
    } catch (err) {
      console.debug("[AI Scripts] Could not refresh the settings tab", err);
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderEcosystemGroup(containerEl);
    this.renderGeneralGroup(containerEl);
    this.renderLoadedScriptsGroup(containerEl);
  }

  private renderEcosystemGroup(containerEl: HTMLElement): void {
    new Setting(containerEl).setHeading().setName(t("settings.ecosystem.heading"));

    const statusSetting = new Setting(containerEl);
    const { status, detail } = this.host.getConnectorStatus();
    const meta = statusMeta(status, detail);
    statusSetting.setName(meta.title).setDesc(meta.desc);
    const iconEl = createSpan({ cls: `ais-status-icon ais-status-${meta.state}` });
    setIcon(iconEl, meta.icon);
    statusSetting.nameEl.prepend(iconEl);

    if (status === "missing") {
      const installed = isEcosystemInstalled(this.app);
      statusSetting.addButton((btn) =>
        btn
          .setButtonText(installed ? t("settings.ecosystem.enable") : t("settings.ecosystem.install"))
          .setIcon("download")
          .setCta()
          .onClick(() => {
            btn.setDisabled(true);
            void installEcosystem(this.app)
              .then(() => {
                new Notice(t("dependency.installed"));
                this.display();
              })
              .catch(() => {
                new Notice(t("dependency.failed"));
                btn.setDisabled(false);
              });
          }),
      );
    }

    new Setting(containerEl)
      .setName(t("settings.ecosystem.openMonitor"))
      .setDesc(t("settings.ecosystem.openMonitorDesc"))
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.ecosystem.openMonitorBtn"))
          .setIcon("terminal")
          .onClick(() => void this.host.openMonitorView()),
      );
  }

  private renderGeneralGroup(containerEl: HTMLElement): void {
    const { settings } = this.host;
    new Setting(containerEl).setHeading().setName(t("settings.general.heading"));

    new Setting(containerEl)
      .setName(t("settings.general.folder"))
      .setDesc(t("settings.general.folderDesc"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.general.folderPlaceholder"))
          .setValue(settings.scriptsFolder)
          .onChange(async (v) => {
            settings.scriptsFolder = normalizeFolder(v);
            await this.host.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.general.timeout"))
      .setDesc(t("settings.general.timeoutDesc"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.max = "3600";
        text.setValue(String(settings.defaultTimeoutSeconds));
        text.onChange(async (val) => {
          const num = Number.parseInt(val, 10);
          if (Number.isFinite(num) && num >= 1 && num <= 3600) {
            text.inputEl.removeClass("has-error");
            settings.defaultTimeoutSeconds = num;
            await this.host.saveSettings();
          } else {
            text.inputEl.addClass("has-error");
          }
        });
      });

    new Setting(containerEl)
      .setName(t("settings.general.history"))
      .setDesc(t("settings.general.historyDesc"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "10";
        text.inputEl.max = "1000";
        text.setValue(String(settings.maxHistoryEntries));
        text.onChange(async (val) => {
          const num = Number.parseInt(val, 10);
          if (Number.isFinite(num) && num >= 10 && num <= 1000) {
            text.inputEl.removeClass("has-error");
            settings.maxHistoryEntries = num;
            await this.host.saveSettings();
          } else {
            text.inputEl.addClass("has-error");
          }
        });
      });

    new Setting(containerEl)
      .setName(t("settings.general.autoOpen"))
      .setDesc(t("settings.general.autoOpenDesc"))
      .addToggle((toggle) => {
        toggle.setValue(settings.autoOpenMonitorOnRun).onChange(async (val) => {
          settings.autoOpenMonitorOnRun = val;
          await this.host.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t("settings.general.starter"))
      .setDesc(t("settings.general.starterDesc"))
      .addToggle((toggle) => {
        toggle.setValue(settings.installStarterPack).onChange(async (val) => {
          settings.installStarterPack = val;
          await this.host.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t("settings.general.starterReinstall"))
      .setDesc(t("settings.general.starterReinstallDesc"))
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.general.starterReinstallBtn"))
          .setIcon("rotate-ccw")
          .onClick(async () => {
            const count = await this.host.reinstallStarterScripts();
            new Notice(
              count > 0
                ? t("core.notice.starterInstalled", { count, folder: settings.scriptsFolder })
                : t("core.notice.starterNone"),
            );
            this.display();
          }),
      );
  }

  private renderLoadedScriptsGroup(containerEl: HTMLElement): void {
    new Setting(containerEl).setHeading().setName(t("settings.status.heading"));

    const loaded = this.host.getLoadResult();
    const count = loaded?.scripts.length ?? 0;
    const problems = loaded?.problems ?? [];

    new Setting(containerEl)
      .setName(t("settings.status.summary", { count, folder: this.host.settings.scriptsFolder }))
      .setDesc(
        problems.length === 0
          ? t("settings.status.noProblems")
          : t("settings.status.problemsCount", { count: problems.length }),
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.status.newScript"))
          .setIcon("plus")
          .onClick(() => this.host.openScriptEditorModal()),
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.status.reload"))
          .setIcon("refresh-cw")
          .onClick(async () => {
            await this.host.reloadScripts();
            this.display();
          }),
      );

    for (const script of loaded?.scripts ?? []) {
      const setting = new Setting(containerEl)
        .setName(`${script.name} (${script.scriptId})`)
        .setDesc(`[${script.category} | ${script.runtime}] ${script.description} (${script.notePath})`);
      setting.nameEl.addClass("ais-mono");
      setting
        .addExtraButton((btn) =>
          btn
            .setIcon("play")
            .setTooltip(t("settings.status.run"))
            .onClick(() => this.host.openManualRunModal(script.scriptId)),
        )
        .addExtraButton((btn) =>
          btn
            .setIcon("pencil")
            .setTooltip(t("settings.status.edit"))
            .onClick(() => this.host.openScriptEditorModal(script)),
        )
        .addExtraButton((btn) =>
          btn
            .setIcon("file-text")
            .setTooltip(t("settings.status.openNote"))
            .onClick(() => void this.host.openNote(script.notePath)),
        );
    }

    for (const problem of problems) {
      const label = problem.level === "error" ? t("settings.status.levelError") : t("settings.status.levelWarning");
      const setting = new Setting(containerEl)
        .setName(`${label}: ${problem.path}`)
        .setDesc(problem.message);
      const iconSpan = createSpan({
        cls: `ais-status-icon ${problem.level === "error" ? "ais-status-error" : "ais-status-waiting"}`,
      });
      setIcon(iconSpan, problem.level === "error" ? "x-circle" : "alert-triangle");
      setting.nameEl.prepend(iconSpan);
    }
  }
}
