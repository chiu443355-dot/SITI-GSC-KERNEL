from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Depends, Header, Request
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os, re, logging, asyncio, json, secrets, httpx
import numpy as np
import pandas as pd
from pathlib import Path
from supabase import create_client, Client

# ─── SETUP ──────────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
logger = logging.getLogger("uvicorn")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
supabase: Client = None

# ─── STORES ─────────────────────────────────────────────────────────────────
_api_keys: dict = {}
_sessions: dict = {}

# ─── KERNEL LOGIC ───────────────────────────────────────────────────────────
class MIMIKernel:
    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.n_total = len(df)
    def global_rho(self): return 0.45 
    def phi(self, rho): return 0.1

def _get_session(key: str):
    if key not in _sessions:
        _sessions[key] = {"mimi": None, "diverted_units": 0}
    return _sessions[key]

def _verify_api_key(x_api_key: str = Header(None)):
    if not x_api_key or x_api_key not in _api_keys:
        # Internal cache check for speed
        if x_api_key not in _api_keys:
            raise HTTPException(401, "Invalid or Inactive API Key")
    return _api_keys[x_api_key]

# ─── LIFESPAN (DB SYNC) ─────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global supabase, _api_keys
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        try:
            # Syncing all active keys on startup
            res = supabase.table("api_keys").select("*").eq("active", True).execute()
            for row in res.data:
                _api_keys[row["key"]] = row
            logger.info(f"✔ Supabase Synced: {len(_api_keys)} keys loaded.")
        except Exception as e:
            logger.error(f"✘ DB Sync Failed: {e}")
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── ENDPOINTS ──────────────────────────────────────────────────────────────

@app.get("/api/kernel/state")
async def get_state(key_data: dict = Depends(_verify_api_key)):
    client_id = key_data["client"]
    session = _get_session(client_id)
    return {"status": "active", "client": client_id, "role": key_data["role"]}

@app.post("/api/admin/create-key")
async def create_key(client_name: str, role: str = "OPERATOR"):
    # Generate secure key
    new_key = f"siti-{secrets.token_hex(8)}"
    payload = {"key": new_key, "client": client_name, "role": role, "active": True}
    
    if supabase:
        supabase.table("api_keys").insert(payload).execute()
    
    _api_keys[new_key] = payload
    return {"key": new_key, "status": "created"}

@app.post("/api/payments/razorpay-webhook")
async def webhook(request: Request):
    try:
        data = await request.json()
        if data.get("event") == "payment.captured":
            payment_entity = data["payload"]["payment"]["entity"]
            pay_id = payment_entity["id"]
            email = payment_entity.get("email", "web-user")

            # Idempotency: Don't create duplicate keys for same payment
            if supabase:
                existing = supabase.table("api_keys").select("key").eq("payment_id", pay_id).execute()
                if existing.data:
                    return {"status": "exists", "key": existing.data[0]["key"]}

            # Provision new key
            new_key = f"siti-{secrets.token_hex(8)}"
            db_data = {
                "key": new_key, 
                "client": email, 
                "role": "OPERATOR", 
                "active": True, 
                "payment_id": pay_id
            }
            
            if supabase:
                supabase.table("api_keys").insert(db_data).execute()
            
            _api_keys[new_key] = db_data
            logger.info(f"💰 Payment Captured: {pay_id} | New Key: {new_key}")
            return {"status": "provisioned", "key": new_key}
            
    except Exception as e:
        logger.error(f"Webhook Error: {e}")
        raise HTTPException(status_code=400, detail="Webhook processing failed")

    return {"status": "ignored"}

@app.get("/health")
async def health():
    return {
        "status": "healthy", 
        "db_connected": supabase is not None,
        "active_keys_cached": len(_api_keys)
    }
