import { buildStyles, ICON_CHAT, ICON_MIC, ICON_SEND, ICON_SPEAKER, WidgetPosition, WidgetTheme } from './styles';
import { DARK_SURFACE, LIGHT_SURFACE, normalizeHex, readableAccent } from './color';
import { ConversationRealtimeClient } from './realtime';
import { renderLinkedText, renderMarkdown } from './markdown';
import { ChatAction, isOpenableUrl, normalizeActions } from './actions';

export type { ChatAction, ChatActionKind } from './actions';
import { playMessageNotification } from './notification';
import { markCampaignSeen, parseCampaigns, pickCampaign, PublicCampaign, readSeenCampaigns } from './campaigns';
import { bundledTranslations, interpolate, isRtlLocale, WidgetDirection } from './locale';
import {
  cleanPreChatValues, parsePreChatSettings, PRECHAT_MAX_EMAIL, PRECHAT_MAX_NAME, PRECHAT_OFF, preChatPending,
  PreChatError, PreChatSettings, PreChatValues, validatePreChat,
} from './prechat';
import {
  BrowserSpeaker, canRecordInBrowser, canSpeakInBrowser, detectLanguage, fileExtension,
  MAX_VOICE_NOTE_BYTES, MAX_VOICE_NOTE_SECONDS, speakableText, VoiceRecorder,
} from './voice';

export interface ErghiConfig {
  /** Widget UUID from admin portal */
  widgetId: string;
  /** @deprecated use widgetId */
  workspace?: string;
  apiUrl?: string;
  // position, primaryColor, greeting, title and theme override the workspace settings when set;
  // left out, the widget uses what the workspace configured, then the built-in default.
  position?: WidgetPosition;
  /** Hex colour, "#abc" or "#aabbcc"; anything else is ignored. */
  primaryColor?: string;
  greeting?: string;
  title?: string;
  autoOpen?: boolean;
  /** Color theme: 'light', 'dark', or 'auto' (follows system preference) */
  theme?: WidgetTheme;
  /**
   * Layout direction: 'auto' (default — follows the detected locale, e.g. RTL for Arabic),
   * or force 'ltr' / 'rtl'.
   */
  direction?: WidgetDirection;
  /**
   * The widget's language, e.g. "ar" or "en-US" (only the language part is used). Set it to your
   * app's or site's chosen language. Without it the widget uses the page's `lang`, then the
   * browser's language. It sets the widget's own text and direction, and the assistant replies in
   * it when it can't tell the visitor's language from the message (a number, an emoji, "ok").
   */
  locale?: string;
  /** Arbitrary visitor / session context passed to the AI (customerId, claims, etc.).
   * Visible to the AI and settable by anyone, so never put tokens or secrets here; use
   * secureContextProvider / setSecureContext for those. */
  visitorContext?: Record<string, unknown>;
  /** Identity JWT signed by your backend with the workspace's widget secret (HS256, `sub`
   * and `exp` required; `exp` may be at most 24 hours ahead, and the verified identity lapses
   * at `exp`, so mint a fresh token per session). Makes `identity.*` available to integration
   * bindings and action policies. Same as calling setIdentityToken(). */
  identityToken?: string;
  /** Returns values only your integrations should see (e.g. the signed-in user's access
   * token). Called before a message is sent when the stored values are missing or about
   * to expire, and when the server reports they were rejected. Values are kept in memory
   * and on the server for at most ttlSeconds, never in localStorage. */
  secureContextProvider?: () => Promise<SecureContext | null> | SecureContext | null;
  /** Reads a reply aloud in place of the browser's speech engine, e.g. a native text-to-speech
   * plugin in a Capacitor app. `language` is the reply's language (a BCP 47 code such as "en" or
   * "ar"; the widget's own language when the browser can't tell). Resolve when speaking ends. Used only when the workspace turned voice replies on. */
  speak?: (text: string, language: string) => Promise<void> | void;
  /** Stops speech started by `speak`. */
  stopSpeaking?: () => void;
  /** Records a voice note in place of the browser's MediaRecorder, for webviews without it.
   * Resolve with the clip (WebM, Ogg, MP4/M4A or WAV, at most 60 seconds), or null if the visitor
   * cancelled. Used only when the workspace turned voice input on. */
  recordAudio?: () => Promise<Blob | null>;
  /** Called when the visitor taps a button under an AI reply, before the widget's own handling.
   * Return true (or a promise of true) to say the host app handled it, e.g. by routing an `app`
   * deep link such as `moneyfellows://wallet` inside a Capacitor app. Otherwise the widget
   * sends `reply` text and `handoff` requests as the visitor, opens `link` URLs in a new tab and
   * navigates to `app` URLs. The same tap is also dispatched as a cancelable `erghi:action`
   * window event (`event.detail` is the action); calling `preventDefault()` on it counts as
   * handled too. Buttons appear only when the workspace turned them on. */
  onAction?: (action: ChatAction) => boolean | void | Promise<boolean | void>;
}

export interface SecureContext {
  /** Up to 20 keys (letters, digits, `_`, `-`, `.`), each value up to 8192 characters. */
  values: Record<string, string>;
  /** How long the server keeps them: 60 to 86400 seconds, default 3600. Match it to the
   * token's own lifetime so a stale token is never used. */
  ttlSeconds?: number;
}

/** Refresh secure context this long before the server-side copy expires. */
const SECURE_CONTEXT_REFRESH_MARGIN_MS = 60_000;

interface MessageSource {
  url: string | null;
  title: string | null;
}

interface Message {
  id: string;
  content: string;
  sender: string;
  createdAt?: string;
  sources?: MessageSource[];
  /** "voice" when the visitor sent it as a voice note; "campaign" for a proactive message. */
  source?: string | null;
  actions?: ChatAction[];
}

export default class ErghiWidget {
  private config: Required<Omit<ErghiConfig,
    'workspace' | 'visitorContext' | 'greeting' | 'identityToken' | 'secureContextProvider'
    | 'speak' | 'stopSpeaking' | 'recordAudio' | 'locale' | 'onAction'>> & {
    workspace?: string;
    greeting?: string;
    locale?: string;
    visitorContext: Record<string, unknown>;
  };
  // Which settings the embed (constructor/data-* attributes) fixed; those win over the
  // workspace settings fetched from /public.
  private readonly explicit: Record<'primaryColor' | 'position' | 'theme' | 'title' | 'greeting', boolean>;
  // Workspace branding with no embed-attribute equivalent.
  private look = { logoUrl: '', secondaryColor: '', cornerRadius: DEFAULT_CORNER_RADIUS };
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private isOpen = false;
  private conversationId: string | null = null;
  // Per-conversation credential minted by POST /api/conversations (VisitorToken field,
  // Erghi.Conversation P1-3/P1-4 fix). Required on every subsequent anonymous call for this
  // conversation -- as the X-Visitor-Token header on REST calls, and as a ?visitorToken=
  // query param on the /hubs/visitor SignalR connection. Persisted alongside conversationId
  // so a restored session can keep using it.
  private visitorToken: string | null = null;
  private visitorId: string | null = null;
  private identityToken: string | null = null;
  private secureContextProvider: ErghiConfig['secureContextProvider'] | null = null;
  // Values set before a conversation exists; sent once it does. Never persisted.
  private pendingSecureContext: SecureContext | null = null;
  private secureContextExpiresAt = 0;
  private secureContextRefresh: Promise<void> | null = null;
  private messages: Message[] = [];
  // Proactive messages live for this widget (from /public), the timer for the next one, and the
  // one on screen. A shown campaign creates no conversation: the visitor's first message does,
  // sending its id, and the server then stores the campaign message itself.
  private campaigns: PublicCampaign[] = [];
  private campaignTimer: ReturnType<typeof setTimeout> | null = null;
  private activeCampaign: { id: string; tempId: string; content: string } | null = null;
  // The workspace's pre-chat form (name and email before the first message). The answer lives in
  // memory only, until the request that creates the conversation carries it.
  private preChat: PreChatSettings = PRECHAT_OFF;
  private preChatAnswered = false;
  private preChatValues: PreChatValues | null = null;
  // The form waits until we know there is no saved conversation to restore.
  private sessionChecked = false;
  private chatBlocked = false;
  private isTyping = false;
  /** Streaming drafts by draftId; each is replaced by the message(s) its reply posts. */
  private drafts = new Map<string, {
    el: HTMLElement; textEl: HTMLElement; text: string; idle: ReturnType<typeof setTimeout> | null;
  }>();
  private knownMessageIds = new Set<string>();
  private ratedMessageIds = new Set<string>();
  private realtime = new ConversationRealtimeClient();
  private fallbackPollTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private awaitingReply = false;
  // Bounded failure state: if no reply arrives within this window after a message is sent,
  // stop spinning the typing indicator and surface a recoverable error instead (AC-1).
  private replyTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  // Until the server starts the turn (it waits for the visitor to pause, at most a few seconds).
  private static readonly REPLY_TIMEOUT_MS = 30_000;
  // Once the server reports it is generating: its own budget for one reply.
  private static readonly GENERATION_TIMEOUT_MS = 90_000;
  /** A streaming draft with no new text for this long is dropped (its engine went away mid-reply). */
  private static readonly DRAFT_IDLE_MS = 60_000;
  /** A reply is at most 5 messages of 4000 characters; nothing longer is kept on screen. */
  private static readonly DRAFT_MAX_CHARS = 20_000;
  private static readonly MAX_DRAFTS = 3;
  private lastInactivityWarningAt = 0;
  private pendingFile: File | null = null;
  /** Sends that failed, by the id of their (still visible) bubble, so Retry can send them again. */
  private readonly failedSends = new Map<string, { content: string; file: File | null }>();
  /** System notices the server posted (queue position, connecting, connected) and when they came. */
  private serverNotices: Array<{ el: Element; at: number }> = [];
  private assignedAt = 0;
  /** A person answers this conversation (it was queued for or assigned to an agent, or the widget's
   * AI is off), so there is no AI reply to wait for: sending shows no typing dots and arms no
   * "trouble getting a response" timer. An AssistantTyping event still arms it if the AI does answer. */
  private humanHandled = false;
  /** The widget's AI setting from the public config; off means every conversation is human. */
  private aiEnabled = true;
  /** Opening hours from the public config: null when none apply (always open). */
  private openingHours: { isOpen: boolean; nextOpenAt: number | null } | null = null;
  private openingHoursTimer: ReturnType<typeof setTimeout> | null = null;
  /** The API said this widget does not exist or is inactive: nothing is rendered or started. */
  private unavailable = false;
  private translations: Record<string, string> = {};
  private locale = 'en';
  // Empty names fall back to localized defaults in senderLabel() at render time.
  private displayConfig = {
    aiAssistantName: '',
    showAiLabel: true,
    showAgentName: true,
    assignedAgentName: '',
    voiceInputEnabled: false,
    voiceOutputEnabled: false,
    // Workspace "Chat features": both default on, so an old API or a failed fetch keeps them.
    attachmentsEnabled: true,
    messageRatingEnabled: true,
  };
  // "Powered by Erghi" in the footer, on plans that don't remove branding (Free).
  private showPoweredBy = false;
  private readonly voiceHooks: Pick<ErghiConfig, 'speak' | 'stopSpeaking' | 'recordAudio'>;
  private readonly onAction: ErghiConfig['onAction'] | null;
  private recorder: VoiceRecorder | null = null;
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private recordingStartedAt = 0;
  private voiceBusy = false;
  private readonly speaker = new BrowserSpeaker();
  private speakingMessageId: string | null = null;
  // Populated from WidgetEmbedConfigDto's TermsUrl/PrivacyUrl/SupportUrl (workspace branding
  // settings, admin portal's "Contact & Legal" card) — empty string means "not configured",
  // in which case that link is simply omitted from the footer, not rendered blank.
  private footerLinks = {
    termsUrl: '',
    privacyUrl: '',
    supportUrl: '',
  };

  constructor(config: ErghiConfig) {
    const widgetId = config.widgetId || config.workspace;
    if (!widgetId) throw new Error('Erghi: widgetId is required');

    const primaryColor = normalizeHex(config.primaryColor);
    const position = isPosition(config.position) ? config.position : null;
    const theme = isTheme(config.theme) ? config.theme : null;
    this.explicit = {
      primaryColor: primaryColor !== null,
      position: position !== null,
      theme: theme !== null,
      title: !!config.title,
      greeting: !!config.greeting,
    };

    this.config = {
      widgetId,
      workspace: config.workspace,
      apiUrl: config.apiUrl || 'http://localhost:5080',
      position: position ?? 'bottom-right',
      primaryColor: primaryColor ?? '#3b82f6',
      greeting: config.greeting,
      title: config.title || 'Erghi',
      autoOpen: config.autoOpen ?? false,
      theme: theme ?? 'light',
      direction: config.direction ?? 'auto',
      locale: config.locale,
      visitorContext: { ...(config.visitorContext ?? {}) },
    };
    this.identityToken = config.identityToken || null;
    this.secureContextProvider = config.secureContextProvider ?? null;
    this.voiceHooks = { speak: config.speak, stopSpeaking: config.stopSpeaking, recordAudio: config.recordAudio };
    this.onAction = typeof config.onAction === 'function' ? config.onAction : null;

    this.bootstrap();
  }

  /** Configured greeting, falling back to the localized default. */
  private greetingText(): string {
    return this.config.greeting || this.tr('widget.greeting', 'Hi! How can we help you today?');
  }

  /** Effective layout direction, resolving 'auto' from the detected locale. */
  private resolvedDirection(): 'ltr' | 'rtl' {
    if (this.config.direction === 'ltr' || this.config.direction === 'rtl') {
      return this.config.direction;
    }
    return isRtlLocale(this.locale) ? 'rtl' : 'ltr';
  }

  private async bootstrap(): Promise<void> {
    const [found] = await Promise.all([this.loadWidgetEmbedConfig(), this.loadTranslations()]);
    if (!found) {
      this.unavailable = true;
      // The API answered that this widget does not exist or was deactivated: no launcher, since
      // a visitor could not start a chat anyway. A timeout or outage still renders with defaults.
      console.info('[Erghi] Widget not found or inactive; not showing the chat launcher.');
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.render());
    } else {
      this.render();
    }
  }

  private detectLocale(): string {
    const configured = normalizeLocale(this.config.locale);
    if (configured) return configured;
    try {
      const stored = localStorage.getItem('erghi:locale') || localStorage.getItem('ui-language');
      if (stored) return stored.slice(0, 2);
    } catch { /* ignore */ }
    return (document.documentElement.lang || navigator.language || 'en').slice(0, 2);
  }

  private tr(key: string, fallback: string): string {
    return this.translations[key] || fallback;
  }

  /** Translate with `{token}` interpolation, e.g. trf('widget.voice.recording', 'Recording… {time}', { time: '0:03' }). */
  private trf(key: string, fallback: string, params: Record<string, string | number>): string {
    return interpolate(this.tr(key, fallback), params);
  }

  private async loadTranslations(): Promise<void> {
    this.locale = this.detectLocale();
    // Bundled EN/AR/ES strings first, so the widget is localized even offline;
    // server-managed translations override them when available.
    this.translations = bundledTranslations(this.locale);
    const remote = await fetchJsonWithTimeout(
      `${this.config.apiUrl}/api/v1/i18n/translations?language=${encodeURIComponent(this.locale)}&context=widget`,
      STARTUP_FETCH_TIMEOUT_MS
    );
    if (remote && typeof remote === 'object') {
      this.translations = { ...this.translations, ...(remote as Record<string, string>) };
    }
  }

  /**
   * Workspace settings for this widget. Bounded by STARTUP_FETCH_TIMEOUT_MS because the widget
   * isn't shown until this settles: a slow API must not leave a customer's page without chat.
   * A response that arrives after the timeout is dropped (the request is aborted), so the widget
   * never restyles itself after appearing.
   * Resolves false only when the API says the widget does not exist or is inactive (404).
   */
  private async loadWidgetEmbedConfig(): Promise<boolean> {
    const result = await fetchWithTimeout(
      `${this.config.apiUrl}/api/widgets/${encodeURIComponent(this.config.widgetId)}/public`,
      STARTUP_FETCH_TIMEOUT_MS
    );
    if (!result.ok) return result.status !== 404;
    const raw = result.body;
    if (!raw || typeof raw !== 'object') return true;
    const data = raw as PublicWidgetConfig;
    const primaryColor = normalizeHex(data.primaryColor);
    if (primaryColor && !this.explicit.primaryColor) this.config.primaryColor = primaryColor;
    if (isPosition(data.widgetPosition) && !this.explicit.position) this.config.position = data.widgetPosition;
    if (isTheme(data.widgetTheme) && !this.explicit.theme) this.config.theme = data.widgetTheme;
    if (nonBlank(data.welcomeMessage) && !this.explicit.greeting) this.config.greeting = data.welcomeMessage;
    if (nonBlank(data.companyName) && !this.explicit.title) this.config.title = data.companyName;
    this.look = {
      logoUrl: safeLogoUrl(data.logoUrl, this.config.apiUrl),
      secondaryColor: normalizeHex(data.secondaryColor) ?? '',
      cornerRadius: clampCornerRadius(data.widgetCornerRadius),
    };
    this.displayConfig = {
      aiAssistantName: stringOr(data.aiAssistantName ?? data.AiAssistantName, ''),
      showAiLabel: boolOr(data.showAiLabel ?? data.ShowAiLabel, true),
      showAgentName: boolOr(data.showAgentName ?? data.ShowAgentName, true),
      assignedAgentName: this.displayConfig.assignedAgentName,
      voiceInputEnabled: boolOr(data.voiceInputEnabled ?? data.VoiceInputEnabled, false),
      voiceOutputEnabled: boolOr(data.voiceOutputEnabled ?? data.VoiceOutputEnabled, false),
      attachmentsEnabled: boolOr(data.attachmentsEnabled ?? data.AttachmentsEnabled, true),
      messageRatingEnabled: boolOr(data.messageRatingEnabled ?? data.MessageRatingEnabled, true),
    };
    this.showPoweredBy = boolOr(data.showPoweredBy ?? data.ShowPoweredBy, false);
    this.campaigns = parseCampaigns(data.campaigns ?? data.Campaigns);
    this.preChat = parsePreChatSettings(raw as Record<string, unknown>);
    this.footerLinks = {
      termsUrl: safeHttpsUrl(data.termsUrl ?? data.TermsUrl),
      privacyUrl: safeHttpsUrl(data.privacyUrl ?? data.PrivacyUrl),
      supportUrl: safeHttpsUrl(data.supportUrl ?? data.SupportUrl),
    };
    this.aiEnabled = boolOr(data.enableAI ?? data.EnableAI, true);
    this.humanHandled = !this.aiEnabled;
    this.openingHours = parseOpeningHours(data.businessHours ?? data.BusinessHours);
    return true;
  }

  private isAway(): boolean {
    return !!this.openingHours && !this.openingHours.isOpen;
  }

  /** The header line under the title; while the team is away it says so instead of promising a
   * reply in minutes. */
  private headerSubtitle(): string {
    return this.isAway()
      ? this.tr('widget.offline.team', 'Our team is offline right now.')
      : this.tr('widget.header.subtitle', 'We typically reply in minutes');
  }

  /** The line under the header while away: when the team is back (in the visitor's own time zone
   * and language), then that the AI can still help, or that a message will be answered later. */
  private awayNoticeText(): string {
    const next = this.openingHours?.nextOpenAt;
    const back = next == null ? '' : this.trf('widget.offline.back', "We're back {time}.", {
      time: formatReopening(next, this.locale),
    });
    const then = this.aiEnabled
      ? this.tr('widget.offline.aiStillHere', 'The AI assistant can still help.')
      : this.tr('widget.offline.leaveMessage', "Leave a message and we'll reply when we're back.");
    return [back, then].filter(Boolean).join(' ');
  }

  /** Shows the current opening state, and flips it back to open when the next opening comes. */
  private applyOpeningHours(): void {
    const sub = this.shadow?.getElementById('cf-header-sub');
    if (sub) sub.textContent = this.headerSubtitle();
    const notice = this.shadow?.getElementById('cf-away');
    if (notice) {
      notice.hidden = !this.isAway();
      notice.textContent = this.isAway() ? this.awayNoticeText() : '';
    }
    if (this.openingHoursTimer) clearTimeout(this.openingHoursTimer);
    this.openingHoursTimer = null;
    const next = this.openingHours?.nextOpenAt;
    if (!this.openingHours || this.openingHours.isOpen || next == null) return;
    // setTimeout overflows past ~24.8 days; check again daily until the reopening is that close.
    const delay = Math.max(0, Math.min(next - Date.now(), 24 * 60 * 60 * 1000));
    this.openingHoursTimer = setTimeout(() => {
      if (this.openingHours && next <= Date.now()) this.openingHours = { isOpen: true, nextOpenAt: null };
      this.applyOpeningHours();
    }, delay);
  }

  /** The form's markup; hidden until updatePreChat decides it is needed. Labels name every field,
   * and an optional field says so, a required one is marked aria-required. */
  private buildPreChatHtml(): string {
    const optional = ` <span class="prechat-optional">${escapeHtml(this.tr('widget.prechat.optional', '(optional)'))}</span>`;
    const label = (id: string, key: string, fallback: string, required: boolean): string =>
      `<label class="prechat-label" for="${id}">${escapeHtml(this.tr(key, fallback))}${required ? '' : optional}</label>`;
    const canSkip = !this.preChat.nameRequired && !this.preChat.emailRequired;
    return `
        <form class="prechat" id="cf-prechat" novalidate hidden aria-label="${escapeHtml(this.tr('widget.aria.prechat', 'Your contact details'))}">
          <p class="prechat-intro">${escapeHtml(this.tr('widget.prechat.intro', 'Tell us how to reach you, in case we get disconnected.'))}</p>
          ${label('cf-prechat-name', 'widget.prechat.name', 'Name', this.preChat.nameRequired)}
          <input type="text" id="cf-prechat-name" name="name" autocomplete="name" dir="auto" maxlength="${PRECHAT_MAX_NAME}"
            aria-describedby="cf-prechat-name-error"${this.preChat.nameRequired ? ' aria-required="true"' : ''} />
          <p class="prechat-error" id="cf-prechat-name-error" hidden></p>
          ${label('cf-prechat-email', 'widget.prechat.email', 'Email', this.preChat.emailRequired)}
          <input type="email" id="cf-prechat-email" name="email" autocomplete="email" inputmode="email" dir="ltr"
            maxlength="${PRECHAT_MAX_EMAIL}" placeholder="${escapeHtml(this.tr('widget.prechat.placeholder', 'you@example.com'))}"
            aria-describedby="cf-prechat-email-error"${this.preChat.emailRequired ? ' aria-required="true"' : ''} />
          <p class="prechat-error" id="cf-prechat-email-error" hidden></p>
          <div class="prechat-actions">
            <button type="submit" class="prechat-submit" id="cf-prechat-start">${escapeHtml(this.tr('widget.prechat.start', 'Start chat'))}</button>
            <button type="button" class="prechat-skip" id="cf-prechat-skip"${canSkip ? '' : ' hidden'}>${escapeHtml(this.tr('widget.prechat.skip', 'Skip'))}</button>
          </div>
        </form>`;
  }

  private isPreChatPending(): boolean {
    return !this.chatBlocked && preChatPending({
      settings: this.preChat,
      answered: this.preChatAnswered,
      hasConversation: !!this.conversationId,
      hostIdentified: !!this.identityToken,
    });
  }

  /** Shows the form in the composer's place while it is pending, and the composer otherwise. */
  private updatePreChat(): void {
    const form = this.$('cf-prechat') as HTMLFormElement | null;
    if (!form) return;
    const show = this.sessionChecked && this.isPreChatPending();
    const wasShown = !form.hidden;
    form.hidden = !show;
    this.shadow?.querySelector('.root')?.classList.toggle('prechat-open', show);
    // Keep keyboard and screen-reader focus on whatever is visible when the form comes or goes.
    if (this.isOpen && wasShown !== show) this.focusComposerOrPreChat();
  }

  private focusComposerOrPreChat(): void {
    const form = this.$('cf-prechat') as HTMLFormElement | null;
    if (form && !form.hidden) {
      const first = this.preChat.emailRequired && !this.preChat.nameRequired ? 'cf-prechat-email' : 'cf-prechat-name';
      (this.$(first) as HTMLInputElement | null)?.focus();
      return;
    }
    (this.$('cf-input') as HTMLInputElement | null)?.focus();
  }

  private submitPreChat(): void {
    const name = (this.$('cf-prechat-name') as HTMLInputElement | null)?.value ?? '';
    const email = (this.$('cf-prechat-email') as HTMLInputElement | null)?.value ?? '';
    const values = cleanPreChatValues(name, email);
    const errors = validatePreChat(values, this.preChat);
    this.showPreChatErrors(errors);
    if (errors.name || errors.email) return;
    this.answerPreChat(values.name || values.email ? values : null);
  }

  /** Records the answer (null: skipped) and gives the visitor the composer. */
  private answerPreChat(values: PreChatValues | null): void {
    this.preChatValues = values;
    this.preChatAnswered = true;
    this.showPreChatErrors({});
    this.updatePreChat();
  }

  private showPreChatErrors(errors: { name?: PreChatError; email?: PreChatError }): void {
    const text: Record<PreChatError, string> = {
      nameRequired: this.tr('widget.prechat.nameRequired', 'Please enter your name.'),
      emailRequired: this.tr('widget.prechat.emailRequired', 'Please enter your email.'),
      emailInvalid: this.tr('widget.prechat.invalid', 'Please enter a valid email address.'),
    };
    let focused = false;
    for (const field of ['name', 'email'] as const) {
      const input = this.$(`cf-prechat-${field}`) as HTMLInputElement | null;
      const message = this.$(`cf-prechat-${field}-error`);
      const error = errors[field];
      if (message) {
        message.textContent = error ? text[error] : '';
        message.hidden = !error;
      }
      if (!input) continue;
      if (error) {
        input.setAttribute('aria-invalid', 'true');
        if (!focused) {
          input.focus();
          focused = true;
        }
      } else {
        input.removeAttribute('aria-invalid');
      }
    }
  }

  /** True if footerLinks has at least one configured link — controls whether the footer
   * element is rendered at all. */
  private hasFooterLinks(): boolean {
    return !!(this.footerLinks.termsUrl || this.footerLinks.privacyUrl || this.footerLinks.supportUrl);
  }

  private buildFooterHtml(): string {
    if (!this.hasFooterLinks() && !this.showPoweredBy) return '';
    const links: string[] = [];
    if (this.footerLinks.termsUrl)
      links.push(`<a href="${escapeHtml(this.footerLinks.termsUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(this.tr('widget.footer.terms', 'Terms'))}</a>`);
    if (this.footerLinks.privacyUrl)
      links.push(`<a href="${escapeHtml(this.footerLinks.privacyUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(this.tr('widget.footer.privacy', 'Privacy'))}</a>`);
    if (this.footerLinks.supportUrl)
      links.push(`<a href="${escapeHtml(this.footerLinks.supportUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(this.tr('widget.footer.support', 'Support'))}</a>`);
    if (this.showPoweredBy)
      links.push(`<a class="powered-by" href="${POWERED_BY_URL}" target="_blank" rel="noopener">${escapeHtml(this.tr('widget.footer.poweredBy', 'Powered by'))} <strong>Erghi</strong></a>`);
    return `<div class="footer">${links.join('<span class="footer-sep">·</span>')}</div>`;
  }

  /**
   * Set or merge visitor context (customerId, email, JWT claims, custom fields).
   * Call before or after opening the widget; syncs to the server when a conversation exists.
   */
  public identify(context: Record<string, unknown>): void {
    this.setContext(context, true);
  }

  /** Replace or merge visitor context metadata. */
  public setContext(context: Record<string, unknown>, merge = true): void {
    if (merge) {
      this.config.visitorContext = { ...this.config.visitorContext, ...context };
    } else {
      this.config.visitorContext = { ...context };
    }
    if (this.conversationId) {
      void this.syncMetadata();
    }
  }

  /**
   * Authenticate a visitor using a signed JWT from the customer's backend.
   * This links the widget session to an external user ID.
   */
  public async authenticate(jwtToken: string): Promise<void> {
    // The same JWT also gives the conversation a verified identity (identity.* for
    // integrations and action policies); a bare visitorId never does.
    this.identityToken = jwtToken;
    this.updatePreChat();
    if (this.conversationId) void this.setIdentityToken(jwtToken);
    try {
      const res = await fetch(`${this.config.apiUrl}/api/conversations/identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetId: this.config.widgetId,
          jwtToken
        })
      });

      if (!res.ok) throw new Error(`Identity API error: ${res.status}`);
      const data = await res.json();
      
      this.visitorId = data.visitorId ?? data.VisitorId;
      
      // Optionally merge returned email/name into metadata
      if (data.email) this.setContext({ email: data.email }, true);
      if (data.name) this.setContext({ name: data.name }, true);
      
    } catch (err) {
      console.error('[Erghi] Authentication failed:', err);
    }
  }

  /**
   * Attach a signed identity JWT (see ErghiConfig.identityToken). Before a conversation
   * exists it is sent when the conversation is created; afterwards it is attached to the
   * current one. Re-send a fresh token whenever yours is renewed; a token for a different
   * user is refused for an existing conversation.
   */
  public async setIdentityToken(jwt: string): Promise<boolean> {
    this.identityToken = jwt;
    this.updatePreChat();
    if (!this.conversationId) return true;
    try {
      const res = await fetch(
        `${this.config.apiUrl}/api/conversations/${this.conversationId}/identity-token`,
        {
          method: 'POST',
          headers: this.visitorHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ identityToken: jwt }),
        }
      );
      if (!res.ok) {
        console.warn(`[Erghi] Identity token was not accepted (HTTP ${res.status})`);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[Erghi] Failed to send identity token:', err);
      return false;
    }
  }

  /**
   * Store values only integrations can use, e.g. `{ mf_access_token: '...' }`, referenced in
   * an integration's request bindings as `{{secret.mf_access_token}}`. The AI never sees
   * them. Call again with a fresh token whenever yours is renewed; the conversation is not
   * interrupted.
   */
  public async setSecureContext(values: Record<string, string>, options: { ttlSeconds?: number; merge?: boolean } = {}): Promise<boolean> {
    const context: SecureContext = { values, ttlSeconds: options.ttlSeconds };
    if (!this.conversationId) {
      this.pendingSecureContext = options.merge === false || !this.pendingSecureContext
        ? context
        : { values: { ...this.pendingSecureContext.values, ...values }, ttlSeconds: options.ttlSeconds };
      return true;
    }
    return this.putSecureContext(context, options.merge ?? true);
  }

  /** Remove every secure value from the server, e.g. when the user signs out of your app. */
  public async clearSecureContext(): Promise<void> {
    this.pendingSecureContext = null;
    this.secureContextExpiresAt = 0;
    if (!this.conversationId) return;
    try {
      await fetch(`${this.config.apiUrl}/api/conversations/${this.conversationId}/secure-context`, {
        method: 'DELETE',
        headers: this.visitorHeaders(),
      });
    } catch (err) {
      console.warn('[Erghi] Failed to clear secure context:', err);
    }
  }

  private async putSecureContext(context: SecureContext, merge: boolean): Promise<boolean> {
    if (!this.conversationId) return false;
    try {
      const res = await fetch(`${this.config.apiUrl}/api/conversations/${this.conversationId}/secure-context`, {
        method: 'PUT',
        headers: this.visitorHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ values: context.values, ttlSeconds: context.ttlSeconds, merge }),
      });
      if (!res.ok) {
        console.warn(`[Erghi] Secure context was not accepted (HTTP ${res.status})`);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      const expiresAt = Date.parse(String(data.expiresAt ?? data.ExpiresAt ?? ''));
      this.secureContextExpiresAt = Number.isNaN(expiresAt)
        ? Date.now() + (context.ttlSeconds ?? 3600) * 1000
        : expiresAt;
      return true;
    } catch (err) {
      console.warn('[Erghi] Failed to send secure context:', err);
      return false;
    }
  }

  /** Asks secureContextProvider for fresh values when the stored ones are missing, near
   * expiry, or (force) were rejected. Concurrent callers share one refresh. */
  private refreshSecureContext(force = false): Promise<void> {
    if (!this.secureContextProvider || !this.conversationId) return Promise.resolve();
    if (!force && this.secureContextExpiresAt - Date.now() > SECURE_CONTEXT_REFRESH_MARGIN_MS) {
      return Promise.resolve();
    }
    if (this.secureContextRefresh) return this.secureContextRefresh;
    const provider = this.secureContextProvider;
    this.secureContextRefresh = (async () => {
      try {
        const context = await provider();
        if (context && Object.keys(context.values ?? {}).length > 0) {
          await this.putSecureContext(context, true);
        }
      } catch (err) {
        console.warn('[Erghi] secureContextProvider failed:', err);
      } finally {
        this.secureContextRefresh = null;
      }
    })();
    return this.secureContextRefresh;
  }

  private handleContextRequired(): void {
    this.secureContextExpiresAt = 0;
    void this.refreshSecureContext(true);
    try {
      window.dispatchEvent(new CustomEvent('erghi:context-required', {
        detail: { conversationId: this.conversationId },
      }));
    } catch {
      // non-DOM environment
    }
  }

  public getContext(): Readonly<Record<string, unknown>> {
    return { ...this.config.visitorContext };
  }

  private render(): void {
    if (this.host) return;

    this.host = document.createElement('div');
    this.host.id = 'erghi-widget-root';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    // The accent (workspace secondary colour) decorates but never carries text on a fill; it is
    // shifted per theme until it reads on that theme's surface, and defaults to the primary.
    const accent = this.look.secondaryColor || this.config.primaryColor;
    style.textContent = buildStyles({
      primaryColor: this.config.primaryColor,
      accentLight: readableAccent(accent, LIGHT_SURFACE, '#1a1d29'),
      accentDark: readableAccent(accent, DARK_SURFACE, '#e8eaef'),
      position: this.config.position,
      cornerRadius: this.look.cornerRadius,
    });
    this.shadow.appendChild(style);

    const root = document.createElement('div');
    root.className = 'root';
    root.setAttribute('data-theme', this.config.theme);
    root.setAttribute('dir', this.resolvedDirection());
    root.setAttribute('lang', this.locale);
    root.innerHTML = `
      <div class="panel" id="cf-panel" role="dialog" aria-label="${escapeHtml(this.tr('widget.aria.dialog', 'Chat'))}">
        <div class="header">
          <div class="header-brand" id="cf-brand">
            <div class="header-text">
              <p class="header-title">${escapeHtml(this.config.title)}</p>
              <p class="header-sub" id="cf-header-sub">${escapeHtml(this.headerSubtitle())}</p>
            </div>
          </div>
          <button type="button" class="icon-btn" id="cf-close" aria-label="${escapeHtml(this.tr('widget.aria.close', 'Close chat'))}">&times;</button>
        </div>
        <p class="away-notice" id="cf-away" role="status" hidden></p>
        <div class="messages" id="cf-messages"></div>
        <div class="typing" id="cf-typing"><span></span><span></span><span></span></div>
        ${this.buildPreChatHtml()}
        <div class="file-chip-row" id="cf-chip-row" hidden>
          <span class="file-chip">
            <span class="file-chip-icon" aria-hidden="true">📎</span>
            <span class="file-chip-name" id="cf-chip-name" dir="auto"></span>
            <button type="button" class="file-chip-remove" id="cf-chip-remove" aria-label="${escapeHtml(this.tr('widget.aria.removeFile', 'Remove attached file'))}">&times;</button>
          </span>
        </div>
        <div class="composer">
          <input type="file" id="cf-file" accept="image/*,.pdf,.txt" hidden />
          <button type="button" class="attach-btn" id="cf-attach" title="${escapeHtml(this.tr('widget.attach.hint', 'One file per message'))}" aria-label="${escapeHtml(this.tr('widget.aria.attach', 'Attach file'))}">📎</button>
          <input type="text" id="cf-input" placeholder="${escapeHtml(this.tr('widget.input.placeholder', 'Type a message…'))}" autocomplete="off" maxlength="4000" />
          <button type="button" class="voice-cancel-btn" id="cf-mic-cancel" hidden aria-label="${escapeHtml(this.tr('widget.aria.micCancel', 'Cancel recording'))}">&times;</button>
          <button type="button" class="mic-btn" id="cf-mic" hidden aria-label="${escapeHtml(this.tr('widget.aria.mic', 'Record a voice message'))}">${ICON_MIC}</button>
          <button type="button" class="send-btn" id="cf-send" aria-label="${escapeHtml(this.tr('widget.aria.send', 'Send'))}">${ICON_SEND}</button>
        </div>
        ${this.buildFooterHtml()}
      </div>
      <div class="teaser" id="cf-teaser" hidden>
        <button type="button" class="teaser-text" id="cf-teaser-open" dir="auto"></button>
        <button type="button" class="teaser-close" id="cf-teaser-close" aria-label="${escapeHtml(this.tr('widget.aria.dismiss', 'Dismiss'))}">&times;</button>
      </div>
      <button type="button" class="bubble" id="cf-bubble" aria-label="${escapeHtml(this.tr('widget.aria.open', 'Open chat'))}">${ICON_CHAT}</button>
    `;
    this.shadow.appendChild(root);
    this.attachLogo();
    this.applyOpeningHours();

    document.body.appendChild(this.host);
    this.bindEvents();
    this.applyVoiceSettings();
    this.addSystemMessage(this.greetingText());
    void this.tryRestoreSession().then(restored => {
      this.sessionChecked = true;
      this.updatePreChat();
      if (!restored) this.scheduleCampaign();
    });

    if (this.config.autoOpen) this.open();
  }

  /** Mobile webviews (Capacitor, in-app browsers) and backgrounded tabs suspend the page, and
   * SignalR gives up reconnecting while it is frozen. Coming back reconnects and fetches whatever
   * arrived in the meantime. */
  private readonly onResume = (): void => {
    if (document.visibilityState === 'hidden' || !this.conversationId) return;
    if (this.realtime.isConnected()) {
      void this.fetchMissedMessages();
    } else {
      void this.connectRealtime();
    }
  };

  private bindEvents(): void {
    document.addEventListener('visibilitychange', this.onResume);
    window.addEventListener('online', this.onResume);
    window.addEventListener('pageshow', this.onResume);
    const s = this.shadow!;
    s.getElementById('cf-bubble')?.addEventListener('click', () => this.toggle());
    s.getElementById('cf-close')?.addEventListener('click', () => this.close());
    s.getElementById('cf-teaser-open')?.addEventListener('click', () => this.open());
    s.getElementById('cf-teaser-close')?.addEventListener('click', () => this.hideTeaser());
    s.getElementById('cf-send')?.addEventListener('click', () => void this.sendMessage());
    s.getElementById('cf-attach')?.addEventListener('click', () => {
      (s.getElementById('cf-file') as HTMLInputElement)?.click();
    });
    s.getElementById('cf-file')?.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      this.setPendingFile(input.files?.[0] ?? null);
    });
    s.getElementById('cf-chip-remove')?.addEventListener('click', () => {
      this.setPendingFile(null);
      (this.$('cf-input') as HTMLInputElement | null)?.focus();
    });
    s.getElementById('cf-prechat')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitPreChat();
    });
    s.getElementById('cf-prechat-skip')?.addEventListener('click', () => this.answerPreChat(null));
    s.getElementById('cf-mic')?.addEventListener('click', () => void this.onMicClick());
    s.getElementById('cf-mic-cancel')?.addEventListener('click', () => this.cancelRecording());
    s.getElementById('cf-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.sendMessage();
      }
    });
  }

  /** Holds the one file that goes with the next message and shows it as a removable chip. */
  private setPendingFile(file: File | null): void {
    this.pendingFile = file;
    const fileInput = this.$('cf-file') as HTMLInputElement | null;
    if (fileInput && !file) fileInput.value = '';
    const name = this.$('cf-chip-name');
    if (name) name.textContent = file?.name ?? '';
    const row = this.$('cf-chip-row');
    if (row) row.hidden = !file;
  }

  private $(id: string): HTMLElement | null {
    return this.shadow?.getElementById(id) ?? null;
  }

  public open(): void {
    if (this.unavailable) return;
    this.isOpen = true;
    this.$('cf-panel')?.classList.add('open');
    this.$('cf-bubble')?.classList.add('hidden');
    this.$('cf-bubble')?.classList.remove('has-unread');
    this.hideTeaser();
    void this.ensureConversation();
    this.focusComposerOrPreChat();
    this.scrollMessages(true);
  }

  private async ensureConversation(): Promise<void> {
    if (this.conversationId) {
      await this.connectRealtime();
      this.startHeartbeat();
      return;
    }
    // Opening the launcher only restores a saved session. A visitor who has said nothing creates
    // nothing: their first message starts the conversation (sendMessage), so browsing leaves no
    // empty conversation in the inbox.
    await this.tryRestoreSession();
  }

  /** Arms the next campaign for this page: only for a visitor with no conversation, once per
   * campaign per browser. */
  private scheduleCampaign(): void {
    if (this.conversationId || this.campaignTimer || this.activeCampaign || !this.host) return;
    let next: PublicCampaign | null = null;
    try {
      next = pickCampaign(this.campaigns, readSeenCampaigns(this.config.widgetId), window.location);
    } catch {
      return;
    }
    if (!next) return;
    const campaign = next;
    this.campaignTimer = setTimeout(() => {
      this.campaignTimer = null;
      this.showCampaign(campaign);
    }, campaign.delaySeconds * 1000);
  }

  private showCampaign(campaign: PublicCampaign): void {
    // The visitor started chatting in the meantime, or the widget was removed.
    if (this.conversationId || !this.host) return;
    markCampaignSeen(this.config.widgetId, campaign.id);
    const tempId = `campaign-${campaign.id}`;
    this.activeCampaign = { id: campaign.id, tempId, content: campaign.message };
    this.appendMessageEl({ id: tempId, content: campaign.message, sender: 'bot', source: 'campaign' });
    if (this.isOpen) return;
    const teaser = this.$('cf-teaser');
    const text = this.$('cf-teaser-open');
    if (teaser && text) {
      text.textContent = campaign.message;
      teaser.hidden = false;
    }
    this.$('cf-bubble')?.classList.add('has-unread');
  }

  private hideTeaser(): void {
    const teaser = this.$('cf-teaser');
    if (teaser) teaser.hidden = true;
  }

  private clearCampaignTimer(): void {
    if (this.campaignTimer) clearTimeout(this.campaignTimer);
    this.campaignTimer = null;
  }

  public close(): void {
    this.isOpen = false;
    this.$('cf-panel')?.classList.remove('open');
    this.$('cf-bubble')?.classList.remove('hidden');
    this.stopHeartbeat();
    this.stopFallbackPoll();
    // Keep SignalR connected so new replies still arrive (and play notification) while minimized.
  }

  public toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /**
   * Logo beside the company name. Built through the DOM (never innerHTML) and removed if it fails
   * to load, which includes the host page's CSP blocking the image, so the header falls back to the
   * name alone. Decorative: the name next to it already says whose chat this is.
   */
  private attachLogo(): void {
    const brand = this.$('cf-brand');
    if (!brand || !this.look.logoUrl) return;
    const img = document.createElement('img');
    img.className = 'header-logo';
    img.alt = '';
    img.width = 32;
    img.height = 32;
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.draggable = false;
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = this.look.logoUrl;
    brand.insertBefore(img, brand.firstChild);
  }

  /**
   * Removes the widget from the page. Pass `{ clearSession: true }` when the user signs out:
   * it also forgets the stored conversation on this device and clears the secure context on
   * the server, so the next user to sign in on a shared device cannot reopen it. The returned
   * promise settles once the secure context is cleared; the widget is gone before that.
   */
  public async destroy(options: { clearSession?: boolean } = {}): Promise<void> {
    document.removeEventListener('visibilitychange', this.onResume);
    window.removeEventListener('online', this.onResume);
    window.removeEventListener('pageshow', this.onResume);
    this.stopHeartbeat();
    this.stopFallbackPoll();
    this.clearReplyTimeout();
    this.clearDrafts();
    this.clearCampaignTimer();
    if (this.openingHoursTimer) clearTimeout(this.openingHoursTimer);
    this.openingHoursTimer = null;
    this.cancelRecording();
    this.stopSpeaking();
    void this.realtime.disconnect();
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    if (!options.clearSession) return;
    this.clearSession();
    await this.clearSecureContext();
    this.conversationId = null;
    this.visitorToken = null;
  }

  private buildMetadata(): Record<string, unknown> {
    return { ...this.pageContext(), ...this.config.visitorContext, locale: this.locale };
  }

  /** pageUrl and referrer as origin + path only: query strings and fragments can carry tokens,
   * so they are never sent. Capped in length; explicit visitorContext values win. */
  private pageContext(): Record<string, string> {
    const out: Record<string, string> = {};
    const strip = (raw: string): string => {
      try {
        const u = new URL(raw);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        return (u.origin + u.pathname).slice(0, 500);
      } catch {
        return '';
      }
    };
    try {
      const page = strip(window.location.href);
      if (page) out.pageUrl = page;
      const ref = strip(document.referrer);
      if (ref) out.referrer = ref;
    } catch {
      /* no DOM access */
    }
    return out;
  }

  /** Merges the current visitor token (if any) into a headers object as X-Visitor-Token.
   * Every REST call scoped to this.conversationId must go through this — the server now
   * rejects anonymous conversation access without it (Erghi.Conversation P1-3/P1-4 fix). */
  private visitorHeaders(base: Record<string, string> = {}): Record<string, string> {
    return this.visitorToken ? { ...base, 'X-Visitor-Token': this.visitorToken } : base;
  }

  private async syncMetadata(): Promise<void> {
    if (!this.conversationId) return;
    const metadata = this.buildMetadata();
    if (Object.keys(metadata).length === 0) return;

    try {
      await fetch(`${this.config.apiUrl}/api/conversations/${this.conversationId}/metadata`, {
        method: 'PATCH',
        headers: this.visitorHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ metadata, merge: true }),
      });
    } catch (err) {
      console.warn('[Erghi] Failed to sync visitor context:', err);
    }
  }

  private postConversation(identityToken: string | null): Promise<Response> {
    return fetch(`${this.config.apiUrl}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetId: this.config.widgetId,
        visitorId: this.visitorId,
        identityToken: identityToken ?? undefined,
        metadata: this.buildMetadata(),
        // Only an id the widget received from /public; the server re-checks it is live.
        campaignId: this.activeCampaign?.id ?? undefined,
        // Never alongside an identity token: the host app's identity is the one that counts (the
        // server ignores the form for an identified visitor too).
        preChat: identityToken ? undefined : this.preChatValues ?? undefined,
      }),
    });
  }

  private async startConversation(): Promise<void> {
    if (this.isPreChatPending()) {
      // The visitor's text stays in the input; they send it once they answer or skip the form.
      this.updatePreChat();
      this.focusComposerOrPreChat();
      return;
    }
    try {
      let res = await this.postConversation(this.identityToken);
      if (res.status === 401 && this.identityToken) {
        // The identity JWT expired (or is invalid) before the visitor opened the chat. Start
        // the conversation without it rather than blocking chat; the host app can attach a
        // fresh token later with setIdentityToken, which applies to this conversation.
        console.warn('[Erghi] Identity token was rejected; starting the conversation without it');
        this.identityToken = null;
        window.dispatchEvent(new CustomEvent('erghi:identity-expired'));
        if (this.isPreChatPending()) {
          // Without a verified identity the visitor is anonymous after all: ask them first.
          this.updatePreChat();
          return;
        }
        res = await this.postConversation(null);
      }
      if (res.status === 400 && this.preChatValues && !this.identityToken && await refusesPreChatEmail(res)) {
        // The server refused the email typed in the form (it checks the same rule); ask again.
        this.preChatAnswered = false;
        this.updatePreChat();
        this.showPreChatErrors({ email: 'emailInvalid' });
        return;
      }
      if (!res.ok) {
        const code = res.status === 403 ? await readErrorCode(res) : null;
        if (res.status === 403) {
          this.blockChat(code === 'widget_inactive'
            ? this.tr('widget.error.unavailable', 'Chat is unavailable right now. Please try again later.')
            : this.tr('widget.error.originNotAllowed', "Chat isn't available on this website."));
          return;
        }
        if (res.status === 404) {
          this.blockChat(this.tr('widget.error.unavailable', 'Chat is unavailable right now. Please try again later.'));
          return;
        }
        if (res.status === 429) {
          this.addSystemMessage(this.tr('widget.error.rateLimited', "You're sending messages too fast. Please wait a moment and try again."));
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      this.conversationId = data.id ?? data.Id;
      this.visitorToken = data.visitorToken ?? data.VisitorToken ?? null;
      this.preChatValues = null;
      this.updatePreChat();
      this.clearCampaignTimer();
      this.hideTeaser();
      this.saveSession();
      if (this.pendingSecureContext) {
        const pending = this.pendingSecureContext;
        this.pendingSecureContext = null;
        await this.putSecureContext(pending, true);
      }
      void this.loadPublicBranding(data.workspaceId ?? data.WorkspaceId);
      void this.connectRealtime();
      this.startHeartbeat();
    } catch (err) {
      console.error('[Erghi] Failed to start conversation:', err);
      this.addSystemMessage(this.tr('widget.error.connect', 'Unable to connect. Please try again.'));
    }
  }

  /** The chat cannot work here (deactivated widget, refused origin): say so and stop accepting input. */
  private blockChat(message: string): void {
    this.chatBlocked = true;
    this.updatePreChat();
    this.addSystemMessage(message);
    const input = this.$('cf-input') as HTMLInputElement | null;
    if (input) input.disabled = true;
    const send = this.$('cf-send') as HTMLButtonElement | null;
    if (send) send.disabled = true;
  }

  /** Sends what is in the input (and any picked file), or `text` alone when given (a tapped
   * reply button), leaving the input and the picked file untouched. */
  private async sendMessage(text?: string, retryFile: File | null = null): Promise<void> {
    const input = this.$('cf-input') as HTMLInputElement | null;
    const fromInput = text === undefined;
    const file = fromInput ? this.pendingFile : retryFile;
    const typed = fromInput ? input?.value.trim() ?? '' : text.trim();
    const content = typed || (file ? `[${file.name}]` : '');
    if (!content && !file) return;
    if (content.length > MAX_MESSAGE_LENGTH) {
      this.addSystemMessage(this.tr('widget.error.tooLong', 'That message is too long. Please shorten it and try again.'));
      return;
    }

    if (!this.conversationId) {
      await this.startConversation();
      if (!this.conversationId) return;
    }
    // Fresh host-app session values before the AI may call an integration with them.
    await this.refreshSecureContext();

    const tempId = `temp-${Date.now()}`;
    this.appendMessageEl({ id: tempId, content: content || `📎 ${file!.name}`, sender: 'visitor' });
    if (input && fromInput) input.value = '';
    // The file is on its way (or will be reported failed); either way the chip's job is done.
    if (fromInput && file) this.setPendingFile(null);
    if (!this.humanHandled) this.setTyping(true);

    try {
      let attachments: Array<{ id: string; filename: string; contentType: string; size: number; url: string }> | undefined;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        const up = await fetch(
          `${this.config.apiUrl}/api/conversations/${this.conversationId}/attachments`,
          { method: 'POST', headers: this.visitorHeaders(), body: fd }
        );
        if (!up.ok) throw new UploadError(up.status, await readErrorReason(up));
        const uploaded = await up.json();
        attachments = [{
          id: uploaded.id ?? uploaded.Id,
          filename: uploaded.filename ?? uploaded.Filename,
          contentType: uploaded.contentType ?? uploaded.ContentType,
          size: uploaded.size ?? uploaded.Size,
          url: uploaded.url ?? uploaded.Url,
        }];
      }

      const res = await fetch(
        `${this.config.apiUrl}/api/conversations/${this.conversationId}/messages`,
        {
          method: 'POST',
          headers: this.visitorHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ content, type: 'text', attachments }),
        }
      );
      if (!res.ok) throw new SendError(res.status, res.status === 400 || res.status === 403 ? await readErrorCode(res) : null);
      const saved = await res.json();
      const serverId = saved.id ?? saved.Id;
      this.replaceTempId(tempId, serverId);
      this.knownMessageIds.add(serverId);
      this.afterVisitorSend();
    } catch (err) {
      console.error('[Erghi] Send failed:', err);
      this.setTyping(false);
      // The server refusing the file itself (bad request, too large, wrong type) will not change on
      // a second try, so the file is dropped and Retry sends just the typed text. Anything else
      // (a dropped connection, 5xx, 408/429, an expired visitor token) keeps it for Retry.
      const rejected = err instanceof UploadError && FILE_REJECTED_STATUSES.has(err.status);
      const keepFile = rejected ? null : file;
      // The server's reason is English; isolate it so it does not scramble a right-to-left sentence.
      const sendErr = err instanceof SendError ? err : null;
      const rateLimited = (err instanceof UploadError || sendErr) && (err as UploadError | SendError).status === 429;
      const tooLong = sendErr?.status === 400 && sendErr.code === 'message_too_long';
      const inactive = sendErr?.status === 403 && sendErr.code === 'widget_inactive';
      if (inactive) {
        this.markSendFailed(tempId, typed, null, '');
        this.blockChat(this.tr('widget.error.unavailable', 'Chat is unavailable right now. Please try again later.'));
        return;
      }
      const message = rateLimited
        ? this.tr('widget.error.rateLimited', "You're sending messages too fast. Please wait a moment and try again.")
        : tooLong
        ? this.tr('widget.error.tooLong', 'That message is too long. Please shorten it and try again.')
        : rejected
        ? [this.tr('widget.error.attachment', "The file couldn't be attached."), err.reason ? `\u2068${err.reason}\u2069` : '']
            .filter(Boolean).join(' ')
        : this.tr('widget.error.send', 'Message failed to send.');
      this.markSendFailed(tempId, typed, keepFile, message);
    }
  }

  /** Shows the mic when the workspace turned voice input on and this device can record, and
   * marks the root so the read-aloud buttons show only when voice replies are on. */
  private applyVoiceSettings(): void {
    const mic = this.$('cf-mic');
    if (mic) mic.hidden = !this.voiceInputAvailable();
    if (!this.voiceInputAvailable()) this.cancelRecording();
    this.shadow?.querySelector('.root')?.classList.toggle('voice-out', this.voiceOutputAvailable());
    if (!this.voiceOutputAvailable()) this.stopSpeaking();
    this.applyChatFeatures();
  }

  /** Hides the attach button and the reply ratings when the workspace turned them off. Done with
   * root classes so ratings already on screen follow too. The API refuses both as well. */
  private applyChatFeatures(): void {
    const root = this.shadow?.querySelector('.root');
    root?.classList.toggle('no-attach', !this.displayConfig.attachmentsEnabled);
    root?.classList.toggle('no-rating', !this.displayConfig.messageRatingEnabled);
  }

  private voiceInputAvailable(): boolean {
    return this.displayConfig.voiceInputEnabled && (!!this.voiceHooks.recordAudio || canRecordInBrowser());
  }

  private voiceOutputAvailable(): boolean {
    return this.displayConfig.voiceOutputEnabled && (!!this.voiceHooks.speak || canSpeakInBrowser());
  }

  /** First tap starts recording, second tap stops and sends. */
  private async onMicClick(): Promise<void> {
    if (this.recorder) {
      await this.finishRecording();
      return;
    }
    if (this.voiceBusy) return;
    this.stopSpeaking();

    if (this.voiceHooks.recordAudio) {
      this.voiceBusy = true;
      let clip: Blob | null = null;
      try {
        clip = await this.voiceHooks.recordAudio();
      } catch (err) {
        console.warn('[Erghi] recordAudio failed:', err);
        this.addSystemMessage(this.voiceErrorText(null));
      } finally {
        this.voiceBusy = false;
      }
      if (clip) await this.sendVoiceNote(clip);
      return;
    }

    const recorder = new VoiceRecorder();
    this.voiceBusy = true;
    const error = await recorder.start();
    this.voiceBusy = false;
    if (error) {
      this.addSystemMessage(error === 'denied'
        ? this.tr('widget.voice.permission', 'Microphone access is blocked. Allow it in your browser or device settings to send voice messages.')
        : this.voiceErrorText(null));
      return;
    }
    this.recorder = recorder;
    this.recordingStartedAt = Date.now();
    this.setRecordingUi(true);
    this.recordingTimer = setInterval(() => {
      const elapsed = (Date.now() - this.recordingStartedAt) / 1000;
      if (elapsed >= MAX_VOICE_NOTE_SECONDS) {
        void this.finishRecording();
        return;
      }
      this.updateRecordingLabel(elapsed);
    }, 250);
  }

  private async finishRecording(): Promise<void> {
    const recorder = this.recorder;
    if (!recorder) return;
    this.recorder = null;
    this.stopRecordingTimer();
    this.setRecordingUi(false);
    const clip = await recorder.stop();
    if (clip) await this.sendVoiceNote(clip);
  }

  private cancelRecording(): void {
    const recorder = this.recorder;
    if (!recorder) return;
    this.recorder = null;
    this.stopRecordingTimer();
    this.setRecordingUi(false);
    recorder.cancel();
  }

  private stopRecordingTimer(): void {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  private setRecordingUi(recording: boolean): void {
    const input = this.$('cf-input') as HTMLInputElement | null;
    const mic = this.$('cf-mic');
    const cancel = this.$('cf-mic-cancel');
    const send = this.$('cf-send') as HTMLButtonElement | null;
    const attach = this.$('cf-attach');
    mic?.classList.toggle('recording', recording);
    mic?.setAttribute('aria-label', recording
      ? this.tr('widget.aria.micStop', 'Stop and send voice message')
      : this.tr('widget.aria.mic', 'Record a voice message'));
    if (cancel) cancel.hidden = !recording;
    if (attach) attach.hidden = recording;
    if (send) send.disabled = recording;
    if (input) {
      input.disabled = recording;
      input.placeholder = recording
        ? this.trf('widget.voice.recording', 'Recording… {time}', { time: formatClock(0) })
        : this.tr('widget.input.placeholder', 'Type a message…');
    }
  }

  private updateRecordingLabel(elapsedSeconds: number): void {
    const input = this.$('cf-input') as HTMLInputElement | null;
    if (input) input.placeholder = this.trf('widget.voice.recording', 'Recording… {time}', { time: formatClock(elapsedSeconds) });
  }

  /** Uploads a clip; the server transcribes it and posts the text as the visitor's message. */
  private async sendVoiceNote(clip: Blob): Promise<void> {
    if (clip.size === 0) return;
    if (clip.size > MAX_VOICE_NOTE_BYTES) {
      this.addSystemMessage(this.voiceErrorText('voice_too_large'));
      return;
    }
    this.voiceBusy = true;
    try {
      if (!this.conversationId) {
        await this.startConversation();
        if (!this.conversationId) return;
      }
      await this.refreshSecureContext();

      const tempId = `temp-voice-${Date.now()}`;
      this.appendMessageEl({
        id: tempId,
        content: this.tr('widget.voice.transcribing', 'Transcribing…'),
        sender: 'visitor',
        source: 'voice',
      });
      this.shadow?.querySelector(`[data-id="${tempId}"]`)?.classList.add('pending');
      if (!this.humanHandled) this.setTyping(true);

      const form = new FormData();
      form.append('file', clip, `voice-note.${fileExtension(clip.type)}`);
      let res: Response | null = null;
      try {
        res = await fetch(`${this.config.apiUrl}/api/conversations/${this.conversationId}/voice`, {
          method: 'POST',
          headers: this.visitorHeaders(),
          body: form,
        });
      } catch (err) {
        console.warn('[Erghi] Voice note upload failed:', err);
      }

      if (res?.ok) {
        const saved = await res.json();
        const serverId = String(saved.id ?? saved.Id);
        this.replaceTempId(tempId, serverId);
        this.setMessageText(serverId, String(saved.content ?? saved.Content ?? ''));
        this.afterVisitorSend();
        return;
      }

      this.removeMessage(tempId);
      this.setTyping(false);
      const code = res ? await readErrorCode(res) : null;
      if (code === 'voice_disabled') {
        this.displayConfig.voiceInputEnabled = false;
        this.applyVoiceSettings();
      }
      this.addSystemMessage(this.voiceErrorText(code));
    } finally {
      this.voiceBusy = false;
    }
  }

  private voiceErrorText(code: string | null): string {
    switch (code) {
      case 'voice_no_speech':
        return this.tr('widget.voice.noSpeech', "We couldn't hear anything. Please try again.");
      case 'voice_too_large':
        return this.tr('widget.voice.tooLong', 'That voice message is too long. Please keep it under a minute.');
      case 'voice_limit_reached':
      case 'voice_disabled':
        return this.tr('widget.voice.unavailable', "Voice messages aren't available right now. Please type your message.");
      default:
        return this.tr('widget.voice.failed', "Your voice message couldn't be sent. Please try again or type it.");
    }
  }

  private fillMessageText(target: HTMLElement, content: string, kind: 'markdown' | 'linked' | 'plain'): void {
    if (kind === 'markdown') renderMarkdown(document, target, content);
    else if (kind === 'linked') renderLinkedText(document, target, content);
    else target.textContent = content;
  }

  private setMessageText(id: string, content: string): void {
    const msg = this.messages.find(m => m.id === id);
    if (msg) msg.content = content;
    const el = this.shadow?.querySelector(`[data-id="${id}"]`);
    el?.classList.remove('pending');
    const text = el?.querySelector('.msg-text');
    if (!text) return;
    const kind = el?.classList.contains('bot') || el?.classList.contains('agent') ? 'markdown'
      : el?.classList.contains('system') ? 'linked' : 'plain';
    this.fillMessageText(text as HTMLElement, content, kind);
  }

  private removeMessage(id: string): void {
    this.messages = this.messages.filter(m => m.id !== id);
    this.knownMessageIds.delete(id);
    this.shadow?.querySelector(`[data-id="${id}"]`)?.remove();
  }

  private buildSpeakButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'msg-speak';
    button.innerHTML = ICON_SPEAKER;
    button.setAttribute('aria-label', this.tr('widget.aria.listen', 'Listen'));
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const id = button.closest('.msg')?.getAttribute('data-id');
      if (id) void this.toggleSpeak(id);
    });
    return button;
  }

  private async toggleSpeak(messageId: string): Promise<void> {
    if (this.speakingMessageId === messageId) {
      this.stopSpeaking();
      return;
    }
    this.stopSpeaking();
    const msg = this.messages.find(m => m.id === messageId);
    const text = msg ? speakableText(msg.content) : '';
    if (!text || !this.voiceOutputAvailable()) return;

    this.speakingMessageId = messageId;
    this.setSpeakingUi(messageId, true);
    const done = () => {
      if (this.speakingMessageId !== messageId) return;
      this.speakingMessageId = null;
      this.setSpeakingUi(messageId, false);
    };
    const language = await detectLanguage(text, this.locale);
    if (this.speakingMessageId !== messageId) return; // stopped while detecting
    const speak = this.voiceHooks.speak;
    if (speak) {
      Promise.resolve()
        .then(() => speak(text, language))
        .then(done, (err: unknown) => {
          console.warn('[Erghi] speak failed:', err);
          done();
        });
    } else {
      this.speaker.speak(text, language, done);
    }
  }

  private stopSpeaking(): void {
    const id = this.speakingMessageId;
    if (!id) return;
    this.speakingMessageId = null;
    this.setSpeakingUi(id, false);
    if (this.voiceHooks.speak) {
      this.voiceHooks.stopSpeaking?.();
    } else {
      this.speaker.stop();
    }
  }

  private setSpeakingUi(messageId: string, speaking: boolean): void {
    const button = this.shadow?.querySelector(`[data-id="${messageId}"] .msg-speak`);
    if (!button) return;
    button.classList.toggle('speaking', speaking);
    button.setAttribute('aria-pressed', String(speaking));
    button.setAttribute('aria-label', speaking
      ? this.tr('widget.aria.stopListening', 'Stop reading')
      : this.tr('widget.aria.listen', 'Listen'));
  }

  private replaceTempId(tempId: string, serverId: string): void {
    this.knownMessageIds.delete(tempId);
    this.knownMessageIds.add(serverId);
    const el = this.shadow?.querySelector(`[data-id="${tempId}"]`);
    if (el) el.setAttribute('data-id', serverId);
    const msg = this.messages.find(m => m.id === tempId);
    if (msg) msg.id = serverId;
  }

  private extractMessages(payload: unknown): Message[] {
    if (Array.isArray(payload)) return payload as Message[];
    const obj = payload as Record<string, unknown>;
    const list = obj?.data ?? obj?.Data ?? obj?.items ?? obj?.Items;
    return Array.isArray(list) ? (list as Message[]) : [];
  }

  /** After a visitor message is saved: wait for the AI's reply, unless a person handles the chat.
   * People take longer than any timer, so a "trouble getting a response" notice would be false. */
  private afterVisitorSend(): void {
    if (this.humanHandled) {
      this.setTyping(false);
      return;
    }
    this.awaitReply();
  }

  /** The conversation went to a person (queued or assigned): stop waiting for an AI reply. */
  private markHumanHandled(): void {
    this.humanHandled = true;
    this.awaitingReply = false;
    this.clearReplyTimeout();
    this.setTyping(false);
  }

  private awaitReply(timeoutMs: number = ErghiWidget.REPLY_TIMEOUT_MS): void {
    this.awaitingReply = true;
    this.setTyping(true);
    this.clearReplyTimeout();
    this.replyTimeoutTimer = setTimeout(() => this.handleReplyTimeout(), timeoutMs);
  }

  /** The server answers a burst of visitor messages as one turn. The indicator stays on from the
   * first message until that turn's reply (or a notice) arrives; a generation that ends without a
   * reply was superseded or will be retried, so it only shortens the timer back. */
  private handleAssistantTyping(isTyping: boolean): void {
    if (isTyping) {
      this.awaitReply(ErghiWidget.GENERATION_TIMEOUT_MS);
    } else if (this.awaitingReply) {
      this.awaitReply();
    } else {
      this.setTyping(false);
    }
  }

  /** Cancels the pending no-reply timer, if any. Called from every path that legitimately
   * ends the "waiting for a reply" state (a real reply, an agent assignment, session end,
   * or a fresh awaitReply() call) so a slow-but-successful reply never triggers the error. */
  private clearReplyTimeout(): void {
    if (this.replyTimeoutTimer) {
      clearTimeout(this.replyTimeoutTimer);
      this.replyTimeoutTimer = null;
    }
  }

  /** Fires when no reply (bot, agent, or system) arrives within REPLY_TIMEOUT_MS of sending a
   * message. Clears the typing indicator, renders a recoverable error, and leaves the widget
   * able to accept a new message normally afterward (AC-1). */
  private handleReplyTimeout(): void {
    this.replyTimeoutTimer = null;
    if (!this.awaitingReply) return; // reply already arrived in this tick — no-op
    this.awaitingReply = false;
    this.setTyping(false);
    this.addSystemMessage(this.tr('widget.error.replyTimeout', "We're having trouble getting a response. Please try again."));
  }

  private async loadPublicBranding(workspaceId: string | undefined): Promise<void> {
    if (!workspaceId) return;
    try {
      const res = await fetch(`${this.config.apiUrl}/api/v1/branding/public/${workspaceId}`);
      if (!res.ok) return;
      const data = await res.json();
      this.displayConfig = {
        aiAssistantName: stringOr(data.aiAssistantName ?? data.AiAssistantName, ''),
        showAiLabel: boolOr(data.showAiLabel ?? data.ShowAiLabel, true),
        showAgentName: boolOr(data.showAgentName ?? data.ShowAgentName, true),
        assignedAgentName: this.displayConfig.assignedAgentName,
        voiceInputEnabled: boolOr(data.voiceInputEnabled ?? data.VoiceInputEnabled, this.displayConfig.voiceInputEnabled),
        voiceOutputEnabled: boolOr(data.voiceOutputEnabled ?? data.VoiceOutputEnabled, this.displayConfig.voiceOutputEnabled),
        attachmentsEnabled: boolOr(data.attachmentsEnabled ?? data.AttachmentsEnabled, this.displayConfig.attachmentsEnabled),
        messageRatingEnabled: boolOr(data.messageRatingEnabled ?? data.MessageRatingEnabled, this.displayConfig.messageRatingEnabled),
      };
      this.applyVoiceSettings();
    } catch {
      // optional
    }
  }

  private async connectRealtime(): Promise<void> {
    if (!this.conversationId) return;
    this.clearDrafts();

    try {
      await this.realtime.connect(this.config.apiUrl, this.conversationId, this.visitorToken, {
        onMessage: (msg) => this.handleInboundMessage(msg),
        onClosed: () => this.handleSessionEnded(),
        onContextRequired: () => this.handleContextRequired(),
        onAssistantTyping: (isTyping) => this.handleAssistantTyping(isTyping),
        onDraft: ({ draftId, delta }) => this.handleDraft(draftId, delta),
        onDraftEnd: ({ draftId, messageIds }) => this.handleDraftEnd(draftId, messageIds),
        // The server posts the queue and agent-connected notices as system messages in the
        // visitor's language (handled by onMessage); assignment only updates widget state.
        onAssigned: (payload) => {
          this.displayConfig.assignedAgentName = payload.agentName;
          this.assignedAt = Date.now();
          this.clearDrafts();
          this.pruneWaitingNotices();
          this.markHumanHandled();
        },
        // The server posts its own queue notice as a message; this only stops the reply timer.
        onEscalated: () => this.markHumanHandled(),
        onStateChange: (connected) => {
          if (connected) {
            this.stopFallbackPoll();
            void this.fetchMissedMessages();
          } else {
            this.startFallbackPoll();
          }
        },
        onInactivityWarning: (payload) => {
          const mins = Math.max(1, Math.ceil(payload.secondsUntilClose / 60));
          this.addSystemMessage(this.trf(
            'widget.inactivity.warning',
            'This chat will close in about {minutes} min due to inactivity. Send a message to stay connected.',
            { minutes: mins }
          ));
        },
      });
    } catch (err) {
      console.warn('[Erghi] SignalR connect failed, using HTTP fallback:', err);
      this.startFallbackPoll();
    }
  }

  private handleInboundMessage(msg: {
    id: string; content: string; sender: string; sources?: MessageSource[]; actions?: ChatAction[];
    source?: string | null;
  }): void {
    const sender = msg.sender.toLowerCase();
    // The server's copy of the campaign message already on screen: adopt its id, don't repeat it.
    const campaign = this.activeCampaign;
    if (campaign && sender === 'bot' && !this.knownMessageIds.has(msg.id)
        && (msg.source === 'campaign' || msg.content.trim() === campaign.content)) {
      this.activeCampaign = null;
      this.replaceTempId(campaign.tempId, msg.id);
      return;
    }
    if (sender === 'system') {
      if (this.knownMessageIds.has(msg.id)) return;
      this.knownMessageIds.add(msg.id);
      this.clearDrafts();
      this.appendMessageEl({ id: msg.id, content: msg.content, sender: 'system' });
      const noticeEl = this.$('cf-messages')?.lastElementChild;
      if (noticeEl) this.serverNotices.push({ el: noticeEl, at: Date.now() });
      // A notice right after an assignment is the "connected" one: the waiting ones go.
      if (Date.now() - this.assignedAt < 5000) this.pruneWaitingNotices();
      this.awaitingReply = false;
      this.clearReplyTimeout();
      this.setTyping(false);
      return;
    }
    if (sender === 'visitor' || sender === 'user') {
      this.knownMessageIds.add(msg.id);
      return;
    }
    if (this.knownMessageIds.has(msg.id)) return;
    this.knownMessageIds.add(msg.id);
    // The finished reply takes the draft's place (MessageDraftEnd follows and forgets it).
    this.clearDrafts();
    this.appendMessageEl({
      id: msg.id, content: msg.content, sender: msg.sender, sources: msg.sources, actions: msg.actions,
    });
    this.awaitingReply = false;
    this.clearReplyTimeout();
    this.setTyping(false);
    if (!this.isOpen) {
      this.$('cf-bubble')?.classList.add('has-unread');
    }
    playMessageNotification();
  }

  /** Adds replies the visitor has not seen yet, e.g. ones sent while the connection was down. */
  private async fetchMissedMessages(): Promise<void> {
    if (!this.conversationId) return;
    try {
      const res = await fetch(
        `${this.config.apiUrl}/api/conversations/${this.conversationId}/messages`,
        { headers: this.visitorHeaders() }
      );
      if (!res.ok) return;
      const list = this.extractMessages(await res.json());
      list.forEach(m => {
        const id = (m as Message & { Id?: string }).id ?? (m as Message & { Id?: string }).Id ?? '';
        const sender = m.sender ?? (m as Message & { Sender?: string }).Sender ?? '';
        const content = m.content ?? (m as Message & { Content?: string }).Content ?? '';
        if (id && !this.knownMessageIds.has(id) && sender !== 'visitor' && sender !== 'user') {
          const actions = normalizeActions(m.actions ?? (m as Message & { Actions?: unknown }).Actions);
          const source = m.source ?? (m as Message & { Source?: string | null }).Source ?? null;
          this.handleInboundMessage({ id, content, sender, actions, source });
        }
      });
    } catch {
      // the next poll, reconnect or resume tries again
    }
  }

  private startFallbackPoll(): void {
    if (this.fallbackPollTimer || !this.conversationId) return;
    const poll = async () => {
      if (!this.conversationId || this.realtime.isConnected()) {
        this.stopFallbackPoll();
        return;
      }
      await this.fetchMissedMessages();
      if (!this.realtime.isConnected() && this.conversationId) {
        this.fallbackPollTimer = setTimeout(poll, 5000);
      }
    };
    void poll();
  }

  private stopFallbackPoll(): void {
    if (this.fallbackPollTimer) {
      clearTimeout(this.fallbackPollTimer);
      this.fallbackPollTimer = null;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer || !this.conversationId) return;
    const ping = () => void this.sendHeartbeat();
    ping();
    this.heartbeatTimer = setInterval(ping, 60_000);
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.conversationId || !this.isOpen) return;
    try {
      const res = await fetch(
        `${this.config.apiUrl}/api/conversations/${this.conversationId}/heartbeat`,
        { method: 'POST', headers: this.visitorHeaders() }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.active === false) {
        this.handleSessionEnded();
        return;
      }
      if (data.inactivityWarning && typeof data.secondsUntilClose === 'number') {
        const now = Date.now();
        if (now - this.lastInactivityWarningAt > 120_000) {
          this.lastInactivityWarningAt = now;
          const mins = Math.max(1, Math.ceil(data.secondsUntilClose / 60));
          this.addSystemMessage(this.trf(
            'widget.inactivity.stillThere',
            'Still there? This chat will close in about {minutes} min unless you reply.',
            { minutes: mins }
          ));
        }
      }
    } catch {
      // retry on next interval
    }
    void this.realtime.ping(this.conversationId);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Shows part of a reply that is still being written (reply engine streaming). Plain text while
   * it streams: half-written markdown would flicker, and the final message is rendered properly. */
  private handleDraft(draftId: string, delta: string): void {
    const box = this.$('cf-messages');
    if (!box) return;
    let draft = this.drafts.get(draftId);
    if (!draft) {
      if (this.drafts.size >= ErghiWidget.MAX_DRAFTS) return;
      const el = document.createElement('div');
      el.className = 'msg bot draft';
      el.setAttribute('data-draft-id', draftId);
      // Screen readers get the finished message once, not every partial update.
      el.setAttribute('aria-hidden', 'true');
      const label = this.senderLabel('bot');
      if (label) {
        const labelEl = document.createElement('div');
        labelEl.className = 'msg-label';
        labelEl.textContent = label;
        el.appendChild(labelEl);
      }
      const textEl = document.createElement('div');
      textEl.className = 'msg-text';
      textEl.setAttribute('dir', 'auto');
      el.appendChild(textEl);
      draft = { el, textEl, text: '', idle: null };
      this.drafts.set(draftId, draft);
    }
    draft.text = (draft.text + delta).slice(0, ErghiWidget.DRAFT_MAX_CHARS);
    // Server text: textContent only, never innerHTML.
    draft.textEl.textContent = draft.text;
    const isNew = !draft.el.isConnected;
    if (isNew) box.appendChild(draft.el);
    if (draft.idle) clearTimeout(draft.idle);
    draft.idle = setTimeout(() => this.removeDraft(draftId), ErghiWidget.DRAFT_IDLE_MS);
    // The reply is visibly on its way: the dots go, and the no-reply timer restarts so a long
    // stream is not reported as a failure (a stream that dies still is, after the full wait).
    if (this.isTyping) {
      this.isTyping = false;
      this.$('cf-typing')?.classList.remove('visible');
    }
    if (this.awaitingReply) {
      this.clearReplyTimeout();
      this.replyTimeoutTimer = setTimeout(() => this.handleReplyTimeout(), ErghiWidget.GENERATION_TIMEOUT_MS);
    }
    this.scrollMessages(isNew);
  }

  private handleDraftEnd(draftId: string, messageIds: string[]): void {
    this.removeDraft(draftId);
    // The messages that replaced the draft never arrived (the connection blinked): fetch them.
    if (messageIds.some(id => !this.knownMessageIds.has(id))) void this.fetchMissedMessages();
  }

  private removeDraft(draftId: string): void {
    const draft = this.drafts.get(draftId);
    if (!draft) return;
    if (draft.idle) clearTimeout(draft.idle);
    draft.el.remove();
    this.drafts.delete(draftId);
  }

  private clearDrafts(): void {
    for (const id of Array.from(this.drafts.keys())) this.removeDraft(id);
  }

  private setTyping(on: boolean): void {
    this.isTyping = on;
    this.$('cf-typing')?.classList.toggle('visible', on);
    this.scrollMessages(true);
  }

  /** Flags the visitor's bubble as unsent with a Retry button, instead of leaving it looking
   * delivered. Retry removes the bubble and sends the same content again. */
  private markSendFailed(tempId: string, typed: string, file: File | null, message: string): void {
    const el = this.shadow?.querySelector(`[data-id="${tempId}"]`);
    if (message) this.failureNotices.set(tempId, this.addSystemMessage(message));
    if (!el) return;
    el.classList.add('failed');
    if (!typed && !file) return; // nothing left worth sending again
    this.failedSends.set(tempId, { content: typed, file });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'msg-retry-btn';
    btn.textContent = this.tr('widget.retry', 'Retry');
    btn.addEventListener('click', () => {
      const pending = this.failedSends.get(tempId);
      if (!pending) return;
      this.failedSends.delete(tempId);
      el.remove();
      const noticeId = this.failureNotices.get(tempId);
      if (noticeId) this.shadow?.querySelector(`[data-id="${noticeId}"]`)?.remove();
      this.failureNotices.delete(tempId);
      this.messages = this.messages.filter(m => m.id !== tempId);
      this.knownMessageIds.delete(tempId);
      void this.sendMessage(pending.content, pending.file);
    });
    el.appendChild(btn);
  }

  /** Drops the queue/connecting notices once an agent has joined; keeps the "connected" one,
   * which is whatever notice arrived within a few seconds of the assignment. */
  private pruneWaitingNotices(): void {
    const now = Date.now();
    this.serverNotices = this.serverNotices.filter(n => n.el.isConnected);
    const keep = this.serverNotices[this.serverNotices.length - 1];
    for (const n of this.serverNotices) {
      if (n === keep && now - n.at < 5000) continue;
      n.el.remove();
    }
    this.serverNotices = this.serverNotices.filter(n => n.el.isConnected);
  }

  private addSystemMessage(text: string): string {
    const id = `sys-${Date.now()}-${++this.noticeSeq}`;
    this.appendMessageEl({ id, content: text, sender: 'system' });
    return id;
  }

  private noticeSeq = 0;
  /** The "failed to send" notice shown for each unsent bubble, so a successful Retry can remove it. */
  private failureNotices = new Map<string, string>();

  private appendMessageEl(msg: Message): void {
    if (msg.sender !== 'system' && this.messages.some(m => m.id === msg.id)) return;
    if (msg.sender !== 'system') {
      this.messages.push(msg);
      this.knownMessageIds.add(msg.id);
    }

    const box = this.$('cf-messages');
    if (!box) return;
    // Only the newest message's buttons stay tappable: once the thread moves on, an old
    // suggestion would answer a question nobody is asking any more.
    if (msg.sender !== 'system') this.retireActions();

    const el = document.createElement('div');
    const role = msg.sender === 'visitor' || msg.sender === 'user' ? 'visitor'
      : msg.sender === 'bot' ? 'bot'
      : msg.sender === 'system' ? 'system' : 'agent';
    el.className = `msg ${role}`;
    el.setAttribute('data-id', msg.id);

    // A campaign is the business's own words, not an AI reply: no AI label, no rating.
    const isCampaign = msg.source === 'campaign';
    if (msg.sender !== 'system' && msg.sender !== 'visitor' && msg.sender !== 'user' && !isCampaign) {
      const label = this.senderLabel(msg.sender);
      if (label) {
        const labelEl = document.createElement('div');
        labelEl.className = 'msg-label';
        labelEl.textContent = label;
        el.appendChild(labelEl);
      }
    }

    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    // Per-message direction so mixed Arabic/English threads each render correctly.
    textEl.setAttribute('dir', 'auto');
    this.fillMessageText(textEl, msg.content,
      role === 'bot' || role === 'agent' ? 'markdown' : role === 'system' ? 'linked' : 'plain');
    el.appendChild(textEl);

    if (role === 'visitor' && msg.source === 'voice') {
      const badge = document.createElement('span');
      badge.className = 'msg-voice-badge';
      badge.innerHTML = ICON_MIC;
      badge.setAttribute('role', 'img');
      badge.setAttribute('aria-label', this.tr('widget.voice.badge', 'Voice message'));
      el.insertBefore(badge, textEl);
    }
    // Always built and shown by the .voice-out root class, so turning voice replies on later
    // (branding arrives after the first messages) lights up the messages already on screen.
    if ((role === 'bot' || role === 'agent') && (this.voiceHooks.speak || canSpeakInBrowser())) {
      el.appendChild(this.buildSpeakButton());
    }

    if (msg.sources && msg.sources.length > 0) {
      el.appendChild(this.buildSourcesEl(msg.sources));
    }

    if (role === 'bot' && msg.actions && msg.actions.length > 0) {
      el.appendChild(this.buildActionsEl(msg.actions));
    }

    if (role === 'bot' && !isCampaign) {
      el.appendChild(this.buildFeedbackEl(msg.id));
    }

    box.appendChild(el);
    this.scrollMessages(true);
  }

  private buildActionsEl(actions: ChatAction[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'msg-actions';
    wrap.setAttribute('role', 'group');
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'msg-action-btn';
      btn.setAttribute('data-kind', action.kind);
      btn.setAttribute('dir', 'auto');
      // Model-written text: textContent only, never innerHTML.
      btn.textContent = action.label;
      if (action.kind === 'link') {
        btn.title = action.url ?? '';
      }
      btn.addEventListener('click', () => void this.handleAction(action, wrap, btn));
      wrap.appendChild(btn);
    }
    return wrap;
  }

  /** Disables every button row on screen. */
  private retireActions(): void {
    this.shadow?.querySelectorAll<HTMLButtonElement>('.msg-action-btn').forEach(b => { b.disabled = true; });
  }

  private async handleAction(action: ChatAction, row: HTMLElement, btn: HTMLButtonElement): Promise<void> {
    if (btn.disabled) return;
    // Links can be opened again later; everything else is a one-time answer.
    if (action.kind !== 'link') {
      row.querySelectorAll<HTMLButtonElement>('.msg-action-btn').forEach(b => { b.disabled = true; });
      btn.classList.add('chosen');
    }
    if (await this.hostHandledAction(action)) return;

    switch (action.kind) {
      case 'reply':
        await this.sendMessage(action.text || action.label);
        break;
      case 'handoff':
        // The server treats a request for a person in the visitor's words like any other.
        await this.sendMessage(action.label);
        break;
      case 'link':
        if (action.url && isOpenableUrl(action.url, 'link')) {
          window.open(action.url, '_blank', 'noopener,noreferrer');
        }
        break;
      case 'app':
        if (action.url && isOpenableUrl(action.url, 'app')) {
          window.location.assign(action.url);
        }
        break;
    }
  }

  /** Gives the host page the first say: the `erghi:action` event, then the onAction callback. */
  private async hostHandledAction(action: ChatAction): Promise<boolean> {
    const detail: ChatAction = { ...action };
    const event = new CustomEvent<ChatAction>('erghi:action', { detail, cancelable: true });
    if (!window.dispatchEvent(event)) return true;
    if (!this.onAction) return false;
    try {
      return (await this.onAction({ ...action })) === true;
    } catch (err) {
      console.warn('[Erghi] onAction threw; using the default handling:', err);
      return false;
    }
  }

  private buildFeedbackEl(messageId: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'msg-feedback';

    const rate = (rating: 'Up' | 'Down', upBtn: HTMLButtonElement, downBtn: HTMLButtonElement) => {
      if (this.ratedMessageIds.has(messageId)) return;
      this.ratedMessageIds.add(messageId);
      upBtn.classList.toggle('active', rating === 'Up');
      downBtn.classList.toggle('active', rating === 'Down');
      upBtn.disabled = true;
      downBtn.disabled = true;
      void this.sendFeedback(messageId, rating);
    };

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'msg-feedback-btn';
    upBtn.setAttribute('aria-label', this.tr('widget.feedback.up', 'Helpful'));
    upBtn.textContent = '👍';

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'msg-feedback-btn';
    downBtn.setAttribute('aria-label', this.tr('widget.feedback.down', 'Not helpful'));
    downBtn.textContent = '👎';

    upBtn.addEventListener('click', () => rate('Up', upBtn, downBtn));
    downBtn.addEventListener('click', () => rate('Down', upBtn, downBtn));

    wrap.appendChild(upBtn);
    wrap.appendChild(downBtn);
    return wrap;
  }

  private async sendFeedback(messageId: string, rating: 'Up' | 'Down'): Promise<void> {
    if (!this.conversationId) return;
    try {
      await fetch(
        `${this.config.apiUrl}/api/conversations/${this.conversationId}/messages/${messageId}/feedback`,
        {
          method: 'POST',
          headers: this.visitorHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ rating }),
        }
      );
    } catch {
      // best-effort — feedback is a nice-to-have, never block the chat UI on it
    }
  }

  private buildSourcesEl(sources: MessageSource[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'msg-sources';
    sources.forEach((source, i) => {
      if (!source.url) return;
      const chip = document.createElement('a');
      chip.className = 'msg-source-chip';
      chip.href = source.url;
      chip.target = '_blank';
      chip.rel = 'noopener noreferrer';
      chip.textContent = source.title?.trim() || `${this.tr('widget.source.label', 'Source')} ${i + 1}`;
      wrap.appendChild(chip);
    });
    return wrap;
  }

  private scrollMessages(force = false): void {
    const box = this.$('cf-messages') as HTMLElement | null;
    if (!box) return;
    const distanceFromBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
    if (!force && distanceFromBottom > 80) return;
    requestAnimationFrame(() => {
      box.scrollTop = box.scrollHeight;
      requestAnimationFrame(() => {
        box.scrollTop = box.scrollHeight;
      });
    });
  }

  private sessionKey(): string {
    return `erghi:session:${this.config.widgetId}`;
  }

  private saveSession(): void {
    if (!this.conversationId) return;
    try {
      localStorage.setItem(this.sessionKey(), JSON.stringify({
        conversationId: this.conversationId,
        visitorToken: this.visitorToken,
        savedAt: Date.now(),
      }));
    } catch {
      // private mode / storage full
    }
  }

  private clearSession(): void {
    try {
      localStorage.removeItem(this.sessionKey());
    } catch {
      // ignore
    }
  }

  private handleSessionEnded(): void {
    this.clearDrafts();
    this.addSystemMessage(this.tr('widget.session.endedNewChat', 'This conversation has ended. Send a message to start a new chat.'));
    this.conversationId = null;
    this.visitorToken = null;
    this.secureContextExpiresAt = 0;
    this.awaitingReply = false;
    this.humanHandled = !this.aiEnabled;
    this.clearReplyTimeout();
    this.clearSession();
    void this.realtime.disconnect();
    this.stopHeartbeat();
    // A visitor who came back to a conversation and never saw the form is asked before the next one.
    this.updatePreChat();
  }

  private async tryRestoreSession(): Promise<boolean> {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(this.sessionKey());
    } catch {
      return false;
    }
    if (!raw) return false;

    let conversationId: string;
    let visitorToken: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      conversationId = parsed.conversationId as string;
      visitorToken = (parsed.visitorToken as string | null | undefined) ?? null;
    } catch {
      this.clearSession();
      return false;
    }
    if (!conversationId) return false;

    try {
      const convRes = await fetch(`${this.config.apiUrl}/api/conversations/${conversationId}`, {
        headers: visitorToken ? { 'X-Visitor-Token': visitorToken } : undefined,
      });
      if (!convRes.ok) {
        this.clearSession();
        return false;
      }
      const conv = await convRes.json();
      const status = String(conv.status ?? conv.Status ?? '').toLowerCase();
      if (status === 'closed' || status === 'resolved') {
        this.clearSession();
        return false;
      }

      this.conversationId = conversationId;
      this.visitorToken = visitorToken;
      if (status === 'queued' || status === 'assigned') this.humanHandled = true;
      void this.loadPublicBranding(conv.workspaceId ?? conv.WorkspaceId);
      await this.loadMessageHistory();
      await this.connectRealtime();
      if (this.isOpen) this.startHeartbeat();
      return true;
    } catch {
      return false;
    }
  }

  private async loadMessageHistory(): Promise<void> {
    if (!this.conversationId) return;
    const box = this.$('cf-messages');
    if (box) box.innerHTML = '';
    this.messages = [];
    this.knownMessageIds.clear();

    try {
      const res = await fetch(
        `${this.config.apiUrl}/api/conversations/${this.conversationId}/messages?limit=200`,
        { headers: this.visitorHeaders() }
      );
      const list = this.extractMessages(await res.json());
      const sorted = [...list].sort((a, b) => {
        const ta = new Date(a.createdAt ?? (a as Message & { CreatedAt?: string }).CreatedAt ?? 0).getTime();
        const tb = new Date(b.createdAt ?? (b as Message & { CreatedAt?: string }).CreatedAt ?? 0).getTime();
        return ta - tb;
      });
      for (const m of sorted) {
        const id = (m as Message & { Id?: string }).id ?? (m as Message & { Id?: string }).Id ?? '';
        const sender = String(m.sender ?? (m as Message & { Sender?: string }).Sender ?? 'bot').toLowerCase();
        const content = String(m.content ?? (m as Message & { Content?: string }).Content ?? '');
        const source = m.source ?? (m as Message & { Source?: string | null }).Source ?? null;
        if (!id || !content) continue;
        const actions = normalizeActions(m.actions ?? (m as Message & { Actions?: unknown }).Actions);
        this.knownMessageIds.add(id);
        this.appendMessageEl({ id, content, sender, source, actions });
      }
      if (sorted.length === 0) this.addSystemMessage(this.greetingText());
      this.scrollMessages(true);
    } catch {
      this.addSystemMessage(this.greetingText());
    }
  }

  private senderLabel(sender: string): string {
    const s = sender.toLowerCase();
    if (s === 'bot' && this.displayConfig.showAiLabel)
      return this.displayConfig.aiAssistantName || this.tr('widget.label.ai', 'AI Assistant');
    if (s === 'agent' && this.displayConfig.showAgentName)
      return this.displayConfig.assignedAgentName || this.tr('widget.label.agent', 'Support Agent');
    return '';
  }
}

/** Returns the URL unchanged if it's a well-formed https:// URL, else ''. The backend already
 * validates these as HTTPS-only at save time (UpdateBrandingRequestValidator), but the widget
 * embeds on arbitrary third-party sites, so it re-validates here rather than trusting a
 * `javascript:`/`data:` scheme could never reach this code path some other way. */
/** GET /api/widgets/{id}/public (WidgetEmbedConfigDto). Untrusted: every field is checked before use. */
type PublicWidgetConfig = Partial<Record<
  | 'primaryColor' | 'secondaryColor' | 'widgetPosition' | 'widgetTheme' | 'widgetCornerRadius'
  | 'welcomeMessage' | 'companyName' | 'logoUrl'
  | 'aiAssistantName' | 'AiAssistantName' | 'showAiLabel' | 'ShowAiLabel' | 'showAgentName' | 'ShowAgentName'
  | 'termsUrl' | 'TermsUrl' | 'privacyUrl' | 'PrivacyUrl' | 'supportUrl' | 'SupportUrl'
  | 'voiceInputEnabled' | 'VoiceInputEnabled' | 'voiceOutputEnabled' | 'VoiceOutputEnabled'
  | 'attachmentsEnabled' | 'AttachmentsEnabled' | 'messageRatingEnabled' | 'MessageRatingEnabled'
  | 'showPoweredBy' | 'ShowPoweredBy' | 'campaigns' | 'Campaigns'
  | 'enableAI' | 'EnableAI' | 'businessHours' | 'BusinessHours',
  unknown
>>;

/** m:ss for the recording timer. */
/** Upload statuses that mean "this file will never be accepted", as opposed to "try again". */
const FILE_REJECTED_STATUSES = new Set([400, 413, 415, 422]);

/** The attachment upload was refused or failed; `reason` is the server's own words, when it sent any. */
const MAX_MESSAGE_LENGTH = 4000;

/** The message POST was refused; `code` is the server's stable error code, when it sent one. */
class SendError extends Error {
  constructor(readonly status: number, readonly code: string | null) {
    super(`Send HTTP ${status}`);
  }
}

class UploadError extends Error {
  constructor(readonly status: number, readonly reason: string) {
    super(`Upload HTTP ${status}`);
  }
}

async function readErrorReason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown };
    const reason = body.error ?? body.message;
    return typeof reason === 'string' ? reason.slice(0, 200) : '';
  } catch {
    return '';
  }
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The stable `code` from an Erghi error body, or null. */
/** Whether a 400 from creating a conversation is the API refusing the pre-chat email. */
async function refusesPreChatEmail(res: Response): Promise<boolean> {
  try {
    const body = await (typeof res.clone === 'function' ? res.clone() : res).json();
    const errors = body?.errors;
    return !!errors && typeof errors === 'object' && 'preChat.email' in errors;
  } catch {
    return false;
  }
}

async function readErrorCode(res: Response): Promise<string | null> {
  try {
    const body = await res.json();
    return typeof body?.code === 'string' ? body.code : null;
  } catch {
    return null;
  }
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

// Free-plan badge target; the utm tells us which installs bring visitors over.
const POWERED_BY_URL = 'https://erghi.ai/?utm_source=widget&amp;utm_medium=powered_by';

const DEFAULT_CORNER_RADIUS = 12;
// Generous enough for a slow mobile network, short enough that a stalled API still lets the
// widget appear (with the embed settings and defaults) instead of never.
const STARTUP_FETCH_TIMEOUT_MS = 3000;

function isPosition(value: unknown): value is WidgetPosition {
  return value === 'bottom-left' || value === 'bottom-right';
}

function isTheme(value: unknown): value is WidgetTheme {
  return value === 'light' || value === 'dark' || value === 'auto';
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Workspace corner radius: a whole number of pixels in 0-50, else the default. */
export function clampCornerRadius(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CORNER_RADIUS;
  return Math.min(50, Math.max(0, Math.round(value)));
}

/**
 * The logo is shown only from https, or from the API's own origin (the uploaded-logo endpoint,
 * which is plain http on a local stack). Nothing else: no data:, blob:, or other-origin http.
 */
export function safeLogoUrl(value: unknown, apiUrl: string): string {
  if (typeof value !== 'string' || !value) return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:') return parsed.href;
    if (parsed.protocol === 'http:' && parsed.origin === new URL(apiUrl).origin) return parsed.href;
  } catch { /* not a URL */ }
  return '';
}

/**
 * GET and parse JSON, giving up after `timeoutMs` for the whole exchange (headers and body).
 * Never throws: any failure, non-2xx, or timeout comes back as null.
 */
type FetchResult = { ok: true; body: unknown } | { ok: false; status: number };

/** status 0: no answer (timeout, network error, unreadable body). */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<FetchResult> {
  // AbortController + setTimeout rather than AbortSignal.timeout, which older Safari lacks.
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, body: await res.json() };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const result = await fetchWithTimeout(url, timeoutMs);
  return result.ok ? result.body : null;
}

/** The public opening status ({ isOpen, nextOpenAt, timeZone }); null when absent or malformed. */
export function parseOpeningHours(value: unknown): { isOpen: boolean; nextOpenAt: number | null } | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const isOpen = obj.isOpen ?? obj.IsOpen;
  if (typeof isOpen !== 'boolean') return null;
  const next = obj.nextOpenAt ?? obj.NextOpenAt;
  let nextOpenAt: number | null = null;
  if (!isOpen && typeof next === 'string' && next) {
    // The API sends UTC; a stamp without a zone is read as UTC, not the visitor's local time.
    const stamp = /(Z|[+-]\d\d:?\d\d)$/i.test(next) ? next : `${next}Z`;
    const ms = Date.parse(stamp);
    nextOpenAt = Number.isFinite(ms) ? ms : null;
  }
  return { isOpen, nextOpenAt };
}

/** "Mon 09:00"-style reopening time in the visitor's zone and language; the day is left out
 * when it is today. */
export function formatReopening(at: number, locale: string, now: number = Date.now()): string {
  const when = new Date(at);
  const sameDay = new Date(now).toDateString() === when.toDateString();
  try {
    return new Intl.DateTimeFormat(locale, sameDay
      ? { hour: 'numeric', minute: '2-digit' }
      : { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(when);
  } catch {
    return when.toLocaleString();
  }
}

function safeHttpsUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? value : '';
  } catch {
    return '';
  }
}

export function escapeHtml(s: string): string {
  // Quotes matter here, not just for general-purpose HTML escaping: every current caller
  // interpolates this into double-quoted attribute positions inside a template-literal
  // innerHTML (e.g. aria-label="${escapeHtml(...)}"), sourced from remote i18n translation
  // strings (see fetchTranslations()) -- an unescaped `"` in that value closes the attribute
  // early and lets the rest of the string inject arbitrary attributes/event handlers,
  // running in the security context of every third-party site that embeds this widget
  // (2026-08-08 security audit).
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseJsonAttr(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    console.warn('[Erghi] Invalid JSON in data-visitor-context');
    return undefined;
  }
}

/** Auto-init from script tag attributes */
/** The primary language subtag of a BCP 47 tag ("en-US" → "en"), or null for anything else. */
export function normalizeLocale(value: string | null | undefined): string | null {
  const match = /^([a-zA-Z]{2,3})(?:[-_][a-zA-Z0-9]{1,8})*$/.exec((value ?? '').trim());
  return match ? match[1].toLowerCase().slice(0, 2) : null;
}

function autoInit(): void {
  const script =
    document.currentScript as HTMLScriptElement | null ??
    (document.querySelector('script[data-widget-id]') as HTMLScriptElement | null);
  if (!script) return;

  const widgetId = script.getAttribute('data-widget-id') ?? script.getAttribute('data-erghi');
  if (!widgetId) return;

  const visitorContext = parseJsonAttr(script.getAttribute('data-visitor-context'));

  const widget = new ErghiWidget({
    widgetId,
    apiUrl: script.getAttribute('data-api-url') ?? undefined,
    primaryColor: script.getAttribute('data-primary-color') ?? undefined,
    position: (script.getAttribute('data-position') as WidgetPosition | null) ?? undefined,
    theme: (script.getAttribute('data-theme') as WidgetTheme | null) ?? undefined,
    title: script.getAttribute('data-title') ?? undefined,
    greeting: script.getAttribute('data-greeting') ?? undefined,
    direction: (script.getAttribute('data-direction') as 'auto' | 'ltr' | 'rtl') ?? undefined,
    locale: script.getAttribute('data-locale') ?? undefined,
    visitorContext,
  });

  (window as unknown as { erghiWidget?: ErghiWidget }).erghiWidget = widget;
}

if (typeof window !== 'undefined') {
  (window as unknown as { ErghiWidget: typeof ErghiWidget }).ErghiWidget = ErghiWidget;
  autoInit();
}
