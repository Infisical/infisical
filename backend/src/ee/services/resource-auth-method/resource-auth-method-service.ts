import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { OrganizationActionScope } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";

import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TResourceAwsAuthDALFactory } from "./aws-auth-dal";
import { validateAllowlists, verifyStsAndExtractCaller } from "./aws-auth-fns";
import { TResourceEnrollmentTokenDALFactory } from "./enrollment-token-dal";
import { TResourceAuthMethodDALFactory } from "./resource-auth-method-dal";
import { assertGatewayResource, mintGatewayJwt, ResourceAuthMethodType } from "./resource-auth-method-fns";
import {
  TAuthMethodView,
  TAwsAuthMethodConfig,
  TGetAuthMethodDTO,
  TLoginWithAwsDTO,
  TLoginWithTokenDTO,
  TMintTokenDTO,
  TRevokeTokenDTO,
  TSetAuthMethodDTO
} from "./resource-auth-method-types";

const ENROLLMENT_TOKEN_TTL_SECONDS = 3600;

const $generateEnrollmentToken = () => {
  const plainToken = `gwe_${crypto.randomBytes(32).toString("base64url")}`;
  const tokenHash = crypto.nativeCrypto.createHash("sha256").update(plainToken).digest("hex");
  const expiresAt = new Date(Date.now() + ENROLLMENT_TOKEN_TTL_SECONDS * 1000);
  return { plainToken, tokenHash, expiresAt };
};

type TResourceAuthMethodServiceFactoryDep = {
  resourceAuthMethodDAL: TResourceAuthMethodDALFactory;
  resourceAwsAuthDAL: TResourceAwsAuthDALFactory;
  resourceEnrollmentTokenDAL: TResourceEnrollmentTokenDALFactory;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById" | "updateById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TResourceAuthMethodServiceFactory = ReturnType<typeof resourceAuthMethodServiceFactory>;

export const resourceAuthMethodServiceFactory = ({
  resourceAuthMethodDAL,
  resourceAwsAuthDAL,
  resourceEnrollmentTokenDAL,
  gatewayV2DAL,
  identityDAL,
  permissionService
}: TResourceAuthMethodServiceFactoryDep) => {
  const $checkPermission = async (actor: TSetAuthMethodDTO["actor"], action: OrgPermissionGatewayActions) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(action, OrgPermissionSubjects.Gateway);
  };

  // Builds the discriminated-union view of the gateway's current auth method.
  //
  // Identity is checked *first* via gateways_v2.identityId — that field is the
  // authoritative legacy-state signal and overrides anything in resource_auth_methods.
  // (Older migration runs may have left stale 'identity' registry rows; this ordering
  // makes the view robust to that.)
  //
  // Token method's config is deliberately empty — enrollment-token state isn't surfaced
  // (rows are deleted on consume; CLI returns its own error for invalid/expired).
  const $loadAuthMethodView = async (gatewayId: string): Promise<TAuthMethodView | null> => {
    const gateway = await gatewayV2DAL.findById(gatewayId);
    if (!gateway) return null;

    if (gateway.identityId) {
      const identity = await identityDAL.findById(gateway.identityId);
      return {
        method: ResourceAuthMethodType.Identity,
        config: {
          identityId: gateway.identityId,
          identityName: identity?.name ?? null
        }
      };
    }

    const registry = await resourceAuthMethodDAL.findOne({ gatewayId });
    if (!registry) return null;

    if (registry.method === ResourceAuthMethodType.Aws) {
      const config = await resourceAwsAuthDAL.findOne({ authMethodId: registry.id });
      if (!config) {
        throw new NotFoundError({ message: "AWS auth config missing for gateway" });
      }
      return {
        method: ResourceAuthMethodType.Aws,
        config: {
          id: config.id,
          stsEndpoint: config.stsEndpoint,
          allowedPrincipalArns: config.allowedPrincipalArns,
          allowedAccountIds: config.allowedAccountIds,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt
        }
      };
    }

    if (registry.method === ResourceAuthMethodType.Token) {
      return {
        method: ResourceAuthMethodType.Token,
        config: {}
      };
    }

    throw new BadRequestError({ message: `Unknown auth method "${registry.method}"` });
  };

  const getByGatewayId = async ({ resource, actor }: TGetAuthMethodDTO) => {
    assertGatewayResource(resource, "auth-method");
    await $checkPermission(actor, OrgPermissionGatewayActions.EditGateways);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    const view = await $loadAuthMethodView(resource.id);
    if (!view) {
      throw new NotFoundError({ message: "Gateway has no auth method configured" });
    }
    return view;
  };

  const loadView = async (gatewayId: string): Promise<TAuthMethodView | null> => $loadAuthMethodView(gatewayId);

  const initAtCreate = async (
    {
      gatewayId,
      authMethod
    }: {
      gatewayId: string;
      authMethod:
        | { method: typeof ResourceAuthMethodType.Aws; config: TAwsAuthMethodConfig }
        | { method: typeof ResourceAuthMethodType.Token };
    },
    tx: Knex
  ) => {
    const registry = await resourceAuthMethodDAL.create({ gatewayId, method: authMethod.method }, tx);
    if (authMethod.method === ResourceAuthMethodType.Aws) {
      await resourceAwsAuthDAL.create(
        {
          authMethodId: registry.id,
          stsEndpoint: authMethod.config.stsEndpoint,
          allowedPrincipalArns: authMethod.config.allowedPrincipalArns,
          allowedAccountIds: authMethod.config.allowedAccountIds
        },
        tx
      );
    }
  };

  /**
   * Switches the gateway's auth method (or updates the current method's config) in one tx.
   *
   * Refused for legacy identity-bound gateways — those have to be replaced with a new
   * gateway, not migrated. We don't try to be clever about transitioning identity
   * binding to a registry-tracked method; operators create a fresh gateway with the
   * desired method instead.
   *
   * Note: tokenVersion is *not* bumped on method change. A running gateway holding a JWT
   * minted under the previous method continues operating until it restarts and
   * re-authenticates via the new method — intentional, to avoid downtime. Operators
   * who need to forcibly invalidate the existing session use the explicit Revoke action.
   */
  const setMethod = async ({ resource, authMethod, actor }: TSetAuthMethodDTO): Promise<TAuthMethodView> => {
    assertGatewayResource(resource, "auth-method");
    await $checkPermission(actor, OrgPermissionGatewayActions.EditGateways);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    if (gateway.identityId) {
      throw new BadRequestError({
        message:
          "This gateway is using legacy machine identity auth. Create a new gateway with the desired auth method instead of migrating this one."
      });
    }

    const current = await resourceAuthMethodDAL.findOne({ gatewayId: resource.id });
    const previousMethod = current?.method ?? null;

    await resourceAuthMethodDAL.transaction(async (tx) => {
      // 1. Upsert registry row to the new method.
      let registryRow = current;
      if (current) {
        registryRow = await resourceAuthMethodDAL.updateById(current.id, { method: authMethod.method }, tx);
      } else {
        registryRow = await resourceAuthMethodDAL.create({ gatewayId: resource.id, method: authMethod.method }, tx);
      }

      // 2. Drop the previous method's config artifacts.
      if (
        previousMethod === ResourceAuthMethodType.Aws &&
        authMethod.method !== ResourceAuthMethodType.Aws &&
        current
      ) {
        await resourceAwsAuthDAL.delete({ authMethodId: current.id }, tx);
      }
      if (
        previousMethod === ResourceAuthMethodType.Token &&
        authMethod.method !== ResourceAuthMethodType.Token &&
        current
      ) {
        await resourceEnrollmentTokenDAL.delete({ authMethodId: current.id }, tx);
      }

      // 3. Insert/upsert the new method's config row.
      if (authMethod.method === ResourceAuthMethodType.Aws) {
        const existingAws = await resourceAwsAuthDAL.findOne({ authMethodId: registryRow.id }, tx);
        if (existingAws) {
          await resourceAwsAuthDAL.updateById(
            existingAws.id,
            {
              stsEndpoint: authMethod.stsEndpoint,
              allowedPrincipalArns: authMethod.allowedPrincipalArns,
              allowedAccountIds: authMethod.allowedAccountIds
            },
            tx
          );
        } else {
          await resourceAwsAuthDAL.create(
            {
              authMethodId: registryRow.id,
              stsEndpoint: authMethod.stsEndpoint,
              allowedPrincipalArns: authMethod.allowedPrincipalArns,
              allowedAccountIds: authMethod.allowedAccountIds
            },
            tx
          );
        }
      }
    });

    const view = await $loadAuthMethodView(resource.id);
    if (!view) {
      throw new NotFoundError({ message: "Auth method not found after set" });
    }
    return view;
  };

  /**
   * Mints a fresh enrollment token for token-method gateways. Replaces any existing
   * unused enrollment-token row (only one bootstrap credential pending at a time).
   *
   * Does NOT bump tokenVersion or clear heartbeat — minting a new token is a
   * non-destructive operation, and an operator clicking "Show start command" to view
   * the deploy command shouldn't disconnect a healthy running gateway. The next daemon
   * to actually log in with the new token will bump tokenVersion at that point
   * (loginWithToken handles the rotation atomically). For active disconnection,
   * operators use the explicit Revoke action.
   */
  const mintToken = async ({ resource, actor }: TMintTokenDTO) => {
    assertGatewayResource(resource, "token");
    await $checkPermission(actor, OrgPermissionGatewayActions.EditGateways);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    const registry = await resourceAuthMethodDAL.findOne({ gatewayId: resource.id });
    if (!registry || registry.method !== ResourceAuthMethodType.Token) {
      throw new BadRequestError({
        message: `Gateway is not configured for token authentication (current method: ${registry?.method ?? "none"})`
      });
    }

    const generated = $generateEnrollmentToken();

    const record = await resourceEnrollmentTokenDAL.transaction(async (tx) => {
      // Replace any existing enrollment-token row. Rows are deleted on consume, so
      // anything still here is a pending unused credential we're superseding.
      await resourceEnrollmentTokenDAL.delete({ authMethodId: registry.id }, tx);
      return resourceEnrollmentTokenDAL.create(
        {
          orgId: actor.orgId,
          tokenHash: generated.tokenHash,
          ttl: ENROLLMENT_TOKEN_TTL_SECONDS,
          expiresAt: generated.expiresAt,
          authMethodId: registry.id
        },
        tx
      );
    });

    return {
      ...record,
      token: generated.plainToken,
      gatewayName: gateway.name,
      orgId: gateway.orgId
    };
  };

  /**
   * Method-aware broad revoke. Bumps tokenVersion (kills active JWT), clears heartbeat,
   * and — for token method — deletes any pending enrollment-token row. Identity-bound
   * gateways can't be revoked through this path; they need to switch off identity first.
   *
   * Authorized by the dedicated RevokeGatewayAccess permission, separate from
   * EditGateways. Disconnecting a running gateway is a stronger action than editing its
   * auth config and merits its own grant.
   */
  const revokeAccess = async ({ resource, actor }: TRevokeTokenDTO) => {
    assertGatewayResource(resource, "auth-method");
    await $checkPermission(actor, OrgPermissionGatewayActions.RevokeGatewayAccess);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    const registry = await resourceAuthMethodDAL.findOne({ gatewayId: resource.id });
    if (!registry) {
      throw new NotFoundError({ message: "Gateway has no auth method configured" });
    }
    // Identity-bound gateways are detected via gateway.identityId. They have no registry
    // row, but we double-check here in case stale data routes us through this branch
    // unexpectedly. Operators can't revoke an identity-bound gateway directly — the
    // legacy identity binding is the auth signal, and the only way to "kick" such a
    // gateway is to delete it.
    if (gateway.identityId) {
      throw new BadRequestError({
        message:
          "Identity-bound gateways cannot be revoked directly. Create a new gateway with AWS or Token auth instead."
      });
    }

    const result = await resourceEnrollmentTokenDAL.transaction(async (tx) => {
      let deletedTokenCount = 0;
      if (registry.method === ResourceAuthMethodType.Token) {
        const tokens = await resourceEnrollmentTokenDAL.find({ authMethodId: registry.id }, { tx });
        deletedTokenCount = tokens.length;
        if (tokens.length > 0) {
          await resourceEnrollmentTokenDAL.delete({ authMethodId: registry.id }, tx);
        }
      }
      await gatewayV2DAL.updateById(
        gateway.id,
        { $incr: { tokenVersion: 1 }, heartbeat: null, lastHealthCheckStatus: null },
        tx
      );
      return { deletedTokenCount };
    });

    return {
      gatewayName: gateway.name,
      orgId: gateway.orgId,
      method: registry.method as "aws" | "token",
      deletedTokenCount: result.deletedTokenCount
    };
  };

  const loginWithAws = async ({
    resource,
    iamHttpRequestMethod,
    iamRequestBody,
    iamRequestHeaders
  }: TLoginWithAwsDTO) => {
    assertGatewayResource(resource, "AWS");

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway) {
      throw new UnauthorizedError({ message: "Invalid gateway credentials" });
    }

    const registry = await resourceAuthMethodDAL.findOne({ gatewayId: gateway.id });
    if (!registry || registry.method !== ResourceAuthMethodType.Aws) {
      throw new UnauthorizedError({
        message: "Gateway is not configured for AWS authentication",
        detail: { reasonCode: "method_mismatch", gatewayId: gateway.id, orgId: gateway.orgId }
      });
    }

    const config = await resourceAwsAuthDAL.findOne({ authMethodId: registry.id });
    if (!config) {
      throw new UnauthorizedError({
        message: "Gateway is not configured for AWS authentication",
        detail: { reasonCode: "config_missing", gatewayId: gateway.id, orgId: gateway.orgId }
      });
    }

    const errorContext = { gatewayId: gateway.id, orgId: gateway.orgId, gatewayName: gateway.name };

    const { Account, Arn } = await verifyStsAndExtractCaller({
      iamHttpRequestMethod,
      iamRequestBody,
      iamRequestHeaders,
      defaultStsEndpoint: config.stsEndpoint,
      errorContext
    });

    validateAllowlists({
      Account,
      Arn,
      allowedAccountIds: config.allowedAccountIds,
      allowedPrincipalArns: config.allowedPrincipalArns,
      errorContext
    });

    const refreshed = await gatewayV2DAL.updateById(gateway.id, {
      $incr: { tokenVersion: 1 },
      heartbeat: null,
      lastHealthCheckStatus: null
    });

    const accessToken = mintGatewayJwt({
      gatewayId: gateway.id,
      orgId: gateway.orgId,
      tokenVersion: refreshed.tokenVersion,
      accessTokenTTL: 0
    });

    return {
      accessToken,
      gateway: refreshed,
      config,
      principalArn: Arn,
      accountId: Account
    };
  };

  /**
   * Consumes a transient enrollment token. The row is deleted on success — single-use
   * is enforced by row existence rather than a usedAt flag.
   */
  const loginWithToken = async ({ token }: TLoginWithTokenDTO) => {
    const tokenHash = crypto.nativeCrypto.createHash("sha256").update(token).digest("hex");

    const tokenRecord = await resourceEnrollmentTokenDAL.findOne({ tokenHash });
    if (!tokenRecord) {
      throw new BadRequestError({ message: "Invalid enrollment token" });
    }
    if (tokenRecord.expiresAt < new Date()) {
      // Don't leave the expired row sitting around — clean up alongside the rejection.
      await resourceEnrollmentTokenDAL.deleteById(tokenRecord.id).catch(() => {});
      throw new BadRequestError({ message: "Enrollment token has expired" });
    }

    const registry = await resourceAuthMethodDAL.findById(tokenRecord.authMethodId);
    if (!registry || !registry.gatewayId) {
      throw new BadRequestError({ message: "Enrollment token is not linked to a gateway" });
    }

    const gateway = await resourceEnrollmentTokenDAL.transaction(async (tx) => {
      // Single-use: delete on consume. If the row vanished between the find and the
      // delete (concurrent consumption), the delete returns 0 rows and we reject.
      const deleted = await resourceEnrollmentTokenDAL.delete({ id: tokenRecord.id }, tx);
      if (deleted.length === 0) {
        throw new BadRequestError({ message: "Enrollment token has already been used" });
      }
      const existing = await gatewayV2DAL.findById(registry.gatewayId, tx);
      if (!existing) throw new NotFoundError({ message: `Gateway ${registry.gatewayId} not found` });
      return gatewayV2DAL.updateById(
        existing.id,
        { $incr: { tokenVersion: 1 }, heartbeat: null, lastHealthCheckStatus: null },
        tx
      );
    });

    const accessToken = mintGatewayJwt({
      gatewayId: gateway.id,
      orgId: gateway.orgId,
      tokenVersion: gateway.tokenVersion,
      accessTokenTTL: 0
    });

    return {
      accessToken,
      gatewayId: gateway.id,
      gatewayName: gateway.name,
      orgId: gateway.orgId,
      enrollmentTokenId: tokenRecord.id
    };
  };

  return {
    getByGatewayId,
    loadView,
    initAtCreate,
    setMethod,
    mintToken,
    revokeAccess,
    loginWithAws,
    loginWithToken
  };
};
