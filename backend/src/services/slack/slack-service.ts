import { ForbiddenError } from "@casl/ability";
import { InstallProvider } from "@slack/oauth";

import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TAdminSlackConfigDALFactory } from "./admin-slack-config-dal";
import { fetchSlackChannels, getAdminSlackCredentials } from "./slack-fns";
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
  slackIntegrationDAL: Pick<TSlackIntegrationDALFactory, "find" | "findById" | "deleteById" | "updateById" | "create">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "encryptWithRootKey" | "decryptWithRootKey">;
  adminSlackConfigDAL: Pick<TAdminSlackConfigDALFactory, "findById">;
};

export type TSlackServiceFactory = ReturnType<typeof slackServiceFactory>;

export const slackServiceFactory = ({
  permissionService,
  slackIntegrationDAL,
  kmsService,
  adminSlackConfigDAL
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
    slackBotUserId
  }: TCompleteSlackIntegrationDTO) => {
    const { encryptor: orgDataKeyEncryptor } = await kmsService.createCipherPairWithDataKey({
      orgId,
      type: KmsDataKey.Organization
    });

    const { cipherTextBlob: encryptedBotAccessToken } = orgDataKeyEncryptor({
      plainText: Buffer.from(botAccessToken, "utf8")
    });

    await slackIntegrationDAL.create({
      orgId,
      slug,
      description,
      teamId,
      teamName,
      slackUserId,
      slackAppId,
      slackBotId,
      slackBotUserId,
      encryptedBotAccessToken
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
    const slackIntegration = await slackIntegrationDAL.findById(id);

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

  const getSlackInstaller = async () => {
    const appCfg = getConfig();
    const adminSlackCredentials = await getAdminSlackCredentials({
      kmsService,
      adminSlackConfigDAL
    });

    let slackClientId = "";
    let slackClientSecret = "";

    if (adminSlackCredentials.clientId && adminSlackCredentials.clientSecret) {
      slackClientId = adminSlackCredentials.clientId;
      slackClientSecret = adminSlackCredentials.clientSecret;
    } else {
      slackClientId = appCfg.SLACK_CLIENT_ID as string;
      slackClientSecret = appCfg.SLACK_CLIENT_SECRET as string;
    }

    if (!slackClientId || !slackClientSecret) {
      throw new BadRequestError({
        message: `Invalid Slack configuration. ${
          appCfg.isCloud
            ? "Please contact the Infisical team."
            : "Contact your instance admin to setup Slack integration in the Admin settings."
        }`
      });
    }

    return new InstallProvider({
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
            slackBotUserId: installation.bot?.userId || ""
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
    });
  };

  const getInstallUrl = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    slug,
    description
  }: TGetSlackInstallUrlDTO) => {
    const appCfg = getConfig();

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const installer = await getSlackInstaller();
    const url = await installer.generateInstallUrl({
      scopes: ["chat:write.public", "chat:write", "channels:read", "groups:read", "im:read", "mpim:read"],
      metadata: JSON.stringify({
        slug,
        description,
        orgId: actorOrgId
      }),
      redirectUri: `${appCfg.SITE_URL}/api/v1/workflow-integrations/slack/oauth_redirect`
    });

    return url;
  };

  const getReinstallUrl = async ({ actorId, actor, actorOrgId, actorAuthMethod, id }: TGetReinstallUrlDTO) => {
    const appCfg = getConfig();
    const slackIntegration = await slackIntegrationDAL.findById(id);

    if (!slackIntegration) {
      throw new NotFoundError({
        message: "Slack integration not found"
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      slackIntegration.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const installer = await getSlackInstaller();
    const url = await installer.generateInstallUrl({
      scopes: ["chat:write.public", "chat:write", "channels:read", "groups:read", "im:read", "mpim:read"],
      metadata: JSON.stringify({
        id,
        orgId: slackIntegration.orgId
      }),
      redirectUri: `${appCfg.SITE_URL}/api/v1/workflow-integrations/slack/oauth_redirect`
    });

    return url;
  };

  const getSlackIntegrationsByOrg = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod
  }: TGetSlackIntegrationByOrgDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const slackIntegrations = await slackIntegrationDAL.find({
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
    const slackIntegration = await slackIntegrationDAL.findById(id);
    if (!slackIntegration) {
      throw new NotFoundError({
        message: "Slack integration not found."
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      slackIntegration.orgId,
      actorAuthMethod,
      actorOrgId
    );

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
    const slackIntegration = await slackIntegrationDAL.findById(id);
    if (!slackIntegration) {
      throw new NotFoundError({
        message: "Slack integration not found."
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      slackIntegration.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
      orgId: slackIntegration.orgId,
      type: KmsDataKey.Organization
    });

    const botKey = orgDataKeyDecryptor({
      cipherTextBlob: slackIntegration.encryptedBotAccessToken
    }).toString("utf8");

    return fetchSlackChannels(botKey);
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
    const slackIntegration = await slackIntegrationDAL.findById(id);
    if (!slackIntegration) {
      throw new NotFoundError({
        message: "Slack integration not found"
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      slackIntegration.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    return slackIntegrationDAL.updateById(slackIntegration.id, {
      slug,
      description
    });
  };

  const deleteSlackIntegration = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id
  }: TDeleteSlackIntegrationDTO) => {
    const slackIntegration = await slackIntegrationDAL.findById(id);
    if (!slackIntegration) {
      throw new NotFoundError({
        message: "Slack integration not found"
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      slackIntegration.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Settings);

    return slackIntegrationDAL.deleteById(id);
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
