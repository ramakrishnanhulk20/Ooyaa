/**
 * /docs and /docs/:slug: the docs reader.
 * Three-column layout on desktop: sidebar (240px), content (max 720px), on-this-page (200px).
 * Sidebar becomes a sheet on mobile. On-this-page collapses under the h1 on mobile.
 * Routes: /docs -> overview, /docs/:slug, unknown slug shows an error message.
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Nav } from '../components/Nav.js';
import { DocReader } from '../components/docs/DocReader.js';
import { DocSearch } from '../components/docs/DocSearch.js';
import { DOC_GROUPS, NAV_ORDER } from '../components/docs/nav.js';
import { parseFrontMatter, extractHeadings } from '../components/docs/docParser.js';
import type { DocMeta } from '../components/docs/docParser.js';

// Load all markdown files at build time.
// The cast to Record<string, string> is safe: the query: '?raw' import returns strings.
const RAW_DOCS = import.meta.glob('/content/docs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function slugFromPath(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.md$/, '');
}

function buildDocList(): DocMeta[] {
  return Object.entries(RAW_DOCS).map(([path, raw]) => {
    const slug = slugFromPath(path);
    const { title, group, body } = parseFrontMatter(raw);
    return { slug, title, group, body };
  });
}

const ALL_DOCS: DocMeta[] = buildDocList();
const DOC_MAP: Map<string, DocMeta> = new Map(ALL_DOCS.map(d => [d.slug, d]));

function SidebarContent({ activeSlug, onNavigate }: { activeSlug: string; onNavigate?: () => void }) {
  return (
    <div>
      <DocSearch docs={ALL_DOCS} onNavigate={onNavigate} />
      {DOC_GROUPS.map(group => (
        <div key={group.key} style={{ marginBottom: '24px' }}>
          <div style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ink-3)',
            marginBottom: '8px',
          }}>
            {group.label}
          </div>
          {group.slugs.map(slug => {
            const doc = DOC_MAP.get(slug);
            const isActive = slug === activeSlug;
            return (
              <Link
                key={slug}
                to={slug === 'overview' ? '/docs' : `/docs/${slug}`}
                onClick={onNavigate}
                style={{
                  display: 'block',
                  padding: '5px 12px 5px 10px',
                  marginBottom: '2px',
                  borderLeft: isActive ? '2px solid var(--stamp)' : '2px solid transparent',
                  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                  fontSize: '0.9375rem',
                  color: isActive ? 'var(--ink)' : 'var(--ink-2)',
                  fontWeight: isActive ? 500 : 400,
                  textDecoration: 'none',
                  borderRadius: '0 4px 4px 0',
                  transition: 'color 120ms',
                }}
                className="sidebar-link"
              >
                {doc?.title ?? slug}
              </Link>
            );
          })}
        </div>
      ))}
      <style>{`
        .sidebar-link:hover { color: var(--ink) !important; }
      `}</style>
    </div>
  );
}

function OnThisPage({ headings, activeId }: {
  headings: ReturnType<typeof extractHeadings>;
  activeId: string | null;
}) {
  if (headings.length === 0) return null;
  return (
    <div>
      <div style={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '0.75rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--ink-3)',
        marginBottom: '12px',
      }}>
        On this page
      </div>
      {headings.map(h => (
        <a
          key={h.id}
          href={`#${h.id}`}
          style={{
            display: 'block',
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
            fontSize: '0.875rem',
            color: activeId === h.id ? 'var(--ink)' : 'var(--ink-3)',
            fontWeight: activeId === h.id ? 500 : 400,
            textDecoration: 'none',
            paddingLeft: h.level === 3 ? '14px' : '0',
            paddingTop: '4px',
            paddingBottom: '4px',
            transition: 'color 120ms',
          }}
          className="otp-link"
        >
          {h.text}
        </a>
      ))}
      <style>{`
        .otp-link:hover { color: var(--ink) !important; }
      `}</style>
    </div>
  );
}

function MobileOnThisPage({ headings }: { headings: ReturnType<typeof extractHeadings> }) {
  const [open, setOpen] = useState(false);
  if (headings.length === 0) return null;
  return (
    <div style={{ marginBottom: '32px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="docs-otp-toggle"
        style={{
          background: 'none',
          border: '1px solid var(--rule)',
          borderRadius: '8px',
          padding: '8px 14px',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.8125rem',
          color: 'var(--ink-3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        On this page
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms', display: 'inline-block' }}>
          {'\u25BE'}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: '8px', paddingLeft: '4px' }}>
          {headings.map(h => (
            <a
              key={h.id}
              href={`#${h.id}`}
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontSize: '0.9375rem',
                color: 'var(--ink-2)',
                textDecoration: 'none',
                paddingLeft: h.level === 3 ? '16px' : '0',
                paddingTop: '6px',
                paddingBottom: '6px',
              }}
            >
              {h.text}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileMenuSheet({ activeSlug, onClose }: { activeSlug: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
      }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(18,25,63,0.3)' }} />
      {/* Sheet */}
      <div
        style={{
          position: 'relative',
          width: '280px',
          height: '100%',
          background: 'var(--paper)',
          borderRight: '1px solid var(--rule)',
          overflowY: 'auto',
          padding: '24px 20px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ink-3)',
          }}>
            Docs
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: '1.25rem', lineHeight: 1 }}
          >
            {'\u00D7'}
          </button>
        </div>
        <SidebarContent activeSlug={activeSlug} onNavigate={onClose} />
      </div>
    </div>
  );
}

function PrevNext({ slug }: { slug: string }) {
  const idx = NAV_ORDER.indexOf(slug);
  const prevSlug = idx > 0 ? NAV_ORDER[idx - 1] : null;
  const nextSlug = idx < NAV_ORDER.length - 1 ? NAV_ORDER[idx + 1] : null;
  const prevDoc = prevSlug ? DOC_MAP.get(prevSlug) : null;
  const nextDoc = nextSlug ? DOC_MAP.get(nextSlug) : null;

  if (!prevDoc && !nextDoc) return null;

  const linkStyle = (dir: 'prev' | 'next'): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '16px 20px',
    border: '1px solid var(--rule)',
    borderRadius: '8px',
    textDecoration: 'none',
    flex: 1,
    minWidth: 0,
    textAlign: dir === 'next' ? 'right' : 'left',
    transition: 'border-color 120ms',
  });

  return (
    <div style={{
      display: 'flex',
      gap: '16px',
      marginTop: '64px',
      paddingTop: '32px',
      borderTop: '1px solid var(--rule)',
    }} className="prevnext-row">
      {prevDoc ? (
        <Link
          to={prevSlug === 'overview' ? '/docs' : `/docs/${prevSlug}`}
          style={linkStyle('prev')}
          className="prevnext-card"
        >
          <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>
            Previous
          </span>
          <span style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.9375rem', color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {prevDoc.title}
          </span>
        </Link>
      ) : <div style={{ flex: 1 }} />}
      {nextDoc ? (
        <Link
          to={nextSlug === 'overview' ? '/docs' : `/docs/${nextSlug}`}
          style={linkStyle('next')}
          className="prevnext-card"
        >
          <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>
            Next
          </span>
          <span style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '0.9375rem', color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nextDoc.title}
          </span>
        </Link>
      ) : <div style={{ flex: 1 }} />}
      <style>{`
        .prevnext-card:hover { border-color: var(--ink) !important; }
      `}</style>
    </div>
  );
}

function useActiveHeading(headings: ReturnType<typeof extractHeadings>) {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    if (headings.length === 0) return;

    const observers: IntersectionObserver[] = [];
    const visible = new Set<string>();

    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (!el) continue;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            visible.add(h.id);
          } else {
            visible.delete(h.id);
          }
          // Pick the first visible heading in document order.
          const first = headings.find(hh => visible.has(hh.id));
          if (first) setActiveId(first.id);
        },
        { rootMargin: '-10% 0px -70% 0px' },
      );
      obs.observe(el);
      observers.push(obs);
    }

    return () => observers.forEach(o => o.disconnect());
  }, [headings]);

  return activeId;
}

export function DocsPage() {
  const { slug: rawSlug } = useParams<{ slug?: string }>();
  const slug = rawSlug ?? 'overview';

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const doc = DOC_MAP.get(slug);
  const headings = doc ? extractHeadings(doc.body) : [];
  const activeId = useActiveHeading(headings);

  // Scroll to top when navigating between pages.
  const prevSlugRef = useRef(slug);
  useEffect(() => {
    if (prevSlugRef.current !== slug) {
      window.scrollTo({ top: 0 });
      prevSlugRef.current = slug;
    }
  }, [slug]);

  const pageTitle = doc ? `${doc.title} | Ooyaa docs` : 'Ooyaa docs';

  useEffect(() => {
    document.title = pageTitle;
    return () => { document.title = 'Ooyaa'; };
  }, [pageTitle]);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--paper)' }}>
      <Nav />

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 48px' }} className="docs-outer">
        <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-start', paddingTop: '48px', paddingBottom: '0' }}>

          {/* Left sidebar: sticky, desktop only. */}
          <aside style={{
            width: '240px',
            flexShrink: 0,
            position: 'sticky',
            top: '96px',
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
          }} className="docs-sidebar">
            <SidebarContent activeSlug={slug} />
          </aside>

          {/* Main content */}
          <main style={{ flex: 1, minWidth: 0, maxWidth: '720px' }}>
            {/* Mobile: Menu button */}
            <div className="docs-mobile-menu-bar" style={{ display: 'none', marginBottom: '20px' }}>
              <button
                onClick={() => setMobileMenuOpen(true)}
                style={{
                  background: 'none',
                  border: '1px solid var(--rule)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                  fontSize: '0.9375rem',
                  color: 'var(--ink-2)',
                  cursor: 'pointer',
                }}
              >
                Menu
              </button>
            </div>

            {!doc ? (
              <div>
                <h1 style={{
                  fontFamily: '"Fraunces Variable", Georgia, serif',
                  fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
                  fontWeight: 600,
                  fontSize: '2.5rem',
                  color: 'var(--ink)',
                  marginBottom: '16px',
                }}>
                  No page called &ldquo;{slug}&rdquo;.
                </h1>
                <p style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: '1.0625rem', color: 'var(--ink-2)' }}>
                  <Link to="/docs" style={{ color: 'var(--ink)', textDecoration: 'underline' }}>Back to the docs</Link>
                </p>
              </div>
            ) : (
              <>
                {/* Page title h1: visible on all viewports. */}
                <h1 style={{
                  fontFamily: '"Fraunces Variable", Georgia, serif',
                  fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
                  fontWeight: 600,
                  fontSize: '2.5rem',
                  color: 'var(--ink)',
                  marginBottom: '24px',
                  lineHeight: 1.05,
                }}>
                  {doc.title}
                </h1>

                {/* Mobile: on-this-page dropdown, below the h1 */}
                <div className="docs-otp-mobile" style={{ display: 'none' }}>
                  <MobileOnThisPage headings={headings} />
                </div>

                <DocReader body={doc.body} />
                <PrevNext slug={slug} />
              </>
            )}
          </main>

          {/* Right: On this page, sticky, desktop only. */}
          <aside style={{
            width: '200px',
            flexShrink: 0,
            position: 'sticky',
            top: '96px',
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
          }} className="docs-otp-desktop">
            <OnThisPage headings={headings} activeId={activeId} />
          </aside>
        </div>
      </div>

      {mobileMenuOpen && (
        <MobileMenuSheet
          activeSlug={slug}
          onClose={() => {
            setMobileMenuOpen(false);
          }}
        />
      )}

      <style>{`
        @media (max-width: 1023px) {
          .docs-outer { padding: 0 20px !important; }
          .docs-sidebar { display: none !important; }
          .docs-otp-desktop { display: none !important; }
          .docs-mobile-menu-bar { display: block !important; }
          .docs-otp-mobile { display: block !important; }
          .prevnext-row { flex-direction: column !important; }
        }
        @media (min-width: 1024px) {
          .docs-otp-mobile { display: none !important; }
          .docs-mobile-menu-bar { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// Re-export for the test suite so navigate prop usage is testable.
export { DOC_MAP, ALL_DOCS };
