"""API phân loại hoa Iris bằng mô hình SVM.

Chạy cục bộ:  uvicorn app:app --reload
Tài liệu API: http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import json
import time
from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import species as sp

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model" / "svm_model.pkl"
METRICS_PATH = BASE_DIR / "model" / "metrics.json"
STATIC_DIR = BASE_DIR / "static"

FEATURE_ORDER = ["sepal_length", "sepal_width", "petal_length", "petal_width"]

state: dict = {"model": None, "metrics": {}, "loaded_at": None, "error": None}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Nạp mô hình đúng một lần lúc khởi động, không nạp lại ở mỗi request."""
    try:
        state["model"] = joblib.load(MODEL_PATH)
        state["loaded_at"] = time.time()
        print(f"[api] Đã nạp mô hình từ {MODEL_PATH}")
    except Exception as exc:
        state["error"] = f"Không nạp được mô hình: {exc}"
        print(f"[api] LỖI: {state['error']}")

    if METRICS_PATH.exists():
        state["metrics"] = json.loads(METRICS_PATH.read_text(encoding="utf-8"))

    yield
    state["model"] = None


app = FastAPI(
    title="Iris Classification API",
    description=(
        "Phân loại hoa Iris (setosa / versicolor / virginica) bằng mô hình SVM "
        "huấn luyện trên bộ dữ liệu Iris của UCI (Kaggle uciml/iris)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class IrisInput(BaseModel):
    """Bốn kích thước của bông hoa, đơn vị cm."""

    sepal_length: float = Field(..., gt=0, le=30, examples=[5.1], description="Dài đài hoa (cm)")
    sepal_width: float = Field(..., gt=0, le=30, examples=[3.5], description="Rộng đài hoa (cm)")
    petal_length: float = Field(..., gt=0, le=30, examples=[1.4], description="Dài cánh hoa (cm)")
    petal_width: float = Field(..., gt=0, le=30, examples=[0.2], description="Rộng cánh hoa (cm)")


class PredictionOutput(BaseModel):
    class_id: int
    species_key: str
    display_name: str
    vietnamese_name: str
    description: str
    confidence: float
    probabilities: dict[str, float]
    image_url: str
    alt_text: str
    source: str
    license: str


def get_model():
    model = state.get("model")
    if model is None:
        raise HTTPException(status_code=503, detail=state.get("error") or "Mô hình chưa sẵn sàng")
    return model


@app.get("/", include_in_schema=False)
def home():
    """Giao diện web cho người dùng cuối."""
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"message": "Iris SVM API is running", "docs": "/docs"}


@app.get("/health", tags=["Hệ thống"])
def health():
    """Kiểm tra sức khoẻ dịch vụ — dùng cho HEALTHCHECK của Docker và nginx."""
    healthy = state.get("model") is not None
    return {
        "status": "healthy" if healthy else "unhealthy",
        "model_loaded": healthy,
        "model_file": MODEL_PATH.name,
        "uptime_seconds": round(time.time() - state["loaded_at"], 1) if state.get("loaded_at") else None,
    }


@app.get("/species", tags=["Thông tin"])
def species_list():
    """Danh sách 3 loài hoa mà mô hình có thể nhận diện."""
    items = [sp.get(i) for i in range(len(sp.SPECIES))]
    return {"count": len(items), "species": items}


@app.get("/metrics", tags=["Thông tin"])
def metrics():
    """Số liệu đánh giá của mô hình đang chạy (sinh ra bởi train.py)."""
    if not state["metrics"]:
        raise HTTPException(status_code=404, detail="Chưa có metrics.json — hãy chạy train.py")
    m = state["metrics"]
    return {
        "generated_at": m.get("generated_at"),
        "data": {k: m["data"][k] for k in ("source_used", "n_samples", "train_size", "test_size") if k in m.get("data", {})},
        "model": m.get("model"),
        "performance": m.get("performance"),
        "kernel_comparison": m.get("kernel_comparison"),
    }


@app.post("/predict", response_model=PredictionOutput, tags=["Dự đoán"])
def predict(data: IrisInput):
    """Dự đoán loài hoa từ 4 kích thước."""
    model = get_model()
    features = np.array([[getattr(data, name) for name in FEATURE_ORDER]], dtype=float)

    class_id = int(model.predict(features)[0])
    proba = model.predict_proba(features)[0]
    probabilities = {sp.BY_ID[i]["species_key"]: round(float(p), 4) for i, p in enumerate(proba)}

    info = sp.get(class_id)
    return PredictionOutput(
        class_id=class_id,
        species_key=info["species_key"],
        display_name=info["display_name"],
        vietnamese_name=info["vietnamese_name"],
        description=info["description"],
        confidence=round(float(proba[class_id]), 4),
        probabilities=probabilities,
        image_url=info["image_url"],
        alt_text=info["alt_text"],
        source=info["source"],
        license=info["license"],
    )
