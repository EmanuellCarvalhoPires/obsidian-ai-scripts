// Indexed discovery of the script catalog: the entries written to tools.db (api.toolIndex.sync)
// and the runner that executes them when tools_run receives an id that is not a live MCP tool.

import type { HubCallContext, HubToolResult, IndexedToolRunner, ToolIndexEntry } from "../ecosystem/types";
import type { ExecutionCoordinator } from "../execution/execution-coordinator";
import { ScriptNotFoundError } from "../execution/execution-coordinator";
import { buildExampleParams } from "../scripts/schema-parser";
import type { ScriptLoader } from "../scripts/script-loader";
import type { ScriptRegistry } from "../scripts/script-registry";
import type { ScriptDefinition } from "../types/script-types";
import { formatToolError, formatToolSuccess, buildRunPayload, runScriptDefinition } from "./dynamic-tool-factory";
import { scriptIndexMeta } from "./script-catalog-meta";

const SCRIPT_TOOL_PREFIX = "script_";
const MAX_RESUMO_LENGTH = 100;

/** Tool id of a script in the index and in tools_run: script_<script_id>. */
export function scriptToolName(scriptId: string): string {
  return `${SCRIPT_TOOL_PREFIX}${scriptId}`;
}

/** The script_id of a tool id, or undefined when the id is not a script tool. */
export function scriptIdFromToolName(toolName: string): string | undefined {
  if (!toolName.startsWith(SCRIPT_TOOL_PREFIX)) return undefined;
  const scriptId = toolName.slice(SCRIPT_TOOL_PREFIX.length).trim();
  return scriptId === "" ? undefined : scriptId;
}

function summarize(text: string): string {
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? "";
  if (firstLine.length <= MAX_RESUMO_LENGTH) return firstLine;
  return `${firstLine.slice(0, MAX_RESUMO_LENGTH - 3).trimEnd()}...`;
}

/**
 * One tools.db entry per script of the catalog (kind "script"). Only the metadata goes in:
 * never the script body, the env (which may hold {{secret:NAME}} placeholders) or the paths.
 */
export function buildScriptIndexEntries(scripts: ScriptDefinition[]): ToolIndexEntry[] {
  return scripts.map((script) => {
    const meta = scriptIndexMeta(script.scriptId);
    const description = script.description || `Runs the "${script.name}" (${script.runtime}) automation script.`;
    const entry: ToolIndexEntry = {
      name: scriptToolName(script.scriptId),
      title: script.name,
      description,
      inputSchema: script.jsonSchema,
      kind: "script",
      categoria: script.category || undefined,
      tags: [script.runtime],
      resumo: summarize(description),
      efeito: meta.efeito,
      // Not listed in tools/list in indexado mode; tools_find and tools_run still reach it.
      exposicao: "indice",
      exemplo: buildExampleParams(script.params),
    };
    if (meta.aprovacao) entry.aprovacao = meta.aprovacao;
    return entry;
  });
}

/** Runs the scripts of this module for tools_run, through the Script Engine. */
export class ScriptToolRunner implements IndexedToolRunner {
  constructor(
    private readonly loader: ScriptLoader,
    private readonly registry: ScriptRegistry,
    private readonly coordinator: ExecutionCoordinator,
  ) {}

  async run(id: string, args: Record<string, unknown>, ctx: HubCallContext): Promise<HubToolResult> {
    try {
      const scriptId = scriptIdFromToolName(id);
      if (scriptId === undefined) {
        return formatToolError(new Error(`"${id}" is not a script tool of AI Scripts.`));
      }
      await this.loader.load();
      const script = this.registry.get(scriptId);
      if (!script) {
        throw new ScriptNotFoundError(
          scriptId,
          this.registry.listAll().map((s) => s.scriptId),
        );
      }
      const result = await runScriptDefinition(script, args, ctx.client?.name || "AI Agent", this.coordinator);
      return formatToolSuccess(buildRunPayload(result));
    } catch (err) {
      return formatToolError(err);
    }
  }
}
