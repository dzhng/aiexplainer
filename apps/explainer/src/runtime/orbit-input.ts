/**
 * Wires a canvas's pointer and wheel events to an `OrbitController`; returns the unbind.
 * `onInput` hears every press and wheel (the stage cancels the arrival move on it).
 */
import type { OrbitController } from "@repo/renderer";

export function bindOrbit(
  canvas: HTMLCanvasElement,
  orbit: OrbitController,
  onInput?: () => void,
): () => void {
  const pointer = (e: PointerEvent) => ({
    pointerId: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    button: e.button,
    shiftKey: e.shiftKey,
  });
  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    onInput?.();
    orbit.pointerDown(pointer(e));
  };
  const onMove = (e: PointerEvent) => orbit.pointerMove(pointer(e));
  const onUp = (e: PointerEvent) => orbit.pointerUp(pointer(e));
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    onInput?.();
    orbit.wheel(e.deltaY);
  };
  const onMenu = (e: Event) => e.preventDefault();
  const events: [string, EventListener, AddEventListenerOptions?][] = [
    ["pointerdown", onDown as EventListener],
    ["pointermove", onMove as EventListener],
    ["pointerup", onUp as EventListener],
    ["pointercancel", onUp as EventListener],
    ["wheel", onWheel as EventListener, { passive: false }],
    ["contextmenu", onMenu],
  ];
  for (const [type, listener, options] of events) canvas.addEventListener(type, listener, options);
  return () => {
    for (const [type, listener] of events) canvas.removeEventListener(type, listener);
  };
}
