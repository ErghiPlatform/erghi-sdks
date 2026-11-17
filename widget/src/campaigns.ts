/**
 * Proactive messages ("campaigns") from GET /api/widgets/{id}/public. The server sends only the
 * campaigns that are live for this widget right now (switched on, inside their dates, inside
 * business hours when asked, on a plan that has them); the widget decides the page and the moment.
 */

export type CampaignUrlMatch = 'any' | 'contains' | 'equals' | 'starts_with';

export interface PublicCampaign {
  id: string;
  message: string;
  urlMatch: CampaignUrlMatch;
  /** Null when urlMatch is 'any'. */
  urlValue: string | null;
  delaySeconds: number;
}

/** Server-side limits (WidgetCampaign), repeated so a bad payload can't do more than the server allows. */
const MAX_CAMPAIGNS = 25;
const MAX_MESSAGE = 1000;
const MAX_URL = 500;
const MAX_DELAY_SECONDS = 3600;
const MAX_SEEN = 100;
const URL_MATCHES: readonly CampaignUrlMatch[] = ['any', 'contains', 'equals', 'starts_with'];

/** The `campaigns` field of the public config. Untrusted: anything malformed is dropped. */
export function parseCampaigns(raw: unknown): PublicCampaign[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicCampaign[] = [];
  for (const item of raw.slice(0, MAX_CAMPAIGNS)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = rec['id'] ?? rec['Id'];
    const message = rec['message'] ?? rec['Message'];
    const urlMatch = String(rec['urlMatch'] ?? rec['UrlMatch'] ?? '').toLowerCase() as CampaignUrlMatch;
    const urlValue = rec['urlValue'] ?? rec['UrlValue'];
    const delay = Number(rec['delaySeconds'] ?? rec['DelaySeconds']);
    if (typeof id !== 'string' || !id.trim()) continue;
    if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE) continue;
    if (!URL_MATCHES.includes(urlMatch)) continue;
    const value = typeof urlValue === 'string' ? urlValue.trim() : '';
    if (urlMatch !== 'any' && (!value || value.length > MAX_URL)) continue;
    if (!Number.isFinite(delay)) continue;
    out.push({
      id: id.trim(),
      message: message.trim(),
      urlMatch,
      urlValue: urlMatch === 'any' ? null : value,
      delaySeconds: Math.min(MAX_DELAY_SECONDS, Math.max(0, Math.round(delay))),
    });
  }
  return out;
}

/**
 * Whether a campaign shows on this page. Plain, case-insensitive string comparison, never a
 * pattern. A value starting with "/" is compared with the path, query and fragment (so "/pricing"
 * works on any domain the widget is embedded on); anything else with the full address.
 */
export function campaignMatchesPage(campaign: PublicCampaign, location: Pick<Location, 'href' | 'pathname' | 'search' | 'hash'>): boolean {
  if (campaign.urlMatch === 'any') return true;
  const value = (campaign.urlValue ?? '').toLowerCase();
  if (!value) return false;
  const page = (value.startsWith('/')
    ? `${location.pathname}${location.search}${location.hash}`
    : location.href).toLowerCase();
  switch (campaign.urlMatch) {
    case 'contains': return page.includes(value);
    case 'starts_with': return page.startsWith(value);
    case 'equals': return trimSlash(page) === trimSlash(value);
    default: return false;
  }
}

function trimSlash(s: string): string {
  return s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s;
}

function seenKey(widgetId: string): string {
  return `erghi:campaigns-seen:${widgetId}`;
}

/** Campaign ids this browser has already been shown for the widget (each shows once). */
export function readSeenCampaigns(widgetId: string): Set<string> {
  try {
    const raw = localStorage.getItem(seenKey(widgetId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markCampaignSeen(widgetId: string, campaignId: string): void {
  try {
    const seen = [...readSeenCampaigns(widgetId)].filter(id => id !== campaignId);
    seen.push(campaignId);
    localStorage.setItem(seenKey(widgetId), JSON.stringify(seen.slice(-MAX_SEEN)));
  } catch {
    // private mode / storage full: the campaign may show again on the next page, which is harmless
  }
}

/** The first campaign not seen yet that shows on this page. */
export function pickCampaign(
  campaigns: readonly PublicCampaign[], seen: ReadonlySet<string>,
  location: Pick<Location, 'href' | 'pathname' | 'search' | 'hash'>,
): PublicCampaign | null {
  return campaigns.find(c => !seen.has(c.id) && campaignMatchesPage(c, location)) ?? null;
}
