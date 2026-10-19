// Scans the configured scripts folder in the vault, parses Markdown script notes,
// updates the ScriptRegistry, and notifies listeners when scripts change.

import { TFile, TFolder, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type { LoadProblem, ScriptDefinition, ScriptLoadResult } from "../types/script-types";
import { parseScriptNote } from "./schema-parser";
import type { ScriptRegistry } from "./script-registry";

export interface ScriptVaultPort {
  listMarkdownFiles(folder: string): string[];
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  exists(path: string): boolean;
}

export class ObsidianScriptVaultPort implements ScriptVaultPort {
  constructor(private readonly app: App) {}

  listMarkdownFiles(folder: string): string[] {
    const clean = normalizePath(folder.trim());
    const prefix = clean === "" || clean === "/" ? "" : `${clean}/`;
    return this.app.vault
      .getMarkdownFiles()
      .map((f) => f.path)
      .filter((p) => prefix === "" || p.startsWith(prefix))
      .sort();
  }

  async readText(path: string): Promise<string> {
    const file = this.app.vault.getFileByPath(normalizePath(path));
    if (!file) throw new Error(`File not found: ${path}`);
    return this.app.vault.cachedRead(file);
  }

  async writeText(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return;
    }
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash > 0) {
      await this.ensureFolder(normalized.slice(0, lastSlash));
    }
    await this.app.vault.create(normalized, content);
  }

  exists(path: string): boolean {
    const entry = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return entry instanceof TFile || entry instanceof TFolder;
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const parts = normalizePath(folderPath).split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}

export interface ScriptLoaderDeps {
  vault: ScriptVaultPort;
  registry: ScriptRegistry;
  getFolder: () => string;
  getDefaultTimeoutSeconds?: () => number;
}

export class ScriptLoader {
  private cache: Promise<ScriptLoadResult> | undefined;
  private last: ScriptLoadResult | undefined;
  private readonly listeners = new Set<(result: ScriptLoadResult) => void>();

  constructor(private readonly deps: ScriptLoaderDeps) {}

  invalidate(): void {
    this.cache = undefined;
  }

  lastResult(): ScriptLoadResult | undefined {
    return this.last;
  }

  onLoaded(listener: (result: ScriptLoadResult) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  load(): Promise<ScriptLoadResult> {
    if (!this.cache) {
      const run = this.readAll().then((result) => {
        if (this.cache === run) {
          this.last = result;
          this.deps.registry.replaceAll(result.scripts);
          for (const listener of this.listeners) {
            listener(result);
          }
        }
        return result;
      });
      this.cache = run;
    }
    return this.cache;
  }

  private async readAll(): Promise<ScriptLoadResult> {
    const { vault } = this.deps;
    const folder = normalizePath(this.deps.getFolder().trim());
    const defaultTimeout = this.deps.getDefaultTimeoutSeconds?.() ?? 120;
    const scripts: ScriptDefinition[] = [];
    const problems: LoadProblem[] = [];
    const seenIds = new Map<string, string>();

    const paths = vault.listMarkdownFiles(folder === "/" ? "" : folder);
    for (const path of paths) {
      let content: string;
      try {
        content = await vault.readText(path);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        problems.push({ level: "error", path, message: `Could not read script note: ${msg}` });
        continue;
      }

      const parsed = parseScriptNote(path, content, defaultTimeout);
      problems.push(...parsed.problems);
      const def = parsed.definition;
      if (!def) continue;

      const firstPath = seenIds.get(def.scriptId);
      if (firstPath !== undefined) {
        problems.push({
          level: "warning",
          path,
          scriptId: def.scriptId,
          message: `The script_id "${def.scriptId}" is already defined in "${firstPath}". This duplicate note was ignored.`,
        });
        continue;
      }

      seenIds.set(def.scriptId, path);
      scripts.push(def);
    }

    return { scripts, problems };
  }
}
