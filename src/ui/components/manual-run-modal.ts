// Modal that renders a dynamic form from a script's parameter schema, validates inputs
// via ParamValidator, and launches the execution in the live monitor.

import { Modal, Notice, Setting, setIcon } from "obsidian";
import type { App } from "obsidian";
import type { ExecutionCoordinator } from "../../execution/execution-coordinator";
import { t } from "../../i18n";
import type { ScriptRegistry } from "../../scripts/script-registry";
import type { ScriptDefinition, ScriptParamSchema } from "../../types/script-types";
import type { ParamValidator } from "../../validation/param-validator";

export interface ManualRunModalDeps {
  registry: ScriptRegistry;
  validator: ParamValidator;
  coordinator: ExecutionCoordinator;
  getScriptsFolder: () => string;
  initialScriptId?: string;
  initialParams?: Record<string, unknown>;
  onStarted?: () => void;
}

export class ManualRunModal extends Modal {
  private selectedScript: ScriptDefinition | undefined;
  private formValues: Record<string, unknown> = {};
  private formContainerEl: HTMLElement | undefined;
  private issuesContainerEl: HTMLElement | undefined;

  constructor(
    app: App,
    private readonly deps: ManualRunModalDeps,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    contentEl.addClass("ais-modal");

    const titleIcon = titleEl.createSpan({ cls: "ais-modal-icon" });
    setIcon(titleIcon, "play");
    titleEl.appendText(t("manual.title"));

    const scripts = this.deps.registry.listAll();
    if (scripts.length === 0) {
      contentEl.createDiv({
        cls: "ais-empty-state",
        text: t("manual.noScripts", { folder: this.deps.getScriptsFolder() }),
      });
      return;
    }

    const initial =
      (this.deps.initialScriptId ? this.deps.registry.get(this.deps.initialScriptId) : undefined) ?? scripts[0];
    this.selectScript(initial, this.deps.initialParams);

    new Setting(contentEl)
      .setName(t("manual.selectScript"))
      .setDesc(t("manual.selectScriptDesc"))
      .addDropdown((drop) => {
        for (const s of scripts) {
          drop.addOption(s.scriptId, `${s.name} (${s.category} - ${s.runtime})`);
        }
        if (this.selectedScript) {
          drop.setValue(this.selectedScript.scriptId);
        }
        drop.onChange((val) => {
          const picked = this.deps.registry.get(val);
          this.selectScript(picked, undefined);
          this.renderForm();
        });
      });

    this.formContainerEl = contentEl.createDiv({ cls: "ais-manual-form" });
    this.issuesContainerEl = contentEl.createDiv({ cls: "ais-manual-issues ais-hidden" });

    this.renderForm();

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText(t("manual.runCta"))
          .setIcon("play")
          .setCta()
          .onClick(() => void this.handleSubmit()),
      )
      .addButton((btn) =>
        btn.setButtonText(t("manual.cancel")).onClick(() => {
          this.close();
        }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private selectScript(script: ScriptDefinition | undefined, presetParams?: Record<string, unknown>): void {
    this.selectedScript = script;
    this.formValues = {};
    if (!script) return;
    for (const [name, schema] of Object.entries(script.params)) {
      if (presetParams && presetParams[name] !== undefined) {
        this.formValues[name] = presetParams[name];
      } else if (schema.default !== undefined) {
        this.formValues[name] = schema.default;
      } else if (schema.type === "boolean") {
        this.formValues[name] = false;
      }
    }
  }

  private renderForm(): void {
    if (!this.formContainerEl || !this.selectedScript) return;
    this.formContainerEl.empty();
    this.issuesContainerEl?.empty();
    this.issuesContainerEl?.addClass("ais-hidden");

    const script = this.selectedScript;
    if (script.description) {
      this.formContainerEl.createEl("p", { cls: "ais-muted", text: script.description });
    }

    const entries = Object.entries(script.params);
    if (entries.length === 0) {
      this.formContainerEl.createDiv({ cls: "ais-empty-state", text: t("manual.noParams") });
      return;
    }

    new Setting(this.formContainerEl).setHeading().setName(t("manual.paramsHeading"));

    for (const [paramName, schema] of entries) {
      this.renderParamControl(this.formContainerEl, paramName, schema);
    }
  }

  private renderParamControl(container: HTMLElement, paramName: string, schema: ScriptParamSchema): void {
    const badgeLabel = schema.required ? t("manual.requiredBadge") : t("manual.optionalBadge");
    const descParts: string[] = [`[${schema.type} - ${badgeLabel}]`];
    if (schema.description) descParts.push(schema.description);

    const setting = new Setting(container).setName(paramName).setDesc(descParts.join(" "));
    setting.nameEl.addClass("ais-mono");

    const currentVal = this.formValues[paramName];

    if (schema.type === "boolean") {
      setting.addToggle((toggle) => {
        toggle.setValue(Boolean(currentVal)).onChange((v) => {
          this.formValues[paramName] = v;
        });
      });
      return;
    }

    if (schema.type === "string" && schema.enum && schema.enum.length > 0) {
      setting.addDropdown((drop) => {
        if (!schema.required) {
          drop.addOption("", "--");
        }
        for (const opt of schema.enum ?? []) {
          drop.addOption(opt, opt);
        }
        const initial = typeof currentVal === "string" ? currentVal : (schema.enum?.[0] ?? "");
        drop.setValue(initial);
        this.formValues[paramName] = initial;
        drop.onChange((v) => {
          this.formValues[paramName] = v;
        });
      });
      return;
    }

    if (schema.type === "array" || schema.type === "object") {
      setting.addTextArea((area) => {
        const placeholder =
          schema.type === "array" ? '["item1", "item2"] or comma-separated' : '{"key": "value"}';
        area.setPlaceholder(placeholder);
        if (currentVal !== undefined) {
          area.setValue(typeof currentVal === "string" ? currentVal : JSON.stringify(currentVal));
        }
        area.onChange((raw) => {
          const trimmed = raw.trim();
          if (trimmed === "") {
            delete this.formValues[paramName];
            return;
          }
          try {
            this.formValues[paramName] = JSON.parse(trimmed);
          } catch {
            if (schema.type === "array") {
              this.formValues[paramName] = trimmed
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            } else {
              this.formValues[paramName] = trimmed;
            }
          }
        });
      });
      return;
    }

    setting.addText((text) => {
      if (schema.type === "number" || schema.type === "integer") {
        text.inputEl.type = "number";
        if (schema.min !== undefined) text.inputEl.min = String(schema.min);
        if (schema.max !== undefined) text.inputEl.max = String(schema.max);
      }
      if (
        typeof currentVal === "string" ||
        typeof currentVal === "number" ||
        typeof currentVal === "boolean"
      ) {
        text.setValue(String(currentVal));
      }
      text.onChange((v) => {
        if (v.trim() === "") {
          delete this.formValues[paramName];
        } else {
          this.formValues[paramName] = v;
        }
      });
    });
  }

  private async handleSubmit(): Promise<void> {
    if (!this.selectedScript) return;
    const validation = this.deps.validator.validate(this.selectedScript, this.formValues);

    if (!validation.valid) {
      if (this.issuesContainerEl) {
        this.issuesContainerEl.empty();
        this.issuesContainerEl.removeClass("ais-hidden");
        for (const issue of validation.issues) {
          const row = this.issuesContainerEl.createDiv({ cls: "ais-issue-row" });
          const icon = row.createSpan({ cls: "ais-icon ais-status-failed" });
          setIcon(icon, "alert-octagon");
          row.createSpan({ text: issue.message });
        }
      }
      new Notice(t("manual.validationFailed"));
      return;
    }

    const script = this.selectedScript;
    const params = validation.normalizedParams;
    this.close();
    new Notice(t("core.notice.runStarted", { name: script.name }));
    this.deps.onStarted?.();
    void this.deps.coordinator.runDefinition(script, params, "Obsidian UI");
  }
}
