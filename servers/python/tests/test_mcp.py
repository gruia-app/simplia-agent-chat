"""Paridad de la proyección MCP §9.1 con el contrato TS: cada ToolSpec
válido proyecta a un Tool válido del schema MCP 2025-06-18 vendorizado,
y from_mcp_name es la inversa exacta."""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest

from gruia_agent_tools import contract
from gruia_agent_tools.mcp import (
    MCP_NAME_PATTERN,
    from_mcp_name,
    to_mcp_name,
    to_mcp_tool,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = REPO_ROOT / "packages" / "agent-chat-contract" / "fixtures"
SCHEMAS = contract.load_schemas()

MCP_SCHEMA = json.loads((FIXTURES_DIR / "mcp" / "2025-06-18.schema.json").read_text())
_MCP_TOOL_VALIDATOR = jsonschema.Draft7Validator(
    {"$ref": "#/definitions/Tool", "definitions": MCP_SCHEMA["definitions"]}
)


def _valid_toolspecs():
    for path in sorted((FIXTURES_DIR / "contract" / "valid").glob("*.json")):
        fixture = json.loads(path.read_text())
        if fixture["entity"] == "tool-spec":
            yield path.stem, fixture["document"]


VALID_TOOLSPECS = list(_valid_toolspecs())


@pytest.mark.parametrize("name,spec", VALID_TOOLSPECS, ids=[n for n, _ in VALID_TOOLSPECS])
def test_toolspec_projects_to_valid_mcp_tool(name, spec):
    tool = to_mcp_tool(spec, proposal_ref_schema=SCHEMAS["proposal-ref"])
    _MCP_TOOL_VALIDATOR.validate(tool)
    assert MCP_NAME_PATTERN.match(tool["name"])
    assert tool["inputSchema"] == spec["input_schema"]
    expected_output = spec["output_schema"] if spec["effect"] == "read" else SCHEMAS["proposal-ref"]
    assert tool["outputSchema"] == expected_output
    assert tool["annotations"] == {
        "title": spec["name"],
        "readOnlyHint": spec["effect"] == "read",
        "destructiveHint": False,
        "idempotentHint": spec["effect"] == "read",
        "openWorldHint": False,
    }


VALID_TOOLSPECS = list(_valid_toolspecs())


@pytest.mark.parametrize("name,spec", VALID_TOOLSPECS, ids=[n for n, _ in VALID_TOOLSPECS])
def test_from_mcp_name_is_exact_inverse(name, spec):
    parts = from_mcp_name(to_mcp_name(spec))
    ns, _, verb = spec["name"].partition(".")
    assert parts == {"app_key": spec["app_key"], "ns": ns, "verb": verb}


@pytest.mark.parametrize(
    "bad",
    ["", "a__b", "a__b__c__d", "a__b__", "has space__x__y", "x" * 65 + "__a__b"],
)
def test_from_mcp_name_rejects_malformed(bad):
    with pytest.raises(ValueError):
        from_mcp_name(bad)
