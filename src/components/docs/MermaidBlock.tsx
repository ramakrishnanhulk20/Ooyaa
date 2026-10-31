import { useEffect, useRef, useState } from 'react';

let mermaidInitialized = false;

async function initMermaid() {
  if (mermaidInitialized) return;
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    // flowchart.useMaxWidth false lets the diagram grow to its natural width
    // inside the scrollable container; sequence diagrams keep fitting the column.
    flowchart: { useMaxWidth: false },
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

  // Flowcharts need minWidth: max-content so the SVG can grow to its natural
  // width and the outer overflowX: auto scrolls when narrower than the viewport.
  const isFlowchart = /^\s*(flowchart|graph)\s/i.test(code);

  return (
    <div
      style={{
        overflowX: 'auto',
        margin: '24px 0',
        background: 'var(--slip)',
        border: '1px solid var(--rule)',
        borderRadius: '8px',
        padding: '24px',
      }}
    >
      <div
        ref={containerRef}
        style={{ minWidth: isFlowchart ? 'max-content' : undefined, display: 'flex', justifyContent: 'center' }}
      />
    </div>
  );
}
