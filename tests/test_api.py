from fastapi.testclient import TestClient
from pydantic import ValidationError

from api.chat import ChatRequest
from api import deps
from api.extract import ExtractRequest
from api import gardens as gardens_api
from api.index import app


client = TestClient(app)


def test_health_endpoint_reports_ready():
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_chat_request_rejects_oversized_messages():
    oversized_message = {"role": "user", "content": "x" * 4001}

    try:
        ChatRequest(garden_id="garden", messages=[oversized_message])
    except ValidationError:
        return

    raise AssertionError("oversized chat messages must be rejected")


def test_extract_request_rejects_oversized_notes():
    try:
        ExtractRequest(garden_id="garden", note="x" * 10001)
    except ValidationError:
        return

    raise AssertionError("oversized extraction notes must be rejected")


def test_gardens_endpoint_returns_owned_gardens_with_related_data(monkeypatch):
    class FakeQuery:
        def __init__(self, table):
            self.table = table

        def select(self, _columns):
            return self

        def eq(self, _column, _value):
            return self

        def in_(self, _column, _values):
            return self

        def execute(self):
            rows = {
                "gardens": [{"id": "garden-1", "name": "My test garden", "type": "balcony"}],
                "plantings": [{"id": "planting-1", "garden_id": "garden-1", "species": "Tomato"}],
                "containers": [{"id": "container-1", "garden_id": "garden-1", "name": "Pot"}],
                "garden_events": [],
            }
            return type("Result", (), {"data": rows[self.table]})()

    class FakeSupabase:
        def table(self, table):
            return FakeQuery(table)

    monkeypatch.setattr(gardens_api, "supabase", FakeSupabase())
    app.dependency_overrides[gardens_api.get_current_user] = lambda: "user-1"
    try:
        response = client.get("/api/gardens")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "gardens": [
            {
                "id": "garden-1",
                "name": "My test garden",
                "type": "balcony",
                "plantings": [{"id": "planting-1", "garden_id": "garden-1", "species": "Tomato"}],
                "containers": [{"id": "container-1", "garden_id": "garden-1", "name": "Pot"}],
                "events": [],
            }
        ]
    }


def test_current_user_forwards_bearer_token_to_database_client(monkeypatch):
    class FakeAuth:
        def get_user(self, token):
            assert token == "access-token"
            return type("Response", (), {"user": type("User", (), {"id": "user-1"})()})()

    class FakePostgrest:
        def auth(self, token):
            self.token = token

    postgrest = FakePostgrest()
    monkeypatch.setattr(deps, "supabase", type("Client", (), {"auth": FakeAuth(), "postgrest": postgrest})())

    assert deps.get_current_user("Bearer access-token") == "user-1"
    assert postgrest.token == "access-token"