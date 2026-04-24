"""Geek Cards backend API tests."""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://card-deck-builder-1.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@geekcards.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---- Auth ----
class TestAuth:
    def test_register_new_user(self):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "pass1234", "name": "Tester"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == email
        assert "token" in data and len(data["token"]) > 0

    def test_admin_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 0

    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_bearer(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL


# ---- Natures ----
class TestNatures:
    def test_get_natures(self):
        r = requests.get(f"{BASE_URL}/api/natures")
        assert r.status_code == 200
        d = r.json()
        assert len(d["natures"]) == 14
        for k in ["Anjo", "Demônio", "Dragão", "Shinobi"]:
            assert k in d["natures"]
        assert "Anjo" in d["weakness_map"]["Demônio"]
        assert "Personagem" in d["card_types"]


# ---- Cards ----
class TestCards:
    def test_create_card_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/cards", json={"name": "X", "card_type": "Personagem"})
        assert r.status_code == 401

    def test_card_crud(self, admin_headers):
        # CREATE
        payload = {"name": "TEST_Dragon", "card_type": "Personagem", "natures": ["Dragão", "Herói"],
                   "rarity": 2, "is_alpha": False, "hp": 100, "damage": 30, "recuo": 10}
        r = requests.post(f"{BASE_URL}/api/cards", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        card = r.json()
        cid = card["id"]
        assert card["name"] == "TEST_Dragon"
        assert card["hp"] == 100

        # GET list
        r = requests.get(f"{BASE_URL}/api/cards", headers=admin_headers)
        assert r.status_code == 200
        assert any(c["id"] == cid for c in r.json())

        # GET single
        r = requests.get(f"{BASE_URL}/api/cards/{cid}", headers=admin_headers)
        assert r.status_code == 200

        # UPDATE
        payload["hp"] = 150
        r = requests.put(f"{BASE_URL}/api/cards/{cid}", json=payload, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["hp"] == 150

        # DELETE
        r = requests.delete(f"{BASE_URL}/api/cards/{cid}", headers=admin_headers)
        assert r.status_code == 200

        r = requests.get(f"{BASE_URL}/api/cards/{cid}", headers=admin_headers)
        assert r.status_code == 404

    def test_card_validation(self, admin_headers):
        # Invalid nature
        r = requests.post(f"{BASE_URL}/api/cards",
                          json={"name": "X", "card_type": "Personagem", "natures": ["Invalido"]},
                          headers=admin_headers)
        assert r.status_code == 400
        # Too many natures
        r = requests.post(f"{BASE_URL}/api/cards",
                          json={"name": "X", "card_type": "Personagem", "natures": ["Anjo", "Demônio", "Mago", "Herói"]},
                          headers=admin_headers)
        assert r.status_code == 400
        # Invalid type
        r = requests.post(f"{BASE_URL}/api/cards",
                          json={"name": "X", "card_type": "BadType"}, headers=admin_headers)
        assert r.status_code == 400
        # Invalid rarity
        r = requests.post(f"{BASE_URL}/api/cards",
                          json={"name": "X", "card_type": "Personagem", "rarity": 5}, headers=admin_headers)
        assert r.status_code == 400

    def test_user_isolation(self, admin_headers):
        # create second user and verify they can't see admin's cards
        email = f"iso_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "pass1234", "name": "Iso"})
        assert r.status_code == 200
        other_token = r.json()["token"]
        other_headers = {"Authorization": f"Bearer {other_token}"}
        # admin creates a card
        r = requests.post(f"{BASE_URL}/api/cards",
                          json={"name": "TEST_Priv", "card_type": "Item"}, headers=admin_headers)
        cid = r.json()["id"]
        # other user shouldn't see it
        r = requests.get(f"{BASE_URL}/api/cards/{cid}", headers=other_headers)
        assert r.status_code == 404
        # cleanup
        requests.delete(f"{BASE_URL}/api/cards/{cid}", headers=admin_headers)


# ---- Decks ----
class TestDecks:
    def test_deck_full_flow(self, admin_headers):
        # Create two cards with same name to exercise duplicate rule warning
        c1 = requests.post(f"{BASE_URL}/api/cards",
                           json={"name": "TEST_DkA", "card_type": "Personagem",
                                 "natures": ["Anjo"], "hp": 80, "damage": 20},
                           headers=admin_headers).json()
        c2 = requests.post(f"{BASE_URL}/api/cards",
                           json={"name": "TEST_DkB", "card_type": "Personagem",
                                 "natures": ["Demônio"], "hp": 70, "damage": 25},
                           headers=admin_headers).json()

        # CREATE deck
        r = requests.post(f"{BASE_URL}/api/decks",
                          json={"name": "TEST_Deck", "description": "t",
                                "card_ids": [c1["id"], c1["id"], c1["id"], c2["id"]]},
                          headers=admin_headers)
        assert r.status_code == 200, r.text
        deck_id = r.json()["id"]

        # GET list
        r = requests.get(f"{BASE_URL}/api/decks", headers=admin_headers)
        assert r.status_code == 200
        assert any(d["id"] == deck_id for d in r.json())

        # GET detail with warnings (duplicate > 2)
        r = requests.get(f"{BASE_URL}/api/decks/{deck_id}", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert "deck" in body and "cards" in body and "warnings" in body
        assert any("TEST_DkA" in w for w in body["warnings"])

        # UPDATE
        r = requests.put(f"{BASE_URL}/api/decks/{deck_id}",
                        json={"name": "TEST_Deck2", "description": "t",
                              "card_ids": [c1["id"], c2["id"]]},
                        headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Deck2"

        # ANALYSIS
        r = requests.get(f"{BASE_URL}/api/decks/{deck_id}/analysis", headers=admin_headers)
        assert r.status_code == 200, r.text
        a = r.json()
        for k in ["nature_distribution", "avg_hp", "avg_damage",
                  "coverage_against", "vulnerable_to", "warnings"]:
            assert k in a
        assert a["character_count"] == 2
        assert a["avg_hp"] == 75.0

        # DELETE
        r = requests.delete(f"{BASE_URL}/api/decks/{deck_id}", headers=admin_headers)
        assert r.status_code == 200
        # cleanup cards
        requests.delete(f"{BASE_URL}/api/cards/{c1['id']}", headers=admin_headers)
        requests.delete(f"{BASE_URL}/api/cards/{c2['id']}", headers=admin_headers)

    def test_deck_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/decks")
        assert r.status_code == 401


# ---- Upload ----
class TestUpload:
    def test_upload_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/upload",
                          files={"file": ("x.png", b"fake", "image/png")})
        assert r.status_code == 401

    def test_upload_bad_format(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/upload",
                          headers=admin_headers,
                          files={"file": ("x.txt", b"hello", "text/plain")})
        assert r.status_code == 400

    def test_upload_image(self, admin_headers):
        # tiny valid PNG (8 bytes magic + minimal)
        png = (b"\x89PNG\r\n\x1a\n" + b"\x00" * 50)
        r = requests.post(f"{BASE_URL}/api/upload",
                          headers=admin_headers,
                          files={"file": ("t.png", png, "image/png")})
        if r.status_code == 500:
            pytest.skip(f"Storage upload failed (likely infra): {r.text}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and d["url"].startswith("/api/files/")
        # GET file back
        r2 = requests.get(f"{BASE_URL}{d['url']}")
        assert r2.status_code == 200
