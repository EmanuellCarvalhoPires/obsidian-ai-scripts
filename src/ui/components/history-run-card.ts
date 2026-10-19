// Collapsible history card for finished executions with Lucide status icon,
// duration, exit status badge, collapsible terminal output, and re-run button.

import { setIcon } from "obsidian";
import { t } from "../../i18n";
import type { ExecutionRecord } from "../../types/execution-types";
import { formatElapsedClock, runtimeLabel } from "./active-run-card";

export interface HistoryRunCardDeps {
  record: ExecutionRecord;
  onRerun: (record: ExecutionRecord) => void;
}

function statusVisual(record: ExecutionRecord): { icon: string; cls: string; label: string } {
  switch (record.status) {
    case "succeeded":
      return {
        icon: "check-circle-2",
        cls: "ais-status-succeeded",
        label: t("monitor.exitOk"),
      };
    case "cancelled":
      return {
        icon: "ban",
        cls: "ais-status-cancelled",
        label: t("monitor.exitCancelled"),
      };
    case "failed":
    default:
      return {
        icon: "alert-octagon",
        cls: "ais-status-failed",
        label: t("monitor.exitError", { code: record.exitCode ?? -1 }),
      };
  }
}

export class HistoryRunCard {
  readonly rootEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly toggleIconEl: HTMLElement;
  private expanded = false;

  constructor(
    container: HTMLElement,
    private readonly deps: HistoryRunCardDeps,
  ) {
    const { record } = deps;
    const visual = statusVisual(record);

    this.rootEl = container.createDiv({
      cls: `ais-run-card ais-run-card-history ${visual.cls}`,
      attr: { "data-run-id": record.runId },
    });

    const headerEl = this.rootEl.createDiv({ cls: "ais-run-card-header" });
    const leftEl = headerEl.createDiv({ cls: "ais-run-card-title-group" });

    this.toggleIconEl = leftEl.createSpan({ cls: "ais-icon ais-chevron" });
    setIcon(this.toggleIconEl, "chevron-right");

    const statusIconEl = leftEl.createSpan({ cls: `ais-icon ${visual.cls}` });
    setIcon(statusIconEl, visual.icon);

    leftEl.createSpan({
      cls: "ais-run-card-name",
      text: `${record.scriptName} (${runtimeLabel(record.runtime)})`,
    });

    leftEl.addEventListener("click", () => {
      this.expanded = !this.expanded;
      this.syncExpanded();
    });

    const rightEl = headerEl.createDiv({ cls: "ais-run-card-actions" });
    rightEl.createSpan({
      cls: "ais-run-timer ais-mono",
      text: `[${formatElapsedClock(record.durationMs)}] - ${visual.label}`,
    });

    const rerunBtn = rightEl.createEl("button", {
      cls: "ais-btn ais-btn-subtle",
      attr: { "aria-label": t("monitor.rerunBtn"), title: t("monitor.rerunBtn") },
    });
    const rerunIcon = rerunBtn.createSpan({ cls: "ais-icon" });
    setIcon(rerunIcon, "rotate-ccw");
    rerunBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      this.deps.onRerun(record);
    });

    this.bodyEl = this.rootEl.createDiv({ cls: "ais-run-card-body ais-hidden" });
    const metaEl = this.bodyEl.createDiv({ cls: "ais-run-meta" });
    metaEl.createDiv({
      cls: "ais-run-meta-line",
      text: `${t("monitor.client")}: ${record.client}  |  ${t("monitor.script")}: ${record.targetPath}`,
    });
    metaEl.createDiv({
      cls: "ais-run-meta-line ais-mono",
      text: `${t("monitor.params")}: ${JSON.stringify(record.params)}`,
    });

    const terminalEl = this.bodyEl.createDiv({ cls: "ais-terminal ais-mono" });
    if (record.lines.length === 0 && !record.stdout && !record.stderr) {
      terminalEl.createDiv({ cls: "ais-muted", text: t("monitor.noOutput") });
    } else if (record.lines.length > 0) {
      for (const line of record.lines) {
        const row = terminalEl.createDiv({
          cls: `ais-terminal-line ${line.stream === "stderr" ? "ais-terminal-stderr" : "ais-terminal-stdout"}`,
        });
        row.createSpan({ cls: "ais-terminal-prompt", text: "> " });
        row.createSpan({ cls: "ais-terminal-text", text: line.text });
      }
    } else {
      if (record.stdout) {
        const outRow = terminalEl.createDiv({ cls: "ais-terminal-line ais-terminal-stdout" });
        outRow.createSpan({ cls: "ais-terminal-text", text: record.stdout });
      }
      if (record.stderr) {
        const errRow = terminalEl.createDiv({ cls: "ais-terminal-line ais-terminal-stderr" });
        errRow.createSpan({ cls: "ais-terminal-text", text: record.stderr });
      }
    }
  }

  private syncExpanded(): void {
    this.bodyEl.toggleClass("ais-hidden", !this.expanded);
    setIcon(this.toggleIconEl, this.expanded ? "chevron-down" : "chevron-right");
  }
}
