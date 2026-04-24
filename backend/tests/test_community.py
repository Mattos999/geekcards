"""Tests for community library + admin moderation endpoints (iter 2)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://card-deck-builder-1.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@geekcards.com"
ADMIN_PASSWORD = "admin123"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def _register(email, password, name):
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": password, "name": name})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def admin():
    data = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    data["headers"] = {"Authorization": f"Bearer {data['token']}"}
    return data


@pytest.fixture(scope="module")
def user_author():
    email = f"author_{uuid.uuid4().hex[:8]}@example.com"
    d = _register(email, "pass1234", "Author")
    d["email"] = email
    d["headers"] = {"Authorization": f"Bearer {d['token']}"}
    return d


@pytest.fixture(scope="module")
def user_viewer():
    email = f"viewer_{uuid.uuid4().hex[:8]}@example.com"
    d = _register(email, "pass1234", "Viewer")
    d["email"] = email
    d["headers"] = {"Authorization": f"Bearer {d['token']}"}
    return d


# ---- Role on auth endpoints ----
class TestAuthRole:
    def test_admin_login_returns_role(self, admin):
        assert admin.get("role") == "admin"

    def test_register_returns_role_user(self):
        email = f"reg_{uuid.uuid4().hex[:8]}@example.com"
        d = _register(email, "pass1234", "Reg")
        assert d.get("role") == "user"

    def test_me_returns_role(self, admin):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin["headers"])
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "admin"


# ---- Community end-to-end flow ----
class TestCommunityFlow:
    _state = {}

    def test_author_creates_private_card(self, user_author):
        payload = {
            "name": f"TEST_Comm_{uuid.uuid4().hex[:6]}",
            "card_type": "Personagem",
            "natures": ["Anjo"],
            "rarity": 2, "hp": 90, "damage": 25,
        }
        r = requests.post(f"{BASE_URL}/api/cards", json=payload, headers=user_author["headers"])
        assert r.status_code == 200, r.text
        card = r.json()
        assert card["public_status"] == "private"
        TestCommunityFlow._state["card"] = card
        TestCommunityFlow._state["payload"] = payload

    def test_author_requests_publish_via_put(self, user_author):
        card = TestCommunityFlow._state["card"]
        payload = {**TestCommunityFlow._state["payload"], "public_status": "pending"}
        r = requests.put(f"{BASE_URL}/api/cards/{card['id']}", json=payload, headers=user_author["headers"])
        assert r.status_code == 200, r.text
        assert r.json()["public_status"] == "pending"

    def test_community_cards_hides_pending(self, user_viewer):
        card = TestCommunityFlow._state["card"]
        r = requests.get(f"{BASE_URL}/api/community/cards", headers=user_viewer["headers"])
        assert r.status_code == 200
        assert not any(c["id"] == card["id"] for c in r.json()), "Pending card must NOT appear in /community/cards"

    def test_pending_cards_forbidden_for_non_admin(self, user_viewer):
        r = requests.get(f"{BASE_URL}/api/admin/pending-cards", headers=user_viewer["headers"])
        assert r.status_code == 403, r.text

    def test_pending_cards_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/pending-cards")
        assert r.status_code == 401

    def test_admin_sees_pending_card(self, admin):
        card = TestCommunityFlow._state["card"]
        r = requests.get(f"{BASE_URL}/api/admin/pending-cards", headers=admin["headers"])
        assert r.status_code == 200
        lst = r.json()
        match = [c for c in lst if c["id"] == card["id"]]
        assert match, "Pending card missing from admin list"
        assert "owner_name" in match[0] and "owner_email" in match[0]

    def test_clone_non_approved_fails(self, user_viewer):
        card = TestCommunityFlow._state["card"]
        r = requests.post(f"{BASE_URL}/api/cards/{card['id']}/clone", headers=user_viewer["headers"])
        assert r.status_code == 404  # pending card not approved -> not found in approved-only query

    def test_approve_forbidden_for_non_admin(self, user_viewer):
        card = TestCommunityFlow._state["card"]
        r = requests.post(f"{BASE_URL}/api/admin/cards/{card['id']}/approve", headers=user_viewer["headers"])
        assert r.status_code == 403

    def test_admin_approves_card(self, admin):
        card = TestCommunityFlow._state["card"]
        r = requests.post(f"{BASE_URL}/api/admin/cards/{card['id']}/approve", headers=admin["headers"])
        assert r.status_code == 200
        # Verify status via pending-cards (should no longer appear)
        r2 = requests.get(f"{BASE_URL}/api/admin/pending-cards", headers=admin["headers"])
        assert not any(c["id"] == card["id"] for c in r2.json())

    def test_community_lists_approved_with_owner_name(self, user_viewer, user_author):
        card = TestCommunityFlow._state["card"]
        r = requests.get(f"{BASE_URL}/api/community/cards", headers=user_viewer["headers"])
        assert r.status_code == 200
        match = [c for c in r.json() if c["id"] == card["id"]]
        assert match, "Approved card missing from /community/cards"
        assert match[0]["owner_name"] == user_author["name"]
        assert match[0]["public_status"] == "approved"

    def test_owner_cannot_clone_own_card(self, user_author):
        card = TestCommunityFlow._state["card"]
        r = requests.post(f"{BASE_URL}/api/cards/{card['id']}/clone", headers=user_author["headers"])
        assert r.status_code == 400

    def test_viewer_clones_approved_card(self, user_viewer):
        card = TestCommunityFlow._state["card"]
        r = requests.post(f"{BASE_URL}/api/cards/{card['id']}/clone", headers=user_viewer["headers"])
        assert r.status_code == 200, r.text
        clone = r.json()
        assert clone["id"] != card["id"]
        assert clone["public_status"] == "private"
        assert clone["name"] == card["name"]
        TestCommunityFlow._state["clone_id"] = clone["id"]
        # Verify persisted in viewer's library (and scoped to viewer)
        r2 = requests.get(f"{BASE_URL}/api/cards/{clone['id']}", headers=user_viewer["headers"])
        assert r2.status_code == 200
        assert r2.json()["user_id"] == user_viewer["id"]

    def test_reject_flow(self, admin, user_author):
        # Create another card and set to pending
        payload = {"name": f"TEST_Reject_{uuid.uuid4().hex[:6]}", "card_type": "Item",
                   "natures": [], "rarity": 1, "public_status": "pending"}
        r = requests.post(f"{BASE_URL}/api/cards", json=payload, headers=user_author["headers"])
        assert r.status_code == 200
        cid = r.json()["id"]

        r = requests.post(f"{BASE_URL}/api/admin/cards/{cid}/reject", headers=admin["headers"])
        assert r.status_code == 200
        # Verify not in community
        r2 = requests.get(f"{BASE_URL}/api/community/cards", headers=admin["headers"])
        assert not any(c["id"] == cid for c in r2.json())
        # Owner still sees the card with rejected status
        r3 = requests.get(f"{BASE_URL}/api/cards/{cid}", headers=user_author["headers"])
        assert r3.status_code == 200
        assert r3.json()["public_status"] == "rejected"
        # cleanup
        requests.delete(f"{BASE_URL}/api/cards/{cid}", headers=user_author["headers"])

    def test_approve_nonexistent_or_non_pending_404(self, admin):
        # Already-approved card cannot be approved again
        card = TestCommunityFlow._state["card"]
        r = requests.post(f"{BASE_URL}/api/admin/cards/{card['id']}/approve", headers=admin["headers"])
        assert r.status_code == 404

    def test_cleanup(self, admin, user_author, user_viewer):
        # delete source card and clone
        card = TestCommunityFlow._state.get("card")
        if card:
            requests.delete(f"{BASE_URL}/api/cards/{card['id']}", headers=user_author["headers"])
        clone_id = TestCommunityFlow._state.get("clone_id")
        if clone_id:
            requests.delete(f"{BASE_URL}/api/cards/{clone_id}", headers=user_viewer["headers"])
