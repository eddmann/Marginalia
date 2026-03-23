import '@/i18n/i18n';
import { useCallback } from 'react';
import { useTranslation as _useTranslation } from 'react-i18next';

export const useTranslation = (namespace: string = 'translation') => {
  const { t } = _useTranslation(namespace);

  return useCallback((key: string, options = {}) => t(key, { defaultValue: key, ...options }), [t]);
};
