import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { OrganizationActionScope } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";

import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { TKmipServerDALFactory } from "../kmip-server/kmip-server-dal";
import {
  OrgPermissionGatewayActions,
  OrgPermissionKmipServerActions,
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
  assertKmipServerResource,
  assertRelayResource,
  mintGatewayJwt,
  mintKmipServerJwt,
  mintRelayJwt,
  RESOURCE_TYPE_GATEWAY,
  RESOURCE_TYPE_KMIP,
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
  kmipServerDAL: Pick<TKmipServerDALFactory, "findById" | "updateById">;
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

const KMIP_SERVER_PERMISSION_MAP = {
  list: OrgPermissionKmipServerActions.ListKmipServers,
  edit: OrgPermissionKmipServerActions.EditKmipServers,
  revoke: OrgPermissionKmipServerActions.RevokeKmipServerAccess
} as const;

const RESOURCE_LABEL: Record<ResourceRef["type"], string> = {
  [RESOURCE_TYPE_GATEWAY]: "Gateway",
  [RESOURCE_TYPE_RELAY]: "Relay",
  [RESOURCE_TYPE_KMIP]: "KMIP server"
};

type TBasicResource = { id: string; name: string; orgId: string | null; identityId: string | null };

export const resourceAuthMethodServiceFactory = ({
  resourceAuthMethodDAL,
  resourceAwsAuthDAL,
  resourceTokenAuthDAL,
  gatewayV2DAL,
  relayDAL,
  kmipServerDAL,
  identityDAL,
  permissionService
}: TResourceAuthMethodServiceFactoryDep) => {
  // Registry rows carry the resource FK in a per-type column (gatewayId/relayId/kmipServerId).
  const $registryFilter = (resource: ResourceRef) => {
    if (resource.type === RESOURCE_TYPE_GATEWAY) return { gatewayId: resource.id };
    if (resource.type === RESOURCE_TYPE_RELAY) return { relayId: resource.id };
    return { kmipServerId: resource.id };
  };

  // Loads the minimal resource shape the auth-method flows need. KMIP servers have no
  // identityId column — they're always enrollment-based, never machine-identity — so it's
  // reported as null, which keeps them out of the legacy "identity" auth-method path.
  const $loadResource = async (resource: ResourceRef, tx?: Knex): Promise<TBasicResource | null> => {
    if (resource.type === RESOURCE_TYPE_GATEWAY) {
      const gateway = await gatewayV2DAL.findById(resource.id, tx);
      return gateway
        ? { id: gateway.id, name: gateway.name, orgId: gateway.orgId, identityId: gateway.identityId ?? null }
        : null;
    }
    if (resource.type === RESOURCE_TYPE_RELAY) {
      const relay = await relayDAL.findById(resource.id, tx);
      return relay
        ? { id: relay.id, name: relay.name, orgId: relay.orgId ?? null, identityId: relay.identityId ?? null }
        : null;
    }
    const kmipServer = await kmipServerDAL.findById(resource.id, tx);
    return kmipServer ? { id: kmipServer.id, name: kmipServer.name, orgId: kmipServer.orgId, identityId: null } : null;
  };

  // Bumps tokenVersion (invalidating outstanding JWTs) and clears heartbeat. Gateways
  // additionally clear heartbeatTTL; KMIP servers have neither heartbeat column.
  const $bumpTokenVersion = async (resource: ResourceRef, tx?: Knex): Promise<number> => {
    if (resource.type === RESOURCE_TYPE_GATEWAY) {
      const refreshed = await gatewayV2DAL.updateById(
        resource.id,
        { $incr: { tokenVersion: 1 }, heartbeat: null, heartbeatTTL: null },
        tx
      );
      return refreshed.tokenVersion;
    }
    if (resource.type === RESOURCE_TYPE_RELAY) {
      const refreshed = await relayDAL.updateById(resource.id, { $incr: { tokenVersion: 1 }, heartbeat: null }, tx);
      return refreshed.tokenVersion;
    }
    const refreshed = await kmipServerDAL.updateById(resource.id, { $incr: { tokenVersion: 1 } }, tx);
    return refreshed.tokenVersion;
  };

  const $mintJwt = (resource: ResourceRef, orgId: string, tokenVersion: number): string => {
    if (resource.type === RESOURCE_TYPE_GATEWAY) {
      return mintGatewayJwt({ gatewayId: resource.id, orgId, tokenVersion, accessTokenTTL: 0 });
    }
    if (resource.type === RESOURCE_TYPE_RELAY) {
      return mintRelayJwt({ relayId: resource.id, orgId, tokenVersion, accessTokenTTL: 0 });
    }
    return mintKmipServerJwt({ kmipServerId: resource.id, orgId, tokenVersion, accessTokenTTL: 0 });
  };

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
    } else if (resourceType === RESOURCE_TYPE_RELAY) {
      ForbiddenError.from(permission).throwUnlessCan(RELAY_PERMISSION_MAP[intent], OrgPermissionSubjects.Relay);
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        KMIP_SERVER_PERMISSION_MAP[intent],
        OrgPermissionSubjects.KmipServer
      );
    }
  };

  const $loadAuthMethodView = async (resource: ResourceRef): Promise<TAuthMethodView | null> => {
    const loaded = await $loadResource(resource);
    if (!loaded) return null;

    // Identity is checked first — it's the authoritative legacy-state signal
    // and overrides any registry row.
    if (loaded.identityId) {
      const identity = await identityDAL.findById(loaded.identityId);
      return {
        method: ResourceAuthMethodType.Identity,
        config: {
          identityId: loaded.identityId,
          identityName: identity?.name ?? null
        }
      };
    }

    const registry = await resourceAuthMethodDAL.findOne($registryFilter(resource));
    if (!registry) return null;

    if (registry.method === ResourceAuthMethodType.Aws) {
      const config = await resourceAwsAuthDAL.findOne({ authMethodId: registry.id });
      if (!config) {
        throw new NotFoundError({ message: `AWS auth config missing for ${resource.type}` });
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

    const loaded = await $loadResource(resource);
    if (!loaded || loaded.orgId !== actor.orgId) {
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

    const loaded = await $loadResource(resource);
    if (!loaded || loaded.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Relay ${resource.id} not found` });
    }

    const view = await $loadAuthMethodView(resource);
    if (!view) {
      throw new NotFoundError({ message: "Relay has no auth method configured" });
    }
    return view;
  };

  const getByKmipServerId = async ({ resource, actor }: TGetAuthMethodDTO) => {
    assertKmipServerResource(resource, "auth-method");
    await $checkPermission(actor, "list", RESOURCE_TYPE_KMIP);

    const loaded = await $loadResource(resource);
    if (!loaded || loaded.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `KMIP server ${resource.id} not found` });
    }

    const view = await $loadAuthMethodView(resource);
    if (!view) {
      throw new NotFoundError({ message: "KMIP server has no auth method configured" });
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
    const registry = await resourceAuthMethodDAL.findOne($registryFilter({ type: resourceType, id: resourceInfo.id }));
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
    const registry = await resourceAuthMethodDAL.create(
      { ...$registryFilter(resource), method: authMethod.method },
      tx
    );
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

    const resourceLabel = RESOURCE_LABEL[resource.type];
    const loaded = await $loadResource(resource);
    if (!loaded || loaded.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `${resourceLabel} ${resource.id} not found` });
    }

    if (loaded.identityId) {
      throw new BadRequestError({
        message: `This ${resourceLabel.toLowerCase()} is using legacy machine identity auth. Create a new ${resourceLabel.toLowerCase()} with the desired auth method instead of migrating this one.`
      });
    }

    const registryFilter = $registryFilter(resource);
    const current = await resourceAuthMethodDAL.findOne(registryFilter);
    const previousMethod = current?.method ?? null;

    await resourceAuthMethodDAL.transaction(async (tx) => {
      // 1. Upsert registry row to the new method.
      let registryRow = current;
      if (current) {
        registryRow = await resourceAuthMethodDAL.updateById(current.id, { method: authMethod.method }, tx);
      } else {
        registryRow = await resourceAuthMethodDAL.create({ ...registryFilter, method: authMethod.method }, tx);
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

    const resourceLabel = RESOURCE_LABEL[resource.type];
    const loaded = await $loadResource(resource);
    if (!loaded || loaded.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `${resourceLabel} ${resource.id} not found` });
    }

    const registry = await resourceAuthMethodDAL.findOne($registryFilter(resource));
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
      resourceName: loaded.name,
      orgId: loaded.orgId
    };
  };

  const revokeAccess = async ({ resource, actor }: TRevokeTokenDTO) => {
    await $checkPermission(actor, "revoke", resource.type);

    const resourceLabel = RESOURCE_LABEL[resource.type];
    const loaded = await $loadResource(resource);
    if (!loaded || loaded.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `${resourceLabel} ${resource.id} not found` });
    }

    const registry = await resourceAuthMethodDAL.findOne($registryFilter(resource));
    if (!registry) {
      throw new NotFoundError({ message: `${resourceLabel} has no auth method configured` });
    }
    if (loaded.identityId) {
      throw new BadRequestError({
        message: `Identity-bound ${resourceLabel.toLowerCase()}s cannot be revoked directly. Create a new ${resourceLabel.toLowerCase()} with AWS or Token auth instead.`
      });
    }

    await resourceTokenAuthDAL.transaction(async (tx) => {
      if (registry.method === ResourceAuthMethodType.Token) {
        const tokens = await resourceTokenAuthDAL.find({ authMethodId: registry.id }, { tx });
        if (tokens.length > 0) {
          await resourceTokenAuthDAL.delete({ authMethodId: registry.id }, tx);
        }
      }
      await $bumpTokenVersion(resource, tx);
    });

    return {
      resourceName: loaded.name,
      orgId: loaded.orgId,
      method: registry.method as "aws" | "token"
    };
  };

  const loginWithAws = async ({
    resource,
    iamHttpRequestMethod,
    iamRequestBody,
    iamRequestHeaders
  }: TLoginWithAwsDTO) => {
    const resourceLabel = RESOURCE_LABEL[resource.type];
    const loaded = await $loadResource(resource);
    if (!loaded || !loaded.orgId) {
      throw new UnauthorizedError({ message: `Invalid ${resourceLabel.toLowerCase()} credentials` });
    }
    const resourceName = loaded.name;
    const resourceOrgId = loaded.orgId;

    const registry = await resourceAuthMethodDAL.findOne($registryFilter(resource));
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

    const refreshedTokenVersion = await $bumpTokenVersion(resource);

    const accessToken = $mintJwt(resource, resourceOrgId, refreshedTokenVersion);

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

    // Determine resource type from which FK is set on the registry row — exactly one must be set.
    const linkedResourceId = registry.gatewayId ?? registry.relayId ?? registry.kmipServerId;
    if (!linkedResourceId) {
      throw new BadRequestError({ message: "Enrollment token is not linked to a resource" });
    }

    let actualResourceType: ResourceRef["type"];
    if (registry.gatewayId) actualResourceType = RESOURCE_TYPE_GATEWAY;
    else if (registry.relayId) actualResourceType = RESOURCE_TYPE_RELAY;
    else actualResourceType = RESOURCE_TYPE_KMIP;

    if (actualResourceType !== expectedResourceType) {
      throw new BadRequestError({
        message: `Enrollment token belongs to a ${actualResourceType}, not a ${expectedResourceType}`
      });
    }

    const linkedResource: ResourceRef = { type: actualResourceType, id: linkedResourceId };

    const result = await resourceTokenAuthDAL.transaction(async (tx) => {
      const deleted = await resourceTokenAuthDAL.delete({ id: tokenRecord.id }, tx);
      if (deleted.length === 0) {
        throw new BadRequestError({ message: "Enrollment token has already been used" });
      }
      const existing = await $loadResource(linkedResource, tx);
      if (!existing) {
        throw new NotFoundError({ message: `${RESOURCE_LABEL[actualResourceType]} ${linkedResourceId} not found` });
      }
      const tokenVersion = await $bumpTokenVersion(linkedResource, tx);
      return { name: existing.name, orgId: existing.orgId, tokenVersion };
    });

    if (!result.orgId) {
      throw new BadRequestError({ message: "Enrollment token is not linked to a resource" });
    }

    const accessToken = $mintJwt(linkedResource, result.orgId, result.tokenVersion);

    return {
      accessToken,
      resourceType: actualResourceType,
      resourceId: linkedResourceId,
      resourceName: result.name,
      orgId: result.orgId,
      enrollmentTokenId: tokenRecord.id
    };
  };

  return {
    getByGatewayId,
    getByRelayId,
    getByKmipServerId,
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
