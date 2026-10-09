#!/bin/zsh
# tcb CLI 包装脚本
#
# 约束：所有 Node 工具链都在 conda env 内，不做全局安装。
# 直接调用 env 内的 node 执行 tcb，避免 PATH 解析到别的 node。
#
# 环境定位顺序：
#   1. $CONDA_PREFIX（当前已激活的 conda 环境）
#   2. PATH 里的 tcb
#   3. 常见 miniforge / miniconda 安装位置下的 spec-list 环境
#
# 用法：./scripts/tcb.sh env list
#    ./scripts/tcb.sh hosting deploy ./dist -e <envId>
#    ./scripts/tcb.sh fn deploy aiGen --dir ./cloudfunctions/aiGen --path /aiGen --force

set -e

cd "$(dirname "$0")/.."

# envId：优先取 .env，取不到用仓库里记录的默认值
ENV_ID="wechat-program-d8gbjr6963d3c1a0b"
if [[ -f .env ]]; then
  from_env=$(grep -E '^VITE_ENV_ID=' .env | tail -1 | cut -d= -f2- | tr -d '\r')
  if [[ -n "$from_env" ]]; then
    ENV_ID="$from_env"
  fi
fi

NODE_BIN=""
TCB_ENTRY=""

# 1) 当前激活的 conda 环境
if [[ -n "${CONDA_PREFIX:-}" && -x "$CONDA_PREFIX/bin/node" ]]; then
  NODE_BIN="$CONDA_PREFIX/bin/node"
  TCB_ENTRY="$CONDA_PREFIX/lib/node_modules/@cloudbase/cli/bin/tcb"
fi

# 2) PATH 里的 tcb
if [[ -z "$NODE_BIN" ]] && command -v tcb >/dev/null 2>&1; then
  exec tcb "$@"
fi

# 3) 常见位置下的 spec-list 环境
if [[ -z "$NODE_BIN" ]]; then
  for candidate in \
    "$HOME/miniforge3/envs/spec-list" \
    "$HOME/miniconda3/envs/spec-list" \
    "/opt/homebrew/Caskroom/miniforge/base/envs/spec-list" \
    "/opt/miniforge3/envs/spec-list"
  do
    if [[ -x "$candidate/bin/node" ]]; then
      NODE_BIN="$candidate/bin/node"
      TCB_ENTRY="$candidate/lib/node_modules/@cloudbase/cli/bin/tcb"
      break
    fi
  done
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "错误：未找到 conda env 内的 node。" >&2
  echo "请先执行（示例）：" >&2
  echo "  conda create -n ai-inspiration-wall nodejs=20 -c conda-forge -y" >&2
  echo "  conda activate ai-inspiration-wall" >&2
  echo "  npm install -g @cloudbase/cli" >&2
  exit 1
fi

if [[ ! -f "$TCB_ENTRY" ]]; then
  echo "错误：未在该环境内找到 @cloudbase/cli：$TCB_ENTRY" >&2
  echo "请先执行：npm install -g @cloudbase/cli" >&2
  exit 1
fi

# 仅对需要指定环境的子命令自动补 -e <envId>，其余命令原样透传
args=("$@")
if [[ ${#args[@]} -gt 0 && -n "$ENV_ID" ]]; then
  case "${args[1]}" in
    hosting|fn|storage|service)
      has_env=0
      for a in "${args[@]}"; do
        [[ "$a" == "-e" || "$a" == "--envId" ]] && has_env=1
      done
      if [[ $has_env -eq 0 ]]; then
        args+=("-e" "$ENV_ID")
      fi
      ;;
  esac
fi

exec "$NODE_BIN" "$TCB_ENTRY" "${args[@]}"
