import { buildStyles } from './styles';

function mobileRootRule(position: 'bottom-right' | 'bottom-left'): string {
  const css = buildStyles({
    primaryColor: '#3b82f6',
    accentLight: '#3b82f6',
    accentDark: '#3b82f6',
    position,
    cornerRadius: 16,
  });
  const mobile = css.slice(css.indexOf('@media (max-width: 480px)'));
  const match = /\.root\s*{([^}]*)}/.exec(mobile);
  if (!match) throw new Error('no .root rule in the mobile block');
  return match[1];
}

describe('mobile styles', () => {
  // A full-width root sat over the page's bottom edge while the chat was closed and took its taps.
  it('keeps the closed widget in its corner on bottom-right', () => {
    const rule = mobileRootRule('bottom-right');
    expect(rule).toContain('right: 0;');
    expect(rule).not.toContain('left: 0;');
  });

  it('keeps the closed widget in its corner on bottom-left', () => {
    const rule = mobileRootRule('bottom-left');
    expect(rule).toContain('left: 0;');
    expect(rule).not.toContain('right: 0;');
  });
});
