# Image chạy API Iris SVM trên VPS.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Cài phụ thuộc trước để tận dụng cache của Docker khi chỉ sửa mã nguồn.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Mã nguồn API + mô hình đã huấn luyện + giao diện web.
COPY app.py species.py ./
COPY model/ ./model/
COPY static/ ./static/

# Chạy bằng người dùng thường, không dùng root.
RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
