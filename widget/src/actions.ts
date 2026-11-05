/**
 * Buttons under an AI reply. The server validates every button against the workspace's
 * settings before it reaches the widget; this re-checks the shape anyway, because the widget
 * runs on third-party pages and must never open a script URL whatever the payload says.
 */

export type ChatActionKind = 'reply' | 'link' | 'app' | 'handoff';

export interface ChatAction {
  id: string;
  kind: ChatActionKind;
  /** Shown as plain text, never as HTML. */
  label: string;
  /** `reply`: what is sent as the visitor's message. */
  text?: string;
  /** `link`: an https URL. `app`: a deep link for the host app, e.g. `moneyfellows://wallet`. */
  url?: string;
}

export const MAX_ACTIONS = 4;
const MAX_LABEL = 40;
const KINDS: ReadonlySet<string> = new Set(['reply', 'link', 'app', 'handoff']);
const FORBIDDEN_SCHEMES: ReadonlySet<string> = new Set([
  'javascript', 'data', 'vbscript', 'file', 'blob', 'about', 'http',
]);

/** The scheme of an absolute URL, lower-cased, or '' when there is none. */
export function urlScheme(url: string): string {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(url.trim());
  return m ? m[1].toLowerCase() : '';
}

/** True for a URL a button may open: absolute, no whitespace or control characters, and not
 * a script-capable or plain-http scheme. `link` buttons additionally need https. */
export function isOpenableUrl(url: string, kind: 'link' | 'app'): boolean {
  if (!url || url.length > 2048 || /[\s\u0000-\u001f]/.test(url)) return false;
  const scheme = urlScheme(url);
  if (!scheme || FORBIDDEN_SCHEMES.has(scheme)) return false;
  if (kind === 'link') {
    if (scheme !== 'https') return false;
    try {
      const parsed = new URL(url);
      return !!parsed.hostname && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  }
  return true;
}

function str(rec: Record<string, unknown>, camel: string, pascal: string): string | undefined {
  const v = rec[camel] ?? rec[pascal];
  return typeof v === 'string' ? v : undefined;
}

/** Actions from a SignalR or REST message payload (camelCase or PascalCase), minus anything
 * malformed. Undefined when none are left. */
export function normalizeActions(raw: unknown): ChatAction[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const actions: ChatAction[] = [];
  for (const item of raw) {
    if (actions.length >= MAX_ACTIONS) break;
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const kind = str(rec, 'kind', 'Kind')?.toLowerCase();
    const label = str(rec, 'label', 'Label')?.trim();
    const id = str(rec, 'id', 'Id') || `a${actions.length + 1}`;
    if (!kind || !KINDS.has(kind) || !label || label.length > MAX_LABEL) continue;
    const action: ChatAction = { id, kind: kind as ChatActionKind, label };
    if (kind === 'reply') {
      action.text = str(rec, 'text', 'Text')?.trim() || label;
    } else if (kind === 'link' || kind === 'app') {
      const url = str(rec, 'url', 'Url')?.trim() ?? '';
      if (!isOpenableUrl(url, kind)) continue;
      action.url = url;
    }
    actions.push(action);
  }
  return actions.length > 0 ? actions : undefined;
}
