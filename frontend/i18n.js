const workaround = require("next-translate/lib/cjs/plugin/utils.js");

workaround.defaultLoader =
  "(l, n) => import(`@next-translate-root/locales/${l}.json`).then(m => m?.default[n] ?? {} )";

module.exports = {
  locales: ["en-US", "ko-KR"],
  defaultLocale: "en-US",
  pages: {
    "*": ["common", "nav"],
    "/login": ["login"],
    "/signup": ["signup", "form-password"],
    "rgx:^/(login|signup)": ["auth"],
    "rgx:^/settings": ["settings"],
    "/dashboard/[id]": ["dashboard"],
    "/users/[id]": ["settings-members", "section-members"],
    "/settings/project/[id]": ["settings-project", "section-token"],
    "/settings/org/[id]": [
      "settings-org",
      "section-incident",
      "section-members",
    ],
    "/settings/personal/[id]": ["settings-personal"],
    "/settings/billing/[id]": ["billing"],
    "/integrations/[id]": ["integrations"],
  },
};
