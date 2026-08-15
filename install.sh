#!/usr/bin/env bash
# Lightweight installer for Hyperflow's seven Markdown skills.
{
set -euo pipefail

REPO_URL="https://github.com/Mohammed-Abdelhady/hyperflow.git"
INSTALL_DIR="${HYPERFLOW_HOME:-$HOME/.hyperflow/repo}"
# Symlink targets must be absolute: a relative HYPERFLOW_HOME would otherwise
# be resolved relative to the host's skills directory instead of this checkout.
case "$INSTALL_DIR" in
  /*) ;;
  *) INSTALL_DIR="$PWD/$INSTALL_DIR" ;;
esac
CORE_SKILLS=(hyperflow plan dispatch trace audit deploy handoff)
ACTION="install"
ACCEPT_MAJOR_MIGRATION=0
HOST_FAILURES=0
HOST_SUCCESSES=0

info() { printf '> %s\n' "$1"; }
warn() { printf '! %s\n' "$1" >&2; }

is_git_checkout() {
  [ -d "$1/.git" ] || [ -f "$1/.git" ]
}

usage() {
  printf '%s\n' \
    "Usage: install.sh [--accept-major-migration | --link-only | --uninstall | --help]" \
    "" \
    "Installs the Hyperflow plugin for available native hosts and links all" \
    "seven public skills into detected OpenCode or Antigravity skill directories." \
    "Existing directories and project .hyperflow data are" \
    "never overwritten or deleted."
}

validate_checkout() {
  local remote skill
  is_git_checkout "$INSTALL_DIR" || { warn "Not a Git checkout: $INSTALL_DIR"; exit 1; }
  remote="$(git -C "$INSTALL_DIR" remote get-url origin 2>/dev/null || true)"
  case "$remote" in
    "$REPO_URL"|https://github.com/Mohammed-Abdelhady/hyperflow|git@github.com:Mohammed-Abdelhady/hyperflow.git) ;;
    *) warn "Install path is not the Hyperflow repository: $INSTALL_DIR"; exit 1 ;;
  esac
  for skill in "${CORE_SKILLS[@]}"; do
    [ -f "$INSTALL_DIR/skills/$skill/SKILL.md" ] || {
      warn "Incomplete Hyperflow checkout: missing skills/$skill/SKILL.md"
      exit 1
    }
  done
}

clone_or_update() {
  if is_git_checkout "$INSTALL_DIR"; then
    local current_version incoming_version current_major incoming_major
    validate_checkout
    if [ -n "$(git -C "$INSTALL_DIR" status --porcelain --untracked-files=all)" ]; then
      warn "Refusing to update dirty checkout: $INSTALL_DIR"
      warn "Commit or stash local changes before rerunning the installer."
      exit 1
    fi
    info "Updating $INSTALL_DIR"
    if ! git -C "$INSTALL_DIR" fetch --quiet origin main; then
      warn "Unable to fetch origin/main; leaving checkout unchanged."
      exit 1
    fi
    current_version="$(sed -n 's/.*"version": "\([0-9][0-9.]*\)".*/\1/p' "$INSTALL_DIR/package.json" | head -1)"
    incoming_version="$(git -C "$INSTALL_DIR" show FETCH_HEAD:package.json | sed -n 's/.*"version": "\([0-9][0-9.]*\)".*/\1/p' | head -1)"
    current_major="${current_version%%.*}"
    incoming_major="${incoming_version%%.*}"
    if [ -z "$current_version" ] || [ -z "$incoming_version" ]; then
      warn "Unable to determine package versions for the update; leaving checkout unchanged."
      exit 1
    fi
    # hyperflow:legacy-migration:start
    if [ -n "$current_major" ] && [ -n "$incoming_major" ] && [ "$incoming_major" -gt "$current_major" ] && [ "$ACCEPT_MAJOR_MIGRATION" != "1" ]; then
      warn "Major update $current_version -> $incoming_version requires manual legacy-data review before checkout changes."
      warn "Rehydrate JSON-only data under .hyperflow/artefacts, .hyperflow/archive, and .hyperflow-handoff into Markdown, then rerun with --accept-major-migration."
      exit 2
    fi
    # hyperflow:legacy-migration:end
    if ! git -C "$INSTALL_DIR" merge-base --is-ancestor HEAD FETCH_HEAD; then
      warn "Refusing non-fast-forward update: local checkout has diverged from origin/main."
      warn "Re-clone or reconcile the checkout manually before rerunning the installer."
      exit 1
    fi
    if ! git -C "$INSTALL_DIR" merge --ff-only --quiet FETCH_HEAD; then
      warn "Unable to fast-forward origin/main; leaving checkout unchanged."
      exit 1
    fi
    validate_checkout
    return
  fi

  if [ -e "$INSTALL_DIR" ]; then
    warn "Install path exists and is not a Hyperflow checkout: $INSTALL_DIR"
    exit 1
  fi

  info "Installing to $INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --quiet --depth 1 "$REPO_URL" "$INSTALL_DIR"
  validate_checkout
}

link_skill() {
  local source="$1" target="$2" current=""
  mkdir -p "$(dirname "$target")"

  if [ -L "$target" ]; then
    current="$(readlink "$target")"
    if [ "$current" = "$source" ]; then
      return
    fi
    case "$current" in
      "$INSTALL_DIR"/skills/*) rm "$target" ;;
      *) warn "Keeping foreign link: $target -> $current"; return 1 ;;
    esac
  elif [ -e "$target" ]; then
    warn "Keeping existing path: $target"
    return 1
  fi

  ln -s "$source" "$target"
}

link_provider() {
  local label="$1" target_root="$2" skill target current linked=0 conflicts=0

  # Preflight every target before creating or replacing any link. A partial
  # OpenCode link set is worse than a clear failure because it leaves a host
  # looking installed while silently keeping some skills foreign or stale.
  for skill in "${CORE_SKILLS[@]}"; do
    target="$target_root/$skill"
    if [ -L "$target" ]; then
      current="$(readlink "$target")"
      case "$current" in
        "$INSTALL_DIR"/skills/*) ;;
        *)
          warn "Keeping foreign link: $target -> $current"
          conflicts=$((conflicts + 1))
          ;;
      esac
    elif [ -e "$target" ]; then
      warn "Keeping existing path: $target"
      conflicts=$((conflicts + 1))
    fi
  done
  if [ "$conflicts" -gt 0 ]; then
    warn "$label: $conflicts skill path conflict(s); host is not fully linked"
    HOST_FAILURES=$((HOST_FAILURES + 1))
    return
  fi

  for skill in "${CORE_SKILLS[@]}"; do
    link_skill "$INSTALL_DIR/skills/$skill" "$target_root/$skill"
    linked=$((linked + 1))
  done
  HOST_SUCCESSES=$((HOST_SUCCESSES + 1))
  info "$label: $linked skills ready"
}

install_native_plugins() {
  if command -v claude >/dev/null 2>&1; then
    claude plugin marketplace add Mohammed-Abdelhady/hyperflow >/dev/null 2>&1 || true
    if claude plugin install hyperflow@hyperflow-marketplace >/dev/null 2>&1; then
      HOST_SUCCESSES=$((HOST_SUCCESSES + 1))
      info "Claude Code: plugin installed"
    else
      warn "Claude Code: run 'claude plugin install hyperflow@hyperflow-marketplace'"
      HOST_FAILURES=$((HOST_FAILURES + 1))
    fi
  fi

  if command -v codex >/dev/null 2>&1; then
    codex plugin marketplace add Mohammed-Abdelhady/hyperflow >/dev/null 2>&1 || true
    if codex plugin add hyperflow@hyperflow-marketplace >/dev/null 2>&1; then
      HOST_SUCCESSES=$((HOST_SUCCESSES + 1))
      info "Codex: plugin installed"
    else
      warn "Codex: run 'codex plugin add hyperflow@hyperflow-marketplace'"
      HOST_FAILURES=$((HOST_FAILURES + 1))
    fi
  fi
  return 0
}

link_detected_providers() {
  [ -d "$HOME/.config/opencode" ] && link_provider "OpenCode" "$HOME/.config/opencode/skills"
  [ -d "$HOME/.gemini/config" ] && link_provider "Antigravity" "$HOME/.gemini/config/skills"
  return 0
}

remove_owned_links() {
  local root skill target current removed=0
  local roots=("$HOME/.opencode/skills")
  roots+=("$HOME/.config/opencode/skills")
  roots+=("$HOME/.gemini/config/skills")

  for root in "${roots[@]}"; do
    for skill in "${CORE_SKILLS[@]}"; do
      target="$root/$skill"
      [ -L "$target" ] || continue
      current="$(readlink "$target")"
      case "$current" in
        "$INSTALL_DIR"/skills/*)
          rm "$target"
          removed=$((removed + 1))
          ;;
      esac
    done
  done

  if command -v claude >/dev/null 2>&1; then
    if ! claude plugin uninstall hyperflow@hyperflow-marketplace >/dev/null 2>&1; then
      warn "Claude Code: plugin uninstall failed"
      HOST_FAILURES=$((HOST_FAILURES + 1))
    fi
  fi
  if command -v codex >/dev/null 2>&1; then
    if ! codex plugin remove hyperflow@hyperflow-marketplace >/dev/null 2>&1; then
      warn "Codex: plugin removal failed"
      HOST_FAILURES=$((HOST_FAILURES + 1))
    fi
  fi

  info "Removed $removed owned skill links"
  info "Kept $INSTALL_DIR and all project .hyperflow data"
  if [ "$HOST_FAILURES" -gt 0 ]; then
    warn "$HOST_FAILURES native host removal operation(s) failed"
    return 1
  fi
}

main() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --help|-h) usage; return ;;
      --uninstall) ACTION="uninstall" ;;
      --link-only) ACTION="link-only" ;;
      --accept-major-migration) ACCEPT_MAJOR_MIGRATION=1 ;;
      *) warn "Unknown option: $1"; usage; exit 1 ;;
    esac
    shift
  done

  if [ "$ACTION" = "uninstall" ]; then
    remove_owned_links
    return
  fi

  command -v git >/dev/null 2>&1 || { warn "git is required"; exit 1; }
  if [ "$ACTION" = "link-only" ]; then
    validate_checkout
  else
    clone_or_update
  fi
  install_native_plugins
  link_detected_providers
  if [ "$HOST_FAILURES" -gt 0 ]; then
    warn "Source checkout completed, but $HOST_FAILURES host installation operation(s) failed"
    return 1
  fi
  if [ "$HOST_SUCCESSES" -eq 0 ]; then
    warn "No supported host was detected; the checkout is ready but Hyperflow was not installed"
    return 1
  fi
  info "Hyperflow installed. Start a fresh host session to load it."
}

main "$@"
exit 0
}
