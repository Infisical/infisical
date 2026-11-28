import type { TActorContext, TActorContextBase } from "@app/domains/lib/actor-context";
import type { TActorContextService } from "@app/domains/platform/organizations/ce/module";
import type { TPrincipal } from "@app/lib/auth/principal";

import { ActorAuditConfig } from "./actor-audit-config";
import type { TAuditConfigSource } from "./audit-config-source";

// The actor context every request, queue and cron gets. Organizations builds the principal and the org; this adds the
// org's audit configuration under `audit`, which needs the plan, projects and settings, none of which Organizations
// may depend on. Built once in routes/index.ts and handed out in place of Organizations' service.
export class ActorContextBuilder implements TActorContextService {
  constructor(
    private readonly actorContextService: TActorContextService<TActorContextBase>,
    private readonly auditConfigSource: TAuditConfigSource
  ) {}

  findActorOrg(orgId: string) {
    return this.actorContextService.findActorOrg(orgId);
  }

  async forRequest(input: Parameters<TActorContextService["forRequest"]>[0]) {
    const { actor, ...rest } = await this.actorContextService.forRequest(input);
    return { ...rest, actor: this.withAudit(actor) };
  }

  async forPrincipal(input: { principal: TPrincipal; orgId: string }) {
    return this.withAudit(await this.actorContextService.forPrincipal(input));
  }

  async forSession(input: { principal: TPrincipal; orgId: string }) {
    return this.withAudit(await this.actorContextService.forSession(input));
  }

  async system(input: { orgId: string }) {
    return this.withAudit(await this.actorContextService.system(input));
  }

  // Assigned onto the same object, not spread: an unscoped context's org is a getter that must stay unread.
  private withAudit(actor: TActorContextBase): TActorContext {
    return Object.assign(actor, { audit: new ActorAuditConfig(() => actor.org.id, this.auditConfigSource) });
  }
}
