import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FastForward,
  FolderOpen,
  ImagePlus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { getClassStyle } from '../../utils/classColors';
import { formatClassLabel } from '../../utils/formatters';

// Logical canvas dimensions (scaled crisply via devicePixelRatio)
const W = 860;
const H = 380;
const FLOOR_Y = H - 24;
const TEE = { x: 168, y: 256 };
const BALL_R = 28;
const GRAVITY = 1120;
const FIXED_DT = 1 / 120;
const MAX_PULL = 148;
const LAUNCH_GAIN = 7.45;

// Hoop geometry
const BACKBOARD = { x: 762, top: 96, bottom: 206, width: 12 };
const RIM = { left: 670, right: 758, y: 184, lipRadius: 5.5 };

function stepBallMotion(state, dt) {
  state.vy += GRAVITY * dt;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
}

/**
 * Predicts the parabolic trajectory using the exact same fixed-timestep
 * integration as the live physics loop so the dotted guide is 100% accurate.
 */
function computeTrajectoryPreview(vx, vy) {
  const sim = { x: TEE.x, y: TEE.y, vx, vy };
  const points = [];
  let willSwish = false;

  for (let i = 0; i < 155; i += 1) {
    const prevY = sim.y;
    stepBallMotion(sim, FIXED_DT);

    if (
      prevY < RIM.y &&
      sim.y >= RIM.y &&
      sim.vy > 0 &&
      sim.x > RIM.left + 10 &&
      sim.x < RIM.right - 10
    ) {
      willSwish = true;
    }

    if (i % 5 === 0) {
      points.push({ x: sim.x, y: sim.y });
    }
    if (sim.y > FLOOR_Y - BALL_R || sim.x > W + 40 || sim.x < -40) {
      break;
    }
  }

  return { points, willSwish };
}

function collideWithCirclePoint(ball, px, py, pointR, restitution = 0.68) {
  const dx = ball.x - px;
  const dy = ball.y - py;
  const dist = Math.hypot(dx, dy);
  const minDist = BALL_R + pointR;

  if (dist > 0 && dist < minDist) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    ball.x += nx * overlap;
    ball.y += ny * overlap;

    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + restitution) * vn * nx;
      ball.vy -= (1 + restitution) * vn * ny;
      ball.spin += (ball.vx * 0.008 - ball.spin) * 0.35;
      return true;
    }
  }
  return false;
}

function computeAutoSwishVelocity() {
  const flightTime = 0.86;
  const targetX = (RIM.left + RIM.right) / 2;
  const targetY = RIM.y - 6;
  const vx = (targetX - TEE.x) / flightTime;
  const vy = (targetY - TEE.y - 0.5 * GRAVITY * flightTime * flightTime) / flightTime;
  return { vx, vy };
}

export function BasketballUploadCourt({
  pendingBatch = [],
  queuedCount = 0,
  maxFiles = 50,
  knownClasses = [],
  onBatchScored,
  onClearPending,
  onPickFiles,
  onPickFolder,
  onLoadDemoSamples = null,
  onDropDataTransfer,
}) {
  const canvasRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [shotStatus, setShotStatus] = useState('idle'); // idle | aiming | flying | scored | missed
  const dragDepthRef = useRef(0);

  // Latest callbacks & batch info accessible inside RAF loop without restarting canvas
  const pendingCountRef = useRef(pendingBatch.length);
  const onBatchScoredRef = useRef(onBatchScored);
  pendingCountRef.current = pendingBatch.length;
  onBatchScoredRef.current = onBatchScored;

  // Loaded HTMLImageElement thumbnails (up to 3) for rendering inside the bunch basketball
  const loadedThumbsRef = useRef([]);

  // Mutable 60fps simulation state
  const simRef = useRef({
    mode: 'idle', // idle | aiming | flying | scored
    ball: { x: TEE.x, y: TEE.y, vx: 0, vy: 0, angle: 0, spin: 0 },
    aim: { active: false, vx: 0, vy: 0, pullX: TEE.x, pullY: TEE.y },
    flightTrail: [],
    ghostTrail: [],
    particles: [],
    netSway: 0,
    netVel: 0,
    rimFlash: 0,
    bannerText: '',
    bannerAlpha: 0,
    respawnTimer: 0,
    scoreFinalizeTimer: 0,
    scoredThisShot: false,
    scoreNotified: false,
    accumulator: 0,
    lastTs: 0,
  });

  // Load up to 3 preview images whenever pendingBatch changes
  useEffect(() => {
    let cancelled = false;
    const slice = pendingBatch.slice(0, 3);

    if (slice.length === 0) {
      loadedThumbsRef.current = [];
      return undefined;
    }

    const images = new Array(slice.length).fill(null);
    slice.forEach((item, idx) => {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) {
          images[idx] = img;
          loadedThumbsRef.current = images.filter(Boolean);
        }
      };
      img.src = item.previewUrl;
    });

    return () => {
      cancelled = true;
    };
  }, [pendingBatch]);

  // Reset ball cleanly onto tee when a new batch is loaded or cleared
  useEffect(() => {
    const s = simRef.current;
    if (pendingBatch.length === 0) {
      s.mode = 'idle';
      s.ball = { x: TEE.x, y: TEE.y, vx: 0, vy: 0, angle: 0, spin: 0 };
      s.aim.active = false;
      s.flightTrail = [];
      s.respawnTimer = 0;
      s.scoreFinalizeTimer = 0;
      s.scoredThisShot = false;
      s.scoreNotified = false;
      setShotStatus('idle');
    } else if (s.mode === 'scored') {
      // Fresh batch arrived right after scoring previous batch
      s.mode = 'idle';
      s.ball = { x: TEE.x, y: TEE.y, vx: 0, vy: 0, angle: 0, spin: 0 };
      s.aim.active = false;
      s.flightTrail = [];
      s.scoredThisShot = false;
      s.scoreNotified = false;
      s.scoreFinalizeTimer = 0;
      setShotStatus('idle');
    }
  }, [pendingBatch.length]);

  const resetBallToTee = useCallback((keepGhost = true) => {
    const s = simRef.current;
    if (keepGhost && s.flightTrail.length > 4) {
      s.ghostTrail = s.flightTrail.filter((_, idx) => idx % 2 === 0);
    }
    s.mode = 'idle';
    s.ball = { x: TEE.x, y: TEE.y, vx: 0, vy: 0, angle: 0, spin: 0 };
    s.aim.active = false;
    s.flightTrail = [];
    s.respawnTimer = 0;
    s.scoredThisShot = false;
    s.scoreNotified = false;
    setShotStatus('idle');
  }, []);

  const launchWithVelocity = useCallback((vx, vy) => {
    const s = simRef.current;
    if (pendingCountRef.current === 0 || s.mode === 'flying' || s.mode === 'scored') return;
    s.mode = 'flying';
    s.aim.active = false;
    s.ball = {
      x: TEE.x,
      y: TEE.y,
      vx,
      vy,
      angle: 0,
      spin: vx * 0.0085,
    };
    s.flightTrail = [{ x: TEE.x, y: TEE.y }];
    s.scoredThisShot = false;
    s.scoreNotified = false;
    s.respawnTimer = 0;
    s.scoreFinalizeTimer = 0;
    setShotStatus('flying');
  }, []);

  const handleAutoSwish = useCallback(() => {
    if (pendingCountRef.current === 0) return;
    const { vx, vy } = computeAutoSwishVelocity();
    launchWithVelocity(vx, vy);
  }, [launchWithVelocity]);

  // Convert pointer event into logical canvas coordinates (0..W, 0..H)
  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };

  const handlePointerDown = (e) => {
    if (pendingCountRef.current === 0) return;
    const s = simRef.current;
    if (s.mode !== 'idle') return;

    const pt = getCanvasPoint(e);
    const dist = Math.hypot(pt.x - TEE.x, pt.y - TEE.y);
    if (dist <= 96) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      s.mode = 'aiming';
      s.aim.active = true;
      s.aim.pullX = pt.x;
      s.aim.pullY = pt.y;
      s.aim.vx = 0;
      s.aim.vy = 0;
      setShotStatus('aiming');
    }
  };

  const handlePointerMove = (e) => {
    const s = simRef.current;
    if (s.mode !== 'aiming' || !s.aim.active) return;

    const pt = getCanvasPoint(e);
    let dx = TEE.x - pt.x;
    let dy = TEE.y - pt.y;
    const dist = Math.hypot(dx, dy);

    if (dist > MAX_PULL) {
      dx = (dx / dist) * MAX_PULL;
      dy = (dy / dist) * MAX_PULL;
    }

    s.aim.pullX = TEE.x - dx;
    s.aim.pullY = TEE.y - dy;
    s.aim.vx = dx * LAUNCH_GAIN;
    s.aim.vy = dy * LAUNCH_GAIN;
  };

  const handlePointerUp = (e) => {
    const s = simRef.current;
    if (s.mode !== 'aiming' || !s.aim.active) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    const pullDist = Math.hypot(TEE.x - s.aim.pullX, TEE.y - s.aim.pullY);
    if (pullDist < 16) {
      // Cancelled tiny click
      s.mode = 'idle';
      s.aim.active = false;
      setShotStatus('idle');
      return;
    }
    launchWithVelocity(s.aim.vx, s.aim.vy);
  };

  // Main 60fps HiDPI canvas animation & physics loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');

    const syncResolution = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    syncResolution();
    window.addEventListener('resize', syncResolution);

    let rafId = 0;

    const spawnSwishParticles = (cx, cy) => {
      const s = simRef.current;
      const colors = ['#0274B3', '#0EA5E9', '#10B981', '#38BDF8', '#E9A23B'];
      for (let i = 0; i < 34; i += 1) {
        const angle = (Math.PI * 2 * i) / 34 + (Math.random() - 0.5) * 0.3;
        const speed = 110 + Math.random() * 240;
        s.particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60,
          size: 3 + Math.random() * 4.5,
          life: 1,
          decay: 0.9 + Math.random() * 0.7,
          color: colors[i % colors.length],
        });
      }
    };

    const stepPhysics = (dt) => {
      const s = simRef.current;

      // Net spring oscillation
      const springForce = -42 * s.netSway - 6.5 * s.netVel;
      s.netVel += springForce * dt;
      s.netSway += s.netVel * dt;

      if (s.rimFlash > 0) s.rimFlash = Math.max(0, s.rimFlash - dt * 2.5);
      if (s.bannerAlpha > 0) s.bannerAlpha = Math.max(0, s.bannerAlpha - dt * 0.85);

      // Update particles
      for (let i = s.particles.length - 1; i >= 0; i -= 1) {
        const p = s.particles[i];
        p.vy += GRAVITY * 0.55 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= p.decay * dt;
        if (p.life <= 0) s.particles.splice(i, 1);
      }

      if (s.mode === 'flying' || s.mode === 'scored') {
        const ball = s.ball;
        const prevY = ball.y;
        const prevX = ball.x;

        stepBallMotion(ball, dt);
        ball.angle += ball.spin * dt;

        // Record smooth flight trail
        const lastTrail = s.flightTrail[s.flightTrail.length - 1];
        if (!lastTrail || Math.hypot(ball.x - lastTrail.x, ball.y - lastTrail.y) >= 5) {
          s.flightTrail.push({ x: ball.x, y: ball.y });
          if (s.flightTrail.length > 90) s.flightTrail.shift();
        }

        // Backboard collision (front face)
        if (
          ball.y + BALL_R > BACKBOARD.top &&
          ball.y - BALL_R < BACKBOARD.bottom &&
          prevX + BALL_R <= BACKBOARD.x + 4 &&
          ball.x + BALL_R >= BACKBOARD.x
        ) {
          ball.x = BACKBOARD.x - BALL_R;
          ball.vx = -Math.abs(ball.vx) * 0.66;
          ball.spin = -ball.vy * 0.006;
        }

        // Backboard top & bottom corners
        collideWithCirclePoint(ball, BACKBOARD.x, BACKBOARD.top, 4, 0.64);
        collideWithCirclePoint(ball, BACKBOARD.x, BACKBOARD.bottom, 4, 0.64);

        // Left & right rim lips
        const hitLeft = collideWithCirclePoint(ball, RIM.left, RIM.y, RIM.lipRadius, 0.62);
        const hitRight = collideWithCirclePoint(ball, RIM.right, RIM.y, RIM.lipRadius, 0.62);
        if (hitLeft || hitRight) {
          s.netVel += (hitLeft ? 1 : -1) * 18;
        }

        // Swish / Hoop score detection (ball crosses downward inside rim opening)
        if (
          !s.scoredThisShot &&
          prevY < RIM.y &&
          ball.y >= RIM.y &&
          ball.vy > 0 &&
          ball.x > RIM.left + 6 &&
          ball.x < RIM.right - 6
        ) {
          s.scoredThisShot = true;
          s.mode = 'scored';
          s.netVel = 52;
          s.rimFlash = 1;
          const batchCount = pendingCountRef.current;
          s.bannerText = `SWISH! +${batchCount} ${batchCount === 1 ? 'FILE' : 'FILES'} QUEUED`;
          s.bannerAlpha = 1.4;
          s.scoreFinalizeTimer = 0.52;
          spawnSwishParticles((RIM.left + RIM.right) / 2, RIM.y + 18);
          setShotStatus('scored');
        }

        // Floor bounce
        if (ball.y + BALL_R >= FLOOR_Y) {
          ball.y = FLOOR_Y - BALL_R;
          ball.vy = -Math.abs(ball.vy) * 0.56;
          ball.vx *= 0.82;
          ball.spin = ball.vx * 0.015;
          if (Math.abs(ball.vy) < 42) ball.vy = 0;

          if (!s.scoredThisShot && s.respawnTimer === 0) {
            s.respawnTimer = 0.65;
            setShotStatus('missed');
          }
        }

        // Out-of-bounds respawn on miss
        if (!s.scoredThisShot && (ball.x > W + 70 || ball.x < -70)) {
          resetBallToTee(true);
        }

        // Auto-respawn timer after missing
        if (s.respawnTimer > 0 && !s.scoredThisShot) {
          s.respawnTimer -= dt;
          if (s.respawnTimer <= 0) {
            resetBallToTee(true);
          }
        }

        // Complete scoring handoff after brief net-swish celebration
        if (s.scoredThisShot && !s.scoreNotified) {
          s.scoreFinalizeTimer -= dt;
          if (s.scoreFinalizeTimer <= 0) {
            s.scoreNotified = true;
            s.ghostTrail = [];
            onBatchScoredRef.current?.();
          }
        }
      }
    };

    const drawCourt = (nowSec) => {
      const s = simRef.current;
      const count = pendingCountRef.current;

      ctx.clearRect(0, 0, W, H);

      // 1. Light Alpine Frosted Court Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#F7FBFF');
      bgGrad.addColorStop(0.75, '#EDF5FC');
      bgGrad.addColorStop(1, '#E2EEF8');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Subtle architectural grid
      ctx.strokeStyle = 'rgba(2, 116, 179, 0.055)';
      ctx.lineWidth = 1;
      for (let gx = 40; gx < W; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, FLOOR_Y);
        ctx.stroke();
      }
      for (let gy = 40; gy < FLOOR_Y; gy += 40) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }

      // Soft court 3-point & key floor markings
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
      ctx.strokeStyle = 'rgba(2, 116, 179, 0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, FLOOR_Y);
      ctx.lineTo(W, FLOOR_Y);
      ctx.stroke();

      // Floor launch zone ring under tee
      ctx.beginPath();
      ctx.ellipse(TEE.x, FLOOR_Y, 46, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(2, 116, 179, 0.1)';
      ctx.fill();

      // Drop-zone basket target shadow on floor
      ctx.beginPath();
      ctx.ellipse((RIM.left + RIM.right) / 2, FLOOR_Y, 54, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
      ctx.fill();

      // 2. Stanchion Pole & Frosted Glass Backboard
      ctx.strokeStyle = '#9BB5CB';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(BACKBOARD.x + 36, FLOOR_Y);
      ctx.lineTo(BACKBOARD.x + 36, BACKBOARD.top + 48);
      ctx.lineTo(BACKBOARD.x + BACKBOARD.width, BACKBOARD.top + 48);
      ctx.stroke();

      // Frosted acrylic backboard
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.strokeStyle = 'rgba(2, 116, 179, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(
        BACKBOARD.x,
        BACKBOARD.top,
        BACKBOARD.width,
        BACKBOARD.bottom - BACKBOARD.top,
        4
      );
      ctx.fill();
      ctx.stroke();

      // Target shooter's square accent on backboard
      ctx.fillStyle = '#0274B3';
      ctx.fillRect(BACKBOARD.x + 2, RIM.y - 34, 4, 30);

      // 3. Previous Shot Ghost Trail (helps adjust aim after a miss)
      if (s.ghostTrail.length > 2) {
        ctx.save();
        ctx.setLineDash([4, 7]);
        ctx.strokeStyle = 'rgba(92, 115, 138, 0.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        s.ghostTrail.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        ctx.restore();
      }

      // 4. Dotted Parabolic Aim Trajectory Path + Slingshot Band
      if (s.mode === 'aiming' && s.aim.active) {
        const pullDist = Math.hypot(TEE.x - s.aim.pullX, TEE.y - s.aim.pullY);
        if (pullDist >= 16) {
          const { points, willSwish } = computeTrajectoryPreview(s.aim.vx, s.aim.vy);

          // Elastic slingshot guide line
          ctx.save();
          ctx.strokeStyle = willSwish ? 'rgba(16, 185, 129, 0.65)' : 'rgba(2, 116, 179, 0.55)';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(TEE.x, TEE.y);
          ctx.lineTo(s.aim.pullX, s.aim.pullY);
          ctx.stroke();
          ctx.restore();

          // Parabolic dots
          points.forEach((pt, idx) => {
            const alpha = Math.max(0.12, 0.92 - (idx / points.length) * 0.8);
            const r = Math.max(2.2, 5.2 - (idx / points.length) * 2.4);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
            ctx.fillStyle = willSwish
              ? `rgba(16, 185, 129, ${alpha.toFixed(2)})`
              : `rgba(2, 116, 179, ${alpha.toFixed(2)})`;
            ctx.fill();
          });

          // Subtle "LOCKED ON" target glow on the rim when path enters hoop
          if (willSwish) {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse((RIM.left + RIM.right) / 2, RIM.y, 44, 10, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.72)';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // 5. Glowing Active Flight Trail Ribbon
      if (s.flightTrail.length > 1) {
        for (let i = 1; i < s.flightTrail.length; i += 1) {
          const p0 = s.flightTrail[i - 1];
          const p1 = s.flightTrail[i];
          const ratio = i / s.flightTrail.length;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = s.scoredThisShot
            ? `rgba(16, 185, 129, ${(ratio * 0.72).toFixed(2)})`
            : `rgba(14, 165, 233, ${(ratio * 0.68).toFixed(2)})`;
          ctx.lineWidth = Math.max(2, ratio * 11);
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }

      // 6. Back Half of Rim (drawn behind ball)
      ctx.strokeStyle = s.rimFlash > 0 ? '#10B981' : '#0274B3';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(RIM.left, RIM.y);
      ctx.lineTo(RIM.right, RIM.y);
      ctx.stroke();

      // 7. Tee Pedestal & Bunch Basketball
      if (count > 0) {
        // Subtle pulsing grab halo when waiting on tee
        if (s.mode === 'idle') {
          const pulse = 0.5 + 0.5 * Math.sin(nowSec * 3.4);
          ctx.beginPath();
          ctx.arc(TEE.x, TEE.y, BALL_R + 10 + pulse * 8, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(2, 116, 179, ${(0.24 - pulse * 0.14).toFixed(2)})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        const bx = s.mode === 'aiming' ? s.aim.pullX : s.ball.x;
        const by = s.mode === 'aiming' ? s.aim.pullY : s.ball.y;

        // Ground shadow proportional to ball height
        const heightRatio = Math.max(0.15, 1 - (FLOOR_Y - by) / 320);
        ctx.beginPath();
        ctx.ellipse(bx, FLOOR_Y, BALL_R * heightRatio * 1.05, 5 * heightRatio, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(15, 30, 46, ${(0.14 * heightRatio).toFixed(2)})`;
        ctx.fill();

        // Draw Stacked "Bunch" Aura Rings when batch has multiple files
        if (count > 1) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(bx - 5, by + 4, BALL_R - 1, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(212, 236, 254, 0.85)';
          ctx.strokeStyle = 'rgba(2, 116, 179, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();

          if (count > 2) {
            ctx.beginPath();
            ctx.arc(bx + 5, by + 3, BALL_R - 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(235, 246, 255, 0.9)';
            ctx.strokeStyle = 'rgba(2, 116, 179, 0.3)';
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }

        // Main Bunch Basketball Sphere
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(s.ball.angle);

        ctx.beginPath();
        ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
        ctx.clip();

        const thumbs = loadedThumbsRef.current;
        if (thumbs.length >= 2) {
          // Split collage inside the ball so the user visually sees it's a bunch of photos
          const half = BALL_R;
          const img0 = thumbs[0];
          const img1 = thumbs[1];
          ctx.drawImage(img0, -BALL_R, -BALL_R, half, BALL_R * 2);
          if (thumbs.length >= 3) {
            const img2 = thumbs[2];
            ctx.drawImage(img1, 0, -BALL_R, half, BALL_R);
            ctx.drawImage(img2, 0, 0, half, BALL_R);
          } else {
            ctx.drawImage(img1, 0, -BALL_R, half, BALL_R * 2);
          }
        } else if (thumbs.length === 1) {
          ctx.drawImage(thumbs[0], -BALL_R, -BALL_R, BALL_R * 2, BALL_R * 2);
        } else {
          const ballGrad = ctx.createRadialGradient(-8, -8, 4, 0, 0, BALL_R);
          ballGrad.addColorStop(0, '#38BDF8');
          ballGrad.addColorStop(1, '#0274B3');
          ctx.fillStyle = ballGrad;
          ctx.fillRect(-BALL_R, -BALL_R, BALL_R * 2, BALL_R * 2);
        }

        // Translucent frosted basketball seam curves
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-BALL_R, 0);
        ctx.lineTo(BALL_R, 0);
        ctx.moveTo(0, -BALL_R);
        ctx.lineTo(0, BALL_R);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(-BALL_R * 0.9, 0, BALL_R * 0.85, -0.7, 0.7);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(BALL_R * 0.9, 0, BALL_R * 0.85, Math.PI - 0.7, Math.PI + 0.7);
        ctx.stroke();

        // Glass specular sheen highlight
        const sheen = ctx.createRadialGradient(-9, -10, 2, -6, -6, BALL_R * 1.1);
        sheen.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
        sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0.08)');
        sheen.addColorStop(1, 'rgba(15, 30, 46, 0.14)');
        ctx.fillStyle = sheen;
        ctx.fillRect(-BALL_R, -BALL_R, BALL_R * 2, BALL_R * 2);

        ctx.restore();

        // Crisp outer Alpine ring around ball
        ctx.beginPath();
        ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
        ctx.strokeStyle = '#0274B3';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Upright floating file-count pill attached to ball ("×5" or "1 FILE")
        const badgeLabel = count === 1 ? '1 FILE' : `×${count} FILES`;
        ctx.save();
        ctx.font = '600 11px "JetBrains Mono", monospace';
        const tw = ctx.measureText(badgeLabel).width;
        const bw = tw + 16;
        const bh = 22;
        const badgeX = bx - bw / 2;
        const badgeY = by - BALL_R - 28;

        ctx.fillStyle = '#0F1E2E';
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, bw, bh, 999);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeLabel, bx, badgeY + bh / 2 + 0.5);
        ctx.restore();

        // Gentle drag-back prompt when idle
        if (s.mode === 'idle') {
          ctx.save();
          ctx.font = '500 12px "Instrument Sans", system-ui, sans-serif';
          ctx.fillStyle = '#42586E';
          ctx.textAlign = 'center';
          ctx.fillText('Drag back from the ball & release to basket the bunch', TEE.x + 42, TEE.y + 62);
          ctx.restore();
        }
      }

      // 8. Woven Nylon Net Mesh (drawn in front of ball for real swish depth)
      const netTopY = RIM.y + 2;
      const netBotY = RIM.y + 66;
      const sway = s.netSway;
      const topXs = [674, 691, 708, 725, 742, 754];
      const botXs = [686 + sway, 698 + sway * 1.1, 710 + sway * 1.15, 722 + sway * 1.15, 734 + sway * 1.1, 744 + sway];

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 2;
      for (let i = 0; i < topXs.length; i += 1) {
        ctx.beginPath();
        ctx.moveTo(topXs[i], netTopY);
        ctx.quadraticCurveTo(
          (topXs[i] + botXs[i]) / 2 + sway * 0.45,
          (netTopY + netBotY) / 2,
          botXs[i],
          netBotY
        );
        ctx.stroke();
      }

      // Diagonal net cross-diamonds
      ctx.strokeStyle = 'rgba(2, 116, 179, 0.24)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < topXs.length - 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(topXs[i], netTopY + 6);
        ctx.lineTo(botXs[i + 1], netBotY - 6);
        ctx.moveTo(topXs[i + 1], netTopY + 6);
        ctx.lineTo(botXs[i], netBotY - 6);
        ctx.stroke();
      }
      ctx.restore();

      // Front rim highlight bar + rim lip caps
      ctx.strokeStyle = s.rimFlash > 0 ? '#10B981' : '#0274B3';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(RIM.left, RIM.y);
      ctx.lineTo(RIM.right, RIM.y);
      ctx.stroke();

      // Hoop label pill
      ctx.save();
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#035E91';
      ctx.textAlign = 'center';
      ctx.fillText('TRAINING QUEUE', (RIM.left + RIM.right) / 2, BACKBOARD.top - 12);
      ctx.restore();

      // 9. Swish Particles
      s.particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // 10. Floating Celebration Banner
      if (s.bannerAlpha > 0 && s.bannerText) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, s.bannerAlpha);
        ctx.font = '700 15px "Bricolage Grotesque", sans-serif';
        const tw = ctx.measureText(s.bannerText).width;
        const bw = tw + 30;
        const cx = W / 2;
        const cy = 62;

        ctx.fillStyle = '#E8F7F0';
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(cx - bw / 2, cy - 18, bw, 36, 999);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0F6342';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.bannerText, cx, cy + 0.5);
        ctx.restore();
      }
    };

    const tick = (ts) => {
      const s = simRef.current;
      if (!s.lastTs) s.lastTs = ts;
      const frameDt = Math.min(0.05, (ts - s.lastTs) / 1000);
      s.lastTs = ts;

      s.accumulator += frameDt;
      while (s.accumulator >= FIXED_DT) {
        stepPhysics(FIXED_DT);
        s.accumulator -= FIXED_DT;
      }

      drawCourt(ts / 1000);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', syncResolution);
    };
  }, [resetBallToTee]);

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    onDropDataTransfer?.(e.dataTransfer);
  };

  // Unique class summary inside the staged bunch
  const bunchClassSummary = Array.from(
    pendingBatch.reduce((map, item) => {
      const lbl = item.label || 'unlabeled';
      map.set(lbl, (map.get(lbl) || 0) + 1);
      return map;
    }, new Map())
  );

  const hasBunch = pendingBatch.length > 0;
  const remainingCapacity = Math.max(0, maxFiles - queuedCount - pendingBatch.length);

  return (
    <motion.section
      animate={
        isDragOver
          ? { scale: 1.008, borderColor: 'rgba(2, 116, 179, 0.85)' }
          : { scale: 1, borderColor: 'rgba(15, 30, 46, 0.12)' }
      }
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`sa-card relative overflow-hidden border-2 transition-colors ${
        isDragOver ? 'border-dashed bg-alpine-50/70' : ''
      }`}
    >
      {/* Top Action & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-alpine-200 bg-alpine-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-alpine-800">
            <Target className="h-3.5 w-3.5 text-alpine-600" aria-hidden="true" />
            Bunch-to-Hoop Upload
          </span>
          <span className="text-xs text-ink-muted">
            {hasBunch
              ? `${pendingBatch.length} file${pendingBatch.length === 1 ? '' : 's'} packed into 1 ball — shoot once to queue the whole bunch.`
              : 'Drop images or a class folder to pack them into a bunch ball.'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={remainingCapacity <= 0}
            onClick={onPickFiles}
            className="sa-btn-secondary px-3 py-1.5 text-xs"
          >
            <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
            Add images
          </button>
          <button
            type="button"
            disabled={remainingCapacity <= 0}
            onClick={onPickFolder}
            className="sa-btn-secondary px-3 py-1.5 text-xs"
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Select folder
          </button>
          {onLoadDemoSamples && (
            <button
              type="button"
              disabled={remainingCapacity <= 0}
              onClick={onLoadDemoSamples}
              className="sa-btn-ghost px-2.5 py-1.5 text-xs text-alpine-700 hover:bg-alpine-50"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Load 3 samples
            </button>
          )}
        </div>
      </div>

      {/* Interactive Basketball Canvas Viewport */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          tabIndex={hasBunch ? 0 : -1}
          role="application"
          aria-label={
            hasBunch
              ? `Basketball upload court with ${pendingBatch.length} files packed in one ball. Drag backward from the ball to aim and shoot into the hoop, or press Enter for Auto-Swish.`
              : 'Basketball upload court. Drop images or a folder to start.'
          }
          onKeyDown={(e) => {
            if (hasBunch && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              handleAutoSwish();
            }
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`block aspect-[860/380] w-full touch-none select-none ${
            hasBunch
              ? shotStatus === 'aiming'
                ? 'cursor-grabbing'
                : 'cursor-grab'
              : 'cursor-default'
          }`}
        />

        {/* Empty Court Overlay Prompt */}
        {!hasBunch && !isDragOver && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <div className="pointer-events-auto flex max-w-md flex-col items-center rounded-panel border border-alpine-200/80 bg-surface/90 px-6 py-5 shadow-card backdrop-blur-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-control border border-alpine-200 bg-alpine-50 text-alpine-700">
                <UploadCloud className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-3 font-display text-lg font-semibold text-ink">
                {queuedCount > 0
                  ? 'Drop another folder or batch to pack a new ball'
                  : 'Select a folder or drop conveyor photos'}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                All files you pick together bundle into <strong>one single basketball</strong> —
                one clean swish queues the entire folder with class labels intact.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={onPickFolder} className="sa-btn-primary text-xs">
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Select class folder
                </button>
                <button type="button" onClick={onPickFiles} className="sa-btn-secondary text-xs">
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Select images
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Drag-Over Frosted Overlay */}
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-alpine-50/75 backdrop-blur-[2px]">
            <div className="rounded-panel border-2 border-dashed border-alpine-600 bg-surface/95 px-6 py-4 text-center shadow-elevated">
              <p className="font-display text-base font-semibold text-alpine-800">
                Release to pack files into your bunch ball
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Subfolder names automatically become class labels
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Bunch Control Strip (shown while a bunch is staged on the tee) */}
      {hasBunch && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 bg-paper/75 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              In ball:
            </span>
            {bunchClassSummary.map(([cls, cnt]) => {
              const style = getClassStyle(cls, knownClasses);
              return (
                <span
                  key={cls}
                  style={{
                    backgroundColor: style.bg,
                    color: style.text,
                    borderColor: style.border,
                  }}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium"
                >
                  <span>{formatClassLabel(cls)}</span>
                  <span className="opacity-75">×{cnt}</span>
                </span>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {shotStatus === 'missed' && (
              <button
                type="button"
                onClick={() => resetBallToTee(true)}
                className="sa-btn-ghost px-2.5 py-1.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset ball
              </button>
            )}
            <button
              type="button"
              onClick={onClearPending}
              className="sa-btn-ghost px-2.5 py-1.5 text-xs text-err-text hover:bg-err-bg"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Discard bunch
            </button>
            <button
              type="button"
              disabled={shotStatus === 'flying' || shotStatus === 'scored'}
              onClick={handleAutoSwish}
              className="sa-btn-secondary border-alpine-200 bg-alpine-50 px-3 py-1.5 text-xs text-alpine-800 hover:bg-alpine-100"
            >
              <Sparkles className="h-3.5 w-3.5 text-alpine-600" aria-hidden="true" />
              Auto-Swish
            </button>
            <button
              type="button"
              disabled={shotStatus === 'scored'}
              onClick={onBatchScored}
              className="sa-btn-primary px-3 py-1.5 text-xs"
            >
              <FastForward className="h-3.5 w-3.5" aria-hidden="true" />
              Quick-queue ({pendingBatch.length})
            </button>
          </div>
        </div>
      )}
    </motion.section>
  );
}