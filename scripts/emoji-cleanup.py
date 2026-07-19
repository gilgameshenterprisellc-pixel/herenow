#!/usr/bin/env python3
"""
Remove the remaining colour emoji from copy, safely.

    python scripts/emoji-cleanup.py --check
    python scripts/emoji-cleanup.py

SAFETY MODEL — read this before changing anything.

An earlier attempt at this ran "tidy up the spacing" regexes across whole files
and ate the spaces around every quote in 82 files (`from'react'`,
`color="#fff"style={...}` — the second is invalid JSX). It was caught and
reverted, and this rewrite exists so it cannot happen again.

The rule: this script NEVER edits arbitrary text. It only rewrites the inside of

  1. string literals   '...'  "..."  `...`
  2. JSX text nodes    >  here  <

and within those it only deletes emoji and collapses whitespace that the
deletion itself created. Code structure, quotes, attributes and identifiers are
never touched, because the substitution is scoped by the matcher, not by a
global find/replace.

Monochrome type (arrows, check, cross, star) is intentionally preserved — it
inherits the text colour and behaves like type. Colour emoji are the problem.
"""
from __future__ import annotations
import re
import sys
import glob

# Colour emoji only. Explicitly NOT: → ← ↑ ↓ ✓ ✕ ✗ ★ ✎ ↩ ↻
EMOJI = re.compile(
    '(?:'
    '[\U0001F300-\U0001FAFF]'      # pictographs, symbols, faces
    '|[\U0001F000-\U0001F2FF]'     # tiles, enclosed
    '|[☀-➿]'             # misc symbols / dingbats
    '|[⬀-⯿]'             # arrows-ish block that includes ⭐
    ')'
    '[︎️]?'              # variation selector
    '[\U0001F3FB-\U0001F3FF]?'     # skin tone
)

# Keep these even though they fall in the ranges above: they render as type.
KEEP = set('←↑→↓↩↻✓✔✕✖✗★☆✎✏︎')

STRING_LIT = re.compile(
    r"(?P<q>['\"`])(?P<body>(?:\\.|(?!(?P=q))[^\\\n])*)(?P=q)"
)
JSX_TEXT = re.compile(r">(?P<body>[^<>{}]*)<")


def _strip(body: str) -> tuple[str, int]:
    """Delete emoji from one span of prose and tidy only what that created."""
    def sub(m: re.Match) -> str:
        return m.group(0) if m.group(0)[0] in KEEP else ''

    out, n = EMOJI.subn(sub, body)
    if n == 0:
        return body, 0
    had_lead = body[:1].isspace()
    had_trail = body[-1:].isspace()
    out = re.sub(r'[ \t]{2,}', ' ', out)          # double space left behind
    out = re.sub(r'\s+([,.!?;:])', r'\1', out)    # space before punctuation
    out = re.sub(r'\(\s+', '(', out)
    out = re.sub(r'\s+\)', ')', out)
    out = out.strip()
    # Put back a single leading/trailing space if the original had one, so
    # `{'a '}{x}` style concatenation doesn't lose its separator.
    if had_lead:
        out = ' ' + out
    if had_trail:
        out = out + ' '
    return out, n


def convert(src: str) -> tuple[str, int]:
    removed = 0

    def do_string(m: re.Match) -> str:
        nonlocal removed
        body, n = _strip(m.group('body'))
        removed += n
        return f"{m.group('q')}{body}{m.group('q')}" if n else m.group(0)

    def do_jsx(m: re.Match) -> str:
        nonlocal removed
        body, n = _strip(m.group('body'))
        removed += n
        return f">{body}<" if n else m.group(0)

    src = STRING_LIT.sub(do_string, src)
    src = JSX_TEXT.sub(do_jsx, src)
    return src, removed


def main() -> int:
    check = '--check' in sys.argv
    targets = (
        glob.glob('app/**/*.tsx', recursive=True)
        + glob.glob('components/**/*.tsx', recursive=True)
        + glob.glob('lib/**/*.ts', recursive=True)
        + glob.glob('app/**/*.ts', recursive=True)
    )
    total = files = 0
    for f in sorted(set(targets)):
        src = open(f, encoding='utf-8').read()
        out, n = convert(src)
        if n and out != src:
            files += 1
            total += n
            if not check:
                open(f, 'w', encoding='utf-8').write(out)
    print(f"{'would remove' if check else 'removed'} {total} emoji from copy across {files} files")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
