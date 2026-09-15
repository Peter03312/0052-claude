#!/usr/bin/env bash
# 一次性验收：类型检查 → 单元测试 → 生产构建 → 首页冒烟。
# 用法：./verify.sh
set -euo pipefail

cd "$(dirname "$0")"

echo "==> 1/4 TypeScript 类型检查"
npx tsc --noEmit

echo "==> 2/4 Vitest 单元测试"
npx vitest run

echo "==> 3/4 生产构建"
npm run build

echo "==> 4/4 首页冒烟（静态服务器 + HTTP 探测）"
PORT="${SMOKE_PORT:-4180}"
npx vite preview --host 127.0.0.1 --port "$PORT" --strictPort >/tmp/psc-preview.log 2>&1 &
PID=$!
cleanup() { kill "$PID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

ok=""
for _ in $(seq 1 40); do
  if code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/" 2>/dev/null); then
    if [ "$code" = "200" ]; then ok=1; break; fi
  fi
  sleep 0.5
done

if [ -z "$ok" ]; then
  echo "首页冒烟失败：服务器没有在预期时间内返回 200"
  cat /tmp/psc-preview.log
  exit 1
fi

# 再确认构建产物确实是纯静态（入口 HTML 引用了本地资源）
body=$(curl -s "http://127.0.0.1:$PORT/")
echo "$body" | grep -q 'id="app"'
echo "$body" | grep -qE 'src="\./assets/[^"]+\.js"'
if echo "$body" | grep -qiE 'https?://[^"]*(googleapis|gstatic|cdn|analytics)'; then
  echo "首页引用了外部资源，违反离线要求"
  exit 1
fi

echo "✅ verify 全部通过：类型、单测、构建、首页冒烟"
