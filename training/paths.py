"""Where training reads from and writes to."""

from pathlib import Path

TRAINING_DIR = Path(__file__).resolve().parent
REPO_DIR = TRAINING_DIR.parent
DATA_DIR = TRAINING_DIR / "data"  # gitignored: raw TinyStories and its token streams
TRAIN_FILE = DATA_DIR / "TinyStoriesV2-GPT4-train.txt"
VALID_FILE = DATA_DIR / "TinyStoriesV2-GPT4-valid.txt"
FIXTURES_DIR = TRAINING_DIR / "fixtures"
# Every shipped model: apps/explainer/public/models/<id>/ (committed, D30).
MODELS_DIR = REPO_DIR / "apps/explainer/public/models"
SCHEMA_DIR = REPO_DIR / "packages/llm/schema"
