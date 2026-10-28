// Core types for script definitions, parameter schemas, and plugin settings.

export type ScriptRuntime = "python" | "node" | "bash" | "powershell";

export const SCRIPT_RUNTIMES: readonly ScriptRuntime[] = ["python", "node", "bash", "powershell"];

export type ScriptInputMode = "stdin" | "cli_args" | "temp_file";

export const SCRIPT_INPUT_MODES: readonly ScriptInputMode[] = ["stdin", "cli_args", "temp_file"];

export type ParamType = "string" | "number" | "integer" | "boolean" | "array" | "object";

export const PARAM_TYPES: readonly ParamType[] = ["string", "number", "integer", "boolean", "array", "object"];

export interface ScriptParamSchema {
  type: ParamType;
  required?: boolean;
  description?: string;
  default?: unknown;
  /** Allowed string values when type is "string". */
  enum?: string[];
  /** Regular expression pattern when type is "string". */
  regex?: string;
  /** Minimum value when type is "number" or "integer". */
  min?: number;
  /** Maximum value when type is "number" or "integer". */
  max?: number;
  /** Element type when type is "array". */
  items?: ParamType;
  /** Whether an array or scalar argument in cli_args mode should be passed positionally instead of --flag. */
  positional?: boolean;
  /** Flag used in cli_args mode when the script does not follow the default (name with "_" turned into "-"), e.g. "--max_chars". */
  flag?: string;
}

export interface ScriptDefinition {
  scriptId: string;
  name: string;
  category: string;
  description: string;
  runtime: ScriptRuntime;
  /** Vault-relative path to the script file, if external. */
  scriptPath?: string;
  /** Inline code block extracted from the Markdown note when scriptPath is not set. */
  inlineCode?: string;
  inputMode: ScriptInputMode;
  timeoutSeconds: number;
  exposeAsTool: boolean;
  /** Optional working directory relative to the vault root. */
  cwd?: string;
  /** Optional environment variables (may contain {{secret:NAME}} placeholders). */
  env?: Record<string, string>;
  params: Record<string, ScriptParamSchema>;
  /** Generated JSON Schema for MCP tools and documentation. */
  jsonSchema: Record<string, unknown>;
  /** Vault-relative path of the Markdown note that defined this script. */
  notePath: string;
  /** Markdown body of the note (documentation/instructions). */
  markdownBody: string;
}

export interface ScriptSummary {
  scriptId: string;
  name: string;
  category: string;
  description: string;
  runtime: ScriptRuntime;
  inputMode: ScriptInputMode;
  timeoutSeconds: number;
  exposeAsTool: boolean;
  notePath: string;
  scriptPath?: string;
  requiredParams: string[];
  optionalParams: string[];
}

export interface LoadProblem {
  level: "error" | "warning";
  path: string;
  scriptId?: string;
  message: string;
}

export interface ScriptLoadResult {
  scripts: ScriptDefinition[];
  problems: LoadProblem[];
}

export interface ValidationIssue {
  param: string;
  code:
    | "missing_required"
    | "invalid_type"
    | "enum_mismatch"
    | "regex_mismatch"
    | "below_min"
    | "above_max"
    | "invalid_array_item";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  normalizedParams: Record<string, unknown>;
  issues: ValidationIssue[];
  /** Filtered unknown parameter keys that were stripped by the gatekeeper. */
  strippedKeys: string[];
}

export interface AIScriptsSettings {
  scriptsFolder: string;
  defaultTimeoutSeconds: number;
  maxHistoryEntries: number;
  autoOpenMonitorOnRun: boolean;
  /** Stored for the guided setup only; the plugin does not enforce it. */
  allowWriteOutsideVault: boolean;
  /** Installs the missing starter scripts into the scripts folder on load. */
  installStarterPack: boolean;
  /** Starter script ids already handled, so a script the user deleted is not recreated. */
  starterPackInstalledIds: string[];
}

export const DEFAULT_SETTINGS: AIScriptsSettings = {
  scriptsFolder: "Scripts/AI",
  defaultTimeoutSeconds: 120,
  maxHistoryEntries: 100,
  autoOpenMonitorOnRun: false,
  allowWriteOutsideVault: false,
  installStarterPack: true,
  starterPackInstalledIds: [],
};

export function normalizeFolder(folder: string): string {
  const trimmed = folder.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  return trimmed || DEFAULT_SETTINGS.scriptsFolder;
}

export function normalizeSettings(raw: unknown): AIScriptsSettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_SETTINGS };
  }
  const obj = raw as Record<string, unknown>;
  const scriptsFolder =
    typeof obj.scriptsFolder === "string" ? normalizeFolder(obj.scriptsFolder) : DEFAULT_SETTINGS.scriptsFolder;
  const defaultTimeoutSeconds =
    typeof obj.defaultTimeoutSeconds === "number" &&
    Number.isFinite(obj.defaultTimeoutSeconds) &&
    obj.defaultTimeoutSeconds >= 1 &&
    obj.defaultTimeoutSeconds <= 3600
      ? Math.round(obj.defaultTimeoutSeconds)
      : DEFAULT_SETTINGS.defaultTimeoutSeconds;
  const maxHistoryEntries =
    typeof obj.maxHistoryEntries === "number" &&
    Number.isFinite(obj.maxHistoryEntries) &&
    obj.maxHistoryEntries >= 10 &&
    obj.maxHistoryEntries <= 1000
      ? Math.round(obj.maxHistoryEntries)
      : DEFAULT_SETTINGS.maxHistoryEntries;
  const autoOpenMonitorOnRun =
    typeof obj.autoOpenMonitorOnRun === "boolean"
      ? obj.autoOpenMonitorOnRun
      : DEFAULT_SETTINGS.autoOpenMonitorOnRun;
  const allowWriteOutsideVault =
    typeof obj.allowWriteOutsideVault === "boolean"
      ? obj.allowWriteOutsideVault
      : DEFAULT_SETTINGS.allowWriteOutsideVault;
  const installStarterPack =
    typeof obj.installStarterPack === "boolean" ? obj.installStarterPack : DEFAULT_SETTINGS.installStarterPack;
  const starterPackInstalledIds = Array.isArray(obj.starterPackInstalledIds)
    ? [...new Set(obj.starterPackInstalledIds.filter((id): id is string => typeof id === "string" && id !== ""))]
    : [];

  return {
    scriptsFolder,
    defaultTimeoutSeconds,
    maxHistoryEntries,
    autoOpenMonitorOnRun,
    allowWriteOutsideVault,
    installStarterPack,
    starterPackInstalledIds,
  };
}
