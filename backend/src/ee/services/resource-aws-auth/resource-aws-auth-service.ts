import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { assertGatewayResource, mintGatewayJwt } from "../resource-auth-method-fns";
import { TResourceAwsAuthDALFactory } from "./resource-aws-auth-dal";
import { validateAllowlists, verifyStsAndExtractCaller } from "./resource-aws-auth-fns";
import {
  TAttachResourceAwsAuthDTO,
  TGetResourceAwsAuthDTO,
  TLoginResourceAwsAuthDTO,
  TRevokeResourceAwsAuthDTO,
  TUpdateResourceAwsAuthDTO
} from "./resource-aws-auth-types";

type TResourceAwsAuthServiceFactoryDep = {
  resourceAwsAuthDAL: TResourceAwsAuthDALFactory;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById" | "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TResourceAwsAuthServiceFactory = ReturnType<typeof resourceAwsAuthServiceFactory>;

export const resourceAwsAuthServiceFactory = ({
  resourceAwsAuthDAL,
  gatewayV2DAL,
  permissionService
}: TResourceAwsAuthServiceFactoryDep) => {
  const $checkEditPermission = async (actor: TAttachResourceAwsAuthDTO["actor"]) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.EditGateways,
      OrgPermissionSubjects.Gateway
    );
  };

  const attachAwsAuth = async ({
    resource,
    stsEndpoint,
    allowedPrincipalArns,
    allowedAccountIds,
    actor
  }: TAttachResourceAwsAuthDTO) => {
    assertGatewayResource(resource, "AWS");
    await $checkEditPermission(actor);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    const existing = await resourceAwsAuthDAL.findOne({ gatewayId: resource.id });
    if (existing) {
      throw new BadRequestError({ message: "AWS auth method is already attached to this gateway" });
    }

    // Migrating an identity-based gateway: clear identityId in the same tx so the gateway
    // is no longer authenticated via machine identity. The existing daemon keeps its JWT
    // until process restart; on restart it will need the new auth method to bootstrap.
    const unlinkedIdentityId = gateway.identityId ?? null;

    const created = await resourceAwsAuthDAL.transaction(async (tx) => {
      const row = await resourceAwsAuthDAL.create(
        {
          gatewayId: resource.id,
          stsEndpoint,
          allowedPrincipalArns,
          allowedAccountIds
        },
        tx
      );
      if (unlinkedIdentityId) {
        await gatewayV2DAL.updateById(gateway.id, { identityId: null }, tx);
      }
      return row;
    });

    return { ...created, orgId: gateway.orgId, gatewayName: gateway.name, unlinkedIdentityId };
  };

  const updateAwsAuth = async ({
    resource,
    stsEndpoint,
    allowedPrincipalArns,
    allowedAccountIds,
    actor
  }: TUpdateResourceAwsAuthDTO) => {
    assertGatewayResource(resource, "AWS");
    await $checkEditPermission(actor);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    const existing = await resourceAwsAuthDAL.findOne({ gatewayId: resource.id });
    if (!existing) {
      throw new NotFoundError({ message: "AWS auth method is not attached to this gateway" });
    }

    const updated = await resourceAwsAuthDAL.updateById(existing.id, {
      stsEndpoint,
      allowedPrincipalArns,
      allowedAccountIds
    });

    return { ...updated, orgId: gateway.orgId, gatewayName: gateway.name };
  };

  const getAwsAuth = async ({ resource, actor }: TGetResourceAwsAuthDTO) => {
    assertGatewayResource(resource, "AWS");
    await $checkEditPermission(actor);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    const existing = await resourceAwsAuthDAL.findOne({ gatewayId: resource.id });
    if (!existing) {
      throw new NotFoundError({ message: "AWS auth method is not attached to this gateway" });
    }

    return { ...existing, orgId: gateway.orgId, gatewayName: gateway.name };
  };

  const revokeAwsAuth = async ({ resource, actor }: TRevokeResourceAwsAuthDTO) => {
    assertGatewayResource(resource, "AWS");
    await $checkEditPermission(actor);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    const existing = await resourceAwsAuthDAL.findOne({ gatewayId: resource.id });
    if (!existing) {
      throw new NotFoundError({ message: "AWS auth method is not attached to this gateway" });
    }

    // Bump tokenVersion alongside the delete so any active GATEWAY_ACCESS_TOKEN dies
    // immediately. Revocation is gateway-wide because we have no per-token tracking.
    const deleted = await resourceAwsAuthDAL.transaction(async (tx) => {
      const [row] = await resourceAwsAuthDAL.delete({ gatewayId: resource.id }, tx);
      await gatewayV2DAL.updateById(gateway.id, { $incr: { tokenVersion: 1 } }, tx);
      return row;
    });

    return { ...deleted, orgId: gateway.orgId, gatewayName: gateway.name };
  };

  const loginWithAwsAuth = async ({
    resource,
    iamHttpRequestMethod,
    iamRequestBody,
    iamRequestHeaders
  }: TLoginResourceAwsAuthDTO) => {
    assertGatewayResource(resource, "AWS");

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    const config = await resourceAwsAuthDAL.findOne({ gatewayId: gateway.id });
    if (!config) {
      throw new NotFoundError({ message: "AWS auth method not attached to this gateway" });
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

    // Bump tokenVersion on every successful login. tokenVersion is the sole revocation lever
    // for GATEWAY_ACCESS_TOKEN — bumping invalidates every previously-issued JWT for this
    // gateway, matching the semantics of token-auth's enrollment flow. Issued JWTs themselves
    // do not expire (TTL=0).
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

  return {
    attachAwsAuth,
    updateAwsAuth,
    getAwsAuth,
    revokeAwsAuth,
    loginWithAwsAuth
  };
};
