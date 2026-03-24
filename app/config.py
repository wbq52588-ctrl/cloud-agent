from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "multi-model-agent"
    app_env: str = "development"
    openai_api_key: str | None = None
    gemini_api_key: str | None = None
    default_openai_model: str = "gpt-4.1-mini"
    default_gemini_model: str = "gemini-2.5-flash"
    session_store_path: str = "data/sessions.json"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
