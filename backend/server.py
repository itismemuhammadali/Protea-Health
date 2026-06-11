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
    source: str = "animal"  # animal | plant | supplement


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
    source: str = "animal"  # animal | plant | supplement
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
    source: str = "animal"


class MealPatch(BaseModel):
    user_id: str
    name: Optional[str] = None
    protein: Optional[int] = None
    source: Optional[str] = None


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
    """Robustly extract a JSON object from an LLM response.

    Handles: fenced code blocks, prose before/after, and object spans that include
    nested braces by doing a brace-depth scan rather than a regex.
    """
    text = text.strip()
    # 1) fenced ```json ... ``` block
    fence = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text)
    if fence:
        try:
            return json.loads(fence.group(1))
        except Exception:
            pass
    # 2) brace-depth scan — pick the largest balanced {...}
    candidates = []
    depth = 0
    start = -1
    in_str = False
    escape = False
    for i, ch in enumerate(text):
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start != -1:
                    candidates.append(text[start : i + 1])
                    start = -1
    for cand in sorted(candidates, key=len, reverse=True):
        try:
            return json.loads(cand)
        except Exception:
            continue
    raise ValueError("No JSON object found in response")


def coerce_analyze_fields(data: dict) -> tuple[str, int, str, str]:
    """Flatten the AI response into (name, protein, note, source).

    Handles cases where Gemini returns a list of components (for a mixed meal)
    by summing protein and concatenating component names.
    """
    # Mixed-meal: items list
    items = data.get("items") or data.get("components") or data.get("foods")
    if isinstance(items, list) and items:
        parts = []
        total_protein = 0.0
        for it in items:
            if not isinstance(it, dict):
                continue
            parts.append(str(it.get("name") or "").strip())
            try:
                total_protein += float(it.get("protein") or 0)
            except Exception:
                pass
        parts = [p for p in parts if p]
        name = (
            str(data.get("name") or "").strip()
            or (", ".join(parts[:3]) if parts else "Mixed plate")
        )
        protein = int(round(total_protein or float(data.get("protein") or 0)))
        note = str(data.get("note") or "").strip()
        source = str(data.get("source") or "").strip().lower()
        return name, protein, note, source

    name = str(data.get("name") or data.get("food") or "Meal").strip()
    try:
        protein = int(round(float(data.get("protein") or data.get("protein_g") or 0)))
    except Exception:
        protein = 0
    note = str(data.get("note") or data.get("description") or "").strip()
    source = str(data.get("source") or "").strip().lower()
    return name, protein, note, source


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"app": "proa", "ok": True}


@api_router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_food(req: AnalyzeRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
    if not req.imageBase64:
        raise HTTPException(status_code=400, detail="imageBase64 is required")

    system_msg = (
        "You estimate the grams of protein in a food photo, the same way a careful "
        "dietitian would when asked 'how many grams of protein is in this?'. "
        "Look at WHAT IS VISIBLE in the photo — if the container is partially eaten, "
        "estimate only the remaining food, not what was originally served. Use everyday "
        "portion benchmarks (a chicken breast ≈ 150–200g, an egg ≈ 50g, a slice of "
        "bread ≈ 30g, ¼ cup shredded cheese ≈ 28g, ½ avocado ≈ 100g). For mixed dishes "
        "like chili or curry, estimate the visible portion volume in cups, then apply "
        "typical protein per cup (beef-and-bean chili ≈ 15–20g per cup, vegetarian "
        "chili ≈ 10–14g per cup, chicken curry ≈ 20–25g per cup, pasta with meat sauce "
        "≈ 15g per cup, soup/stew vegetarian ≈ 4–7g per cup).\n\n"
        "Identify the dish by name — the SAME dish photographed from different angles "
        "must produce the SAME estimate. Be honest: a half-eaten meal has less protein "
        "than a full one.\n\n"
        "When you have a range in mind (e.g. 17–24g), pick the MIDPOINT and round to "
        "the nearest 5 grams. If you can't tell whether a dish contains meat, assume it "
        "does only if you see clear visual evidence (browned ground meat, chicken "
        "chunks, etc.).\n\n"
        "Return ONLY one compact flat JSON object (no markdown, no prose). Schema:\n"
        '{"name": short stable dish label, max 4 words, '
        '"protein": integer grams rounded to nearest 5 (0-200), '
        '"note": one short friendly sentence max 12 words, '
        '"source": one of "animal" | "plant" | "supplement".}'
    )

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"proa-analyze-{uuid.uuid4()}",
        system_message=system_msg,
    ).with_model("gemini", "gemini-2.5-flash")

    image = ImageContent(image_base64=req.imageBase64)
    user_msg = UserMessage(
        text=(
            "How many grams of protein in this? Identify the dish, estimate the visible "
            "portion as if you were asked by a careful dietitian, and reply with strict "
            "JSON only matching the schema in the system message."
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
        name, protein, note, source = coerce_analyze_fields(data)
        name = (name or "Meal")[:80]
        # Round final protein to nearest 5g for visual stability across angles
        protein = max(0, min(int(round(protein / 5.0) * 5), 500))
        note = note[:140]
        if source not in ("animal", "plant", "supplement"):
            source = "animal"
    except Exception as e:
        logger.exception("Parse error: %s | raw=%s", e, raw)
        # Graceful fallback: log a zero-protein entry so the user still sees something
        name, protein, note, source = "Meal", 0, "Couldn't read this one — tap ✎ to edit.", "animal"

    return AnalyzeResponse(
        name=name,
        protein=protein,
        emoji=pick_emoji(name),
        note=note or "Logged from your camera ✦",
        source=source,
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


@api_router.patch("/meals/{meal_id}", response_model=Optional[Meal])
async def patch_meal(meal_id: str, p: MealPatch):
    update: dict = {}
    if p.name is not None:
        update["name"] = p.name[:80]
    if p.protein is not None:
        update["protein"] = max(0, min(int(p.protein), 300))
    if p.source is not None and p.source in ("animal", "plant", "supplement"):
        update["source"] = p.source
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.meals.find_one_and_update(
        {"id": meal_id, "user_id": p.user_id},
        {"$set": update},
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        return None
    return Meal(**res)


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
