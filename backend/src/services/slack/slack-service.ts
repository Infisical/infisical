import { ForbiddenError } from "@casl/ability";
import { InstallProvider, InstallProviderOptions } from "@slack/oauth";

import { OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { getServerCfg } from "../super-admin/super-admin-service";
import { TWorkflowIntegrationDALFactory } from "../workflow-integration/workflow-integration-dal";
import { WorkflowIntegration } from "../workflow-integration/workflow-integration-types";
import { SLACK_GOV_BASE_URL } from "./slack-constants";
import { fetchSlackChannels } from "./slack-fns";
import { TSlackIntegrationDALFactory } from "./slack-integration-dal";
import {
  TCompleteSlackIntegrationDTO,
  TDeleteSlackIntegrationDTO,
  TGetReinstallUrlDTO,
  TGetSlackInstallUrlDTO,
  TGetSlackIntegrationByIdDTO,
  TGetSlackIntegrationByOrgDTO,
  TGetSlackIntegrationChannelsDTO,
  TReinstallSlackIntegrationDTO,
  TUpdateSlackIntegrationDTO
} from "./slack-types";

type TSlackServiceFactoryDep = {
  slackIntegrationDAL: Pick<
    TSlackIntegrationDALFactory,
    | "deleteById"
    | "updateById"
    | "create"
    | "findByIdWithWorkflowIntegrationDetails"
    | "findWithWorkflowIntegrationDetails"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "encryptWithRootKey" | "decryptWithRootKey">;
  workflowIntegrationDAL: Pick<TWorkflowIntegrationDALFactory, "transaction" | "create" | "updateById" | "deleteById">;
};

export type TSlackServiceFactory = ReturnType<typeof slackServiceFactory>;

export const slackServiceFactory = ({
  permissionService,
  slackIntegrationDAL,
  kmsService,
  workflowIntegrationDAL
}: TSlackServiceFactoryDep) => {
  const completeSlackIntegration = async ({
    orgId,
    slug,
    description,
    teamId,
    teamName,
    slackUserId,
    slackAppId,
    botAccessToken,
    slackBotId,
    slackBotUserId,
    isGovSlack = false
  }: TCompleteSlackIntegrationDTO) => {
    const { encryptor: orgDataKeyEncryptor } = await kmsService.createCipherPairWithDataKey({
      orgId,
      type: KmsDataKey.Organization
    });

    const { cipherTextBlob: encryptedBotAccessToken } = orgDataKeyEncryptor({
      plainText: Buffer.from(botAccessToken, "utf8")
    });

    await workflowIntegrationDAL.transaction(async (tx) => {
      const workflowIntegration = await workflowIntegrationDAL.create(
        {
          description,
          orgId,
          slug,
          integration: WorkflowIntegration.SLACK
        },
        tx
      );

      await slackIntegrationDAL.create(
        {
          // @ts-expect-error id is kept as fixed because it is always equal to the workflow integration ID
          id: workflowIntegration.id,
          teamId,
          teamName,
          slackUserId,
          slackAppId,
          slackBotId,
          slackBotUserId,
          encryptedBotAccessToken,
          isGovSlack
        },
        tx
      );
    });
  };

  const reinstallSlackIntegration = async ({
    id,
    teamId,
    teamName,
    slackUserId,
    slackAppId,
    botAccessToken,
    slackBotId,
    slackBotUserId
  }: TReinstallSlackIntegrationDTO) => {
    const slackIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(id);

    if (!slackIntegration) {
      throw new NotFoundError({
        message: `Slack integration with ID ${id} not found`
      });
    }

    const { encryptor: orgDataKeyEncryptor } = await kmsService.createCipherPairWithDataKey({
      orgId: slackIntegration.orgId,
      type: KmsDataKey.Organization
    });

    const { cipherTextBlob: encryptedBotAccessToken } = orgDataKeyEncryptor({
      plainText: Buffer.from(botAccessToken, "utf8")
    });

    await slackIntegrationDAL.updateById(id, {
      teamId,
      teamName,
      slackUserId,
      slackAppId,
      slackBotId,
      slackBotUserId,
      encryptedBotAccessToken
    });
  };

  const getSlackInstaller = async (isGovSlack = false) => {
    const appCfg = getConfig();
    const serverCfg = await getServerCfg();

    let slackClientId = "";
    let slackClientSecret = "";

    const decrypt = kmsService.decryptWithRootKey();

    if (isGovSlack) {
      slackClientId = appCfg.WORKFLOW_GOV_SLACK_CLIENT_ID as string;
      slackClientSecret = appCfg.WORKFLOW_GOV_SLACK_CLIENT_SECRET as string;

      if (serverCfg.encryptedGovSlackClientId) {
        slackClientId = decrypt(Buffer.from(serverCfg.encryptedGovSlackClientId)).toString();
      }

      if (serverCfg.encryptedGovSlackClientSecret) {
        slackClientSecret = decrypt(Buffer.from(serverCfg.encryptedGovSlackClientSecret)).toString();
      }
    } else {
      slackClientId = appCfg.WORKFLOW_SLACK_CLIENT_ID as string;
      slackClientSecret = appCfg.WORKFLOW_SLACK_CLIENT_SECRET as string;

      if (serverCfg.encryptedSlackClientId) {
        slackClientId = decrypt(Buffer.from(serverCfg.encryptedSlackClientId)).toString();
      }

      if (serverCfg.encryptedSlackClientSecret) {
        slackClientSecret = decrypt(Buffer.from(serverCfg.encryptedSlackClientSecret)).toString();
      }
    }
    if (!slackClientId || !slackClientSecret) {
      throw new BadRequestError({
        message: `Invalid ${isGovSlack ? "GovSlack" : "Slack"} configuration. ${
          appCfg.isCloud
            ? "Please contact the Infisical team."
            : `Contact your instance admin to setup Slack integration in the Admin settings. Your configuration is missing ${isGovSlack ? "GovSlack" : "Slack"} client ID and secret.`
        }`
      });
    }

    const installProviderOptions: InstallProviderOptions = {
      clientId: slackClientId,
      clientSecret: slackClientSecret,
      stateSecret: appCfg.AUTH_SECRET,
      legacyStateVerification: true,
      installationStore: {
        storeInstallation: async (installation) => {
          if (installation.isEnterpriseInstall && installation.enterprise?.id) {
            throw new BadRequestError({
              message: "Enterprise not yet supported"
            });
          }

          const metadata = JSON.parse(installation.metadata || "") as {
            id?: string;
            orgId: string;
            slug: string;
            description?: string;
            isGovSlack?: boolean;
          };

          if (metadata.id) {
            return reinstallSlackIntegration({
              id: metadata.id,
              teamId: installation.team?.id || "",
              teamName: installation.team?.name || "",
              slackUserId: installation.user.id,
              slackAppId: installation.appId || "",
              botAccessToken: installation.bot?.token || "",
              slackBotId: installation.bot?.id || "",
              slackBotUserId: installation.bot?.userId || ""
            });
          }

          return completeSlackIntegration({
            orgId: metadata.orgId,
            slug: metadata.slug,
            description: metadata.description,
            teamId: installation.team?.id || "",
            teamName: installation.team?.name || "",
            slackUserId: installation.user.id,
            slackAppId: installation.appId || "",
            botAccessToken: installation.bot?.token || "",
            slackBotId: installation.bot?.id || "",
            slackBotUserId: installation.bot?.userId || "",
            isGovSlack: metadata.isGovSlack
          });
        },
        // for our use-case we don't need to implement this because this will only be used
        // when listening for events from slack
        fetchInstallation: () => {
          return {} as never;
        },
        // for our use-case we don't need to implement this yet
        deleteInstallation: () => {
          return {} as never;
        }
      }
    };

    if (isGovSlack) {
      installProviderOptions.authorizationUrl = `${SLACK_GOV_BASE_URL}/oauth/v2/authorize`;
      installProviderOptions.clientOptions = {
        slackApiUrl: `${SLACK_GOV_BASE_URL}/api`
      };
    }

    return new InstallProvider(installProviderOptions);
  };

  const getInstallUrl = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    slug,
    description,
    isGovSlack = false
  }: TGetSlackInstallUrlDTO) => {
    const appCfg = getConfig();

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const installer = await getSlackInstaller(isGovSlack);
    const url = await installer.generateInstallUrl({
      scopes: ["chat:write.public", "chat:write", "channels:read", "groups:read"],
      metadata: JSON.stringify({
        slug,
        description,
        orgId: actorOrgId,
        isGovSlack
      }),
      redirectUri: `${appCfg.SITE_URL}/api/v1/workflow-integrations/slack/oauth_redirect${isGovSlack ? "_gov" : ""}`
    });

    return url;
  };

  const getReinstallUrl = async ({ actorId, actor, actorOrgId, actorAuthMethod, id }: TGetReinstallUrlDTO) => {
    const appCfg = getConfig();
    const slackIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(id);

    if (!slackIntegration) {
      throw new NotFoundError({
        message: `Slack integration with ID ${id} not found`
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: slackIntegration.orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const installer = await getSlackInstaller(slackIntegration.isGovSlack);
    const url = await installer.generateInstallUrl({
      scopes: ["chat:write.public", "chat:write", "channels:read", "groups:read"],
      metadata: JSON.stringify({
        id,
        orgId: slackIntegration.orgId,
        isGovSlack: slackIntegration.isGovSlack
      }),
      redirectUri: `${appCfg.SITE_URL}/api/v1/workflow-integrations/slack/oauth_redirect${slackIntegration.isGovSlack ? "_gov" : ""}`
    });

    return url;
  };

  const getSlackIntegrationsByOrg = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod
  }: TGetSlackIntegrationByOrgDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const slackIntegrations = await slackIntegrationDAL.findWithWorkflowIntegrationDetails({
      orgId: actorOrgId
    });

    return slackIntegrations;
  };

  const getSlackIntegrationById = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id
  }: TGetSlackIntegrationByIdDTO) => {
    const slackIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(id);
    if (!slackIntegration) {
      throw new NotFoundError({
        message: "Slack integration not found."
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: slackIntegration.orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    return slackIntegration;
  };

  const getSlackIntegrationChannels = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id
  }: TGetSlackIntegrationChannelsDTO) => {
    const slackIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(id);
    if (!slackIntegration) {
      throw new NotFoundError({
        message: `Slack integration with ID ${id} not found`
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: slackIntegration.orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
      orgId: slackIntegration.orgId,
      type: KmsDataKey.Organization
    });

    const botKey = orgDataKeyDecryptor({
      cipherTextBlob: slackIntegration.encryptedBotAccessToken
    }).toString("utf8");

    return fetchSlackChannels(botKey, slackIntegration.isGovSlack);
  };

  const updateSlackIntegration = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id,
    slug,
    description
  }: TUpdateSlackIntegrationDTO) => {
    const slackIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(id);
    if (!slackIntegration) {
      throw new NotFoundError({
        message: `Slack integration with ID ${id} not found`
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: slackIntegration.orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    return workflowIntegrationDAL.transaction(async (tx) => {
      await workflowIntegrationDAL.updateById(
        slackIntegration.id,
        {
          slug,
          description
        },
        tx
      );

      const updatedIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(
        slackIntegration.id,
        tx
      );

      return updatedIntegration!;
    });
  };

  const deleteSlackIntegration = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id
  }: TDeleteSlackIntegrationDTO) => {
    const slackIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(id);
    if (!slackIntegration) {
      throw new NotFoundError({
        message: `Slack integration with ID ${id} not found`
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: slackIntegration.orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Settings);

    await workflowIntegrationDAL.deleteById(id);

    return slackIntegration;
  };

  return {
    getInstallUrl,
    getReinstallUrl,
    getSlackIntegrationsByOrg,
    getSlackIntegrationById,
    completeSlackIntegration,
    getSlackInstaller,
    updateSlackIntegration,
    deleteSlackIntegration,
    getSlackIntegrationChannels
  };
};
