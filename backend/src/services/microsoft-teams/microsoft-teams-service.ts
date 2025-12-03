import { ForbiddenError } from "@casl/ability";
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  ConfigurationServiceClientCredentialFactory,
  Request,
  Response
} from "botbuilder";
import { CronJob } from "cron";
import { FastifyReply, FastifyRequest } from "fastify";

import { OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TSuperAdminDALFactory } from "../super-admin/super-admin-dal";
import { TWorkflowIntegrationDALFactory } from "../workflow-integration/workflow-integration-dal";
import { WorkflowIntegration, WorkflowIntegrationStatus } from "../workflow-integration/workflow-integration-types";
import {
  getMicrosoftTeamsAccessToken,
  isBotInstalledInTenant,
  TeamsBot,
  verifyTenantFromCode
} from "./microsoft-teams-fns";
import { TMicrosoftTeamsIntegrationDALFactory } from "./microsoft-teams-integration-dal";
import {
  TCheckInstallationStatusDTO,
  TCreateMicrosoftTeamsIntegrationDTO,
  TDeleteMicrosoftTeamsIntegrationDTO,
  TGetClientIdDTO,
  TGetMicrosoftTeamsIntegrationByIdDTO,
  TGetMicrosoftTeamsIntegrationByOrgDTO,
  TGetTeamsDTO,
  TSendNotificationDTO,
  TUpdateMicrosoftTeamsIntegrationDTO
} from "./microsoft-teams-types";

function requestBodyToRecord(body: unknown): Record<string, unknown> {
  // if body is null or undefined, return an empty object
  if (body === null || body === undefined) {
    return {};
  }

  // if body is not an object or is an array, return an empty object
  if (typeof body !== "object" || Array.isArray(body)) {
    return {};
  }

  // at this point, we know body is an object, so safe to cast
  return body as Record<string, unknown>;
}

type TMicrosoftTeamsServiceFactoryDep = {
  microsoftTeamsIntegrationDAL: Pick<
    TMicrosoftTeamsIntegrationDALFactory,
    | "deleteById"
    | "updateById"
    | "create"
    | "findOne"
    | "findById"
    | "findByIdWithWorkflowIntegrationDetails"
    | "findWithWorkflowIntegrationDetails"
    | "update"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "encryptWithRootKey" | "decryptWithRootKey">;
  workflowIntegrationDAL: Pick<
    TWorkflowIntegrationDALFactory,
    "transaction" | "create" | "updateById" | "deleteById" | "update" | "findOne"
  >;
  serverCfgDAL: Pick<TSuperAdminDALFactory, "findById">;
};

export type TMicrosoftTeamsServiceFactory = ReturnType<typeof microsoftTeamsServiceFactory>;

const ADMIN_CONFIG_DB_UUID = "00000000-0000-0000-0000-000000000000";

export const microsoftTeamsServiceFactory = ({
  permissionService,
  serverCfgDAL,
  kmsService,
  microsoftTeamsIntegrationDAL,
  workflowIntegrationDAL
}: TMicrosoftTeamsServiceFactoryDep) => {
  let teamsBot: TeamsBot | null = null;
  let adapter: CloudAdapter | null = null;
  let lastKnownUpdatedAt = new Date();

  const initializeTeamsBot = async ({
    botAppId,
    botAppPassword,
    lastUpdatedAt
  }: {
    botAppId: string;
    botAppPassword: string;
    lastUpdatedAt?: Date;
  }) => {
    logger.info("Initializing Microsoft Teams bot");
    teamsBot = new TeamsBot({
      botAppId,
      botAppPassword,
      workflowIntegrationDAL,
      microsoftTeamsIntegrationDAL
    });

    adapter = new CloudAdapter(
      new ConfigurationBotFrameworkAuthentication(
        {},
        new ConfigurationServiceClientCredentialFactory({
          MicrosoftAppId: botAppId,
          MicrosoftAppPassword: botAppPassword,
          MicrosoftAppType: "MultiTenant"
        })
      )
    );

    if (lastUpdatedAt) {
      lastKnownUpdatedAt = lastUpdatedAt;
    }
  };

  const $syncMicrosoftTeamsIntegrationConfiguration = async () => {
    try {
      const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);
      if (!serverCfg) {
        throw new BadRequestError({
          message: "Failed to get server configuration."
        });
      }

      if (lastKnownUpdatedAt.getTime() === serverCfg.updatedAt.getTime()) {
        logger.info("No changes to Microsoft Teams integration configuration, skipping sync");
        return;
      }

      lastKnownUpdatedAt = serverCfg.updatedAt;

      if (
        serverCfg.encryptedMicrosoftTeamsAppId &&
        serverCfg.encryptedMicrosoftTeamsClientSecret &&
        serverCfg.encryptedMicrosoftTeamsBotId
      ) {
        const decryptWithRoot = kmsService.decryptWithRootKey();
        const decryptedAppId = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsAppId);
        const decryptedAppPassword = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsClientSecret);

        await initializeTeamsBot({
          botAppId: decryptedAppId.toString(),
          botAppPassword: decryptedAppPassword.toString()
        });
      }
    } catch (err) {
      logger.error(err, "Error syncing Microsoft Teams integration configuration");
    }
  };

  const initializeBackgroundSync = async () => {
    logger.info("Setting up background sync process for Microsoft Teams workflow integration configuration");
    // initial sync upon startup
    await $syncMicrosoftTeamsIntegrationConfiguration();

    // sync rate limits configuration every 5 minutes
    const job = new CronJob("*/5 * * * *", $syncMicrosoftTeamsIntegrationConfiguration);
    job.start();

    return job;
  };

  const start = async () => {
    try {
      const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);

      if (
        serverCfg?.encryptedMicrosoftTeamsAppId &&
        serverCfg?.encryptedMicrosoftTeamsClientSecret &&
        serverCfg?.encryptedMicrosoftTeamsBotId
      ) {
        const decryptWithRoot = kmsService.decryptWithRootKey();
        const decryptedAppId = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsAppId);
        const decryptedAppPassword = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsClientSecret);

        await initializeTeamsBot({
          botAppId: decryptedAppId.toString(),
          botAppPassword: decryptedAppPassword.toString()
        });
      }
    } catch (err) {
      logger.error(err, "Error initializing Microsoft Teams bot on startup");
    }
  };

  const checkInstallationStatus = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    workflowIntegrationId
  }: TCheckInstallationStatusDTO) => {
    const microsoftTeamsIntegration =
      await microsoftTeamsIntegrationDAL.findByIdWithWorkflowIntegrationDetails(workflowIntegrationId);

    if (!microsoftTeamsIntegration) {
      throw new NotFoundError({
        message: `Microsoft Teams integration with ID ${workflowIntegrationId} not found`
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: microsoftTeamsIntegration.orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);
    if (!serverCfg) {
      throw new BadRequestError({
        message: "Failed to get server configuration."
      });
    }

    if (
      !serverCfg.encryptedMicrosoftTeamsAppId ||
      !serverCfg.encryptedMicrosoftTeamsClientSecret ||
      !serverCfg.encryptedMicrosoftTeamsBotId
    ) {
      throw new BadRequestError({
        message: "Microsoft Teams app ID, client secret, or bot ID is not set"
      });
    }
    const decryptWithRoot = kmsService.decryptWithRootKey();
    const decryptedAppId = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsAppId);
    const decryptedAppPassword = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsClientSecret);
    const decryptedBotId = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsBotId);

    const teamsBotInfo = await isBotInstalledInTenant({
      tenantId: microsoftTeamsIntegration.tenantId,
      botAppId: decryptedAppId.toString(),
      botAppPassword: decryptedAppPassword.toString(),
      botId: decryptedBotId.toString(),
      orgId: microsoftTeamsIntegration.orgId,
      kmsService,
      microsoftTeamsIntegrationDAL,
      microsoftTeamsIntegrationId: microsoftTeamsIntegration.id
    });

    if (!teamsBotInfo.installed) {
      if (microsoftTeamsIntegration.status === WorkflowIntegrationStatus.INSTALLED) {
        await workflowIntegrationDAL.updateById(microsoftTeamsIntegration.id, {
          status: WorkflowIntegrationStatus.PENDING
        });
      }

      throw new BadRequestError({
        message: "Microsoft Teams bot is not installed in the configured Microsoft Teams Tenant"
      });
    }

    if (microsoftTeamsIntegration.status !== WorkflowIntegrationStatus.INSTALLED) {
      await workflowIntegrationDAL.updateById(microsoftTeamsIntegration.id, {
        status: WorkflowIntegrationStatus.INSTALLED
      });
    }

    return microsoftTeamsIntegration;
  };

  const completeMicrosoftTeamsIntegration = async ({
    code,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    tenantId,
    slug,
    description,
    redirectUri
  }: TCreateMicrosoftTeamsIntegrationDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);
    if (!serverCfg) {
      throw new BadRequestError({
        message: "Failed to get server configuration."
      });
    }

    const { encryptedMicrosoftTeamsAppId, encryptedMicrosoftTeamsClientSecret, encryptedMicrosoftTeamsBotId } =
      serverCfg;

    if (!encryptedMicrosoftTeamsAppId || !encryptedMicrosoftTeamsClientSecret || !encryptedMicrosoftTeamsBotId) {
      throw new BadRequestError({
        message: "Microsoft Teams app ID, client secret, or bot ID is not set"
      });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const botAppId = decryptWithRoot(encryptedMicrosoftTeamsAppId);
    const botAppPassword = decryptWithRoot(encryptedMicrosoftTeamsClientSecret);
    const botId = decryptWithRoot(encryptedMicrosoftTeamsBotId);

    await verifyTenantFromCode(tenantId, code, redirectUri, botAppId.toString(), botAppPassword.toString());

    await workflowIntegrationDAL.transaction(async (tx) => {
      const workflowIntegration = await workflowIntegrationDAL.create(
        {
          description,
          orgId: actorOrgId,
          slug,
          integration: WorkflowIntegration.MICROSOFT_TEAMS,
          status: WorkflowIntegrationStatus.PENDING
        },
        tx
      );

      const microsoftTeamsIntegration = await microsoftTeamsIntegrationDAL
        .create(
          {
            // @ts-expect-error id is kept as fixed because it is always equal to the workflow integration ID
            id: workflowIntegration.id,
            tenantId
          },
          tx
        )
        .catch((err) => {
          if (err instanceof DatabaseError) {
            if ((err.error as Error)?.stack?.includes("duplicate key value violates unique constraint"))
              throw new BadRequestError({
                message: "Microsoft Teams integration with the same Tenant ID already exists."
              });
          }
          throw err;
        });

      const teamsBotInfo = await isBotInstalledInTenant(
        {
          tenantId: microsoftTeamsIntegration.tenantId,
          botAppId: botAppId.toString(),
          botAppPassword: botAppPassword.toString(),
          botId: botId.toString(),
          orgId: workflowIntegration.orgId,
          kmsService,
          microsoftTeamsIntegrationDAL,
          microsoftTeamsIntegrationId: microsoftTeamsIntegration.id
        },
        tx
      );

      if (teamsBotInfo.installed) {
        const { encryptor: orgDataKeyEncryptor } = await kmsService.createCipherPairWithDataKey({
          orgId: workflowIntegration.orgId,
          type: KmsDataKey.Organization
        });
        const { cipherTextBlob: encryptedAccessToken } = orgDataKeyEncryptor({
          plainText: Buffer.from(teamsBotInfo.accessToken, "utf8")
        });

        const { cipherTextBlob: encryptedBotAccessToken } = orgDataKeyEncryptor({
          plainText: Buffer.from(teamsBotInfo.botAccessToken, "utf8")
        });
        await microsoftTeamsIntegrationDAL.updateById(
          microsoftTeamsIntegration.id,
          {
            internalTeamsAppId: teamsBotInfo.internalId,
            encryptedAccessToken,
            encryptedBotAccessToken
          },
          tx
        );

        await workflowIntegrationDAL.updateById(
          workflowIntegration.id,
          {
            status: WorkflowIntegrationStatus.INSTALLED
          },
          tx
        );
      }
    });
  };
  const getClientId = async ({ actorId, actor, actorOrgId, actorAuthMethod }: TGetClientIdDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);
    if (!serverCfg) {
      throw new BadRequestError({
        message: "Failed to get server configuration."
      });
    }

    if (!serverCfg.encryptedMicrosoftTeamsAppId) {
      throw new BadRequestError({
        message: "Microsoft Teams app ID is not set"
      });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const clientId = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsAppId);

    return clientId.toString();
  };
  const getMicrosoftTeamsIntegrationsByOrg = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod
  }: TGetMicrosoftTeamsIntegrationByOrgDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const microsoftTeamsIntegrations = await microsoftTeamsIntegrationDAL.findWithWorkflowIntegrationDetails({
      orgId: actorOrgId,
      status: WorkflowIntegrationStatus.INSTALLED
    });

    return microsoftTeamsIntegrations.map((integration) => ({
      ...integration,
      status: integration.status as WorkflowIntegrationStatus,
      tenantId: integration.tenantId
    }));
  };

  const getMicrosoftTeamsIntegrationById = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id
  }: TGetMicrosoftTeamsIntegrationByIdDTO) => {
    const microsoftTeamsIntegration = await microsoftTeamsIntegrationDAL.findByIdWithWorkflowIntegrationDetails(id);
    if (!microsoftTeamsIntegration) {
      throw new NotFoundError({
        message: "Microsoft Teams integration not found."
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: microsoftTeamsIntegration.orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    return {
      ...microsoftTeamsIntegration,
      status: microsoftTeamsIntegration.status as WorkflowIntegrationStatus
    };
  };

  const updateMicrosoftTeamsIntegration = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id,
    slug,
    description
  }: TUpdateMicrosoftTeamsIntegrationDTO) => {
    const microsoftTeamsIntegration = await microsoftTeamsIntegrationDAL.findByIdWithWorkflowIntegrationDetails(id);
    if (!microsoftTeamsIntegration) {
      throw new NotFoundError({
        message: `Microsoft Teams integration with ID ${id} not found`
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: microsoftTeamsIntegration.orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const updatedIntegration = await workflowIntegrationDAL.transaction(async (tx) => {
      await workflowIntegrationDAL.updateById(
        microsoftTeamsIntegration.id,
        {
          slug,
          description
        },
        tx
      );

      const integration = await microsoftTeamsIntegrationDAL.findByIdWithWorkflowIntegrationDetails(
        microsoftTeamsIntegration.id,
        tx
      );

      if (!integration) {
        throw new NotFoundError({
          message: `Microsoft Teams integration with ID ${microsoftTeamsIntegration.id} not found`
        });
      }

      return {
        ...integration,
        status: integration.status as WorkflowIntegrationStatus
      };
    });

    return updatedIntegration;
  };

  const deleteMicrosoftTeamsIntegration = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id
  }: TDeleteMicrosoftTeamsIntegrationDTO) => {
    const microsoftTeamsIntegration = await microsoftTeamsIntegrationDAL.findByIdWithWorkflowIntegrationDetails(id);
    if (!microsoftTeamsIntegration) {
      throw new NotFoundError({
        message: `Microsoft Teams integration with ID ${id} not found`
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: microsoftTeamsIntegration.orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Settings);

    await workflowIntegrationDAL.deleteById(id);

    return {
      ...microsoftTeamsIntegration,
      status: microsoftTeamsIntegration.status as WorkflowIntegrationStatus
    };
  };

  const getTeams = async ({ actorId, actor, actorOrgId, actorAuthMethod, workflowIntegrationId }: TGetTeamsDTO) => {
    const microsoftTeamsIntegration =
      await microsoftTeamsIntegrationDAL.findByIdWithWorkflowIntegrationDetails(workflowIntegrationId);

    if (!microsoftTeamsIntegration) {
      throw new NotFoundError({
        message: `Microsoft Teams integration with ID ${workflowIntegrationId} not found`
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: microsoftTeamsIntegration.orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    if (!teamsBot || !adapter) {
      throw new BadRequestError({
        message: "Unable to get teams and channels because the Microsoft Teams bot is uninitialized"
      });
    }

    const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);
    if (!serverCfg) {
      throw new BadRequestError({
        message: "Failed to get server configuration."
      });
    }

    if (
      !serverCfg.encryptedMicrosoftTeamsAppId ||
      !serverCfg.encryptedMicrosoftTeamsClientSecret ||
      !serverCfg.encryptedMicrosoftTeamsBotId
    ) {
      throw new BadRequestError({
        message: "Microsoft Teams app ID, client secret, or bot ID is not set"
      });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const decryptedAppId = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsAppId);
    const decryptedAppPassword = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsClientSecret);
    const decryptedBotId = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsBotId);

    const { installed, internalId, accessToken } = await isBotInstalledInTenant({
      tenantId: microsoftTeamsIntegration.tenantId,
      botAppId: decryptedAppId.toString(),
      botAppPassword: decryptedAppPassword.toString(),
      botId: decryptedBotId.toString(),
      orgId: microsoftTeamsIntegration.orgId,
      kmsService,
      microsoftTeamsIntegrationDAL,
      microsoftTeamsIntegrationId: microsoftTeamsIntegration.id
    });

    if (!installed) {
      throw new BadRequestError({
        message: "Microsoft Teams bot is not installed in the configured Microsoft Teams Tenant"
      });
    }

    const teams = await teamsBot.getTeamsAndChannels(accessToken, internalId);

    return {
      ...microsoftTeamsIntegration,
      teams
    };
  };

  const handleMessageEndpoint = async (req: FastifyRequest, res: FastifyReply) => {
    if (!teamsBot || !adapter) {
      throw new BadRequestError({
        message: "Unable to handle message endpoint because the Microsoft Teams bot is uninitialized"
      });
    }

    // We need to manually build a Response object because the BotFrameworkAdapter expects a Response object. We are using FastifyReply as the underlying socket.
    const response: Response = {
      socket: res.raw.socket,

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      end(...args: any[]): unknown {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        res.raw.end(...args);
        return this;
      },

      header(name: string, value: unknown): unknown {
        res.raw.setHeader(name, value as string);
        return this;
      },

      send(...args: unknown[]): unknown {
        // For the first argument, which is typically the body
        if (args.length > 0) {
          const body = args[0];

          if (typeof body === "string" || Buffer.isBuffer(body)) {
            res.raw.write(body);
          } else if (body !== null && body !== undefined) {
            const json = JSON.stringify(body);
            if (!res.raw.headersSent && !res.raw.getHeader("content-type")) {
              res.raw.setHeader("content-type", "application/json");
            }
            res.raw.write(json);
          }
        }

        const lastArg = args[args.length - 1];
        if (typeof lastArg === "function") {
          lastArg();
        }

        return this;
      },

      status(code: number): unknown {
        res.raw.statusCode = code;
        return this;
      }
    };

    const request: Request = {
      body: requestBodyToRecord(req.body),
      headers: req.headers,
      method: req.method
    };

    await adapter.process(request, response, async (context) => {
      await teamsBot?.run(context);
    });
  };

  const sendNotification = async ({
    tenantId,
    target,
    notification,
    orgId,
    microsoftTeamsIntegrationId
  }: TSendNotificationDTO) => {
    if (!teamsBot || !adapter) {
      throw new BadRequestError({
        message: "Unable to send notification because the Microsoft Teams bot is uninitialized"
      });
    }

    const serverCfg = await serverCfgDAL.findById(ADMIN_CONFIG_DB_UUID);
    if (!serverCfg) {
      throw new BadRequestError({
        message: "Failed to get server configuration."
      });
    }

    if (
      !serverCfg.encryptedMicrosoftTeamsAppId ||
      !serverCfg.encryptedMicrosoftTeamsClientSecret ||
      !serverCfg.encryptedMicrosoftTeamsBotId
    ) {
      throw new BadRequestError({
        message: "Microsoft Teams app ID, client secret, or bot ID is not set"
      });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const botAppId = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsAppId);
    const botAppPassword = decryptWithRoot(serverCfg.encryptedMicrosoftTeamsClientSecret);

    const botAccessToken = await getMicrosoftTeamsAccessToken({
      tenantId,
      clientId: botAppId.toString(),
      clientSecret: botAppPassword.toString(),
      getBotFrameworkToken: true,
      orgId,
      kmsService,
      microsoftTeamsIntegrationDAL,
      microsoftTeamsIntegrationId
    });

    for await (const channelId of target.channelIds) {
      await teamsBot.sendMessageToChannel(botAccessToken, tenantId, channelId, target.teamId, orgId, notification);
    }
  };

  return {
    getMicrosoftTeamsIntegrationsByOrg,
    getMicrosoftTeamsIntegrationById,
    updateMicrosoftTeamsIntegration,
    deleteMicrosoftTeamsIntegration,
    completeMicrosoftTeamsIntegration,
    initializeTeamsBot,
    getTeams,
    handleMessageEndpoint,
    start,
    initializeBackgroundSync,
    sendNotification,
    checkInstallationStatus,
    getClientId
  };
};
