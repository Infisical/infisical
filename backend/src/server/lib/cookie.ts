import { FastifyReply } from "fastify";

import { getConfig } from "@app/lib/config/env";

export function addAuthOriginDomainCookie(res: FastifyReply) {
  const appCfg = getConfig();

  const siteUrl = appCfg.SITE_URL!;
  let domain: string | undefined;

  if (!siteUrl.includes("localhost")) {
    domain = `.${siteUrl.split("//")[1].split("/")[0]}`;
  }

  void res.setCookie("aod", siteUrl, {
    domain,
    path: "/",
    sameSite: "strict",
    httpOnly: false,
    secure: appCfg.HTTPS_ENABLED
  });
}
