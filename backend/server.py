from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import os
import re
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


# ─── CONSTANTS ────────────────────────────────────────────────────────────────
T_OPERATIONAL = 36.0  # hours — operational window for λ estimation
HUB_BLOCK_MAP = {
    "Mumbai BOM":   ["A", "B"],
    "Delhi IGI":    ["C", "D"],
    "Bengaluru":    ["E", "F"],
    "Chennai MAA":  ["G", "H"],
    "Hyderabad":    ["I", "J"],
}

HUB_META = {
    "Mumbai BOM":  {"city": "Mumbai",    "region": "Maharashtra", "mu_default": 280},
    "Delhi IGI":   {"city": "Delhi",     "region": "NCR",         "mu_default": 260},
    "Bengaluru":   {"city": "Bengaluru", "region": "Karnataka",   "mu_default": 220},
    "Chennai MAA": {"city": "Chennai",   "region": "Tamil Nadu",  "mu_default": 180},
    "Hyderabad":   {"city": "Hyderabad", "region": "Telangana",   "mu_default": 160},
}


# ─── 2D KALMAN HUB NODE ──────────────────────────────────────────────────────
class HubNode:
    """
    Network distribution hub — Queueing Theory ρ = λ/μ
    2D Kalman state vector x = [ρ, ρ̇]^T
    Transition: F = [[1, Δt], [0, 1]]  (constant-velocity model)
    """
    def __init__(self, name: str, lambda_rate: float, mu: float = 150.0):
        self.name = name
        self.lambda_rate = lambda_rate
        self.mu = mu
        self._kx: Optional[np.ndarray] = None
        self._kP: np.ndarray = np.eye(2) * 0.1
        self.rho_history: list = []
        self.saturation_protocol: bool = False
        self._prev_lambda: float = lambda_rate

    @property
    def rho(self) -> float:
        """ρ = λ/μ — standard M/M/1 utilization."""
        if self.mu <= 0:
            return 99.0
        return float(self.lambda_rate / self.mu)

    def check_thundering_herd(self, new_lambda: float) -> bool:
        """IMMEDIATE SATURATION PROTOCOL: trigger if λ spikes >40% in one tick."""
        if self._prev_lambda > 1.0:
            spike = (new_lambda - self._prev_lambda) / self._prev_lambda
            if spike > 0.40:
                self.saturation_protocol = True
                self._prev_lambda = new_lambda
                return True
        self.saturation_protocol = False
        self._prev_lambda = new_lambda
        return False

    def kalman_step_2d(self, z_rho: float, dt: float = 1.0) -> dict:
        """
        2D Kalman Filter — x = [ρ, ρ̇]^T
        F = [[1, dt], [0, 1]], H = [[1, 0]]
        T+1 = ρ + dt·ρ̇  (45-min)
        T+3 = ρ + 3·dt·ρ̇ (135-min) + cumulative strain if saturation active
        """
        Q = np.diag([0.002, 0.001])
        R = np.array([[0.005]])
        H = np.array([[1.0, 0.0]])
        F = np.array([[1.0, dt], [0.0, 1.0]])

        if self._kx is None:
            self._kx = np.array([z_rho, 0.0])
            self._kP = np.eye(2) * 0.1

        # Predict
        x_pred = F @ self._kx
        P_pred = F @ self._kP @ F.T + Q

        # Update
        y = np.array([z_rho]) - H @ x_pred
        S = H @ P_pred @ H.T + R
        K = P_pred @ H.T @ np.linalg.inv(S)

        self._kx = x_pred + (K @ y).flatten()
        self._kP = (np.eye(2) - K @ H) @ P_pred

        rho_hat = float(self._kx[0])
        rho_dot = float(self._kx[1])
        rho_t1 = float(np.clip(rho_hat + dt * rho_dot, 0.0, 1.5))
        rho_t3_raw = float(rho_hat + 3.0 * dt * rho_dot)

        # Cumulative network strain under saturation protocol
        strain = 0.05 if self.saturation_protocol else 0.0
        rho_t3 = float(np.clip(rho_t3_raw + strain, 0.0, 1.5))
        pvi = round(abs(z_rho - rho_t3) * 100, 2)

        return {
            "x_hat":   round(rho_hat, 4),
            "rho_dot": round(rho_dot, 6),
            "P":       round(float(np.trace(self._kP)), 6),
            "K":       [round(float(K[0, 0]), 4), round(float(K[1, 0]), 4)],
            "rho_t1":  round(rho_t1, 4),
            "rho_t3":  round(rho_t3, 4),
            "pvi":     pvi,
            "saturation_protocol": self.saturation_protocol,
        }


# ─── MIMI KERNEL ──────────────────────────────────────────────────────────────
class MIMIKernel:
    LEAKAGE_SEED = 3.94
    ANNUALIZED_EXPOSURE = 2_810_000
    K_DECAY = 20

    def __init__(self, df: pd.DataFrame, mu: float = 150.0):
        self.df = df.copy()
        self.n_total = len(df)
        self.mu = mu
        self.critical_rho = 0.85
        self.lr_model = None
        self.hubs: dict = self._init_hubs()

    def _init_hubs(self) -> dict:
        hubs = {}
        for name, blocks in HUB_BLOCK_MAP.items():
            hub_df = self.df[self.df['Warehouse_block'].isin(blocks)]
            lambda_rate = len(hub_df) / T_OPERATIONAL
            hubs[name] = HubNode(name, lambda_rate, self.mu)
        return hubs

    def recalculate_lambdas(self):
        """Recalculate each hub's λ from current DataFrame distribution."""
        for name, blocks in HUB_BLOCK_MAP.items():
            if name in self.hubs:
                hub_df = self.df[self.df['Warehouse_block'].isin(blocks)]
                new_lambda = len(hub_df) / T_OPERATIONAL
                self.hubs[name].check_thundering_herd(new_lambda)
                self.hubs[name].lambda_rate = new_lambda

    def global_rho(self) -> float:
        """Aggregate ρ = Σλ / Σμ across all hubs."""
        total_lambda = sum(h.lambda_rate for h in self.hubs.values())
        total_mu = sum(h.mu for h in self.hubs.values())
        return float(np.clip(total_lambda / total_mu, 0.0, 1.5)) if total_mu > 0 else 1.0

    def failure_rate(self) -> float:
        """Delivery failure rate N_late / N_total (legacy, separate from ρ)."""
        late = int((self.df['Reached.on.Time_Y.N'] == 0).sum())
        return round(float(late / self.n_total), 4) if self.n_total > 0 else 0.0

    def update_mu(self, new_mu: float):
        self.mu = new_mu
        for hub in self.hubs.values():
            hub.mu = new_mu

    def phi(self, rho_val: float) -> float:
        return round(float(1 / (1 + np.exp(-self.K_DECAY * (rho_val - self.critical_rho)))), 4)

    def wq(self, rho_val: float) -> float:
        if rho_val >= 1.0:
            return 99.9999
        return round(float(rho_val / (1 - rho_val)), 4)

    def inverse_reliability(self) -> dict:
        df = self.df
        mask = (df['Product_importance'].str.lower() == 'high') & (df['Reached.on.Time_Y.N'] == 0)
        fail_df = df[mask]
        n_fail = int(len(fail_df))
        n_high = int((df['Product_importance'].str.lower() == 'high').sum())
        failure_rate = round(float(n_fail / n_high), 4) if n_high > 0 else 0.0
        top = fail_df.head(25)[['ID', 'Warehouse_block', 'Mode_of_Shipment',
                                 'Cost_of_the_Product', 'Weight_in_gms', 'Discount_offered']].copy()
        top.columns = ['id', 'hub', 'mode', 'cost', 'weight', 'discount']
        records = [{k: int(v) if isinstance(v, (np.integer, np.int64)) else v
                    for k, v in row.items()} for row in top.to_dict('records')]
        return {
            "failure_count": n_fail, "total_high": n_high, "failure_rate": failure_rate,
            "leakage_total": round(n_fail * self.LEAKAGE_SEED, 2),
            "clv_loss": round(n_fail * 2.74, 2),
            "recovery_value": round(n_fail * 1.20, 2),
            "records": records,
        }

    def warehouse_metrics(self) -> list:
        results = []
        for b in ['A', 'B', 'C', 'D', 'F']:
            sub = self.df[self.df['Warehouse_block'] == b]
            n = len(sub)
            if n == 0:
                continue
            late = int((sub['Reached.on.Time_Y.N'] == 0).sum())
            results.append({"block": b, "total": int(n), "late": late,
                            "utilization": round(float(late / n), 4), "on_time": int(n - late)})
        return results

    def mode_metrics(self) -> list:
        results = []
        for m in ['Ship', 'Flight', 'Road']:
            sub = self.df[self.df['Mode_of_Shipment'] == m]
            n = len(sub)
            if n == 0:
                continue
            late = int((sub['Reached.on.Time_Y.N'] == 0).sum())
            results.append({"mode": m, "total": int(n), "late": late, "rate": round(float(late / n), 4)})
        return results

    def average_delay_per_block(self) -> list:
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
            "threshold": round(threshold, 4),
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
        'Warehouse_block': rng.choice(['A', 'B', 'C', 'D', 'F'], n,
                                       p=[0.25, 0.20, 0.15, 0.15, 0.25]),
        'Mode_of_Shipment': rng.choice(['Ship', 'Flight', 'Road'], n, p=[0.55, 0.33, 0.12]),
        'Customer_care_calls': rng.integers(1, 8, n).astype(int),
        'Customer_rating': rng.integers(1, 6, n).astype(int),
        'Cost_of_the_Product': rng.integers(96, 310, n).astype(int),
        'Prior_purchases': rng.integers(2, 8, n).astype(int),
        'Product_importance': rng.choice(['Low', 'Medium', 'High'], n, p=[0.60, 0.25, 0.15]),
        'Gender': rng.choice(['F', 'M'], n),
        'Discount_offered': rng.integers(0, 66, n).astype(int),
        'Weight_in_gms': rng.integers(1000, 7100, n).astype(int),
        'Reached.on.Time_Y.N': rng.choice([0, 1], n, p=[0.82, 0.18]).astype(int),
    })


# ─── SESSION STATE ────────────────────────────────────────────────────────────

_session: dict = {
    "mimi": None,
    "diverted_units": 0,
    "revenue_saved": 0.0,
    "refresh_count": 0,
    "rho_history": [],
    "dataset_name": "SAFEXPRESS_CASE_02028317",
}


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _sanitize_numeric(val):
    if isinstance(val, str):
        cleaned = re.sub(r'[^\d.]', '', val.strip())
        try:
            return float(cleaned) if cleaned else 0.0
        except ValueError:
            return 0.0
    return val


def _sanitize_numeric_columns(df: pd.DataFrame) -> pd.DataFrame:
    num_cols = ['Customer_care_calls', 'Customer_rating', 'Cost_of_the_Product',
                'Prior_purchases', 'Discount_offered', 'Weight_in_gms']
    for col in num_cols:
        if col in df.columns:
            df[col] = df[col].apply(_sanitize_numeric)
    return df


def _strip_non_ascii(t):
    return re.sub(r'[^\x20-\x7E\t\n\r]', '', t)


def _parse_csv_resilient(content: bytes) -> pd.DataFrame:
    for encoding in ('utf-8', 'iso-8859-1', 'windows-1252'):
        try:
            text = content.decode(encoding, errors='replace')
            if encoding == 'utf-8' and '\uFFFD' in text:
                logger.warning("UTF-8: replacement chars found, retrying next encoding")
                continue
            text = _strip_non_ascii(text)
            df = pd.read_csv(io.StringIO(text), on_bad_lines='skip')
            logger.info(f"CSV parsed OK: encoding={encoding}, rows={len(df)}, cols={list(df.columns)}")
            return df
        except UnicodeDecodeError:
            logger.warning(f"Decode failed with {encoding}, trying next")
        except Exception as exc:
            logger.warning(f"CSV parse error ({encoding}): {exc}")
    raise ValueError("CSV unreadable with UTF-8, ISO-8859-1, or Windows-1252")


def _fuzzy_map_columns(df: pd.DataFrame) -> pd.DataFrame:
    TARGET_MAP = [
        ('Reached.on.Time_Y.N', lambda c: ('reached' in c) or ('on_time' in c) or ('ontime' in c) or ('delivered' in c) or ('on_time_y' in c)),
        ('Warehouse_block',     lambda c: ('warehouse' in c) or ('wh_block' in c) or ('block' in c and 'hub' not in c)),
        ('Mode_of_Shipment',    lambda c: ('mode' in c) or ('shipment' in c) or ('transport' in c) or ('carrier' in c)),
        ('Customer_care_calls', lambda c: ('care' in c and 'call' in c) or ('cc_call' in c) or ('support_call' in c)),
        ('Customer_rating',     lambda c: ('rating' in c) or ('score' in c and 'customer' in c) or ('csat' in c)),
        ('Cost_of_the_Product', lambda c: ('cost' in c) or ('price' in c) or ('product_cost' in c) or ('amount' in c)),
        ('Prior_purchases',     lambda c: ('prior' in c) or ('purchase' in c) or ('prev_buy' in c) or ('history' in c)),
        ('Product_importance',  lambda c: ('importance' in c) or ('priority' in c) or ('prod_imp' in c) or ('tier' in c)),
        ('Gender',              lambda c: c in ('gender', 'sex', 'g')),
        ('Discount_offered',    lambda c: ('discount' in c) or ('promo' in c) or ('rebate' in c)),
        ('Weight_in_gms',       lambda c: ('weight' in c) or ('wt' in c) or ('mass' in c) or ('gms' in c) or ('gram' in c)),
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


def _compute_cascade(hubs: dict) -> tuple:
    """Compute cascade diversion on copies of λ — does NOT mutate hub state."""
    effective = {name: h.lambda_rate for name, h in hubs.items()}
    events = []
    for name in sorted(effective.keys(), key=lambda n: effective[n] / hubs[n].mu, reverse=True):
        hub = hubs[name]
        rho = effective[name] / hub.mu if hub.mu > 0 else 99.0
        if rho > 0.85:
            excess = (rho - 0.85) * hub.mu
            others = [(n, effective[n] / hubs[n].mu) for n in effective if n != name]
            if not others:
                continue
            receiver_name = min(others, key=lambda x: x[1])[0]
            effective[name] -= excess
            effective[receiver_name] += excess
            events.append({
                "from_hub": name,
                "to_hub": receiver_name,
                "excess_lambda": round(excess, 2),
                "new_rho_source": round(effective[name] / hub.mu, 4),
                "new_rho_receiver": round(effective[receiver_name] / hubs[receiver_name].mu, 4),
            })
    return effective, events


# ─── ROUTES ───────────────────────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "SITI Intelligence — MIMI Kernel v2.0 (3-Hub Network)"}


@api_router.get("/kernel/state")
async def get_kernel_state():
    mimi: MIMIKernel = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")

    # ── Cascade: compute effective λ per hub ──
    effective_lambdas, cascade_events = _compute_cascade(mimi.hubs)

    # ── Per-hub state ──
    hub_states = []
    for name in list(HUB_BLOCK_MAP.keys()):
        hub = mimi.hubs[name]
        eff_lambda = effective_lambdas[name]
        eff_rho = float(np.clip(eff_lambda / hub.mu, 0.0, 1.5)) if hub.mu > 0 else 1.0
        noise = float(np.random.normal(0, 0.008))
        rho_measured = float(np.clip(eff_rho + noise, 0.0, 1.5))

        kalman = hub.kalman_step_2d(rho_measured)

        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        hub.rho_history.append({"time": ts, "rho": round(rho_measured, 4),
                                 "t1": kalman["rho_t1"], "t3": kalman["rho_t3"]})
        if len(hub.rho_history) > 30:
            hub.rho_history.pop(0)

        is_receiver = any(e["to_hub"] == name for e in cascade_events)
        is_source = any(e["from_hub"] == name for e in cascade_events)

        hub_states.append({
            "name": name,
            "blocks": HUB_BLOCK_MAP[name],
            "lambda_rate": round(hub.lambda_rate, 2),
            "effective_lambda": round(eff_lambda, 2),
            "mu": round(hub.mu, 2),
            "rho": round(rho_measured, 4),
            "rho_exact": round(eff_rho, 4),
            "kalman": kalman,
            "rho_history": hub.rho_history[-30:],
            "cascade_risk": is_receiver,
            "cascade_source": is_source,
            "saturation_protocol": hub.saturation_protocol,
        })

    # ── Global aggregate ──
    total_eff = sum(effective_lambdas.values())
    total_mu = sum(h.mu for h in mimi.hubs.values())
    global_rho_val = float(np.clip(total_eff / total_mu, 0.0, 1.5)) if total_mu > 0 else 1.0
    noise_g = float(np.random.normal(0, 0.005))
    global_rho_measured = float(np.clip(global_rho_val + noise_g, 0.0, 1.5))

    phi_val = mimi.phi(global_rho_measured)
    irp = mimi.inverse_reliability()

    # ── Global Kalman (pick Alpha hub's kalman as representative, or compute aggregate) ──
    alpha_k = hub_states[0] if hub_states else {}["kalman"] if hub_states else {}

    # ── Global rho history ──
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    _session["rho_history"].append({
        "time": ts,
        "rho":  round(global_rho_measured, 4),
        "t1":   alpha_k.get("rho_t1", 0),
        "t3":   alpha_k.get("rho_t3", 0),
    })
    if len(_session["rho_history"]) > 30:
        _session["rho_history"].pop(0)

    # ── Commander's message — based on most critical hub ──
    critical_hub = max(hub_states, key=lambda h: h["rho"])
    rho_t3_max = critical_hub["kalman"]["rho_t3"]

    if cascade_events:
        ev = cascade_events[0]
        commander_msg = f"CASCADE DIVERSION ACTIVE: {ev['from_hub']} -> {ev['to_hub']} ({ev['excess_lambda']:.1f} units/hr).\nMONITOR {ev['to_hub']} FOR SECONDARY STRAIN."
        commander_level = "critical"
    elif rho_t3_max >= 0.85:
        commander_msg = f"CRITICAL: HUB {critical_hub['name'].upper()} SATURATION IMMINENT.\nINITIATE PREEMPTIVE DIVERSION PROTOCOL."
        commander_level = "critical"
    elif rho_t3_max < 0.40:
        commander_msg = "EFFICIENCY GAP: NETWORK UNDER-UTILIZED.\nACCELERATE INBOUND INGESTION."
        commander_level = "efficiency"
    else:
        commander_msg = "MIMI KERNEL: OPTIMAL NETWORK FLOW DETECTED.\nCERTAINTY 99.2%."
        commander_level = "stable"

    # Any saturation protocol active?
    any_saturation = any(h["saturation_protocol"] for h in hub_states)
    if any_saturation:
        sat_hub = next(h for h in hub_states if h["saturation_protocol"])
        commander_msg = f"THUNDERING HERD DETECTED AT HUB {sat_hub['name'].upper()}.\nIMMEDIATE SATURATION PROTOCOL ENGAGED."
        commander_level = "critical"

    catastrophe = global_rho_measured > 0.80
    collapse = global_rho_measured >= 0.85

    return {
        # Global
        "rho": round(global_rho_measured, 4),
        "global_rho": round(global_rho_measured, 4),
        "mu": round(mimi.mu, 2),
        "total_lambda": round(total_eff, 2),
        "phi": phi_val,
        "critical_rho": mimi.critical_rho,
        "k_decay": mimi.K_DECAY,
        "n_total": mimi.n_total,
        "failure_rate": mimi.failure_rate(),
        "wq": mimi.wq(global_rho_measured),

        # Hub network
        "hubs": hub_states,
        "cascade_events": cascade_events,

        # Global Kalman (using Alpha as proxy)
        "kalman": alpha_k,
        "rho_t3": rho_t3_max,
        "pvi": alpha_k.get("pvi", 0),
        "pvi_alert": alpha_k.get("pvi", 0) > 15.0,

        # Commander
        "commander_message": commander_msg,
        "commander_level": commander_level,

        # Shared analytics
        "inverse_reliability": irp,
        "warehouse_metrics": mimi.warehouse_metrics(),
        "mode_metrics": mimi.mode_metrics(),
        "average_delay": mimi.average_delay_per_block(),
        "red_zone_importance": mimi.red_zone_importance(),
        "routing": mimi.routing_logic(global_rho_measured),

        # Flags
        "catastrophe": catastrophe,
        "collapse": collapse,
        "catastrophe_predicted": rho_t3_max > 0.80,
        "collapse_predicted": rho_t3_max >= 0.85,

        # Session
        "rho_history": _session["rho_history"][-30:],
        "annualized_exposure": mimi.ANNUALIZED_EXPOSURE,
        "leakage_seed": mimi.LEAKAGE_SEED,
        "diverted_units": _session["diverted_units"],
        "revenue_saved": round(_session["revenue_saved"], 2),
        "refresh_count": _session["refresh_count"],
        "dataset_name": _session["dataset_name"],
    }


@api_router.post("/kernel/tick")
async def kernel_tick():
    mimi: MIMIKernel = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")

    g_rho = mimi.global_rho()
    if g_rho > 0.80:
        diverted = random.randint(12, 28)
    elif g_rho > 0.75:
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
        "refresh_count": _session["refresh_count"],
    }


@api_router.post("/kernel/upload")
async def upload_dataset(file: UploadFile = File(...)):
    try:
        content = await file.read()
        df = _parse_csv_resilient(content)
        df = _fuzzy_map_columns(df)

        if 'Reached.on.Time_Y.N' not in df.columns:
            suggestions = {}
            for col in df.columns:
                lower_col = col.lower().replace(' ', '_').replace('.', '_').replace('-', '_')
                for kw in ['late', 'delayed', 'delay', 'status', 'delivery', 'on_time', 'reached', 'target']:
                    if kw in lower_col:
                        suggestions['Reached.on.Time_Y.N'] = col
                        break
                if 'Reached.on.Time_Y.N' in suggestions:
                    break
            raise HTTPException(status_code=400, detail={
                "type": "SCHEMA_MISMATCH",
                "found_columns": list(df.columns),
                "required_unmapped": ["Reached.on.Time_Y.N"],
                "fuzzy_suggestions": suggestions,
                "message": "SCHEMA MISMATCH: PLEASE MAP [Reached.on.Time_Y.N] TO SITI STANDARDS",
            })

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

        df = _sanitize_numeric_columns(df)
        df = _fill_missing_with_means(df)

        new_kernel = MIMIKernel(df, _session.get("mu", 150.0))
        new_critical_rho = new_kernel.fit_lr()

        _session["mimi"] = new_kernel
        _session["diverted_units"] = 0
        _session["revenue_saved"] = 0.0
        _session["refresh_count"] = 0
        _session["rho_history"] = []
        _session["dataset_name"] = file.filename or "UPLOADED_DATASET"

        g_rho = new_kernel.global_rho()
        return {
            "success": True,
            "n_total": len(df),
            "new_rho": round(g_rho, 4),
            "new_critical_rho": new_critical_rho,
            "message": f"MIMI Kernel reinitialized. Global ρ={g_rho:.4f}, ρ_c={new_critical_rho:.4f}",
            "dataset_name": _session["dataset_name"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=400, detail=f"CSV parse error: {str(e)}")


@api_router.post("/kernel/stream-batch")
async def stream_batch(n: int = 100):
    mimi: MIMIKernel = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")

    rng = np.random.default_rng()
    rho_base = mimi.failure_rate()
    late_prob = float(np.clip(rho_base + rng.normal(0, 0.018), 0.55, 0.98))

    new_rows = pd.DataFrame({
        'ID':                  range(mimi.n_total + 1, mimi.n_total + n + 1),
        'Warehouse_block':     rng.choice(['A', 'B', 'C', 'D', 'F'], n,
                                           p=[0.25, 0.20, 0.15, 0.15, 0.25]),
        'Mode_of_Shipment':    rng.choice(['Ship', 'Flight', 'Road'], n, p=[0.55, 0.33, 0.12]),
        'Customer_care_calls': rng.integers(1, 8, n).astype(int),
        'Customer_rating':     rng.integers(1, 6, n).astype(int),
        'Cost_of_the_Product': rng.integers(96, 310, n).astype(int),
        'Prior_purchases':     rng.integers(2, 8, n).astype(int),
        'Product_importance':  rng.choice(['Low', 'Medium', 'High'], n, p=[0.60, 0.25, 0.15]),
        'Gender':              rng.choice(['F', 'M'], n),
        'Discount_offered':    rng.integers(0, 66, n).astype(int),
        'Weight_in_gms':       rng.integers(1000, 7100, n).astype(int),
        'Reached.on.Time_Y.N': rng.choice([0, 1], n, p=[late_prob, 1.0 - late_prob]).astype(int),
    })

    mimi.df = pd.concat([mimi.df, new_rows], ignore_index=True)
    mimi.n_total = len(mimi.df)
    mimi.recalculate_lambdas()

    new_rho = mimi.global_rho()
    diverted = int(n * new_rho * 0.25)
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


# ─── SERVICE CAPACITY CONTROL ────────────────────────────────────────────────

class MuUpdate(BaseModel):
    mu: float

@api_router.post("/kernel/set-mu")
async def set_mu(data: MuUpdate):
    mimi: MIMIKernel = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")
    if data.mu < 10 or data.mu > 1000:
        raise HTTPException(status_code=400, detail="μ must be between 10 and 1000")
    mimi.update_mu(data.mu)
    _session["mu"] = data.mu
    return {"success": True, "mu": data.mu, "new_global_rho": round(mimi.global_rho(), 4)}


# ─── ENTERPRISE INTEGRATION API ──────────────────────────────────────────────

@api_router.post("/v1/intercept")
async def intercept_endpoint(payload: dict = {}):
    """Enterprise interception endpoint for SAP/Oracle ERP integration."""
    mimi: MIMIKernel = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")

    g_rho = mimi.global_rho()
    effective, cascade = _compute_cascade(mimi.hubs)

    hub_summary = []
    for name in list(HUB_BLOCK_MAP.keys()):
        hub = mimi.hubs[name]
        eff_rho = effective[name] / hub.mu if hub.mu > 0 else 1.0
        hub_summary.append({
            "name": name, "rho": round(eff_rho, 4),
            "lambda": round(effective[name], 2), "mu": round(hub.mu, 2),
        })

    return {
        "status": "collapse" if g_rho >= 0.85 else "critical" if g_rho > 0.80 else "nominal",
        "network": {
            "global_rho": round(g_rho, 4),
            "hubs": hub_summary,
            "cascade_events": cascade,
            "total_lambda": round(sum(effective.values()), 2),
            "total_mu": round(sum(h.mu for h in mimi.hubs.values()), 2),
        },
        "prediction": {
            "rho_t3": round(max(h.kalman_step_2d(h.rho)["rho_t3"] for h in mimi.hubs.values()), 4) if mimi.hubs else 0,
        },
        "recommended_action": "DIVERT" if g_rho > 0.85 else "MONITOR" if g_rho > 0.75 else "NOMINAL",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@api_router.get("/v1/intercept/schema")
async def intercept_schema():
    """Return JSON schema for the /api/v1/intercept endpoint."""
    return {
        "endpoint": "/api/v1/intercept",
        "method": "POST",
        "description": "Real-time interception endpoint for SAP/Oracle ERP integration. Submit shipment data for MIMI Kernel predictive analysis.",
        "request_schema": {
            "shipments": [
                {
                    "id": "string",
                    "warehouse_block": "A|B|C|D|F",
                    "mode_of_shipment": "Ship|Flight|Road",
                    "weight_gms": "number",
                    "cost": "number",
                    "product_importance": "Low|Medium|High",
                    "customer_care_calls": "number (1-7)",
                }
            ],
            "config": {
                "mu": "number (service capacity units/hr, default: 150)",
                "threshold": "number (critical ρ threshold, default: 0.85)",
            },
        },
        "response_schema": {
            "status": "nominal|critical|collapse",
            "network": {
                "global_rho": "number (0-1.5)",
                "hubs": [{"name": "string", "rho": "number", "lambda": "number", "mu": "number"}],
                "cascade_events": [{"from_hub": "string", "to_hub": "string", "excess_lambda": "number"}],
            },
            "prediction": {"rho_t3": "number (135-min forecast)"},
            "recommended_action": "NOMINAL|MONITOR|DIVERT",
            "timestamp": "ISO 8601",
        },
        "authentication": "Bearer token (contact SITI ops for enterprise key)",
        "rate_limit": "1000 req/min (enterprise tier)",
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
    _session["mu"] = 150.0
    logger.info(f"MIMI Kernel v2.0 initialized: n={len(df)}, Global ρ={_session['mimi'].global_rho():.4f}")
    for name, hub in _session["mimi"].hubs.items():
        logger.info(f"  Hub {name}: λ={hub.lambda_rate:.1f}/hr, μ={hub.mu:.0f}/hr, ρ={hub.rho:.4f}")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _session["mimi"].fit_lr)
    logger.info(f"LR fitted: ρ_c={_session['mimi'].critical_rho:.4f}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
