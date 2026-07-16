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
    # eval-harness only: a DIFFERENT model to judge faithfulness (env JUDGE_MODEL). Empty ⇒
    # falls back to anthropic_model (self-judge, the pre-Sprint-I behaviour).
    judge_model: str = ""
    turnstile_secret: SecretStr = SecretStr(TURNSTILE_TEST_SECRET)
    rate_limit_rps: float = 5.0
    rate_limit_burst: int = 10
    max_streams: int = 8
    daily_budget_usd: float = 2.0
    price_in_per_mtok: float = 1.0
    price_out_per_mtok: float = 5.0
    cors_origin: str = "https://gipc.dev"
    # oracle (P4)
    audit_salt: SecretStr = SecretStr("")  # ip-hash salt — generated into the k8s Secret at deploy
    core_base: str = "https://gipc.dev"  # tools GET the site's own public APIs
    oracle_rate_per_10min: int = 10  # strict per-IP oracle budget
    oracle_max_tokens: int = 700
    oracle_history_turns: int = 6
    oracle_history_char_cap: int = 4000
    tool_rounds_max: int = 4
    jd_rate_per_hour: int = 3  # stricter — the JD analyzer is expensive
    jd_max_tokens: int = 3500
    # local inference demo (Sprint G P3) — self-hosted Ollama, in-cluster only
    ollama_url: str = "http://ollama:11434"
    ollama_model: str = "qwen2.5:0.5b-instruct"
    infer_max_tokens: int = 256
    infer_prompt_max: int = 500
    infer_connect_timeout_s: float = 5.0
    infer_read_timeout_s: float = 30.0  # per read op — a stalled stream holds the single slot <=30s
    infer_rate_per_10min: int = 10

    @property
    def anthropic_configured(self) -> bool:
        return bool(self.anthropic_api_key.get_secret_value())

    @property
    def turnstile_enabled(self) -> bool:
        """Enforce Turnstile only when a REAL secret is set. With the official test secret (or none),
        the widget is a placeholder that shows 'For testing only' — so run in graceful mode: no bot-gate,
        relying on the per-IP limiter + the daily budget breaker. Real key → full enforcement."""
        secret = self.turnstile_secret.get_secret_value()
        return bool(secret) and secret != TURNSTILE_TEST_SECRET


@lru_cache
def get_settings() -> Settings:
    return Settings()
