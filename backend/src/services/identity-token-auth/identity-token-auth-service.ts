import { AccessScope, IdentityAuthMethod, TableName } from "@app/db/schemas";
import { TInstanceConfigCoreDomain } from "@app/domains/platform/instance-config-core/ce/module";
import { TLicenseDomain } from "@app/domains/platform/license/ce/module";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/domains/platform/organizations/ce/module";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { ActorType } from "@app/lib/auth/actor-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr, TIp } from "@app/lib/ip";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";
import {
  emitIdentityAuthMethodChanged,
  IdentityAuthMethodChange
} from "@app/services/identity/identity-auth-method-events";

import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { computeTokenAuthRevokeMarkerExpiry } from "../identity-access-token/identity-access-token-fns";
import { TIdentityAccessTokenServiceFactory } from "../identity-access-token/identity-access-token-service";
import { assertIdentityAuthAccessAllowed, TIdentityAuthPermissionDeps } from "../identity/identity-auth-permission-fns";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { recordIdentityLastLogin, shouldRecordIdentityLastLogin } from "../membership-identity/membership-identity-fns";
import { TOrgDALFactory } from "../org/org-dal";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityTokenAuthDALFactory } from "./identity-token-auth-dal";
import {
  TAttachTokenAuthDTO,
  TCreateTokenAuthTokenDTO,
  TGetTokenAuthDTO,
  TGetTokenAuthTokenByIdDTO,
  TGetTokenAuthTokensDTO,
  TRevokeTokenAuthDTO,
  TRevokeTokenAuthTokenDTO,
  TUpdateTokenAuthDTO,
  TUpdateTokenAuthTokenDTO
} from "./identity-token-auth-types";

type TIdentityTokenAuthServiceFactoryDep = {
  identityTokenAuthDAL: Pick<
    TIdentityTokenAuthDALFactory,
    "transaction" | "create" | "findOne" | "updateById" | "delete"
  >;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
  identityAccessTokenDAL: Pick<
    TIdentityAccessTokenDALFactory,
    "create" | "find" | "update" | "findById" | "findOne" | "updateById" | "delete"
  >;
  identityAccessTokenService: Pick<
    TIdentityAccessTokenServiceFactory,
    | "issueIdentityAccessToken"
    | "revokeTokensForIdentityAuthMethod"
    | "markPerTokenRevocation"
    | "invalidateTrustedIpsCache"
  >;
  licenseDomain: TLicenseDomain;
  instanceConfigCoreDomain: Pick<TInstanceConfigCoreDomain, "getAdminIdentityIds">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne" | "findEffectiveOrgMembership">;
  eventEmitter: TEventEmitter;
} & TIdentityAuthPermissionDeps;

export type TIdentityTokenAuthServiceFactory = ReturnType<typeof identityTokenAuthServiceFactory>;

export const identityTokenAuthServiceFactory = ({
  identityTokenAuthDAL,
  membershipIdentityDAL,
  keyStore,
  identityAccessTokenDAL,
  identityAccessTokenService,
  organizationsDomain,
  projectsDomain,
  secretsDomain,
  accessControlDomain,
  licenseDomain,
  instanceConfigCoreDomain,
  orgDAL,
  eventEmitter
}: TIdentityTokenAuthServiceFactoryDep) => {
  const identityAuthPermissionDeps = { organizationsDomain, projectsDomain, secretsDomain, accessControlDomain };

  const attachTokenAuth = async ({
    identityId,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actor,
    isActorSuperAdmin
  }: TAttachTokenAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actor.org.id
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actor.org.id) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add Token Auth to already configured identity"
      });
    }

    if (accessTokenMaxTTL > 0 && accessTokenTTL > accessTokenMaxTTL) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    await assertIdentityAuthAccessAllowed(identityAuthPermissionDeps, {
      identityId,
      identityName: identityMembershipOrg.identity.name,
      orgId: identityMembershipOrg.scopeOrgId,
      projectId: identityMembershipOrg.identity.projectId,
      action: OrgPermissionIdentityActions.EditAuth,
      baseMessage: "Failed to add token auth to identity with more privileged role",
      actor
    });

    await validateIdentityUpdateForSuperAdminPrivileges(instanceConfigCoreDomain, identityId, isActorSuperAdmin);

    const plan = await licenseDomain.getPlan(identityMembershipOrg.scopeOrgId);
    const reformattedAccessTokenTrustedIps = accessTokenTrustedIps.map((accessTokenTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        accessTokenTrustedIp.ipAddress !== "0.0.0.0/0" &&
        accessTokenTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to access token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(accessTokenTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(accessTokenTrustedIp.ipAddress);
    });

    const identityTokenAuth = await identityTokenAuthDAL.transaction(async (tx) => {
      const doc = await identityTokenAuthDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps)
        },
        tx
      );
      await emitIdentityAuthMethodChanged(
        eventEmitter,
        {
          membership: identityMembershipOrg,
          authMethod: IdentityAuthMethod.TOKEN_AUTH,
          change: IdentityAuthMethodChange.Added,
          actor: actor.principal.type,
          actorId: actor.principal.id
        },
        tx
      );
      return doc;
    });
    await identityAccessTokenService.invalidateTrustedIpsCache(identityId, IdentityAuthMethod.TOKEN_AUTH);
    return { ...identityTokenAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const updateTokenAuth = async ({
    identityId,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actor,
    isActorSuperAdmin
  }: TUpdateTokenAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actor.org.id
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actor.org.id) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have token auth"
      });
    }

    const identityTokenAuth = await identityTokenAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityTokenAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityTokenAuth.accessTokenMaxTTL) >
        (accessTokenMaxTTL || identityTokenAuth.accessTokenMaxTTL)
    ) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    await assertIdentityAuthAccessAllowed(identityAuthPermissionDeps, {
      identityId,
      identityName: identityMembershipOrg.identity.name,
      orgId: identityMembershipOrg.scopeOrgId,
      projectId: identityMembershipOrg.identity.projectId,
      action: OrgPermissionIdentityActions.EditAuth,
      baseMessage: "Failed to update token auth of identity with more privileged role",
      actor
    });

    await validateIdentityUpdateForSuperAdminPrivileges(instanceConfigCoreDomain, identityId, isActorSuperAdmin);

    const plan = await licenseDomain.getPlan(identityMembershipOrg.scopeOrgId);
    const reformattedAccessTokenTrustedIps = accessTokenTrustedIps?.map((accessTokenTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        accessTokenTrustedIp.ipAddress !== "0.0.0.0/0" &&
        accessTokenTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to access token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(accessTokenTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(accessTokenTrustedIp.ipAddress);
    });

    const updatedTokenAuth = await identityTokenAuthDAL.transaction(async (tx) => {
      const doc = await identityTokenAuthDAL.updateById(
        identityTokenAuth.id,
        {
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: reformattedAccessTokenTrustedIps
            ? JSON.stringify(reformattedAccessTokenTrustedIps)
            : undefined
        },
        tx
      );
      await emitIdentityAuthMethodChanged(
        eventEmitter,
        {
          membership: identityMembershipOrg,
          authMethod: IdentityAuthMethod.TOKEN_AUTH,
          change: IdentityAuthMethodChange.Updated,
          actor: actor.principal.type,
          actorId: actor.principal.id
        },
        tx
      );
      return doc;
    });

    await identityAccessTokenService.invalidateTrustedIpsCache(identityId, IdentityAuthMethod.TOKEN_AUTH);
    return {
      ...updatedTokenAuth,
      orgId: identityMembershipOrg.scopeOrgId
    };
  };

  const getTokenAuth = async ({ identityId, actor }: TGetTokenAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actor.org.id
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actor.org.id) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new NotFoundError({
        message: "Token Auth configuration not found for identity"
      });
    }

    const identityTokenAuth = await identityTokenAuthDAL.findOne({ identityId });

    if (identityMembershipOrg.identity.projectId) {
      const permission = await projectsDomain.getProjectPermission({
        actor,
        projectId: identityMembershipOrg.identity.projectId
      });

      permission.assert({
        action: ProjectPermissionIdentityActions.Read,
        subject: ProjectPermissionSub.Identity,
        fields: { identityId }
      });
    } else {
      const permission = await organizationsDomain.getOrgPermission({ actor, orgId: identityMembershipOrg.scopeOrgId });
      permission.assert({ action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity });
    }

    return { ...identityTokenAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const revokeIdentityTokenAuth = async ({ identityId, actor, isActorSuperAdmin }: TRevokeTokenAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actor.org.id
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actor.org.id) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }

    await assertIdentityAuthAccessAllowed(identityAuthPermissionDeps, {
      identityId,
      identityName: identityMembershipOrg.identity.name,
      orgId: identityMembershipOrg.scopeOrgId,
      projectId: identityMembershipOrg.identity.projectId,
      action: OrgPermissionIdentityActions.RevokeAuth,
      baseMessage: "Failed to revoke token auth of identity with more privileged role",
      actor
    });

    await validateIdentityUpdateForSuperAdminPrivileges(instanceConfigCoreDomain, identityId, isActorSuperAdmin);

    const revokedIdentityTokenAuth = await identityTokenAuthDAL.transaction(async (tx) => {
      const deletedTokenAuth = await identityTokenAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.TOKEN_AUTH }, tx);

      await emitIdentityAuthMethodChanged(
        eventEmitter,
        {
          membership: identityMembershipOrg,
          authMethod: IdentityAuthMethod.TOKEN_AUTH,
          change: IdentityAuthMethodChange.Removed,
          actor: actor.principal.type,
          actorId: actor.principal.id
        },
        tx
      );
      return { ...deletedTokenAuth?.[0], orgId: identityMembershipOrg.scopeOrgId };
    });

    // Detaching the auth method must invalidate any tokens already issued
    // through it; without this, leaked tokens authenticate up to MAX_AGE
    // even after the admin pulled the auth method.
    await identityAccessTokenService.revokeTokensForIdentityAuthMethod({
      identityId,
      authMethod: IdentityAuthMethod.TOKEN_AUTH
    });
    await identityAccessTokenService.invalidateTrustedIpsCache(identityId, IdentityAuthMethod.TOKEN_AUTH);

    return revokedIdentityTokenAuth;
  };

  const createTokenAuthToken = async ({
    identityId,
    actor,
    name,
    isActorSuperAdmin,
    organizationSlug
  }: TCreateTokenAuthTokenDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actor.org.id
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actor.org.id) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }

    await assertIdentityAuthAccessAllowed(identityAuthPermissionDeps, {
      identityId,
      identityName: identityMembershipOrg.identity.name,
      orgId: identityMembershipOrg.scopeOrgId,
      projectId: identityMembershipOrg.identity.projectId,
      action: OrgPermissionIdentityActions.CreateToken,
      baseMessage: "Failed to create token for identity with more privileged role",
      actor
    });

    await validateIdentityUpdateForSuperAdminPrivileges(instanceConfigCoreDomain, identityId, isActorSuperAdmin);

    const identityTokenAuth = await identityTokenAuthDAL.findOne({ identityId });

    const { identity } = identityMembershipOrg;

    const org = await requestMemoize(requestMemoKeys.orgFindById(identity.orgId), () =>
      orgDAL.findById(identity.orgId)
    );
    const isSubOrgIdentity = Boolean(org.rootOrgId);

    // If the identity is a sub-org identity, then the scope is always the org.id, and if it's a root org identity, then we need to resolve the scope if a organizationSlug is specified
    let subOrganizationId = isSubOrgIdentity ? org.id : null;

    if (organizationSlug && org.slug !== organizationSlug) {
      if (!isSubOrgIdentity) {
        const subOrg = await orgDAL.findOne({ rootOrgId: org.id, slug: organizationSlug });

        if (!subOrg) {
          throw new NotFoundError({ message: `Sub organization with slug ${organizationSlug} not found` });
        }

        const subOrgMembership = await orgDAL.findEffectiveOrgMembership({
          actorType: ActorType.IDENTITY,
          actorId: identity.id,
          orgId: subOrg.id
        });

        if (!subOrgMembership) {
          throw new UnauthorizedError({
            message: `Identity not authorized to access sub organization ${organizationSlug}`
          });
        }

        subOrganizationId = subOrg.id;
      }
    }

    const subOrgDetails =
      subOrganizationId && subOrganizationId !== org.id ? await orgDAL.findById(subOrganizationId) : null;
    const tokenScopeOrg = subOrgDetails ?? org;
    const tokenRootOrgId = tokenScopeOrg.rootOrgId ?? tokenScopeOrg.id;
    const tokenParentOrgId = tokenScopeOrg.parentOrgId ?? tokenRootOrgId;

    // checked before the transaction opens so the Redis round trip doesn't hold a pooled connection
    const shouldRecordLastLogin = await shouldRecordIdentityLastLogin(keyStore, identity.id);

    // Token Auth is the only auth method that materializes a real PG row at
    // issuance time — its tokens are admin-managed and listed in the UI, so
    // we hand the helper a transaction so the row insert and the
    // membership-update happen atomically.
    const { accessToken, identityAccessToken } = await identityTokenAuthDAL.transaction(async (tx) => {
      if (shouldRecordLastLogin) {
        await recordIdentityLastLogin(membershipIdentityDAL, identity, IdentityAuthMethod.TOKEN_AUTH, tx);
      }

      const issued = await identityAccessTokenService.issueIdentityAccessToken({
        identityId: identity.id,
        identityName: identity.name,
        authMethod: IdentityAuthMethod.TOKEN_AUTH,
        orgId: tokenScopeOrg.id,
        rootOrgId: tokenRootOrgId,
        parentOrgId: tokenParentOrgId,
        subOrganizationId,
        accessTokenTTL: Number(identityTokenAuth.accessTokenTTL),
        accessTokenMaxTTL: Number(identityTokenAuth.accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(identityTokenAuth.accessTokenNumUsesLimit),
        // Token Auth schema has no accessTokenPeriod column.
        accessTokenPeriod: 0,
        accessTokenTrustedIps: identityTokenAuth.accessTokenTrustedIps as TIp[],
        persistToPg: { tx, name }
      });
      await emitIdentityAuthMethodChanged(
        eventEmitter,
        {
          membership: identityMembershipOrg,
          authMethod: IdentityAuthMethod.TOKEN_AUTH,
          change: IdentityAuthMethodChange.CredentialAdded,
          actor: actor.principal.type,
          actorId: actor.principal.id,
          credential: { id: issued.identityAccessToken.id, name }
        },
        tx
      );
      return issued;
    });

    return { accessToken, identityTokenAuth, identityAccessToken, identity };
  };

  const getTokenAuthTokens = async ({
    identityId,
    offset = 0,
    limit = 20,
    actor,
    isActorSuperAdmin
  }: TGetTokenAuthTokensDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actor.org.id
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (identityMembershipOrg.identity.orgId !== actor.org.id) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }

    if (identityMembershipOrg.identity.projectId) {
      const permission = await projectsDomain.getProjectPermission({
        actor,
        projectId: identityMembershipOrg.identity.projectId
      });

      permission.assert({
        action: ProjectPermissionIdentityActions.Read,
        subject: ProjectPermissionSub.Identity,
        fields: { identityId }
      });
    } else {
      const permission = await organizationsDomain.getOrgPermission({ actor, orgId: identityMembershipOrg.scopeOrgId });
      permission.assert({ action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity });
    }

    await validateIdentityUpdateForSuperAdminPrivileges(instanceConfigCoreDomain, identityId, isActorSuperAdmin);

    const tokens = await identityAccessTokenDAL.find(
      {
        identityId,
        authMethod: IdentityAuthMethod.TOKEN_AUTH
      },
      { offset, limit, sort: [["updatedAt", "desc"]] }
    );

    return { tokens, identityMembershipOrg };
  };

  const getTokenAuthTokenById = async ({ tokenId, actor }: TGetTokenAuthTokenByIdDTO) => {
    const foundToken = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: tokenId,
      [`${TableName.IdentityAccessToken}.authMethod` as "authMethod"]: IdentityAuthMethod.TOKEN_AUTH
    });
    if (!foundToken) throw new NotFoundError({ message: `Token with ID ${tokenId} not found` });

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actor.org.id
      },
      identityId: foundToken.identityId
    });
    if (!identityMembershipOrg) {
      throw new NotFoundError({ message: `Failed to find identity with ID ${foundToken.identityId}` });
    }

    if (identityMembershipOrg.identity.orgId !== actor.org.id) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }

    if (identityMembershipOrg.identity.projectId) {
      const permission = await projectsDomain.getProjectPermission({
        actor,
        projectId: identityMembershipOrg.identity.projectId
      });

      permission.assert({
        action: ProjectPermissionIdentityActions.Read,
        subject: ProjectPermissionSub.Identity,
        fields: { identityId: identityMembershipOrg.identity.id }
      });
    } else {
      const permission = await organizationsDomain.getOrgPermission({ actor, orgId: identityMembershipOrg.scopeOrgId });
      permission.assert({ action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity });
    }

    return { token: foundToken, identityMembershipOrg };
  };

  const updateTokenAuthToken = async ({ tokenId, name, actor, isActorSuperAdmin }: TUpdateTokenAuthTokenDTO) => {
    const foundToken = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: tokenId,
      [`${TableName.IdentityAccessToken}.authMethod` as "authMethod"]: IdentityAuthMethod.TOKEN_AUTH
    });
    if (!foundToken) throw new NotFoundError({ message: `Token with ID ${tokenId} not found` });

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actor.org.id
      },
      identityId: foundToken.identityId
    });
    if (!identityMembershipOrg) {
      throw new NotFoundError({ message: `Failed to find identity with ID ${foundToken.identityId}` });
    }

    if (identityMembershipOrg.identity.orgId !== actor.org.id) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }

    await assertIdentityAuthAccessAllowed(identityAuthPermissionDeps, {
      identityId: identityMembershipOrg.identity.id,
      identityName: identityMembershipOrg.identity.name,
      orgId: identityMembershipOrg.scopeOrgId,
      projectId: identityMembershipOrg.identity.projectId,
      action: OrgPermissionIdentityActions.CreateToken,
      baseMessage: "Failed to update token for identity with more privileged role",
      actor
    });

    await validateIdentityUpdateForSuperAdminPrivileges(
      instanceConfigCoreDomain,
      foundToken.identityId,
      isActorSuperAdmin
    );

    const token = await identityTokenAuthDAL.transaction(async (tx) => {
      const [doc] = await identityAccessTokenDAL.update(
        { authMethod: IdentityAuthMethod.TOKEN_AUTH, identityId: foundToken.identityId, id: tokenId },
        { name },
        tx
      );
      await emitIdentityAuthMethodChanged(
        eventEmitter,
        {
          membership: identityMembershipOrg,
          authMethod: IdentityAuthMethod.TOKEN_AUTH,
          change: IdentityAuthMethodChange.CredentialUpdated,
          actor: actor.principal.type,
          actorId: actor.principal.id,
          credential: { id: doc.id, name: doc.name }
        },
        tx
      );
      return doc;
    });

    return { token, identityMembershipOrg };
  };

  const revokeTokenAuthToken = async ({ tokenId, actor, isActorSuperAdmin }: TRevokeTokenAuthTokenDTO) => {
    const identityAccessToken = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: tokenId,
      [`${TableName.IdentityAccessToken}.isAccessTokenRevoked` as "isAccessTokenRevoked"]: false,
      [`${TableName.IdentityAccessToken}.authMethod` as "authMethod"]: IdentityAuthMethod.TOKEN_AUTH
    });

    if (!identityAccessToken)
      throw new NotFoundError({
        message: `Token with ID ${tokenId} not found or already revoked`
      });

    const identityOrgMembership = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actor.org.id
      },
      identityId: identityAccessToken.identityId
    });

    if (!identityOrgMembership) {
      throw new NotFoundError({ message: `Failed to find identity with ID ${identityAccessToken.identityId}` });
    }

    if (identityOrgMembership.identity.orgId !== actor.org.id) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (identityOrgMembership.identity.projectId) {
      const permission = await projectsDomain.getProjectPermission({
        actor,
        projectId: identityOrgMembership.identity.projectId
      });

      permission.assert({
        action: ProjectPermissionIdentityActions.Edit,
        subject: ProjectPermissionSub.Identity,
        fields: { identityId: identityOrgMembership.identity.id }
      });
    } else {
      const permission = await organizationsDomain.getOrgPermission({ actor, orgId: identityOrgMembership.scopeOrgId });
      permission.assert({ action: OrgPermissionIdentityActions.Edit, subject: OrgPermissionSubjects.Identity });
    }

    await validateIdentityUpdateForSuperAdminPrivileges(
      instanceConfigCoreDomain,
      identityAccessToken.identityId,
      isActorSuperAdmin
    );

    const revokedToken = await identityTokenAuthDAL.transaction(async (tx) => {
      const [doc] = await identityAccessTokenDAL.update(
        { id: identityAccessToken.id, authMethod: IdentityAuthMethod.TOKEN_AUTH },
        { isAccessTokenRevoked: true },
        tx
      );
      await emitIdentityAuthMethodChanged(
        eventEmitter,
        {
          membership: identityOrgMembership,
          authMethod: IdentityAuthMethod.TOKEN_AUTH,
          change: IdentityAuthMethodChange.CredentialRevoked,
          actor: actor.principal.type,
          actorId: actor.principal.id,
          credential: { id: doc.id, name: doc.name }
        },
        tx
      );
      return doc;
    });

    // No JWT here, so the helper anchors on now plus the row's issuance cap.
    const expiresAt = computeTokenAuthRevokeMarkerExpiry({
      accessTokenTTL: identityAccessToken.accessTokenTTL,
      accessTokenMaxTTL: identityAccessToken.accessTokenMaxTTL,
      accessTokenPeriod: identityAccessToken.accessTokenPeriod,
      createdAtMs: identityAccessToken.createdAt.getTime()
    });
    await identityAccessTokenService.markPerTokenRevocation({
      tokenId: identityAccessToken.id,
      identityId: identityAccessToken.identityId,
      expiresAt
    });

    return { revokedToken };
  };

  return {
    attachTokenAuth,
    updateTokenAuth,
    getTokenAuth,
    revokeIdentityTokenAuth,
    createTokenAuthToken,
    getTokenAuthTokens,
    getTokenAuthTokenById,
    updateTokenAuthToken,
    revokeTokenAuthToken
  };
};
