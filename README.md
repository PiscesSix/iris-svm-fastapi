# iris-fastapi — API phân loại hoa Iris bằng SVM

Mô hình SVM phân loại ba loài hoa Iris (*setosa*, *versicolor*, *virginica*), đóng gói thành
REST API bằng FastAPI và triển khai trực tuyến trên **Render**.

**URL công khai:** `https://<ten-service>.onrender.com` — cập nhật lại sau khi tạo service trên Render.

## Kết quả mô hình

| Chỉ số | Giá trị |
|--------|---------|
| Cấu hình tốt nhất | `kernel=linear`, `C=0.1` (chọn từ 64 cấu hình bằng GridSearchCV) |
| Accuracy tập kiểm tra | 93.33% |
| Cross-validation (5-fold) | 95.33% ± 3.40% |
| Macro F1 | 93.33% |
| Vector hỗ trợ | 56 / 120 mẫu huấn luyện |

Số liệu đầy đủ nằm trong `metrics.json` và endpoint `/metrics`.

## Chạy lại từ đầu trên máy trắng

```powershell
# 1. Môi trường
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r iris-fastapi\requirements-dev.txt

# 2. Huấn luyện (tự tải dữ liệu Kaggle bằng kagglehub, không cần đăng nhập)
cd iris-fastapi
python train.py

# 3. Kiểm thử
python -m pytest tests -v

# 4. Chạy API cục bộ
uvicorn app:app --reload        # http://127.0.0.1:8000/docs
```

`train.py` sinh ra `svm_model.pkl` và `metrics.json`; `python figures.py` sinh 8 hình PNG
trong `figures/` cho tài liệu LaTeX (thư mục này **không** được commit — xem `.gitignore`).

## Triển khai lên Render

1. Push thư mục này lên một repo GitHub (đã có `.git` sẵn, remote `origin`).
2. Trên https://render.com → **New +** → **Web Service** → chọn repo.
3. Render tự đọc `render.yaml`; nếu điền tay thì dùng:
   - Runtime: **Python 3**
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
   - Health Check Path: `/health`
   - Instance Type: **Free**
4. Bấm **Create Web Service**, chờ build ~2–4 phút, lấy URL `https://<ten-service>.onrender.com`.

**Lưu ý gói Free:** service **ngủ sau ~15 phút** không có request; request đầu tiên sau đó mất
30–60 giây để đánh thức. Trước khi demo phải mở URL trước một lần.

**Bắt buộc:** `svm_model.pkl` phải được commit lên GitHub (`.gitignore` không bỏ qua tệp này),
nếu không Render sẽ báo `FileNotFoundError` lúc khởi động.

## Các endpoint

| Method | Đường dẫn | Chức năng |
|--------|-----------|-----------|
| GET | `/` | Giao diện web |
| GET | `/health` | Trạng thái dịch vụ (Render dùng làm health check) |
| GET | `/species` | Thông tin 3 loài hoa kèm ảnh |
| GET | `/metrics` | Số liệu đánh giá của mô hình đang chạy |
| GET | `/docs` | Swagger UI |
| POST | `/predict` | Dự đoán loài hoa từ 4 kích thước |

```bash
curl -X POST "https://<ten-service>.onrender.com/predict" \
  -H "Content-Type: application/json" \
  -d '{"sepal_length":5.1,"sepal_width":3.5,"petal_length":1.4,"petal_width":0.2}'
```

## Cấu trúc thư mục

```
iris-fastapi/
├── app.py                # API FastAPI
├── train.py              # huấn luyện + đánh giá + sinh metrics.json
├── data_loader.py        # nạp dữ liệu Kaggle (kagglehub), fallback sklearn
├── figures.py            # sinh 8 hình cho báo cáo
├── species.py            # thông tin 3 loài + nguồn ảnh
├── svm_model.pkl         # mô hình đã huấn luyện (PHẢI commit)
├── metrics.json          # toàn bộ số liệu đánh giá
├── requirements.txt      # phụ thuộc lúc chạy API (Render cài tệp này)
├── requirements-dev.txt  # thêm phụ thuộc để huấn luyện / vẽ hình / kiểm thử
├── render.yaml           # cấu hình dịch vụ Render
├── Procfile              # lệnh khởi động
├── data/Iris.csv         # dữ liệu Kaggle uciml/iris
├── static/               # giao diện web + ảnh 3 loài
└── tests/test_api.py     # 10 kiểm thử pytest
```

Repo chỉ chứa mã nguồn, mô hình và tài nguyên mà dịch vụ cần lúc chạy. Hình cho tài liệu
LaTeX (`figures/`) chỉ giữ ở máy và tái tạo được bằng `python figures.py`.

## Ghi chú kỹ thuật

- **Chuẩn hoá nằm trong pipeline** (`StandardScaler` → `SVC`) nên API không phải tự tiền xử lý
  và không có rò rỉ dữ liệu giữa các fold khi kiểm định chéo.
- **Xác suất** lấy từ `CalibratedClassifierCV` (Platt scaling) thay cho
  `SVC(probability=True)` đã bị deprecated ở scikit-learn 1.9. Bản hiệu chuẩn cho dự đoán
  trùng 100% với SVC gốc trên tập kiểm tra.
- **Phiên bản thư viện được khoá chính xác** trong `requirements.txt`; phiên bản scikit-learn
  khi chạy phải trùng lúc huấn luyện, nếu không tệp `.pkl` sẽ cảnh báo hoặc lỗi.
- **Dữ liệu Kaggle và scikit-learn lệch nhau 2 dòng** (35 và 38) do lỗi sao chép trong kho UCI;
  chi tiết trong `metrics.json → data.source_comparison`.

Ảnh minh hoạ: xem `static/images/IMAGE_CREDITS.md` (Public domain / CC BY-SA, có ghi công tác giả).
