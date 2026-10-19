// Prepares validated script parameters for delivery via stdin, cli_args, or temp_file.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ScriptInputMode, ScriptParamSchema } from "../types/script-types";

export interface FormattedPayload {
  stdin?: string;
  args: string[];
  tempFilePath?: string;
  cleanup: () => Promise<void>;
}

export interface PayloadFormatterOptions {
  tempDir?: string;
}

const noopCleanup = async (): Promise<void> => undefined;

function formatCliScalar(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export class PayloadFormatter {
  private readonly tempDir: string;

  constructor(options?: PayloadFormatterOptions) {
    this.tempDir = options?.tempDir ?? os.tmpdir();
  }

  async format(
    inputMode: ScriptInputMode,
    normalizedParams: Record<string, unknown>,
    paramSchemas: Record<string, ScriptParamSchema> = {},
  ): Promise<FormattedPayload> {
    switch (inputMode) {
      case "stdin": {
        return {
          stdin: JSON.stringify(normalizedParams),
          args: [],
          cleanup: noopCleanup,
        };
      }

      case "cli_args": {
        const flagArgs: string[] = [];
        const positionalArgs: string[] = [];

        for (const [key, value] of Object.entries(normalizedParams)) {
          if (value === undefined || value === null) continue;
          const schema = paramSchemas[key];
          const isPositional = schema?.positional === true;
          const flag = `--${key}`;

          if (typeof value === "boolean") {
            if (value) {
              if (isPositional) positionalArgs.push("true");
              else flagArgs.push(flag);
            }
            continue;
          }

          if (Array.isArray(value)) {
            for (const item of value) {
              if (item === undefined || item === null) continue;
              const formatted = formatCliScalar(item);
              if (isPositional) {
                positionalArgs.push(formatted);
              } else {
                flagArgs.push(flag, formatted);
              }
            }
            continue;
          }

          if (typeof value === "object") {
            const jsonStr = JSON.stringify(value);
            if (isPositional) positionalArgs.push(jsonStr);
            else flagArgs.push(flag, jsonStr);
            continue;
          }

          const scalar = formatCliScalar(value);
          if (isPositional) {
            positionalArgs.push(scalar);
          } else {
            flagArgs.push(flag, scalar);
          }
        }

        return {
          args: [...flagArgs, ...positionalArgs],
          cleanup: noopCleanup,
        };
      }

      case "temp_file": {
        await fs.promises.mkdir(this.tempDir, { recursive: true });
        const filename = `ais-params-${crypto.randomBytes(8).toString("hex")}.json`;
        const tempFilePath = path.join(this.tempDir, filename);
        const jsonPayload = JSON.stringify(normalizedParams, null, 2);
        await fs.promises.writeFile(tempFilePath, jsonPayload, { encoding: "utf8", mode: 0o600 });

        return {
          args: ["--params-file", tempFilePath],
          tempFilePath,
          cleanup: async () => {
            await fs.promises.rm(tempFilePath, { force: true }).catch(() => undefined);
          },
        };
      }
    }
  }
}
