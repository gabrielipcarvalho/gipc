from app.config import TURNSTILE_TEST_SECRET, Settings


def test_defaults() -> None:
    s = Settings()
    assert s.port == 8000
    assert s.anthropic_model == "claude-haiku-4-5"
    assert s.turnstile_secret.get_secret_value() == TURNSTILE_TEST_SECRET
    assert s.rate_limit_rps == 5.0
    assert s.rate_limit_burst == 10
    assert s.daily_budget_usd == 2.0
    assert s.cors_origin == "https://gipc.dev"
    assert s.anthropic_configured is False


def test_env_overrides(monkeypatch) -> None:
    monkeypatch.setenv("PORT", "9000")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-not-a-real-key")
    monkeypatch.setenv("RATE_LIMIT_RPS", "2.5")
    s = Settings()
    assert s.port == 9000
    assert s.anthropic_configured is True
    assert s.rate_limit_rps == 2.5


def test_secrets_never_in_repr(monkeypatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-not-a-real-key")
    monkeypatch.setenv("DATABASE_URL", "postgresql://gipc:supersecret@host/db")
    s = Settings()
    blob = repr(s) + str(s)
    assert "sk-ant-test-not-a-real-key" not in blob
    assert "supersecret" not in blob
