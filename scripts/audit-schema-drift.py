"""
Find every place the code names a database column that does not exist.

The shape of this bug is always the same, and it is invisible unless you look
for it deliberately. Postgres answers an unknown column with a 400 and rejects
the whole statement; the caller destructures `{ data }` without ever reading
`error`; `data` comes back null; the guard on the next line returns early. The
feature is dead and nothing anywhere says so. In the sibling SocialMate codebase
this exact pattern had silently disabled nine shipped features, some since
launch.

Static types do not help, because the Supabase client is untyped here - column
names are plain strings, and a string typo is not a type error.

    python scripts/audit-schema-drift.py            # report
    python scripts/audit-schema-drift.py --strict   # exit 1 on any finding (CI)

Reads EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from .env.

How the check works. Supabase's newer publishable keys cannot read the OpenAPI
schema document - that endpoint now demands a secret key - so rather than
pulling the schema and diffing it, this asks the database directly about every
column the code names:

    GET /rest/v1/<table>?select=<column>&limit=1

PostgREST resolves the column list while PARSING the request, before RLS is
consulted. An unknown column comes back 400 / 42703 "column does not exist",
while a real column the caller cannot read comes back 200 with an empty array.
That is exactly the distinction needed, and it is a stronger check than a schema
diff because it asks the database the same question the app asks.
"""
import argparse
import io
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = ['app', 'components', 'lib', 'contexts', 'hooks']
SKIP_DIRS = {'node_modules', '.expo', 'dist', '.git', '__pycache__'}

# PostgREST operators that take a column name as their first argument.
FILTERS = ('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
           'contains', 'containedBy', 'order')

# Columns the client synthesises or that are not real columns.
PSEUDO = {'count', '*'}


def load_env():
    env = {}
    with open(os.path.join(ROOT, '.env'), encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                env[line[:line.index('=')]] = line[line.index('=') + 1:].strip()
    return env


class Prober:
    """Asks the live database whether a name exists, and remembers the answers."""

    def __init__(self, env):
        self.url = env['EXPO_PUBLIC_SUPABASE_URL'].rstrip('/')
        self.key = env['EXPO_PUBLIC_SUPABASE_ANON_KEY']
        self.cache = {}
        self.requests = 0

    def _get(self, path):
        req = urllib.request.Request(
            self.url + path,
            headers={'apikey': self.key, 'Authorization': 'Bearer ' + self.key})
        self.requests += 1
        try:
            urllib.request.urlopen(req, timeout=30).read()
            return 200, ''
        except urllib.error.HTTPError as e:
            return e.code, e.read()[:400].decode('utf-8', 'replace')
        except Exception as e:  # network hiccup: treat as inconclusive, never as a finding
            return 0, str(e)

    def table_exists(self, table):
        key = ('__table__', table)
        if key not in self.cache:
            code, body = self._get('/rest/v1/%s?limit=0' % urllib.parse.quote(table))
            # PGRST205 is "unknown table or view". A 200, or an RLS-shaped error,
            # both mean the relation really is there.
            self.cache[key] = not (code == 404 or 'PGRST205' in body)
        return self.cache[key]

    def column_exists(self, table, column):
        key = (table, column)
        if key in self.cache:
            return self.cache[key]
        code, body = self._get('/rest/v1/%s?select=%s&limit=1'
                               % (urllib.parse.quote(table), urllib.parse.quote(column)))
        # 42703 is Postgres' "column does not exist". Anything else, including a
        # permission error, means the name itself resolved - so do not accuse it.
        ok = not (code == 400 and ('42703' in body or 'does not exist' in body))
        self.cache[key] = ok
        return ok


def iter_files():
    for d in DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for dp, dn, fn in os.walk(base):
            dn[:] = [x for x in dn if x not in SKIP_DIRS]
            for f in fn:
                if f.endswith(('.ts', '.tsx')):
                    p = os.path.join(dp, f)
                    yield p, os.path.relpath(p, ROOT).replace(os.sep, '/')


def balanced(text, open_at):
    """Index just past the bracket opened at `open_at`, or None."""
    pairs = {'(': ')', '{': '}'}
    close = pairs[text[open_at]]
    depth, i, n = 0, open_at, len(text)
    quote = None
    while i < n:
        c = text[i]
        if quote:
            if c == '\\':
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in '"\'`':
            quote = c
        elif c == text[open_at]:
            depth += 1
        elif c == close:
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return None


def split_top_level(select_list):
    """Split a .select() list on commas that are NOT inside an embedded resource.

    A naive split on ',' tears embedded resources apart:

        'id, zones(id, name, type)'  ->  ['id', ' zones(id', ' name', ' type)']

    and the tail fragments then get checked against the BASE table, which is how
    a clean schema produced five confident findings for columns that exist
    perfectly well on the embedded table. Splitting at paren depth 0 keeps
    `zones(...)` in one piece so clean_col can drop it as an embedded resource.
    """
    out, depth, cur = [], 0, []
    for ch in select_list:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            out.append(''.join(cur))
            cur = []
        else:
            cur.append(ch)
    out.append(''.join(cur))
    return out


def clean_col(raw):
    """Normalise one entry from a .select() list to a bare column name."""
    c = raw.strip()
    # An embedded resource names another table's columns, not this table's.
    if not c or '(' in c or ')' in c:
        return None
    if ':' in c:               # alias:column
        c = c.split(':', 1)[1]
    for sep in ('->>', '->', '::'):   # json path / cast
        if sep in c:
            c = c.split(sep, 1)[0]
    c = c.strip().strip('"')
    return c or None


SELECT_STR = re.compile(r"\.select\(\s*(['\"])(.*?)\1", re.S)
CHAIN_STEP = re.compile(r'\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(')

# A single `key:` occurrence, anchored where the scanner currently sits.
KEY_AT = re.compile(r'''\s*(?:['"])?([A-Za-z_][A-Za-z0-9_]*)(?:['"])?\s*:''')


def _opens_entry(body, i):
    """True if position `i` starts a fresh entry in an object literal."""
    j = i - 1
    while j >= 0 and body[j] in ' \t\r\n':
        j -= 1
    return j < 0 or body[j] in '{,'


def top_level_keys(body):
    """[(offset, key)] for keys at depth 1 of the object literal `body`.

    Only the outermost keys are columns. Anything nested is the *contents* of a
    jsonb column, and reporting those produces confident nonsense - writing
    `notification_prefs: { promos, events }` is one real column, and a flat scan
    calls it two phantom ones.
    """
    out = []
    depth = 0
    i, n = 0, len(body)
    quote = None
    while i < n:
        ch = body[i]
        if quote:
            if ch == '\\':
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in '"\'`':
            quote = ch
        elif ch in '{[(':
            depth += 1
        elif ch in '}])':
            depth -= 1
        elif depth == 1:
            km = KEY_AT.match(body, i)
            # A key is only a key if the nearest non-space character behind it
            # opened the object or ended the previous entry. Without this,
            # `paused ? null : x` reads `null:` as a column, and ternaries inside
            # payloads are common.
            if km and _opens_entry(body, i):
                out.append((km.start(1), km.group(1)))
                i = km.end()
                continue
        i += 1
    return out


def chain_extent(text, start):
    """End index of the .a().b().c() chain beginning at `start`.

    A fixed-size window does not work. Supabase calls sit inside Promise.all
    blocks and back-to-back awaits, so a flat character budget runs past the end
    of one query and swallows the next - attributing a neighbouring table's
    perfectly valid columns to this one. Consume only genuine `.method(...)`
    continuations and stop at the first thing that is not one.
    """
    pos = start
    while True:
        m = CHAIN_STEP.match(text, pos)
        if not m:
            return pos
        close = balanced(text, m.end() - 1)
        if close is None:
            return pos
        pos = close


def scan_file(path, rel, refs):
    """Collect every (table, column) the file names, and where it said it."""
    try:
        src = open(path, encoding='utf-8').read()
    except Exception:
        return

    def line_of(idx):
        return src.count('\n', 0, idx) + 1

    for m in re.finditer(r"\.from\(\s*['\"]([A-Za-z0-9_]+)['\"]\s*\)", src):
        table = m.group(1)
        chain = src[m.end():chain_extent(src, m.end())]

        sm = SELECT_STR.search(chain)
        if sm and '*' not in sm.group(2):
            for raw in split_top_level(sm.group(2)):
                c = clean_col(raw)
                if c and c not in PSEUDO:
                    refs.append((rel, line_of(m.end() + sm.start()), table, c, 'select'))

        for verb in ('insert', 'upsert', 'update'):
            vm = re.search(r'\.' + verb + r'\(\s*\{', chain)
            if not vm:
                continue
            brace = chain.index('{', vm.start())
            stop = balanced(chain, brace)
            if stop is None:
                continue
            body = chain[brace:stop]
            if '...' in body:
                continue  # spread: keys are not statically visible
            for off, c in top_level_keys(body):
                refs.append((rel, line_of(m.end() + brace + off), table, c, verb))

        for fm in re.finditer(
                r"\.(" + '|'.join(FILTERS) + r")\(\s*['\"]([A-Za-z0-9_]+)['\"]", chain):
            c = fm.group(2)
            if c not in PSEUDO:
                refs.append((rel, line_of(m.end() + fm.start()), table, c,
                             '.' + fm.group(1) + '()'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--strict', action='store_true', help='exit 1 if anything is found')
    a = ap.parse_args()

    refs = []
    n = 0
    for path, rel in iter_files():
        n += 1
        scan_file(path, rel, refs)

    tables = sorted({r[2] for r in refs})
    pairs = sorted({(r[2], r[3]) for r in refs})
    print('scanned %d files' % n)
    print('found %d table names, %d distinct (table, column) references' % (len(tables), len(pairs)))
    print('probing the live database...\n')

    p = Prober(load_env())

    # Tables first. A name PostgREST does not expose is usually an RPC helper or
    # a typo, but either way every column under it is unverifiable - so say so
    # once and skip them, rather than printing a wall of unfounded findings.
    unknown_tables = {t for t in tables if not p.table_exists(t)}
    bad = [(t, c) for t, c in pairs
           if t not in unknown_tables and not p.column_exists(t, c)]

    print('%d live requests' % p.requests)

    if unknown_tables:
        print('\nNOT EXPOSED BY POSTGREST: %s' % ', '.join(sorted(unknown_tables)))
        print('   (columns under these were not checked)')

    if not bad:
        print('\nno phantom columns found')
        return 0

    badset = set(bad)
    sites = {}
    for rel, line, table, col, kind in refs:
        if (table, col) in badset:
            sites.setdefault((table, col), []).append((rel, line, kind))

    print('\nPHANTOM COLUMNS: %d distinct\n' % len(bad))
    for key in sorted(bad, key=lambda k: -len(sites.get(k, []))):
        table, col = key
        hits = sites.get(key, [])
        print('  %s.%s   (%d site%s)' % (table, col, len(hits), '' if len(hits) == 1 else 's'))
        for rel, line, kind in hits[:8]:
            print('      %s:%d  [%s]' % (rel, line, kind))
        if len(hits) > 8:
            print('      ... and %d more' % (len(hits) - 8))
        print()
    return 1 if a.strict else 0


if __name__ == '__main__':
    sys.exit(main())
