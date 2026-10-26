// Runs the embedded Python scripts for real against a temporary vault. Skipped when Python is missing.
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseScriptNote } from "../../src/scripts/schema-parser";
import { STARTER_SCRIPTS } from "../../src/starter/starter-pack";

function findPython(): string | undefined {
  for (const cmd of ["python", "python3"]) {
    const res = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (res.status === 0) return cmd;
  }
  return undefined;
}

const python = findPython();
const CALENDAR = String.fromCodePoint(0x1f4c5);

let sandbox = "";
let vaultDir = "";
const scriptFiles = new Map<string, string>();

function write(rel: string, content: string): void {
  const full = path.join(vaultDir, ...rel.split("/"));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

function run(scriptId: string, params: unknown, raw?: string): { code: number; out: string; err: string } {
  const file = scriptFiles.get(scriptId);
  if (!python || !file) throw new Error("python or script missing");
  const res = spawnSync(python, ["-u", file], {
    cwd: vaultDir,
    input: raw ?? JSON.stringify(params),
    encoding: "utf8",
  });
  return { code: res.status ?? -1, out: res.stdout, err: res.stderr };
}

function zipEntries(zipPath: string): string[] {
  const code = "import sys, json, zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))";
  const res = spawnSync(python ?? "python", ["-c", code, zipPath], { encoding: "utf8" });
  return JSON.parse(res.stdout) as string[];
}

describe.skipIf(!python)("starter scripts (real Python)", () => {
  beforeAll(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "ais-starter-"));
    vaultDir = path.join(sandbox, "Cofre Teste");
    fs.mkdirSync(vaultDir);

    for (const script of STARTER_SCRIPTS) {
      const code = parseScriptNote(`Scripts/AI/${script.fileName}`, script.content).definition?.inlineCode ?? "";
      const file = path.join(sandbox, `${script.scriptId}.py`);
      fs.writeFileSync(file, code, "utf8");
      scriptFiles.set(script.scriptId, file);
    }

    write(
      "Projetos/Plano.md",
      [
        "---",
        "tags: [plano]",
        "---",
        "# Plano",
        "Veja [[Existente]] e [[Inexistente]].",
        "Com alias [[Existente|o texto]] e ancora [[Existente#Secao]] e [[#Secao local]].",
        "Embed ![[imagem.png]] e ![[faltando.png]].",
        "Markdown [ok](../Existente.md) e [quebrado](Faltando.md) e [web](https://exemplo.com).",
        "Tarefas em [[Tarefas]].",
        "```",
        "[[DentroDoCodigo]]",
        "```",
        "Inline `[[CodigoLinha]]` ignorado.",
      ].join("\n"),
    );
    write("Existente.md", "# Secao\nTexto sem links.\n");
    write("Orfa.md", "Nota sozinha.\n");
    write("Anexos/imagem.png", "x");
    write(
      "Tarefas.md",
      [
        "- [ ] Pagar conta due:: 2020-01-01",
        "- [ ] Futura due:: 2999-12-31",
        `- [ ] Com icone ${CALENDAR} 2020-02-02`,
        "- [x] Feita due:: 2020-01-01",
        "- [ ] Sem data",
        "```",
        "- [ ] dentro do codigo due:: 2020-01-01",
        "```",
      ].join("\n"),
    );
    write("Templates/Modelo.md", "Modelo sem links.\n");
    write(".obsidian/app.json", "{}");
    write(".obsidian/oculta.md", "[[Nada]]");
    write("node_modules/pacote/leia.md", "[[Nada]]");
  });

  afterAll(() => {
    if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true });
  });

  describe("links_quebrados", () => {
    it("reports only the broken links", () => {
      const res = run("links_quebrados", {});
      expect(res.code).toBe(0);
      expect(res.out).toMatch(/^Projetos\/Plano\.md:\d+ -> \[\[Inexistente\]\]$/m);
      expect(res.out).toMatch(/^Projetos\/Plano\.md:\d+ -> \[\[faltando\.png\]\]$/m);
      expect(res.out).toMatch(/^Projetos\/Plano\.md:\d+ -> Faltando\.md$/m);
      expect(res.out).not.toMatch(/-> \[\[Existente\]\]/);
      expect(res.out).not.toMatch(/imagem\.png/);
      expect(res.out).not.toContain("Secao");
      expect(res.out).not.toContain("DentroDoCodigo");
      expect(res.out).not.toContain("CodigoLinha");
      expect(res.out).not.toContain("exemplo.com");
      expect(res.out).not.toContain("Nada");
      expect(res.out).toContain("3 link(s) quebrado(s) em 1 nota(s)");
    });

    it("honors pasta and limite", () => {
      expect(run("links_quebrados", { pasta: "Templates" }).out).toContain("Nenhum link quebrado");
      const limited = run("links_quebrados", { limite: 1 });
      expect(limited.out.match(/ -> /g)).toHaveLength(1);
      expect(limited.out).toContain("Mostrando 1 de 3");
    });

    it("fails with a clear error for bad input", () => {
      const badJson = run("links_quebrados", undefined, "{nao e json");
      expect(badJson.code).not.toBe(0);
      expect(badJson.err).toContain("Erro:");
      const badFolder = run("links_quebrados", { pasta: "Nao Existe" });
      expect(badFolder.code).not.toBe(0);
      expect(badFolder.err).toContain("pasta não encontrada");
      expect(run("links_quebrados", { pasta: "../fora" }).code).not.toBe(0);
    });
  });

  describe("notas_orfas", () => {
    it("lists notes without incoming or outgoing links", () => {
      const res = run("notas_orfas", {});
      expect(res.code).toBe(0);
      expect(res.out).toContain("- Orfa.md");
      expect(res.out).toContain("- Templates/Modelo.md");
      expect(res.out).not.toContain("- Projetos/Plano.md");
      expect(res.out).not.toContain("- Existente.md");
      expect(res.out).not.toContain("- Tarefas.md");
      expect(res.out).not.toContain("oculta");
      expect(res.out).not.toContain("leia.md");
    });

    it("skips ignored folders", () => {
      const res = run("notas_orfas", { ignorar_pastas: ["Templates"] });
      expect(res.out).toContain("- Orfa.md");
      expect(res.out).not.toContain("Modelo.md");
      expect(res.out).toContain("1 nota(s) órfã(s)");
    });
  });

  describe("extrair_tarefas", () => {
    it("collects open tasks and ignores code blocks and done tasks", () => {
      const res = run("extrair_tarefas", {});
      expect(res.code).toBe(0);
      expect(res.out).toContain("### Tarefas.md");
      expect(res.out).toContain("- [ ] Pagar conta due:: 2020-01-01 (linha 1)");
      expect(res.out).toContain("Futura");
      expect(res.out).toContain("Sem data");
      expect(res.out).not.toContain("Feita");
      expect(res.out).not.toContain("dentro do codigo");
      expect(res.out).toContain("4 tarefa(s), 2 vencida(s).");
    });

    it("lists only overdue tasks, including the icon format", () => {
      const res = run("extrair_tarefas", { so_vencidas: true });
      expect(res.out).toContain("Pagar conta");
      expect(res.out).toContain("Com icone");
      expect(res.out).not.toContain("Futura");
      expect(res.out).not.toContain("Sem data");
    });

    it("includes done tasks and groups by date on request", () => {
      const res = run("extrair_tarefas", { incluir_concluidas: true, agrupar_por: "data" });
      expect(res.out).toContain("- [x] Feita");
      expect(res.out).toContain("### 2020-01-01 (vencida)");
      expect(res.out).toContain("### 2999-12-31");
      expect(res.out).toContain("### Sem data");
      expect(res.out.indexOf("### 2020-01-01")).toBeLessThan(res.out.indexOf("### Sem data"));
    });

    it("rejects an invalid agrupar_por", () => {
      const res = run("extrair_tarefas", { agrupar_por: "cor" });
      expect(res.code).not.toBe(0);
      expect(res.err).toContain("agrupar_por");
    });
  });

  describe("resumo_do_dia", () => {
    it("summarizes notes touched today and overdue tasks", () => {
      const res = run("resumo_do_dia", {});
      expect(res.code).toBe(0);
      expect(res.out).toMatch(/^# Resumo do dia \d{4}-\d{2}-\d{2}$/m);
      expect(res.out).toContain("### Projetos (1)");
      expect(res.out).toContain("- [[Plano]]");
      expect(res.out).toContain("- [[Orfa]]");
      expect(res.out).not.toContain("oculta");
      expect(res.out).toContain("### Vencidas (2)");
      expect(res.out).toContain("- [ ] Pagar conta due:: 2020-01-01 ([[Tarefas]], venceu em 2020-01-01)");
    });

    it("uses the given day as reference", () => {
      const res = run("resumo_do_dia", { data: "2999-12-31" });
      expect(res.out).toContain("# Resumo do dia 2999-12-31");
      expect(res.out).toContain("Nenhuma nota criada ou modificada");
      expect(res.out).toContain("### Vencem hoje (1)");
      expect(res.out).toContain("Futura");
    });

    it("rejects a malformed date", () => {
      const res = run("resumo_do_dia", { data: "31/12/2999" });
      expect(res.code).not.toBe(0);
      expect(res.err).toContain("AAAA-MM-DD");
    });
  });

  describe("backup_cofre", () => {
    const name = "Cofre Teste";
    const fake = (stamp: string): string => `backup-${name}-${stamp}.zip`;

    it("creates a zip, rotates only its own backups and leaves the destination out", () => {
      const dest = path.join(vaultDir, "Backups");
      fs.mkdirSync(dest, { recursive: true });
      for (const stamp of ["20200101-000000", "20200102-000000", "20200103-000000"]) {
        fs.writeFileSync(path.join(dest, fake(stamp)), "velho");
      }
      fs.writeFileSync(path.join(dest, "outro.zip"), "nao e meu");

      const res = run("backup_cofre", { destino: "Backups", manter: 2 });
      expect(res.code).toBe(0);
      expect(res.out).toContain("Backup criado:");
      expect(res.out).toMatch(/Arquivos: \d+/);
      expect(res.out).toMatch(/Tamanho: .+ \(\d+ bytes\)/);

      const remaining = fs.readdirSync(dest).sort();
      expect(remaining).toContain("outro.zip");
      expect(remaining).not.toContain(fake("20200101-000000"));
      expect(remaining).not.toContain(fake("20200102-000000"));
      expect(remaining).toContain(fake("20200103-000000"));
      const created = remaining.filter((f) => f.startsWith(`backup-${name}-`) && !f.includes("2020010"));
      expect(created).toHaveLength(1);
      expect(remaining.some((f) => f.endsWith(".part"))).toBe(false);

      const entries = zipEntries(path.join(dest, created[0] as string));
      expect(entries).toContain(`${name}/Projetos/Plano.md`);
      expect(entries).toContain(`${name}/.obsidian/app.json`);
      expect(entries.some((e) => e.startsWith(`${name}/Backups`))).toBe(false);
      expect(entries.some((e) => e.includes("node_modules"))).toBe(false);
    });

    it("can leave .obsidian out", () => {
      const res = run("backup_cofre", { destino: "Backups2", incluir_obsidian: false });
      expect(res.code).toBe(0);
      const dest = path.join(vaultDir, "Backups2");
      const zip = fs.readdirSync(dest).find((f) => f.endsWith(".zip")) as string;
      const entries = zipEntries(path.join(dest, zip));
      expect(entries.some((e) => e.includes(".obsidian"))).toBe(false);
      expect(entries).toContain(`${name}/Orfa.md`);
    });

    it("dry_run writes and deletes nothing and defaults to the sibling folder", () => {
      const res = run("backup_cofre", { dry_run: true });
      expect(res.code).toBe(0);
      expect(res.out).toContain("Simulação");
      expect(res.out).toContain(path.join(sandbox, `${name}-backups`));
      expect(fs.existsSync(path.join(sandbox, `${name}-backups`))).toBe(false);
    });

    it("refuses the vault folder itself as destination", () => {
      const res = run("backup_cofre", { destino: ".", dry_run: true });
      expect(res.code).not.toBe(0);
      expect(res.err).toContain("destino");
    });
  });
});
