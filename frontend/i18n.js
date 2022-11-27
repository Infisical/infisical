const workaround = require("next-translate/lib/cjs/plugin/utils.js");

workaround.defaultLoader =
	"(l, n) => import(`@next-translate-root/locales/${l}.json`).then(m => m?.default[n] ?? {} )";

module.exports = {
	locales: ["en-US", "ko-KR"],
	defaultLocale: "en-US",
	pages: {
		"*": ["common", "nav"],
		"rgx:^/(login|signup)": ["auth"],
		"/dashboard/[id]": ["dashboard"],
	},
};
