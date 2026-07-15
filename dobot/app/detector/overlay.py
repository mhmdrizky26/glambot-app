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
    # Sengaja MINIMALIS: hanya overlay yang menempel pada TANGAN yang
    # dipertahankan — skeleton tangan + bounding box & label gesture di atas
    # tangan — supaya mudah melihat tangan mana yang terdeteksi dan gesture
    # apa. Overlay status lain (safety gate + hold bar, teks gesture besar di
    # pojok, status PRESET/READY, indikator TRACKING, dan status ROBOT) DIHAPUS
    # agar tampilan bersih. Param robot/dry_run/safety_state dibiarkan di
    # signature untuk kompatibilitas pemanggil, meski tak lagi digambar.
    if not detection_paused:
        # ── Hand skeleton ────────────────────────────────────────────
        if full.get("hand_detected") and "landmarks_raw" in full:
            draw_landmarks_manual(out, full["landmarks_raw"])

        # ── Gesture label + bbox (menempel pada tangan) ──────────────
        if det.get("hand_detected"):
            gid   = det["gesture_id"]
            gname = det["gesture_name"]
            bbox  = det["bbox"]
            color = GESTURE_COLORS.get(gid, (255, 255, 255))

            if bbox:
                x1, y1, x2, y2 = [int(v) for v in bbox]
                cv2.rectangle(out, (x1, y1), (x2, y2), color, 3)
                label = f"{gid}: {gname}"
                (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                cv2.rectangle(out, (x1, y1 - lh - 10), (x1 + lw + 10, y1), color, -1)
                cv2.putText(out, label, (x1 + 5, y1 - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    return out