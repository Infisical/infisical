import { z } from "zod";

import { PermissionDeniedError } from "@app/domains/lib/errors";
import { ProjectPermissionSecretSyncActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { TSecretsPermissionService } from "@app/domains/secrets-manager/secrets/ce/module";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  SECRET_SYNC_FAILED_EVENT,
  SECRET_SYNC_RESOURCE_TYPE,
  SecretSyncFailedPayloadSchema
} from "@app/services/secret-sync/secret-sync-events";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { SecretSyncAction } from "@app/services/secret-sync/secret-sync-types";

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
import { TSecretSyncAlertDALFactory, TSecretSyncWithLocation } from "./secret-sync-alert-dal";

const SecretSyncFailedConditionSchema = z.object({}).nullish();

type TSecretSyncWithPath = TSecretSyncWithLocation & {
  secretPath: string | null;
};

export type TSecretSyncTarget = TSecretSyncWithPath & {
  action: SecretSyncAction;
  failureMessage: string | null;
  attemptedAt: Date;
};

export type TSecretSyncAlertProviderDep = {
  secretSyncAlertDAL: Pick<TSecretSyncAlertDALFactory, "findSyncsByIds" | "findSyncNamesByIds">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
  secretsPermissionService: TSecretsPermissionService;
};

const ACTION_LABELS: Record<SecretSyncAction, string> = {
  [SecretSyncAction.SyncSecrets]: "Sync",
  [SecretSyncAction.ImportSecrets]: "Import",
  [SecretSyncAction.RemoveSecrets]: "Remove"
};

const destinationName = (destination: string) => SECRET_SYNC_NAME_MAP[destination as SecretSync] ?? destination;

export const secretSyncAlertProviderFactory = ({
  secretSyncAlertDAL,
  folderDAL,
  secretsPermissionService
}: TSecretSyncAlertProviderDep): IEventAlertProvider<TSecretSyncTarget> => {
  const $loadSyncsWithPath = async (syncIds: string[]): Promise<TSecretSyncWithPath[]> => {
    const syncs = await secretSyncAlertDAL.findSyncsByIds(syncIds);
    const paths = new Map<string, string>();
    const syncsWithFolder = syncs.filter((sync) => sync.folderId);
    for (const [projectId, projectSyncs] of Object.entries(groupBy(syncsWithFolder, (sync) => sync.projectId))) {
      // The path decides what a permission check allows, so it comes from the primary like the sync.
      // eslint-disable-next-line no-await-in-loop -- a failure event names one sync, so this is one project
      const folders = await folderDAL.findSecretPathByFolderIds(
        projectId,
        projectSyncs.map((sync) => sync.folderId as string),
        undefined,
        { readFromPrimary: true }
      );
      folders.forEach((folder) => {
        if (folder?.path) paths.set(folder.id, folder.path);
      });
    }
    // A sync whose folder was deleted has no environment or path, and the sync service checks its permissions
    // without them, so this does too. A sync whose folder exists but whose path cannot be resolved is left out
    // rather than treated as sitting at the root, which would check permissions against the wrong path.
    return syncs.flatMap((sync): TSecretSyncWithPath[] => {
      if (!sync.folderId) return [{ ...sync, secretPath: null }];
      const secretPath = paths.get(sync.folderId);
      return secretPath ? [{ ...sync, secretPath }] : [];
    });
  };

  const findEventTargets = async (input: TFindEventTargetsInput): Promise<TSecretSyncTarget[]> => {
    if (input.eventType !== SECRET_SYNC_FAILED_EVENT) return [];

    const parsed = SecretSyncFailedPayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new Error(
        `Unreadable '${SECRET_SYNC_FAILED_EVENT}' payload: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join(", ")}`
      );
    }

    const syncs = await $loadSyncsWithPath(input.targetIds);
    return syncs
      .filter((sync) => sync.orgId === input.orgId && sync.projectId === input.projectId)
      .map((sync) => ({
        ...sync,
        action: parsed.data.action,
        failureMessage: parsed.data.failureMessage ?? null,
        attemptedAt: parsed.data.attemptedAt
      }));
  };

  const buildViewUrl = async (alert: TAlertContext): Promise<string> => {
    const base = `${getConfig().SITE_URL}/organizations/${alert.orgId}/projects/secret-management/${alert.projectId}/integrations`;
    if (!alert.resourceId) return `${base}?selectedTab=secret-syncs`;

    const [sync] = await secretSyncAlertDAL.findSyncsByIds([alert.resourceId]);
    if (!sync) return `${base}?selectedTab=secret-syncs`;

    return `${base}/secret-syncs/${sync.destination}/${sync.syncId}`;
  };

  const buildPayload = (alert: TAlertContext, targets: TSecretSyncTarget[], viewUrl: string): TAlertPayload => {
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
      eventKey: SECRET_SYNC_FAILED_EVENT,
      eventLabel: "Failure",
      webhookType: "com.infisical.secret.sync.failed",
      resourceKind: "Secret Sync",
      resourceOwnerKind: "Secret Sync",
      severity: "error",
      summary: first
        ? `${destinationName(first.destination)} sync '${first.syncName}' failed to ${ACTION_LABELS[
            first.action
          ].toLowerCase()} secrets`
        : "Secret sync failed",
      items: targets.map((target) => ({
        id: target.syncId,
        title: target.syncName,
        fields: [
          { label: "Destination", value: destinationName(target.destination) },
          { label: "Action", value: ACTION_LABELS[target.action] },
          { label: "Environment", value: target.envName ?? "-" },
          { label: "Path", value: target.secretPath ?? "-" },
          { label: "Error", value: target.failureMessage || "An unknown error occurred" },
          { label: "Last Attempt", value: formatUtcDate(target.attemptedAt) }
        ]
      }))
    };
  };

  const $requireProject = (projectId?: string | null): string => {
    if (!projectId) {
      throw new BadRequestError({ message: "Secret sync alerts must be managed within a project" });
    }
    return projectId;
  };

  const $loadInScopeSync = async (input: { orgId: string; projectId: string; resourceId: string }) => {
    const [sync] = await $loadSyncsWithPath([input.resourceId]);
    if (!sync || sync.orgId !== input.orgId || sync.projectId !== input.projectId) {
      throw new NotFoundError({ message: `Secret sync with ID '${input.resourceId}' not found in this project` });
    }
    return sync;
  };

  // Without a resourceId there is nothing to bind-check: that is a test send from the create form, before
  // the sync exists. Creating an alert without one is refused earlier, since this provider has no
  // scope-wide alerts.
  const assertResourceInScope = async (input: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }): Promise<void> => {
    const projectId = $requireProject(input.projectId);
    if (!input.resourceId) return;
    await $loadInScopeSync({ orgId: input.orgId, projectId, resourceId: input.resourceId });
  };

  const assertPermission = async (input: TAlertPermissionInput): Promise<void> => {
    const projectId = $requireProject(input.projectId);
    const { permission } = await secretsPermissionService.getSecretsPermission({ actor: input.actor, projectId });

    if (!input.resourceId) {
      if (input.action !== AlertPermissionAction.Read) {
        // A test send for a sync that is still being created. It reads nothing back.
        permission.assert({
          action: ProjectPermissionSecretSyncActions.Create,
          subject: ProjectPermissionSub.SecretSyncs
        });
        return;
      }

      // Listing without a sync returns the alerts of every sync in the project, so a read limited to some
      // environments, paths or connections, or narrowed by a deny rule, would expose the rest.
      permission.assert({ action: ProjectPermissionSecretSyncActions.Read, subject: ProjectPermissionSub.SecretSyncs });
      const readRules = permission
        .toAbility()
        .rulesFor(ProjectPermissionSecretSyncActions.Read, ProjectPermissionSub.SecretSyncs);
      const canReadEverySync =
        readRules.some((rule) => !rule.inverted && !rule.conditions) && !readRules.some((rule) => rule.inverted);
      if (!canReadEverySync) {
        // Built by hand because the check above passes a partial read, and a denial is what the
        // permission-denied audit hook records.
        throw new PermissionDeniedError({
          denial: {
            action: ProjectPermissionSecretSyncActions.Read,
            subject: ProjectPermissionSub.SecretSyncs,
            matchedRules: readRules.map(({ action, inverted, subject, conditions }) => ({
              action,
              inverted,
              subject,
              conditions
            }))
          }
        });
      }
      return;
    }

    const sync = await $loadInScopeSync({ orgId: input.orgId, projectId, resourceId: input.resourceId });
    permission.assert({
      action:
        input.action === AlertPermissionAction.Read
          ? ProjectPermissionSecretSyncActions.Read
          : ProjectPermissionSecretSyncActions.Edit,
      subject: ProjectPermissionSub.SecretSyncs,
      fields: {
        ...(sync.envSlug && { environment: sync.envSlug }),
        ...(sync.secretPath && { secretPath: sync.secretPath }),
        connectionId: sync.connectionId
      }
    });
  };

  return {
    resourceType: SECRET_SYNC_RESOURCE_TYPE,
    events: [
      {
        key: SECRET_SYNC_FAILED_EVENT,
        triggerType: AlertTriggerType.Event,
        conditionSchema: SecretSyncFailedConditionSchema
      }
    ],
    findEventTargets,
    buildViewUrl,
    buildPayload,
    targetId: (target) => target.syncId,
    assertPermission,
    assertResourceInScope,
    recipientPolicy: { allowProjectAdmins: true },
    resolveProjectId: async ({ orgId, resourceId }) => {
      if (!resourceId) {
        throw new BadRequestError({ message: "Secret sync alerts must be managed within a project" });
      }
      const [sync] = await secretSyncAlertDAL.findSyncsByIds([resourceId]);
      if (!sync || sync.orgId !== orgId) {
        throw new NotFoundError({ message: `Secret sync with ID '${resourceId}' not found` });
      }
      return sync.projectId;
    },
    getResourceNames: async ({ orgId, resourceIds }) =>
      new Map((await secretSyncAlertDAL.findSyncNamesByIds(resourceIds, orgId)).map((sync) => [sync.id, sync.name]))
  };
};
