import { Knex } from "knex";

import {
  TApprovalRequestApprovals,
  TApprovalRequests,
  TSecretApprovalRequestsReviewers,
  TSecretApprovalRequestsSecretsV2,
  TSecretChangeRequests
} from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { triggerWorkflowIntegrationNotification } from "@app/lib/workflow-integrations/trigger-notification";
import { TriggerFeature } from "@app/lib/workflow-integrations/types";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { ChangeRequestWebhookAction, TWebhookActor, WebhookEvents } from "@app/services/webhook/webhook-types";

import { TSecretChangePolicy } from "../secret-change-policy-bridge/secret-change-policy-bridge-types";
import { TSecretChangeRequest } from "./secret-change-request-bridge-types";

type TSecretChangeRequestFnsFactoryDep = {
  userDAL: Pick<TUserDALFactory, "findById" | "find">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectWithOrg">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  projectMicrosoftTeamsConfigDAL: Pick<TProjectMicrosoftTeamsConfigDALFactory, "getIntegrationDetailsByProject">;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "sendNotification">;
  smtpService: Pick<TSmtpService, "sendMail">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  queueService: Pick<TQueueServiceFactory, "queue">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
};

export type TSecretChangeRequester = {
  requesterUserId: string | null;
  machineIdentityId: string | null;
  requesterName: string;
  requesterEmail: string;
};

export type TSecretChangeRequestSideEffectsDTO = {
  approvalRequest: TApprovalRequests;
  secretChangeRequest: TSecretChangeRequests;
  policy: Pick<TSecretChangePolicy, "id" | "name" | "enforcementLevel" | "userApprovers">;
  project: { id: string; name: string; orgId: string };
  commits: { id: string }[];
  environment: string;
  secretPath: string;
  secretKeys: string[];
  actor: ActorType;
  actorId: string;
  actorOrgId: string;
  tx?: Knex;
};

export type TSecretChangeRequestFnsFactory = ReturnType<typeof secretChangeRequestFnsFactory>;

export const toSecretChangeRequest = ({
  approvalRequest,
  secretChangeRequest,
  commits
}: {
  approvalRequest: TApprovalRequests;
  secretChangeRequest: TSecretChangeRequests;
  commits: TSecretApprovalRequestsSecretsV2[];
}): TSecretChangeRequest => ({
  id: approvalRequest.id,
  policyId: approvalRequest.policyId as string,
  status: approvalRequest.status,
  hasMerged: secretChangeRequest.hasMerged,
  conflicts: secretChangeRequest.conflicts ?? null,
  slug: secretChangeRequest.slug,
  folderId: secretChangeRequest.folderId,
  createdAt: approvalRequest.createdAt,
  updatedAt: approvalRequest.updatedAt,
  isReplicated: null,
  committerUserId: approvalRequest.requesterId ?? null,
  committerIdentityId: approvalRequest.machineIdentityId ?? null,
  statusChangedByUserId: secretChangeRequest.statusChangedByUserId ?? null,
  bypassReason: secretChangeRequest.bypassReason ?? null,
  commitMessage: secretChangeRequest.commitMessage ?? null,
  commits
});

export const toSecretChangeRequestReview = (
  approval: TApprovalRequestApprovals,
  requestId: string
): TSecretApprovalRequestsReviewers => {
  const createdAt = approval.createdAt ?? new Date();
  return {
    id: approval.id,
    status: approval.decision,
    requestId,
    reviewerUserId: approval.approverUserId,
    comment: approval.comment ?? null,
    createdAt,
    updatedAt: createdAt // the global system does not use updatedAt. This also does not appear on the UI, so no need to change the db
  };
};

const buildApprovalUrl = (orgId: string, projectId: string, requestId: string) =>
  `${getConfig().SITE_URL}/organizations/${orgId}/projects/secret-management/${projectId}/approval?requestId=${requestId}`;

export const secretChangeRequestFnsFactory = ({
  userDAL,
  identityDAL,
  projectDAL,
  projectEnvDAL,
  kmsService,
  projectSlackConfigDAL,
  projectMicrosoftTeamsConfigDAL,
  microsoftTeamsService,
  smtpService,
  notificationService,
  queueService,
  telemetryService
}: TSecretChangeRequestFnsFactoryDep) => {
  const resolveRequester = async (actor: ActorType, actorId: string, tx?: Knex): Promise<TSecretChangeRequester> => {
    if (actor === ActorType.USER) {
      const user = await userDAL.findById(actorId, tx);
      if (!user) throw new NotFoundError({ message: `Requesting user with ID '${actorId}' not found` });
      return {
        requesterUserId: user.id,
        machineIdentityId: null,
        requesterName: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username,
        requesterEmail: user.email ?? ""
      };
    }

    if (actor === ActorType.IDENTITY) {
      const identity = await identityDAL.findById(actorId, tx);
      if (!identity) throw new NotFoundError({ message: `Requesting machine identity with ID '${actorId}' not found` });
      return {
        requesterUserId: null,
        machineIdentityId: identity.id,
        requesterName: identity.name,
        requesterEmail: ""
      };
    }

    throw new BadRequestError({ message: `Actor type '${actor}' cannot open a secret change request` });
  };

  const $sendApproverNotifications = async ({
    policy,
    requestId,
    projectId,
    tx
  }: Pick<TSecretChangeRequestSideEffectsDTO, "policy" | "tx"> & {
    requestId: string;
    projectId: string;
  }) => {
    const approverUserIds = unique(policy.userApprovers.map((approver) => approver.userId));
    if (!approverUserIds.length) return;

    const approvers = await userDAL.find({ $in: { id: approverUserIds } }, { tx });
    const project = await projectDAL.findProjectWithOrg(projectId);
    const approvalUrl = buildApprovalUrl(project.orgId, project.id, requestId);

    await notificationService.createUserNotifications(
      approvers.map((approver) => ({
        userId: approver.id,
        orgId: project.orgId,
        type: NotificationType.SECRET_CHANGE_REQUEST,
        title: "Secret Change Request",
        body: `You have a new secret change request pending your review for the project **${project.name}** in the organization **${project.organization.name}**.`,
        link: `/organizations/${project.orgId}/projects/secret-management/${project.id}/approval?requestId=${requestId}`
      }))
    );

    for await (const approver of approvers) {
      if (!approver.email) continue;
      await smtpService.sendMail({
        recipients: [approver.email],
        subjectLine: "Infisical Secret Change Request",
        substitutions: {
          firstName: approver.firstName,
          projectName: project.name,
          organizationName: project.organization.name,
          approvalUrl
        },
        template: SmtpTemplates.SecretApprovalRequestNeedsReview
      });
    }
  };

  const queueChangeRequestWebhook = async ({
    action,
    approvalRequest,
    secretChangeRequest,
    policy,
    project,
    environment,
    environmentName,
    secretPath
  }: Pick<
    TSecretChangeRequestSideEffectsDTO,
    "approvalRequest" | "secretChangeRequest" | "policy" | "project" | "environment" | "secretPath"
  > & { action: ChangeRequestWebhookAction; environmentName: string }) => {
    const requestedBy: TWebhookActor | null = approvalRequest.requesterId
      ? {
          type: ActorType.USER,
          id: approvalRequest.requesterId,
          name: approvalRequest.requesterName || "Unknown",
          email: approvalRequest.requesterEmail || null
        }
      : null;

    await queueService.queue(
      QueueName.SecretWebhook,
      QueueJobs.SecWebhook,
      {
        type: WebhookEvents.ChangeRequestModified,
        payload: {
          projectId: project.id,
          projectName: project.name,
          environment,
          environmentName,
          secretPath,
          action,
          request: {
            id: approvalRequest.id,
            slug: secretChangeRequest.slug,
            url: buildApprovalUrl(project.orgId, project.id, approvalRequest.id),
            status: approvalRequest.status,
            hasMerged: secretChangeRequest.hasMerged,
            isBypassed: Boolean(secretChangeRequest.bypassReason),
            policy: { id: policy.id, name: policy.name, enforcementLevel: policy.enforcementLevel },
            requestedBy,
            createdAt: approvalRequest.createdAt.toISOString(),
            updatedAt: approvalRequest.updatedAt.toISOString()
          }
        }
      },
      {
        jobId: `change-request-webhook-${approvalRequest.id}-${alphaNumericNanoId(6)}`,
        removeOnFail: { count: 5 },
        removeOnComplete: true,
        delay: 1000,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 }
      }
    );
  };

  const runSecretChangeRequestSideEffects = async ({
    approvalRequest,
    secretChangeRequest,
    policy,
    project,
    commits,
    environment,
    secretPath,
    secretKeys,
    actor,
    actorId,
    actorOrgId,
    tx
  }: TSecretChangeRequestSideEffectsDTO) => {
    const findUser = () => userDAL.findById(actorId, tx);
    const user =
      actor === ActorType.IDENTITY
        ? undefined
        : await (tx ? findUser() : requestMemoize(requestMemoKeys.userFindById(actorId), findUser));
    const env = await projectEnvDAL.findOne({ slug: environment, projectId: project.id }, tx);

    await triggerWorkflowIntegrationNotification({
      input: {
        projectId: project.id,
        notification: {
          type: TriggerFeature.SECRET_APPROVAL,
          payload: {
            machineIdentityId: actor === ActorType.IDENTITY ? actorId : undefined,
            userEmail: user?.email ?? undefined,
            environment: env.name,
            secretPath,
            projectId: project.id,
            projectName: project.name,
            requestId: approvalRequest.id,
            secretKeys,
            approvalUrl: buildApprovalUrl(actorOrgId, project.id, approvalRequest.id)
          }
        }
      },
      dependencies: {
        projectDAL,
        kmsService,
        projectSlackConfigDAL,
        microsoftTeamsService,
        projectMicrosoftTeamsConfigDAL
      }
    });

    await $sendApproverNotifications({ policy, requestId: approvalRequest.id, projectId: project.id, tx });

    try {
      await queueChangeRequestWebhook({
        action: ChangeRequestWebhookAction.Created,
        approvalRequest,
        secretChangeRequest,
        policy,
        project,
        environment,
        environmentName: env.name,
        secretPath
      });
    } catch (error) {
      if (tx) throw error;

      logger.error(
        error,
        `Failed to queue change request webhook [requestId=${approvalRequest.id}] [action=${ChangeRequestWebhookAction.Created}]`
      );
    }

    void telemetryService
      .sendPostHogEvents({
        event: PostHogEventTypes.SecretApprovalRequestSubmitted,
        distinctId: user?.username ?? user?.email ?? actorId,
        organizationId: actorOrgId,
        properties: {
          requestId: approvalRequest.id,
          policyId: policy.id,
          projectId: project.id,
          environment,
          secretPath,
          numberOfCommits: commits.length,
          actorType: actor as string
        }
      })
      .catch(() => {});
  };

  return { resolveRequester, queueChangeRequestWebhook, runSecretChangeRequestSideEffects };
};
