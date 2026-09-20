#!/usr/bin/env bash
# One-shot bootstrap: create the virtualenv, install dependencies, start the API.
#
#   bash run.sh          serve the API on http://127.0.0.1:8000
#   bash run.sh train     install dev dependencies, retrain the model, redraw figures
#
# Works in Git Bash / WSL on Windows and in any POSIX shell on Linux or macOS.

set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-serve}"
PORT="${PORT:-8000}"
VENV=".venv"

say() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[31mLỖI: %s\033[0m\n' "$1" >&2; exit 1; }

# --- 1. Locate a Python interpreter -------------------------------------------
# On Windows the `py` launcher is the reliable one; a bare `python` may be the
# Microsoft Store stub that exits without doing anything.
PY=""
for candidate in "py -3" python3 python; do
  if $candidate -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >/dev/null 2>&1; then
    PY="$candidate"
    break
  fi
done
[ -n "$PY" ] || die "Không tìm thấy Python 3.10+. Cài tại https://www.python.org/downloads/ và nhớ tích 'Add python.exe to PATH'."

# --- 2. Create the virtualenv on first run ------------------------------------
if [ ! -d "$VENV" ]; then
  say "Tạo môi trường ảo .venv (chỉ lần đầu)"
  $PY -m venv "$VENV"
fi

# Windows venvs put the interpreter in Scripts/, POSIX ones in bin/.
if [ -x "$VENV/Scripts/python.exe" ]; then
  VPY="$VENV/Scripts/python.exe"
elif [ -x "$VENV/bin/python" ]; then
  VPY="$VENV/bin/python"
else
  die "Môi trường ảo hỏng. Xoá thư mục .venv rồi chạy lại lệnh này."
fi

# --- 3. Install dependencies ---------------------------------------------------
if [ "$MODE" = "train" ]; then
  say "Cài thư viện huấn luyện (requirements-dev.txt)"
  "$VPY" -m pip install --quiet --upgrade pip
  "$VPY" -m pip install --quiet -r requirements-dev.txt
  say "Huấn luyện lại mô hình"
  "$VPY" train.py
  say "Vẽ lại hình cho báo cáo"
  "$VPY" figures.py
  say "Xong. Chạy 'bash run.sh' để khởi động dịch vụ."
  exit 0
fi

say "Cài thư viện cho API (requirements.txt)"
"$VPY" -m pip install --quiet --upgrade pip
"$VPY" -m pip install --quiet -r requirements.txt

[ -f svm_model.pkl ] || die "Thiếu svm_model.pkl. Chạy 'bash run.sh train' để huấn luyện lại."

# --- 4. Serve ------------------------------------------------------------------
say "Khởi động API tại http://127.0.0.1:$PORT  (Ctrl+C để dừng)"
printf '    Giao diện web : http://127.0.0.1:%s/\n' "$PORT"
printf '    Swagger UI    : http://127.0.0.1:%s/docs\n\n' "$PORT"

# Open the browser once the server is actually listening.
("$VPY" - "$PORT" <<'PYEOF' &
import socket, sys, time, webbrowser
port = int(sys.argv[1])
for _ in range(60):
    with socket.socket() as s:
        if s.connect_ex(("127.0.0.1", port)) == 0:
            webbrowser.open(f"http://127.0.0.1:{port}/")
            break
    time.sleep(0.5)
PYEOF
) >/dev/null 2>&1

exec "$VPY" -m uvicorn app:app --host 127.0.0.1 --port "$PORT" --reload
