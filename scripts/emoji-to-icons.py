#!/usr/bin/env python3
"""
Convert emoji UI marks to Ionicons.

    python scripts/emoji-to-icons.py --check
    python scripts/emoji-to-icons.py

SCOPE IS DELIBERATELY NARROW. It only rewrites this exact shape:

    <Text style={styles.somethingEmoji}>EMOJI</Text>
    -> <Ionicons name="..." size={22} color="#29B6F6" style={styles.somethingEmoji} />

It does NOT touch copy, whitespace, quotes, or anything else. An earlier version
of this script also "tidied up" whitespace after stripping emoji from strings,
using regexes that ran across the whole file. It ate the spaces around every
quote in 82 files — `from'react'`, `color="#fff"style={...}` — the second of
which is invalid JSX. That was caught and reverted, and the lesson is baked into
this file: a codemod gets one narrow, well-tested job. Emoji inside sentences
are left alone; a human should decide those case by case.

Monochrome type (arrows, check, cross, star) is not emoji and is never touched.
"""
from __future__ import annotations
import re, sys, glob

ICON = {
    '🏢': 'business', '🏙️': 'business', '🏛️': 'business', '🏠': 'home',
    '📍': 'location', '🗺️': 'map', '🧭': 'compass', '🌍': 'earth', '🪐': 'planet',
    '📅': 'calendar', '🗓️': 'calendar-number', '🕐': 'time',
    '📌': 'pin', '📣': 'megaphone', '🔥': 'flame',
    '💬': 'chatbubbles', '💌': 'mail', '✉️': 'mail', '✉': 'mail', '📧': 'mail',
    '📭': 'mail-open', '☎': 'call',
    '👤': 'person', '👥': 'people', '🫂': 'people-circle', '🤝': 'hand-left',
    '🙏': 'hand-left', '💘': 'heart', '❤️': 'heart', '🤍': 'heart-outline',
    '💚': 'heart', '⭐': 'star', '🌟': 'star', '🏆': 'trophy', '🏅': 'medal',
    '✨': 'sparkles', '💫': 'sparkles', '⚡': 'flash', '🚀': 'rocket',
    '📷': 'camera', '📸': 'camera', '🖼': 'images', '🖼️': 'images', '🎨': 'color-palette',
    '🔒': 'lock-closed', '🔓': 'lock-open', '🛡️': 'shield-checkmark',
    '🚩': 'flag', '🏁': 'flag-outline', '⚠': 'warning', '⚠️': 'warning',
    '📝': 'clipboard', '📚': 'book', '💻': 'laptop', '🔗': 'git-network',
    '🔄': 'refresh', '📡': 'radio', '🎲': 'dice', '🎭': 'happy',
    '🎉': 'sparkles', '🥳': 'sparkles', '🎵': 'musical-notes', '🎤': 'mic',
    '🧠': 'bulb', '🏀': 'basketball', '😂': 'happy', '😊': 'happy',
    '🤔': 'help-circle', '👀': 'eye', '👁': 'eye', '🙈': 'eye-off',
    '😴': 'moon', '🌙': 'moon', '🌃': 'moon', '🌆': 'partly-sunny',
    '🍺': 'beer', '🍹': 'wine', '☕': 'cafe', '🍽️': 'restaurant', '🍔': 'fast-food',
    '🌳': 'leaf', '🏋️': 'barbell', '🎮': 'game-controller', '💃': 'musical-note',
    '👻': 'skull', '💯': 'flame', '✏️': 'create', '✅': 'checkmark-circle',
    '❌': 'close-circle', '🏷️': 'pricetag', '💼': 'briefcase',
}

MARK = re.compile(
    r"<Text style=\{styles\.(?P<style>\w*(?:Emoji|Glyph))\}>"
    r"(?P<e>(?:[\U0001F300-\U0001FAFF]|[☀-➿])️?)"
    r"</Text>"
)


def convert(src: str) -> tuple[str, int]:
    n = 0

    def repl(m: re.Match) -> str:
        nonlocal n
        name = ICON.get(m.group('e'))
        if not name:
            return m.group(0)
        n += 1
        return (f'<Ionicons name="{name}" size={{22}} color="#29B6F6" '
                f'style={{styles.{m.group("style")}}} />')

    return MARK.sub(repl, src), n


def add_import(src: str) -> str:
    """Insert the Ionicons import after the react-native import, if missing."""
    if "@expo/vector-icons" in src:
        return src
    lines = src.split('\n')
    for i, ln in enumerate(lines):
        if ln.rstrip().endswith("from 'react-native'"):
            lines.insert(i + 1, "import { Ionicons } from '@expo/vector-icons'")
            return '\n'.join(lines)
    return src


def main() -> int:
    check = '--check' in sys.argv
    total = files = 0
    for f in (glob.glob('app/**/*.tsx', recursive=True)
              + glob.glob('components/**/*.tsx', recursive=True)):
        src = open(f, encoding='utf-8').read()
        out, n = convert(src)
        if not n:
            continue
        out = add_import(out)
        if out != src:
            files += 1
            total += n
            if not check:
                open(f, 'w', encoding='utf-8').write(out)
    print(f"{'would convert' if check else 'converted'} {total} marks across {files} files")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
