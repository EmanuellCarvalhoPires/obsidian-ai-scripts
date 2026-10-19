// Dynamically builds dedicated MCP tools (script_<script_id>) for scripts marked with expose_as_tool: true.

import type { HubCallContext, HubTool, HubToolResult } from "../ecosystem/types";
import type { ExecutionCoordinator } from "../execution/execution-coordinator";
import { ScriptNotFoundError, ScriptValidationError } from "../execution/execution-coordinator";
import type { ScriptRegistry } from "../scripts/script-registry";
import type { ScriptDefinition } from "../types/script-types";

export function formatToolSuccess(payload: Record<string, unknown>): HubToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
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
    handler: async (args: Record<string, unknown>, ctx: HubCallContext): Promise<HubToolResult> => {
      try {
        const result = await coordinator.runDefinition(
          script,
          args,
          ctx.client?.name || "AI Agent",
        );
        return formatToolSuccess({
          runId: result.runId,
          success: result.success,
          status: result.status,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          durationMs: result.durationMs,
        });
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
  return registry
    .listExposedTools()
    .map((script) => buildDedicatedScriptTool(script, coordinator));
}
