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

## Claude Code hooks and guided setup

The AI Ecosystem core can install Claude Code hooks and a setup skill for this module in the vault's `.claude/` folder:

- skill in `.claude/skills/configurar-ai-scripts/`, hook entries in `.claude/settings.local.json` (or `settings.json`), state in `.claude/ai-ecosystem/`, and a block in `GEMINI.md` for Antigravity.
- Modules downloaded from the AI Ecosystem module catalog show a confirmation screen listing what will be written before installing. Nothing in your own `.claude/` entries is overwritten.
- Until the guided setup finishes, the module's tools are hidden from Claude Code (other clients still see them).
- Hooks can be set to block, warn or off per module in the AI Ecosystem settings, and they fail open when Obsidian or the plugin is not running.

**Protection hook:** running a script from an allowed script folder through the terminal (`python`, `node`, `bash`, `pwsh`...) is redirected to `ecosystem_run_script` (or `run_ai_script` when the script is registered). AI Scripts feeds the core with its script folders: the configured scripts folder plus the folders of external `script_path` files.

**Setup keys:** `pasta_de_scripts` (scripts folder) and `pode_gravar_fora_do_cofre` (allow writing outside the vault). The second one is only stored for now; it is not enforced yet.

## Starter scripts

On first load the plugin installs a starter kit of generic vault maintenance scripts into the scripts folder (default `Scripts/AI`). They are Markdown script notes with embedded Python 3 code (standard library only; works on Windows, macOS and Linux) and a short pt-BR guide each. They run with the vault root as working directory and receive their parameters as JSON on stdin.

| Script | Effect | What it does |
| --- | --- | --- |
| `links_quebrados` | read | Lists wikilinks and Markdown links that point to missing notes or files (aliases, anchors, embeds and code blocks handled). |
| `notas_orfas` | read | Lists notes with no incoming and no outgoing links. |
| `extrair_tarefas` | read | Collects open (optionally done) tasks vault-wide with due dates, grouped by note or date. |
| `backup_cofre` | external | Creates a dated zip of the vault outside it and rotates only its own backups (`backup-<vault>-<timestamp>.zip`). Supports `dry_run`. |
| `resumo_do_dia` | read | Markdown summary of notes created or modified in a day and of tasks due today or overdue. |

- Installation never overwrites a note. The ids already handled are stored in the settings (`starterPackInstalledIds`), so a script you delete is not recreated; scripts added by future versions are installed on the next load.
- Turn it off with the **Install starter scripts** setting (`installStarterPack`).
- The command **Reinstall starter scripts** (also a button in the settings) restores the ones that are missing.
- The scripts ignore `.obsidian`, `.git`, `.trash` and `node_modules` (the backup includes `.obsidian` unless `incluir_obsidian` is false) and need `python` on the `PATH`.
