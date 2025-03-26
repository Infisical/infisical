import type { EmitterWebhookEventName } from "@octokit/webhooks/dist-types/types";
import { PushEvent } from "@octokit/webhooks-types";
import { Probot } from "probot";
import SmeeClient from "smee-client";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { writeLimit } from "@app/server/config/rateLimiter";

export const registerSecretScannerGhApp = async (server: FastifyZodProvider) => {
  const probotApp = (app: Probot) => {
    app.on("installation.deleted", async (context) => {
      const { payload } = context;
      const { installation, repositories } = payload;
      await server.services.secretScanning.handleRepoDeleteEvent(
        String(installation.id),
        (repositories || [])?.map(({ id }) => String(id))
      );
    });

    app.on("installation", async (context) => {
      const { payload } = context;
      logger.info({ repositories: payload.repositories }, "Installed secret scanner to");
    });

    app.on("push", async (context) => {
      const { payload } = context;
      await server.services.secretScanning.handleRepoPushEvent(payload as PushEvent);
    });
  };

  const appCfg = getConfig();
  if (appCfg.isSecretScanningConfigured) {
    const probot = new Probot({
      appId: appCfg.SECRET_SCANNING_GIT_APP_ID as string,
      privateKey: appCfg.SECRET_SCANNING_PRIVATE_KEY as string,
      secret: appCfg.SECRET_SCANNING_WEBHOOK_SECRET as string
    });

    if (appCfg.NODE_ENV === "development") {
      const smee = new SmeeClient({
        source: appCfg.SECRET_SCANNING_WEBHOOK_PROXY as string,
        target: "http://backend:4000/ss-webhook",
        logger: console
      });
      smee.start();
    }

    await probot.load(probotApp);

    server.route({
      method: "POST",
      url: "/",
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
  }
};
