import { describe, expect, it, vi } from "vitest";
import { Events, Plugin, WorkspaceLeaf } from "../mocks/obsidian";
import { EcosystemConnector } from "../../src/ecosystem/connector";
import { AI_ECOSYSTEM_API_VERSION, ECOSYSTEM_EVENTS } from "../../src/ecosystem/types";
import type { AIEcosystemAPI, HubModuleRegistration } from "../../src/ecosystem/types";
import { ExecutionCoordinator } from "../../src/execution/execution-coordinator";
import { PayloadFormatter } from "../../src/execution/payload-formatter";
import { MODULE_ID, ProcessBridge } from "../../src/execution/process-bridge";
import { allStrings } from "../../src/i18n";
import { parseScriptNote } from "../../src/scripts/schema-parser";
import { ScriptLoader } from "../../src/scripts/script-loader";
import { ScriptRegistry } from "../../src/scripts/script-registry";
import { ScriptsService, buildAllTools, buildRoutes } from "../../src/tools/scripts-mcp-tools";
import { ScriptMonitorView, VIEW_TYPE_SCRIPT_MONITOR } from "../../src/ui/live-monitor-view";
import { AIScriptsSettingTab } from "../../src/ui/settings-tab";
import { DEFAULT_SETTINGS } from "../../src/types/script-types";
import { ParamValidator } from "../../src/validation/param-validator";

describe("EcosystemConnector, MCP Tools, Dynamic Tool Factory & UI", () => {
  function createMockApp() {
    const workspaceEvents = new Events();
    const app = {
      workspace: {
        onLayoutReady: (cb: () => void) => cb(),
        on: (name: string, cb: (...args: unknown[]) => unknown) => workspaceEvents.on(name, cb),
        trigger: (name: string, ...args: unknown[]) => workspaceEvents.trigger(name, ...args),
      },
      plugins: {
        getPlugin: (_id: string): { api?: AIEcosystemAPI } | null => null,
      },
    };
    return { app, workspaceEvents };
  }

  it("waits for ai-ecosystem:ready when Ecosystem loads after AI Scripts, and reconnects on reload", () => {
    const { app, workspaceEvents } = createMockApp();
    const plugin = new Plugin(app, { id: MODULE_ID, name: "AI Scripts", version: "1.0.0" });
    const statuses: string[] = [];
    const onMissing = vi.fn();
    const onConnected = vi.fn();

    const connector = new EcosystemConnector(plugin as never, {
      buildRegistration: (): HubModuleRegistration => ({
        id: MODULE_ID,
        name: "AI Scripts",
        version: "1.0.0",
        apiVersion: AI_ECOSYSTEM_API_VERSION,
      }),
      onStatus: (s) => statuses.push(s),
      onMissing,
      onConnected,
    });

    connector.start();
    expect(connector.status).toBe("missing");
    expect(onMissing).toHaveBeenCalledTimes(1);

    const mockApi: Partial<AIEcosystemAPI> = {
      apiVersion: 1,
      isReady: () => true,
      registerModule: vi.fn().mockReturnValue({ ok: true }),
      unregisterModule: vi.fn().mockReturnValue(true),
    };

    workspaceEvents.trigger(ECOSYSTEM_EVENTS.ready, mockApi);
    expect(connector.status).toBe("connected");
    expect(onConnected).toHaveBeenCalledWith(mockApi);

    workspaceEvents.trigger(ECOSYSTEM_EVENTS.unloading);
    expect(connector.status).toBe("disconnected");

    workspaceEvents.trigger(ECOSYSTEM_EVENTS.ready, mockApi);
    expect(connector.status).toBe("connected");

    connector.stop();
    expect(mockApi.unregisterModule).toHaveBeenCalledWith(MODULE_ID);
  });

  it("generates static tools, dynamic script_<id> tools, HTTP routes, and renders live monitor view without emojis", async () => {
    const note = `---
script_id: contexto_tickets
nome: Contexto de Tickets
categoria: Jira
descricao: Busca contexto de tickets
runtime: python
script_path: scripts/contexto_tickets.py
expose_as_tool: true
params:
  instancia:
    type: string
    required: true
---
`;
    const registry = new ScriptRegistry();
    const loader = new ScriptLoader({
      vault: {
        listMarkdownFiles: () => ["Scripts/AI/Contexto.md"],
        readText: async () => note,
        writeText: async () => undefined,
        exists: () => true,
      },
      registry,
      getFolder: () => "Scripts/AI",
    });
    await loader.load();

    const parsed = parseScriptNote("Scripts/AI/Contexto.md", note);
    expect(parsed.definition).toBeDefined();

    const bridge = new ProcessBridge({
      getApi: () =>
        ({
          runScript: async () => ({
            exitCode: 0,
            stdout: '{"ok":true}',
            stderr: "",
            durationMs: 12,
            killed: false,
          }),
        }) as unknown as AIEcosystemAPI,
      getVaultBasePath: () => "",
      getScriptsFolder: () => "Scripts/AI",
    });

    const coordinator = new ExecutionCoordinator({
      registry,
      validator: new ParamValidator(),
      formatter: new PayloadFormatter(),
      bridge,
    });

    const service = new ScriptsService(loader, registry, coordinator);
    const tools = buildAllTools(service, loader, registry, coordinator);
    const routes = buildRoutes(service, loader, registry, coordinator);

    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /scripts",
      "GET /scripts/:id/schema",
      "POST /scripts/:id/run",
      "POST /runs/:runId/cancel",
      "GET /runs",
    ]);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toEqual([
      "list_ai_scripts",
      "get_script_schema",
      "run_ai_script",
      "script_contexto_tickets",
    ]);

    const dynamicTool = tools.find((t) => t.name === "script_contexto_tickets")!;
    const failRes = await dynamicTool.handler({}, { client: { id: "c1", name: "Antigravity" }, moduleId: MODULE_ID });
    expect(failRes.isError).toBe(true);
    expect(failRes.content[0]).toEqual({
      type: "text",
      text: expect.stringContaining(
        "O script 'Contexto de Tickets' exige o parâmetro 'instancia', que não foi informado.",
      ),
    });

    const okRes = await dynamicTool.handler(
      { instancia: "Acme" },
      { client: { id: "c1", name: "Antigravity" }, moduleId: MODULE_ID },
    );
    expect(okRes.isError).toBeUndefined();
    expect(okRes.structuredContent?.success).toBe(true);

    // Verify ScriptMonitorView renders and has zero emojis in i18n
    const view = new ScriptMonitorView(new WorkspaceLeaf() as never, {
      coordinator,
      onOpenManualRun: () => undefined,
      onOpenScriptEditor: () => undefined,
    });
    expect(view.getViewType()).toBe(VIEW_TYPE_SCRIPT_MONITOR);
    await view.onOpen();
    await view.onClose();

    const table = allStrings();
    expect(Object.keys(table.en).sort()).toEqual(Object.keys(table.pt).sort());
    const emojiRegex = /\p{Extended_Pictographic}/u;
    for (const val of [...Object.values(table.en), ...Object.values(table.pt)]) {
      expect(emojiRegex.test(val)).toBe(false);
    }

    const { app } = createMockApp();
    const plugin = new Plugin(app, { id: MODULE_ID, name: "AI Scripts", version: "1.0.0" });
    const tab = new AIScriptsSettingTab(app as never, plugin as never, {
      settings: { ...DEFAULT_SETTINGS },
      saveSettings: async () => undefined,
      getConnectorStatus: () => ({ status: "connected" }),
      getLoadResult: () => ({ scripts: [parsed.definition!], problems: [] }),
      reloadScripts: async () => ({ scripts: [parsed.definition!], problems: [] }),
      openMonitorView: async () => undefined,
      openManualRunModal: () => undefined,
      openScriptEditorModal: () => undefined,
      openNote: async () => undefined,
    });
    expect("getSettingDefinitions" in tab).toBe(false);
    tab.display();
    tab.refresh();
  });
});
