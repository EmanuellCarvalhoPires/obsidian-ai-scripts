# Plano de implementação: itens aceitos da auditoria do módulo AI Scripts

## Sumário
- Etapa 1: Corpo do schema sem código-fonte (linhas 102-188)
- Etapa 2: Recusar caminhos absolutos e fallback dentro da pasta de scripts (linhas 190-278)
- Etapa 3: Metadados do cabeçalho: efeito, aprovação e oculto (linhas 280-370)
- Etapa 4: Parâmetros desconhecidos recusados e ergonomia de valores (linhas 372-467)
- Etapa 5: Erro de validação compacto com expected e example (linhas 469-548)
- Etapa 6: Superfície MCP enxuta, sem tools dinâmicas e com instruções corretas (linhas 550-643)
- Etapa 7: Cancelamento real e status de timeout (linhas 645-753)
- Etapa 8: Redação, spill, teto de saída e histórico limitado (linhas 755-850)
- Etapa 9: Duplicidade de catálogo e instalação do starter pack (linhas 852-935)
- Etapa 10: Recarga do catálogo só quando o conteúdo muda (linhas 937-1015)
- Etapa 11: Verificação geral (linhas 1017-1085)

## 1. Objetivo
Implementar os 17 itens aceitos da auditoria do AI Ecosystem para o módulo AI Scripts, cobrindo falhas de segurança (execução com parâmetro errado, caminho fora da política, redação de segredo), economia de tokens (schema, listagem, erros), eficiência (recargas, memória) e documentação. Pronto quando todos os critérios BDD da seção 6 passarem, `npm run typecheck`, `npm run lint` e `npm test` terminarem sem erro, e nenhum item da lista ficar sem etapa correspondente (cobertura na seção 4).

## 2. Contexto completo
- **Projeto:** plugin do Obsidian chamado `ai-scripts` (versão 1.2.0), em TypeScript, bundle com esbuild, testes com vitest, lint com eslint + eslint-plugin-obsidianmd. Raiz absoluta: `C:\Users\Trabalho\Documents\obsidian-ai-scripts`. O plugin lê scripts de notas Markdown e de arquivos de código (`.py`, `.sh`, `.ps1`, `.js`, `.mjs`, `.ts`) da pasta configurada (`scriptsFolder`, padrão `Scripts/AI`) e expõe tools MCP (`list_ai_scripts`, `get_script_schema`, `run_ai_script`) e um índice (`tools.db`) via o plugin AI Ecosystem.
- **Estado atual relevante (confirmado no código):**
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts`: `parseScriptNote`, `extractDocstringFrontmatter` (devolve o arquivo inteiro como `body`), `parseParamsMap`, `buildJsonSchema`, `buildExampleParams`. O `markdownBody` do script é o `body` limpo (perto da linha 462).
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\validation\param-validator.ts`: `ParamValidator.validate` calcula `strippedKeys` (chaves desconhecidas, linhas ~95-101) e devolve em `ValidationResult` (linha ~213), mas NINGUÉM usa `strippedKeys`: a chave desconhecida é descartada em silêncio.
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts`: `ExecutionCoordinator.run` (~182) → `runDefinition` (~191). Cria `AbortController` próprio (~265) que NÃO recebe o sinal do chamador. `ScriptValidationError` junta as mensagens no `message`. Status final: `controller.signal.aborted || execResult.killed` vira `cancelled` (~376). Usa `this.deps.getRunsDir?.()` (~280) para o spill.
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\process-bridge.ts`: `execute` (~142), `runViaEcosystem` (~195), `runViaLocalSpawn` (~283 em diante), timer `setTimeout(() => killProc(), timeoutSeconds * 1000)` (~449), sem teto. `redact` por pedaço (~135) e de novo no coordenador. O `signal` já é suportado pelo bridge (`onAbort` mata a árvore de processos).
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\ecosystem\types.ts`: `HubCallContext` já traz `signal?: AbortSignal` (linhas 78-85), mas os handlers de `dynamic-tool-factory.ts`, `scripts-mcp-tools.ts` e `tool-index.ts` não o repassam.
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\dynamic-tool-factory.ts`: `formatToolError` (~49-73) devolve o JSON em `content` e de novo em `structuredContent`; `buildDedicatedScriptTool` (~107-146) registra uma tool `script_<id>` por script com `exposeAsTool`; `buildDynamicTools` (~148). `buildAllTools` (`scripts-mcp-tools.ts` ~226) junta estáticas e dinâmicas, e é usado em `main.ts` (~132) para o modo completo.
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts`: `MODULE_INSTRUCTIONS` (linhas 14-17) cita a pasta `Scripts/AI/` e tools que não existem no modo indexado. `getScriptSchema` devolve `instructions: def.markdownBody`. `buildRoutes` tem `GET /scripts`, `GET /scripts/:id/schema`, `POST /scripts/:id/run` (sem `maxOutput`) e `POST /runs/:runId/cancel`.
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\script-catalog-meta.ts`: mapa fixo `SCRIPT_INDEX_META` (efeito e aprovação por id) e `DUPLICATE_MCP_SCRIPT_IDS`. Scripts que gravam aparecem como `leitura`.
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\tool-index.ts`: `buildScriptIndexEntries` (usa `scriptIndexMeta`) e `ScriptToolRunner.run`.
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-loader.ts`: `ScriptLoader.load` (cache), `invalidate`, `readAll` (checa duplicidade de `scriptId` pela ordem alfabética, sem preferir código). `defaultTimeout` fallback 120.
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts`: `registerVaultWatchers` (~404-418) recarrega em qualquer `.md/.py/.sh/.ps1/.js/.mjs/.ts` alterado, sem checar a pasta. `start()` (~258-266) instala o starter pack se `installStarterPack` for true. O `ExecutionCoordinator` é criado sem `getRunsDir`.
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\starter\starter-pack.ts` e `starter-notes.ts`: `installStarterScripts` grava 3 notas `.md` com `expose_as_tool: true`.
  - `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\types\script-types.ts`: `ValidationIssue`, `ValidationResult`, `AIScriptsSettings`, `DEFAULT_SETTINGS` (`installStarterPack: true`, `starterPackInstalledIds`).
  - Cofre do usuário (fora deste repositório): `C:\Users\Trabalho\Documents\Cofre\scripts\` contém os scripts reais, incluindo `hook_perfil_sobre_mim.py` (cabeçalho com `expose: false`), `catalogo_scripts.py` e `scripts.db` (catálogos antigos). A pasta real de scripts é `scripts/`, não `Scripts/AI/`.
  - Fora deste repositório: `C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\src\runner\script-policy.ts` (teto de timeout de 300 s, `maxTimeoutSeconds`, recusas `path-not-allowed`). Este plano NÃO altera esse repositório.
- **Motivação:** a auditoria (arquivo `C:\Users\Trabalho\AppData\Local\Temp\claude\C--Users-Trabalho-Documents-Cofre\f7346580-c5be-4117-a93c-bde037b7aa6b\scratchpad\itens-scr.md`) mediu custo de tokens por chamada, execuções indevidas (parâmetro errado roda de verdade, como em `padronizar_cifras_drive`, que renomeia arquivos no Drive), vazamento de segredo e execuções órfãs.
- **Fora do escopo:**
  - Qualquer alteração em `C:\Users\Trabalho\Documents\obsidian-ai-ecosystem` (script-policy, runner, hooks).
  - Alterar os scripts reais de `C:\Users\Trabalho\Documents\Cofre\scripts\` (são ações do usuário, ver seção "Ações do usuário").
  - Mudar o layout das telas além do necessário para mostrar o novo status `timeout`.
  - Commit, push, merge, deploy (`npm run deploy`) e instalação no cofre.

## 3. Regras globais de implementação
1. Raiz absoluta de todo o trabalho: `C:\Users\Trabalho\Documents\obsidian-ai-scripts`. Todo caminho citado nos prompts é absoluto. Rode os comandos a partir dessa pasta.
2. Idioma: comentários e identificadores em inglês, como no código existente (ex.: `// Parses Markdown script notes`). Textos visíveis ao usuário passam por `t("chave")` de `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\i18n.ts` e ganham chave em pt e en quando o arquivo tiver as duas línguas.
3. Não adicionar dependências a `C:\Users\Trabalho\Documents\obsidian-ai-scripts\package.json`.
4. Imitar a convenção de testes existentes antes de escrever testes novos: ler primeiro `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\validation\param-validator.test.ts` e o mock `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\mocks\obsidian.ts`.
5. Comandos oficiais (definidos em `C:\Users\Trabalho\Documents\obsidian-ai-scripts\package.json`):
   - tipos: `npm run typecheck` (tsc --noEmit)
   - lint: `npm run lint` (eslint .)
   - testes: `npm test` (vitest run)
   - build: `npm run build` (tsc --noEmit + esbuild production; gera `C:\Users\Trabalho\Documents\obsidian-ai-scripts\main.js`)
   - PROIBIDO nesta execução: `npm run deploy`.
6. Nenhum commit, push ou merge. Só alterar arquivos listados na etapa.
7. Nunca escrever segredo, token ou senha em código, teste ou log. Nunca ler `.credentials.json` ou `.env`.
8. Manter compatibilidade: `ScriptsServiceContract` e as rotas REST `GET /scripts`, `GET /scripts/:id/schema`, `POST /scripts/:id/run`, `POST /runs/:runId/cancel` continuam existindo com os mesmos nomes; só os campos descritos na etapa mudam.
9. Quando o código real não bater com o descrito em uma etapa (arquivo ausente, assinatura diferente, linha que não existe), PARE a etapa e relate o desvio, sem improvisar.

## 4. Mapa das etapas

Cobertura dos 17 itens da auditoria (ordem do arquivo `itens-scr.md`):

| Item | Problema resumido | Etapa |
| --- | --- | --- |
| 1 | `get_script_schema` devolve o arquivo inteiro | 1 |
| 2 | Parâmetro com nome errado descartado em silêncio | 4 |
| 3 | Erro de validação duplicado e sem expected/example | 5 |
| 4 | Cancelamento não mata o script | 7 |
| 5 | Catálogo recarregado a cada nota salva | 10 |
| 6 | Starter pack instalado dentro de pasta de scripts | 9 |
| 7 | `list_ai_scripts` verboso e com hooks | 6 (usa `oculto` da etapa 3) |
| 8 | Timeout vira `cancelled` e teto de 300 s não aplicado no fallback | 7 |
| 9 | Três catálogos concorrentes | 9 (código) e Ações do usuário (arquivar) |
| 10 | Teto de saída com spill na REST e pasta temporária | 8 |
| 11 | Tools `script_<id>` redundantes | 6 |
| 12 | Efeito e aprovação fixos no código | 3 |
| 13 | Redação de segredo por pedaço | 8 |
| 14 | `script_path` absoluto e fallback fora da política | 2 |
| 15 | Histórico em memória sem limite de bytes | 8 |
| 16 | Instruções apontam para pasta e tools erradas | 6 |
| 17 | Ergonomia de parâmetros (valor único em lista, prefixo script_) | 4 |

| # | Etapa | Esforço | Depende de | Paralelizável com |
| --- | --- | --- | --- | --- |
| 1 | Corpo do schema sem código-fonte | médio | nenhuma | nenhuma |
| 2 | Caminhos absolutos recusados e fallback restrito | alto | 1 | nenhuma |
| 3 | Metadados do cabeçalho: efeito, aprovação, oculto | alto | 2 | nenhuma |
| 4 | Parâmetros desconhecidos recusados e ergonomia | alto | 3 | nenhuma |
| 5 | Erro de validação compacto | médio | 4 | nenhuma |
| 6 | Superfície MCP enxuta | alto | 5 | nenhuma |
| 7 | Cancelamento real e timeout | alto | 6 | nenhuma |
| 8 | Redação, spill, teto e histórico | alto | 7 | nenhuma |
| 9 | Duplicidade de catálogo e starter pack | médio | 8 | nenhuma |
| 10 | Recarga do catálogo por conteúdo | médio | 9 | nenhuma |
| 11 | Verificação geral | alto | 10 | nenhuma |

Todas as etapas tocam arquivos compartilhados (`scripts-mcp-tools.ts`, `execution-coordinator.ts`, `schema-parser.ts`, `main.ts`), por isso rodam em sequência.

## 5. Etapas

## Etapa 1: Corpo do schema sem código-fonte [Haiku 5.5 | esforço: médio]

**Objetivo:** `get_script_schema` devolve em `instructions` só a descrição em prosa do script, nunca o arquivo de código inteiro, e omite a chave quando não há texto.
**Depende de:** nenhuma
**Paralelizável com:** nenhuma

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts` (função `extractDocstringFrontmatter` e o ponto onde `cleanMarkdownBody` vira `markdownBody`, perto da linha 462)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts` (método `getScriptSchema`, campo `instructions`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\validation\schema-parser.test.ts` (novos casos)
- Não tocar: qualquer outro arquivo.

**Regras de implementação**
1. Para arquivo de código com docstring de cabeçalho (`"""` + bloco `---` ... `---`), `markdownBody` recebe apenas o texto DEPOIS da linha de fechamento `---`, sem a linha `"""` final e sem o bloco YAML.
2. Para notas Markdown, o comportamento não muda (continua o corpo após o frontmatter).
3. `extractInlineCode` continua recebendo o corpo original do Markdown; para arquivos de código não há bloco inline.
4. Em `getScriptSchema`, a chave `instructions` só entra no objeto quando o texto não estiver vazio (após `trim()`).
5. Não alterar a assinatura pública de `parseScriptNote`.

**Passos** (sub-tópicos executados em ordem)
- **1.1 Separar o texto de descrição do código:** objetivo: `extractDocstringFrontmatter` deixa de devolver o arquivo inteiro como `body`.
  1. Abra `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts` e leia `extractDocstringFrontmatter` e seus chamadores (`grep` por `extractDocstringFrontmatter` no arquivo).
  2. Altere a regex de captura para também capturar o índice do fechamento do bloco `---`; `body` passa a ser o conteúdo após essa linha, com a linha `"""` de fechamento removida se existir.
  3. Mantenha o `yaml` retornado igual ao atual.
  - Verificação do sub-tópico: `npm run typecheck` (em `C:\Users\Trabalho\Documents\obsidian-ai-scripts`) → sem erros.
- **1.2 Omitir `instructions` vazio:** objetivo: a resposta de `get_script_schema` só carrega `instructions` quando há texto.
  1. Em `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts`, no objeto retornado por `getScriptSchema`, troque `instructions: def.markdownBody` por uma construção condicional que só adiciona a chave se `def.markdownBody?.trim()` não for vazio.
  - Verificação do sub-tópico: `npm run typecheck` → sem erros.
- **1.3 Testes:** objetivo: cobrir os casos novos.
  1. Em `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\validation\schema-parser.test.ts`, acrescente casos: script `.py` com docstring e um parágrafo de descrição, e outro sem descrição.
  - Verificação do sub-tópico: `npm test -- schema-parser` → todos passam.

**BDD (estado esperado ao concluir)**
- Dado um arquivo `.py` cuja docstring tem frontmatter `id:` e o texto "Hook SessionStart: injeta contexto.", Quando `parseScriptNote` é chamado, Então `definition.markdownBody` contém "Hook SessionStart: injeta contexto." e NÃO contém a linha `import json`.
- Dado um arquivo `.py` sem texto após o bloco `---`, Quando `get_script_schema` é chamado, Então a resposta NÃO tem a chave `instructions`.
- Dado uma nota `.md` com frontmatter e corpo de texto, Quando `parseScriptNote` é chamado, Então `markdownBody` é igual ao corpo do Markdown sem o frontmatter (comportamento antigo preservado).
- Dado a suíte atual, Quando `npm test` roda, Então nenhum teste pré-existente falha.

**Verificação** (rodar em `C:\Users\Trabalho\Documents\obsidian-ai-scripts`)
- `npm run typecheck` → sem erros.
- `npm test` → todos os testes passam.
- `npm run lint` → sem erros novos nos arquivos alterados.

**Prompt para o subagente**
```text
Você é um implementador de código TypeScript. Execute UMA etapa de um plano; não implemente nada além dela.

Contexto completo:
- Projeto: plugin do Obsidian "ai-scripts" (TypeScript, esbuild, vitest, eslint). Raiz absoluta: C:\Users\Trabalho\Documents\obsidian-ai-scripts. Comentários e identificadores em inglês, como no código existente.
- Objetivo geral: reduzir o custo de tokens e corrigir falhas nas tools MCP de scripts. Esta etapa resolve o item "get_script_schema devolve o código-fonte do script": para arquivos .py a descrição (`instructions`) é o arquivo INTEIRO, quando deveria ser só a prosa após o bloco `---` da docstring.
- Estado atual: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts tem `extractDocstringFrontmatter`, que devolve `body: content` (o arquivo inteiro). Em `parseScriptNote`, o `cleanMarkdownBody` vira `markdownBody` (perto da linha 462). C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts, método `getScriptSchema`, tem `instructions: def.markdownBody`.
- Comandos: a partir de C:\Users\Trabalho\Documents\obsidian-ai-scripts, `npm run typecheck`, `npm run lint`, `npm test`. NÃO rode `npm run deploy`.
- Não faça commit, push nem merge.

Regras:
1. Para arquivo de código com docstring de cabeçalho (`"""`, bloco `---` ... `---`), o markdownBody recebe SOMENTE o texto depois da linha `---` de fechamento, sem a linha `"""` e sem o YAML.
2. Notas Markdown: comportamento inalterado (corpo após o frontmatter).
3. extractInlineCode continua recebendo o corpo Markdown original.
4. Em getScriptSchema, a chave `instructions` só existe quando o texto, após trim, não está vazio.
5. Não altere a assinatura pública de parseScriptNote.
6. Não altere nenhum arquivo além dos listados abaixo.

Arquivos:
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\validation\schema-parser.test.ts (leia antes o estilo dos testes existentes e siga-o)

O que fazer, nesta ordem:
1.1 Em schema-parser.ts, leia extractDocstringFrontmatter e os chamadores. Faça body = texto após a linha `---` de fechamento, sem a linha `"""` final. Mantenha o yaml igual. Verifique: npm run typecheck sem erros.
1.2 Em scripts-mcp-tools.ts, no objeto de getScriptSchema, adicione `instructions` só quando def.markdownBody?.trim() não for vazio. Verifique: npm run typecheck sem erros.
1.3 Em schema-parser.test.ts, acrescente casos: (a) .py com docstring e um parágrafo de descrição: markdownBody contém o parágrafo e não contém "import json"; (b) .py sem texto após o `---`: markdownBody vazio; (c) nota .md com frontmatter: markdownBody igual ao corpo sem frontmatter. Verifique: npm test -- schema-parser sem falhas.

Critérios (BDD):
- Dado um .py com docstring e o parágrafo "Hook SessionStart: injeta contexto.", Quando parseScriptNote roda, Então markdownBody contém esse parágrafo e não contém "import json".
- Dado um .py sem texto após o `---`, Quando getScriptSchema roda, Então a resposta não tem a chave instructions.
- Dado uma nota .md, Então markdownBody é o corpo sem frontmatter.
- Dado a suíte, Então nenhum teste pré-existente falha.

Verificação final (em C:\Users\Trabalho\Documents\obsidian-ai-scripts):
- npm run typecheck → sem erros
- npm test → tudo passa
- npm run lint → sem erros nos arquivos alterados

Se algo não bater com o descrito (arquivo ausente, função com outro nome, linha que não existe), PARE e relate o desvio sem improvisar.

Relatório final: liste os arquivos alterados com caminho absoluto; cole a saída real de cada comando de verificação (não resuma); descreva qualquer desvio ou dúvida.
```

## Etapa 2: Caminhos absolutos recusados e fallback restrito [Haiku 5.5 | esforço: alto]

**Objetivo:** uma nota com `script_path` absoluto (ex.: `C:/...` ou `/...`) é recusada no parser, e o fallback local (`runViaLocalSpawn`) só executa arquivos que estejam dentro do cofre e dentro de uma pasta de scripts.
**Depende de:** Etapa 1
**Paralelizável com:** nenhuma

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts` (bloco de `script_path`, perto das linhas 404-409 e 430-440)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\process-bridge.ts` (`runViaLocalSpawn`, cálculo de `scriptAbsPath`, perto da linha 283)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-loader.ts` (se for preciso passar as pastas permitidas ao bridge; prefira ler via `computeScriptFolders` de `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\ecosystem\hooks-integration.ts`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\validation\schema-parser.test.ts`, `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\execution\script-runner.test.ts`
- Não tocar: `C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\**` (outro repositório).

**Regras de implementação**
1. No parser, `script_path` é recusado (erro de validação da nota, não execução) quando começar com `/`, `\`, ou com letra de unidade (regex `^[A-Za-z]:` ou `^[\\/]`), além da checagem `..` já existente.
2. No fallback local, o caminho resolvido (`path.resolve(vaultBase, rel)`) precisa estar dentro de `vaultBase` E dentro de uma das pastas de `computeScriptFolders(scriptsFolder, scripts)`. Fora disso, lançar erro `Script path is outside the allowed scripts folder` (chave i18n nova ou mensagem em inglês, como o erro atual do bridge).
3. Scripts com código inline materializado (`.tmp-ais-*`) passam por essa mesma checagem, porque a pasta de materialização é a pasta de scripts.
4. Não mudar o caminho que o ecossistema usa (`runViaEcosystem`): a política do outro repositório já recusa o que está fora.
5. Não usar `fs.realpath` nem novas dependências; `path` do Node basta.

**Passos**
- **2.1 Recusar caminho absoluto no parser:** objetivo: `script_path` absoluto vira erro de validação da nota.
  1. Em `schema-parser.ts`, no bloco que lê `rawScriptPath`, antes de `normalizePath`, adicione a checagem absoluta descrita na regra 1 e chame `addError` com mensagem clara.
  2. Não aceite `scriptPath` quando houver erro (deixe `scriptPath` `undefined`).
  - Verificação do sub-tópico: `npm run typecheck` → sem erros.
- **2.2 Restringir o fallback:** objetivo: `runViaLocalSpawn` aceita só caminhos dentro do cofre e das pastas de scripts.
  1. Em `process-bridge.ts`, antes de `resolveCommand`, calcule o caminho absoluto e valide com `path.relative`: se o resultado começar com `..` ou for absoluto, lance erro.
  2. Obtenha as pastas permitidas: o bridge já tem `this.deps.getScriptsFolder()`; use `computeScriptFolders` (de hooks-integration) com a lista de scripts, OU, se o bridge não tiver a lista, use apenas `scriptsFolder` como raiz permitida. Escolha a opção que não exige nova dependência circular e registre a escolha num comentário.
  - Verificação do sub-tópico: `npm run typecheck` → sem erros.
- **2.3 Testes:** objetivo: cobrir recusa e aceitação.
  1. Em `schema-parser.test.ts`: nota com `script_path: C:/x/y.py` gera problema de nível erro e `scriptPath` indefinido; `script_path: Scripts/AI/a.py` continua válido.
  2. Em `script-runner.test.ts`: fallback recusa caminho fora da pasta de scripts (use o mock de spawn existente) e aceita dentro.
  - Verificação do sub-tópico: `npm test -- schema-parser script-runner` → passam.

**BDD (estado esperado ao concluir)**
- Dado uma nota com `script_path: C:/Users/x/evil.py`, Quando `parseScriptNote` roda, Então há problema de erro e `definition` não é criado.
- Dado uma nota com `script_path: /etc/evil.sh`, Quando `parseScriptNote` roda, Então há problema de erro.
- Dado um script válido `Scripts/AI/ok.py`, Quando o fallback local executa, Então o spawn é chamado com caminho dentro da pasta de scripts.
- Dado um script cujo caminho resolvido sai do cofre, Quando o fallback local executa, Então nenhum processo é criado e a execução falha com erro claro.
- Dado a suíte, Quando `npm test` roda, Então nada pré-existente falha.

**Verificação** (em C:\Users\Trabalho\Documents\obsidian-ai-scripts)
- `npm run typecheck` → sem erros
- `npm test` → passa
- `npm run lint` → sem erros novos

**Prompt para o subagente**
```text
Você é um implementador de código TypeScript. Execute UMA etapa de um plano; não implemente nada além dela.

Contexto completo:
- Projeto: plugin do Obsidian "ai-scripts" (TypeScript, esbuild, vitest, eslint). Raiz absoluta: C:\Users\Trabalho\Documents\obsidian-ai-scripts. Comentários e identificadores em inglês.
- Objetivo geral: corrigir falha de segurança. Uma nota de script com `script_path` absoluto (ex.: C:/...) roda fora das pastas permitidas quando o núcleo do AI Ecosystem recusa, porque o fallback local não valida o caminho.
- Estado atual: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts aceita `script_path` absoluto (só recusa `..`). C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\process-bridge.ts, função runViaLocalSpawn, calcula scriptAbsPath = path.join(vaultBase, targetRelPath) sem checar limites. Já existe em C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\ecosystem\hooks-integration.ts a função computeScriptFolders(scriptsFolder, scripts), que devolve as pastas de scripts do cofre.
- Não altere nada em C:\Users\Trabalho\Documents\obsidian-ai-ecosystem (outro repositório).
- Comandos: a partir de C:\Users\Trabalho\Documents\obsidian-ai-scripts: npm run typecheck, npm run lint, npm test. NÃO rode npm run deploy. Sem commit, push ou merge.

Regras:
1. No parser, script_path é recusado (addError, sem criar definição) quando começar com "/", "\" ou letra de unidade (regex ^[A-Za-z]:) ou tiver "..".
2. No fallback local, o caminho resolvido precisa estar dentro de vaultBase e dentro de uma pasta permitida (scriptsFolder ou computeScriptFolders). Fora disso, lançar erro antes de qualquer spawn.
3. Código inline materializado (.tmp-ais-*) passa pela mesma checagem.
4. Não mude runViaEcosystem.
5. Não adicione dependências.

Arquivos:
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\process-bridge.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\validation\schema-parser.test.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\execution\script-runner.test.ts
- Leia antes os testes existentes para seguir o estilo e o mock de spawn.

Passos, em ordem:
2.1 schema-parser.ts: no bloco de rawScriptPath, recuse caminho absoluto (regra 1) com addError e não defina scriptPath. Verifique: npm run typecheck.
2.2 process-bridge.ts, runViaLocalSpawn: valide o caminho resolvido (regra 2) com path.relative; para as pastas permitidas, use scriptsFolder (e, se o bridge já tiver acesso, computeScriptFolders). Anote no código a escolha. Verifique: npm run typecheck.
2.3 Testes: nota com C:/x/y.py gera erro; /etc/evil.sh gera erro; Scripts/AI/ok.py é aceito; no fallback, caminho que sai do cofre não cria processo e falha; caminho dentro da pasta cria processo (spawn mockado). Verifique: npm test -- schema-parser script-runner.

Critérios (BDD):
- Dado script_path: C:/Users/x/evil.py, Quando parseScriptNote roda, Então há erro e definition não existe.
- Dado script_path: /etc/evil.sh, Quando parseScriptNote roda, Então há erro.
- Dado script_path: Scripts/AI/ok.py, Quando o fallback roda, Então o spawn recebe caminho dentro da pasta.
- Dado caminho resolvido fora do cofre, Quando o fallback roda, Então nenhum spawn ocorre e a execução falha com mensagem clara.
- Dado a suíte, Então nada pré-existente falha.

Verificação final (em C:\Users\Trabalho\Documents\obsidian-ai-scripts): npm run typecheck; npm test; npm run lint (sem erros nos arquivos alterados).

Se algo não bater (arquivo ausente, função com outro nome, a assinatura de spawn for diferente), PARE e relate o desvio sem improvisar.

Relatório final: arquivos alterados com caminho absoluto; saída real de cada comando de verificação; desvios e dúvidas.
```

## Etapa 3: Metadados do cabeçalho: efeito, aprovação, oculto [Haiku 5.5 | esforço: alto]

**Objetivo:** `efeito`, `aprovacao` e `oculto` passam a ser lidos do cabeçalho de cada script (frontmatter ou docstring); o mapa fixo `SCRIPT_INDEX_META` vira só reserva para scripts sem esses campos.
**Depende de:** Etapa 2
**Paralelizável com:** nenhuma

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\types\script-types.ts` (campos novos em `ScriptDefinition`: `efeito?`, `aprovacao?`, `oculto`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts` (leitura dos campos)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\script-catalog-meta.ts` (comentário e função `scriptIndexMeta` como reserva)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\tool-index.ts` (`buildScriptIndexEntries` usa o campo do script antes do mapa)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\validation\schema-parser.test.ts`, `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\tools\tool-index.test.ts`
- Não tocar: scripts reais em `C:\Users\Trabalho\Documents\Cofre\scripts\` (são ações do usuário).

**Regras de implementação**
1. `efeito` aceita só `leitura`, `cofre` ou `externo`. Valor inválido gera problema de nível aviso e cai no padrão.
2. `aprovacao` aceita string livre com `{arg}` (pergunta), `obrigatoria` ou `dispensada`. Qualquer outro valor vira aviso e é ignorado.
3. `oculto` aceita `true`/`false` (boolean ou string "true"). Padrão `false`.
4. Sem `efeito` no cabeçalho, usa `scriptIndexMeta(scriptId).efeito`; sem entrada no mapa, usa `externo` (padrão seguro, já existente em `DEFAULT_SCRIPT_INDEX_META`).
5. Não remover o mapa `SCRIPT_INDEX_META`; ele continua como reserva.

**Passos**
- **3.1 Campos no tipo:** objetivo: `ScriptDefinition` ganha `efeito?: ToolEffect`, `aprovacao?: string`, `oculto: boolean`. Importe `ToolEffect` de `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\ecosystem\types.ts` se ainda não estiver importado (verifique o tipo exato lá).
  - Verificação: `npm run typecheck` → erros apenas nos lugares que constroem `ScriptDefinition`; corrija-os com `oculto: false` por padrão.
- **3.2 Leitura no parser:** objetivo: `parseScriptNote` preenche os três campos a partir de `front` (aceite também a chave em português `efeito` e `aprovacao` e `oculto`, como o parser já faz com `descricao`/`nome`).
  - Verificação: `npm run typecheck` → sem erros.
- **3.3 Índice usa o cabeçalho:** objetivo: em `buildScriptIndexEntries`, `efeito` vem de `script.efeito ?? scriptIndexMeta(script.scriptId).efeito`; `aprovacao` idem. Scripts com `oculto: true` não entram no índice (pois a etapa 6 esconde também da listagem; aqui só filtre no índice).
  - Verificação: `npm run typecheck`.
- **3.4 Testes:** objetivo: cobrir leitura e precedência.
  - Verificação: `npm test -- schema-parser tool-index` → passam.

**BDD (estado esperado ao concluir)**
- Dado um script com `efeito: cofre` no cabeçalho e id que está no mapa como `externo`, Quando o índice é montado, Então a entrada tem `efeito: cofre`.
- Dado um script com `aprovacao: obrigatoria` e sem `efeito`, Quando o índice é montado, Então `efeito` vem do mapa ou de `externo`, e `aprovacao` é `obrigatoria`.
- Dado um script com `efeito: escrever-tudo` (inválido), Quando o parser roda, Então há aviso e o efeito cai no padrão.
- Dado um script com `oculto: true`, Quando o índice é montado, Então ele NÃO aparece nas entradas.
- Dado a suíte, Então nada pré-existente falha.

**Verificação** (em C:\Users\Trabalho\Documents\obsidian-ai-scripts)
- `npm run typecheck` → sem erros
- `npm test` → passa
- `npm run lint` → sem erros novos

**Prompt para o subagente**
```text
Você é um implementador de código TypeScript. Execute UMA etapa de um plano; não implemente nada além dela.

Contexto completo:
- Projeto: plugin do Obsidian "ai-scripts" (TypeScript, esbuild, vitest, eslint). Raiz absoluta: C:\Users\Trabalho\Documents\obsidian-ai-scripts. Comentários e identificadores em inglês.
- Objetivo geral: a política de aprovação e o efeito de cada script (leitura, cofre ou externo) estão fixos no código, em C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\script-catalog-meta.ts. Scripts que gravam arquivos aparecem como leitura, e um script novo cai no padrão externo. A correção é ler `efeito`, `aprovacao` e `oculto` do cabeçalho de cada script; o mapa fica só como reserva.
- Estado atual: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\types\script-types.ts define ScriptDefinition sem esses campos. C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts função parseScriptNote lê `front` (frontmatter ou docstring) e aceita chaves em português e inglês (ex.: `descricao`, `nome`). C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\tool-index.ts função buildScriptIndexEntries usa scriptIndexMeta(script.scriptId).
- Tipo ToolEffect e ToolIndexEntry: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\ecosystem\types.ts. Confira o nome exato antes de usar.
- Comandos: a partir de C:\Users\Trabalho\Documents\obsidian-ai-scripts: npm run typecheck, npm run lint, npm test. NÃO rode npm run deploy. Sem commit, push ou merge.
- NÃO altere os scripts reais em C:\Users\Trabalho\Documents\Cofre\scripts\.

Regras:
1. efeito: aceite só leitura, cofre, externo. Outro valor: aviso (LoadProblem nível warning) e cai no padrão.
2. aprovacao: string livre (pergunta com {arg}), ou obrigatoria, ou dispensada. Valor não string: aviso e ignorado.
3. oculto: aceite true/false (boolean ou string "true"/"false"). Padrão false.
4. Sem efeito no cabeçalho: scriptIndexMeta(scriptId).efeito; se não houver no mapa, o padrão externo (DEFAULT_SCRIPT_INDEX_META).
5. Não remova SCRIPT_INDEX_META nem DUPLICATE_MCP_SCRIPT_IDS.
6. Não altere nada além dos arquivos listados.

Arquivos:
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\types\script-types.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\script-catalog-meta.ts (só comentário, se necessário)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\tool-index.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\validation\schema-parser.test.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\tools\tool-index.test.ts
- Leia antes os testes existentes para seguir o estilo.

Passos, em ordem:
3.1 script-types.ts: acrescente em ScriptDefinition efeito?: ToolEffect, aprovacao?: string, oculto: boolean. Corrija os lugares que constroem ScriptDefinition com oculto: false. Verifique: npm run typecheck.
3.2 schema-parser.ts: em parseScriptNote, leia efeito, aprovacao e oculto de front, aplicando as regras 1 a 3 com aviso quando inválido. Verifique: npm run typecheck.
3.3 tool-index.ts: em buildScriptIndexEntries, efeito = script.efeito ?? scriptIndexMeta(script.scriptId).efeito; aprovacao idem; scripts com oculto true não entram na lista de entradas. Verifique: npm run typecheck.
3.4 Testes: (a) efeito cofre no cabeçalho vence o mapa; (b) aprovacao obrigatoria sem efeito usa o mapa ou externo; (c) efeito inválido gera aviso e cai no padrão; (d) oculto true não entra no índice. Verifique: npm test -- schema-parser tool-index.

Critérios (BDD):
- Dado efeito: cofre no cabeçalho e id no mapa como externo, Quando o índice é montado, Então efeito é cofre.
- Dado aprovacao: obrigatoria sem efeito, Quando o índice é montado, Então aprovacao é obrigatoria e efeito vem do mapa ou de externo.
- Dado efeito inválido, Quando o parser roda, Então há aviso e efeito é o padrão.
- Dado oculto: true, Quando o índice é montado, Então o script não aparece.
- Dado a suíte, Então nada pré-existente falha.

Verificação final (em C:\Users\Trabalho\Documents\obsidian-ai-scripts): npm run typecheck; npm test; npm run lint (sem erros novos nos arquivos alterados).

Se algo não bater (tipo ToolEffect com outro nome, função ausente), PARE e relate o desvio sem improvisar.

Relatório final: arquivos alterados com caminho absoluto; saída real de cada comando; desvios e dúvidas.
```

## Etapa 4: Parâmetros desconhecidos recusados e ergonomia de valores [Haiku 5.5 | esforço: alto]

**Objetivo:** um parâmetro com nome errado (ex.: `dryrun` no lugar de `dry_run`) faz a execução ser recusada com erro `unknown_param` e sugestão do nome correto; um valor único é aceito onde o schema pede lista; um `script_id` com prefixo `script_` é aceito.
**Depende de:** Etapa 3
**Paralelizável com:** nenhuma

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\validation\param-validator.ts` (`validate`, linhas ~85-215)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\types\script-types.ts` (código `unknown_param` em `ValidationIssue`; `ValidationResult.strippedKeys` mantido)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts` (onde o validator é chamado e lança `ScriptValidationError`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-registry.ts` (`get` aceita prefixo `script_` e sugere id mais próximo no erro)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\validation\param-validator.test.ts`, `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\execution\script-runner.test.ts`
- Não tocar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\dynamic-tool-factory.ts` (a formatação de erro é a etapa 5).

**Regras de implementação**
1. Chave desconhecida em `params` gera issue `unknown_param` e a execução NÃO ocorre (erro 400). Exceção: `max_output` (parâmetro reservado da chamada) nunca conta como desconhecido.
2. A issue inclui `suggestion`: o nome do schema mais próximo (comparação normalizada: minúsculas, sem `_` e `-`; se igual, é sugestão; senão, distância de Levenshtein <= 2). Sem candidato, sem `suggestion`.
3. Se o schema pede `array` e chega um valor único (string ou número), converta para `[valor]` antes da validação de itens.
4. `script_id` que começa com `script_` perde o prefixo antes da busca no registry (só se o id sem prefixo existir).
5. Não criar biblioteca de distância; implemente Levenshtein simples em `param-validator.ts`.

**Passos**
- **4.1 Issue unknown_param:** objetivo: `validate` gera uma issue para cada `strippedKeys` (exceto `max_output`), com `suggestion` (regra 2).
  1. Adicione `"unknown_param"` ao union de códigos de `ValidationIssue` em script-types.ts e o campo opcional `suggestion?: string`.
  2. Em param-validator.ts, após calcular `strippedKeys`, gere as issues. Mantenha `strippedKeys` no retorno.
  - Verificação: `npm run typecheck` → sem erros.
- **4.2 Recusar no coordenador:** objetivo: o coordenador lança `ScriptValidationError` quando há issue `unknown_param`, antes de criar o processo.
  1. Em execution-coordinator.ts, no ponto em que `validate` é chamado, se `issues.length > 0`, lance `ScriptValidationError` (o fluxo de erro atual já cobre isso; confirme e não duplique).
  - Verificação: `npm run typecheck`.
- **4.3 Valor único em lista:** objetivo: regra 3 no próprio validator, antes do bloco de array.
  - Verificação: `npm run typecheck`.
- **4.4 Prefixo script_ e sugestão de id:** objetivo: `ScriptRegistry.get` remove `script_` quando o id original não existe; `ScriptNotFoundError` (em execution-coordinator.ts) recebe o id mais próximo e o mostra na mensagem.
  - Verificação: `npm run typecheck`.
- **4.5 Testes:** (a) `dryrun` gera unknown_param com suggestion `dry_run`; (b) `max_output` não gera issue; (c) `tickets: "ATL-1"` vira `["ATL-1"]`; (d) `script_foo` encontra `foo`; (e) `strippedKeys` continua preenchido. Verifique: `npm test -- param-validator script-runner`.

**BDD (estado esperado ao concluir)**
- Dado um script com `dry_run` e a chamada com `dryrun: true`, Quando a execução é pedida, Então a resposta é erro 400 com issue `unknown_param` e `suggestion: "dry_run"`, e nenhum processo é criado.
- Dado a chamada com `max_output: 500` e schema sem `max_output`, Quando validada, Então não há issue.
- Dado schema `tickets` do tipo array e valor `"ATL-1"`, Quando validado, Então `normalizedParams.tickets` é `["ATL-1"]`.
- Dado script_id `script_foo` onde existe só `foo`, Quando buscado, Então é encontrado.
- Dado script_id inexistente, Quando buscado, Então o erro traz o id mais próximo, se houver.
- Dado a suíte, Então nada pré-existente falha.

**Verificação** (em C:\Users\Trabalho\Documents\obsidian-ai-scripts)
- `npm run typecheck` → sem erros
- `npm test` → passa
- `npm run lint` → sem erros novos

**Prompt para o subagente**
```text
Você é um implementador de código TypeScript. Execute UMA etapa de um plano; não implemente nada além dela.

Contexto completo:
- Projeto: plugin do Obsidian "ai-scripts" (TypeScript, vitest, eslint). Raiz absoluta: C:\Users\Trabalho\Documents\obsidian-ai-scripts. Comentários e identificadores em inglês.
- Objetivo geral: parâmetro com nome errado é descartado em silêncio. Mandar `dryrun` no lugar de `dry_run` faz o script rodar de verdade (ex.: padronizar_cifras_drive renomeia arquivos no Drive). O validador já calcula `strippedKeys` mas ninguém o usa. A correção é recusar a execução com erro `unknown_param` e sugestão.
- Estado atual: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\validation\param-validator.ts, classe ParamValidator, método validate: calcula strippedKeys (~95-101) e devolve em ValidationResult (~209-214). C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts chama o validator em runDefinition e lança ScriptValidationError (classe no mesmo arquivo, ~25-32). C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-registry.ts: ScriptRegistry.get(scriptId) faz trim e busca no Map.
- Comandos: a partir de C:\Users\Trabalho\Documents\obsidian-ai-scripts: npm run typecheck, npm run lint, npm test. NÃO rode npm run deploy. Sem commit, push ou merge.

Regras:
1. Chave em params que não existe no schema vira issue code "unknown_param", e a execução é recusada (ScriptValidationError, status 400) antes de criar processo. Exceção: max_output nunca é desconhecido (é parâmetro reservado da chamada).
2. A issue tem suggestion: o nome do schema mais próximo. Comparação normalizada (minúsculas, sem "_" e "-"); igual = sugestão; senão Levenshtein <= 2. Sem candidato, sem suggestion. Implemente Levenshtein simples no próprio arquivo, sem biblioteca.
3. Schema do tipo array + valor único (string ou número) vira [valor] antes da validação dos itens.
4. script_id com prefixo "script_": se o id sem o prefixo existir, use-o. Em ScriptNotFoundError, inclua o id mais próximo na mensagem.
5. Mantenha strippedKeys no retorno.
6. Não altere dynamic-tool-factory.ts (a formatação do erro é a próxima etapa).

Arquivos:
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\types\script-types.ts (código unknown_param e campo suggestion em ValidationIssue)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\validation\param-validator.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-registry.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\validation\param-validator.test.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\execution\script-runner.test.ts
- Leia antes os testes existentes para seguir o estilo.

Passos, em ordem:
4.1 script-types.ts: adicione "unknown_param" ao union de códigos e suggestion?: string em ValidationIssue. param-validator.ts: gere uma issue por chave em strippedKeys (exceto max_output) com suggestion (regra 2). Verifique: npm run typecheck.
4.2 execution-coordinator.ts: onde validate é chamado, se houver issue, lance ScriptValidationError antes de criar processo. Confirme o fluxo atual e não duplique. Verifique: npm run typecheck.
4.3 param-validator.ts: regra 3. Verifique: npm run typecheck.
4.4 script-registry.ts: get remove "script_" quando o id original não existe. execution-coordinator.ts: ScriptNotFoundError inclui o id mais próximo na mensagem. Verifique: npm run typecheck.
4.5 Testes: (a) "dryrun" gera unknown_param com suggestion "dry_run"; (b) max_output não gera issue; (c) "tickets": "ATL-1" vira ["ATL-1"]; (d) script_foo acha foo; (e) strippedKeys preenchido. Verifique: npm test -- param-validator script-runner.

Critérios (BDD):
- Dado script com dry_run e chamada com dryrun: true, Quando a execução é pedida, Então erro 400 com issue unknown_param, suggestion "dry_run", e nenhum processo criado.
- Dado max_output: 500 e schema sem max_output, Quando validado, Então sem issue.
- Dado array tickets e valor "ATL-1", Quando validado, Então normalizedParams.tickets é ["ATL-1"].
- Dado script_foo existindo como foo, Quando buscado, Então encontrado.
- Dado id inexistente, Quando buscado, Então a mensagem traz o id mais próximo, se houver.
- Dado a suíte, Então nada pré-existente falha.

Verificação final (em C:\Users\Trabalho\Documents\obsidian-ai-scripts): npm run typecheck; npm test; npm run lint.

Se algo não bater (assinatura diferente, validate chamado de outro jeito), PARE e relate o desvio sem improvisar.

Relatório final: arquivos alterados com caminho absoluto; saída real de cada comando; desvios e dúvidas.
```

## Etapa 5: Erro de validação compacto com expected e example [Haiku 5.5 | esforço: médio]

**Objetivo:** o erro de validação sai uma única vez, como JSON compacto `{error, expected, example}`, sem repetir mensagens no texto e no `structuredContent`.
**Depende de:** Etapa 4
**Paralelizável com:** nenhuma

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\dynamic-tool-factory.ts` (`formatToolError`, ramo `ScriptValidationError`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts` (`ScriptValidationError`: a mensagem não repete o que vai em `issues`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts` (função pública para montar o texto `expected` a partir de `params`, junto de `buildExampleParams`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\execution\payload-formatter.test.ts` ou criar casos em `script-runner.test.ts`
- Não tocar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts` (ramo REST de erro fica como está).

**Regras de implementação**
1. O erro de validação é um único bloco de texto JSON compacto (sem indentação) e NÃO vem mais em `structuredContent`. Mantém `isError: true`.
2. Formato: `{"error": "<mensagem curta>", "expected": "<lista>", "example": {...}, "issues": [{"param": "...", "code": "..."}]}`.
3. `expected` é uma string: cada parâmetro como `nome*:tipo` (asterisco se obrigatório), separados por ", ". Ex.: `projeto*:string, dry_run?:boolean`.
4. `example` vem de `buildExampleParams(script.params)`, que já existe em schema-parser.ts.
5. Mensagem de `ScriptValidationError.message` fica curta: o primeiro issue, sem concatenar todos.

**Passos**
- **5.1 Montar expected:** objetivo: função pura `buildExpectedSignature(params)` em schema-parser.ts. Verifique: `npm run typecheck`.
- **5.2 Mensagem curta:** objetivo: `ScriptValidationError` usa `issues[0].message` (ou "Invalid parameters." se vazio). Verifique: `npm run typecheck`.
- **5.3 Formato único:** objetivo: `formatToolError` no ramo `ScriptValidationError` devolve só `content` (texto JSON compacto) com as chaves da regra 2, sem `structuredContent`.
  - Verificação: `npm run typecheck`.
- **5.4 Testes:** uma chamada com parâmetro faltando produz texto JSON com `error`, `expected` e `example`, e o objeto não tem `structuredContent`. Verifique: `npm test -- payload-formatter script-runner`.

**BDD (estado esperado ao concluir)**
- Dado script com `projeto` obrigatório (string) e `dry_run` opcional (boolean), Quando a chamada não traz `projeto`, Então o texto de erro é JSON com `expected` igual a `"projeto*:string, dry_run?:boolean"` e um campo `example`.
- Dado o erro de validação, Quando formatado, Então o resultado NÃO tem `structuredContent` e o texto aparece uma vez só (sem a mesma mensagem repetida).
- Dado o erro de script não encontrado, Quando formatado, Então o formato antigo continua (status 404 e available_scripts).
- Dado a suíte, Então nada pré-existente falha.

**Verificação** (em C:\Users\Trabalho\Documents\obsidian-ai-scripts)
- `npm run typecheck` → sem erros
- `npm test` → passa
- `npm run lint` → sem erros novos

**Prompt para o subagente**
```text
Você é um implementador de código TypeScript. Execute UMA etapa de um plano; não implemente nada além dela.

Contexto completo:
- Projeto: plugin do Obsidian "ai-scripts" (TypeScript, vitest, eslint). Raiz absoluta: C:\Users\Trabalho\Documents\obsidian-ai-scripts. Comentários e identificadores em inglês.
- Objetivo geral: reduzir tokens e o número de tentativas do agente. Hoje o erro de validação sai com a mesma informação duas vezes (no texto e em structuredContent), não mostra os parâmetros esperados e não traz exemplo.
- Estado atual: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\dynamic-tool-factory.ts, função formatToolError: para ScriptValidationError devolve content com JSON indentado E structuredContent. C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts: ScriptValidationError concatena as mensagens de todos os issues no message. C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts exporta buildExampleParams(params).
- Comandos: a partir de C:\Users\Trabalho\Documents\obsidian-ai-scripts: npm run typecheck, npm run lint, npm test. NÃO rode npm run deploy. Sem commit, push ou merge.

Regras:
1. O erro de validação vira um único texto JSON compacto (JSON.stringify sem indentação), com isError: true, e NÃO tem structuredContent.
2. Formato: {"error": "<mensagem curta>", "expected": "<assinatura>", "example": {...}, "issues": [{"param": "...", "code": "..."}]}.
3. expected: cada parâmetro como nome*:tipo (asterisco se obrigatório), separados por ", ". Ex.: "projeto*:string, dry_run?:boolean".
4. example: buildExampleParams(script.params).
5. ScriptValidationError.message: só a primeira mensagem de issue (ou "Invalid parameters." se não houver).
6. Não altere o ramo REST de erro em scripts-mcp-tools.ts. Não altere o ramo de ScriptNotFoundError.

Arquivos:
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\dynamic-tool-factory.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\schema-parser.ts (função nova buildExpectedSignature, exportada)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\execution\payload-formatter.test.ts (ou script-runner.test.ts, o que tiver o estilo mais próximo de testes de erro). Leia antes.

Passos, em ordem:
5.1 schema-parser.ts: buildExpectedSignature(params) devolve a string da regra 3. Verifique: npm run typecheck.
5.2 execution-coordinator.ts: mensagem curta (regra 5). Verifique: npm run typecheck.
5.3 dynamic-tool-factory.ts: formatToolError no ramo ScriptValidationError devolve só content (regra 1 e 2). Verifique: npm run typecheck.
5.4 Testes: parâmetro obrigatório ausente gera texto JSON com error, expected "projeto*:string, dry_run?:boolean" (para um schema com esses dois) e example; objeto retornado sem structuredContent. Verifique: npm test -- payload-formatter script-runner.

Critérios (BDD):
- Dado um script com projeto obrigatório string e dry_run opcional boolean, Quando a chamada não traz projeto, Então o texto é JSON com expected "projeto*:string, dry_run?:boolean" e campo example.
- Dado o erro de validação, Quando formatado, Então o resultado não tem structuredContent.
- Dado script não encontrado, Então o formato continua o mesmo (status 404, available_scripts).
- Dado a suíte, Então nada pré-existente falha.

Verificação final (em C:\Users\Trabalho\Documents\obsidian-ai-scripts): npm run typecheck; npm test; npm run lint.

Se algo não bater, PARE e relate o desvio sem improvisar.

Relatório final: arquivos alterados com caminho absoluto; saída real de cada comando; desvios e dúvidas.
```

## Etapa 6: Superfície MCP enxuta, sem tools dinâmicas e com instruções corretas [Haiku 5.5 | esforço: alto]

**Objetivo:** `list_ai_scripts` devolve uma resposta curta por padrão (com `detalhe: true` para o resto), não lista scripts `oculto`, o modo completo deixa de registrar uma tool `script_<id>` por script e as instruções do módulo deixam de citar pasta e tools erradas.
**Depende de:** Etapa 5
**Paralelizável com:** nenhuma

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts` (`MODULE_INSTRUCTIONS`, `listScripts`, handler de `list_ai_scripts`, `buildAllTools`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\dynamic-tool-factory.ts` (`buildDedicatedScriptTool`: retirar a linha de metadados "Category | Runtime | Input mode" da descrição; `buildDynamicTools` deixa de ser usado no modo completo)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-registry.ts` (`toScriptSummary` e `listSummaries` aceitam o modo curto)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts` (somente se `buildAllTools` mudar de assinatura; linha ~132)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\tools\tool-index.test.ts`, `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\ecosystem\connector-and-lifecycle.test.ts`
- Não tocar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\tool-index.ts` (o índice continua com as entradas `script_<id>`; só o modo completo muda).

**Regras de implementação**
1. `list_ai_scripts` sem `detalhe` devolve, por script: `id`, `descricao` (até 100 caracteres), `categoria`, `obrigatorios` (lista de nomes). Campos que são iguais para todos (runtime, timeout, inputMode) NÃO vão na resposta curta.
2. `list_ai_scripts` com `detalhe: true` devolve o formato atual (`ScriptSummary`).
3. Scripts com `oculto: true` não aparecem em `list_ai_scripts` nem no índice. A execução por id continua funcionando (get_script_schema e run_ai_script).
4. `buildAllTools` devolve só as tools estáticas (`list_ai_scripts`, `get_script_schema`, `run_ai_script`). Nenhuma tool `script_<id>` é registrada no modo completo. Não apagar `buildDedicatedScriptTool` se houver outro uso; se não houver, remova-o junto com `buildDynamicTools`.
5. `MODULE_INSTRUCTIONS` vira texto curto e sem caminho fixo: "AI Scripts executa scripts da pasta configurada nas configurações do plugin. No modo indexado use tools_find com kind=script, depois tools_run com o id script_<id>. No modo completo use list_ai_scripts, get_script_schema e run_ai_script." Ajuste para o que de fato existe.
6. `DUPLICATE_MCP_SCRIPT_IDS` continua valendo para a montagem de `script_<id>` no índice.

**Passos**
- **6.1 list_ai_scripts curto e oculto:** objetivo: regras 1 a 3. Em `listScripts` e no handler, receba `detalhe` (booleano); filtre `oculto`.
  - Verificação: `npm run typecheck`.
- **6.2 Modo completo sem tools dinâmicas:** objetivo: regra 4. Em `buildAllTools`, retire `buildDynamicTools`. Ajuste o import e `main.ts` se preciso.
  - Verificação: `npm run typecheck`.
- **6.3 Descrição sem metadados repetidos e instruções:** objetivo: regras 5 e a retirada da linha "Category | Runtime | Input mode" em `dynamic-tool-factory.ts` (se a função continuar existindo para o índice, ajuste a descrição usada no índice em `tool-index.ts` apenas se estiver lá; não altere a entrada do índice além de remover essa linha).
  - Verificação: `npm run typecheck`.
- **6.4 Testes:** (a) listagem curta tem só os 4 campos e descrição de até 100 caracteres; (b) detalhe true devolve os campos completos; (c) script oculto não aparece; (d) buildAllTools devolve só as 3 tools estáticas. Verifique: `npm test -- tool-index connector-and-lifecycle`.

**BDD (estado esperado ao concluir)**
- Dado 3 scripts, um deles com oculto true, Quando list_ai_scripts é chamado sem detalhe, Então a resposta tem 2 scripts e cada um só com id, descricao, categoria e obrigatorios.
- Dado o mesmo chamado com detalhe true, Então cada script traz runtime, inputMode e timeoutSeconds.
- Dado o modo completo, Quando buildAllTools é chamado, Então o resultado tem exatamente as tools list_ai_scripts, get_script_schema e run_ai_script.
- Dado MODULE_INSTRUCTIONS, Quando lido, Então NÃO contém "Scripts/AI/" nem "Scripts/AI" e cita tools_find e tools_run.
- Dado a suíte, Então nada pré-existente falha.

**Verificação** (em C:\Users\Trabalho\Documents\obsidian-ai-scripts)
- `npm run typecheck` → sem erros
- `npm test` → passa
- `npm run lint` → sem erros novos

**Prompt para o subagente**
```text
Você é um implementador de código TypeScript. Execute UMA etapa de um plano; não implemente nada além dela.

Contexto completo:
- Projeto: plugin do Obsidian "ai-scripts" (TypeScript, vitest, eslint). Raiz absoluta: C:\Users\Trabalho\Documents\obsidian-ai-scripts. Comentários e identificadores em inglês.
- Objetivo geral: reduzir o custo de tokens da superfície MCP. Hoje list_ai_scripts devolve ~11 mil caracteres para 31 scripts (campos repetidos), o modo completo registra uma tool script_<id> por script (cada uma com metadados repetidos na descrição), e as instruções do módulo citam uma pasta e tools que não existem no modo indexado.
- Estado atual:
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts: MODULE_INSTRUCTIONS (linhas 14-17); ScriptsService.listScripts (chama registry.listSummaries); buildStaticTools (list_ai_scripts, get_script_schema, run_ai_script); buildAllTools (~226) = estáticas + buildDynamicTools.
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\dynamic-tool-factory.ts: buildDedicatedScriptTool (descrição com a linha "Category: ... | Runtime: ... | Input mode: ..."), buildDynamicTools (~148).
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-registry.ts: toScriptSummary (campos completos) e listSummaries.
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts (~132) chama buildAllTools.
  - O campo oculto já existe em ScriptDefinition (etapa 3).
- O índice (tools.db, arquivo tool-index.ts) NÃO muda nesta etapa.
- Comandos: a partir de C:\Users\Trabalho\Documents\obsidian-ai-scripts: npm run typecheck, npm run lint, npm test. NÃO rode npm run deploy. Sem commit, push ou merge.

Regras:
1. list_ai_scripts sem detalhe: para cada script só id, descricao (no máximo 100 caracteres), categoria e obrigatorios (lista de nomes). Sem runtime, timeout, inputMode.
2. Com detalhe: true, devolve o formato atual (ScriptSummary).
3. Scripts com oculto true não aparecem em list_ai_scripts. A execução por id continua funcionando.
4. buildAllTools devolve só as 3 tools estáticas. Remova o uso de buildDynamicTools no modo completo; remova a função se ficar sem uso.
5. MODULE_INSTRUCTIONS: texto curto, sem pasta fixa. Conteúdo: "AI Scripts executa scripts da pasta configurada nas configurações do plugin. No modo indexado, use tools_find com kind=script e depois tools_run com o id script_<id>. No modo completo, use list_ai_scripts, get_script_schema e run_ai_script." Não cite "Scripts/AI".
6. Na descrição das tools dinâmicas (dynamic-tool-factory.ts), remova a linha de metadados. Não altere a entrada do índice em tool-index.ts além disso.
7. Não altere tool-index.ts nem a assinatura de ScriptsServiceContract.

Arquivos:
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\dynamic-tool-factory.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-registry.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts (só se a assinatura de buildAllTools mudar)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\tools\tool-index.test.ts e C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\ecosystem\connector-and-lifecycle.test.ts (novos casos; leia antes o estilo)

Passos, em ordem:
6.1 list_ai_scripts: aceite detalhe (booleano) no inputSchema e no handler; filtre oculto; resposta curta por padrão (regra 1). Verifique: npm run typecheck.
6.2 buildAllTools: só estáticas (regra 4); ajuste main.ts se necessário. Verifique: npm run typecheck.
6.3 MODULE_INSTRUCTIONS (regra 5) e descrição das dinâmicas sem a linha de metadados (regra 6). Verifique: npm run typecheck.
6.4 Testes: (a) listagem curta tem id, descricao, categoria, obrigatorios e descricao com até 100 caracteres; (b) detalhe true traz runtime, inputMode, timeoutSeconds; (c) script oculto não aparece; (d) buildAllTools devolve exatamente list_ai_scripts, get_script_schema, run_ai_script; (e) MODULE_INSTRUCTIONS não contém "Scripts/AI". Verifique: npm test -- tool-index connector-and-lifecycle.

Critérios (BDD):
- Dado 3 scripts e um oculto, Quando list_ai_scripts é chamado sem detalhe, Então 2 scripts, cada um só com id, descricao, categoria e obrigatorios.
- Dado detalhe true, Então runtime, inputMode e timeoutSeconds aparecem.
- Dado o modo completo, Quando buildAllTools roda, Então exatamente as 3 tools estáticas.
- Dado MODULE_INSTRUCTIONS, Então não contém "Scripts/AI" e cita tools_find e tools_run.
- Dado a suíte, Então nada pré-existente falha.

Verificação final (em C:\Users\Trabalho\Documents\obsidian-ai-scripts): npm run typecheck; npm test; npm run lint.

Se algo não bater (buildDynamicTools usado em outro lugar que você não esperava), PARE e relate o desvio sem improvisar.

Relatório final: arquivos alterados com caminho absoluto; saída real de cada comando; desvios e dúvidas.
```

## Etapa 7: Cancelamento real e status de timeout [Haiku 5.5 | esforço: alto]

**Objetivo:** Esc ou desconexão do agente interrompe o processo do script (o sinal chega do handler até o bridge), e um estouro de tempo vira status `timeout` com o tempo usado, em vez de `cancelled`. O `timeout_seconds` opcional limita a execução e o fallback local respeita o teto de 300 s.
**Depende de:** Etapa 6
**Paralelizável com:** nenhuma

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts` (`ScriptsService.runScript` aceita `signal`; handler de `run_ai_script` repassa `ctx.signal`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\dynamic-tool-factory.ts` (`runScriptDefinition` aceita e repassa `signal`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\tool-index.ts` (`ScriptToolRunner.run` repassa `ctx.signal`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts` (`RunOptions` ganha `signal`; `runDefinition` liga o sinal ao `AbortController`; status `timeout`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\process-bridge.ts` (marca estouro de tempo com `timedOut`; teto de 300 s no fallback)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\types\execution-types.ts` (status `timeout`; campo `timeoutSeconds` na resposta quando aplicável)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\types\script-types.ts` ou `src\types\execution-types.ts` (campo `timedOut` em `ScriptExecutionResult`, onde ele estiver definido)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\ui\components\active-run-card.ts` e `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\ui\components\history-run-card.ts` (mostrar o status `timeout`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\i18n.ts` (chave nova para o status timeout, pt e en)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\execution\script-runner.test.ts`
- Não tocar: `C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\**`.

**Regras de implementação**
1. Sinal de cancelamento: o `signal` do handler (`ctx.signal`) é ligado ao `AbortController` criado em `runDefinition`. Quando ele aborta, o controlador também aborta, e o bridge já mata a árvore de processos (não reimplementar).
2. Cancelamento pelo agente: status `cancelled`. Estouro de tempo: status `timeout`. Não confundir os dois: o timer do bridge marca `timedOut = true` antes de matar.
3. A resposta de execução com `timeout` inclui `durationMs` e `timeoutSeconds` (valor efetivo).
4. `timeout_seconds` opcional, inteiro entre 1 e 3600, entra no `inputSchema` de `run_ai_script` e é repassado como `timeoutSecondsOverride` (o coordenador já tem esse parâmetro). Valor fora da faixa: erro 400.
5. Fallback local (`runViaLocalSpawn`): o tempo efetivo é `min(timeoutSeconds, 300)`. Use a constante `MAX_LOCAL_TIMEOUT_SECONDS = 300` com comentário dizendo que espelha o teto padrão do AI Ecosystem; se o efetivo for menor que o pedido, o registro guarda um aviso em `stderr` ou em campo `notice` da resposta (escolha um e documente).
6. Não mudar `runViaEcosystem` além de repassar o sinal que já recebe.

**Passos**
- **7.1 Sinal de ponta a ponta:** objetivo: `ctx.signal` chega ao coordenador. Em `scripts-mcp-tools.ts`, `dynamic-tool-factory.ts`, `tool-index.ts`, repasse o `signal`. Em `execution-coordinator.ts`, `RunOptions` e `runDefinition` aceitam `signal`; ao criar o `AbortController` (~265), adicione `signal.addEventListener("abort", () => controller.abort(), { once: true })` e remova o listener ao terminar. Se já estiver aborto, aborte de imediato.
  - Verificação: `npm run typecheck`.
- **7.2 Timeout no bridge:** objetivo: `timedOut`. Em `process-bridge.ts`, no timer (~449), marque `timedOut = true` antes de chamar `killProc()`; inclua `timedOut` no resultado de `finish`. Em `runViaEcosystem`, mantenha o comportamento e propague `timedOut` se o runner informar (se não informar, deixe `false`).
  - Verificação: `npm run typecheck`.
- **7.3 Teto no fallback:** objetivo: regra 5.
  - Verificação: `npm run typecheck`.
- **7.4 Status e resposta:** objetivo: `ExecutionRecord.status` aceita `timeout`; coordenador define `timeout` quando `timedOut` e `cancelled` quando abortado pelo agente; `buildRunPayload` inclui `timeoutSeconds` quando `timeout`. `timeout_seconds` do `run_ai_script` (regra 4).
  - Verificação: `npm run typecheck`.
- **7.5 UI e i18n:** objetivo: os cartões de execução mostram `timeout` com texto traduzido. Adicione a chave em `i18n.ts` (pt e en) e use `t(...)` nos cartões.
  - Verificação: `npm run typecheck` e `npm run lint`.
- **7.6 Testes:** (a) sinal abortado mata o processo (use o spawn mockado existente) e o status é cancelled; (b) timeout de 1 s com processo que não termina vira timeout, com durationMs; (c) timeout_seconds 9999 é recusado; (d) fallback com pedido de 3600 usa 300. Verifique: `npm test -- script-runner`.

**BDD (estado esperado ao concluir)**
- Dado uma execução em andamento, Quando o signal do handler aborta, Então o processo é morto e o status final é `cancelled`.
- Dado um script que dorme além do tempo, Quando o timeout de 1 s estoura, Então o status é `timeout` e a resposta traz `durationMs` e `timeoutSeconds: 1`.
- Dado `timeout_seconds: 9999`, Quando run_ai_script é chamado, Então erro 400 sem processo criado.
- Dado o fallback local com timeout de 3600, Quando executa, Então o tempo efetivo é 300 s.
- Dado a suíte, Então nada pré-existente falha.

**Verificação** (em C:\Users\Trabalho\Documents\obsidian-ai-scripts)
- `npm run typecheck` → sem erros
- `npm test` → passa
- `npm run lint` → sem erros novos

**Prompt para o subagente**
```text
Você é um implementador de código TypeScript. Execute UMA etapa de um plano; não implemente nada além dela.

Contexto completo:
- Projeto: plugin do Obsidian "ai-scripts" (TypeScript, vitest, eslint). Raiz absoluta: C:\Users\Trabalho\Documents\obsidian-ai-scripts. Comentários e identificadores em inglês.
- Objetivo geral: duas falhas. (1) Esc ou desconexão do agente não mata o processo do script, que segue até o timeout (execução órfã). (2) Estouro de tempo aparece como "cancelled", e scripts longos morrem aos 120 s sem diagnóstico; o fallback local ignora o teto de 300 s.
- Estado atual:
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\ecosystem\types.ts: HubCallContext tem signal?: AbortSignal (linhas 78-85), mas os handlers não o usam.
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts: runDefinition cria seu próprio AbortController (~265) que não recebe o sinal do chamador. Status final: controller.signal.aborted || execResult.killed vira cancelled (~376). RunOptions tem maxOutput; há timeoutSecondsOverride (~191).
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\process-bridge.ts: execute já aceita signal e o usa (runViaEcosystem e runViaLocalSpawn com onAbort que mata a árvore). O timer (~449) chama killProc() sem marcar estouro de tempo.
  - Tipos de execução em C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\types\execution-types.ts. ScriptExecutionResult fica no bridge ou em tipos (confira com busca).
- Não altere nada em C:\Users\Trabalho\Documents\obsidian-ai-ecosystem (outro repositório).
- Comandos: a partir de C:\Users\Trabalho\Documents\obsidian-ai-scripts: npm run typecheck, npm run lint, npm test. NÃO rode npm run deploy. Sem commit, push ou merge.

Regras:
1. ctx.signal chega ao AbortController de runDefinition. Quando o sinal aborta, o controlador aborta; o bridge mata a árvore de processos (não reimplementar kill).
2. Cancelamento pelo agente: status "cancelled". Estouro de tempo: status "timeout". O timer marca timedOut = true antes de matar.
3. Resposta com timeout: inclui durationMs e timeoutSeconds (efetivo).
4. timeout_seconds opcional no inputSchema de run_ai_script (inteiro 1 a 3600, fora da faixa = 400). Repassado como timeoutSecondsOverride.
5. Fallback local: tempo efetivo = min(pedido, 300). Constante MAX_LOCAL_TIMEOUT_SECONDS = 300 com comentário dizendo que espelha o teto padrão do AI Ecosystem. Se o efetivo for menor que o pedido, informe isso num campo "notice" da resposta (documente a escolha).
6. Não mude runViaEcosystem além de repassar o sinal.
7. Cards de UI (active-run-card.ts, history-run-card.ts): mostrar "timeout" com texto de i18n.ts (chave nova, pt e en).

Arquivos:
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\dynamic-tool-factory.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\tool-index.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\process-bridge.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\types\execution-types.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\ui\components\active-run-card.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\ui\components\history-run-card.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\i18n.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\execution\script-runner.test.ts

Passos, em ordem:
7.1 Sinal de ponta a ponta: repasse signal nos handlers (scripts-mcp-tools.ts, dynamic-tool-factory.ts, tool-index.ts) até runDefinition; em runDefinition, ligue signal ao AbortController e remova o listener no fim. Verifique: npm run typecheck.
7.2 process-bridge.ts: timer marca timedOut = true antes de killProc(); finish inclui timedOut. Verifique: npm run typecheck.
7.3 Teto no fallback (regra 5). Verifique: npm run typecheck.
7.4 Status "timeout" em execution-types e coordenador; buildRunPayload inclui timeoutSeconds quando timeout; timeout_seconds em run_ai_script (regra 4). Verifique: npm run typecheck.
7.5 Cards e i18n (regra 7). Verifique: npm run typecheck e npm run lint.
7.6 Testes em script-runner.test.ts: (a) abortar o signal mata o processo (spawn mockado) e status é cancelled; (b) timeout de 1 s com processo que não termina vira timeout com durationMs; (c) timeout_seconds 9999 recusado; (d) pedido de 3600 no fallback usa 300. Verifique: npm test -- script-runner.

Critérios (BDD):
- Dado execução em andamento, Quando o signal aborta, Então o processo é morto e o status é cancelled.
- Dado timeout de 1 s com processo que não termina, Então status timeout, durationMs presente, timeoutSeconds 1.
- Dado timeout_seconds 9999, Então erro 400 e nenhum processo.
- Dado fallback com 3600, Então o efetivo é 300.
- Dado a suíte, Então nada pré-existente falha.

Verificação final (em C:\Users\Trabalho\Documents\obsidian-ai-scripts): npm run typecheck; npm test; npm run lint.

Se algo não bater (ScriptExecutionResult em outro lugar, spawn mockado com outra forma), PARE e relate o desvio sem improvisar.

Relatório final: arquivos alterados com caminho absoluto; saída real de cada comando; desvios e dúvidas.
```

## Etapa 8: Redação, spill, teto de saída e histórico limitado [Haiku 5.5 | esforço: alto]

**Objetivo:** segredo nunca vaza por ter sido partido entre dois pedaços; o spill da rota REST vai para a pasta de execuções do cofre (`.cache/runs`) com teto de saída; o histórico guarda registros aparados e `/runs` devolve só o resumo.
**Depende de:** Etapa 7
**Paralelizável com:** nenhuma

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\process-bridge.ts` (remover a redação por pedaço do caminho que vai ao coordenador; manter o `redact` de cada pedaço só para o monitor ao vivo, se necessário)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts` (redação com janela deslizante no `appendStream`; registro aparado no histórico; `getRunsDir` ligado pelo construtor)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\output-limiter.ts` (constante `HISTORY_RECORD_MAX_BYTES = 200 * 1024`; helper de aparar)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts` (rota `POST /scripts/:id/run` aceita `max_output` com o mesmo teto de 4000; `GET /runs` devolve resumo)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts` (passa `getRunsDir` ao criar o `ExecutionCoordinator`, apontando para `<vaultBase>/.cache/runs`)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\execution\script-runner.test.ts`, `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\execution\payload-formatter.test.ts`
- Não tocar: a política de execução em `C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\**`.

**Regras de implementação**
1. A redação acontece UMA vez, no coordenador, sobre texto já concatenado por uma janela deslizante: guarde o final bruto do que já foi emitido (ex.: últimos 512 caracteres) e redija `janela + novo_pedaço`, emitindo só a parte nova. Assim um segredo partido entre dois pedaços é redigido.
2. O arquivo de spill (`SpillFile`) recebe o texto já redigido. Não redija duas vezes (remova o `redact` do bridge no caminho que alimenta o coordenador).
3. `getRunsDir` aponta para `<caminho absoluto do cofre>\.cache\runs`. Se o `.cache` não existir, crie (com `mkdir recursive`). Confirme o padrão de `.cache/runs` lendo a referência de runs já usada no código (busque por "runs" em `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src`); se o padrão divergir, pare e relate.
4. Rota REST `POST /scripts/:id/run` aceita `max_output` (no corpo ou query), padrão 4000, mesmo teto da MCP; passa `maxOutput` ao coordenador.
5. Histórico: ao terminar uma execução com spill, o registro guardado em memória tem `stdout` e `stderr` aparados para no máximo 200 KB cada (mantendo início e fim com `truncateHeadTail`) e no máximo 2000 linhas em `lines`. O monitor ao vivo continua recebendo tudo durante a execução.
6. `GET /runs` (lista de histórico) devolve resumo: runId, scriptId, status, durationMs, exitCode, startedAt. O detalhe completo continua via `GET /runs/:runId` se a rota existir; se não existir, não crie.
7. Não criar dependências. Usar `node:fs` e `node:path` já importados.

**Passos**
- **8.1 Redação com janela:** objetivo: regra 1 e 2. Em `execution-coordinator.ts`, no `appendStream` (~291-300), mantenha por stream uma janela bruta (últimos 512 caracteres emitidos), redija `janela + chunk`, emita a parte nova para `record`, linhas e spill. Remova a redação duplicada no `process-bridge.ts`, nos caminhos que alimentam o coordenador (`emitLines` e o `onStdout` de `runViaEcosystem`). Verifique: `npm run typecheck`.
- **8.2 Histórico aparado:** objetivo: regra 5 em `output-limiter.ts` (constante e helper) e em `execution-coordinator.ts` no `finalizeRecord`. Verifique: `npm run typecheck`.
- **8.3 getRunsDir e REST:** objetivo: regras 3 e 4. Em `main.ts`, ao criar o coordenador, passe `getRunsDir`. Em `scripts-mcp-tools.ts`, a rota POST aceita max_output e passa `maxOutput`. Verifique: `npm run typecheck`.
- **8.4 Resumo em /runs:** objetivo: regra 6. Verifique: `npm run typecheck`.
- **8.5 Testes:** (a) um segredo partido em dois pedaços ("sk-AB" + "CD123") aparece redigido no `record` final; (b) o histórico de uma execução com 1 MB de saída guarda no máximo 200 KB; (c) a rota POST com max_output 500 devolve no máximo 500 caracteres de stdout e um `stdout_file`; (d) `/runs` devolve só resumo. Use o redator existente nos testes (leia como o `secrets` é mockado em `tests\execution\script-runner.test.ts`). Verifique: `npm test -- script-runner payload-formatter`.

**BDD (estado esperado ao concluir)**
- Dado um segredo partido em dois pedaços de saída, Quando a execução termina, Então o texto final não contém o segredo completo.
- Dado uma execução com 1 MB de stdout, Quando termina, Então o registro em memória guarda no máximo 200 KB de stdout e o arquivo de spill tem o total.
- Dado a rota POST /scripts/:id/run com max_output 500, Quando a saída é grande, Então a resposta tem no máximo 500 caracteres de stdout e `stdout_file`.
- Dado GET /runs, Quando chamado, Então cada item tem só o resumo (sem stdout nem lines).
- Dado a suíte, Então nada pré-existente falha.

**Verificação** (em C:\Users\Trabalho\Documents\obsidian-ai-scripts)
- `npm run typecheck` → sem erros
- `npm test` → passa
- `npm run lint` → sem erros novos

**Prompt para o subagente**
```text
Você é um implementador de código TypeScript. Execute UMA etapa de um plano; não implemente nada além dela.

Contexto completo:
- Projeto: plugin do Obsidian "ai-scripts" (TypeScript, vitest, eslint). Raiz absoluta: C:\Users\Trabalho\Documents\obsidian-ai-scripts. Comentários e identificadores em inglês.
- Objetivo geral: quatro falhas de saída e memória. (1) A redação de segredo é feita por pedaço de saída: um segredo cortado entre dois pedaços escapa, e cada pedaço é redigido duas vezes (no bridge e no coordenador). (2) A rota REST de execução não tem teto de saída e o spill vai para a pasta temporária do sistema, não para o cofre. (3) O histórico guarda até 100 execuções com buffers de até 5 MB por stream. (4) /runs devolve tudo.
- Estado atual:
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\process-bridge.ts: redact(texto) (~135); emitLines (~370); onStdout de runViaEcosystem (~215-230).
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts: appendStream (~291-300) redige cada pedaço; spillFor usa this.deps.getRunsDir?.() ou os.tmpdir(); finishOutput (~330); finalizeRecord; MAX_RECORD_LINES = 20000 (~27).
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\output-limiter.ts: DEFAULT_MAX_OUTPUT = 4000, MEMORY_BUFFER_CAP = 5 MB, truncateHeadTail, appendCapped, SpillFile, pruneSpillDir.
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts: cria ExecutionCoordinator sem getRunsDir (confirme com busca por "new ExecutionCoordinator").
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts: buildRoutes, POST /scripts/:id/run (~300) sem maxOutput; GET /runs.
- Não altere C:\Users\Trabalho\Documents\obsidian-ai-ecosystem (outro repositório).
- Comandos: a partir de C:\Users\Trabalho\Documents\obsidian-ai-scripts: npm run typecheck, npm run lint, npm test. NÃO rode npm run deploy. Sem commit, push ou merge.

Regras:
1. Redação uma vez, no coordenador, com janela deslizante: guarde os últimos 512 caracteres brutos já emitidos por stream; redija (janela + novo pedaço), emita só a parte nova. Remova a redação dos pedaços do bridge nos caminhos que alimentam o coordenador.
2. O spill recebe texto já redigido.
3. getRunsDir: <cofre>\.cache\runs. Antes de codar, confirme o padrão: procure "runs" e ".cache" em C:\Users\Trabalho\Documents\obsidian-ai-scripts\src. Se não houver padrão, pare e relate. Crie a pasta com mkdir recursive.
4. Rota POST /scripts/:id/run aceita max_output (corpo ou query), padrão 4000, e passa maxOutput.
5. Histórico: registro finalizado guarda stdout e stderr aparados em 200 KB (truncateHeadTail) e no máximo 2000 linhas em lines. Monitor ao vivo recebe tudo durante a execução.
6. GET /runs devolve resumo: runId, scriptId, status, durationMs, exitCode, startedAt. Não crie rota de detalhe se não existir.
7. Sem dependências novas.

Arquivos:
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\process-bridge.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\output-limiter.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\tools\scripts-mcp-tools.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\execution\script-runner.test.ts e C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\execution\payload-formatter.test.ts

Passos, em ordem:
8.1 appendStream com janela (regra 1) e remoção da redação duplicada no bridge. Verifique: npm run typecheck.
8.2 Histórico aparado (regra 5) em output-limiter.ts e finalizeRecord. Verifique: npm run typecheck.
8.3 getRunsDir em main.ts (regra 3) e max_output na rota POST (regra 4). Verifique: npm run typecheck.
8.4 GET /runs resumo (regra 6). Verifique: npm run typecheck.
8.5 Testes: (a) segredo partido em dois pedaços ("sk-AB" + "CD123") não aparece completo no record final; (b) 1 MB de stdout: registro guarda no máximo 200 KB; (c) POST com max_output 500 devolve no máximo 500 caracteres de stdout e stdout_file; (d) /runs devolve só resumo. Leia como o redator é mockado nos testes existentes. Verifique: npm test -- script-runner payload-formatter.

Critérios (BDD):
- Dado segredo partido em dois pedaços, Quando termina, Então o texto final não contém o segredo completo.
- Dado 1 MB de stdout, Quando termina, Então o registro em memória tem no máximo 200 KB, e o spill tem o total.
- Dado POST com max_output 500 e saída grande, Então stdout com no máximo 500 caracteres e stdout_file.
- Dado GET /runs, Então itens só com resumo.
- Dado a suíte, Então nada pré-existente falha.

Verificação final (em C:\Users\Trabalho\Documents\obsidian-ai-scripts): npm run typecheck; npm test; npm run lint.

Se algo não bater (padrão de .cache/runs não encontrado, construtor do coordenador diferente), PARE e relate o desvio sem improvisar.

Relatório final: arquivos alterados com caminho absoluto; saída real de cada comando; desvios e dúvidas.
```

## Etapa 9: Duplicidade de catálogo e instalação do starter pack [Haiku 5.5 | esforço: médio]

**Objetivo:** quando um mesmo `script_id` existir como nota `.md` e como arquivo de código, vence o arquivo de código (com aviso); e a primeira carga NÃO instala o starter pack quando a pasta de scripts já tem scripts.
**Depende de:** Etapa 8
**Paralelizável com:** nenhuma

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-loader.ts` (`readAll`: prioridade de código sobre nota, com aviso)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts` (`start()`: decide se instala o starter pack; função auxiliar pequena)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\types\script-types.ts` (sem mudança de default; só comentário se preciso)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\starter\starter-pack.test.ts`
- Não tocar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\starter\starter-notes.ts` (o conteúdo das notas do starter fica como está).
- Ações do usuário, fora deste plano: arquivar os catálogos antigos em `C:\Users\Trabalho\Documents\Cofre\scripts\` e gravar `installStarterPack: false` nas configurações do plugin no cofre (ver seção "Ações do usuário").

**Regras de implementação**
1. Colisão de `scriptId` entre nota `.md` e arquivo de código: o arquivo de código vence. A nota vira aviso (LoadProblem nível `warning`, mensagem em inglês: "The script_id X is also defined by a code file; the note was ignored.").
2. Colisão entre dois arquivos de código ou duas notas: mantém o comportamento atual (primeiro, com aviso).
3. Starter pack: na inicialização, se `installStarterPack` for true E a pasta de scripts já tiver qualquer arquivo de script (`listScriptFiles` não vazio) E `starterPackInstalledIds` estiver vazio, NÃO instale. Mostre um aviso (Notice) com `t("core.notice.starterSkipped")` (chave nova pt e en), e salve `installStarterPack: false` nas configurações.
4. Não mudar o conteúdo dos starters nem o default `installStarterPack: true` em `DEFAULT_SETTINGS`.

**Passos**
- **9.1 Prioridade de código:** objetivo: regra 1 e 2 em `script-loader.ts`, `readAll`. Antes do laço de duplicidade, processe primeiro os caminhos de código (`.py`, `.sh`, `.ps1`, `.js`, `.mjs`, `.ts`) e depois os `.md`, mantendo a ordem alfabética dentro de cada grupo. Assim o `seenIds` já tem o id do código quando a nota aparece, e a nota gera o aviso da regra 1.
  - Verificação: `npm run typecheck`.
- **9.2 Starter pack condicional:** objetivo: regra 3 em `main.ts`, no `start()`. Crie função auxiliar `folderHasScripts()` usando `this.vaultPort.listScriptFiles(folder)` (ou o equivalente, confirme o método do `ObsidianScriptVaultPort`). Adicione a chave de i18n em `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\i18n.ts`.
  - Verificação: `npm run typecheck` e `npm run lint`.
- **9.3 Testes:** (a) nota `.md` e código `.py` com o mesmo id: o código é carregado e a nota gera aviso; (b) `installStarterScripts` continua igual; (c) a regra 3 é testada como função pura se possível (extraia a decisão para uma função exportada `shouldSkipStarterPack(folderHasScripts, installedIds)` e teste-a). Verifique: `npm test -- starter-pack`.

**BDD (estado esperado ao concluir)**
- Dado uma nota `.md` e um `.py` com o mesmo script_id, Quando a carga roda, Então o registro vem do `.py` e existe um aviso sobre a nota.
- Dado uma pasta com scripts e installStarterPack true sem ids instalados, Quando a inicialização roda, Então nenhum starter é gravado e a configuração passa a false.
- Dado uma pasta vazia e installStarterPack true, Quando a inicialização roda, Então os starters são gravados (comportamento antigo).
- Dado a suíte, Então nada pré-existente falha.

**Verificação** (em C:\Users\Trabalho\Documents\obsidian-ai-scripts)
- `npm run typecheck` → sem erros
- `npm test` → passa
- `npm run lint` → sem erros novos

**Prompt para o subagente**
```text
Você é um implementador de código TypeScript. Execute UMA etapa de um plano; não implemente nada além dela.

Contexto completo:
- Projeto: plugin do Obsidian "ai-scripts" (TypeScript, vitest, eslint). Raiz absoluta: C:\Users\Trabalho\Documents\obsidian-ai-scripts. Comentários e identificadores em inglês; textos ao usuário via t("chave") de src\i18n.ts (pt e en).
- Objetivo geral: (1) há três catálogos concorrentes de scripts; quando um mesmo script_id existe como nota .md e como arquivo de código, a nota antiga pode passar na frente do cabeçalho do código. (2) Na primeira carga, o starter pack grava notas dentro da pasta de código do cofre, o que polui a pasta de scripts. Esta etapa resolve o código (prioridade e starter); a limpeza dos arquivos do cofre é ação do usuário.
- Estado atual:
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-loader.ts, ScriptLoader.readAll: percorre paths em ordem alfabética e usa seenIds (Map id→caminho) para ignorar duplicatas com aviso (LoadProblem warning). Não prioriza código.
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts, função start() (~258-266): if (this.settings.installStarterPack) chama this.installStarterPack(false). ObsidianScriptVaultPort (em script-loader.ts) tem listScriptFiles(folder).
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\starter\starter-pack.ts: installStarterScripts. Não mudar.
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\types\script-types.ts: DEFAULT_SETTINGS (installStarterPack: true; starterPackInstalledIds: []). Não mudar o default.
- Comandos: a partir de C:\Users\Trabalho\Documents\obsidian-ai-scripts: npm run typecheck, npm run lint, npm test. NÃO rode npm run deploy. Sem commit, push ou merge.
- Não mexa em arquivos do cofre (C:\Users\Trabalho\Documents\Cofre\**).

Regras:
1. Colisão de scriptId entre nota .md e arquivo de código: o código vence; a nota vira aviso (LoadProblem warning): "The script_id X is also defined by a code file; the note was ignored."
2. Colisão entre dois arquivos de código ou entre duas notas: comportamento atual (primeiro, com aviso).
3. Starter: se installStarterPack é true, starterPackInstalledIds está vazio e a pasta de scripts já tem arquivo de script, NÃO instale; mostre Notice com t("core.notice.starterSkipped") (chave nova, pt e en) e salve installStarterPack false. Extraia a decisão para função exportada shouldSkipStarterPack(folderHasScripts: boolean, installedIds: readonly string[]): boolean, e teste-a.
4. Não mudar o conteúdo dos starters nem DEFAULT_SETTINGS.

Arquivos:
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-loader.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\i18n.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\starter\starter-pack.ts (somente se a função de decisão ficar lá; preferível manter em starter-pack.ts)
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\starter\starter-pack.test.ts
- Leia antes o estilo dos testes e tests\mocks\obsidian.ts.

Passos, em ordem:
9.1 script-loader.ts readAll: processe primeiro os caminhos de código (.py, .sh, .ps1, .js, .mjs, .ts), depois os .md, mantendo a ordem alfabética em cada grupo. Aplique regras 1 e 2. Verifique: npm run typecheck.
9.2 starter-pack.ts: exporte shouldSkipStarterPack (regra 3). main.ts, em start(): calcule folderHasScripts com vaultPort.listScriptFiles da pasta configurada; se shouldSkipStarterPack for true, salve installStarterPack false (use o mecanismo de salvar settings que o plugin já tem; procure "saveSettings" em main.ts) e mostre Notice com t("core.notice.starterSkipped"). Adicione a chave em i18n.ts (pt e en). Verifique: npm run typecheck e npm run lint.
9.3 Testes: (a) nota e .py com o mesmo id: o código é carregado e há aviso sobre a nota; (b) shouldSkipStarterPack(true, []) true; shouldSkipStarterPack(false, []) false; shouldSkipStarterPack(true, ["x"]) false; (c) installStarterScripts continua igual. Verifique: npm test -- starter-pack.

Critérios (BDD):
- Dado .md e .py com o mesmo id, Quando a carga roda, Então o registro vem do .py e há aviso sobre a nota.
- Dado pasta com scripts, installStarterPack true e sem ids instalados, Quando a inicialização roda, Então nenhum starter é gravado e installStarterPack vira false.
- Dado pasta vazia e installStarterPack true, Então os starters são gravados (comportamento antigo).
- Dado a suíte, Então nada pré-existente falha.

Verificação final (em C:\Users\Trabalho\Documents\obsidian-ai-scripts): npm run typecheck; npm test; npm run lint.

Se algo não bater (método de salvar settings com outro nome, listScriptFiles ausente), PARE e relate o desvio sem improvisar.

Relatório final: arquivos alterados com caminho absoluto; saída real de cada comando; desvios e dúvidas.
```

## Etapa 10: Recarga do catálogo por conteúdo [Haiku 5.5 | esforço: médio]

**Objetivo:** só arquivos dentro da pasta de scripts disparam recarga; a recarga espera 500 ms de silêncio; e as listeners (registro no Inspector, índice `tools.db`, regras de hooks) só rodam quando o conteúdo do catálogo mudou (hash).
**Depende de:** Etapa 9
**Paralelizável com:** nenhuma

**Arquivos**
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts` (`registerVaultWatchers`, linhas ~404-418; `isScriptCandidateFile`, linha ~24)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-loader.ts` (`invalidate`, `load` com hash, `listeners` só quando muda)
- Alterar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\ecosystem\connector-and-lifecycle.test.ts` ou novo teste `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\scripts\script-loader.test.ts` (crie só se não houver teste do loader; confirme com busca antes)
- Não tocar: `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\**`.

**Regras de implementação**
1. Um evento do vault só conta se `file.path` começa com a pasta de scripts (comparação normalizada, minúsculas, como em `ObsidianScriptVaultPort.listScriptFiles`) OU se o caminho antigo (rename) estava nela.
2. Debounce de 500 ms: eventos seguidos reiniciam um único timer; ao disparar, chama `loader.invalidate()` e `loader.load()`. O timer é limpo no `onunload` (use `window.clearTimeout`/`setTimeout` do Obsidian ou o do Node, o que o código já usa).
3. O loader calcula um hash (SHA-256 via `node:crypto`, já usado em execution-coordinator.ts) da lista ordenada de `path + conteúdo`. Se o hash for igual ao da última carga, NÃO chama `registry.replaceAll` nem os listeners. O primeiro carregamento sempre notifica.
4. `invalidate()` continua existindo e não quebra quem o chama.
5. Não mudar a lógica de parsing.

**Passos**
- **10.1 Hash no loader:** objetivo: regra 3 em `script-loader.ts`. Guarde `lastHash`; em `load()`, após `readAll()`, calcule o hash; se igual, devolva o resultado sem notificar. Verifique: `npm run typecheck`.
- **10.2 Filtro e debounce no main.ts:** objetivo: regras 1 e 2 em `registerVaultWatchers`. Remova `isScriptCandidateFile` como critério único; use o filtro de pasta. Crie `reloadTimer` e agende `loader.invalidate(); void loader.load();` com 500 ms. Em `onunload`, limpe o timer. Verifique: `npm run typecheck` e `npm run lint`.
- **10.3 Testes:** (a) duas chamadas de load com o mesmo conteúdo: o listener é chamado só uma vez; (b) mudança de conteúdo dispara o listener de novo; (c) evento de arquivo fora da pasta não dispara a recarga (teste a função de filtro, extraída e exportada, ex.: `isInsideScriptsFolder(path, folder)`). Verifique: `npm test`.

**BDD (estado esperado ao concluir)**
- Dado um catálogo já carregado, Quando load é chamado de novo sem mudança de conteúdo, Então os listeners não são chamados de novo.
- Dado uma alteração de conteúdo de um script, Quando load roda, Então os listeners são chamados e o registro reflete a mudança.
- Dado uma nota .md fora da pasta de scripts sendo editada, Quando o evento chega, Então nenhuma recarga é agendada.
- Dado 5 eventos seguidos dentro da pasta em menos de 500 ms, Quando o tempo passa, Então há uma única recarga.
- Dado a suíte, Então nada pré-existente falha.

**Verificação** (em C:\Users\Trabalho\Documents\obsidian-ai-scripts)
- `npm run typecheck` → sem erros
- `npm test` → passa
- `npm run lint` → sem erros novos

**Prompt para o subagente**
```text
Você é um implementador de código TypeScript. Execute UMA etapa de um plano; não implemente nada além dela.

Contexto completo:
- Projeto: plugin do Obsidian "ai-scripts" (TypeScript, vitest, eslint). Raiz absoluta: C:\Users\Trabalho\Documents\obsidian-ai-scripts. Comentários e identificadores em inglês.
- Objetivo geral: qualquer .md, .py, .sh, .ps1, .js, .mjs ou .ts alterado no cofre, mesmo fora da pasta de scripts, dispara a releitura de todos os scripts, o novo registro das tools e a gravação no Inspector. A correção: filtrar por pasta, aplicar debounce de 500 ms e notificar só quando o conteúdo do catálogo muda (hash).
- Estado atual:
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts: isScriptCandidateFile (~24) testa só extensão; registerVaultWatchers (~404-418) chama this.loader.invalidate() e this.loader.load() em create, modify, delete, rename e metadataCache changed.
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-loader.ts: ScriptLoader com cache (Promise), invalidate() zera o cache, load() chama readAll() e, se for o cache atual, faz registry.replaceAll e notifica listeners (onLoaded). ObsidianScriptVaultPort.listScriptFiles(folder) faz o filtro por pasta (use a mesma regra de prefixo).
  - C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\execution\execution-coordinator.ts usa node:crypto (import * as crypto from "node:crypto"); use o mesmo padrão.
- Comandos: a partir de C:\Users\Trabalho\Documents\obsidian-ai-scripts: npm run typecheck, npm run lint, npm test. NÃO rode npm run deploy. Sem commit, push ou merge.

Regras:
1. Evento conta se file.path está dentro da pasta de scripts (prefixo normalizado, minúsculas, igual a listScriptFiles), OU se o caminho antigo do rename estava nela. Use uma função pura exportada isInsideScriptsFolder(path: string, folder: string, oldPath?: string): boolean.
2. Debounce de 500 ms: um único timer, reiniciado a cada evento; ao disparar, invalidate() e load(). Limpe o timer em onunload.
3. O loader guarda o hash (SHA-256 da lista ordenada de path + conteúdo). Se o hash for igual ao da última carga, não chama registry.replaceAll nem os listeners. A primeira carga sempre notifica.
4. invalidate() continua existindo.
5. Não mude o parsing.

Arquivos:
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\main.ts
- Alterar: C:\Users\Trabalho\Documents\obsidian-ai-scripts\src\scripts\script-loader.ts
- Teste: verifique antes com busca se já existe teste do loader em C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests. Se não existir, crie C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests\scripts\script-loader.test.ts seguindo o estilo de tests\validation\*.test.ts e o mock tests\mocks\obsidian.ts.

Passos, em ordem:
10.1 script-loader.ts: lastHash e cálculo do hash em load(); notifique só quando mudar (regra 3). Verifique: npm run typecheck.
10.2 main.ts: função isInsideScriptsFolder exportada (pode ficar em script-loader.ts e ser importada); registerVaultWatchers filtra por pasta e agenda o debounce de 500 ms; limpe o timer em onunload. Verifique: npm run typecheck e npm run lint.
10.3 Testes: (a) load duas vezes com o mesmo conteúdo: listener chamado uma vez; (b) conteúdo alterado: listener chamado de novo; (c) isInsideScriptsFolder: "Scripts/AI/a.py" true para folder "Scripts/AI"; "notas/x.md" false; rename de fora para dentro true por oldPath. Verifique: npm test.

Critérios (BDD):
- Dado catálogo carregado, Quando load roda sem mudança, Então listeners não são chamados.
- Dado mudança de conteúdo, Quando load roda, Então listeners são chamados e o registro reflete a mudança.
- Dado nota fora da pasta de scripts editada, Quando o evento chega, Então nenhuma recarga é agendada.
- Dado 5 eventos dentro da pasta em menos de 500 ms, Quando o tempo passa, Então uma única recarga.
- Dado a suíte, Então nada pré-existente falha.

Verificação final (em C:\Users\Trabalho\Documents\obsidian-ai-scripts): npm run typecheck; npm test; npm run lint.

Se algo não bater (pasta de scripts com formato diferente, timer API), PARE e relate o desvio sem improvisar.

Relatório final: arquivos alterados com caminho absoluto; saída real de cada comando; desvios e dúvidas.
```

## Etapa 11: Verificação geral [Haiku 5.5 | esforço: alto]

**Objetivo:** provar que o módulo inteiro compila, passa no lint e nos testes, e que cada critério BDD da seção 6 tem um teste ou uma leitura de código que o comprova.
**Depende de:** Etapa 10
**Paralelizável com:** nenhuma

**Arquivos**
- Não alterar código. Pode ler todos os arquivos de `C:\Users\Trabalho\Documents\obsidian-ai-scripts\src` e `C:\Users\Trabalho\Documents\obsidian-ai-scripts\tests`.
- Gera artefato de build em `C:\Users\Trabalho\Documents\obsidian-ai-scripts\main.js` (esperado pelo `npm run build`).
- Não tocar: qualquer arquivo. Se encontrar falha, relate; NÃO corrija.

**Regras de implementação**
1. Só rode comandos e leia arquivos. Não edite código, não edite testes, não faça commit.
2. Rode os comandos na ordem: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
3. Para cada um dos 17 itens da seção 4 do plano, confirme por leitura ou teste que a mudança existe no código (use busca e leitura de trecho).

**Passos**
- **11.1 Baseline de comandos:** rode os 4 comandos e cole a saída real.
  - Verificação: cada comando sai com código 0.
- **11.2 Conferência dos itens:** para cada item 1 a 17, cite o arquivo e a função onde a mudança está. Use a tabela da seção 4.
  - Verificação: 17 de 17 com arquivo e função citados.
- **11.3 Conferência dos BDD:** para cada cenário da seção 6, indique o teste (nome do arquivo e do caso) que o cobre ou o trecho de código que o garante.
  - Verificação: nenhum cenário sem prova.

**BDD (estado esperado ao concluir)**
- Dado o repositório, Quando `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` rodam, Então todos saem com código 0.
- Dado a seção 6 do plano, Quando cada cenário é conferido, Então há teste ou trecho de código que o comprova.

**Verificação** (em C:\Users\Trabalho\Documents\obsidian-ai-scripts)
- `npm run typecheck` → sem erros
- `npm run lint` → sem erros
- `npm test` → todos passam
- `npm run build` → gera main.js sem erros

**Prompt para o subagente**
```text
Você é um revisor de verificação. Não altere nenhum arquivo. Seu trabalho é rodar os comandos e conferir, com evidência, que as mudanças do plano estão no código.

Contexto completo:
- Projeto: plugin do Obsidian "ai-scripts" (TypeScript). Raiz absoluta: C:\Users\Trabalho\Documents\obsidian-ai-scripts.
- As etapas 1 a 10 já foram implementadas: corpo do schema, caminhos absolutos recusados, metadados do cabeçalho (efeito, aprovacao, oculto), parâmetros desconhecidos recusados, erro compacto, superfície MCP enxuta, cancelamento e timeout, redação e histórico, starter e duplicidade, recarga por conteúdo.
- Comandos oficiais, a partir de C:\Users\Trabalho\Documents\obsidian-ai-scripts: npm run typecheck, npm run lint, npm test, npm run build. NÃO rode npm run deploy.

Regras:
1. Não edite, crie nem apague arquivos de código ou de teste. Não faça commit, push ou merge.
2. Rode os comandos nesta ordem e cole a saída real (não resuma): npm run typecheck; npm run lint; npm test; npm run build.
3. Se algum comando falhar, pare e relate a saída completa do erro e o arquivo. NÃO corrija.
4. Para cada item abaixo, confirme por leitura ou busca que a mudança existe, e cite arquivo e função:
   1 corpo do schema (schema-parser.ts extractDocstringFrontmatter; scripts-mcp-tools.ts getScriptSchema)
   2 caminho absoluto recusado (schema-parser.ts; process-bridge.ts runViaLocalSpawn)
   3 metadados do cabeçalho (schema-parser.ts parseScriptNote; tool-index.ts buildScriptIndexEntries)
   4 parâmetros desconhecidos (param-validator.ts validate; execution-coordinator.ts)
   5 erro compacto (dynamic-tool-factory.ts formatToolError; schema-parser.ts buildExpectedSignature)
   6 superfície MCP (scripts-mcp-tools.ts buildAllTools, MODULE_INSTRUCTIONS, listScripts)
   7 cancelamento (execution-coordinator.ts runDefinition; process-bridge.ts timedOut)
   8 timeout (execution-types.ts status timeout; process-bridge.ts MAX_LOCAL_TIMEOUT_SECONDS)
   9 redação com janela (execution-coordinator.ts appendStream)
   10 spill REST e .cache/runs (main.ts getRunsDir; scripts-mcp-tools.ts POST run max_output)
   11 histórico aparado (output-limiter.ts constante; execution-coordinator.ts finalizeRecord)
   12 GET /runs resumo (scripts-mcp-tools.ts buildRoutes)
   13 starter condicional (starter-pack.ts shouldSkipStarterPack; main.ts start)
   14 prioridade de código (script-loader.ts readAll)
   15 recarga com debounce e hash (main.ts registerVaultWatchers; script-loader.ts load)
   16 instruções sem Scripts/AI (scripts-mcp-tools.ts MODULE_INSTRUCTIONS)
   17 ergonomia (param-validator.ts valor único em array; script-registry.ts get com prefixo script_)
5. Para cada cenário BDD que está no plano (Etapas 1 a 10 da seção 5), indique o teste (arquivo e nome do caso) que o cobre, ou o trecho de código que o garante.

Relatório final: (a) saída real dos 4 comandos; (b) tabela dos 17 itens com arquivo e função, marcando "não encontrado" quando for o caso; (c) lista de cenários BDD sem prova; (d) qualquer falha ou dúvida. Caminhos absolutos em tudo.
```

## 6. Critérios de aceite finais (BDD)
- Dado o repositório, Quando `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` rodam, Então todos saem com código 0.
- Dado um script com `dry_run` e a chamada com `dryrun: true`, Quando a execução é pedida, Então é recusada com `unknown_param` e sugestão `dry_run`, sem processo criado.
- Dado `get_script_schema` de um `.py` com docstring, Quando chamado, Então `instructions` traz só a descrição, nunca o código.
- Dado `list_ai_scripts` sem `detalhe`, Quando chamado com 31 scripts, Então a resposta é curta e não lista scripts `oculto`.
- Dado o modo completo, Quando as tools são registradas, Então só as 3 estáticas existem.
- Dado Esc no agente durante uma execução, Quando o sinal aborta, Então o processo é morto e o status é `cancelled`.
- Dado estouro de tempo, Quando ocorre, Então o status é `timeout` com tempo usado.
- Dado segredo partido entre dois pedaços, Quando a saída é gravada, Então o texto final não contém o segredo completo.
- Dado nota com `script_path` absoluto, Quando o parser roda, Então há erro e nenhuma execução.
- Dado uma pasta de scripts já populada, Quando o plugin inicia com starter pack ligado, Então nada é gravado na pasta.
- Dado uma nota fora da pasta de scripts editada, Quando salva, Então nenhuma recarga ocorre.

## Ações do usuário
Estas ações não são etapas de código. O plano não as executa sem a sua confirmação.

1. **Arquivar catálogos antigos (item 9).** Confirmar que nada depende de `C:\Users\Trabalho\Documents\Cofre\scripts\scripts.db`, `C:\Users\Trabalho\Documents\Cofre\scripts\catalogo_scripts.py`, `C:\Users\Trabalho\Documents\Cofre\scripts\compilar_scripts_sqlite.py` e `C:\Users\Trabalho\Documents\Cofre\scripts\gerar_notas_ai_scripts.py` (os dois últimos não foram localizados nesta leitura; confirme se existem) e, depois, movê-los para `C:\Users\Trabalho\Documents\Cofre\Arquivo\`. Não apagar.
2. **Marcar os hooks como ocultos (item 7).** Decidir se acrescenta `oculto: true` nos cabeçalhos dos `hook_*` e do `telegram_status` em `C:\Users\Trabalho\Documents\Cofre\scripts\` (ex.: `C:\Users\Trabalho\Documents\Cofre\scripts\hook_perfil_sobre_mim.py`, cujo cabeçalho hoje tem `expose: false`). Hoje o cabeçalho não tem o campo; sem a mudança, eles continuam listados.
3. **Configurar o starter pack antes do deploy (item 6).** Gravar `installStarterPack: false` nas configurações do plugin no cofre (o arquivo de dados do plugin não foi localizado nesta leitura; confirme o caminho). Isso evita a instalação mesmo antes da etapa 9 entrar.
4. **Decidir o limite local (item 8).** Confirmar se o teto de 300 s do fallback local deve ser constante (proposta da etapa 7) ou uma configuração do plugin.
5. **Decidir o comportamento de `oculto` (item 7).** Confirmar que script oculto some da listagem e do índice, mas continua executável pelo id.
6. **Mudança no AI Ecosystem (fora deste plano).** O teto de 300 s e as recusas `path-not-allowed` ficam em `C:\Users\Trabalho\Documents\obsidian-ai-ecosystem\src\runner\script-policy.ts`. Alterar isso é outro repositório e precisa de plano próprio, se você quiser.
7. **Deploy, commit e push.** `npm run deploy`, commit e push ficam com você depois da verificação da etapa 11.

## Dúvidas reais
- O `.cache/runs` citado na auditoria não foi confirmado no código do repositório; a etapa 8 pede para parar se o padrão não existir.
- A auditoria cita `script-policy.ts:215-221` para o teto de 300 s, mas o arquivo está em `obsidian-ai-ecosystem`, não neste repositório.
- Os itens 9 (dois dos quatro arquivos) não foram encontrados em `C:\Users\Trabalho\Documents\Cofre\scripts`.
