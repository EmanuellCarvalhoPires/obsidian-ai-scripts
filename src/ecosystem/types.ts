// Public contracts of the AI Ecosystem plugin that AI Scripts uses.
//
// Vendored from obsidian-ai-ecosystem (src/types/index.ts, Provider API version 1),
// extended with optional stdin and signal fields on HubScriptOptions for streaming control.

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
  handler: (args: Record<string, unknown>, ctx: HubCallContext) => Promise<HubToolResult>;
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
  }): void;

  getServerStatus(): { running: boolean; port: number; activeModules: string[] };
}
