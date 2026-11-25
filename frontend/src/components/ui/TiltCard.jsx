import { useCallback, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useMotionPref } from '../../context/MotionPrefContext';

const SPRING_CFG = { stiffness: 320, damping: 24, mass: 0.55 };

/**
 * Alpine Glass interactive 3D card:
 * - Tracks cursor coordinates for smooth spring-lerped 3D tilt (transform only)
 * - Renders a soft sky-white specular glare sheen that follows the cursor (transform + opacity only)
 * - Automatically falls back to Calm Lift when the user toggles Calm mode or prefers-reduced-motion
 */
export function TiltCard({
  children,
  className = '',
  maxTilt = 6,
  scaleOnHover = 1.014,
  glare = true,
  disabled = false,
  ...rest
}) {
  const { tiltEnabled, prefersReducedMotion } = useMotionPref();
  const cardRef = useRef(null);
  const [hovered, setHovered] = useState(false);

  const mouseX = useMotionValue(0); // -0.5 .. 0.5
  const mouseY = useMotionValue(0); // -0.5 .. 0.5

  const springX = useSpring(mouseX, SPRING_CFG);
  const springY = useSpring(mouseY, SPRING_CFG);

  const rotateX = useTransform(springY, [-0.5, 0.5], [maxTilt, -maxTilt]);
  const rotateY = useTransform(springX, [-0.5, 0.5], [-maxTilt, maxTilt]);

  // Move oversized glare layer using GPU transform percentages only
  const glareX = useTransform(springX, [-0.5, 0.5], ['-22%', '22%']);
  const glareY = useTransform(springY, [-0.5, 0.5], ['-22%', '22%']);

  const active3D = tiltEnabled && !disabled;

  const handlePointerMove = useCallback(
    (e) => {
      if (!active3D) return;
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      mouseX.set(Math.max(-0.5, Math.min(0.5, nx)));
      mouseY.set(Math.max(-0.5, Math.min(0.5, ny)));
    },
    [active3D, mouseX, mouseY]
  );

  const handlePointerEnter = () => {
    if (!disabled) setHovered(true);
  };

  const handlePointerLeave = () => {
    setHovered(false);
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div style={{ perspective: active3D ? 960 : undefined }} className="h-full">
      <motion.div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        style={
          active3D
            ? {
                rotateX,
                rotateY,
                transformStyle: 'preserve-3d',
              }
            : undefined
        }
        whileHover={
          disabled || prefersReducedMotion
            ? undefined
            : active3D
              ? { scale: scaleOnHover }
              : { y: -3 }
        }
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        className={`sa-card relative overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-alpine-300/80 hover:shadow-elevated ${className}`}
        {...rest}
      >
        {glare && active3D && (
          <motion.div
            aria-hidden="true"
            style={{
              x: glareX,
              y: glareY,
              background:
                'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.72) 0%, rgba(186, 230, 253, 0.28) 32%, rgba(255, 255, 255, 0) 68%)',
            }}
            animate={{ opacity: hovered ? 0.9 : 0 }}
            transition={{ duration: 0.22 }}
            className="pointer-events-none absolute -inset-1/2 z-20"
          />
        )}
        <div className="relative z-10 h-full">{children}</div>
      </motion.div>
    </div>
  );
}