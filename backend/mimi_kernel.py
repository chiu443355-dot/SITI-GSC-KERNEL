import numpy as np
import pandas as pd
import logging
import random
import io
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from typing import Optional, List, Dict

logger = logging.getLogger(__name__)

class MIMIKernel:
    LEAKAGE_SEED = 3.94
    BASE_EXPOSURE = 2_810_000

    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self.n_total = len(df)
        self._kx: Optional[np.ndarray] = None  # State: [rho, rho_dot]^T
        self._kP: np.ndarray = np.eye(2)       # Covariance: 2x2
        self.critical_rho: float = 0.85
        self.lr_model = None
        # Safexpress Baseline Weights (applied if fit_lr is not called)
        self.baseline_intercept = -1.2
        self.baseline_hub_f = 0.85

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
        """
        2D Kalman Filter refactored to account for k=20 gradient in sigmoidal noise
        and T+3 prediction horizon.
        State x = [rho, rho_dot]^T
        """
        # Matrices
        F = np.array([[1.0, 1.0], [0.0, 1.0]])  # State Transition
        H = np.array([[1.0, 0.0]])             # Observation Matrix
        R = 0.005                             # Measurement Noise

        # Sigmoidal Gradient Adjustment for non-linear noise
        phi_val = self.phi(z)
        # Gradient dPhi/dRho = k * Phi * (1 - Phi)
        phi_grad = self.K_DECAY * phi_val * (1.0 - phi_val)

        # Base process noise Q, scaled by instability gradient
        # Higher gradient = higher uncertainty/noise in the transition
        q_scale = 1.0 + phi_grad
        Q = np.array([[0.002, 0.001], [0.001, 0.002]]) * q_scale

        if self._kx is None:
            self._kx = np.array([z, 0.0])
            self._kP = np.eye(2)

        # 1. Prediction
        x_pred = F @ self._kx
        P_pred = F @ self._kP @ F.T + Q

        # 2. Update
        y = z - (H @ x_pred)                  # Innovation
        S = H @ P_pred @ H.T + R              # Innovation Covariance
        K = P_pred @ H.T @ np.linalg.inv(S)   # Kalman Gain

        self._kx = x_pred + K @ y
        self._kP = (np.eye(2) - K @ H) @ P_pred

        # T+1 and T+3 Horizons
        # rho_t+n = rho + n * rho_dot
        rho_t1 = float(np.clip(self._kx[0] + 1.0 * self._kx[1], 0.0, 1.0))
        rho_t3 = float(np.clip(self._kx[0] + 3.0 * self._kx[1], 0.0, 1.0))

        return {
            "x_hat": round(float(self._kx[0]), 4),
            "rho_dot": round(float(self._kx[1]), 6),
            "P": round(float(np.trace(self._kP)), 6),
            "K": round(float(K[0, 0]), 4),
            "rho_t1": round(rho_t1, 4),
            "rho_t3": round(rho_t3, 4)
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

    def get_exposure(self) -> int:
        """Dynamic exposure based on dataset scale"""
        scale_factor = self.n_total / 10999
        return int(self.BASE_EXPOSURE * scale_factor)

    def fit_lr(self, use_baseline: bool = False) -> float:
        if use_baseline or self.df is None or self.df.empty:
            # Synthetic threshold based on baseline weights
            self.critical_rho = round(float(np.clip(abs(self.baseline_intercept) + self.baseline_hub_f - 1.2, 0.70, 0.95)), 4)
            return self.critical_rho

        try:
            df = self.df.copy()
            # Handle Big Data Anomalies: Drop rows with missing targets or crucial features
            df = df.dropna(subset=['Reached.on.Time_Y.N'])

            if len(df) < 10: # Minimum scale for fitting
                 raise ValueError("Insufficient clean data")

            # Fill missing categorical features with mode
            for col in ['Mode_of_Shipment', 'Product_importance', 'Warehouse_block', 'Gender']:
                if col in df.columns:
                    df[col] = df[col].fillna(df[col].mode()[0] if not df[col].mode().empty else 'Unknown')

            # Fill missing numeric features with 0
            num_cols = ['Customer_care_calls', 'Customer_rating', 'Cost_of_the_Product',
                        'Prior_purchases', 'Discount_offered', 'Weight_in_gms']
            for col in num_cols:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

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
        except Exception as e:
            logger.warning(f"Kernel Hardening Triggered: {e}. Defaulting to Baseline.")
            return self.fit_lr(use_baseline=True)

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
