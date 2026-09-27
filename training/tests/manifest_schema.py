"""Validation against the JSON Schema emitted by packages/llm (the format's single owner)."""

import json
from pathlib import Path

import jsonschema

REPO_DIR = Path(__file__).resolve().parents[2]
MANIFEST_SCHEMA = REPO_DIR / "packages/llm/schema/manifest.schema.json"
APP_MODELS_DIR = REPO_DIR / "apps/explainer/public/models"


def validate_manifest(manifest: dict) -> None:
    schema = json.loads(MANIFEST_SCHEMA.read_text())
    jsonschema.Draft202012Validator(schema).validate(manifest)
