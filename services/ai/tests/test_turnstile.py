import httpx

from app import turnstile


class FakeResp:
    def __init__(self, success: bool):
        self._success = success

    def json(self):
        return {"success": self._success}


class FakeHTTP:
    def __init__(self, success=True, raises=False):
        self.success = success
        self.raises = raises
        self.calls = 0

    async def post(self, url, data=None, timeout=None):
        self.calls += 1
        if self.raises:
            raise httpx.ConnectError("cf down")
        return FakeResp(self.success)


async def test_empty_token_fails_without_network() -> None:
    http = FakeHTTP()
    assert await turnstile.verify("", "1.2.3.4", http) is False
    assert http.calls == 0  # short-circuit — no siteverify call


async def test_success() -> None:
    assert await turnstile.verify("tok", "1.2.3.4", FakeHTTP(success=True)) is True


async def test_failure() -> None:
    assert await turnstile.verify("tok", "1.2.3.4", FakeHTTP(success=False)) is False


async def test_cf_outage_fails_closed() -> None:
    http = FakeHTTP(raises=True)
    assert await turnstile.verify("tok", "1.2.3.4", http) is False
    assert http.calls == 1  # attempted, then fail-closed
