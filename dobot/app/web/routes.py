import time
import threading
import cv2
from flask import Flask, Response, jsonify, request, send_from_directory

try:
    from flask_cors import CORS
    _HAS_CORS = True
except ImportError:
    _HAS_CORS = False

import os
from app.detector.constants import GESTURE_ID_TO_NAME

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")


def create_app(runtime):
    app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=None)
    if _HAS_CORS:
        CORS(app)

    cfg = runtime.config

    @app.route("/")
    def dashboard():
        return send_from_directory(TEMPLATE_DIR, "dashboard.html")

    @app.route("/assets/<path:filename>")
    def assets(filename):
        return send_from_directory(TEMPLATE_DIR, filename)

    @app.route("/video_feed")
    @app.route("/stream")
    def video_feed():
        _CAPTURE_STATES = {"MOVING", "COOLDOWN"}

        def gen():
            while runtime.running:
                if runtime.detector:
                    frame = runtime.detector.render_annotated(
                        tracking_active=runtime.tracking_active,
                        detection_paused=runtime.fsm_state in _CAPTURE_STATES,
                    )
                    if frame is not None:
                        _, buf = cv2.imencode(
                            ".jpg", frame,
                            [cv2.IMWRITE_JPEG_QUALITY, cfg.jpeg_quality],
                        )
                        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                               + buf.tobytes() + b"\r\n")
                time.sleep(0.033)
        return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")

    @app.route("/detection")
    def api_detection():
        d    = runtime.detector.get_latest_detection() if runtime.detector else {}
        hand = bool(d.get("hand_detected"))

        preset_name = (str(runtime.selected_preset)
                       if isinstance(runtime.selected_preset, int) else None)

        progress = runtime.recognition_progress()

        return jsonify({
            "session_active":       runtime.session_active,
            "hand_detected":        hand,
            "gesture_id":           d.get("gesture_id"),
            "gesture_name":         d.get("gesture_name"),
            "confidence":           d.get("confidence"),
            "method":               d.get("method") or ("mediapipe" if hand else "idle"),
            "tracking":             runtime.tracking_active,
            "fsm_state":            runtime.fsm_state,
            "status":               progress["label"],
            "recognition_progress": progress,
            "robot_preset":         preset_name,
            "robot": {
                "connected":      runtime.robot.connected if runtime.robot else False,
                "enabled":        getattr(runtime.robot, "enabled", False),
                "current_preset": getattr(runtime.robot, "current_preset", None),
                "ip":             cfg.dobot_ip,
            },
        })

    @app.route("/detection/hold", methods=["POST"])
    def api_detection_hold():
        # Frontend memberi tahu "narasi sedang diputar, tahan deteksi sekian detik".
        # Dipakai untuk SETIAP putaran inisiasi/unlock — jadwal loop-nya hanya
        # diketahui frontend, jadi robot cukup menghormati deadline yang dikirim.
        data    = request.get_json(silent=True) or {}
        seconds = data.get("seconds", runtime.config.locked_announce_sec)
        left    = runtime.hold_detection(seconds)
        return jsonify({"holding": left > 0, "seconds_left": round(left, 2)})

    @app.route("/presence")
    def api_presence():
        # Sinyal ringan untuk layar Home: ada gerakan di depan kamera dalam
        # `presence_hold_sec` terakhir? Home hanya butuh 1 boolean ini (bukan
        # seluruh payload /detection), jadi poll-nya murah. motion_ratio disertakan
        # untuk kalibrasi ambang di lokasi.
        det = runtime.detector
        return jsonify({
            "present":      bool(det.presence) if det else False,
            "motion_ratio": round(getattr(det, "_motion_ratio", 0.0), 2) if det else 0.0,
        })

    @app.route("/status")
    def api_status():
        return jsonify({
            "running":           runtime.running,
            "tracking":          runtime.tracking_active,
            "fsm_state":         runtime.fsm_state,
            "capture_locked":    runtime.capture_in_progress,
            "gestures":          GESTURE_ID_TO_NAME,
            "gesture_to_preset": {str(k): v for k, v in runtime.gesture_map.items()},
            "presets":           {str(k): v["name"] for k, v in runtime.presets.items()},
            "robot": {
                "connected":      runtime.robot.connected if runtime.robot else False,
                "enabled":        getattr(runtime.robot, "enabled", False),
                "current_preset": getattr(runtime.robot, "current_preset", None),
                "dry_run":        runtime.dry_run,
            },
        })

    @app.route("/config/gesture_map")
    def api_gesture_map():
        return jsonify({
            "gesture_to_preset": {str(k): v for k, v in runtime.gesture_map.items()},
            "presets":           {str(k): v["name"] for k, v in runtime.presets.items()},
        })

    @app.route("/config/runtime", methods=["GET", "POST"])
    def api_config_runtime():
        # GET: nilai tuning saat ini. POST: terapkan (dari backend admin).
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
            applied = runtime.apply_runtime_settings(data)
            print(f"  [CONFIG] Runtime tuning diperbarui: {applied}")
            return jsonify({"status": "applied", "settings": applied})
        return jsonify(runtime.current_runtime_settings())

    @app.route("/tracking/start", methods=["POST"])
    def api_tracking_start():
        runtime.start_tracking()
        return jsonify({"tracking": True})

    @app.route("/tracking/stop", methods=["POST"])
    def api_tracking_stop():
        runtime.stop_tracking()
        return jsonify({"tracking": False})

    @app.route("/tracking/status")
    def api_tracking_status():
        return jsonify({"tracking": runtime.tracking_active})

    # ── Robot ─────────────────────────────────────────────────────
    @app.route("/robot/enable", methods=["POST"])
    def api_robot_enable():
        # Dry-run (--no-robot): tidak ada hardware untuk di-enable/home. Cukup
        # buka session supaya FSM (lock/unlock + preset) bisa dites dari Monitor 2.
        if runtime.dry_run:
            runtime.session_active = True
            runtime.notify_session_started()
            print("  [SESSION] ✓ Started (dry-run)")
            return jsonify({"status": "enabled", "message": "Dry-run session active"})

        if not runtime.robot or not runtime.robot.connected:
            return jsonify({"error": "not connected"}), 503
        if runtime.robot.enabled:
            return jsonify({"status": "already_enabled"})

        def _enable_and_home():
            if runtime.robot.initialize():
                runtime.robot.enabled = True
                runtime.session_active = True
                # Stamp awal LOCKED sekarang (bukan setelah home) supaya grace juga
                # menahan deteksi unlock selama robot masih bergerak ke initial pose.
                runtime.notify_session_started()
                print("  [ROBOT] Moving to initial pose after enable...")
                runtime.robot.move_to_initial_pose(runtime.presets)
                runtime.robot.wait_until_idle(timeout=runtime.config.safety_timeout)  # [BARU] tunggu idle, bukan delay buta
                # [BARU] Verifikasi current_preset ke posisi FISIK (anti state basi
                # kalau robot sempat digerakkan manual lewat Dobot Studio).
                runtime.robot.sync_current_preset(runtime.presets)
                print("  [ROBOT] ✓ At initial pose")
                print("  [SESSION] ✓ Started")

        threading.Thread(target=_enable_and_home, daemon=True, name="robot_enable").start()
        return jsonify({
            "status":  "enabling",
            "message": "Robot diaktifkan dan bergerak ke initial pose (preset 2)",
        })

    @app.route("/robot/disable", methods=["POST"])
    def api_robot_disable():
        # Dry-run (--no-robot): cukup tutup session (tanpa home/servo-off nyata).
        if runtime.dry_run:
            runtime.session_active = False
            print("  [SESSION] ✓ Ended (dry-run)")
            return jsonify({"status": "disabled", "message": "Dry-run session ended"})

        if not runtime.robot or not runtime.robot.connected:
            return jsonify({"error": "not connected"}), 503
        if not runtime.robot.enabled:
            return jsonify({"status": "already_disabled"})

        runtime.session_active = False
        print("  [SESSION] ✓ Ended")

        def _home_and_disable():
            print("  [ROBOT] Returning to initial pose before disable...")
            runtime.robot.move_to_initial_pose(runtime.presets)
            runtime.robot.wait_until_idle()   # off as soon as the home move finishes
            runtime.robot.disable()
            print("  [ROBOT] ✓ Disabled")

        threading.Thread(target=_home_and_disable, daemon=True, name="robot_disable").start()
        return jsonify({
            "status":  "disabling",
            "message": "Robot kembali ke initial pose lalu langsung dimatikan",
        })

    @app.route("/robot/stop", methods=["POST"])
    def api_robot_stop():
        if runtime.robot and runtime.robot.connected:
            runtime.robot.stop()
            return jsonify({"status": "stopped"})
        return jsonify({"error": "not connected"}), 503

    @app.route("/robot/preset", methods=["POST"])
    def api_robot_preset():
        if runtime.capture_in_progress:
            return jsonify({"error": "busy — robot sedang bergerak"}), 409

        data = request.get_json(silent=True) or {}

        preset_raw = data.get("preset")
        if preset_raw is None:
            return jsonify({"error": "preset is required"}), 400

        try:
            preset_num = int(preset_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "invalid preset — harus berupa angka"}), 400

        if preset_num not in runtime.presets:
            return jsonify({"error": f"preset {preset_num} not defined"}), 404

        if not runtime.trigger_preset(preset_num):
            return jsonify({"error": "could not queue preset"}), 409

        preset_name = runtime.presets[preset_num]["name"]
        return jsonify({
            "status":      "moving",
            "preset":      preset_num,
            "preset_name": preset_name,
            "message":     f"Robot bergerak ke preset {preset_num} ({preset_name})",
        })

    @app.route("/robot/status")
    def api_robot_status():
        return jsonify({
            "connected":           runtime.robot.connected if runtime.robot else False,
            "enabled":             getattr(runtime.robot, "enabled", False),
            "current_preset":      getattr(runtime.robot, "current_preset", None),
            "capture_in_progress": runtime.capture_in_progress,
            "fsm_state":           runtime.fsm_state,
        })

    @app.route("/robot/live")
    def api_robot_live():
        if not runtime.robot or not runtime.robot.connected:
            return jsonify({"error": "not connected"}), 503
        if runtime.capture_in_progress:
            # Hindari rebutan soket dengan gerakan yang sedang jalan.
            return jsonify({"error": "busy — robot sedang bergerak"}), 409
        return jsonify(runtime.robot.live_state(runtime.presets))

    @app.route("/health")
    def api_health():
        return jsonify({"status": "ok", "service": "robot-controller"})

    @app.route("/shutdown", methods=["POST"])
    def api_shutdown():
        runtime.running = False
        return jsonify({"status": "shutting down"})

    return app