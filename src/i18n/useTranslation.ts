import { useLanguage } from './LanguageContext'
import ruTranslations from './translations/ru.json'
import enTranslations from './translations/en.json'

const translations = {
  ru: ruTranslations,
  en: enTranslations,
} as const

export function useTranslation() {
  const { language } = useLanguage()

  const t = (key: string): string => {
    const keys = key.split('.')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any = translations[language]
    
    for (const k of keys) {
      value = value?.[k]
    }
    
    return value || key
  }

  return { t, language }
}

