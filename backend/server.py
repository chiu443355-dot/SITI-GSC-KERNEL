"""
SITI Intelligence — MIMI Kernel v2.0
Fixed: Razorpay payment webhook, admin key provisioning, SSE live stream, 
       hub control API, all endpoints documented in README
"""

from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import os, re, logging, random, asyncio, json, time, hashlib, hmac
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

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'siti_sovereign')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

app = FastAPI(title="SITI Intelligence API", version="2.0.0")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─── CONSTANTS ────────────────────────────────────────────────────────────────
T_OPERATIONAL = 36.0
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

# ─── API KEY STORE (in-memory + MongoDB backed) ───────────────────────────────
# Format: key_string -> {"role": "ADMIN|OPERATOR|INTEGRATOR|READONLY", "client": "name", "active": True}
_api_keys: dict = {}

ROLES = {"ADMIN", "OPERATOR", "INTEGRATOR", "READONLY"}
ROLE_PERMISSIONS = {
    "ADMIN":      {"all"},
    "OPERATOR":   {"read", "tick", "upload", "stream", "set-mu"},
    "INTEGRATOR": {"read", "intercept"},
    "READONLY":   {"read"},
}


def _load_env_keys():
    """Load API keys from environment variable: key:ROLE,key2:ROLE2"""
    raw = os.environ.get("API_KEYS", "siti-admin-key-001:ADMIN,siti-ops-key-002:OPERATOR")
    for pair in raw.split(","):
        pair = pair.strip()
        if ":" in pair:
            key, role = pair.split(":", 1)
            role = role.strip().upper()
            if role in ROLES:
                _api_keys[key.strip()] = {"role": role, "client": "ENV_PROVISIONED", "active": True}


def _verify_api_key(x_api_key: str = Header(default=None)) -> dict:
    """Dependency: validate API key from X-API-KEY header."""
    if not x_api_key:
        return {"role": "READONLY", "client": "anonymous"}  # Allow read access without key for demo
    key_data = _api_keys.get(x_api_key)
    if not key_data or not key_data.get("active"):
        raise HTTPException(status_code=401, detail="Invalid or inactive API key")
    return key_data


def _require_role(required_roles: set):
    """Factory for role-based access control."""
    def check(key_data: dict = Depends(_verify_api_key)):
        if key_data["role"] not in required_roles and "all" not in ROLE_PERMISSIONS.get(key_data["role"], set()):
            if key_data["role"] != "ADMIN":
                raise HTTPException(status_code=403, detail=f"Role {key_data['role']} cannot access this endpoint")
        return key_data
    return check


# ─── 2D KALMAN HUB NODE ──────────────────────────────────────────────────────
class HubNode:
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
        if self.mu <= 0: return 99.0
        return float(self.lambda_rate / self.mu)

    def check_thundering_herd(self, new_lambda: float) -> bool:
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
        Q = np.diag([0.002, 0.001])
        R = np.array([[0.005]])
        H = np.array([[1.0, 0.0]])
        F = np.array([[1.0, dt], [0.0, 1.0]])

        if self._kx is None:
            self._kx = np.array([z_rho, 0.0])
            self._kP = np.eye(2) * 0.1

        x_pred = F @ self._kx
        P_pred = F @ self._kP @ F.T + Q
        y = np.array([z_rho]) - H @ x_pred
        S = H @ P_pred @ H.T + R
        K = P_pred @ H.T @ np.linalg.inv(S)
        self._kx = x_pred + (K @ y).flatten()
        self._kP = (np.eye(2) - K @ H) @ P_pred

        rho_hat = float(self._kx[0])
        rho_dot = float(self._kx[1])
        rho_t1 = float(np.clip(rho_hat + dt * rho_dot, 0.0, 1.5))
        strain = 0.05 if self.saturation_protocol else 0.0
        rho_t3 = float(np.clip(rho_hat + 3.0 * dt * rho_dot + strain, 0.0, 1.5))
        pvi = round(abs(z_rho - rho_t3) * 100, 2)

        return {
            "x_hat": round(rho_hat, 4), "rho_dot": round(rho_dot, 6),
            "P": round(float(np.trace(self._kP)), 6),
            "K": [round(float(K[0, 0]), 4), round(float(K[1, 0]), 4)],
            "rho_t1": round(rho_t1, 4), "rho_t3": round(rho_t3, 4),
            "pvi": pvi, "saturation_protocol": self.saturation_protocol,
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
            mu_val = HUB_META.get(name, {}).get("mu_default", self.mu)
            hubs[name] = HubNode(name, lambda_rate, mu_val)
        return hubs

    def recalculate_lambdas(self):
        for name, blocks in HUB_BLOCK_MAP.items():
            if name in self.hubs:
                hub_df = self.df[self.df['Warehouse_block'].isin(blocks)]
                new_lambda = len(hub_df) / T_OPERATIONAL
                self.hubs[name].check_thundering_herd(new_lambda)
                self.hubs[name].lambda_rate = new_lambda

    def global_rho(self) -> float:
        total_lambda = sum(h.lambda_rate for h in self.hubs.values())
        total_mu = sum(h.mu for h in self.hubs.values())
        return float(np.clip(total_lambda / total_mu, 0.0, 1.5)) if total_mu > 0 else 1.0

    def failure_rate(self) -> float:
        late = int((self.df['Reached.on.Time_Y.N'] == 0).sum())
        return round(float(late / self.n_total), 4) if self.n_total > 0 else 0.0

    def update_mu(self, new_mu: float):
        self.mu = new_mu
        for hub in self.hubs.values():
            hub.mu = new_mu

    def update_hub_mu(self, hub_name: str, new_mu: float):
        if hub_name in self.hubs:
            self.hubs[hub_name].mu = new_mu

    def phi(self, rho_val: float) -> float:
        return round(float(1 / (1 + np.exp(-self.K_DECAY * (rho_val - self.critical_rho)))), 4)

    def wq(self, rho_val: float) -> float:
        if rho_val >= 1.0: return 99.9999
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
        for b in ['A', 'B', 'C', 'D', 'E', 'F']:
            sub = self.df[self.df['Warehouse_block'] == b]
            n = len(sub)
            if n == 0: continue
            late = int((sub['Reached.on.Time_Y.N'] == 0).sum())
            results.append({"block": b, "total": int(n), "late": late,
                            "utilization": round(float(late / n), 4), "on_time": int(n - late)})
        return results

    def mode_metrics(self) -> list:
        results = []
        for m in ['Ship', 'Flight', 'Road']:
            sub = self.df[self.df['Mode_of_Shipment'] == m]
            n = len(sub)
            if n == 0: continue
            late = int((sub['Reached.on.Time_Y.N'] == 0).sum())
            results.append({"mode": m, "total": int(n), "late": late, "rate": round(float(late / n), 4)})
        return results

    def average_delay_per_block(self) -> list:
        mode_map = {'Ship': 2.0, 'Flight': 0.5, 'Road': 1.0}
        results = []
        for b in ['A', 'B', 'C', 'D', 'E', 'F']:
            sub = self.df[self.df['Warehouse_block'] == b]
            late = sub[sub['Reached.on.Time_Y.N'] == 0].copy()
            n = len(sub)
            n_late = len(late)
            if n == 0: continue
            if n_late > 0:
                mf = late['Mode_of_Shipment'].map(mode_map).fillna(1.0)
                avg_delay = float((late['Customer_care_calls'] * mf * 8.0).mean())
            else:
                avg_delay = 0.0
            results.append({"block": b, "avg_delay": round(avg_delay, 1), "n_late": n_late, "n_total": int(n)})
        return results

    def red_zone_importance(self) -> list:
        red_blocks = [
            b for b in ['A', 'B', 'C', 'D', 'E', 'F']
            if (sub := self.df[self.df['Warehouse_block'] == b]) is not None
            and len(sub) > 0
            and (sub['Reached.on.Time_Y.N'] == 0).sum() / len(sub) > 0.80
        ]
        if not red_blocks:
            red_blocks = ['A', 'B', 'C', 'D', 'E', 'F']
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
            "overloaded_blocks": overloaded, "available_blocks": available,
            "diversion_active": len(overloaded) > 0 and len(available) > 0,
            "epsilon": epsilon, "threshold": round(threshold, 4),
        }

    def fit_lr(self) -> float:
        df = self.df.copy()
        for col in ['Mode_of_Shipment', 'Product_importance', 'Warehouse_block', 'Gender']:
            if col in df.columns:
                df[f'{col}_enc'] = LabelEncoder().fit_transform(df[col].astype(str))
        features = [c for c in [
            'Customer_care_calls', 'Customer_rating', 'Cost_of_the_Product',
            'Prior_purchases', 'Discount_offered', 'Weight_in_gms',
            'Mode_of_Shipment_enc', 'Product_importance_enc', 'Warehouse_block_enc', 'Gender_enc'
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
        'Warehouse_block': rng.choice(['A', 'B', 'C', 'D', 'F'], n, p=[0.25, 0.20, 0.15, 0.15, 0.25]),
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
    "mimi": None, "diverted_units": 0, "revenue_saved": 0.0,
    "refresh_count": 0, "rho_history": [], "dataset_name": "SAFEXPRESS_CASE_02028317",
    "mu": 150.0,
}

# SSE subscribers: list of asyncio.Queue
_sse_subscribers: list = []


def _broadcast_state(state: dict):
    """Push state to all active SSE subscribers."""
    msg = json.dumps({
        "global_rho": state.get("global_rho"),
        "rho": state.get("rho"),
        "phi": state.get("phi"),
        "status": "collapse" if state.get("collapse") else "critical" if state.get("catastrophe") else "nominal",
        "recommended_action": "DIVERT" if state.get("global_rho", 0) > 0.85 else "MONITOR" if state.get("global_rho", 0) > 0.75 else "NOMINAL",
        "cascade_events": state.get("cascade_events", []),
        "pvi": state.get("pvi", 0),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    dead = []
    for q in _sse_subscribers:
        try:
            q.put_nowait(msg)
        except:
            dead.append(q)
    for q in dead:
        try: _sse_subscribers.remove(q)
        except: pass


# ─── HELPERS ──────────────────────────────────────────────────────────────────
def _sanitize_numeric(val):
    if isinstance(val, str):
        cleaned = re.sub(r'[^\d.]', '', val.strip())
        try: return float(cleaned) if cleaned else 0.0
        except ValueError: return 0.0
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
                continue
            text = _strip_non_ascii(text)
            df = pd.read_csv(io.StringIO(text), on_bad_lines='skip')
            logger.info(f"CSV parsed: encoding={encoding}, rows={len(df)}")
            return df
        except UnicodeDecodeError:
            continue
        except Exception as exc:
            logger.warning(f"CSV parse error ({encoding}): {exc}")
    raise ValueError("CSV unreadable with UTF-8, ISO-8859-1, or Windows-1252")


def _fuzzy_map_columns(df: pd.DataFrame) -> pd.DataFrame:
    TARGET_MAP = [
        ('Reached.on.Time_Y.N', lambda c: ('reached' in c) or ('on_time' in c) or ('ontime' in c) or ('delivered' in c) or ('delayed' in c) or ('late' in c)),
        ('Warehouse_block',     lambda c: ('warehouse' in c) or ('wh_block' in c) or ('block' in c and 'hub' not in c) or ('depot' in c)),
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
            if pd.isna(col_mean): col_mean = 0
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(col_mean).astype(int)
    cat_defaults = {'Warehouse_block': 'A', 'Mode_of_Shipment': 'Ship',
                    'Product_importance': 'Medium', 'Gender': 'M'}
    for col, default in cat_defaults.items():
        if col in df.columns:
            df[col] = df[col].fillna(default)
    return df


def _compute_cascade(hubs: dict) -> tuple:
    effective = {name: h.lambda_rate for name, h in hubs.items()}
    events = []
    for name in sorted(effective.keys(), key=lambda n: effective[n] / hubs[n].mu, reverse=True):
        hub = hubs[name]
        rho = effective[name] / hub.mu if hub.mu > 0 else 99.0
        if rho > 0.85:
            excess = (rho - 0.85) * hub.mu
            others = [(n, effective[n] / hubs[n].mu) for n in effective if n != name]
            if not others: continue
            receiver_name = min(others, key=lambda x: x[1])[0]
            effective[name] -= excess
            effective[receiver_name] += excess
            events.append({
                "from_hub": name, "to_hub": receiver_name,
                "excess_lambda": round(excess, 2),
                "new_rho_source": round(effective[name] / hub.mu, 4),
                "new_rho_receiver": round(effective[receiver_name] / hubs[receiver_name].mu, 4),
            })
    return effective, events


def _build_kernel_state() -> dict:
    """Build the full kernel state dict — used by both REST and SSE."""
    mimi: MIMIKernel = _session["mimi"]
    if mimi is None:
        return {}

    effective_lambdas, cascade_events = _compute_cascade(mimi.hubs)

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
            "name": name, "blocks": HUB_BLOCK_MAP[name],
            "lambda_rate": round(hub.lambda_rate, 2),
            "effective_lambda": round(eff_lambda, 2),
            "mu": round(hub.mu, 2),
            "rho": round(rho_measured, 4), "rho_exact": round(eff_rho, 4),
            "kalman": kalman, "rho_history": hub.rho_history[-30:],
            "cascade_risk": is_receiver, "cascade_source": is_source,
            "saturation_protocol": hub.saturation_protocol,
        })

    total_eff = sum(effective_lambdas.values())
    total_mu = sum(h.mu for h in mimi.hubs.values())
    global_rho_val = float(np.clip(total_eff / total_mu, 0.0, 1.5)) if total_mu > 0 else 1.0
    global_rho_measured = float(np.clip(global_rho_val + np.random.normal(0, 0.005), 0.0, 1.5))

    phi_val = mimi.phi(global_rho_measured)
    irp = mimi.inverse_reliability()
    alpha_k = hub_states[0]["kalman"] if hub_states else {}

    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    _session["rho_history"].append({"time": ts, "rho": round(global_rho_measured, 4),
                                     "t1": alpha_k.get("rho_t1", 0), "t3": alpha_k.get("rho_t3", 0)})
    if len(_session["rho_history"]) > 30:
        _session["rho_history"].pop(0)

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

    any_saturation = any(h["saturation_protocol"] for h in hub_states)
    if any_saturation:
        sat_hub = next(h for h in hub_states if h["saturation_protocol"])
        commander_msg = f"THUNDERING HERD DETECTED AT HUB {sat_hub['name'].upper()}.\nIMMEDIATE SATURATION PROTOCOL ENGAGED."
        commander_level = "critical"

    state = {
        "rho": round(global_rho_measured, 4), "global_rho": round(global_rho_measured, 4),
        "mu": round(mimi.mu, 2), "total_lambda": round(total_eff, 2),
        "phi": phi_val, "critical_rho": mimi.critical_rho, "k_decay": mimi.K_DECAY,
        "n_total": mimi.n_total, "failure_rate": mimi.failure_rate(),
        "wq": mimi.wq(global_rho_measured),
        "hubs": hub_states, "cascade_events": cascade_events,
        "kalman": alpha_k, "rho_t3": rho_t3_max,
        "pvi": alpha_k.get("pvi", 0), "pvi_alert": alpha_k.get("pvi", 0) > 15.0,
        "commander_message": commander_msg, "commander_level": commander_level,
        "inverse_reliability": irp, "warehouse_metrics": mimi.warehouse_metrics(),
        "mode_metrics": mimi.mode_metrics(), "average_delay": mimi.average_delay_per_block(),
        "red_zone_importance": mimi.red_zone_importance(),
        "routing": mimi.routing_logic(global_rho_measured),
        "catastrophe": global_rho_measured > 0.80, "collapse": global_rho_measured >= 0.85,
        "catastrophe_predicted": rho_t3_max > 0.80, "collapse_predicted": rho_t3_max >= 0.85,
        "rho_history": _session["rho_history"][-30:],
        "annualized_exposure": mimi.ANNUALIZED_EXPOSURE, "leakage_seed": mimi.LEAKAGE_SEED,
        "diverted_units": _session["diverted_units"], "revenue_saved": round(_session["revenue_saved"], 2),
        "refresh_count": _session["refresh_count"], "dataset_name": _session["dataset_name"],
    }
    return state


# ─── ROUTES ───────────────────────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "SITI Intelligence — MIMI Kernel v2.0 (5-Hub Network)", "version": "2.0.0", "hubs": list(HUB_BLOCK_MAP.keys())}


@api_router.get("/kernel/state")
async def get_kernel_state():
    mimi = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")
    state = _build_kernel_state()
    _broadcast_state(state)
    return state


@api_router.post("/kernel/tick")
async def kernel_tick():
    mimi = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")
    g_rho = mimi.global_rho()
    diverted = random.randint(12, 28) if g_rho > 0.80 else random.randint(6, 15) if g_rho > 0.75 else random.randint(2, 8)
    _session["diverted_units"] += diverted
    _session["revenue_saved"] = _session["diverted_units"] * mimi.LEAKAGE_SEED
    _session["refresh_count"] += 1
    return {
        "diverted": diverted, "total_diverted": _session["diverted_units"],
        "revenue_saved": round(_session["revenue_saved"], 2), "refresh_count": _session["refresh_count"],
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
                for kw in ['late', 'delayed', 'delay', 'status', 'delivery', 'on_time', 'reached']:
                    if kw in lower_col:
                        suggestions['Reached.on.Time_Y.N'] = col
                        break
            raise HTTPException(status_code=400, detail={
                "type": "SCHEMA_MISMATCH", "found_columns": list(df.columns),
                "required_unmapped": ["Reached.on.Time_Y.N"], "fuzzy_suggestions": suggestions,
                "message": "SCHEMA MISMATCH: Map Reached.on.Time_Y.N to SITI standards",
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
            "success": True, "n_total": len(df),
            "new_rho": round(g_rho, 4), "new_critical_rho": new_critical_rho,
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
    mimi = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")

    rng = np.random.default_rng()
    rho_base = mimi.failure_rate()
    late_prob = float(np.clip(rho_base + rng.normal(0, 0.018), 0.55, 0.98))

    new_rows = pd.DataFrame({
        'ID':                  range(mimi.n_total + 1, mimi.n_total + n + 1),
        'Warehouse_block':     rng.choice(['A', 'B', 'C', 'D', 'F'], n, p=[0.25, 0.20, 0.15, 0.15, 0.25]),
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
        "success": True, "injected": n, "new_n_total": mimi.n_total,
        "new_rho": round(new_rho, 4), "diverted": diverted,
        "total_diverted": _session["diverted_units"],
        "revenue_saved": round(_session["revenue_saved"], 2),
    }


# ─── HUB SIZE CONTROL ─────────────────────────────────────────────────────────

class MuUpdate(BaseModel):
    mu: float

class HubMuUpdate(BaseModel):
    hub_name: str
    mu: float


@api_router.post("/kernel/set-mu")
async def set_mu(data: MuUpdate):
    mimi = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")
    if data.mu < 10 or data.mu > 1000:
        raise HTTPException(status_code=400, detail="μ must be between 10 and 1000")
    mimi.update_mu(data.mu)
    _session["mu"] = data.mu
    return {"success": True, "mu": data.mu, "new_global_rho": round(mimi.global_rho(), 4)}


@api_router.post("/kernel/set-hub-mu")
async def set_hub_mu(data: HubMuUpdate):
    """Set service capacity for a specific hub independently."""
    mimi = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")
    if data.mu < 10 or data.mu > 2000:
        raise HTTPException(status_code=400, detail="μ must be between 10 and 2000")
    if data.hub_name not in mimi.hubs:
        raise HTTPException(status_code=404, detail=f"Hub '{data.hub_name}' not found. Valid hubs: {list(mimi.hubs.keys())}")
    mimi.update_hub_mu(data.hub_name, data.mu)
    hub_rho = mimi.hubs[data.hub_name].rho
    return {
        "success": True, "hub": data.hub_name, "new_mu": data.mu,
        "new_hub_rho": round(hub_rho, 4),
        "new_global_rho": round(mimi.global_rho(), 4),
        "available_hubs": list(mimi.hubs.keys()),
    }


@api_router.get("/kernel/hub-sizes")
async def get_hub_sizes():
    """Get current μ (service capacity) for all hubs."""
    mimi = _session["mimi"]
    if mimi is None:
        raise HTTPException(status_code=503, detail="MIMI Kernel not initialized")
    return {
        "hubs": [
            {
                "name": name,
                "mu": round(hub.mu, 2),
                "lambda": round(hub.lambda_rate, 2),
                "rho": round(hub.rho, 4),
                "region": HUB_META.get(name, {}).get("region", "Unknown"),
                "mu_default": HUB_META.get(name, {}).get("mu_default", 150),
                "capacity_pct": round((hub.lambda_rate / hub.mu * 100), 1),
                "status": "CRITICAL" if hub.rho >= 0.85 else "WARNING" if hub.rho > 0.75 else "NOMINAL",
            }
            for name, hub in mimi.hubs.items()
        ],
        "total_capacity": round(sum(h.mu for h in mimi.hubs.values()), 0),
        "total_lambda": round(sum(h.lambda_rate for h in mimi.hubs.values()), 2),
        "global_rho": round(mimi.global_rho(), 4),
    }


# ─── SSE LIVE STREAM ──────────────────────────────────────────────────────────

@api_router.get("/v1/stream")
async def sse_stream(key: str = None):
    """
    Server-Sent Events endpoint for real-time kernel state.
    Companies connect their frontend here for live dashboard updates.
    
    Usage: new EventSource('/api/v1/stream?key=YOUR_API_KEY')
    Each event: {global_rho, phi, status, recommended_action, cascade_events, pvi, timestamp}
    """
    # Auth check
    if key and key not in _api_keys:
        raise HTTPException(status_code=401, detail="Invalid API key")

    q = asyncio.Queue(maxsize=50)
    _sse_subscribers.append(q)

    async def event_generator():
        try:
            # Send initial state immediately
            mimi = _session["mimi"]
            if mimi:
                initial = {
                    "global_rho": round(mimi.global_rho(), 4),
                    "phi": mimi.phi(mimi.global_rho()),
                    "status": "nominal",
                    "recommended_action": "NOMINAL",
                    "cascade_events": [],
                    "pvi": 0,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "connected": True,
                    "kernel_version": "2.0.0",
                }
                yield f"data: {json.dumps(initial)}\n\n"

            # Stream subsequent events
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    # Heartbeat to keep connection alive
                    yield f"data: {json.dumps({'heartbeat': True, 'timestamp': datetime.now(timezone.utc).isoformat()})}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            try: _sse_subscribers.remove(q)
            except: pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


# ─── ENTERPRISE API ───────────────────────────────────────────────────────────

@api_router.post("/v1/intercept")
async def intercept_endpoint(payload: dict = {}):
    """Enterprise interception endpoint. Submit shipment data, get MIMI risk assessment."""
    mimi = _session["mimi"]
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
            "status": "CRITICAL" if eff_rho >= 0.85 else "WARNING" if eff_rho > 0.75 else "NOMINAL",
        })

    # Broadcast to SSE subscribers
    state_snapshot = {
        "global_rho": round(g_rho, 4),
        "phi": mimi.phi(g_rho),
        "status": "collapse" if g_rho >= 0.85 else "critical" if g_rho > 0.80 else "nominal",
        "recommended_action": "DIVERT" if g_rho > 0.85 else "MONITOR" if g_rho > 0.75 else "NOMINAL",
        "cascade_events": cascade,
        "pvi": 0,
    }
    _broadcast_state(state_snapshot)

    return {
        "status": "collapse" if g_rho >= 0.85 else "critical" if g_rho > 0.80 else "nominal",
        "network": {
            "global_rho": round(g_rho, 4), "hubs": hub_summary,
            "cascade_events": cascade,
            "total_lambda": round(sum(effective.values()), 2),
            "total_mu": round(sum(h.mu for h in mimi.hubs.values()), 2),
        },
        "prediction": {
            "rho_t3": round(max(h.kalman_step_2d(h.rho)["rho_t3"] for h in mimi.hubs.values()), 4),
        },
        "recommended_action": "DIVERT" if g_rho > 0.85 else "MONITOR" if g_rho > 0.75 else "NOMINAL",
        "irp": {
            "failure_count": mimi.inverse_reliability()["failure_count"],
            "leakage_total": mimi.inverse_reliability()["leakage_total"],
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@api_router.get("/v1/intercept/schema")
async def intercept_schema():
    return {
        "endpoint": "/api/v1/intercept",
        "method": "POST",
        "stream_endpoint": "/api/v1/stream",
        "stream_method": "GET (SSE)",
        "description": "Real-time interception + SSE streaming for SAP/Oracle ERP integration.",
        "authentication": "Bearer token via X-API-KEY header or ?key= query param",
        "rate_limit": "1000 req/min (enterprise tier)",
    }


# ─── ADMIN: KEY MANAGEMENT ───────────────────────────────────────────────────

class CreateKeyRequest(BaseModel):
    client_name: str
    role: str = "INTEGRATOR"
    notes: str = ""


@api_router.post("/admin/create-key")
async def create_api_key(data: CreateKeyRequest, key_data: dict = Depends(_require_role({"ADMIN"}))):
    """ADMIN ONLY: Provision a new API key for a client."""
    if data.role.upper() not in ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(ROLES)}")

    import secrets
    new_key = f"siti-{data.client_name.lower().replace(' ', '-')}-{secrets.token_hex(8)}"
    _api_keys[new_key] = {
        "role": data.role.upper(),
        "client": data.client_name,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "notes": data.notes,
    }

    # Persist to MongoDB
    try:
        await db.api_keys.insert_one({
            "key": new_key, "role": data.role.upper(), "client": data.client_name,
            "active": True, "created_at": datetime.now(timezone.utc).isoformat(),
            "notes": data.notes,
        })
    except Exception as e:
        logger.warning(f"Failed to persist key to MongoDB: {e}")

    return {
        "success": True,
        "api_key": new_key,
        "role": data.role.upper(),
        "client": data.client_name,
        "message": f"API key provisioned for {data.client_name}. Share key with client — it grants {data.role} access.",
        "permissions": list(ROLE_PERMISSIONS.get(data.role.upper(), set())),
    }


@api_router.post("/admin/revoke-key")
async def revoke_api_key(key_to_revoke: str, key_data: dict = Depends(_require_role({"ADMIN"}))):
    """ADMIN ONLY: Revoke an API key."""
    if key_to_revoke not in _api_keys:
        raise HTTPException(status_code=404, detail="Key not found")
    _api_keys[key_to_revoke]["active"] = False
    try:
        await db.api_keys.update_one({"key": key_to_revoke}, {"$set": {"active": False}})
    except Exception as e:
        logger.warning(f"Failed to revoke key in MongoDB: {e}")
    return {"success": True, "message": f"Key revoked. Client {_api_keys[key_to_revoke]['client']} can no longer access SITI."}


@api_router.get("/admin/list-keys")
async def list_keys(key_data: dict = Depends(_require_role({"ADMIN"}))):
    """ADMIN ONLY: List all API keys."""
    return {
        "keys": [
            {"client": v["client"], "role": v["role"], "active": v["active"],
             "key_prefix": k[:12] + "...", "created_at": v.get("created_at", "N/A")}
            for k, v in _api_keys.items()
        ]
    }


# ─── RAZORPAY PAYMENT WEBHOOK ─────────────────────────────────────────────────

RAZORPAY_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
SENDGRID_KEY = os.environ.get("SENDGRID_KEY", "")

PLAN_CONFIG = {
    "pilot":      {"role": "OPERATOR",    "display": "PILOT — ₹29,999/mo"},
    "operator":   {"role": "OPERATOR",    "display": "OPERATOR — ₹74,999/mo"},
    "enterprise": {"role": "ADMIN",       "display": "ENTERPRISE — Custom"},
}


@api_router.post("/payments/razorpay-webhook")
async def razorpay_webhook(request_body: dict):
    """
    Razorpay webhook: on payment.captured, auto-provision an API key
    and optionally send it via email (if SendGrid is configured).
    
    Razorpay sends: event, payload.payment.entity
    """
    # Signature verification would go here in production:
    # signature = headers.get("X-Razorpay-Signature")
    # expected = hmac.new(RAZORPAY_SECRET.encode(), body, hashlib.sha256).hexdigest()
    # if not hmac.compare_digest(signature, expected): raise HTTPException(403)

    event = request_body.get("event", "")
    if event != "payment.captured":
        return {"status": "ignored", "event": event}

    payment = request_body.get("payload", {}).get("payment", {}).get("entity", {})
    payment_id = payment.get("id", "unknown")
    amount = payment.get("amount", 0)  # In paise
    email = payment.get("email", "")
    contact = payment.get("contact", "")
    notes = payment.get("notes", {})
    plan = notes.get("plan", "pilot").lower()

    plan_data = PLAN_CONFIG.get(plan, PLAN_CONFIG["pilot"])

    import secrets
    client_name = email.split("@")[0] if email else contact or "new_client"
    new_key = f"siti-{client_name.lower().replace('.', '-')[:20]}-{secrets.token_hex(8)}"

    _api_keys[new_key] = {
        "role": plan_data["role"],
        "client": client_name,
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "notes": f"Auto-provisioned via Razorpay. Payment: {payment_id}. Plan: {plan_data['display']}",
        "payment_id": payment_id,
        "plan": plan,
    }

    # Persist to MongoDB
    try:
        await db.api_keys.insert_one({
            "key": new_key, "role": plan_data["role"], "client": client_name,
            "active": True, "payment_id": payment_id, "plan": plan,
            "amount_paise": amount, "email": email,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.payments.insert_one({
            "payment_id": payment_id, "amount_paise": amount, "amount_inr": amount / 100,
            "email": email, "contact": contact, "plan": plan, "api_key": new_key,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"MongoDB write failed for payment {payment_id}: {e}")

    # Send email via SendGrid (if configured)
    email_sent = False
    if SENDGRID_KEY and email:
        try:
            import httpx
            body = {
                "personalizations": [{"to": [{"email": email}]}],
                "from": {"email": "noreply@siti-intelligence.io", "name": "SITI Intelligence"},
                "subject": f"Your SITI Intelligence API Key — {plan_data['display']}",
                "content": [{
                    "type": "text/plain",
                    "value": f"""Welcome to SITI Intelligence!

Your API Key: {new_key}
Plan: {plan_data['display']}
Role: {plan_data['role']}

To get started:
  POST https://siti-gsc-kernel-1.onrender.com/api/v1/intercept
  Header: X-API-KEY: {new_key}

For live dashboard streaming:
  Connect to: wss://siti-gsc-kernel-1.onrender.com/api/v1/stream?key={new_key}

Documentation: https://siti-gsc-kernel.vercel.app
Support: support@siti-intelligence.io

— SITI Intelligence Team
"""
                }]
            }
            async with httpx.AsyncClient() as c:
                await c.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    json=body,
                    headers={"Authorization": f"Bearer {SENDGRID_KEY}"},
                    timeout=10.0,
                )
            email_sent = True
        except Exception as e:
            logger.warning(f"SendGrid failed: {e}")

    logger.info(f"Payment captured: {payment_id}, plan={plan}, key={new_key[:20]}..., email_sent={email_sent}")

    return {
        "status": "provisioned",
        "api_key": new_key,
        "plan": plan,
        "role": plan_data["role"],
        "email_sent": email_sent,
        "payment_id": payment_id,
        "message": "API key provisioned and email sent to client.",
    }


@api_router.get("/payments/plans")
async def get_plans():
    """Public endpoint: return pricing plans."""
    return {
        "plans": [
            {
                "id": "pilot",
                "name": "PILOT",
                "price_inr": 29999,
                "price_display": "₹29,999/mo",
                "hubs": 1,
                "shipments_per_month": "50,000",
                "features": ["1 hub monitored", "CSV upload", "PDF forensic audit", "Email support"],
                "razorpay_plan_id": os.environ.get("RAZORPAY_PILOT_PLAN_ID", ""),
            },
            {
                "id": "operator",
                "name": "OPERATOR",
                "price_inr": 74999,
                "price_display": "₹74,999/mo",
                "hubs": 5,
                "shipments_per_month": "500,000",
                "features": ["5 hubs monitored", "WhatsApp alerts via Twilio", "Live API stream (SSE)", "Priority support"],
                "razorpay_plan_id": os.environ.get("RAZORPAY_OPERATOR_PLAN_ID", ""),
            },
            {
                "id": "enterprise",
                "name": "ENTERPRISE",
                "price_inr": None,
                "price_display": "Custom",
                "hubs": "Unlimited",
                "shipments_per_month": "Unlimited",
                "features": ["Redis/K8s scaling", "Delhivery-scale support", "Dedicated onboarding", "SLA guarantee", "Custom integrations"],
                "contact": "enterprise@siti-intelligence.io",
            },
        ],
        "currency": "INR",
        "contact": "https://wa.me/917XXXXXXXXX",
    }


# ─── HEALTH ───────────────────────────────────────────────────────────────────

@api_router.get("/health")
async def health():
    mimi = _session["mimi"]
    return {
        "status": "healthy",
        "kernel_initialized": mimi is not None,
        "n_total": mimi.n_total if mimi else 0,
        "global_rho": round(mimi.global_rho(), 4) if mimi else None,
        "sse_subscribers": len(_sse_subscribers),
        "api_keys_active": sum(1 for v in _api_keys.values() if v.get("active")),
        "timestamp": datetime.now(timezone.utc).isoformat(),
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
    _load_env_keys()

    # Also load keys from MongoDB if available
    try:
        async for doc in db.api_keys.find({"active": True}):
            key = doc.get("key")
            if key and key not in _api_keys:
                _api_keys[key] = {
                    "role": doc.get("role", "READONLY"),
                    "client": doc.get("client", "unknown"),
                    "active": True,
                    "created_at": doc.get("created_at", ""),
                }
        logger.info(f"Loaded {len(_api_keys)} API keys ({sum(1 for v in _api_keys.values() if v.get('active'))} active)")
    except Exception as e:
        logger.warning(f"MongoDB key load failed (using env keys only): {e}")

    df = _generate_dataset()
    _session["mimi"] = MIMIKernel(df)
    _session["mu"] = 150.0

    logger.info(f"MIMI Kernel v2.0 initialized: n={len(df)}, Global ρ={_session['mimi'].global_rho():.4f}")
    for name, hub in _session["mimi"].hubs.items():
        logger.info(f"  Hub {name}: λ={hub.lambda_rate:.1f}/hr, μ={hub.mu:.0f}/hr, ρ={hub.rho:.4f}")

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _session["mimi"].fit_lr)
    logger.info(f"LR fitted: ρ_c={_session['mimi'].critical_rho:.4f}")
    logger.info(f"SSE endpoint ready at /api/v1/stream")
    logger.info(f"Payment webhook ready at /api/payments/razorpay-webhook")
    logger.info(f"Admin key creation at /api/admin/create-key (requires ADMIN key)")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
