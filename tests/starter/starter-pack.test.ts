import { describe, expect, it } from "vitest";
import { parseScriptNote } from "../../src/scripts/schema-parser";
import { STARTER_SCRIPTS, installStarterScripts } from "../../src/starter/starter-pack";
import type { StarterVaultPort } from "../../src/starter/starter-pack";
import { SCRIPT_INDEX_META } from "../../src/tools/script-catalog-meta";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/types/script-types";
import { ParamValidator } from "../../src/validation/param-validator";

class MemoryVault implements StarterVaultPort {
  readonly files = new Map<string, string>();
  exists(path: string): boolean {
    return this.files.has(path);
  }
  writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    return Promise.resolve();
  }
}

describe("starter notes", () => {
  it("ships the five expected scripts with unique ids and file names", () => {
    expect(STARTER_SCRIPTS.map((s) => s.scriptId)).toEqual([
      "links_quebrados",
      "notas_orfas",
      "extrair_tarefas",
      "backup_cofre",
      "resumo_do_dia",
    ]);
    expect(new Set(STARTER_SCRIPTS.map((s) => s.fileName)).size).toBe(STARTER_SCRIPTS.length);
  });

  for (const script of STARTER_SCRIPTS) {
    describe(script.scriptId, () => {
      const parsed = parseScriptNote(`Scripts/AI/${script.fileName}`, script.content);
      const def = parsed.definition;

      it("passes the schema parser without problems", () => {
        expect(parsed.problems).toEqual([]);
        expect(def).toBeDefined();
        expect(def?.scriptId).toBe(script.scriptId);
        expect(def?.category).toBe("Cofre");
        expect(def?.runtime).toBe("python");
        expect(def?.inputMode).toBe("stdin");
        expect(def?.exposeAsTool).toBe(true);
        expect(def?.scriptPath).toBeUndefined();
        expect(def?.timeoutSeconds).toBe(script.scriptId === "backup_cofre" ? 600 : 120);
      });

      it("embeds the complete script as the only extracted block", () => {
        expect(def?.inlineCode).toContain("def main():");
        expect(def?.inlineCode?.trimEnd().endsWith("main()")).toBe(true);
        expect(def?.inlineCode).not.toContain("```");
      });

      it("accepts the example params and the empty payload", () => {
        const validator = new ParamValidator();
        const withExample = validator.validate(script.scriptId, script.exampleParams, def?.params ?? {});
        expect(withExample.issues).toEqual([]);
        expect(withExample.valid).toBe(true);
        expect(validator.validate(script.scriptId, {}, def?.params ?? {}).valid).toBe(true);
      });

      it("documents params in pt-BR and has an index effect", () => {
        for (const spec of Object.values(def?.params ?? {})) {
          expect(spec.description).toBeTruthy();
        }
        expect(script.content).toContain("## Parâmetros");
        expect(script.content).toContain("## Exemplo");
        expect(SCRIPT_INDEX_META[script.scriptId]).toBeDefined();
      });

      it("has no emoji and no real client names", () => {
        expect(script.content).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(script.content).not.toMatch(/telecall|csp ?tech|a5x|everllence/i);
      });
    });
  }

  it("marks the backup as an external effect and the others as read-only", () => {
    expect(SCRIPT_INDEX_META.backup_cofre?.efeito).toBe("externo");
    for (const id of ["links_quebrados", "notas_orfas", "extrair_tarefas", "resumo_do_dia"]) {
      expect(SCRIPT_INDEX_META[id]?.efeito).toBe("leitura");
    }
  });
});

describe("installStarterScripts", () => {
  it("writes every note into the folder on the first run", async () => {
    const vault = new MemoryVault();
    const result = await installStarterScripts({ vault, folder: "Scripts/AI", installedIds: [] });
    expect(result.installed).toEqual(STARTER_SCRIPTS.map((s) => s.scriptId));
    expect(result.alreadyPresent).toEqual([]);
    for (const script of STARTER_SCRIPTS) {
      expect(vault.files.get(`Scripts/AI/${script.fileName}`)).toBe(script.content);
    }
  });

  it("is idempotent: a second run with the handled ids writes nothing", async () => {
    const vault = new MemoryVault();
    const first = await installStarterScripts({ vault, folder: "Scripts/AI", installedIds: [] });
    const again = await installStarterScripts({ vault, folder: "Scripts/AI", installedIds: first.installed });
    expect(again).toEqual({ installed: [], alreadyPresent: [] });
  });

  it("never overwrites an existing note, even when the ids are not remembered", async () => {
    const vault = new MemoryVault();
    const target = STARTER_SCRIPTS[0];
    vault.files.set(`Scripts/AI/${target?.fileName}`, "my own edit");
    const result = await installStarterScripts({ vault, folder: "Scripts/AI", installedIds: [] });
    expect(vault.files.get(`Scripts/AI/${target?.fileName}`)).toBe("my own edit");
    expect(result.alreadyPresent).toEqual([target?.scriptId]);
    expect(result.installed).not.toContain(target?.scriptId);
  });

  it("does not recreate a script that was installed before and then deleted", async () => {
    const vault = new MemoryVault();
    const first = await installStarterScripts({ vault, folder: "Scripts/AI", installedIds: [] });
    const deleted = STARTER_SCRIPTS[1];
    vault.files.delete(`Scripts/AI/${deleted?.fileName}`);
    const again = await installStarterScripts({ vault, folder: "Scripts/AI", installedIds: first.installed });
    expect(again.installed).toEqual([]);
    expect(vault.files.has(`Scripts/AI/${deleted?.fileName}`)).toBe(false);
  });

  it("restores the missing scripts when the remembered ids are ignored", async () => {
    const vault = new MemoryVault();
    await installStarterScripts({ vault, folder: "Scripts/AI", installedIds: [] });
    const deleted = STARTER_SCRIPTS[2];
    vault.files.delete(`Scripts/AI/${deleted?.fileName}`);
    const restored = await installStarterScripts({ vault, folder: "Scripts/AI", installedIds: [] });
    expect(restored.installed).toEqual([deleted?.scriptId]);
  });

  it("installs only the ids that a previous version did not know", async () => {
    const vault = new MemoryVault();
    const known = STARTER_SCRIPTS.slice(0, 3).map((s) => s.scriptId);
    const result = await installStarterScripts({ vault, folder: "Scripts/AI", installedIds: known });
    expect(result.installed).toEqual(STARTER_SCRIPTS.slice(3).map((s) => s.scriptId));
  });

  it("uses the configured folder", async () => {
    const vault = new MemoryVault();
    await installStarterScripts({ vault, folder: "Minha Pasta/Scripts", installedIds: [] });
    expect(vault.files.has(`Minha Pasta/Scripts/${STARTER_SCRIPTS[0]?.fileName}`)).toBe(true);
  });
});

describe("starter settings", () => {
  it("defaults to installing the pack with no remembered ids", () => {
    const settings = normalizeSettings(undefined);
    expect(settings.installStarterPack).toBe(true);
    expect(settings.starterPackInstalledIds).toEqual([]);
    expect(DEFAULT_SETTINGS.installStarterPack).toBe(true);
  });

  it("normalizes the stored values", () => {
    const settings = normalizeSettings({
      installStarterPack: false,
      starterPackInstalledIds: ["a", "a", 3, "", "b"],
    });
    expect(settings.installStarterPack).toBe(false);
    expect(settings.starterPackInstalledIds).toEqual(["a", "b"]);
    expect(normalizeSettings({ installStarterPack: "yes", starterPackInstalledIds: "x" })).toMatchObject({
      installStarterPack: true,
      starterPackInstalledIds: [],
    });
  });
});
