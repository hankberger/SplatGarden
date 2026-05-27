# COLMAP + ffmpeg pipeline for building Gaussian Splatting datasets.
# Base image ships COLMAP built with CUDA support.
FROM colmap/colmap:latest

# ffmpeg: extract frames from video. python3: small reorg helper if needed.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg python3 && \
    rm -rf /var/lib/apt/lists/*

# The base image sets an ENTRYPOINT of ["colmap"]; override so our script runs.
COPY scripts/run_colmap.sh /usr/local/bin/run_colmap
RUN chmod +x /usr/local/bin/run_colmap

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/run_colmap"]
CMD ["--help"]
