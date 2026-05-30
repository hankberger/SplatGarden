# COLMAP + ffmpeg pipeline for building Gaussian Splatting datasets.
# Base image ships COLMAP built with CUDA support (Ubuntu 22.04 + CUDA 11.x).
#
# `:latest` for now. Pinned older tags (e.g. 20251107.4118) silently crash on
# Cloud Run GPU jobs — most likely a NVIDIA library conflict between the older
# image and Cloud Run's host-injected driver. With `:latest`, the script runs
# end-to-end; GPU SIFT fails with PTX errors, but CPU SIFT (USE_GPU=0) works.
# Revisit pinning once we have a working tag verified on Cloud Run L4.
FROM colmap/colmap:latest

# System deps:
#   ffmpeg   — frame extraction
#   curl,jq  — callback POST + JSON payload assembly in the entrypoint
#   gnupg/ca-certificates/apt-transport-https — needed to add Google's apt repo
# Then add the Google Cloud apt repo and install the gcloud CLI (provides
# `gcloud storage` for GCS in/out).
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg python3 curl jq ca-certificates gnupg apt-transport-https && \
    curl -sSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
      | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
      > /etc/apt/sources.list.d/google-cloud-sdk.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends google-cloud-cli && \
    rm -rf /var/lib/apt/lists/*

# run_colmap is the actual SfM pipeline; colmap-entrypoint is the GCS shim
# that wraps it for Cloud Run jobs. Local users can bypass the shim by
# overriding ENTRYPOINT (see docker-compose.yml).
COPY scripts/run_colmap.sh        /usr/local/bin/run_colmap
COPY scripts/entrypoint.sh        /usr/local/bin/colmap-entrypoint
RUN chmod +x /usr/local/bin/run_colmap /usr/local/bin/colmap-entrypoint

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/colmap-entrypoint"]
