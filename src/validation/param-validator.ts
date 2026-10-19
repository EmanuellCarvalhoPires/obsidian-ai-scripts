// Strict parameter validator (Gatekeeper) for AI Scripts.
// Rejects missing required parameters and type mismatches before any OS process is spawned.

import type {
  ParamType,
  ScriptDefinition,
  ScriptParamSchema,
  ValidationIssue,
  ValidationResult,
} from "../types/script-types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceScalar(
  value: unknown,
  type: ParamType,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  switch (type) {
    case "string": {
      if (typeof value === "string") {
        return { ok: true, value };
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return { ok: true, value: String(value) };
      }
      return { ok: false, reason: "Expected a string." };
    }
    case "number": {
      if (typeof value === "number" && Number.isFinite(value)) {
        return { ok: true, value };
      }
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) {
          return { ok: true, value: parsed };
        }
      }
      return { ok: false, reason: "Expected a valid number." };
    }
    case "integer": {
      if (typeof value === "number" && Number.isInteger(value)) {
        return { ok: true, value };
      }
      if (typeof value === "string" && /^[-+]?\d+$/.test(value.trim())) {
        const parsed = Number.parseInt(value.trim(), 10);
        if (Number.isSafeInteger(parsed)) {
          return { ok: true, value: parsed };
        }
      }
      return { ok: false, reason: "Expected an integer." };
    }
    case "boolean": {
      if (typeof value === "boolean") {
        return { ok: true, value };
      }
      if (typeof value === "string") {
        const lower = value.trim().toLowerCase();
        if (lower === "true") return { ok: true, value: true };
        if (lower === "false") return { ok: true, value: false };
      }
      return { ok: false, reason: "Expected a boolean (true or false)." };
    }
    case "object": {
      if (isPlainObject(value)) {
        return { ok: true, value };
      }
      return { ok: false, reason: "Expected a JSON object." };
    }
    case "array": {
      if (Array.isArray(value)) {
        return { ok: true, value };
      }
      return { ok: false, reason: "Expected an array." };
    }
  }
}

export class ParamValidator {
  /**
   * Validates raw input parameters against a ScriptDefinition or a parameter schema map.
   */
  validate(
    scriptOrName: Pick<ScriptDefinition, "name" | "params"> | string,
    rawParams: unknown,
    schemaMap?: Record<string, ScriptParamSchema>,
  ): ValidationResult {
    const scriptName = typeof scriptOrName === "string" ? scriptOrName : scriptOrName.name;
    const schemas = typeof scriptOrName === "string" ? (schemaMap ?? {}) : scriptOrName.params;

    const input: Record<string, unknown> = isPlainObject(rawParams) ? rawParams : {};
    const normalizedParams: Record<string, unknown> = {};
    const issues: ValidationIssue[] = [];
    const strippedKeys: string[] = [];

    for (const providedKey of Object.keys(input)) {
      if (!Object.prototype.hasOwnProperty.call(schemas, providedKey)) {
        strippedKeys.push(providedKey);
      }
    }

    for (const [paramName, schema] of Object.entries(schemas)) {
      const rawValue = input[paramName];
      const isMissing =
        rawValue === undefined ||
        rawValue === null ||
        (schema.type === "string" && typeof rawValue === "string" && rawValue.trim() === "" && schema.required === true);

      if (isMissing) {
        if (schema.required) {
          issues.push({
            param: paramName,
            code: "missing_required",
            message: `O script '${scriptName}' exige o parâmetro '${paramName}', que não foi informado.`,
          });
        } else if (schema.default !== undefined) {
          normalizedParams[paramName] = structuredClone(schema.default);
        }
        continue;
      }

      const coerced = coerceScalar(rawValue, schema.type);
      if (!coerced.ok) {
        issues.push({
          param: paramName,
          code: "invalid_type",
          message: `Parâmetro '${paramName}' inválido no script '${scriptName}': ${coerced.reason}`,
        });
        continue;
      }

      const value = coerced.value;

      if (schema.type === "string" && typeof value === "string") {
        if (schema.enum && schema.enum.length > 0 && !schema.enum.includes(value)) {
          issues.push({
            param: paramName,
            code: "enum_mismatch",
            message: `Parâmetro '${paramName}' deve ser um dos valores permitidos: ${schema.enum.join(", ")}.`,
          });
          continue;
        }
        if (schema.regex) {
          const re = new RegExp(schema.regex);
          if (!re.test(value)) {
            issues.push({
              param: paramName,
              code: "regex_mismatch",
              message: `Parâmetro '${paramName}' não corresponde ao formato exigido (${schema.regex}).`,
            });
            continue;
          }
        }
      }

      if ((schema.type === "number" || schema.type === "integer") && typeof value === "number") {
        if (schema.min !== undefined && value < schema.min) {
          issues.push({
            param: paramName,
            code: "below_min",
            message: `Parâmetro '${paramName}' (${value}) é menor que o mínimo permitido (${schema.min}).`,
          });
          continue;
        }
        if (schema.max !== undefined && value > schema.max) {
          issues.push({
            param: paramName,
            code: "above_max",
            message: `Parâmetro '${paramName}' (${value}) excede o máximo permitido (${schema.max}).`,
          });
          continue;
        }
      }

      if (schema.type === "array" && Array.isArray(value)) {
        if (schema.required && value.length === 0) {
          issues.push({
            param: paramName,
            code: "missing_required",
            message: `O script '${scriptName}' exige o parâmetro '${paramName}', que não foi informado.`,
          });
          continue;
        }
        const itemType = schema.items ?? "string";
        const coercedItems: unknown[] = [];
        let itemFailed = false;
        for (let i = 0; i < value.length; i++) {
          const itemCheck = coerceScalar(value[i], itemType);
          if (!itemCheck.ok) {
            issues.push({
              param: paramName,
              code: "invalid_array_item",
              message: `Item [${i}] do parâmetro '${paramName}' inválido: ${itemCheck.reason}`,
            });
            itemFailed = true;
            break;
          }
          coercedItems.push(itemCheck.value);
        }
        if (itemFailed) continue;
        normalizedParams[paramName] = coercedItems;
        continue;
      }

      normalizedParams[paramName] = value;
    }

    return {
      valid: issues.length === 0,
      normalizedParams,
      issues,
      strippedKeys,
    };
  }
}
