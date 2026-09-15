#!/usr/bin/env bash
# Triển khai API Iris SVM lên VPS bằng Docker Compose.
#
# Dùng:  bash deploy.sh              (đồng bộ mã nguồn + build + khởi động)
#        bash deploy.sh --logs       (xem log container)
#        bash deploy.sh --down       (dừng và gỡ sạch stack)
#
# Chạy được từ Git Bash trên Windows (chỉ cần ssh + tar, không cần rsync).

set -euo pipefail

VPS_HOST="${VPS_HOST:-root@46.62.237.223}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/tri_ecom_vps}"
REMOTE_DIR="${REMOTE_DIR:-/opt/da1-iris-svm}"
SERVICE="da1-iris-svm"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssh_vps() { ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$VPS_HOST" "$@"; }

case "${1:-deploy}" in
  --logs)
    ssh_vps "cd $REMOTE_DIR && docker compose logs --tail=80 -f"
    exit 0
    ;;
  --down)
    echo ">> Gỡ stack $SERVICE khỏi VPS"
    ssh_vps "cd $REMOTE_DIR && docker compose down --rmi all -v && cd / && rm -rf $REMOTE_DIR"
    echo ">> Đã gỡ. Nhớ xoá thêm cấu hình nginx nếu không dùng nữa:"
    echo "   rm /etc/nginx/sites-enabled/$SERVICE /etc/nginx/sites-available/$SERVICE && systemctl reload nginx"
    exit 0
    ;;
esac

if [ ! -f "$LOCAL_DIR/model/svm_model.pkl" ]; then
  echo "LỖI: chưa có model/svm_model.pkl — chạy 'python train.py' trước." >&2
  exit 1
fi

echo ">> 1/4 Đồng bộ mã nguồn lên $VPS_HOST:$REMOTE_DIR"
ssh_vps "mkdir -p $REMOTE_DIR"
tar czf - -C "$LOCAL_DIR" \
    --exclude='__pycache__' --exclude='.pytest_cache' --exclude='figures' \
    --exclude='data' --exclude='.venv' \
    app.py species.py requirements.txt Dockerfile docker-compose.yml model static \
  | ssh_vps "tar xzf - -C $REMOTE_DIR"

echo ">> 2/4 Build image và khởi động container"
ssh_vps "cd $REMOTE_DIR && docker compose up -d --build"

echo ">> 3/4 Chờ health check"
for i in $(seq 1 20); do
  status="$(ssh_vps "docker inspect -f '{{.State.Health.Status}}' $SERVICE 2>/dev/null || echo missing")"
  echo "   [$i/20] trạng thái: $status"
  [ "$status" = "healthy" ] && break
  sleep 3
done

echo ">> 4/4 Kiểm tra endpoint nội bộ"
ssh_vps "curl -fsS http://127.0.0.1:8101/health && echo && curl -fsS -X POST http://127.0.0.1:8101/predict \
  -H 'Content-Type: application/json' \
  -d '{\"sepal_length\":5.1,\"sepal_width\":3.5,\"petal_length\":1.4,\"petal_width\":0.2}'"

echo
echo ">> Xong. Công khai qua nginx: http://iris.iamaris.vip"
