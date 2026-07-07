import json
import os

from app.robot.constants import FALLBACK_INITIAL_POSE, FALLBACK_PRESETS

NAME_TO_SLOT = {
    "P1":  1,
    "P2":  2,
    "P21": 3,
    "P14": 4,
    "P15": 5,
    "P16": 6,
    "P17": 7,
    "P18": 8,
    "P10": 9,
    "P11": 10,
    "P13": 11,
}


def load_presets_from_json(path):
    if not os.path.exists(path):
        print(f"  [PRESETS] File not found: {path}")
        print("  [PRESETS] Using hardcoded fallback presets.")
        return FALLBACK_INITIAL_POSE, FALLBACK_PRESETS

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        initial_pose = None
        presets      = {}

        for entry in data:
            name   = entry.get("name", "")
            joints = entry.get("joint", [])

            if len(joints) != 6:
                print(f"  [PRESETS] Skipping '{name}' — expected 6 joints, got {len(joints)}")
                continue

            joints = [round(float(j), 4) for j in joints]

            if name == "InitialPose":
                initial_pose = {"name": name, "joints": joints}
                print(f"  [PRESETS] InitialPose loaded: {joints}")
                continue

            slot = NAME_TO_SLOT.get(name)
            if slot is None:
                print(f"  [PRESETS] Skipping '{name}' — not in NAME_TO_SLOT mapping")
                continue

            presets[slot] = {"name": name, "joints": joints}
            label = "(transit)" if slot == 11 else f"Gesture {slot}"
            print(f"  [PRESETS] {label} → {name}: {joints}")

        if not presets:
            raise ValueError("No usable presets found in JSON")

        if initial_pose is None:
            initial_pose = FALLBACK_INITIAL_POSE

        gesture_count = sum(1 for k in presets if k <= 10)
        print(f"  [PRESETS] ✓ Loaded {gesture_count} gesture preset(s) + "
              f"{1 if 11 in presets else 0} transit preset from {path}")
        return initial_pose, presets

    except Exception as e:
        print(f"  [PRESETS] ERROR reading {path}: {e}")
        print("  [PRESETS] Using hardcoded fallback presets.")
        return FALLBACK_INITIAL_POSE, FALLBACK_PRESETS


def build_gesture_map(presets):
    mapping = {}
    for slot in range(1, 11):
        if slot in presets:
            mapping[slot] = slot
        else:
            mapping[slot] = None
    return mapping