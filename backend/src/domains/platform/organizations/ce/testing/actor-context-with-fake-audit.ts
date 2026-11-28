import type { TActorContext, TActorContextBase } from "@app/domains/lib/actor-context";
import { FakeActorAuditConfig } from "@app/domains/lib/actor-context/testing/fake-actor-audit-config";
import type { TPrincipal } from "@app/lib/auth/principal";

import type { TActorContextService } from "../services/actor-context/service";

// This domain's service with the audit configuration the top level would add, faked, for tests that need full actor
// contexts without the server's ActorContextBuilder.
export class ActorContextServiceWithFakeAudit implements TActorContextService {
  constructor(private readonly actorContextService: TActorContextService<TActorContextBase>) {}

  findActorOrg(orgId: string) {
    return this.actorContextService.findActorOrg(orgId);
  }

  async forRequest(input: Parameters<TActorContextService["forRequest"]>[0]) {
    const { actor, ...rest } = await this.actorContextService.forRequest(input);
    return { ...rest, actor: ActorContextServiceWithFakeAudit.withAudit(actor) };
  }

  async forPrincipal(input: { principal: TPrincipal; orgId: string }) {
    return ActorContextServiceWithFakeAudit.withAudit(await this.actorContextService.forPrincipal(input));
  }

  async forSession(input: { principal: TPrincipal; orgId: string }) {
    return ActorContextServiceWithFakeAudit.withAudit(await this.actorContextService.forSession(input));
  }

  async system(input: { orgId: string }) {
    return ActorContextServiceWithFakeAudit.withAudit(await this.actorContextService.system(input));
  }

  private static withAudit(actor: TActorContextBase): TActorContext {
    return Object.assign(actor, { audit: new FakeActorAuditConfig() });
  }
}
