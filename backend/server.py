from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import random
import copy
from datetime import datetime, timezone, timedelta
from typing import Any, List, Optional

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


app.add_middleware(
    CORSMiddleware,
    
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
api_router = APIRouter(prefix="/api")

MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}


# ============ Models ============
class EnergyCost(BaseModel):
    energy_type: str
    amount: int


class Effect(BaseModel):
    type: str
    target: str = "OPPONENT_ACTIVE"
    duration: str = "INSTANT"
    amount: int = 0
    attribute: Optional[str] = None
    energy_type: Optional[str] = None
    nature: Optional[str] = None
    card_name: Optional[str] = None
    tag: Optional[str] = None
    condition: Optional[str] = None


class AbilityRuleCondition(BaseModel):
    type: str
    value: Optional[Any] = None


class AbilityRule(BaseModel):
    trigger: str = "ON_ATTACK"
    conditions: List[AbilityRuleCondition] = []
    effects: List[Effect] = []
    duration: str = "INSTANT"


class Ability(BaseModel):
    name: str
    description: str
    damage: int = 0
    energy_cost: int = 0
    energy_costs: List[EnergyCost] = []
    effects: List[Effect] = []
    rules: List[AbilityRule] = []


class AdditionalInfoField(BaseModel):
    label: str = ""
    value: str = ""


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
    role: str = "user"


class UserPresenceOut(UserOut):
    is_online: bool = False
    last_seen: Optional[str] = None


class ProfileUpdate(BaseModel):
    name: str
    current_password: Optional[str] = None
    new_password: Optional[str] = None


class AdminRoleUpdate(BaseModel):
    role: str


class CardCreate(BaseModel):
    name: str
    card_type: str  # Personagem, Item, Mestre, Equipamento, Energia
    natures: List[str] = []
    rarity: int = 0  # 0, 1, 2, 3, 4
    is_alpha: bool = False
    hp: int = 0
    recuo: int = 0
    abilities: List[Ability] = []
    effects: List[Effect] = []
    passive_effects: List[Effect] = []
    speed: Optional[str] = None
    attach_to: Optional[str] = None
    energy_type: Optional[str] = None  # for Energia cards
    image_url: Optional[str] = None
    description: str = ""
    expansion: str = ""
    universe: str = ""
    additional_info: List[AdditionalInfoField] = []
    public_status: str = "private"  # private | pending | approved | rejected
    is_evolution: bool = False
    evolution_number: Optional[str] = None
    evolves_from_card_id: Optional[str] = None
    evolves_from_name: Optional[str] = None


class Card(CardCreate):
    id: str
    user_id: str
    created_at: str


class DeckCreate(BaseModel):
    name: str
    description: str = ""
    card_ids: List[str] = []  # list of card.id (duplicates allowed)
    energy_types: List[str] = []


class Deck(DeckCreate):
    id: str
    user_id: str
    created_at: str
    updated_at: str


class OnlineDuelInviteCreate(BaseModel):
    opponent_id: str


class OnlineDuelDeckChoice(BaseModel):
    deck_id: str


class OnlineDuelSetupReady(BaseModel):
    ready: bool = True


class OnlineDuelAction(BaseModel):
    kind: str
    hand_index: Optional[int] = None
    bench_index: Optional[int] = None
    zone: Optional[str] = None
    target_index: int = 0
    ability_index: Optional[int] = None


class LegacyCommunityMigrationResult(BaseModel):
    ok: bool
    migrated: int = 0
    skipped: int = 0


def normalize_card_payload(body: CardCreate) -> dict:
    payload = body.model_dump()

    payload["expansion"] = str(payload.get("expansion") or "").strip()
    payload["universe"] = str(payload.get("universe") or "").strip()
    payload["additional_info"] = [
        {
            "label": str(info.get("label") or "").strip()[:40],
            "value": str(info.get("value") or "").strip()[:120],
        }
        for info in (payload.get("additional_info") or [])[:10]
        if str(info.get("label") or "").strip() or str(info.get("value") or "").strip()
    ]

    if not payload.get("is_evolution"):
        payload["evolution_number"] = None
        payload["evolves_from_card_id"] = None
        payload["evolves_from_name"] = None
    elif payload.get("evolution_number") == "I":
        payload["evolution_number"] = "II"
    elif not isinstance(payload.get("evolution_number"), str) or not payload.get("evolution_number"):
        payload["evolution_number"] = "II"

    def normalize_effects(effects: list[dict]) -> list[dict]:
        normalized = []
        for effect in effects or []:
            effect_type = effect.get("type")
            if not effect_type:
                continue
            amount = effect.get("amount") or 0
            if amount < 0:
                raise HTTPException(status_code=400, detail="Valor do efeito nao pode ser negativo")
            normalized.append({
                "type": effect_type,
                "target": effect.get("target") or "OPPONENT_ACTIVE",
                "duration": effect.get("duration") or "INSTANT",
                "amount": amount,
                "attribute": effect.get("attribute") or None,
                "energy_type": effect.get("energy_type") or None,
                "nature": effect.get("nature") or None,
                "card_name": effect.get("card_name") or None,
                "tag": effect.get("tag") or None,
                "condition": effect.get("condition") or None,
            })
        return normalized

    def normalize_rule_conditions(conditions: list[dict]) -> list[dict]:
        normalized = []
        for condition in conditions or []:
            condition_type = condition.get("type")
            if not condition_type:
                continue
            normalized.append({
                "type": condition_type,
                "value": condition.get("value"),
            })
        return normalized

    def normalize_ability_rules(rules: list[dict]) -> list[dict]:
        normalized = []
        for rule in rules or []:
            trigger = rule.get("trigger")
            if not trigger:
                continue
            effects = normalize_effects(rule.get("effects", []))
            if not effects:
                continue
            normalized.append({
                "trigger": trigger,
                "conditions": normalize_rule_conditions(rule.get("conditions", [])),
                "effects": effects,
                "duration": rule.get("duration") or "INSTANT",
            })
        return normalized

    payload["effects"] = normalize_effects(payload.get("effects", []))
    payload["passive_effects"] = normalize_effects(payload.get("passive_effects", []))

    for ability in payload.get("abilities", []):
        energy_costs = ability.get("energy_costs") or []

        for cost in energy_costs:
            if cost.get("energy_type") not in ENERGY_TYPES:
                raise HTTPException(status_code=400, detail=f"Tipo de energia invalido: {cost.get('energy_type')}")
            if cost.get("amount", 0) < 1:
                raise HTTPException(status_code=400, detail="Quantidade de energia deve ser maior que zero")

        if energy_costs:
            ability["energy_cost"] = sum(cost["amount"] for cost in energy_costs)

        ability["effects"] = normalize_effects(ability.get("effects", []))
        ability["rules"] = normalize_ability_rules(ability.get("rules", []))
        if ability.get("damage", 0) > 0 and not any(effect["type"] == "DAMAGE" for effect in ability["effects"]):
            ability["effects"].insert(0, {
                "type": "DAMAGE",
                "target": "OPPONENT_ACTIVE",
                "duration": "INSTANT",
                "amount": ability["damage"],
                "energy_type": None,
                "nature": None,
                "card_name": None,
                "tag": None,
                "condition": None,
            })

    return payload


def normalize_deck_payload(body: DeckCreate) -> dict:
    payload = body.model_dump()
    energy_types = [energy for energy in payload.get("energy_types", []) if energy in ENERGY_TYPES]
    payload["energy_types"] = energy_types or ["Universal"]
    return payload


def normalize_legacy_abilities(card: dict) -> dict:
    abilities = card.get("abilities")
    if isinstance(abilities, str):
        card["abilities"] = [{"name": "Habilidade", "description": abilities}]
    elif isinstance(abilities, list) and abilities and isinstance(abilities[0], str):
        card["abilities"] = [
            {"name": f"Habilidade {index + 1}", "description": ability}
            for index, ability in enumerate(abilities)
        ]
    return card


async def add_public_card_to_library(user_id: str, card_id: str) -> dict:
    original = await db.cards.find_one({"id": card_id, "public_status": "approved"}, {"_id": 0})
    if not original:
        raise HTTPException(status_code=404, detail="Carta publica aprovada nao encontrada")
    if original["user_id"] == user_id:
        if original.get("owner_library_removed"):
            await db.cards.update_one(
                {"id": card_id, "user_id": user_id},
                {"$unset": {"owner_library_removed": "", "owner_library_removed_at": ""}}
            )
            return {"ok": True, "card_id": card_id}
        raise HTTPException(status_code=409, detail="Voce ja possui esta carta na sua biblioteca.")

    existing = await db.user_library.find_one({"user_id": user_id, "card_id": card_id})
    if existing:
        raise HTTPException(status_code=409, detail="Voce ja possui esta carta na sua biblioteca.")

    await db.user_library.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "card_id": card_id,
        "added_at": utc_now().isoformat(),
    })
    return {"ok": True, "card_id": card_id}


async def library_card_ids_for_user(user_id: str) -> list[str]:
    rows = await db.user_library.find({"user_id": user_id}, {"_id": 0, "card_id": 1}).to_list(2000)
    return [row["card_id"] for row in rows if row.get("card_id")]


async def accessible_cards_for_user(user_id: str, card_ids: Optional[list[str]] = None) -> list[dict]:
    own_query = {"user_id": user_id}
    if card_ids is not None:
        own_query["id"] = {"$in": card_ids}
    else:
        own_query["archived_clone"] = {"$ne": True}
        own_query["owner_library_removed"] = {"$ne": True}
    own_cards = await db.cards.find(own_query, {"_id": 0}).to_list(3000)

    linked_ids = await library_card_ids_for_user(user_id)
    if card_ids is not None:
        linked_ids = [card_id for card_id in linked_ids if card_id in set(card_ids)]
    linked_cards = []
    if linked_ids:
        linked_cards = await db.cards.find(
            {"id": {"$in": linked_ids}, "public_status": "approved"},
            {"_id": 0}
        ).to_list(3000)
        linked_id_set = set(linked_ids)
        for card in linked_cards:
            card["is_library_reference"] = True
            card["library_card_id"] = card["id"]
            card["can_edit"] = False
            card["added_from_community"] = card["id"] in linked_id_set

    own_by_id = {card["id"]: card for card in own_cards}
    combined = list(own_cards)
    for card in linked_cards:
        if card["id"] not in own_by_id:
            combined.append(card)

    for card in combined:
        normalize_legacy_abilities(card)
        card.setdefault("can_edit", card.get("user_id") == user_id)
    return combined


async def accessible_cards_by_id_for_user(user_id: str, card_ids: list[str]) -> dict:
    cards = await accessible_cards_for_user(user_id, card_ids)
    return {card["id"]: card for card in cards}


def validate_approved_duel_cards(cards: list[dict]) -> None:
    if any(card.get("public_status") != "approved" for card in cards):
        raise HTTPException(
            status_code=400,
            detail="Seu deck possui cartas que ainda nao foram aprovadas para duelo."
        )


# ============ Auth endpoints ============
ONLINE_WINDOW_SECONDS = 90


def utc_now():
    return datetime.now(timezone.utc)


def parse_datetime(value: Optional[str]):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def is_online(last_seen: Optional[str]) -> bool:
    seen_at = parse_datetime(last_seen)
    if not seen_at:
        return False
    if seen_at.tzinfo is None:
        seen_at = seen_at.replace(tzinfo=timezone.utc)
    return utc_now() - seen_at <= timedelta(seconds=ONLINE_WINDOW_SECONDS)


async def touch_user_presence(user_id: str):
    now = utc_now().isoformat()
    await db.users.update_one({"id": user_id}, {"$set": {"last_seen": now}})
    return now


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
    now = utc_now().isoformat()
    user_doc = {
        "id": user_id, "email": email, "name": body.name,
        "role": "user",
        "password_hash": hash_password(body.password),
        "created_at": now,
        "last_seen": now,
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
    await touch_user_presence(user["id"])
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
    await touch_user_presence(user["id"])
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user.get("role", "user")}


@api_router.post("/presence/heartbeat")
async def presence_heartbeat(request: Request):
    user = await get_current_user(request, db)
    last_seen = await touch_user_presence(user["id"])
    return {"ok": True, "last_seen": last_seen, "is_online": True}


@api_router.get("/users/presence", response_model=List[UserPresenceOut])
async def list_user_presence(request: Request):
    current_user = await get_current_user(request, db)
    await touch_user_presence(current_user["id"])
    users = await db.users.find(
        {},
        {"_id": 0, "password_hash": 0}
    ).sort("name", 1).to_list(1000)

    return [
        {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name", ""),
            "role": user.get("role", "user"),
            "last_seen": user.get("last_seen"),
            "is_online": is_online(user.get("last_seen")),
        }
        for user in users
    ]


@api_router.put("/auth/me")
async def update_profile(body: ProfileUpdate, request: Request):
    user = await get_current_user(request, db)
    name = body.name.strip()

    if not name:
        raise HTTPException(status_code=400, detail="Nome e obrigatorio")

    update = {"name": name}

    if body.new_password:
        if len(body.new_password) < 6:
            raise HTTPException(status_code=400, detail="A nova senha deve ter pelo menos 6 caracteres")

        stored_user = await db.users.find_one({"id": user["id"]})
        if not stored_user or not body.current_password or not verify_password(body.current_password, stored_user["password_hash"]):
            raise HTTPException(status_code=400, detail="Senha atual invalida")

        update["password_hash"] = hash_password(body.new_password)

    await db.users.update_one({"id": user["id"]}, {"$set": update})
    result = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return {
        "id": result["id"],
        "email": result["email"],
        "name": result["name"],
        "role": result.get("role", "user"),
    }


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
    if body.rarity not in [0, 1, 2, 3, 4]:
        raise HTTPException(status_code=400, detail="Raridade deve ser 0, 1, 2, 3 ou 4")
    if len(body.abilities) > 3:
        raise HTTPException(status_code=400, detail="Máximo de 3 habilidades por carta")

    card_id = str(uuid.uuid4())
    doc = normalize_card_payload(body)
    doc.update({
        "id": card_id, "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.cards.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/cards")
async def list_cards(request: Request):
    user = await get_current_user(request, db)
    cards = await accessible_cards_for_user(user["id"])
    return sorted(cards, key=lambda card: card.get("created_at", ""), reverse=True)

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


@api_router.get("/cards/{card_id}")
async def get_card(card_id: str, request: Request):
    user = await get_current_user(request, db)

    card = await db.cards.find_one(
        {"id": card_id, "user_id": user["id"]},
        {"_id": 0}
    )

    if not card:
        linked = await db.user_library.find_one({"user_id": user["id"], "card_id": card_id})
        if linked:
            card = await db.cards.find_one({"id": card_id, "public_status": "approved"}, {"_id": 0})
            if card:
                card["is_library_reference"] = True
                card["can_edit"] = False

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
    update = normalize_card_payload(body)
    if existing.get("public_status") == "approved" and user.get("role") != "admin":
        update["public_status"] = "pending"
    await db.cards.update_one({"id": card_id}, {"$set": update})
    result = await db.cards.find_one({"id": card_id}, {"_id": 0})
    return result


@api_router.delete("/cards/{card_id}")
async def delete_card(card_id: str, request: Request):
    user = await get_current_user(request, db)
    own_card = await db.cards.find_one({"id": card_id, "user_id": user["id"]}, {"_id": 0})
    if own_card and (own_card.get("public_status") == "approved" or user.get("role") == "admin"):
        await db.cards.update_one(
            {"id": card_id, "user_id": user["id"]},
            {"$set": {
                "owner_library_removed": True,
                "owner_library_removed_at": utc_now().isoformat(),
            }}
        )
        return {"ok": True, "removed_from_library": True}
    if own_card:
        res = await db.cards.delete_one({"id": card_id, "user_id": user["id"]})
        return {"ok": res.deleted_count > 0}
    res = await db.user_library.delete_one({"user_id": user["id"], "card_id": card_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Carta não encontrada")
    return {"ok": True, "removed_from_library": True}


# ============ Community library ============
@api_router.get("/community/cards")
async def community_cards(request: Request, q: str = "", nature: str = "", card_type: str = ""):
    # Require auth but show all approved cards
    user = await get_current_user(request, db)

    query = {
        "public_status": (
            {"$in": ["approved", "pending", "rejected"]}
            if user.get("role") == "admin"
            else "approved"
        )
    }

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
    linked_ids = set(await library_card_ids_for_user(user["id"]))

    for c in cards:
        c["owner_name"] = name_by_id.get(
            c["user_id"],
            "Desconhecido"
        )
        c["is_owned_by_me"] = c.get("user_id") == user["id"]
        c["is_in_my_library"] = (c["is_owned_by_me"] and not c.get("owner_library_removed")) or c.get("id") in linked_ids
        c["can_add_to_library"] = c.get("public_status") == "approved" and not c["is_in_my_library"]

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


@api_router.post("/cards/{card_id}/add-to-library")
async def add_to_library(card_id: str, request: Request):
    user = await get_current_user(request, db)
    result = await add_public_card_to_library(user["id"], card_id)
    return {**result, "message": "Carta adicionada a biblioteca"}


@api_router.post("/cards/{card_id}/clone")
async def clone_card(card_id: str, request: Request):
    user = await get_current_user(request, db)
    result = await add_public_card_to_library(user["id"], card_id)
    return {**result, "message": "Carta adicionada a biblioteca"}


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


@api_router.get("/admin/users", response_model=List[UserOut])
async def list_users(request: Request):
    await require_admin(request)
    users = await db.users.find(
        {},
        {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).to_list(1000)

    return [
        {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name", ""),
            "role": user.get("role", "user"),
        }
        for user in users
    ]


@api_router.put("/admin/users/{user_id}/role")
async def update_user_role(user_id: str, body: AdminRoleUpdate, request: Request):
    admin = await require_admin(request)

    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Voce nao pode alterar sua propria permissao")

    if body.role not in ["user", "admin"]:
        raise HTTPException(status_code=400, detail="Role invalida")

    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"role": body.role}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "user"),
    }


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

@api_router.put("/admin/cards/{card_id}/edit")
async def admin_edit_card(card_id: str, body: CardCreate, request: Request):
    await require_admin(request)
    existing = await db.cards.find_one({"id": card_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Carta não encontrada")
    update = normalize_card_payload(body)
    await db.cards.update_one({"id": card_id}, {"$set": update})
    result = await db.cards.find_one({"id": card_id}, {"_id": 0})
    return result


@api_router.post("/admin/community/migrate-legacy-clones", response_model=LegacyCommunityMigrationResult)
async def migrate_legacy_community_clones(request: Request):
    await require_admin(request)
    source_fields = ["original_card_id", "cloned_from", "source_card_id"]
    migrated = 0
    skipped = 0

    query = {
        "$or": [{field: {"$exists": True, "$ne": None, "$ne": ""}} for field in source_fields],
        "legacy_clone": {"$ne": True},
        "archived_clone": {"$ne": True},
    }
    clones = await db.cards.find(query, {"_id": 0}).to_list(2000)

    for clone in clones:
        source_id = next((clone.get(field) for field in source_fields if clone.get(field)), None)
        if not source_id or source_id == clone.get("id"):
            skipped += 1
            continue

        original = await db.cards.find_one({"id": source_id, "public_status": "approved"}, {"_id": 0})
        if not original or original.get("user_id") == clone.get("user_id"):
            skipped += 1
            continue

        existing_link = await db.user_library.find_one({"user_id": clone["user_id"], "card_id": original["id"]})
        if not existing_link:
            await db.user_library.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": clone["user_id"],
                "card_id": original["id"],
                "added_at": utc_now().isoformat(),
                "migrated_from_clone_id": clone["id"],
            })

        await db.cards.update_one(
            {"id": clone["id"]},
            {"$set": {
                "legacy_clone": True,
                "archived_clone": True,
                "legacy_source_card_id": original["id"],
                "legacy_migrated_at": utc_now().isoformat(),
            }}
        )
        migrated += 1

    return {"ok": True, "migrated": migrated, "skipped": skipped}

@api_router.delete("/admin/cards/{card_id}")
async def admin_delete_card(
    card_id: str,
    request: Request
):
    await require_admin(request)

    res = await db.cards.delete_one({
        "id": card_id
    })

    if res.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Carta não encontrada"
        )

    await db.user_library.delete_many({"card_id": card_id})

    return {"ok": True}


# ============ Online duel helpers ============
ONLINE_DUEL_HAND_SIZE = 5
ONLINE_DUEL_BENCH_LIMIT = 3
ONLINE_DUEL_POINTS_TO_WIN = 3
ONLINE_DUEL_ENERGY_PER_TURN = 1


def _duel_side_for_user(duel: dict, user_id: str) -> Optional[str]:
    for side in ["p1", "p2"]:
        if duel.get("players", {}).get(side, {}).get("user_id") == user_id:
            return side
    return None


def _opponent_side(side: str) -> str:
    return "p2" if side == "p1" else "p1"


def _new_card_instance(card: dict, turn_number: int) -> dict:
    instance = copy.deepcopy(card)
    instance["instance_id"] = str(uuid.uuid4())
    instance["hp_remaining"] = max(0, int(instance.get("hp") or 0))
    instance["attached_energy"] = []
    instance["equipments"] = []
    instance["entered_turn"] = turn_number
    return instance


def _to_hand_card(card: Optional[dict]) -> Optional[dict]:
    if not card:
        return card
    next_card = copy.deepcopy(card)
    for key in [
        "instance_id", "hp_remaining", "attached_energy", "equipments",
        "pending_damage_reduction", "next_damage_multiplier", "entered_turn",
        "evolved_from", "status_effects", "last_used_ability_name",
    ]:
        next_card.pop(key, None)
    return next_card


def _is_basic_character(card: Optional[dict]) -> bool:
    return bool(card and card.get("card_type") == "Personagem" and not card.get("is_evolution"))


def _normalize_energy_types(energy_types: list[str]) -> list[str]:
    valid = [energy for energy in energy_types or [] if energy in ENERGY_TYPES]
    return valid or ["Universal"]


def _random_energy(energy_types: list[str]) -> str:
    return random.choice(_normalize_energy_types(energy_types))


def _shuffle_opening_deck(cards: list[dict]) -> list[dict]:
    best = copy.deepcopy(cards)
    random.shuffle(best)
    for _ in range(30):
        deck = copy.deepcopy(cards)
        random.shuffle(deck)
        if any(_is_basic_character(card) for card in deck[:ONLINE_DUEL_HAND_SIZE]):
            return deck
        best = deck
    return best


def _draw_cards(player: dict, amount: int = 1) -> dict:
    next_player = copy.deepcopy(player)
    for _ in range(amount):
        if next_player.get("deck"):
            next_player.setdefault("hand", []).append(next_player["deck"].pop(0))
    return next_player


def _make_duel_player(name: str, cards: list[dict], energy_types: list[str], turn_number: int) -> dict:
    energies = _normalize_energy_types(energy_types)
    player = {
        "name": name,
        "deck": _shuffle_opening_deck(cards),
        "hand": [],
        "discard": [],
        "active": None,
        "bench": [],
        "points": 0,
        "energy_types": energies,
        "energy_zone": {"current": _random_energy(energies), "next": _random_energy(energies)},
        "energy_remaining": ONLINE_DUEL_ENERGY_PER_TURN,
        "setup_ready": False,
    }
    return _draw_cards(player, ONLINE_DUEL_HAND_SIZE)


async def _expand_owned_deck(user_id: str, deck_id: str) -> tuple[dict, list[dict], list[str]]:
    deck = await db.decks.find_one({"id": deck_id, "user_id": user_id}, {"_id": 0})
    if not deck:
        raise HTTPException(status_code=404, detail="Deck nao encontrado")
    deck["energy_types"] = _normalize_energy_types(deck.get("energy_types", []))
    unique_ids = list(set(deck.get("card_ids", [])))
    cards = []
    if unique_ids:
        cards = await accessible_cards_for_user(user_id, unique_ids)
    cards_by_id = {card["id"]: card for card in cards}
    expanded = [cards_by_id[cid] for cid in deck.get("card_ids", []) if cid in cards_by_id]
    return deck, expanded, _validate_deck_rules(deck.get("card_ids", []), cards_by_id)


def _validate_online_deck(cards: list[dict], warnings: list[str]) -> None:
    validate_approved_duel_cards(cards)
    if len(cards) != 20:
        raise HTTPException(status_code=400, detail="Deck de duelo precisa ter exatamente 20 cartas")
    blocking = [warning for warning in warnings if "energia vem da Energy Zone" in warning or "maximo 2" in warning or "máximo 2" in warning]
    if blocking:
        raise HTTPException(status_code=400, detail=blocking[0])
    if not any(_is_basic_character(card) for card in cards):
        raise HTTPException(status_code=400, detail="Deck precisa ter pelo menos uma carta basica")


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "user"),
        "last_seen": user.get("last_seen"),
        "is_online": is_online(user.get("last_seen")),
    }


def _sanitize_player_for_view(player: dict, reveal_hand: bool) -> dict:
    visible = copy.deepcopy(player)
    visible["deck_count"] = len(visible.get("deck", []))
    visible["discard_count"] = len(visible.get("discard", []))
    visible.pop("deck", None)
    if not reveal_hand:
        visible["hand_count"] = len(visible.get("hand", []))
        visible["hand"] = [None for _ in visible.get("hand", [])]
    return visible


def _online_duel_view(duel: dict, user_id: str) -> dict:
    side = _duel_side_for_user(duel, user_id)
    if not side:
        raise HTTPException(status_code=404, detail="Duelo nao encontrado")
    opp = _opponent_side(side)
    state = duel.get("state")
    visible_state = None
    if state:
        visible_state = copy.deepcopy(state)
        visible_state["turn"] = "player" if state.get("turn") == side else "opponent"
        if state.get("winner"):
            visible_state["winner"] = "player" if state.get("winner") == side else "opponent"
        visible_state["players"] = {
            "player": _sanitize_player_for_view(state["players"][side], True),
            "opponent": _sanitize_player_for_view(state["players"][opp], False),
        }
    result = copy.deepcopy(duel)
    result.pop("_id", None)
    result["my_side"] = side
    result["opponent_side"] = opp
    result["me"] = result.get("players", {}).get(side, {})
    result["opponent"] = result.get("players", {}).get(opp, {})
    result["state"] = visible_state
    return result


async def _get_online_duel_for_user(duel_id: str, user_id: str) -> dict:
    duel = await db.online_duels.find_one({"id": duel_id})
    if not duel or not _duel_side_for_user(duel, user_id):
        raise HTTPException(status_code=404, detail="Duelo nao encontrado")
    return duel


def _with_duel_log(state: dict, message: str) -> dict:
    next_state = copy.deepcopy(state)
    next_state["log"] = [message, *(next_state.get("log") or [])][:30]
    return next_state


def _target_card(player: dict, zone: str, index: int = 0) -> Optional[dict]:
    if zone == "active":
        return player.get("active")
    return (player.get("bench") or [None])[index] if index < len(player.get("bench") or []) else None


def _set_target_card(player: dict, zone: str, index: int, card: dict) -> dict:
    next_player = copy.deepcopy(player)
    if zone == "active":
        next_player["active"] = card
    elif index < len(next_player.get("bench", [])):
        next_player["bench"][index] = card
    return next_player


def _promote_if_needed(player: dict) -> dict:
    next_player = copy.deepcopy(player)
    if not next_player.get("active") and next_player.get("bench"):
        next_player["active"] = next_player["bench"].pop(0)
    return next_player


def _check_online_winner(state: dict) -> dict:
    next_state = copy.deepcopy(state)
    p1 = next_state["players"]["p1"]
    p2 = next_state["players"]["p2"]
    if p1.get("points", 0) >= ONLINE_DUEL_POINTS_TO_WIN:
        next_state["winner"] = "p1"
    elif p2.get("points", 0) >= ONLINE_DUEL_POINTS_TO_WIN:
        next_state["winner"] = "p2"
    elif not p1.get("active") and not p1.get("bench"):
        next_state["winner"] = "p2"
    elif not p2.get("active") and not p2.get("bench"):
        next_state["winner"] = "p1"
    return next_state


def _knockout_points(card: Optional[dict]) -> int:
    if not card:
        return 1
    try:
        explicit = int(card.get("knockout_points") or card.get("point_value") or card.get("points") or 0)
    except (TypeError, ValueError):
        explicit = 0
    return explicit if explicit > 0 else (2 if card.get("is_alpha") else 1)


def _card_without_equipments(card: Optional[dict]) -> Optional[dict]:
    if not card:
        return card
    result = copy.deepcopy(card)
    result["equipments"] = []
    return result


def _discard_card_with_equipments(player: dict, card: Optional[dict]) -> None:
    if not card:
        return
    player.setdefault("discard", []).append(_card_without_equipments(card))
    for equipment in card.get("equipments") or []:
        player.setdefault("discard", []).append(equipment)


def _resolve_online_knockouts(state: dict, attacking_side: str) -> dict:
    next_state = copy.deepcopy(state)
    defender_side = _opponent_side(attacking_side)
    for side, opponent in [(attacking_side, defender_side), (defender_side, attacking_side)]:
        owner = next_state["players"][side]
        scorer = next_state["players"][opponent]
        active = owner.get("active")
        if active and active.get("hp_remaining", 0) <= 0:
            _discard_card_with_equipments(owner, active)
            scorer["points"] = scorer.get("points", 0) + _knockout_points(active)
            owner["active"] = None
            next_state = _with_duel_log(next_state, f"{active.get('name')} foi nocauteado.")
        bench = []
        for card in owner.get("bench", []):
            if card and card.get("hp_remaining", 0) <= 0:
                _discard_card_with_equipments(owner, card)
                scorer["points"] = scorer.get("points", 0) + _knockout_points(card)
                next_state = _with_duel_log(next_state, f"{card.get('name')} foi nocauteado.")
            else:
                bench.append(card)
        owner["bench"] = bench
        next_state["players"][side] = _promote_if_needed(owner)
        next_state["players"][opponent] = scorer
    return _check_online_winner(next_state)


def _finish_online_turn(state: dict) -> dict:
    if state.get("phase") != "battle" or state.get("winner"):
        return state
    next_state = copy.deepcopy(state)
    ending_side = next_state["turn"]
    active = next_state["players"][ending_side].get("active")
    if active and "burn" in (active.get("status_effects") or []):
        active["hp_remaining"] = max(0, int(active.get("hp_remaining") or 0) - 10)
        next_state["players"][ending_side]["active"] = active
        next_state = _with_duel_log(next_state, f"{active.get('name')} sofreu 10 de dano de queimadura.")
        next_state = _resolve_online_knockouts(next_state, _opponent_side(ending_side))
        if next_state.get("winner"):
            return next_state
    next_state["players"][ending_side] = _online_clear_side_turn_statuses(next_state["players"][ending_side])
    next_side = _opponent_side(next_state["turn"])
    if next_state["turn"] == "p2":
        next_state["turn_number"] = next_state.get("turn_number", 1) + 1
    next_state["turn"] = next_side
    player = next_state["players"][next_side]
    player = _draw_cards(player, 1)
    player["energy_zone"] = {
        "current": player.get("energy_zone", {}).get("next") or _random_energy(player.get("energy_types", [])),
        "next": _random_energy(player.get("energy_types", [])),
    }
    player["energy_remaining"] = ONLINE_DUEL_ENERGY_PER_TURN
    next_state["players"][next_side] = player
    return _with_duel_log(next_state, f"Turno de {player.get('name')}.")


def _online_effects(effects: Optional[list[dict]]) -> list[dict]:
    normalized = []
    for effect in effects or []:
        if not effect or not effect.get("type"):
            continue
        normalized.append({
            **effect,
            "target": effect.get("target") or "OPPONENT_ACTIVE",
            "amount": max(0, int(effect.get("amount") or 0)),
            "duration": effect.get("duration") or "INSTANT",
        })
    return normalized


def _online_ref_card(state: dict, ref: Optional[dict]) -> Optional[dict]:
    if not ref:
        return None
    return _target_card(state["players"][ref["side"]], ref.get("zone", "active"), ref.get("index", 0))


def _online_set_ref_card(state: dict, ref: dict, card: dict) -> dict:
    next_state = copy.deepcopy(state)
    player = next_state["players"][ref["side"]]
    next_state["players"][ref["side"]] = _set_target_card(player, ref.get("zone", "active"), ref.get("index", 0), card)
    return next_state


def _online_infer_source_ref(state: dict, side: str, source_card: Optional[dict]) -> Optional[dict]:
    active = state["players"][side].get("active") or {}
    if source_card and active.get("instance_id") == source_card.get("instance_id"):
        return {"side": side, "zone": "active", "index": 0}
    return None


def _online_target_refs(state: dict, side: str, effect: dict, context: Optional[dict] = None) -> list[dict]:
    context = context or {}
    if effect.get("target_override") and effect.get("type") in ONLINE_DAMAGE_EFFECTS:
        return [effect["target_override"]]
    if effect.get("target") == "EQUIPPED_CARD" and context.get("equipped_card_ref"):
        return [context["equipped_card_ref"]]
    if effect.get("target") == "DAMAGE_SOURCE" and context.get("damage_source_ref"):
        return [context["damage_source_ref"]]
    if effect.get("target") == "DAMAGE_TARGET" and context.get("damage_target_ref"):
        return [context["damage_target_ref"]]

    opponent_side = _opponent_side(side)
    player = state["players"][side]
    opponent = state["players"][opponent_side]
    own_bench = [{"side": side, "zone": "bench", "index": index} for index, card in enumerate(player.get("bench", [])) if card]
    opp_bench = [{"side": opponent_side, "zone": "bench", "index": index} for index, card in enumerate(opponent.get("bench", [])) if card]

    effect_type = effect.get("type")
    target = effect.get("target") or "OPPONENT_ACTIVE"

    if effect_type == "DAMAGE_SELF":
        return [{"side": side, "zone": "active", "index": 0}] if player.get("active") else []
    if effect_type in ["DAMAGE_ACTIVE_AND_BENCH", "DAMAGE_SPLIT"]:
        return ([{"side": opponent_side, "zone": "active", "index": 0}] if opponent.get("active") else []) + opp_bench
    if effect_type == "DAMAGE_ALL_OPPONENT_BENCH":
        return opp_bench
    if effect_type == "DAMAGE_TO_PREVIOUSLY_DAMAGED_BENCH":
        return [ref for ref in opp_bench if (_online_ref_card(state, ref) or {}).get("hp_remaining", 0) < (_online_ref_card(state, ref) or {}).get("hp", 0)]

    if target in ["SELF", "SELF_ACTIVE"]:
        return [{"side": side, "zone": "active", "index": 0}] if player.get("active") else []
    if target in ["SELF_BENCH", "ALL_SELF_BENCH"]:
        return own_bench
    if target == "SELF_BENCH_RANDOM":
        return [random.choice(own_bench)] if own_bench else []
    if target == "SELF_BENCH_BY_NATURE":
        return [ref for ref in own_bench if effect.get("nature") in ((_online_ref_card(state, ref) or {}).get("natures") or [])]
    if target == "SELF_BENCH_BY_NAME":
        return [ref for ref in own_bench if (_online_ref_card(state, ref) or {}).get("name") == effect.get("card_name")]
    if target == "ANY_SELF_CARD":
        return [{"side": side, "zone": "active", "index": 0}] if player.get("active") else own_bench[:1]
    if target == "ALL_SELF_CARDS":
        return ([{"side": side, "zone": "active", "index": 0}] if player.get("active") else []) + own_bench
    if target in ["OPPONENT_BENCH", "ALL_OPPONENT_BENCH"]:
        return opp_bench
    if target == "OPPONENT_BENCH_RANDOM":
        return [random.choice(opp_bench)] if opp_bench else []
    if target == "ANY_OPPONENT_CARD":
        return [{"side": opponent_side, "zone": "active", "index": 0}] if opponent.get("active") else opp_bench[:1]
    if target == "ALL_OPPONENT_CARDS":
        return ([{"side": opponent_side, "zone": "active", "index": 0}] if opponent.get("active") else []) + opp_bench
    if target == "PREVIOUSLY_DAMAGED_OPPONENT":
        refs = ([{"side": opponent_side, "zone": "active", "index": 0}] if opponent.get("active") and opponent["active"].get("hp_remaining", 0) < opponent["active"].get("hp", 0) else [])
        return refs + [ref for ref in opp_bench if (_online_ref_card(state, ref) or {}).get("hp_remaining", 0) < (_online_ref_card(state, ref) or {}).get("hp", 0)]

    return [{"side": opponent_side, "zone": "active", "index": 0}] if opponent.get("active") else []


ONLINE_DAMAGE_EFFECTS = {
    "DAMAGE", "DAMAGE_RANDOM_TARGETS", "DAMAGE_ANY_TARGET", "DAMAGE_ACTIVE_AND_BENCH",
    "DAMAGE_ALL_OPPONENT_BENCH", "DAMAGE_SELF", "DAMAGE_EXTRA_BY_ENERGY",
    "DAMAGE_EXTRA_BY_BENCH_CARD", "DAMAGE_EXTRA_BY_TARGET_TYPE", "DAMAGE_EXTRA_BY_DICE",
    "DAMAGE_EXTRA_BY_COIN", "DAMAGE_CONSECUTIVE_STACK", "DAMAGE_SPLIT",
    "DAMAGE_TO_PREVIOUSLY_DAMAGED_BENCH",
}
ONLINE_HEAL_EFFECTS = {"HEAL", "HEAL_SELF", "HEAL_ACTIVE", "HEAL_BENCH", "HEAL_ANY_SELF_CARD", "HEAL_EQUIPPED_CARD", "HEAL_BY_DAMAGE_DEALT", "HEAL_ALLY_ON_DAMAGE", "HEAL_PER_TURN"}
ONLINE_ADD_ENERGY_EFFECTS = {"ADD_ENERGY", "ADD_TYPED_ENERGY", "ADD_ENERGY_TO_ACTIVE", "ADD_ENERGY_TO_BENCH", "ADD_ENERGY_BY_COIN", "ADD_ENERGY_BY_DAMAGE_TAKEN", "ADD_ENERGY_ON_ATTACK", "ADD_MULTIPLE_ENERGY"}
ONLINE_REMOVE_ENERGY_EFFECTS = {"REMOVE_ENERGY", "REMOVE_RANDOM_ENERGY", "DISCARD_OWN_ENERGY"}
ONLINE_BUFF_EFFECTS = {"BUFF_DAMAGE", "BUFF_DAMAGE_THIS_TURN", "BUFF_DAMAGE_NEXT_TURN", "BUFF_EQUIPPED_CARD_DAMAGE", "BUFF_DAMAGE_BY_TAG", "BUFF_DAMAGE_BY_ATTACHED_ENERGY", "BUFF_BASE_ATTRIBUTES", "INCREASE_MAX_HP", "BUFF_HEAL_AMOUNT", "DOUBLE_DAMAGE_AGAINST_TYPE", "WEAKNESS_OVERRIDE", "ALPHA_POINT_OVERRIDE", "ENERGY_ANY_TYPE", "ENERGY_COST_REDUCTION", "ENERGY_REQUIRED_TYPE", "IGNORE_RETREAT_COST", "REDUCE_RETREAT_COST", "ATTACK_FROM_BENCH"}
ONLINE_DEFENSE_EFFECTS = {"REDUCE_DAMAGE", "REDUCE_NEXT_DAMAGE", "HALVE_DAMAGE_TAKEN", "PREVENT_DAMAGE"}
ONLINE_STATUS_EFFECTS = {"BURN", "PARALYZE", "FREEZE", "CONFUSE", "PREVENT_ATTACK", "PREVENT_RETREAT", "BLOCK_RETREAT", "SKIP_NEXT_ATTACK", "CANNOT_USE_SAME_ATTACK_NEXT_TURN"}
ONLINE_IMMUNITY_EFFECTS = {"IMMUNE_TO_DAMAGE_TYPE", "IMMUNE_TO_NEGATIVE_EFFECTS", "IGNORE_TOOL_EFFECTS", "REFLECT_DAMAGE", "REFLECT_DOUBLE_DAMAGE", "REDIRECT_DAMAGE", "SHARE_DAMAGE"}
ONLINE_ONE_TURN_STATUSES = {"paralyze", "freeze", "prevent_attack", "prevent_retreat", "block_retreat", "skip_next_attack", "cannot_use_same_attack"}
ONLINE_STATUS_BY_EFFECT = {
    "BURN": "burn",
    "PARALYZE": "paralyze",
    "FREEZE": "freeze",
    "CONFUSE": "confuse",
    "PREVENT_ATTACK": "prevent_attack",
    "PREVENT_RETREAT": "prevent_retreat",
    "BLOCK_RETREAT": "block_retreat",
    "SKIP_NEXT_ATTACK": "skip_next_attack",
    "CANNOT_USE_SAME_ATTACK_NEXT_TURN": "cannot_use_same_attack",
}
ONLINE_EQUIPMENT_DAMAGE_BONUS_EFFECTS = {"BUFF_DAMAGE", "BUFF_DAMAGE_THIS_TURN", "BUFF_DAMAGE_NEXT_TURN", "BUFF_EQUIPPED_CARD_DAMAGE", "BUFF_DAMAGE_BY_TAG", "BUFF_DAMAGE_BY_ATTACHED_ENERGY"}
ONLINE_EQUIPMENT_ON_EQUIP_EFFECTS = {
    "HEAL", "HEAL_SELF", "HEAL_ACTIVE", "HEAL_EQUIPPED_CARD",
    "ADD_ENERGY", "ADD_TYPED_ENERGY", "ADD_ENERGY_TO_ACTIVE", "ADD_MULTIPLE_ENERGY",
    "BURN", "PARALYZE", "FREEZE", "CONFUSE", "PREVENT_ATTACK", "PREVENT_RETREAT",
    "SKIP_NEXT_ATTACK", "CANNOT_USE_SAME_ATTACK_NEXT_TURN",
    "BUFF_BASE_ATTRIBUTES", "INCREASE_MAX_HP", "BUFF_HEAL_AMOUNT",
    "DOUBLE_DAMAGE_AGAINST_TYPE", "WEAKNESS_OVERRIDE", "ALPHA_POINT_OVERRIDE",
    "REDUCE_DAMAGE", "REDUCE_NEXT_DAMAGE", "PREVENT_DAMAGE", "IMMUNE_TO_DAMAGE_TYPE",
    "IMMUNE_TO_NEGATIVE_EFFECTS", "IGNORE_TOOL_EFFECTS", "HALVE_DAMAGE_TAKEN",
    "REFLECT_DAMAGE", "REFLECT_DOUBLE_DAMAGE", "REDIRECT_DAMAGE", "SHARE_DAMAGE",
    "ENERGY_ANY_TYPE", "ENERGY_COST_REDUCTION", "ENERGY_REQUIRED_TYPE",
    "IGNORE_RETREAT_COST", "REDUCE_RETREAT_COST", "BLOCK_RETREAT", "ATTACK_FROM_BENCH",
}


def _online_equipment_effect_should_trigger(effect: dict, trigger: str) -> bool:
    if not effect or not effect.get("type") or not trigger:
        return False
    condition = effect.get("condition") or ""
    if condition == trigger:
        return True
    return trigger == "ON_EQUIP" and condition == "" and effect.get("type") in ONLINE_EQUIPMENT_ON_EQUIP_EFFECTS


def _online_passive_damage_bonus(card: Optional[dict]) -> int:
    total = 0
    for equipment in (card or {}).get("equipments") or []:
        for effect in _online_effects(equipment.get("passive_effects")):
            if effect.get("type") in ONLINE_EQUIPMENT_DAMAGE_BONUS_EFFECTS:
                condition = effect.get("condition") or ""
                if condition in ["", "EQUIPPED_CARD_DEALS_DAMAGE", "EQUIPPED_CARD_HAS_EQUIPMENT"]:
                    total += int(effect.get("amount") or 0)
    return total


def _online_add_status(card: dict, status: str) -> dict:
    updated = copy.deepcopy(card)
    updated["status_effects"] = list(dict.fromkeys([*(updated.get("status_effects") or []), status]))
    return updated


def _online_clear_one_turn_statuses(card: Optional[dict]) -> Optional[dict]:
    if not card:
        return card
    updated = copy.deepcopy(card)
    updated["status_effects"] = [
        status for status in (updated.get("status_effects") or [])
        if status not in ONLINE_ONE_TURN_STATUSES
    ]
    return updated


def _online_clear_side_turn_statuses(player: dict) -> dict:
    updated = copy.deepcopy(player)
    updated["active"] = _online_clear_one_turn_statuses(updated.get("active"))
    updated["bench"] = [_online_clear_one_turn_statuses(card) for card in updated.get("bench", [])]
    return updated


def _online_apply_buff(card: dict, effect: dict) -> dict:
    amount = max(0, int(effect.get("amount") or 0))
    effect_type = effect.get("type")
    updated = copy.deepcopy(card)
    if effect_type in ["BUFF_DAMAGE", "BUFF_DAMAGE_THIS_TURN", "BUFF_DAMAGE_NEXT_TURN", "BUFF_EQUIPPED_CARD_DAMAGE", "BUFF_DAMAGE_BY_TAG", "BUFF_DAMAGE_BY_ATTACHED_ENERGY"]:
        updated["bonus_damage"] = int(updated.get("bonus_damage") or 0) + amount
    elif effect_type in ["BUFF_BASE_ATTRIBUTES", "INCREASE_MAX_HP"]:
        updated["hp"] = int(updated.get("hp") or 0) + amount
        updated["hp_remaining"] = int(updated.get("hp_remaining") or 0) + amount
    elif effect_type == "BUFF_HEAL_AMOUNT":
        updated["heal_bonus"] = int(updated.get("heal_bonus") or 0) + amount
    elif effect_type == "DOUBLE_DAMAGE_AGAINST_TYPE":
        updated["double_damage_against"] = effect.get("nature") or effect.get("tag") or "ANY"
    elif effect_type == "WEAKNESS_OVERRIDE":
        updated["weakness_override"] = effect.get("nature") or effect.get("tag") or "none"
    elif effect_type == "ENERGY_ANY_TYPE":
        updated["energy_any_type"] = True
    elif effect_type == "ENERGY_COST_REDUCTION":
        updated["energy_cost_reduction"] = int(updated.get("energy_cost_reduction") or 0) + (amount or 1)
    elif effect_type == "ENERGY_REQUIRED_TYPE":
        updated["required_energy_type"] = effect.get("energy_type") or "Universal"
    elif effect_type == "IGNORE_RETREAT_COST":
        updated["ignore_retreat_cost"] = True
    elif effect_type == "REDUCE_RETREAT_COST":
        updated["retreat_cost_reduction"] = int(updated.get("retreat_cost_reduction") or 0) + (amount or 1)
    elif effect_type == "ALPHA_POINT_OVERRIDE":
        updated["knockout_points"] = amount or 1
    elif effect_type == "ATTACK_FROM_BENCH":
        updated["can_attack_from_bench"] = True
    return updated


def _online_apply_immunity(card: dict, effect: dict) -> dict:
    effect_type = effect.get("type")
    amount = max(0, int(effect.get("amount") or 0))
    updated = copy.deepcopy(card)
    if effect_type == "IMMUNE_TO_DAMAGE_TYPE":
        updated["immune_to_damage_type"] = effect.get("nature") or effect.get("tag") or "ANY"
    elif effect_type == "IMMUNE_TO_NEGATIVE_EFFECTS":
        updated["immune_to_negative_effects"] = True
    elif effect_type == "IGNORE_TOOL_EFFECTS":
        updated["ignore_tool_effects"] = True
    elif effect_type == "REFLECT_DAMAGE":
        updated["reflect_damage"] = amount or 9999
    elif effect_type == "REFLECT_DOUBLE_DAMAGE":
        updated["reflect_damage"] = 2
    elif effect_type == "REDIRECT_DAMAGE":
        updated["redirect_damage"] = True
    elif effect_type == "SHARE_DAMAGE":
        updated["share_damage"] = True
    return updated


def _resolve_online_special_effect(state: dict, side: str, source_card: Optional[dict], effect: dict) -> dict:
    next_state = copy.deepcopy(state)
    amount = max(0, int(effect.get("amount") or 0))
    opponent_side = _opponent_side(side)
    source_ref = _online_infer_source_ref(next_state, side, source_card)

    if effect.get("type") == "TRANSFORM_INTO_OPPONENT_BENCH_CARD":
        template = (next_state["players"][opponent_side].get("bench") or [None])[0]
        current = _online_ref_card(next_state, source_ref)
        if not template or not source_ref or not current:
            return next_state
        transformed = _new_card_instance(template, next_state.get("turn_number", 1))
        transformed["instance_id"] = current.get("instance_id")
        transformed["attached_energy"] = current.get("attached_energy") or []
        transformed["equipments"] = current.get("equipments") or []
        transformed["hp_remaining"] = min(int(template.get("hp") or 0), int(current.get("hp_remaining") or template.get("hp") or 0))
        transformed["transformed_from"] = current.get("name")
        next_state = _online_set_ref_card(next_state, source_ref, transformed)
        return _with_duel_log(next_state, f"{current.get('name')} se transformou em {template.get('name')}.")

    if effect.get("type") == "ABSORB_OWN_BENCH_CARD":
        active = next_state["players"][side].get("active")
        bench = next_state["players"][side].get("bench") or []
        if not active or not bench:
            return next_state
        absorbed = bench.pop(0)
        active["hp"] = int(active.get("hp") or 0) + int(absorbed.get("hp") or 0)
        active["hp_remaining"] = int(active.get("hp_remaining") or 0) + int(absorbed.get("hp_remaining") or absorbed.get("hp") or 0)
        active["attached_energy"] = [*(active.get("attached_energy") or []), *(absorbed.get("attached_energy") or [])]
        next_state["players"][side]["active"] = active
        next_state["players"][side]["bench"] = bench
        next_state["players"][side].setdefault("discard", []).append(_card_without_equipments(absorbed))
        return _with_duel_log(next_state, f"{active.get('name')} absorveu {absorbed.get('name')}.")

    if effect.get("type") in ["CREATE_TEMPORARY_UNIT", "PLAY_ITEM_AS_UNIT"]:
        player = next_state["players"][side]
        if len(player.get("bench") or []) >= ONLINE_DUEL_BENCH_LIMIT:
            return next_state
        player.setdefault("bench", []).append(_new_card_instance({
            "id": str(uuid.uuid4()),
            "name": effect.get("card_name") or (source_card or {}).get("name") or "Unidade temporaria",
            "card_type": "Personagem",
            "hp": amount or 40,
            "recuo": 0,
            "abilities": [],
            "natures": (source_card or {}).get("natures") or [],
        }, next_state.get("turn_number", 1)))
        next_state["players"][side] = player
        return _with_duel_log(next_state, f"{player.get('name')} criou uma unidade temporaria.")

    return next_state


def _resolve_online_effects(state: dict, side: str, source_card: Optional[dict], effects: list[dict], context: Optional[dict] = None) -> dict:
    context = context or {}
    next_state = copy.deepcopy(state)
    source_ref = context.get("source_ref") or _online_infer_source_ref(next_state, side, source_card)
    damage_dealt = 0

    for effect in _online_effects(effects):
        effect_type = effect.get("type")
        if effect.get("condition") and context.get("trigger") and effect.get("condition") != context.get("trigger"):
            continue

        if effect_type in ["TRANSFORM_INTO_OPPONENT_BENCH_CARD", "ABSORB_OWN_BENCH_CARD", "CREATE_TEMPORARY_UNIT", "PLAY_ITEM_AS_UNIT"]:
            next_state = _resolve_online_special_effect(next_state, side, source_card, effect)
            continue

        if effect_type in ["DRAW_CARD", "DRAW_MULTIPLE"]:
            next_state["players"][side] = _draw_cards(next_state["players"][side], effect.get("amount") or 1)
            next_state = _with_duel_log(next_state, f"{next_state['players'][side].get('name')} comprou {effect.get('amount') or 1} carta(s).")
            continue

        target_override = context.get("target_override") if effect_type in ONLINE_DAMAGE_EFFECTS else None
        if target_override:
            effect = {**effect, "target_override": target_override}
        refs = _online_target_refs(next_state, side, effect, context)
        if not refs:
            continue

        for ref in refs:
            target = _online_ref_card(next_state, ref)
            if not target:
                continue
            amount = max(0, int(effect.get("amount") or 0))

            if effect_type in ONLINE_DAMAGE_EFFECTS:
                damage_ref = ref
                damage_target = target
                if target.get("redirect_damage") and ref.get("zone") == "active" and next_state["players"][ref["side"]].get("bench"):
                    damage_ref = {"side": ref["side"], "zone": "bench", "index": 0}
                    damage_target = _online_ref_card(next_state, damage_ref) or target
                immune_type = damage_target.get("immune_to_damage_type")
                if immune_type == "ANY" or (immune_type and immune_type in ((source_card or {}).get("natures") or [])):
                    next_state = _with_duel_log(next_state, f"{damage_target.get('name')} ignorou o dano.")
                    continue
                passive_bonus = _online_passive_damage_bonus(source_card)
                static_bonus = int((source_card or {}).get("bonus_damage") or 0)
                energy_bonus = len((source_card or {}).get("attached_energy") or []) * amount if effect_type == "DAMAGE_EXTRA_BY_ENERGY" else 0
                target_type_bonus = amount if effect_type == "DAMAGE_EXTRA_BY_TARGET_TYPE" and (not effect.get("nature") or effect.get("nature") in (damage_target.get("natures") or [])) else 0
                coin_bonus = amount if effect_type == "DAMAGE_EXTRA_BY_COIN" and random.random() >= 0.5 else 0
                dice_bonus = (random.randint(1, 6) * amount) if effect_type == "DAMAGE_EXTRA_BY_DICE" else 0
                split_amount = int((amount + len(refs) - 1) / len(refs)) if effect_type == "DAMAGE_SPLIT" and refs else amount
                double_multiplier = 2 if (
                    (source_card or {}).get("double_damage_against") == "ANY" or
                    ((source_card or {}).get("double_damage_against") and (source_card or {}).get("double_damage_against") in (damage_target.get("natures") or []))
                ) else 1
                raw_total = max(0, split_amount + passive_bonus + static_bonus + energy_bonus + target_type_bonus + coin_bonus + dice_bonus)
                reduction = max(0, int(damage_target.get("pending_damage_reduction") or 0))
                multiplier = (damage_target.get("next_damage_multiplier") if isinstance(damage_target.get("next_damage_multiplier"), (int, float)) else 1) * double_multiplier
                total = max(0, int((raw_total - reduction) * multiplier))
                damage_target["hp_remaining"] = max(0, int(damage_target.get("hp_remaining") or 0) - total)
                damage_target["pending_damage_reduction"] = 0
                damage_target["next_damage_multiplier"] = None
                next_state = _online_set_ref_card(next_state, damage_ref, damage_target)
                damage_dealt += total
                next_state = _with_duel_log(next_state, f"{(source_card or {}).get('name', 'Carta')} causou {total} de dano em {damage_target.get('name')}.")
                damage_source_ref = context.get("damage_source_ref") or source_ref
                if total > 0 and damage_source_ref and damage_target.get("reflect_damage"):
                    reflected = total * 2 if damage_target.get("reflect_damage") == 2 else min(total, int(damage_target.get("reflect_damage") or total))
                    source = _online_ref_card(next_state, damage_source_ref)
                    if source:
                        source["hp_remaining"] = max(0, int(source.get("hp_remaining") or 0) - reflected)
                        next_state = _online_set_ref_card(next_state, damage_source_ref, source)
                        next_state = _with_duel_log(next_state, f"{damage_target.get('name')} refletiu {reflected} de dano.")
                if total > 0 and damage_source_ref and damage_target.get("share_damage"):
                    source = _online_ref_card(next_state, damage_source_ref)
                    if source:
                        source["hp_remaining"] = max(0, int(source.get("hp_remaining") or 0) - total)
                        next_state = _online_set_ref_card(next_state, damage_source_ref, source)
                        next_state = _with_duel_log(next_state, f"{damage_target.get('name')} compartilhou {total} de dano.")
            elif effect_type in ONLINE_HEAL_EFFECTS:
                heal = damage_dealt if effect_type == "HEAL_BY_DAMAGE_DEALT" and damage_dealt else amount
                heal += int(target.get("heal_bonus") or 0)
                target["hp_remaining"] = min(int(target.get("hp") or 0), int(target.get("hp_remaining") or 0) + heal)
                next_state = _online_set_ref_card(next_state, ref, target)
                next_state = _with_duel_log(next_state, f"{target.get('name')} recuperou {heal} HP.")
            elif effect_type in ONLINE_ADD_ENERGY_EFFECTS:
                if effect_type == "ADD_ENERGY_BY_COIN" and random.random() < 0.5:
                    continue
                energy_type = effect.get("energy_type") or next_state["players"][side].get("energy_zone", {}).get("current") or "Universal"
                target["attached_energy"] = [*(target.get("attached_energy") or []), *[energy_type for _ in range(amount or 1)]]
                next_state = _online_set_ref_card(next_state, ref, target)
                next_state = _with_duel_log(next_state, f"{target.get('name')} recebeu {amount or 1} energia(s).")
            elif effect_type in ONLINE_REMOVE_ENERGY_EFFECTS:
                remove_amount = amount or 1
                energy = list(target.get("attached_energy") or [])
                if effect_type == "REMOVE_RANDOM_ENERGY":
                    for _ in range(min(remove_amount, len(energy))):
                        energy.pop(random.randrange(len(energy)))
                else:
                    energy = energy[remove_amount:]
                target["attached_energy"] = energy
                next_state = _online_set_ref_card(next_state, ref, target)
            elif effect_type in ONLINE_DEFENSE_EFFECTS:
                target["pending_damage_reduction"] = 9999 if effect_type == "PREVENT_DAMAGE" else max(int(target.get("pending_damage_reduction") or 0), amount)
                if effect_type == "HALVE_DAMAGE_TAKEN":
                    target["next_damage_multiplier"] = 0.5
                next_state = _online_set_ref_card(next_state, ref, target)
            elif effect_type in ONLINE_STATUS_EFFECTS:
                next_state = _online_set_ref_card(next_state, ref, _online_add_status(target, ONLINE_STATUS_BY_EFFECT.get(effect_type, effect_type.lower())))
            elif effect_type in ONLINE_IMMUNITY_EFFECTS:
                next_state = _online_set_ref_card(next_state, ref, _online_apply_immunity(target, effect))
            elif effect_type in ONLINE_BUFF_EFFECTS:
                next_state = _online_set_ref_card(next_state, ref, _online_apply_buff(target, effect))

    return _resolve_online_knockouts(next_state, side)


def _ability_damage(ability: dict) -> int:
    effects = _online_ability_effects(ability)
    for effect in effects:
        if effect.get("type") == "DAMAGE":
            return max(0, int(effect.get("amount") or 0))
    return max(0, int(ability.get("damage") or 0))


def _online_ability_effects(ability: dict) -> list[dict]:
    rules = ability.get("rules") or []
    if rules:
        effects = []
        for rule in rules:
            if rule.get("trigger") == "ON_ATTACK":
                effects.extend(rule.get("effects") or [])
        return _online_effects(effects)
    effects = _online_effects(ability.get("effects"))
    if effects:
        return effects
    damage = max(0, int(ability.get("damage") or 0))
    return [{"type": "DAMAGE", "target": "OPPONENT_ACTIVE", "amount": damage}] if damage > 0 else []


def _online_condition_values(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [part.strip() for part in str(value or "").split(",") if part.strip()]


def _online_rule_condition_matches(state: dict, condition: dict, context: dict) -> bool:
    condition_type = condition.get("type")
    value = condition.get("value")
    source_ref = context.get("source_ref")
    source_card = context.get("source_card")
    target_ref = context.get("target_ref")
    target_card = _online_ref_card(state, target_ref)

    if condition_type == "SOURCE_POSITION":
        expected = str(value or "ACTIVE").upper()
        actual = "BENCH" if source_ref and source_ref.get("zone") == "bench" else "ACTIVE"
        return actual == expected
    if condition_type == "TARGET_POSITION":
        expected = str(value or "ACTIVE").upper()
        actual = "BENCH" if target_ref and target_ref.get("zone") == "bench" else "ACTIVE"
        return actual == expected
    if condition_type == "TARGET_NATURE_IN":
        values = _online_condition_values(value)
        return bool(target_card and any(nature in values for nature in target_card.get("natures") or []))
    if condition_type == "TARGET_IS_DAMAGED":
        return bool(target_card and int(target_card.get("hp_remaining") or 0) < int(target_card.get("hp") or 0))
    if condition_type == "SELF_HAS_ENERGY_TYPE":
        return str(value or "") in (source_card or {}).get("attached_energy", [])
    if condition_type == "SELF_ENERGY_COUNT_GTE":
        return len((source_card or {}).get("attached_energy") or []) >= max(0, int(value or 0))
    return False


def _online_ability_effects_for_trigger(state: dict, side: str, source_ref: dict, ability: dict, trigger: str, context: Optional[dict] = None) -> list[dict]:
    rules = ability.get("rules") or []
    if not rules:
        return _online_ability_effects(ability)
    context = context or {}
    source_card = _online_ref_card(state, source_ref)
    effects = []
    for rule in rules:
        if rule.get("trigger") != trigger:
            continue
        rule_context = {
            **context,
            "source_ref": source_ref,
            "source_card": source_card,
        }
        if all(_online_rule_condition_matches(state, condition, rule_context) for condition in rule.get("conditions") or []):
            effects.extend(rule.get("effects") or [])
    return _online_effects(effects)


def _online_ability_costs(ability: dict) -> list[dict]:
    costs = []
    for cost in ability.get("energy_costs") or []:
        energy_type = cost.get("energy_type")
        amount = max(0, int(cost.get("amount") or 0))
        if energy_type in ENERGY_TYPES and amount > 0:
            costs.append({"energy_type": energy_type, "amount": amount})
    if costs:
        return costs
    legacy_cost = max(0, int(ability.get("energy_cost") or 0))
    return [{"energy_type": "Universal", "amount": legacy_cost}] if legacy_cost > 0 else []


def _can_pay_online_ability(card: dict, ability: dict) -> bool:
    costs = _online_ability_costs(ability)
    reduction = max(0, int(card.get("energy_cost_reduction") or 0))
    adjusted = []
    for cost in costs:
        reduced = min(reduction, cost["amount"])
        reduction -= reduced
        amount = max(0, cost["amount"] - reduced)
        if amount > 0:
            adjusted.append({**cost, "amount": amount})
    if not adjusted:
        return True
    attached = card.get("attached_energy") or []
    if card.get("energy_any_type"):
        return len(attached) >= sum(cost["amount"] for cost in adjusted)
    counts = {energy: 0 for energy in ENERGY_TYPES}
    for energy in attached:
        counts[energy] = counts.get(energy, 0) + 1
    return all(counts.get(cost["energy_type"], 0) >= cost["amount"] for cost in adjusted)


def _online_evolution_stage(card: Optional[dict]) -> int:
    if not card or not card.get("is_evolution"):
        return 1
    return {"I": 2, "II": 2, "III": 3, "IV": 4}.get(str(card.get("evolution_number") or "II").upper(), 2)


def _can_online_evolve_target(evolution: Optional[dict], target: Optional[dict], turn_number: int) -> bool:
    if not evolution or not target or not evolution.get("is_evolution"):
        return False
    if target.get("entered_turn", 0) >= turn_number:
        return False
    if _online_evolution_stage(evolution) != _online_evolution_stage(target) + 1:
        return False
    source_id = evolution.get("evolves_from_card_id")
    source_name = evolution.get("evolves_from_name")
    if source_id or source_name:
        return source_id in [target.get("id"), target.get("source_card_id")] or source_name == target.get("name")
    return True


def _apply_online_action(state: dict, side: str, action: OnlineDuelAction) -> dict:
    next_state = copy.deepcopy(state)
    player = next_state["players"][side]
    opponent = next_state["players"][_opponent_side(side)]

    if action.kind == "forfeit" and next_state.get("phase") in ["setup", "battle"] and not next_state.get("winner"):
        next_state["winner"] = _opponent_side(side)
        return _with_duel_log(next_state, f"{player.get('name')} desistiu do duelo.")

    if action.kind == "setup_active" and next_state.get("phase") == "setup":
        card = player.get("hand", [])[action.hand_index or 0] if action.hand_index is not None and action.hand_index < len(player.get("hand", [])) else None
        if not _is_basic_character(card):
            return state
        if player.get("active"):
            player.setdefault("hand", []).append(_to_hand_card(player["active"]))
        player["active"] = _new_card_instance(card, next_state.get("turn_number", 1))
        player["hand"].pop(action.hand_index)
        player["setup_ready"] = False
        next_state["players"][side] = player
        return _with_duel_log(next_state, f"{player.get('name')} escolheu a ativa.")

    if action.kind == "setup_to_bench" and next_state.get("phase") == "setup":
        card = player.get("hand", [])[action.hand_index or 0] if action.hand_index is not None and action.hand_index < len(player.get("hand", [])) else None
        if not _is_basic_character(card) or len(player.get("bench", [])) >= ONLINE_DUEL_BENCH_LIMIT:
            return state
        player.setdefault("bench", []).append(_new_card_instance(card, next_state.get("turn_number", 1)))
        player["hand"].pop(action.hand_index)
        player["setup_ready"] = False
        next_state["players"][side] = player
        return _with_duel_log(next_state, f"{player.get('name')} colocou uma carta no banco inicial.")

    if action.kind == "setup_bench_to_hand" and next_state.get("phase") == "setup":
        if action.bench_index is None or action.bench_index >= len(player.get("bench", [])):
            return state
        card = player["bench"].pop(action.bench_index)
        player.setdefault("hand", []).append(_to_hand_card(card))
        player["setup_ready"] = False
        next_state["players"][side] = player
        return next_state

    if next_state.get("phase") != "battle" or next_state.get("winner") or next_state.get("turn") != side:
        return state

    if action.kind == "play_to_bench":
        card = player.get("hand", [])[action.hand_index or 0] if action.hand_index is not None and action.hand_index < len(player.get("hand", [])) else None
        if not _is_basic_character(card) or len(player.get("bench", [])) >= ONLINE_DUEL_BENCH_LIMIT:
            return state
        player.setdefault("bench", []).append(_new_card_instance(card, next_state.get("turn_number", 1)))
        player["hand"].pop(action.hand_index)
        next_state["players"][side] = player
        return _with_duel_log(next_state, f"{player.get('name')} colocou {card.get('name')} no banco.")

    if action.kind == "evolve":
        card = player.get("hand", [])[action.hand_index or 0] if action.hand_index is not None and action.hand_index < len(player.get("hand", [])) else None
        target_zone = action.zone if action.zone in ["active", "bench"] else "active"
        target_index = action.target_index or 0
        target = _target_card(player, target_zone, target_index)
        if not _can_online_evolve_target(card, target, next_state.get("turn_number", 1)):
            return state
        damage_taken = max(0, int(target.get("hp") or 0) - int(target.get("hp_remaining") or 0))
        evolved = _new_card_instance(card, next_state.get("turn_number", 1))
        evolved["attached_energy"] = target.get("attached_energy") or []
        evolved["equipments"] = target.get("equipments") or []
        evolved["hp_remaining"] = max(1, int(evolved.get("hp") or 0) - damage_taken)
        evolved["evolved_from"] = target.get("name")
        player = _set_target_card(player, target_zone, target_index, evolved)
        player["hand"].pop(action.hand_index)
        player.setdefault("discard", []).append(_card_without_equipments(target))
        next_state["players"][side] = player
        return _with_duel_log(next_state, f"{player.get('name')} evoluiu {target.get('name')} para {card.get('name')}.")

    if action.kind == "play_action":
        card = player.get("hand", [])[action.hand_index or 0] if action.hand_index is not None and action.hand_index < len(player.get("hand", [])) else None
        if not card or card.get("card_type") in ["Personagem", "Energia"]:
            return state
        if card.get("card_type") == "Equipamento":
            active = player.get("active")
            if not active or active.get("equipments"):
                return state
            active["equipments"] = [*(active.get("equipments") or []), card]
            player["active"] = active
            player["hand"].pop(action.hand_index)
            next_state["players"][side] = player
            next_state = _with_duel_log(next_state, f"{player.get('name')} equipou {card.get('name')} em {active.get('name')}.")
            equip_effects = [
                effect for effect in _online_effects(card.get("passive_effects"))
                if _online_equipment_effect_should_trigger(effect, "ON_EQUIP")
            ]
            return _resolve_online_effects(next_state, side, card, equip_effects, {
                "trigger": "ON_EQUIP",
                "equipped_card_ref": {"side": side, "zone": "active", "index": 0},
            })
        player["hand"].pop(action.hand_index)
        player.setdefault("discard", []).append(card)
        next_state["players"][side] = player
        next_state = _with_duel_log(next_state, f"{player.get('name')} usou {card.get('name')}.")
        return _resolve_online_effects(next_state, side, card, card.get("effects") or [], {
            "target_override": {"side": _opponent_side(side), "zone": action.zone or "active", "index": action.target_index or 0},
        })

    if action.kind == "attach_energy":
        target = _target_card(player, action.zone or "active", action.target_index)
        if not target or player.get("energy_remaining", 0) <= 0:
            return state
        target["attached_energy"] = [*(target.get("attached_energy") or []), player.get("energy_zone", {}).get("current", "Universal")]
        player = _set_target_card(player, action.zone or "active", action.target_index, target)
        player["energy_remaining"] = player.get("energy_remaining", 0) - 1
        next_state["players"][side] = player
        return _with_duel_log(next_state, f"{player.get('name')} anexou energia.")

    if action.kind == "retreat":
        if action.bench_index is None or action.bench_index >= len(player.get("bench", [])):
            return state
        active = player.get("active")
        replacement = player["bench"][action.bench_index]
        base_cost = max(0, int(active.get("recuo") or 0)) if active else 0
        cost = 0 if active and active.get("ignore_retreat_cost") else max(0, base_cost - int((active or {}).get("retreat_cost_reduction") or 0))
        if active and any(status in (active.get("status_effects") or []) for status in ["prevent_retreat", "block_retreat"]):
            return state
        if not active or not replacement or len(active.get("attached_energy") or []) < cost:
            return state
        active["attached_energy"] = (active.get("attached_energy") or [])[cost:]
        player["active"] = replacement
        player["bench"][action.bench_index] = active
        next_state["players"][side] = player
        return _with_duel_log(next_state, f"{player.get('name')} recuou.")

    if action.kind == "ability":
        active = player.get("active")
        ability_index = action.ability_index if action.ability_index is not None else 0
        ability = (active.get("abilities") or [])[ability_index] if active and ability_index < len(active.get("abilities") or []) else None
        if not active or not ability or not _can_pay_online_ability(active, ability):
            return state
        if next_state.get("turn_number", 1) <= 1:
            return _with_duel_log(next_state, "Nao e possivel atacar no primeiro turno.")
        next_state = _with_duel_log(next_state, f"{active.get('name')} usou {ability.get('name')}.")
        source_ref = {"side": side, "zone": "active", "index": 0}
        target_ref = {"side": _opponent_side(side), "zone": action.zone or "active", "index": action.target_index or 0}
        effects = _online_ability_effects_for_trigger(next_state, side, source_ref, ability, "ON_ATTACK", {
            "target_ref": target_ref,
        })
        next_state = _resolve_online_effects(next_state, side, active, effects, {
            "source_ref": source_ref,
            "target_override": target_ref,
        })
        return next_state if next_state.get("winner") else _finish_online_turn(next_state)

    if action.kind == "end_turn":
        return _finish_online_turn(next_state)

    return state


# ============ Online duel endpoints ============
@api_router.get("/duels/online/players")
async def list_online_duel_players(request: Request):
    user = await get_current_user(request, db)
    await touch_user_presence(user["id"])
    active_statuses = ["invited", "deck_selection", "setup", "battle"]
    active_duels = await db.online_duels.find(
        {"status": {"$in": active_statuses}},
        {"_id": 0, "players": 1}
    ).to_list(1000)
    busy_user_ids = {
        player.get("user_id")
        for duel in active_duels
        for player in duel.get("players", {}).values()
        if player.get("user_id") and player.get("user_id") != user["id"]
    }
    users = await db.users.find(
        {"id": {"$ne": user["id"]}},
        {"_id": 0, "password_hash": 0}
    ).sort("name", 1).to_list(500)
    result = []
    for other in users:
        if not is_online(other.get("last_seen")):
            continue
        public = _public_user(other)
        public["in_duel"] = other["id"] in busy_user_ids
        public["duel_status"] = "em_duelo" if public["in_duel"] else "disponivel"
        result.append(public)
    return result


@api_router.get("/duels/online")
async def list_my_online_duels(request: Request):
    user = await get_current_user(request, db)
    await touch_user_presence(user["id"])
    duels = await db.online_duels.find(
        {"$or": [{"players.p1.user_id": user["id"]}, {"players.p2.user_id": user["id"]}]}
    ).sort("updated_at", -1).to_list(50)
    active_statuses = {"invited", "deck_selection", "setup", "battle"}
    return [_online_duel_view(duel, user["id"]) for duel in duels if duel.get("status") in active_statuses]


@api_router.post("/duels/online/invite")
async def invite_online_duel(body: OnlineDuelInviteCreate, request: Request):
    user = await get_current_user(request, db)
    await touch_user_presence(user["id"])
    if body.opponent_id == user["id"]:
        raise HTTPException(status_code=400, detail="Escolha outro jogador")
    opponent = await db.users.find_one({"id": body.opponent_id}, {"_id": 0, "password_hash": 0})
    if not opponent:
        raise HTTPException(status_code=404, detail="Jogador nao encontrado")
    if not is_online(opponent.get("last_seen")):
        raise HTTPException(status_code=400, detail="Jogador nao esta online")
    opponent_busy = await db.online_duels.find_one({
        "status": {"$in": ["invited", "deck_selection", "setup", "battle"]},
        "$or": [
            {"players.p1.user_id": opponent["id"]},
            {"players.p2.user_id": opponent["id"]},
        ],
    })
    if opponent_busy:
        raise HTTPException(status_code=400, detail="Jogador ja esta em duelo")

    existing = await db.online_duels.find_one({
        "status": {"$in": ["invited", "deck_selection", "setup", "battle"]},
        "$or": [
            {"players.p1.user_id": user["id"], "players.p2.user_id": opponent["id"]},
            {"players.p1.user_id": opponent["id"], "players.p2.user_id": user["id"]},
        ],
    })
    if existing:
        return _online_duel_view(existing, user["id"])

    now = utc_now().isoformat()
    duel = {
        "id": str(uuid.uuid4()),
        "status": "invited",
        "created_at": now,
        "updated_at": now,
        "inviter_id": user["id"],
        "invitee_id": opponent["id"],
        "players": {
            "p1": {"user_id": user["id"], "name": user.get("name", ""), "deck_id": None, "deck_name": None, "ready": False},
            "p2": {"user_id": opponent["id"], "name": opponent.get("name", ""), "deck_id": None, "deck_name": None, "ready": False},
        },
        "coin": None,
        "state": None,
    }
    await db.online_duels.insert_one(duel)
    return _online_duel_view(duel, user["id"])


@api_router.post("/duels/online/{duel_id}/accept")
async def accept_online_duel(duel_id: str, request: Request):
    user = await get_current_user(request, db)
    duel = await _get_online_duel_for_user(duel_id, user["id"])
    if duel.get("invitee_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Apenas o jogador convidado pode aceitar")
    if duel.get("status") != "invited":
        return _online_duel_view(duel, user["id"])
    await db.online_duels.update_one(
        {"id": duel_id},
        {"$set": {"status": "deck_selection", "updated_at": utc_now().isoformat()}}
    )
    duel = await _get_online_duel_for_user(duel_id, user["id"])
    return _online_duel_view(duel, user["id"])


@api_router.post("/duels/online/{duel_id}/decline")
async def decline_online_duel(duel_id: str, request: Request):
    user = await get_current_user(request, db)
    duel = await _get_online_duel_for_user(duel_id, user["id"])
    if duel.get("status") not in ["invited", "deck_selection", "setup"]:
        raise HTTPException(status_code=400, detail="Este duelo ja iniciou")
    await db.online_duels.update_one(
        {"id": duel_id},
        {"$set": {"status": "declined", "updated_at": utc_now().isoformat()}}
    )
    duel["status"] = "declined"
    return _online_duel_view(duel, user["id"])


@api_router.post("/duels/online/{duel_id}/deck")
async def choose_online_duel_deck(duel_id: str, body: OnlineDuelDeckChoice, request: Request):
    user = await get_current_user(request, db)
    duel = await _get_online_duel_for_user(duel_id, user["id"])
    if duel.get("status") not in ["deck_selection", "setup"]:
        raise HTTPException(status_code=400, detail="Este duelo nao esta escolhendo decks")
    side = _duel_side_for_user(duel, user["id"])
    deck, cards, warnings = await _expand_owned_deck(user["id"], body.deck_id)
    _validate_online_deck(cards, warnings)

    player_update = {
        f"players.{side}.deck_id": deck["id"],
        f"players.{side}.deck_name": deck.get("name", "Deck"),
        f"players.{side}.ready": True,
        "updated_at": utc_now().isoformat(),
    }
    await db.online_duels.update_one({"id": duel_id}, {"$set": player_update})
    duel = await _get_online_duel_for_user(duel_id, user["id"])

    if duel["players"]["p1"].get("deck_id") and duel["players"]["p2"].get("deck_id") and not duel.get("state"):
        p1_deck, p1_cards, p1_warnings = await _expand_owned_deck(duel["players"]["p1"]["user_id"], duel["players"]["p1"]["deck_id"])
        p2_deck, p2_cards, p2_warnings = await _expand_owned_deck(duel["players"]["p2"]["user_id"], duel["players"]["p2"]["deck_id"])
        _validate_online_deck(p1_cards, p1_warnings)
        _validate_online_deck(p2_cards, p2_warnings)
        result = random.choice(["cara", "coroa"])
        starter = random.choice(["p1", "p2"])
        coin = {"result": result, "winner_side": starter, "winner_name": duel["players"][starter]["name"]}
        state = {
            "id": duel_id,
            "phase": "setup",
            "turn": starter,
            "turn_number": 1,
            "winner": None,
            "log": [f"Cara ou coroa: deu {result}. {duel['players'][starter]['name']} comeca."],
            "players": {
                "p1": _make_duel_player(duel["players"]["p1"]["name"], p1_cards, p1_deck.get("energy_types", []), 1),
                "p2": _make_duel_player(duel["players"]["p2"]["name"], p2_cards, p2_deck.get("energy_types", []), 1),
            },
        }
        await db.online_duels.update_one(
            {"id": duel_id},
            {"$set": {"status": "setup", "state": state, "coin": coin, "updated_at": utc_now().isoformat()}}
        )
        duel = await _get_online_duel_for_user(duel_id, user["id"])

    return _online_duel_view(duel, user["id"])


@api_router.post("/duels/online/{duel_id}/setup-ready")
async def online_duel_setup_ready(duel_id: str, body: OnlineDuelSetupReady, request: Request):
    user = await get_current_user(request, db)
    duel = await _get_online_duel_for_user(duel_id, user["id"])
    if duel.get("status") != "setup" or not duel.get("state"):
        raise HTTPException(status_code=400, detail="Duelo nao esta em preparacao")
    side = _duel_side_for_user(duel, user["id"])
    state = copy.deepcopy(duel["state"])
    if body.ready and not state["players"][side].get("active"):
        raise HTTPException(status_code=400, detail="Escolha uma carta ativa antes de confirmar")
    state["players"][side]["setup_ready"] = body.ready
    if all(state["players"][s].get("active") and state["players"][s].get("setup_ready") for s in ["p1", "p2"]):
        state["phase"] = "battle"
        state = _with_duel_log(state, "Duelo iniciado.")
        status = "battle"
    else:
        status = "setup"
    await db.online_duels.update_one(
        {"id": duel_id},
        {"$set": {"state": state, "status": status, "updated_at": utc_now().isoformat()}}
    )
    duel = await _get_online_duel_for_user(duel_id, user["id"])
    return _online_duel_view(duel, user["id"])


@api_router.post("/duels/online/{duel_id}/action")
async def online_duel_action(duel_id: str, body: OnlineDuelAction, request: Request):
    user = await get_current_user(request, db)
    duel = await _get_online_duel_for_user(duel_id, user["id"])
    if duel.get("status") not in ["setup", "battle"] or not duel.get("state"):
        raise HTTPException(status_code=400, detail="Duelo nao iniciado")
    side = _duel_side_for_user(duel, user["id"])
    state = _apply_online_action(duel["state"], side, body)
    status = "finished" if state.get("winner") else state.get("phase", duel.get("status"))
    await db.online_duels.update_one(
        {"id": duel_id},
        {"$set": {"state": state, "status": status, "updated_at": utc_now().isoformat()}}
    )
    duel = await _get_online_duel_for_user(duel_id, user["id"])
    return _online_duel_view(duel, user["id"])


# ============ Deck CRUD ============
def _validate_deck_rules(card_ids: list[str], cards_by_id: dict) -> list[str]:
    """Returns list of validation warnings (not errors, deck can be saved mid-build)."""
    warnings = []
    if len(card_ids) != 20:
        warnings.append(f"Deck de duelo deve ter 20 cartas ({len(card_ids)}/20).")
    # Count occurrences. Rule: max 2 of same named card. Exception: can have 2 if one is ALPHA.
    name_groups: dict[str, list[dict]] = {}
    for cid in card_ids:
        card = cards_by_id.get(cid)
        if not card:
            continue
        if card.get("card_type") == "Energia":
            warnings.append(f"Remova '{card.get('name', 'Energia')}': energia vem da Energy Zone.")
        name_groups.setdefault(card["name"], []).append(card)
    for name, group in name_groups.items():
        if len(group) > 2:
            warnings.append(f"'{name}' aparece {len(group)} vezes (máximo 2).")
    if not any(
        card.get("card_type") == "Personagem" and not card.get("is_evolution")
        for cid in card_ids
        for card in [cards_by_id.get(cid)]
        if card
    ):
        warnings.append("O deck precisa ter pelo menos uma carta básica.")
    return warnings


@api_router.post("/decks", response_model=Deck)
async def create_deck(body: DeckCreate, request: Request):
    user = await get_current_user(request, db)
    deck_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = normalize_deck_payload(body)
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
    deck["energy_types"] = [energy for energy in deck.get("energy_types", []) if energy in ENERGY_TYPES] or ["Universal"]
    # Fetch all cards referenced
    unique_ids = list(set(deck.get("card_ids", [])))
    cards = []
    if unique_ids:
        cards = await accessible_cards_for_user(user["id"], unique_ids)
    cards_by_id = {c["id"]: c for c in cards}
    warnings = _validate_deck_rules(deck.get("card_ids", []), cards_by_id)
    return {"deck": deck, "cards": cards, "warnings": warnings}


@api_router.put("/decks/{deck_id}", response_model=Deck)
async def update_deck(deck_id: str, body: DeckCreate, request: Request):
    user = await get_current_user(request, db)
    existing = await db.decks.find_one({"id": deck_id, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Deck não encontrado")
    update = normalize_deck_payload(body)
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
    deck["energy_types"] = [energy for energy in deck.get("energy_types", []) if energy in ENERGY_TYPES] or ["Universal"]
    card_ids = deck.get("card_ids", [])
    unique_ids = list(set(card_ids))
    cards_list = []
    if unique_ids:
        cards_list = await accessible_cards_for_user(user["id"], unique_ids)
    cards_by_id = {c["id"]: c for c in cards_list}

    # Distribution
    nature_counts = {n: 0 for n in NATURES}
    type_counts = {t: 0 for t in CARD_TYPES}
    rarity_counts = {"0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "alpha": 0}
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
            rarity_key = str(card.get("rarity", 0))
            rarity_counts[rarity_key] = rarity_counts.get(rarity_key, 0) + 1
        if card.get("card_type") == "Personagem":
            n_chars += 1
            total_hp += card.get("hp", 0)
            abilities = card.get("abilities") or []
            if isinstance(abilities, list):
                total_damage += sum(
                    ability.get("damage", 0)
                    for ability in abilities
                    if isinstance(ability, dict)
                )
            else:
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
        await db.online_duels.create_index("id", unique=True)
        await db.online_duels.create_index("players.p1.user_id")
        await db.online_duels.create_index("players.p2.user_id")
        await db.user_library.create_index([("user_id", 1), ("card_id", 1)], unique=True)
        await db.user_library.create_index("card_id")
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
