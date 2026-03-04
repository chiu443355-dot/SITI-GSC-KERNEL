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


def _fuzzy_map_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Fuzzy column mapper — String.includes()-style matching on messy headers."""
    TARGET_MAP = [
        ('Reached.on.Time_Y.N',  lambda l: ('reached' in l) or ('on_time' in l) or ('ontime' in l) or ('delivered' in l) or ('on_time_y' in l)),
        ('Warehouse_block',       lambda l: ('warehouse' in l) or ('wh_block' in l) or ('block' in l and 'hub' not in l)),
        ('Mode_of_Shipment',      lambda l: ('mode' in l) or ('shipment' in l) or ('transport' in l) or ('carrier' in l)),
        ('Customer_care_calls',   lambda l: ('care' in l and 'call' in l) or ('cc_call' in l) or ('support_call' in l)),
        ('Customer_rating',       lambda l: ('rating' in l) or ('score' in l and 'customer' in l) or ('csat' in l)),
        ('Cost_of_the_Product',   lambda l: ('cost' in l) or ('price' in l) or ('product_cost' in l) or ('amount' in l)),
        ('Prior_purchases',       lambda l: ('prior' in l) or ('purchase' in l) or ('prev_buy' in l) or ('history' in l)),
        ('Product_importance',    lambda l: ('importance' in l) or ('priority' in l) or ('prod_imp' in l) or ('tier' in l)),
        ('Gender',                lambda l: l in ('gender', 'sex', 'g')),
        ('Discount_offered',      lambda l: ('discount' in l) or ('promo' in l) or ('rebate' in l)),
        ('Weight_in_gms',         lambda l: ('weight' in l) or ('wt' in l) or ('mass' in l) or ('gms' in l) or ('gram' in l)),
    ]
    col_map = {}
    already_mapped = set()
    for col in df.columns:
        lower = col.lower().replace(' ', '_').replace('.', '_').replace('-', '_')
        for target, matcher in TARGET_MAP:
            if target not in already_mapped and matcher(lower):
                col_map[col] = target
                already_mapped.add(target)
                break
    return df.rename(columns=col_map)


def _fill_missing_with_means(df: pd.DataFrame) -> pd.DataFrame:
    """Fill missing / NaN numeric values with column means; categoricals with mode."""
    num_cols = ['Customer_care_calls', 'Customer_rating', 'Cost_of_the_Product',
                'Prior_purchases', 'Discount_offered', 'Weight_in_gms']
    for col in num_cols:
        if col in df.columns:
            col_mean = df[col].mean()
            if pd.isna(col_mean):
                col_mean = 0
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(col_mean).astype(int)
    cat_defaults = {'Warehouse_block': 'A', 'Mode_of_Shipment': 'Ship',
                    'Product_importance': 'Medium', 'Gender': 'M'}
    for col, default in cat_defaults.items():
        if col in df.columns:
            df[col] = df[col].fillna(default)
    return df


@api_router.post("/kernel/upload")
async def upload_dataset(file: UploadFile = File(...)):
    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))

        # Fuzzy column mapping
        df = _fuzzy_map_columns(df)

        if 'Reached.on.Time_Y.N' not in df.columns:
            raise HTTPException(status_code=400, detail="Cannot find on-time delivery column. Expected: 'Reached.on.Time_Y.N' or similar.")

        # Normalise on-time column to 0/1
        col = df['Reached.on.Time_Y.N']
        if col.dtype == object:
            df['Reached.on.Time_Y.N'] = col.map(
                lambda x: 1 if str(x).strip().upper() in ['Y', 'YES', '1', 'TRUE'] else 0
            ).astype(int)
        else:
            df['Reached.on.Time_Y.N'] = pd.to_numeric(col, errors='coerce').fillna(0).astype(int)

        if 'ID' not in df.columns:
            df['ID'] = range(1, len(df) + 1)
        for cat_col, default in [('Warehouse_block', 'A'), ('Mode_of_Shipment', 'Ship'),
                                  ('Product_importance', 'Medium'), ('Gender', 'M')]:
            if cat_col not in df.columns:
                df[cat_col] = default

        # Fill missing numeric values with column means (not zeros)
        df = _fill_missing_with_means(df)

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


@api_router.post("/kernel/stream-batch")
async def stream_batch(n: int = 100):
    """Inject n virtual shipment units based on current kernel ρ distribution — Live Telemetry mode."""
    mimi: MIMIKernel = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")

    rng = np.random.default_rng()
    rho_base = mimi.base_rho()
    # Late probability fluctuates around current ρ with small Gaussian noise
    late_prob = float(np.clip(rho_base + rng.normal(0, 0.018), 0.55, 0.98))

    new_rows = pd.DataFrame({
        'ID':                 range(mimi.n_total + 1, mimi.n_total + n + 1),
        'Warehouse_block':    rng.choice(['A', 'B', 'C', 'D', 'F'], n),
        'Mode_of_Shipment':   rng.choice(['Ship', 'Flight', 'Road'], n, p=[0.55, 0.33, 0.12]),
        'Customer_care_calls': rng.integers(1, 8, n).astype(int),
        'Customer_rating':    rng.integers(1, 6, n).astype(int),
        'Cost_of_the_Product': rng.integers(96, 310, n).astype(int),
        'Prior_purchases':    rng.integers(2, 8, n).astype(int),
        'Product_importance': rng.choice(['Low', 'Medium', 'High'], n, p=[0.60, 0.25, 0.15]),
        'Gender':             rng.choice(['F', 'M'], n),
        'Discount_offered':   rng.integers(0, 66, n).astype(int),
        'Weight_in_gms':      rng.integers(1000, 7100, n).astype(int),
        'Reached.on.Time_Y.N': rng.choice([0, 1], n, p=[late_prob, 1.0 - late_prob]).astype(int),
    })

    mimi.df = pd.concat([mimi.df, new_rows], ignore_index=True)
    mimi.n_total = len(mimi.df)
    mimi._kx = None   # reset Kalman so it re-estimates from fresh data

    new_rho = mimi.base_rho()
    diverted = int(n * late_prob * 0.25)
    _session["diverted_units"] += diverted
    _session["revenue_saved"] = _session["diverted_units"] * mimi.LEAKAGE_SEED
    _session["refresh_count"] += 1

    return {
        "success": True,
        "injected": n,
        "new_n_total": mimi.n_total,
        "new_rho": round(new_rho, 4),
        "diverted": diverted,
        "total_diverted": _session["diverted_units"],
        "revenue_saved": round(_session["revenue_saved"], 2),
    }


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
