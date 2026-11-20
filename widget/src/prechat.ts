/**
 * The pre-chat form: an optional name and email the workspace can ask for before the visitor's
 * first message. The values only travel with the request that creates the conversation; the
 * widget never stores them.
 */

export interface PreChatSettings {
  enabled: boolean;
  nameRequired: boolean;
  emailRequired: boolean;
}

export interface PreChatValues {
  name?: string;
  email?: string;
}

export type PreChatError = 'nameRequired' | 'emailRequired' | 'emailInvalid';

/** Column limits the API enforces (Visitor.Name / Visitor.Email). */
export const PRECHAT_MAX_NAME = 100;
export const PRECHAT_MAX_EMAIL = 255;

export const PRECHAT_OFF: PreChatSettings = { enabled: false, nameRequired: false, emailRequired: false };

/** Reads the settings from /public (camelCase or PascalCase). A required flag counts only while the form is on. */
export function parsePreChatSettings(data: Record<string, unknown>): PreChatSettings {
  const flag = (camel: string): boolean => {
    const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
    return (data[camel] ?? data[pascal]) === true;
  };
  const enabled = flag('preChatFormEnabled');
  return {
    enabled,
    nameRequired: enabled && flag('preChatNameRequired'),
    emailRequired: enabled && flag('preChatEmailRequired'),
  };
}

// Mirrors PreChatEmail in Erghi.Conversation/Api/Validation/CreateConversationRequestValidator.cs:
// one "@", no spaces, control, invisible or display-name characters, a dotted domain; letters in any script.
const EMAIL_PATTERN = /^[^\s\p{Cc}\p{Cf}@<>()[\],;:"\\]+@[^\s\p{Cc}\p{Cf}@<>()[\],;:"\\.]+(\.[^\s\p{Cc}\p{Cf}@<>()[\],;:"\\.]+)+$/u;

// Mirrors PreChatEmail.CleanName: invisible direction overrides and zero-width characters that could
// make a name display as something else. ZWNJ/ZWJ stay (Persian, Arabic, emoji).
const HIDDEN_IN_NAME = /[\u200B\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

export function isPlausibleEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Trims, drops control and invisible characters, and leaves out blank fields. */
export function cleanPreChatValues(name: string, email: string): PreChatValues {
  const cleanName = name.replace(HIDDEN_IN_NAME, '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PRECHAT_MAX_NAME);
  const cleanEmail = email.trim();
  const out: PreChatValues = {};
  if (cleanName) out.name = cleanName;
  if (cleanEmail) out.email = cleanEmail;
  return out;
}

/** The first problem with each field, if any. */
export function validatePreChat(values: PreChatValues, settings: PreChatSettings): { name?: PreChatError; email?: PreChatError } {
  const errors: { name?: PreChatError; email?: PreChatError } = {};
  if (settings.nameRequired && !values.name) errors.name = 'nameRequired';
  if (values.email) {
    if (values.email.length > PRECHAT_MAX_EMAIL || !isPlausibleEmail(values.email)) errors.email = 'emailInvalid';
  } else if (settings.emailRequired) {
    errors.email = 'emailRequired';
  }
  return errors;
}

/** Whether the form stands between the visitor and their first message. */
export function preChatPending(state: {
  settings: PreChatSettings;
  answered: boolean;
  hasConversation: boolean;
  hostIdentified: boolean;
}): boolean {
  return state.settings.enabled && !state.answered && !state.hasConversation && !state.hostIdentified;
}
