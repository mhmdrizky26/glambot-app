import sys
import threading
import time
from collections import deque

import cv2
import numpy as np

from app.detector.mediapipe_backend import (
    init_gesture_recognizer, detect_mediapipe,
    feed_mediapipe_async, close_mediapipe,
)
from app.detector.overlay import draw_overlay

try:
    import pyrealsense2 as rs
    REALSENSE_AVAILABLE = True
except ImportError:
    REALSENSE_AVAILABLE = False


class GestureDetector:

    def __init__(self, config, runtime=None):
        self.config  = config
        self.runtime = runtime

        # Thread + state
        self._lock     = threading.Lock()
        self._running  = False
        self._thread   = None
        self._tracking_active_fn = lambda: True

        # Camera handles
        self._camera      = None
        self._rs_pipeline = None

        # Detection backend
        self._hands_detector = None

        # Latest outputs
        self._latest_frame        = None
        self._latest_detection    = self._empty_detection()
        self._last_full_detection = {}

        # Temporal smoothing
        self._gesture_buffer = deque(maxlen=7)

    # ─────────────────────────────────────────────────────────────
    #  Public API
    # ─────────────────────────────────────────────────────────────
    def start(self, tracking_active_fn=None):
        if tracking_active_fn:
            self._tracking_active_fn = tracking_active_fn
        self._running = True
        self._thread  = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        print("  [DETECTOR] Gesture detector running in background.")

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=3)

    def get_latest_frame(self):
        with self._lock:
            return self._latest_frame.copy() if self._latest_frame is not None else None

    def get_latest_detection(self):
        with self._lock:
            return self._latest_detection.copy()

    def render_annotated(self, **overlay_kwargs):
        """Grab the latest frame and annotate it for MJPEG streaming."""
        frame = self.get_latest_frame()
        if frame is None:
            return None
        with self._lock:
            det  = self._latest_detection.copy()
            full = self._last_full_detection.copy()
        try:
            return draw_overlay(frame, det, full, **overlay_kwargs)
        except Exception:
            return frame

    # ─────────────────────────────────────────────────────────────
    #  Internals
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def _empty_detection():
        return {
            "hand_detected": False,
            "gesture_id":    None,
            "gesture_name":  "None",
            "confidence":    0.0,
            "class_id":      None,
            "bbox":          None,
            "method":        "none",
            "robot_preset":  None,
        }

    def _init_camera(self):
        cfg = self.config
        if cfg.camera_source == "realsense":
            if not REALSENSE_AVAILABLE:
                raise RuntimeError("pyrealsense2 not installed")
            self._rs_pipeline = rs.pipeline()
            rs_cfg = rs.config()
            rs_cfg.enable_stream(rs.stream.color,
                                 cfg.frame_width, cfg.frame_height,
                                 rs.format.bgr8, 30)
            self._rs_pipeline.start(rs_cfg)
            time.sleep(1)
            print(f"  [CAM] RealSense opened: {cfg.frame_width}x{cfg.frame_height}")
            return

        indices = [cfg.camera_index] + [i for i in range(4) if i != cfg.camera_index]
        for idx in indices:
            cap = (cv2.VideoCapture(idx, cv2.CAP_DSHOW)
                   if sys.platform == "win32" else cv2.VideoCapture(idx))
            if cap.isOpened():
                ret, _ = cap.read()
                if ret:
                    self._camera = cap
                    self._camera.set(cv2.CAP_PROP_FRAME_WIDTH,  cfg.frame_width)
                    self._camera.set(cv2.CAP_PROP_FRAME_HEIGHT, cfg.frame_height)
                    self._camera.set(cv2.CAP_PROP_FPS, 30)
                    self._camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)  
                    print(f"  [CAM] Opened camera index {idx}: {cfg.frame_width}x{cfg.frame_height}")
                    return
            cap.release()
        raise RuntimeError("Cannot open any camera (tried indices 0-3)")

    def _read_frame(self):
        if self._camera_source == "realsense" and self._rs_pipeline:
            try:
                frames = self._rs_pipeline.wait_for_frames(timeout_ms=200)
                cf = frames.get_color_frame()
                if cf:
                    frame = np.asanyarray(cf.get_data())
                    frame = cv2.rotate(frame, cv2.ROTATE_180)
                    return cv2.flip(frame, 1)
            except Exception:
                return None
            return None

        if self._camera and self._camera.isOpened():
            self._camera.grab()  
            ret, frame = self._camera.read()
            if ret:
                frame = cv2.rotate(frame, cv2.ROTATE_180)
                return cv2.flip(frame, 1)
        return None

    def _analyze_frame(self, frame, tracking_active):
        if not tracking_active:
            idle = {
                "hand_detected": False,
                "gesture_id":    None,
                "gesture_name":  "Tracking Paused",
                "confidence":    0.0,
                "class_id":      None,
                "bbox":          None,
                "method":        "paused",
                "robot_preset":  None,
            }
            with self._lock:
                self._latest_detection = idle
            return idle

        det = detect_mediapipe(frame, self._hands_detector)
        if det is None:
            det = {
                "hand_detected": False,
                "gesture_id":    None,
                "gesture_name":  "None",
                "confidence":    0.0,
                "class_id":      None,
                "bbox":          None,
                "method":        "none",
            }

        raw_gid = det.get("gesture_id") if det.get("hand_detected") else None
        self._gesture_buffer.append(raw_gid)
        stable_gid = max(set(self._gesture_buffer), key=self._gesture_buffer.count)

        robot_preset = None
        if self.runtime is not None:
            robot_preset = self.runtime.process_gesture(stable_gid)

        det["robot_preset"] = robot_preset

        clean = {k: v for k, v in det.items()
                 if k not in ("landmarks", "landmarks_raw", "handedness")}
        with self._lock:
            self._latest_detection = clean
            self._last_full_detection.clear()
            self._last_full_detection.update(det)
        return det

    def _run(self):
        cfg = self.config
        self._camera_source = cfg.camera_source

        self._init_camera()
        self._hands_detector = init_gesture_recognizer(
            cfg.model_path, cfg.mp_max_hands, cfg.mp_detection_conf, cfg.mp_tracking_conf,
        )
        if not self._hands_detector:
            print("  [ERROR] No detection method available!")

        try:
            while self._running:
                frame = self._read_frame()
                if frame is None:
                    # Hindari busy-spin 100% CPU saat kamera gagal/lepas atau
                    # belum siap — beri jeda singkat sebelum coba baca lagi.
                    time.sleep(0.02)
                    continue

                with self._lock:
                    self._latest_frame = frame.copy()

                feed_mediapipe_async(self._hands_detector, frame, time.time() * 1000)

                self._analyze_frame(frame, self._tracking_active_fn())
        finally:
            if self._camera:
                self._camera.release()
            if self._rs_pipeline:
                try: self._rs_pipeline.stop()
                except Exception: pass
            close_mediapipe(self._hands_detector)
            print("  [CAM] Camera released.")
