import { OrgMembershipRole } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityServiceFactory } from "@app/services/identity/identity-service";
import { TIdentityUaServiceFactory } from "@app/services/identity-ua/identity-ua-service";

/**
 * Every sandbox gets its own machine identity. PAM sessions are then attributable to one sandbox
 * rather than to a shared operator account, and revoking a sandbox revokes its access with it.
 */

export type TSandboxIdentityDeps = {
  identityService: Pick<TIdentityServiceFactory, "createIdentity" | "deleteIdentity">;
  identityUaService: Pick<TIdentityUaServiceFactory, "attachUniversalAuth" | "createUniversalAuthClientSecret">;
};

export type TProvisionedIdentity = {
  identityId: string;
  clientId: string;
  clientSecret: string;
};

/** Long enough for a sandbox session, short enough that a leaked token is not a standing grant. */
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const CLIENT_SECRET_TTL_SECONDS = 0; // never expires; the identity is deleted with the sandbox
const ANY_IP = [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }];

export const provisionSandboxIdentity = async (
  { identityService, identityUaService }: TSandboxIdentityDeps,
  sandboxName: string,
  actor: OrgServiceActor
): Promise<TProvisionedIdentity> => {
  const actorContext = {
    actor: actor.type as ActorType,
    actorId: actor.id,
    actorAuthMethod: actor.authMethod,
    actorOrgId: actor.orgId
  };

  const identity = await identityService.createIdentity({
    ...actorContext,
    orgId: actor.orgId,
    name: `sandbox-${sandboxName}`,
    role: OrgMembershipRole.NoAccess,
    hasDeleteProtection: false
  });

  const universalAuth = await identityUaService.attachUniversalAuth({
    ...actorContext,
    identityId: identity.id,
    accessTokenTTL: ACCESS_TOKEN_TTL_SECONDS,
    accessTokenMaxTTL: ACCESS_TOKEN_TTL_SECONDS,
    accessTokenNumUsesLimit: 0,
    accessTokenPeriod: 0,
    accessTokenTrustedIps: ANY_IP,
    clientSecretTrustedIps: ANY_IP,
    lockoutEnabled: false,
    lockoutThreshold: 3,
    lockoutDurationSeconds: 300,
    lockoutCounterResetSeconds: 30
  });

  const { clientSecret } = await identityUaService.createUniversalAuthClientSecret({
    ...actorContext,
    identityId: identity.id,
    description: `Infisical Sandbox ${sandboxName}`,
    numUsesLimit: 0,
    ttl: CLIENT_SECRET_TTL_SECONDS
  });

  return { identityId: identity.id, clientId: universalAuth.clientId, clientSecret };
};

export const deprovisionSandboxIdentity = async (
  { identityService }: TSandboxIdentityDeps,
  identityId: string,
  actor: OrgServiceActor
) => {
  await identityService.deleteIdentity({
    actor: actor.type as ActorType,
    actorId: actor.id,
    actorAuthMethod: actor.authMethod,
    actorOrgId: actor.orgId,
    id: identityId
  });
};
