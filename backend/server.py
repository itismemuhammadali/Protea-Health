import os
import uuid
import json
import logging
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nuura")


# ---------- Models ----------
class AnalyzeRequest(BaseModel):
    imageBase64: str
    user_id: Optional[str] = None


class AnalyzeResponse(BaseModel):
    name: str
    protein: int
    emoji: str
    note: str


class Profile(BaseModel):
    user_id: str
    weight: float
    unit: str  # 'lbs' or 'kg'
    age: int
    fitnessGoal: str
    dailyGoal: int
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProfileUpsert(BaseModel):
    user_id: str
    weight: float
    unit: str
    age: int
    fitnessGoal: str
    dailyGoal: int


class Meal(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    protein: int
    emoji: str
    note: Optional[str] = ""
    imageUrl: Optional[str] = ""
    time: str  # display time e.g. '8:14 AM'
    date: str  # YYYY-MM-DD (local user date)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MealCreate(BaseModel):
    user_id: str
    name: str
    protein: int
    emoji: str
    note: Optional[str] = ""
    imageUrl: Optional[str] = ""
    time: str
    date: str


# ---------- Helpers ----------
EMOJI_BY_KEYWORD = [
    ("egg", "🥚"), ("salmon", "🐟"), ("fish", "🐟"), ("tuna", "🐟"),
    ("chicken", "🍗"), ("turkey", "🍗"), ("beef", "🥩"), ("steak", "🥩"),
    ("pork", "🥓"), ("bacon", "🥓"), ("yogurt", "🥛"), ("milk", "🥛"),
    ("cheese", "🧀"), ("tofu", "🫙"), ("lentil", "🫘"), ("bean", "🫘"),
    ("edamame", "🌰"), ("nut", "🥜"), ("almond", "🥜"), ("peanut", "🥜"),
    ("rice", "🍚"), ("bread", "🍞"), ("pasta", "🍝"), ("noodle", "🍜"),
    ("salad", "🥗"), ("avocado", "🥑"), ("apple", "🍎"), ("banana", "🍌"),
    ("smoothie", "🥤"), ("protein shake", "🥤"), ("burger", "🍔"),
    ("pizza", "🍕"), ("sandwich", "🥪"), ("taco", "🌮"), ("burrito", "🌯"),
    ("sushi", "🍣"), ("shrimp", "🍤"), ("vegetable", "🥦"), ("broccoli", "🥦"),
]


def pick_emoji(name: str) -> str:
    n = (name or "").lower()
    for kw, em in EMOJI_BY_KEYWORD:
        if kw in n:
            return em
    return "🍽️"


def extract_json(text: str) -> dict:
    """Robustly extract JSON object from LLM response."""
    text = text.strip()
    # try fenced code block
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        return json.loads(fence.group(1))
    # find first { ... } substring
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        return json.loads(m.group(0))
    raise ValueError("No JSON object found in response")


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"app": "nuura", "ok": True}


@api_router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_food(req: AnalyzeRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
    if not req.imageBase64:
        raise HTTPException(status_code=400, detail="imageBase64 is required")

    system_msg = (
        "You are a nutrition vision expert. Look at the food photo and estimate the "
        "protein content in grams. Return ONLY a compact JSON object with keys: "
        '"name" (short food name, max 4 words), "protein" (integer grams of protein in '
        'the entire visible portion), "note" (one short, friendly sentence about the '
        "food's protein quality, max 12 words). No prose, no markdown."
    )

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"nuura-analyze-{uuid.uuid4()}",
        system_message=system_msg,
    ).with_model("gemini", "gemini-2.5-flash")

    image = ImageContent(image_base64=req.imageBase64)
    user_msg = UserMessage(
        text=(
            "Identify this food and estimate the total grams of protein in the entire "
            "visible portion. Respond with strict JSON only."
        ),
        file_contents=[image],
    )

    try:
        raw = await chat.send_message(user_msg)
    except Exception as e:
        logger.exception("LLM error")
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    try:
        data = extract_json(str(raw))
        name = str(data.get("name") or "Meal").strip()[:60]
        protein = int(round(float(data.get("protein") or 0)))
        protein = max(0, min(protein, 300))
        note = str(data.get("note") or "").strip()[:140]
    except Exception as e:
        logger.exception("Parse error: %s | raw=%s", e, raw)
        raise HTTPException(status_code=502, detail="Could not parse AI response")

    return AnalyzeResponse(
        name=name,
        protein=protein,
        emoji=pick_emoji(name),
        note=note or "Logged from your camera ✦",
    )


# ----- Profile -----
@api_router.post("/profile", response_model=Profile)
async def upsert_profile(p: ProfileUpsert):
    doc = Profile(**p.dict()).dict()
    await db.profiles.update_one(
        {"user_id": p.user_id}, {"$set": doc}, upsert=True
    )
    return Profile(**doc)


@api_router.get("/profile/{user_id}", response_model=Optional[Profile])
async def get_profile(user_id: str):
    doc = await db.profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        return None
    return Profile(**doc)


# ----- Meals -----
@api_router.post("/meals", response_model=Meal)
async def create_meal(m: MealCreate):
    meal = Meal(**m.dict())
    await db.meals.insert_one(meal.dict())
    return meal


@api_router.get("/meals", response_model=List[Meal])
async def list_meals(user_id: str, date: Optional[str] = None):
    q = {"user_id": user_id}
    if date:
        q["date"] = date
    cur = db.meals.find(q, {"_id": 0}).sort("timestamp", -1)
    items = await cur.to_list(1000)
    return [Meal(**it) for it in items]


@api_router.get("/meals/range")
async def meals_range(user_id: str, start: str, end: str):
    """Return aggregated daily protein totals from start to end (YYYY-MM-DD inclusive)."""
    q = {"user_id": user_id, "date": {"$gte": start, "$lte": end}}
    cur = db.meals.find(q, {"_id": 0})
    items = await cur.to_list(10000)
    by_day: dict[str, int] = {}
    for it in items:
        by_day[it["date"]] = by_day.get(it["date"], 0) + int(it.get("protein") or 0)
    return {"totals": by_day}


@api_router.delete("/meals/{meal_id}")
async def delete_meal(meal_id: str, user_id: str):
    res = await db.meals.delete_one({"id": meal_id, "user_id": user_id})
    return {"deleted": res.deleted_count}


# ---------- Wire up ----------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
