import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { OrganizationActionScope } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";

import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import {
  OrgPermissionGatewayActions,
  OrgPermissionRelayActions,
  OrgPermissionSubjects
} from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TRelayDALFactory } from "../relay/relay-dal";
import { TResourceAwsAuthDALFactory } from "./aws-auth-dal";
import { validateAllowlists, verifyStsAndExtractCaller } from "./aws-auth-fns";
import { TResourceAuthMethodDALFactory } from "./resource-auth-method-dal";
import {
  assertGatewayResource,
  assertRelayResource,
  mintGatewayJwt,
  mintRelayJwt,
  RESOURCE_TYPE_GATEWAY,
  RESOURCE_TYPE_RELAY,
  ResourceAuthMethodType,
  type ResourceRef
} from "./resource-auth-method-fns";
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
  relayDAL: Pick<TRelayDALFactory, "findById" | "updateById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TResourceAuthMethodServiceFactory = ReturnType<typeof resourceAuthMethodServiceFactory>;

// Maps resource-type-agnostic permission intents to per-resource CASL actions.
const GATEWAY_PERMISSION_MAP = {
  list: OrgPermissionGatewayActions.ListGateways,
  edit: OrgPermissionGatewayActions.EditGateways,
  revoke: OrgPermissionGatewayActions.RevokeGatewayAccess
} as const;

const RELAY_PERMISSION_MAP = {
  list: OrgPermissionRelayActions.ListRelays,
  edit: OrgPermissionRelayActions.EditRelays,
  revoke: OrgPermissionRelayActions.RevokeRelayAccess
} as const;

export const resourceAuthMethodServiceFactory = ({
  resourceAuthMethodDAL,
  resourceAwsAuthDAL,
  resourceTokenAuthDAL,
  gatewayV2DAL,
  relayDAL,
  identityDAL,
  permissionService
}: TResourceAuthMethodServiceFactoryDep) => {
  const $checkPermission = async (
    actor: TSetAuthMethodDTO["actor"],
    intent: "list" | "edit" | "revoke",
    resourceType: ResourceRef["type"]
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });
    if (resourceType === RESOURCE_TYPE_GATEWAY) {
      ForbiddenError.from(permission).throwUnlessCan(GATEWAY_PERMISSION_MAP[intent], OrgPermissionSubjects.Gateway);
    } else {
      ForbiddenError.from(permission).throwUnlessCan(RELAY_PERMISSION_MAP[intent], OrgPermissionSubjects.Relay);
    }
  };

  const $loadAuthMethodView = async (resource: ResourceRef): Promise<TAuthMethodView | null> => {
    // Identity is checked first — it's the authoritative legacy-state signal
    // and overrides any registry row.
    if (resource.type === RESOURCE_TYPE_GATEWAY) {
      const gateway = await gatewayV2DAL.findById(resource.id);
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
    } else {
      const relay = await relayDAL.findById(resource.id);
      if (!relay) return null;

      if (relay.identityId) {
        const identity = await identityDAL.findById(relay.identityId);
        return {
          method: ResourceAuthMethodType.Identity,
          config: {
            identityId: relay.identityId,
            identityName: identity?.name ?? null
          }
        };
      }
    }

    const registryFilter =
      resource.type === RESOURCE_TYPE_GATEWAY ? { gatewayId: resource.id } : { relayId: resource.id };
    const registry = await resourceAuthMethodDAL.findOne(registryFilter);
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
    await $checkPermission(actor, "list", RESOURCE_TYPE_GATEWAY);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    const view = await $loadAuthMethodView(resource);
    if (!view) {
      throw new NotFoundError({ message: "Gateway has no auth method configured" });
    }
    return view;
  };

  const getByRelayId = async ({ resource, actor }: TGetAuthMethodDTO) => {
    assertRelayResource(resource, "auth-method");
    await $checkPermission(actor, "list", RESOURCE_TYPE_RELAY);

    const relay = await relayDAL.findById(resource.id);
    if (!relay || relay.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Relay ${resource.id} not found` });
    }

    const view = await $loadAuthMethodView(resource);
    if (!view) {
      throw new NotFoundError({ message: "Relay has no auth method configured" });
    }
    return view;
  };

  const loadView = async (resource: ResourceRef): Promise<TAuthMethodView | null> => $loadAuthMethodView(resource);

  // Revoke is meaningful when there's something to invalidate: an active JWT
  // (tokenVersion > 0) or a pending unused enrollment-token row.
  const canRevoke = async (
    resourceInfo: { id: string; tokenVersion: number; identityId?: string | null },
    resourceType: ResourceRef["type"] = RESOURCE_TYPE_GATEWAY
  ) => {
    if (resourceInfo.identityId) return false;
    if (resourceInfo.tokenVersion > 0) return true;
    const registryFilter =
      resourceType === RESOURCE_TYPE_GATEWAY ? { gatewayId: resourceInfo.id } : { relayId: resourceInfo.id };
    const registry = await resourceAuthMethodDAL.findOne(registryFilter);
    if (!registry || registry.method !== ResourceAuthMethodType.Token) return false;
    const pending = await resourceTokenAuthDAL.findOne({ authMethodId: registry.id });
    return Boolean(pending);
  };

  const initAtCreate = async (
    {
      resource,
      authMethod
    }: {
      resource: ResourceRef;
      authMethod:
        | { method: typeof ResourceAuthMethodType.Aws; config: TAwsAuthMethodConfig }
        | { method: typeof ResourceAuthMethodType.Token };
    },
    tx: Knex
  ) => {
    const registryRow =
      resource.type === RESOURCE_TYPE_GATEWAY
        ? { gatewayId: resource.id, method: authMethod.method }
        : { relayId: resource.id, method: authMethod.method };

    const registry = await resourceAuthMethodDAL.create(registryRow, tx);
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

  // tokenVersion is intentionally NOT bumped on method change — running resources keep
  // their JWT until the next restart, avoiding forced downtime. Use revoke for that.
  const setMethod = async ({ resource, authMethod, actor }: TSetAuthMethodDTO): Promise<TAuthMethodView> => {
    await $checkPermission(actor, "edit", resource.type);

    const resourceLabel = resource.type === RESOURCE_TYPE_GATEWAY ? "Gateway" : "Relay";
    let identityId: string | null | undefined;

    if (resource.type === RESOURCE_TYPE_GATEWAY) {
      const gateway = await gatewayV2DAL.findById(resource.id);
      if (!gateway || gateway.orgId !== actor.orgId) {
        throw new NotFoundError({ message: `${resourceLabel} ${resource.id} not found` });
      }
      identityId = gateway.identityId;
    } else {
      const relay = await relayDAL.findById(resource.id);
      if (!relay || relay.orgId !== actor.orgId) {
        throw new NotFoundError({ message: `${resourceLabel} ${resource.id} not found` });
      }
      identityId = relay.identityId;
    }

    if (identityId) {
      throw new BadRequestError({
        message: `This ${resourceLabel.toLowerCase()} is using legacy machine identity auth. Create a new ${resourceLabel.toLowerCase()} with the desired auth method instead of migrating this one.`
      });
    }

    const registryFilter =
      resource.type === RESOURCE_TYPE_GATEWAY ? { gatewayId: resource.id } : { relayId: resource.id };
    const current = await resourceAuthMethodDAL.findOne(registryFilter);
    const previousMethod = current?.method ?? null;

    await resourceAuthMethodDAL.transaction(async (tx) => {
      // 1. Upsert registry row to the new method.
      let registryRow = current;
      if (current) {
        registryRow = await resourceAuthMethodDAL.updateById(current.id, { method: authMethod.method }, tx);
      } else {
        const createPayload =
          resource.type === RESOURCE_TYPE_GATEWAY
            ? { gatewayId: resource.id, method: authMethod.method }
            : { relayId: resource.id, method: authMethod.method };
        registryRow = await resourceAuthMethodDAL.create(createPayload, tx);
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

    const view = await $loadAuthMethodView(resource);
    if (!view) {
      throw new NotFoundError({ message: "Auth method not found after set" });
    }
    return view;
  };

  // Non-destructive: minting a new token does NOT bump tokenVersion or clear heartbeat,
  // so a running resource keeps working. The next login (with the new token) does the bump.
  const mintToken = async ({ resource, actor }: TMintTokenDTO) => {
    await $checkPermission(actor, "edit", resource.type);

    const resourceLabel = resource.type === RESOURCE_TYPE_GATEWAY ? "Gateway" : "Relay";
    let resourceName: string;
    let resourceOrgId: string;

    if (resource.type === RESOURCE_TYPE_GATEWAY) {
      const gateway = await gatewayV2DAL.findById(resource.id);
      if (!gateway || gateway.orgId !== actor.orgId) {
        throw new NotFoundError({ message: `${resourceLabel} ${resource.id} not found` });
      }
      resourceName = gateway.name;
      resourceOrgId = gateway.orgId;
    } else {
      const relay = await relayDAL.findById(resource.id);
      if (!relay || relay.orgId !== actor.orgId) {
        throw new NotFoundError({ message: `${resourceLabel} ${resource.id} not found` });
      }
      resourceName = relay.name;
      resourceOrgId = relay.orgId!;
    }

    const registryFilter =
      resource.type === RESOURCE_TYPE_GATEWAY ? { gatewayId: resource.id } : { relayId: resource.id };
    const registry = await resourceAuthMethodDAL.findOne(registryFilter);
    if (!registry || registry.method !== ResourceAuthMethodType.Token) {
      throw new BadRequestError({
        message: `${resourceLabel} is not configured for token authentication (current method: ${registry?.method ?? "none"})`
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
      resourceName,
      orgId: resourceOrgId
    };
  };

  const revokeAccess = async ({ resource, actor }: TRevokeTokenDTO) => {
    await $checkPermission(actor, "revoke", resource.type);

    const resourceLabel = resource.type === RESOURCE_TYPE_GATEWAY ? "Gateway" : "Relay";
    let resourceName: string;
    let resourceOrgId: string;
    let identityId: string | null | undefined;

    if (resource.type === RESOURCE_TYPE_GATEWAY) {
      const gateway = await gatewayV2DAL.findById(resource.id);
      if (!gateway || gateway.orgId !== actor.orgId) {
        throw new NotFoundError({ message: `${resourceLabel} ${resource.id} not found` });
      }
      resourceName = gateway.name;
      resourceOrgId = gateway.orgId;
      identityId = gateway.identityId;
    } else {
      const relay = await relayDAL.findById(resource.id);
      if (!relay || relay.orgId !== actor.orgId) {
        throw new NotFoundError({ message: `${resourceLabel} ${resource.id} not found` });
      }
      resourceName = relay.name;
      resourceOrgId = relay.orgId!;
      identityId = relay.identityId;
    }

    const registryFilter =
      resource.type === RESOURCE_TYPE_GATEWAY ? { gatewayId: resource.id } : { relayId: resource.id };
    const registry = await resourceAuthMethodDAL.findOne(registryFilter);
    if (!registry) {
      throw new NotFoundError({ message: `${resourceLabel} has no auth method configured` });
    }
    if (identityId) {
      throw new BadRequestError({
        message: `Identity-bound ${resourceLabel.toLowerCase()}s cannot be revoked directly. Create a new ${resourceLabel.toLowerCase()} with AWS or Token auth instead.`
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
      if (resource.type === RESOURCE_TYPE_GATEWAY) {
        await gatewayV2DAL.updateById(
          resource.id,
          { $incr: { tokenVersion: 1 }, heartbeat: null, heartbeatTTL: null },
          tx
        );
      } else {
        await relayDAL.updateById(resource.id, { $incr: { tokenVersion: 1 }, heartbeat: null }, tx);
      }
      return { deletedTokenCount };
    });

    return {
      resourceName,
      orgId: resourceOrgId,
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
    const resourceLabel = resource.type === RESOURCE_TYPE_GATEWAY ? "Gateway" : "Relay";
    let resourceName: string;
    let resourceOrgId: string;

    if (resource.type === RESOURCE_TYPE_GATEWAY) {
      const gateway = await gatewayV2DAL.findById(resource.id);
      if (!gateway) {
        throw new UnauthorizedError({ message: `Invalid ${resourceLabel.toLowerCase()} credentials` });
      }
      resourceName = gateway.name;
      resourceOrgId = gateway.orgId;
    } else {
      const relay = await relayDAL.findById(resource.id);
      if (!relay || !relay.orgId) {
        throw new UnauthorizedError({ message: `Invalid ${resourceLabel.toLowerCase()} credentials` });
      }
      resourceName = relay.name;
      resourceOrgId = relay.orgId;
    }

    const registryFilter =
      resource.type === RESOURCE_TYPE_GATEWAY ? { gatewayId: resource.id } : { relayId: resource.id };
    const registry = await resourceAuthMethodDAL.findOne(registryFilter);
    if (!registry || registry.method !== ResourceAuthMethodType.Aws) {
      throw new UnauthorizedError({
        message: `${resourceLabel} is not configured for AWS authentication`,
        detail: { reasonCode: "method_mismatch", resourceId: resource.id, orgId: resourceOrgId }
      });
    }

    const config = await resourceAwsAuthDAL.findOne({ authMethodId: registry.id });
    if (!config) {
      throw new UnauthorizedError({
        message: `${resourceLabel} is not configured for AWS authentication`,
        detail: { reasonCode: "config_missing", resourceId: resource.id, orgId: resourceOrgId }
      });
    }

    const errorContext = { resourceId: resource.id, orgId: resourceOrgId, resourceName };

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

    let refreshedTokenVersion: number;
    if (resource.type === RESOURCE_TYPE_GATEWAY) {
      const refreshed = await gatewayV2DAL.updateById(resource.id, {
        $incr: { tokenVersion: 1 },
        heartbeat: null,
        heartbeatTTL: null
      });
      refreshedTokenVersion = refreshed.tokenVersion;
    } else {
      const refreshed = await relayDAL.updateById(resource.id, {
        $incr: { tokenVersion: 1 },
        heartbeat: null
      });
      refreshedTokenVersion = refreshed.tokenVersion;
    }

    const accessToken =
      resource.type === RESOURCE_TYPE_GATEWAY
        ? mintGatewayJwt({
            gatewayId: resource.id,
            orgId: resourceOrgId,
            tokenVersion: refreshedTokenVersion,
            accessTokenTTL: 0
          })
        : mintRelayJwt({
            relayId: resource.id,
            orgId: resourceOrgId,
            tokenVersion: refreshedTokenVersion,
            accessTokenTTL: 0
          });

    return {
      accessToken,
      resourceId: resource.id,
      resourceName,
      orgId: resourceOrgId,
      config,
      principalArn: Arn,
      accountId: Account
    };
  };

  // Single-use: row is deleted on consume, not flagged.
  const loginWithToken = async ({ token, expectedResourceType }: TLoginWithTokenDTO) => {
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
    if (!registry) {
      throw new BadRequestError({ message: "Enrollment token is not linked to a resource" });
    }

    // Determine resource type from which FK is set on the registry row.
    const isGateway = Boolean(registry.gatewayId);
    const isRelay = Boolean(registry.relayId);
    if (!isGateway && !isRelay) {
      throw new BadRequestError({ message: "Enrollment token is not linked to a resource" });
    }

    const actualResourceType = isGateway ? RESOURCE_TYPE_GATEWAY : RESOURCE_TYPE_RELAY;
    if (actualResourceType !== expectedResourceType) {
      throw new BadRequestError({
        message: `Enrollment token belongs to a ${actualResourceType}, not a ${expectedResourceType}`
      });
    }

    const linkedResourceId = (isGateway ? registry.gatewayId : registry.relayId)!;

    if (isGateway) {
      const gateway = await resourceTokenAuthDAL.transaction(async (tx) => {
        const deleted = await resourceTokenAuthDAL.delete({ id: tokenRecord.id }, tx);
        if (deleted.length === 0) {
          throw new BadRequestError({ message: "Enrollment token has already been used" });
        }
        const existing = await gatewayV2DAL.findById(linkedResourceId, tx);
        if (!existing) throw new NotFoundError({ message: `Gateway ${linkedResourceId} not found` });
        return gatewayV2DAL.updateById(
          existing.id,
          { $incr: { tokenVersion: 1 }, heartbeat: null, heartbeatTTL: null },
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
        resourceType: "gateway" as const,
        resourceId: gateway.id,
        resourceName: gateway.name,
        orgId: gateway.orgId,
        enrollmentTokenId: tokenRecord.id
      };
    }

    const relay = await resourceTokenAuthDAL.transaction(async (tx) => {
      const deleted = await resourceTokenAuthDAL.delete({ id: tokenRecord.id }, tx);
      if (deleted.length === 0) {
        throw new BadRequestError({ message: "Enrollment token has already been used" });
      }
      const existing = await relayDAL.findById(linkedResourceId, tx);
      if (!existing) throw new NotFoundError({ message: `Relay ${linkedResourceId} not found` });
      return relayDAL.updateById(existing.id, { $incr: { tokenVersion: 1 }, heartbeat: null }, tx);
    });

    const accessToken = mintRelayJwt({
      relayId: relay.id,
      orgId: relay.orgId!,
      tokenVersion: relay.tokenVersion,
      accessTokenTTL: 0
    });

    return {
      accessToken,
      resourceType: "relay" as const,
      resourceId: relay.id,
      resourceName: relay.name,
      orgId: relay.orgId!,
      enrollmentTokenId: tokenRecord.id
    };
  };

  return {
    getByGatewayId,
    getByRelayId,
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
