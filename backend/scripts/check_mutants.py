"""Fail unless every mutant is killed, or exempt with a reason no test can kill it.

`mutmut run` exits 0 whether mutants survived or not, so the policy is enforced here, in two steps:

1. Read mutmut's verdicts. mutmut only tests each mutant against the tests its tracing saw reach the
   mutated function, which is cheap and wrong in exactly one direction: tracing can miss a test that
   would have killed a mutant (code that only runs at import, say), but it can't invent a kill.
   So a kill is final, and everything else is only a suspect.
2. Re-run every suspect - survived, no tests, timeout - against the whole suite, each in its own
   process. Whatever still survives that is a real finding.

Exemptions live in mutation-exemptions.toml, keyed by mutant (or by function, for all of its
mutants) and guarded by a fingerprint of the function - see scripts/mutation_fingerprint.py for why.

Usage (from backend/):

    rm -rf mutants && uv run mutmut run && uv run python scripts/check_mutants.py
"""

import argparse
import json
import os
import subprocess
import sys
import tomllib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from mutmut.__main__ import status_by_exit_code

from scripts.mutation_fingerprint import drifted, mangled_function


ROOT = Path(__file__).resolve().parent.parent
MUTANTS = ROOT / "mutants"
EXEMPTIONS = ROOT / "mutation-exemptions.toml"
# Long enough that "equivalent" or "n/a" can't pass for an explanation.
SHORTEST_USEFUL_REASON = 40
# The whole suite runs in well under a minute - past this a mutant has hung (an infinite loop), not
# slowed down.
WALL_LIMIT = int(os.environ.get("MUTMUT_WALL_LIMIT", "300"))
SETTLED = ("killed", "skipped", "caught by type check")


def verdicts(tree: Path = MUTANTS) -> dict[str, str]:
    """mutant name -> mutmut's status for it, from the .meta file mutmut writes beside each source."""
    results = {}
    for meta in tree.rglob("*.py.meta"):
        for name, exit_code in json.loads(meta.read_text())["exit_code_by_key"].items():
            results[name] = status_by_exit_code[exit_code]
    return results


def stale_files(tree: Path = MUTANTS, root: Path = ROOT) -> list[str]:
    """Files the tree has results for that are gone from the source. mutmut builds mutants/ once and
    never prunes it, so a stale tree answers with a previous layout's numbers."""
    return sorted(
        str(meta.relative_to(tree))[: -len(".meta")]
        for meta in tree.rglob("*.py.meta")
        if not (root / str(meta.relative_to(tree))[: -len(".meta")]).exists()
    )


def load_exemptions(path: Path = EXEMPTIONS) -> tuple[dict[str, dict], list[str]]:
    """(entries, problems). An exemption is an escape hatch from the policy, so it's guarded like
    one: no reason, no fingerprint, or a fingerprint that no longer matches its function all fail."""
    if not path.exists():
        return {}, []
    entries = tomllib.loads(path.read_text())
    problems = []
    for name, entry in entries.items():
        # An unquoted dotted TOML header is a nested table, not a key - it would match nothing.
        if not isinstance(entry, dict) or any(isinstance(value, dict) for value in entry.values()):
            problems.append(f'[{name}] is a nested table - quote the whole name: ["{name}..."]')
            continue
        if len(entry.get("reason", "").strip()) < SHORTEST_USEFUL_REASON:
            problems.append(f"[{name}] needs a reason saying why no test can kill it")
        if not entry.get("fingerprint"):
            problems.append(f"[{name}] has no fingerprint")
    for name, recorded, current in drifted(entries, ROOT):
        problems.append(
            f"[{name}] was written against a different version of its function ({recorded} -> {current})."
            " Re-read its mutants, then update the reason and set fingerprint to the new value."
        )
    return entries, problems


def is_exempt(name: str, exemptions: dict[str, dict]) -> bool:
    """An entry names one mutant, or a whole function - every mutant of it, including future ones.
    Prefer the former: a function-wide entry also excuses whatever gets added to it later, until
    its fingerprint forces a re-read."""
    return name in exemptions or mangled_function(name) in exemptions


def confirm(name: str) -> str:
    """Re-runs the whole suite with `name` active. -x: a mutant that dies stops at the first failure,
    so only real survivors pay for a full pass."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "-x", "-q", "--tb=no", "-p", "no:cacheprovider"],
            cwd=MUTANTS,
            env={**os.environ, "MUTANT_UNDER_TEST": name},
            capture_output=True,
            timeout=WALL_LIMIT,
        )
    except subprocess.TimeoutExpired:
        return "timeout"
    # 1 is pytest's "tests failed". Anything else (collection error, crash) isn't a clean kill - a
    # broken tree fails every mutant too, and would read as a perfect score.
    return {0: "survived", 1: "killed"}.get(result.returncode, f"error (exit {result.returncode})")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
    options = parser.parse_args(argv)

    results = verdicts(MUTANTS)
    if not results:
        print("No mutmut results found - run `uv run mutmut run` first.")
        return 1
    stale = stale_files(MUTANTS, ROOT)
    if stale:
        print("mutants/ was built from an older layout (" + ", ".join(stale) + "). `rm -rf mutants` and re-run.")
        return 1

    exemptions, problems = load_exemptions(EXEMPTIONS)
    known = set(results) | {mangled_function(name) for name in results}
    problems += [
        f"[{name}] matches no mutant or mutated function - remove it" for name in exemptions if name not in known
    ]
    if problems:
        print("mutation-exemptions.toml:\n  " + "\n  ".join(problems))
        return 1

    killed = sum(1 for status in results.values() if status in SETTLED)
    exempt = [name for name in results if is_exempt(name, exemptions)]
    suspects = sorted(
        name for name, status in results.items() if status not in SETTLED and not is_exempt(name, exemptions)
    )
    print(f"{len(results):,} mutants: {killed:,} killed, {len(exempt):,} exempt, {len(suspects):,} to confirm")

    with ThreadPoolExecutor(max_workers=options.jobs) as pool:
        confirmed = dict(zip(suspects, pool.map(confirm, suspects), strict=True))

    alive = {name: verdict for name, verdict in confirmed.items() if verdict != "killed"}
    if not alive:
        print("No surviving mutants.")
        return 0
    print(f"\n{len(alive):,} mutant(s) survived the whole suite:")
    for name, verdict in sorted(alive.items()):
        print(f"  {verdict:9} {name}")
    print(
        "\nInspect one with `uv run mutmut show <name>`. Either add a test that kills it, or - only if"
        " nothing the app does can differ - record its function in mutation-exemptions.toml."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
