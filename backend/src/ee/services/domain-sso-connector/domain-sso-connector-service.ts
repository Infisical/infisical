import nodeCrypto from "crypto";

import { OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionSsoActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { TUserAuthenticationDALFactory } from "@app/services/user-authentication/user-authentication-dal";

import { TDomainSsoConnectorDALFactory } from "./domain-sso-connector-dal";
import {
  DomainVerificationStatus,
  TCreateDomainSsoConnectorDTO,
  TDeleteDomainSsoConnectorDTO,
  TTakeoverDomainDTO,
  TVerifyDomainDTO
} from "./domain-sso-connector-types";

type TDomainSsoConnectorServiceFactoryDep = {
  domainSsoConnectorDAL: Pick<
    TDomainSsoConnectorDALFactory,
    "create" | "findOne" | "findById" | "updateById" | "deleteById" | "findByDomain" | "transaction"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  oidcConfigDAL: { update: (filter: Record<string, unknown>, data: Record<string, unknown>) => Promise<unknown> };
  samlConfigDAL: { update: (filter: Record<string, unknown>, data: Record<string, unknown>) => Promise<unknown> };
  ldapConfigDAL: { update: (filter: Record<string, unknown>, data: Record<string, unknown>) => Promise<unknown> };
  userAuthenticationDAL: Pick<TUserAuthenticationDALFactory, "find" | "delete" | "insertMany">;
  dnsResolver: {
    resolveTxt: (domain: string) => Promise<string[][]>;
  };
};

export type TDomainSsoConnectorServiceFactory = ReturnType<typeof domainSsoConnectorServiceFactory>;

const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

const validateDomain = (domain: string) => {
  if (!domain || !DOMAIN_REGEX.test(domain)) {
    throw new BadRequestError({ message: `Invalid domain format: "${domain}"` });
  }
};

const extractDomain = (email: string): string => {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return "unknown";
  const domain = email.substring(atIndex + 1);
  return domain || "unknown";
};

export const domainSsoConnectorServiceFactory = ({
  domainSsoConnectorDAL,
  permissionService,
  oidcConfigDAL,
  samlConfigDAL,
  ldapConfigDAL,
  userAuthenticationDAL,
  dnsResolver
}: TDomainSsoConnectorServiceFactoryDep) => {
  const requireSsoPermission = async (
    dto: { actorId: string; actorOrgId: string; actorAuthMethod: AuthMethod | null },
    orgId: string,
    action: OrgPermissionSsoActions
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: dto.actorId,
      orgId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      scope: OrganizationActionScope.Any
    });

    if (!permission.can(action, OrgPermissionSubjects.Sso)) {
      throw new ForbiddenRequestError({ message: "You do not have permission to manage SSO domain connectors" });
    }
  };

  const claimDomain = async (dto: TCreateDomainSsoConnectorDTO) => {
    validateDomain(dto.domain);

    await requireSsoPermission(dto, dto.actorOrgId, OrgPermissionSsoActions.Create);

    const existing = await domainSsoConnectorDAL.findByDomain(dto.domain);
    if (existing) {
      throw new BadRequestError({ message: `Domain "${dto.domain}" cannot be claimed` });
    }

    const verificationToken = `infisical-verification=${nodeCrypto.randomUUID()}`;

    const connector = await domainSsoConnectorDAL.create({
      domain: dto.domain,
      ownerOrgId: dto.ownerOrgId,
      type: dto.type,
      verificationStatus: DomainVerificationStatus.PENDING,
      verificationToken,
      isActive: false
    });

    return connector;
  };

  const verifyDomain = async (dto: TVerifyDomainDTO) => {
    const connector = await domainSsoConnectorDAL.findById(dto.connectorId);
    if (!connector) {
      throw new NotFoundError({ message: "Domain SSO connector not found" });
    }

    await requireSsoPermission(dto, connector.ownerOrgId, OrgPermissionSsoActions.Edit);

    if (connector.verificationStatus === DomainVerificationStatus.VERIFIED) {
      throw new BadRequestError({ message: "Domain is already verified" });
    }

    const txtRecords = await dnsResolver.resolveTxt(connector.domain);
    const flatRecords = txtRecords.flat();
    const hasMatch = flatRecords.some((record) => record === connector.verificationToken);

    if (!hasMatch) {
      throw new BadRequestError({
        message: `DNS TXT verification failed for "${connector.domain}". Ensure the correct TXT record is set and allow time for DNS propagation.`
      });
    }

    const updated = await domainSsoConnectorDAL.updateById(dto.connectorId, {
      verificationStatus: DomainVerificationStatus.VERIFIED,
      verifiedAt: new Date()
    });

    return updated;
  };

  const deleteDomainConnector = async (dto: TDeleteDomainSsoConnectorDTO) => {
    const connector = await domainSsoConnectorDAL.findById(dto.connectorId);
    if (!connector) {
      throw new NotFoundError({ message: "Domain SSO connector not found" });
    }

    await requireSsoPermission(dto, connector.ownerOrgId, OrgPermissionSsoActions.Delete);

    const configDALMap: Record<string, typeof oidcConfigDAL> = {
      [AuthMethod.OIDC]: oidcConfigDAL,
      [AuthMethod.OKTA_SAML]: samlConfigDAL,
      [AuthMethod.AZURE_SAML]: samlConfigDAL,
      [AuthMethod.JUMPCLOUD_SAML]: samlConfigDAL,
      [AuthMethod.GOOGLE_SAML]: samlConfigDAL,
      [AuthMethod.KEYCLOAK_SAML]: samlConfigDAL,
      [AuthMethod.LDAP]: ldapConfigDAL
    };

    const configDAL = configDALMap[connector.type];
    if (configDAL) {
      await configDAL.update({ domainSsoConnectorId: dto.connectorId }, { domainSsoConnectorId: null });
    }

    await domainSsoConnectorDAL.deleteById(dto.connectorId);
  };

  const takeoverDomain = async (dto: TTakeoverDomainDTO) => {
    const connector = await domainSsoConnectorDAL.findById(dto.connectorId);
    if (!connector) {
      throw new NotFoundError({ message: "Domain SSO connector not found" });
    }

    if (connector.verificationStatus !== DomainVerificationStatus.VERIFIED) {
      throw new BadRequestError({ message: "Domain must be verified before takeover" });
    }

    await requireSsoPermission(dto, connector.ownerOrgId, OrgPermissionSsoActions.Edit);

    // Transactional: delete old records + insert new ones atomically
    await domainSsoConnectorDAL.transaction(async (tx) => {
      const existingRecords = await userAuthenticationDAL.find({ domain: connector.domain });

      await userAuthenticationDAL.delete({ domain: connector.domain }, tx);

      if (existingRecords.length > 0) {
        await userAuthenticationDAL.insertMany(
          existingRecords.map((record) => ({
            userId: record.userId,
            type: connector.type,
            externalId: null,
            domain: connector.domain
          })),
          tx
        );
      }
    });
  };

  const findActiveConnectorByDomain = async (domain: string) => {
    const connector = await domainSsoConnectorDAL.findOne({
      domain,
      isActive: true,
      verificationStatus: DomainVerificationStatus.VERIFIED
    });

    return connector || null;
  };

  return {
    claimDomain,
    verifyDomain,
    deleteDomainConnector,
    takeoverDomain,
    findActiveConnectorByDomain,
    extractDomain
  };
};
