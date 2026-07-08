import threading
import time
import urllib.request
import json

from app.robot import DobotController, load_presets_from_json, build_gesture_map


# Parameter tuning yang boleh diubah live dari admin (via backend Go).
# key camelCase (dari API) → (atribut config, min, max, apakah integer).
# Rentang HARUS sama dengan robotRanges di backend handlers/robot_settings.go.
RUNTIME_TUNABLES = {
    "robotSpeedFactor":     ("robot_speed_factor",     1,   100, True),
    "robotJointSpeed":      ("robot_joint_speed",      1,   100, True),
    "robotJointAcc":        ("robot_joint_acc",        1,   100, True),
    "safetyHoldSec":        ("safety_hold_sec",        0.5, 10,  False),
    "safetyTimeout":        ("safety_timeout",         3,   60,  False),
    "presetDebounceFrames": ("preset_debounce_frames", 5,   120, True),
    "postActionDelay":      ("post_action_delay",      0,   5,   False),
}

# Field yang mempengaruhi kecepatan gerak — kalau salah satu berubah, kirim ulang
# SpeedFactor/SpeedJ/AccJ ke robot lewat set_speed().
_SPEED_ATTRS = ("robot_speed_factor", "robot_joint_speed", "robot_joint_acc")


def apply_tunables(config, data: dict) -> set:
    """Clamp & set key tuning yang dikenal pada objek config. Key tak dikenal /
    nilai rusak diabaikan (aman terhadap payload berlebih). Dipakai bersama oleh
    endpoint runtime dan startup-override — mengembalikan set nama atribut yang
    benar-benar berubah."""
    changed = set()
    for key, (attr, lo, hi, is_int) in RUNTIME_TUNABLES.items():
        if key not in data or data[key] is None:
            continue
        try:
            val = float(data[key])
        except (TypeError, ValueError):
            continue  # nilai rusak → lewati, jangan crash
        val = max(lo, min(hi, val))
        val = int(val) if is_int else val
        if getattr(config, attr) != val:
            setattr(config, attr, val)
            changed.add(attr)
    return changed


class Runtime:

    def __init__(self, config, *, dry_run=False):
        self.config  = config
        self.dry_run = dry_run

        # ── Presets ──────────────────────────────────────────────
        _, self.presets = load_presets_from_json(config.presets_json)
        self.gesture_map = build_gesture_map(self.presets)

        # ── Robot ────────────────────────────────────────────────
        self.robot   = DobotController(
            config.dobot_ip,
            config.dobot_dashboard_port,
            config.dobot_move_port,
            speed_factor=config.robot_speed_factor,
            joint_speed=config.robot_joint_speed,
            joint_acc=config.robot_joint_acc,
            enable_timeout=config.robot_enable_timeout,
        )

        # ── Flags ────────────────────────────────────────────────
        self.running         = True
        self.tracking_active = True
        self.detector        = None
        self.session_active  = False

        # ── FSM ──────────────────────────────────────────────────
        self._fsm_state   = "LOCKED"
        self._fsm_lock    = threading.Lock()

        self._unlock_start_time    = 0.0
        self._unlocked_at          = 0.0
        self._confirm_counter      = 0
        self._confirm_gesture      = None
        self._selected_preset      = None
        self._unlock_grace_gesture = None
        self._capture_in_progress  = False

    # ─────────────────────────────────────────────────────────────
    #  Runtime tuning (dari admin lewat backend)
    # ─────────────────────────────────────────────────────────────
    def apply_runtime_settings(self, data: dict) -> dict:
        """Terapkan parameter tuning (speed/timing) ke config yang sedang jalan.

        Hanya key yang dikenal & bernilai numerik valid yang diterapkan; sisanya
        diabaikan (aman terhadap payload berlebih). Nilai di-clamp ke rentang.
        Field timing dibaca live oleh FSM tiap frame → langsung berlaku. Field
        speed dikirim ulang ke robot via set_speed(). Mengembalikan snapshot
        nilai config saat ini.
        """
        changed = apply_tunables(self.config, data)

        # Kirim ulang kecepatan ke robot hanya kalau field speed berubah DAN robot
        # benar-benar terhubung & tidak dry-run (set_speed sendiri guard `connected`).
        if changed.intersection(_SPEED_ATTRS) and self.robot and not self.dry_run and self.robot.connected:
            self.robot.set_speed(
                speed_factor=self.config.robot_speed_factor,
                joint_speed=self.config.robot_joint_speed,
                joint_acc=self.config.robot_joint_acc,
            )

        return self.current_runtime_settings()

    def current_runtime_settings(self) -> dict:
        """Snapshot nilai tuning saat ini (camelCase) — untuk response endpoint."""
        return {
            key: getattr(self.config, attr)
            for key, (attr, _lo, _hi, _int) in RUNTIME_TUNABLES.items()
        }

    # ─────────────────────────────────────────────────────────────
    #  Hardware init
    # ─────────────────────────────────────────────────────────────
    def init_hardware(self):
        cfg = self.config

        if self.dry_run:
            print("\n  [DRY RUN] Robot commands will be printed, not sent")
            self.robot.connected = True
            self.robot.enabled   = True

            def fake_move(joints, name="Custom"):
                print(f"  [DRY RUN] JointMovJ({','.join(f'{j:.2f}' for j in joints)})  # {name}")
                self.robot.last_move_time = time.time()
                return True

            self.robot.move_to_joints = fake_move
            return

        print(f"\n  Connecting to Dobot Nova at {cfg.dobot_ip}...")
        if not self.robot.connect():
            print("  Running in vision-only mode (robot offline)")
            return

        print("  [ROBOT] Connected — initializing & enabling...")
        if self.robot.initialize():
            self.robot.enabled = True
            print("  [ROBOT] ✓ Enabled and ready")

            print("  [ROBOT] Moving to initial pose...")
            self.robot.move_to_initial_pose(self.presets)
            self.robot.wait_until_idle(timeout=self.config.safety_timeout)   # [BARU] tunggu idle, bukan delay buta
            print("  [ROBOT] ✓ At initial pose")

            self.robot.disable()
            print("  [ROBOT] ✓ Standby — servo off, tunggu /robot/enable dari backend")
        else:
            print("  [ROBOT] ⚠ Initialize failed — robot not enabled")

    # ─────────────────────────────────────────────────────────────
    #  Backend callback — fire-and-forget di thread terpisah
    # ─────────────────────────────────────────────────────────────
    def _notify_backend(self, path: str, payload: dict):
        if not self.session_active:
            print(f"  [CALLBACK] Skipped POST {path} — session inactive")
            return

        url  = self.config.backend_url.rstrip("/") + path
        data = json.dumps(payload).encode("utf-8")

        def _send():
            try:
                req = urllib.request.Request(
                    url, data=data,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=2) as resp:
                    print(f"  [CALLBACK] POST {path} → {resp.status}")
            except Exception as e:
                print(f"  [CALLBACK] POST {path} failed: {e}")

        threading.Thread(target=_send, daemon=True, name=f"notify_{path}").start()

    # ─────────────────────────────────────────────────────────────
    #  Capture pipeline
    # ─────────────────────────────────────────────────────────────
    def _run_move_sequence(self, preset_num):
        try:
            with self._fsm_lock:
                self._fsm_state = "MOVING"

            preset = self.presets[preset_num]
            already_there = (not self.dry_run
                             and self.robot.connected and self.robot.enabled
                             and self.robot.current_preset == preset_num)

            if already_there:
                # Sudah di preset tujuan → TIDAK kirim /moving (biar suara "moving"
                # di backend tidak ke-trigger padahal robot diam). Langsung /done
                # saja supaya backend langsung mulai hitung 3-2-1.
                print(f"  [RUNTIME] ✓ Sudah di preset {preset_num} ({preset['name']}) "
                      f"— skip /moving, langsung /done")
            else:
                print(f"  [RUNTIME] ▶ Moving to preset {preset_num} ({preset['name']})")

                # Robot benar-benar bergerak → kirim /moving (trigger suara moving).
                self._notify_backend("/api/robot/moving", {
                    "preset":      preset_num,
                    "preset_name": preset["name"],
                    "status":      "moving",
                })

                if not self.dry_run:
                    ok = self.robot.move_to_preset(preset_num, self.presets)
                    if not ok:
                        print(f"  [RUNTIME ⚠] move_to_preset returned False — "
                              f"connected={self.robot.connected}, enabled={self.robot.enabled}")
                else:
                    self.robot.move_to_joints(preset["joints"], name=preset["name"])
                self.robot.wait_until_idle(timeout=self.config.safety_timeout)
                time.sleep(self.config.post_action_delay)
                print(f"  [RUNTIME] ✓ Robot selesai bergerak ke preset {preset_num}")

            self._notify_backend("/api/robot/done", {
                "preset":      preset_num,
                "preset_name": preset["name"],
                "status":      "done",
            })

            with self._fsm_lock:
                self._fsm_state = "COOLDOWN"

            time.sleep(self.config.cooldown_after_capture)

        except Exception as e:
            print(f"  [RUNTIME ERROR] Move sequence: {e}")
        finally:
            with self._fsm_lock:
                self._reset_to_locked()
            self._capture_in_progress = False
            print("  [RUNTIME] ══ Sequence complete — system back to LOCKED ══\n")

    # ─────────────────────────────────────────────────────────────
    #  Tracking control
    # ─────────────────────────────────────────────────────────────
    def _reset_to_locked(self):
        self._fsm_state            = "LOCKED"
        self._unlock_start_time    = 0.0
        self._unlocked_at          = 0.0
        self._confirm_counter      = 0
        self._confirm_gesture      = None
        self._selected_preset      = None
        self._unlock_grace_gesture = None

    def start_tracking(self):
        if not self.tracking_active:
            self.tracking_active = True
            with self._fsm_lock:
                self._reset_to_locked()
            print("  [TRACKING] ► Started")

    def stop_tracking(self):
        if self.tracking_active:
            self.tracking_active = False
            with self._fsm_lock:
                self._reset_to_locked()
            self._capture_in_progress = False
            if self.robot and self.robot.connected and self.robot.enabled:
                self.robot.stop()
            print("  [TRACKING] ■ Stopped")

    # ─────────────────────────────────────────────────────────────
    #  Manual trigger
    # ─────────────────────────────────────────────────────────────
    def trigger_preset(self, preset_num):
        if preset_num not in self.presets:
            return False

        # Check-and-set atomik DI DALAM lock — cegah dua panggilan /robot/preset
        # (thread Flask) atau race dengan FSM meloloskan dua sekuens gerak
        # sekaligus (TOCTOU: dulu cek di luar lock, set di dalam lock).
        with self._fsm_lock:
            if self._capture_in_progress:
                return False
            self._capture_in_progress = True
            self._selected_preset     = preset_num
            self._fsm_state           = "MOVING"

        threading.Thread(
            target=self._run_move_sequence,
            args=(preset_num,),
            daemon=True,
            name=f"move_preset_{preset_num}",
        ).start()
        return True

    # ─────────────────────────────────────────────────────────────
    #  FSM
    # ─────────────────────────────────────────────────────────────
    def process_gesture(self, gesture_id):
        if self._capture_in_progress:
            return self._selected_preset
        if not self.session_active:
            return None

        if not self.tracking_active:
            return None

        with self._fsm_lock:
            state = self._fsm_state

            if state in ("LOCKED", "UNLOCKING"):
                if gesture_id == 5:
                    if self._unlock_start_time == 0.0:
                        self._unlock_start_time = time.time()
                        self._fsm_state = "UNLOCKING"

                    held = time.time() - self._unlock_start_time
                    if held >= self.config.safety_hold_sec:
                        self._fsm_state            = "UNLOCKED"
                        self._unlocked_at          = time.time()
                        self._unlock_start_time    = 0.0
                        self._unlock_grace_gesture = 5
                        print("  [FSM] ✓ UNLOCKED")
                else:
                    self._unlock_start_time = 0.0
                    if state == "UNLOCKING":
                        self._fsm_state = "LOCKED"
                return None

            if state in ("UNLOCKED", "CONFIRMING"):
                if time.time() - self._unlocked_at > self.config.safety_timeout:
                    print("  [FSM] Auto-lock (timeout)")
                    self._reset_to_locked()
                    return None

                if gesture_id is None:
                    self._confirm_counter      = 0
                    self._confirm_gesture      = None
                    self._unlock_grace_gesture = None
                    if state == "CONFIRMING":
                        self._fsm_state = "UNLOCKED"
                    return None

                if self._unlock_grace_gesture is not None:
                    if gesture_id == self._unlock_grace_gesture:
                        self._confirm_counter = 0
                        self._confirm_gesture = None
                        if state == "CONFIRMING":
                            self._fsm_state = "UNLOCKED"
                        return None
                    else:
                        self._unlock_grace_gesture = None

                action = self.gesture_map.get(gesture_id)
                if action is None:
                    self._confirm_counter = 0
                    self._confirm_gesture = None
                    return None

                if gesture_id == self._confirm_gesture:
                    self._confirm_counter += 1
                else:
                    self._confirm_gesture = gesture_id
                    self._confirm_counter = 1
                    self._fsm_state = "CONFIRMING"

                if self._confirm_counter >= self.config.preset_debounce_frames:
                    self._confirm_counter = 0
                    self._confirm_gesture = None

                    if isinstance(action, int):
                        self._selected_preset     = action
                        self._capture_in_progress = True
                        self._fsm_state           = "MOVING"
                        print(f"  [FSM] ▶ Preset {action} confirmed")
                        threading.Thread(
                            target=self._run_move_sequence,
                            args=(action,),
                            daemon=True,
                            name=f"capture_preset_{action}",
                        ).start()
                        return action

                return self._selected_preset

        return None

    # ─────────────────────────────────────────────────────────────
    #  UI accessors
    # ─────────────────────────────────────────────────────────────
    @property
    def fsm_state(self):
        return self._fsm_state

    @property
    def selected_preset(self):
        return self._selected_preset

    @property
    def capture_in_progress(self):
        return self._capture_in_progress

    def safety_snapshot(self):
        return {
            "unlocked":       self._fsm_state not in ("LOCKED", "UNLOCKING"),
            "hold_sec":       (time.time() - self._unlock_start_time) if self._unlock_start_time > 0 else 0.0,
            "hold_total":     self.config.safety_hold_sec,
            "timeout_left":   max(0.0, self.config.safety_timeout - (time.time() - self._unlocked_at))
                              if self._fsm_state in ("UNLOCKED", "CONFIRMING") else 0.0,
            "timeout_total":  self.config.safety_timeout,
            "presets":        self.presets,
            "gesture_map":    self.gesture_map,
            "debounce_ratio": self._confirm_counter / self.config.preset_debounce_frames
                              if self.config.preset_debounce_frames > 0 else 0.0,
            "debounce_gid":   self._confirm_gesture,
        }

    def recognition_progress(self):
        now = time.time()
        cfg = self.config

        arm_elapsed = 0.0
        if self._fsm_state in ("LOCKED", "UNLOCKING") and self._unlock_start_time > 0:
            arm_elapsed = min(now - self._unlock_start_time, cfg.safety_hold_sec)
        elif self._fsm_state not in ("LOCKED", "UNLOCKING"):
            arm_elapsed = cfg.safety_hold_sec

        preset_elapsed = 0.0
        if self._fsm_state == "CONFIRMING":
            preset_elapsed = min(self._confirm_counter / max(1, cfg.preset_debounce_frames), 1.0)
        elif self._fsm_state in ("MOVING", "COOLDOWN"):
            preset_elapsed = 1.0

        label = {
            "LOCKED":     "Hold gesture 5 to unlock",
            "UNLOCKING":  f"Unlocking… {arm_elapsed:.1f}/{cfg.safety_hold_sec:.1f}s",
            "UNLOCKED":   "Unlocked — choose preset gesture",
            "CONFIRMING": f"Holding gesture {self._confirm_gesture}… ({self._confirm_counter}/{cfg.preset_debounce_frames})",
            "MOVING":     "Robot moving to preset…",
            "COOLDOWN":   "Waiting for backend…",
        }.get(self._fsm_state, "")

        return {
            "label":  label,
            "arm":    {"percent": max(0, min(100, int(100 * arm_elapsed / cfg.safety_hold_sec)))},
            "preset": {"percent": max(0, min(100, int(100 * preset_elapsed)))},
        }

    def stop(self):
        self.running = False
        if self.detector:
            self.detector.stop()
        if self.robot and not self.dry_run and self.robot.connected and self.robot.enabled:
            print("  [ROBOT] Returning to initial pose before shutdown...")
            self.robot.move_to_initial_pose(self.presets)
            self.robot.wait_until_idle(timeout=self.config.safety_timeout)   # [BARU] tunggu idle, bukan delay buta
            self.robot.disconnect()