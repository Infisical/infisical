import { ForbiddenError, subject } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import * as x509 from "@peculiar/x509";

import { AccessScope, ActionProjectType, IdentityAuthMethod, OrganizationActionScope } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  UnauthorizedError
} from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr, TIp } from "@app/lib/ip";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import {
  AuthAttemptAuthMethod,
  AuthAttemptAuthResult,
  authAttemptCounter,
  recordAuthAttemptMetric
} from "@app/lib/telemetry/metrics";

import { ActorType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenServiceFactory } from "../identity-access-token/identity-access-token-service";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityTlsCertAuthDALFactory } from "./identity-tls-cert-auth-dal";
import {
  isSubjectAltNameAllowed,
  parseAllowedSubjectAltNames,
  parseSubjectDetails,
  serializeAllowedSubjectAltNames,
  verifyClientCertificateChain
} from "./identity-tls-cert-auth-fns";
import { TIdentityTlsCertAuthServiceFactory } from "./identity-tls-cert-auth-types";

type TIdentityTlsCertAuthServiceFactoryDep = {
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "delete">;
  identityTlsCertAuthDAL: Pick<
    TIdentityTlsCertAuthDALFactory,
    "findOne" | "transaction" | "create" | "updateById" | "delete"
  >;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne" | "findEffectiveOrgMembership">;
  identityAccessTokenService: Pick<
    TIdentityAccessTokenServiceFactory,
    "issueIdentityAccessToken" | "revokeTokensForIdentityAuthMethod"
  >;
};

export const identityTlsCertAuthServiceFactory = ({
  identityDAL,
  identityAccessTokenDAL,
  identityTlsCertAuthDAL,
  membershipIdentityDAL,
  licenseService,
  permissionService,
  kmsService,
  orgDAL,
  identityAccessTokenService
}: TIdentityTlsCertAuthServiceFactoryDep): TIdentityTlsCertAuthServiceFactory => {
  const login: TIdentityTlsCertAuthServiceFactory["login"] = async ({
    identityId,
    clientCertificate,
    organizationSlug
  }) => {
    const authMetricStartTime = performance.now();
    const appCfg = getConfig();
    const identityTlsCertAuth = await identityTlsCertAuthDAL.findOne({ identityId });
    if (!identityTlsCertAuth) {
      throw new NotFoundError({
        message: "TLS Certificate auth method not found for identity, did you configure TLS Certificate auth?"
      });
    }

    const identity = await requestMemoize(requestMemoKeys.identityFindById(identityTlsCertAuth.identityId), () =>
      identityDAL.findById(identityTlsCertAuth.identityId)
    );
    if (!identity)
      throw new UnauthorizedError({
        message: "Identity not found"
      });

    const org = await requestMemoize(requestMemoKeys.orgFindById(identity.orgId), () =>
      orgDAL.findById(identity.orgId)
    );
    const isSubOrgIdentity = Boolean(org.rootOrgId);

    // If the identity is a sub-org identity, then the scope is always the org.id, and if it's a root org identity, then we need to resolve the scope if a organizationSlug is specified
    let subOrganizationId = isSubOrgIdentity ? org.id : null;

    try {
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: identity.orgId
      });

      const caCertificate = decryptor({
        cipherTextBlob: identityTlsCertAuth.encryptedCaCertificate
      }).toString();

      const presentedCertificates = extractX509CertFromChain(decodeURIComponent(clientCertificate));
      const leafCertificate = presentedCertificates?.[0];
      if (!leafCertificate) {
        throw new BadRequestError({ message: "Missing client certificate" });
      }

      const clientCertificateX509 = new crypto.nativeCrypto.X509Certificate(leafCertificate);
      const caCertificateX509 = new crypto.nativeCrypto.X509Certificate(caCertificate);

      if (identityTlsCertAuth.verifyClientCertificateChain) {
        // Trust-anchor mode: the configured CA is a trust anchor. Build a path from the presented
        // leaf through the presented intermediates up to the anchor (RFC 5280 path validation),
        // rather than requiring the anchor to be the leaf's direct issuer. This supports issuers
        // that rotate beneath a stable root (e.g. SPIRE X.509-SVID intermediates) by pinning the
        // long-lived root while the client presents the current intermediate alongside its leaf.
        const presentedChain = presentedCertificates
          .slice(1)
          .map((pem) => new crypto.nativeCrypto.X509Certificate(pem));

        const chainResult = verifyClientCertificateChain({
          leaf: clientCertificateX509,
          presentedChain,
          trustAnchor: caCertificateX509
        });

        if (!chainResult.ok) {
          const message =
            chainResult.reasonCode === "ca_verification_failed"
              ? "Access denied: Certificate chain could not be validated against the provided CA."
              : "Access denied: A certificate in the chain is outside its validity period.";
          throw new UnauthorizedError({
            message,
            detail: {
              reasonCode: chainResult.reasonCode,
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
          });
        }
      } else {
        // Single-hop mode (default): the configured CA must be the direct issuer of the leaf.
        const isValidCertificate = clientCertificateX509.verify(caCertificateX509.publicKey);
        if (!isValidCertificate)
          throw new UnauthorizedError({
            message: "Access denied: Certificate not issued by the provided CA.",
            detail: {
              reasonCode: "ca_verification_failed",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
          });
      }

      // Require an end-entity certificate issued by the configured CA, not the CA certificate
      // itself. `.ca` covers certs marked CA:TRUE; the raw comparison also covers a self-signed CA
      // that omits basic constraints.
      const isClientCertACa = clientCertificateX509.ca || clientCertificateX509.raw.equals(caCertificateX509.raw);
      if (isClientCertACa) {
        throw new UnauthorizedError({
          message: "Access denied: a CA certificate cannot be used as a client certificate.",
          detail: {
            reasonCode: "ca_certificate_not_allowed",
            identityId: identity.id,
            orgId: identity.orgId,
            identityName: identity.name
          }
        });
      }

      if (new Date(clientCertificateX509.validTo) < new Date()) {
        throw new UnauthorizedError({
          message: "Access denied: Certificate has expired.",
          detail: {
            reasonCode: "certificate_expired",
            identityId: identity.id,
            orgId: identity.orgId,
            identityName: identity.name
          }
        });
      }

      if (new Date(clientCertificateX509.validFrom) > new Date()) {
        throw new UnauthorizedError({
          message: "Access denied: Certificate not yet valid.",
          detail: {
            reasonCode: "certificate_not_yet_valid",
            identityId: identity.id,
            orgId: identity.orgId,
            identityName: identity.name
          }
        });
      }

      const subjectDetails = parseSubjectDetails(clientCertificateX509.subject);
      if (identityTlsCertAuth.allowedCommonNames) {
        const isValidCommonName = identityTlsCertAuth.allowedCommonNames.split(",").includes(subjectDetails.CN);
        if (!isValidCommonName) {
          throw new UnauthorizedError({
            message: "Access denied: TLS Certificate Auth common name not allowed.",
            detail: {
              reasonCode: "common_name_not_allowed",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
          });
        }
      }

      if (identityTlsCertAuth.allowedSubjectAltNames) {
        const sanExtension = new x509.X509Certificate(clientCertificateX509.raw).getExtension(
          x509.SubjectAlternativeNameExtension
        );

        const isValidSubjectAltName = isSubjectAltNameAllowed(
          parseAllowedSubjectAltNames(identityTlsCertAuth.allowedSubjectAltNames),
          sanExtension?.names.items
        );
        if (!isValidSubjectAltName) {
          throw new UnauthorizedError({
            message: "Access denied: TLS Certificate Auth subject alternative name not allowed.",
            detail: {
              reasonCode: "subject_alt_name_not_allowed",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
          });
        }
      }

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
              message: `Identity not authorized to access sub organization ${organizationSlug}`,
              detail: {
                reasonCode: "sub_org_unauthorized",
                identityId: identity.id,
                orgId: identity.orgId,
                identityName: identity.name
              }
            });
          }

          subOrganizationId = subOrg.id;
        }
      }

      // Generate the token
      await identityTlsCertAuthDAL.transaction(async (tx) => {
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
            lastLoginAuthMethod: IdentityAuthMethod.TLS_CERT_AUTH,
            lastLoginTime: new Date()
          },
          tx
        );
      });

      const subOrgDetails =
        subOrganizationId && subOrganizationId !== org.id ? await orgDAL.findById(subOrganizationId) : null;
      const tokenScopeOrg = subOrgDetails ?? org;
      const tokenRootOrgId = tokenScopeOrg.rootOrgId ?? tokenScopeOrg.id;
      const tokenParentOrgId = tokenScopeOrg.parentOrgId ?? tokenRootOrgId;

      const { accessToken, identityAccessToken } = await identityAccessTokenService.issueIdentityAccessToken({
        identityId: identityTlsCertAuth.identityId,
        identityName: identity.name,
        authMethod: IdentityAuthMethod.TLS_CERT_AUTH,
        orgId: tokenScopeOrg.id,
        rootOrgId: tokenRootOrgId,
        parentOrgId: tokenParentOrgId,
        subOrganizationId,
        accessTokenTTL: Number(identityTlsCertAuth.accessTokenTTL),
        accessTokenMaxTTL: Number(identityTlsCertAuth.accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(identityTlsCertAuth.accessTokenNumUsesLimit),
        // TLS Cert auth schema has no accessTokenPeriod column.
        accessTokenPeriod: 0,
        accessTokenTrustedIps: identityTlsCertAuth.accessTokenTrustedIps as TIp[]
      });

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityTlsCertAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.TLS_CERT_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.SUCCESS,
          "client.address": requestContext.get(RequestContextKey.Ip),
          "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
        });
      }

      recordAuthAttemptMetric({
        startTime: authMetricStartTime,
        method: AuthAttemptAuthMethod.TLS_CERT_AUTH,
        result: AuthAttemptAuthResult.SUCCESS,
        orgId: org.id
      });

      return {
        identityTlsCertAuth,
        accessToken,
        identityAccessToken,
        identity
      };
    } catch (error) {
      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityTlsCertAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.TLS_CERT_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.FAILURE,
          "client.address": requestContext.get(RequestContextKey.Ip),
          "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
        });
      }

      recordAuthAttemptMetric({
        startTime: authMetricStartTime,
        method: AuthAttemptAuthMethod.TLS_CERT_AUTH,
        result: AuthAttemptAuthResult.FAILURE,
        orgId: org.id,
        error
      });
      throw error;
    }
  };

  const attachTlsCertAuth: TIdentityTlsCertAuthServiceFactory["attachTlsCertAuth"] = async ({
    identityId,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    isActorSuperAdmin,
    caCertificate,
    allowedCommonNames,
    allowedSubjectAltNames,
    verifyClientCertificateChain: verifyClientCertificateChainOpt
  }) => {
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

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TLS_CERT_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add TLS Certificate Auth to already configured identity"
      });
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
        ProjectPermissionIdentityActions.EditAuth,
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
        OrgPermissionIdentityActions.EditAuth,
        OrgPermissionSubjects.Identity
      );
    }

    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);
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

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    const identityTlsCertAuth = await identityTlsCertAuthDAL.transaction(async (tx) => {
      const doc = await identityTlsCertAuthDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
          accessTokenMaxTTL,
          allowedCommonNames,
          allowedSubjectAltNames: serializeAllowedSubjectAltNames(allowedSubjectAltNames),
          accessTokenTTL,
          encryptedCaCertificate: encryptor({ plainText: Buffer.from(caCertificate) }).cipherTextBlob,
          verifyClientCertificateChain: verifyClientCertificateChainOpt ?? false,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps)
        },
        tx
      );
      return doc;
    });
    return { ...identityTlsCertAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const updateTlsCertAuth: TIdentityTlsCertAuthServiceFactory["updateTlsCertAuth"] = async ({
    identityId,
    caCertificate,
    allowedCommonNames,
    allowedSubjectAltNames,
    verifyClientCertificateChain: verifyClientCertificateChainOpt,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }) => {
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

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TLS_CERT_AUTH)) {
      throw new NotFoundError({
        message: "The identity does not have TLS Certificate Auth attached"
      });
    }

    const identityTlsCertAuth = await identityTlsCertAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityTlsCertAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityTlsCertAuth.accessTokenTTL) >
        (accessTokenMaxTTL || identityTlsCertAuth.accessTokenMaxTTL)
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
        ProjectPermissionIdentityActions.EditAuth,
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
        OrgPermissionIdentityActions.EditAuth,
        OrgPermissionSubjects.Identity
      );
    }

    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);
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
    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    const updatedTlsCertAuth = await identityTlsCertAuthDAL.updateById(identityTlsCertAuth.id, {
      allowedCommonNames,
      allowedSubjectAltNames: serializeAllowedSubjectAltNames(allowedSubjectAltNames),
      encryptedCaCertificate: caCertificate
        ? encryptor({ plainText: Buffer.from(caCertificate) }).cipherTextBlob
        : undefined,
      verifyClientCertificateChain: verifyClientCertificateChainOpt,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });

    return { ...updatedTlsCertAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const getTlsCertAuth: TIdentityTlsCertAuthServiceFactory["getTlsCertAuth"] = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }) => {
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

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TLS_CERT_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have TLS Certificate Auth attached"
      });
    }

    const identityAuth = await identityTlsCertAuthDAL.findOne({ identityId });

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
    let caCertificate = "";
    if (identityAuth.encryptedCaCertificate) {
      caCertificate = decryptor({ cipherTextBlob: identityAuth.encryptedCaCertificate }).toString();
    }

    return { ...identityAuth, caCertificate, orgId: identityMembershipOrg.scopeOrgId };
  };

  const revokeTlsCertAuth: TIdentityTlsCertAuthServiceFactory["revokeTlsCertAuth"] = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }) => {
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
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TLS_CERT_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have TLS Certificate auth"
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

      const { permission: rolePermission, memberships } = await permissionService.getOrgPermission({
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });
      const shouldUseNewPrivilegeSystem = Boolean(memberships?.[0]?.shouldUseNewPrivilegeSystem);
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
            "Failed to revoke TLS Certificate auth of identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.RevokeAuth,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const revokedIdentityTlsCertAuth = await identityTlsCertAuthDAL.transaction(async (tx) => {
      const deletedTlsCertAuth = await identityTlsCertAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.TLS_CERT_AUTH }, tx);

      return { ...deletedTlsCertAuth?.[0], orgId: identityMembershipOrg.scopeOrgId };
    });

    // Detaching the auth method must invalidate any tokens already issued
    // through it; without this, leaked tokens authenticate up to MAX_AGE
    // even after the admin pulled the auth method.
    await identityAccessTokenService.revokeTokensForIdentityAuthMethod({
      identityId,
      authMethod: IdentityAuthMethod.TLS_CERT_AUTH
    });

    return revokedIdentityTlsCertAuth;
  };

  return {
    login,
    attachTlsCertAuth,
    updateTlsCertAuth,
    getTlsCertAuth,
    revokeTlsCertAuth
  };
};
