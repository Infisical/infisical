import { FastifyReply } from "fastify";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

export function addAuthOriginDomainCookie(res: FastifyReply) {
  try {
    const appCfg = getConfig();

    const siteUrl = appCfg.SITE_URL!;
    let domain: string | undefined;

    if (!siteUrl.includes("localhost")) {
      const url = new URL(siteUrl);
      domain = `.${url.host}`;
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
