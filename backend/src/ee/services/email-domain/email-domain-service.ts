import crypto from "node:crypto";
import { Resolver } from "node:dns/promises";

import { ForbiddenError } from "@casl/ability";
import { getDomain, getHostname, getSubdomain } from "tldts";

import { OrganizationActionScope } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";

import { TLicenseServiceFactory } from "../license/license-service";
import { TEmailDomainDALFactory } from "./email-domain-dal";
import {
  EmailDomainStatus,
  TCreateEmailDomainDTO,
  TDeleteEmailDomainDTO,
  TListEmailDomainsDTO,
  TValidateEmailDomainResult,
  TVerifyEmailDomainDTO
} from "./email-domain-types";

type TEmailDomainServiceFactoryDep = {
  emailDomainDAL: Pick<
    TEmailDomainDALFactory,
    | "create"
    | "find"
    | "findOne"
    | "findById"
    | "deleteById"
    | "updateById"
    | "findVerifiedSubdomains"
    | "findVerifiedParentDomains"
    | "transaction"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TEmailDomainServiceFactory = ReturnType<typeof emailDomainServiceFactory>;

const VERIFICATION_CODE_EXPIRY_DAYS = 7;
const DNS_RECORD_PREFIX = "_infisical-verification";
const DNS_TXT_VALUE_PREFIX = "infisical-domain-verification";

const domainLabelValidator = characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen]);

const isValidDomain = (domain: string): boolean => {
  const parts = domain.split(".");
  if (parts.length < 2) return false;

  for (const label of parts) {
    if (label.length === 0 || label.length > 63) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    if (!domainLabelValidator(label)) return false;
  }

  // TLD must be at least 2 chars and alphabetic only
  const tld = parts[parts.length - 1];
  if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;

  return true;
};

const buildDomainHierarchy = (domain: string): string[] => {
  const parts = domain.split(".");
  const hierarchy: string[] = [];
  for (let i = 0; i < parts.length - 1; i += 1) {
    const candidate = parts.slice(i).join(".");
    // Skip single-label entries (e.g. "com")
    if (candidate.includes(".")) {
      hierarchy.push(candidate);
    }
  }
  return hierarchy;
};

export const emailDomainServiceFactory = ({
  emailDomainDAL,
  permissionService,
  licenseService
}: TEmailDomainServiceFactoryDep) => {
  const createEmailDomain = async ({
    domain,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    orgId
  }: TCreateEmailDomainDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.EmailDomains);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.emailDomainVerification) {
      throw new BadRequestError({
        message: "Failed to add email domain due to plan restriction. Upgrade plan to use email domain verification."
      });
    }

    const normalizedDomain = domain.toLowerCase().trim();
    if (getHostname(normalizedDomain) !== normalizedDomain || !isValidDomain(normalizedDomain)) {
      throw new BadRequestError({
        message: "Invalid domain format. Please provide a valid domain name (e.g., company.com)."
      });
    }

    const subDomain = getSubdomain(normalizedDomain);
    const parentDomain = getDomain(normalizedDomain);
    if (subDomain && !parentDomain) {
      throw new BadRequestError({
        message: "Invalid domain format. Please provide a valid domain name (e.g., company.com)."
      });
    }

    const verificationCode = crypto.randomBytes(32).toString("hex");
    const verificationRecordName = `${DNS_RECORD_PREFIX}.${normalizedDomain}`;
    const codeExpiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Domains are platform-level unique. Use a transaction with a lock to prevent races.
    const emailDomain = await emailDomainDAL.transaction(async (tx) => {
      // Check if any org (including this one) already has this domain verified
      const platformExisting = await emailDomainDAL.findOne(
        { domain: normalizedDomain, status: EmailDomainStatus.Verified },
        tx
      );
      if (platformExisting) {
        throw new BadRequestError({
          message: "This domain is already verified by another organization."
        });
      }

      // Check if this org already has a pending/expired record for this domain
      const orgExisting = await emailDomainDAL.findOne({ orgId, domain: normalizedDomain }, tx);
      if (orgExisting) {
        throw new BadRequestError({
          message: "This domain is already pending verification or has expired."
        });
      }

      const created = await emailDomainDAL.create(
        {
          orgId,
          domain: normalizedDomain,
          parentDomain: subDomain ? parentDomain : null,
          verificationMethod: "dns-txt",
          verificationCode,
          verificationRecordName,
          status: EmailDomainStatus.Pending,
          codeExpiresAt
        },
        tx
      );

      return created;
    });

    return emailDomain;
  };

  const verifyEmailDomain = async ({
    emailDomainId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    orgId
  }: TVerifyEmailDomainDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.EmailDomains);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.emailDomainVerification) {
      throw new BadRequestError({
        message: "Failed to verify email domain due to plan restriction. Upgrade plan to use email domain verification."
      });
    }

    const emailDomainRecord = await emailDomainDAL.findOne({ id: emailDomainId, orgId, status: "pending" });
    if (!emailDomainRecord) {
      throw new NotFoundError({
        message: "Email domain not found."
      });
    }

    // Check if the verification code has expired
    if (new Date(emailDomainRecord.codeExpiresAt) < new Date()) {
      await emailDomainDAL.updateById(emailDomainId, { status: EmailDomainStatus.Expired });
      throw new BadRequestError({
        message: "Verification code has expired. Please create a new domain verification request."
      });
    }

    // Perform DNS TXT record lookup
    const resolver = new Resolver();
    let dnsRecords: string[][];
    try {
      dnsRecords = await resolver.resolveTxt(emailDomainRecord.verificationRecordName);
    } catch {
      throw new BadRequestError({
        message:
          "Failed to resolve DNS records for the domain. Please verify the DNS TXT record exists and try again. DNS changes may take time to propagate."
      });
    }

    const flatRecords = dnsRecords.map((record) => record.join(""));
    const expectedValue = `${DNS_TXT_VALUE_PREFIX}=${emailDomainRecord.verificationCode}`;
    const isVerified = flatRecords.some((record) => record === expectedValue);

    if (!isVerified) {
      throw new BadRequestError({
        message: `DNS TXT record not found or value does not match. Expected a TXT record at ${emailDomainRecord.verificationRecordName} with value: ${expectedValue}`
      });
    }

    const updatedEmailDomain = await emailDomainDAL.updateById(emailDomainId, {
      status: EmailDomainStatus.Verified,
      verifiedAt: new Date()
    });

    return { emailDomain: updatedEmailDomain };
  };

  const listEmailDomains = async ({ actor, actorId, actorAuthMethod, actorOrgId, orgId }: TListEmailDomainsDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.EmailDomains);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.emailDomainVerification) {
      throw new BadRequestError({
        message: "Failed to list email domains due to plan restriction. Upgrade plan to use email domain verification."
      });
    }

    const emailDomains = await emailDomainDAL.find({ orgId });
    return emailDomains;
  };

  const deleteEmailDomain = async ({
    emailDomainId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    orgId
  }: TDeleteEmailDomainDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.EmailDomains);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.emailDomainVerification) {
      throw new BadRequestError({
        message: "Failed to delete email domain due to plan restriction. Upgrade plan to use email domain verification."
      });
    }

    const emailDomainRecord = await emailDomainDAL.findOne({ id: emailDomainId, orgId });
    if (!emailDomainRecord) {
      throw new NotFoundError({
        message: "Email domain not found."
      });
    }

    await emailDomainDAL.deleteById(emailDomainId);
    return emailDomainRecord;
  };

  const validateEmailDomain = async (email: string): Promise<TValidateEmailDomainResult> => {
    const emailParts = email.split("@");
    const emailDomain = emailParts[1]?.toLowerCase();
    if (!emailDomain) {
      return { status: "ALLOWED" };
    }

    const hierarchy = buildDomainHierarchy(emailDomain);

    // Check the exact domain first
    const exactMatch = await emailDomainDAL.findOne({ domain: emailDomain, status: EmailDomainStatus.Verified });
    if (exactMatch) {
      return { status: "ALLOWED", orgId: exactMatch.orgId };
    }

    // Walk up the hierarchy to check if any parent domain is verified
    for (let i = 1; i < hierarchy.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const parentMatch = await emailDomainDAL.findOne({ domain: hierarchy[i], status: EmailDomainStatus.Verified });
      if (parentMatch) {
        // Parent is verified but exact domain is not — block
        return { status: "BLOCKED" };
      }
    }

    // No verified domain found at any level — no restriction applies
    return { status: "ALLOWED" };
  };

  return {
    createEmailDomain,
    verifyEmailDomain,
    listEmailDomains,
    deleteEmailDomain,
    validateEmailDomain
  };
};
