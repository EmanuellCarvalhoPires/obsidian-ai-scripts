import { describe, expect, it } from "vitest";
import { ParamValidator } from "../../src/validation/param-validator";
import type { ScriptParamSchema } from "../../src/types/script-types";

describe("ParamValidator (Gatekeeper)", () => {
  const validator = new ParamValidator();

  const jiraSchemas: Record<string, ScriptParamSchema> = {
    instancia: {
      type: "string",
      required: true,
      description: "Nome da instância Jira",
    },
    ticket_keys: {
      type: "array",
      items: "string",
      required: true,
      description: "Lista de chaves",
    },
    sem_subtarefas: {
      type: "boolean",
      required: false,
      default: false,
    },
    formato_saida: {
      type: "string",
      required: false,
      enum: ["json", "resumo", "markdown"],
      default: "json",
    },
    limite: {
      type: "integer",
      required: false,
      min: 1,
      max: 100,
    },
    codigo_projeto: {
      type: "string",
      required: false,
      regex: "^[A-Z]{2,10}$",
    },
    config_extra: {
      type: "object",
      required: false,
    },
  };

  it("blocks execution and returns the exact required message when a required param is missing", () => {
    const res = validator.validate("Sincronizar Tickets do Jira", { ticket_keys: ["PROJ-43"] }, jiraSchemas);
    expect(res.valid).toBe(false);
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0]?.code).toBe("missing_required");
    expect(res.issues[0]?.message).toBe(
      "O script 'Sincronizar Tickets do Jira' exige o parâmetro 'instancia', que não foi informado.",
    );
  });

  it("blocks execution when a required string is empty or a required array is empty", () => {
    const res = validator.validate(
      "Sincronizar Tickets do Jira",
      { instancia: "   ", ticket_keys: [] },
      jiraSchemas,
    );
    expect(res.valid).toBe(false);
    expect(res.issues.map((i) => i.param)).toEqual(["instancia", "ticket_keys"]);
  });

  it("applies default values for omitted optional parameters and strips unknown parameters", () => {
    const res = validator.validate(
      "Sincronizar Tickets do Jira",
      {
        instancia: "Acme",
        ticket_keys: ["PROJ-43", "PROJ-45"],
        injected_flag: "--rm-rf",
      },
      jiraSchemas,
    );
    expect(res.valid).toBe(true);
    expect(res.strippedKeys).toEqual(["injected_flag"]);
    expect(res.normalizedParams).toEqual({
      instancia: "Acme",
      ticket_keys: ["PROJ-43", "PROJ-45"],
      sem_subtarefas: false,
      formato_saida: "json",
    });
  });

  it("coerces string numbers and booleans safely and checks min/max/enum/regex", () => {
    const validRes = validator.validate(
      "Sincronizar Tickets do Jira",
      {
        instancia: "Alfa",
        ticket_keys: ["SOC-10"],
        sem_subtarefas: "true",
        formato_saida: "markdown",
        limite: "50",
        codigo_projeto: "SOC",
        config_extra: { retry: 2 },
      },
      jiraSchemas,
    );
    expect(validRes.valid).toBe(true);
    expect(validRes.normalizedParams.sem_subtarefas).toBe(true);
    expect(validRes.normalizedParams.limite).toBe(50);
    expect(validRes.normalizedParams.config_extra).toEqual({ retry: 2 });

    const invalidRes = validator.validate(
      "Sincronizar Tickets do Jira",
      {
        instancia: "Alfa",
        ticket_keys: ["SOC-10"],
        formato_saida: "xml",
        limite: 500,
        codigo_projeto: "soc-123",
        config_extra: ["not-an-object"],
      },
      jiraSchemas,
    );
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.issues.map((i) => i.code)).toEqual([
      "enum_mismatch",
      "above_max",
      "regex_mismatch",
      "invalid_type",
    ]);
  });

  it("validates array item types", () => {
    const numArraySchema: Record<string, ScriptParamSchema> = {
      ids: { type: "array", items: "integer", required: true },
    };
    const bad = validator.validate("Batch IDs", { ids: [1, "not-a-number", 3] }, numArraySchema);
    expect(bad.valid).toBe(false);
    expect(bad.issues[0]?.code).toBe("invalid_array_item");

    const good = validator.validate("Batch IDs", { ids: [1, "2", 3] }, numArraySchema);
    expect(good.valid).toBe(true);
    expect(good.normalizedParams.ids).toEqual([1, 2, 3]);
  });
});
