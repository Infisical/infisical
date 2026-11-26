import { validate as isUuid } from "uuid";

import type { TActorContext } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { platformPrincipal, TPrincipal } from "@app/lib/auth/principal";

import { FOREIGN_SSO_SESSION_ERROR_NAME, TSsoSessionRefusal } from "../../models/sso-policy";
import { TOrganizationStore } from "../dependencies";
import { TSsoSessionService } from "../sso-session/service";

export type TRequestActorContext = {
  actor: TActorContext;
  // Set when the sign-in policy refuses the session; the request is treated as signed out.
  ssoRefusal: TSsoSessionRefusal | null;
};

export type TActorContextService = {
  // For the auth middleware. Sessions not scoped to an existing org (none picked yet, or an API key) get an org
  // that throws when read.
  forRequest(input: { principal: TPrincipal; orgId: string | undefined }): Promise<TRequestActorContext>;
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
    private readonly ssoSessionService: TSsoSessionService
  ) {}

  async forRequest({ principal, orgId }: { principal: TPrincipal; orgId: string | undefined }) {
    const org = orgId && isUuid(orgId) ? await this.organizationStore.findActorOrg(orgId) : null;
    if (!org) return { actor: ActorContextService.unscoped(principal), ssoRefusal: null };
    const ssoRefusal = await this.ssoSessionService.findSsoSessionRefusal({ principal, org });
    return { actor: { principal, org }, ssoRefusal };
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

  // Non-enumerable so spreading req.permission doesn't hit the throwing org getter.
  private static unscoped(principal: TPrincipal): TActorContext {
    return Object.defineProperty({ principal }, "org", {
      enumerable: false,
      get: () => {
        throw notScopedToAnOrg();
      }
    }) as TActorContext;
  }
}
