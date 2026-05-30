#!/usr/bin/env bash
#
# entrypoint.sh — GCS in/out shim for the COLMAP pipeline.
#
# Designed to run inside a Cloud Run job. Reads inputs from env vars, pulls
# the source video from GCS, runs run_colmap, then uploads the resulting
# images/ + sparse/ tree back to GCS. Optionally POSTs a status callback at
# the end of the run.
#
# Required env vars:
#   SOURCE_GS_URI       gs://bucket/path/to/source.mp4
#   OUTPUT_GS_PREFIX    gs://bucket/path/to/outputs  (no trailing slash)
#   JOB_ID              opaque job ID; used for the on-disk workdir + callback
#
# Optional env vars (with defaults):
#   FPS                 2            — frames per second to extract
#   MATCHER             sequential   — exhaustive|sequential|spatial|vocab_tree
#   CAMERA              OPENCV       — COLMAP camera model
#   USE_GPU             1            — set 0 to force CPU SIFT
#   WORKDIR             /workspace   — where to stage files on local disk
#   CALLBACK_URL        —            — if set, POSTed once with a JSON status payload
#   CALLBACK_TOKEN      —            — sent as `Authorization: Bearer <token>` on callback
#
# Auth: relies on Application Default Credentials. On Cloud Run the runtime
# service account is picked up automatically; locally, use
# `gcloud auth application-default login` or set GOOGLE_APPLICATION_CREDENTIALS.
#
set -euo pipefail

require() { [[ -n "${!1:-}" ]] || { echo "ERROR: env var $1 is required" >&2; exit 2; }; }
require SOURCE_GS_URI
require OUTPUT_GS_PREFIX
require JOB_ID

FPS="${FPS:-2}"
MATCHER="${MATCHER:-sequential}"
CAMERA="${CAMERA:-OPENCV}"
USE_GPU="${USE_GPU:-1}"
WORKDIR="${WORKDIR:-/workspace}"

# Strip trailing slash so "$OUTPUT_GS_PREFIX/foo" never doubles up.
OUTPUT_GS_PREFIX="${OUTPUT_GS_PREFIX%/}"

PROJECT_DIR="$WORKDIR/$JOB_ID"
mkdir -p "$PROJECT_DIR"

log() { echo -e "\033[1;36m[$(date -u +%H:%M:%S)] $*\033[0m"; }

# Robust logging. Cloud Run's stdout is a pipe, so a hard crash in COLMAP
# (e.g. a CUDA abort) can lose whatever is still buffered — which is why GPU
# failures showed up as "zero logs, exit 1". Force line buffering and mirror
# every line to a local file that the EXIT trap uploads, so a failure is
# always debuggable from GCS even when Cloud Logging shows nothing.
LOG_FILE="$PROJECT_DIR/run.log"
exec > >(stdbuf -oL tee -a "$LOG_FILE") 2>&1

# Extract a sensible extension from the source URI (default: bin).
basename_uri="${SOURCE_GS_URI##*/}"
EXT="${basename_uri##*.}"
if [[ -z "$EXT" || "$EXT" == "$basename_uri" ]]; then EXT="bin"; fi
SOURCE_LOCAL="$PROJECT_DIR/source.$EXT"

# Single point of truth for status reporting. Safe to call even when the
# callback URL is unset (no-op) — and best-effort: a failing callback never
# changes the script's exit code.
send_callback() {
  local status="$1" err_msg="${2:-}"
  [[ -n "${CALLBACK_URL:-}" ]] || return 0
  local auth_args=()
  [[ -n "${CALLBACK_TOKEN:-}" ]] && auth_args=(-H "Authorization: Bearer $CALLBACK_TOKEN")
  local payload
  payload=$(jq -n \
    --arg jobId "$JOB_ID" \
    --arg status "$status" \
    --arg err "$err_msg" \
    --arg out "$OUTPUT_GS_PREFIX" \
    '{jobId: $jobId, status: $status,
      errorMessage: (if $err == "" then null else $err end),
      outputPrefix: $out}')
  curl -fsS --max-time 30 -X POST "$CALLBACK_URL" \
    -H "Content-Type: application/json" \
    "${auth_args[@]}" \
    --data "$payload" >/dev/null || \
    echo "WARN: callback POST failed (continuing)" >&2
}

# If anything below exits non-zero, the EXIT trap reports `failed` to the
# callback. On clean exit ($? == 0) the explicit `send_callback done` at the
# bottom has already fired and the trap is a no-op.
on_exit() {
  local rc=$?
  [[ $rc -ne 0 ]] && log "FAILED (exit $rc)"
  # Always ship the run log so failures are debuggable straight from GCS.
  # Best-effort — a failed upload must never change our exit code.
  gcloud storage cp "$LOG_FILE" "$OUTPUT_GS_PREFIX/logs/run.log" >/dev/null 2>&1 || true
  if [[ $rc -ne 0 ]]; then
    send_callback failed "exit $rc"
  fi
}
trap on_exit EXIT

log "Job $JOB_ID — source=$SOURCE_GS_URI output=$OUTPUT_GS_PREFIX"

log "Downloading source video"
gcloud storage cp "$SOURCE_GS_URI" "$SOURCE_LOCAL"

# nvidia-smi line removed temporarily — suspected of producing silent crashes
# on Cloud Run with the pinned base image. Re-add only once we know the
# pipeline runs cleanly.

log "Running COLMAP pipeline (fps=$FPS matcher=$MATCHER gpu=$USE_GPU)"
gpu_flag=()
[[ "$USE_GPU" == "0" ]] && gpu_flag=(--no-gpu)
/usr/local/bin/run_colmap \
  --video    "$SOURCE_LOCAL" \
  --fps      "$FPS" \
  --matcher  "$MATCHER" \
  --camera   "$CAMERA" \
  "${gpu_flag[@]}" \
  "$PROJECT_DIR"

# Trailing slash on the destination so the local directory is placed *inside*
# the prefix (giving $OUTPUT_GS_PREFIX/images/... and /sparse/0/...).
log "Uploading dataset to $OUTPUT_GS_PREFIX/"
gcloud storage cp -r "$PROJECT_DIR/images" "$OUTPUT_GS_PREFIX/"
gcloud storage cp -r "$PROJECT_DIR/sparse" "$OUTPUT_GS_PREFIX/"

log "Done."
send_callback done ""
