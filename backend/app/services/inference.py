"""YOLOv8n-pose inference wrapper.

Lazily loads the model on first call. Returns an empty list when:
  - ultralytics / cv2 not installed
  - video file does not exist or cannot be read
  - inference raises an unexpected error

This makes the caller resilient to missing weights in test environments.
"""

import logging
from pathlib import Path
from typing import Any

from app.schemas.analysis import FrameKeypoints, Keypoint

logger = logging.getLogger(__name__)

# COCO 17-keypoint names by index (YOLOv8 default pose output)
YOLO_KP_NAMES: list[str] = [
    "nose",
    "left_eye", "right_eye",
    "left_ear", "right_ear",
    "left_shoulder", "right_shoulder",
    "left_elbow", "right_elbow",
    "left_wrist", "right_wrist",
    "left_hip", "right_hip",
    "left_knee", "right_knee",
    "left_ankle", "right_ankle",
]

try:
    import cv2
    from ultralytics import YOLO

    _HAS_YOLO = True
except ImportError:
    _HAS_YOLO = False
    logger.warning(
        "ultralytics/cv2 not installed — YOLOv8 inference disabled. "
        "Install with: uv add ultralytics"
    )

_model: Any = None


def _get_model() -> Any:
    global _model
    if _model is None:
        _model = YOLO("yolov8n-pose.pt")
        logger.info("YOLOv8n-pose model loaded.")
    return _model


def run_inference(video_path: Path, skip_frames: int = 2) -> list[FrameKeypoints]:
    """Run YOLOv8n-pose on a video file.

    Processes every (skip_frames + 1)th frame. With skip_frames=2 and a 30 fps
    source, effective sample rate is 10 fps — sufficient for rep segmentation and
    fast enough for CPU inference on typical upload lengths.

    Returns an empty list on any failure so the caller can degrade gracefully.
    """
    if not _HAS_YOLO:
        logger.warning("Skipping inference — ultralytics not installed.")
        return []
    if not video_path.exists():
        logger.warning("Video file not found: %s", video_path)
        return []

    # Probe video FPS for accurate timestamps
    fps = 30.0
    try:
        cap = cv2.VideoCapture(str(video_path))
        probed = cap.get(cv2.CAP_PROP_FPS)
        if probed and probed > 0:
            fps = probed
        cap.release()
    except Exception:
        pass

    model = _get_model()
    results_out: list[FrameKeypoints] = []
    raw_idx = 0

    try:
        for result in model(str(video_path), stream=True, verbose=False):
            if raw_idx % (skip_frames + 1) != 0:
                raw_idx += 1
                continue

            keypoints: list[Keypoint] = []
            if (
                result.keypoints is not None
                and result.keypoints.xyn is not None
                and len(result.keypoints.xyn) > 0
            ):
                xy = result.keypoints.xyn[0].tolist()  # [[x, y], ...]
                conf_tensor = result.keypoints.conf
                confs: list[float] = (
                    conf_tensor[0].tolist()
                    if conf_tensor is not None and len(conf_tensor) > 0
                    else [1.0] * len(xy)
                )
                for i, ((x, y), conf) in enumerate(zip(xy, confs)):
                    keypoints.append(
                        Keypoint(
                            x=float(x),
                            y=float(y),
                            z=0.0,
                            visibility=float(conf),
                            name=(
                                YOLO_KP_NAMES[i]
                                if i < len(YOLO_KP_NAMES)
                                else f"kp_{i}"
                            ),
                        )
                    )

            results_out.append(
                FrameKeypoints(
                    frame_index=raw_idx,
                    timestamp_sec=round(raw_idx / fps, 3),
                    keypoints=keypoints,
                )
            )
            raw_idx += 1

    except Exception:
        logger.exception("YOLOv8 inference failed on %s", video_path.name)

    logger.info(
        "Inference done: %d frames extracted from %s", len(results_out), video_path.name
    )
    return results_out
