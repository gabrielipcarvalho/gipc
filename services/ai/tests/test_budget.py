import pytest

from app import budget
from app.config import Settings

CFG = Settings(daily_budget_usd=2.0, price_in_per_mtok=1.0, price_out_per_mtok=5.0, audit_salt="s")


def test_est_cost() -> None:
    # 1_000_000 in @ $1 + 1_000_000 out @ $5 = $6
    assert budget.est_cost(1_000_000, 1_000_000, CFG) == pytest.approx(6.0)
    assert budget.est_cost(0, 0, CFG) == 0.0


def test_ip_hash_salted_and_short() -> None:
    h = budget.ip_hash("203.0.113.7", CFG)
    assert len(h) == 16
    assert h != budget.ip_hash("203.0.113.8", CFG)
    assert h != "203.0.113.7"  # never the raw ip


class FakeCursor:
    def __init__(self, row):
        self._row = row

    async def fetchone(self):
        return self._row


class FakeConn:
    def __init__(self, row, raises=False):
        self._row = row
        self.raises = raises
        self.executed: list[str] = []

    async def execute(self, sql, params=None):
        if self.raises:
            raise RuntimeError("db down")
        self.executed.append(sql)
        return FakeCursor(self._row)

    async def commit(self):
        pass


class FakePool:
    def __init__(self, row=None, raises=False):
        self.conn = FakeConn(row, raises)

    def connection(self, timeout=None):
        conn = self.conn

        class _Ctx:
            async def __aenter__(self):
                return conn

            async def __aexit__(self, *a):
                return False

        return _Ctx()


async def test_budget_remaining_no_row_is_full_budget() -> None:
    # empty result (no spend today) → full budget, NOT None (else first request each day self-locks)
    assert await budget.budget_remaining(FakePool(row=None), CFG) == pytest.approx(2.0)


async def test_budget_remaining_with_spend() -> None:
    assert await budget.budget_remaining(FakePool(row=[1.5]), CFG) == pytest.approx(0.5)


async def test_budget_remaining_none_pool_fails_closed() -> None:
    assert await budget.budget_remaining(None, CFG) is None


async def test_budget_remaining_db_error_fails_closed() -> None:
    assert await budget.budget_remaining(FakePool(raises=True), CFG) is None


async def test_add_spend_upserts() -> None:
    pool = FakePool()
    await budget.add_spend(pool, 0.01)
    assert any("ON CONFLICT (day)" in s for s in pool.conn.executed)


async def test_add_spend_noop_on_zero() -> None:
    pool = FakePool()
    await budget.add_spend(pool, 0.0)
    assert pool.conn.executed == []
