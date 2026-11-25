import type { TAuditEventClassSwitches, TOrgAuditConfig, TProjectAuditConfig } from "@app/domains/lib/actor-context";
import { AUDIT_LOG_EVENT_CLASS_DEFAULTS, AuditLogEventClass } from "@app/domains/platform/audit-log/ce/module";
import type { TLicenseService } from "@app/domains/platform/license/ce/module";
import type { TAuditLogSettingsServiceFactory } from "@app/ee/services/audit-log/audit-log-settings-service";
import { KeyStorePrefixes, KeyStoreTtls, type TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";
import type { TProjectDALFactory } from "@app/services/project/project-dal";

export type TProjectAuditConfigWithOrg = TProjectAuditConfig & { orgId: string };

export type TAuditConfigSource = {
  forOrg(orgId: string): Promise<TOrgAuditConfig>;
  forProject(orgId: string, projectId: string): Promise<TProjectAuditConfig | null>;
  eventClasses(orgId: string, projectId?: string): Promise<TAuditEventClassSwitches>;
  // For the legacy writer, which may know only the project: its org, name and retention. null when it's gone.
  findProjectConfig(projectId: string): Promise<TProjectAuditConfigWithOrg | null>;
};

// Where the audit configuration actually lives today: the plan, the project row and the audit log settings. The only
// code that knows; when retention and settings move to their owning domains, only this file changes.
export class AuditConfigSource implements TAuditConfigSource {
  constructor(
    private readonly licenseService: Pick<TLicenseService, "getPlan">,
    private readonly projectDAL: Pick<TProjectDALFactory, "findById">,
    private readonly auditLogSettingsService: Pick<TAuditLogSettingsServiceFactory, "getEffectiveSettings">,
    private readonly keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">
  ) {}

  async forOrg(orgId: string): Promise<TOrgAuditConfig> {
    const plan = await this.licenseService.getPlan(orgId);
    return { retentionDays: plan.auditLogsRetentionDays };
  }

  async forProject(orgId: string, projectId: string): Promise<TProjectAuditConfig | null> {
    const project = await this.findProjectConfig(projectId);
    if (!project || project.orgId !== orgId) return null;
    return { name: project.name, retentionDays: project.retentionDays };
  }

  // A project's own settings replace the org's for its events, falling back to the defaults, as the legacy writer
  // decided. Settings that can't be read record every class.
  async eventClasses(orgId: string, projectId?: string): Promise<TAuditEventClassSwitches> {
    const settings = await this.auditLogSettingsService.getEffectiveSettings(orgId, projectId);
    if (!settings) return { authentication: true, authorization: true };
    const scope = projectId ? settings.project : settings.org;
    const isOn = (eventClass: AuditLogEventClass) => scope?.[eventClass] ?? AUDIT_LOG_EVENT_CLASS_DEFAULTS[eventClass];
    return {
      authentication: isOn(AuditLogEventClass.Authentication),
      authorization: isOn(AuditLogEventClass.Authorization)
    };
  }

  // Cleared when the project's name or retention changes (project-service).
  async findProjectConfig(projectId: string): Promise<TProjectAuditConfigWithOrg | null> {
    const key = KeyStorePrefixes.AuditLogProjectConfig(projectId);
    const cached = await this.keyStore.getItem(key).catch((error: unknown) => {
      logger.warn(error, `audit-config-source: failed to read the project cache [projectId=${projectId}]`);
      return null;
    });
    if (cached) return JSON.parse(cached) as TProjectAuditConfigWithOrg;

    const project = await this.projectDAL.findById(projectId);
    if (!project) return null;
    const config: TProjectAuditConfigWithOrg = {
      orgId: project.orgId,
      name: project.name,
      retentionDays: project.auditLogsRetentionDays ?? null
    };
    await this.keyStore
      .setItemWithExpiry(key, KeyStoreTtls.AuditLogSettingsInSeconds, JSON.stringify(config))
      .catch((error: unknown) => {
        logger.warn(error, `audit-config-source: failed to cache the project [projectId=${projectId}]`);
      });
    return config;
  }
}
