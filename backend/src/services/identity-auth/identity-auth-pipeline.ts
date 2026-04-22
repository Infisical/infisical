import { requestContext } from "@fastify/request-context";
import { Knex } from "knex";

import { AccessScope, IdentityAuthMethod, TIdentities, TIdentityAccessTokens, TOrganizations } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { AuthAttemptAuthMethod, AuthAttemptAuthResult, authAttemptCounter } from "@app/lib/telemetry/metrics";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import {
  TAWSAuthDetails,
  TIdentityAccessTokenJwtPayload,
  TKubernetesAuthDetails,
  TOidcAuthDetails
} from "../identity-access-token/identity-access-token-types";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "../org/org-dal";

export type TLoginCtx = {
  identity: TIdentities;
  org: TOrganizations;
};

export type TValidateResult = {
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  /** Only used by Universal Auth — periodic token TTL */
  accessTokenPeriod?: number;
  identityAuth?: {
    aws?: TAWSAuthDetails;
    kubernetes?: TKubernetesAuthDetails;
    oidc?: TOidcAuthDetails;
  };
  /** Only used by Universal Auth — carried in JWT for token renewal passthrough */
  clientSecretId?: string;
  /**
   * Optional hook called inside the transaction, before the access token row is created.
   * May return extra fields to be merged into identityAccessTokenDAL.create().
   * Used by Universal Auth to atomically increment client secret usage and capture the secret doc ID.
   */
  onBeforeTokenCreate?: (tx: Knex) => Promise<Record<string, unknown> | void>;
};

export type TIdentityAuthLoginStrategy<TPayload = unknown, TAuthConfig = undefined> = {
  authMethod: IdentityAuthMethod;
  telemetryAuthMethod: AuthAttemptAuthMethod;
  validate(payload: TPayload, ctx: TLoginCtx): Promise<TValidateResult & { authConfig: TAuthConfig }>;
};

export type TLoginDeps = {
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne" | "findEffectiveOrgMembership">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "transaction">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "update">;
};

export type TLoginResult<TAuthConfig = undefined> = {
  accessToken: string;
  identity: TIdentities;
  identityAccessToken: TIdentityAccessTokens;
  authConfig: TAuthConfig;
};

export const loadLoginContext = async (identityId: string, deps: Pick<TLoginDeps, "identityDAL" | "orgDAL">) => {
  const identity = await deps.identityDAL.findById(identityId);
  if (!identity) throw new NotFoundError({ message: `Identity with ID '${identityId}' not found` });

  const org = await deps.orgDAL.findById(identity.orgId);
  if (!org) throw new NotFoundError({ message: `Organization for identity '${identityId}' not found` });

  return { identity, org };
};

export const resolveSubOrg = async (
  identity: TIdentities,
  org: TOrganizations,
  organizationSlug: string | undefined,
  deps: Pick<TLoginDeps, "orgDAL">
) => {
  const isSubOrgIdentity = Boolean(org.rootOrgId);
  let subOrganizationId = isSubOrgIdentity ? org.id : null;

  if (organizationSlug && org.slug !== organizationSlug) {
    if (!isSubOrgIdentity) {
      const subOrg = await deps.orgDAL.findOne({ rootOrgId: org.id, slug: organizationSlug });
      if (!subOrg) throw new NotFoundError({ message: `Sub organization with slug '${organizationSlug}' not found` });

      const subOrgMembership = await deps.orgDAL.findEffectiveOrgMembership({
        actorType: ActorType.IDENTITY,
        actorId: identity.id,
        orgId: subOrg.id
      });
      if (!subOrgMembership)
        throw new UnauthorizedError({
          message: `Identity not authorized to access sub organization ${organizationSlug}`,
          detail: {
            reasonCode: "sub_org_unauthorized",
            identityId: identity.id,
            orgId: identity.orgId,
            identityName: identity.name
          }
        });

      subOrganizationId = subOrg.id;
    }
  }

  return subOrganizationId;
};

export const runIdentityLogin = async <TPayload, TAuthConfig = undefined>(
  params: { identityId: string; organizationSlug?: string; payload: TPayload },
  strategy: TIdentityAuthLoginStrategy<TPayload, TAuthConfig>,
  deps: TLoginDeps
): Promise<TLoginResult<TAuthConfig>> => {
  const appCfg = getConfig();

  let identityRef: TIdentities | undefined;
  let orgRef: TOrganizations | undefined;

  try {
    const { identity, org } = await loadLoginContext(params.identityId, deps);
    identityRef = identity;
    orgRef = org;
    const validateResult = await strategy.validate(params.payload, { identity, org });
    const { authConfig } = validateResult;
    const subOrganizationId = await resolveSubOrg(identity, org, params.organizationSlug, deps);

    const identityAccessToken = await deps.identityAccessTokenDAL.transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const extraFields = (await validateResult.onBeforeTokenCreate?.(tx)) ?? {};

      await deps.membershipIdentityDAL.update(
        identity.projectId
          ? {
              scope: AccessScope.Project,
              scopeOrgId: identity.orgId,
              scopeProjectId: identity.projectId,
              actorIdentityId: identity.id
            }
          : {
              scope: AccessScope.Organization,
              scopeOrgId: identity.orgId,
              actorIdentityId: identity.id
            },
        { lastLoginAuthMethod: strategy.authMethod, lastLoginTime: new Date() },
        tx
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return deps.identityAccessTokenDAL.create(
        {
          identityId: identity.id,
          isAccessTokenRevoked: false,
          accessTokenTTL: validateResult.accessTokenTTL,
          accessTokenMaxTTL: validateResult.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: validateResult.accessTokenNumUsesLimit,
          accessTokenPeriod: validateResult.accessTokenPeriod,
          authMethod: strategy.authMethod,
          subOrganizationId,
          ...extraFields
        } as Parameters<TLoginDeps["identityAccessTokenDAL"]["create"]>[0],
        tx
      );
    });

    const accessToken = crypto.jwt().sign(
      {
        identityId: identity.id,
        clientSecretId: validateResult.clientSecretId,
        identityAccessTokenId: identityAccessToken.id,
        authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN,
        identityAuth: validateResult.identityAuth ?? {}
      } as TIdentityAccessTokenJwtPayload,
      appCfg.AUTH_SECRET,
      // akhilmhdh: for non-expiry tokens you should not even set the value, including undefined. Even for undefined jsonwebtoken throws error
      Number(identityAccessToken.accessTokenTTL) === 0
        ? undefined
        : { expiresIn: Number(identityAccessToken.accessTokenTTL) }
    );

    if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
      authAttemptCounter.add(1, {
        "infisical.identity.id": identity.id,
        "infisical.identity.name": identity.name,
        "infisical.organization.id": org.id,
        "infisical.organization.name": org.name,
        "infisical.identity.auth_method": strategy.telemetryAuthMethod,
        "infisical.identity.auth_result": AuthAttemptAuthResult.SUCCESS,
        "client.address": requestContext.get(RequestContextKey.Ip),
        "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
      });
    }

    return { accessToken, identity, identityAccessToken, authConfig };
  } catch (error) {
    if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
      authAttemptCounter.add(1, {
        "infisical.identity.id": params.identityId,
        ...(identityRef ? { "infisical.identity.name": identityRef.name } : {}),
        ...(orgRef ? { "infisical.organization.id": orgRef.id, "infisical.organization.name": orgRef.name } : {}),
        "infisical.identity.auth_method": strategy.telemetryAuthMethod,
        "infisical.identity.auth_result": AuthAttemptAuthResult.FAILURE,
        "client.address": requestContext.get(RequestContextKey.Ip),
        "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
      });
    }
    throw error;
  }
};
