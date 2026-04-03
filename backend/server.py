from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.concurrency import run_in_threadpool
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os, logging, secrets, pandas as pd
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

# ─── SECURITY ───────────────────────────────────────────────────────────────
async def _verify_api_key(x_api_key: str = Header(None)):
    if not x_api_key:
        raise HTTPException(401, "API Key Missing")
    
    # Check memory first (fastest)
    if x_api_key in _api_keys:
        return _api_keys[x_api_key]
    
    # Fail-safe: Check DB if not in memory (prevents sync issues)
    if supabase:
        res = await run_in_threadpool(
            lambda: supabase.table("api_keys").select("*").eq("key", x_api_key).eq("active", True).execute()
        )
        if res.data:
            _api_keys[x_api_key] = res.data[0]
            return res.data[0]
            
    raise HTTPException(401, "Invalid or Inactive API Key")

# ─── LIFESPAN (DB SYNC) ─────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global supabase, _api_keys
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        try:
            # Syncing all active keys on startup
            res = await run_in_threadpool(
                lambda: supabase.table("api_keys").select("*").eq("active", True).execute()
            )
            for row in res.data:
                _api_keys[row["key"]] = row
            logger.info(f"✔ Supabase Synced: {len(_api_keys)} keys loaded.")
        except Exception as e:
            logger.error(f"✘ DB Sync Failed: {e}")
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── ENDPOINTS ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "healthy", 
        "db_connected": supabase is not None,
        "active_keys_cached": len(_api_keys)
    }

@app.post("/api/admin/create-key")
async def create_key(client_name: str, role: str = "OPERATOR"):
    new_key = f"siti-{secrets.token_hex(8)}"
    payload = {"key": new_key, "client": client_name, "role": role, "active": True}
    
    if supabase:
        # Offload blocking write to a thread
        await run_in_threadpool(lambda: supabase.table("api_keys").insert(payload).execute())
    
    _api_keys[new_key] = payload
    return {"key": new_key, "status": "created"}

# ... (Keep your Webhook logic, but wrap supabase calls in run_in_threadpool)
