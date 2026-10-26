// The Markdown script notes of the starter pack. Each note embeds a self-contained Python 3 script
// (standard library only) and short pt-BR documentation. Frontmatter follows the format that
// schema-parser.ts accepts; the absence of script_path makes the parser use the embedded block.

import { PY_COMMON, PY_LINKS, PY_MARKDOWN, PY_TASKS } from "./python-snippets";

export interface StarterScript {
  scriptId: string;
  /** File name of the note inside the scripts folder. */
  fileName: string;
  /** Full note content (frontmatter, documentation and embedded code). */
  content: string;
  /** Example parameters that validate against the note's schema (used by tests and the docs). */
  exampleParams: Record<string, unknown>;
}

function buildNote(frontmatter: string, doc: string, code: string): string {
  const fence = "```";
  return `---\n${frontmatter.trim()}\n---\n\n${doc.trim()}\n\n## Código\n\n${fence}python\n${code.trim()}\n${fence}\n`;
}

// ---- links_quebrados ----------------------------------------------------------------------------

const LINKS_QUEBRADOS_MAIN = String.raw`def main():
    setup_streams()
    params = read_params()
    root = os.getcwd()
    folder = get_folder(root, params)
    limit = get_int(params, "limite", 100)
    vault = Vault(root)
    broken = []
    scanned = 0
    for rel in vault.notes:
        if not in_folder(rel, folder):
            continue
        scanned += 1
        lines = visible_lines(read_text(os.path.join(root, rel)))
        for number, kind, target, shown in iter_links(lines):
            if resolve_link(vault, kind, target, rel) is None:
                broken.append((rel, number, shown))
    for rel, number, shown in broken[:limit]:
        print("%s:%d -> %s" % (rel, number, shown))
    notes_with_problems = len(set(item[0] for item in broken))
    if not broken:
        print("Nenhum link quebrado em %d nota(s) verificada(s)." % scanned)
        return
    if len(broken) > limit:
        print("")
        print("Mostrando %d de %d links quebrados (aumente 'limite' para ver mais)." % (limit, len(broken)))
    print("")
    print("%d link(s) quebrado(s) em %d nota(s) (%d nota(s) verificada(s))." % (len(broken), notes_with_problems, scanned))


if __name__ == "__main__":
    main()
`;

const LINKS_QUEBRADOS_FRONT = `
script_id: links_quebrados
nome: Links quebrados
categoria: Cofre
descricao: "Procura wikilinks e links Markdown que apontam para notas ou arquivos que não existem no cofre. Somente leitura."
runtime: python
input_mode: stdin
timeout_seconds: 120
expose_as_tool: true
params:
  pasta:
    type: string
    description: "Pasta do cofre a verificar (relativa ao cofre). Vazio verifica o cofre inteiro; os destinos sempre são procurados no cofre todo."
  limite:
    type: integer
    min: 1
    default: 100
    description: "Máximo de links quebrados listados."
`;

const LINKS_QUEBRADOS_DOC = `
# Links quebrados

Lista os links que apontam para algo que não existe, no formato \`nota:linha -> alvo\`, e a contagem no final. Não altera nenhum arquivo.

## O que verifica

- Wikilinks \`[[nota]]\`, com alias (\`[[nota|texto]]\`), âncora (\`[[nota#Título]]\`) e embeds (\`![[arquivo.png]]\`). A nota é achada pelo nome, sem precisar do caminho, como no Obsidian.
- Links Markdown \`[texto](caminho/arquivo.md)\` relativos à nota. Links com endereço externo (\`https:\`, \`mailto:\`) e âncoras puras (\`#título\`) são ignorados.
- Links dentro de blocos de código e de código em linha são ignorados.
- As pastas \`.obsidian\`, \`.git\`, \`.trash\` e \`node_modules\` não entram.

## Parâmetros

- \`pasta\` (opcional): restringe as notas verificadas a uma pasta do cofre.
- \`limite\` (padrão 100): máximo de links listados.

## Exemplo

\`\`\`json
{ "pasta": "Projetos", "limite": 50 }
\`\`\`
`;

// ---- notas_orfas --------------------------------------------------------------------------------

const NOTAS_ORFAS_MAIN = String.raw`def main():
    setup_streams()
    params = read_params()
    root = os.getcwd()
    folder = get_folder(root, params)
    limit = get_int(params, "limite", 100)
    ignored = params.get("ignorar_pastas") or []
    if isinstance(ignored, str):
        ignored = [ignored]
    ignored = [str(item).strip().replace("\\", "/").strip("/") for item in ignored if str(item).strip()]
    vault = Vault(root)
    incoming = set()
    outgoing = set()
    for rel in vault.notes:
        lines = visible_lines(read_text(os.path.join(root, rel)))
        for number, kind, target, shown in iter_links(lines):
            resolved = resolve_link(vault, kind, target, rel)
            if resolved is None or resolved[0] != "note" or resolved[1] == rel:
                continue
            outgoing.add(rel)
            incoming.add(resolved[1])
    orphans = []
    checked = 0
    for rel in vault.notes:
        if not in_folder(rel, folder):
            continue
        if any(in_folder(rel, item) for item in ignored):
            continue
        checked += 1
        if rel not in incoming and rel not in outgoing:
            orphans.append(rel)
    if not orphans:
        print("Nenhuma nota órfã entre %d nota(s) verificada(s)." % checked)
        return
    print("Notas órfãs (sem links de entrada nem de saída):")
    print("")
    for rel in orphans[:limit]:
        print("- " + rel)
    print("")
    if len(orphans) > limit:
        print("Mostrando %d de %d notas órfãs (aumente 'limite' para ver mais)." % (limit, len(orphans)))
    print("%d nota(s) órfã(s) em %d nota(s) verificada(s)." % (len(orphans), checked))


if __name__ == "__main__":
    main()
`;

const NOTAS_ORFAS_FRONT = `
script_id: notas_orfas
nome: Notas órfãs
categoria: Cofre
descricao: "Lista as notas que não têm links de entrada nem de saída para outras notas do cofre. Somente leitura."
runtime: python
input_mode: stdin
timeout_seconds: 120
expose_as_tool: true
params:
  pasta:
    type: string
    description: "Só considera as notas desta pasta (relativa ao cofre). Os links são sempre avaliados no cofre inteiro."
  ignorar_pastas:
    type: array
    items: string
    description: "Pastas (relativas ao cofre) cujas notas não são listadas, como modelos ou arquivo morto. Os links delas continuam contando."
  limite:
    type: integer
    min: 1
    default: 100
    description: "Máximo de notas listadas."
`;

const NOTAS_ORFAS_DOC = `
# Notas órfãs

Lista as notas sem nenhum link de entrada (ninguém aponta para elas) e sem nenhum link de saída (elas não apontam para nenhuma nota). Não altera nenhum arquivo.

## Como decide

- Contam links para outras notas existentes: wikilinks (com alias, âncora e embed) e links Markdown relativos. Links de uma nota para ela mesma, para anexos e para destinos que não existem não contam.
- Links dentro de blocos de código são ignorados.
- As pastas \`.obsidian\`, \`.git\`, \`.trash\` e \`node_modules\` não entram.

## Parâmetros

- \`pasta\` (opcional): só lista notas desta pasta.
- \`ignorar_pastas\` (opcional): pastas cujas notas não são listadas (por exemplo \`Templates\`).
- \`limite\` (padrão 100): máximo de notas listadas.

## Exemplo

\`\`\`json
{ "ignorar_pastas": ["Templates", "Arquivo"], "limite": 50 }
\`\`\`
`;

// ---- extrair_tarefas ----------------------------------------------------------------------------

const EXTRAIR_TAREFAS_MAIN = String.raw`def render_task(task, group):
    mark = "x" if task["concluida"] else " "
    where = "linha %d" % task["linha"] if group == "nota" else "%s:%d" % (task["nota"], task["linha"])
    return "- [%s] %s (%s)" % (mark, task["texto"], where)


def main():
    setup_streams()
    params = read_params()
    root = os.getcwd()
    folder = get_folder(root, params)
    limit = get_int(params, "limite", 100)
    include_done = get_bool(params, "incluir_concluidas", False)
    only_overdue = get_bool(params, "so_vencidas", False)
    group = params.get("agrupar_por") or "nota"
    if group not in ("nota", "data"):
        fail("'agrupar_por' deve ser 'nota' ou 'data'")
    today = date.today()
    selected = []
    for task in collect_tasks(root, folder):
        if task["concluida"] and not include_done:
            continue
        if only_overdue and (task["concluida"] or task["data"] is None or task["data"] >= today):
            continue
        selected.append(task)
    if group == "data":
        selected.sort(key=lambda t: (t["data"] is None, t["data"] or today, t["nota"], t["linha"]))
    overdue = sum(1 for t in selected if not t["concluida"] and t["data"] is not None and t["data"] < today)
    print("# Tarefas do cofre")
    print("")
    if not selected:
        print("Nenhuma tarefa encontrada.")
        return
    print("%d tarefa(s), %d vencida(s)." % (len(selected), overdue))
    current = object()
    for task in selected[:limit]:
        key = task["nota"] if group == "nota" else task["data"]
        if key != current:
            current = key
            print("")
            if group == "nota":
                print("### " + task["nota"])
            elif task["data"] is None:
                print("### Sem data")
            else:
                suffix = " (vencida)" if task["data"] < today else ""
                print("### %s%s" % (task["data"].isoformat(), suffix))
        print(render_task(task, group))
    if len(selected) > limit:
        print("")
        print("Mostrando %d de %d tarefas (aumente 'limite' para ver mais)." % (limit, len(selected)))


if __name__ == "__main__":
    main()
`;

const EXTRAIR_TAREFAS_FRONT = `
script_id: extrair_tarefas
nome: Extrair tarefas
categoria: Cofre
descricao: "Junta as tarefas em lista de verificação de todo o cofre, com data de vencimento quando houver, agrupadas por nota ou por data. Somente leitura."
runtime: python
input_mode: stdin
timeout_seconds: 120
expose_as_tool: true
params:
  pasta:
    type: string
    description: "Só procura tarefas nesta pasta (relativa ao cofre). Vazio procura no cofre inteiro."
  incluir_concluidas:
    type: boolean
    default: false
    description: "Inclui também as tarefas concluídas."
  so_vencidas:
    type: boolean
    default: false
    description: "Lista apenas tarefas abertas com data de vencimento anterior a hoje."
  agrupar_por:
    type: string
    enum: ["nota", "data"]
    default: "nota"
    description: "Agrupa o resultado por nota ou por data de vencimento."
  limite:
    type: integer
    min: 1
    default: 100
    description: "Máximo de tarefas listadas."
`;

const EXTRAIR_TAREFAS_DOC = `
# Extrair tarefas

Reúne as tarefas \`- [ ]\` do cofre em um relatório Markdown. Não altera nenhum arquivo.

## Datas reconhecidas

O vencimento é lido do texto da tarefa, quando existir, em um destes formatos:

- o ícone de calendário seguido da data, como no plugin Tasks (\`YYYY-MM-DD\`);
- \`due:: YYYY-MM-DD\` (Dataview);
- \`@YYYY-MM-DD\`.

Tarefas em blocos de código são ignoradas, assim como as pastas \`.obsidian\`, \`.git\`, \`.trash\` e \`node_modules\`.

## Parâmetros

- \`pasta\` (opcional): restringe a uma pasta.
- \`incluir_concluidas\` (padrão false): inclui as marcadas com \`x\`.
- \`so_vencidas\` (padrão false): só tarefas abertas com data anterior a hoje.
- \`agrupar_por\` (\`nota\` ou \`data\`, padrão \`nota\`).
- \`limite\` (padrão 100): máximo de tarefas listadas.

## Exemplo

\`\`\`json
{ "so_vencidas": true, "agrupar_por": "data" }
\`\`\`
`;

// ---- backup_cofre -------------------------------------------------------------------------------

const BACKUP_COFRE_MAIN = String.raw`import zipfile


def human_size(size):
    value = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return "%d B" % size if unit == "B" else "%.1f %s" % (value, unit)
        value /= 1024


def main():
    setup_streams()
    params = read_params()
    root = os.getcwd()
    name = os.path.basename(os.path.normpath(root)) or "cofre"
    destino = params.get("destino")
    if isinstance(destino, str) and destino.strip():
        dest = os.path.abspath(os.path.join(root, os.path.expanduser(destino.strip())))
    else:
        dest = os.path.join(os.path.dirname(os.path.abspath(root)), name + "-backups")
    keep = get_int(params, "manter", 10)
    include_obsidian = get_bool(params, "incluir_obsidian", True)
    dry_run = get_bool(params, "dry_run", False)
    real_dest = os.path.realpath(dest)
    if real_dest == os.path.realpath(root):
        fail("o destino não pode ser a própria pasta do cofre")

    skip = set(IGNORED_DIRS)
    if include_obsidian:
        skip.discard(".obsidian")
    files = []
    symlinks = 0
    for dirpath, dirnames, filenames in os.walk(root):
        kept = []
        for d in sorted(dirnames):
            full = os.path.join(dirpath, d)
            if d in skip:
                continue
            if os.path.islink(full):
                symlinks += 1
                continue
            if os.path.realpath(full) == real_dest:
                continue
            kept.append(d)
        dirnames[:] = kept
        for f in sorted(filenames):
            full = os.path.join(dirpath, f)
            if os.path.islink(full):
                symlinks += 1
                continue
            files.append((full, os.path.relpath(full, root).replace(os.sep, "/")))

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    zip_name = "backup-%s-%s.zip" % (name, stamp)
    zip_path = os.path.join(dest, zip_name)
    pattern = re.compile("^backup-" + re.escape(name) + r"-\d{8}-\d{6}\.zip$")
    existing = []
    if os.path.isdir(dest):
        existing = sorted(f for f in os.listdir(dest) if pattern.match(f) and os.path.isfile(os.path.join(dest, f)))
    if zip_name in existing:
        fail("já existe um backup com o nome %s; tente de novo em um segundo" % zip_name)
    candidates = existing
    to_delete = candidates[: max(0, len(candidates) - (keep - 1))]

    if dry_run:
        total = 0
        for full, rel in files:
            try:
                total += os.path.getsize(full)
            except OSError:
                pass
        print("Simulação (dry_run): nada foi gravado nem apagado.")
        print("Backup que seria criado: " + zip_path)
        print("Arquivos: %d (%s sem compactar)" % (len(files), human_size(total)))
        print("Links simbólicos ignorados: %d" % symlinks)
        if to_delete:
            print("Backups antigos que seriam removidos (manter=%d):" % keep)
            for item in to_delete:
                print("- " + os.path.join(dest, item))
        return

    try:
        os.makedirs(dest, exist_ok=True)
    except OSError as exc:
        fail("não foi possível criar o destino %s (%s)" % (dest, exc))
    temp_path = zip_path + ".part"
    written = 0
    failed = []
    try:
        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED, allowZip64=True, strict_timestamps=False) as archive:
            for full, rel in files:
                try:
                    archive.write(full, name + "/" + rel)
                    written += 1
                except (OSError, ValueError):
                    failed.append(rel)
        os.replace(temp_path, zip_path)
    except Exception as exc:
        try:
            os.remove(temp_path)
        except OSError:
            pass
        fail("não foi possível criar o backup (%s)" % exc)

    removed = []
    for item in to_delete:
        try:
            os.remove(os.path.join(dest, item))
            removed.append(item)
        except OSError as exc:
            sys.stderr.write("Aviso: não foi possível apagar %s (%s)\n" % (item, exc))

    size = os.path.getsize(zip_path)
    print("Backup criado: " + zip_path)
    print("Tamanho: %s (%d bytes)" % (human_size(size), size))
    print("Arquivos: %d" % written)
    if symlinks:
        print("Links simbólicos ignorados: %d" % symlinks)
    if failed:
        print("Arquivos que não puderam ser lidos: %d" % len(failed))
        for rel in failed[:20]:
            print("- " + rel)
    if removed:
        print("Backups antigos removidos (manter=%d): %d" % (keep, len(removed)))
        for item in removed:
            print("- " + item)


if __name__ == "__main__":
    main()
`;

const BACKUP_COFRE_FRONT = `
script_id: backup_cofre
nome: Backup do cofre
categoria: Cofre
descricao: "Cria um zip datado do cofre inteiro em uma pasta de backups fora dele e mantém só os mais recentes. Grava fora do cofre."
runtime: python
input_mode: stdin
timeout_seconds: 600
expose_as_tool: true
params:
  destino:
    type: string
    description: "Pasta onde o zip é gravado. Vazio usa uma pasta irmã do cofre chamada '<nome-do-cofre>-backups'."
  manter:
    type: integer
    min: 1
    default: 10
    description: "Quantidade de backups mantidos. Os mais antigos criados por este script são apagados."
  incluir_obsidian:
    type: boolean
    default: true
    description: "Inclui a pasta .obsidian (configurações e plugins) no zip."
  dry_run:
    type: boolean
    default: false
    description: "Só mostra o que seria feito, sem criar nem apagar nada."
`;

const BACKUP_COFRE_DOC = `
# Backup do cofre

Cria o arquivo \`backup-<nome-do-cofre>-AAAAMMDD-HHMMSS.zip\` com todo o cofre. É o único script do pacote inicial que grava fora do cofre (efeito externo).

## O que faz

- Grava o zip em \`destino\` ou, se vazio, na pasta irmã \`<nome-do-cofre>-backups\`, ao lado da pasta do cofre.
- Fica de fora do zip: \`.git\`, \`.trash\`, \`node_modules\`, o próprio destino (quando está dentro do cofre) e os links simbólicos. A pasta \`.obsidian\` entra, a menos que \`incluir_obsidian\` seja false.
- Depois de criar o backup, apaga os mais antigos além de \`manter\`. Só apaga zips com o padrão de nome acima, ou seja, criados por este script; qualquer outro arquivo do destino é preservado.
- Informa o caminho, o tamanho e a quantidade de arquivos.

## Parâmetros

- \`destino\` (opcional): pasta de destino.
- \`manter\` (padrão 10): quantos backups manter.
- \`incluir_obsidian\` (padrão true).
- \`dry_run\` (padrão false): mostra o plano sem gravar nem apagar.

## Exemplo

\`\`\`json
{ "destino": "D:/Backups/Cofre", "manter": 5, "dry_run": true }
\`\`\`
`;

// ---- resumo_do_dia ------------------------------------------------------------------------------

const RESUMO_DO_DIA_MAIN = String.raw`def folder_of(rel):
    folder = posixpath.dirname(rel)
    return folder if folder else "(raiz)"


def main():
    setup_streams()
    params = read_params()
    root = os.getcwd()
    days = get_int(params, "dias", 1)
    raw_date = params.get("data")
    if isinstance(raw_date, str) and raw_date.strip():
        try:
            reference = date.fromisoformat(raw_date.strip())
        except ValueError:
            fail("'data' deve estar no formato AAAA-MM-DD")
    else:
        reference = date.today()
    first_day = reference - timedelta(days=days - 1)
    start = datetime.combine(first_day, time.min)
    end = datetime.combine(reference + timedelta(days=1), time.min)

    names = {}
    changed = []
    for full, rel in iter_markdown(root):
        base = posixpath.basename(rel)[:-3].lower()
        names[base] = names.get(base, 0) + 1
        try:
            info = os.stat(full)
        except OSError:
            continue
        born = getattr(info, "st_birthtime", None)
        if born is None and os.name == "nt":
            born = info.st_ctime
        modified = datetime.fromtimestamp(info.st_mtime)
        if born is not None and start <= datetime.fromtimestamp(born) < end:
            changed.append((rel, "criada"))
        elif start <= modified < end:
            changed.append((rel, "modificada"))

    def link(rel):
        base = posixpath.basename(rel)[:-3]
        target = base if names.get(base.lower(), 0) < 2 else rel[:-3]
        return "[[" + target + "]]"

    if days == 1:
        print("# Resumo do dia %s" % reference.isoformat())
    else:
        print("# Resumo de %s a %s" % (first_day.isoformat(), reference.isoformat()))
    print("")
    print("## Notas")
    print("")
    if not changed:
        print("Nenhuma nota criada ou modificada no período.")
    else:
        created = sum(1 for item in changed if item[1] == "criada")
        print("%d nota(s): %d criada(s), %d modificada(s)." % (len(changed), created, len(changed) - created))
        groups = {}
        for rel, kind in changed:
            groups.setdefault(folder_of(rel), []).append((rel, kind))
        for folder in sorted(groups):
            print("")
            print("### %s (%d)" % (folder, len(groups[folder])))
            for rel, kind in sorted(groups[folder], key=lambda item: item[0].lower()):
                print("- %s (%s)" % (link(rel), kind))

    open_tasks = [t for t in collect_tasks(root, None) if not t["concluida"] and t["data"] is not None and t["data"] <= reference]
    due_today = sorted((t for t in open_tasks if t["data"] == reference), key=lambda t: (t["nota"], t["linha"]))
    overdue = sorted((t for t in open_tasks if t["data"] < reference), key=lambda t: (t["data"], t["nota"], t["linha"]))
    print("")
    print("## Tarefas")
    if not open_tasks:
        print("")
        print("Nenhuma tarefa aberta vencendo hoje ou vencida.")
    if due_today:
        print("")
        print("### Vencem hoje (%d)" % len(due_today))
        for t in due_today:
            print("- [ ] %s (%s)" % (t["texto"], link(t["nota"])))
    if overdue:
        print("")
        print("### Vencidas (%d)" % len(overdue))
        for t in overdue:
            print("- [ ] %s (%s, venceu em %s)" % (t["texto"], link(t["nota"]), t["data"].isoformat()))


if __name__ == "__main__":
    main()
`;

const RESUMO_DO_DIA_FRONT = `
script_id: resumo_do_dia
nome: Resumo do dia
categoria: Cofre
descricao: "Resume as notas criadas ou modificadas no dia (ou nos últimos dias), agrupadas por pasta, e as tarefas abertas que vencem hoje ou estão vencidas, em Markdown pronto para colar numa nota diária. Somente leitura."
runtime: python
input_mode: stdin
timeout_seconds: 120
expose_as_tool: true
params:
  data:
    type: string
    regex: "^\\\\d{4}-\\\\d{2}-\\\\d{2}$"
    description: "Dia de referência no formato AAAA-MM-DD. Vazio usa hoje."
  dias:
    type: integer
    min: 1
    max: 365
    default: 1
    description: "Quantos dias o resumo cobre, contando para trás a partir do dia de referência."
`;

const RESUMO_DO_DIA_DOC = `
# Resumo do dia

Gera um resumo em Markdown para colar em uma nota diária. Não altera nenhum arquivo.

## O que traz

- **Notas:** as notas criadas ou modificadas no período, agrupadas por pasta, com a contagem. A data de criação só é conhecida onde o sistema a informa (Windows e macOS); no Linux todas aparecem como modificadas.
- **Tarefas:** as tarefas abertas com vencimento no dia de referência e as vencidas (mesmos formatos de data do script Extrair tarefas: ícone de calendário com a data, \`due:: AAAA-MM-DD\` ou \`@AAAA-MM-DD\`). Blocos de código são ignorados.
- As pastas \`.obsidian\`, \`.git\`, \`.trash\` e \`node_modules\` não entram.

## Parâmetros

- \`data\` (opcional): dia de referência, \`AAAA-MM-DD\`. Padrão: hoje.
- \`dias\` (padrão 1): quantos dias o resumo cobre, contando para trás a partir do dia de referência.

## Exemplo

\`\`\`json
{ "data": "2025-01-31", "dias": 7 }
\`\`\`
`;

// ---- Catalog ------------------------------------------------------------------------------------

export const STARTER_SCRIPTS: readonly StarterScript[] = [
  {
    scriptId: "links_quebrados",
    fileName: "Links quebrados.md",
    exampleParams: { pasta: "Projetos", limite: 50 },
    content: buildNote(
      LINKS_QUEBRADOS_FRONT,
      LINKS_QUEBRADOS_DOC,
      [PY_COMMON, PY_MARKDOWN, PY_LINKS, LINKS_QUEBRADOS_MAIN].join("\n\n"),
    ),
  },
  {
    scriptId: "notas_orfas",
    fileName: "Notas orfas.md",
    exampleParams: { ignorar_pastas: ["Templates", "Arquivo"], limite: 50 },
    content: buildNote(
      NOTAS_ORFAS_FRONT,
      NOTAS_ORFAS_DOC,
      [PY_COMMON, PY_MARKDOWN, PY_LINKS, NOTAS_ORFAS_MAIN].join("\n\n"),
    ),
  },
  {
    scriptId: "extrair_tarefas",
    fileName: "Extrair tarefas.md",
    exampleParams: { so_vencidas: true, agrupar_por: "data" },
    content: buildNote(
      EXTRAIR_TAREFAS_FRONT,
      EXTRAIR_TAREFAS_DOC,
      [PY_COMMON, PY_MARKDOWN, PY_TASKS, EXTRAIR_TAREFAS_MAIN].join("\n\n"),
    ),
  },
  {
    scriptId: "backup_cofre",
    fileName: "Backup do cofre.md",
    exampleParams: { destino: "D:/Backups/Cofre", manter: 5, dry_run: true },
    content: buildNote(BACKUP_COFRE_FRONT, BACKUP_COFRE_DOC, [PY_COMMON, BACKUP_COFRE_MAIN].join("\n\n")),
  },
  {
    scriptId: "resumo_do_dia",
    fileName: "Resumo do dia.md",
    exampleParams: { data: "2025-01-31", dias: 7 },
    content: buildNote(
      RESUMO_DO_DIA_FRONT,
      RESUMO_DO_DIA_DOC,
      [PY_COMMON, PY_MARKDOWN, PY_TASKS, RESUMO_DO_DIA_MAIN].join("\n\n"),
    ),
  },
];
