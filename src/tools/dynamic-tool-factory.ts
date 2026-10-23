// Dynamically builds dedicated MCP tools (script_<script_id>) for scripts marked with expose_as_tool: true.

import type { HubCallContext, HubTool, HubToolResult } from "../ecosystem/types";
import type { ExecutionCoordinator } from "../execution/execution-coordinator";
import { ScriptNotFoundError, ScriptValidationError } from "../execution/execution-coordinator";
import { DEFAULT_MAX_OUTPUT } from "../execution/output-limiter";
import type { RunScriptResponse } from "../types/execution-types";
import type { ScriptRegistry } from "../scripts/script-registry";
import type { ScriptDefinition } from "../types/script-types";
import { DUPLICATE_MCP_SCRIPT_IDS } from "./script-catalog-meta";

/** Compact JSON in a single text block; no structuredContent, so the payload is not sent twice. */
export function formatToolSuccess(payload: Record<string, unknown>): HubToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

/** Parses a user-supplied max_output; undefined or invalid values fall back to the default. */
export function resolveMaxOutput(raw: unknown): number {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_MAX_OUTPUT;
}

/**
 * Lean response of a script run. On success: success, status, exitCode and stdout (stderr only if
 * not empty). On failure runId and durationMs are included too. Truncation adds truncated and *_file.
 */
export function buildRunPayload(result: RunScriptResponse): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    success: result.success,
    status: result.status,
    exitCode: result.exitCode,
    stdout: result.stdout,
  };
  if (result.stderr) payload.stderr = result.stderr;
  if (!result.success) {
    payload.runId = result.runId;
    payload.durationMs = result.durationMs;
  }
  if (result.truncated) {
    payload.truncated = true;
    if (result.stdoutFile) payload.stdout_file = result.stdoutFile;
    if (result.stderrFile) payload.stderr_file = result.stderrFile;
  }
  return payload;
}

export function formatToolError(err: unknown): HubToolResult {
  if (err instanceof ScriptValidationError) {
    const structured: Record<string, unknown> = {
      error: err.message,
      status: 400,
      issues: err.issues,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
      structuredContent: structured,
      isError: true,
    };
  }
  if (err instanceof ScriptNotFoundError) {
    const structured: Record<string, unknown> = {
      error: err.message,
      status: 404,
      available_scripts: err.availableIds,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
      structuredContent: structured,
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Runs a script definition with the arguments of an MCP call or of an indexed tools_run call.
 * max_output is either a parameter of the script itself or the response limit of the call.
 */
export async function runScriptDefinition(
  script: ScriptDefinition,
  args: Record<string, unknown>,
  client: string,
  coordinator: ExecutionCoordinator,
): Promise<RunScriptResponse> {
  const { max_output: rawMax, ...rest } = args;
  const ownsMaxOutput = "max_output" in script.params;
  return coordinator.runDefinition(
    script,
    ownsMaxOutput ? args : rest,
    client,
    undefined,
    { maxOutput: resolveMaxOutput(ownsMaxOutput ? undefined : rawMax) },
  );
}

export function buildDedicatedScriptTool(
  script: ScriptDefinition,
  coordinator: ExecutionCoordinator,
): HubTool {
  const toolName = `script_${script.scriptId}`;
  const descriptionParts = [
    script.description || `Runs the "${script.name}" (${script.runtime}) automation script.`,
    `Category: ${script.category} | Runtime: ${script.runtime} | Input mode: ${script.inputMode}.`,
  ];

  return {
    name: toolName,
    title: script.name,
    description: descriptionParts.join(" "),
    inputSchema: script.jsonSchema,
    annotations: {
      title: script.name,
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    // In indexado mode the script stays out of tools/list and is reached through tools_find / tools_run.
    exposicao: "indice",
    handler: async (args: Record<string, unknown>, ctx: HubCallContext): Promise<HubToolResult> => {
      try {
        const result = await runScriptDefinition(script, args, ctx.client?.name || "AI Agent", coordinator);
        return formatToolSuccess(buildRunPayload(result));
      } catch (err) {
        return formatToolError(err);
      }
    },
  };
}

export function buildDynamicTools(
  registry: ScriptRegistry,
  coordinator: ExecutionCoordinator,
): HubTool[] {
  // The duplicated scripts lost their MCP tool: the dedicated tool of another module does the same work.
  return registry
    .listExposedTools()
    .filter((script) => !DUPLICATE_MCP_SCRIPT_IDS.includes(script.scriptId))
    .map((script) => buildDedicatedScriptTool(script, coordinator));
}
