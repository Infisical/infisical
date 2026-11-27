import { validate as isUuid } from "uuid";

import type { TActorContext, TActorOrg } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { isUserPrincipal, platformPrincipal, TPrincipal } from "@app/lib/auth/principal";

import { FOREIGN_SSO_SESSION_ERROR_NAME, TSsoSessionRefusal } from "../../models/sso-policy";
import { TActorOrgCache, TOrganizationStore } from "../dependencies";
import { TSsoSessionService } from "../sso-session/service";

export type TRequestActorContext = {
  actor: TActorContext;
  // Null when the request is not scoped to an existing org. Read this, not actor.org, to find out.
  org: TActorOrg | null;
  // Set when the sign-in policy refuses the session; the request is treated as signed out.
  ssoRefusal: TSsoSessionRefusal | null;
};

// One or the other, so a context can't be built from an org that isn't the one the id names.
export type TRequestOrg = { org: TActorOrg | null } | { orgId: string | undefined };

export type TActorContextService = {
  // The org a context is scoped to, read fresh. Null when it doesn't exist or the id isn't an org id. The user
  // session check reads it before forRequest and hands it over, so a request reads its org once.
  findActorOrg(orgId: string): Promise<TActorOrg | null>;
  // For the auth middleware. Sessions not scoped to an existing org (none picked yet, or an API key) get an org
  // that throws when read. Takes the org the request already read (null if it found none), or its id to read it
  // here, from a short-lived cache for anything but a user.
  forRequest(input: { principal: TPrincipal } & TRequestOrg): Promise<TRequestActorContext>;
  // For use outside a request. Throws if the org doesn't exist.
  forPrincipal(input: { principal: TPrincipal; orgId: string }): Promise<TActorContext>;
  // Like forPrincipal, but re-checks the sign-in policy for a user session used outside its own request (stream
  // refresh, callback, queued job, a check for another member using the requester's sign-in method).
  forSession(input: { principal: TPrincipal; orgId: string }): Promise<TActorContext>;
  // Platform work on nobody's behalf (queues, crons, consumers).
  system(input: { orgId: string }): Promise<TActorContext>;
};

const notScopedToAnOrg = () =>
  new RuleViolationError({
    message: "This request is not scoped to an organization. Select an organization and try again."
  });

export class ActorContextService implements TActorContextService {
  constructor(
    private readonly organizationStore: TOrganizationStore,
    private readonly ssoSessionService: TSsoSessionService,
    private readonly actorOrgCache: TActorOrgCache
  ) {}

  async findActorOrg(orgId: string) {
    return isUuid(orgId) ? this.organizationStore.findActorOrg(orgId) : null;
  }

  async forRequest({ principal, ...scope }: { principal: TPrincipal } & TRequestOrg) {
    const org = "org" in scope ? scope.org : await this.findRequestOrg(principal, scope.orgId);
    if (!org) return { actor: ActorContextService.unscoped(principal), org: null, ssoRefusal: null };
    const ssoRefusal = await this.ssoSessionService.findSsoSessionRefusal({ principal, org });
    return { actor: { principal, org }, org, ssoRefusal };
  }

  async forPrincipal({ principal, orgId }: { principal: TPrincipal; orgId: string }): Promise<TActorContext> {
    const org = await this.organizationStore.findActorOrg(orgId);
    if (!org) throw new EntityNotFoundError({ message: `Organization with ID '${orgId}' not found` });
    return { principal, org };
  }

  async forSession({ principal, orgId }: { principal: TPrincipal; orgId: string }): Promise<TActorContext> {
    const actor = await this.forPrincipal({ principal, orgId });
    const refusal = await this.ssoSessionService.findSsoSessionRefusal(actor);
    if (refusal) {
      throw new PermissionDeniedError({
        message: refusal.message,
        ...(refusal.name === FOREIGN_SSO_SESSION_ERROR_NAME ? { name: FOREIGN_SSO_SESSION_ERROR_NAME } : {})
      });
    }
    return actor;
  }

  system({ orgId }: { orgId: string }): Promise<TActorContext> {
    return this.forPrincipal({ principal: platformPrincipal(), orgId });
  }

  // A user's org carries the sign-in policy the session is checked against, so it is never served from the cache.
  private async findRequestOrg(principal: TPrincipal, orgId: string | undefined) {
    if (!orgId) return null;
    if (isUserPrincipal(principal)) return this.findActorOrg(orgId);
    return this.actorOrgCache.getOrLoad(orgId, () => this.findActorOrg(orgId));
  }

  // Non-enumerable so spreading req.actor doesn't hit the throwing org getter.
  private static unscoped(principal: TPrincipal): TActorContext {
    return Object.defineProperty({ principal }, "org", {
      enumerable: false,
      get: () => {
        throw notScopedToAnOrg();
      }
    }) as TActorContext;
  }
}
