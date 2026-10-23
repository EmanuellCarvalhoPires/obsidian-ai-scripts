// Index metadata of the script catalog: effect, approval policy and the scripts that are no longer
// exposed as individual MCP tools. Pure data, no imports, so the factory and the index can share it.

import type { ToolEffect } from "../ecosystem/types";

export interface ScriptIndexMeta {
  /** What running the script does (leitura, cofre or externo). */
  efeito: ToolEffect;
  /** Approval policy read by tools_run: a question template with {arg} placeholders, "obrigatoria" or "dispensada". */
  aprovacao?: string;
}

/** Effect used for scripts that are not listed below (safe default: asks the generic question). */
export const DEFAULT_SCRIPT_INDEX_META: ScriptIndexMeta = { efeito: "externo" };

/** Metadata of the scripts of the vault catalog, keyed by script_id. */
export const SCRIPT_INDEX_META: Record<string, ScriptIndexMeta> = {
  // Reading only
  sincronizar_tickets_jira: { efeito: "leitura" },
  buscar_notas: { efeito: "leitura" },
  resumir_ticket_jira: { efeito: "cofre" },
  documentar_projeto_jira: { efeito: "leitura" },
  documentacao_tecnica_jira: { efeito: "cofre" },
  markdown_para_word: { efeito: "cofre" },
  copia_visual_workflow_jira: { efeito: "leitura" },
  print_workflow_jira: { efeito: "leitura" },
  projetos_dev: { efeito: "leitura" },
  validar_docx_documentacao: { efeito: "leitura" },
  // Writes inside the vault
  gerar_log_conversa_gemini: { efeito: "cofre" },
  atualizar_log_conversa_gemini: { efeito: "cofre" },
  gerar_log_conversa_claude: { efeito: "cofre" },
  atualizar_log_conversa_claude: { efeito: "cofre" },
  sincronizar_gemini_md: { efeito: "cofre" },
  sincronizar_skills: { efeito: "cofre" },
  auditar_fluxos: { efeito: "cofre" },
  changelog_desenvolvimento: { efeito: "cofre" },
  log_desenvolvimento: { efeito: "cofre" },
  // Writes or sends outside the vault
  enviar_telegram: { efeito: "externo", aprovacao: 'Posso enviar ao Telegram a mensagem "{message}"?' },
  // The approval request itself: asking the user is the purpose, so it is never asked twice.
  pedir_aprovacao_telegram: { efeito: "externo", aprovacao: "dispensada" },
  padronizar_cifras_drive: { efeito: "externo", aprovacao: "obrigatoria" },
  deletar_projeto_clonado: { efeito: "externo", aprovacao: "obrigatoria" },
  adicionar_emails_grupo_jira: { efeito: "externo", aprovacao: "obrigatoria" },
  enviar_whatsapp: { efeito: "externo", aprovacao: "obrigatoria" },
};

/**
 * Scripts whose MCP tool (script_<id>) was removed: the same work is done by a dedicated MCP tool
 * of another module. They stay on disk and in tools.db, so tools_find and tools_run still reach them.
 */
export const DUPLICATE_MCP_SCRIPT_IDS: readonly string[] = [
  "buscar_notas",
  "enviar_telegram",
  "pedir_aprovacao_telegram",
];

export function scriptIndexMeta(scriptId: string): ScriptIndexMeta {
  return SCRIPT_INDEX_META[scriptId] ?? DEFAULT_SCRIPT_INDEX_META;
}
