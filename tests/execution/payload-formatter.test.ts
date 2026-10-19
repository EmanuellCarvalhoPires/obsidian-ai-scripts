import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import { PayloadFormatter } from "../../src/execution/payload-formatter";

describe("PayloadFormatter", () => {
  const formatter = new PayloadFormatter();

  it("serializes JSON into stdin and leaves args empty for stdin mode", async () => {
    const payload = { instancia: "Acme", ticket_keys: ["PROJ-43"] };
    const formatted = await formatter.format("stdin", payload);
    expect(formatted.args).toEqual([]);
    expect(formatted.stdin).toBe(JSON.stringify(payload));
    await formatted.cleanup();
  });

  it("maps booleans, scalars, repeated arrays, positional arrays and objects in cli_args mode", async () => {
    const formatted = await formatter.format(
      "cli_args",
      {
        instancia: "Acme",
        sem_subtarefas: true,
        debug: false,
        tags: ["a", "b"],
        ticket_keys: ["PROJ-43", "PROJ-45"],
      },
      {
        instancia: { type: "string" },
        sem_subtarefas: { type: "boolean" },
        debug: { type: "boolean" },
        tags: { type: "array", items: "string" },
        ticket_keys: { type: "array", items: "string", positional: true },
      },
    );

    expect(formatted.stdin).toBeUndefined();
    expect(formatted.args).toEqual([
      "--instancia",
      "Acme",
      "--sem_subtarefas",
      "--tags",
      "a",
      "--tags",
      "b",
      "PROJ-43",
      "PROJ-45",
    ]);
    await formatted.cleanup();
  });

  it("writes a temporary JSON file and cleans it up in temp_file mode", async () => {
    const payload = { big: "data", count: 42 };
    const formatted = await formatter.format("temp_file", payload);

    expect(formatted.tempFilePath).toBeDefined();
    expect(formatted.args).toEqual(["--params-file", formatted.tempFilePath]);
    expect(fs.existsSync(formatted.tempFilePath!)).toBe(true);

    const diskContent = JSON.parse(await fs.promises.readFile(formatted.tempFilePath!, "utf8")) as Record<
      string,
      unknown
    >;
    expect(diskContent).toEqual(payload);

    await formatted.cleanup();
    expect(fs.existsSync(formatted.tempFilePath!)).toBe(false);
  });
});
