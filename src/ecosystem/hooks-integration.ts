// Feeds the AI Ecosystem "hooks" service (rule data) and answers its guided setup.
// Every function tolerates an older AI Ecosystem without the service.
import { HOOKS_SERVICE } from "./types";
import type { AIEcosystemAPI, HooksService, SetupHandler } from "./types";
import type { AIScriptsSettings, ScriptDefinition } from "../types/script-types";
import { normalizeFolder } from "../types/script-types";

export const HOOKS_MODULE_ID = "ai-scripts";

const EXTENSION_LANGUAGES: Record<string, string> = {
  md: "markdown",
  py: "python",
  sh: "bash",
  ps1: "powershell",
  js: "node",
  mjs: "node",
  ts: "typescript",
};

function toForwardSlashes(path: string): string {
  return path
    .trim()
    .replace(/[\\]/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/|\/$/g, "");
}

function parentFolder(path: string): string {
  const clean = toForwardSlashes(path);
  const idx = clean.lastIndexOf("/");
  return idx > 0 ? clean.slice(0, idx) : "";
}

function isInside(folder: string, parent: string): boolean {
  return folder === parent || folder.startsWith(`${parent}/`);
}

/** Vault-relative folders (forward slashes) where this plugin keeps scripts. */
export function computeScriptFolders(scriptsFolder: string, scripts: readonly ScriptDefinition[]): string[] {
  const main = toForwardSlashes(normalizeFolder(scriptsFolder));
  const folders = [main];
  for (const script of scripts) {
    if (!script.scriptPath) continue;
    const dir = parentFolder(script.scriptPath);
    if (dir && !folders.some((f) => isInside(dir, f)) && !folders.includes(dir)) folders.push(dir);
  }
  return folders.filter((folder, i) => !folders.some((other, j) => j !== i && other !== folder && isInside(folder, other)));
}

/** Sends the rule data to the hooks service. Returns false when the service is missing. */
export function publishRuleData(
  api: AIEcosystemAPI | undefined,
  scriptsFolder: string,
  scripts: readonly ScriptDefinition[],
): boolean {
  try {
    const hooks = api?.getService<HooksService>(HOOKS_SERVICE);
    if (!hooks || typeof hooks.setRuleData !== "function") return false;
    hooks.setRuleData(HOOKS_MODULE_ID, { scriptFolders: computeScriptFolders(scriptsFolder, scripts) });
    return true;
  } catch (err) {
    console.debug("[AI Scripts] Could not publish hook rule data", err);
    return false;
  }
}

/** Registers the guided setup handler. Returns the unregister function (no-op when missing). */
export function registerSetupHandler(api: AIEcosystemAPI | undefined, handler: SetupHandler): () => void {
  try {
    const hooks = api?.getService<HooksService>(HOOKS_SERVICE);
    if (!hooks || typeof hooks.registerSetupHandler !== "function") return () => undefined;
    return hooks.registerSetupHandler(HOOKS_MODULE_ID, handler);
  } catch (err) {
    console.debug("[AI Scripts] Could not register the setup handler", err);
    return () => undefined;
  }
}

export interface SetupHandlerDeps {
  getSettings: () => AIScriptsSettings;
  saveSettings: () => Promise<void>;
  getScripts: () => readonly ScriptDefinition[];
  folderExists: (path: string) => boolean;
}

/** Keys the guided setup may save, mapped to settings. */
export const SETUP_KEYS = ["pasta_de_scripts", "pode_gravar_fora_do_cofre"] as const;

export function createSetupHandler(deps: SetupHandlerDeps): SetupHandler {
  return {
    detect: () => {
      const settings = deps.getSettings();
      const scripts = deps.getScripts();
      const languages = new Set<string>();
      for (const script of scripts) {
        const file = script.scriptPath ?? script.notePath;
        const ext = file.split(".").pop()?.toLowerCase() ?? "";
        languages.add(script.scriptPath ? (EXTENSION_LANGUAGES[ext] ?? ext) : script.runtime);
      }
      return Promise.resolve({
        scriptsFolder: toForwardSlashes(settings.scriptsFolder),
        scriptCount: scripts.length,
        languages: [...languages].sort(),
        registeredScriptIds: scripts.map((s) => s.scriptId),
        allowWriteOutsideVault: settings.allowWriteOutsideVault,
      });
    },
    save: async (key, value) => {
      const settings = deps.getSettings();
      if (key === "pasta_de_scripts") {
        if (typeof value !== "string" || value.trim() === "") return "pasta_de_scripts must be a non-empty string";
        settings.scriptsFolder = normalizeFolder(value);
      } else if (key === "pode_gravar_fora_do_cofre") {
        if (typeof value !== "boolean") return "pode_gravar_fora_do_cofre must be true or false";
        settings.allowWriteOutsideVault = value;
      } else {
        return `Unknown key "${key}". Accepted keys: ${SETUP_KEYS.join(", ")}`;
      }
      await deps.saveSettings();
      return undefined;
    },
    validate: () => {
      const folder = toForwardSlashes(deps.getSettings().scriptsFolder);
      return Promise.resolve(
        deps.folderExists(folder) ? { ok: true } : { ok: false, missing: [`scripts folder "${folder}" does not exist`] },
      );
    },
  };
}
