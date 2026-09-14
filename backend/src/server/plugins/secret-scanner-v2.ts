import type { EmitterWebhookEventName } from "@octokit/webhooks/dist-types/types";
import { PushEvent } from "@octokit/webhooks-types";
import { Probot } from "probot";
import { z } from "zod";

import { TBitbucketPushEvent } from "@app/ee/services/secret-scanning-v2/bitbucket/bitbucket-secret-scanning-types";
import { TGitLabDataSourcePushEventPayload } from "@app/ee/services/secret-scanning-v2/gitlab";
import { GitLabWebHookEvent } from "@app/ee/services/secret-scanning-v2/gitlab/gitlab-secret-scanning-enums";
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

  // bitbucket push event webhook
  server.route({
    method: "POST",
    url: "/bitbucket",
    schema: {
      querystring: z.object({
        dataSourceId: z.string().min(1, { message: "Data Source ID is required" })
      }),
      headers: z
        .object({
          "x-hub-signature": z.string().min(1, { message: "X-Hub-Signature header is required" })
        })
        .passthrough()
    },
    config: {
      rateLimit: writeLimit
    },
    handler: async (req, res) => {
      const { dataSourceId } = req.query;

      // Verify signature
      const signature = req.headers["x-hub-signature"];
      if (!signature) {
        logger.error("Missing X-Hub-Signature header for Bitbucket webhook");
        return res.status(401).send({ message: "Unauthorized: Missing signature" });
      }

      const expectedSignaturePrefix = "sha256=";
      if (!signature.startsWith(expectedSignaturePrefix)) {
        logger.error({ signature }, "Invalid X-Hub-Signature format for Bitbucket webhook");
        return res.status(401).send({ message: "Unauthorized: Invalid signature format" });
      }

      const receivedSignature = signature.substring(expectedSignaturePrefix.length);

      if (!dataSourceId) return res.status(400).send({ message: "Data Source ID is required" });

      await server.services.secretScanningV2.bitbucket.handlePushEvent({
        ...(req.body as TBitbucketPushEvent),
        dataSourceId,
        receivedSignature,
        bodyString: JSON.stringify(req.body)
      });

      return res.send("ok");
    }
  });

  // gitlab push event webhook
  server.route({
    method: "POST",
    url: "/gitlab",
    config: {
      rateLimit: writeLimit
    },
    handler: async (req, res) => {
      const event = req.headers["x-gitlab-event"] as GitLabWebHookEvent;
      const token = req.headers["x-gitlab-token"] as string;
      const dataSourceId = req.headers["x-data-source-id"] as string;

      if (event !== GitLabWebHookEvent.Push) {
        return res.status(400).send({ message: `Event type not supported: ${event as string}` });
      }

      if (!token) {
        return res.status(401).send({ message: "Unauthorized: Missing token" });
      }

      if (!dataSourceId) return res.status(400).send({ message: "Data Source ID header is required" });

      await server.services.secretScanningV2.gitlab.handlePushEvent({
        dataSourceId,
        payload: req.body as TGitLabDataSourcePushEventPayload,
        token
      });

      return res.send("ok");
    }
  });
};
