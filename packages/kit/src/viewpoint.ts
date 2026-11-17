/** A camera direction in degrees. Yaw turns left/right, pitch tilts up/down. */
export interface Viewpoint {
  yaw: number;
  pitch: number;
}

export interface ViewLimits {
  yaw: number;
  pitch: number;
}

const RAD = Math.PI / 180;

/** Angle in degrees between the directions two viewpoints look along. */
export function angularDistance(a: Viewpoint, b: Viewpoint): number {
  const cos =
    Math.sin(a.pitch * RAD) * Math.sin(b.pitch * RAD) +
    Math.cos(a.pitch * RAD) * Math.cos(b.pitch * RAD) * Math.cos((a.yaw - b.yaw) * RAD);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / RAD;
}

export function isAligned(view: Viewpoint, secret: Viewpoint, tolerance: number): boolean {
  return angularDistance(view, secret) <= tolerance;
}

export function clampView(view: Viewpoint, limits: ViewLimits): Viewpoint {
  return {
    yaw: Math.min(limits.yaw, Math.max(-limits.yaw, view.yaw)),
    pitch: Math.min(limits.pitch, Math.max(-limits.pitch, view.pitch)),
  };
}

/**
 * Coast after a drag is released: the view keeps its speed and friction wears it down.
 * `velocity` is in degrees per second, `dt` in seconds, `halfLife` is the time in seconds
 * for the speed to halve. Never overshoots or bounces.
 */
export function glide(
  view: Viewpoint,
  velocity: Viewpoint,
  dt: number,
  halfLife = 0.18,
): { view: Viewpoint; velocity: Viewpoint } {
  const decay = 0.5 ** (dt / halfLife);
  return {
    view: { yaw: view.yaw + velocity.yaw * dt, pitch: view.pitch + velocity.pitch * dt },
    velocity: { yaw: velocity.yaw * decay, pitch: velocity.pitch * decay },
  };
}

/** Ease from one view to another; `t` runs 0..1. Cubic ease-out, no overshoot. */
export function easeView(from: Viewpoint, to: Viewpoint, t: number): Viewpoint {
  const k = 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
  return {
    yaw: from.yaw + (to.yaw - from.yaw) * k,
    pitch: from.pitch + (to.pitch - from.pitch) * k,
  };
}
