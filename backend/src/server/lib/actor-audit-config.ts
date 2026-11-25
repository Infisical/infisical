import { requestContext } from "@fastify/request-context";

import type {
  TActorAuditConfig,
  TAuditEventClassSwitches,
  TAuditOrigin,
  TOrgAuditConfig,
  TProjectAuditConfig
} from "@app/domains/lib/actor-context";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";

import { getUserAgentType } from "../plugins/audit-log";
import type { TAuditConfigSource } from "./audit-config-source";

const once = <T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> => {
  const existing = cache.get(key);
  if (existing) return existing;
  const loading = load();
  cache.set(key, loading);
  // A failure isn't remembered: the next call in the context tries again.
  loading.catch(() => cache.delete(key));
  return loading;
};

// One actor context's audit configuration. Loads on first use and remembers the answer for the life of the context;
// the cache lives on this object, so `{ ...actor }` copies share it. The org id is read lazily because an unscoped
// context's org throws when read, and that refusal is the right answer here too.
export class ActorAuditConfig implements TActorAuditConfig {
  private readonly orgs = new Map<string, Promise<TOrgAuditConfig>>();

  private readonly projects = new Map<string, Promise<TProjectAuditConfig | null>>();

  private readonly classes = new Map<string, Promise<TAuditEventClassSwitches>>();

  constructor(
    private readonly orgIdOf: () => string,
    private readonly auditConfigSource: TAuditConfigSource
  ) {}

  org(): Promise<TOrgAuditConfig> {
    const orgId = this.orgIdOf();
    return once(this.orgs, orgId, () => this.auditConfigSource.forOrg(orgId));
  }

  project(projectId: string): Promise<TProjectAuditConfig | null> {
    const orgId = this.orgIdOf();
    return once(this.projects, projectId, () => this.auditConfigSource.forProject(orgId, projectId));
  }

  eventClasses(projectId?: string): Promise<TAuditEventClassSwitches> {
    const orgId = this.orgIdOf();
    return once(this.classes, projectId ?? "", () => this.auditConfigSource.eventClasses(orgId, projectId));
  }

  // Read when recording, not when the context is built: the actor's project attributes are set as its project
  // access is resolved, later in the request. Empty outside a request.
  // eslint-disable-next-line class-methods-use-this
  origin(): TAuditOrigin {
    const userAgent = requestContext.get(RequestContextKey.UserAgent);
    const ipAddress = requestContext.get(RequestContextKey.Ip);
    const permissionMetadata = requestContext.get(RequestContextKey.IdentityPermissionMetadata);
    if (ipAddress === undefined && userAgent === undefined) return {};
    return {
      ipAddress,
      userAgent: userAgent ?? "",
      userAgentType: getUserAgentType(userAgent),
      ...(permissionMetadata ? { permissionMetadata } : {})
    };
  }
}
