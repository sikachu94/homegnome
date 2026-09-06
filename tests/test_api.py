from fastapi.testclient import TestClient
from pydantic import ValidationError

from api.chat import ChatRequest
from api.extract import ExtractRequest
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