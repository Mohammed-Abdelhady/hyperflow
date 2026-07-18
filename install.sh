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

# Lifecycle outcome records: "Provider|outcome|detail"
# Outcomes: installed | already_installed | command_unavailable |
#           permission_denied | instruction_only | removed | not_installed | failed
LIFECYCLE_RESULTS=()

SECURITY_ENABLED="true"

# Supported Codex marketplace lifecycle commands (must match config/providers.json).
CODEX_MARKETPLACE_ADD="codex plugin marketplace add Mohammed-Abdelhady/hyperflow"
CODEX_PLUGIN_ADD="codex plugin add hyperflow@hyperflow-marketplace"
CODEX_PLUGIN_REMOVE="codex plugin remove hyperflow@hyperflow-marketplace"
CODEX_MARKETPLACE_UPGRADE="codex plugin marketplace upgrade hyperflow-marketplace"
FRESH_SESSION_NOTE="Verify in a fresh Codex session (restart Codex after install/update/remove)."

# ─── Provider Detection ───

detect_providers() {
  local name path key
  local -a names=("Claude Code" "OpenCode" "Codex" "Cursor")
  local -a paths=("$HOME/.claude/skills" "$HOME/.opencode/skills" "$HOME/.codex/plugins" "$HOME/.cursor/skills")
  local -a keys=("claude-code" "opencode" "codex" "cursor")

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

  # Grok CLI / Grok Build TUI — skills under ~/.grok/skills/
  if [ -d "$HOME/.grok" ]; then
    PROVIDERS+=("Grok")
    PROVIDER_PATHS+=("$HOME/.grok/skills")
    PROVIDER_KEYS+=("grok")
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

# ─── Lifecycle outcome helper ───

record_lifecycle() {
  local provider="$1" outcome="$2" detail="${3:-}"
  LIFECYCLE_RESULTS+=("${provider}|${outcome}|${detail}")
}

# ─── Codex plugin lifecycle (install / already / unavailable / denied / instruction-only) ───

# Returns 0 if hyperflow appears installed for Codex (list output or cache path).
# Uses CODEX_HOME when set so tests can isolate without touching real ~/.codex.
codex_plugin_is_installed() {
  local home="${CODEX_HOME:-$HOME/.codex}"
  if command -v codex >/dev/null 2>&1; then
    local list_out=""
    list_out="$(codex plugin list 2>/dev/null || true)"
    if printf '%s' "$list_out" | grep -qiE 'hyperflow'; then
      return 0
    fi
  fi
  # Cache / plugins path markers (never invent state beyond presence).
  if [ -d "$home/plugins" ] && find "$home/plugins" -maxdepth 4 -iname '*hyperflow*' 2>/dev/null | grep -q .; then
    return 0
  fi
  return 1
}

# Attempt real Codex install commands; always record a truthful outcome.
# HYPERFLOW_CODEX_INSTRUCTION_ONLY=1 forces instruction-only (used by tests).
install_codex_plugin() {
  local force_instruction="${HYPERFLOW_CODEX_INSTRUCTION_ONLY:-0}"

  if [ "$force_instruction" = "1" ]; then
    step "  Codex — instruction-only (HYPERFLOW_CODEX_INSTRUCTION_ONLY=1)"
    step "    $CODEX_MARKETPLACE_ADD"
    step "    $CODEX_PLUGIN_ADD"
    step "    $FRESH_SESSION_NOTE"
    record_lifecycle "Codex" "instruction_only" "$CODEX_PLUGIN_ADD"
    return
  fi

  if ! command -v codex >/dev/null 2>&1; then
    warn "Codex — command unavailable (codex not on PATH)"
    step "  Install manually:"
    step "    $CODEX_MARKETPLACE_ADD"
    step "    $CODEX_PLUGIN_ADD"
    step "    $FRESH_SESSION_NOTE"
    record_lifecycle "Codex" "command_unavailable" "$CODEX_PLUGIN_ADD"
    return
  fi

  if codex_plugin_is_installed; then
    step "  Codex — already installed"
    step "  Update: $CODEX_MARKETPLACE_UPGRADE"
    step "  $FRESH_SESSION_NOTE"
    record_lifecycle "Codex" "already_installed" "hyperflow@hyperflow-marketplace"
    return
  fi

  info "Codex — installing via plugin marketplace…"
  local add_rc=0 install_rc=0
  local add_err="" install_err=""

  set +e
  add_err="$(eval "$CODEX_MARKETPLACE_ADD" 2>&1)"
  add_rc=$?
  install_err="$(eval "$CODEX_PLUGIN_ADD" 2>&1)"
  install_rc=$?
  set -e

  if [ $install_rc -eq 0 ]; then
    info "Codex — installed (hyperflow@hyperflow-marketplace)"
    step "  $FRESH_SESSION_NOTE"
    record_lifecycle "Codex" "installed" "hyperflow@hyperflow-marketplace"
    return
  fi

  # Permission / auth failures
  if [ $add_rc -eq 126 ] || [ $install_rc -eq 126 ] \
    || [ $add_rc -eq 13 ] || [ $install_rc -eq 13 ] \
    || printf '%s\n%s' "$add_err" "$install_err" | grep -qiE 'permission denied|EACCES|not permitted|access denied'; then
    warn "Codex — permission denied while running plugin commands"
    step "  Retry with appropriate permissions, or install manually:"
    step "    $CODEX_MARKETPLACE_ADD"
    step "    $CODEX_PLUGIN_ADD"
    step "    $FRESH_SESSION_NOTE"
    record_lifecycle "Codex" "permission_denied" "$CODEX_PLUGIN_ADD"
    return
  fi

  # Already present according to CLI (race / partial state)
  if printf '%s\n%s' "$add_err" "$install_err" | grep -qiE 'already|exists|is installed'; then
    step "  Codex — already installed"
    step "  Update: $CODEX_MARKETPLACE_UPGRADE"
    step "  $FRESH_SESSION_NOTE"
    record_lifecycle "Codex" "already_installed" "hyperflow@hyperflow-marketplace"
    return
  fi

  warn "Codex — install command failed (exit $install_rc); falling back to instructions"
  step "  $CODEX_MARKETPLACE_ADD"
  step "  $CODEX_PLUGIN_ADD"
  step "  $FRESH_SESSION_NOTE"
  if [ -n "$install_err" ]; then
    step "  detail: $(printf '%s' "$install_err" | head -n 2 | tr '\n' ' ')"
  fi
  record_lifecycle "Codex" "instruction_only" "$CODEX_PLUGIN_ADD"
}

# Attempt real Codex remove; never runs destructive scope beyond the plugin entry.
remove_codex_plugin() {
  local force_instruction="${HYPERFLOW_CODEX_INSTRUCTION_ONLY:-0}"

  if [ "$force_instruction" = "1" ]; then
    step "  Codex — instruction-only removal"
    step "    $CODEX_PLUGIN_REMOVE"
    step "    $FRESH_SESSION_NOTE"
    record_lifecycle "Codex" "instruction_only" "$CODEX_PLUGIN_REMOVE"
    return
  fi

  if ! command -v codex >/dev/null 2>&1; then
    warn "Codex — command unavailable; cannot remove automatically"
    step "  Remove manually: $CODEX_PLUGIN_REMOVE"
    step "  $FRESH_SESSION_NOTE"
    record_lifecycle "Codex" "command_unavailable" "$CODEX_PLUGIN_REMOVE"
    return
  fi

  if ! codex_plugin_is_installed; then
    step "  Codex — not installed, skipping"
    record_lifecycle "Codex" "not_installed" ""
    return
  fi

  set +e
  local rm_err rm_rc
  rm_err="$(eval "$CODEX_PLUGIN_REMOVE" 2>&1)"
  rm_rc=$?
  set -e

  if [ $rm_rc -eq 0 ]; then
    info "Codex — plugin removed (hyperflow@hyperflow-marketplace)"
    step "  $FRESH_SESSION_NOTE"
    record_lifecycle "Codex" "removed" "hyperflow@hyperflow-marketplace"
    return
  fi

  if [ $rm_rc -eq 126 ] || [ $rm_rc -eq 13 ] \
    || printf '%s' "$rm_err" | grep -qiE 'permission denied|EACCES|not permitted|access denied'; then
    warn "Codex — permission denied while removing plugin"
    step "  Remove manually: $CODEX_PLUGIN_REMOVE"
    step "  $FRESH_SESSION_NOTE"
    record_lifecycle "Codex" "permission_denied" "$CODEX_PLUGIN_REMOVE"
    return
  fi

  warn "Codex — remove failed (exit $rm_rc); use: $CODEX_PLUGIN_REMOVE"
  step "  $FRESH_SESSION_NOTE"
  record_lifecycle "Codex" "instruction_only" "$CODEX_PLUGIN_REMOVE"
}

# ─── Link Provider ───

link_provider() {
  local name="$1" skills_dir="$2"

  if [ "$name" = "Claude Code" ]; then
    if [ -d "$skills_dir/hyperflow" ] || [ -L "$skills_dir/hyperflow" ]; then
      step "  Claude Code — skill already installed"
      record_lifecycle "Claude Code" "already_installed" "hyperflow@hyperflow-marketplace"
    else
      step "  Claude Code — run 'claude plugin install hyperflow@hyperflow-marketplace' to install"
      record_lifecycle "Claude Code" "instruction_only" "claude plugin install hyperflow@hyperflow-marketplace"
    fi
    return
  fi

  if [ "$name" = "Codex" ]; then
    install_codex_plugin
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

  # Grok discovers each skill as ~/.grok/skills/<name>/SKILL.md. Link the full
  # skills/* tree (not just hyperflow) so plan/dispatch/audit/… auto-invoke.
  if [ "$name" = "Grok" ]; then
    local skills_src="$INSTALL_DIR/skills"
    if [ ! -d "$skills_src" ]; then
      warn "Grok — skills not found at $skills_src (update your clone)"
      return
    fi
    mkdir -p "$skills_dir"
    local linked=0 skill_path sname stgt
    for skill_path in "$skills_src"/*/; do
      [ -d "$skill_path" ] || continue
      [ -f "${skill_path}SKILL.md" ] || continue
      sname="$(basename "$skill_path")"
      stgt="$skills_dir/$sname"
      if [ -L "$stgt" ]; then
        rm "$stgt"
      elif [ -d "$stgt" ]; then
        warn "Grok — found existing directory at $stgt"
        warn "  Backing up to ${stgt}.bak and replacing with symlink"
        mv "$stgt" "${stgt}.bak"
      fi
      ln -s "${skill_path%/}" "$stgt"
      linked=$((linked + 1))
    done
    info "Grok — linked $linked skills into $skills_dir"
    step "  Project shims: run scripts/setup-detection.sh --tools grok <project> for AGENTS.md + .grok/rules/"
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

  # Every agent runs on the current session model — there is no model-tier routing
  # and no per-provider model catalog. The config records detected providers + security only.
  python3 - "$CONFIG_FILE" "$SECURITY_ENABLED" "$providers_csv" <<'PYEOF'
import json, sys
config_path, sec, prov_csv = sys.argv[1:4]
keys = [k for k in prov_csv.split(",") if k]

cfg = {}
if keys:
    cfg["providers"] = keys
cfg["security"] = {"enabled": sec == "true"}
cfg["memory"]   = {"compactionThreshold": 300}
cfg["context"]  = {"windowTokens": 200000, "autoCompactMinPercent": 72, "autoCompactReadyTtlMinutes": 30}

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
  if ! pick_yes_no "Would you like to add hyperflow auto-detection to a project? This creates files like AGENTS.md and CLAUDE.md so Codex, Claude Code, OpenCode, Grok, and other tools auto-load hyperflow in that project." "n"; then
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
  local has_codex=false
  for i in "${!PROVIDERS[@]}"; do
    if [ "${PROVIDERS[$i]}" != "Claude Code" ]; then
      has_non_cc=true
    fi
    if [ "${PROVIDERS[$i]}" = "Codex" ]; then
      has_codex=true
    fi
  done

  if [ "$has_non_cc" = true ]; then
    step "Location:  $INSTALL_DIR"
    step "Update (source checkout):  git -C $INSTALL_DIR pull --ff-only"
  fi
  if [ "$has_codex" = true ]; then
    step "Update (Codex marketplace): $CODEX_MARKETPLACE_UPGRADE"
    step "  $FRESH_SESSION_NOTE"
  fi
  echo ""

  if [ ${#LIFECYCLE_RESULTS[@]} -gt 0 ]; then
    step "Provider lifecycle outcomes:"
    local entry prov outcome detail rest
    for entry in "${LIFECYCLE_RESULTS[@]}"; do
      prov="${entry%%|*}"
      rest="${entry#*|}"
      outcome="${rest%%|*}"
      detail="${rest#*|}"
      case "$outcome" in
        installed)          step "  $prov — installed${detail:+ ($detail)}" ;;
        already_installed)  step "  $prov — already installed${detail:+ ($detail)}" ;;
        command_unavailable) step "  $prov — command unavailable; manual: $detail" ;;
        permission_denied)  step "  $prov — permission denied; manual: $detail" ;;
        instruction_only)   step "  $prov — instruction-only; run: $detail" ;;
        removed)            step "  $prov — removed${detail:+ ($detail)}" ;;
        not_installed)      step "  $prov — not installed" ;;
        failed)             step "  $prov — failed${detail:+ ($detail)}" ;;
        *)                  step "  $prov — $outcome${detail:+ ($detail)}" ;;
      esac
    done
    echo ""
  elif [ ${#PROVIDERS[@]} -gt 0 ]; then
    step "Providers:"
    for i in "${!PROVIDERS[@]}"; do
      if [ "${PROVIDERS[$i]}" = "Claude Code" ]; then
        step "  Claude Code — plugin (claude plugin install hyperflow@hyperflow-marketplace)"
      elif [ "${PROVIDERS[$i]}" = "Codex" ]; then
        step "  Codex — plugin ($CODEX_PLUGIN_ADD)"
      elif [ "${PROVIDERS[$i]}" = "Antigravity" ]; then
        step "  Antigravity — hyperflow* skills → ${PROVIDER_PATHS[$i]}"
      elif [ "${PROVIDERS[$i]}" = "Grok" ]; then
        step "  Grok — skills/* → ${PROVIDER_PATHS[$i]}"
      else
        step "  ${PROVIDERS[$i]} → ${PROVIDER_PATHS[$i]}/hyperflow"
      fi
    done
    echo ""
  fi

  step "Models:    every agent runs on the current session model (no tier config)"
  step "Security:  $( [ "$SECURITY_ENABLED" = "true" ] && echo "enabled" || echo "disabled" )"
  echo ""

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
      step "  Verify removal in a fresh Claude Code session after uninstall."
      record_lifecycle "Claude Code" "instruction_only" "claude plugin uninstall hyperflow@hyperflow-marketplace"
      continue
    fi

    if [ "$name" = "Codex" ]; then
      remove_codex_plugin
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

    if [ "$name" = "Grok" ]; then
      local grok_removed=0 skill_path sname stgt link_dest
      for skill_path in "$INSTALL_DIR/skills"/*/; do
        [ -d "$skill_path" ] || continue
        [ -f "${skill_path}SKILL.md" ] || continue
        sname="$(basename "$skill_path")"
        stgt="${PROVIDER_PATHS[$i]}/$sname"
        if [ -L "$stgt" ]; then
          link_dest="$(readlink "$stgt")"
          if [[ "$link_dest" == *"/skills/"* ]] || [[ "$link_dest" == *".hyperflow"* ]]; then
            rm "$stgt"
            grok_removed=$((grok_removed + 1))
          fi
        fi
      done
      if [ $grok_removed -gt 0 ]; then
        info "Grok — removed $grok_removed skill symlinks"
        removed=$((removed + 1))
      else
        step "  Grok — not installed, skipping"
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

  # No model configuration — every agent runs on the current session model
  # (no thinking/worker tier split, no per-provider model catalog).

  configure_security

  echo ""
  write_config

  setup_project_detection

  print_summary
}

main "$@"
exit 0
}
