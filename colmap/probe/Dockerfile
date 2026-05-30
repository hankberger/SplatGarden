# Diagnostic probe for Cloud Run GPU passthrough.
#
# Plain Ubuntu (no CUDA pre-installed) — Cloud Run's NVIDIA Container Toolkit
# injects the host driver + nvidia-smi at runtime. We want to *observe* what
# it injects, not bring our own CUDA. That tells us the actual driver/CUDA
# version available on Cloud Run L4 so we can pin our real COLMAP build to it.
FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg apt-transport-https && \
    curl -sSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
      | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
      > /etc/apt/sources.list.d/google-cloud-sdk.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends google-cloud-cli && \
    rm -rf /var/lib/apt/lists/*

COPY probe.sh /usr/local/bin/probe
RUN chmod +x /usr/local/bin/probe

ENTRYPOINT ["/usr/local/bin/probe"]
