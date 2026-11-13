/**
 * Minimal, safe markdown for chat replies. Builds DOM nodes only (createElement/textContent):
 * no innerHTML, no links, no images, no HTML passthrough. Supported: **bold**, *italic*,
 * _italic_, `code`, line breaks and simple "-", "*", "1." lists. Unclosed markers never
 * leave a dangling "**" on screen.
 */

const isSpace = (c: string | undefined): boolean => c === undefined || /\s/.test(c);
const isWord = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);

function el(doc: Document, tag: string, parent: Node): HTMLElement {
  const e = doc.createElement(tag);
  parent.appendChild(e);
  return e;
}

/** Finds a closing marker whose preceding char is not whitespace. */
function findClose(s: string, marker: string, from: number): number {
  let i = from;
  while ((i = s.indexOf(marker, i)) !== -1) {
    if (!isSpace(s[i - 1]) && i > from) return i;
    i += marker.length;
  }
  return -1;
}

function renderInline(doc: Document, s: string, parent: Node): void {
  let buf = '';
  const flush = (): void => {
    if (buf) parent.appendChild(doc.createTextNode(buf));
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        el(doc, 'code', parent).textContent = s.slice(i + 1, end);
        i = end + 1;
        continue;
      }
    } else if (c === '*' && s[i + 1] === '*') {
      if (!isSpace(s[i + 2]) && s[i + 2] !== '*') {
        const end = findClose(s, '**', i + 2);
        if (end !== -1) {
          flush();
          renderInline(doc, s.slice(i + 2, end), el(doc, 'strong', parent));
          i = end + 2;
          continue;
        }
      }
      // Unclosed/empty bold marker: drop it rather than show a stray "**".
      i += 2;
      continue;
    } else if (c === '*' || c === '_') {
      const okOpen = !isSpace(s[i + 1]) && s[i + 1] !== c && (c === '*' || !isWord(s[i - 1]));
      if (okOpen) {
        let end = findClose(s, c, i + 1);
        while (end !== -1 && c === '_' && isWord(s[end + 1])) end = findClose(s, c, end + 1);
        if (end !== -1) {
          flush();
          renderInline(doc, s.slice(i + 1, end), el(doc, 'em', parent));
          i = end + 1;
          continue;
        }
      }
    }
    buf += c;
    i++;
  }
  flush();
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

/** Replaces the children of `target` with the rendered markdown of `text`. */
export function renderMarkdown(doc: Document, target: HTMLElement, text: string): void {
  target.textContent = '';
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let list: HTMLElement | null = null;
  let listKind = '';
  for (const line of lines) {
    const b = BULLET.exec(line);
    const o = b ? null : ORDERED.exec(line);
    const m = b ?? o;
    if (m) {
      const kind = b ? 'ul' : 'ol';
      if (!list || listKind !== kind) {
        list = el(doc, kind, target);
        listKind = kind;
      }
      renderInline(doc, m[1], el(doc, 'li', list));
      continue;
    }
    list = null;
    const row = el(doc, 'div', target);
    if (line.trim() === '') row.className = 'md-gap';
    else renderInline(doc, line, row);
  }
}
