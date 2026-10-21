import { describe, expect, it, vi } from "vitest";
import {
  computeScriptFolders,
  createSetupHandler,
  publishRuleData,
  registerSetupHandler,
} from "../../src/ecosystem/hooks-integration";
import { HOOKS_SERVICE } from "../../src/ecosystem/types";
import type { AIEcosystemAPI, SetupHandler } from "../../src/ecosystem/types";
import { DEFAULT_SETTINGS } from "../../src/types/script-types";
import type { ScriptDefinition } from "../../src/types/script-types";

function script(partial: Partial<ScriptDefinition>): ScriptDefinition {
  return {
    scriptId: "s",
    name: "S",
    category: "c",
    description: "",
    runtime: "python",
    inputMode: "stdin",
    timeoutSeconds: 10,
    exposeAsTool: false,
    params: {},
    jsonSchema: {},
    notePath: "Scripts/AI/s.md",
    markdownBody: "",
    ...partial,
  };
}

function apiWith(services: Record<string, unknown>): AIEcosystemAPI {
  return { getService: (name: string) => services[name] } as unknown as AIEcosystemAPI;
}

describe("hook rule data and setup handler", () => {
  it("publishes the scripts folders with forward slashes", () => {
    const setRuleData = vi.fn();
    const api = apiWith({ [HOOKS_SERVICE]: { setRuleData } });
    expect(publishRuleData(api, "Scripts\\AI/", [])).toBe(true);
    expect(setRuleData).toHaveBeenCalledWith("ai-scripts", { scriptFolders: ["Scripts/AI"] });
  });

  it("adds folders of external script files and drops nested ones", () => {
    const scripts = [
      script({ scriptPath: "Tools/py/a.py" }),
      script({ scriptPath: "Scripts/AI/sub/b.py" }),
      script({ scriptPath: "Tools/py/deep/c.py" }),
    ];
    expect(computeScriptFolders("Scripts/AI", scripts)).toEqual(["Scripts/AI", "Tools/py"]);
  });

  it("is harmless when the hooks service or api is missing", () => {
    expect(publishRuleData(undefined, "Scripts/AI", [])).toBe(false);
    expect(publishRuleData(apiWith({}), "Scripts/AI", [])).toBe(false);
    const unregister = registerSetupHandler(apiWith({}), {});
    expect(() => unregister()).not.toThrow();
  });

  it("registers the setup handler and returns the unregister function", () => {
    const off = vi.fn();
    const registerSetupHandlerFn = vi.fn().mockReturnValue(off);
    const handler: SetupHandler = {};
    const unregister = registerSetupHandler(apiWith({ [HOOKS_SERVICE]: { registerSetupHandler: registerSetupHandlerFn } }), handler);
    expect(registerSetupHandlerFn).toHaveBeenCalledWith("ai-scripts", handler);
    unregister();
    expect(off).toHaveBeenCalled();
  });

  describe("setup handler", () => {
    function make(existing = true) {
      const settings = { ...DEFAULT_SETTINGS };
      const saveSettings = vi.fn().mockResolvedValue(undefined);
      const scripts = [
        script({ scriptId: "a", scriptPath: "Scripts/AI/a.py" }),
        script({ scriptId: "b", runtime: "bash" }),
      ];
      const handler = createSetupHandler({
        getSettings: () => settings,
        saveSettings,
        getScripts: () => scripts,
        folderExists: () => existing,
      });
      return { settings, saveSettings, handler };
    }

    it("detects folder, count, languages and ids", async () => {
      const { handler } = make();
      expect(await handler.detect?.()).toEqual({
        scriptsFolder: "Scripts/AI",
        scriptCount: 2,
        languages: ["bash", "python"],
        registeredScriptIds: ["a", "b"],
        allowWriteOutsideVault: false,
      });
    });

    it("saves known keys and rejects unknown or invalid ones", async () => {
      const { handler, settings, saveSettings } = make();
      expect(await handler.save?.("pasta_de_scripts", "Auto\\Scripts/")).toBeUndefined();
      expect(settings.scriptsFolder).toBe("Auto/Scripts");
      expect(await handler.save?.("pode_gravar_fora_do_cofre", true)).toBeUndefined();
      expect(settings.allowWriteOutsideVault).toBe(true);
      expect(saveSettings).toHaveBeenCalledTimes(2);
      expect(await handler.save?.("pode_gravar_fora_do_cofre", "sim")).toEqual(expect.any(String));
      expect(await handler.save?.("pasta_de_scripts", "")).toEqual(expect.any(String));
      expect(await handler.save?.("outra_chave", 1)).toMatch(/Unknown key/);
      expect(saveSettings).toHaveBeenCalledTimes(2);
    });

    it("validates that the scripts folder exists", async () => {
      expect(await make(true).handler.validate?.()).toEqual({ ok: true });
      const bad = await make(false).handler.validate?.();
      expect(bad?.ok).toBe(false);
      expect(bad?.missing).toHaveLength(1);
    });
  });
});
