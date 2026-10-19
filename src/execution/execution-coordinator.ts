// Orchestrates active script executions, parameter gatekeeping, live streaming updates,
// process cancellation (kill), and in-memory execution history.

import * as crypto from "node:crypto";
import type {
  ExecutionEvent,
  ExecutionListener,
  ExecutionLogLine,
  ExecutionRecord,
  RunScriptRequest,
  RunScriptResponse,
} from "../types/execution-types";
import type { ScriptDefinition, ValidationIssue } from "../types/script-types";
import type { ScriptRegistry } from "../scripts/script-registry";
import type { ParamValidator } from "../validation/param-validator";
import type { PayloadFormatter } from "./payload-formatter";
import type { ProcessBridge } from "./process-bridge";

export class ScriptNotFoundError extends Error {
  readonly status = 404;
  readonly availableIds: string[];

  constructor(scriptId: string, availableIds: string[]) {
    const suffix = availableIds.length > 0 ? ` Available scripts: ${availableIds.join(", ")}.` : "";
    super(`Script "${scriptId}" was not found.${suffix}`);
    this.name = "ScriptNotFoundError";
    this.availableIds = availableIds;
  }
}

export class ScriptValidationError extends Error {
  readonly status = 400;
  readonly issues: ValidationIssue[];

  constructor(scriptName: string, issues: ValidationIssue[]) {
    super(issues.map((i) => i.message).join(" "));
    this.name = "ScriptValidationError";
    this.issues = issues;
  }
}

interface ActiveRunContext {
  record: ExecutionRecord;
  controller: AbortController;
}

export interface ExecutionCoordinatorDeps {
  registry: ScriptRegistry;
  validator: ParamValidator;
  formatter: PayloadFormatter;
  bridge: ProcessBridge;
  getMaxHistoryEntries?: () => number;
  onRunStarted?: (record: ExecutionRecord) => void;
  logActivity?: (entry: {
    client?: string;
    type: string;
    target: string;
    status: number;
    durationMs: number;
    payload?: unknown;
    response?: unknown;
  }) => void;
}

function redactParamsObject(
  params: Record<string, unknown>,
  redactFn: (s: string) => string,
): Record<string, unknown> {
  try {
    const serialized = JSON.stringify(params);
    return JSON.parse(redactFn(serialized)) as Record<string, unknown>;
  } catch {
    return params;
  }
}

function splitLines(chunk: string): string[] {
  const normalized = chunk.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");
  if (parts.length > 1 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  return parts;
}

export class ExecutionCoordinator {
  private readonly activeRuns = new Map<string, ActiveRunContext>();
  private readonly historyRuns: ExecutionRecord[] = [];
  private readonly listeners = new Set<ExecutionListener>();

  constructor(private readonly deps: ExecutionCoordinatorDeps) {}

  subscribe(listener: ExecutionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  listActiveRuns(): ExecutionRecord[] {
    return [...this.activeRuns.values()].map((ctx) => ctx.record);
  }

  listHistoryRuns(): ExecutionRecord[] {
    return [...this.historyRuns];
  }

  getRun(runId: string): ExecutionRecord | undefined {
    return this.activeRuns.get(runId)?.record ?? this.historyRuns.find((r) => r.runId === runId);
  }

  cancelRun(runId: string): boolean {
    const active = this.activeRuns.get(runId);
    if (!active) return false;
    active.controller.abort();
    return true;
  }

  cancelAll(): number {
    let count = 0;
    for (const active of this.activeRuns.values()) {
      active.controller.abort();
      count++;
    }
    return count;
  }

  clearHistory(): void {
    this.historyRuns.length = 0;
    this.emit({ type: "cleared" });
  }

  async run(request: RunScriptRequest): Promise<RunScriptResponse> {
    const scriptId = typeof request.scriptId === "string" ? request.scriptId.trim() : "";
    const script = this.deps.registry.get(scriptId);
    if (!script) {
      throw new ScriptNotFoundError(
        scriptId,
        this.deps.registry.listAll().map((s) => s.scriptId),
      );
    }
    return this.runDefinition(script, request.params, request.client, request.timeoutSecondsOverride);
  }

  async runDefinition(
    script: ScriptDefinition,
    rawParams?: Record<string, unknown>,
    client = "Manual",
    timeoutSecondsOverride?: number,
  ): Promise<RunScriptResponse> {
    // 1. Gatekeeper validation BEFORE formatting payload or spawning any OS process
    const validation = this.deps.validator.validate(script, rawParams ?? {});
    if (!validation.valid) {
      throw new ScriptValidationError(script.name, validation.issues);
    }

    const normalizedParams = validation.normalizedParams;
    const redactedParams = redactParamsObject(normalizedParams, (t) => this.deps.bridge.redact(t));

    // 2. Format input payload (stdin / cli_args / temp_file)
    const formatted = await this.deps.formatter.format(script.inputMode, normalizedParams, script.params);

    const runId = `run_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const startedAt = Date.now();
    const record: ExecutionRecord = {
      runId,
      scriptId: script.scriptId,
      scriptName: script.name,
      category: script.category,
      runtime: script.runtime,
      inputMode: script.inputMode,
      targetPath: script.scriptPath ?? script.notePath,
      client,
      params: redactedParams,
      status: "running",
      startedAt,
      durationMs: 0,
      stdout: "",
      stderr: "",
      lines: [],
    };

    const controller = new AbortController();
    this.activeRuns.set(runId, { record, controller });
    this.deps.onRunStarted?.(record);
    this.emit({ type: "started", record });

    const appendStream = (stream: "stdout" | "stderr", chunk: string): void => {
      const cleanChunk = this.deps.bridge.redact(chunk);
      if (stream === "stdout") {
        record.stdout += cleanChunk;
      } else {
        record.stderr += cleanChunk;
      }
      record.durationMs = Date.now() - startedAt;

      for (const textLine of splitLines(cleanChunk)) {
        const line: ExecutionLogLine = {
          timestamp: Date.now(),
          stream,
          text: textLine,
        };
        record.lines.push(line);
        this.emit({ type: "output", record, line });
      }
    };

    try {
      const execResult = await this.deps.bridge.execute({
        script,
        args: formatted.args,
        stdin: formatted.stdin,
        timeoutSeconds: timeoutSecondsOverride ?? script.timeoutSeconds,
        signal: controller.signal,
        onStdout: (chunk) => appendStream("stdout", chunk),
        onStderr: (chunk) => appendStream("stderr", chunk),
      });

      const finishedAt = Date.now();
      record.finishedAt = finishedAt;
      record.durationMs = execResult.durationMs || finishedAt - startedAt;
      record.exitCode = execResult.exitCode;
      if (!record.stdout && execResult.stdout) {
        record.stdout = this.deps.bridge.redact(execResult.stdout);
      }
      if (!record.stderr && execResult.stderr) {
        record.stderr = this.deps.bridge.redact(execResult.stderr);
      }

      if (controller.signal.aborted || execResult.killed) {
        record.status = "cancelled";
      } else if (execResult.exitCode === 0) {
        record.status = "succeeded";
      } else {
        record.status = "failed";
      }

      this.finalizeRecord(record);

      return {
        runId,
        success: record.status === "succeeded",
        status: record.status,
        exitCode: execResult.exitCode,
        stdout: record.stdout,
        stderr: record.stderr,
        durationMs: record.durationMs,
      };
    } catch (err) {
      const finishedAt = Date.now();
      const message = this.deps.bridge.redact(err instanceof Error ? err.message : String(err));
      record.finishedAt = finishedAt;
      record.durationMs = finishedAt - startedAt;
      record.exitCode = -1;
      record.errorMessage = message;
      record.stderr = record.stderr ? `${record.stderr}\n${message}` : message;
      record.status = controller.signal.aborted ? "cancelled" : "failed";
      record.lines.push({
        timestamp: finishedAt,
        stream: "stderr",
        text: message,
      });

      this.finalizeRecord(record);

      return {
        runId,
        success: false,
        status: record.status,
        exitCode: -1,
        stdout: record.stdout,
        stderr: record.stderr,
        durationMs: record.durationMs,
      };
    } finally {
      await formatted.cleanup();
    }
  }

  private finalizeRecord(record: ExecutionRecord): void {
    this.activeRuns.delete(record.runId);
    this.historyRuns.unshift(record);
    const maxHistory = this.deps.getMaxHistoryEntries?.() ?? 100;
    if (this.historyRuns.length > maxHistory) {
      this.historyRuns.length = maxHistory;
    }

    this.deps.logActivity?.({
      client: record.client,
      type: "Script Run",
      target: `${record.scriptId} (${record.targetPath})`,
      status: record.status === "succeeded" ? 200 : record.status === "cancelled" ? 499 : 500,
      durationMs: record.durationMs,
      payload: record.params,
      response: {
        runId: record.runId,
        status: record.status,
        exitCode: record.exitCode,
      },
    });

    this.emit({ type: "finished", record });
  }

  private emit(event: ExecutionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore UI listener errors.
      }
    }
  }
}
