from pathlib import Path

from pydantic_settings import BaseSettings

_PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # Database — SQLite for local dev, Postgres for production
    database_url: str = f"sqlite+aiosqlite:///{_PROJECT_ROOT}/seogeo.db"
    database_url_sync: str = f"sqlite:///{_PROJECT_ROOT}/seogeo.db"

    # Redis (empty = disabled, uses in-memory fallback)
    redis_url: str = ""

    # LLM API Keys (individual — used if openrouter_api_key is empty)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_ai_api_key: str = ""
    perplexity_api_key: str = ""

    # OpenRouter (single key for all LLMs — preferred for SaaS)
    openrouter_api_key: str = ""

    # SERP Provider ("serpapi" or "serper")
    serp_provider: str = "serper"
    serpapi_key: str = ""
    serper_api_key: str = ""

    # YouTube Data API v3 (influencer discovery — optional, falls back to SearchAPI/SERP)
    youtube_api_key: str = ""

    # SearchAPI.io (influencer discovery — optional, falls back to SERP)
    # https://www.searchapi.io — supports engine=youtube with subscriber counts
    searchapi_key: str = ""

    # Google Custom Search Engine — Instagram discovery (100 free queries/day)
    # Create a CSE at https://programmablesearchengine.google.com/  (restrict to instagram.com)
    # API key from Google Cloud Console (same project as YouTube API if using both)
    google_cse_key: str = ""
    google_cse_cx: str = ""   # CX = Search Engine ID (e.g. "017576662512468239146:omuauf_lfve")

    # Apify — Instagram follower count enrichment (~$5/mo free = ~2,500 profiles)
    # https://apify.com  →  actor: apify/instagram-profile-scraper
    apify_token: str = ""

    # DataForSEO (keyword research, SERP analysis)
    dataforseo_login: str = ""
    dataforseo_password: str = ""

    # Rate Limits (RPM)
    openai_rpm: int = 60
    anthropic_rpm: int = 50
    gemini_rpm: int = 60
    perplexity_rpm: int = 50
    serp_rpm: int = 100

    # App
    secret_key: str = "change-me-in-production"
    cors_origins: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
