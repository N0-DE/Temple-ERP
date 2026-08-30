from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_settings_endpoint_returns_default_values():
    response = client.get("/api/v1/family-contributions/settings")
    assert response.status_code == 200
    payload = response.json()
    assert payload["masavari_amount"] >= 0
    assert payload["financial_year"]


def test_families_crud_flow():
    import uuid
    fam_num = f"FAM-{uuid.uuid4().hex[:6].upper()}"
    create_response = client.post(
        "/api/v1/family-contributions/families",
        json={
            "family_number": fam_num,
            "head_of_family": "Test Head",
            "house_name": "Test House",
            "ward": "Ward 1",
        },
    )
    assert create_response.status_code == 200
    family = create_response.json()
    assert family["family_number"] == fam_num

    list_response = client.get("/api/v1/family-contributions/families", params={"search": fam_num})
    assert list_response.status_code == 200
    data = list_response.json()
    assert "items" in data
    assert any(item["id"] == family["id"] for item in data["items"])


def test_duplicate_category_creation_is_idempotent():
    payload = {
        "name": "Masavari",
        "slug": "masavari",
        "description": "Fixed monthly contribution",
        "category_type": "monthly",
        "default_amount": 0,
        "minimum_amount": 0,
        "is_fixed": True,
        "is_monthly": True,
        "is_active": True,
    }

    first_response = client.post("/api/v1/family-contributions/categories", json=payload)
    second_response = client.post("/api/v1/family-contributions/categories", json=payload)

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.json()["slug"] == "masavari"


def test_outstanding_endpoint():
    response = client.get("/api/v1/family-contributions/outstanding")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data


def test_fifo_masavari_payment():
    import uuid
    fam_num = f"FAM-FIFO-{uuid.uuid4().hex[:4].upper()}"
    settings = client.get("/api/v1/family-contributions/settings").json()
    client.put("/api/v1/family-contributions/settings", json={**settings, "masavari_amount": 100})

    create = client.post(
        "/api/v1/family-contributions/families",
        json={
            "family_number": fam_num,
            "head_of_family": "FIFO Test",
            "joining_date": "2026-01-01",
        },
    )
    assert create.status_code == 200
    family = create.json()

    categories = client.get("/api/v1/family-contributions/categories").json()
    masavari = next(c for c in categories if c["slug"] == "masavari")

    payment = client.post(
        "/api/v1/family-contributions/payments",
        json={
            "family_id": family["id"],
            "category_id": masavari["id"],
            "amount": 100,
            "payment_date": "2026-04-15",
            "payment_mode": "Cash",
        },
    )
    assert payment.status_code == 200
    assert payment.json()["amount"] == 100

    outstanding = client.get(f"/api/v1/family-contributions/outstanding/{family['id']}").json()
    assert "outstanding" in outstanding
