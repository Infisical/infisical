import { FastifyReply } from "fastify";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

/**
 * `aod` (Auth Origin Domain) cookie is used to store the origin domain of the application when user was last authenticated.
 *  This is useful for determining the target domain for authentication redirects, especially in cloud deployments.
 *  It is set only in cloud mode to ensure that the cookie is shared across subdomains.
 */
export function addAuthOriginDomainCookie(res: FastifyReply) {
  try {
    const appCfg = getConfig();

    // Only set the cookie if the app is running in cloud mode
    if (!appCfg.isCloud) return;

    const siteUrl = appCfg.SITE_URL!;
    let domain: string;

    const { hostname } = new URL(siteUrl);

    const parts = hostname.split(".");

    if (parts.length >= 2) {
      // For `app.infisical.com` => `.infisical.com`
      domain = `.${parts.slice(-2).join(".")}`;
    } else {
      // If somehow only "example", fallback to itself
      domain = `.${hostname}`;
    }

    void res.setCookie("aod", siteUrl, {
      domain,
      path: "/",
      sameSite: "strict",
      httpOnly: false,
      secure: appCfg.HTTPS_ENABLED
    });
  } catch (error) {
    logger.error(error, "Failed to set auth origin domain cookie");
  }
}
