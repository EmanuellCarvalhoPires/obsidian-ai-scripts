// Entry point of the AI Scripts plugin.
import { FileSystemAdapter, Notice, Plugin, TAbstractFile, TFile, setIcon } from "obsidian";
import { EcosystemConnector } from "./ecosystem/connector";
import type { ConnectorStatus } from "./ecosystem/connector";
import { MissingEcosystemModal } from "./ecosystem/dependency-modal";
import { createSetupHandler, publishRuleData, registerSetupHandler } from "./ecosystem/hooks-integration";
import { AI_ECOSYSTEM_API_VERSION, toolRunnerServiceName } from "./ecosystem/types";
import { ExecutionCoordinator } from "./execution/execution-coordinator";
import { PayloadFormatter } from "./execution/payload-formatter";
import { MODULE_ID, ProcessBridge } from "./execution/process-bridge";
import { t } from "./i18n";
import { ObsidianScriptVaultPort, ScriptLoader } from "./scripts/script-loader";
import { ScriptRegistry } from "./scripts/script-registry";
import {
  MODULE_INSTRUCTIONS,
  ScriptsService,
  buildAllTools,
  buildRoutes,
} from "./tools/scripts-mcp-tools";
import { normalizeSettings } from "./types/script-types";
import type { AIScriptsSettings, ScriptDefinition, ScriptLoadResult } from "./types/script-types";
import { ManualRunModal } from "./ui/components/manual-run-modal";
import { ScriptEditorModal } from "./ui/components/script-editor-modal";
import { ScriptMonitorView, VIEW_TYPE_SCRIPT_MONITOR } from "./ui/live-monitor-view";
import { AIScriptsSettingTab } from "./ui/settings-tab";
import type { SettingsHost } from "./ui/settings-tab";
import { ParamValidator } from "./validation/param-validator";
import { ScriptToolRunner, buildScriptIndexEntries } from "./tools/tool-index";

function isScriptCandidateFile(file: TAbstractFile): file is TFile {
  return file instanceof TFile && /\.(md|py|sh|ps1|js|mjs|ts)$/i.test(file.path);
}

export default class AIScriptsPlugin extends Plugin implements SettingsHost {
  settings: AIScriptsSettings = normalizeSettings(undefined);

  private vaultPort!: ObsidianScriptVaultPort;
  private registry!: ScriptRegistry;
  private loader!: ScriptLoader;
  private validator!: ParamValidator;
  private formatter!: PayloadFormatter;
  private bridge!: ProcessBridge;
  private coordinator!: ExecutionCoordinator;
  private service!: ScriptsService;
  private toolRunner!: ScriptToolRunner;
  private connector!: EcosystemConnector;

  private settingTab: AIScriptsSettingTab | undefined;
  private statusBarEl: HTMLElement | undefined;
  private statusIconEl: HTMLElement | undefined;
  private statusTextEl: HTMLElement | undefined;
  private unsubscribeLoader: (() => void) | undefined;
  private unregisterSetupHandler: (() => void) | undefined;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());

    this.vaultPort = new ObsidianScriptVaultPort(this.app);
    this.registry = new ScriptRegistry();
    this.validator = new ParamValidator();
    this.formatter = new PayloadFormatter();

    this.loader = new ScriptLoader({
      vault: this.vaultPort,
      registry: this.registry,
      getFolder: () => this.settings.scriptsFolder,
      getDefaultTimeoutSeconds: () => this.settings.defaultTimeoutSeconds,
    });

    this.bridge = new ProcessBridge({
      getApi: () => this.connector?.getApi(),
      getVaultBasePath: () => {
        const adapter = this.app.vault.adapter;
        return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
      },
      getScriptsFolder: () => this.settings.scriptsFolder,
    });

    this.coordinator = new ExecutionCoordinator({
      registry: this.registry,
      validator: this.validator,
      formatter: this.formatter,
      bridge: this.bridge,
      getMaxHistoryEntries: () => this.settings.maxHistoryEntries,
      onRunStarted: () => {
        if (this.settings.autoOpenMonitorOnRun) {
          void this.openMonitorView();
        }
      },
      beginActivity: (entry) => {
        const api = this.connector?.getApi();
        if (!api || typeof api.beginActivity !== "function") return undefined;
        return api.beginActivity({
          moduleId: MODULE_ID,
          client: entry.client,
          type: entry.type,
          target: entry.target,
          payload: entry.payload,
          alert: entry.alert,
        });
      },
      logActivity: (entry) => {
        const api = this.connector?.getApi();
        if (!api) return;
        api.logActivity({
          moduleId: MODULE_ID,
          client: entry.client,
          type: entry.type,
          target: entry.target,
          status: entry.status,
          durationMs: entry.durationMs,
          payload: entry.payload,
          response: entry.response,
          output: entry.output,
          alert: entry.alert,
        });
      },
    });

    this.service = new ScriptsService(this.loader, this.registry, this.coordinator);
    this.toolRunner = new ScriptToolRunner(this.loader, this.registry, this.coordinator);

    this.unsubscribeLoader = this.loader.onLoaded(() => {
      this.updateStatusBar();
      this.settingTab?.refresh();
      const api = this.connector?.getApi();
      if (api) {
        this.publishHookRuleData();
        api.updateTools(
          MODULE_ID,
          buildAllTools(this.service, this.loader, this.registry, this.coordinator),
        );
        this.syncToolIndex();
        api.logActivity({
          moduleId: MODULE_ID,
          client: "Obsidian UI",
          type: "scripts-reloaded",
          target: `${this.registry.listAll().length} scripts`,
          status: 200,
          durationMs: 0,
          response: {
            scripts: this.registry.listAll().length,
            categories: this.registry.listCategories(),
          },
        });
      }
    });

    this.registerView(
      VIEW_TYPE_SCRIPT_MONITOR,
      (leaf) =>
        new ScriptMonitorView(leaf, {
          coordinator: this.coordinator,
          onOpenManualRun: (scriptId, params) => this.openManualRunModal(scriptId, params),
          onOpenScriptEditor: () => this.openScriptEditorModal(),
        }),
    );

    this.setupStatusBar();

    this.connector = new EcosystemConnector(this, {
      buildRegistration: () => ({
        id: MODULE_ID,
        name: this.manifest.name,
        version: this.manifest.version,
        apiVersion: AI_ECOSYSTEM_API_VERSION,
        tools: buildAllTools(this.service, this.loader, this.registry, this.coordinator),
        routes: buildRoutes(this.service, this.loader, this.registry, this.coordinator),
        instructions: MODULE_INSTRUCTIONS,
      }),
      onStatus: () => {
        this.updateStatusBar();
        this.settingTab?.refresh();
      },
      onMissing: () => new MissingEcosystemModal(this.app).open(),
      onIncompatible: (reason) => new Notice(reason),
      onConnected: (api) => {
        api.registerService("scripts", MODULE_ID, this.service);
        api.registerService(toolRunnerServiceName(MODULE_ID), MODULE_ID, this.toolRunner);
        this.syncToolIndex();
        this.publishHookRuleData();
        this.unregisterSetupHandler?.();
        this.unregisterSetupHandler = registerSetupHandler(
          api,
          createSetupHandler({
            getSettings: () => this.settings,
            saveSettings: () => this.saveSettings(),
            getScripts: () => this.registry.listAll(),
            folderExists: (path) => this.vaultPort.exists(path),
          }),
        );
      },
    });
    this.connector.start();

    this.registerVaultWatchers();

    this.addRibbonIcon("terminal", t("core.ribbon.monitor"), () => {
      void this.openMonitorView();
    });

    this.addCommand({
      id: "open-script-monitor",
      name: t("core.cmd.openMonitor"),
      callback: () => {
        void this.openMonitorView();
      },
    });

    this.addCommand({
      id: "run-script-manually",
      name: t("core.cmd.runScript"),
      callback: () => {
        this.openManualRunModal();
      },
    });

    this.addCommand({
      id: "create-script-note",
      name: t("core.cmd.createScript"),
      callback: () => {
        this.openScriptEditorModal();
      },
    });

    this.addCommand({
      id: "reload-scripts",
      name: t("core.cmd.reload"),
      callback: () => {
        void this.reloadScripts().then((res) => {
          const count = res.scripts.length;
          const problems = res.problems.length;
          new Notice(
            problems > 0
              ? t("core.notice.reloadedProblems", { count, problems })
              : t("core.notice.reloaded", { count }),
          );
        });
      },
    });

    this.settingTab = new AIScriptsSettingTab(this.app, this, this);
    this.addSettingTab(this.settingTab);

    if (this.app.workspace.layoutReady) {
      void this.loader.load();
    } else {
      this.app.workspace.onLayoutReady(() => {
        void this.loader.load();
      });
    }
  }

  onunload(): void {
    this.coordinator?.cancelAll();
    this.unsubscribeLoader?.();
    this.unregisterSetupHandler?.();
    this.connector?.stop();
  }

  // ---- SettingsHost ---------------------------------------------------------

  async saveSettings(): Promise<void> {
    try {
      await this.saveData(this.settings);
      this.loader.invalidate();
      void this.loader.load();
    } catch (err) {
      console.error("[AI Scripts] Could not save settings", err);
      new Notice(t("core.notice.saveFailed"));
    }
  }

  getConnectorStatus(): { status: ConnectorStatus; detail?: string } {
    return {
      status: this.connector.status,
      detail: this.connector.statusDetail,
    };
  }

  getLoadResult(): ScriptLoadResult | undefined {
    return this.loader.lastResult();
  }

  async reloadScripts(): Promise<ScriptLoadResult> {
    this.loader.invalidate();
    return this.loader.load();
  }

  async openMonitorView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_SCRIPT_MONITOR)[0];
    const leaf = existing ?? workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_SCRIPT_MONITOR, active: true });
    await workspace.revealLeaf(leaf);
  }

  openManualRunModal(initialScriptId?: string, initialParams?: Record<string, unknown>): void {
    void this.loader.load().then(() => {
      new ManualRunModal(this.app, {
        registry: this.registry,
        validator: this.validator,
        coordinator: this.coordinator,
        getScriptsFolder: () => this.settings.scriptsFolder,
        initialScriptId,
        initialParams,
        onStarted: () => {
          void this.openMonitorView();
        },
      }).open();
    });
  }

  openScriptEditorModal(existing?: ScriptDefinition): void {
    new ScriptEditorModal(this.app, {
      vault: this.vaultPort,
      loader: this.loader,
      getScriptsFolder: () => this.settings.scriptsFolder,
      existing,
      onSaved: () => {
        this.settingTab?.refresh();
      },
    }).open();
  }

  async openNote(path: string): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }

  // ---- Internals ------------------------------------------------------------

  /**
   * Writes the script catalog into the module's tools.db. Skipped until the catalog has loaded once,
   * so an early connection does not wipe the entries that a previous session wrote.
   */
  private syncToolIndex(): void {
    const api = this.connector?.getApi();
    if (!api?.toolIndex || !this.loader.lastResult()) return;
    const entries = buildScriptIndexEntries(this.registry.listAll());
    api.toolIndex.sync(MODULE_ID, entries).catch((err: unknown) => {
      console.error("[AI Scripts] Could not sync the tool index", err);
    });
  }

  private publishHookRuleData(): void {
    publishRuleData(this.connector?.getApi(), this.settings.scriptsFolder, this.registry.listAll());
  }

  private registerVaultWatchers(): void {
    const reloadIfScriptNote = (file: TAbstractFile, oldPath?: string): void => {
      const isCandidate =
        isScriptCandidateFile(file) ||
        (typeof oldPath === "string" && /\.(md|py|sh|ps1|js|mjs|ts)$/i.test(oldPath));
      if (isCandidate) {
        this.loader.invalidate();
        void this.loader.load();
      }
    };

    this.registerEvent(this.app.vault.on("create", (file) => reloadIfScriptNote(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => reloadIfScriptNote(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => reloadIfScriptNote(file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => reloadIfScriptNote(file, oldPath)));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => reloadIfScriptNote(file)));
  }

  private setupStatusBar(): void {
    const el = this.addStatusBarItem();
    el.addClass("ais-status-bar", "mod-clickable");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", t("core.status.aria"));
    this.statusIconEl = el.createSpan({ cls: "ais-status-bar-icon" });
    this.statusTextEl = el.createSpan({ cls: "ais-status-bar-text" });

    const activate = (): void => {
      void this.openMonitorView();
    };
    el.addEventListener("click", activate);
    el.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        activate();
      }
    });
    this.statusBarEl = el;
    this.updateStatusBar();
  }

  private updateStatusBar(): void {
    if (!this.statusBarEl || !this.statusIconEl || !this.statusTextEl) return;
    const status = this.connector?.status ?? "missing";
    const count = this.loader?.lastResult()?.scripts.length ?? 0;

    this.statusBarEl.removeClass("ais-state-connected", "ais-state-waiting", "ais-state-error");

    switch (status) {
      case "connected":
        this.statusBarEl.addClass("ais-state-connected");
        setIcon(this.statusIconEl, "terminal");
        this.statusTextEl.setText(t("core.status.connected", { count }));
        break;
      case "waiting":
        this.statusBarEl.addClass("ais-state-waiting");
        setIcon(this.statusIconEl, "clock");
        this.statusTextEl.setText(t("core.status.waiting"));
        break;
      case "disconnected":
        this.statusBarEl.addClass("ais-state-waiting");
        setIcon(this.statusIconEl, "plug-zap");
        this.statusTextEl.setText(t("core.status.disconnected"));
        break;
      case "incompatible":
        this.statusBarEl.addClass("ais-state-error");
        setIcon(this.statusIconEl, "x-circle");
        this.statusTextEl.setText(t("core.status.incompatible"));
        break;
      case "missing":
        this.statusBarEl.addClass("ais-state-error");
        setIcon(this.statusIconEl, "alert-triangle");
        this.statusTextEl.setText(t("core.status.missing"));
        break;
    }
  }
}
