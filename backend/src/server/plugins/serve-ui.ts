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
      const cspDirectives = ["script-src", "style-src", "font-src", "connect-src"];
      for (const directive of cspDirectives) {
        const regex = new RE2(`(${directive}\\s+'self')`, "g");
        indexHtml = indexHtml.replace(regex, `$1 ${cdnHost}`);
      }
    }

    await server.register(staticServe, {
      root: frontendPath,
      wildcard: false,
      maxAge: "30d",
      immutable: true
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
