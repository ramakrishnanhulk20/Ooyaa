import { useRef, useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { DemoPayrollCard } from './DemoPayrollCard.js';
import type { DemoPayrollCardHandle } from './DemoPayrollCard.js';
import { ARC_MAINNET } from '../deployments.js';
import { useHistory } from '../proof/useHistory.js';
import { usePayrollState } from '../payroll/usePayrollState.js';
import { TEAM_WALLET_SET } from '../proof/ourWallet.js';

const FACTORY = ARC_MAINNET.factory;
const EXPLORER = ARC_MAINNET.explorer;
const FACTORY_SHORT = `${FACTORY.slice(0, 6)}...${FACTORY.slice(-4)}`;

const EASING = [0.16, 1, 0.3, 1] as const;

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}
void shortAddr;

/**
 * Hero section: left editorial copy, right live demo payroll card.
 * The "Run today's payday" button triggers the card's run flow immediately.
 */
export function Hero() {
  const cardRef = useRef<DemoPayrollCardHandle>(null);
  const [animate, setAnimate] = useState(false);

  // Fetch demo payroll history to compute outside-run count.
  const { history } = useHistory(ARC_MAINNET.demoPayroll, ARC_MAINNET.demoPayrollBlock);
  const { state: demoState } = usePayrollState(ARC_MAINNET.demoPayroll);

  // k = PaydayRun events whose runner is neither employer nor any payee ever named;
  // n = all PaydayRun events.
  const outsideRunLine = useMemo(() => {
    if (!history || !demoState) return null;
    const employer = demoState.employer?.toLowerCase() ?? '';
    const payeeSet = new Set<string>();

    // Collect all addresses that ever appeared as a payee in any PayslipIssued event.
    for (const ev of history.events) {
      if (ev.eventName === 'PayslipIssued') {
        const p = (ev.args.payee as string | undefined) ?? '';
        if (p) payeeSet.add(p.toLowerCase());
      }
    }

    let n = 0;
    let k = 0;
    for (const ev of history.events) {
      if (ev.eventName !== 'PaydayRun') continue;
      n++;
      const runner = ((ev.args.runner as string | undefined) ?? '').toLowerCase();
      // A runner is outside when it is not the employer, not a payee, and not a team wallet.
      if (runner && runner !== employer && !payeeSet.has(runner) && !TEAM_WALLET_SET.has(runner)) k++;
    }

    if (n === 0) return null;
    return { k, n, tip: demoState.tipPerRun };
  }, [history, demoState]);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    // Trigger entrance animation on mount.
    const t = setTimeout(() => setAnimate(true), 10);
    return () => clearTimeout(t);
  }, []);

  function handleHeroButton() {
    const el = document.getElementById('run-payday');

    // Scroll into view if the button is not already fully visible.
    if (el) {
      const rect = el.getBoundingClientRect();
      const fullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (!fullyVisible) {
        const top = rect.top + window.scrollY - 120;
        window.scrollTo({ top, behavior: 'smooth' });
      }
      // Focus the run button so keyboard users can take over.
      setTimeout(() => el.focus(), 500);
    }

    // Trigger the run flow immediately -- no waiting for the scroll to finish.
    cardRef.current?.press();
    // Flash the card outline so the visitor sees where the action landed.
    cardRef.current?.highlight();
  }

  // Stagger helpers for text entrance.
  function wordDelay(i: number) {
    return reducedMotion ? 0 : i * 0.06;
  }

  const words = 'Payday that never misses.'.split(' ');

  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Dot field: right half of the hero, fading to left */}
      <div
        aria-hidden="true"
        className="dot-field"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '50%',
          height: '100%',
          maskImage: 'linear-gradient(to right, transparent 0%, black 40%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 40%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '96px 48px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
        className="hero-grid"
      >
        {/* Left: editorial copy */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {/* Label */}
          <motion.span
            initial={{ opacity: reducedMotion ? 1 : 0 }}
            animate={{ opacity: animate ? 1 : (reducedMotion ? 1 : 0) }}
            transition={{ duration: 0.52, ease: EASING, delay: wordDelay(0) }}
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--ink-3)',
              marginBottom: '16px',
              display: 'block',
            }}
          >
            USDC PAYROLL ON ARC
          </motion.span>

          {/* h1: words fade and rise */}
          <h1
            style={{
              fontFamily: '"Fraunces Variable", Georgia, serif',
              fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
              fontWeight: 600,
              fontSize: 'clamp(3.5rem, 8vw, 7rem)',
              lineHeight: 0.95,
              letterSpacing: '-0.03em',
              color: 'var(--ink)',
              margin: '0 0 24px',
            }}
          >
            {words.map((word, i) => (
              <motion.span
                key={i}
                initial={reducedMotion ? {} : { opacity: 0, y: 24 }}
                animate={animate ? { opacity: 1, y: 0 } : (reducedMotion ? {} : { opacity: 0, y: 24 })}
                transition={{ duration: 0.52, ease: EASING, delay: wordDelay(i) }}
                style={{ display: 'inline-block', marginRight: '0.05em' }}
              >
                {word}{i < words.length - 1 ? ' ' : ''}
              </motion.span>
            ))}
          </h1>

          {/* Sub */}
          <motion.p
            initial={reducedMotion ? {} : { opacity: 0, y: 24 }}
            animate={animate ? { opacity: 1, y: 0 } : (reducedMotion ? {} : { opacity: 0, y: 24 })}
            transition={{ duration: 0.52, ease: EASING, delay: words.length * 0.06 + 0.12 }}
            style={{
              fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
              fontSize: '1.25rem',
              lineHeight: 1.5,
              color: 'var(--ink-2)',
              maxWidth: '34ch',
              margin: '0 0 32px',
            }}
          >
            Pay your team in USDC on a fixed day, exactly once. Anyone can press the button.
          </motion.p>

          {/* Primary CTA button */}
          <motion.div
            initial={reducedMotion ? {} : { opacity: 0, y: 24 }}
            animate={animate ? { opacity: 1, y: 0 } : (reducedMotion ? {} : { opacity: 0, y: 24 })}
            transition={{ duration: 0.52, ease: EASING, delay: words.length * 0.06 + 0.2 }}
          >
            <button
              onClick={handleHeroButton}
              style={{
                height: '48px',
                padding: '0 20px',
                borderRadius: '8px',
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontWeight: 500,
                fontSize: '1rem',
                background: 'var(--ink)',
                color: 'var(--paper)',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 120ms ease, transform 120ms ease',
                display: 'inline-block',
              }}
              onMouseEnter={e => {
                (e.currentTarget).style.background = '#1E2758';
                (e.currentTarget).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget).style.background = 'var(--ink)';
                (e.currentTarget).style.transform = 'translateY(0)';
              }}
            >
              Run a payday
            </button>
          </motion.div>

          {/* Factory address line + create link */}
          <motion.div
            initial={reducedMotion ? {} : { opacity: 0 }}
            animate={animate ? { opacity: 1 } : (reducedMotion ? {} : { opacity: 0 })}
            transition={{ duration: 0.52, ease: EASING, delay: words.length * 0.06 + 0.3 }}
            style={{ marginTop: '24px' }}
          >
            {/* Reserve height while loading so layout does not jump. */}
            <div style={{ minHeight: '3.5rem' }}>
              {outsideRunLine && (
                <>
                  <p style={{
                    fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                    fontWeight: 500,
                    fontSize: '1.125rem',
                    color: 'var(--ink)',
                    margin: '0 0 4px',
                    lineHeight: 1.4,
                  }}>
                    {outsideRunLine.k} of {outsideRunLine.n} paydays were run by wallets we do not control.
                  </p>
                  <Link
                    to="/proof"
                    className="hero-text-link"
                    style={{
                      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                      fontWeight: 500,
                      fontSize: '1rem',
                      color: 'var(--ink)',
                      textDecoration: 'underline',
                    }}
                  >
                    Re-check every cent live on the proof page
                  </Link>
                </>
              )}
            </div>
            <span style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.8125rem',
              color: 'var(--ink-3)',
              marginTop: '10px',
              display: 'block',
            }}>
              Live on Arc mainnet, factory{' '}
              <a
                href={`${EXPLORER}/address/${FACTORY}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link-underline"
                style={{ color: 'var(--ink-3)' }}
              >
                {FACTORY_SHORT}
              </a>
            </span>
            <div style={{ marginTop: '10px' }}>
              <Link
                to="/new"
                className="hero-create-link hero-text-link"
                style={{
                  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                  fontWeight: 500,
                  fontSize: '0.9375rem',
                  color: 'var(--ink)',
                  textDecoration: 'none',
                  backgroundImage: 'linear-gradient(currentColor, currentColor)',
                  backgroundPosition: '0 100%',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '0% 1px',
                  transition: 'background-size 200ms ease',
                }}
              >
                Or create your own payroll in two minutes
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Right: live demo payroll card */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <DemoPayrollCard
            ref={cardRef}
            id="run-payday"
          />
        </div>
      </div>

      {/* Mobile layout overrides */}
      <style>{`
        @media (max-width: 767px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
            padding: 48px 20px !important;
            gap: 40px !important;
          }
        }
        .hero-create-link:hover { background-size: 100% 1px !important; }
      `}</style>
    </section>
  );
}
