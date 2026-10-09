#!/usr/bin/env bash
#
# 新机器一键初始化
#
# 前置条件：已安装 conda，并已创建/激活含 Node 20 的环境，例如
#   conda create -n ai-inspiration-wall nodejs=20 -c conda-forge -y
#   conda activate ai-inspiration-wall
#
# 用法：./scripts/setup.sh
# 也可：npm run setup

set -euo pipefail

cd "$(dirname "$0")/.."

echo "== 1/4 检查 Node =="
if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 node。" >&2
  echo "请先创建并激活 conda 环境（本项目不做 Node 全局安装）：" >&2
  echo "  conda create -n ai-inspiration-wall nodejs=20 -c conda-forge -y" >&2
  echo "  conda activate ai-inspiration-wall" >&2
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "错误：node 需要 ≥ 18，当前为 $(node -v)" >&2
  exit 1
fi
echo "node $(node -v) / npm $(npm -v)"

echo "== 2/4 安装前端依赖（npm ci，锁定版本）=="
npm ci

echo "== 3/4 安装云函数依赖（genCard / aiGen）=="
# 云端不装依赖（--install-dependency false），必须随代码包一起上传本地 node_modules
# 直连安装，避开环境里漂移端口的本地代理（否则容易 connection refused）
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
  npm --prefix cloudfunctions/genCard install
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
  npm --prefix cloudfunctions/aiGen install

echo "== 4/4 准备 .env =="
if [ -f .env ]; then
  echo ".env 已存在，跳过"
else
  cp .env.example .env
  echo "已由 .env.example 生成 .env —— 请填入 VITE_ENV_ID 与 VITE_ACCESS_KEY"
fi

echo
echo "完成。下一步："
echo "  npm run dev            # 本地开发 http://localhost:5173"
echo "  npm test               # 单元测试"
