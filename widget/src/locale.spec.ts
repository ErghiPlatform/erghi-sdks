import { BUNDLED_LOCALES, bundledTranslations, isRtlLocale } from './locale';

describe('bundled widget translations', () => {
  const en = bundledTranslations('en');
  const placeholders = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).sort();

  it.each(BUNDLED_LOCALES.filter((l) => l !== 'en'))('%s translates every English key', (locale) => {
    const bundle = bundledTranslations(locale);
    for (const key of Object.keys(en)) {
      expect(bundle[key]).toBeTruthy();
      expect(placeholders(bundle[key])).toEqual(placeholders(en[key]));
    }
    expect(bundle['widget.greeting']).not.toBe(en['widget.greeting']);
  });

  it('covers German, French and Dutch as well as English, Arabic and Spanish', () => {
    expect(BUNDLED_LOCALES).toEqual(expect.arrayContaining(['en', 'ar', 'es', 'de', 'fr', 'nl']));
  });

  it('falls back to English for a language without a bundle, by its two-letter code', () => {
    expect(bundledTranslations('pt-BR')['widget.greeting']).toBe(en['widget.greeting']);
    expect(bundledTranslations('de-AT')['widget.label.ai']).toBe('KI-Assistent');
    expect(isRtlLocale('ar-EG')).toBe(true);
    expect(isRtlLocale('nl')).toBe(false);
  });
});
