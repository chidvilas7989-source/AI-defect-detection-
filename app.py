"""
app.py
======
Flask backend for the AI Defect Detection System.
Dual-model: YOLOv8 (object detection) + CNN+LSTM (binary classification).
Includes Transfer Learning, Anomaly Detection, and Active Learning integration.
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from services.model_service import load_model, predict_defects, CLASS_INFO
from services.cnn_lstm_service import load_cnn_lstm_model, predict_cnn_lstm
from anomaly.anomaly_service import detect_anomaly
from active_learning.active_learning_service import handle_detection, get_pending_images, label_image, PENDING_DIR

import os
import json
import uuid
import cv2
import numpy as np
import webbrowser
import threading
from datetime import datetime
from collections import deque

app = Flask(__name__)
CORS(app)

# ── Load models at startup ─────────────────────────────────────────────────────
yolo_model     = load_model()
cnn_lstm_model = load_cnn_lstm_model()

# ── In-memory detection history (last 50) ─────────────────────────────────────
history_store = deque(maxlen=50)

DATASETS = [
    {
        "name":        "DeepPCB",
        "description": "PCB defect dataset with bounding-box annotations",
        "classes":     ["crack", "blowhole", "break", "fray", "open", "short", "mousebite", "spur", "copper", "pin_hole"],
        "size":        "1 500 image pairs",
    }
]

def _record_history(filename: str, model_type: str, result: dict):
    entry = {
        "id":         len(history_store) + 1,
        "timestamp":  datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "filename":   filename,
        "model":      model_type,
        "verdict":    result.get("verdict_label") or result.get("status"),
        "confidence": result.get("confidence", 0),
        "num_defects": len(result.get("defects", [])),
    }
    history_store.appendleft(entry)

@app.route("/")
def index():
    return render_template("dashboard.html", active="dashboard")

@app.route("/analytics")
def analytics():
    return render_template("analytics.html", active="analytics")

@app.route("/assistant")
def assistant():
    return render_template("assistant.html", active="assistant")

@app.route("/history")
def history_page():
    return render_template("history.html", active="history")

@app.route("/settings")
def settings():
    return render_template("settings.html", active="settings")

@app.route("/api/detect", methods=["POST"])
def detect():
    try:
        if "image" not in request.files:
            return jsonify({"error": "No image uploaded"}), 400
        file = request.files["image"]
        image_bytes = file.read()
        results     = predict_defects(yolo_model, image_bytes)
        _record_history(file.filename, "YOLOv8", results)
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cnn-detect", methods=["POST"])
def cnn_detect():
    try:
        if "image" not in request.files:
            return jsonify({"error": "No image uploaded"}), 400
        file = request.files["image"]
        image_bytes = file.read()
        results     = predict_cnn_lstm(cnn_lstm_model, image_bytes)
        _record_history(file.filename, "CNN+LSTM", results)
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/pipeline", methods=["POST"])
def pipeline():
    try:
        if "image" not in request.files:
            return jsonify({"error": "No image uploaded"}), 400
        file = request.files["image"]
        if file.filename == "":
            return jsonify({"error": "No image selected"}), 400

        image_bytes = file.read()
        
        # Step 0: Anomaly Detection directly on input
        anomaly_result = detect_anomaly(image_bytes)

        # Step 1: YOLOv8 Frontend
        yolo_results = predict_defects(yolo_model, image_bytes)
        
        # Step 1.5: Active Learning (Flag low confidence for review)
        al_status = handle_detection(image_bytes, yolo_results["confidence"], 0)
        
        nparr    = np.frombuffer(image_bytes, np.uint8)
        img_cv   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        verified_defects = []
        discarded_defects = []
        
        # Step 2 & 3: Crop and Verify
        for defect in yolo_results.get("defects", []):
            x1, y1, x2, y2 = defect["bbox"]
            h, w = img_cv.shape[:2]
            x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
            
            crop = img_cv[y1:y2, x1:x2]
            if crop.size == 0: continue
            
            is_success, buffer = cv2.imencode(".jpg", crop)
            if not is_success: continue
            crop_bytes = buffer.tobytes()
            
            cnn_result = predict_cnn_lstm(cnn_lstm_model, crop_bytes)
            defect["verification"] = {
                "verdict":    cnn_result["verdict"],
                "confidence": cnn_result["confidence"],
                "heatmap":    cnn_result["heatmap_image"]
            }
            
            if cnn_result["verdict"] == "DEFECTIVE":
                verified_defects.append(defect)
            else:
                discarded_defects.append(defect)
        
        status = "FAIL" if len(verified_defects) > 0 or anomaly_result["status"] == "ANOMALY" else "PASS"
        
        final_results = {
            "status": status,
            "defects": verified_defects,
            "discarded_defects": discarded_defects,
            "confidence": yolo_results["confidence"],
            "annotated_image": yolo_results["annotated_image"],
            "anomaly_info": anomaly_result,
            "active_learning_flagged": al_status.get("status") == "FLAGGED",
            "model_info": {
                "type": "YOLOv8 + CNN-LSTM + TF-Anomaly",
                "yolo_classes": yolo_results["model_info"]["classes"]
            }
        }
        
        _record_history(file.filename, "Pipeline", final_results)
        return jsonify(final_results)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Active Learning Endpoints ─────────────────────────────────────────────────
@app.route("/api/pending-images")
def get_pending():
    """Returns list of image filenames waiting for active learning review."""
    return jsonify({"pending": get_pending_images()})

@app.route("/api/pending-images/<filename>")
def serve_pending_image(filename):
    """Serves the pending image file."""
    return send_from_directory(PENDING_DIR, filename)

@app.route("/api/label", methods=["POST"])
def label_pending_image():
    """Labels an image and transfers it to the newly_labeled directory."""
    try:
        data = request.json
        filename = data.get("filename")
        label_class = data.get("label_class", "0")
        bboxes = data.get("bboxes", [])
        
        result = label_image(filename, label_class, bboxes)
        # We could also check check_retrain_trigger() here
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/history")
def history():
    return jsonify({"history": list(history_store), "total": len(history_store)})

@app.route("/api/classes")
def classes():
    return jsonify({str(k): v for k, v in CLASS_INFO.items()})

# ── Health Check ──────────────────────────────────────────────────────────────
@app.route("/health")
def health():
    """Returns model status — polled by the frontend every 30 seconds."""
    yolo_status = "custom trained" if os.path.exists("models/best.pt") else "fallback"
    cnn_lstm_status = "trained" if os.path.exists("models/cnn_lstm_best.pth") else "untrained"
    return jsonify({
        "status": "ok",
        "yolo_model": yolo_status,
        "cnn_lstm_model": cnn_lstm_status,
        "anomaly_model": "loaded" if os.path.exists("models/autoencoder.h5") else "not loaded",
    })

# ── Report Generation ─────────────────────────────────────────────────────────
@app.route("/api/report", methods=["POST"])
def generate_report():
    """Generates a structured damage report from a detection result dict."""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400

        status  = data.get("status") or data.get("verdict_label") or data.get("verdict", "UNKNOWN")
        defects = data.get("defects", [])
        conf    = data.get("confidence", 0.0)
        model   = (data.get("model_info") or {}).get("type") or data.get("model_type", "Unknown")

        is_pass = status in ("PASS", "GOOD")
        report = {
            "report_id":      f"RPT-{uuid.uuid4().hex[:8].upper()}",
            "timestamp":      datetime.now().isoformat(),
            "model_used":     model,
            "verdict":        "PASS" if is_pass else "FAIL",
            "confidence":     round(float(conf), 4),
            "num_defects":    len(defects),
            "defect_classes": list({d["class"] for d in defects}),
            "anomaly_status": (data.get("anomaly_info") or {}).get("status", "N/A"),
            "active_learning_flagged": data.get("active_learning_flagged", False),
            "recommendation": (
                "✅ Component passed inspection. Clear for assembly."
                if is_pass else
                f"❌ {len(defects)} defect(s) detected. Remove component from production line."
            ),
        }
        return jsonify({"report": report})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def open_browser():
    import time
    time.sleep(1.5)
    webbrowser.open("http://localhost:5000")

if __name__ == "__main__":
    print("=" * 55)
    print("  DefectAI Pro -- Starting server")
    print("  Dashboard: http://localhost:5000")
    print("  Analytics: http://localhost:5000/analytics")
    print("  Assistant: http://localhost:5000/assistant")
    print("  History:   http://localhost:5000/history")
    print("  Settings:  http://localhost:5000/settings")
    print("=" * 55)
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(debug=False, host="0.0.0.0", port=5000, use_reloader=False)
