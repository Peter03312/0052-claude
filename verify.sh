#!/usr/bin/env bash
# 一次性验收的 shell 入口（实际逻辑在跨平台的 verify.mjs 中）。
# 用法：./verify.sh
set -euo pipefail
cd "$(dirname "$0")"
node verify.mjs
