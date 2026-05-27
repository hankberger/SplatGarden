# COLMAP → Gaussian Splatting dataset builder

A GPU-accelerated Docker container that runs COLMAP to turn a folder of images
(or a video) into a dataset ready for Gaussian Splatting training.

## What it produces

```
data/<project>/
  images/        undistorted images
  sparse/0/      cameras.bin  images.bin  points3D.bin
  distorted/     intermediate database + raw reconstruction
```

That `images/` + `sparse/0/` layout is exactly what the INRIA
`gaussian-splatting` trainer (and most forks, e.g. nerfstudio's `splatfacto`)
expect.

## Prerequisites

- Docker with the NVIDIA container runtime (you have this: RTX 4090 detected)
- ~6 GB disk for the COLMAP base image

## Build

```powershell
cd A:\Coding\Projects\SplatGarden\colmap
docker compose build
```

## Usage

Everything under `./data` is visible inside the container at `/workspace`.

### From a folder of images

```powershell
# put images at data\mychair\input\*.jpg, then:
docker compose run --rm colmap /workspace/mychair
```

### From a video

```powershell
# put scan.mp4 at data\scan.mp4, then:
docker compose run --rm colmap --video /workspace/scan.mp4 --fps 3 --matcher sequential /workspace/scan
```

## Options

| Flag | Default | Notes |
|------|---------|-------|
| `--video FILE` | – | Extract frames into `<project>/input/` first |
| `--fps N` | `2` | Frame sampling rate for video |
| `--matcher TYPE` | `exhaustive` | `exhaustive` for unordered photos; `sequential` for video/ordered captures; also `spatial`, `vocab_tree` |
| `--camera MODEL` | `OPENCV` | COLMAP camera model (`PINHOLE`, `SIMPLE_RADIAL`, `FULL_OPENCV`, …) |
| `--multi-camera` | off | Set if images come from different cameras |
| `--no-gpu` | off | Run SIFT on CPU instead of CUDA |

Run `docker compose run --rm colmap --help` for the full list.

## Tips for good splats

- **Coverage & overlap:** capture lots of overlapping views orbiting the
  subject; aim for 60–80% overlap between adjacent frames.
- **Sharp frames:** avoid motion blur. For video, a higher `--fps` then letting
  COLMAP discard weak frames is fine, but blurry input hurts quality.
- **Unordered photos:** keep `--matcher exhaustive` (slower, most robust).
- **Video / drone paths:** use `--matcher sequential` — much faster on ordered frames.
- If the mapper fails ("produced no model"), the images likely lack overlap or
  texture; add more views or raise `--fps`.
