import { ForbiddenError, subject } from "@casl/ability";
import { z } from "zod";

import { ActionProjectType, SecretType } from "@app/db/schemas";
import { throwIfMissingSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import {
  SECRET_REMINDER_DUE_EVENT,
  SECRET_REMINDER_RESOURCE_TYPE,
  SecretReminderDuePayloadSchema
} from "@app/services/reminder/reminder-events";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TAlertPayload } from "../alert-channel-types";
import {
  AlertPermissionAction,
  AlertTriggerType,
  IEventAlertProvider,
  TAlertContext,
  TAlertPermissionInput,
  TFindTargetsByIdsInput
} from "../alert-types";
import { TReminderSecret, TSecretReminderAlertDALFactory } from "./secret-reminder-alert-dal";

export { SECRET_REMINDER_DUE_EVENT, SECRET_REMINDER_RESOURCE_TYPE };

const SecretReminderConditionSchema = z.object({}).nullish();

export type TSecretReminderTarget = TReminderSecret & {
  secretPath: string;
  note: string | null;
  repeatDays: number | null;
  occurrenceDate: string;
};

export type TSecretReminderAlertProviderDep = {
  secretReminderAlertDAL: Pick<TSecretReminderAlertDALFactory, "findReminderSecrets" | "primaryNode">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

const describeSchedule = (repeatDays: number | null): string => {
  if (!repeatDays) return "One time";
  return repeatDays === 1 ? "Every day" : `Every ${repeatDays} days`;
};

const formatDate = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  });

export const secretReminderAlertProviderFactory = ({
  secretReminderAlertDAL,
  folderDAL,
  permissionService
}: TSecretReminderAlertProviderDep): IEventAlertProvider<TSecretReminderTarget> => {
  const $loadSecretsWithPath = async (secretIds: string[]) => {
    const secrets = await secretReminderAlertDAL.findReminderSecrets(secretIds);
    const paths = new Map<string, string>();
    const folderIdsByProject = new Map<string, string[]>();
    secrets.forEach((secret) => {
      folderIdsByProject.set(secret.projectId, [...(folderIdsByProject.get(secret.projectId) ?? []), secret.folderId]);
    });
    for (const [projectId, folderIds] of folderIdsByProject) {
      // The path decides what a permission check allows, so it comes from the primary like the secret:
      // a replica that has not seen a new folder would otherwise leave it unresolved.
      // eslint-disable-next-line no-await-in-loop -- reminders fire per secret, so this is one project
      const folders = await folderDAL.findSecretPathByFolderIds(
        projectId,
        folderIds,
        secretReminderAlertDAL.primaryNode()
      );
      folders.forEach((folder) => {
        if (folder?.path) paths.set(folder.id, folder.path);
      });
    }
    // A secret whose path cannot be resolved is left out rather than treated as sitting at the root,
    // which would check permissions against the wrong path.
    return secrets.flatMap((secret) => {
      const secretPath = paths.get(secret.folderId);
      return secretPath ? [{ ...secret, secretPath }] : [];
    });
  };

  const findTargetsByIds = async (input: TFindTargetsByIdsInput): Promise<TSecretReminderTarget[]> => {
    if (input.eventType !== SECRET_REMINDER_DUE_EVENT) return [];

    const parsed = SecretReminderDuePayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new Error(
        `Unreadable '${SECRET_REMINDER_DUE_EVENT}' payload: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join(", ")}`
      );
    }

    const secrets = await $loadSecretsWithPath(input.targetIds);
    return secrets
      .filter(
        (secret) =>
          secret.orgId === input.orgId &&
          secret.projectId === input.projectId &&
          secret.secretType === SecretType.Shared
      )
      .map((secret) => ({
        ...secret,
        note: parsed.data.note ?? null,
        repeatDays: parsed.data.repeatDays ?? null,
        occurrenceDate: parsed.data.occurrenceDate
      }));
  };

  const buildViewUrl = async (alert: TAlertContext): Promise<string> => {
    const base = `${getConfig().SITE_URL}/organizations/${alert.orgId}/projects/secret-management/${alert.projectId}/overview`;
    if (!alert.resourceId) return base;

    const [secret] = await $loadSecretsWithPath([alert.resourceId]);
    if (!secret) return base;

    const query = new URLSearchParams({
      secretPath: secret.secretPath,
      environments: JSON.stringify([secret.envSlug]),
      search: secret.secretKey
    });
    return `${base}?${query.toString()}`;
  };

  // Uses the secret's current key rather than the alert's stored name, which goes stale on a rename.
  const buildPayload = (alert: TAlertContext, targets: TSecretReminderTarget[], viewUrl: string): TAlertPayload => {
    const [first] = targets;
    return {
      alert: {
        id: alert.id,
        name: alert.name,
        orgId: alert.orgId,
        ...(alert.projectId ? { projectId: alert.projectId } : {}),
        resourceType: alert.resourceType,
        ...(first ? { condition: describeSchedule(first.repeatDays) } : {}),
        viewUrl
      },
      eventKey: SECRET_REMINDER_DUE_EVENT,
      eventLabel: "Reminder",
      webhookType: "com.infisical.secret.reminder.due",
      resourceKind: "Secret",
      resourceOwnerKind: "Secret",
      severity: "info",
      summary: first ? `Reminder for secret '${first.secretKey}' in ${first.envName}` : "Secret reminder",
      items: targets.map((target) => ({
        id: `${target.secretId}:${target.occurrenceDate}`,
        title: target.secretKey,
        fields: [
          { label: "Environment", value: target.envName },
          { label: "Path", value: target.secretPath },
          { label: "Schedule", value: describeSchedule(target.repeatDays) },
          { label: "Due", value: formatDate(target.occurrenceDate) },
          ...(target.note ? [{ label: "Note", value: target.note }] : [])
        ]
      }))
    };
  };

  const $loadInScopeSecret = async (input: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }) => {
    if (!input.projectId) {
      throw new BadRequestError({ message: "Secret reminders must be managed within a project" });
    }
    if (!input.resourceId) {
      // A reminder alert's name carries its secret key, so a listing across a project would reveal keys
      // the caller may not be allowed to see.
      throw new BadRequestError({ message: "Secret reminders can only be managed for a single secret" });
    }
    const [secret] = await $loadSecretsWithPath([input.resourceId]);
    if (!secret || secret.orgId !== input.orgId || secret.projectId !== input.projectId) {
      throw new NotFoundError({ message: `Secret with ID '${input.resourceId}' not found in this project` });
    }
    if (secret.secretType !== SecretType.Shared) {
      throw new BadRequestError({ message: "Reminders can only be set on shared secrets" });
    }
    return secret;
  };

  const assertResourceInScope = async (input: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }): Promise<void> => {
    await $loadInScopeSecret(input);
  };

  const assertPermission = async (input: TAlertPermissionInput): Promise<void> => {
    const secret = await $loadInScopeSecret(input);
    const { permission } = await permissionService.getProjectPermission({
      actor: input.actor.actor,
      actorId: input.actor.actorId,
      projectId: secret.projectId,
      actorAuthMethod: input.actor.actorAuthMethod,
      actorOrgId: input.actor.actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    const subjectFields = {
      environment: secret.envSlug,
      secretPath: secret.secretPath,
      secretName: secret.secretKey,
      secretTags: secret.tagSlugs
    };

    if (input.action === AlertPermissionAction.Read) {
      throwIfMissingSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.DescribeSecret,
        subjectFields
      );
      return;
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Edit,
      subject(ProjectPermissionSub.Secrets, subjectFields)
    );
  };

  return {
    resourceType: SECRET_REMINDER_RESOURCE_TYPE,
    events: [
      {
        key: SECRET_REMINDER_DUE_EVENT,
        triggerType: AlertTriggerType.Event,
        conditionSchema: SecretReminderConditionSchema
      }
    ],
    findTargetsByIds,
    buildViewUrl,
    buildPayload,
    targetId: (target) => `${target.secretId}:${target.occurrenceDate}`,
    assertPermission,
    assertResourceInScope
  };
};
