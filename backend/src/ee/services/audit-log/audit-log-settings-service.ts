import { ForbiddenError } from "@casl/ability";

import {
  ActionProjectType,
  OrganizationActionScope,
  OrgMembershipRole,
  ProjectMembershipRole,
  TAuditLogSettings
} from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import {
  AUDIT_LOG_EVENT_CLASS_DEFAULTS,
  AUDIT_LOG_EVENT_CLASSES,
  AuditLogEventClass,
  CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES,
  getAuditLogEventClass,
  TConfigurableAuditLogEventClass
} from "./audit-log-event-classes";
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

type TAuditLogSettingsServiceFactoryDep = {
  auditLogSettingsDAL: Pick<TAuditLogSettingsDALFactory, "find" | "transaction" | "delete" | "insertMany">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
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
  if (eventClass === AuditLogEventClass.Management) return true;
  if (!settings) return true;
  const scope = projectId ? settings.projects[projectId] : settings.org;
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
    isEnabled:
      eventClass === AuditLogEventClass.Management
        ? true
        : (overrides[eventClass] ?? AUDIT_LOG_EVENT_CLASS_DEFAULTS[eventClass])
  }));

// Updates are full replacements, so every configurable class has to be sent exactly once.
const toFullOverrides = (eventClasses: TAuditLogEventClassSetting[]): TFullOverrides => {
  if (eventClasses.some((el) => el.eventClass === AuditLogEventClass.Management)) {
    throw new BadRequestError({ message: "Management events are always recorded and cannot be changed" });
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
      message: `Every event class except management must be included. Missing: ${missing.join(", ")}`
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

  const invalidateCache = async (orgId: string) => {
    await keyStore.deleteItem(KeyStorePrefixes.AuditLogOrgSettings(orgId));
  };

  const loadSettings = async (orgId: string): Promise<TEffectiveAuditLogSettings | null> => {
    const org = await orgDAL.findById(orgId);
    if (!org) return null;

    const rows = await auditLogSettingsDAL.find({ orgId });
    const projectRows = new Map<string, TScopeRow[]>();
    rows.forEach((row) => {
      if (!row.projectId) return;
      projectRows.set(row.projectId, [...(projectRows.get(row.projectId) ?? []), row]);
    });
    return {
      org: toOverrides(rows.filter((row) => !row.projectId)),
      projects: Object.fromEntries(
        [...projectRows].map(([projectId, scopeRows]) => [projectId, toOverrides(scopeRows)])
      ),
      shouldUseNewPrivilegeSystem: Boolean(org.shouldUseNewPrivilegeSystem)
    };
  };

  // Hot path: cached and never throws. If the lookup fails we just record everything.
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

  const writeScopeSettings = async (scope: TScope, overrides: TFullOverrides) => {
    await auditLogSettingsDAL.transaction(async (tx) => {
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
    await invalidateCache(scope.orgId);
  };

  const getOrgSettings = async ({ actor }: TGetOrgAuditLogSettingsDTO) => {
    const { permission } = await getOrgPermission(actor);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);
    const org = await findOrgOrThrow(actor.orgId);
    const rows = await auditLogSettingsDAL.find({ orgId: org.id, projectId: null });
    return toResponse(toOverrides(rows), org);
  };

  const updateOrgSettings = async ({ actor, eventClasses }: TUpdateOrgAuditLogSettingsDTO) => {
    const { hasRole } = await getOrgPermission(actor);
    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({
        message: "Only organization admins can change which audit log event classes are recorded"
      });
    }
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
