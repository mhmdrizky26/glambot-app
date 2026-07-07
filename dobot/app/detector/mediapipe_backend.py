import os

import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from app.detector.constants import CATEGORY_TO_ID, GESTURE_ID_TO_NAME
from app.detector.helpers import landmarks_to_bbox


def init_gesture_recognizer(model_path, max_hands, det_conf, track_conf):
    if not os.path.exists(model_path):
        print(f"  [ERROR] GestureRecognizer model not found: {model_path}")
        return None

    try:
        last_result = [None]

        def _on_result(result, output_image, timestamp_ms):
            last_result[0] = result

        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.GestureRecognizerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.LIVE_STREAM,
            result_callback=_on_result,
            num_hands=max_hands,
            min_hand_detection_confidence=det_conf,
            min_hand_presence_confidence=det_conf,
            min_tracking_confidence=track_conf,
        )
        recognizer = vision.GestureRecognizer.create_from_options(options)

        print(f"  [OK] GestureRecognizer ready — {model_path}")
        return {
            "type":        "gesture_recognizer",
            "recognizer":  recognizer,
            "last_result": last_result,
        }
    except Exception as e:
        print(f"  [ERROR] GestureRecognizer init: {e}")
        return None


def read_gesture_result(frame, result):
    empty = {
        "hand_detected": False,
        "gesture_id":    None,
        "gesture_name":  "None",
        "confidence":    0.0,
        "class_id":      None,
        "bbox":          None,
        "method":        "GestureRecognizer",
    }
    if result is None or not result.gestures:
        return empty

    h, w, _ = frame.shape
    best = None
    best_area = -1

    n_hands = len(result.gestures)
    for i in range(n_hands):
        if not result.gestures[i]:
            continue
        top = result.gestures[i][0]
        gid = CATEGORY_TO_ID.get(top.category_name)
        if gid is None:
            continue

        lm_raw = None
        bbox   = None
        if result.hand_landmarks and i < len(result.hand_landmarks):
            lm_raw = result.hand_landmarks[i]
            bbox   = landmarks_to_bbox(lm_raw, w, h)

        area = (max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1])) if bbox else 0

        if area > best_area:
            best_area = area
            best = {
                "hand_detected": True,
                "gesture_id":    gid,
                "gesture_name":  GESTURE_ID_TO_NAME.get(gid, top.category_name),
                "confidence":    top.score,
                "class_id":      gid - 1 if gid < 10 else 0,
                "bbox":          bbox,
                "method":        "GestureRecognizer",
                "landmarks_raw": lm_raw,
                "hands_seen":    n_hands,
            }

    return best if best else empty


def detect_mediapipe(frame, hands_detector):
    if hands_detector is None:
        return None
    if isinstance(hands_detector, dict) and hands_detector.get("type") == "gesture_recognizer":
        return read_gesture_result(frame, hands_detector["last_result"][0])
    return None


def normalize_frame(frame):
    import cv2
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


def feed_mediapipe_async(hands_detector, frame, timestamp_ms):
    import cv2
    if not isinstance(hands_detector, dict):
        return
    if hands_detector.get("type") != "gesture_recognizer":
        return
    try:
        rgb    = cv2.cvtColor(normalize_frame(frame), cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        hands_detector["recognizer"].recognize_async(mp_img, int(timestamp_ms))
    except Exception as e:
        print(f"  [WARN] recognize_async: {e}")


def close_mediapipe(hands_detector):
    if isinstance(hands_detector, dict):
        try:
            hands_detector["recognizer"].close()
        except Exception:
            pass
