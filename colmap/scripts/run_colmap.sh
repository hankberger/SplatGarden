#!/usr/bin/env bash
#
# run_colmap — turn a folder of images (or a video) into a Gaussian-Splatting-
# ready COLMAP dataset.
#
# Output layout (this is exactly what the INRIA gaussian-splatting trainer wants):
#
#   <project>/
#     images/        undistorted images
#     sparse/0/      cameras.bin  images.bin  points3D.bin
#     distorted/     intermediate database + raw (distorted) reconstruction
#
# The project directory must contain its source images in <project>/input/,
# OR you can pass --video to extract frames into <project>/input/ first.
#
set -euo pipefail

# ---- defaults --------------------------------------------------------------
VIDEO=""
FPS="2"
MATCHER="exhaustive"      # exhaustive | sequential | spatial | vocab_tree
CAMERA="OPENCV"           # COLMAP camera model
SINGLE_CAMERA="1"         # all images share one camera (best for single phone/cam)
USE_GPU="1"
PROJECT=""

usage() {
  cat <<'EOF'
Usage: run_colmap [options] <project_dir>

<project_dir> contains source images in <project_dir>/input/,
or use --video to extract frames first.

Options:
  --video FILE         Extract frames from this video into <project>/input/
  --fps N              Frames per second to extract from video   (default: 2)
  --matcher TYPE       exhaustive | sequential | spatial | vocab_tree
                       Use 'sequential' for video / ordered captures (default: exhaustive)
  --camera MODEL       COLMAP camera model: OPENCV, PINHOLE,
                       SIMPLE_PINHOLE, SIMPLE_RADIAL, FULL_OPENCV (default: OPENCV)
  --multi-camera       Images come from different cameras (default: single camera)
  --no-gpu             Disable CUDA (run SIFT on CPU)
  -h, --help           Show this help

Examples:
  run_colmap /workspace/mychair
  run_colmap --video /workspace/scan.mp4 --fps 3 --matcher sequential /workspace/scan
EOF
}

# ---- arg parsing -----------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --video)        VIDEO="$2"; shift 2 ;;
    --fps)          FPS="$2"; shift 2 ;;
    --matcher)      MATCHER="$2"; shift 2 ;;
    --camera)       CAMERA="$2"; shift 2 ;;
    --multi-camera) SINGLE_CAMERA="0"; shift ;;
    --no-gpu)       USE_GPU="0"; shift ;;
    -h|--help)      usage; exit 0 ;;
    -*)             echo "Unknown option: $1" >&2; usage; exit 1 ;;
    *)              PROJECT="$1"; shift ;;
  esac
done

if [[ -z "$PROJECT" ]]; then
  echo "ERROR: no project directory given." >&2
  usage; exit 1
fi

PROJECT="${PROJECT%/}"
INPUT="$PROJECT/input"
DISTORTED="$PROJECT/distorted"

log() { echo -e "\n\033[1;36m==> $*\033[0m"; }

# ---- 0. optional frame extraction -----------------------------------------
if [[ -n "$VIDEO" ]]; then
  log "Extracting frames from $VIDEO at ${FPS} fps"
  mkdir -p "$INPUT"
  # -qscale:v 1 -qmin 1 = highest-quality JPEG frames (matters for feature quality)
  ffmpeg -hide_banner -loglevel error -i "$VIDEO" \
    -qscale:v 1 -qmin 1 -vf "fps=${FPS}" "$INPUT/%05d.jpg"
  echo "Extracted $(ls -1 "$INPUT" | wc -l) frames into $INPUT"
fi

if [[ ! -d "$INPUT" ]] || [[ -z "$(ls -A "$INPUT" 2>/dev/null)" ]]; then
  echo "ERROR: no images found in $INPUT" >&2
  echo "Put images there, or pass --video to extract them." >&2
  exit 1
fi

mkdir -p "$DISTORTED/sparse"
DB="$DISTORTED/database.db"

# ---- 1. feature extraction -------------------------------------------------
log "Feature extraction (GPU=$USE_GPU, camera=$CAMERA, single_camera=$SINGLE_CAMERA)"
colmap feature_extractor \
  --database_path "$DB" \
  --image_path "$INPUT" \
  --ImageReader.single_camera "$SINGLE_CAMERA" \
  --ImageReader.camera_model "$CAMERA" \
  --SiftExtraction.use_gpu "$USE_GPU"

# ---- 2. feature matching ---------------------------------------------------
log "Feature matching ($MATCHER)"
case "$MATCHER" in
  exhaustive)
    colmap exhaustive_matcher --database_path "$DB" --SiftMatching.use_gpu "$USE_GPU" ;;
  sequential)
    colmap sequential_matcher --database_path "$DB" --SiftMatching.use_gpu "$USE_GPU" ;;
  spatial)
    colmap spatial_matcher --database_path "$DB" --SiftMatching.use_gpu "$USE_GPU" ;;
  vocab_tree)
    colmap vocab_tree_matcher --database_path "$DB" --SiftMatching.use_gpu "$USE_GPU" ;;
  *)
    echo "ERROR: unknown matcher '$MATCHER'" >&2; exit 1 ;;
esac

# ---- 3. sparse reconstruction (structure from motion) ----------------------
log "Sparse reconstruction (mapper)"
colmap mapper \
  --database_path "$DB" \
  --image_path "$INPUT" \
  --output_path "$DISTORTED/sparse"

if [[ ! -d "$DISTORTED/sparse/0" ]]; then
  echo "ERROR: mapper produced no model. Images may not have enough overlap/features." >&2
  exit 1
fi

# ---- 4. undistort into the final GS layout ---------------------------------
log "Undistorting images -> $PROJECT/images + $PROJECT/sparse"
colmap image_undistorter \
  --image_path "$INPUT" \
  --input_path "$DISTORTED/sparse/0" \
  --output_path "$PROJECT" \
  --output_type COLMAP

# image_undistorter writes sparse files to <project>/sparse/ ;
# the GS trainer expects them under <project>/sparse/0/.
if [[ -d "$PROJECT/sparse" && ! -d "$PROJECT/sparse/0" ]]; then
  mkdir -p "$PROJECT/sparse/0"
  for f in "$PROJECT/sparse/"*; do
    base="$(basename "$f")"
    [[ "$base" == "0" ]] && continue
    mv "$f" "$PROJECT/sparse/0/"
  done
fi

NUM_IMAGES=$(ls -1 "$PROJECT/images" 2>/dev/null | wc -l)
log "Done. Dataset ready at: $PROJECT"
echo "  images/   ($NUM_IMAGES undistorted images)"
echo "  sparse/0/ (cameras.bin, images.bin, points3D.bin)"
echo ""
echo "Point your Gaussian Splatting trainer at: $PROJECT"
