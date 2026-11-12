import { ForbiddenError, subject } from "@casl/ability";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { HoneyTokenType } from "@app/ee/services/honey-token/honey-token-enums";
import {
  HONEY_TOKEN_RESOURCE_TYPE,
  HONEY_TOKEN_TRIGGERED_EVENT,
  HoneyTokenTriggeredPayloadSchema
} from "@app/ee/services/honey-token/honey-token-events";
import { HONEY_TOKEN_PROVIDER_MAP } from "@app/ee/services/honey-token/honey-token-provider-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TAlertPayload } from "../alert-channel-types";
import { formatUtcDate } from "../alert-format-fns";
import {
  AlertPermissionAction,
  AlertTriggerType,
  IEventAlertProvider,
  TAlertContext,
  TAlertPermissionInput,
  TFindEventTargetsInput
} from "../alert-types";
import { THoneyTokenAlertDALFactory, THoneyTokenWithLocation } from "./honey-token-alert-dal";

const HoneyTokenTriggeredConditionSchema = z.object({}).nullish();

export type THoneyTokenTarget = THoneyTokenWithLocation & {
  secretPath: string;
  trigger: z.infer<typeof HoneyTokenTriggeredPayloadSchema>;
};

export type THoneyTokenAlertProviderDep = {
  honeyTokenAlertDAL: Pick<THoneyTokenAlertDALFactory, "findHoneyTokensByIds" | "findHoneyTokenNamesByIds">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

const providerName = (type: string) => HONEY_TOKEN_PROVIDER_MAP[type as HoneyTokenType]?.name ?? type;

export const honeyTokenAlertProviderFactory = ({
  honeyTokenAlertDAL,
  folderDAL,
  permissionService
}: THoneyTokenAlertProviderDep): IEventAlertProvider<THoneyTokenTarget> => {
  const $loadHoneyTokensWithPath = async (honeyTokenIds: string[]) => {
    const honeyTokens = await honeyTokenAlertDAL.findHoneyTokensByIds(honeyTokenIds);
    const paths = new Map<string, string>();
    for (const [projectId, projectHoneyTokens] of Object.entries(
      groupBy(honeyTokens, (honeyToken) => honeyToken.projectId)
    )) {
      // The path decides what a permission check allows, so it comes from the primary like the token.
      // eslint-disable-next-line no-await-in-loop -- a trigger event names one token, so this is one project
      const folders = await folderDAL.findSecretPathByFolderIds(
        projectId,
        projectHoneyTokens.map((honeyToken) => honeyToken.folderId),
        undefined,
        { readFromPrimary: true }
      );
      folders.forEach((folder) => {
        if (folder?.path) paths.set(folder.id, folder.path);
      });
    }
    // A token whose path cannot be resolved is left out rather than treated as sitting at the root, which
    // would check permissions against the wrong path.
    return honeyTokens.flatMap((honeyToken) => {
      const secretPath = paths.get(honeyToken.folderId);
      return secretPath ? [{ ...honeyToken, secretPath }] : [];
    });
  };

  const findEventTargets = async (input: TFindEventTargetsInput): Promise<THoneyTokenTarget[]> => {
    if (input.eventType !== HONEY_TOKEN_TRIGGERED_EVENT) return [];

    const parsed = HoneyTokenTriggeredPayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new Error(
        `Unreadable '${HONEY_TOKEN_TRIGGERED_EVENT}' payload: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join(", ")}`
      );
    }

    const honeyTokens = await $loadHoneyTokensWithPath(input.targetIds);
    return honeyTokens
      .filter((honeyToken) => honeyToken.orgId === input.orgId && honeyToken.projectId === input.projectId)
      .map((honeyToken) => ({ ...honeyToken, trigger: parsed.data }));
  };

  const buildViewUrl = async (alert: TAlertContext): Promise<string> => {
    const base = `${getConfig().SITE_URL}/organizations/${alert.orgId}/projects/secret-management/${alert.projectId}/overview`;
    if (!alert.resourceId) return base;

    const [honeyToken] = await $loadHoneyTokensWithPath([alert.resourceId]);
    if (!honeyToken) return base;

    const query = new URLSearchParams({ honeyTokenId: honeyToken.honeyTokenId, secretPath: honeyToken.secretPath });
    return `${base}?${query.toString()}`;
  };

  const buildPayload = (alert: TAlertContext, targets: THoneyTokenTarget[], viewUrl: string): TAlertPayload => {
    const [first] = targets;
    return {
      alert: {
        id: alert.id,
        name: alert.name,
        orgId: alert.orgId,
        ...(alert.projectId ? { projectId: alert.projectId } : {}),
        resourceType: alert.resourceType,
        ...(alert.resourceId ? { resourceId: alert.resourceId } : {}),
        viewUrl
      },
      eventKey: HONEY_TOKEN_TRIGGERED_EVENT,
      eventLabel: "Triggered",
      webhookType: "com.infisical.secret.honey-token.triggered",
      resourceKind: "Honey Token",
      resourceOwnerKind: "Honey Token",
      severity: "critical",
      summary: first ? `Honey token '${first.honeyTokenName}' was used in ${first.envName}` : "A honey token was used",
      items: targets.map((target) => ({
        id: target.honeyTokenId,
        title: target.honeyTokenName,
        fields: [
          { label: "Provider", value: providerName(target.honeyTokenType) },
          { label: "Environment", value: target.envName },
          { label: "Path", value: target.secretPath },
          { label: "Action", value: target.trigger.eventName },
          { label: "Source IP", value: target.trigger.sourceIp || "Unknown" },
          ...(target.trigger.awsRegion ? [{ label: "Region", value: target.trigger.awsRegion }] : []),
          { label: "Triggered At", value: formatUtcDate(target.trigger.triggeredAt) }
        ]
      }))
    };
  };

  const $requireProject = (projectId?: string | null): string => {
    if (!projectId) {
      throw new BadRequestError({ message: "Honey token alerts must be managed within a project" });
    }
    return projectId;
  };

  const $loadInScopeHoneyToken = async (input: { orgId: string; projectId: string; resourceId: string }) => {
    const [honeyToken] = await $loadHoneyTokensWithPath([input.resourceId]);
    if (!honeyToken || honeyToken.orgId !== input.orgId || honeyToken.projectId !== input.projectId) {
      throw new NotFoundError({ message: `Honey token with ID '${input.resourceId}' not found in this project` });
    }
    return honeyToken;
  };

  // Without a resourceId there is nothing to bind-check: that is a test send from the create form, before
  // the token exists. Creating an alert without one is refused earlier, since this provider has no
  // scope-wide alerts.
  const assertResourceInScope = async (input: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }): Promise<void> => {
    const projectId = $requireProject(input.projectId);
    if (!input.resourceId) return;
    await $loadInScopeHoneyToken({ orgId: input.orgId, projectId, resourceId: input.resourceId });
  };

  const assertPermission = async (input: TAlertPermissionInput): Promise<void> => {
    const projectId = $requireProject(input.projectId);
    const { permission } = await permissionService.getProjectPermission({
      actor: input.actor.actor,
      actorId: input.actor.actorId,
      projectId,
      actorAuthMethod: input.actor.actorAuthMethod,
      actorOrgId: input.actor.actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    if (!input.resourceId) {
      if (input.action !== AlertPermissionAction.Read) {
        // A test send for a token that is still being created. It reads nothing back.
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionHoneyTokenActions.Create,
          ProjectPermissionSub.HoneyTokens
        );
        return;
      }

      // Listing without a token returns the alerts of every token in the project, so a read limited to some
      // environments or paths, or narrowed by a deny rule, would expose the rest.
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionHoneyTokenActions.Read,
        ProjectPermissionSub.HoneyTokens
      );
      const readRules = permission.rulesFor(ProjectPermissionHoneyTokenActions.Read, ProjectPermissionSub.HoneyTokens);
      const canReadEveryHoneyToken =
        readRules.some((rule) => !rule.inverted && !rule.conditions) && !readRules.some((rule) => rule.inverted);
      if (!canReadEveryHoneyToken) {
        // Built by hand because throwUnlessCan passes a partial read, and a CASL error is what the
        // permission-denied audit hook records.
        const denial = ForbiddenError.from(permission);
        denial.action = ProjectPermissionHoneyTokenActions.Read;
        denial.subject = ProjectPermissionSub.HoneyTokens;
        denial.subjectType = ProjectPermissionSub.HoneyTokens;
        throw denial;
      }
      return;
    }

    const honeyToken = await $loadInScopeHoneyToken({ orgId: input.orgId, projectId, resourceId: input.resourceId });
    ForbiddenError.from(permission).throwUnlessCan(
      input.action === AlertPermissionAction.Read
        ? ProjectPermissionHoneyTokenActions.Read
        : ProjectPermissionHoneyTokenActions.Edit,
      subject(ProjectPermissionSub.HoneyTokens, {
        environment: honeyToken.envSlug,
        secretPath: honeyToken.secretPath
      })
    );
  };

  return {
    resourceType: HONEY_TOKEN_RESOURCE_TYPE,
    events: [
      {
        key: HONEY_TOKEN_TRIGGERED_EVENT,
        triggerType: AlertTriggerType.Event,
        conditionSchema: HoneyTokenTriggeredConditionSchema
      }
    ],
    findEventTargets,
    buildViewUrl,
    buildPayload,
    targetId: (target) => target.honeyTokenId,
    assertPermission,
    assertResourceInScope,
    recipientPolicy: { allowProjectAdmins: true },
    resolveProjectId: async ({ orgId, resourceId }) => {
      if (!resourceId) {
        throw new BadRequestError({ message: "Honey token alerts must be managed within a project" });
      }
      const [honeyToken] = await honeyTokenAlertDAL.findHoneyTokensByIds([resourceId]);
      if (!honeyToken || honeyToken.orgId !== orgId) {
        throw new NotFoundError({ message: `Honey token with ID '${resourceId}' not found` });
      }
      return honeyToken.projectId;
    },
    getResourceNames: async ({ orgId, resourceIds }) =>
      new Map(
        (await honeyTokenAlertDAL.findHoneyTokenNamesByIds(resourceIds, orgId)).map((honeyToken) => [
          honeyToken.id,
          honeyToken.name
        ])
      )
  };
};
