"""12-factor configuration — env only, no files. Secrets are SecretStr (never in repr/logs)."""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Official Cloudflare Turnstile always-pass TEST secret — the real key swaps in via the k8s Secret.
TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    database_url: SecretStr = SecretStr("")  # empty ⇒ db features degrade, service still boots
    anthropic_api_key: SecretStr = SecretStr("")  # empty ⇒ oracle endpoints 503 honestly (P4)
    anthropic_model: str = "claude-haiku-4-5"
    turnstile_secret: SecretStr = SecretStr(TURNSTILE_TEST_SECRET)
    rate_limit_rps: float = 5.0
    rate_limit_burst: int = 10
    max_streams: int = 8
    daily_budget_usd: float = 2.0
    price_in_per_mtok: float = 1.0
    price_out_per_mtok: float = 5.0
    cors_origin: str = "https://gipc.dev"

    @property
    def anthropic_configured(self) -> bool:
        return bool(self.anthropic_api_key.get_secret_value())


@lru_cache
def get_settings() -> Settings:
    return Settings()
