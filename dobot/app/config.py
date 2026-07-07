import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

def _require(key: str) -> str:
    value = os.getenv(key)
    if value is None or value.strip() == "":
        raise ValueError(f"[CONFIG ERROR] Missing required env: {key}")
    return value

def _get_bool(key: str) -> bool:
    return _require(key).lower() in ("1", "true", "yes")

def _get_int(key: str) -> int:
    return int(_require(key))

def _get_float(key: str) -> float:
    return float(_require(key))

def _get_optional(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()


@dataclass
class Config:
    camera_index: int
    frame_width: int
    frame_height: int
    camera_source: str

    model_path: str
    mp_detection_conf: float
    mp_tracking_conf: float
    mp_max_hands: int

    host: str
    port: int
    jpeg_quality: int

    dobot_ip: str
    dobot_dashboard_port: int
    dobot_move_port: int
    presets_json: str

    robot_speed_factor: int
    robot_joint_speed: int
    robot_joint_acc: int
    robot_enable_timeout: float

    safety_hold_sec: float
    safety_timeout: float
    preset_debounce_frames: int
    post_action_delay: float
    cooldown_after_capture: float

    backend_url: str


def load_config() -> Config:
    return Config(
        camera_index=_get_int("CAMERA_INDEX"),
        frame_width=_get_int("FRAME_WIDTH"),
        frame_height=_get_int("FRAME_HEIGHT"),
        camera_source=_get_optional("CAMERA_SOURCE"),

        model_path=_require("MP_MODEL_PATH"),
        mp_detection_conf=_get_float("MP_DETECTION_CONF"),
        mp_tracking_conf=_get_float("MP_TRACKING_CONF"),
        mp_max_hands=int(_get_optional("MP_MAX_HANDS")),

        host=_require("HOST"),
        port=_get_int("PORT"),
        jpeg_quality=int(_get_optional("JPEG_QUALITY")),

        dobot_ip=_require("DOBOT_IP"),
        dobot_dashboard_port=int(_get_optional("DOBOT_DASHBOARD_PORT")),
        dobot_move_port=int(_get_optional("DOBOT_MOVE_PORT")),
        presets_json=_require("DOBOT_PRESETS_JSON"),

        robot_speed_factor=int(_get_optional("ROBOT_SPEED_FACTOR")),
        robot_joint_speed=int(_get_optional("ROBOT_JOINT_SPEED")),
        robot_joint_acc=int(_get_optional("ROBOT_JOINT_ACC")),
        robot_enable_timeout=_get_float("ROBOT_ENABLE_TIMEOUT"),

        safety_hold_sec=_get_float("SAFETY_HOLD_SEC"),
        safety_timeout=_get_float("SAFETY_TIMEOUT"),
        preset_debounce_frames=_get_int("PRESET_DEBOUNCE_FRAMES"),
        post_action_delay=_get_float("POST_ACTION_DELAY"),
        cooldown_after_capture=_get_float("COOLDOWN_AFTER_CAPTURE"),

        backend_url=_get_optional("BACKEND_URL"),
    )