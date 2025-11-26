import path from "node:path";

import staticServe from "@fastify/static";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig, IS_PACKAGED } from "@app/lib/config/env";
import { applyJitter } from "@app/lib/dates";
import { delay } from "@app/lib/delay";

// to enabled this u need to set standalone mode to true
export const registerServeUI = async (
  server: FastifyZodProvider,
  {
    standaloneMode,
    dir,
    keyStore
  }: {
    standaloneMode?: boolean;
    dir: string;
    keyStore: Pick<TKeyStoreFactory, "getItem">;
  }
) => {
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
      const appCfg = getConfig();
      void res.type("application/javascript");
      const config = {
        CAPTCHA_SITE_KEY: appCfg.CAPTCHA_SITE_KEY,
        POSTHOG_API_KEY: appCfg.POSTHOG_PROJECT_API_KEY,
        INTERCOM_ID: appCfg.INTERCOM_ID,
        TELEMETRY_CAPTURING_ENABLED: appCfg.TELEMETRY_ENABLED
      };
      const js = `window.__INFISICAL_RUNTIME_ENV__ = Object.freeze(${JSON.stringify(config)});`;
      return res.send(js);
    }
  });

  if (standaloneMode) {
    const frontendName = IS_PACKAGED ? "frontend" : "frontend-build";
    const frontendPath = path.join(dir, frontendName);
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
      handler: async (request, reply) => {
        if (request.url.startsWith("/api")) {
          reply.callNotFound();
          return;
        }

        // all the assets available will be served from the top static serve middleware
        // if a request is reaching here this only happens due to version skew that happens on deployment
        if (request.url.startsWith("/assets") && (request.url.endsWith(".js") || request.url.endsWith(".css"))) {
          const infisicalVersion = await keyStore.getItem(KeyStorePrefixes.InfisicalVersion);
          const appCfg = getConfig();
          if (
            infisicalVersion &&
            appCfg.INFISICAL_PLATFORM_VERSION &&
            appCfg.SITE_URL &&
            infisicalVersion !== appCfg.INFISICAL_PLATFORM_VERSION
          ) {
            // this means version skew is happening and container version is old
            // we wait for 5 second with jitter and then redirect to load balancer again to serve the correct one
            await delay(applyJitter(5000, 2000));
            const redirectUrl = new URL(appCfg.SITE_URL);
            redirectUrl.pathname = request.raw.url || "/";
            return reply.redirect(redirectUrl.toString());
          }

          reply.callNotFound();
          return;
        }

        return reply.sendFile("index.html", {
          immutable: false,
          maxAge: 0,
          lastModified: false,
          etag: false
        });
      }
    });
  }
};
