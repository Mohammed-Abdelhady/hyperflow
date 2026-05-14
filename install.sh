#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/Mohammed-Abdelhady/hyperflow.git"
INSTALL_DIR="${HYPERFLOW_HOME:-$HOME/.hyperflow/repo}"
SKILL_DIR="skills/hyperflow"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { printf "${GREEN}%s${RESET} %s\n" ">" "$1"; }
warn()  { printf "${YELLOW}%s${RESET} %s\n" "!" "$1"; }
step()  { printf "${DIM}%s${RESET}\n" "$1"; }

PROVIDERS=()
PROVIDER_PATHS=()

detect_providers() {
  local name path
  declare -A candidates=(
    ["Cursor"]="$HOME/.cursor/skills"
    ["OpenCode"]="$HOME/.opencode/skills"
    ["Antigravity"]="$HOME/.antigravity/skills"
  )

  for name in Cursor OpenCode Antigravity; do
    path="${candidates[$name]}"
    parent="$(dirname "$path")"
    if [ -d "$parent" ]; then
      PROVIDERS+=("$name")
      PROVIDER_PATHS+=("$path")
    fi
  done
}

clone_or_update() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    info "Updating existing installation..."
    git -C "$INSTALL_DIR" pull --ff-only --quiet
  else
    info "Cloning Hyperflow..."
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --quiet "$REPO_URL" "$INSTALL_DIR"
  fi
}

link_provider() {
  local name="$1" skills_dir="$2"
  local target="$skills_dir/hyperflow"
  local source="$INSTALL_DIR/$SKILL_DIR"

  mkdir -p "$skills_dir"

  if [ -L "$target" ]; then
    local current
    current="$(readlink "$target")"
    if [ "$current" = "$source" ]; then
      step "  $name — already linked"
      return
    fi
    rm "$target"
  elif [ -d "$target" ]; then
    warn "$name — found existing directory at $target"
    warn "  Backing up to ${target}.bak and replacing with symlink"
    mv "$target" "${target}.bak"
  fi

  ln -s "$source" "$target"
  info "$name — linked"
}

print_summary() {
  echo ""
  printf "${BOLD}Hyperflow installed${RESET}\n"
  echo ""
  step "Location: $INSTALL_DIR"
  step "Update:   git -C $INSTALL_DIR pull"
  echo ""

  if [ ${#PROVIDERS[@]} -gt 0 ]; then
    step "Linked providers:"
    for i in "${!PROVIDERS[@]}"; do
      step "  ${PROVIDERS[$i]} → ${PROVIDER_PATHS[$i]}/hyperflow"
    done
  fi

  echo ""
  step "Claude Code users: use 'claude plugin add Mohammed-Abdelhady/hyperflow' instead."
  echo ""
}

main() {
  echo ""
  printf "${BOLD}Hyperflow Installer${RESET}\n"
  echo ""

  detect_providers

  if [ ${#PROVIDERS[@]} -eq 0 ]; then
    warn "No supported providers detected (Cursor, OpenCode, Antigravity)."
    warn "Claude Code users should run: claude plugin add Mohammed-Abdelhady/hyperflow"
    echo ""
    printf "Install anyway to ${DIM}$INSTALL_DIR${RESET}? [y/N] "
    read -r answer
    if [[ ! "$answer" =~ ^[Yy]$ ]]; then
      echo "Aborted."
      exit 0
    fi
  else
    info "Detected: ${PROVIDERS[*]}"
  fi

  clone_or_update

  for i in "${!PROVIDERS[@]}"; do
    link_provider "${PROVIDERS[$i]}" "${PROVIDER_PATHS[$i]}"
  done

  print_summary
}

main "$@"
