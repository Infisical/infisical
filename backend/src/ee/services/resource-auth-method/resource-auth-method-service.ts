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
import { TResourceTokenAuthDALFactory } from "./token-auth-dal";

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
  resourceTokenAuthDAL: TResourceTokenAuthDALFactory;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById" | "updateById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TResourceAuthMethodServiceFactory = ReturnType<typeof resourceAuthMethodServiceFactory>;

export const resourceAuthMethodServiceFactory = ({
  resourceAuthMethodDAL,
  resourceAwsAuthDAL,
  resourceTokenAuthDAL,
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

  // Identity is checked first via gateways_v2.identityId — it's the authoritative
  // legacy-state signal and overrides any registry row.
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
    await $checkPermission(actor, OrgPermissionGatewayActions.ListGateways);

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

  // Revoke is meaningful when there's something to invalidate: an active JWT
  // (tokenVersion > 0) or a pending unused enrollment-token row.
  const canRevoke = async (gateway: { id: string; tokenVersion: number; identityId?: string | null }) => {
    if (gateway.identityId) return false;
    if (gateway.tokenVersion > 0) return true;
    const registry = await resourceAuthMethodDAL.findOne({ gatewayId: gateway.id });
    if (!registry || registry.method !== ResourceAuthMethodType.Token) return false;
    const pending = await resourceTokenAuthDAL.findOne({ authMethodId: registry.id });
    return Boolean(pending);
  };

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

  // tokenVersion is intentionally NOT bumped on method change — running gateways keep
  // their JWT until the next restart, avoiding forced downtime. Use revoke for that.
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
        await resourceTokenAuthDAL.delete({ authMethodId: current.id }, tx);
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

  // Non-destructive: minting a new token does NOT bump tokenVersion or clear heartbeat,
  // so a running gateway keeps working. The next login (with the new token) does the bump.
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

    const record = await resourceTokenAuthDAL.transaction(async (tx) => {
      await resourceTokenAuthDAL.delete({ authMethodId: registry.id }, tx);
      return resourceTokenAuthDAL.create(
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
    if (gateway.identityId) {
      throw new BadRequestError({
        message:
          "Identity-bound gateways cannot be revoked directly. Create a new gateway with AWS or Token auth instead."
      });
    }

    const result = await resourceTokenAuthDAL.transaction(async (tx) => {
      let deletedTokenCount = 0;
      if (registry.method === ResourceAuthMethodType.Token) {
        const tokens = await resourceTokenAuthDAL.find({ authMethodId: registry.id }, { tx });
        deletedTokenCount = tokens.length;
        if (tokens.length > 0) {
          await resourceTokenAuthDAL.delete({ authMethodId: registry.id }, tx);
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

  // Single-use: row is deleted on consume, not flagged.
  const loginWithToken = async ({ token }: TLoginWithTokenDTO) => {
    const tokenHash = crypto.nativeCrypto.createHash("sha256").update(token).digest("hex");

    const tokenRecord = await resourceTokenAuthDAL.findOne({ tokenHash });
    if (!tokenRecord) {
      throw new BadRequestError({ message: "Invalid enrollment token" });
    }
    if (tokenRecord.expiresAt < new Date()) {
      await resourceTokenAuthDAL.deleteById(tokenRecord.id).catch(() => {});
      throw new BadRequestError({ message: "Enrollment token has expired" });
    }

    const registry = await resourceAuthMethodDAL.findById(tokenRecord.authMethodId);
    if (!registry || !registry.gatewayId) {
      throw new BadRequestError({ message: "Enrollment token is not linked to a gateway" });
    }
    const linkedGatewayId = registry.gatewayId;

    const gateway = await resourceTokenAuthDAL.transaction(async (tx) => {
      // Reject concurrent consumption: if delete returns 0, another caller won the race.
      const deleted = await resourceTokenAuthDAL.delete({ id: tokenRecord.id }, tx);
      if (deleted.length === 0) {
        throw new BadRequestError({ message: "Enrollment token has already been used" });
      }
      const existing = await gatewayV2DAL.findById(linkedGatewayId, tx);
      if (!existing) throw new NotFoundError({ message: `Gateway ${linkedGatewayId} not found` });
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
    canRevoke,
    initAtCreate,
    setMethod,
    mintToken,
    revokeAccess,
    loginWithAws,
    loginWithToken
  };
};
