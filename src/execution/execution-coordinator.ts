// Orchestrates active script executions, parameter gatekeeping, live streaming updates,
// process cancellation (kill), and in-memory execution history.

import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
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
import type { ActivityHandle } from "../ecosystem/types";
import {
  MEMORY_BUFFER_CAP,
  SpillFile,
  appendCapped,
  pruneSpillDir,
  truncateHeadTail,
} from "./output-limiter";

/** Maximum number of log lines kept per run for the monitor. */
const MAX_RECORD_LINES = 20000;

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

export class ScriptDocstringMissingError extends Error {
  readonly status = 400;

  constructor(scriptId: string, path: string) {
    super(
      `Execution blocked: Script "${scriptId}" at "${path}" does not have a valid docstring header with YAML metadata (id, params).`,
    );
    this.name = "ScriptDocstringMissingError";
  }
}

export interface RunOptions {
  /** Max characters of stdout/stderr returned in the response; the full output is spilled to a file. */
  maxOutput?: number;
}

interface ActiveRunContext {
  record: ExecutionRecord;
  controller: AbortController;
  activityHandle?: ActivityHandle;
}

export interface ExecutionCoordinatorDeps {
  registry: ScriptRegistry;
  validator: ParamValidator;
  formatter: PayloadFormatter;
  bridge: ProcessBridge;
  getMaxHistoryEntries?: () => number;
  /** Absolute folder where complete outputs are spilled. Defaults to a folder under the OS temp dir. */
  getRunsDir?: () => string | undefined;
  onRunStarted?: (record: ExecutionRecord) => void;
  beginActivity?: (entry: {
    client?: string;
    type: string;
    target: string;
    payload?: unknown;
    alert?: boolean;
  }) => ActivityHandle | undefined;
  logActivity?: (entry: {
    client?: string;
    type: string;
    target: string;
    status: number;
    durationMs: number;
    payload?: unknown;
    response?: unknown;
    output?: string;
    alert?: boolean;
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
  private prunedRunsDir = false;

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
    return this.runDefinition(script, request.params, request.client, request.timeoutSecondsOverride, {
      maxOutput: request.maxOutput,
    });
  }

  async runDefinition(
    script: ScriptDefinition,
    rawParams?: Record<string, unknown>,
    client = "Manual",
    timeoutSecondsOverride?: number,
    options: RunOptions = {},
  ): Promise<RunScriptResponse> {
    const maxOutput =
      typeof options.maxOutput === "number" && Number.isFinite(options.maxOutput) && options.maxOutput >= 1
        ? Math.floor(options.maxOutput)
        : undefined;
    // 1. Gatekeeper validation BEFORE formatting payload or spawning any OS process
    const validation = this.deps.validator.validate(script, rawParams ?? {});
    if (!validation.valid) {
      this.deps.logActivity?.({
        client,
        type: "Script Run",
        target: `${script.scriptId} (${script.scriptPath ?? script.notePath})`,
        status: 400,
        durationMs: 0,
        payload: rawParams,
        response: { error: validation.issues.map((i) => i.message).join("; "), issues: validation.issues },
      });
      throw new ScriptValidationError(script.name, validation.issues);
    }

    // 1b. Verify that code files on disk contain valid docstring headers before execution
    if (script.scriptPath && /\.(py|sh|ps1|js|mjs|ts)$/i.test(script.scriptPath)) {
      try {
        const vaultBase = this.deps.bridge.getVaultBasePath();
        const absPath = vaultBase ? `${vaultBase}/${script.scriptPath}`.replace(/\\/g, "/") : script.scriptPath;
        const fsModule = await import("node:fs");
        if (fsModule.existsSync(absPath)) {
          const content = fsModule.readFileSync(absPath, { encoding: "utf8" });
          if (!/---\s*\r?\n(id:\s*[\s\S]*?\r?\n)---/.test(content)) {
            throw new ScriptDocstringMissingError(script.scriptId, script.scriptPath);
          }
        }
      } catch (err) {
        if (err instanceof ScriptDocstringMissingError) {
          this.deps.logActivity?.({
            client,
            type: "Script Run",
            target: `${script.scriptId} (${script.scriptPath})`,
            status: 400,
            durationMs: 0,
            payload: rawParams,
            response: { error: err.message },
          });
          throw err;
        }
        // Non-blocking if file read check fails due to path resolver
      }
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

    const activityHandle = this.deps.beginActivity?.({
      client,
      type: "Script Run",
      target: `${script.scriptId} (${script.scriptPath ?? script.notePath})`,
      payload: redactedParams,
    });

    const controller = new AbortController();
    this.activeRuns.set(runId, { record, controller, activityHandle });
    this.deps.onRunStarted?.(record);
    this.emit({ type: "started", record });

    const runsDir = (): string => this.deps.getRunsDir?.() ?? path.join(os.tmpdir(), "ai-scripts-runs");
    const spills: Partial<Record<"stdout" | "stderr", SpillFile>> = {};
    const memoryDropped = { stdout: false, stderr: false };
    const spillFor = (stream: "stdout" | "stderr"): SpillFile => {
      let spill = spills[stream];
      if (!spill) {
        if (!this.prunedRunsDir) {
          this.prunedRunsDir = true;
          pruneSpillDir(runsDir());
        }
        spill = new SpillFile(path.join(runsDir(), `${runId}.${stream === "stdout" ? "out" : "err"}`));
        spills[stream] = spill;
      }
      return spill;
    };

    const appendStream = (stream: "stdout" | "stderr", chunk: string): void => {
      const cleanChunk = this.deps.bridge.redact(chunk);
      activityHandle?.appendOutput(stream, cleanChunk);
      const before = record[stream];
      const res = appendCapped(before, cleanChunk, MEMORY_BUFFER_CAP);
      record[stream] = res.value;
      if (res.dropped) {
        memoryDropped[stream] = true;
        const spill = spillFor(stream);
        if (!spill.isOpen) spill.open(before);
        spill.write(cleanChunk);
      }
      record.durationMs = Date.now() - startedAt;

      for (const textLine of splitLines(cleanChunk)) {
        if (record.lines.length >= MAX_RECORD_LINES) break;
        const line: ExecutionLogLine = {
          timestamp: Date.now(),
          stream,
          text: textLine,
        };
        record.lines.push(line);
        this.emit({ type: "output", record, line });
      }
    };

    const adoptFinalOutput = (stream: "stdout" | "stderr", text: string): void => {
      const res = appendCapped("", text, MEMORY_BUFFER_CAP);
      record[stream] = res.value;
      if (res.dropped) {
        memoryDropped[stream] = true;
        spillFor(stream).open(text);
      }
    };

    type OutputPart = Pick<RunScriptResponse, "stdout" | "stderr" | "truncated" | "stdoutFile" | "stderrFile">;
    const finishOutput = async (): Promise<OutputPart> => {
      const out: OutputPart = { stdout: record.stdout, stderr: record.stderr };
      for (const stream of ["stdout", "stderr"] as const) {
        const text = record[stream];
        const tooLong = maxOutput !== undefined && text.length > maxOutput;
        const overLimit = memoryDropped[stream] || tooLong;
        let file: string | undefined;
        const existing = spills[stream];
        if (existing?.isOpen) {
          if (await existing.close()) file = existing.filePath;
        } else if (overLimit) {
          const spill = spillFor(stream);
          spill.open(text);
          if (await spill.close()) file = spill.filePath;
        }
        if (tooLong) out[stream] = truncateHeadTail(text, maxOutput).text;
        if (overLimit) {
          out.truncated = true;
          if (file) out[stream === "stdout" ? "stdoutFile" : "stderrFile"] = this.displayPath(file);
        }
      }
      return out;
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
      for (const stream of ["stdout", "stderr"] as const) {
        const full = execResult[stream];
        if (!record[stream] && full) adoptFinalOutput(stream, this.deps.bridge.redact(full));
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
        durationMs: record.durationMs,
        ...(await finishOutput()),
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
        durationMs: record.durationMs,
        ...(await finishOutput()),
      };
    } finally {
      await formatted.cleanup();
    }
  }

  /** Vault-relative path (forward slashes) when the file lives inside the vault, absolute otherwise. */
  private displayPath(file: string): string {
    const base = this.deps.bridge.getVaultBasePath();
    if (base) {
      const rel = path.relative(base, file);
      if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return rel.split(path.sep).join("/");
    }
    return file;
  }

  private finalizeRecord(record: ExecutionRecord): void {
    const activeCtx = this.activeRuns.get(record.runId);
    this.activeRuns.delete(record.runId);
    this.historyRuns.unshift(record);
    const maxHistory = this.deps.getMaxHistoryEntries?.() ?? 100;
    if (this.historyRuns.length > maxHistory) {
      this.historyRuns.length = maxHistory;
    }

    const status = record.status === "succeeded" ? 200 : record.status === "cancelled" ? 499 : 500;
    const response = {
      runId: record.runId,
      status: record.status,
      exitCode: record.exitCode,
    };

    if (activeCtx?.activityHandle) {
      activeCtx.activityHandle.end({
        status,
        durationMs: record.durationMs,
        response,
      });
    } else {
      this.deps.logActivity?.({
        client: record.client,
        type: "Script Run",
        target: `${record.scriptId} (${record.targetPath})`,
        status,
        durationMs: record.durationMs,
        payload: record.params,
        output: record.stdout + (record.stderr ? "\n" + record.stderr : ""),
        response,
      });
    }

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
