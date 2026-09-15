# da1 — API phân loại hoa Iris bằng SVM

Mô hình SVM phân loại ba loài hoa Iris (*setosa*, *versicolor*, *virginica*), đóng gói thành
REST API bằng FastAPI, chạy trong Docker sau nginx có HTTPS.

**Đang chạy tại:** https://iris.iamaris.vip — [Swagger UI](https://iris.iamaris.vip/docs)

## Kết quả mô hình

| Chỉ số | Giá trị |
|--------|---------|
| Cấu hình tốt nhất | `kernel=linear`, `C=0.1` (chọn từ 64 cấu hình bằng GridSearchCV) |
| Accuracy tập kiểm tra | 93.33% |
| Cross-validation (5-fold) | 95.33% ± 3.40% |
| Macro F1 | 93.33% |
| Vector hỗ trợ | 56 / 120 mẫu huấn luyện |

Số liệu đầy đủ nằm trong `model/metrics.json` và endpoint `/metrics`.

## Chạy lại từ đầu trên máy trắng

```powershell
# 1. Môi trường
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r da1\requirements-dev.txt

# 2. Huấn luyện (tự tải dữ liệu Kaggle bằng kagglehub, không cần đăng nhập)
cd da1
python train.py

# 3. Kiểm thử
python -m pytest tests -v

# 4. Chạy API cục bộ
uvicorn app:app --reload        # http://127.0.0.1:8000/docs
```

`train.py` sinh ra `model/svm_model.pkl`, `model/metrics.json` và 8 hình trong `figures/`.

## Triển khai lên VPS

```bash
bash deploy.sh          # đồng bộ mã + build image + khởi động container + kiểm tra health
bash deploy.sh --logs   # xem log
bash deploy.sh --down   # gỡ sạch toàn bộ stack
```

Cấu hình nginx nằm ở `nginx/da1-iris-svm.conf`; HTTPS cấp bằng `certbot --nginx -d iris.iamaris.vip`.

## Các endpoint

| Method | Đường dẫn | Chức năng |
|--------|-----------|-----------|
| GET | `/` | Giao diện web |
| GET | `/health` | Trạng thái dịch vụ (dùng cho HEALTHCHECK và nginx) |
| GET | `/species` | Thông tin 3 loài hoa kèm ảnh |
| GET | `/metrics` | Số liệu đánh giá của mô hình đang chạy |
| GET | `/docs` | Swagger UI |
| POST | `/predict` | Dự đoán loài hoa từ 4 kích thước |

```bash
curl -X POST "https://iris.iamaris.vip/predict" \
  -H "Content-Type: application/json" \
  -d '{"sepal_length":5.1,"sepal_width":3.5,"petal_length":1.4,"petal_width":0.2}'
```

## Cấu trúc thư mục

```
da1/
├── train.py              # huấn luyện + đánh giá + sinh metrics.json
├── data_loader.py        # nạp dữ liệu Kaggle (kagglehub), fallback sklearn
├── figures.py            # sinh 8 hình cho báo cáo
├── app.py                # API FastAPI
├── species.py            # thông tin 3 loài + nguồn ảnh
├── model/                # svm_model.pkl + metrics.json  (phải commit)
├── static/               # giao diện web + ảnh 3 loài
├── tests/test_api.py     # 10 kiểm thử pytest
├── figures/              # hình PNG cho tài liệu LaTeX
├── Dockerfile, docker-compose.yml, deploy.sh, nginx/
└── Procfile, render.yaml # cấu hình dự phòng cho Render
```

## Ghi chú kỹ thuật

- **Chuẩn hoá nằm trong pipeline** (`StandardScaler` → `SVC`) nên API không phải tự tiền xử lý
  và không có rò rỉ dữ liệu giữa các fold khi kiểm định chéo.
- **Xác suất** lấy từ `CalibratedClassifierCV` (Platt scaling) thay cho
  `SVC(probability=True)` đã bị deprecated ở scikit-learn 1.9. Bản hiệu chuẩn cho dự đoán
  trùng 100% với SVC gốc trên tập kiểm tra.
- **Phiên bản thư viện được khoá chính xác** trong `requirements.txt`; phiên bản scikit-learn
  khi chạy phải trùng lúc huấn luyện, nếu không tệp `.pkl` sẽ cảnh báo hoặc lỗi.
- **Dữ liệu Kaggle và scikit-learn lệch nhau 2 dòng** (35 và 38) do lỗi sao chép trong kho UCI;
  chi tiết trong `model/metrics.json → data.source_comparison`.

Ảnh minh hoạ: xem `static/images/IMAGE_CREDITS.md` (Public domain / CC BY-SA, có ghi công tác giả).
