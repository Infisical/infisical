import { ForbiddenError } from "@casl/ability";
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  ConfigurationServiceClientCredentialFactory,
  Request,
  Response
} from "botbuilder";
import { FastifyReply, FastifyRequest } from "fastify";

import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TSuperAdminDALFactory } from "../super-admin/super-admin-dal";
import { TWorkflowIntegrationDALFactory } from "../workflow-integration/workflow-integration-dal";
import { WorkflowIntegration, WorkflowIntegrationStatus } from "../workflow-integration/workflow-integration-types";
import { isBotInstalledInTenant, TeamsBot } from "./microsoft-teams-fns";
import { TMicrosoftTeamsIntegrationDALFactory } from "./microsoft-teams-integration-dal";
import {
  TCheckInstallationStatusDTO,
  TCreateMicrosoftTeamsIntegrationDTO,
  TDeleteMicrosoftTeamsIntegrationDTO,
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

  const initializeTeamsBot = async ({ botAppId, botAppPassword }: { botAppId: string; botAppPassword: string }) => {
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
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const microsoftTeamsIntegration =
      await microsoftTeamsIntegrationDAL.findByIdWithWorkflowIntegrationDetails(workflowIntegrationId);

    if (!microsoftTeamsIntegration) {
      throw new NotFoundError({
        message: `Microsoft Teams integration with ID ${workflowIntegrationId} not found`
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

    const teamsBotInfo = await isBotInstalledInTenant({
      tenantId: microsoftTeamsIntegration.tenantId,
      botAppId: decryptedAppId.toString(),
      botAppPassword: decryptedAppPassword.toString(),
      botId: decryptedBotId.toString()
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
  };

  const createMicrosoftTeamsIntegration = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    slug,
    description,
    tenantId
  }: TCreateMicrosoftTeamsIntegrationDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

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

    const integration = await workflowIntegrationDAL.transaction(async (tx) => {
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

      const microsoftTeamsIntegration = await microsoftTeamsIntegrationDAL.create(
        {
          // @ts-expect-error id is kept as fixed because it is always equal to the workflow integration ID
          id: workflowIntegration.id,
          tenantId
        },
        tx
      );

      const decryptWithRoot = kmsService.decryptWithRootKey();
      const botAppId = decryptWithRoot(encryptedMicrosoftTeamsAppId);
      const botAppPassword = decryptWithRoot(encryptedMicrosoftTeamsClientSecret);
      const botId = decryptWithRoot(encryptedMicrosoftTeamsBotId);

      const teamsBotInfo = await isBotInstalledInTenant({
        tenantId: microsoftTeamsIntegration.tenantId,
        botAppId: botAppId.toString(),
        botAppPassword: botAppPassword.toString(),
        botId: botId.toString()
      });
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

      return {
        ...workflowIntegration,
        status: workflowIntegration.status as WorkflowIntegrationStatus,
        tenantId: microsoftTeamsIntegration.tenantId
      };
    });

    return integration;
  };

  const getMicrosoftTeamsIntegrationsByOrg = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod
  }: TGetMicrosoftTeamsIntegrationByOrgDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);

    const microsoftTeamsIntegrations = await microsoftTeamsIntegrationDAL.findWithWorkflowIntegrationDetails({
      orgId: actorOrgId
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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      microsoftTeamsIntegration.orgId,
      actorAuthMethod,
      actorOrgId
    );

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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      microsoftTeamsIntegration.orgId,
      actorAuthMethod,
      actorOrgId
    );

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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      microsoftTeamsIntegration.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Settings);

    await workflowIntegrationDAL.deleteById(id);

    return {
      ...microsoftTeamsIntegration,
      status: microsoftTeamsIntegration.status as WorkflowIntegrationStatus
    };
  };

  const getTeams = async ({ actorId, actor, actorOrgId, actorAuthMethod, workflowIntegrationId }: TGetTeamsDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    const microsoftTeamsIntegration =
      await microsoftTeamsIntegrationDAL.findByIdWithWorkflowIntegrationDetails(workflowIntegrationId);

    if (!microsoftTeamsIntegration) {
      throw new NotFoundError({
        message: `Microsoft Teams integration with ID ${workflowIntegrationId} not found`
      });
    }

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

    const { installed, internalId } = await isBotInstalledInTenant({
      tenantId: microsoftTeamsIntegration.tenantId,
      botAppId: decryptedAppId.toString(),
      botAppPassword: decryptedAppPassword.toString(),
      botId: decryptedBotId.toString()
    });

    if (!installed) {
      throw new BadRequestError({
        message: "Microsoft Teams bot is not installed in the configured Microsoft Teams Tenant"
      });
    }

    const teams = await teamsBot.getTeamsAndChannels(microsoftTeamsIntegration.tenantId, internalId);

    return teams;
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

  const sendNotification = async ({ tenantId, target, notification }: TSendNotificationDTO) => {
    if (!teamsBot || !adapter) {
      throw new BadRequestError({
        message: "Unable to send notification because the Microsoft Teams bot is uninitialized"
      });
    }

    for await (const channelId of target.channelIds) {
      await teamsBot.sendMessageToChannel(tenantId, channelId, target.teamId, notification);
    }
  };

  return {
    getMicrosoftTeamsIntegrationsByOrg,
    getMicrosoftTeamsIntegrationById,
    updateMicrosoftTeamsIntegration,
    deleteMicrosoftTeamsIntegration,
    createMicrosoftTeamsIntegration,
    initializeTeamsBot,
    getTeams,
    handleMessageEndpoint,
    start,
    sendNotification,
    checkInstallationStatus
  };
};
