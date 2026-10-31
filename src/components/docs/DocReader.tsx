/**
 * Renders a markdown document body with react-markdown and remark-gfm.
 * Custom renderers apply the product's visual system to code blocks,
 * tables, headings and links. Mermaid fenced code blocks are rendered
 * with the MermaidBlock component so the browser can draw them after mount.
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import React from 'react';
import { headingId } from './docParser.js';
import { MermaidBlock } from './MermaidBlock.js';

/** Recursively extracts plain text from a ReactNode tree. */
function nodeText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (React.isValidElement(node)) {
    const p = node.props as { children?: React.ReactNode };
    return nodeText(p.children);
  }
  return '';
}

type Props = {
  body: string;
};

function LinkIcon() {
  return (
    <span aria-hidden="true" style={{ opacity: 0, marginLeft: '6px', fontSize: '0.875em', transition: 'opacity 120ms' }} className="heading-link-icon">
      #
    </span>
  );
}

function HeadingAnchor({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${id}`}
      style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
      className="heading-anchor"
    >
      {children}
      <LinkIcon />
    </a>
  );
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        background: 'none',
        border: '1px solid var(--rule)',
        borderRadius: '6px',
        padding: '3px 8px',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '0.6875rem',
        color: 'var(--ink-3)',
        cursor: 'pointer',
        transition: 'color 120ms',
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function DocReader({ body }: Props) {
  return (
    <div className="doc-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1({ children }) {
            const text = nodeText(children);
            const id = headingId(text);
            return (
              <h1 id={id} style={{
                fontFamily: '"Fraunces Variable", Georgia, serif',
                fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
                fontWeight: 600,
                fontSize: '3rem',
                lineHeight: 1.05,
                color: 'var(--ink)',
                marginBottom: '24px',
                letterSpacing: '-0.01em',
              }}>
                {children}
              </h1>
            );
          },
          h2({ children }) {
            const text = nodeText(children);
            const id = headingId(text);
            return (
              <h2 id={id} style={{
                fontFamily: '"Fraunces Variable", Georgia, serif',
                fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0',
                fontWeight: 600,
                fontSize: '1.75rem',
                color: 'var(--ink)',
                marginTop: '40px',
                marginBottom: '16px',
                lineHeight: 1.2,
              }} className="doc-h2">
                <HeadingAnchor id={id}>{children}</HeadingAnchor>
              </h2>
            );
          },
          h3({ children }) {
            const text = nodeText(children);
            const id = headingId(text);
            return (
              <h3 id={id} style={{
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontWeight: 600,
                fontSize: '1.125rem',
                color: 'var(--ink)',
                marginTop: '28px',
                marginBottom: '10px',
                lineHeight: 1.4,
              }} className="doc-h3">
                <HeadingAnchor id={id}>{children}</HeadingAnchor>
              </h3>
            );
          },
          h4({ children }) {
            return (
              <h4 style={{
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontWeight: 600,
                fontSize: '1rem',
                color: 'var(--ink)',
                marginTop: '20px',
                marginBottom: '8px',
              }}>
                {children}
              </h4>
            );
          },
          p({ children }) {
            return (
              <p style={{
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontSize: '1.0625rem',
                lineHeight: 1.7,
                color: 'var(--ink-2)',
                margin: '0 0 16px',
              }}>
                {children}
              </p>
            );
          },
          ul({ children }) {
            return (
              <ul style={{
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontSize: '1.0625rem',
                lineHeight: 1.7,
                color: 'var(--ink-2)',
                margin: '0 0 16px',
                paddingLeft: '24px',
              }}>
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol style={{
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontSize: '1.0625rem',
                lineHeight: 1.7,
                color: 'var(--ink-2)',
                margin: '0 0 16px',
                paddingLeft: '24px',
              }}>
                {children}
              </ol>
            );
          },
          li({ children }) {
            return (
              <li style={{ marginBottom: '6px' }}>
                {children}
              </li>
            );
          },
          a({ href, children }) {
            if (!href) return <a>{children}</a>;
            const isInternal = href.startsWith('/');
            if (isInternal) {
              return (
                <Link
                  to={href}
                  style={{ color: 'var(--ink)', textDecoration: 'underline' }}
                >
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {children}
              </a>
            );
          },
          code({ className, children, ...props }) {
            const inline = !className;
            const match = /language-(\w+)/.exec(className ?? '');
            const lang = match ? match[1] : '';
            const code = nodeText(children).replace(/\n$/, '');

            if (inline || !lang) {
              return (
                <code
                  style={{
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: '0.875em',
                    background: 'var(--slip)',
                    border: '1px solid var(--rule)',
                    borderRadius: '4px',
                    padding: '1px 5px',
                    color: 'var(--ink)',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-all',
                  }}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            if (lang === 'mermaid') {
              return <MermaidBlock code={code} />;
            }

            return (
              <div style={{ position: 'relative', margin: '16px 0' }}>
                <pre style={{
                  background: 'var(--slip)',
                  border: '1px solid var(--rule)',
                  borderRadius: '8px',
                  padding: '16px 48px 16px 16px',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.875rem',
                  overflowX: 'auto',
                  color: 'var(--ink)',
                  lineHeight: 1.6,
                }}>
                  <code>{children}</code>
                </pre>
                <CopyButton code={code} />
              </div>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
          table({ children }) {
            return (
              <div style={{ overflowX: 'auto', margin: '20px 0' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                  fontSize: '0.9375rem',
                }}>
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead style={{ borderBottom: '1px solid var(--rule)' }}>
                {children}
              </thead>
            );
          },
          th({ children }) {
            return (
              <th style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--ink-3)',
                fontWeight: 400,
                padding: '10px 12px',
                textAlign: 'left',
              }}>
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td style={{
                borderBottom: '1px solid var(--rule)',
                padding: '10px 12px',
                color: 'var(--ink-2)',
                verticalAlign: 'top',
              }}>
                {children}
              </td>
            );
          },
          blockquote({ children }) {
            return (
              <blockquote style={{
                borderLeft: '3px solid var(--rule)',
                margin: '16px 0',
                paddingLeft: '16px',
                color: 'var(--ink-2)',
                fontStyle: 'italic',
              }}>
                {children}
              </blockquote>
            );
          },
          hr() {
            return <hr style={{ border: 'none', borderTop: '1px solid var(--rule)', margin: '32px 0' }} />;
          },
          strong({ children }) {
            return <strong style={{ fontWeight: 600, color: 'var(--ink)' }}>{children}</strong>;
          },
        }}
      >
        {body}
      </ReactMarkdown>

      <style>{`
        .doc-h2:hover .heading-link-icon,
        .doc-h3:hover .heading-link-icon {
          opacity: 0.5 !important;
        }
        .heading-anchor:hover .heading-link-icon {
          opacity: 0.5 !important;
        }
      `}</style>
    </div>
  );
}
