// Bridges script execution between AI Scripts, AI Ecosystem's runScript API,
// Environment Keys (spawnWithSecrets & redact), and local child_process fallback.

import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import type { AIEcosystemAPI, ScriptExecutionResult, SecretVaultService } from "../ecosystem/types";
import { SECRETS_SERVICE } from "../ecosystem/types";
import { MEMORY_BUFFER_CAP, appendCapped } from "./output-limiter";
import type { ScriptDefinition, ScriptRuntime } from "../types/script-types";

export const MODULE_ID = "ai-scripts";

const RUNTIME_EXTENSION: Record<ScriptRuntime, string> = {
  python: ".py",
  node: ".mjs",
  bash: ".sh",
  powershell: ".ps1",
};

const SECRET_PLACEHOLDER_RE = /\{\{\s*secret:[A-Za-z0-9_.-]+\s*\}\}/;

export interface BridgeExecuteOptions {
  script: ScriptDefinition;
  args: string[];
  stdin?: string;
  timeoutSeconds?: number;
  signal?: AbortSignal;
  onStdout?: (redactedLine: string) => void;
  onStderr?: (redactedLine: string) => void;
}

export interface ProcessBridgeDeps {
  getApi: () => AIEcosystemAPI | undefined;
  getVaultBasePath: () => string;
  getScriptsFolder: () => string;
  spawnImpl?: typeof nodeSpawn;
  /** When true, always use local spawn instead of delegating to api.runScript. */
  forceLocalSpawn?: boolean;
}

function hasSecretPlaceholder(env: Record<string, string> | undefined): boolean {
  if (!env) return false;
  return Object.values(env).some((v) => SECRET_PLACEHOLDER_RE.test(v));
}

function resolveCommand(runtime: ScriptRuntime, scriptAbsPath: string, args: string[]): { cmd: string; cmdArgs: string[] } {
  switch (runtime) {
    case "python":
      return { cmd: "python", cmdArgs: ["-u", scriptAbsPath, ...args] };
    case "node":
      return { cmd: "node", cmdArgs: [scriptAbsPath, ...args] };
    case "bash":
      return { cmd: "bash", cmdArgs: [scriptAbsPath, ...args] };
    case "powershell":
      return {
        cmd: process.platform === "win32" ? "powershell" : "pwsh",
        cmdArgs: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptAbsPath, ...args],
      };
  }
}

function killProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) {
    try {
      child.kill();
    } catch {
      // Process already exited.
    }
    return;
  }
  if (process.platform === "win32") {
    try {
      const killer = nodeSpawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.on("error", () => {
        try {
          child.kill();
        } catch {
          // Ignore.
        }
      });
    } catch {
      try {
        child.kill();
      } catch {
        // Ignore.
      }
    }
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // Ignore.
    }
  }
}

export class ProcessBridge {
  private readonly spawnImpl: typeof nodeSpawn;

  constructor(private readonly deps: ProcessBridgeDeps) {
    this.spawnImpl = deps.spawnImpl ?? nodeSpawn;
  }

  getSecretsService(): SecretVaultService | undefined {
    try {
      const api = this.deps.getApi();
      if (!api || typeof api.getService !== "function") return undefined;
      return api.getService<SecretVaultService>(SECRETS_SERVICE);
    } catch {
      return undefined;
    }
  }

  getVaultBasePath(): string {
    return this.deps.getVaultBasePath();
  }

  redact(text: string): string {
    if (!text) return "";
    const secrets = this.getSecretsService();
    if (!secrets || typeof secrets.redact !== "function") return text;
    try {
      return secrets.redact(text);
    } catch {
      return text;
    }
  }

  async execute(options: BridgeExecuteOptions): Promise<ScriptExecutionResult> {
    const { script, args, stdin, signal } = options;
    const timeoutSeconds = options.timeoutSeconds ?? script.timeoutSeconds;
    const vaultBase = this.deps.getVaultBasePath();
    const scriptsFolder = this.deps.getScriptsFolder();

    if (signal?.aborted) {
      return {
        exitCode: -1,
        stdout: "",
        stderr: "Execution cancelled before start.",
        durationMs: 0,
        killed: true,
      };
    }

    let materializedAbsPath: string | undefined;
    let targetRelPath = script.scriptPath;

    try {
      if (!targetRelPath && script.inlineCode !== undefined) {
        const ext = RUNTIME_EXTENSION[script.runtime];
        const tmpName = `.tmp-ais-${script.scriptId}-${crypto.randomBytes(6).toString("hex")}${ext}`;
        const baseDir = vaultBase ? path.join(vaultBase, scriptsFolder) : os.tmpdir();
        await fs.promises.mkdir(baseDir, { recursive: true });
        materializedAbsPath = path.join(baseDir, tmpName);
        await fs.promises.writeFile(materializedAbsPath, script.inlineCode, { encoding: "utf8", mode: 0o600 });
        targetRelPath = vaultBase
          ? `${scriptsFolder.replace(/\\/g, "/").replace(/\/$/, "")}/${tmpName}`
          : materializedAbsPath;
      }

      if (!targetRelPath) {
        throw new Error(`Script "${script.scriptId}" has no script_path and no inline code.`);
      }

      const api = this.deps.getApi();
      const canUseEcosystemRunner =
        !this.deps.forceLocalSpawn &&
        api !== undefined &&
        typeof api.runScript === "function";

      if (canUseEcosystemRunner && api) {
        try {
          return await this.runViaEcosystem(api, {
            ...options,
            targetRelPath,
            timeoutSeconds,
          });
        } catch (err) {
          const code = (err as { code?: unknown })?.code;
          const msg = err instanceof Error ? err.message : String(err);
          const isPolicyRefusal =
            code === "path-not-allowed" ||
            code === "inline-refused" ||
            /path-not-allowed|inline-refused|allowed folder/i.test(msg);
          if (!isPolicyRefusal) {
            throw err;
          }
        }
      }

      return await this.runViaLocalSpawn({
        ...options,
        targetRelPath,
        materializedAbsPath,
        timeoutSeconds,
        stdin,
        args,
      });
    } finally {
      if (materializedAbsPath) {
        await fs.promises.rm(materializedAbsPath, { force: true }).catch(() => undefined);
      }
    }
  }

  private async runViaEcosystem(
    api: AIEcosystemAPI,
    params: BridgeExecuteOptions & { targetRelPath: string; timeoutSeconds: number },
  ): Promise<ScriptExecutionResult> {
    const { script, args, stdin, signal, targetRelPath, timeoutSeconds } = params;
    const startedAt = Date.now();
    let collectedStdout = "";
    let collectedStderr = "";

    const handleStdout = (chunk: string): void => {
      const clean = this.redact(chunk);
      collectedStdout = appendCapped(collectedStdout, clean, MEMORY_BUFFER_CAP).value;
      params.onStdout?.(clean);
    };

    const handleStderr = (chunk: string): void => {
      const clean = this.redact(chunk);
      collectedStderr = appendCapped(collectedStderr, clean, MEMORY_BUFFER_CAP).value;
      params.onStderr?.(clean);
    };

    const runPromise = api.runScript(
      {
        language: script.runtime,
        scriptPath: targetRelPath,
        args,
        stdin,
        signal,
        cwd: script.cwd,
        timeoutSeconds,
        env: script.env,
        skipActivityLog: true,
        onStdout: handleStdout,
        onStderr: handleStderr,
      },
      MODULE_ID,
    );

    if (!signal) {
      const res = await runPromise;
      return {
        exitCode: res.exitCode,
        stdout: this.redact(res.stdout),
        stderr: this.redact(res.stderr),
        durationMs: res.durationMs,
        killed: res.killed,
      };
    }

    return await new Promise<ScriptExecutionResult>((resolve, reject) => {
      let settled = false;

      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        resolve({
          exitCode: -1,
          stdout: collectedStdout,
          stderr: collectedStderr || "Execution cancelled by user.",
          durationMs: Date.now() - startedAt,
          killed: true,
        });
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener("abort", onAbort, { once: true });

      runPromise
        .then((res) => {
          signal.removeEventListener("abort", onAbort);
          if (settled) return;
          const cleanStdout = this.redact(res.stdout);
          const cleanStderr = this.redact(res.stderr);
          settled = true;
          resolve({
            exitCode: res.exitCode,
            stdout: cleanStdout,
            stderr: cleanStderr,
            durationMs: res.durationMs,
            killed: res.killed,
          });
        })
        .catch((err: unknown) => {
          signal.removeEventListener("abort", onAbort);
          if (settled) return;
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }

  private async runViaLocalSpawn(
    params: BridgeExecuteOptions & {
      targetRelPath: string;
      materializedAbsPath?: string;
      timeoutSeconds: number;
    },
  ): Promise<ScriptExecutionResult> {
    const { script, args, stdin, signal, targetRelPath, materializedAbsPath, timeoutSeconds } = params;
    const vaultBase = this.deps.getVaultBasePath();
    const scriptAbsPath =
      materializedAbsPath ?? (path.isAbsolute(targetRelPath) ? targetRelPath : path.join(vaultBase, targetRelPath));
    const cwdAbs = script.cwd ? path.join(vaultBase, script.cwd) : vaultBase || process.cwd();
    const { cmd, cmdArgs } = resolveCommand(script.runtime, scriptAbsPath, args);

    const secrets = this.getSecretsService();
    const scriptEnv = script.env ?? {};
    const needsSecrets = hasSecretPlaceholder(scriptEnv);

    if (needsSecrets && (!secrets || secrets.isLocked())) {
      throw new Error("Environment Keys secret vault is unavailable or locked.");
    }

    const startedAt = Date.now();
    let child: ChildProcess | undefined;
    let spawnError: unknown;

    const doSpawn = (resolvedEnv: Record<string, string>): void => {
      try {
        child = this.spawnImpl(cmd, cmdArgs, {
          cwd: cwdAbs,
          shell: false,
          windowsHide: true,
          detached: process.platform !== "win32",
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, ...resolvedEnv },
        });
      } catch (err) {
        spawnError = err;
      }
    };

    if (needsSecrets && secrets) {
      await secrets.spawnWithSecrets(scriptEnv, doSpawn, MODULE_ID);
    } else {
      doSpawn(scriptEnv);
    }

    if (!child) {
      const reason = spawnError instanceof Error ? spawnError.message : "Unknown spawn error";
      throw new Error(`Could not start ${cmd}: ${this.redact(reason)}`);
    }

    const proc = child;
    let stdoutBuf = "";
    let stderrBuf = "";
    let killed = false;

    const emitLines = (chunk: Buffer | string, stream: "stdout" | "stderr"): void => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const redacted = this.redact(text);
      if (stream === "stdout") {
        stdoutBuf = appendCapped(stdoutBuf, redacted, MEMORY_BUFFER_CAP).value;
        params.onStdout?.(redacted);
      } else {
        stderrBuf = appendCapped(stderrBuf, redacted, MEMORY_BUFFER_CAP).value;
        params.onStderr?.(redacted);
      }
    };

    return await new Promise<ScriptExecutionResult>((resolve, reject) => {
      let settled = false;
      let timeoutTimer: NodeJS.Timeout | undefined;

      const killProc = (): void => {
        if (killed) return;
        killed = true;
        killProcessTree(proc);
      };

      const onAbort = (): void => {
        killProc();
        finish(-1);
      };

      const finish = (code: number | null): void => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (signal) signal.removeEventListener("abort", onAbort);
        proc.stdout?.destroy();
        proc.stderr?.destroy();
        resolve({
          exitCode: code ?? -1,
          stdout: stdoutBuf,
          stderr: stderrBuf,
          durationMs: Date.now() - startedAt,
          killed,
        });
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      proc.stdout?.on("data", (chunk: Buffer | string) => emitLines(chunk, "stdout"));
      proc.stderr?.on("data", (chunk: Buffer | string) => emitLines(chunk, "stderr"));

      proc.once("error", (err: Error) => {
        if (settled) return;
        settled = true;
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (signal) signal.removeEventListener("abort", onAbort);
        reject(new Error(`Process error (${cmd}): ${this.redact(err.message)}`));
      });

      proc.once("close", (code: number | null) => {
        finish(code);
      });

      if (stdin !== undefined && proc.stdin) {
        try {
          proc.stdin.write(stdin, "utf8");
          proc.stdin.end();
        } catch {
          // Ignore broken pipe if process exits immediately.
        }
      } else if (proc.stdin) {
        try {
          proc.stdin.end();
        } catch {
          // Ignore.
        }
      }

      timeoutTimer = setTimeout(() => {
        killProc();
      }, Math.max(1, timeoutSeconds) * 1000);
    });
  }
}
