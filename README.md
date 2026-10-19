# AI Scripts (`ai-scripts`)

Manage, categorize and safely run local automation scripts for AI agents inside Obsidian with strict parameter validation, real-time streaming terminal output, and process control.

## Features

- **Markdown Script Catalog (`Scripts/AI/`):** Define scripts as Markdown notes with YAML frontmatter metadata, typed parameter schemas, documentation, and either an external `script_path` or an embedded code block.
- **Strict Parameter Gatekeeper (`ParamValidator`):** Validates required parameters, types (`string`, `number`, `integer`, `boolean`, `array`, `object`), `enum`, `regex`, `min`/`max`, applies defaults, and strips undeclared flags before any OS process is created.
- **Flexible Input Delivery (`input_mode`):**
  - `stdin` (default): Pipes validated JSON to standard input (`sys.stdin` / `process.stdin`), preventing Windows shell quoting issues.
  - `cli_args`: Maps parameters to CLI flags (`--key value`, `--flag`) or positional arguments.
  - `temp_file`: Writes JSON to a temporary file and passes `--params-file <path>`.
- **Environment Keys Integration:** Injects `{{secret:NAME}}` placeholders directly into the subprocess environment via `secrets.spawnWithSecrets()` and sanitizes all real-time `stdout`/`stderr` streams via `secrets.redact()`.
- **AI Script Monitor (`ItemView`):** Real-time execution panel with spinning status indicators, elapsed timer, instant process termination (`Stop`), auto-scrolling terminal output, and collapsible execution history.
- **MCP Tools & Dynamic Tool Factory:** Registers `list_ai_scripts`, `get_script_schema`, `run_ai_script`, plus dedicated `script_<script_id>` tools for scripts with `expose_as_tool: true`.
