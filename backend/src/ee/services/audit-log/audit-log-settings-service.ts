import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, TAuditLogSettings } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import {
  OrgPermissionActions,
  OrgPermissionAuditLogsActions,
  OrgPermissionSubjects
} from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionSub
} from "../permission/project-permission";
import {
  AUDIT_LOG_EVENT_CLASS_DEFAULTS,
  AUDIT_LOG_EVENT_CLASSES,
  AuditLogEventClass,
  CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES,
  getAuditLogEventClass,
  isAlwaysRecordedEventClass,
  TConfigurableAuditLogEventClass
} from "./audit-log-event-classes";
import { TAuditLogSettingsDALFactory } from "./audit-log-settings-dal";
import {
  TAuditLogEventClassOverrides,
  TAuditLogEventClassSetting,
  TCachedOrgAuditLogSettings,
  TEffectiveAuditLogSettings,
  TGetOrgAuditLogSettingsDTO,
  TGetProjectAuditLogSettingsDTO,
  TUpdateOrgAuditLogSettingsDTO,
  TUpdateProjectAuditLogSettingsDTO
} from "./audit-log-settings-types";

type TAuditLogSettingsServiceFactoryDep = {
  auditLogSettingsDAL: Pick<TAuditLogSettingsDALFactory, "find" | "transaction" | "delete" | "insertMany">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  keyStore: Pick<TKeyStoreFactory, "getItems" | "setItemWithExpiry" | "deleteItem">;
};

export type TAuditLogSettingsServiceFactory = ReturnType<typeof auditLogSettingsServiceFactory>;

type TScope = Pick<TAuditLogSettings, "orgId" | "projectId">;
type TScopeRow = Pick<TAuditLogSettings, "projectId" | "eventClass" | "isEnabled">;
type TFullOverrides = Record<TConfigurableAuditLogEventClass, boolean>;

// No inheritance: a project without a row gets the default, not the org's value.
export const isAuditLogEventEnabled = (
  settings: TEffectiveAuditLogSettings | null,
  eventType: string,
  projectId?: string | null
) => {
  const eventClass = getAuditLogEventClass(eventType);
  if (isAlwaysRecordedEventClass(eventClass)) return true;
  if (!settings) return true;
  const scope = projectId ? settings.project : settings.org;
  return scope?.[eventClass] ?? AUDIT_LOG_EVENT_CLASS_DEFAULTS[eventClass];
};

const isKnownEventClass = (value: string): value is AuditLogEventClass =>
  (Object.values(AuditLogEventClass) as string[]).includes(value);

const toOverrides = (rows: TScopeRow[]): TAuditLogEventClassOverrides =>
  Object.fromEntries(
    rows.filter((row) => isKnownEventClass(row.eventClass)).map((row) => [row.eventClass, row.isEnabled])
  );

const toSettings = (overrides: TAuditLogEventClassOverrides): TAuditLogEventClassSetting[] =>
  AUDIT_LOG_EVENT_CLASSES.map((eventClass) => ({
    eventClass,
    isEnabled: isAlwaysRecordedEventClass(eventClass)
      ? true
      : (overrides[eventClass] ?? AUDIT_LOG_EVENT_CLASS_DEFAULTS[eventClass])
  }));

// Updates are full replacements, so every configurable class has to be sent exactly once.
const toFullOverrides = (eventClasses: TAuditLogEventClassSetting[]): TFullOverrides => {
  const alwaysRecorded = eventClasses.find((el) => isAlwaysRecordedEventClass(el.eventClass));
  if (alwaysRecorded) {
    throw new BadRequestError({
      message: `Event class '${alwaysRecorded.eventClass}' is always recorded and cannot be changed`
    });
  }
  const seen = new Set<AuditLogEventClass>();
  eventClasses.forEach((el) => {
    if (seen.has(el.eventClass)) {
      throw new BadRequestError({ message: `Event class '${el.eventClass}' appears more than once` });
    }
    seen.add(el.eventClass);
  });
  const missing = CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES.filter((eventClass) => !seen.has(eventClass));
  if (missing.length) {
    throw new BadRequestError({
      message: `Every event class except management and data-access must be included. Missing: ${missing.join(", ")}`
    });
  }
  return Object.fromEntries(eventClasses.map((el) => [el.eventClass, el.isEnabled])) as TFullOverrides;
};

// Legacy privilege orgs never record denials, so don't let them save a toggle that does nothing.
const assertAuthorizationClassAllowed = (
  org: { shouldUseNewPrivilegeSystem?: boolean | null },
  overrides: TFullOverrides
) => {
  if (overrides[AuditLogEventClass.Authorization] && !org.shouldUseNewPrivilegeSystem) {
    throw new BadRequestError({
      message:
        "Permission denials are only recorded for organizations on the new privilege system. Upgrade the privilege system under Access Control before turning on the authorization class."
    });
  }
};

export const auditLogSettingsServiceFactory = ({
  auditLogSettingsDAL,
  orgDAL,
  projectDAL,
  permissionService,
  keyStore
}: TAuditLogSettingsServiceFactoryDep) => {
  const findOrgOrThrow = async (orgId: string) => {
    const org = await orgDAL.findById(orgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    return org;
  };

  const findProjectOrThrow = async (projectId: string) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    return project;
  };

  const getOrgPermission = (actor: OrgServiceActor) =>
    permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });

  const toResponse = (
    overrides: TAuditLogEventClassOverrides,
    org: { shouldUseNewPrivilegeSystem?: boolean | null }
  ) => ({
    eventClasses: toSettings(overrides),
    shouldUseNewPrivilegeSystem: Boolean(org.shouldUseNewPrivilegeSystem)
  });

  const deleteCachedItem = async (key: string, scopeLog: string) => {
    try {
      await keyStore.deleteItem(key);
    } catch (error) {
      logger.warn(error, `audit-log-settings: failed to invalidate cached settings [${scopeLog}]`);
    }
  };

  const invalidateCache = (orgId: string) =>
    deleteCachedItem(KeyStorePrefixes.AuditLogOrgSettings(orgId), `orgId=${orgId}`);

  const invalidateScopeCache = (scope: TScope) =>
    scope.projectId
      ? deleteCachedItem(
          KeyStorePrefixes.AuditLogProjectSettings(scope.orgId, scope.projectId),
          `orgId=${scope.orgId}] [projectId=${scope.projectId}`
        )
      : invalidateCache(scope.orgId);

  const loadOrgSettings = async (orgId: string): Promise<TCachedOrgAuditLogSettings | null> => {
    const org = await orgDAL.findById(orgId);
    if (!org) return null;
    const rows = await auditLogSettingsDAL.find({ orgId, projectId: null });
    return {
      overrides: toOverrides(rows),
      shouldUseNewPrivilegeSystem: Boolean(org.shouldUseNewPrivilegeSystem)
    };
  };

  const loadProjectSettings = async (orgId: string, projectId: string): Promise<TAuditLogEventClassOverrides> =>
    toOverrides(await auditLogSettingsDAL.find({ orgId, projectId }));

  const readCachedItems = async (keys: string[]) => {
    try {
      return await keyStore.getItems(keys);
    } catch (error) {
      logger.warn(error, `audit-log-settings: failed to read cached settings [keys=${keys.join(",")}]`);
      return keys.map(() => null);
    }
  };

  const cacheItem = async (key: string, value: unknown) => {
    try {
      await keyStore.setItemWithExpiry(key, KeyStoreTtls.AuditLogSettingsInSeconds, JSON.stringify(value));
    } catch (error) {
      logger.warn(error, `audit-log-settings: failed to cache settings [key=${key}]`);
    }
  };

  const getEffectiveSettings = async (
    orgId: string,
    projectId?: string | null
  ): Promise<TEffectiveAuditLogSettings | null> => {
    const orgKey = KeyStorePrefixes.AuditLogOrgSettings(orgId);
    const projectKey = projectId ? KeyStorePrefixes.AuditLogProjectSettings(orgId, projectId) : undefined;

    try {
      const [cachedOrg, cachedProject] = await readCachedItems(projectKey ? [orgKey, projectKey] : [orgKey]);

      let orgSettings = cachedOrg ? (JSON.parse(cachedOrg) as TCachedOrgAuditLogSettings) : null;
      if (!orgSettings) {
        orgSettings = await loadOrgSettings(orgId);
        if (!orgSettings) return null;
        await cacheItem(orgKey, orgSettings);
      }

      let project: TAuditLogEventClassOverrides | undefined;
      if (projectId && projectKey) {
        project = cachedProject ? (JSON.parse(cachedProject) as TAuditLogEventClassOverrides) : undefined;
        if (!project) {
          project = await loadProjectSettings(orgId, projectId);
          await cacheItem(projectKey, project);
        }
      }

      return {
        org: orgSettings.overrides,
        project,
        shouldUseNewPrivilegeSystem: orgSettings.shouldUseNewPrivilegeSystem
      };
    } catch (error) {
      logger.warn(
        error,
        `audit-log-settings: failed to load settings, recording all events [orgId=${orgId}] [projectId=${projectId}]`
      );
      return null;
    }
  };

  const writeScopeSettings = async (scope: TScope, overrides: TFullOverrides) => {
    await auditLogSettingsDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [
        PgSqlLock.AuditLogSettingsUpdate(scope.projectId ?? scope.orgId)
      ]);
      await auditLogSettingsDAL.delete(scope, tx);
      await auditLogSettingsDAL.insertMany(
        CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES.map((eventClass) => ({
          ...scope,
          eventClass,
          isEnabled: overrides[eventClass]
        })),
        tx
      );
    });
    await invalidateScopeCache(scope);
  };

  const getOrgSettings = async ({ actor }: TGetOrgAuditLogSettingsDTO) => {
    const { permission } = await getOrgPermission(actor);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);
    const org = await findOrgOrThrow(actor.orgId);
    const rows = await auditLogSettingsDAL.find({ orgId: org.id, projectId: null });
    return toResponse(toOverrides(rows), org);
  };

  const updateOrgSettings = async ({ actor, eventClasses }: TUpdateOrgAuditLogSettingsDTO) => {
    const { permission } = await getOrgPermission(actor);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionAuditLogsActions.Edit, OrgPermissionSubjects.AuditLogs);
    const org = await findOrgOrThrow(actor.orgId);
    const overrides = toFullOverrides(eventClasses);
    assertAuthorizationClassAllowed(org, overrides);
    await writeScopeSettings({ orgId: org.id, projectId: null }, overrides);
    return toResponse(overrides, org);
  };

  const getProjectSettings = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId
  }: TGetProjectAuditLogSettingsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);

    const project = await findProjectOrThrow(projectId);
    const org = await findOrgOrThrow(project.orgId);
    const rows = await auditLogSettingsDAL.find({ orgId: org.id, projectId });
    return toResponse(toOverrides(rows), org);
  };

  const updateProjectSettings = async ({ eventClasses, ...dto }: TUpdateProjectAuditLogSettingsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId: dto.projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAuditLogsActions.Edit,
      ProjectPermissionSub.AuditLogs
    );

    const project = await findProjectOrThrow(dto.projectId);
    const org = await findOrgOrThrow(project.orgId);
    const overrides = toFullOverrides(eventClasses);
    assertAuthorizationClassAllowed(org, overrides);
    await writeScopeSettings({ orgId: org.id, projectId: project.id }, overrides);
    return toResponse(overrides, org);
  };

  return {
    getOrgSettings,
    updateOrgSettings,
    getProjectSettings,
    updateProjectSettings,
    getEffectiveSettings,
    invalidateCache
  };
};
