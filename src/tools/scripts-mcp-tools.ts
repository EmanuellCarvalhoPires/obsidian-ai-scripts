// Fixed MCP tools (list_ai_scripts, get_script_schema, run_ai_script),
// HTTP REST routes (/api/v1/ai-scripts/*), and the ScriptsServiceContract implementation.

import type { HubCallContext, HubRequest, HubResponse, HubRoute, HubTool, HubToolResult } from "../ecosystem/types";
import type { ExecutionCoordinator } from "../execution/execution-coordinator";
import { ScriptNotFoundError, ScriptValidationError } from "../execution/execution-coordinator";
import { buildExampleParams } from "../scripts/schema-parser";
import type { ScriptLoader } from "../scripts/script-loader";
import type { ScriptRegistry } from "../scripts/script-registry";
import type { ExecutionRecord, RunScriptResponse, ScriptsServiceContract } from "../types/execution-types";
import type { ScriptSummary } from "../types/script-types";
import { buildDynamicTools, formatToolError, formatToolSuccess } from "./dynamic-tool-factory";

export const MODULE_INSTRUCTIONS =
  "AI Scripts manages and executes local automation scripts stored in Scripts/AI/. " +
  "Call list_ai_scripts first to discover scripts and categories, then call get_script_schema to inspect required parameters and constraints, " +
  "and finally call run_ai_script (or the dedicated script_<script_id> tool when exposed) with validated JSON parameters.";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class ScriptsService implements ScriptsServiceContract {
  constructor(
    private readonly loader: ScriptLoader,
    private readonly registry: ScriptRegistry,
    private readonly coordinator: ExecutionCoordinator,
  ) {}

  async listScripts(category?: string): Promise<ScriptSummary[]> {
    await this.loader.load();
    return this.registry.listSummaries(category);
  }

  async getScriptSchema(scriptId: string) {
    await this.loader.load();
    const wanted = typeof scriptId === "string" ? scriptId.trim() : "";
    const def = this.registry.get(wanted);
    if (!def) {
      throw new ScriptNotFoundError(
        wanted,
        this.registry.listAll().map((s) => s.scriptId),
      );
    }
    return {
      scriptId: def.scriptId,
      name: def.name,
      category: def.category,
      description: def.description,
      runtime: def.runtime,
      inputMode: def.inputMode,
      timeoutSeconds: def.timeoutSeconds,
      exposeAsTool: def.exposeAsTool,
      scriptPath: def.scriptPath,
      notePath: def.notePath,
      params: def.params,
      jsonSchema: def.jsonSchema,
      exampleParams: buildExampleParams(def.params),
      instructions: def.markdownBody,
    };
  }

  async runScript(
    scriptId: string,
    params?: Record<string, unknown>,
    client = "AI Agent",
  ): Promise<RunScriptResponse> {
    await this.loader.load();
    return this.coordinator.run({
      scriptId,
      params,
      client,
    });
  }

  cancelRun(runId: string): boolean {
    return this.coordinator.cancelRun(runId);
  }

  listActiveRuns(): ExecutionRecord[] {
    return this.coordinator.listActiveRuns();
  }

  listHistoryRuns(): ExecutionRecord[] {
    return this.coordinator.listHistoryRuns();
  }
}

export function buildStaticTools(
  service: ScriptsService,
  loader: ScriptLoader,
  registry: ScriptRegistry,
): HubTool[] {
  return [
    {
      name: "list_ai_scripts",
      title: "List AI scripts",
      description:
        "Lists all automation scripts available in the vault, optionally filtered by category (categoria). " +
        "Returns script IDs, names, descriptions, categories, runtimes, and required/optional parameter names.",
      inputSchema: {
        type: "object",
        properties: {
          categoria: {
            type: "string",
            description: "Optional category name to filter scripts (e.g. 'Jira', 'Git').",
          },
          category: {
            type: "string",
            description: "Alias for categoria.",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args: Record<string, unknown>): Promise<HubToolResult> => {
        try {
          const catRaw = args.categoria ?? args.category;
          const category = typeof catRaw === "string" && catRaw.trim() !== "" ? catRaw.trim() : undefined;
          const scripts = await service.listScripts(category);
          const { problems } = await loader.load();
          const payload: Record<string, unknown> = {
            scripts,
            categories: registry.listCategories(),
          };
          if (problems.length > 0) {
            payload.problems = problems;
          }
          return formatToolSuccess(payload);
        } catch (err) {
          return formatToolError(err);
        }
      },
    },
    {
      name: "get_script_schema",
      title: "Get script schema",
      description:
        "Returns the full parameter JSON Schema, constraints, example payload and documentation for a script_id.",
      inputSchema: {
        type: "object",
        properties: {
          script_id: {
            type: "string",
            description: "Identifier of the script from list_ai_scripts.",
          },
        },
        required: ["script_id"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (args: Record<string, unknown>): Promise<HubToolResult> => {
        try {
          const scriptId = typeof args.script_id === "string" ? args.script_id : "";
          const schema = await service.getScriptSchema(scriptId);
          return formatToolSuccess({ ...schema });
        } catch (err) {
          return formatToolError(err);
        }
      },
    },
    {
      name: "run_ai_script",
      title: "Run AI script",
      description:
        "Validates parameters against the script's schema and executes the script with real-time monitoring and secret redaction.",
      inputSchema: {
        type: "object",
        properties: {
          script_id: {
            type: "string",
            description: "Identifier of the script to execute.",
          },
          params: {
            type: "object",
            description: "JSON object with the parameters matching get_script_schema.",
            additionalProperties: true,
          },
        },
        required: ["script_id"],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      handler: async (args: Record<string, unknown>, ctx: HubCallContext): Promise<HubToolResult> => {
        try {
          const scriptId = typeof args.script_id === "string" ? args.script_id : "";
          const params = asRecord(args.params);
          const result = await service.runScript(scriptId, params, ctx.client?.name || "AI Agent");
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
    },
  ];
}

export function buildAllTools(
  service: ScriptsService,
  loader: ScriptLoader,
  registry: ScriptRegistry,
  coordinator: ExecutionCoordinator,
): HubTool[] {
  return [
    ...buildStaticTools(service, loader, registry),
    ...buildDynamicTools(registry, coordinator),
  ];
}

function toHttpError(err: unknown): HubResponse {
  if (err instanceof ScriptValidationError) {
    return {
      status: 400,
      body: {
        error: err.message,
        issues: err.issues,
      },
    };
  }
  if (err instanceof ScriptNotFoundError) {
    return {
      status: 404,
      body: {
        error: err.message,
        available_scripts: err.availableIds,
      },
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    status: 500,
    body: { error: message },
  };
}

export function buildRoutes(
  service: ScriptsService,
  loader: ScriptLoader,
  registry: ScriptRegistry,
  coordinator: ExecutionCoordinator,
): HubRoute[] {
  const guard = async (fn: () => Promise<HubResponse>): Promise<HubResponse> => {
    try {
      return await fn();
    } catch (err) {
      return toHttpError(err);
    }
  };

  return [
    {
      method: "GET",
      path: "/scripts",
      description: "Lists available automation scripts and categories.",
      handler: (req: HubRequest) =>
        guard(async () => {
          const category = req.query.categoria ?? req.query.category;
          const scripts = await service.listScripts(category);
          const { problems } = await loader.load();
          return {
            status: 200,
            body: {
              scripts,
              categories: registry.listCategories(),
              problems,
            },
          };
        }),
    },
    {
      method: "GET",
      path: "/scripts/:id/schema",
      description: "Returns the JSON schema and parameter metadata for a script.",
      handler: (req: HubRequest) =>
        guard(async () => {
          const schema = await service.getScriptSchema(req.params.id ?? "");
          return { status: 200, body: schema };
        }),
    },
    {
      method: "POST",
      path: "/scripts/:id/run",
      description: "Validates parameters and runs a script.",
      handler: (req: HubRequest) =>
        guard(async () => {
          const body = asRecord(req.body);
          const params = body.params !== undefined ? asRecord(body.params) : body;
          const result = await service.runScript(
            req.params.id ?? "",
            params,
            req.client?.name || "HTTP Client",
          );
          return {
            status: result.success ? 200 : 422,
            body: result,
          };
        }),
    },
    {
      method: "POST",
      path: "/runs/:runId/cancel",
      description: "Cancels an active script run by runId.",
      handler: (req: HubRequest) =>
        guard(() => {
          const runId = req.params.runId ?? "";
          const cancelled = coordinator.cancelRun(runId);
          return Promise.resolve({
            status: cancelled ? 200 : 404,
            body: { runId, cancelled },
          });
        }),
    },
    {
      method: "GET",
      path: "/runs",
      description: "Lists active script processes and completed execution history.",
      handler: () =>
        guard(() =>
          Promise.resolve({
            status: 200,
            body: {
              active: coordinator.listActiveRuns(),
              history: coordinator.listHistoryRuns(),
            },
          }),
        ),
    },
  ];
}
