from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "deepseek-workspace"
    app_env: str = "development"
    deepseek_api_key: str | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    app_access_password: str | None = None
    default_deepseek_model: str = "deepseek-v4-pro"
    session_store_path: str = "data/sessions.db"
    session_ttl_days: int = 30
    provider_timeout_seconds: float = 45.0
    provider_max_retries: int = 1
    provider_retry_base_delay: float = 1.2
    cors_origins: list[str] = ["*"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
