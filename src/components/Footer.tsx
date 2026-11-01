/**
 * Site-wide footer. 1px --rule top, 48px vertical padding.
 * Three columns: wordmark, links, chain fact.
 * Stacks vertically on mobile.
 */
import { Link } from 'react-router-dom';
import { StampRing } from './StampRing.js';
import { ARC_MAINNET } from '../deployments.js';

const REPO_URL = 'https://github.com/ramakrishnanhulk20/ooyaa';
const ARC_STUDIO_URL = 'https://studio.arc.io/app/dd654bc5-3b39-44da-bd26-b241e830343f';

// Hide the Source code link until the repository URL is a real GitHub address.
const repoIsReal = REPO_URL.startsWith('https://github.com/');

const NAV_LINK: React.CSSProperties = {
  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
  fontSize: '0.9375rem',
  color: 'var(--ink-2)',
  textDecoration: 'none',
  display: 'block',
  paddingBottom: '6px',
};

function FooterNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} style={NAV_LINK} className="footer-link">
      {children}
    </Link>
  );
}

function FooterExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={NAV_LINK} className="footer-link">
      {children}
    </a>
  );
}

const shortFactory = `${ARC_MAINNET.factory.slice(0, 6)}...${ARC_MAINNET.factory.slice(-4)}`;

export function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--rule)',
      marginTop: '80px',
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '48px 48px',
        display: 'flex',
        gap: '48px',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }} className="footer-inner">

        {/* Left: wordmark */}
        <Link to="/" className="footer-logo-link" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 }}>
          <StampRing size={22} />
          <span style={{
            fontFamily: '"Fraunces Variable", Georgia, serif',
            fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
            fontWeight: 600,
            fontSize: '1.375rem',
            color: 'var(--ink)',
            lineHeight: 1,
          }}>
            Ooyaa
          </span>
        </Link>

        {/* Middle: links */}
        <nav style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          <div>
            <FooterNavLink to="/new">Create</FooterNavLink>
            <FooterNavLink to="/proof">Proof</FooterNavLink>
            <FooterNavLink to="/docs">Docs</FooterNavLink>
          </div>
          <div>
            <FooterNavLink to="/docs/judges">For judges</FooterNavLink>
            <FooterExtLink href={ARC_STUDIO_URL}>Arc Studio project</FooterExtLink>
            {repoIsReal && (
              <FooterExtLink href={REPO_URL}>Source code</FooterExtLink>
            )}
          </div>
        </nav>

        {/* Right: chain fact */}
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.8125rem',
          color: 'var(--ink-3)',
          lineHeight: 1.6,
          flexShrink: 0,
        }}>
          <div>Live on Arc mainnet.</div>
          <div>
            Factory{' '}
            <a
              href={`${ARC_MAINNET.explorer}/address/${ARC_MAINNET.factory}`}
              target="_blank"
              rel="noopener noreferrer"
              className="footer-factory-link"
              style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}
            >
              {shortFactory}
            </a>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 767px) {
          .footer-inner {
            padding: 40px 20px !important;
            flex-direction: column !important;
            gap: 32px !important;
          }
        }
        .footer-link:hover { color: var(--ink) !important; }
      `}</style>
    </footer>
  );
}
