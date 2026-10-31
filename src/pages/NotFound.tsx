import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      color: 'var(--ink-2)',
    }}>
      Nothing here. <Link to="/" className="link-underline" style={{ color: 'var(--ink)', marginLeft: '6px' }}>Go home</Link>
    </div>
  );
}
