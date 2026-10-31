/**
 * Search input and result list for the /docs sidebar.
 * Filters by title and body text, case-insensitive, showing a snippet.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DocMeta } from './docParser.js';
import { searchDocs } from './docParser.js';

type Props = {
  docs: DocMeta[];
  onNavigate?: () => void;
};

export function DocSearch({ docs, onNavigate }: Props) {
  const [term, setTerm] = useState('');
  const results = searchDocs(docs, term);
  const showResults = term.trim().length > 0;

  return (
    <div style={{ marginBottom: '24px' }}>
      <input
        type="search"
        value={term}
        onChange={e => setTerm(e.target.value)}
        placeholder="Search docs..."
        style={{
          width: '100%',
          height: '40px',
          padding: '0 12px',
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          fontSize: '0.9375rem',
          color: 'var(--ink)',
          background: 'var(--slip)',
          border: '1px solid var(--rule)',
          borderRadius: '8px',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {showResults && (
        <div style={{
          marginTop: '8px',
          background: 'var(--slip)',
          border: '1px solid var(--rule)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          {results.length === 0 ? (
            <div style={{
              padding: '12px',
              fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
              fontSize: '0.875rem',
              color: 'var(--ink-3)',
            }}>
              No pages found.
            </div>
          ) : (
            results.map(r => (
              <Link
                key={r.slug}
                to={`/docs/${r.slug}`}
                onClick={onNavigate}
                style={{ display: 'block', padding: '10px 12px', textDecoration: 'none', borderBottom: '1px solid var(--rule)' }}
                className="doc-search-result"
              >
                <div style={{
                  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                  fontWeight: 500,
                  fontSize: '0.9375rem',
                  color: 'var(--ink)',
                  marginBottom: '3px',
                }}>
                  {r.title}
                </div>
                <div style={{
                  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                  fontSize: '0.8125rem',
                  color: 'var(--ink-3)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {r.snippet}
                </div>
              </Link>
            ))
          )}
        </div>
      )}
      <style>{`
        .doc-search-result:hover { background: var(--paper) !important; }
        .doc-search-result:last-child { border-bottom: none !important; }
      `}</style>
    </div>
  );
}
