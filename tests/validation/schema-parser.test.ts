import { describe, expect, it } from "vitest";
import { parseScriptNote } from "../../src/scripts/schema-parser";
import { ScriptLoader } from "../../src/scripts/script-loader";
import { ScriptRegistry } from "../../src/scripts/script-registry";

describe("SchemaParser and ScriptLoader", () => {
  const sampleNote = `---
script_id: sincronizar_tickets_jira
nome: Sincronizar Tickets do Jira
categoria: Jira
descricao: "Sincroniza tickets do Jira Cloud trazendo campos, branches, subtarefas e links em JSON estruturado"
runtime: python
script_path: scripts/contexto_tickets.py
input_mode: stdin
timeout_seconds: 120
expose_as_tool: true
params:
  instancia:
    type: string
    required: true
    description: "Nome da instância Jira no cofre"
  ticket_keys:
    type: array
    items: string
    required: true
    description: "Lista de chaves de tickets"
  sem_subtarefas:
    type: boolean
    required: false
    default: false
  formato_saida:
    type: string
    required: false
    enum: ["json", "resumo", "markdown"]
    default: "json"
---

# Sincronizar Tickets do Jira
Documentação de uso.
`;

  it("parses frontmatter metadata and generates valid MCP JSON Schema", () => {
    const parsed = parseScriptNote("Scripts/AI/Sincronizar Tickets Jira.md", sampleNote);
    expect(parsed.isScriptNote).toBe(true);
    expect(parsed.problems).toHaveLength(0);
    expect(parsed.definition).toBeDefined();

    const def = parsed.definition!;
    expect(def.scriptId).toBe("sincronizar_tickets_jira");
    expect(def.name).toBe("Sincronizar Tickets do Jira");
    expect(def.category).toBe("Jira");
    expect(def.runtime).toBe("python");
    expect(def.scriptPath).toBe("scripts/contexto_tickets.py");
    expect(def.inputMode).toBe("stdin");
    expect(def.timeoutSeconds).toBe(120);
    expect(def.exposeAsTool).toBe(true);

    expect(def.jsonSchema).toEqual({
      type: "object",
      properties: {
        instancia: {
          type: "string",
          description: "Nome da instância Jira no cofre",
        },
        ticket_keys: {
          type: "array",
          items: { type: "string" },
          description: "Lista de chaves de tickets",
        },
        sem_subtarefas: {
          type: "boolean",
          default: false,
        },
        formato_saida: {
          type: "string",
          enum: ["json", "resumo", "markdown"],
          default: "json",
        },
      },
      required: ["instancia", "ticket_keys"],
      additionalProperties: false,
    });
  });

  it("extracts inline code block when script_path is omitted", () => {
    const inlineNote = `---
script_id: hello_inline
name: Hello Inline
category: Utils
description: Prints greeting
runtime: node
---

\`\`\`javascript
console.log("hello from inline script");
\`\`\`
`;
    const parsed = parseScriptNote("Scripts/AI/Hello.md", inlineNote);
    expect(parsed.problems).toHaveLength(0);
    expect(parsed.definition?.inlineCode).toBe('console.log("hello from inline script");');
  });

  it("loads scripts into ScriptRegistry and reports duplicate script_ids", async () => {
    const files: Record<string, string> = {
      "Scripts/AI/One.md": sampleNote,
      "Scripts/AI/Duplicate.md": sampleNote,
      "Scripts/AI/RegularNote.md": "# Just a regular note without frontmatter",
    };

    const registry = new ScriptRegistry();
    const loader = new ScriptLoader({
      vault: {
        listMarkdownFiles: () => Object.keys(files),
        readText: async (p) => files[p] ?? "",
        writeText: async (p, c) => {
          files[p] = c;
        },
        exists: (p) => p in files,
      },
      registry,
      getFolder: () => "Scripts/AI",
    });

    const result = await loader.load();
    expect(result.scripts).toHaveLength(1);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.level).toBe("warning");
    expect(registry.get("sincronizar_tickets_jira")?.name).toBe("Sincronizar Tickets do Jira");
    expect(registry.listCategories()).toEqual(["Jira"]);
    expect(registry.listExposedTools()).toHaveLength(1);
  });

  it("parses Python script file with YAML frontmatter in docstring", () => {
    const pythonCode = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
---
id: meu_script_python
nome: Meu Script Python
categoria: Automacao
descricao: "Executa tarefa automatizada"
runtime: python
expose: true
params:
  nome:
    type: string
    required: true
    description: "Nome do usuario"
---

Documentacao detalhada do script em Python.
"""
import sys

print("Hello World")
`;

    const parsed = parseScriptNote("scripts/meu_script.py", pythonCode);
    expect(parsed.isScriptNote).toBe(true);
    expect(parsed.problems).toHaveLength(0);
    expect(parsed.definition).toBeDefined();

    const def = parsed.definition!;
    expect(def.scriptId).toBe("meu_script_python");
    expect(def.name).toBe("Meu Script Python");
    expect(def.category).toBe("Automacao");
    expect(def.scriptPath).toBe("scripts/meu_script.py");
    expect(def.runtime).toBe("python");
    expect(def.exposeAsTool).toBe(true);
    expect(def.jsonSchema).toEqual({
      type: "object",
      properties: {
        nome: {
          type: "string",
          description: "Nome do usuario",
        },
      },
      required: ["nome"],
      additionalProperties: false,
    });
  });

  it("ignores Python script file without YAML docstrings", () => {
    const pythonRegular = `#!/usr/bin/env python3
"""
A simple script without metadata frontmatter.
"""
import os
print("No frontmatter")
`;

    const parsed = parseScriptNote("scripts/regular.py", pythonRegular);
    expect(parsed.isScriptNote).toBe(false);
    expect(parsed.definition).toBeUndefined();
  });
});
