// Interface strings in English and Portuguese. Picks the language of the Obsidian interface.
// Strictly zero emojis; all icons are rendered via Obsidian's setIcon().
import { getLanguage } from "obsidian";

export type Lang = "en" | "pt";

export interface StringTable {
  en: Record<string, string>;
  pt: Record<string, string>;
}

const strings: StringTable = {
  en: {
    // Core / Ribbon / Status bar / Commands
    "core.ribbon.monitor": "AI Script Monitor",
    "core.cmd.openMonitor": "Open live script monitor",
    "core.cmd.runScript": "Run automation script manually",
    "core.cmd.createScript": "Create or edit script note",
    "core.cmd.reload": "Reload automation scripts",
    "core.cmd.reinstallStarter": "Reinstall starter scripts",
    "core.status.connected": "AI Scripts ({count})",
    "core.status.waiting": "AI Scripts: waiting",
    "core.status.disconnected": "AI Scripts: offline",
    "core.status.missing": "AI Scripts: no AI Ecosystem",
    "core.status.incompatible": "AI Scripts: incompatible",
    "core.status.aria": "Open AI Script Monitor",
    "core.notice.reloaded": "Reloaded {count} script(s).",
    "core.notice.reloadedProblems": "Reloaded {count} script(s) ({problems} problem(s)).",
    "core.notice.starterInstalled": "Installed {count} starter script(s) in {folder}.",
    "core.notice.starterNone": "All starter scripts are already present.",
    "core.notice.saveFailed": "Could not save the AI Scripts settings.",
    "core.notice.scriptSaved": "Saved script note at {path}.",
    "core.notice.runStarted": "Started script {name}.",
    "core.notice.runCancelled": "Cancelled script {name}.",

    // Dependency modal
    "dependency.title": "AI Ecosystem is required",
    "dependency.body":
      "AI Scripts needs the AI Ecosystem plugin. It provides the single local server, process runner and MCP endpoint that AI agents use to discover, validate and execute your scripts.",
    "dependency.standby":
      "AI Scripts stays in standby until the AI Ecosystem is installed and enabled, and connects automatically as soon as it starts.",
    "dependency.install": "Install and enable AI Ecosystem",
    "dependency.openPage": "Open plugin page",
    "dependency.installed": "AI Ecosystem installed and enabled.",
    "dependency.failed": "Could not install automatically. Opening the plugin page.",

    // Settings tab - Ecosystem connection
    "settings.ecosystem.heading": "AI Ecosystem connection",
    "settings.ecosystem.connected": "Connected to AI Ecosystem",
    "settings.ecosystem.connectedDesc": "MCP tools, HTTP routes and the scripts service are registered.",
    "settings.ecosystem.waiting": "Waiting for AI Ecosystem",
    "settings.ecosystem.waitingDesc": "AI Ecosystem is installed and starting. AI Scripts will register automatically.",
    "settings.ecosystem.disconnected": "Disconnected from AI Ecosystem",
    "settings.ecosystem.disconnectedDesc": "AI Ecosystem was unloaded or disabled. AI Scripts will reconnect when it returns.",
    "settings.ecosystem.missing": "AI Ecosystem is not installed or not enabled",
    "settings.ecosystem.missingDesc": "Install or enable the AI Ecosystem plugin to expose scripts to AI agents.",
    "settings.ecosystem.incompatible": "Incompatible with the installed AI Ecosystem",
    "settings.ecosystem.incompatibleDesc": "{reason}",
    "settings.ecosystem.install": "Install and enable",
    "settings.ecosystem.enable": "Enable AI Ecosystem",
    "settings.ecosystem.openMonitor": "Open live monitor",
    "settings.ecosystem.openMonitorDesc": "Inspect active script processes, real-time streaming output and execution history.",
    "settings.ecosystem.openMonitorBtn": "Open monitor",

    // Settings tab - General
    "settings.general.heading": "Scripts and execution",
    "settings.general.folder": "Scripts folder",
    "settings.general.folderDesc": "Vault-relative folder where Markdown script notes are stored.",
    "settings.general.folderPlaceholder": "Scripts/AI",
    "settings.general.timeout": "Default timeout (seconds)",
    "settings.general.timeoutDesc": "Maximum execution time when a script note does not specify timeout_seconds (1 to 3600).",
    "settings.general.history": "Maximum history entries",
    "settings.general.historyDesc": "Number of completed script runs kept in memory (10 to 1000).",
    "settings.general.autoOpen": "Open monitor automatically on run",
    "settings.general.autoOpenDesc": "Reveal the AI Script Monitor panel whenever a script starts running.",
    "settings.general.starter": "Install starter scripts",
    "settings.general.starterDesc":
      "Adds a set of generic vault maintenance scripts (broken links, orphan notes, tasks, backup, daily summary) to the scripts folder. Existing notes are never overwritten and deleted scripts are not recreated.",
    "settings.general.starterReinstall": "Reinstall starter scripts",
    "settings.general.starterReinstallDesc": "Restores the starter scripts that are missing from the scripts folder.",
    "settings.general.starterReinstallBtn": "Reinstall",

    // Settings tab - Loaded scripts
    "settings.status.heading": "Loaded scripts",
    "settings.status.summary": "{count} valid script(s) loaded from {folder}.",
    "settings.status.reload": "Reload",
    "settings.status.newScript": "New script",
    "settings.status.run": "Run",
    "settings.status.edit": "Edit script",
    "settings.status.openNote": "Open script note",
    "settings.status.noProblems": "No errors or warnings found in script notes.",
    "settings.status.problemsCount": "{count} problem(s) found in script notes:",
    "settings.status.levelError": "Error",
    "settings.status.levelWarning": "Warning",

    // Live monitor view
    "monitor.title": "AI Script Monitor",
    "monitor.runBtn": "Run script",
    "monitor.newBtn": "New script",
    "monitor.clearBtn": "Clear history",
    "monitor.autoScrollOn": "Pause auto-scroll",
    "monitor.autoScrollOff": "Resume auto-scroll",
    "monitor.countActive": "{count} active",
    "monitor.countSucceeded": "{count} succeeded",
    "monitor.countFailed": "{count} failed",
    "monitor.activeHeading": "Active processes",
    "monitor.historyHeading": "Execution history",
    "monitor.emptyActive": "No scripts are running right now.",
    "monitor.emptyHistory": "No completed executions in memory yet.",
    "monitor.stopBtn": "Stop",
    "monitor.rerunBtn": "Run again",
    "monitor.client": "Client",
    "monitor.script": "Script",
    "monitor.params": "Parameters",
    "monitor.exitOk": "0 OK",
    "monitor.exitError": "Error ({code})",
    "monitor.exitCancelled": "Cancelled",
    "monitor.noOutput": "No output produced.",

    // Manual run modal
    "manual.title": "Run automation script",
    "manual.selectScript": "Script",
    "manual.selectScriptDesc": "Pick a script from the catalog to configure its parameters.",
    "manual.noScripts": "No valid scripts found in {folder}. Create a script note first.",
    "manual.paramsHeading": "Parameters",
    "manual.noParams": "This script does not require any parameters.",
    "manual.requiredBadge": "required",
    "manual.optionalBadge": "optional",
    "manual.runCta": "Run script",
    "manual.cancel": "Cancel",
    "manual.validationFailed": "Fix the highlighted parameter errors before running.",

    // Script editor modal
    "editor.titleNew": "Create automation script note",
    "editor.titleEdit": "Edit automation script note",
    "editor.scriptId": "Script ID",
    "editor.scriptIdDesc": "Unique identifier (letters, digits, _ and -).",
    "editor.name": "Display name",
    "editor.category": "Category",
    "editor.description": "Description",
    "editor.runtime": "Runtime",
    "editor.inputMode": "Input mode",
    "editor.scriptPath": "External script path (optional)",
    "editor.scriptPathDesc": "Vault-relative file path (e.g. scripts/my_task.py). Leave empty to embed code in the note.",
    "editor.timeout": "Timeout (seconds)",
    "editor.exposeAsTool": "Expose as dedicated MCP tool",
    "editor.exposeAsToolDesc": "Registers script_<script_id> directly as a typed MCP tool.",
    "editor.paramsYaml": "Parameters (YAML map)",
    "editor.inlineCode": "Inline script code (optional)",
    "editor.save": "Save script note",
    "editor.invalidId": "Enter a valid script_id (letters, digits, _ and -).",
  },
  pt: {
    // Core / Ribbon / Status bar / Commands
    "core.ribbon.monitor": "AI Script Monitor",
    "core.cmd.openMonitor": "Abrir monitor de scripts em tempo real",
    "core.cmd.runScript": "Executar script de automação manualmente",
    "core.cmd.createScript": "Criar ou editar nota de script",
    "core.cmd.reload": "Recarregar scripts de automação",
    "core.cmd.reinstallStarter": "Reinstalar scripts iniciais",
    "core.status.connected": "AI Scripts ({count})",
    "core.status.waiting": "AI Scripts: aguardando",
    "core.status.disconnected": "AI Scripts: desconectado",
    "core.status.missing": "AI Scripts: sem AI Ecosystem",
    "core.status.incompatible": "AI Scripts: incompatível",
    "core.status.aria": "Abrir AI Script Monitor",
    "core.notice.reloaded": "{count} script(s) recarregado(s).",
    "core.notice.reloadedProblems": "{count} script(s) recarregado(s) ({problems} problema(s)).",
    "core.notice.starterInstalled": "{count} script(s) inicial(is) instalado(s) em {folder}.",
    "core.notice.starterNone": "Todos os scripts iniciais já estão presentes.",
    "core.notice.saveFailed": "Não foi possível salvar as configurações do AI Scripts.",
    "core.notice.scriptSaved": "Nota de script salva em {path}.",
    "core.notice.runStarted": "Script {name} iniciado.",
    "core.notice.runCancelled": "Script {name} cancelado.",

    // Dependency modal
    "dependency.title": "O plugin AI Ecosystem é necessário",
    "dependency.body":
      "O AI Scripts precisa do plugin AI Ecosystem. Ele fornece o servidor local único, o executor de processos e o endpoint MCP que os agentes de IA usam para descobrir, validar e executar seus scripts.",
    "dependency.standby":
      "O AI Scripts fica em espera até que o AI Ecosystem seja instalado e ativado, e conecta automaticamente assim que ele inicia.",
    "dependency.install": "Instalar e ativar o AI Ecosystem",
    "dependency.openPage": "Abrir página do plugin",
    "dependency.installed": "AI Ecosystem instalado e ativado.",
    "dependency.failed": "Não foi possível instalar automaticamente. Abrindo a página do plugin.",

    // Settings tab - Ecosystem connection
    "settings.ecosystem.heading": "Conexão com o AI Ecosystem",
    "settings.ecosystem.connected": "Conectado ao AI Ecosystem",
    "settings.ecosystem.connectedDesc": "Tools MCP, rotas HTTP e o serviço scripts estão registrados.",
    "settings.ecosystem.waiting": "Aguardando o AI Ecosystem",
    "settings.ecosystem.waitingDesc": "O AI Ecosystem está instalado e iniciando. O AI Scripts será registrado automaticamente.",
    "settings.ecosystem.disconnected": "Desconectado do AI Ecosystem",
    "settings.ecosystem.disconnectedDesc": "O AI Ecosystem foi descarregado ou desativado. O AI Scripts reconectará quando ele voltar.",
    "settings.ecosystem.missing": "O AI Ecosystem não está instalado ou ativado",
    "settings.ecosystem.missingDesc": "Instale ou ative o plugin AI Ecosystem para expor os scripts aos agentes de IA.",
    "settings.ecosystem.incompatible": "Incompatível com o AI Ecosystem instalado",
    "settings.ecosystem.incompatibleDesc": "{reason}",
    "settings.ecosystem.install": "Instalar e ativar",
    "settings.ecosystem.enable": "Ativar AI Ecosystem",
    "settings.ecosystem.openMonitor": "Abrir monitor em tempo real",
    "settings.ecosystem.openMonitorDesc": "Inspecione processos ativos, saída em streaming em tempo real e histórico de execuções.",
    "settings.ecosystem.openMonitorBtn": "Abrir monitor",

    // Settings tab - General
    "settings.general.heading": "Scripts e execução",
    "settings.general.folder": "Pasta de scripts",
    "settings.general.folderDesc": "Pasta relativa ao cofre onde ficam as notas Markdown de scripts.",
    "settings.general.folderPlaceholder": "Scripts/AI",
    "settings.general.timeout": "Timeout padrão (segundos)",
    "settings.general.timeoutDesc": "Tempo máximo de execução quando a nota não define timeout_seconds (1 a 3600).",
    "settings.general.history": "Limite do histórico em memória",
    "settings.general.historyDesc": "Quantidade de execuções finalizadas mantidas em memória (10 a 1000).",
    "settings.general.autoOpen": "Abrir monitor automaticamente ao executar",
    "settings.general.autoOpenDesc": "Revela o painel AI Script Monitor sempre que um script inicia.",
    "settings.general.starter": "Instalar scripts iniciais",
    "settings.general.starterDesc":
      "Adiciona à pasta de scripts um conjunto de scripts genéricos de manutenção do cofre (links quebrados, notas órfãs, tarefas, backup e resumo do dia). Notas existentes nunca são sobrescritas e scripts apagados não são recriados.",
    "settings.general.starterReinstall": "Reinstalar scripts iniciais",
    "settings.general.starterReinstallDesc": "Restaura os scripts iniciais que estão ausentes da pasta de scripts.",
    "settings.general.starterReinstallBtn": "Reinstalar",

    // Settings tab - Loaded scripts
    "settings.status.heading": "Scripts carregados",
    "settings.status.summary": "{count} script(s) válido(s) carregado(s) de {folder}.",
    "settings.status.reload": "Recarregar",
    "settings.status.newScript": "Novo script",
    "settings.status.run": "Executar",
    "settings.status.edit": "Editar script",
    "settings.status.openNote": "Abrir nota do script",
    "settings.status.noProblems": "Nenhum erro ou aviso encontrado nas notas de script.",
    "settings.status.problemsCount": "{count} problema(s) encontrado(s) nas notas de script:",
    "settings.status.levelError": "Erro",
    "settings.status.levelWarning": "Aviso",

    // Live monitor view
    "monitor.title": "AI Script Monitor",
    "monitor.runBtn": "Executar",
    "monitor.newBtn": "Novo script",
    "monitor.clearBtn": "Limpar",
    "monitor.autoScrollOn": "Pausar auto-scroll",
    "monitor.autoScrollOff": "Retomar auto-scroll",
    "monitor.countActive": "{count} ativo(s)",
    "monitor.countSucceeded": "{count} concluído(s)",
    "monitor.countFailed": "{count} falha(s)",
    "monitor.activeHeading": "Processos ativos",
    "monitor.historyHeading": "Histórico de execuções",
    "monitor.emptyActive": "Nenhum script em execução no momento.",
    "monitor.emptyHistory": "Nenhuma execução concluída em memória ainda.",
    "monitor.stopBtn": "Parar",
    "monitor.rerunBtn": "Reexecutar",
    "monitor.client": "Cliente",
    "monitor.script": "Script",
    "monitor.params": "Parâmetros",
    "monitor.exitOk": "200 OK",
    "monitor.exitError": "Erro ({code})",
    "monitor.exitCancelled": "Cancelado",
    "monitor.noOutput": "Nenhuma saída gerada.",

    // Manual run modal
    "manual.title": "Executar script de automação",
    "manual.selectScript": "Script",
    "manual.selectScriptDesc": "Escolha um script do catálogo para preencher seus parâmetros.",
    "manual.noScripts": "Nenhum script válido encontrado em {folder}. Crie uma nota de script primeiro.",
    "manual.paramsHeading": "Parâmetros",
    "manual.noParams": "Este script não exige parâmetros.",
    "manual.requiredBadge": "obrigatório",
    "manual.optionalBadge": "opcional",
    "manual.runCta": "Executar script",
    "manual.cancel": "Cancelar",
    "manual.validationFailed": "Corrija os erros de validação destacados antes de executar.",

    // Script editor modal
    "editor.titleNew": "Criar nota de script de automação",
    "editor.titleEdit": "Editar nota de script de automação",
    "editor.scriptId": "ID do script",
    "editor.scriptIdDesc": "Identificador único (letras, dígitos, _ e -).",
    "editor.name": "Nome de exibição",
    "editor.category": "Categoria",
    "editor.description": "Descrição",
    "editor.runtime": "Runtime",
    "editor.inputMode": "Modo de entrada",
    "editor.scriptPath": "Caminho do script externo (opcional)",
    "editor.scriptPathDesc": "Caminho relativo ao cofre (ex.: scripts/minha_tarefa.py). Deixe vazio para código embutido.",
    "editor.timeout": "Timeout (segundos)",
    "editor.exposeAsTool": "Expor como tool MCP dedicada",
    "editor.exposeAsToolDesc": "Registra script_<script_id> diretamente como uma tool MCP tipada.",
    "editor.paramsYaml": "Parâmetros (mapa YAML)",
    "editor.inlineCode": "Código embutido (opcional)",
    "editor.save": "Salvar nota de script",
    "editor.invalidId": "Informe um script_id válido (letras, dígitos, _ e -).",
  },
};

let forced: Lang | undefined;

/** For tests. */
export function setLanguage(lang: Lang | undefined): void {
  forced = lang;
}

export function currentLanguage(): Lang {
  if (forced) return forced;
  try {
    return getLanguage().toLowerCase().startsWith("pt") ? "pt" : "en";
  } catch {
    return "en";
  }
}

/** Translates a key, replacing {name} with vars.name. Falls back to English, then to the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const lang = currentLanguage();
  let text = strings[lang][key] ?? strings.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
  }
  return text;
}

/** All keys, for tests that check both languages have the same keys. */
export function allStrings(): StringTable {
  return strings;
}
