/**
 * Canonical page order and group labels for the /docs sidebar.
 * Slugs must match the filenames in content/docs/ (without .md).
 * The group order here defines the sidebar section order.
 */

export type DocGroup = {
  key: string;
  label: string;
  slugs: string[];
};

export const DOC_GROUPS: DocGroup[] = [
  {
    key: 'start',
    label: 'Start here',
    slugs: ['overview', 'quick-start', 'wallet'],
  },
  {
    key: 'concepts',
    label: 'Concepts',
    slugs: ['how-it-works', 'why-arc'],
  },
  {
    key: 'guides',
    label: 'Guides',
    slugs: ['create-payroll', 'run-payday', 'payslips', 'verify'],
  },
  {
    key: 'developers',
    label: 'Developers',
    slugs: ['contracts', 'architecture', 'prove-it'],
  },
  {
    key: 'security',
    label: 'Security',
    slugs: ['trust', 'threat-model', 'limits'],
  },
  {
    key: 'more',
    label: 'More',
    slugs: ['judges', 'faq'],
  },
];

/** Flat list of slugs in sidebar order (across all groups). */
export const NAV_ORDER: string[] = DOC_GROUPS.flatMap(g => g.slugs);
