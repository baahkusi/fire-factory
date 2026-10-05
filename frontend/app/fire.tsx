"use client";

import {useEffect, useRef} from "react";

function drawLog(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  thickness: number,
  angle: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-length / 2, -thickness / 2, length, thickness, thickness / 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 196, 140, 0.18)";
  ctx.beginPath();
  ctx.ellipse(-length * 0.12, -thickness * 0.18, length * 0.28, thickness * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTongue(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number,
  width: number,
  lean: number,
  waist: number,
  bottom: string,
  middle: string
) {
  const tipX = x + lean;
  const tipY = y - height;
  ctx.beginPath();
  ctx.moveTo(x - width * 0.46, y);
  ctx.bezierCurveTo(
    x - width * 0.72,
    y - height * 0.25,
    tipX - width * waist,
    y - height * 0.68,
    tipX,
    tipY
  );
  ctx.bezierCurveTo(
    tipX + width * (waist + 0.06),
    y - height * 0.62,
    x + width * 0.68,
    y - height * 0.22,
    x + width * 0.4,
    y
  );
  ctx.closePath();
  const gradient = ctx.createLinearGradient(x, y, tipX, tipY);
  gradient.addColorStop(0, bottom);
  gradient.addColorStop(0.42, middle);
  gradient.addColorStop(1, "rgba(255, 40, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fill();
}

/**
 * A campfire drawn in the center of its box.
 * One still frame when the user prefers reduced motion, and no loop while the tab is hidden.
 */
export function Fire() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const surface: HTMLCanvasElement = node;
    const context = surface.getContext("2d");
    if (!context) return;
    const ctx = context;

    let running = true;
    let frameId = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const rect = surface.getBoundingClientRect();
      surface.width = Math.max(1, Math.floor(rect.width * ratio));
      surface.height = Math.max(1, Math.floor(rect.height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function draw(now: number) {
      const rect = surface.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const time = reduced ? 1.2 : now / 1000;
      ctx.clearRect(0, 0, width, height);

      const size = Math.min(height * 0.72, width * 0.62);
      const cx = width / 2;
      const baseY = height * 0.58;
      const sway = Math.sin(time * 1.6) * size * 0.03;

      const glow = ctx.createRadialGradient(cx, baseY - size * 0.22, size * 0.04, cx, baseY - size * 0.1, size * 0.72);
      glow.addColorStop(0, "rgba(255, 150, 40, 0.42)");
      glow.addColorStop(0.45, "rgba(255, 80, 10, 0.16)");
      glow.addColorStop(1, "rgba(255, 60, 0, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      drawLog(ctx, cx, baseY + size * 0.055, size * 0.58, size * 0.07, -0.48, "#5c331c");

      const coals = ctx.createRadialGradient(cx, baseY, 2, cx, baseY, size * 0.16);
      coals.addColorStop(0, "rgba(255, 236, 180, 0.95)");
      coals.addColorStop(0.35, "rgba(255, 110, 24, 0.9)");
      coals.addColorStop(1, "rgba(160, 30, 0, 0)");
      ctx.fillStyle = coals;
      ctx.beginPath();
      ctx.ellipse(cx, baseY + size * 0.02, size * 0.2, size * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();

      const licks = [
        {height: 0.7, width: 0.28, lean: -size * 0.08 + sway, waist: 0.2, bottom: "rgba(180, 28, 4, 0.28)", middle: "rgba(255, 70, 8, 0.12)", speed: 1.7, phase: 0.2, blur: 0.02, x: -0.1},
        {height: 0.66, width: 0.26, lean: size * 0.08 - sway, waist: 0.2, bottom: "rgba(180, 28, 4, 0.28)", middle: "rgba(255, 70, 8, 0.12)", speed: 1.9, phase: 1.4, blur: 0.02, x: 0.1},
        {height: 0.96, width: 0.38, lean: sway * 1.2, waist: 0.2, bottom: "rgba(210, 42, 8, 0.5)", middle: "rgba(255, 90, 16, 0.22)", speed: 2.2, phase: 0.6, blur: 0.012, x: 0},
        {height: 0.78, width: 0.26, lean: -sway * 0.8, waist: 0.14, bottom: "rgba(255, 110, 20, 0.9)", middle: "rgba(255, 160, 40, 0.4)", speed: 2.9, phase: 1.3, blur: 0, x: 0},
        {height: 0.58, width: 0.16, lean: sway * 0.45, waist: 0.1, bottom: "rgba(255, 196, 60, 0.96)", middle: "rgba(255, 220, 110, 0.45)", speed: 3.6, phase: 2.1, blur: 0, x: 0},
        {height: 0.34, width: 0.08, lean: sway * 0.2, waist: 0.06, bottom: "rgba(255, 250, 230, 0.98)", middle: "rgba(255, 230, 150, 0.35)", speed: 4.4, phase: 0.4, blur: 0, x: 0},
      ];

      for (const lick of licks) {
        const pulse = 1 + Math.sin(time * lick.speed + lick.phase) * 0.07;
        const side = Math.sin(time * (lick.speed + 0.6) + lick.phase) * size * 0.018;
        ctx.filter = lick.blur ? `blur(${size * lick.blur}px)` : "none";
        drawTongue(
          ctx,
          cx + side + size * lick.x,
          baseY + size * 0.02,
          size * lick.height * pulse,
          size * lick.width,
          lick.lean,
          lick.waist,
          lick.bottom,
          lick.middle
        );
      }
      ctx.filter = "none";

      drawLog(ctx, cx + size * 0.01, baseY + size * 0.085, size * 0.56, size * 0.066, 0.42, "#3d2416");

      for (let spark = 0; spark < 12; spark++) {
        const seed = spark * 1.7;
        const life = reduced ? 0.35 + (spark % 4) * 0.12 : (time * (0.28 + (spark % 5) * 0.05) + seed) % 1;
        const x = cx + Math.sin(time * 0.9 + seed) * size * 0.08 + (spark - 6) * size * 0.012;
        const y = baseY - life * size * 0.95;
        ctx.globalAlpha = (1 - life) * 0.9;
        ctx.fillStyle = spark % 3 === 0 ? "#fff6d0" : "#ffb15a";
        ctx.fillRect(x, y, Math.max(1.2, size * 0.008), Math.max(1.2, size * 0.008));
      }
      ctx.globalAlpha = 1;
    }

    function tick(now: number) {
      if (!running) return;
      draw(now);
      if (!reduced && !document.hidden) {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    resize();
    tick(performance.now());

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced || document.hidden) draw(performance.now());
    });
    observer.observe(surface);

    function onVisibility() {
      if (!document.hidden && !reduced && running) {
        frameId = window.requestAnimationFrame(tick);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="fire" aria-hidden="true" />;
}
