"""Validation against the JSON Schemas emitted by packages/llm (the formats' single owner)."""

import json

import jsonschema

from paths import SCHEMA_DIR


def validate(document: dict, schema_file: str) -> None:
    schema = json.loads((SCHEMA_DIR / schema_file).read_text())
    jsonschema.Draft202012Validator(schema).validate(document)
