// Python building blocks shared by the starter scripts. Every note embeds its own copy (scripts must
// be self-contained at runtime); sharing happens only here, at build time.
//
// Rules for this file: String.raw templates, so no backtick and no dollar-brace sequence may appear in the
// Python text (a backtick would also end the fenced block of the note). Python gets backticks through
// the \x60 escape inside raw regex strings.

/** Imports, stream setup, parameter reading and vault walking. */
export const PY_COMMON = String.raw`import json
import os
import posixpath
import re
import sys
from datetime import date, datetime, time, timedelta
from urllib.parse import unquote

IGNORED_DIRS = {".obsidian", ".git", ".trash", "node_modules"}


def setup_streams():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def fail(message):
    sys.stderr.write("Erro: " + message + "\n")
    sys.exit(1)


def read_params():
    raw = sys.stdin.buffer.read().decode("utf-8-sig").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError as exc:
        fail("a entrada não é um JSON válido (%s)" % exc)
    if not isinstance(data, dict):
        fail("a entrada deve ser um objeto JSON")
    return data


def get_int(params, key, default, minimum=1):
    value = params.get(key)
    if value is None:
        return default
    try:
        if isinstance(value, bool):
            raise ValueError(key)
        number = int(value)
    except (TypeError, ValueError):
        fail("o parâmetro '%s' deve ser um número inteiro" % key)
    if number < minimum:
        fail("o parâmetro '%s' deve ser maior ou igual a %d" % (key, minimum))
    return number


def get_bool(params, key, default):
    value = params.get(key)
    if value is None:
        return default
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "sim", "yes")
    return bool(value)


def get_folder(root, params, key="pasta"):
    """Validated vault-relative folder (posix, no trailing slash) or None for the whole vault."""
    value = params.get(key)
    if not isinstance(value, str) or not value.strip():
        return None
    target = os.path.normpath(os.path.join(root, value.strip()))
    try:
        rel = os.path.relpath(target, root)
    except ValueError:
        fail("a pasta deve ficar dentro do cofre: " + value)
    if rel == ".":
        return None
    if rel == ".." or rel.startswith(".." + os.sep) or os.path.isabs(rel):
        fail("a pasta deve ficar dentro do cofre: " + value)
    if not os.path.isdir(target):
        fail("pasta não encontrada no cofre: " + value)
    return rel.replace(os.sep, "/")


def in_folder(rel, folder):
    if not folder:
        return True
    low = rel.lower()
    base = folder.lower().rstrip("/")
    return low == base or low.startswith(base + "/")


def read_text(path):
    try:
        with open(path, "r", encoding="utf-8-sig", errors="replace") as handle:
            return handle.read()
    except OSError:
        return ""


def iter_markdown(root):
    """Yield (absolute, relative posix) for every .md note, skipping ignored folders and symlinked folders."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(
            d for d in dirnames
            if d not in IGNORED_DIRS and not os.path.islink(os.path.join(dirpath, d))
        )
        for name in sorted(filenames):
            if name.lower().endswith(".md"):
                full = os.path.join(dirpath, name)
                yield full, os.path.relpath(full, root).replace(os.sep, "/")
`;

/** Markdown helpers: masks fenced and inline code so links and tasks inside code are ignored. */
export const PY_MARKDOWN = String.raw`FENCE_RE = re.compile(r"^\s{0,3}(\x60{3,}|~{3,})")
INLINE_CODE_RE = re.compile(r"(\x60+)(?:(?!\1).)+?\1")


def visible_lines(text, keep_inline=False):
    """Lines of the text with fenced code blanked (and inline code too, unless keep_inline)."""
    lines = []
    fence = None
    for line in text.splitlines():
        match = FENCE_RE.match(line)
        if fence is not None:
            stripped = line.strip()
            if match and stripped and set(stripped) == {fence[0]} and len(stripped) >= len(fence):
                fence = None
            lines.append("")
            continue
        if match:
            fence = match.group(1)
            lines.append("")
            continue
        if keep_inline:
            lines.append(line)
        else:
            lines.append(INLINE_CODE_RE.sub(lambda mo: " " * len(mo.group(0)), line))
    return lines
`;

/** Vault index and link extraction/resolution (wikilinks, aliases, anchors, embeds and Markdown links). */
export const PY_LINKS = String.raw`WIKILINK_RE = re.compile(r"\[\[([^\[\]]+?)\]\]")
MDLINK_RE = re.compile(r"\[[^\]]*\]\(([^)]*)\)")
SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]+:")


def suffixes(lower_path):
    parts = lower_path.split("/")
    for index in range(len(parts)):
        yield "/".join(parts[index:])


class Vault:
    def __init__(self, root):
        self.root = root
        self.notes = []
        self.paths = {}
        self.keys = {}
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = sorted(
                d for d in dirnames
                if d not in IGNORED_DIRS and not os.path.islink(os.path.join(dirpath, d))
            )
            rel_dir = os.path.relpath(dirpath, root).replace(os.sep, "/")
            if rel_dir != ".":
                self.paths[rel_dir.lower()] = ("dir", rel_dir)
            for name in sorted(filenames):
                rel = name if rel_dir == "." else rel_dir + "/" + name
                lower = rel.lower()
                is_note = lower.endswith(".md")
                kind = "note" if is_note else "file"
                self.paths[lower] = (kind, rel)
                for key in suffixes(lower):
                    self.keys.setdefault(key, (kind, rel))
                if is_note:
                    self.notes.append(rel)
                    for key in suffixes(lower[:-3]):
                        self.keys.setdefault(key, (kind, rel))

    def resolve_wiki(self, target):
        """Resolve a [[target]] the way Obsidian does: by name or by (partial) path. Returns (kind, rel) or None."""
        low = target.replace("\\", "/").strip().strip("/").lower()
        if not low:
            return None
        return self.keys.get(low)

    def resolve_md(self, href, from_rel):
        """Resolve a Markdown link relative to the note that contains it. Returns (kind, rel) or None."""
        path = unquote(href).split("#", 1)[0].split("?", 1)[0].replace("\\", "/")
        if not path:
            return ("note", from_rel)
        if path.startswith("/"):
            joined = posixpath.normpath(path.lstrip("/"))
        else:
            joined = posixpath.normpath(posixpath.join(posixpath.dirname(from_rel), path))
        if joined == ".." or joined.startswith("../"):
            return None
        low = joined.lower()
        for candidate in (low, low + ".md"):
            if candidate in self.paths:
                return self.paths[candidate]
        return None


def clean_href(raw):
    raw = raw.strip()
    if raw.startswith("<"):
        end = raw.find(">")
        return raw[1:end] if end != -1 else raw[1:]
    parts = raw.split()
    return parts[0] if parts else ""


def iter_links(lines):
    """Yield (line number, kind, target, shown) for each link found in the (code-free) lines."""
    for number, line in enumerate(lines, 1):
        if "[" not in line:
            continue
        for match in WIKILINK_RE.finditer(line):
            inner = match.group(1).replace("\\|", "|")
            target = inner.split("|", 1)[0].split("#", 1)[0].strip()
            if not target or "{{" in target or "<%" in target:
                continue
            yield number, "wiki", target, "[[" + target + "]]"
        for match in MDLINK_RE.finditer(line):
            href = clean_href(match.group(1))
            if not href or href.startswith("#") or SCHEME_RE.match(href):
                continue
            yield number, "md", href, href


def resolve_link(vault, kind, target, from_rel):
    if kind == "wiki":
        return vault.resolve_wiki(target)
    return vault.resolve_md(target, from_rel)
`;

/** Task parsing shared by extrair_tarefas and resumo_do_dia. */
export const PY_TASKS = String.raw`CALENDAR = chr(0x1F4C5)
DUE_RE = re.compile(
    "(?:" + CALENDAR + chr(0xFE0F) + r"?\s*|due::\s*|(?<![\w@])@)(\d{4}-\d{2}-\d{2})",
    re.IGNORECASE,
)
TASK_RE = re.compile(r"^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.*\S)\s*$")


def parse_due(text):
    match = DUE_RE.search(text)
    if not match:
        return None
    try:
        return date.fromisoformat(match.group(1))
    except ValueError:
        return None


def collect_tasks(root, folder):
    """Every task of the vault (code blocks ignored) as dicts: nota, linha, concluida, texto, data."""
    tasks = []
    for full, rel in iter_markdown(root):
        if not in_folder(rel, folder):
            continue
        for number, line in enumerate(visible_lines(read_text(full), keep_inline=True), 1):
            match = TASK_RE.match(line)
            if not match:
                continue
            mark = match.group(1)
            text = match.group(2)
            tasks.append({
                "nota": rel,
                "linha": number,
                "concluida": mark in ("x", "X"),
                "texto": text,
                "data": parse_due(text),
            })
    return tasks
`;
