import type { EmitterWebhookEventName } from "@octokit/webhooks/dist-types/types";
import { PushEvent } from "@octokit/webhooks-types";
import { Probot } from "probot";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { writeLimit } from "@app/server/config/rateLimiter";

export const registerSecretScanningV2Webhooks = async (server: FastifyZodProvider) => {
  const probotApp = (app: Probot) => {
    app.on("installation.deleted", async (context) => {
      const { payload } = context;
      const { installation } = payload;

      await server.services.secretScanningV2.github.handleInstallationDeletedEvent(installation.id);
    });

    app.on("installation", async (context) => {
      const { payload } = context;
      logger.info({ repositories: payload.repositories }, "Installed secret scanner to");
    });

    app.on("push", async (context) => {
      const { payload } = context;
      await server.services.secretScanningV2.github.handlePushEvent(payload as PushEvent);
    });
  };

  const appCfg = getConfig();

  if (!appCfg.isSecretScanningV2Configured) {
    logger.info("Secret Scanning V2 is not configured. Skipping registration of secret scanning v2 webhooks.");
    return;
  }

  const probot = new Probot({
    appId: appCfg.INF_APP_CONNECTION_GITHUB_RADAR_APP_ID as string,
    privateKey: appCfg.INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY as string,
    secret: appCfg.INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET as string
  });

  await probot.load(probotApp);

  // github push event webhook
  server.route({
    method: "POST",
    url: "/github",
    config: {
      rateLimit: writeLimit
    },
    handler: async (req, res) => {
      const eventName = req.headers["x-github-event"] as EmitterWebhookEventName;
      const signatureSHA256 = req.headers["x-hub-signature-256"] as string;
      const id = req.headers["x-github-delivery"] as string;

      await probot.webhooks.verifyAndReceive({
        id,
        name: eventName,
        payload: JSON.stringify(req.body),
        signature: signatureSHA256
      });

      return res.send("ok");
    }
  });
};
