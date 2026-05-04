"""Iter-2 tests: PATCH /api/meals/{id}, 'source' field on meals & analyze."""
import os
import time
import pytest

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")


# Meals: 'source' field on POST/GET
class TestMealSourceField:
    def test_create_meal_with_source(self, api_client):
        uid = f"TEST_src_{int(time.time()*1000)}"
        payload = {
            "user_id": uid, "name": "Lentil bowl", "protein": 18,
            "emoji": "🫘", "note": "plant-based", "imageUrl": "",
            "time": "1:00 PM", "date": "2026-01-15", "source": "plant",
        }
        r = api_client.post(f"{BASE_URL}/api/meals", json=payload)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["source"] == "plant"
        # verify via GET
        g = api_client.get(f"{BASE_URL}/api/meals", params={"user_id": uid, "date": "2026-01-15"})
        assert g.status_code == 200
        arr = g.json()
        assert any(x.get("source") == "plant" and x["name"] == "Lentil bowl" for x in arr)
        api_client.delete(f"{BASE_URL}/api/meals/{m['id']}", params={"user_id": uid})

    def test_create_meal_default_source_animal(self, api_client):
        uid = f"TEST_defsrc_{int(time.time()*1000)}"
        payload = {
            "user_id": uid, "name": "Chicken", "protein": 30,
            "emoji": "🍗", "note": "", "imageUrl": "",
            "time": "1:00 PM", "date": "2026-01-15",
        }
        r = api_client.post(f"{BASE_URL}/api/meals", json=payload)
        assert r.status_code == 200, r.text
        assert r.json().get("source") == "animal"
        api_client.delete(f"{BASE_URL}/api/meals/{r.json()['id']}", params={"user_id": uid})


# Meals PATCH
class TestMealPatch:
    def _create(self, api_client, uid):
        payload = {
            "user_id": uid, "name": "Initial", "protein": 20,
            "emoji": "🍗", "note": "", "imageUrl": "",
            "time": "1:00 PM", "date": "2026-01-15", "source": "animal",
        }
        r = api_client.post(f"{BASE_URL}/api/meals", json=payload)
        assert r.status_code == 200
        return r.json()

    def test_patch_updates_fields(self, api_client):
        uid = f"TEST_patch_{int(time.time()*1000)}"
        meal = self._create(api_client, uid)
        r = api_client.patch(
            f"{BASE_URL}/api/meals/{meal['id']}",
            json={"user_id": uid, "name": "Updated name", "protein": 55, "source": "plant"},
        )
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated is not None
        assert updated["name"] == "Updated name"
        assert updated["protein"] == 55
        assert updated["source"] == "plant"
        # verify persisted
        g = api_client.get(f"{BASE_URL}/api/meals", params={"user_id": uid, "date": "2026-01-15"})
        item = next(x for x in g.json() if x["id"] == meal["id"])
        assert item["name"] == "Updated name"
        assert item["protein"] == 55
        assert item["source"] == "plant"
        api_client.delete(f"{BASE_URL}/api/meals/{meal['id']}", params={"user_id": uid})

    def test_patch_wrong_owner_returns_null(self, api_client):
        uid = f"TEST_owner_{int(time.time()*1000)}"
        meal = self._create(api_client, uid)
        r = api_client.patch(
            f"{BASE_URL}/api/meals/{meal['id']}",
            json={"user_id": "NOT_OWNER", "name": "Hacked"},
        )
        assert r.status_code == 200
        assert r.json() is None
        # original unchanged
        g = api_client.get(f"{BASE_URL}/api/meals", params={"user_id": uid, "date": "2026-01-15"})
        item = next(x for x in g.json() if x["id"] == meal["id"])
        assert item["name"] == "Initial"
        api_client.delete(f"{BASE_URL}/api/meals/{meal['id']}", params={"user_id": uid})

    def test_patch_protein_clamp(self, api_client):
        uid = f"TEST_clamp_{int(time.time()*1000)}"
        meal = self._create(api_client, uid)
        r = api_client.patch(
            f"{BASE_URL}/api/meals/{meal['id']}",
            json={"user_id": uid, "protein": 9999},
        )
        assert r.status_code == 200
        assert r.json()["protein"] == 300
        api_client.delete(f"{BASE_URL}/api/meals/{meal['id']}", params={"user_id": uid})


# Analyze must now include 'source'
class TestAnalyzeSource:
    def test_analyze_response_includes_source(self, api_client):
        with open("/tmp/food_b64.txt") as f:
            b64 = f.read().strip()
        r = api_client.post(
            f"{BASE_URL}/api/analyze",
            json={"imageBase64": b64, "user_id": "TEST_analyze_src"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "source" in data, f"'source' missing from analyze response: {data}"
        assert data["source"] in ("animal", "plant", "supplement"), f"invalid source: {data.get('source')}"
