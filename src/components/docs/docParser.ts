/**
 * Utilities for parsing doc markdown files and building search/nav data.
 * No external dependency: front matter is parsed with a hand-written parser
 * so we avoid adding gray-matter or similar packages.
 */

export type DocMeta = {
  slug: string;
  title: string;
  group: string;
  /** Full markdown body (without front matter). */
  body: string;
};

/**
 * Parses a markdown file's YAML-like front matter.
 * Supports only `title` and `group` string values, which is all Ooyaa docs use.
 * A body that itself contains "---" is safe because we look only for the opening
 * and closing delimiters at line start.
 */
export function parseFrontMatter(raw: string): { title: string; group: string; body: string } {
  const lines = raw.split('\n');
  let title = '';
  let group = '';
  let body = raw;

  if (lines[0].trim() !== '---') {
    return { title, group, body };
  }

  let closeIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) {
    return { title, group, body };
  }

  for (let i = 1; i < closeIndex; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (key === 'title') title = val;
    if (key === 'group') group = val;
  }

  body = lines.slice(closeIndex + 1).join('\n').replace(/^\n/, '');
  return { title, group, body };
}

/**
 * Converts a heading text to a URL-safe id.
 * Lowercases, strips non-alphanumeric characters (except spaces and hyphens),
 * then replaces runs of spaces with a single hyphen.
 */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Extracts h2 and h3 headings from markdown body text.
 * Returns each heading's level, text and id, in document order.
 */
export function extractHeadings(body: string): Array<{ level: 2 | 3; text: string; id: string }> {
  const headings: Array<{ level: 2 | 3; text: string; id: string }> = [];
  const lines = body.split('\n');
  for (const line of lines) {
    const m2 = line.match(/^##\s+(.+)/);
    if (m2) {
      headings.push({ level: 2, text: m2[1].trim(), id: headingId(m2[1].trim()) });
      continue;
    }
    const m3 = line.match(/^###\s+(.+)/);
    if (m3) {
      headings.push({ level: 3, text: m3[1].trim(), id: headingId(m3[1].trim()) });
    }
  }
  return headings;
}

/**
 * Returns a one-line snippet around the first match of `term` in `text`,
 * up to ~120 characters, with the matched word preserved in its case.
 */
function snippet(text: string, term: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(term.toLowerCase());
  if (idx === -1) return text.slice(0, 80).replace(/\n/g, ' ');
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + term.length + 80);
  const pre = start > 0 ? '...' : '';
  const post = end < text.length ? '...' : '';
  return pre + text.slice(start, end).replace(/\n/g, ' ') + post;
}

export type SearchResult = {
  slug: string;
  title: string;
  snippet: string;
};

/**
 * Filters a list of docs by a search term.
 * Matches against the title and body, case-insensitive.
 * Returns the matching docs with a one-line body snippet.
 */
export function searchDocs(docs: DocMeta[], term: string): SearchResult[] {
  if (!term.trim()) return [];
  const lower = term.toLowerCase();
  const results: SearchResult[] = [];
  for (const doc of docs) {
    const titleMatch = doc.title.toLowerCase().includes(lower);
    const bodyMatch = doc.body.toLowerCase().includes(lower);
    if (titleMatch || bodyMatch) {
      results.push({
        slug: doc.slug,
        title: doc.title,
        snippet: snippet(doc.body, term),
      });
    }
  }
  return results;
}
