from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "multi-model-agent"
    app_env: str = "development"
    openai_api_key: str | None = None
    gemini_api_key: str | None = None
    zhipu_api_key: str | None = None
    zhipu_base_url: str = "https://open.bigmodel.cn/api/paas/v4"
    zhipu_coding_base_url: str = "https://open.bigmodel.cn/api/coding/paas/v4"
    app_access_password: str | None = None
    default_openai_model: str = "gpt-4.1-mini"
    default_gemini_model: str = "gemini-2.5-flash"
    default_zhipu_model: str = "glm-4.7"
    session_store_path: str = "data/sessions.json"
    provider_timeout_seconds: float = 45.0
    provider_max_retries: int = 1

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
