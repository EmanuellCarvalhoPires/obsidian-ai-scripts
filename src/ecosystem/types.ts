// Public contracts of the AI Ecosystem plugin that AI Scripts uses.
//
// Vendored from obsidian-ai-ecosystem (src/types/index.ts, Provider API version 1, minor 1.1),
// extended with optional stdin and signal fields on HubScriptOptions for streaming control.
// The 1.1 additions are the optional HubTool index metadata, api.toolIndex.sync, ToolIndexEntry
// and the "tool-runner:<module>" service (IndexedToolRunner).

/** Provider API version implemented by the AI Ecosystem this file was copied from. */
export const AI_ECOSYSTEM_API_VERSION = 1;

/** Plugin id of the AI Ecosystem. */
export const ECOSYSTEM_ID = "ai-ecosystem";

export const ECOSYSTEM_EVENTS = {
  ready: "ai-ecosystem:ready",
  unloading: "ai-ecosystem:unloading",
  moduleRegistered: "ai-ecosystem:module-registered",
  moduleUnregistered: "ai-ecosystem:module-unregistered",
  serviceChanged: "ai-ecosystem:service-changed",
  serverStatus: "ai-ecosystem:server-status",
} as const;

// ---------------------------------------------------------------------------
// Clients (who called)
// ---------------------------------------------------------------------------

export interface ClientContext {
  id: string;
  /** Display name, e.g. "Claude Code". */
  name: string;
}

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HubRequest {
  method: HttpMethod;
  path: string;
  fullPath: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
  client: ClientContext;
}

export interface HubResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HubRoute {
  method: HttpMethod;
  path: string;
  description?: string;
  handler: (req: HubRequest) => Promise<HubResponse> | HubResponse;
}

// ---------------------------------------------------------------------------
// MCP tools and prompts
// ---------------------------------------------------------------------------

export type HubToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface HubToolResult {
  content: HubToolContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface HubCallContext {
  client: ClientContext;
  moduleId: string;
  /** Aborted when the client cancels the call or closes the connection. */
  signal?: AbortSignal;
  /** Detected from the MCP client name. */
  clientKind?: "claude-code" | "antigravity" | "other";
}

export interface HubTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  /** Stays visible while the module still waits for its guided setup. */
  availableDuringSetup?: boolean;
  /** Index metadata (API 1.1). All optional; defaults are inferred from description and annotations. */
  categoria?: string;
  tags?: string[];
  /** One line, recommended <= 100 characters. */
  resumo?: string;
  efeito?: ToolEffect;
  exposicao?: ToolExposure;
  /**
   * Approval policy read by the tools_run hook: a question template with {arg} placeholders,
   * "obrigatoria" (always ask) or "dispensada" (never ask, even with efeito "externo").
   */
  aprovacao?: string;
  /** Example arguments shown by tools_describe. */
  exemplo?: Record<string, unknown>;
  handler: (args: Record<string, unknown>, ctx: HubCallContext) => Promise<HubToolResult>;
}

export type ToolEffect = "leitura" | "cofre" | "externo";
/** "fixa" stays in tools/list in indexado mode; "indice" is only reachable through tools_find/tools_run. */
export type ToolExposure = "fixa" | "indice";
/** What an index entry stands for. */
export type ToolKind = "tool" | "script" | "template" | "api";

/** What a module writes into its tools.db through api.toolIndex.sync. */
export interface ToolIndexEntry {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: HubTool["annotations"];
  /** Default "tool". */
  kind?: ToolKind;
  categoria?: string;
  tags?: string[];
  resumo?: string;
  efeito?: ToolEffect;
  exposicao?: ToolExposure;
  aprovacao?: string;
  exemplo?: Record<string, unknown>;
}

/**
 * Service a module registers (name: toolRunnerServiceName(moduleId)) to run index entries that
 * are not registered MCP tools. tools_run calls it when the id is in the module's tools.db but
 * not in the registry. The result goes back as is.
 */
export interface IndexedToolRunner {
  run(id: string, args: Record<string, unknown>, ctx: HubCallContext): Promise<HubToolResult>;
}

export const TOOL_RUNNER_SERVICE_PREFIX = "tool-runner:";

export function toolRunnerServiceName(moduleId: string): string {
  return `${TOOL_RUNNER_SERVICE_PREFIX}${moduleId}`;
}

export interface ToolIndexApi {
  /** Incrementally syncs the module's <vault>/<configDir>/plugins/<id>/tools.db (unchanged tools are skipped by hash). */
  sync(moduleId: string, entries: ToolIndexEntry[]): Promise<void>;
}

export interface HubPromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

export interface HubPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  handler: (
    args: Record<string, string>,
    ctx: HubCallContext,
  ) => Promise<{ description?: string; messages: HubPromptMessage[] }>;
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export interface HubModuleRegistration {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  routes?: HubRoute[];
  legacyAliases?: HubRoute[];
  tools?: HubTool[];
  prompts?: HubPrompt[];
  instructions?: string;
  onUnload?: () => void;
}

export type RegisterResult = { ok: true; warnings?: string[] } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Service Bus & Secrets
// ---------------------------------------------------------------------------

export type ServiceChangeListener = (name: string, available: boolean) => void;

/** Name of the service Environment Keys registers. */
export const SECRETS_SERVICE = "secrets";

export interface SecretVaultService {
  isLocked(): boolean;
  /** Replaces the values of known secrets with [REDACTED]. */
  redact(text: string): string;
  /**
   * Resolves {{secret:NAME}} placeholders in `env` and calls spawnFn with the resolved env.
   * The resolved env is never returned to the caller.
   */
  spawnWithSecrets(
    env: Record<string, string>,
    spawnFn: (resolvedEnv: Record<string, string>) => void,
    callerModuleId: string,
  ): Promise<void>;
}

/** Name of the service the AI Ecosystem registers for hooks and guided setup. */
export const HOOKS_SERVICE = "hooks";

export interface HookRuleData {
  /** environment-variables: allowed host patterns of secrets WITHOUT full access / any host. */
  hosts?: string[];
  /** ai-scripts: vault-relative folders whose scripts must run through the plugin. */
  scriptFolders?: string[];
  /** ai-templates: vault-relative target path patterns of the templates ({{...}} becomes *). */
  templateTargets?: string[];
  /** environment-variables: vault-relative folders of tool notes (Grep stays allowed there). */
  toolNoteFolders?: string[];
}

export interface SetupHandler {
  /** Facts the module detects by itself (never secret values). */
  detect?(): Promise<Record<string, unknown>>;
  /** Applies one answer. Returns an error message to refuse it. */
  save?(key: string, value: unknown): Promise<string | void>;
  /** Called by ecosystem_setup_complete. ok:false blocks completion and lists what is missing. */
  validate?(): Promise<{ ok: boolean; missing?: string[] }>;
}

export interface HooksService {
  setRuleData(moduleId: string, data: HookRuleData): void;
  /** Returns an unregister function. */
  registerSetupHandler(moduleId: string, handler: SetupHandler): () => void;
  getModuleState(moduleId: string): "pendente_configuracao" | "configurado" | "desativado" | undefined;
}

// ---------------------------------------------------------------------------
// Script Engine
// ---------------------------------------------------------------------------

export type ScriptLanguage = "python" | "node" | "bash" | "powershell";

export interface HubScriptOptions {
  language: ScriptLanguage;
  /** Path relative to the vault root. */
  scriptPath: string;
  inlineCode?: string;
  args?: string[];
  /** Optional standard input payload piped to the child process. */
  stdin?: string;
  /** Optional abort signal to terminate the child process immediately. */
  signal?: AbortSignal;
  /** Working directory relative to the vault root (default: the vault root). */
  cwd?: string;
  timeoutSeconds?: number;
  /** May contain {{secret:NAME}}: resolved by Environment Keys directly into the child env. */
  env?: Record<string, string>;
  skipActivityLog?: boolean;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export interface ScriptExecutionResult {
  exitCode: number;
  /** Already redacted. */
  stdout: string;
  /** Already redacted. */
  stderr: string;
  durationMs: number;
  /** True when the process was killed (timeout or cancel). */
  killed: boolean;
}

// ---------------------------------------------------------------------------
// Provider API
// ---------------------------------------------------------------------------

export interface ActivityHandle {
  readonly id: string;
  appendOutput(stream: "stdout" | "stderr", chunk: string): void;
  end(update: { status: number; durationMs: number; response?: unknown }): void;
}

export interface ActivityBeginInput {
  moduleId: string;
  client?: string;
  type: string;
  target: string;
  payload?: unknown;
  alert?: boolean;
}

export interface AIEcosystemAPI {
  readonly apiVersion: number;
  isReady(): boolean;

  registerModule(module: HubModuleRegistration): RegisterResult;
  unregisterModule(moduleId: string): boolean;
  updateTools(moduleId: string, tools: HubTool[]): void;
  updatePrompts(moduleId: string, prompts: HubPrompt[]): void;

  registerService<T>(serviceName: string, ownerModuleId: string, instance: T): void;
  unregisterService(serviceName: string): void;
  getService<T>(serviceName: string): T | undefined;
  onServiceChange(cb: ServiceChangeListener): () => void;

  runScript(options: HubScriptOptions, callerModuleId: string): Promise<ScriptExecutionResult>;

  logActivity(entry: {
    moduleId: string;
    client?: string;
    type: string;
    target: string;
    status: number;
    durationMs: number;
    payload?: unknown;
    response?: unknown;
    output?: string;
    alert?: boolean;
  }): void;

  beginActivity?(entry: ActivityBeginInput): ActivityHandle;

  getServerStatus(): { running: boolean; port: number; activeModules: string[] };

  /** API 1.1. Absent on older Ecosystem builds: check before use. */
  readonly toolIndex?: ToolIndexApi;
}
