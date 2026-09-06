from fastapi.testclient import TestClient
from pydantic import ValidationError

from api.chat import ChatRequest
from api import deps
from api.extract import ExtractRequest
from api import gardens as gardens_api
from api import writes as writes_api
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
                "plantings": [{
                    "id": "planting-1",
                    "garden_id": "garden-1",
                    "plant_id": "plant-1",
                    "plants": {"id": "plant-1", "plant_name": "Tomato"},
                }],
                "containers": [{"id": "container-1", "garden_id": "garden-1", "name": "Pot"}],
                "garden_events": [],
            }
            return type("Result", (), {"data": rows[self.table]})()

    class FakeSupabase:
        def table(self, table):
            return FakeQuery(table)

    app.dependency_overrides[gardens_api.get_current_user] = lambda: "user-1"
    app.dependency_overrides[gardens_api.get_db] = lambda: FakeSupabase()
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
                "plantings": [{
                    "id": "planting-1",
                    "garden_id": "garden-1",
                    "plant_id": "plant-1",
                    "species": "Tomato",
                    "species_info": {
                        "harvest_type": None,
                        "life_cycle_type": None,
                        "latin_name": None,
                        "variety": None,
                    },
                }],
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

    monkeypatch.setattr(deps, "_auth_client", type("Client", (), {"auth": FakeAuth()})())
    assert deps.get_current_user("Bearer access-token") == "user-1"

    postgrest = FakePostgrest()
    monkeypatch.setattr(deps, "create_client", lambda _url, _key: type("Client", (), {"postgrest": postgrest})())
    db = deps.get_db("Bearer access-token")
    assert db.postgrest.token == "access-token"


def test_create_planting_persists_container_planting_and_setup_events(monkeypatch):
    class FakeQuery:
        def __init__(self, table):
            self.table = table

        def select(self, _columns):
            return self

        def eq(self, _column, _value):
            return self

        def limit(self, _value):
            return self

        def insert(self, rows):
            self.rows = rows
            return self

        def execute(self):
            if self.table == "gardens":
                return type("Result", (), {"data": [{"id": "garden-1"}]})()
            if self.table == "plants":
                return type("Result", (), {"data": [{"id": "plant-db-id", "plant_name": "Tomato"}]})()
            generated_id = {
                "containers": "container-db-id",
                "plantings": "planting-db-id",
                "garden_events": f"event-db-{self.rows[0].get('event_type', 'setup')}",
            }[self.table]
            row = {**self.rows[0], "id": generated_id}
            return type("Result", (), {"data": [row]})()

    class FakeSupabase:
        def table(self, table):
            return FakeQuery(table)

    fake_supabase = FakeSupabase()
    app.dependency_overrides[writes_api.get_current_user] = lambda: "user-1"
    app.dependency_overrides[writes_api.get_db] = lambda: fake_supabase
    try:
        response = client.post(
            "/api/gardens/garden-1/plantings",
            json={
                "container": {"id": "container-1", "name": "Tomato pot"},
                "planting": {"id": "planting-1", "species": "Tomato", "nickname": "Tom"},
                "events": [
                    {"id": "event-1", "entity_type": "container", "entity_id": "container-1", "event_type": "container_setup"},
                    {"id": "event-2", "entity_type": "planting", "entity_id": "planting-1", "event_type": "planting_setup", "payload": {"container_id": "container-1"}},
                ],
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["planting"]["garden_id"] == "garden-1"
    assert response.json()["planting"]["plant_id"] == "plant-db-id"
    assert response.json()["container"]["garden_id"] == "garden-1"
    assert len(response.json()["events"]) == 2
    assert {event["entity_id"] for event in response.json()["events"]} == {"container-db-id", "planting-db-id"}
    planting_event = next(event for event in response.json()["events"] if event["event_type"] == "planting_setup")
    assert planting_event["payload"]["container_id"] == "container-db-id"


def test_create_planting_allows_existing_container_using_reference_plant_catalog(monkeypatch):
    class FakeQuery:
        def __init__(self, table):
            self.table = table
            self.rows = []
            self._eq = None

        def select(self, _columns):
            return self

        def eq(self, _column, _value):
            self._eq = (_column, _value)
            return self

        def limit(self, _value):
            return self

        def insert(self, rows):
            self.rows = rows
            return self

        def execute(self):
            if self.table == "gardens":
                return type("Result", (), {"data": [{"id": "garden-1"}]})()
            if self.table == "plants":
                return type("Result", (), {"data": [{"id": "plant-reference-id", "plant_name": "Tomato"}]})()
            if self.table == "containers":
                if self.rows:
                    return type("Result", (), {"data": [{**self.rows[0], "id": "container-existing-id"}]})()
                return type("Result", (), {"data": [{"id": "container-existing-id"}]})()
            if self.table == "plantings":
                row = {**self.rows[0], "id": "planting-db-id"}
                return type("Result", (), {"data": [row]})()
            if self.table == "garden_events":
                row = {**self.rows[0], "id": "event-db-id"}
                return type("Result", (), {"data": [row]})()
            return type("Result", (), {"data": []})()

    class FakeSupabase:
        def table(self, table):
            return FakeQuery(table)

    fake_supabase = FakeSupabase()
    app.dependency_overrides[writes_api.get_current_user] = lambda: "user-1"
    app.dependency_overrides[writes_api.get_db] = lambda: fake_supabase
    try:
        response = client.post(
            "/api/gardens/garden-1/plantings",
            json={
                "container_id": "container-existing-id",
                "planting": {"id": "planting-1", "species": "Tomato", "nickname": "Tom"},
                "events": [
                    {"id": "event-1", "entity_type": "container", "entity_id": "container-existing-id", "event_type": "container_setup"},
                    {"id": "event-2", "entity_type": "planting", "entity_id": "planting-1", "event_type": "planting_setup"},
                ],
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["planting"]["plant_id"] == "plant-reference-id"
    assert response.json()["container"]["id"] == "container-existing-id"


def test_create_planting_auto_logs_default_lifecycle_events(monkeypatch):
    class FakeQuery:
        def __init__(self, table):
            self.table = table
            self.rows = []

        def select(self, _columns):
            return self

        def eq(self, _column, _value):
            return self

        def limit(self, _value):
            return self

        def insert(self, rows):
            self.rows = rows
            return self

        def execute(self):
            if self.table == "gardens":
                return type("Result", (), {"data": [{"id": "garden-1"}]})()
            if self.table == "plants":
                return type("Result", (), {"data": [{"id": "plant-reference-id", "plant_name": "Tomato"}]})()
            if self.table == "containers":
                row = {**self.rows[0], "id": "container-new-id"}
                return type("Result", (), {"data": [row]})()
            if self.table == "plantings":
                row = {**self.rows[0], "id": "planting-new-id"}
                return type("Result", (), {"data": [row]})()
            if self.table == "garden_events":
                row = {**self.rows[0], "id": f"event-{self.rows[0].get('event_type')}-{self.rows[0].get('entity_type')}"}
                return type("Result", (), {"data": [row]})()
            return type("Result", (), {"data": []})()

    class FakeSupabase:
        def table(self, table):
            return FakeQuery(table)

    fake_supabase = FakeSupabase()
    app.dependency_overrides[writes_api.get_current_user] = lambda: "user-1"
    app.dependency_overrides[writes_api.get_db] = lambda: fake_supabase
    try:
        response = client.post(
            "/api/gardens/garden-1/plantings",
            json={
                "container": {"name": "New pot"},
                "planting": {"species": "Tomato", "nickname": "Vista"},
                "events": [],
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    event_types = {event["event_type"] for event in response.json()["events"]}
    assert event_types == {"container_setup", "planting_setup"}


def test_append_event_rejects_entity_outside_owned_garden(monkeypatch):
    class FakeQuery:
        def select(self, _columns):
            return self

        def eq(self, _column, _value):
            return self

        def limit(self, _value):
            return self

        def execute(self):
            return type("Result", (), {"data": []})()

    class FakeSupabase:
        def table(self, _table):
            return FakeQuery()

    fake_supabase = FakeSupabase()
    app.dependency_overrides[writes_api.get_current_user] = lambda: "user-1"
    app.dependency_overrides[writes_api.get_db] = lambda: fake_supabase
    try:
        response = client.post(
            "/api/gardens/garden-1/events",
            json={
                "entity_type": "planting",
                "entity_id": "other-planting",
                "event_type": "watering",
                "category": "action",
                "source": "self",
                "payload": {"amount_l": 1},
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


def test_append_event_persists_event_for_owned_entity(monkeypatch):
    class FakeQuery:
        def __init__(self, table):
            self.table = table
            self.filters = {}
            self.rows = []

        def select(self, _columns):
            return self

        def eq(self, column, value):
            self.filters[column] = value
            return self

        def limit(self, _value):
            return self

        def insert(self, rows):
            self.rows = rows
            return self

        def execute(self):
            if self.table == "gardens":
                return type("Result", (), {"data": [{"id": "garden-1"}]})()
            if self.table == "plantings":
                return type("Result", (), {"data": [{"id": "planting-1"}]})()
            row = {**self.rows[0], "id": "event-1"}
            return type("Result", (), {"data": [row]})()

    class FakeSupabase:
        def table(self, table):
            return FakeQuery(table)

    fake_supabase = FakeSupabase()
    app.dependency_overrides[writes_api.get_current_user] = lambda: "user-1"
    app.dependency_overrides[writes_api.get_db] = lambda: fake_supabase
    try:
        response = client.post(
            "/api/gardens/garden-1/events",
            json={
                "entity_type": "planting",
                "entity_id": "planting-1",
                "event_type": "watering",
                "category": "action",
                "source": "self",
                "payload": {"amount_l": 1},
            },
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["event"] == {
        "entity_type": "planting",
        "entity_id": "planting-1",
        "event_type": "watering",
        "category": "action",
        "source": "self",
        "payload": {"amount_l": 1},
        "garden_id": "garden-1",
        "id": "event-1",
    }


def test_update_garden_persists_allowed_metadata(monkeypatch):
    class FakeQuery:
        def __init__(self):
            self.values = {}

        def select(self, _columns):
            return self

        def eq(self, _column, _value):
            return self

        def limit(self, _value):
            return self

        def update(self, values):
            self.values = values
            return self

        def execute(self):
            return type("Result", (), {"data": [{"id": "garden-1", **self.values}]})()

    class FakeSupabase:
        def table(self, _table):
            return FakeQuery()

    fake_supabase = FakeSupabase()
    app.dependency_overrides[writes_api.get_current_user] = lambda: "user-1"
    app.dependency_overrides[writes_api.get_db] = lambda: fake_supabase
    try:
        response = client.patch(
            "/api/gardens/garden-1",
            json={"name": "Updated garden", "type": "backyard", "notes": "Sunny"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["garden"]["name"] == "Updated garden"