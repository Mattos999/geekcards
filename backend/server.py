from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Query
from fastapi.responses import Response as FastApiResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from auth import hash_password, verify_password, create_access_token, get_current_user
from natures import NATURES, WEAKNESS_MAP, ADVANTAGE_MAP, compute_effective_weaknesses, CARD_TYPES, ENERGY_TYPES
from storage_service import init_storage, put_object, get_object, APP_NAME

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Geek Cards Deck Manager")
api_router = APIRouter(prefix="/api")

MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}


# ============ Models ============
class Ability(BaseModel):
    name: str
    description: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str


class CardCreate(BaseModel):
    name: str
    card_type: str  # Personagem, Item, Mestre, Energia
    natures: List[str] = []
    rarity: int = 1  # 1, 2, 3, 4
    is_alpha: bool = False
    hp: int = 0
    damage: int = 0
    recuo: int = 0
    energy_cost: int = 0
    abilities: List[Ability] = []
    energy_type: Optional[str] = None  # for Energia cards
    image_url: Optional[str] = None
    description: str = ""
    public_status: str = "private"  # private | pending | approved | rejected


class Card(CardCreate):
    id: str
    user_id: str
    created_at: str


class DeckCreate(BaseModel):
    name: str
    description: str = ""
    card_ids: List[str] = []  # list of card.id (duplicates allowed)


class Deck(DeckCreate):
    id: str
    user_id: str
    created_at: str
    updated_at: str


# ============ Auth endpoints ============
def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=True, samesite="none", max_age=604800, path="/"
    )


@api_router.post("/auth/register")
async def register(body: UserCreate, response: Response):
    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id, "email": email, "name": body.name,
        "role": "user",
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_id, email)
    set_auth_cookie(response, token)
    return {"id": user_id, "email": email, "name": body.name, "role": "user", "token": token}


@api_router.post("/auth/login")
async def login(body: UserLogin, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    return {"id": user["id"], "email": email, "name": user["name"], "role": user.get("role", "user"), "token": token}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(request: Request):
    user = await get_current_user(request, db)
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user.get("role", "user")}


# ============ Natures endpoints ============
@api_router.get("/natures")
async def get_natures():
    return {
        "natures": NATURES,
        "weakness_map": WEAKNESS_MAP,
        "advantage_map": ADVANTAGE_MAP,
        "card_types": CARD_TYPES,
        "energy_types": ENERGY_TYPES,
    }


# ============ Upload endpoint ============
@api_router.post("/upload")
async def upload_image(request: Request, file: UploadFile = File(...)):
    user = await get_current_user(request, db)
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    if ext not in MIME_TYPES:
        raise HTTPException(status_code=400, detail="Formato de imagem não suportado")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagem muito grande (max 5MB)")
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    content_type = MIME_TYPES[ext]
    try:
        result = put_object(path, data, content_type)
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail="Falha no upload")
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "storage_path": result["path"],
        "user_id": user["id"],
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": f"/api/files/{result['path']}", "path": result["path"]}


@api_router.get("/files/{path:path}")
async def download_file(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    try:
        data, content_type = get_object(path)
    except Exception as e:
        logger.error(f"Download failed: {e}")
        raise HTTPException(status_code=500, detail="Falha no download")
    return FastApiResponse(content=data, media_type=record.get("content_type", content_type))


# ============ Card CRUD ============
@api_router.post("/cards", response_model=Card)
async def create_card(body: CardCreate, request: Request):
    user = await get_current_user(request, db)
    # Validate natures
    for n in body.natures:
        if n not in NATURES:
            raise HTTPException(status_code=400, detail=f"Natureza inválida: {n}")
    if len(body.natures) > 3:
        raise HTTPException(status_code=400, detail="Máximo de 3 naturezas por carta")
    if body.card_type not in CARD_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de carta inválido")
    if body.rarity not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="Raridade deve ser 1, 2 ou 3")
    if len(body.abilities) > 3:
        raise HTTPException(status_code=400, detail="Máximo de 3 habilidades por carta")

    card_id = str(uuid.uuid4())
    doc = body.model_dump()
    doc.update({
        "id": card_id, "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.cards.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/cards", response_model=List[Card])
async def list_cards(request: Request):
    user = await get_current_user(request, db)

    cards = await db.cards.find(
        {"user_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(2000)

    # 🔥 Corrigir abilities antigas
    for card in cards:
        abilities = card.get("abilities")

        # Caso seja string antiga
        if isinstance(abilities, str):
            card["abilities"] = [
                {
                    "name": "Habilidade",
                    "description": abilities
                }
            ]

        # Caso seja lista de strings
        elif isinstance(abilities, list) and abilities and isinstance(abilities[0], str):
            card["abilities"] = [
                {
                    "name": f"Habilidade {i+1}",
                    "description": ab
                }
                for i, ab in enumerate(abilities)
            ]

    return cards


@api_router.get("/cards/{card_id}", response_model=Card)
async def get_card(card_id: str, request: Request):
    user = await get_current_user(request, db)

    card = await db.cards.find_one(
        {"id": card_id, "user_id": user["id"]},
        {"_id": 0}
    )

    if not card:
        raise HTTPException(status_code=404, detail="Carta não encontrada")

    # 🔥 Corrigir abilities antigas
    abilities = card.get("abilities")

    if isinstance(abilities, str):
        card["abilities"] = [
            {
                "name": "Habilidade",
                "description": abilities
            }
        ]

    elif isinstance(abilities, list) and abilities and isinstance(abilities[0], str):
        card["abilities"] = [
            {
                "name": f"Habilidade {i+1}",
                "description": ab
            }
            for i, ab in enumerate(abilities)
        ]

    return card


@api_router.put("/cards/{card_id}", response_model=Card)
async def update_card(card_id: str, body: CardCreate, request: Request):
    user = await get_current_user(request, db)
    existing = await db.cards.find_one({"id": card_id, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Carta não encontrada")
    if len(body.abilities) > 3:
        raise HTTPException(status_code=400, detail="Máximo de 3 habilidades por carta")
    update = body.model_dump()
    await db.cards.update_one({"id": card_id}, {"$set": update})
    result = await db.cards.find_one({"id": card_id}, {"_id": 0})
    return result


@api_router.delete("/cards/{card_id}")
async def delete_card(card_id: str, request: Request):
    user = await get_current_user(request, db)
    res = await db.cards.delete_one({"id": card_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Carta não encontrada")
    return {"ok": True}


# ============ Community library ============
@api_router.get("/community/cards")
async def community_cards(request: Request, q: str = "", nature: str = "", card_type: str = ""):
    # Require auth but show all approved cards
    await get_current_user(request, db)

    query = {"public_status": "approved"}

    if nature:
        query["natures"] = nature

    if card_type:
        query["card_type"] = card_type

    if q:
        query["name"] = {"$regex": q, "$options": "i"}

    cards = await db.cards.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    # Fetch owner names in one query
    user_ids = list({c["user_id"] for c in cards})

    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(500)

    name_by_id = {u["id"]: u["name"] for u in users}

    for c in cards:
        c["owner_name"] = name_by_id.get(
            c["user_id"],
            "Desconhecido"
        )

        # 🔥 Corrigir abilities antigas
        abilities = c.get("abilities")

        if isinstance(abilities, str):
            c["abilities"] = [
                {
                    "name": "Habilidade",
                    "description": abilities
                }
            ]

        elif (
            isinstance(abilities, list)
            and abilities
            and isinstance(abilities[0], str)
        ):
            c["abilities"] = [
                {
                    "name": f"Habilidade {i+1}",
                    "description": ab
                }
                for i, ab in enumerate(abilities)
            ]

    return cards


@api_router.post("/cards/{card_id}/clone")
async def clone_card(card_id: str, request: Request):
    user = await get_current_user(request, db)
    original = await db.cards.find_one({"id": card_id, "public_status": "approved"}, {"_id": 0})
    if not original:
        raise HTTPException(status_code=404, detail="Carta pública não encontrada")
    if original["user_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Esta carta já é sua")
    new_id = str(uuid.uuid4())
    clone = {**original, "id": new_id, "user_id": user["id"], "public_status": "private",
             "created_at": datetime.now(timezone.utc).isoformat()}
    await db.cards.insert_one(clone)
    clone.pop("_id", None)
    return clone


# ============ Admin moderation ============
async def require_admin(request: Request):
    user = await get_current_user(request, db)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao admin")
    return user


@api_router.get("/admin/pending-cards")
async def list_pending(request: Request):
    await require_admin(request)
    cards = await db.cards.find({"public_status": "pending"}, {"_id": 0}).sort("created_at", 1).to_list(500)
    user_ids = list({c["user_id"] for c in cards})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(500)
    info_by_id = {u["id"]: u for u in users}
    for c in cards:
        info = info_by_id.get(c["user_id"], {})
        c["owner_name"] = info.get("name", "Desconhecido")
        c["owner_email"] = info.get("email", "")
    return cards


@api_router.post("/admin/cards/{card_id}/approve")
async def approve_card(card_id: str, request: Request):
    await require_admin(request)
    res = await db.cards.update_one({"id": card_id, "public_status": "pending"},
                                    {"$set": {"public_status": "approved"}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Carta pendente não encontrada")
    return {"ok": True}


@api_router.post("/admin/cards/{card_id}/reject")
async def reject_card(card_id: str, request: Request):
    await require_admin(request)
    res = await db.cards.update_one({"id": card_id, "public_status": "pending"},
                                    {"$set": {"public_status": "rejected"}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Carta pendente não encontrada")
    return {"ok": True}



# ============ Deck CRUD ============
def _validate_deck_rules(card_ids: list[str], cards_by_id: dict) -> list[str]:
    """Returns list of validation warnings (not errors, deck can be saved mid-build)."""
    warnings = []
    if len(card_ids) > 20:
        warnings.append(f"Deck tem {len(card_ids)} cartas (máximo 20).")
    # Count occurrences. Rule: max 2 of same named card. Exception: can have 2 if one is ALPHA.
    name_groups: dict[str, list[dict]] = {}
    for cid in card_ids:
        card = cards_by_id.get(cid)
        if not card:
            continue
        name_groups.setdefault(card["name"], []).append(card)
    for name, group in name_groups.items():
        if len(group) > 2:
            warnings.append(f"'{name}' aparece {len(group)} vezes (máximo 2).")
    return warnings


@api_router.post("/decks", response_model=Deck)
async def create_deck(body: DeckCreate, request: Request):
    user = await get_current_user(request, db)
    deck_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = body.model_dump()
    doc.update({"id": deck_id, "user_id": user["id"], "created_at": now, "updated_at": now})
    await db.decks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/decks", response_model=List[Deck])
async def list_decks(request: Request):
    user = await get_current_user(request, db)
    decks = await db.decks.find({"user_id": user["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    return decks


@api_router.get("/decks/{deck_id}")
async def get_deck(deck_id: str, request: Request):
    user = await get_current_user(request, db)
    deck = await db.decks.find_one({"id": deck_id, "user_id": user["id"]}, {"_id": 0})
    if not deck:
        raise HTTPException(status_code=404, detail="Deck não encontrado")
    # Fetch all cards referenced
    unique_ids = list(set(deck.get("card_ids", [])))
    cards = []
    if unique_ids:
        cards = await db.cards.find({"id": {"$in": unique_ids}, "user_id": user["id"]}, {"_id": 0}).to_list(500)
    cards_by_id = {c["id"]: c for c in cards}
    warnings = _validate_deck_rules(deck.get("card_ids", []), cards_by_id)
    return {"deck": deck, "cards": cards, "warnings": warnings}


@api_router.put("/decks/{deck_id}", response_model=Deck)
async def update_deck(deck_id: str, body: DeckCreate, request: Request):
    user = await get_current_user(request, db)
    existing = await db.decks.find_one({"id": deck_id, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Deck não encontrado")
    update = body.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.decks.update_one({"id": deck_id}, {"$set": update})
    res = await db.decks.find_one({"id": deck_id}, {"_id": 0})
    return res


@api_router.delete("/decks/{deck_id}")
async def delete_deck(deck_id: str, request: Request):
    user = await get_current_user(request, db)
    res = await db.decks.delete_one({"id": deck_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deck não encontrado")
    return {"ok": True}


@api_router.get("/decks/{deck_id}/analysis")
async def analyze_deck(deck_id: str, request: Request):
    user = await get_current_user(request, db)
    deck = await db.decks.find_one({"id": deck_id, "user_id": user["id"]}, {"_id": 0})
    if not deck:
        raise HTTPException(status_code=404, detail="Deck não encontrado")
    card_ids = deck.get("card_ids", [])
    unique_ids = list(set(card_ids))
    cards_list = []
    if unique_ids:
        cards_list = await db.cards.find({"id": {"$in": unique_ids}, "user_id": user["id"]}, {"_id": 0}).to_list(500)
    cards_by_id = {c["id"]: c for c in cards_list}

    # Distribution
    nature_counts = {n: 0 for n in NATURES}
    type_counts = {t: 0 for t in CARD_TYPES}
    rarity_counts = {"1": 0, "2": 0, "3": 0, "alpha": 0}
    total_hp = 0
    total_damage = 0
    n_chars = 0
    vulnerable_count = 0
    coverage_against = {n: 0 for n in NATURES}
    vulnerable_to = {n: 0 for n in NATURES}

    for cid in card_ids:
        card = cards_by_id.get(cid)
        if not card:
            continue
        type_counts[card.get("card_type", "Personagem")] = type_counts.get(card.get("card_type", "Personagem"), 0) + 1
        if card.get("is_alpha"):
            rarity_counts["alpha"] += 1
        else:
            rarity_counts[str(card.get("rarity", 1))] += 1
        if card.get("card_type") == "Personagem":
            n_chars += 1
            total_hp += card.get("hp", 0)
            total_damage += card.get("damage", 0)
            for n in card.get("natures", []):
                nature_counts[n] = nature_counts.get(n, 0) + 1
                for beaten in WEAKNESS_MAP.get(n, []):  # who n is weak to -> n can be beaten by these
                    vulnerable_to[beaten] = vulnerable_to.get(beaten, 0) + 1
                for beats in ADVANTAGE_MAP.get(n, []):  # who n beats
                    coverage_against[beats] = coverage_against.get(beats, 0) + 1
            weak = compute_effective_weaknesses(card.get("natures", []))
            if weak:
                vulnerable_count += 1

    avg_hp = round(total_hp / n_chars, 1) if n_chars else 0
    avg_damage = round(total_damage / n_chars, 1) if n_chars else 0

    return {
        "total_cards": len(card_ids),
        "unique_cards": len(unique_ids),
        "character_count": n_chars,
        "nature_distribution": nature_counts,
        "type_distribution": type_counts,
        "rarity_distribution": rarity_counts,
        "avg_hp": avg_hp,
        "avg_damage": avg_damage,
        "coverage_against": coverage_against,  # natures you counter
        "vulnerable_to": vulnerable_to,  # natures that counter you
        "warnings": _validate_deck_rules(card_ids, cards_by_id),
    }


# ============ App setup ============
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.cards.create_index("user_id")
        await db.decks.create_index("user_id")
        await db.files.create_index("storage_path")
    except Exception as e:
        logger.error(f"Index creation: {e}")
    # Init storage
    init_storage()
    # Seed admin user
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@geekcards.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    admin_password_hash = hash_password(admin_password)
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email, "name": "Admin", "role": "admin",
            "password_hash": admin_password_hash,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Admin seeded")
    else:
        # Always ensure admin has correct password and role
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"role": "admin", "password_hash": admin_password_hash}}
        )
        logger.info("Admin user updated")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@api_router.get("/")
async def root():
    return {"message": "Geek Cards API", "version": "1.0"}
