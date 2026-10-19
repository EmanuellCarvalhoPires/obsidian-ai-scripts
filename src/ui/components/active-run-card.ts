// Expandable live process card with spinning Lucide loader-2 icon, elapsed timer,
// stop button (square icon), sanitized metadata, and streaming terminal with smart auto-scroll.

import { setIcon } from "obsidian";
import { t } from "../../i18n";
import type { ExecutionLogLine, ExecutionRecord } from "../../types/execution-types";

export function formatElapsedClock(durationMs: number): string {
  const totalSec = Math.max(0, Math.floor(durationMs / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function runtimeLabel(runtime: ExecutionRecord["runtime"]): string {
  switch (runtime) {
    case "python":
      return "Python";
    case "node":
      return "Node.js";
    case "bash":
      return "Bash";
    case "powershell":
      return "PowerShell";
  }
}

export interface ActiveRunCardDeps {
  record: ExecutionRecord;
  globalAutoScroll: () => boolean;
  onStop: (runId: string) => void;
}

export class ActiveRunCard {
  readonly rootEl: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly terminalEl: HTMLElement;
  private readonly toggleIconEl: HTMLElement;
  private expanded = true;
  private userScrolledUp = false;
  private renderedLineCount = 0;

  constructor(
    container: HTMLElement,
    private readonly deps: ActiveRunCardDeps,
  ) {
    const { record } = deps;
    this.rootEl = container.createDiv({
      cls: "ais-run-card ais-run-card-active",
      attr: { "data-run-id": record.runId },
    });

    const headerEl = this.rootEl.createDiv({ cls: "ais-run-card-header" });
    const leftEl = headerEl.createDiv({ cls: "ais-run-card-title-group" });

    this.toggleIconEl = leftEl.createSpan({ cls: "ais-icon ais-chevron" });
    setIcon(this.toggleIconEl, "chevron-down");

    const spinnerEl = leftEl.createSpan({ cls: "ais-icon ais-spin ais-status-running" });
    setIcon(spinnerEl, "loader-2");

    leftEl.createSpan({
      cls: "ais-run-card-name",
      text: `${record.scriptName} (${runtimeLabel(record.runtime)})`,
    });

    leftEl.addEventListener("click", () => {
      this.expanded = !this.expanded;
      this.syncExpanded();
    });

    const rightEl = headerEl.createDiv({ cls: "ais-run-card-actions" });
    this.timerEl = rightEl.createSpan({
      cls: "ais-run-timer ais-mono",
      text: formatElapsedClock(Date.now() - record.startedAt),
    });

    const stopBtn = rightEl.createEl("button", {
      cls: "ais-btn ais-btn-danger",
      attr: { "aria-label": t("monitor.stopBtn") },
    });
    const stopIcon = stopBtn.createSpan({ cls: "ais-icon" });
    setIcon(stopIcon, "square");
    stopBtn.createSpan({ text: t("monitor.stopBtn") });
    stopBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      stopBtn.disabled = true;
      this.deps.onStop(record.runId);
    });

    this.bodyEl = this.rootEl.createDiv({ cls: "ais-run-card-body" });
    const metaEl = this.bodyEl.createDiv({ cls: "ais-run-meta" });
    metaEl.createDiv({
      cls: "ais-run-meta-line",
      text: `${t("monitor.client")}: ${record.client}  |  ${t("monitor.script")}: ${record.targetPath}`,
    });
    metaEl.createDiv({
      cls: "ais-run-meta-line ais-mono",
      text: `${t("monitor.params")}: ${JSON.stringify(record.params)}`,
    });

    this.terminalEl = this.bodyEl.createDiv({ cls: "ais-terminal ais-mono" });
    this.terminalEl.addEventListener("scroll", () => {
      const threshold = 24;
      const atBottom =
        this.terminalEl.scrollHeight - this.terminalEl.scrollTop - this.terminalEl.clientHeight <= threshold;
      this.userScrolledUp = !atBottom;
    });

    this.appendMissingLines();
  }

  updateTimer(now = Date.now()): void {
    this.timerEl.setText(formatElapsedClock(now - this.deps.record.startedAt));
  }

  appendLine(line: ExecutionLogLine): void {
    this.renderSingleLine(line);
    this.renderedLineCount++;
    this.scrollToBottomIfAllowed();
  }

  appendMissingLines(): void {
    const lines = this.deps.record.lines;
    for (let i = this.renderedLineCount; i < lines.length; i++) {
      const line = lines[i];
      if (line) this.renderSingleLine(line);
    }
    this.renderedLineCount = lines.length;
    this.scrollToBottomIfAllowed();
  }

  private renderSingleLine(line: ExecutionLogLine): void {
    const row = this.terminalEl.createDiv({
      cls: `ais-terminal-line ${line.stream === "stderr" ? "ais-terminal-stderr" : "ais-terminal-stdout"}`,
    });
    row.createSpan({ cls: "ais-terminal-prompt", text: "> " });
    row.createSpan({ cls: "ais-terminal-text", text: line.text });
  }

  private scrollToBottomIfAllowed(): void {
    if (!this.userScrolledUp && this.deps.globalAutoScroll()) {
      this.terminalEl.scrollTop = this.terminalEl.scrollHeight;
    }
  }

  private syncExpanded(): void {
    this.bodyEl.toggleClass("ais-hidden", !this.expanded);
    setIcon(this.toggleIconEl, this.expanded ? "chevron-down" : "chevron-right");
  }
}
