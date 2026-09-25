#!/usr/bin/env python3
"""Build data/host-symbols.json from X11 keysymdef.h.

One record is one Unicode scalar. The keysym field is the name to write
into xkb. Other X11 names for that scalar are aliases. U0454 and
0x01000454 are not stored; lookup derives them from the codepoint.

Windows stores these scalars as UTF-16, so records have no Windows field.

Requires /usr/include/X11/keysymdef.h. Re-run from the repo root:

  python3 packages/keymap-core/scripts/build-host-symbols.py
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEYSYMDEF = Path("/usr/include/X11/keysymdef.h")
FIXTURES = ROOT / "fixtures" / "xkb" / "symbols"
OUT = ROOT / "data" / "host-symbols.json"

# The ru host fixture spells the capital shcha without the final A.
EXTRA_ALIASES = {"Cyrillic_SHCH": "Cyrillic_SHCHA"}

DEFINE = re.compile(r"^#define\s+XK_(\S+)\s+(\S+)\s*(?:/\*(.*?)\*/)?\s*$")
UNICODE = re.compile(r"U\+([0-9A-Fa-f]{4,6})")
KEYSYM = re.compile(
    r"^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]|U[0-9A-Fa-f]{4,6}|0x[0-9A-Fa-f]+)$"
)


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//.*", "", text)


def load_keysyms() -> tuple[dict[str, int], dict[str, int], dict[str, int]]:
    """name → value, name → one-to-one codepoint, name → parenthetical codepoint."""
    values: dict[str, int] = {}
    raw: list[tuple[str, str]] = []
    one_to_one: dict[str, int] = {}
    paren: dict[str, int] = {}
    for line in KEYSYMDEF.read_text(encoding="utf-8", errors="replace").splitlines():
        match = DEFINE.match(line)
        if not match:
            continue
        name, value, comment = match.group(1), match.group(2), (match.group(3) or "").strip()
        raw.append((name, value))
        if re.fullmatch(r"0x[0-9A-Fa-f]+", value):
            values[name] = int(value, 16)
        found = UNICODE.search(comment)
        if not found:
            continue
        codepoint = int(found.group(1), 16)
        if comment.startswith("("):
            paren[name] = codepoint
        else:
            one_to_one[name] = codepoint
    for _ in range(6):
        for name, value in raw:
            if name in values or not value.startswith("XK_"):
                continue
            target = values.get(value[3:])
            if target is not None:
                values[name] = target
    return values, one_to_one, paren


def fixture_codepoints() -> set[int]:
    codepoints: set[int] = set()
    for path in FIXTURES.iterdir():
        if not path.is_file():
            continue
        text = strip_comments(path.read_text(encoding="utf-8", errors="replace"))
        for token in re.findall(r"[A-Za-z0-9_x]+", text):
            if not KEYSYM.fullmatch(token):
                continue
            if re.fullmatch(r"U[0-9A-Fa-f]{4,6}", token):
                codepoints.add(int(token[1:], 16))
            elif re.fullmatch(r"0x[0-9A-Fa-f]+", token):
                value = int(token, 16)
                if (value & 0xFF000000) == 0x01000000:
                    codepoints.add(value & 0x00FFFFFF)
                elif 0x20 <= value <= 0x7E or 0xA0 <= value <= 0xFF:
                    codepoints.add(value)
    return codepoints


def fixture_counts() -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for path in FIXTURES.iterdir():
        if not path.is_file():
            continue
        text = strip_comments(path.read_text(encoding="utf-8", errors="replace"))
        for token in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", text):
            counts[token] += 1
    return counts


def u_name(codepoint: int) -> str:
    hex_digits = f"{codepoint:X}"
    if len(hex_digits) < 4:
        hex_digits = hex_digits.zfill(4)
    return "U" + hex_digits


def choose_canonical(names: list[str], values: dict[str, int], counts: dict[str, int], codepoint: int) -> str:
    def rank(name: str) -> tuple[int, int, int, str]:
        value = values.get(name, 1 << 30)
        direct = 0 if value == codepoint else 1
        traditional = 0 if value < 0x01000000 else 1
        return (direct, traditional, -counts.get(name, 0), len(name), name)

    return min(names, key=rank)


def main() -> None:
    values, one_to_one, paren = load_keysyms()
    by_value: dict[int, list[str]] = defaultdict(list)
    for name, value in values.items():
        by_value[value].append(name)

    name_cp: dict[str, int] = dict(one_to_one)
    for name, value in values.items():
        if name in name_cp:
            continue
        for sibling in by_value[value]:
            if sibling in one_to_one:
                name_cp[name] = one_to_one[sibling]
                break
    for name, codepoint in paren.items():
        name_cp.setdefault(name, codepoint)

    for alias, canonical in EXTRA_ALIASES.items():
        codepoint = name_cp.get(canonical)
        if codepoint is None:
            raise SystemExit(f"{canonical} is not a known keysym")
        name_cp[alias] = codepoint

    grouped: dict[int, list[str]] = defaultdict(list)
    for name, codepoint in name_cp.items():
        grouped[codepoint].append(name)

    referenced = fixture_codepoints()
    counts = fixture_counts()
    records = []
    for codepoint in sorted(grouped):
        names = grouped[codepoint]
        proper = [name for name in names if name in one_to_one]
        legacy = [name for name in names if name not in one_to_one]
        if proper:
            canonical = choose_canonical(proper, values, counts, codepoint)
        elif codepoint in referenced and legacy:
            canonical = choose_canonical(legacy, values, counts, codepoint)
        elif codepoint in referenced:
            canonical = u_name(codepoint)
        else:
            continue
        aliases = sorted(name for name in names if name != canonical)
        record: dict[str, object] = {"cp": codepoint, "keysym": canonical}
        if aliases:
            record["aliases"] = aliases
        records.append(record)

    known = {record["cp"] for record in records}
    for codepoint in sorted(referenced - known):
        if codepoint < 0x20 or 0xD800 <= codepoint <= 0xDFFF or codepoint > 0x10FFFF:
            continue
        records.append({"cp": codepoint, "keysym": u_name(codepoint)})
    records.sort(key=lambda record: int(record["cp"]))

    body = ",\n".join("  " + json.dumps(record, ensure_ascii=False) for record in records)
    OUT.write_text("[\n" + body + "\n]\n", encoding="utf-8")
    alias_count = sum(len(record.get("aliases", [])) for record in records)
    print(f"wrote {len(records)} symbols, {alias_count} aliases → {OUT}")


if __name__ == "__main__":
    main()
