"""Backend tests for nuura protein tracker — health, profile, meals, meals/range, analyze, delete."""
import os
import time
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://gains-log-72.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")


# Health
class TestHealth:
    def test_root(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        j = r.json()
        assert j.get("ok") is True
        assert j.get("app") == "nuura"


# Profile CRUD
class TestProfile:
    def test_get_profile_missing_returns_null(self, api_client):
        uid = f"TEST_missing_{int(time.time()*1000)}"
        r = api_client.get(f"{BASE_URL}/api/profile/{uid}")
        assert r.status_code == 200
        assert r.json() is None

    def test_upsert_and_get_profile(self, api_client, user_id):
        payload = {
            "user_id": user_id,
            "weight": 150.0,
            "unit": "lbs",
            "age": 30,
            "fitnessGoal": "build",
            "dailyGoal": 120,
        }
        r = api_client.post(f"{BASE_URL}/api/profile", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == user_id
        assert data["dailyGoal"] == 120
        assert data["fitnessGoal"] == "build"

        # Verify persisted
        r2 = api_client.get(f"{BASE_URL}/api/profile/{user_id}")
        assert r2.status_code == 200
        got = r2.json()
        assert got is not None
        assert got["user_id"] == user_id
        assert got["weight"] == 150.0
        assert got["age"] == 30
        assert got["dailyGoal"] == 120

    def test_upsert_overwrites(self, api_client, user_id):
        payload = {
            "user_id": user_id,
            "weight": 160.0,
            "unit": "lbs",
            "age": 31,
            "fitnessGoal": "lose",
            "dailyGoal": 140,
        }
        r = api_client.post(f"{BASE_URL}/api/profile", json=payload)
        assert r.status_code == 200
        got = api_client.get(f"{BASE_URL}/api/profile/{user_id}").json()
        assert got["dailyGoal"] == 140
        assert got["fitnessGoal"] == "lose"


# Meals CRUD + range aggregation
class TestMeals:
    created_ids = []

    def test_create_meal(self, api_client, user_id):
        today = "2026-01-15"
        payload = {
            "user_id": user_id,
            "name": "Grilled Chicken",
            "protein": 35,
            "emoji": "🍗",
            "note": "Lean protein",
            "imageUrl": "",
            "time": "12:30 PM",
            "date": today,
        }
        r = api_client.post(f"{BASE_URL}/api/meals", json=payload)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["name"] == "Grilled Chicken"
        assert m["protein"] == 35
        assert "id" in m
        TestMeals.created_ids.append((m["id"], user_id))

    def test_list_meals_by_date(self, api_client, user_id):
        r = api_client.get(f"{BASE_URL}/api/meals", params={"user_id": user_id, "date": "2026-01-15"})
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        assert any(x["name"] == "Grilled Chicken" for x in arr)

    def test_meals_range_aggregation(self, api_client):
        uid = f"TEST_range_{int(time.time()*1000)}"
        # 3 meals on two days
        meals = [
            {"date": "2026-01-10", "protein": 20},
            {"date": "2026-01-10", "protein": 15},
            {"date": "2026-01-11", "protein": 40},
        ]
        for m in meals:
            payload = {
                "user_id": uid, "name": "X", "protein": m["protein"],
                "emoji": "🍗", "note": "", "imageUrl": "",
                "time": "1:00 PM", "date": m["date"],
            }
            r = api_client.post(f"{BASE_URL}/api/meals", json=payload)
            assert r.status_code == 200
            TestMeals.created_ids.append((r.json()["id"], uid))

        r = api_client.get(f"{BASE_URL}/api/meals/range",
                           params={"user_id": uid, "start": "2026-01-10", "end": "2026-01-11"})
        assert r.status_code == 200
        totals = r.json().get("totals", {})
        assert totals.get("2026-01-10") == 35
        assert totals.get("2026-01-11") == 40

        # start/end boundary excludes out-of-range
        r2 = api_client.get(f"{BASE_URL}/api/meals/range",
                            params={"user_id": uid, "start": "2026-01-11", "end": "2026-01-11"})
        totals2 = r2.json().get("totals", {})
        assert totals2.get("2026-01-11") == 40
        assert "2026-01-10" not in totals2

    def test_delete_meal(self, api_client, user_id):
        # find one meal we created
        assert TestMeals.created_ids, "No meals to delete"
        meal_id, uid = TestMeals.created_ids[0]
        r = api_client.delete(f"{BASE_URL}/api/meals/{meal_id}", params={"user_id": uid})
        assert r.status_code == 200
        assert r.json().get("deleted") == 1

        # verify gone
        r2 = api_client.get(f"{BASE_URL}/api/meals", params={"user_id": uid})
        assert r2.status_code == 200
        assert not any(m["id"] == meal_id for m in r2.json())

    @classmethod
    def teardown_class(cls):
        import requests
        for mid, uid in cls.created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/meals/{mid}", params={"user_id": uid}, timeout=10)
            except Exception:
                pass


# Analyze endpoint (Gemini vision)
class TestAnalyze:
    def test_analyze_rejects_empty_base64(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/analyze", json={"imageBase64": "", "user_id": "TEST_u"})
        assert r.status_code == 400

    def test_analyze_valid_food_image(self, api_client):
        with open("/tmp/food_b64.txt") as f:
            b64 = f.read().strip()
        r = api_client.post(
            f"{BASE_URL}/api/analyze",
            json={"imageBase64": b64, "user_id": "TEST_analyze"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # shape
        assert isinstance(data.get("name"), str) and len(data["name"]) > 0
        assert isinstance(data.get("protein"), int)
        assert 0 <= data["protein"] <= 300
        assert isinstance(data.get("emoji"), str) and len(data["emoji"]) > 0
        assert isinstance(data.get("note"), str)
