import { AxiosError } from "axios";
import picomatch from "picomatch";

import { TWebhooks } from "@app/db/schemas/webhooks";
import { EventType, TAuditLogServiceFactory, WebhookTriggeredEvent } from "@app/ee/services/audit-log/audit-log-types";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto/cryptography";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import { TProjectDALFactory } from "../project/project-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TWebhookDALFactory } from "./webhook-dal";
import { TWebhookPayloads, WebhookEvents, WebhookType } from "./webhook-types";

const WEBHOOK_TRIGGER_TIMEOUT = 15 * 1000;

export const decryptWebhookDetails = (webhook: TWebhooks, decryptor: (value: Buffer) => string) => {
  const { encryptedPassKey, encryptedUrl } = webhook;

  const decryptedUrl = decryptor(encryptedUrl);

  let decryptedSecretKey = "";
  if (encryptedPassKey) {
    decryptedSecretKey = decryptor(encryptedPassKey);
  }

  return {
    secretKey: decryptedSecretKey,
    url: decryptedUrl
  };
};

export const triggerWebhookRequest = async (
  webhook: TWebhooks,
  decryptor: (value: Buffer) => string,
  data: Record<string, unknown>
) => {
  const headers: Record<string, string> = {};
  const payload = { ...data, timestamp: Date.now() };
  const { secretKey, url } = decryptWebhookDetails(webhook, decryptor);
  if (secretKey) {
    const webhookSign = crypto.nativeCrypto
      .createHmac("sha256", secretKey)
      .update(JSON.stringify(payload))
      .digest("hex");
    headers["x-infisical-signature"] = `t=${payload.timestamp};${webhookSign}`;
  }

  const req = await request.post(url, payload, {
    headers,
    timeout: WEBHOOK_TRIGGER_TIMEOUT,
    signal: AbortSignal.timeout(WEBHOOK_TRIGGER_TIMEOUT)
  });

  return req;
};

export const getWebhookPayload = (event: TWebhookPayloads) => {
  if (event.type === WebhookEvents.SecretModified) {
    const { projectName, projectId, environment, secretPath, type } = event.payload;

    switch (type) {
      case WebhookType.SLACK:
        return {
          text: "A secret value has been added or modified.",
          attachments: [
            {
              color: "#E7F256",
              fields: [
                {
                  title: "Project",
                  value: projectName,
                  short: false
                },
                {
                  title: "Environment",
                  value: environment,
                  short: false
                },
                {
                  title: "Secret Path",
                  value: secretPath,
                  short: false
                }
              ]
            }
          ]
        };
      case WebhookType.GENERAL:
      default:
        return {
          event: event.type,
          project: {
            workspaceId: projectId,
            projectId,
            projectName,
            environment,
            secretPath
          }
        };
    }
  }

  const { projectName, projectId, environment, secretPath, type, reminderNote, secretName } = event.payload;

  switch (type) {
    case WebhookType.SLACK:
      return {
        text: "You have a secret reminder",
        attachments: [
          {
            color: "#E7F256",
            fields: [
              {
                title: "Project",
                value: projectName,
                short: false
              },
              {
                title: "Environment",
                value: environment,
                short: false
              },
              {
                title: "Secret Path",
                value: secretPath,
                short: false
              },
              {
                title: "Secret Name",
                value: secretName,
                short: false
              },
              {
                title: "Reminder Note",
                value: reminderNote,
                short: false
              }
            ]
          }
        ]
      };
    case WebhookType.GENERAL:
    default:
      return {
        event: event.type,
        project: {
          workspaceId: projectId,
          projectId,
          projectName,
          environment,
          secretPath,
          secretName,
          reminderNote
        }
      };
  }
};

export type TFnTriggerWebhookDTO = {
  projectId: string;
  secretPath: string;
  environment: string;
  event: TWebhookPayloads;
  webhookDAL: Pick<TWebhookDALFactory, "findAllWebhooks" | "transaction" | "update" | "bulkUpdate">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  secretManagerDecryptor: (value: Buffer) => string;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

// this is reusable function
// used in secret queue to trigger webhook and update status when secrets changes
export const fnTriggerWebhook = async ({
  environment,
  secretPath,
  projectId,
  webhookDAL,
  projectEnvDAL,
  event,
  secretManagerDecryptor,
  projectDAL,
  auditLogService
}: TFnTriggerWebhookDTO) => {
  const webhooks = await webhookDAL.findAllWebhooks(projectId, environment);
  const toBeTriggeredHooks = webhooks.filter(
    ({ secretPath: hookSecretPath, isDisabled }) =>
      !isDisabled && picomatch.isMatch(secretPath, hookSecretPath, { strictSlashes: false })
  );
  if (!toBeTriggeredHooks.length) return;
  logger.info({ environment, secretPath, projectId }, "Secret webhook job started");
  let { projectName } = event.payload;
  if (!projectName) {
    const project = await projectDAL.findById(event.payload.projectId);
    projectName = project.name;
  }

  const webhooksTriggered = await Promise.allSettled(
    toBeTriggeredHooks.map((hook) => {
      const formattedEvent = {
        type: event.type,
        payload: { ...event.payload, type: hook.type, projectName }
      } as TWebhookPayloads;
      return triggerWebhookRequest(hook, secretManagerDecryptor, getWebhookPayload(formattedEvent));
    })
  );

  const eventPayloads: WebhookTriggeredEvent["metadata"][] = [];
  // filter hooks by status
  const successWebhooks = webhooksTriggered
    .filter(({ status }) => status === "fulfilled")
    .map((_, i) => {
      eventPayloads.push({
        webhookId: toBeTriggeredHooks[i].id,
        type: event.type,
        payload: {
          type: toBeTriggeredHooks[i].type!,
          ...event.payload,
          projectName
        },
        status: "success"
      } as WebhookTriggeredEvent["metadata"]);

      return toBeTriggeredHooks[i].id;
    });
  const failedWebhooks = webhooksTriggered
    .filter(({ status }) => status === "rejected")
    .map((data, i) => {
      eventPayloads.push({
        webhookId: toBeTriggeredHooks[i].id,
        type: event.type,
        payload: {
          type: toBeTriggeredHooks[i].type!,
          ...event.payload,
          projectName
        },
        status: "failed"
      } as WebhookTriggeredEvent["metadata"]);

      return {
        id: toBeTriggeredHooks[i].id,
        error: data.status === "rejected" ? (data.reason as AxiosError).message : ""
      };
    });

  await webhookDAL.transaction(async (tx) => {
    const env = await projectEnvDAL.findOne({ projectId, slug: environment }, tx);
    if (!env) {
      throw new NotFoundError({
        message: `Environment with slug '${environment}' in project with ID '${projectId}' not found`
      });
    }
    if (successWebhooks.length) {
      await webhookDAL.update(
        { envId: env.id, $in: { id: successWebhooks } },
        { lastStatus: "success", lastRunErrorMessage: null },
        tx
      );
    }
    if (failedWebhooks.length) {
      await webhookDAL.bulkUpdate(
        failedWebhooks.map(({ id, error }) => ({
          id,
          lastRunErrorMessage: error,
          lastStatus: "failed"
        })),
        tx
      );
    }
  });

  for (const eventPayload of eventPayloads) {
    // eslint-disable-next-line no-await-in-loop
    await auditLogService.createAuditLog({
      actor: {
        type: ActorType.PLATFORM,
        metadata: {}
      },
      projectId,
      event: {
        type: EventType.WEBHOOK_TRIGGERED,
        metadata: eventPayload
      }
    });
  }

  logger.info({ environment, secretPath, projectId }, "Secret webhook job ended");
};
