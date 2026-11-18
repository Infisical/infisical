import type { TActorContext } from "@app/domains/lib/actor-context";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { platformPrincipal, TPrincipal } from "@app/lib/auth/principal";

import { TSsoSessionRefusal } from "../../models/sso-policy";
import { TOrganizationStore } from "../dependencies";
import { TSsoSessionService } from "../sso-session/service";

export type TRequestActorContext = {
  actor: TActorContext;
  // Set when the org's sign-in policy refuses the session: the request is turned away as signed out.
  ssoRefusal: TSsoSessionRefusal | null;
};

export type TActorContextService = {
  // The context the auth middleware puts on a request. A session not yet scoped to an existing org (before one is
  // selected, or a deprecated API key) gets a context whose org refuses when used.
  forRequest(input: { principal: TPrincipal; orgId: string | undefined }): Promise<TRequestActorContext>;
  // The context for a user or identity acting in one org outside a request. Refuses an org that does not exist.
  forPrincipal(input: { principal: TPrincipal; orgId: string }): Promise<TActorContext>;
  // The context for work the platform does in an org on nobody's behalf: queues, crons, consumers.
  system(input: { orgId: string }): Promise<TActorContext>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const org = orgId && UUID_PATTERN.test(orgId) ? await this.organizationStore.findActorOrg(orgId) : null;
    if (!org) return { actor: ActorContextService.unscoped(principal), ssoRefusal: null };
    const ssoRefusal = await this.ssoSessionService.findSsoSessionRefusal({ principal, org });
    return { actor: { principal, org }, ssoRefusal };
  }

  async forPrincipal({ principal, orgId }: { principal: TPrincipal; orgId: string }): Promise<TActorContext> {
    const org = await this.organizationStore.findActorOrg(orgId);
    if (!org) throw new EntityNotFoundError({ message: `Organization with ID '${orgId}' not found` });
    return { principal, org };
  }

  system({ orgId }: { orgId: string }): Promise<TActorContext> {
    return this.forPrincipal({ principal: platformPrincipal(), orgId });
  }

  // org is non-enumerable and throws on read, so spreading req.permission never trips it.
  private static unscoped(principal: TPrincipal): TActorContext {
    return Object.defineProperty({ principal }, "org", {
      enumerable: false,
      get: () => {
        throw notScopedToAnOrg();
      }
    }) as TActorContext;
  }
}
