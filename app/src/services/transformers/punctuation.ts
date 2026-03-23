import type { Transformer } from './types';

const verticalQuotationsMapHans: Record<string, string> = {
  '“': '﹃',
  '”': '﹄',
  '‘': '﹁',
  '’': '﹂',
  '「': '﹁',
  '」': '﹂',
  '『': '﹃',
  '』': '﹄',
};

const verticalQuotationsMapHant: Record<string, string> = {
  '“': '﹁',
  '”': '﹂',
  '‘': '﹃',
  '’': '﹄',
  '「': '﹁',
  '」': '﹂',
  '『': '﹃',
  '』': '﹄',
};

const _quotationsMapHans2Hant = {
  '“': '「',
  '”': '」',
  '‘': '『',
  '’': '』',
  '﹃': '﹁',
  '﹄': '﹂',
  '﹁': '﹃',
  '﹂': '﹄',
};

export const punctuationTransformer: Transformer = {
  name: 'punctuation',

  transform: async (ctx) => {
    if (!ctx.viewSettings.replaceQuotationMarks) return ctx.content;

    let result = ctx.content;

    const shouldTransformVertical = ctx.viewSettings.vertical;
    if (shouldTransformVertical) {
      const traditionalChineseLocales = ['zh-Hant', 'zh-TW', 'zh_TW'];
      let punctuationMap: Record<string, string> = verticalQuotationsMapHans;
      if (
        traditionalChineseLocales.includes(ctx.primaryLanguage || '') ||
        traditionalChineseLocales.includes(ctx.userLocale)
      ) {
        punctuationMap = verticalQuotationsMapHant;
      }
      for (const [original, vertical] of Object.entries(punctuationMap)) {
        if (ctx.reversePunctuationTransform) {
          result = result.replace(new RegExp(vertical, 'g'), original);
        } else {
          result = result.replace(new RegExp(original, 'g'), vertical);
        }
      }
    }

    return result;
  },
};
