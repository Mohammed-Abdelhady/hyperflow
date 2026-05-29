#!/usr/bin/env bash
# Outer braces force bash to read the entire script before executing (required for curl|bash)
{
set -euo pipefail

REPO_URL="https://github.com/Mohammed-Abdelhady/hyperflow.git"
INSTALL_DIR="${HYPERFLOW_HOME:-$HOME/.hyperflow/repo}"
CONFIG_FILE="$HOME/.hyperflow/config.json"
SKILL_DIR="skills/hyperflow"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { printf "${GREEN}%s${RESET} %s\n" ">" "$1"; }
warn()    { printf "${YELLOW}%s${RESET} %s\n" "!" "$1"; }
step()    { printf "${DIM}%s${RESET}\n" "$1"; }
header()  { printf "\n${BOLD}%s${RESET}\n\n" "$1"; }
option()  { printf "  ${CYAN}[%s]${RESET} %s" "$1" "$2"; [ -n "${3:-}" ] && printf " ${DIM}%s${RESET}" "$3"; echo; }

PROVIDERS=()
PROVIDER_PATHS=()
PROVIDER_KEYS=()

SELECTED_THINKING=""
SELECTED_WORKER=""
SECURITY_ENABLED="true"

# ─── Provider Detection ───

detect_providers() {
  local name path key
  local -a names=("Claude Code" "OpenCode" "Codex")
  local -a paths=("$HOME/.claude/skills" "$HOME/.opencode/skills" "$HOME/.codex/plugins")
  local -a keys=("claude-code" "opencode" "codex")

  for i in "${!names[@]}"; do
    name="${names[$i]}"
    path="${paths[$i]}"
    key="${keys[$i]}"
    parent="$(dirname "$path")"
    if [ -d "$parent" ]; then
      PROVIDERS+=("$name")
      PROVIDER_PATHS+=("$path")
      PROVIDER_KEYS+=("$key")
    fi
  done

  # Antigravity migrated its config from ~/.antigravity to ~/.gemini/config.
  # Prefer the live (migrated) skills dir; fall back to the legacy one.
  local ag_skills=""
  if [ -d "$HOME/.gemini/config" ]; then
    ag_skills="$HOME/.gemini/config/skills"
  elif [ -d "$HOME/.antigravity" ]; then
    ag_skills="$HOME/.antigravity/skills"
  fi
  if [ -n "$ag_skills" ]; then
    PROVIDERS+=("Antigravity")
    PROVIDER_PATHS+=("$ag_skills")
    PROVIDER_KEYS+=("antigravity")
  fi
}

# ─── Prompt Helpers ───

pick_one() {
  local prompt="$1"
  shift
  local options=("$@")
  local count=${#options[@]}

  printf "${BOLD}%s${RESET}\n" "$prompt"
  echo ""

  for i in "${!options[@]}"; do
    local num=$((i + 1))
    local entry="${options[$i]}"
    local label="${entry%%|*}"
    local desc="${entry#*|}"
    if [ "$label" = "$desc" ]; then
      option "$num" "$label"
    else
      option "$num" "$label" "$desc"
    fi
  done

  echo ""
  while true; do
    printf "  Choice [1]: "
    read -r choice </dev/tty
    choice="${choice:-1}"
    if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "$count" ]; then
      PICK_INDEX=$((choice - 1))
      return
    fi
    printf "  ${YELLOW}Enter 1-%d${RESET}\n" "$count"
  done
}

pick_yes_no() {
  local prompt="$1" default="${2:-y}"
  local hint="Y/n"
  [ "$default" = "n" ] && hint="y/N"

  printf "${BOLD}%s${RESET} [%s]: " "$prompt" "$hint"
  read -r answer </dev/tty
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy]$ ]]
}

# ─── Clone / Update ───

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

# ─── Link Provider ───

link_provider() {
  local name="$1" skills_dir="$2"

  if [ "$name" = "Claude Code" ]; then
    if [ -d "$skills_dir/hyperflow" ] || [ -L "$skills_dir/hyperflow" ]; then
      step "  Claude Code — skill already installed"
    else
      step "  Claude Code — run 'claude plugin install hyperflow@hyperflow-marketplace' to install"
    fi
    return
  fi

  if [ "$name" = "Codex" ]; then
    step "  Codex — run 'codex plugin marketplace add Mohammed-Abdelhady/hyperflow' and 'codex plugin add hyperflow@hyperflow-marketplace' to install"
    return
  fi

  # Antigravity uses a flat skills dir (one dir per skill with SKILL.md) and cannot
  # load the multi-agent Claude plugin tree. Link the single-agent-adapted skill set.
  if [ "$name" = "Antigravity" ]; then
    local ag_src="$INSTALL_DIR/templates/antigravity/skills"
    if [ ! -d "$ag_src" ]; then
      warn "Antigravity — adapted skills not found at $ag_src (update your clone)"
      return
    fi
    mkdir -p "$skills_dir"
    local linked=0 skill_path sname stgt
    for skill_path in "$ag_src"/*/; do
      [ -d "$skill_path" ] || continue
      sname="$(basename "$skill_path")"
      stgt="$skills_dir/$sname"
      if [ -L "$stgt" ]; then
        rm "$stgt"
      elif [ -d "$stgt" ]; then
        mv "$stgt" "${stgt}.bak"
      fi
      ln -s "${skill_path%/}" "$stgt"
      linked=$((linked + 1))
    done
    info "Antigravity — linked $linked skills into $skills_dir"
    step "  Slash commands: run scripts/setup-detection.sh --tools antigravity <project> to add .agent/workflows/hyperflow*"
    return
  fi

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

# ─── Model Selection ───

configure_models_claude_code() {
  header "Model Configuration — Claude Code"

  pick_one "Thinking model (orchestrator, reviewer, debugger):" \
    "Opus 4.8|Latest Opus — Hyperflow default" \
    "Opus 4.7|Previous Opus" \
    "Opus 4.6|Legacy Opus" \
    "Sonnet 4.6|Cost savings — less capable for review"
  local thinking_options=("opus-4-8" "opus-4-7" "opus-4-6" "sonnet-4-6")
  SELECTED_THINKING="${thinking_options[$PICK_INDEX]}"

  echo ""

  pick_one "Worker model (implementer, searcher, writer):" \
    "Sonnet 4.6|Latest Sonnet — Hyperflow default" \
    "Haiku 4.5|Fast and cheap for simple tasks"
  local worker_options=("sonnet-4-6" "haiku-4-5")
  SELECTED_WORKER="${worker_options[$PICK_INDEX]}"
}

configure_models_opencode() {
  header "Model Configuration — OpenCode"

  pick_one "Thinking model (orchestrator, reviewer, debugger):" \
    "Claude Opus 4.8|Hyperflow default" \
    "Claude Opus 4.7|Previous Opus" \
    "Claude Opus 4.6|Legacy Opus" \
    "GPT-5.5|Latest GPT" \
    "Gemini 3.1 Pro|2M context window"
  local thinking_options=("anthropic/claude-opus-4-8" "anthropic/claude-opus-4-7" "anthropic/claude-opus-4-6" "openai/gpt-5.5" "google-vertex-ai/gemini-3.1-pro")
  SELECTED_THINKING="${thinking_options[$PICK_INDEX]}"

  echo ""

  pick_one "Worker model (implementer, searcher, writer):" \
    "Claude Sonnet 4.6|Hyperflow default" \
    "Claude Haiku 4.5|Fast and cheap" \
    "GPT-5.4 Mini|Cost-efficient" \
    "Gemini 3 Flash|Fast and cheap"
  local worker_options=("anthropic/claude-sonnet-4-6" "anthropic/claude-haiku-4-5" "openai/gpt-5.4-mini" "google-vertex-ai/gemini-3-flash")
  SELECTED_WORKER="${worker_options[$PICK_INDEX]}"
}

configure_models_antigravity() {
  header "Model Configuration — Antigravity"
  step "Antigravity selects its model in the IDE model picker (Gemini or Claude)."
  step "Hyperflow's thinking/worker tier split does not apply — the single agent runs"
  step "every phase itself. No model config is needed here."
  SELECTED_THINKING="ide-managed"
  SELECTED_WORKER="ide-managed"
}

configure_models_codex() {
  header "Model Configuration — Codex"
  step "Codex uses GPT-5.5 for thinking roles with task-adaptive reasoning."
  step "Worker roles use GPT-5.4 in fast mode (low reasoning)."
  step "Reasoning never defaults to xhigh."
  SELECTED_THINKING="gpt-5.5"
  SELECTED_WORKER="gpt-5.4"
}

# ─── Security ───

configure_security() {
  header "Security"

  step "Hyperflow's security layer prevents workers from:"
  step "  - Accessing sensitive files (.env, *.pem, ~/.ssh/*, ...)"
  step "  - Running dangerous commands (rm -rf, sudo, force push, ...)"
  step "  - Hardcoding secrets in source code"
  echo ""

  if pick_yes_no "Enable security layer?" "y"; then
    SECURITY_ENABLED="true"
    info "Security enabled"
  else
    SECURITY_ENABLED="false"
    warn "Security disabled — workers have no containment"
  fi
}

# ─── Write Config ───

write_config() {
  local provider_key="${1:-}"

  mkdir -p "$HOME/.hyperflow"

  if [ -f "$CONFIG_FILE" ]; then
    if ! pick_yes_no "Config already exists at $CONFIG_FILE. Overwrite?" "n"; then
      step "Keeping existing config"
      return
    fi
  fi

  local providers_csv=""
  if [ "${#PROVIDER_KEYS[@]}" -gt 0 ]; then
    providers_csv="$(IFS=,; echo "${PROVIDER_KEYS[*]}")"
  fi

  python3 - "$CONFIG_FILE" "$provider_key" "$SELECTED_THINKING" "$SELECTED_WORKER" "$SECURITY_ENABLED" "$providers_csv" "$INSTALL_DIR" <<'PYEOF'
import json, os, sys
config_path, active, sel_think, sel_worker, sec, prov_csv, install_dir = sys.argv[1:8]
keys = [k for k in prov_csv.split(",") if k]

defaults_path = os.path.join(install_dir, "config", "defaults.json")
try:
    with open(defaults_path) as f:
        defaults = json.load(f)
except Exception:
    defaults = {"providers": {}}

ROLES_THINKING = ["orchestrator", "reviewer", "debugger", "decision-maker", "brainstormer"]
ROLES_WORKER   = ["implementer", "searcher", "writer"]

def default_id(models):
    for m in models:
        if m.get("default"): return m["id"]
    return models[0]["id"] if models else ""

def ids(models): return [m["id"] for m in models]

provs = {}
for k in keys:
    pdef = defaults.get("providers", {}).get(k, {})
    m = pdef.get("models", {})
    t = default_id(m.get("thinking", []))
    w = default_id(m.get("worker", []))
    if k == active:
        if sel_think: t = sel_think
        if sel_worker: w = sel_worker
    roles = {r: t for r in ROLES_THINKING}
    roles.update({r: w for r in ROLES_WORKER})
    provider = {
        "thinking": t,
        "worker": w,
        "models": {
            "thinking": ids(m.get("thinking", [])),
            "worker":   ids(m.get("worker", [])),
        },
        "roles": roles,
    }
    reasoning = pdef.get("reasoning")
    if isinstance(reasoning, dict):
        provider["reasoning"] = reasoning
    provs[k] = provider

cfg = {}
if active:
    cfg["activeProvider"] = active
cfg["defaults"] = {"thinking": sel_think, "worker": sel_worker}
if provs:
    cfg["providers"] = provs
cfg["security"] = {"enabled": sec == "true"}
cfg["memory"]   = {"compactionThreshold": 300}
cfg["context"]  = {"windowTokens": 200000, "autoCompactMinPercent": 72}

with open(config_path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
PYEOF

  info "Config saved to $CONFIG_FILE"
}

# ─── Project Detection Setup ───

setup_project_detection() {
  # Skip if non-interactive
  if [[ "${INSTALL_NONINTERACTIVE:-0}" == "1" ]] || [[ "$-" != *i* && ! -t 0 ]]; then
    return
  fi

  echo ""
  if ! pick_yes_no "Would you like to add hyperflow auto-detection to a project? This creates files like AGENTS.md and CLAUDE.md so Codex, Claude Code, and OpenCode auto-load hyperflow in that project." "n"; then
    return
  fi

  printf "${BOLD}Project path${RESET} [%s]: " "$PWD"
  read -r project_path </dev/tty
  project_path="${project_path:-$PWD}"

  local detection_script="$INSTALL_DIR/scripts/setup-detection.sh"

  if [ ! -f "$detection_script" ]; then
    warn "setup-detection.sh not found at $detection_script"
    warn "Run manually: scripts/setup-detection.sh <project-path>"
    return
  fi

  bash "$detection_script" "$project_path"
}

# ─── Summary ───

print_summary() {
  header "Hyperflow installed"

  step "Config:    $CONFIG_FILE"

  local has_non_cc=false
  for i in "${!PROVIDERS[@]}"; do
    if [ "${PROVIDERS[$i]}" != "Claude Code" ]; then
      has_non_cc=true
      break
    fi
  done

  if [ "$has_non_cc" = true ]; then
    step "Location:  $INSTALL_DIR"
    step "Update:    git -C $INSTALL_DIR pull"
  fi
  echo ""

  if [ ${#PROVIDERS[@]} -gt 0 ]; then
    step "Providers:"
    for i in "${!PROVIDERS[@]}"; do
      if [ "${PROVIDERS[$i]}" = "Claude Code" ]; then
        step "  Claude Code — plugin (claude plugin install hyperflow@hyperflow-marketplace)"
      elif [ "${PROVIDERS[$i]}" = "Codex" ]; then
        step "  Codex — plugin (codex plugin add hyperflow@hyperflow-marketplace)"
      elif [ "${PROVIDERS[$i]}" = "Antigravity" ]; then
        step "  Antigravity — hyperflow* skills → ${PROVIDER_PATHS[$i]}"
      else
        step "  ${PROVIDERS[$i]} → ${PROVIDER_PATHS[$i]}/hyperflow"
      fi
    done
    echo ""
  fi

  step "Models:    thinking=$SELECTED_THINKING  worker=$SELECTED_WORKER"
  step "Security:  $( [ "$SECURITY_ENABLED" = "true" ] && echo "enabled" || echo "disabled" )"
  echo ""

  step "Change models mid-session:  hyperflow: thinking <model>"
  step "Toggle security:            hyperflow: security off/on"
  step "Re-run setup:               ~/.hyperflow/repo/install.sh"
  echo ""
}

# ─── Uninstall ───

uninstall() {
  header "Hyperflow Uninstaller"

  detect_providers

  local removed=0

  for i in "${!PROVIDERS[@]}"; do
    local name="${PROVIDERS[$i]}"
    local target="${PROVIDER_PATHS[$i]}/hyperflow"

    if [ "$name" = "Claude Code" ]; then
      step "  Claude Code — use 'claude plugin uninstall hyperflow@hyperflow-marketplace'"
      continue
    fi

    if [ "$name" = "Codex" ]; then
      step "  Codex — use 'codex plugin remove hyperflow@hyperflow-marketplace'"
      continue
    fi

    if [ "$name" = "Antigravity" ]; then
      local ag_removed=0 skill_path sname stgt
      for skill_path in "$INSTALL_DIR/templates/antigravity/skills"/*/; do
        [ -d "$skill_path" ] || continue
        sname="$(basename "$skill_path")"
        stgt="${PROVIDER_PATHS[$i]}/$sname"
        if [ -L "$stgt" ]; then rm "$stgt"; ag_removed=$((ag_removed + 1)); fi
      done
      if [ $ag_removed -gt 0 ]; then
        info "Antigravity — removed $ag_removed skill symlinks"
        removed=$((removed + 1))
      else
        step "  Antigravity — not installed, skipping"
      fi
      continue
    fi

    if [ -L "$target" ]; then
      local link_dest
      link_dest="$(readlink "$target")"
      if [[ "$link_dest" == *"$SKILL_DIR"* ]] || [[ "$link_dest" == *".hyperflow"* ]]; then
        rm "$target"
        info "$name — symlink removed"
        removed=$((removed + 1))
      else
        warn "$name — symlink points to $link_dest (not Hyperflow), skipping"
      fi
    elif [ -d "$target" ]; then
      warn "$name — found directory at $target (not a Hyperflow symlink), skipping"
    else
      step "  $name — not installed, skipping"
    fi
  done

  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    info "Removed $INSTALL_DIR"
    removed=$((removed + 1))
  fi

  if [ -f "$CONFIG_FILE" ]; then
    rm "$CONFIG_FILE"
    info "Removed $CONFIG_FILE"
    removed=$((removed + 1))
  fi

  if [ -d "$HOME/.hyperflow" ] && [ -z "$(ls -A "$HOME/.hyperflow")" ]; then
    rmdir "$HOME/.hyperflow"
    step "  Removed empty ~/.hyperflow/"
  fi

  echo ""
  if [ $removed -eq 0 ]; then
    step "Nothing to remove."
  else
    info "Hyperflow uninstalled"
    step "Project memory at .hyperflow/memory/ (per-project) was kept."
    step "Delete it manually if you want a clean slate."
  fi
  echo ""
}

# ─── Main ───

main() {
  case "${1:-}" in
    --uninstall) uninstall; exit 0 ;;
    --help|-h)
      echo "Usage: install.sh [--uninstall | --help]"
      echo ""
      echo "  (no args)     Install Hyperflow and run setup wizard"
      echo "  --uninstall   Remove Hyperflow from all providers"
      echo "  --help        Show this message"
      exit 0
      ;;
  esac

  if ! command -v git &>/dev/null; then
    warn "git is required but not installed."
    exit 1
  fi

  header "Hyperflow Installer"

  detect_providers

  if [ ${#PROVIDERS[@]} -eq 0 ]; then
    warn "No supported providers detected."
    echo ""
    if ! pick_yes_no "Run setup wizard anyway (config only)?" "n"; then
      echo "Aborted."
      exit 0
    fi
  else
    info "Detected: ${PROVIDERS[*]}"
  fi

  local needs_clone=false
  for i in "${!PROVIDERS[@]}"; do
    if [ "${PROVIDERS[$i]}" != "Claude Code" ]; then
      needs_clone=true
      break
    fi
  done

  if [ "$needs_clone" = true ]; then
    clone_or_update
  fi

  for i in "${!PROVIDERS[@]}"; do
    link_provider "${PROVIDERS[$i]}" "${PROVIDER_PATHS[$i]}"
  done

  local config_provider=""
  local config_provider_key=""

  if [ ${#PROVIDERS[@]} -eq 1 ]; then
    config_provider="${PROVIDERS[0]}"
    config_provider_key="${PROVIDER_KEYS[0]}"
  elif [ ${#PROVIDERS[@]} -gt 1 ]; then
    header "Setup"
    local provider_labels=()
    for i in "${!PROVIDERS[@]}"; do
      provider_labels+=("${PROVIDERS[$i]}|Configure models for this provider")
    done
    pick_one "Which provider is your primary?" "${provider_labels[@]}"
    config_provider="${PROVIDERS[$PICK_INDEX]}"
    config_provider_key="${PROVIDER_KEYS[$PICK_INDEX]}"
  fi

  case "$config_provider" in
    "Claude Code") configure_models_claude_code ;;
    OpenCode)      configure_models_opencode ;;
    Codex)         configure_models_codex ;;
    Antigravity)   configure_models_antigravity ;;
    *)             configure_models_claude_code ;;
  esac

  configure_security

  echo ""
  write_config "$config_provider_key"

  setup_project_detection

  print_summary
}

main "$@"
exit 0
}
