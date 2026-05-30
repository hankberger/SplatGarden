#!/usr/bin/env bash
#
# probe.sh — capture every fact we need to pick the right COLMAP CUDA target.
#
# Writes everything to a local file AND mirrors to stdout. We then upload the
# file to GCS unconditionally, so even if the container later crashes from
# a missing-lib error, we still get the diagnostics that led up to it.
#
# Required env vars:
#   PROBE_OUTPUT_GS    gs://bucket/prefix  — where to upload the report
#
set +e                          # never abort; we want partial output
exec 2>&1                       # merge stderr into stdout from the start

OUTFILE="/tmp/probe-$(date -u +%Y%m%dT%H%M%SZ).txt"

# Tee everything we print from here on into $OUTFILE while also showing it in
# Cloud Logging. `stdbuf -oL` keeps the line buffering tight so a mid-script
# crash doesn't swallow the last few lines.
exec > >(stdbuf -oL tee -a "$OUTFILE") 2>&1

section() { echo; echo "=== $* ==="; }

echo "probe started at $(date -u)"
echo "host:           $(hostname)"
echo "kernel:         $(uname -a)"
echo "execution:      ${CLOUD_RUN_EXECUTION:-unknown}"
echo "task index:     ${CLOUD_RUN_TASK_INDEX:-unknown}"

section "/proc/driver/nvidia/version"
cat /proc/driver/nvidia/version || echo "(missing — NVIDIA module not loaded in container)"

section "which nvidia-smi"
which nvidia-smi || echo "(nvidia-smi not in PATH)"

section "nvidia-smi"
nvidia-smi || echo "(nvidia-smi exited non-zero)"

section "nvidia-smi -q (truncated to first 250 lines)"
nvidia-smi -q 2>&1 | head -250 || echo "(failed)"

section "libcuda / libnvidia in ldconfig"
ldconfig -p | grep -E "libcuda|libnvidia" || echo "(none reported by ldconfig)"

section "raw libcuda.so* files on disk"
find / -name "libcuda.so*" -not -path "/proc/*" 2>/dev/null || echo "(none found)"

section "raw libnvidia-*.so* files on disk (first 40)"
find / -name "libnvidia-*.so*" -not -path "/proc/*" 2>/dev/null | head -40 || echo "(none found)"

section "/usr/local/cuda* contents"
ls -la /usr/local/ 2>/dev/null | grep cuda || echo "(no /usr/local/cuda*)"

section "/dev/nvidia* devices"
ls -la /dev/nvidia* 2>/dev/null || echo "(no /dev/nvidia* — GPU not exposed?)"

section "nvidia bind mounts"
mount | grep -i nvidia || echo "(no nvidia mounts)"

section "CUDA / NVIDIA env vars"
env | grep -iE "cuda|nvidia|gpu" || echo "(none)"

section "all env vars"
env | sort

echo
echo "probe complete at $(date -u)"

# Upload regardless of what happened above.
DEST="${PROBE_OUTPUT_GS:-gs://splatgarden-uploads/probes}"
DEST="${DEST%/}/$(basename "$OUTFILE")"
echo "Uploading report to $DEST"
gcloud storage cp "$OUTFILE" "$DEST" || echo "WARN: upload failed (rc=$?)"
echo "DONE"
