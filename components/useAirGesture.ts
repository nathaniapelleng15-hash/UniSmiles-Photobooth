import { useRef, useState, useCallback, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
export type GestureType = 'none' | 'pinch' | 'open_hand';

export interface CursorState { x: number; y: number; }

export interface AirGestureState {
  cursorPos: CursorState | null;
  gesture: GestureType;
  /** Progress 0-1 of the 3-second hold timer */
  holdProgress: number;
  /** True when a hold-click has just been fired (for visual feedback) */
  holdFired: boolean;
  /** Is currently pinch-scrolling */
  isPinching: boolean;
}

export interface AirGestureCallbacks {
  /** Called when the hold-click fires on a specific element */
  onHoldClick?: (element: Element) => void;
  /** Called every frame during open-hand hold – useful for "start photo" trigger */
  onOpenHandHold?: (durationMs: number, element: Element | null) => void;
}

interface CalibrationBox {
  minX: number; maxX: number; minY: number; maxY: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const HOLD_CLICK_MS      = 3000;  // 3 s to fire hold-click
const PINCH_CLICK_MAX_MS = 600;   // quick pinch → click
const PINCH_CLICK_MAX_PX = 30;    // quick pinch move tolerance
const SMOOTHING          = 0.35;  // cursor EMA (0=none, 1=frozen)

// ─── Helpers ──────────────────────────────────────────────────────────────────
const dist = (a: any, b: any) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const mapRange = (v: number, lo: number, hi: number): number => {
  const mapped   = (v - lo) / (hi - lo);
  const expanded = (mapped - 0.5) * 1.3 + 0.5;
  return Math.max(0, Math.min(1, expanded));
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAirGesture(
  enabled: boolean,
  calibrationBox: CalibrationBox,
  callbacks: AirGestureCallbacks = {}
) {
  // ── Config refs – updated every render, never stale ────────────────────────
  const enabledRef       = useRef(enabled);
  const calibBoxRef      = useRef(calibrationBox);
  const callbacksRef     = useRef(callbacks);

  // Update refs synchronously on every render (no useEffect delay)
  enabledRef.current    = enabled;
  calibBoxRef.current   = calibrationBox;
  callbacksRef.current  = callbacks;

  // ── Gesture tracking refs ──────────────────────────────────────────────────
  const smoothedPos      = useRef<{ x: number; y: number } | null>(null);
  const prevPos          = useRef<{ x: number; y: number } | null>(null);

  const pinchingRef      = useRef(false);
  const pinchStartRef    = useRef<{
    x: number; y: number; time: number;
    scrollTarget: Element | null; clickTarget: Element | null;
  } | null>(null);

  const holdStartRef     = useRef<number | null>(null);
  const holdElementRef   = useRef<Element | null>(null);
  const holdFiredRef     = useRef(false);
  const lastHoldFireRef  = useRef(0);

  // ── Exposed state ──────────────────────────────────────────────────────────
  const [state, setState] = useState<AirGestureState>({
    cursorPos: null, gesture: 'none', holdProgress: 0, holdFired: false, isPinching: false,
  });

  // ── Scrollable parent finder ───────────────────────────────────────────────
  const findScrollable = (el: Element | null): Element | null => {
    if (!el || el === document.body) return null;
    const s = window.getComputedStyle(el);
    if (
      (['auto', 'scroll'].includes(s.overflowY) || ['auto', 'scroll'].includes(s.overflow)) &&
      el.scrollHeight > el.clientHeight
    ) return el;
    return findScrollable(el.parentElement);
  };

  // ── Main landmark processor (STABLE – never recreated) ──────────────────────
  // Reads enabled/calibration from refs → immune to stale closure
  const processLandmarks = useCallback((landmarks: any[]) => {
    // Always read the latest values from refs
    const en  = enabledRef.current;
    const box = calibBoxRef.current;

    if (!en) {
      smoothedPos.current = null;
      setState(s => ({ ...s, cursorPos: null, gesture: 'none', holdProgress: 0 }));
      return;
    }

    // ── 1. Key landmarks ────────────────────────────────────────────────────
    const wrist     = landmarks[0];
    const thumbTip  = landmarks[4];
    const indexTip  = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip   = landmarks[16];
    const pinkyTip  = landmarks[20];
    const middleMcp = landmarks[9];

    // ── 2. Map cursor position ───────────────────────────────────────────────
    const rawX    = 1 - indexTip.x;          // mirror horizontally
    const rawY    = indexTip.y;
    const mappedX = mapRange(rawX, box.minX, box.maxX);
    const mappedY = mapRange(rawY, box.minY, box.maxY);
    const targetX = mappedX * window.innerWidth;
    const targetY = mappedY * window.innerHeight;

    // EMA smoothing
    if (!smoothedPos.current) {
      smoothedPos.current = { x: targetX, y: targetY };
    } else {
      smoothedPos.current = {
        x: smoothedPos.current.x * SMOOTHING + targetX * (1 - SMOOTHING),
        y: smoothedPos.current.y * SMOOTHING + targetY * (1 - SMOOTHING),
      };
    }
    const { x: cx, y: cy } = smoothedPos.current;

    // ── 3. Gesture classification ────────────────────────────────────────────
    const handSize  = dist(wrist, middleMcp);
    const pinchDist = dist(thumbTip, indexTip);
    const isPinchNow = pinchDist < handSize * (pinchingRef.current ? 0.35 : 0.22);

    const fingerUp = (tip: any, mcp: any) => tip.y < mcp.y - handSize * 0.05;
    const isOpenHand =
      !isPinchNow &&
      fingerUp(indexTip,  landmarks[5])  &&
      fingerUp(middleTip, landmarks[9])  &&
      fingerUp(ringTip,   landmarks[13]) &&
      fingerUp(pinkyTip,  landmarks[17]);

    const gesture: GestureType = isPinchNow ? 'pinch' : isOpenHand ? 'open_hand' : 'none';

    // ── 4. Pinch ─────────────────────────────────────────────────────────────
    if (isPinchNow) {
      if (!pinchingRef.current) {
        // START
        pinchingRef.current = true;
        const el = document.elementFromPoint(cx, cy);
        pinchStartRef.current = { x: cx, y: cy, time: Date.now(), clickTarget: el, scrollTarget: findScrollable(el) };
        el?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
      } else {
        // DRAG → scroll
        if (prevPos.current && pinchStartRef.current) {
          const dx    = prevPos.current.x - cx;
          const dy    = prevPos.current.y - cy;
          const moved = Math.sqrt((cx - pinchStartRef.current.x) ** 2 + (cy - pinchStartRef.current.y) ** 2);
          if (moved > 20) {
            if (pinchStartRef.current.scrollTarget) pinchStartRef.current.scrollTarget.scrollBy(dx * 2, dy * 2.5);
            else window.scrollBy(dx * 2, dy * 2.5);
          }
        }
      }
      holdStartRef.current  = null;
      holdFiredRef.current  = false;
    } else {
      if (pinchingRef.current) {
        // END
        pinchingRef.current = false;
        const info  = pinchStartRef.current;
        pinchStartRef.current = null;
        if (info) {
          const endEl = document.elementFromPoint(cx, cy);
          endEl?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
          const dur   = Date.now() - info.time;
          const moved = Math.sqrt((cx - info.x) ** 2 + (cy - info.y) ** 2);
          if (dur < PINCH_CLICK_MAX_MS && moved < PINCH_CLICK_MAX_PX) {
            const target = info.clickTarget || endEl;
            if (target) {
              const clickable = target.closest('button, a, input, [role="button"], .clickable');
              (clickable instanceof HTMLElement ? clickable : target instanceof HTMLElement ? target : null)?.click();
            }
          }
        }
      }
    }

    // ── 5. Open-hand HOLD → 3-second click ──────────────────────────────────
    let holdProgress = 0;
    let holdFired    = false;

    if (isOpenHand) {
      const el = document.elementFromPoint(cx, cy);
      if (!holdStartRef.current) {
        holdStartRef.current  = Date.now();
        holdElementRef.current = el;
        holdFiredRef.current  = false;
      } else {
        const elapsed = Date.now() - holdStartRef.current;
        holdProgress  = Math.min(1, elapsed / HOLD_CLICK_MS);

        // Notify component every frame (used for "start photo" 1.5s trigger)
        callbacksRef.current.onOpenHandHold?.(elapsed, el);

        if (elapsed >= HOLD_CLICK_MS && !holdFiredRef.current) {
          const now = Date.now();
          if (now - lastHoldFireRef.current > 1000) {
            holdFiredRef.current   = true;
            lastHoldFireRef.current = now;
            holdFired = true;
            const target = holdElementRef.current || el;
            if (target) {
              callbacksRef.current.onHoldClick?.(target);
              const clickable = target.closest('button, a, input, [role="button"], .clickable');
              (clickable instanceof HTMLElement ? clickable : target instanceof HTMLElement ? target : null)?.click();
            }
          }
        }
      }
    } else {
      holdStartRef.current = null;
      holdFiredRef.current = false;
    }

    // ── 6. Commit state ──────────────────────────────────────────────────────
    setState({ cursorPos: { x: cx, y: cy }, gesture, holdProgress, holdFired, isPinching: isPinchNow });
    prevPos.current = { x: cx, y: cy };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← stable: no deps! reads everything from refs

  // ── No-hand handler (also stable) ─────────────────────────────────────────
  const processNoHand = useCallback(() => {
    smoothedPos.current   = null;
    prevPos.current       = null;
    holdStartRef.current  = null;
    holdFiredRef.current  = false;
    if (pinchingRef.current) {
      pinchingRef.current   = false;
      pinchStartRef.current = null;
    }
    setState({ cursorPos: null, gesture: 'none', holdProgress: 0, holdFired: false, isPinching: false });
  }, []); // also stable

  return { state, processLandmarks, processNoHand };
}
