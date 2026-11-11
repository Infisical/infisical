import type { TPlanProps } from "@app/domains/platform/license/ce/module";
import { platformPrincipal, type TPrincipal } from "@app/lib/auth/principal";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

// The root org's sign-in policy, which every session in the org tree must satisfy.
export type TActorOrgSsoPolicy = {
  authEnforced: boolean;
  googleSsoAuthEnforced: boolean;
  bypassOrgAuthEnabled: boolean;
};

export type TActorOrg = {
  id: string;
  name: string;
  // The org itself for a root org.
  rootOrgId: string;
  parentOrgId: string;
  shouldUseNewPrivilegeSystem: boolean;
  ssoPolicy: TActorOrgSsoPolicy;
};

// Who is acting and in which org, built once per request by the auth middleware (req.permission) and by
// systemContext for background jobs. The project is not here: a permission function loads it from the id
// it is given, because the project depends on the call, not the request.
export type TActorContext = {
  principal: TPrincipal;
  org: TActorOrg;
  // Fetched on first call and kept for the rest of the request.
  plan: () => Promise<TPlanProps>;
};

export const memoizePlan = (load: () => Promise<TPlanProps>): (() => Promise<TPlanProps>) => {
  let pending: Promise<TPlanProps> | undefined;
  return () => {
    if (!pending) {
      pending = load().catch((error: unknown) => {
        pending = undefined;
        throw error;
      });
    }
    return pending;
  };
};

// Where an actor context's org and plan come from: Organizations & Projects and License, wired in domains.ts.
export type TActorContextSources = {
  findActorOrg: (orgId: string) => Promise<TActorOrg | undefined>;
  getPlan: (orgId: string) => Promise<TPlanProps>;
  // Refuses a request whose session the org's sign-in policy does not allow (SSO enforcement).
  assertSessionAllowed: (input: { principal: TPrincipal; org: TActorOrg }) => Promise<void>;
};

export type TActorContexts = {
  // The context for a principal acting in one org. Refuses an org that does not exist.
  forPrincipal: (principal: TPrincipal, orgId: string) => Promise<TActorContext>;
  // The context the auth middleware puts on a request, after the org's sign-in policy admits the session. A session
  // not yet scoped to an existing org (before an org is selected, or a deprecated API key) gets a context whose org
  // and plan refuse when used.
  forRequest: (principal: TPrincipal, orgId: string | undefined) => Promise<TActorContext>;
  // The context for work the platform does in an org on nobody's behalf: queues, crons, consumers.
  system: (orgId: string) => Promise<TActorContext>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notScopedToAnOrg = () =>
  new BadRequestError({
    message: "This request is not scoped to an organization. Select an organization and try again."
  });

// org is non-enumerable and throws on read, so spreading req.permission never trips it.
const unscopedContext = (principal: TPrincipal): TActorContext =>
  Object.defineProperty({ principal, plan: () => Promise.reject(notScopedToAnOrg()) }, "org", {
    enumerable: false,
    get: () => {
      throw notScopedToAnOrg();
    }
  }) as TActorContext;

export const actorContexts = (sources: TActorContextSources): TActorContexts => {
  const scoped = (principal: TPrincipal, org: TActorOrg): TActorContext => ({
    principal,
    org,
    plan: memoizePlan(() => sources.getPlan(org.id))
  });
  const forPrincipal = async (principal: TPrincipal, orgId: string): Promise<TActorContext> => {
    const org = await sources.findActorOrg(orgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    return scoped(principal, org);
  };
  const forRequest = async (principal: TPrincipal, orgId: string | undefined): Promise<TActorContext> => {
    const org = orgId && UUID_PATTERN.test(orgId) ? await sources.findActorOrg(orgId) : undefined;
    if (!org) return unscopedContext(principal);
    await sources.assertSessionAllowed({ principal, org });
    return scoped(principal, org);
  };
  return { forPrincipal, forRequest, system: (orgId) => forPrincipal(platformPrincipal(), orgId) };
};
