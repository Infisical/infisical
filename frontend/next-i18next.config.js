// @ts-check

/**
 * @type {import('next-i18next').UserConfig}
 */
module.exports = {
  // https://www.i18next.com/overview/configuration-options#logging
  debug: process.env.NODE_ENV === "development",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "de"],
  },
  /** To avoid issues when deploying to some paas (vercel...) */
  //   localePath:
  //     typeof window === "undefined"
  //       ? require("path").resolve("./public/locales")
  //       : "/locales",
  localePath: (locale, namespace, missing) => {
    const data = JSON.parse(
      require("path").resolve(`./public/locales/${locale}.json`)
    );
    return data.default[namespace];
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
