import { useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { motion, useAnimation, type AnimationControls } from 'framer-motion';

export type StampKind = 'paid' | 'already' | 'verified';

export type StampHandle = {
  /** Animate the stamp. An optional kind overrides the prop-set kind for this play. */
  play: (kind?: StampKind) => Promise<void>;
  /** Reset the stamp to hidden. */
  reset: () => void;
};

type Props = {
  /** Default kind shown when play() is called without an argument. */
  kind: StampKind;
};

const EASING = [0.2, 0.9, 0.3, 1.2] as const;

export const Stamp = forwardRef<StampHandle, Props>(function Stamp({ kind: defaultKind }, ref) {
  const controls: AnimationControls = useAnimation();
  const bleedControls: AnimationControls = useAnimation();
  // activeKind tracks what the stamp currently shows, so a reset() can clear it.
  const [activeKind, setActiveKind] = useState<StampKind>(defaultKind);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const play = useCallback(async (kind?: StampKind) => {
    const k = kind ?? defaultKind;
    setActiveKind(k);

    if (reducedMotion) {
      await controls.start({ opacity: 1, scale: 1, transition: { duration: 0 } });
      return;
    }
    await controls.start({
      opacity: 1,
      scale: 1,
      transition: { duration: 0.14, ease: EASING },
    });
    // Ink bleed fades out over 300ms.
    void bleedControls.start({
      textShadow: '0 0 0px transparent',
      transition: { duration: 0.3, ease: 'easeOut' },
    });
  }, [controls, bleedControls, reducedMotion, defaultKind]);

  const reset = useCallback(() => {
    void controls.set({ opacity: 0, scale: 1.6 });
    setActiveKind(defaultKind);
  }, [controls, defaultKind]);

  useImperativeHandle(ref, () => ({ play, reset }), [play, reset]);

  const isVerified = activeKind === 'verified';
  const isPaid = activeKind === 'paid';
  const color = isVerified ? 'var(--stamp)' : isPaid ? 'var(--stamp)' : 'var(--ink-3)';
  const label = isVerified ? 'VERIFIED' : isPaid ? 'PAID' : 'ALREADY PAID';
  const rotation = isVerified ? '-10deg' : isPaid ? '-12deg' : '8deg';

  const initial = reducedMotion
    ? { opacity: 0, scale: 1 }
    : { opacity: 0, scale: 1.6 };

  return (
    <motion.div
      animate={controls}
      initial={initial}
      style={{
        position: 'absolute',
        right: '20px',
        top: '50%',
        transform: `translateY(-50%) rotate(${rotation})`,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <motion.span
        animate={bleedControls}
        initial={{ textShadow: `0 0 2px ${color}` }}
        style={{
          display: 'inline-block',
          border: `2px double ${color}`,
          color,
          fontFamily: '"IBM Plex Mono", monospace',
          fontWeight: 600,
          fontSize: '0.875rem',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          padding: '6px 12px',
          borderRadius: '4px',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </motion.span>
    </motion.div>
  );
});
