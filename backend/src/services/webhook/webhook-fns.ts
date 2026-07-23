import picomatch from "picomatch";

import { TWebhooks } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory, WebhookTriggeredEvent } from "@app/ee/services/audit-log/audit-log-types";
import { crypto } from "@app/lib/crypto/cryptography";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { safeRequest } from "@app/lib/validator";
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

  const req = await safeRequest.post(url, payload, {
    headers,
    timeout: WEBHOOK_TRIGGER_TIMEOUT,
    signal: AbortSignal.timeout(WEBHOOK_TRIGGER_TIMEOUT)
  });

  return req;
};

export const getWebhookPayload = (event: TWebhookPayloads) => {
  if (event.type === WebhookEvents.SecretModified) {
    const { projectName, projectId, environment, environmentName, secretPath, type, changedBy, changedByActorType } =
      event.payload;

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
                  title: "Environment Name",
                  value: environmentName,
                  short: false
                },
                {
                  title: "Secret Path",
                  value: secretPath,
                  short: false
                },
                {
                  title: "Modified By",
                  value: changedBy,
                  short: false
                },
                {
                  title: "Modified By Actor Type",
                  value: changedByActorType?.toString() || "Unknown Actor Type",
                  short: false
                }
              ]
            }
          ]
        };
      case WebhookType.MICROSOFT_TEAMS:
        return {
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: {
                type: "AdaptiveCard",
                version: "1.2",
                body: [
                  {
                    type: "TextBlock",
                    size: "Medium",
                    weight: "Bolder",
                    text: "A secret value has been added or modified."
                  },
                  {
                    type: "FactSet",
                    facts: [
                      { title: "Project", value: projectName || "" },
                      { title: "Environment", value: environment },
                      { title: "Environment Name", value: environmentName || "" },
                      { title: "Secret Path", value: secretPath || "" },
                      { title: "Modified By", value: changedBy || "" },
                      {
                        title: "Actor Type",
                        value: changedByActorType?.toString() || "Unknown Actor Type"
                      }
                    ]
                  }
                ]
              }
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
            environmentName,
            secretPath,
            changedBy,
            changedByActorType
          }
        };
    }
  }

  if (event.type === WebhookEvents.SecretRotationFailed) {
    const {
      projectName,
      projectId,
      environment,
      environmentName,
      secretPath,
      type,
      rotationName,
      errorMessage,
      triggeredManually
    } = event.payload;

    switch (type) {
      case WebhookType.SLACK:
        return {
          text: "A secret rotation has failed.",
          attachments: [
            {
              color: "#E7F256",
              fields: [
                {
                  title: "Rotation Name",
                  value: rotationName,
                  short: false
                },
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
                  title: "Environment Name",
                  value: environmentName,
                  short: false
                },
                {
                  title: "Secret Path",
                  value: secretPath,
                  short: false
                },
                {
                  title: "Error Message",
                  value: errorMessage,
                  short: false
                },
                {
                  title: "Triggered Manually",
                  value: triggeredManually ? "Yes" : "No",
                  short: false
                }
              ]
            }
          ]
        };
      case WebhookType.MICROSOFT_TEAMS:
        return {
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              contentUrl: null,
              content: {
                type: "AdaptiveCard",
                version: "1.2",
                body: [
                  {
                    type: "TextBlock",
                    size: "Medium",
                    weight: "Bolder",
                    text: "A secret rotation has failed."
                  },
                  {
                    type: "FactSet",
                    facts: [
                      { title: "Rotation Name", value: rotationName || "" },
                      { title: "Project", value: projectName || "" },
                      { title: "Environment", value: environment },
                      { title: "Environment Name", value: environmentName || "" },
                      { title: "Secret Path", value: secretPath || "" },
                      { title: "Error Message", value: errorMessage || "" },
                      { title: "Triggered Manually", value: triggeredManually ? "Yes" : "No" }
                    ]
                  }
                ]
              }
            }
          ]
        };
      case WebhookType.GENERAL:
      default:
        return {
          event: event.type,
          project: {
            projectId,
            projectName,
            environment,
            environmentName,
            secretPath,
            rotationName,
            errorMessage,
            triggeredManually
          }
        };
    }
  }

  if (event.type === WebhookEvents.HoneyTokenTriggered) {
    const {
      honeyTokenName,
      projectName,
      projectId,
      environment,
      environmentName,
      secretPath,
      type,
      eventName,
      sourceIp,
      awsRegion
    } = event.payload;

    switch (type) {
      case WebhookType.SLACK:
        return {
          text: "A honey token has been triggered!",
          attachments: [
            {
              color: "#FF0000",
              fields: [
                {
                  title: "Honey Token",
                  value: honeyTokenName,
                  short: false
                },
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
                  title: "Environment Name",
                  value: environmentName,
                  short: false
                },
                {
                  title: "Secret Path",
                  value: secretPath,
                  short: false
                },
                {
                  title: "AWS Event",
                  value: eventName,
                  short: false
                },
                {
                  title: "Source IP",
                  value: sourceIp || "Unknown",
                  short: false
                },
                {
                  title: "AWS Region",
                  value: awsRegion,
                  short: false
                }
              ]
            }
          ]
        };
      case WebhookType.MICROSOFT_TEAMS:
        return {
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: {
                type: "AdaptiveCard",
                version: "1.2",
                body: [
                  {
                    type: "TextBlock",
                    size: "Medium",
                    weight: "Bolder",
                    text: "A honey token has been triggered!"
                  },
                  {
                    type: "FactSet",
                    facts: [
                      { title: "Honey Token", value: honeyTokenName || "" },
                      { title: "Project", value: projectName || "" },
                      { title: "Environment", value: environment },
                      { title: "Environment Name", value: environmentName || "" },
                      { title: "Secret Path", value: secretPath || "" },
                      { title: "AWS Event", value: eventName || "" },
                      { title: "Source IP", value: sourceIp || "Unknown" },
                      { title: "AWS Region", value: awsRegion || "" }
                    ]
                  }
                ]
              }
            }
          ]
        };
      case WebhookType.GENERAL:
      default:
        return {
          event: event.type,
          project: {
            projectId,
            projectName,
            environment,
            environmentName,
            secretPath
          },
          honeyToken: {
            name: honeyTokenName,
            eventName,
            sourceIp: sourceIp || "Unknown",
            awsRegion
          }
        };
    }
  }

  if (event.type === WebhookEvents.TestEvent) {
    const { projectName, projectId, environment, environmentName, secretPath } = event.payload;
    return {
      event: event.type,
      project: {
        workspaceId: projectId,
        projectId,
        projectName,
        environment,
        environmentName,
        secretPath
      }
    };
  }

  logger.warn({ event }, "Unhandled webhook event");
  return null;
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
  const toBeTriggeredHooks = webhooks.filter(({ secretPath: hookSecretPath, isDisabled, filteredEvents }) => {
    const isEventSubscribed = !filteredEvents || filteredEvents.length === 0 || filteredEvents.includes(event.type);

    return !isDisabled && picomatch.isMatch(secretPath, hookSecretPath, { strictSlashes: false }) && isEventSubscribed;
  });
  if (!toBeTriggeredHooks.length) return;
  logger.info({ environment, secretPath, projectId }, "Secret webhook job started");
  let { projectName } = event.payload;
  if (!projectName) {
    const project = await requestMemoize(requestMemoKeys.projectFindById(event.payload.projectId), () =>
      projectDAL.findById(event.payload.projectId)
    );
    projectName = project.name;
  }
  const { environmentName } = event.payload;

  const webhookRequests = toBeTriggeredHooks
    .map((hook) => {
      const formattedEvent = {
        type: event.type,
        payload: { ...event.payload, type: hook.type, projectName, environmentName }
      } as TWebhookPayloads;
      const payload = getWebhookPayload(formattedEvent);
      if (!payload) return null;
      return { hook, promise: triggerWebhookRequest(hook, secretManagerDecryptor, payload) };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const webhooksTriggered = await Promise.allSettled(
    webhookRequests.map((req) => req.promise)
  );

  const eventPayloads: WebhookTriggeredEvent["metadata"][] = [];
  const successWebhooks: string[] = [];
  const failedWebhooks: { id: string; error: string }[] = [];

  webhooksTriggered.forEach((result, i) => {
    const hook = webhookRequests[i].hook;
    const eventMetadata = {
      webhookId: hook.id,
      type: event.type,
      payload: {
        type: hook.type!,
        ...event.payload,
        projectName
      }
    };

    if (result.status === "rejected") {
      const reason = result.reason as unknown;
      const error = reason instanceof Error ? reason.message : String(reason ?? "Unknown webhook error");
      logger.warn(
        { webhookId: hook.id, projectId, environment, secretPath, err: reason },
        `Webhook delivery failed [webhookId=${hook.id}] [projectId=${projectId}] [environment=${environment}] [secretPath=${secretPath}] [error=${error}]`
      );
      failedWebhooks.push({ id: hook.id, error });
      eventPayloads.push({ ...eventMetadata, status: "failed" } as WebhookTriggeredEvent["metadata"]);
      return;
    }

    successWebhooks.push(hook.id);
    eventPayloads.push({ ...eventMetadata, status: "success" } as WebhookTriggeredEvent["metadata"]);
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
