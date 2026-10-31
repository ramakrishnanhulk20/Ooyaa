import { useEffect, useRef, useState } from 'react';

let mermaidInitialized = false;

async function initMermaid() {
  if (mermaidInitialized) return;
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
      primaryColor: '#FFFFFF',
      primaryBorderColor: '#12193F',
      primaryTextColor: '#12193F',
      lineColor: '#575A64',
      fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
      edgeLabelBackground: '#F5F5F3',
    },
  });
  mermaidInitialized = true;
}

let diagramCounter = 0;

type Props = {
  code: string;
};

/**
 * Renders a mermaid diagram lazily after mount.
 * Falls back to a code block if rendering fails so broken diagrams
 * do not crash the page.
 */
export function MermaidBlock({ code }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string>(`mermaid-${++diagramCounter}`);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await initMermaid();
        if (cancelled) return;
        const mermaid = (await import('mermaid')).default;
        const { svg } = await mermaid.render(idRef.current, code);
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div>
        <pre style={{
          background: 'var(--slip)',
          border: '1px solid var(--rule)',
          borderRadius: '8px',
          padding: '16px',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.875rem',
          overflowX: 'auto',
          color: 'var(--ink-2)',
        }}>
          {code}
        </pre>
        <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', color: 'var(--ink-3)', marginTop: '8px' }}>
          This diagram could not render.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        overflowX: 'auto',
        margin: '24px 0',
        background: 'var(--slip)',
        border: '1px solid var(--rule)',
        borderRadius: '8px',
        padding: '24px',
      }}
    />
  );
}
