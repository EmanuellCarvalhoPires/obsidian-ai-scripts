import { describe, expect, it, vi } from "vitest";
import type { AIEcosystemAPI, HubCallContext } from "../../src/ecosystem/types";
import { ExecutionCoordinator } from "../../src/execution/execution-coordinator";
import { PayloadFormatter } from "../../src/execution/payload-formatter";
import { MODULE_ID, ProcessBridge } from "../../src/execution/process-bridge";
import { ScriptLoader } from "../../src/scripts/script-loader";
import { ScriptRegistry } from "../../src/scripts/script-registry";
import { buildScriptIndexEntries, ScriptToolRunner } from "../../src/tools/tool-index";
import { ScriptsService, buildAllTools } from "../../src/tools/scripts-mcp-tools";
import type { ScriptDefinition } from "../../src/types/script-types";
import { ParamValidator } from "../../src/validation/param-validator";

const CTX: HubCallContext = { client: { id: "c1", name: "Claude Code" }, moduleId: MODULE_ID };

function makeScript(scriptId: string, overrides: Partial<ScriptDefinition> = {}): ScriptDefinition {
  return {
    scriptId,
    name: `Nome ${scriptId}`,
    category: "Cofre",
    description: `Descricao de ${scriptId}`,
    runtime: "node",
    inputMode: "stdin",
    timeoutSeconds: 30,
    exposeAsTool: true,
    params: { message: { type: "string", required: true } },
    jsonSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
      additionalProperties: false,
    },
    notePath: `Scripts/AI/${scriptId}.md`,
    markdownBody: "corpo da nota",
    inlineCode: "console.log('segredo-do-codigo')",
    ...overrides,
  };
}

function setup(scripts: ScriptDefinition[]) {
  const registry = new ScriptRegistry();
  registry.replaceAll(scripts);
  const runScript = vi.fn(async () => ({
    exitCode: 0,
    stdout: '{"ok":true}',
    stderr: "",
    durationMs: 5,
    killed: false,
  }));
  const bridge = new ProcessBridge({
    getApi: () => ({ runScript }) as unknown as AIEcosystemAPI,
    getVaultBasePath: () => "",
    getScriptsFolder: () => "Scripts/AI",
  });
  const coordinator = new ExecutionCoordinator({
    registry,
    validator: new ParamValidator(),
    formatter: new PayloadFormatter(),
    bridge,
  });
  // The runner only calls load(); the catalog is already in the registry.
  const loader = { load: async () => ({ scripts: registry.listAll(), problems: [] }) } as unknown as ScriptLoader;
  return { registry, coordinator, loader, runScript };
}

describe("script tool index", () => {
  it("writes one script entry per catalog script with effect, approval and no body or code", () => {
    const scripts = [
      makeScript("buscar_notas", { category: "Cofre" }),
      makeScript("enviar_telegram", { category: "Comunicacao" }),
      makeScript("meu_script_novo"),
    ];
    const entries = buildScriptIndexEntries(scripts);

    expect(entries.map((e) => e.name)).toEqual(["script_buscar_notas", "script_enviar_telegram", "script_meu_script_novo"]);
    for (const entry of entries) {
      expect(entry.kind).toBe("script");
      expect(entry.exposicao).toBe("indice");
      expect(entry.resumo?.length ?? 0).toBeLessThanOrEqual(100);
    }

    const [buscar, telegram, novo] = entries;
    expect(buscar.categoria).toBe("Cofre");
    expect(buscar.efeito).toBe("leitura");
    expect(buscar.aprovacao).toBeUndefined();
    expect(telegram.categoria).toBe("Comunicacao");
    expect(telegram.efeito).toBe("externo");
    expect(telegram.aprovacao).toContain("{message}");
    // Unknown scripts default to the safe side: externo with the generic question.
    expect(novo.efeito).toBe("externo");
    expect(novo.aprovacao).toBeUndefined();

    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain("segredo-do-codigo");
    expect(serialized).not.toContain("corpo da nota");
    expect(serialized).not.toContain("Scripts/AI/");
  });

  it("keeps the three duplicated scripts out of the MCP tool list and still indexes them", () => {
    const duplicated = ["buscar_notas", "enviar_telegram", "pedir_aprovacao_telegram"];
    const scripts = [...duplicated.map((id) => makeScript(id)), makeScript("contexto_tickets")];
    const { registry, coordinator, loader } = setup(scripts);
    const service = new ScriptsService(loader, registry, coordinator);

    const toolNames = buildAllTools(service, loader, registry, coordinator).map((t) => t.name);
    expect(toolNames).toContain("script_contexto_tickets");
    for (const id of duplicated) {
      expect(toolNames).not.toContain(`script_${id}`);
    }

    const indexed = buildScriptIndexEntries(scripts).map((e) => e.name);
    for (const id of duplicated) {
      expect(indexed).toContain(`script_${id}`);
    }
  });

  it("marks the remaining script MCP tools as indice so indexado mode does not list them", () => {
    const { registry, coordinator, loader } = setup([makeScript("contexto_tickets")]);
    const service = new ScriptsService(loader, registry, coordinator);
    const dedicated = buildAllTools(service, loader, registry, coordinator).find((t) => t.name === "script_contexto_tickets");
    expect(dedicated?.exposicao).toBe("indice");
  });

  it("runs a script through tools_run by id, through the Script Engine, and returns its output", async () => {
    const { registry, coordinator, loader, runScript } = setup([makeScript("buscar_notas")]);
    const runner = new ScriptToolRunner(loader, registry, coordinator);

    const result = await runner.run("script_buscar_notas", { message: "oi" }, CTX);

    expect(result.isError).toBeUndefined();
    expect(runScript).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.stdout).toBe('{"ok":true}');
  });

  it("reports missing parameters and unknown scripts as errors without running anything", async () => {
    const { registry, coordinator, loader, runScript } = setup([makeScript("buscar_notas")]);
    const runner = new ScriptToolRunner(loader, registry, coordinator);

    const missing = await runner.run("script_buscar_notas", {}, CTX);
    expect(missing.isError).toBe(true);

    const unknown = await runner.run("script_nao_existe", { message: "x" }, CTX);
    expect(unknown.isError).toBe(true);
    expect((unknown.content[0] as { text: string }).text).toContain("nao_existe");

    const notScript = await runner.run("telegram_send_message", { message: "x" }, CTX);
    expect(notScript.isError).toBe(true);

    expect(runScript).not.toHaveBeenCalled();
  });
});
