import { isOpenableUrl, normalizeActions } from './actions';

describe('normalizeActions', () => {
  it('keeps well-formed actions in either casing and fills reply text from the label', () => {
    expect(normalizeActions([
      { id: 'a1', kind: 'reply', label: 'Pricing' },
      { Id: 'a2', Kind: 'LINK', Label: 'Refunds', Url: 'https://acme.com/r' },
      { id: 'a3', kind: 'handoff', label: 'Person' },
    ])).toEqual([
      { id: 'a1', kind: 'reply', label: 'Pricing', text: 'Pricing' },
      { id: 'a2', kind: 'link', label: 'Refunds', url: 'https://acme.com/r' },
      { id: 'a3', kind: 'handoff', label: 'Person' },
    ]);
  });

  it('drops unknown kinds, empty or long labels, and caps at four', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ kind: 'reply', label: `Q${i}` }));
    expect(normalizeActions([{ kind: 'tool', label: 'x' }, { kind: 'reply', label: '' },
      { kind: 'reply', label: 'x'.repeat(41) }, ...many])?.map(a => a.label))
      .toEqual(['Q0', 'Q1', 'Q2', 'Q3']);
    expect(normalizeActions('nope')).toBeUndefined();
    expect(normalizeActions([])).toBeUndefined();
  });
});

describe('isOpenableUrl', () => {
  it.each([
    ['https://acme.com/x', 'link', true],
    ['http://acme.com/x', 'link', false],
    ['https://u:p@acme.com/', 'link', false],
    ['moneyfellows://wallet', 'link', false],
    ['moneyfellows://wallet', 'app', true],
    ['javascript:alert(1)', 'app', false],
    [' JavaScript:alert(1)', 'app', false],
    ['vbscript:x', 'app', false],
    ['data:text/html,x', 'app', false],
    ['moneyfellows://wal let', 'app', false],
    ['wallet', 'app', false],
  ] as const)('%s as %s -> %s', (url, kind, ok) => {
    expect(isOpenableUrl(url, kind)).toBe(ok);
  });
});
