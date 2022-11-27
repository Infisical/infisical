module.exports = {
	locales: ["en-US", "ko-KR"],
	defaultLocale: "en-US",
	pages: {
		"*": ["common", "nav"],
		"reg:^/(login|signup)": ["auth"],
	},
};
