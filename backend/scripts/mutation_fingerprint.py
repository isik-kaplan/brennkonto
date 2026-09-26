"""What each entry in `mutation-exemptions.toml` was written against, so it cannot drift onto
another mutant.

A mutant's name is positional - `x_main__mutmut_203` is the 203rd mutation inside `main` - so
editing that function moves every number after it and the entry keeps pointing at a mutant its
reason does not describe. Numbering is per function, which is what makes the check possible; the
fingerprint is taken from the AST so reformatting costs nothing.
"""

import ast
import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

MANGLED = "__mutmut_"
# mutmut writes a method as `xǁClassǁmethod`, a plain function as `x_function`.
SEPARATOR = "ǁ"


def mangled_function(mutant_name):
    """`module.xǁClassǁmethod__mutmut_7` -> `module.xǁClassǁmethod`. Exemptions are keyed by this,
    not by mutant number, so every caller that checks a mutant against the registry goes through
    here rather than comparing full mutant names to it directly."""
    return mutant_name.rpartition(MANGLED)[0] or mutant_name


def located(name):
    """(module path, the function's dotted path) for a mutant name or a bare mangled function name
    (exemptions here are keyed by function, so its mutant-number suffix may already be gone), or None
    if `name` names neither."""
    parts = name.split(".")
    for index, part in enumerate(parts):
        if part.startswith("x_") or part.startswith("x" + SEPARATOR):
            module = Path(*parts[:index]).with_suffix(".py")
            # rpartition returns "" for the part before a separator that is not there, which would
            # otherwise turn "no mutant number" into "no function name" - kept whole instead.
            mangled = parts[index]
            if MANGLED in mangled:
                mangled = mangled.rpartition(MANGLED)[0]
            if SEPARATOR in mangled:
                return module, ".".join(mangled.removeprefix("x").strip(SEPARATOR).split(SEPARATOR))
            return module, mangled.removeprefix("x_")
    return None


def _definition(tree, dotted):
    """The def node at that dotted path, walking class bodies rather than the whole tree - a nested
    helper of the same name would otherwise answer for the method being asked about."""
    node = tree
    for step in dotted.split("."):
        node = next(
            (
                child
                for child in node.body
                if isinstance(child, ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef) and child.name == step
            ),
            None,
        )
        if node is None:
            return None
    return node


def _without_docstrings(definition):
    """mutmut does not mutate a docstring, so editing one moves no mutant number - and a fingerprint
    that changed anyway would refuse every entry in a file after a comment sweep."""
    for node in ast.walk(definition):
        body = getattr(node, "body", None)
        if isinstance(body, list) and body and isinstance(body[0], ast.Expr):
            value = body[0].value
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                node.body = body[1:] or [ast.Pass()]
    return definition


def fingerprint(name, root=ROOT):
    """The mutant's function as mutmut would see it, hashed. None when there is nothing to compare
    against: a name that locates no function, a file that is gone, or a copy inside a mutants tree,
    where every function has already been rewritten and no fingerprint of it means anything.
    """
    located_at = located(name)
    if located_at is None:
        return None
    module, dotted = located_at
    path = Path(root) / module
    if not path.exists():
        return None
    source = path.read_text()
    if MANGLED + "orig" in source:
        return None
    definition = _definition(ast.parse(source), dotted)
    if definition is None:
        return None
    return hashlib.sha256(ast.dump(_without_docstrings(definition)).encode()).hexdigest()[:12]


def drifted(entries, root=ROOT):
    """(name, recorded, current) per entry whose function has changed since it was written."""
    moved = []
    for name, entry in entries.items():
        current = fingerprint(name, root)
        if current is not None and entry.get("fingerprint") != current:
            moved.append((name, entry.get("fingerprint", ""), current))
    return moved
