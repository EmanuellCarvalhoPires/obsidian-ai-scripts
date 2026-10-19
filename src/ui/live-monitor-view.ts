// Official Obsidian ItemView for the real-time AI Script Monitor panel.
// Zero emojis; 100% native Lucide icons via setIcon().

import { ItemView, Notice, setIcon } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type { ExecutionCoordinator } from "../execution/execution-coordinator";
import { t } from "../i18n";
import type { ExecutionEvent, ExecutionRecord } from "../types/execution-types";
import { ActiveRunCard } from "./components/active-run-card";
import { HistoryRunCard } from "./components/history-run-card";

export const VIEW_TYPE_SCRIPT_MONITOR = "ai-scripts-live-view";

export interface ScriptMonitorViewDeps {
  coordinator: ExecutionCoordinator;
  onOpenManualRun: (initialScriptId?: string, initialParams?: Record<string, unknown>) => void;
  onOpenScriptEditor: () => void;
}

export class ScriptMonitorView extends ItemView {
  private unsubscribe?: () => void;
  private autoScroll = true;

  private activeCountTextEl!: HTMLElement;
  private succeededCountTextEl!: HTMLElement;
  private failedCountTextEl!: HTMLElement;
  private autoScrollBtnEl!: HTMLButtonElement;
  private activeListEl!: HTMLElement;
  private historyListEl!: HTMLElement;
  private readonly activeCards = new Map<string, ActiveRunCard>();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly deps: ScriptMonitorViewDeps,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_SCRIPT_MONITOR;
  }

  getDisplayText(): string {
    return t("monitor.title");
  }

  getIcon(): string {
    return "terminal";
  }

  onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("ais-monitor");

    this.buildTopToolbar(root);
    this.buildSummaryBar(root);

    const sectionsWrap = root.createDiv({ cls: "ais-monitor-sections" });

    const activeSection = sectionsWrap.createDiv({ cls: "ais-monitor-section" });
    activeSection.createDiv({ cls: "ais-section-heading", text: t("monitor.activeHeading") });
    this.activeListEl = activeSection.createDiv({ cls: "ais-card-list" });

    const historySection = sectionsWrap.createDiv({ cls: "ais-monitor-section" });
    historySection.createDiv({ cls: "ais-section-heading", text: t("monitor.historyHeading") });
    this.historyListEl = historySection.createDiv({ cls: "ais-card-list" });

    this.unsubscribe = this.deps.coordinator.subscribe((event) => this.handleExecutionEvent(event));

    this.registerInterval(
      window.setInterval(() => {
        const now = Date.now();
        for (const card of this.activeCards.values()) {
          card.updateTimer(now);
        }
      }, 1000),
    );

    this.renderAll();
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.activeCards.clear();
    return Promise.resolve();
  }

  private buildTopToolbar(root: HTMLElement): void {
    const bar = root.createDiv({ cls: "ais-monitor-toolbar" });

    const titleGroup = bar.createDiv({ cls: "ais-monitor-title-group" });
    const termIcon = titleGroup.createSpan({ cls: "ais-icon" });
    setIcon(termIcon, "terminal");
    titleGroup.createSpan({ cls: "ais-monitor-title", text: t("monitor.title") });

    const actions = bar.createDiv({ cls: "ais-monitor-actions" });

    const runBtn = actions.createEl("button", {
      cls: "ais-btn ais-btn-primary",
      attr: { "aria-label": t("monitor.runBtn") },
    });
    setIcon(runBtn.createSpan({ cls: "ais-icon" }), "play");
    runBtn.createSpan({ text: t("monitor.runBtn") });
    this.registerDomEvent(runBtn, "click", () => this.deps.onOpenManualRun());

    const newBtn = actions.createEl("button", {
      cls: "ais-btn",
      attr: { "aria-label": t("monitor.newBtn") },
    });
    setIcon(newBtn.createSpan({ cls: "ais-icon" }), "plus");
    newBtn.createSpan({ text: t("monitor.newBtn") });
    this.registerDomEvent(newBtn, "click", () => this.deps.onOpenScriptEditor());

    this.autoScrollBtnEl = actions.createEl("button", {
      cls: "ais-btn",
    });
    this.syncAutoScrollButton();
    this.registerDomEvent(this.autoScrollBtnEl, "click", () => {
      this.autoScroll = !this.autoScroll;
      this.syncAutoScrollButton();
    });

    const clearBtn = actions.createEl("button", {
      cls: "ais-btn",
      attr: { "aria-label": t("monitor.clearBtn") },
    });
    setIcon(clearBtn.createSpan({ cls: "ais-icon" }), "trash-2");
    clearBtn.createSpan({ text: t("monitor.clearBtn") });
    this.registerDomEvent(clearBtn, "click", () => {
      this.deps.coordinator.clearHistory();
    });
  }

  private buildSummaryBar(root: HTMLElement): void {
    const bar = root.createDiv({ cls: "ais-monitor-summary" });

    const activePill = bar.createDiv({ cls: "ais-summary-pill ais-status-running" });
    setIcon(activePill.createSpan({ cls: "ais-icon" }), "loader-2");
    this.activeCountTextEl = activePill.createSpan();

    const succeededPill = bar.createDiv({ cls: "ais-summary-pill ais-status-succeeded" });
    setIcon(succeededPill.createSpan({ cls: "ais-icon" }), "check-circle-2");
    this.succeededCountTextEl = succeededPill.createSpan();

    const failedPill = bar.createDiv({ cls: "ais-summary-pill ais-status-failed" });
    setIcon(failedPill.createSpan({ cls: "ais-icon" }), "alert-octagon");
    this.failedCountTextEl = failedPill.createSpan();
  }

  private syncAutoScrollButton(): void {
    if (!this.autoScrollBtnEl) return;
    this.autoScrollBtnEl.empty();
    const label = this.autoScroll ? t("monitor.autoScrollOn") : t("monitor.autoScrollOff");
    this.autoScrollBtnEl.setAttr("aria-label", label);
    this.autoScrollBtnEl.setAttr("title", label);
    setIcon(this.autoScrollBtnEl.createSpan({ cls: "ais-icon" }), this.autoScroll ? "pause" : "play");
  }

  private handleExecutionEvent(event: ExecutionEvent): void {
    if (event.type === "output" && event.record && event.line) {
      const card = this.activeCards.get(event.record.runId);
      if (card) {
        card.appendLine(event.line);
        card.updateTimer();
        return;
      }
    }
    this.renderAll();
  }

  renderAll(): void {
    const activeRuns = this.deps.coordinator.listActiveRuns();
    const historyRuns = this.deps.coordinator.listHistoryRuns();

    const succeededCount = historyRuns.filter((r) => r.status === "succeeded").length;
    const failedCount = historyRuns.filter((r) => r.status !== "succeeded").length;

    if (this.activeCountTextEl) {
      this.activeCountTextEl.setText(t("monitor.countActive", { count: activeRuns.length }));
    }
    if (this.succeededCountTextEl) {
      this.succeededCountTextEl.setText(t("monitor.countSucceeded", { count: succeededCount }));
    }
    if (this.failedCountTextEl) {
      this.failedCountTextEl.setText(t("monitor.countFailed", { count: failedCount }));
    }

    this.renderActiveSection(activeRuns);
    this.renderHistorySection(historyRuns);
  }

  private renderActiveSection(activeRuns: ExecutionRecord[]): void {
    if (!this.activeListEl) return;
    this.activeListEl.empty();
    this.activeCards.clear();

    if (activeRuns.length === 0) {
      this.activeListEl.createDiv({ cls: "ais-empty-state", text: t("monitor.emptyActive") });
      return;
    }

    for (const record of activeRuns) {
      const card = new ActiveRunCard(this.activeListEl, {
        record,
        globalAutoScroll: () => this.autoScroll,
        onStop: (runId) => {
          const stopped = this.deps.coordinator.cancelRun(runId);
          if (stopped) {
            new Notice(t("core.notice.runCancelled", { name: record.scriptName }));
          }
        },
      });
      this.activeCards.set(record.runId, card);
    }
  }

  private renderHistorySection(historyRuns: ExecutionRecord[]): void {
    if (!this.historyListEl) return;
    this.historyListEl.empty();

    if (historyRuns.length === 0) {
      this.historyListEl.createDiv({ cls: "ais-empty-state", text: t("monitor.emptyHistory") });
      return;
    }

    for (const record of historyRuns) {
      new HistoryRunCard(this.historyListEl, {
        record,
        onRerun: (rec) => {
          this.deps.onOpenManualRun(rec.scriptId, rec.params);
        },
      });
    }
  }
}
