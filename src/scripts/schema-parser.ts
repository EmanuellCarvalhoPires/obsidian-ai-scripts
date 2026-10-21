// Parses Markdown script notes (YAML frontmatter + optional embedded code block)
// and builds JSON Schema definitions for MCP tools.

import { normalizePath, parseYaml } from "obsidian";
import {
  DEFAULT_SETTINGS,
  PARAM_TYPES,
  SCRIPT_INPUT_MODES,
  SCRIPT_RUNTIMES,
} from "../types/script-types";
import type {
  LoadProblem,
  ParamType,
  ScriptDefinition,
  ScriptInputMode,
  ScriptParamSchema,
  ScriptRuntime,
} from "../types/script-types";

export const SCRIPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const PARAM_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

const FRONTMATTER_REGEX = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const CODE_BLOCK_REGEX = /```([A-Za-z0-9_-]*)[ \t]*\r?\n([\s\S]*?)```/g;

const RUNTIME_ALIASES: Record<string, ScriptRuntime> = {
  python: "python",
  py: "python",
  python3: "python",
  node: "node",
  nodejs: "node",
  javascript: "node",
  js: "node",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  powershell: "powershell",
  pwsh: "powershell",
  ps1: "powershell",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatScalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return typeof value;
}

export function splitFrontmatter(content: string): { yaml: string | undefined; body: string } {
  const match = FRONTMATTER_REGEX.exec(content);
  if (!match) return { yaml: undefined, body: content };
  return { yaml: match[1], body: content.slice(match[0].length) };
}

/** Extracts YAML frontmatter embedded within a Python docstring (or shell comment header). */
export function extractDocstringFrontmatter(content: string): { yaml: string | undefined; body: string } {
  // Checks for --- \n (id: ...) \n --- inside the file header / docstring
  const match = /---\s*\r?\n(id:\s*[\s\S]*?\r?\n)---/.exec(content);
  if (!match) return { yaml: undefined, body: content };
  return { yaml: match[1], body: content };
}

export function extractInlineCode(body: string, runtime: ScriptRuntime): string | undefined {
  const blocks: Array<{ lang: string; code: string }> = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(CODE_BLOCK_REGEX.source, "g");
  while ((match = regex.exec(body)) !== null) {
    const lang = (match[1] ?? "").trim().toLowerCase();
    const code = (match[2] ?? "").replace(/\r\n?/g, "\n").trim();
    if (code.length > 0) {
      blocks.push({ lang, code });
    }
  }
  if (blocks.length === 0) return undefined;

  for (const block of blocks) {
    if (RUNTIME_ALIASES[block.lang] === runtime) {
      return block.code;
    }
  }
  return blocks[0]?.code;
}

export function parseParamsMap(raw: unknown): {
  params: Record<string, ScriptParamSchema>;
  errors: string[];
} {
  const params: Record<string, ScriptParamSchema> = {};
  const errors: string[] = [];

  if (raw === undefined || raw === null) {
    return { params, errors };
  }
  if (!isRecord(raw)) {
    return {
      params,
      errors: ['"params" must be a map of parameter name to schema object.'],
    };
  }

  for (const [paramName, rawSpec] of Object.entries(raw)) {
    if (!PARAM_NAME_PATTERN.test(paramName)) {
      errors.push(
        `Parameter name "${paramName}" is invalid: use letters, digits, "_" and "-", starting with a letter or "_".`,
      );
      continue;
    }

    const spec: Record<string, unknown> =
      typeof rawSpec === "string" ? { type: rawSpec } : isRecord(rawSpec) ? rawSpec : {};

    if (typeof rawSpec !== "string" && !isRecord(rawSpec)) {
      errors.push(`Parameter "${paramName}" must be a schema object or a type string.`);
      continue;
    }

    const rawType = typeof spec.type === "string" ? spec.type.trim().toLowerCase() : "string";
    if (!(PARAM_TYPES as readonly string[]).includes(rawType)) {
      errors.push(
        `Parameter "${paramName}" has invalid type "${formatScalar(spec.type)}". Valid types: ${PARAM_TYPES.join(", ")}.`,
      );
      continue;
    }
    const type = rawType as ParamType;

    const schema: ScriptParamSchema = {
      type,
      required: spec.required === true || spec.obrigatorio === true,
    };

    const desc =
      typeof spec.description === "string"
        ? spec.description.trim()
        : typeof spec.descricao === "string"
          ? spec.descricao.trim()
          : undefined;
    if (desc) schema.description = desc;

    if (spec.default !== undefined) {
      schema.default = spec.default;
    } else if (spec.padrao !== undefined) {
      schema.default = spec.padrao;
    }

    if (spec.enum !== undefined) {
      if (!Array.isArray(spec.enum) || spec.enum.length === 0 || spec.enum.some((v) => typeof v !== "string")) {
        errors.push(`Parameter "${paramName}": "enum" must be a non-empty array of strings.`);
        continue;
      }
      schema.enum = spec.enum as string[];
    }

    if (spec.regex !== undefined) {
      if (typeof spec.regex !== "string" || spec.regex.trim() === "") {
        errors.push(`Parameter "${paramName}": "regex" must be a non-empty string pattern.`);
        continue;
      }
      try {
        new RegExp(spec.regex);
        schema.regex = spec.regex;
      } catch {
        errors.push(`Parameter "${paramName}": "regex" is not a valid regular expression.`);
        continue;
      }
    }

    if (spec.min !== undefined) {
      if (typeof spec.min !== "number" || !Number.isFinite(spec.min)) {
        errors.push(`Parameter "${paramName}": "min" must be a finite number.`);
        continue;
      }
      schema.min = spec.min;
    }

    if (spec.max !== undefined) {
      if (typeof spec.max !== "number" || !Number.isFinite(spec.max)) {
        errors.push(`Parameter "${paramName}": "max" must be a finite number.`);
        continue;
      }
      schema.max = spec.max;
    }

    if (schema.min !== undefined && schema.max !== undefined && schema.min > schema.max) {
      errors.push(`Parameter "${paramName}": "min" (${schema.min}) cannot be greater than "max" (${schema.max}).`);
      continue;
    }

    if (type === "array" && spec.items !== undefined) {
      const itemTypeStr =
        typeof spec.items === "string"
          ? spec.items.trim().toLowerCase()
          : isRecord(spec.items) && typeof spec.items.type === "string"
            ? spec.items.type.trim().toLowerCase()
            : "";
      if (!(PARAM_TYPES as readonly string[]).includes(itemTypeStr)) {
        errors.push(
          `Parameter "${paramName}": "items" has invalid type "${formatScalar(spec.items)}". Valid types: ${PARAM_TYPES.join(", ")}.`,
        );
        continue;
      }
      schema.items = itemTypeStr as ParamType;
    }

    if (spec.positional === true) {
      schema.positional = true;
    }

    params[paramName] = schema;
  }

  return { params, errors };
}

/** Converts a map of ScriptParamSchema into a standard JSON Schema object for MCP tools. */
export function buildJsonSchema(params: Record<string, ScriptParamSchema>): Record<string, unknown> {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const [name, param] of Object.entries(params)) {
    const prop: Record<string, unknown> = {
      type: param.type,
    };
    if (param.description) prop.description = param.description;
    if (param.default !== undefined) prop.default = param.default;
    if (param.enum && param.enum.length > 0) prop.enum = [...param.enum];
    if (param.regex) prop.pattern = param.regex;
    if (param.min !== undefined) prop.minimum = param.min;
    if (param.max !== undefined) prop.maximum = param.max;
    if (param.type === "array") {
      prop.items = { type: param.items ?? "string" };
    }
    properties[name] = prop;
    if (param.required) {
      required.push(name);
    }
  }

  const schema: Record<string, unknown> = {
    type: "object",
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) {
    schema.required = required;
  }
  return schema;
}

/** Builds a sample parameter payload for documentation and get_script_schema. */
export function buildExampleParams(params: Record<string, ScriptParamSchema>): Record<string, unknown> {
  const example: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(params)) {
    if (spec.default !== undefined) {
      example[name] = spec.default;
      continue;
    }
    if (spec.enum && spec.enum.length > 0) {
      example[name] = spec.enum[0];
      continue;
    }
    switch (spec.type) {
      case "string":
        example[name] = `<${name}>`;
        break;
      case "number":
      case "integer":
        example[name] = spec.min ?? 1;
        break;
      case "boolean":
        example[name] = false;
        break;
      case "array":
        example[name] = spec.items === "number" || spec.items === "integer" ? [1] : [`<${name}_item>`];
        break;
      case "object":
        example[name] = {};
        break;
    }
  }
  return example;
}

export interface ParsedScriptNote {
  isScriptNote: boolean;
  scriptId?: string;
  definition?: ScriptDefinition;
  problems: LoadProblem[];
}

export function parseScriptNote(
  notePath: string,
  content: string,
  defaultTimeoutSeconds: number = DEFAULT_SETTINGS.defaultTimeoutSeconds,
): ParsedScriptNote {
  const isCodeFile = /\.(py|sh|ps1|js|mjs|ts)$/i.test(notePath);
  const { yaml, body } = isCodeFile
    ? extractDocstringFrontmatter(content)
    : splitFrontmatter(content);
  if (yaml === undefined) {
    return { isScriptNote: false, problems: [] };
  }

  let front: unknown;
  try {
    front = parseYaml(yaml);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (!/(script_id|runtime|script_path)/.test(yaml)) {
      return { isScriptNote: false, problems: [] };
    }
    return {
      isScriptNote: true,
      problems: [{ level: "error", path: notePath, message: `Invalid YAML frontmatter: ${reason}` }],
    };
  }

  if (!isRecord(front)) {
    return { isScriptNote: false, problems: [] };
  }

  const rawIdValue = front.script_id ?? front.id;
  if (rawIdValue === undefined || rawIdValue === null) {
    return { isScriptNote: false, problems: [] };
  }

  const problems: LoadProblem[] = [];
  const scriptId =
    typeof rawIdValue === "string" || typeof rawIdValue === "number" ? String(rawIdValue).trim() : "";

  const addError = (message: string): void => {
    problems.push({ level: "error", path: notePath, scriptId: scriptId || undefined, message });
  };

  if (!SCRIPT_ID_PATTERN.test(scriptId)) {
    addError(
      `script_id "${formatScalar(rawIdValue)}" is invalid: use letters, digits, "_" and "-" (up to 64 characters).`,
    );
    return { isScriptNote: true, scriptId: scriptId || undefined, problems };
  }

  const rawName = front.nome ?? front.name;
  const name = typeof rawName === "string" && rawName.trim() !== "" ? rawName.trim() : scriptId;

  const rawCategory = front.categoria ?? front.category;
  const category =
    typeof rawCategory === "string" && rawCategory.trim() !== "" ? rawCategory.trim() : "General";

  const rawDescription = front.descricao ?? front.description;
  const description = typeof rawDescription === "string" ? rawDescription.trim() : "";
  if (description === "") {
    problems.push({
      level: "warning",
      path: notePath,
      scriptId,
      message: "Script has no description (descricao / description). Agents choose scripts by their description.",
    });
  }

  const rawRuntime = front.runtime ?? front.language;
  const runtimeKey = typeof rawRuntime === "string" ? rawRuntime.trim().toLowerCase() : "";
  const runtime = RUNTIME_ALIASES[runtimeKey];
  if (!runtime || !(SCRIPT_RUNTIMES as readonly string[]).includes(runtime)) {
    addError(
      `runtime "${formatScalar(rawRuntime)}" is invalid. Supported runtimes: ${SCRIPT_RUNTIMES.join(", ")}.`,
    );
  }

  const rawInputMode = front.input_mode ?? front.inputMode;
  let inputMode: ScriptInputMode = "stdin";
  if (rawInputMode !== undefined && rawInputMode !== null) {
    const modeStr = typeof rawInputMode === "string" ? rawInputMode.trim().toLowerCase() : "";
    if ((SCRIPT_INPUT_MODES as readonly string[]).includes(modeStr)) {
      inputMode = modeStr as ScriptInputMode;
    } else {
      addError(
        `input_mode "${formatScalar(rawInputMode)}" is invalid. Supported modes: ${SCRIPT_INPUT_MODES.join(", ")}.`,
      );
    }
  }

  const rawTimeout = front.timeout_seconds ?? front.timeoutSeconds;
  let timeoutSeconds = defaultTimeoutSeconds;
  if (rawTimeout !== undefined && rawTimeout !== null) {
    if (typeof rawTimeout === "number" && Number.isFinite(rawTimeout) && rawTimeout >= 1 && rawTimeout <= 3600) {
      timeoutSeconds = Math.round(rawTimeout);
    } else {
      addError(`timeout_seconds "${formatScalar(rawTimeout)}" must be a number between 1 and 3600.`);
    }
  }

  const rawExpose = front.expose_as_tool ?? front.exposeAsTool ?? front.expose;
  const exposeAsTool = rawExpose === true || rawExpose === 1;

  let scriptPath: string | undefined;
  const rawScriptPath = front.script_path ?? front.scriptPath;
  if (rawScriptPath !== undefined && rawScriptPath !== null && formatScalar(rawScriptPath).trim() !== "") {
    if (typeof rawScriptPath !== "string") {
      addError("script_path must be a string.");
    } else {
      const normalized = normalizePath(rawScriptPath.trim());
      if (normalized.startsWith("..") || normalized.includes("/../")) {
        addError(`script_path "${rawScriptPath}" cannot traverse outside the vault.`);
      } else {
        scriptPath = normalized;
      }
    }
  } else if (isCodeFile) {
    // If it's a code file (e.g. .py) with docstrings, default script_path to itself
    scriptPath = normalizePath(notePath);
  }

  let cwd: string | undefined;
  if (front.cwd !== undefined && front.cwd !== null && formatScalar(front.cwd).trim() !== "") {
    if (typeof front.cwd === "string") {
      const normCwd = normalizePath(front.cwd.trim());
      if (normCwd.startsWith("..") || normCwd.includes("/../")) {
        addError(`cwd "${front.cwd}" cannot traverse outside the vault.`);
      } else {
        cwd = normCwd;
      }
    } else {
      addError("cwd must be a string.");
    }
  }

  let env: Record<string, string> | undefined;
  if (front.env !== undefined && front.env !== null) {
    if (!isRecord(front.env)) {
      addError("env must be a key-value map of strings.");
    } else {
      env = {};
      for (const [k, v] of Object.entries(front.env)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          env[k] = String(v);
        } else {
          addError(`env["${k}"] must be a string, number or boolean.`);
        }
      }
    }
  }

  const parsedParams = parseParamsMap(front.params ?? front.parametros);
  for (const err of parsedParams.errors) {
    addError(err);
  }

  const inlineCode = runtime ? extractInlineCode(body, runtime) : undefined;
  if (!scriptPath && !inlineCode) {
    addError(
      "Script note must either define script_path pointing to a file or include a fenced code block in the note body.",
    );
  }

  if (problems.some((p) => p.level === "error") || !runtime) {
    return { isScriptNote: true, scriptId, problems };
  }

  const cleanMarkdownBody = body.replace(/\r\n?/g, "\n").trim();
  const jsonSchema = buildJsonSchema(parsedParams.params);

  return {
    isScriptNote: true,
    scriptId,
    problems,
    definition: {
      scriptId,
      name,
      category,
      description,
      runtime,
      scriptPath,
      inlineCode,
      inputMode,
      timeoutSeconds,
      exposeAsTool,
      cwd,
      env,
      params: parsedParams.params,
      jsonSchema,
      notePath: normalizePath(notePath),
      markdownBody: cleanMarkdownBody,
    },
  };
}
