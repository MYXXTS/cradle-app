import type { i18n as I18nInstance } from 'i18next'

let _instance: I18nInstance | null = null

export function setI18nInstance(instance: I18nInstance): void {
  _instance = instance
}

export function getI18n(): I18nInstance {
  if (!_instance) {
    throw new Error('i18n instance not initialized. Ensure I18nProvider has mounted.')
  }
  return _instance
}
