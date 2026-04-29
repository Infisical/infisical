import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope, TableName } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TGatewayV2DALFactory } from "../gateway-v2/gateway-v2-dal";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { assertGatewayResource, mintGatewayJwt } from "../resource-auth-method-fns";
import { TResourceEnrollmentTokenDALFactory } from "./resource-enrollment-token-dal";
import { TResourceTokenAuthDALFactory } from "./resource-token-auth-dal";
import {
  TAttachResourceTokenAuthDTO,
  TEnrollWithTokenDTO,
  TGenerateResourceEnrollmentTokenDTO,
  TGetResourceTokenAuthDTO,
  TRevokeResourceTokenAuthDTO
} from "./resource-token-auth-types";

// Hardcoded enrollment-token TTL — matches the long-standing 1h default. Operators don't get a
// configurability surface for this; if a real need surfaces, add it back later.
const ENROLLMENT_TOKEN_TTL_SECONDS = 3600;

type TResourceTokenAuthServiceFactoryDep = {
  resourceTokenAuthDAL: TResourceTokenAuthDALFactory;
  resourceEnrollmentTokenDAL: TResourceEnrollmentTokenDALFactory;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById" | "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TResourceTokenAuthServiceFactory = ReturnType<typeof resourceTokenAuthServiceFactory>;

const $generateEnrollmentToken = () => {
  const plainToken = `gwe_${crypto.randomBytes(32).toString("base64url")}`;
  const tokenHash = crypto.nativeCrypto.createHash("sha256").update(plainToken).digest("hex");
  const expiresAt = new Date(Date.now() + ENROLLMENT_TOKEN_TTL_SECONDS * 1000);
  return { plainToken, tokenHash, expiresAt };
};

export const resourceTokenAuthServiceFactory = ({
  resourceTokenAuthDAL,
  resourceEnrollmentTokenDAL,
  gatewayV2DAL,
  permissionService
}: TResourceTokenAuthServiceFactoryDep) => {
  const $checkEditPermission = async (actor: TAttachResourceTokenAuthDTO["actor"]) => {
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

  const attachTokenAuth = async ({ resource, actor }: TAttachResourceTokenAuthDTO) => {
    assertGatewayResource(resource, "token");
    await $checkEditPermission(actor);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    const existing = await resourceTokenAuthDAL.findOne({ gatewayId: resource.id });
    if (existing) {
      throw new BadRequestError({ message: "Token auth method is already attached to this gateway" });
    }

    // Migrating an identity-based gateway: clear identityId in the same tx so the gateway
    // is no longer authenticated via machine identity. The existing daemon keeps its JWT
    // until process restart; on restart it will need the new auth method to bootstrap.
    const unlinkedIdentityId = gateway.identityId ?? null;

    const created = await resourceTokenAuthDAL.transaction(async (tx) => {
      const row = await resourceTokenAuthDAL.create({ gatewayId: resource.id }, tx);
      if (unlinkedIdentityId) {
        await gatewayV2DAL.updateById(gateway.id, { identityId: null }, tx);
      }
      return row;
    });

    return { ...created, orgId: gateway.orgId, gatewayName: gateway.name, unlinkedIdentityId };
  };

  const getTokenAuth = async ({ resource, actor }: TGetResourceTokenAuthDTO) => {
    assertGatewayResource(resource, "token");
    await $checkEditPermission(actor);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    const existing = await resourceTokenAuthDAL.findOne({ gatewayId: resource.id });
    if (!existing) {
      throw new NotFoundError({ message: "Token auth method is not attached to this gateway" });
    }

    return { ...existing, orgId: gateway.orgId, gatewayName: gateway.name };
  };

  const revokeTokenAuth = async ({ resource, actor }: TRevokeResourceTokenAuthDTO) => {
    assertGatewayResource(resource, "token");
    await $checkEditPermission(actor);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    const existing = await resourceTokenAuthDAL.findOne({ gatewayId: resource.id });
    if (!existing) {
      throw new NotFoundError({ message: "Token auth method is not attached to this gateway" });
    }

    // Bump tokenVersion so any active GATEWAY_ACCESS_TOKEN dies immediately, and clear
    // pending enrollment tokens so no dangling unused bootstrap credentials remain.
    const deleted = await resourceTokenAuthDAL.transaction(async (tx) => {
      const [row] = await resourceTokenAuthDAL.delete({ gatewayId: resource.id }, tx);
      const pending = await resourceEnrollmentTokenDAL.find({ gatewayId: resource.id }, { tx });
      const unusedIds = pending.filter((t) => !t.usedAt).map((t) => t.id);
      if (unusedIds.length > 0) {
        await resourceEnrollmentTokenDAL.delete({ $in: { id: unusedIds } }, tx);
      }
      await gatewayV2DAL.updateById(gateway.id, { $incr: { tokenVersion: 1 } }, tx);
      return row;
    });

    return { ...deleted, orgId: gateway.orgId, gatewayName: gateway.name };
  };

  const generateEnrollmentToken = async ({ resource, actor }: TGenerateResourceEnrollmentTokenDTO) => {
    assertGatewayResource(resource, "token");
    await $checkEditPermission(actor);

    const gateway = await gatewayV2DAL.findById(resource.id);
    if (!gateway || gateway.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Gateway ${resource.id} not found` });
    }

    // No identityId check here: attachTokenAuth unlinks the identity, so by the time we
    // reach this point any prior identity binding is already cleared.
    const config = await resourceTokenAuthDAL.findOne({ gatewayId: resource.id });
    if (!config) {
      throw new NotFoundError({ message: "Token auth method is not attached to this gateway" });
    }

    const generated = $generateEnrollmentToken();

    const record = await resourceEnrollmentTokenDAL.transaction(async (tx) => {
      // Replace any existing unused enrollment tokens for this gateway.
      const existingTokens = await resourceEnrollmentTokenDAL.find({ gatewayId: resource.id }, { tx });
      const unusedTokenIds = existingTokens.filter((t) => !t.usedAt).map((t) => t.id);
      if (unusedTokenIds.length > 0) {
        await resourceEnrollmentTokenDAL.delete({ $in: { id: unusedTokenIds } }, tx);
      }

      return resourceEnrollmentTokenDAL.create(
        {
          orgId: actor.orgId,
          tokenHash: generated.tokenHash,
          ttl: ENROLLMENT_TOKEN_TTL_SECONDS,
          expiresAt: generated.expiresAt,
          gatewayId: resource.id
        },
        tx
      );
    });

    return {
      ...record,
      token: generated.plainToken,
      gatewayName: gateway.name,
      methodConfigId: config.id
    };
  };

  /**
   * Consumes a transient enrollment token, bumps the gateway's tokenVersion, and mints a
   * forever-JWT (no expiry — matches existing GATEWAY_ACCESS_TOKEN behavior).
   * tokenVersion bump invalidates every previously-issued JWT.
   */
  const enrollWithToken = async ({ token }: TEnrollWithTokenDTO) => {
    const tokenHash = crypto.nativeCrypto.createHash("sha256").update(token).digest("hex");

    const tokenRecord = await resourceEnrollmentTokenDAL.findOne({ tokenHash });
    if (!tokenRecord) {
      throw new BadRequestError({ message: "Invalid enrollment token" });
    }
    if (tokenRecord.expiresAt < new Date()) {
      throw new BadRequestError({ message: "Enrollment token has expired" });
    }
    if (!tokenRecord.gatewayId) {
      throw new BadRequestError({ message: "Enrollment token is not linked to a gateway" });
    }

    const { orgId } = tokenRecord;

    const gateway = await resourceEnrollmentTokenDAL.transaction(async (tx) => {
      const rows = await tx(TableName.ResourceEnrollmentTokens)
        .where({ id: tokenRecord.id })
        .whereNull("usedAt")
        .update({ usedAt: new Date() })
        .returning("*");
      if (rows.length === 0) {
        throw new BadRequestError({ message: "Enrollment token has already been used" });
      }
      const existing = await gatewayV2DAL.findById(tokenRecord.gatewayId!, tx);
      if (!existing) throw new NotFoundError({ message: `Gateway ${tokenRecord.gatewayId} not found` });
      return gatewayV2DAL.updateById(
        existing.id,
        { $incr: { tokenVersion: 1 }, heartbeat: null, lastHealthCheckStatus: null },
        tx
      );
    });

    const config = await resourceTokenAuthDAL.findOne({ gatewayId: gateway.id });

    const accessToken = mintGatewayJwt({
      gatewayId: gateway.id,
      orgId,
      tokenVersion: gateway.tokenVersion,
      accessTokenTTL: 0
    });

    return {
      accessToken,
      gatewayId: gateway.id,
      gatewayName: gateway.name,
      orgId,
      enrollmentTokenId: tokenRecord.id,
      methodConfigId: config?.id ?? null
    };
  };

  return {
    attachTokenAuth,
    getTokenAuth,
    revokeTokenAuth,
    generateEnrollmentToken,
    enrollWithToken
  };
};
