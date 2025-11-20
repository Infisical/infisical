import { ForbiddenError, subject } from "@casl/ability";
import { requestContext } from "@fastify/request-context";

import { AccessScope, ActionProjectType, IdentityAuthMethod, OrganizationActionScope } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  RateLimitError,
  UnauthorizedError
} from "@app/lib/errors";
import { checkIPAgainstBlocklist, extractIPDetails, isValidIpOrCidr, TIp } from "@app/lib/ip";
import { logger } from "@app/lib/logger";
import { AuthAttemptAuthMethod, AuthAttemptAuthResult, authAttemptCounter } from "@app/lib/telemetry/metrics";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityUaClientSecretDALFactory } from "./identity-ua-client-secret-dal";
import { TIdentityUaDALFactory } from "./identity-ua-dal";
import {
  TAttachUaDTO,
  TClearUaLockoutsDTO,
  TCreateUaClientSecretDTO,
  TGetUaClientSecretsDTO,
  TGetUaDTO,
  TGetUniversalAuthClientSecretByIdDTO,
  TRevokeUaClientSecretDTO,
  TRevokeUaDTO,
  TUpdateUaDTO
} from "./identity-ua-types";

type TIdentityUaServiceFactoryDep = {
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  identityUaDAL: TIdentityUaDALFactory;
  identityUaClientSecretDAL: TIdentityUaClientSecretDALFactory;
  identityAccessTokenDAL: TIdentityAccessTokenDALFactory;
  membershipIdentityDAL: TMembershipIdentityDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  keyStore: Pick<
    TKeyStoreFactory,
    "setItemWithExpiry" | "getItem" | "deleteItem" | "getKeysByPattern" | "deleteItems" | "acquireLock"
  >;
};

export type TIdentityUaServiceFactory = ReturnType<typeof identityUaServiceFactory>;

type LockoutObject = {
  lockedOut: boolean;
  failedAttempts: number;
};

export const identityUaServiceFactory = ({
  identityUaDAL,
  identityUaClientSecretDAL,
  identityAccessTokenDAL,
  membershipIdentityDAL,
  permissionService,
  licenseService,
  orgDAL,
  keyStore,
  identityDAL
}: TIdentityUaServiceFactoryDep) => {
  const login = async (clientId: string, clientSecret: string, ip: string) => {
    const appCfg = getConfig();
    const identityUa = await identityUaDAL.findOne({ clientId });
    if (!identityUa) {
      throw new UnauthorizedError({
        message: "Invalid credentials"
      });
    }

    const identity = await identityDAL.findById(identityUa.identityId);
    const org = await orgDAL.findById(identity.orgId);

    try {
      checkIPAgainstBlocklist({
        ipAddress: ip,
        trustedIps: identityUa.clientSecretTrustedIps as TIp[]
      });

      const LOCKOUT_KEY = `lockout:identity:${identityUa.identityId}:${IdentityAuthMethod.UNIVERSAL_AUTH}:${clientId}`;

      const lockoutRaw = await keyStore.getItem(LOCKOUT_KEY);

      let lockout: LockoutObject | undefined;
      if (lockoutRaw) {
        lockout = JSON.parse(lockoutRaw) as LockoutObject;
      }

      if (lockout && lockout.lockedOut) {
        throw new UnauthorizedError({
          message: "This identity auth method is temporarily locked, please try again later"
        });
      }

      const clientSecretPrefix = clientSecret.slice(0, 4);
      const clientSecretInfo = await identityUaClientSecretDAL.find({
        identityUAId: identityUa.id,
        isClientSecretRevoked: false,
        clientSecretPrefix
      });

      let validClientSecretInfo: (typeof clientSecretInfo)[0] | null = null;
      for await (const info of clientSecretInfo) {
        const isMatch = await crypto.hashing().compareHash(clientSecret, info.clientSecretHash);

        if (isMatch) {
          validClientSecretInfo = info;
          break;
        }
      }

      if (!validClientSecretInfo) {
        if (identityUa.lockoutEnabled) {
          let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | undefined;
          try {
            lock = await keyStore.acquireLock([KeyStorePrefixes.IdentityLockoutLock(LOCKOUT_KEY)], 300, {
              retryCount: 3,
              retryDelay: 300,
              retryJitter: 100
            });

            // Re-fetch the latest lockout data while holding the lock
            const lockoutRawNew = await keyStore.getItem(LOCKOUT_KEY);
            if (lockoutRawNew) {
              lockout = JSON.parse(lockoutRawNew) as LockoutObject;
            } else {
              lockout = {
                lockedOut: false,
                failedAttempts: 0
              };
            }

            if (lockout.lockedOut) {
              throw new UnauthorizedError({
                message: "This identity auth method is temporarily locked, please try again later"
              });
            }

            lockout.failedAttempts += 1;
            if (lockout.failedAttempts >= identityUa.lockoutThreshold) {
              lockout.lockedOut = true;
            }

            await keyStore.setItemWithExpiry(
              LOCKOUT_KEY,
              lockout.lockedOut ? identityUa.lockoutDurationSeconds : identityUa.lockoutCounterResetSeconds,
              JSON.stringify(lockout)
            );
          } catch (e) {
            if (lock === undefined) {
              logger.info(
                `identity login failed to acquire lock [identityId=${identityUa.identityId}] [authMethod=${IdentityAuthMethod.UNIVERSAL_AUTH}]`
              );
              throw new RateLimitError({ message: "Failed to acquire lock: rate limit exceeded" });
            }
            throw e;
          } finally {
            if (lock) {
              await lock.release();
            }
          }
        }

        throw new UnauthorizedError({ message: "Invalid credentials" });
      } else if (lockout) {
        // If credentials are valid, clear any existing lockout record
        await keyStore.deleteItem(LOCKOUT_KEY);
      }

      const { clientSecretTTL, clientSecretNumUses, clientSecretNumUsesLimit } = validClientSecretInfo;
      if (Number(clientSecretTTL) > 0) {
        const clientSecretCreated = new Date(validClientSecretInfo.createdAt);
        const ttlInMilliseconds = Number(clientSecretTTL) * 1000;
        const currentDate = new Date();
        const expirationTime = new Date(clientSecretCreated.getTime() + ttlInMilliseconds);

        if (currentDate > expirationTime) {
          await identityUaClientSecretDAL.updateById(validClientSecretInfo.id, {
            isClientSecretRevoked: true
          });

          throw new UnauthorizedError({
            message: "Access denied due to expired client secret"
          });
        }
      }

      if (clientSecretNumUsesLimit > 0 && clientSecretNumUses >= clientSecretNumUsesLimit) {
        // number of times client secret can be used for
        // a login operation reached
        await identityUaClientSecretDAL.updateById(validClientSecretInfo.id, {
          isClientSecretRevoked: true
        });
        throw new UnauthorizedError({
          message: "Access denied due to client secret usage limit reached"
        });
      }

      const accessTokenTTLParams =
        Number(identityUa.accessTokenPeriod) === 0
          ? {
              accessTokenTTL: identityUa.accessTokenTTL,
              accessTokenMaxTTL: identityUa.accessTokenMaxTTL
            }
          : {
              accessTokenTTL: identityUa.accessTokenPeriod,
              // We set a very large Max TTL for periodic tokens to ensure that clients (even outdated ones) can always renew their token
              // without them having to update their SDKs, CLIs, etc. This workaround sets it to 30 years to emulate "forever"
              accessTokenMaxTTL: 1000000000
            };

      const identityAccessToken = await identityUaDAL.transaction(async (tx) => {
        const uaClientSecretDoc = await identityUaClientSecretDAL.incrementUsage(validClientSecretInfo!.id, tx);
        await membershipIdentityDAL.update(
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
          {
            lastLoginAuthMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
            lastLoginTime: new Date()
          },
          tx
        );
        const newToken = await identityAccessTokenDAL.create(
          {
            identityId: identityUa.identityId,
            isAccessTokenRevoked: false,
            identityUAClientSecretId: uaClientSecretDoc.id,
            accessTokenNumUses: 0,
            accessTokenNumUsesLimit: identityUa.accessTokenNumUsesLimit,
            accessTokenPeriod: identityUa.accessTokenPeriod,
            authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
            ...accessTokenTTLParams
          },
          tx
        );

        return newToken;
      });

      const accessToken = crypto.jwt().sign(
        {
          identityId: identityUa.identityId,
          clientSecretId: validClientSecretInfo.id,
          identityAccessTokenId: identityAccessToken.id,
          authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
        } as TIdentityAccessTokenJwtPayload,
        appCfg.AUTH_SECRET,
        // akhilmhdh: for non-expiry tokens you should not even set the value, including undefined. Even for undefined jsonwebtoken throws error
        Number(identityAccessToken.accessTokenTTL) === 0
          ? undefined
          : {
              expiresIn: Number(identityAccessToken.accessTokenTTL)
            }
      );

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityUa.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.UNIVERSAL_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.SUCCESS,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }

      return {
        accessToken,
        identityUa,
        validClientSecretInfo,
        identityAccessToken,
        identity,
        ...accessTokenTTLParams
      };
    } catch (error) {
      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityUa.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.UNIVERSAL_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.FAILURE,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }
      throw error;
    }
  };

  const attachUniversalAuth = async ({
    accessTokenMaxTTL,
    identityId,
    accessTokenNumUsesLimit,
    accessTokenTTL,
    accessTokenTrustedIps,
    clientSecretTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    isActorSuperAdmin,
    accessTokenPeriod,
    lockoutEnabled,
    lockoutThreshold,
    lockoutDurationSeconds,
    lockoutCounterResetSeconds
  }: TAttachUaDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add universal auth to already configured identity"
      });
    }
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (accessTokenMaxTTL > 0 && accessTokenTTL > accessTokenMaxTTL) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Create,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionIdentityActions.Create,
        OrgPermissionSubjects.Identity
      );
    }

    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);
    const reformattedClientSecretTrustedIps = clientSecretTrustedIps.map((clientSecretTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        clientSecretTrustedIp.ipAddress !== "0.0.0.0/0" &&
        clientSecretTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(clientSecretTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(clientSecretTrustedIp.ipAddress);
    });
    const reformattedAccessTokenTrustedIps = accessTokenTrustedIps.map((accessTokenTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        accessTokenTrustedIp.ipAddress !== "0.0.0.0/0" &&
        accessTokenTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(accessTokenTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(accessTokenTrustedIp.ipAddress);
    });

    const identityUa = await identityUaDAL.transaction(async (tx) => {
      const doc = await identityUaDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
          clientId: crypto.nativeCrypto.randomUUID(),
          clientSecretTrustedIps: JSON.stringify(reformattedClientSecretTrustedIps),
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps),
          accessTokenPeriod,
          lockoutEnabled,
          lockoutThreshold,
          lockoutDurationSeconds,
          lockoutCounterResetSeconds
        },
        tx
      );
      return doc;
    });
    return { ...identityUa, orgId: identityMembershipOrg.scopeOrgId };
  };

  const updateUniversalAuth = async ({
    accessTokenMaxTTL,
    identityId,
    accessTokenNumUsesLimit,
    accessTokenTTL,
    accessTokenTrustedIps,
    clientSecretTrustedIps,
    accessTokenPeriod,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    lockoutEnabled,
    lockoutThreshold,
    lockoutDurationSeconds,
    lockoutCounterResetSeconds
  }: TUpdateUaDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const uaIdentityAuth = await identityUaDAL.findOne({ identityId });
    if (!uaIdentityAuth) {
      throw new NotFoundError({ message: `Failed to find universal auth for identity with ID ${identityId}` });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }

    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (
      (accessTokenMaxTTL || uaIdentityAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || uaIdentityAuth.accessTokenMaxTTL) > (accessTokenMaxTTL || uaIdentityAuth.accessTokenMaxTTL)
    ) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Edit,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
    }

    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);
    const reformattedClientSecretTrustedIps = clientSecretTrustedIps?.map((clientSecretTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        clientSecretTrustedIp.ipAddress !== "0.0.0.0/0" &&
        clientSecretTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(clientSecretTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(clientSecretTrustedIp.ipAddress);
    });
    const reformattedAccessTokenTrustedIps = accessTokenTrustedIps?.map((accessTokenTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        accessTokenTrustedIp.ipAddress !== "0.0.0.0/0" &&
        accessTokenTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(accessTokenTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(accessTokenTrustedIp.ipAddress);
    });

    const updatedUaAuth = await identityUaDAL.updateById(uaIdentityAuth.id, {
      clientSecretTrustedIps: reformattedClientSecretTrustedIps
        ? JSON.stringify(reformattedClientSecretTrustedIps)
        : undefined,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenPeriod,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined,
      lockoutEnabled,
      lockoutThreshold,
      lockoutDurationSeconds,
      lockoutCounterResetSeconds
    });
    return { ...updatedUaAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const getIdentityUniversalAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetUaDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const uaIdentityAuth = await identityUaDAL.findOne({ identityId });
    if (!uaIdentityAuth) {
      throw new NotFoundError({ message: `Failed to find universal auth for identity with ID ${identityId}` });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Read,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
    }
    return { ...uaIdentityAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const revokeIdentityUniversalAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeUaDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.RevokeAuth,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

      const { permission: rolePermission } = await permissionService.getOrgPermission({
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });
      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.scopeOrgId);
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.RevokeAuth,
        OrgPermissionSubjects.Identity,
        permission,
        rolePermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to revoke universal auth of identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.RevokeAuth,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
    const revokedIdentityUniversalAuth = await identityUaDAL.transaction(async (tx) => {
      const deletedUniversalAuth = await identityUaDAL.delete({ identityId }, tx);
      return { ...deletedUniversalAuth?.[0], orgId: identityMembershipOrg.scopeOrgId };
    });
    return revokedIdentityUniversalAuth;
  };

  const createUniversalAuthClientSecret = async ({
    actor,
    actorId,
    actorOrgId,
    identityId,
    ttl,
    actorAuthMethod,
    description,
    numUsesLimit
  }: TCreateUaClientSecretDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.CreateToken,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionIdentityActions.Create,
        OrgPermissionSubjects.Identity
      );

      const { permission: rolePermission } = await permissionService.getOrgPermission({
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });
      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.scopeOrgId);
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.CreateToken,
        OrgPermissionSubjects.Identity,
        permission,
        rolePermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to create client secret for identity.",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.CreateToken,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
    const appCfg = getConfig();
    const clientSecret = crypto.randomBytes(32).toString("hex");
    const clientSecretHash = await crypto.hashing().createHash(clientSecret, appCfg.SALT_ROUNDS);

    const identityUaAuth = await identityUaDAL.findOne({ identityId: identityMembershipOrg.identity.id });
    if (!identityUaAuth) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const identityUaClientSecret = await identityUaClientSecretDAL.create({
      identityUAId: identityUaAuth.id,
      description,
      clientSecretPrefix: clientSecret.slice(0, 4),
      clientSecretHash,
      clientSecretNumUses: 0,
      clientSecretNumUsesLimit: numUsesLimit,
      clientSecretTTL: ttl,
      isClientSecretRevoked: false
    });
    return {
      clientSecret,
      clientSecretData: identityUaClientSecret,
      orgId: identityMembershipOrg.scopeOrgId
    };
  };

  const getUniversalAuthClientSecrets = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    identityId
  }: TGetUaClientSecretsDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.GetToken,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

      const { permission: rolePermission } = await permissionService.getOrgPermission({
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });
      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.scopeOrgId);
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.GetToken,
        OrgPermissionSubjects.Identity,
        permission,
        rolePermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to get identity client secret with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.GetToken,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const identityUniversalAuth = await identityUaDAL.findOne({
      identityId
    });

    const clientSecrets = await identityUaClientSecretDAL.find({
      identityUAId: identityUniversalAuth.id,
      isClientSecretRevoked: false
    });
    return { clientSecrets, orgId: identityMembershipOrg.scopeOrgId };
  };

  const getUniversalAuthClientSecretById = async ({
    identityId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    clientSecretId
  }: TGetUniversalAuthClientSecretByIdDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    const identityUa = await identityUaDAL.findOne({ identityId });
    if (!identityUa) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const clientSecret = await identityUaClientSecretDAL.findOne({ id: clientSecretId, identityUAId: identityUa.id });
    if (!clientSecret) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.GetToken,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
      const { permission: rolePermission } = await permissionService.getOrgPermission({
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });
      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.scopeOrgId);
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.GetToken,
        OrgPermissionSubjects.Identity,
        permission,
        rolePermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to read identity client secret of identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.GetToken,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
    return { ...clientSecret, identityId, orgId: identityMembershipOrg.scopeOrgId };
  };

  const revokeUniversalAuthClientSecret = async ({
    identityId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    clientSecretId
  }: TRevokeUaClientSecretDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    const identityUa = await identityUaDAL.findOne({ identityId });
    if (!identityUa) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const clientSecret = await identityUaClientSecretDAL.findOne({ id: clientSecretId, identityUAId: identityUa.id });
    if (!clientSecret) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.DeleteToken,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionIdentityActions.Delete,
        OrgPermissionSubjects.Identity
      );

      const { permission: rolePermission } = await permissionService.getOrgPermission({
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });

      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.scopeOrgId);
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.DeleteToken,
        OrgPermissionSubjects.Identity,
        permission,
        rolePermission
      );
      if (!permissionBoundary.isValid) {
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to revoke identity client secret with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.DeleteToken,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
      }
    }
    const updatedClientSecret = await identityUaClientSecretDAL.updateById(clientSecretId, {
      isClientSecretRevoked: true
    });

    return { ...updatedClientSecret, identityId, orgId: identityMembershipOrg.scopeOrgId };
  };

  const clearUniversalAuthLockouts = async ({
    identityId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod
  }: TClearUaLockoutsDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Edit,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
    }
    const deleted = await keyStore.deleteItems({
      pattern: `lockout:identity:${identityId}:${IdentityAuthMethod.UNIVERSAL_AUTH}:*`
    });

    return { deleted, identityId, orgId: identityMembershipOrg.scopeOrgId };
  };

  return {
    login,
    attachUniversalAuth,
    updateUniversalAuth,
    getIdentityUniversalAuth,
    revokeIdentityUniversalAuth,
    createUniversalAuthClientSecret,
    getUniversalAuthClientSecrets,
    revokeUniversalAuthClientSecret,
    getUniversalAuthClientSecretById,
    clearUniversalAuthLockouts
  };
};
