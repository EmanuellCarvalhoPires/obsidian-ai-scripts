// Starter pack: generic vault maintenance scripts that the plugin installs into the scripts folder.
// Installation never overwrites a note, and the ids that were already handled are remembered in the
// settings, so a script the user deleted is not recreated.

import { normalizePath } from "obsidian";
import type { ScriptVaultPort } from "../scripts/script-loader";
import { STARTER_SCRIPTS } from "./starter-notes";
import type { StarterScript } from "./starter-notes";

export { STARTER_SCRIPTS };
export type { StarterScript };

export type StarterVaultPort = Pick<ScriptVaultPort, "exists" | "writeText">;

export interface InstallStarterOptions {
  vault: StarterVaultPort;
  /** Vault-relative scripts folder. */
  folder: string;
  /** Ids handled by a previous installation; these are skipped. */
  installedIds: readonly string[];
}

export interface StarterInstallResult {
  /** Ids whose note was written now. */
  installed: string[];
  /** Ids skipped because a note already exists at the target path (kept untouched). */
  alreadyPresent: string[];
}

/** Writes the starter notes that are missing. Returns what was written and what was already there. */
export async function installStarterScripts(options: InstallStarterOptions): Promise<StarterInstallResult> {
  const { vault, installedIds } = options;
  const folder = normalizePath(options.folder.trim());
  const known = new Set(installedIds);
  const result: StarterInstallResult = { installed: [], alreadyPresent: [] };

  for (const script of STARTER_SCRIPTS) {
    if (known.has(script.scriptId)) continue;
    const path = folder === "" || folder === "/" ? script.fileName : `${folder}/${script.fileName}`;
    if (vault.exists(path)) {
      result.alreadyPresent.push(script.scriptId);
      continue;
    }
    await vault.writeText(path, script.content);
    result.installed.push(script.scriptId);
  }
  return result;
}
