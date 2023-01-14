// @ts-check

/**
 * @type {import('next-i18next').UserConfig}
 */
module.exports = {
  // https://www.i18next.com/overview/configuration-options#logging
  debug: false,
  i18n: {
    defaultLocale: "en",
    locales: ["en", "ko", "fr", "pt-BR"],
  },
  fallbackLng: {
    default: ["en"],
  },

  reloadOnPrerender: process.env.NODE_ENV === "development",

  /**
   * @link https://github.com/i18next/next-i18next#6-advanced-configuration
   */
  // saveMissing: false,
  // strictMode: true,
  // serializeConfig: false,
  // react: { useSuspense: false }
};
