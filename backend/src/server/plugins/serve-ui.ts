import fs from "node:fs";
import path from "node:path";

import staticServe from "@fastify/static";
import RE2 from "re2";

import { getConfig, IS_PACKAGED } from "@app/lib/config/env";

// to enabled this u need to set standalone mode to true
export const registerServeUI = async (
  server: FastifyZodProvider,
  {
    standaloneMode,
    dir
  }: {
    standaloneMode?: boolean;
    dir: string;
  }
) => {
  const appCfg = getConfig();
  const cdnHost = appCfg.CDN_HOST || "";

  // use this only for frontend runtime static non-sensitive configuration in standalone mode
  // that app needs before loading like posthog dsn key
  // for most of the other usecase use server config
  server.route({
    method: "GET",
    url: "/runtime-ui-env.js",
    schema: {
      hide: true
    },
    handler: (_req, res) => {
      void res.type("application/javascript");
      const config = {
        CAPTCHA_SITE_KEY: appCfg.CAPTCHA_SITE_KEY,
        POSTHOG_API_KEY: appCfg.POSTHOG_PROJECT_API_KEY,
        INTERCOM_ID: appCfg.INTERCOM_ID,
        TELEMETRY_CAPTURING_ENABLED: appCfg.TELEMETRY_ENABLED,
        CDN_HOST: cdnHost
      };
      // Define window.__toCdnUrl for Vite's experimental.renderBuiltUrl runtime support
      // This function is called by dynamically imported chunks to resolve CDN URLs
      const js = `
        window.__INFISICAL_RUNTIME_ENV__ = Object.freeze(${JSON.stringify(config)});
        window.__toCdnUrl = function(filename) {
          var cdnHost = window.__INFISICAL_RUNTIME_ENV__.CDN_HOST || "";
          if (cdnHost && filename.startsWith("assets/")) {
            return cdnHost + "/" + filename;
          }
          return "/" + filename;
        };
      `.trim();
      return res.send(js);
    }
  });

  if (standaloneMode) {
    const frontendName = IS_PACKAGED ? "frontend" : "frontend-build";
    const frontendPath = path.join(dir, frontendName);

    const indexHtmlPath = path.join(frontendPath, "index.html");
    let indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

    if (cdnHost) {
      // Replace relative asset paths with CDN URLs in script and link tags
      indexHtml = indexHtml
        .replace(/src="\/assets\//g, `src="${cdnHost}/assets/`)
        .replace(/href="\/assets\//g, `href="${cdnHost}/assets/`);

      // Inject CDN host into CSP directives that need it
      const cspDirectives = ["script-src", "style-src", "font-src", "connect-src", "media-src"];
      for (const directive of cspDirectives) {
        const regex = new RE2(`(${directive}\\s+'self')`, "g");
        indexHtml = indexHtml.replace(regex, `$1 ${cdnHost}`);
      }
    }

    // Inject GTM/analytics CSP domains only for Infisical Cloud deployments
    if (appCfg.isCloud) {
      const cloudCspExtensions: Record<string, string[]> = {
        "script-src": [
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com",
          "https://googleads.g.doubleclick.net",
          "https://www.googleadservices.com",
          "https://www.google.com",
          "https://js.hs-scripts.com",
          "https://js.hsforms.net",
          "https://js.hs-banner.com",
          "https://js.hs-analytics.net",
          "https://js.usemessages.com",
          "https://js.hscollectedforms.net"
        ],
        "frame-src": [
          "https://www.googletagmanager.com",
          "https://bid.g.doubleclick.net",
          "https://td.doubleclick.net"
        ],
        "connect-src": [
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com",
          "https://analytics.google.com",
          "https://stats.g.doubleclick.net",
          "https://*.hubspot.com",
          "https://forms.hubspot.com",
          "https://api.hubapi.com"
        ],
        "img-src": [
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com",
          "https://www.google.com",
          "https://googleads.g.doubleclick.net",
          "https://www.googleadservices.com",
          "https://track.hubspot.com",
          "https://forms.hubspot.com"
        ]
      };

      for (const [directive, domains] of Object.entries(cloudCspExtensions)) {
        const regex = new RE2(`(${directive}\\s+[^;]+)(;)`, "g");
        indexHtml = indexHtml.replace(regex, `$1 ${domains.join(" ")}$2`);
      }

      indexHtml = indexHtml.replace(
        "<!-- GTM_NOSCRIPT_PLACEHOLDER -->",
        `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-WL5C7MWT" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`
      );
    }

    await server.register(staticServe, {
      root: frontendPath,
      wildcard: false,
      maxAge: "30d",
      immutable: true,
      index: false
    });

    server.route({
      method: "GET",
      url: "/*",
      schema: {
        hide: true
      },
      handler: (request, reply) => {
        if (request.url.startsWith("/api")) {
          reply.callNotFound();
          return;
        }

        return reply
          .type("text/html")
          .header("Cache-Control", "no-cache, no-store, must-revalidate")
          .header("Pragma", "no-cache")
          .header("Expires", "0")
          .send(indexHtml);
      }
    });
  }
};
