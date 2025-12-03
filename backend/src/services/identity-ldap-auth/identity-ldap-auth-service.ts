/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenError, subject } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import slugify from "@sindresorhus/slugify";

import { AccessScope, ActionProjectType, IdentityAuthMethod, OrganizationActionScope } from "@app/db/schemas";
import { TIdentityAuthTemplateDALFactory } from "@app/ee/services/identity-auth-template";
import { testLDAPConfig } from "@app/ee/services/ldap-config/ldap-fns";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  OrgPermissionIdentityActions,
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  RateLimitError,
  UnauthorizedError
} from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { logger } from "@app/lib/logger";
import { AuthAttemptAuthMethod, AuthAttemptAuthResult, authAttemptCounter } from "@app/lib/telemetry/metrics";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityLdapAuthDALFactory } from "./identity-ldap-auth-dal";
import {
  AllowedFieldsSchema,
  TAttachLdapAuthDTO,
  TCheckLdapAuthLockoutDTO,
  TClearLdapAuthLockoutsDTO,
  TGetLdapAuthDTO,
  TLoginLdapAuthDTO,
  TRevokeLdapAuthDTO,
  TUpdateLdapAuthDTO
} from "./identity-ldap-auth-types";

type TIdentityLdapAuthServiceFactoryDep = {
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  identityLdapAuthDAL: Pick<
    TIdentityLdapAuthDALFactory,
    "findOne" | "transaction" | "create" | "updateById" | "delete"
  >;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  kmsService: TKmsServiceFactory;
  identityDAL: Pick<TIdentityDALFactory, "findById" | "findOne">;
  identityAuthTemplateDAL: TIdentityAuthTemplateDALFactory;
  keyStore: Pick<
    TKeyStoreFactory,
    "setItemWithExpiry" | "getItem" | "deleteItem" | "getKeysByPattern" | "deleteItems" | "acquireLock"
  >;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne">;
};

export type TIdentityLdapAuthServiceFactory = ReturnType<typeof identityLdapAuthServiceFactory>;

type LockoutObject = {
  lockedOut: boolean;
  failedAttempts: number;
};

export const identityLdapAuthServiceFactory = ({
  identityAccessTokenDAL,
  identityDAL,
  identityLdapAuthDAL,
  membershipIdentityDAL,
  licenseService,
  permissionService,
  kmsService,
  identityAuthTemplateDAL,
  keyStore,
  orgDAL
}: TIdentityLdapAuthServiceFactoryDep) => {
  const getLdapConfig = async (identityId: string) => {
    const identity = await identityDAL.findOne({ id: identityId });
    if (!identity) throw new NotFoundError({ message: `Identity with ID '${identityId}' not found` });

    const identityOrgMembership = await membershipIdentityDAL.findOne({
      actorIdentityId: identity.id,
      scope: AccessScope.Organization
    });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Identity with ID '${identityId}' not found` });

    const ldapAuth = await identityLdapAuthDAL.findOne({ identityId: identity.id });
    if (!ldapAuth) throw new NotFoundError({ message: `LDAP auth with ID '${identityId}' not found` });

    const parsedAllowedFields = ldapAuth.allowedFields
      ? AllowedFieldsSchema.array().parse(ldapAuth.allowedFields)
      : undefined;

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityOrgMembership.scopeOrgId
    });

    const bindDN = decryptor({ cipherTextBlob: ldapAuth.encryptedBindDN }).toString();
    const bindPass = decryptor({ cipherTextBlob: ldapAuth.encryptedBindPass }).toString();
    const ldapCaCertificate = ldapAuth.encryptedLdapCaCertificate
      ? decryptor({ cipherTextBlob: ldapAuth.encryptedLdapCaCertificate }).toString()
      : undefined;

    const ldapConfig = {
      id: ldapAuth.id,
      organization: identityOrgMembership.scopeOrgId,
      url: ldapAuth.url,
      bindDN,
      bindPass,
      searchBase: ldapAuth.searchBase,
      searchFilter: ldapAuth.searchFilter,
      caCert: ldapCaCertificate || "",
      allowedFields: parsedAllowedFields
    };

    const opts = {
      server: {
        url: ldapAuth.url,
        bindDN,
        bindCredentials: bindPass,
        searchBase: ldapAuth.searchBase,
        searchFilter: ldapAuth.searchFilter,
        ...(ldapCaCertificate
          ? {
              tlsOptions: {
                ca: [ldapCaCertificate]
              }
            }
          : {})
      },
      passReqToCallback: true
    };

    return { opts, ldapConfig };
  };

  const login = async ({ identityId, subOrganizationName }: TLoginLdapAuthDTO) => {
    const appCfg = getConfig();
    const identityLdapAuth = await identityLdapAuthDAL.findOne({ identityId });

    if (!identityLdapAuth) {
      throw new UnauthorizedError({
        message: "Invalid credentials"
      });
    }

    const identity = await identityDAL.findById(identityLdapAuth.identityId);
    if (!identity) throw new UnauthorizedError({ message: "Identity not found" });

    const org = await orgDAL.findById(identity.orgId);
    const isSubOrg = Boolean(org.rootOrgId);

    const rootOrgId = isSubOrg ? org.rootOrgId || org.id : org.id;

    // Resolve sub-organization if specified
    let scopeOrgId = rootOrgId;
    if (subOrganizationName) {
      const subOrg = await orgDAL.findOne({ slug: subOrganizationName });

      if (subOrg) {
        if (subOrg.rootOrgId === rootOrgId) {
          // Verify identity has membership in the sub-organization
          const subOrgMembership = await membershipIdentityDAL.findOne({
            scope: AccessScope.Organization,
            actorIdentityId: identity.id,
            scopeOrgId: subOrg.id
          });

          if (subOrgMembership) {
            scopeOrgId = subOrg.id;
          }
        }
      }
    }
    const plan = await licenseService.getPlan(identity.orgId);
    if (!plan.ldap) {
      throw new BadRequestError({
        message:
          "Failed to login to identity due to plan restriction. Upgrade plan to login to use LDAP authentication."
      });
    }

    try {
      const identityAccessToken = await identityLdapAuthDAL.transaction(async (tx) => {
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
            lastLoginAuthMethod: IdentityAuthMethod.LDAP_AUTH,
            lastLoginTime: new Date()
          },
          tx
        );
        const newToken = await identityAccessTokenDAL.create(
          {
            identityId: identityLdapAuth.identityId,
            isAccessTokenRevoked: false,
            accessTokenTTL: identityLdapAuth.accessTokenTTL,
            accessTokenMaxTTL: identityLdapAuth.accessTokenMaxTTL,
            accessTokenNumUses: 0,
            accessTokenNumUsesLimit: identityLdapAuth.accessTokenNumUsesLimit,
            authMethod: IdentityAuthMethod.LDAP_AUTH,
            scopeOrgId
          },
          tx
        );
        return newToken;
      });

      const accessToken = crypto.jwt().sign(
        {
          identityId: identityLdapAuth.identityId,
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
          "infisical.identity.id": identityLdapAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.LDAP_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.SUCCESS,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }

      return { accessToken, identityLdapAuth, identityAccessToken, identity };
    } catch (error) {
      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityLdapAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.LDAP_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.FAILURE,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }
      throw error;
    }
  };

  const attachLdapAuth = async ({
    identityId,
    templateId,
    url,
    searchBase,
    searchFilter,
    bindDN,
    bindPass,
    ldapCaCertificate,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    isActorSuperAdmin,
    allowedFields,
    lockoutEnabled,
    lockoutThreshold,
    lockoutDurationSeconds,
    lockoutCounterResetSeconds
  }: TAttachLdapAuthDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.LDAP_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add LDAP Auth to already configured identity"
      });
    }

    if (accessTokenMaxTTL > 0 && accessTokenTTL > accessTokenMaxTTL) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    const { permission: orgPermission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: identityMembershipOrg.scopeOrgId,
      actorAuthMethod,
      actorOrgId
    });

    if (identityMembershipOrg.identity.projectId) {
      const { permission: projectPermission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(projectPermission).throwUnlessCan(
        ProjectPermissionIdentityActions.Create,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionIdentityActions.Create,
        OrgPermissionSubjects.Identity
      );
    }

    if (templateId) {
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
        OrgPermissionSubjects.MachineIdentityAuthTemplate
      );
    }

    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);

    if (!plan.ldap) {
      throw new BadRequestError({
        message: "Failed to add LDAP Auth to identity due to plan restriction. Upgrade plan to add LDAP Auth."
      });
    }

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

    if (allowedFields) AllowedFieldsSchema.array().parse(allowedFields);

    const identityLdapAuth = await identityLdapAuthDAL.transaction(async (tx) => {
      const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: identityMembershipOrg.scopeOrgId
      });

      const template = templateId
        ? await identityAuthTemplateDAL.findByIdAndOrgId(templateId, identityMembershipOrg.scopeOrgId)
        : undefined;

      let ldapConfig: { bindDN: string; bindPass: string; searchBase: string; url: string; ldapCaCertificate?: string };
      if (template) {
        ldapConfig = JSON.parse(decryptor({ cipherTextBlob: template.templateFields }).toString());
      } else {
        if (!bindDN || !bindPass || !searchBase || !url) {
          throw new BadRequestError({
            message: "Invalid request. Missing bind DN, bind pass, search base, or URL."
          });
        }
        ldapConfig = {
          bindDN,
          bindPass,
          searchBase,
          url,
          ldapCaCertificate
        };
      }

      const { cipherTextBlob: encryptedBindPass } = encryptor({
        plainText: Buffer.from(ldapConfig.bindPass)
      });

      const { cipherTextBlob: encryptedBindDN } = encryptor({
        plainText: Buffer.from(ldapConfig.bindDN)
      });

      let encryptedLdapCaCertificate: Buffer | undefined;
      if (ldapConfig.ldapCaCertificate) {
        const { cipherTextBlob: encryptedCertificate } = encryptor({
          plainText: Buffer.from(ldapConfig.ldapCaCertificate)
        });

        encryptedLdapCaCertificate = encryptedCertificate;
      }

      const isConnected = await testLDAPConfig({
        bindDN: ldapConfig.bindDN,
        bindPass: ldapConfig.bindPass,
        caCert: ldapConfig.ldapCaCertificate || "",
        url: ldapConfig.url
      });

      if (!isConnected) {
        throw new BadRequestError({
          message:
            "Failed to connect to LDAP server. Please ensure that the LDAP server is running and your credentials are correct."
        });
      }

      const doc = await identityLdapAuthDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
          encryptedBindDN,
          encryptedBindPass,
          searchBase: ldapConfig.searchBase,
          searchFilter,
          url: ldapConfig.url,
          encryptedLdapCaCertificate,
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps),
          allowedFields: allowedFields ? JSON.stringify(allowedFields) : undefined,
          templateId,
          lockoutEnabled,
          lockoutThreshold,
          lockoutDurationSeconds,
          lockoutCounterResetSeconds
        },
        tx
      );
      return doc;
    });
    return { ...identityLdapAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const updateLdapAuth = async ({
    identityId,
    templateId,
    url,
    searchBase,
    searchFilter,
    bindDN,
    bindPass,
    ldapCaCertificate,
    allowedFields,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    lockoutEnabled,
    lockoutThreshold,
    lockoutDurationSeconds,
    lockoutCounterResetSeconds
  }: TUpdateLdapAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.LDAP_AUTH)) {
      throw new NotFoundError({
        message: "The identity does not have LDAP Auth attached"
      });
    }

    const identityLdapAuth = await identityLdapAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityLdapAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityLdapAuth.accessTokenTTL) > (accessTokenMaxTTL || identityLdapAuth.accessTokenMaxTTL)
    ) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    const { permission: orgPermission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: identityMembershipOrg.scopeOrgId,
      actorAuthMethod,
      actorOrgId
    });

    if (identityMembershipOrg.identity.projectId) {
      const { permission: projectPermission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(projectPermission).throwUnlessCan(
        ProjectPermissionIdentityActions.Create,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionIdentityActions.Edit,
        OrgPermissionSubjects.Identity
      );
    }

    if (templateId) {
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
        OrgPermissionSubjects.MachineIdentityAuthTemplate
      );
    }

    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);

    if (!plan.ldap) {
      throw new BadRequestError({
        message: "Failed to update LDAP Auth due to plan restriction. Upgrade plan to update LDAP Auth."
      });
    }

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

    if (allowedFields) AllowedFieldsSchema.array().parse(allowedFields);

    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    const template = templateId
      ? await identityAuthTemplateDAL.findByIdAndOrgId(templateId, identityMembershipOrg.scopeOrgId)
      : undefined;
    let config: {
      bindDN?: string;
      bindPass?: string;
      searchBase?: string;
      url?: string;
      ldapCaCertificate?: string;
    };

    if (template) {
      config = JSON.parse(decryptor({ cipherTextBlob: template.templateFields }).toString());
    } else {
      config = {
        bindDN,
        bindPass,
        searchBase,
        url,
        ldapCaCertificate
      };
    }

    let encryptedBindPass: Buffer | undefined;
    if (config.bindPass) {
      const { cipherTextBlob: bindPassCiphertext } = encryptor({
        plainText: Buffer.from(config.bindPass)
      });

      encryptedBindPass = bindPassCiphertext;
    }

    let encryptedLdapCaCertificate: Buffer | undefined;
    if (config.ldapCaCertificate) {
      const { cipherTextBlob: ldapCaCertificateCiphertext } = encryptor({
        plainText: Buffer.from(config.ldapCaCertificate)
      });

      encryptedLdapCaCertificate = ldapCaCertificateCiphertext;
    }

    let encryptedBindDN: Buffer | undefined;
    if (config.bindDN) {
      const { cipherTextBlob: bindDNCiphertext } = encryptor({
        plainText: Buffer.from(config.bindDN)
      });

      encryptedBindDN = bindDNCiphertext;
    }

    const { ldapConfig } = await getLdapConfig(identityId);

    const isConnected = await testLDAPConfig({
      bindDN: config.bindDN || ldapConfig.bindDN,
      bindPass: config.bindPass || ldapConfig.bindPass,
      caCert: config.ldapCaCertificate || ldapConfig.caCert,
      url: config.url || ldapConfig.url
    });

    if (!isConnected) {
      throw new BadRequestError({
        message:
          "Failed to connect to LDAP server. Please ensure that the LDAP server is running and your credentials are correct."
      });
    }

    const updatedLdapAuth = await identityLdapAuthDAL.updateById(identityLdapAuth.id, {
      url: config.url,
      searchBase: config.searchBase,
      searchFilter,
      encryptedBindDN,
      encryptedBindPass,
      encryptedLdapCaCertificate,
      allowedFields: allowedFields ? JSON.stringify(allowedFields) : undefined,
      accessTokenMaxTTL,
      templateId: template?.id || null,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined,
      lockoutEnabled,
      lockoutThreshold,
      lockoutDurationSeconds,
      lockoutCounterResetSeconds
    });

    return { ...updatedLdapAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const getLdapAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetLdapAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.LDAP_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have LDAP Auth attached"
      });
    }

    const ldapIdentityAuth = await identityLdapAuthDAL.findOne({ identityId });

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

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    const bindDN = decryptor({ cipherTextBlob: ldapIdentityAuth.encryptedBindDN }).toString();
    const bindPass = decryptor({ cipherTextBlob: ldapIdentityAuth.encryptedBindPass }).toString();
    const ldapCaCertificate = ldapIdentityAuth.encryptedLdapCaCertificate
      ? decryptor({ cipherTextBlob: ldapIdentityAuth.encryptedLdapCaCertificate }).toString()
      : undefined;

    return { ...ldapIdentityAuth, orgId: identityMembershipOrg.scopeOrgId, bindDN, bindPass, ldapCaCertificate };
  };

  const revokeIdentityLdapAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeLdapAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.LDAP_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have LDAP Auth attached"
      });
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
            "Failed to revoke LDAP auth of identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.RevokeAuth,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const revokedIdentityLdapAuth = await identityLdapAuthDAL.transaction(async (tx) => {
      const [deletedLdapAuth] = await identityLdapAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.LDAP_AUTH }, tx);

      return { ...deletedLdapAuth, orgId: identityMembershipOrg.scopeOrgId };
    });
    return revokedIdentityLdapAuth;
  };

  const withLdapLockout = async <T>(
    { identityId, username }: TCheckLdapAuthLockoutDTO,
    authFn: () => Promise<T>
  ): Promise<T> => {
    const usernameSlug = slugify(username.trim().toLowerCase());

    const LOCKOUT_KEY = `lockout:identity:${identityId}:${IdentityAuthMethod.LDAP_AUTH}:${usernameSlug}`;

    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>>;
    try {
      lock = await keyStore.acquireLock([KeyStorePrefixes.IdentityLockoutLock(LOCKOUT_KEY)], 3000, {
        retryCount: 3,
        retryDelay: 1500,
        retryJitter: 100
      });
    } catch (e) {
      logger.info(
        `identity login failed to acquire lock [identityId=${identityId}] [authMethod=${IdentityAuthMethod.LDAP_AUTH}]`
      );
      throw new RateLimitError({ message: "Failed to acquire lock: rate limit exceeded" });
    }

    try {
      const lockoutRaw = await keyStore.getItem(LOCKOUT_KEY);
      if (lockoutRaw) {
        const lockout = JSON.parse(lockoutRaw) as LockoutObject;
        if (lockout.lockedOut) {
          throw new UnauthorizedError({
            message: "This identity auth method is temporarily locked, please try again later"
          });
        }
      }

      const result = await authFn();

      await keyStore.deleteItem(LOCKOUT_KEY);

      return result;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      if ((error as any).status === 401) {
        const identityLdapAuth = await identityLdapAuthDAL.findOne({ identityId });
        if (!identityLdapAuth) {
          throw new UnauthorizedError({ message: "Invalid credentials" });
        }

        if (identityLdapAuth.lockoutEnabled) {
          let lockout: LockoutObject = {
            lockedOut: false,
            failedAttempts: 0
          };

          const lockoutRaw = await keyStore.getItem(LOCKOUT_KEY);
          if (lockoutRaw) {
            lockout = JSON.parse(lockoutRaw) as LockoutObject;
          }

          lockout.failedAttempts += 1;
          if (lockout.failedAttempts >= identityLdapAuth.lockoutThreshold) {
            lockout.lockedOut = true;
          }

          await keyStore.setItemWithExpiry(
            LOCKOUT_KEY,
            lockout.lockedOut ? identityLdapAuth.lockoutDurationSeconds : identityLdapAuth.lockoutCounterResetSeconds,
            JSON.stringify(lockout)
          );
        }

        throw new UnauthorizedError({ message: "Invalid credentials" });
      }
      throw error;
    } finally {
      await lock.release();
    }
  };

  const clearLdapAuthLockouts = async ({
    identityId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod
  }: TClearLdapAuthLockoutsDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.LDAP_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have ldap auth"
      });
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
      pattern: `lockout:identity:${identityId}:${IdentityAuthMethod.LDAP_AUTH}:*`
    });

    return { deleted, identityId, orgId: identityMembershipOrg.scopeOrgId };
  };

  return {
    attachLdapAuth,
    getLdapConfig,
    updateLdapAuth,
    login,
    revokeIdentityLdapAuth,
    getLdapAuth,
    withLdapLockout,
    clearLdapAuthLockouts
  };
};
