"""Validation against the JSON Schemas emitted by packages/llm (the formats' single owner)."""

import json
from pathlib import Path

import jsonschema

REPO_DIR = Path(__file__).resolve().parents[2]
SCHEMA_DIR = REPO_DIR / "packages/llm/schema"
APP_MODELS_DIR = REPO_DIR / "apps/explainer/public/models"


def validate(document: dict, schema_file: str) -> None:
    schema = json.loads((SCHEMA_DIR / schema_file).read_text())
    jsonschema.Draft202012Validator(schema).validate(document)
