from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
import random
import numpy as np
import pandas as pd
import io
from datetime import datetime, timezone
from mimi_kernel import MIMIKernel, _generate_dataset

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─── SESSION STATE (In-memory for Serverless) ──────────────────────────────────
# Note: In a true serverless environment, this state would need to be in Redis or DB.
# For Vercel's hobby tier, we'll keep it in-memory but it will reset on cold starts.

_session: dict = {
    "mimi": None,
    "diverted_units": 0,
    "revenue_saved": 0.0,
    "refresh_count": 0,
    "rho_history": [],
    "dataset_name": "SAFEXPRESS_CASE_02028317"
}

def get_mimi():
    if _session["mimi"] is None:
        df = _generate_dataset()
        _session["mimi"] = MIMIKernel(df)
        _session["mimi"].fit_lr(use_baseline=True)
    return _session["mimi"]

@app.route("/api", methods=["GET"])
def root():
    return jsonify({"message": "SITI Intelligence — MIMI Kernel Active"})

@app.route("/api/kernel/state", methods=["GET"])
def get_kernel_state():
    mimi = get_mimi()

    noise = float(np.random.normal(0, 0.008))
    rho_measured = float(np.clip(mimi.base_rho() + noise, 0.0, 1.0))
    phi_val = mimi.phi(rho_measured)
    kalman = mimi.kalman_step(rho_measured)
    irp = mimi.inverse_reliability()

    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    _session["rho_history"].append({"time": ts, "rho": round(rho_measured, 4), "t1": kalman["rho_t1"], "t3": kalman["rho_t3"]})
    if len(_session["rho_history"]) > 30:
        _session["rho_history"].pop(0)

    return jsonify({
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
    })

@app.route("/api/kernel/tick", methods=["POST"])
def kernel_tick():
    mimi = get_mimi()
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

    return jsonify({
        "diverted": diverted,
        "total_diverted": _session["diverted_units"],
        "revenue_saved": round(_session["revenue_saved"], 2),
        "refresh_count": _session["refresh_count"]
    })

@app.route("/api/kernel/upload", methods=["POST"])
def upload_dataset():
    if 'file' not in request.files:
        return jsonify({"detail": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"detail": "No selected file"}), 400

    try:
        df = pd.read_csv(file)

        # Immediate Data Sanitization for Big Data anomalies
        df = df.dropna(subset=df.columns.intersection(['Reached.on.Time_Y.N', 'ID']), how='all')

        # Column mapping logic
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
            return jsonify({"detail": "Cannot find on-time delivery column"}), 400

        # Data Cleaning
        col = df['Reached.on.Time_Y.N']
        if col.dtype == object:
            df['Reached.on.Time_Y.N'] = col.map(
                lambda x: 1 if str(x).strip().upper() in ['Y', 'YES', '1', 'TRUE'] else 0
            ).fillna(0).astype(int)
        else:
            df['Reached.on.Time_Y.N'] = pd.to_numeric(col, errors='coerce').fillna(0).astype(int)

        new_kernel = MIMIKernel(df)
        new_critical_rho = new_kernel.fit_lr()

        _session["mimi"] = new_kernel
        _session["diverted_units"] = 0
        _session["revenue_saved"] = 0.0
        _session["refresh_count"] = 0
        _session["rho_history"] = []
        _session["dataset_name"] = file.filename or "UPLOADED_DATASET"

        return jsonify({
            "success": True,
            "n_total": len(df),
            "new_rho": new_kernel.base_rho(),
            "new_critical_rho": new_critical_rho,
            "message": f"MIMI Kernel reinitialized. ρ={new_kernel.base_rho():.4f}",
            "dataset_name": _session["dataset_name"]
        })
    except Exception as e:
        logger.error(f"Upload error: {e}")
        return jsonify({"detail": f"CSV parse error: {str(e)}"}), 400

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8000)
