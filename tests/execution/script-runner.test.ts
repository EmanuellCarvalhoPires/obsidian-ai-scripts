import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { AIEcosystemAPI, HubScriptOptions, SecretVaultService } from "../../src/ecosystem/types";
import { SECRETS_SERVICE } from "../../src/ecosystem/types";
import { ExecutionCoordinator, ScriptValidationError } from "../../src/execution/execution-coordinator";
import { PayloadFormatter } from "../../src/execution/payload-formatter";
import { ProcessBridge } from "../../src/execution/process-bridge";
import { parseScriptNote } from "../../src/scripts/schema-parser";
import { ScriptRegistry } from "../../src/scripts/script-registry";
import { ParamValidator } from "../../src/validation/param-validator";

describe("ExecutionCoordinator & ProcessBridge", () => {
  const noteMarkdown = `---
script_id: sync_jira
nome: Sincronizar Jira
categoria: Jira
descricao: Sincroniza tickets
runtime: node
script_path: scripts/sync.mjs
input_mode: stdin
timeout_seconds: 30
expose_as_tool: true
env:
  JIRA_TOKEN: "{{secret:JIRA_SECRET}}"
params:
  instancia:
    type: string
    required: true
---
`;

  function createHarness(customRunScript?: AIEcosystemAPI["runScript"]) {
    const parsed = parseScriptNote("Scripts/AI/Sync.md", noteMarkdown);
    const registry = new ScriptRegistry();
    registry.replaceAll([parsed.definition!]);

    const secretsService: SecretVaultService = {
      isLocked: () => false,
      redact: (text: string) => text.replace(/SUPER_SECRET_TOKEN/g, "[REDACTED]"),
      spawnWithSecrets: async (env, spawnFn) => {
        spawnFn({ ...env, JIRA_TOKEN: "SUPER_SECRET_TOKEN" });
      },
    };

    const mockApi: Partial<AIEcosystemAPI> = {
      getService: <T>(name: string): T | undefined => {
        if (name === SECRETS_SERVICE) return secretsService as unknown as T;
        return undefined;
      },
      logActivity: vi.fn(),
      runScript:
        customRunScript ??
        (async (opts: HubScriptOptions) => {
          opts.onStdout?.("Conectando com token SUPER_SECRET_TOKEN...\n");
          opts.onStdout?.(`Payload recebido: ${opts.stdin ?? ""}\n`);
          return {
            exitCode: 0,
            stdout: "Conectando com token SUPER_SECRET_TOKEN...\n",
            stderr: "",
            durationMs: 25,
            killed: false,
          };
        }),
    };

    const bridge = new ProcessBridge({
      getApi: () => mockApi as AIEcosystemAPI,
      getVaultBasePath: () => "",
      getScriptsFolder: () => "Scripts/AI",
    });

    const coordinator = new ExecutionCoordinator({
      registry,
      validator: new ParamValidator(),
      formatter: new PayloadFormatter(),
      bridge,
    });

    return { coordinator, registry, mockApi };
  }

  it("rejects execution before spawning when required parameter is missing", async () => {
    const runScriptSpy = vi.fn();
    const { coordinator } = createHarness(runScriptSpy);

    await expect(coordinator.run({ scriptId: "sync_jira", params: {} })).rejects.toThrow(
      ScriptValidationError,
    );
    expect(runScriptSpy).not.toHaveBeenCalled();
  });

  it("streams redacted stdout in real time and moves completed run to history", async () => {
    const { coordinator } = createHarness();
    const events: string[] = [];

    coordinator.subscribe((evt) => {
      events.push(evt.type);
    });

    const response = await coordinator.run({
      scriptId: "sync_jira",
      params: { instancia: "CSP Tech" },
      client: "Claude Code",
    });

    expect(response.success).toBe(true);
    expect(response.status).toBe("succeeded");
    expect(response.stdout).toContain("[REDACTED]");
    expect(response.stdout).not.toContain("SUPER_SECRET_TOKEN");
    expect(events).toContain("started");
    expect(events).toContain("output");
    expect(events).toContain("finished");

    expect(coordinator.listActiveRuns()).toHaveLength(0);
    const history = coordinator.listHistoryRuns();
    expect(history).toHaveLength(1);
    expect(history[0]?.lines[0]?.text).toBe("Conectando com token [REDACTED]...");
  });

  it("cancels an active execution immediately when cancelRun is called", async () => {
    const { coordinator } = createHarness(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                exitCode: 0,
                stdout: "done",
                stderr: "",
                durationMs: 5000,
                killed: false,
              }),
            5000,
          );
        }),
    );

    const runPromise = coordinator.run({
      scriptId: "sync_jira",
      params: { instancia: "CSP Tech" },
    });

    await new Promise((r) => setTimeout(r, 20));
    const active = coordinator.listActiveRuns();
    expect(active).toHaveLength(1);

    const cancelled = coordinator.cancelRun(active[0]!.runId);
    expect(cancelled).toBe(true);

    const result = await runPromise;
    expect(result.status).toBe("cancelled");
    expect(result.success).toBe(false);
    expect(coordinator.listActiveRuns()).toHaveLength(0);
  });

  it("materializes inlineCode into a temporary file, calls api.runScript without inlineCode, and falls back to local spawn on path-not-allowed", async () => {
    const inlineNote = `---
script_id: inline_echo
nome: Inline Echo
categoria: Utils
descricao: Echoes input
runtime: node
---

\`\`\`javascript
console.log("ok from inline");
\`\`\`
`;
    const parsed = parseScriptNote("Scripts/AI/InlineEcho.md", inlineNote);
    const script = parsed.definition!;

    const receivedOptions: HubScriptOptions[] = [];
    const spawnCalls: Array<{ cmd: string; args: string[] }> = [];

    const mockSpawn = ((cmd: string, args: string[]) => {
      spawnCalls.push({ cmd, args });
      const proc = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { destroy: () => void };
        stderr: EventEmitter & { destroy: () => void };
        stdin: { write: () => void; end: () => void };
        pid: number;
        kill: () => void;
      };
      proc.stdout = Object.assign(new EventEmitter(), { destroy: () => undefined });
      proc.stderr = Object.assign(new EventEmitter(), { destroy: () => undefined });
      proc.stdin = { write: () => undefined, end: () => undefined };
      proc.pid = 12345;
      proc.kill = () => undefined;

      setTimeout(() => {
        proc.stdout.emit("data", "fallback stdout line\n");
        proc.emit("close", 0);
      }, 5);

      return proc;
    }) as unknown as typeof import("node:child_process").spawn;

    let shouldRefusePath = false;
    const mockApi: Partial<AIEcosystemAPI> = {
      runScript: async (opts: HubScriptOptions) => {
        receivedOptions.push(opts);
        if (shouldRefusePath) {
          const err = new Error("Script path is not in an allowed folder.") as Error & { code?: string };
          err.code = "path-not-allowed";
          throw err;
        }
        return {
          exitCode: 0,
          stdout: "ecosystem stdout\n",
          stderr: "",
          durationMs: 10,
          killed: false,
        };
      },
    };

    const bridge = new ProcessBridge({
      getApi: () => mockApi as AIEcosystemAPI,
      getVaultBasePath: () => "",
      getScriptsFolder: () => "Scripts/AI",
      spawnImpl: mockSpawn,
    });

    // 1. Direct via Ecosystem: scriptPath is materialized and inlineCode is undefined
    const res1 = await bridge.execute({ script, args: [] });
    expect(res1.exitCode).toBe(0);
    expect(res1.stdout).toBe("ecosystem stdout\n");
    expect(receivedOptions).toHaveLength(1);
    expect(receivedOptions[0]?.inlineCode).toBeUndefined();
    expect(receivedOptions[0]?.scriptPath).toContain(".tmp-ais-inline_echo-");

    // 2. Fallback to local spawn when api.runScript refuses with path-not-allowed
    shouldRefusePath = true;
    const res2 = await bridge.execute({ script, args: ["--flag"] });
    expect(res2.exitCode).toBe(0);
    expect(res2.stdout).toBe("fallback stdout line\n");
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.cmd).toBe("node");
  });

  it("logs real-time activity via beginActivity and records completion", async () => {
    const appendSpy = vi.fn();
    const endSpy = vi.fn();
    const beginActivitySpy = vi.fn().mockReturnValue({
      id: "act-1",
      appendOutput: appendSpy,
      end: endSpy,
    });
    const logActivitySpy = vi.fn();

    const parsed = parseScriptNote("Scripts/AI/Sync.md", noteMarkdown);
    const registry = new ScriptRegistry();
    registry.replaceAll([parsed.definition!]);

    const bridge = new ProcessBridge({
      getApi: () =>
        ({
          runScript: async (opts: HubScriptOptions) => {
            opts.onStdout?.("Line 1\n");
            return { exitCode: 0, stdout: "Line 1\n", stderr: "", durationMs: 10, killed: false };
          },
        }) as unknown as AIEcosystemAPI,
      getVaultBasePath: () => "",
      getScriptsFolder: () => "Scripts/AI",
    });

    const coordinator = new ExecutionCoordinator({
      registry,
      validator: new ParamValidator(),
      formatter: new PayloadFormatter(),
      bridge,
      beginActivity: beginActivitySpy,
      logActivity: logActivitySpy,
    });

    await coordinator.run({
      scriptId: "sync_jira",
      params: { instancia: "CSP Tech" },
      client: "Antigravity",
    });

    expect(beginActivitySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        client: "Antigravity",
        type: "Script Run",
        target: expect.stringContaining("sync_jira"),
      }),
    );
    expect(appendSpy).toHaveBeenCalledWith("stdout", expect.stringContaining("Line 1"));
    expect(endSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        response: expect.objectContaining({ status: "succeeded", exitCode: 0 }),
      }),
    );
  });
});
