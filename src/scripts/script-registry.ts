// In-memory index of loaded ScriptDefinitions, supporting category filtering and MCP tool discovery.

import type { ScriptDefinition, ScriptSummary } from "../types/script-types";

export function toScriptSummary(def: ScriptDefinition): ScriptSummary {
  const requiredParams: string[] = [];
  const optionalParams: string[] = [];
  for (const [key, schema] of Object.entries(def.params)) {
    if (schema.required) requiredParams.push(key);
    else optionalParams.push(key);
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
    notePath: def.notePath,
    scriptPath: def.scriptPath,
    requiredParams,
    optionalParams,
  };
}

export class ScriptRegistry {
  private readonly byId = new Map<string, ScriptDefinition>();

  replaceAll(scripts: ScriptDefinition[]): void {
    this.byId.clear();
    for (const script of scripts) {
      this.byId.set(script.scriptId, script);
    }
  }

  size(): number {
    return this.byId.size;
  }

  get(scriptId: string): ScriptDefinition | undefined {
    return this.byId.get(scriptId.trim());
  }

  has(scriptId: string): boolean {
    return this.byId.has(scriptId.trim());
  }

  listAll(): ScriptDefinition[] {
    return [...this.byId.values()].sort((a, b) => a.scriptId.localeCompare(b.scriptId));
  }

  listByCategory(category?: string): ScriptDefinition[] {
    const all = this.listAll();
    const filter = category?.trim().toLowerCase();
    if (!filter) return all;
    return all.filter((s) => s.category.toLowerCase() === filter);
  }

  listSummaries(category?: string): ScriptSummary[] {
    return this.listByCategory(category).map(toScriptSummary);
  }

  listCategories(): string[] {
    const set = new Set<string>();
    for (const script of this.byId.values()) {
      if (script.category) set.add(script.category);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  listExposedTools(): ScriptDefinition[] {
    return this.listAll().filter((s) => s.exposeAsTool);
  }
}
