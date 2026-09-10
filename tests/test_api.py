from fastapi.testclient import TestClient
from pydantic import ValidationError

from api.chat import ChatRequest
from api.chat import _parse_chat_response
from api import deps
from api.deps import OpenRouterClient
from api.extract import ExtractRequest
from api import chat as chat_api
from api import gardens as gardens_api
from api import writes as writes_api
from api.index import app


client = TestClient(app)


def test_chat_response_parser_accepts_fenced_json_and_plain_text():
    fenced = _parse_chat_response('```json\n{"reply":"Hello","create_events":[],"edit_events":[]}\n```')
    plain = _parse_chat_response("Hello! Your tomato looks like it could use water.")

    assert fenced.reply == "Hello"
    assert plain.reply == "Hello! Your tomato looks like it could use water."
    assert plain.create_events == []
    assert plain.edit_events == []


def test_openrouter_client_sends_openai_compatible_request(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "{\"reply\":\"Hello\"}"}}]}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return FakeResponse()

    monkeypatch.setattr(deps.httpx, "post", fake_post)
    response = OpenRouterClient("test-key").chat.complete(
        model="openai/test-model",
        messages=[{"role": "user", "content": "Hello"}],
        response_format={"type": "json_object"},
    )

    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["kwargs"]["headers"]["Authorization"] == "Bearer test-key"
    assert captured["kwargs"]["json"] == {
        "model": "openai/test-model",
        "messages": [{"role": "user", "content": "Hello"}],
        "response_format": {"type": "json_object"},
    }
    assert response.choices[0].message.content == '{"reply":"Hello"}'


def test_openrouter_client_retries_without_response_format(monkeypatch):
    requests = []

    class FakeResponse:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

        @property
        def text(self):
            return "response_format is not supported"

    def fake_post(_url, **kwargs):
        requests.append(kwargs["json"].copy())
        if len(requests) == 1:
            return FakeResponse(400, {"error": {"message": "response_format is not supported"}})
        return FakeResponse(200, {"choices": [{"message": {"content": "{\"reply\":\"Hello\"}"}}]})

    monkeypatch.setattr(deps.httpx, "post", fake_post)
    response = OpenRouterClient("test-key").chat.complete(
        model="openai/test-model",
        messages=[{"role": "user", "content": "Hello"}],
        response_format={"type": "json_object"},
    )

    assert response.choices[0].message.content == '{"reply":"Hello"}'
    assert requests == [
        {
            "model": "openai/test-model",
            "messages": [{"role": "user", "content": "Hello"}],
            "response_format": {"type": "json_object"},
        },
        {
            "model": "openai/test-model",
            "messages": [{"role": "user", "content": "Hello"}],
        },
    ]


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


def test_chat_updates_owned_event(monkeypatch):
    class FakeQuery:
        def __init__(self, table):
            self.table = table
            self.filters = {}
            self.values = None

        def select(self, _columns):
            return self

        def eq(self, column, value):
            self.filters[column] = value
            return self

        def order(self, _column, desc=False):
            return self

        def limit(self, _value):
            return self

        def update(self, values):
            self.values = values
            return self

        def execute(self):
            if self.table == "gardens":
                return type("Result", (), {"data": [{"id": "garden-1"}]})()
            if self.table == "garden_events" and self.values is None:
                return type(
                    "Result",
                    (),
                    {"data": [{"id": "event-1", "garden_id": "garden-1", "entity_type": "garden", "entity_id": "garden-1"}]},
                )()
            if self.table == "garden_events" and self.values is not None:
                assert self.filters == {"id": "event-1", "garden_id": "garden-1"}
                return type("Result", (), {"data": [{"id": "event-1", **self.values}]})()
            return type("Result", (), {"data": []})()

    class FakeSupabase:
        def table(self, table):
            return FakeQuery(table)

    class FakeOpenRouter:
        class chat:
            @staticmethod
            def complete(**_kwargs):
                return type(
                    "Response",
                    (),
                    {
                        "choices": [
                            type(
                                "Choice",
                                (),
                                {
                                    "message": type(
                                        "Message",
                                        (),
                                        {
                                            "content": '{"reply":"Corrected it.","create_events":[],"edit_events":[{"event_id":"event-1","payload":{"amount_l":2},"note":"Actually used two liters"}]}'
                                        },
                                    )()
                                },
                            )()
                        ]
                    },
                )()

    monkeypatch.setattr(chat_api, "openrouter_client", FakeOpenRouter())
    app.dependency_overrides[chat_api.get_current_user] = lambda: "user-1"
    app.dependency_overrides[chat_api.get_db] = lambda: FakeSupabase()
    try:
        response = client.post(
            "/api/chat",
            json={"garden_id": "garden-1", "messages": [{"role": "user", "content": "Actually I used two liters"}]},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["reply"] == "Corrected it."
    assert response.json()["updated_events"] == [{"id": "event-1", "payload": {"amount_l": 2}, "note": "Actually used two liters"}]


def test_chat_creates_event_for_owned_planting(monkeypatch):
    inserted = []

    class FakeQuery:
        def __init__(self, table):
            self.table = table
            self.rows = []

        def select(self, _columns):
            return self

        def eq(self, _column, _value):
            return self

        def order(self, _column, desc=False):
            return self

        def limit(self, _value):
            return self

        def insert(self, rows):
            self.rows = rows
            inserted.extend(rows)
            return self

        def execute(self):
            if self.table == "gardens":
                return type("Result", (), {"data": [{"id": "garden-1"}]})()
            if self.table == "plantings":
                return type("Result", (), {"data": [{"id": "planting-1"}]})()
            if self.table == "garden_events" and self.rows:
                return type("Result", (), {"data": [{**self.rows[0], "id": "event-2"}]})()
            return type("Result", (), {"data": []})()

    class FakeSupabase:
        def table(self, table):
            return FakeQuery(table)

    class FakeOpenRouter:
        class chat:
            @staticmethod
            def complete(**_kwargs):
                return type(
                    "Response",
                    (),
                    {
                        "choices": [
                            type(
                                "Choice",
                                (),
                                {
                                    "message": type(
                                        "Message",
                                        (),
                                        {
                                            "content": '{"reply":"Logged it.","create_events":[{"entity_type":"planting","entity_id":"planting-1","event_type":"watering","category":"action","payload":{"amount_l":1}}],"edit_events":[]}'
                                        },
                                    )()
                                },
                            )()
                        ]
                    },
                )()

    monkeypatch.setattr(chat_api, "openrouter_client", FakeOpenRouter())
    app.dependency_overrides[chat_api.get_current_user] = lambda: "user-1"
    app.dependency_overrides[chat_api.get_db] = lambda: FakeSupabase()
    try:
        response = client.post(
            "/api/chat",
            json={"garden_id": "garden-1", "messages": [{"role": "user", "content": "Watered my tomato"}]},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["created_events"][0]["id"] == "event-2"
    assert inserted[0]["garden_id"] == "garden-1"


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