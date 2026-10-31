import { describe, test, expect } from 'bun:test';
import { parseFrontMatter, headingId, searchDocs } from './docParser.js';
import { NAV_ORDER } from './nav.js';

// The Vite import.meta.glob call is a browser/build-time API. In the test
// environment we build the doc list from real fs reads so coverage is real,
// not mocked. The test verifies that nav.ts covers every file in content/docs/.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// Resolve relative to the repo root (three levels up from src/components/docs/).
// import.meta.dir is a Bun runtime extension; the cast avoids a tsc error on the type.
const DOCS_DIR = join((import.meta as unknown as { dir: string }).dir, '../../../content/docs');

describe('parseFrontMatter', () => {
  test('parses title and group', () => {
    const raw = '---\ntitle: Quick start\ngroup: start\n---\n\nBody text.';
    const { title, group, body } = parseFrontMatter(raw);
    expect(title).toBe('Quick start');
    expect(group).toBe('start');
    expect(body.trim()).toBe('Body text.');
  });

  test('body that contains --- is preserved correctly', () => {
    const raw = '---\ntitle: Test\ngroup: concepts\n---\n\nBefore.\n\n---\n\nAfter.';
    const { title, body } = parseFrontMatter(raw);
    expect(title).toBe('Test');
    expect(body).toContain('Before.');
    expect(body).toContain('---');
    expect(body).toContain('After.');
  });

  test('file with no front matter returns empty title and group', () => {
    const { title, group, body } = parseFrontMatter('Just a body line.');
    expect(title).toBe('');
    expect(group).toBe('');
    expect(body).toBe('Just a body line.');
  });
});

describe('headingId', () => {
  test('lowercases and joins with hyphens', () => {
    expect(headingId('What happens on a payday')).toBe('what-happens-on-a-payday');
  });

  test('strips punctuation', () => {
    expect(headingId("Exactly once, in order")).toBe('exactly-once-in-order');
  });

  test('collapses multiple spaces and hyphens', () => {
    expect(headingId('A  B--C')).toBe('a-b-c');
  });

  test('empty string returns empty string', () => {
    expect(headingId('')).toBe('');
  });
});

describe('searchDocs', () => {
  const docs = [
    { slug: 'overview', title: 'Overview', group: 'start', body: 'Payday runs without the employer being online. Anyone can press Run payday.' },
    { slug: 'faq', title: 'FAQ', group: 'more', body: 'Why would a stranger run my payday? For the tip.' },
    { slug: 'contracts', title: 'Contracts', group: 'developers', body: 'No proxies, no owner, no upgrade path.' },
  ];

  test('title match returns the matching doc', () => {
    const r = searchDocs(docs, 'Overview');
    expect(r).toHaveLength(1);
    expect(r[0].slug).toBe('overview');
  });

  test('body match returns the matching doc with a snippet', () => {
    const r = searchDocs(docs, 'stranger');
    expect(r).toHaveLength(1);
    expect(r[0].slug).toBe('faq');
    expect(r[0].snippet.toLowerCase()).toContain('stranger');
  });

  test('no match returns empty array', () => {
    expect(searchDocs(docs, 'blockchain')).toHaveLength(0);
  });

  test('empty term returns empty array', () => {
    expect(searchDocs(docs, '  ')).toHaveLength(0);
  });

  test('match is case-insensitive', () => {
    const r = searchDocs(docs, 'PAYDAY');
    // overview and faq both mention payday
    expect(r.length).toBeGreaterThanOrEqual(2);
  });
});

describe('nav order covers every file in content/docs', () => {
  test('every slug in NAV_ORDER has a corresponding .md file', () => {
    const files = readdirSync(DOCS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''));
    for (const slug of NAV_ORDER) {
      expect(files).toContain(slug);
    }
  });

  test('every .md file in content/docs is listed in NAV_ORDER', () => {
    const files = readdirSync(DOCS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''));
    for (const file of files) {
      expect(NAV_ORDER).toContain(file);
    }
  });
});
