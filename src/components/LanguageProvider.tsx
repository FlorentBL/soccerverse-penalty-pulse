'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { isLocale, locales, messages, type Locale } from '@/lib/i18n';

const STORAGE_KEY = 'penaltypulse:language';
const LanguageContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({
  locale: 'en', setLocale: () => {},
});

export function useLanguage() {
  const { locale, setLocale } = useContext(LanguageContext);
  return { locale, setLocale, t: messages[locale] };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isLocale(saved)) setLocale(saved);
    } catch { /* Storage may be disabled in an embedded frame. English remains the default. */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    try { window.localStorage.setItem(STORAGE_KEY, locale); } catch { /* Optional preference. */ }
  }, [locale]);
  return <LanguageContext.Provider value={{ locale, setLocale }}>{children}</LanguageContext.Provider>;
}

export function LanguagePicker() {
  const { locale, setLocale, t } = useLanguage();
  return <div className="pulse-language">
    <label htmlFor="pulse-language-select">{t.language}</label>
    <select id="pulse-language-select" value={locale} onChange={event => setLocale(event.target.value as Locale)}>
      {locales.map(value => <option key={value} value={value}>{
        { en: 'English', fr: 'Français', it: 'Italiano', es: 'Español', pt: 'Português' }[value]
      }</option>)}
    </select>
  </div>;
}
