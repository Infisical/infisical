import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import {
  createAnthropicMessage,
  getAnthropicErrorMessage,
  listAnthropicModels,
  TAnthropicConnection
} from "@app/services/app-connection/anthropic";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { runAiJudge } from "./ai-judge-fns";
import { TAiJudgeResult, TAiRequestContext, TAiTool } from "./ai-types";

const AI_JUDGE_TIMEOUT_MS = 90_000;
const AI_MESSAGE_TIMEOUT_MS = 30_000;

type TAiServiceFactoryDep = {
  orgDAL: Pick<TOrgDALFactory, "findById" | "updateById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TAiServiceFactory = ReturnType<typeof aiServiceFactory>;

export const aiServiceFactory = ({
  orgDAL,
  appConnectionDAL,
  appConnectionService,
  permissionService,
  kmsService
}: TAiServiceFactoryDep) => {
  const $getOrgPermission = (actor: OrgServiceActor) =>
    permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

  // The org's model with its connection, or null when AI features are off
  const getOrgAiModel = async (orgId: string) => {
    const org = await orgDAL.findById(orgId);
    if (!org?.aiConnectionId || !org.aiModel) return null;

    const connection = await appConnectionDAL.findById(org.aiConnectionId);
    if (!connection || connection.orgId !== orgId || connection.app !== AppConnection.Anthropic) return null;

    return { connectionId: connection.id, connectionName: connection.name, model: org.aiModel };
  };

  const getOrgAiConfig = async (actor: OrgServiceActor) => {
    const { permission } = await $getOrgPermission(actor);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    return getOrgAiModel(actor.orgId);
  };

  const updateOrgAiConfig = async (
    { connectionId, model }: { connectionId: string | null; model: string | null },
    actor: OrgServiceActor
  ) => {
    const { permission } = await $getOrgPermission(actor);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    if (!connectionId) {
      await orgDAL.updateById(actor.orgId, { aiConnectionId: null, aiModel: null });
      return null;
    }

    if (!model) {
      throw new BadRequestError({ message: "Choose a model for the AI connection" });
    }

    const raw = await appConnectionDAL.findById(connectionId);
    if (!raw || raw.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Could not find App Connection with ID '${connectionId}'` });
    }
    if (raw.projectId) {
      throw new BadRequestError({
        message: `App Connection '${raw.name}' belongs to a project. The organization's AI model needs an organization-level Anthropic connection.`
      });
    }

    const connection = await appConnectionService.connectAppConnectionById<TAnthropicConnection>(
      AppConnection.Anthropic,
      connectionId,
      actor
    );

    let models: { id: string }[];
    try {
      models = await listAnthropicModels(connection);
    } catch (error) {
      throw new BadRequestError({
        message: `Couldn't check the model with Anthropic: ${getAnthropicErrorMessage(error)}`
      });
    }
    if (!models.some((candidate) => candidate.id === model)) {
      throw new BadRequestError({
        message: `Anthropic connection '${connection.name}' doesn't have access to model '${model}'`
      });
    }

    await orgDAL.updateById(actor.orgId, { aiConnectionId: connectionId, aiModel: model });
    return { connectionId, connectionName: connection.name, model };
  };

  // Never throws: a judge that can't decide returns a result that doesn't approve
  const runJudge = async ({
    orgId,
    instructions,
    request,
    tools
  }: {
    orgId: string;
    instructions: string;
    request: TAiRequestContext;
    tools: TAiTool[];
  }): Promise<TAiJudgeResult> => {
    const fail = (error: string, model = ""): TAiJudgeResult => ({
      approve: false,
      reason: error,
      model,
      toolCalls: [],
      error
    });

    let connection: TAnthropicConnection;
    let model: string;
    try {
      const configured = await getOrgAiModel(orgId);
      if (!configured) return fail("The organization has no AI model set up");

      const raw = await appConnectionDAL.findById(configured.connectionId);
      if (!raw) return fail("The organization's AI connection is no longer available");
      connection = (await decryptAppConnection(raw, kmsService)) as TAnthropicConnection;
      model = configured.model;
    } catch (error) {
      logger.error(error, `Failed to load the organization's AI model [orgId=${orgId}]`);
      return fail("Couldn't load the organization's AI model");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_JUDGE_TIMEOUT_MS);
    try {
      return await runAiJudge({
        sendMessage: (body) =>
          createAnthropicMessage(connection, body, { signal: controller.signal, timeoutMs: AI_MESSAGE_TIMEOUT_MS }),
        describeError: (error) => {
          if (controller.signal.aborted) return `The AI didn't decide within ${AI_JUDGE_TIMEOUT_MS / 1000} seconds`;
          logger.warn(
            { message: getAnthropicErrorMessage(error) },
            `AI judge model call failed [orgId=${orgId}] [connectionId=${connection.id}]`
          );
          return getAnthropicErrorMessage(error);
        },
        model,
        instructions,
        request,
        tools,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    getOrgAiModel,
    getOrgAiConfig,
    updateOrgAiConfig,
    runJudge
  };
};
