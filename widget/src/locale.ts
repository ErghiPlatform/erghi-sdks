/**
 * Built-in widget UI strings (EN/AR/ES). Server-provided translations
 * (`/api/v1/i18n/translations?context=widget`) override these at runtime;
 * bundling guarantees the widget is fully localized — including RTL Arabic —
 * even when the server has no translation rows for a key.
 */

export const RTL_LOCALES = ['ar', 'he', 'fa', 'ur'] as const;

export function isRtlLocale(locale: string): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale.slice(0, 2).toLowerCase());
}

export type WidgetDirection = 'auto' | 'ltr' | 'rtl';

const EN: Record<string, string> = {
  'widget.greeting': 'Hi! How can we help you today?',
  'widget.header.subtitle': 'We typically reply in minutes',
  'widget.input.placeholder': 'Type a message…',
  'widget.aria.open': 'Open chat',
  'widget.aria.close': 'Close chat',
  'widget.aria.send': 'Send',
  'widget.aria.attach': 'Attach file',
  'widget.aria.dialog': 'Chat',
  'widget.error.connect': 'Unable to connect. Please try again.',
  'widget.error.send': 'Message failed to send.',
  'widget.queue.position': "You're #{position} in the queue. An agent will join shortly.",
  'widget.agent.connected': "You're connected with {name}.",
  'widget.inactivity.warning': 'This chat will close in about {minutes} min due to inactivity. Send a message to stay connected.',
  'widget.inactivity.stillThere': 'Still there? This chat will close in about {minutes} min unless you reply.',
  'widget.session.ended': 'This conversation has ended. Start a new chat if you need more help.',
  'widget.label.ai': 'AI Assistant',
  'widget.label.agent': 'Support Agent',
  'widget.source.label': 'Source',
  'widget.feedback.up': 'Helpful',
  'widget.feedback.down': 'Not helpful',
};

const AR: Record<string, string> = {
  'widget.greeting': 'أهلاً! كيف نقدر نساعدك النهاردة؟',
  'widget.header.subtitle': 'عادةً نرد خلال دقائق',
  'widget.input.placeholder': 'اكتب رسالتك…',
  'widget.aria.open': 'فتح المحادثة',
  'widget.aria.close': 'إغلاق المحادثة',
  'widget.aria.send': 'إرسال',
  'widget.aria.attach': 'إرفاق ملف',
  'widget.aria.dialog': 'المحادثة',
  'widget.error.connect': 'تعذّر الاتصال. برجاء المحاولة مرة أخرى.',
  'widget.error.send': 'لم يتم إرسال الرسالة.',
  'widget.queue.position': 'ترتيبك رقم {position} في الانتظار. سينضم أحد ممثلي الدعم قريبًا.',
  'widget.agent.connected': 'تم توصيلك مع {name}.',
  'widget.inactivity.warning': 'ستُغلق هذه المحادثة خلال {minutes} دقيقة تقريبًا بسبب عدم النشاط. أرسل رسالة للبقاء متصلاً.',
  'widget.inactivity.stillThere': 'هل ما زلت هنا؟ ستُغلق المحادثة خلال {minutes} دقيقة تقريبًا ما لم ترد.',
  'widget.session.ended': 'انتهت هذه المحادثة. ابدأ محادثة جديدة إذا احتجت مساعدة إضافية.',
  'widget.label.ai': 'المساعد الذكي',
  'widget.label.agent': 'ممثل الدعم',
  'widget.source.label': 'المصدر',
  'widget.feedback.up': 'مفيد',
  'widget.feedback.down': 'غير مفيد',
};

const ES: Record<string, string> = {
  'widget.greeting': '¡Hola! ¿Cómo podemos ayudarte hoy?',
  'widget.header.subtitle': 'Normalmente respondemos en minutos',
  'widget.input.placeholder': 'Escribe un mensaje…',
  'widget.aria.open': 'Abrir chat',
  'widget.aria.close': 'Cerrar chat',
  'widget.aria.send': 'Enviar',
  'widget.aria.attach': 'Adjuntar archivo',
  'widget.aria.dialog': 'Chat',
  'widget.error.connect': 'No se pudo conectar. Inténtalo de nuevo.',
  'widget.error.send': 'No se pudo enviar el mensaje.',
  'widget.queue.position': 'Eres el #{position} en la cola. Un agente se unirá en breve.',
  'widget.agent.connected': 'Estás conectado con {name}.',
  'widget.inactivity.warning': 'Este chat se cerrará en unos {minutes} min por inactividad. Envía un mensaje para seguir conectado.',
  'widget.inactivity.stillThere': '¿Sigues ahí? Este chat se cerrará en unos {minutes} min si no respondes.',
  'widget.session.ended': 'Esta conversación ha terminado. Inicia un nuevo chat si necesitas más ayuda.',
  'widget.label.ai': 'Asistente IA',
  'widget.label.agent': 'Agente de soporte',
  'widget.source.label': 'Fuente',
  'widget.feedback.up': 'Útil',
  'widget.feedback.down': 'No útil',
};

const BUNDLED: Record<string, Record<string, string>> = { en: EN, ar: AR, es: ES };

export function bundledTranslations(locale: string): Record<string, string> {
  return { ...EN, ...(BUNDLED[locale.slice(0, 2).toLowerCase()] ?? {}) };
}

/** Replace `{token}` placeholders in a translated string. */
export function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match
  );
}
