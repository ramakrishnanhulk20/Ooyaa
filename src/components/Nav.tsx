import { useState } from 'react';
import { ConnectKitButton } from 'connectkit';
import { Link, useLocation } from 'react-router-dom';
import { StampRing } from './StampRing.js';

/** Top navigation bar: 72px tall, 1px --rule bottom border. */
export function Nav() {
  const { pathname } = useLocation();
  const proofActive = pathname === '/proof';
  const createActive = pathname === '/new';
  const docsActive = pathname.startsWith('/docs');
  const [menuOpen, setMenuOpen] = useState(false);

  function navLink(to: string, label: string, isActive: boolean) {
    const className = `nav-link nav-link-${label.toLowerCase()}`;
    return (
      <Link
        to={to}
        className={className}
        style={{
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          fontWeight: 500,
          fontSize: '0.9375rem',
          color: isActive ? 'var(--ink)' : 'var(--ink-2)',
          textDecoration: 'none',
          position: 'relative',
          paddingBottom: '2px',
        }}
      >
        {label}
        <span
          className={`nav-link-underline nav-link-underline-${label.toLowerCase()}`}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '1px',
            background: 'var(--ink)',
            width: isActive ? '100%' : '0%',
            transition: 'width 200ms ease',
          }}
        />
      </Link>
    );
  }

  return (
    <header
      style={{
        height: '72px',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--paper)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 48px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        className="nav-inner"
      >
        {/* Wordmark */}
        <Link
          to="/"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}
        >
          <StampRing size={22} />
          <span
            style={{
              fontFamily: '"Fraunces Variable", Georgia, serif',
              fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
              fontWeight: 600,
              fontSize: '1.375rem',
              color: 'var(--ink)',
              lineHeight: 1,
            }}
          >
            Ooyaa
          </span>
        </Link>

        {/* Desktop: Create + Proof + Docs links + Connect wallet */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }} className="nav-links-desktop">
          {navLink('/new', 'Create', createActive)}
          {navLink('/proof', 'Proof', proofActive)}
          {navLink('/docs', 'Docs', docsActive)}

          <ConnectKitButton.Custom>
            {({ isConnected, show, truncatedAddress, ensName }) => (
              <button
                onClick={show}
                className="btn-secondary"
                style={{
                  height: '40px',
                  padding: '0 16px',
                  borderRadius: '8px',
                  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {isConnected ? (ensName ?? truncatedAddress ?? 'Connected') : 'Connect'}
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>

        {/* Mobile: menu button + Connect */}
        <div style={{ display: 'none', alignItems: 'center', gap: '12px' }} className="nav-links-mobile">
          <ConnectKitButton.Custom>
            {({ isConnected, show, truncatedAddress, ensName }) => (
              <button
                onClick={show}
                className="btn-secondary"
                style={{
                  height: '44px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                  fontWeight: 500,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {isConnected ? (ensName ?? truncatedAddress ?? 'Connected') : 'Connect'}
              </button>
            )}
          </ConnectKitButton.Custom>

          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Navigation menu"
            style={{
              background: 'none',
              border: '1px solid var(--rule)',
              borderRadius: '8px',
              width: '44px',
              height: '44px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-2)',
              fontSize: '1rem',
            }}
          >
            {menuOpen ? '\u00D7' : '\u2630'}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div style={{
          position: 'absolute',
          top: '72px',
          left: 0,
          right: 0,
          background: 'var(--paper)',
          borderBottom: '1px solid var(--rule)',
          padding: '16px 20px',
          zIndex: 99,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }} className="nav-mobile-dropdown">
          <Link
            to="/new"
            onClick={() => setMenuOpen(false)}
            style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontWeight: 500, fontSize: '1rem', color: createActive ? 'var(--ink)' : 'var(--ink-2)', textDecoration: 'none', padding: '10px 0', borderBottom: '1px solid var(--rule)' }}
          >
            Create
          </Link>
          <Link
            to="/proof"
            onClick={() => setMenuOpen(false)}
            style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontWeight: 500, fontSize: '1rem', color: proofActive ? 'var(--ink)' : 'var(--ink-2)', textDecoration: 'none', padding: '10px 0', borderBottom: '1px solid var(--rule)' }}
          >
            Proof
          </Link>
          <Link
            to="/docs"
            onClick={() => setMenuOpen(false)}
            style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontWeight: 500, fontSize: '1rem', color: docsActive ? 'var(--ink)' : 'var(--ink-2)', textDecoration: 'none', padding: '10px 0' }}
          >
            Docs
          </Link>
        </div>
      )}

      <style>{`
        @media (max-width: 767px) {
          .nav-inner { padding: 0 20px !important; }
          .nav-links-desktop { display: none !important; }
          .nav-links-mobile { display: flex !important; }
        }
        .nav-link:hover { color: var(--ink) !important; }
        .nav-link:hover .nav-link-underline { width: 100% !important; }
      `}</style>
    </header>
  );
}
