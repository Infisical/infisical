import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TGenericPermission } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { fetchSlackChannels } from "@app/services/slack/slack-fns";
import { TSlackIntegrationDALFactory } from "@app/services/slack/slack-integration-dal";
import { WorkflowIntegration } from "@app/services/workflow-integration/workflow-integration-types";

import { resolveAlertProjectId, TAlertProviderRegistry } from "./alert-provider-registry";
import { AlertPermissionAction, toAlertActor } from "./alert-types";

type TAlertSlackAppServiceFactoryDep = {
  alertProviderRegistry: TAlertProviderRegistry;
  slackIntegrationDAL: Pick<
    TSlackIntegrationDALFactory,
    "findByIdWithWorkflowIntegrationDetails" | "findWithWorkflowIntegrationDetails"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TAlertSlackAppServiceFactory = ReturnType<typeof alertSlackAppServiceFactory>;

type TAlertScopeDTO = TGenericPermission & {
  resourceType: string;
  resourceId?: string | null;
  projectId?: string | null;
};

// Alert editors may list integrations and channels (names and IDs only) without org Settings read.
export const alertSlackAppServiceFactory = ({
  alertProviderRegistry,
  slackIntegrationDAL,
  kmsService
}: TAlertSlackAppServiceFactoryDep) => {
  const $assertCanConfigureAlerts = async (dto: TAlertScopeDTO) => {
    const provider = alertProviderRegistry.get(dto.resourceType);
    if (!provider) {
      throw new BadRequestError({ message: `No alert provider is registered for resource type '${dto.resourceType}'` });
    }

    const projectId = await resolveAlertProjectId(provider, {
      orgId: dto.actorOrgId,
      projectId: dto.projectId,
      resourceId: dto.resourceId
    });
    const check = (action: AlertPermissionAction) =>
      provider.assertPermission({
        action,
        orgId: dto.actorOrgId,
        projectId,
        resourceId: dto.resourceId,
        actor: toAlertActor(dto)
      });

    try {
      await check(AlertPermissionAction.Create);
    } catch {
      await check(AlertPermissionAction.Edit);
    }
    await provider.assertResourceInScope({ orgId: dto.actorOrgId, projectId, resourceId: dto.resourceId });
  };

  const listSlackIntegrations = async (dto: TAlertScopeDTO) => {
    await $assertCanConfigureAlerts(dto);

    const slackIntegrations = await slackIntegrationDAL.findWithWorkflowIntegrationDetails({
      orgId: dto.actorOrgId,
      integration: WorkflowIntegration.SLACK
    });

    return slackIntegrations.map((slackIntegration) => ({
      id: slackIntegration.id,
      slug: slackIntegration.slug,
      description: slackIntegration.description ?? null,
      teamName: slackIntegration.teamName
    }));
  };

  const listSlackChannels = async (dto: TAlertScopeDTO & { workflowIntegrationId: string }) => {
    await $assertCanConfigureAlerts(dto);

    const slackIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(
      dto.workflowIntegrationId
    );
    if (!slackIntegration || slackIntegration.orgId !== dto.actorOrgId) {
      throw new NotFoundError({ message: `Slack integration with ID '${dto.workflowIntegrationId}' not found` });
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: slackIntegration.orgId
    });
    const botToken = decryptor({ cipherTextBlob: slackIntegration.encryptedBotAccessToken }).toString("utf8");

    try {
      return await fetchSlackChannels(botToken);
    } catch {
      throw new BadRequestError({
        message: `Could not list channels for Slack integration '${slackIntegration.slug}'. Reconnect it under Integrations > Workflow Integrations in your organization if this keeps happening.`
      });
    }
  };

  return { listSlackIntegrations, listSlackChannels };
};
