"""Kiểm thử API bằng pytest + TestClient (không cần chạy uvicorn)."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # `with` để lifespan chạy và nạp mô hình
        yield c


def test_home_tra_ve_giao_dien(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "Phân loại hoa Iris" in res.text


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"
    assert body["model_loaded"] is True


def test_species_tra_ve_du_ba_loai(client):
    body = client.get("/species").json()
    assert body["count"] == 3
    assert [s["species_key"] for s in body["species"]] == ["setosa", "versicolor", "virginica"]
    for item in body["species"]:
        assert item["image_url"].startswith("/static/images/")
        assert item["license"]


def test_metrics_co_so_lieu(client):
    body = client.get("/metrics").json()
    assert 0 < body["performance"]["accuracy_test"] <= 1
    assert len(body["performance"]["confusion_matrix"]) == 3


@pytest.mark.parametrize(
    "payload, expected",
    [
        ({"sepal_length": 5.1, "sepal_width": 3.5, "petal_length": 1.4, "petal_width": 0.2}, "setosa"),
        ({"sepal_length": 6.0, "sepal_width": 2.7, "petal_length": 4.2, "petal_width": 1.3}, "versicolor"),
        ({"sepal_length": 6.5, "sepal_width": 3.0, "petal_length": 5.5, "petal_width": 2.0}, "virginica"),
    ],
)
def test_predict_dung_ba_loai(client, payload, expected):
    res = client.post("/predict", json=payload)
    assert res.status_code == 200
    body = res.json()
    assert body["species_key"] == expected
    assert body["class_id"] == ["setosa", "versicolor", "virginica"].index(expected)
    assert 0 <= body["confidence"] <= 1
    assert pytest.approx(sum(body["probabilities"].values()), abs=1e-3) == 1.0
    assert body["probabilities"][expected] == max(body["probabilities"].values())


def test_predict_thieu_truong_tra_422(client):
    res = client.post("/predict", json={"sepal_length": 5.1, "sepal_width": 3.5})
    assert res.status_code == 422


def test_predict_gia_tri_am_tra_422(client):
    res = client.post(
        "/predict",
        json={"sepal_length": -1, "sepal_width": 3.5, "petal_length": 1.4, "petal_width": 0.2},
    )
    assert res.status_code == 422


def test_predict_sai_kieu_du_lieu_tra_422(client):
    res = client.post(
        "/predict",
        json={"sepal_length": "năm phẩy một", "sepal_width": 3.5, "petal_length": 1.4, "petal_width": 0.2},
    )
    assert res.status_code == 422
