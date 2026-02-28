from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from pathlib import Path
from typing import Optional
import io
from datetime import datetime, timezone
from mimi_kernel import MIMIKernel, _generate_dataset

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ─── MIMI KERNEL ─────────────────────────────────────────────────────────────
# Moved to mimi_kernel.py


# ─── SESSION STATE ────────────────────────────────────────────────────────────

_session: dict = {
    "mimi": None,
    "diverted_units": 0,
    "revenue_saved": 0.0,
    "refresh_count": 0,
    "rho_history": [],
    "dataset_name": "SAFEXPRESS_CASE_02028317"
}


# ─── ROUTES ──────────────────────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "SITI Intelligence — MIMI Kernel Active"}


@api_router.get("/kernel/state")
async def get_kernel_state():
    mimi: MIMIKernel = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")

    noise = float(np.random.normal(0, 0.008))
    rho_measured = float(np.clip(mimi.base_rho() + noise, 0.0, 1.0))
    phi_val = mimi.phi(rho_measured)
    kalman = mimi.kalman_step(rho_measured)
    irp = mimi.inverse_reliability()

    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    _session["rho_history"].append({"time": ts, "rho": round(rho_measured, 4), "t1": kalman["rho_t1"], "t3": kalman["rho_t3"]})
    if len(_session["rho_history"]) > 30:
        _session["rho_history"].pop(0)

    return {
        "rho": round(rho_measured, 4),
        "rho_base": mimi.base_rho(),
        "phi": phi_val,
        "critical_rho": mimi.critical_rho,
        "k_decay": mimi.K_DECAY,
        "n_total": mimi.n_total,
        "kalman": kalman,
        "inverse_reliability": irp,
        "warehouse_metrics": mimi.warehouse_metrics(),
        "mode_metrics": mimi.mode_metrics(),
        "average_delay": mimi.average_delay_per_block(),
        "red_zone_importance": mimi.red_zone_importance(),
        "routing": mimi.routing_logic(rho_measured),
        "wq": mimi.wq(rho_measured),
        "catastrophe": rho_measured > 0.80,
        "collapse": rho_measured >= 0.85,
        "catastrophe_predicted": kalman["rho_t3"] > 0.80,
        "collapse_predicted": kalman["rho_t3"] >= 0.85,
        "rho_history": _session["rho_history"][-30:],
        "annualized_exposure": mimi.ANNUALIZED_EXPOSURE,
        "leakage_seed": mimi.LEAKAGE_SEED,
        "diverted_units": _session["diverted_units"],
        "revenue_saved": round(_session["revenue_saved"], 2),
        "refresh_count": _session["refresh_count"],
        "dataset_name": _session["dataset_name"]
    }


@api_router.post("/kernel/tick")
async def kernel_tick():
    mimi: MIMIKernel = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")

    rho_base = mimi.base_rho()
    if rho_base > 0.80:
        diverted = random.randint(12, 28)
    elif rho_base > 0.75:
        diverted = random.randint(6, 15)
    else:
        diverted = random.randint(2, 8)

    _session["diverted_units"] += diverted
    _session["revenue_saved"] = _session["diverted_units"] * mimi.LEAKAGE_SEED
    _session["refresh_count"] += 1

    return {
        "diverted": diverted,
        "total_diverted": _session["diverted_units"],
        "revenue_saved": round(_session["revenue_saved"], 2),
        "refresh_count": _session["refresh_count"]
    }


@api_router.post("/kernel/upload")
async def upload_dataset(file: UploadFile = File(...)):
    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))

        col_map = {}
        for col in df.columns:
            lower = col.lower().replace(' ', '_').replace('.', '_')
            if 'reached' in lower or ('on_time' in lower):
                col_map[col] = 'Reached.on.Time_Y.N'
            elif 'warehouse' in lower or ('block' in lower and 'warehouse' in lower):
                col_map[col] = 'Warehouse_block'
            elif 'shipment' in lower or 'mode' in lower:
                col_map[col] = 'Mode_of_Shipment'
            elif 'care' in lower and 'call' in lower:
                col_map[col] = 'Customer_care_calls'
            elif 'rating' in lower:
                col_map[col] = 'Customer_rating'
            elif 'cost' in lower:
                col_map[col] = 'Cost_of_the_Product'
            elif 'prior' in lower or 'purchase' in lower:
                col_map[col] = 'Prior_purchases'
            elif 'importance' in lower:
                col_map[col] = 'Product_importance'
            elif col.lower() == 'gender':
                col_map[col] = 'Gender'
            elif 'discount' in lower:
                col_map[col] = 'Discount_offered'
            elif 'weight' in lower:
                col_map[col] = 'Weight_in_gms'

        df = df.rename(columns=col_map)

        if 'Reached.on.Time_Y.N' not in df.columns:
            raise HTTPException(status_code=400, detail="Cannot find on-time delivery column")

        col = df['Reached.on.Time_Y.N']
        if col.dtype == object:
            df['Reached.on.Time_Y.N'] = col.map(
                lambda x: 1 if str(x).strip().upper() in ['Y', 'YES', '1', 'TRUE'] else 0
            ).astype(int)
        else:
            df['Reached.on.Time_Y.N'] = col.astype(int)

        if 'ID' not in df.columns:
            df['ID'] = range(1, len(df) + 1)
        for cat_col, default in [('Warehouse_block', 'A'), ('Mode_of_Shipment', 'Ship'),
                                  ('Product_importance', 'Medium'), ('Gender', 'M')]:
            if cat_col not in df.columns:
                df[cat_col] = default
        for num_col in ['Customer_care_calls', 'Customer_rating', 'Cost_of_the_Product',
                        'Prior_purchases', 'Discount_offered', 'Weight_in_gms']:
            if num_col not in df.columns:
                df[num_col] = 0

        new_kernel = MIMIKernel(df)
        new_critical_rho = new_kernel.fit_lr()

        _session["mimi"] = new_kernel
        _session["diverted_units"] = 0
        _session["revenue_saved"] = 0.0
        _session["refresh_count"] = 0
        _session["rho_history"] = []
        _session["dataset_name"] = file.filename or "UPLOADED_DATASET"

        return {
            "success": True,
            "n_total": len(df),
            "new_rho": new_kernel.base_rho(),
            "new_critical_rho": new_critical_rho,
            "message": f"MIMI Kernel reinitialized. ρ={new_kernel.base_rho():.4f}, ρ_c={new_critical_rho:.4f}",
            "dataset_name": _session["dataset_name"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=400, detail=f"CSV parse error: {str(e)}")


# ─── APP SETUP ────────────────────────────────────────────────────────────────

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def init_kernel():
    import asyncio
    df = _generate_dataset()
    _session["mimi"] = MIMIKernel(df)
    logger.info(f"MIMI Kernel initialized: n={len(df)}, ρ={_session['mimi'].base_rho():.4f}")
    # Fit LR in background (non-blocking)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _session["mimi"].fit_lr)
    logger.info(f"LR fitted: ρ_c={_session['mimi'].critical_rho:.4f}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
