import { Nav } from '../components/Nav.js';
import { Hero } from '../components/Hero.js';

/** Home page: nav + hero (which contains the demo payroll card). */
export function HomePage() {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper)' }}>
      <Nav />
      <main>
        <Hero />
      </main>
    </div>
  );
}
