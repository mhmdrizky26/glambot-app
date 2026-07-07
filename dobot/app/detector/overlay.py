import cv2

from app.detector.constants  import GESTURE_COLORS
from app.detector.helpers    import draw_landmarks_manual


def draw_overlay(frame, det, full, *,
                 tracking_active=True,
                 detection_paused=False,
                 robot=None,
                 dry_run=False,
                 safety_state=None):
    out = frame.copy()
    fw, fh = frame.shape[1], frame.shape[0]

    # ── Tracking paused ──────────────────────────────────────────
    if not tracking_active:
        ov = out.copy()
        cv2.rectangle(ov, (0, 0), (fw, fh), (0, 0, 0), -1)
        out = cv2.addWeighted(ov, 0.3, out, 0.7, 0)
        cv2.putText(out, "TRACKING PAUSED", (fw // 2 - 180, fh // 2 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 200, 255), 3)
        cv2.putText(out, "Press [SPACE] to resume", (fw // 2 - 140, fh // 2 + 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
        return out

    # ── Detection visuals ────────────────────────────────────────
    if not detection_paused:
        # ── Safety gate (top-right) ──────────────────────────────────
        if safety_state is not None:
            unlocked   = safety_state.get("unlocked", False)
            hold_sec   = safety_state.get("hold_sec", 0.0)
            hold_total = safety_state.get("hold_total", 4.0)

            if unlocked:
                label    = "SAFETY: UNLOCKED"
                box_col  = (0, 200, 60)
                bar_fill = 1.0
            else:
                label    = "SAFETY: LOCKED"
                box_col  = (0, 0, 180)
                bar_fill = min(hold_sec / max(hold_total, 0.001), 1.0)

            bx, by, bw, bh = fw - 240, 10, 230, 52
            cv2.rectangle(out, (bx, by), (bx + bw, by + bh), (20, 20, 20), -1)
            cv2.rectangle(out, (bx, by), (bx + bw, by + bh), box_col, 2)
            cv2.putText(out, label, (bx + 8, by + 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.52, box_col, 2, cv2.LINE_AA)

            if not unlocked:
                bar_x = bx + 8; bar_y = by + 30
                bar_w = bw - 16; bar_h = 12
                cv2.rectangle(out, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), (50, 50, 50), -1)
                fill_w = int(bar_w * bar_fill)
                if fill_w > 0:
                    r = int(200 * (1.0 - bar_fill))
                    g = int(200 * bar_fill)
                    cv2.rectangle(out, (bar_x, bar_y), (bar_x + fill_w, bar_y + bar_h),
                                  (0, g, r + 30), -1)
                secs_left = hold_total - hold_sec
                bar_label = f"Hold 5 ({secs_left:.1f}s)" if hold_sec > 0 else "Show all fingers"
                cv2.putText(out, bar_label, (bar_x + 4, bar_y + bar_h - 2),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.38, (220, 220, 220), 1, cv2.LINE_AA)
            else:
                time_left = safety_state.get("timeout_left", 0.0)
                cv2.putText(out, f"Auto-lock in {time_left:.1f}s", (bx + 8, by + 44),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.38, (180, 255, 180), 1, cv2.LINE_AA)

        # ── Hand skeleton ────────────────────────────────────────────
        if full.get("hand_detected") and "landmarks_raw" in full:
            draw_landmarks_manual(out, full["landmarks_raw"])

        # ── Gesture label + bbox ─────────────────────────────────────
        if det.get("hand_detected"):
            gid    = det["gesture_id"]
            gname  = det["gesture_name"]
            conf   = det["confidence"]
            bbox   = det["bbox"]
            preset = det.get("robot_preset")
            color  = GESTURE_COLORS.get(gid, (255, 255, 255))

            if bbox:
                x1, y1, x2, y2 = [int(v) for v in bbox]
                cv2.rectangle(out, (x1, y1), (x2, y2), color, 3)
                label = f"{gid}: {gname}"
                (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                cv2.rectangle(out, (x1, y1 - lh - 10), (x1 + lw + 10, y1), color, -1)
                cv2.putText(out, label, (x1 + 5, y1 - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

            cv2.putText(out, str(gid), (20, 70),
                        cv2.FONT_HERSHEY_SIMPLEX, 2.5, color, 5)
            cv2.putText(out, gname, (90, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            cv2.putText(out, f"{conf:.0%}", (90, 80),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 255, 150), 1)

            # Status tag (preset / ready)
            pt = f"PRESET: {preset}" if preset else "READY"
            pc = (0, 255, 0) if preset else (80, 80, 255)

            cv2.putText(out, pt, (fw - 220, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, pc, 2)
            cv2.putText(out, f"[{det.get('method', '')}]", (10, fh - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1)
        else:
            cv2.putText(out, "No hand detected", (20, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100, 100, 255), 2)
            cv2.putText(out, "READY", (fw - 220, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (80, 80, 255), 2)

    # ── Tracking indicator ───────────────────────────────────────
    cv2.circle(out, (20, fh - 20), 8, (0, 255, 0), -1)
    cv2.putText(out, "TRACKING", (35, fh - 13),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1)

    # ── Robot status (bottom-right) ──────────────────────────────
    if robot and robot.connected:
        st, sc = ("ROBOT: ONLINE", (0, 255, 0)) if robot.enabled else ("ROBOT: DISABLED", (0, 200, 255))
    elif dry_run:
        st, sc = "ROBOT: DRY RUN", (0, 255, 255)
    else:
        st, sc = "ROBOT: OFFLINE", (80, 80, 255)
    cv2.putText(out, st, (fw - 230, fh - 15),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, sc, 2)

    return out