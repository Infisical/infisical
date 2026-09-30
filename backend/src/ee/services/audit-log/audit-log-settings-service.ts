import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, OrganizationActionScope, ProjectMembershipRole } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { AUDIT_LOG_EVENT_CLASS_DEFAULTS, AuditLogEventClass, getAuditLogEventClass } from "./audit-log-event-classes";
import { TAuditLogSettingsDALFactory } from "./audit-log-settings-dal";
import {
  TAuditLogEventClassOverrides,
  TAuditLogEventClassSetting,
  TEffectiveAuditLogSettings,
  TGetOrgAuditLogSettingsDTO,
  TGetProjectAuditLogSettingsDTO,
  TUpdateOrgAuditLogSettingsDTO,
  TUpdateProjectAuditLogSettingsDTO
} from "./audit-log-settings-types";
import { EventType } from "./audit-log-types";

type TAuditLogSettingsServiceFactoryDep = {
  auditLogSettingsDAL: TAuditLogSettingsDALFactory;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
};

export type TAuditLogSettingsServiceFactory = ReturnType<typeof auditLogSettingsServiceFactory>;

const ORDERED_EVENT_CLASSES = [
  AuditLogEventClass.Management,
  AuditLogEventClass.DataAccess,
  AuditLogEventClass.Authentication,
  AuditLogEventClass.Authorization
] as const;

// Scopes don't inherit. A project without a row gets the default, not its org's value.
export const isAuditLogEventEnabled = (
  settings: TEffectiveAuditLogSettings | null,
  eventType: string,
  projectId?: string | null
) => {
  if (eventType === EventType.UPDATE_AUDIT_LOG_SETTINGS) return true;
  if (!settings) return true;
  const eventClass = getAuditLogEventClass(eventType);
  const scope = projectId ? settings.projects[projectId] : settings.org;
  return scope?.[eventClass] ?? AUDIT_LOG_EVENT_CLASS_DEFAULTS[eventClass];
};

const isKnownEventClass = (value: string): value is AuditLogEventClass =>
  (Object.values(AuditLogEventClass) as string[]).includes(value);

const toSettings = (overrides: TAuditLogEventClassOverrides): TAuditLogEventClassSetting[] =>
  ORDERED_EVENT_CLASSES.map((eventClass) => ({
    eventClass,
    isEnabled: overrides[eventClass] ?? AUDIT_LOG_EVENT_CLASS_DEFAULTS[eventClass]
  }));

export const auditLogSettingsServiceFactory = ({
  auditLogSettingsDAL,
  orgDAL,
  projectDAL,
  permissionService,
  keyStore
}: TAuditLogSettingsServiceFactoryDep) => {
  const invalidateCache = async (orgId: string) => {
    await keyStore.deleteItem(KeyStorePrefixes.AuditLogOrgSettings(orgId));
  };

  const loadSettings = async (orgId: string): Promise<TEffectiveAuditLogSettings | null> => {
    const org = await orgDAL.findById(orgId);
    if (!org) return null;

    const rows = await auditLogSettingsDAL.findByOrgIds([orgId]);
    const settings: TEffectiveAuditLogSettings = {
      org: {},
      projects: {},
      shouldUseNewPrivilegeSystem: Boolean(org.shouldUseNewPrivilegeSystem)
    };
    rows.forEach((row) => {
      if (!isKnownEventClass(row.eventClass)) return;
      if (row.projectId) {
        settings.projects[row.projectId] = { ...settings.projects[row.projectId], [row.eventClass]: row.isEnabled };
      } else {
        settings.org[row.eventClass] = row.isEnabled;
      }
    });
    return settings;
  };

  // Hot path (every event and every denial), so it's cached and never throws. A failed
  // lookup means record everything, as before.
  const getEffectiveSettings = async (orgId: string): Promise<TEffectiveAuditLogSettings | null> => {
    const cacheKey = KeyStorePrefixes.AuditLogOrgSettings(orgId);
    try {
      const cached = await keyStore.getItem(cacheKey);
      if (cached) return JSON.parse(cached) as TEffectiveAuditLogSettings;
    } catch (error) {
      logger.warn(error, `audit-log-settings: failed to read cached settings [orgId=${orgId}]`);
    }

    try {
      const settings = await loadSettings(orgId);
      if (settings) {
        await keyStore.setItemWithExpiry(cacheKey, KeyStoreTtls.AuditLogOrgSettingsInSeconds, JSON.stringify(settings));
      }
      return settings;
    } catch (error) {
      logger.warn(error, `audit-log-settings: failed to load settings, recording all events [orgId=${orgId}]`);
      return null;
    }
  };

  const writeScopeSettings = async (
    scope: { orgId: string; projectId: string | null },
    changed: [AuditLogEventClass, boolean][]
  ): Promise<TAuditLogEventClassOverrides> => {
    const changedClasses = changed.map(([eventClass]) => eventClass);
    const rows = await auditLogSettingsDAL.transaction(async (tx) => {
      const existing = await auditLogSettingsDAL.find(scope, { tx });
      await auditLogSettingsDAL.delete({ ...scope, $in: { eventClass: changedClasses } }, tx);
      const inserted = await auditLogSettingsDAL.insertMany(
        changed.map(([eventClass, isEnabled]) => ({ ...scope, eventClass, isEnabled })),
        tx
      );
      return [...existing.filter((row) => !changedClasses.includes(row.eventClass as AuditLogEventClass)), ...inserted];
    });
    await invalidateCache(scope.orgId);

    const overrides: TAuditLogEventClassOverrides = {};
    rows.forEach((row) => {
      if (isKnownEventClass(row.eventClass)) overrides[row.eventClass] = row.isEnabled;
    });
    return overrides;
  };

  const getOrgSettings = async ({ actor }: TGetOrgAuditLogSettingsDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);

    const settings = await loadSettings(actor.orgId);
    if (!settings) throw new NotFoundError({ message: `Organization with ID '${actor.orgId}' not found` });

    return {
      eventClasses: toSettings(settings.org),
      shouldUseNewPrivilegeSystem: settings.shouldUseNewPrivilegeSystem
    };
  };

  const updateOrgSettings = async ({ actor, eventClasses }: TUpdateOrgAuditLogSettingsDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    const org = await orgDAL.findById(actor.orgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${actor.orgId}' not found` });

    const changed = [...new Map(eventClasses.map((el) => [el.eventClass, el.isEnabled])).entries()];
    if (!changed.length) return getOrgSettings({ actor });

    const overrides = await writeScopeSettings({ orgId: actor.orgId, projectId: null }, changed);
    return {
      eventClasses: toSettings(overrides),
      shouldUseNewPrivilegeSystem: Boolean(org.shouldUseNewPrivilegeSystem)
    };
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

    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });

    const settings = await loadSettings(project.orgId);
    if (!settings) throw new NotFoundError({ message: `Organization with ID '${project.orgId}' not found` });

    return {
      eventClasses: toSettings(settings.projects[projectId] ?? {}),
      shouldUseNewPrivilegeSystem: settings.shouldUseNewPrivilegeSystem
    };
  };

  const updateProjectSettings = async ({ eventClasses, ...dto }: TUpdateProjectAuditLogSettingsDTO) => {
    const { hasRole } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId: dto.projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({
        message: "Only project admins can change which audit log event classes are recorded"
      });
    }

    const project = await projectDAL.findById(dto.projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${dto.projectId}' not found` });

    const org = await orgDAL.findById(project.orgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${project.orgId}' not found` });

    const changed = [...new Map(eventClasses.map((el) => [el.eventClass, el.isEnabled])).entries()];
    if (!changed.length) return getProjectSettings(dto);

    const overrides = await writeScopeSettings({ orgId: project.orgId, projectId: dto.projectId }, changed);
    return {
      eventClasses: toSettings(overrides),
      shouldUseNewPrivilegeSystem: Boolean(org.shouldUseNewPrivilegeSystem)
    };
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
