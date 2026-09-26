import json
import subprocess
from pathlib import Path

import pytest

from scripts import check_mutants
from scripts.mutation_fingerprint import drifted, fingerprint, located, mangled_function


SOURCE = '''
def top(value):
    """Docstrings aren't mutated, so they don't count."""
    return value + 1


class Thing:
    def method(self):
        print("a statement, not a docstring")
        return 2
'''

REASON = "Nothing the app does differs: the value never reaches anything that reads it."


@pytest.fixture
def project(tmp_path: Path) -> Path:
    (tmp_path / "app").mkdir()
    (tmp_path / "app" / "mod.py").write_text(SOURCE)
    return tmp_path


def _write_meta(tree: Path, source: str, exit_codes: dict[str, int | None]) -> None:
    meta = tree / f"{source}.meta"
    meta.parent.mkdir(parents=True, exist_ok=True)
    meta.write_text(json.dumps({"exit_code_by_key": exit_codes}))


def test_mangled_function_strips_the_mutant_number() -> None:
    assert mangled_function("app.mod.x_top__mutmut_7") == "app.mod.x_top"
    assert mangled_function("app.mod.x_top") == "app.mod.x_top"


def test_located_finds_functions_and_methods() -> None:
    assert located("app.mod.x_top__mutmut_3") == (Path("app/mod.py"), "top")
    assert located("app.mod.xǁThingǁmethod__mutmut_1") == (Path("app/mod.py"), "Thing.method")
    assert located("app.mod.x_top") == (Path("app/mod.py"), "top")
    assert located("app.mod.not_mangled") is None


def test_fingerprint_changes_with_the_code_but_not_its_docstring(project: Path) -> None:
    before = fingerprint("app.mod.x_top", project)
    assert before is not None and len(before) == 12

    (project / "app" / "mod.py").write_text(SOURCE.replace("Docstrings", "Doc strings"))
    assert fingerprint("app.mod.x_top", project) == before

    (project / "app" / "mod.py").write_text(SOURCE.replace("value + 1", "value + 2"))
    assert fingerprint("app.mod.x_top", project) != before


def test_fingerprint_keeps_a_leading_expression_that_is_not_a_docstring(project: Path) -> None:
    before = fingerprint("app.mod.xǁThingǁmethod", project)
    (project / "app" / "mod.py").write_text(SOURCE.replace("a statement", "another statement"))
    assert fingerprint("app.mod.xǁThingǁmethod", project) != before


def test_fingerprint_is_none_when_there_is_nothing_to_compare(project: Path) -> None:
    assert fingerprint("app.mod.x_missing", project) is None
    assert fingerprint("app.gone.x_top", project) is None
    assert fingerprint("not a mutant", project) is None
    (project / "app" / "mod.py").write_text(SOURCE + "\nx__mutmut_orig = 1\n")
    assert fingerprint("app.mod.x_top", project) is None


def test_drifted_reports_only_entries_whose_function_changed(project: Path) -> None:
    current = fingerprint("app.mod.x_top", project)
    entries = {"app.mod.x_top": {"fingerprint": current}, "app.mod.xǁThingǁmethod": {"fingerprint": "stale"}}
    assert drifted(entries, project) == [
        ("app.mod.xǁThingǁmethod", "stale", fingerprint("app.mod.xǁThingǁmethod", project))
    ]


def test_verdicts_maps_mutmut_exit_codes_to_statuses(tmp_path: Path) -> None:
    _write_meta(tmp_path, "app/mod.py", {"app.mod.x_top__mutmut_1": 1, "app.mod.x_top__mutmut_2": 0})
    _write_meta(tmp_path, "app/other.py", {"app.other.x_f__mutmut_1": 33, "app.other.x_f__mutmut_2": None})
    assert check_mutants.verdicts(tmp_path) == {
        "app.mod.x_top__mutmut_1": "killed",
        "app.mod.x_top__mutmut_2": "survived",
        "app.other.x_f__mutmut_1": "no tests",
        "app.other.x_f__mutmut_2": "not checked",
    }


def test_stale_files_lists_results_for_deleted_sources(project: Path, tmp_path: Path) -> None:
    tree = tmp_path / "mutants"
    _write_meta(tree, "app/mod.py", {})
    _write_meta(tree, "app/deleted.py", {})
    assert check_mutants.stale_files(tree, project) == ["app/deleted.py"]


def test_load_exemptions_accepts_a_complete_entry(project: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(check_mutants, "ROOT", project)
    path = project / "exemptions.toml"
    path.write_text(
        f'["app.mod.x_top"]\nfingerprint = "{fingerprint("app.mod.x_top", project)}"\nreason = "{REASON}"\n'
    )
    entries, problems = check_mutants.load_exemptions(path)
    assert list(entries) == ["app.mod.x_top"]
    assert problems == []


def test_load_exemptions_rejects_incomplete_or_drifted_entries(project: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(check_mutants, "ROOT", project)
    path = project / "exemptions.toml"
    path.write_text(
        '["app.mod.x_top"]\nfingerprint = "drifted"\nreason = "too short"\n'
        '["app.mod.xǁThingǁmethod"]\nreason = "' + REASON + '"\n'
        "[app.mod.x_unquoted]\nreason = 1\n"
    )
    _, problems = check_mutants.load_exemptions(path)
    assert any("app.mod.x_top] needs a reason" in problem for problem in problems)
    assert any("different version of its function (drifted ->" in problem for problem in problems)
    assert any("xǁThingǁmethod] has no fingerprint" in problem for problem in problems)
    assert any("[app] is a nested table" in problem for problem in problems)


def test_load_exemptions_without_a_file_is_empty(tmp_path: Path) -> None:
    assert check_mutants.load_exemptions(tmp_path / "missing.toml") == ({}, [])


@pytest.mark.parametrize(
    ("outcome", "verdict"),
    [
        (subprocess.CompletedProcess([], 0), "survived"),
        (subprocess.CompletedProcess([], 1), "killed"),
        (subprocess.CompletedProcess([], 2), "error (exit 2)"),
        (subprocess.TimeoutExpired([], 1), "timeout"),
    ],
)
def test_confirm_reads_the_whole_suite_run(monkeypatch: pytest.MonkeyPatch, outcome, verdict) -> None:
    calls = []

    def fake_run(command, **kwargs):
        calls.append(kwargs)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(check_mutants.subprocess, "run", fake_run)
    assert check_mutants.confirm("app.mod.x_top__mutmut_1") == verdict
    assert calls[0]["env"]["MUTANT_UNDER_TEST"] == "app.mod.x_top__mutmut_1"
    assert calls[0]["cwd"] == check_mutants.MUTANTS


@pytest.fixture
def run_main(project: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]):
    tree = project / "mutants"
    tree.mkdir()
    monkeypatch.setattr(check_mutants, "ROOT", project)
    monkeypatch.setattr(check_mutants, "MUTANTS", tree)
    monkeypatch.setattr(check_mutants, "EXEMPTIONS", project / "mutation-exemptions.toml")
    confirmed = {}
    monkeypatch.setattr(check_mutants, "confirm", lambda name: confirmed.get(name, "killed"))

    def run(results: dict[str, int | None], *, suite: dict[str, str] | None = None, exemptions: str = ""):
        if results:
            _write_meta(tree, "app/mod.py", results)
        (project / "mutation-exemptions.toml").write_text(exemptions)
        confirmed.update(suite or {})
        return check_mutants.main(["--jobs", "2"]), capsys.readouterr().out

    return run


def test_main_fails_without_results(run_main) -> None:
    code, out = run_main({})
    assert code == 1
    assert "run `uv run mutmut run` first" in out


def test_main_fails_on_a_stale_tree(run_main, project: Path) -> None:
    _write_meta(project / "mutants", "app/deleted.py", {"app.deleted.x_f__mutmut_1": 1})
    code, out = run_main({"app.mod.x_top__mutmut_1": 1})
    assert code == 1
    assert "older layout (app/deleted.py)" in out


def test_main_passes_when_suspects_die_against_the_whole_suite(run_main) -> None:
    code, out = run_main({"app.mod.x_top__mutmut_1": 1, "app.mod.x_top__mutmut_2": 0, "app.mod.x_top__mutmut_3": 33})
    assert code == 0
    assert "3 mutants: 1 killed, 0 exempt, 2 to confirm" in out
    assert "No surviving mutants." in out


def test_main_fails_on_a_real_survivor(run_main) -> None:
    code, out = run_main(
        {"app.mod.x_top__mutmut_1": 0, "app.mod.x_top__mutmut_2": 0},
        suite={"app.mod.x_top__mutmut_2": "survived"},
    )
    assert code == 1
    assert "1 mutant(s) survived the whole suite" in out
    assert "survived  app.mod.x_top__mutmut_2" in out
    assert "x_top__mutmut_1" not in out.split("survived the whole suite")[1]


def test_main_skips_exempt_functions(run_main, project: Path) -> None:
    exemption = f'["app.mod.x_top"]\nfingerprint = "{fingerprint("app.mod.x_top", project)}"\nreason = "{REASON}"\n'
    code, out = run_main(
        {"app.mod.x_top__mutmut_1": 0}, suite={"app.mod.x_top__mutmut_1": "survived"}, exemptions=exemption
    )
    assert code == 0
    assert "1 mutants: 0 killed, 1 exempt, 0 to confirm" in out


def test_main_skips_a_single_exempt_mutant_but_not_its_siblings(run_main, project: Path) -> None:
    exemption = (
        f'["app.mod.x_top__mutmut_1"]\nfingerprint = "{fingerprint("app.mod.x_top", project)}"\nreason = "{REASON}"\n'
    )
    code, out = run_main(
        {"app.mod.x_top__mutmut_1": 0, "app.mod.x_top__mutmut_2": 0},
        suite={"app.mod.x_top__mutmut_1": "survived", "app.mod.x_top__mutmut_2": "survived"},
        exemptions=exemption,
    )
    assert code == 1
    assert "2 mutants: 0 killed, 1 exempt, 1 to confirm" in out
    assert "survived  app.mod.x_top__mutmut_2" in out


def test_main_rejects_an_exemption_for_a_function_that_was_not_mutated(run_main, project: Path) -> None:
    exemption = f'["app.mod.xǁThingǁmethod"]\nfingerprint = "{fingerprint("app.mod.xǁThingǁmethod", project)}"\n'
    exemption += f'reason = "{REASON}"\n'
    code, out = run_main({"app.mod.x_top__mutmut_1": 1}, exemptions=exemption)
    assert code == 1
    assert "xǁThingǁmethod] matches no mutant or mutated function" in out
