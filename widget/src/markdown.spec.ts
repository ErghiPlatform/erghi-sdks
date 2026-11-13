import { renderMarkdown } from './markdown';

function render(text: string): HTMLElement {
  const t = document.createElement('div');
  renderMarkdown(document, t, text);
  return t;
}

describe('renderMarkdown', () => {
  it('renders bold in English', () => {
    const t = render('Takes **2 days** to ship');
    expect(t.querySelector('strong')?.textContent).toBe('2 days');
    expect(t.textContent).toBe('Takes 2 days to ship');
  });

  it('renders bold in Arabic with no literal markers', () => {
    const t = render('يستغرق **يومين إلى ثلاثة أيام عمل** للتوصيل');
    expect(t.querySelector('strong')?.textContent).toBe('يومين إلى ثلاثة أيام عمل');
    expect(t.textContent).not.toContain('*');
  });

  it('renders mixed Arabic/English bold, italic and code', () => {
    const t = render('الطلب **Order 42** حالته _shipped_ و `ID-7`');
    expect(t.querySelector('strong')?.textContent).toBe('Order 42');
    expect(t.querySelector('em')?.textContent).toBe('shipped');
    expect(t.querySelector('code')?.textContent).toBe('ID-7');
  });

  it('handles nested and unclosed markers without leaving ** behind', () => {
    const nested = render('**bold *and italic* text**');
    expect(nested.querySelector('strong em')?.textContent).toBe('and italic');
    expect(render('unclosed **bold here').textContent).toBe('unclosed bold here');
    expect(render('trailing ** marker').textContent).not.toContain('**');
  });

  it('keeps snake_case and spaced asterisks as text', () => {
    expect(render('use my_var_name and 5 * 3').textContent).toBe('use my_var_name and 5 * 3');
    expect(render('use my_var_name').querySelector('em')).toBeNull();
  });

  it('renders bullet and numbered lists and line breaks', () => {
    const t = render('Options:\n- one\n* two\n1. first\n2. second\nDone');
    expect(Array.from(t.querySelectorAll('ul li')).map(x => x.textContent)).toEqual(['one', 'two']);
    expect(Array.from(t.querySelectorAll('ol li')).map(x => x.textContent)).toEqual(['first', 'second']);
    expect(t.lastElementChild?.textContent).toBe('Done');
  });

  it('renders script and img payloads as inert text', () => {
    const t = render('<script>alert(1)</script> <img src=x onerror=alert(1)> **<b>x</b>**');
    expect(t.querySelector('script')).toBeNull();
    expect(t.querySelector('img')).toBeNull();
    expect(t.querySelector('b')).toBeNull();
    expect(t.textContent).toContain('<script>alert(1)</script>');
    expect(t.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('leaves plain text unchanged', () => {
    expect(render('Hello, how can I help?').textContent).toBe('Hello, how can I help?');
    expect(render('مرحباً بك').textContent).toBe('مرحباً بك');
  });
});
