#!/usr/bin/env bash
# Register Hyperflow skills for detected hosts and commands for OpenCode.
{
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/scripts/install/shared.sh"
source "$SCRIPT_DIR/scripts/install/checkout.sh"
source "$SCRIPT_DIR/scripts/install/codex.sh"
source "$SCRIPT_DIR/scripts/install/registrations.sh"
main() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --help|-h) usage; return ;;
      --uninstall) ACTION="uninstall" ;;
      --link-only) ACTION="link-only" ;;
      --status) ACTION="status" ;;
      --check) STATUS_CHECK=1 ;;
      --json) STATUS_JSON=1 ;;
      *) warn "Unknown option: $1"; usage; exit 1 ;;
    esac
    shift
  done

  if [ "$STATUS_CHECK" = "1" ] && [ "$ACTION" != "status" ]; then
    warn "--check requires --status"
    usage
    exit 1
  fi
  if [ "$STATUS_JSON" = "1" ] && [ "$ACTION" != "status" ]; then
    warn "--json requires --status"
    usage
    exit 1
  fi

  if [ "$ACTION" = "uninstall" ]; then
    remove_owned_links
    return
  fi

  if [ "$ACTION" = "status" ]; then
    if print_status; then
      return
    else
      return $?
    fi
  fi

  command -v git >/dev/null 2>&1 || { warn "git is required"; exit 1; }
  if [ "$ACTION" = "link-only" ]; then
    validate_checkout || exit 1
  else
    clone_or_update
  fi
  link_detected_providers
  if [ "$HOST_FAILURES" -gt 0 ]; then
    warn "Source checkout completed, but $HOST_FAILURES host installation operation(s) failed"
    return 1
  fi
  if [ "$HOST_SUCCESSES" -eq 0 ]; then
    warn "No supported host was detected; the checkout is ready but no skills or commands were registered"
    return 1
  fi
  info "Hyperflow installed. Start a fresh host session to load it."
}

main "$@"
exit 0
}
