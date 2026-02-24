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

class MIMIKernel:
    LEAKAGE_SEED = 3.94
    ANNUALIZED_EXPOSURE = 2_810_000

    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self.n_total = len(df)
        self._kx: Optional[float] = None
        self._kP: float = 1.0
        self.critical_rho: float = 0.85
        self.lr_model = None

    def base_rho(self) -> float:
        late = int((self.df['Reached.on.Time_Y.N'] == 0).sum())
        return round(float(late / self.n_total), 4)

    K_DECAY = 20  # Sigmoidal decay gradient

    def phi(self, rho_val: float) -> float:
        """Sigmoidal Priority Decay: Φ(ρ) = 1/(1 + e^{-k(ρ - ρ_c)})  k=20, ρ_c=critical"""
        return round(float(1 / (1 + np.exp(-self.K_DECAY * (rho_val - self.critical_rho)))), 4)

    def wq(self, rho_val: float) -> float:
        """M/M/1 Queue Wait: Wq = ρ / (μ(1-ρ)), μ=1 normalized"""
        if rho_val >= 1.0:
            return 99.9999
        return round(float(rho_val / (1 - rho_val)), 4)

    def kalman_step(self, z: float) -> dict:
        Q, R = 0.002, 0.005
        if self._kx is None:
            self._kx, self._kP = z, 1.0
        x_pred = self._kx
        P_pred = self._kP + Q
        K = float(P_pred / (P_pred + R))
        self._kx = float(x_pred + K * (z - x_pred))
        self._kP = float((1 - K) * P_pred)
        rho_t1 = float(np.clip(self._kx + np.random.normal(0, 0.015), 0.0, 1.0))
        return {
            "x_hat": round(self._kx, 4),
            "P": round(self._kP, 6),
            "K": round(K, 4),
            "rho_t1": round(rho_t1, 4)
        }

    def inverse_reliability(self) -> dict:
        df = self.df
        mask = (df['Product_importance'].str.lower() == 'high') & (df['Reached.on.Time_Y.N'] == 0)
        fail_df = df[mask]
        n_fail = int(len(fail_df))
        n_high = int((df['Product_importance'].str.lower() == 'high').sum())
        failure_rate = round(float(n_fail / n_high), 4) if n_high > 0 else 0.0
        top = fail_df.head(25)[[
            'ID', 'Warehouse_block', 'Mode_of_Shipment',
            'Cost_of_the_Product', 'Weight_in_gms', 'Discount_offered'
        ]].copy()
        top.columns = ['id', 'hub', 'mode', 'cost', 'weight', 'discount']
        records = [{k: int(v) if isinstance(v, (np.integer, np.int64)) else v
                    for k, v in row.items()} for row in top.to_dict('records')]
        return {
            "failure_count": n_fail,
            "total_high": n_high,
            "failure_rate": failure_rate,
            "leakage_total": round(n_fail * self.LEAKAGE_SEED, 2),
            "clv_loss": round(n_fail * 2.74, 2),
            "recovery_value": round(n_fail * 1.20, 2),
            "records": records
        }

    def warehouse_metrics(self) -> list:
        results = []
        for b in ['A', 'B', 'C', 'D', 'F']:
            sub = self.df[self.df['Warehouse_block'] == b]
            n = len(sub)
            if n == 0:
                continue
            late = int((sub['Reached.on.Time_Y.N'] == 0).sum())
            results.append({
                "block": b, "total": int(n), "late": late,
                "utilization": round(float(late / n), 4), "on_time": int(n - late)
            })
        return results

    def mode_metrics(self) -> list:
        results = []
        for m in ['Ship', 'Flight', 'Road']:
            sub = self.df[self.df['Mode_of_Shipment'] == m]
            n = len(sub)
            if n == 0:
                continue
            late = int((sub['Reached.on.Time_Y.N'] == 0).sum())
            results.append({
                "mode": m, "total": int(n), "late": late,
                "rate": round(float(late / n), 4)
            })
        return results

    def average_delay_per_block(self) -> list:
        """Average delay proxy per block: Customer_care_calls × mode_factor × 8h for late shipments"""
        mode_map = {'Ship': 2.0, 'Flight': 0.5, 'Road': 1.0}
        results = []
        for b in ['A', 'B', 'C', 'D', 'F']:
            sub = self.df[self.df['Warehouse_block'] == b]
            late = sub[sub['Reached.on.Time_Y.N'] == 0].copy()
            n = len(sub)
            n_late = len(late)
            if n == 0:
                continue
            if n_late > 0:
                mf = late['Mode_of_Shipment'].map(mode_map).fillna(1.0)
                avg_delay = float((late['Customer_care_calls'] * mf * 8.0).mean())
            else:
                avg_delay = 0.0
            results.append({"block": b, "avg_delay": round(avg_delay, 1), "n_late": n_late, "n_total": int(n)})
        return results

    def red_zone_importance(self) -> list:
        """Product importance breakdown for Red Zone (blocks with ρ > 0.80) late shipments"""
        red_blocks = [
            b for b in ['A', 'B', 'C', 'D', 'F']
            if (sub := self.df[self.df['Warehouse_block'] == b]) is not None
            and len(sub) > 0
            and (sub['Reached.on.Time_Y.N'] == 0).sum() / len(sub) > 0.80
        ]
        if not red_blocks:
            red_blocks = ['A', 'B', 'C', 'D', 'F']
        red_df = self.df[
            (self.df['Warehouse_block'].isin(red_blocks)) &
            (self.df['Reached.on.Time_Y.N'] == 0)
        ]
        counts = red_df['Product_importance'].str.title().value_counts()
        return [{"name": lvl, "value": int(counts.get(lvl, 0))} for lvl in ['High', 'Medium', 'Low']]

    def routing_logic(self, rho_val: float) -> dict:
        """Autonomous GSC routing: identify overloaded vs available hubs, ε=0.05 safety buffer"""
        wh = self.warehouse_metrics()
        epsilon = 0.05
        threshold = self.critical_rho
        overloaded = [{"block": w['block'], "utilization": w['utilization']} for w in wh if w['utilization'] > 0.85]
        available = [{"block": w['block'], "utilization": w['utilization']} for w in wh if w['utilization'] < threshold - epsilon]
        return {
            "overloaded_blocks": overloaded,
            "available_blocks": available,
            "diversion_active": len(overloaded) > 0 and len(available) > 0,
            "epsilon": epsilon,
            "threshold": round(threshold, 4)
        }

    def fit_lr(self) -> float:
        df = self.df.copy()
        for col in ['Mode_of_Shipment', 'Product_importance', 'Warehouse_block', 'Gender']:
            if col in df.columns:
                df[f'{col}_enc'] = LabelEncoder().fit_transform(df[col].astype(str))
        features = [c for c in [
            'Customer_care_calls', 'Customer_rating', 'Cost_of_the_Product',
            'Prior_purchases', 'Discount_offered', 'Weight_in_gms',
            'Mode_of_Shipment_enc', 'Product_importance_enc',
            'Warehouse_block_enc', 'Gender_enc'
        ] if c in df.columns]
        X = df[features].values
        y = df['Reached.on.Time_Y.N'].values
        self.lr_model = LogisticRegression(max_iter=2000, random_state=42)
        self.lr_model.fit(X, y)
        proba_late = 1 - self.lr_model.predict_proba(X)[:, 1]
        new_thresh = float(np.mean(proba_late) + 1.0 * np.std(proba_late))
        self.critical_rho = round(float(np.clip(new_thresh, 0.70, 0.95)), 4)
        return self.critical_rho


# ─── DATA GENERATION ──────────────────────────────────────────────────────────

def _generate_dataset(n: int = 10999, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    return pd.DataFrame({
        'ID': range(1, n + 1),
        'Warehouse_block': rng.choice(['A', 'B', 'C', 'D', 'F'], n),
        'Mode_of_Shipment': rng.choice(['Ship', 'Flight', 'Road'], n, p=[0.55, 0.33, 0.12]),
        'Customer_care_calls': rng.integers(1, 8, n).astype(int),
        'Customer_rating': rng.integers(1, 6, n).astype(int),
        'Cost_of_the_Product': rng.integers(96, 310, n).astype(int),
        'Prior_purchases': rng.integers(2, 8, n).astype(int),
        'Product_importance': rng.choice(['Low', 'Medium', 'High'], n, p=[0.60, 0.25, 0.15]),
        'Gender': rng.choice(['F', 'M'], n),
        'Discount_offered': rng.integers(0, 66, n).astype(int),
        'Weight_in_gms': rng.integers(1000, 7100, n).astype(int),
        'Reached.on.Time_Y.N': rng.choice([0, 1], n, p=[0.82, 0.18]).astype(int)
    })


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
    return {"message": "NodeGuard GSC API — MIMI Kernel Online"}


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
    _session["rho_history"].append({"time": ts, "rho": round(rho_measured, 4), "t1": kalman["rho_t1"]})
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
        "catastrophe_predicted": kalman["rho_t1"] > 0.80,
        "collapse_predicted": kalman["rho_t1"] >= 0.85,
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
