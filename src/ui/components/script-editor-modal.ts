// Modal for creating or editing a script note in Scripts/AI/ with structured YAML frontmatter.

import { Modal, Notice, Setting, normalizePath, parseYaml, setIcon, stringifyYaml } from "obsidian";
import type { App } from "obsidian";
import { t } from "../../i18n";
import { SCRIPT_ID_PATTERN } from "../../scripts/schema-parser";
import type { ScriptLoader, ScriptVaultPort } from "../../scripts/script-loader";
import { SCRIPT_INPUT_MODES, SCRIPT_RUNTIMES } from "../../types/script-types";
import type { ScriptDefinition, ScriptInputMode, ScriptRuntime } from "../../types/script-types";

export interface ScriptEditorModalDeps {
  vault: ScriptVaultPort;
  loader: ScriptLoader;
  getScriptsFolder: () => string;
  existing?: ScriptDefinition;
  onSaved?: (notePath: string) => void;
}

export class ScriptEditorModal extends Modal {
  private scriptId = "";
  private name = "";
  private category = "General";
  private description = "";
  private runtime: ScriptRuntime = "python";
  private inputMode: ScriptInputMode = "stdin";
  private scriptPath = "";
  private timeoutSeconds = 120;
  private exposeAsTool = true;
  private paramsYaml = "mensagem:\n  type: string\n  required: true\n  description: Texto de entrada\n";
  private inlineCode = "import sys, json\n\ndata = json.loads(sys.stdin.read() or '{}')\nprint('Recebido:', data)\n";

  constructor(
    app: App,
    private readonly deps: ScriptEditorModalDeps,
  ) {
    super(app);
    const existing = deps.existing;
    if (existing) {
      this.scriptId = existing.scriptId;
      this.name = existing.name;
      this.category = existing.category;
      this.description = existing.description;
      this.runtime = existing.runtime;
      this.inputMode = existing.inputMode;
      this.scriptPath = existing.scriptPath ?? "";
      this.timeoutSeconds = existing.timeoutSeconds;
      this.exposeAsTool = existing.exposeAsTool;
      this.paramsYaml = Object.keys(existing.params).length > 0 ? stringifyYaml(existing.params) : "";
      this.inlineCode = existing.inlineCode ?? "";
    }
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    contentEl.addClass("ais-modal");

    const icon = titleEl.createSpan({ cls: "ais-modal-icon" });
    setIcon(icon, "file-code");
    titleEl.appendText(this.deps.existing ? t("editor.titleEdit") : t("editor.titleNew"));

    new Setting(contentEl)
      .setName(t("editor.scriptId"))
      .setDesc(t("editor.scriptIdDesc"))
      .addText((text) =>
        text
          .setPlaceholder(" Sincronizar_tickets".trim())
          .setValue(this.scriptId)
          .onChange((v) => {
            this.scriptId = v.trim();
          }),
      );

    new Setting(contentEl).setName(t("editor.name")).addText((text) =>
      text
        .setPlaceholder("Sincronizar tickets")
        .setValue(this.name)
        .onChange((v) => {
          this.name = v.trim();
        }),
    );

    new Setting(contentEl).setName(t("editor.category")).addText((text) =>
      text
        .setPlaceholder("Jira")
        .setValue(this.category)
        .onChange((v) => {
          this.category = v.trim() || "General";
        }),
    );

    new Setting(contentEl).setName(t("editor.description")).addText((text) =>
      text.setValue(this.description).onChange((v) => {
        this.description = v.trim();
      }),
    );

    new Setting(contentEl).setName(t("editor.runtime")).addDropdown((drop) => {
      for (const rt of SCRIPT_RUNTIMES) {
        drop.addOption(rt, rt);
      }
      drop.setValue(this.runtime).onChange((v) => {
        this.runtime = v as ScriptRuntime;
      });
    });

    new Setting(contentEl).setName(t("editor.inputMode")).addDropdown((drop) => {
      for (const mode of SCRIPT_INPUT_MODES) {
        drop.addOption(mode, mode);
      }
      drop.setValue(this.inputMode).onChange((v) => {
        this.inputMode = v as ScriptInputMode;
      });
    });

    new Setting(contentEl)
      .setName(t("editor.scriptPath"))
      .setDesc(t("editor.scriptPathDesc"))
      .addText((text) =>
        text
          .setPlaceholder("scripts/contexto_tickets.py")
          .setValue(this.scriptPath)
          .onChange((v) => {
            this.scriptPath = v.trim();
          }),
      );

    new Setting(contentEl).setName(t("editor.timeout")).addText((text) => {
      text.inputEl.type = "number";
      text.setValue(String(this.timeoutSeconds)).onChange((v) => {
        const parsed = Number.parseInt(v, 10);
        if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 3600) {
          this.timeoutSeconds = parsed;
        }
      });
    });

    new Setting(contentEl)
      .setName(t("editor.exposeAsTool"))
      .setDesc(t("editor.exposeAsToolDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.exposeAsTool).onChange((v) => {
          this.exposeAsTool = v;
        }),
      );

    new Setting(contentEl).setName(t("editor.paramsYaml")).addTextArea((area) => {
      area.inputEl.addClass("ais-code-textarea", "ais-mono");
      area.setValue(this.paramsYaml).onChange((v) => {
        this.paramsYaml = v;
      });
    });

    new Setting(contentEl).setName(t("editor.inlineCode")).addTextArea((area) => {
      area.inputEl.addClass("ais-code-textarea", "ais-mono");
      area.setValue(this.inlineCode).onChange((v) => {
        this.inlineCode = v;
      });
    });

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText(t("editor.save"))
        .setIcon("save")
        .setCta()
        .onClick(() => void this.saveNote()),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async saveNote(): Promise<void> {
    if (!SCRIPT_ID_PATTERN.test(this.scriptId)) {
      new Notice(t("editor.invalidId"));
      return;
    }

    let parsedParams: Record<string, unknown> = {};
    if (this.paramsYaml.trim() !== "") {
      try {
        const raw: unknown = parseYaml(this.paramsYaml);
        if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
          parsedParams = raw as Record<string, unknown>;
        }
      } catch (err) {
        new Notice(`Invalid YAML in parameters: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }

    const frontmatterObj: Record<string, unknown> = {
      script_id: this.scriptId,
      nome: this.name || this.scriptId,
      categoria: this.category || "General",
      descricao: this.description || `Automation script ${this.scriptId}`,
      runtime: this.runtime,
      input_mode: this.inputMode,
      timeout_seconds: this.timeoutSeconds,
      expose_as_tool: this.exposeAsTool,
    };
    if (this.scriptPath) {
      frontmatterObj.script_path = this.scriptPath;
    }
    frontmatterObj.params = parsedParams;

    const yamlBlock = stringifyYaml(frontmatterObj).trim();
    const title = this.name || this.scriptId;
    const codeSection =
      !this.scriptPath && this.inlineCode.trim() !== ""
        ? `\n\`\`\`${this.runtime}\n${this.inlineCode.trim()}\n\`\`\`\n`
        : "";

    const noteContent = `---\n${yamlBlock}\n---\n\n# ${title}\n\n${this.description}\n${codeSection}`;
    const targetPath =
      this.deps.existing?.notePath ??
      normalizePath(`${this.deps.getScriptsFolder()}/${this.scriptId}.md`);

    await this.deps.vault.writeText(targetPath, noteContent);
    this.deps.loader.invalidate();
    await this.deps.loader.load();
    new Notice(t("core.notice.scriptSaved", { path: targetPath }));
    this.deps.onSaved?.(targetPath);
    this.close();
  }
}
