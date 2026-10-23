// Types for script execution records, streaming output, and the Service Bus contract.

import type { ScriptDefinition, ScriptInputMode, ScriptRuntime, ScriptSummary } from "./script-types";

export type ExecutionStatus = "running" | "succeeded" | "failed" | "cancelled";

export interface ExecutionLogLine {
  timestamp: number;
  stream: "stdout" | "stderr";
  /** Redacted text line. */
  text: string;
}

export interface ExecutionRecord {
  runId: string;
  scriptId: string;
  scriptName: string;
  category: string;
  runtime: ScriptRuntime;
  inputMode: ScriptInputMode;
  targetPath: string;
  client: string;
  /** Redacted and normalized parameters. */
  params: Record<string, unknown>;
  status: ExecutionStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs: number;
  exitCode?: number;
  stdout: string;
  stderr: string;
  lines: ExecutionLogLine[];
  errorMessage?: string;
}

export interface RunScriptRequest {
  scriptId: string;
  params?: Record<string, unknown>;
  client?: string;
  timeoutSecondsOverride?: number;
  /** Max characters of stdout/stderr in the response. Omitted: no truncation. */
  maxOutput?: number;
}

export interface RunScriptResponse {
  runId: string;
  success: boolean;
  status: ExecutionStatus;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  /** True when stdout or stderr in this response is shorter than the real output. */
  truncated?: boolean;
  /** Path of the file holding the complete stdout (vault-relative when inside the vault). */
  stdoutFile?: string;
  stderrFile?: string;
}

export type ExecutionEventType = "started" | "output" | "finished" | "cleared";

export interface ExecutionEvent {
  type: ExecutionEventType;
  record?: ExecutionRecord;
  line?: ExecutionLogLine;
}

export type ExecutionListener = (event: ExecutionEvent) => void;

/** Service contract registered on the AI Ecosystem Service Bus under "scripts". */
export interface ScriptsServiceContract {
  listScripts(category?: string): Promise<ScriptSummary[]>;
  getScriptSchema(scriptId: string): Promise<{
    scriptId: string;
    name: string;
    category: string;
    description: string;
    runtime: ScriptRuntime;
    inputMode: ScriptInputMode;
    timeoutSeconds: number;
    exposeAsTool: boolean;
    scriptPath?: string;
    notePath: string;
    params: ScriptDefinition["params"];
    jsonSchema: Record<string, unknown>;
    exampleParams: Record<string, unknown>;
    instructions: string;
  }>;
  runScript(
    scriptId: string,
    params?: Record<string, unknown>,
    client?: string,
  ): Promise<RunScriptResponse>;
  cancelRun(runId: string): boolean;
  listActiveRuns(): ExecutionRecord[];
  listHistoryRuns(): ExecutionRecord[];
}
