# COLMAP → Gaussian Splatting dataset builder

A GPU-accelerated Docker image that turns a video (or a folder of images)
into a COLMAP dataset ready for Gaussian Splatting training. Has two modes:

- **Local mode** — invoke `run_colmap` directly via `docker compose`; bind-mount
  a host folder into `/workspace`.
- **Cloud Run mode** — default entrypoint is a GCS in/out shim that reads a
  source video from GCS, runs the pipeline, and uploads the dataset back.

## What it produces

```
<project>/
  images/        undistorted images
  sparse/0/      cameras.bin  images.bin  points3D.bin
  distorted/     intermediate database + raw reconstruction
```

That `images/` + `sparse/0/` layout is exactly what the INRIA
`gaussian-splatting` trainer (and most forks, e.g. nerfstudio's `splatfacto`)
expect.

## Build

```powershell
cd A:\Coding\Projects\SplatGarden\colmap
docker compose build
```

Or push to Artifact Registry for Cloud Run:

```powershell
gcloud builds submit . --tag us-central1-docker.pkg.dev/<PROJECT>/splatgarden/colmap:v1
```

## Local mode (the `colmap` service)

`docker-compose.yml` overrides the entrypoint back to `run_colmap` and mounts
`./data` at `/workspace`.

```powershell
# from a folder of images:    data\mychair\input\*.jpg
docker compose run --rm colmap /workspace/mychair

# from a video:                data\scan.mp4
docker compose run --rm colmap --video /workspace/scan.mp4 --fps 3 `
                               --matcher sequential /workspace/scan
```

`run_colmap` options:

| Flag | Default | Notes |
|------|---------|-------|
| `--video FILE` | – | Extract frames into `<project>/input/` first |
| `--fps N` | `2` | Frame sampling rate for video |
| `--matcher TYPE` | `exhaustive` | `exhaustive` for unordered photos; `sequential` for video/ordered captures; also `spatial`, `vocab_tree` |
| `--camera MODEL` | `OPENCV` | COLMAP camera model |
| `--multi-camera` | off | Set if images come from different cameras |
| `--no-gpu` | off | Run SIFT on CPU instead of CUDA |

## Cloud Run mode (the GCS shim)

The default `ENTRYPOINT` is `scripts/entrypoint.sh`. It is driven entirely by
env vars — no CLI args. The container:

1. `gcloud storage cp $SOURCE_GS_URI /workspace/$JOB_ID/source.<ext>`
2. Runs `run_colmap --video … --fps $FPS --matcher $MATCHER … /workspace/$JOB_ID`
3. `gcloud storage cp -r /workspace/$JOB_ID/{images,sparse} $OUTPUT_GS_PREFIX/`
4. (optional) `POST $CALLBACK_URL` with a JSON status payload.

### Env vars

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `SOURCE_GS_URI` | ✅ | – | `gs://bucket/path/to/source.mp4` |
| `OUTPUT_GS_PREFIX` | ✅ | – | `gs://bucket/path/to/outputs` (no trailing slash) |
| `JOB_ID` | ✅ | – | Used for the on-disk workdir + callback payload |
| `FPS` | – | `2` | Frame sampling rate |
| `MATCHER` | – | `sequential` | `exhaustive`/`sequential`/`spatial`/`vocab_tree` |
| `CAMERA` | – | `OPENCV` | COLMAP camera model |
| `USE_GPU` | – | `1` | Set `0` to force CPU SIFT |
| `CALLBACK_URL` | – | – | If set, POSTed once with status JSON |
| `CALLBACK_TOKEN` | – | – | Sent as `Authorization: Bearer <token>` on callback |

### Callback payload

```json
{
  "jobId": "abc123…",
  "status": "done",          // or "failed"
  "errorMessage": null,      // or "exit 42" on failure
  "outputPrefix": "gs://bucket/path/to/outputs"
}
```

### Deploy as a Cloud Run job

```powershell
gcloud beta run jobs create colmap-job `
  --image us-central1-docker.pkg.dev/<PROJECT>/splatgarden/colmap:v1 `
  --region us-central1 `
  --gpu 1 --gpu-type nvidia-l4 `
  --cpu 8 --memory 32Gi `
  --task-timeout 3600 `
  --max-retries 1 `
  --service-account colmap-runner@<PROJECT>.iam.gserviceaccount.com
```

Grant the `colmap-runner` SA:
- `roles/storage.objectUser` on the uploads + outputs bucket(s)

Execute with per-job overrides:

```powershell
gcloud run jobs execute colmap-job --region us-central1 `
  --update-env-vars=SOURCE_GS_URI=gs://my-bucket/users/u/jobs/J/source.mp4,`
OUTPUT_GS_PREFIX=gs://my-bucket/users/u/jobs/J,JOB_ID=J,FPS=2
```

### Local smoke-test of the shim (the `shim` service)

`docker-compose.yml` defines a second `shim` service that runs the default
entrypoint and mounts your gcloud ADC into the container:

```powershell
$env:SOURCE_GS_URI    = "gs://my-bucket/test.mp4"
$env:OUTPUT_GS_PREFIX = "gs://my-bucket/test-out"
$env:JOB_ID           = "smoketest"
docker compose run --rm shim
```

## Tips for good splats

- **Coverage & overlap:** capture lots of overlapping views orbiting the
  subject; aim for 60–80% overlap between adjacent frames.
- **Sharp frames:** avoid motion blur. Higher `--fps` then letting COLMAP
  drop weak frames is fine, but blurry input hurts quality.
- **Unordered photos:** `--matcher exhaustive` (slower, most robust).
- **Video / drone paths:** `--matcher sequential` — much faster on ordered frames.
- If the mapper fails ("produced no model"), the images likely lack overlap
  or texture; add more views or raise `--fps`.
