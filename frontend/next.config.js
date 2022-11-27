// next.config.js
const nextTranslate = require("next-translate");

const ContentSecurityPolicy = `
	default-src ${process.env.NEXT_PUBLIC_WEBSITE_URL};
	script-src ${
    process.env.NEXT_PUBLIC_WEBSITE_URL
  } https://app.posthog.com https://infisical.com https://assets.calendly.com/ https://js.stripe.com https://api.stripe.com 'unsafe-inline' 'unsafe-eval';
	style-src 'self' https://rsms.me 'unsafe-inline';
	child-src https://infisical.com https://api.stripe.com;
	frame-src https://js.stripe.com/ https://api.stripe.com;
	connect-src ws://${process.env.NEXT_PUBLIC_WEBSITE_URL?.split("//")[1]} ${
  process.env.NEXT_PUBLIC_WEBSITE_URL
} https://api.github.com/repos/Infisical/infisical-cli https://api.heroku.com/ https://id.heroku.com/oauth/authorize https://id.heroku.com/oauth/token https://checkout.stripe.com https://app.posthog.com https://infisical.com https://api.stripe.com https://vitals.vercel-insights.com/v1/vitals;
	img-src 'self' https://*.stripe.com https://i.ytimg.com/ data:;
	media-src;
	font-src 'self' https://maxcdn.bootstrapcdn.com https://rsms.me https://fonts.gstatic.com;  
`;

// You can choose which headers to add to the list
// after learning more below.
const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=()",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Content-Security-Policy",
    value: ContentSecurityPolicy.replace(/\s{2,}/g, " ").trim(),
  },
];

module.exports = nextTranslate({
  output: "standalone",
  async headers() {
    return [
      {
        // Apply these headers to all routes in your application.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
});
