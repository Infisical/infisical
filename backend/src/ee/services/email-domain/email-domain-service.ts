import dns from "node:dns/promises";

import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import {
  OrgPermissionEmailDomainActions,
  OrgPermissionSubjects,
  TOrgPermissionService
} from "@app/domains/platform/organizations/ce/module";
import { PgSqlLock } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { isValidEmailDomain } from "@app/lib/validator";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TEmailDomainDALFactory } from "./email-domain-dal";
import { getEmailDomainVerificationRecordValue, toEmailDomainResponse } from "./email-domain-fns";
import {
  EmailDomainStatus,
  EmailDomainVerificationError,
  TCreateEmailDomainDTO,
  TDeleteEmailDomainDTO,
  TListEmailDomainsDTO,
  TVerifyEmailDomainDTO
} from "./email-domain-types";

type TEmailDomainServiceFactoryDep = {
  emailDomainDAL: Pick<
    TEmailDomainDALFactory,
    "create" | "find" | "findOne" | "findById" | "deleteById" | "updateById" | "transaction"
  >;
  orgPermissionService: TOrgPermissionService;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  licenseService: TLicenseService;
};

export type TEmailDomainServiceFactory = ReturnType<typeof emailDomainServiceFactory>;

const VERIFICATION_CODE_EXPIRY_DAYS = 7;
const DNS_RECORD_PREFIX = "_infisical-verification";

export const emailDomainServiceFactory = ({
  emailDomainDAL,
  orgPermissionService,
  orgDAL,
  licenseService
}: TEmailDomainServiceFactoryDep) => {
  const createEmailDomain = async ({ domain, actor, orgId }: TCreateEmailDomainDTO) => {
    const permission = await orgPermissionService.getOrgPermission({ actor, orgId });
    permission.assert({ action: OrgPermissionEmailDomainActions.Create, subject: OrgPermissionSubjects.EmailDomains });

    const plan = await licenseService.getPlan(orgId);
    const canEmailDomainVerification =
      plan.has(PlanFeature.SamlSso) || plan.has(PlanFeature.Ldap) || plan.has(PlanFeature.OidcSso);
    if (!canEmailDomainVerification) {
      throw new BadRequestError({
        message: "Failed to add email domain due to plan restriction. Upgrade plan to use email domain verification."
      });
    }

    const normalizedDomain = domain.toLowerCase().trim();
    if (!isValidEmailDomain(normalizedDomain)) {
      throw new BadRequestError({
        message: "Invalid domain format. Please provide a valid domain name (e.g., company.com)."
      });
    }

    const verificationCode = crypto.randomBytes(32).toString("hex");
    const verificationRecordName = `${DNS_RECORD_PREFIX}.${normalizedDomain}`;
    const codeExpiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Domains are platform-level unique. Use a transaction with a lock to prevent races.
    const emailDomain = await emailDomainDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.EmailDomainCreationLock()]);

      // Check if any org (including this one) already has this domain verified
      const platformExisting = await emailDomainDAL.find({ domain: normalizedDomain }, { tx });
      if (platformExisting.length) {
        const hasVerifiedDomain = platformExisting.some((el) => el.status === EmailDomainStatus.Verified);
        if (hasVerifiedDomain) {
          return { error: "This domain is already verified by an organization.", data: null } as const;
        }

        const isExistingInSameOrg = platformExisting.some((el) => el.orgId === orgId);
        if (isExistingInSameOrg) {
          return { error: "This domain is already pending verification or has expired.", data: null } as const;
        }
      }

      const created = await emailDomainDAL.create(
        {
          orgId,
          domain: normalizedDomain,
          verificationMethod: "dns-txt",
          verificationCode,
          verificationRecordName,
          status: EmailDomainStatus.Pending,
          codeExpiresAt
        },
        tx
      );

      return { error: undefined, data: created } as const;
    });

    if (emailDomain.error) {
      throw new BadRequestError({ message: emailDomain.error });
    }

    return toEmailDomainResponse(emailDomain.data);
  };

  const verifyEmailDomain = async ({ emailDomainId, actor, orgId }: TVerifyEmailDomainDTO) => {
    const permission = await orgPermissionService.getOrgPermission({ actor, orgId });
    permission.assert({
      action: OrgPermissionEmailDomainActions.VerifyDomain,
      subject: OrgPermissionSubjects.EmailDomains
    });

    const plan = await licenseService.getPlan(orgId);
    const canEmailDomainVerification =
      plan.has(PlanFeature.SamlSso) || plan.has(PlanFeature.Ldap) || plan.has(PlanFeature.OidcSso);
    if (!canEmailDomainVerification) {
      throw new BadRequestError({
        name: EmailDomainVerificationError.PlanRestricted,
        message: "Failed to verify email domain due to plan restriction. Upgrade plan to use email domain verification."
      });
    }

    const emailDomainRecord = await emailDomainDAL.findOne({ id: emailDomainId, orgId });
    if (!emailDomainRecord) {
      throw new NotFoundError({
        message: "Email domain not found."
      });
    }

    if (emailDomainRecord.status === EmailDomainStatus.Verified) {
      throw new ConflictError({
        message: `Email domain '${emailDomainRecord.domain}' is already verified.`
      });
    }

    if (emailDomainRecord.status === EmailDomainStatus.Expired) {
      throw new BadRequestError({
        name: EmailDomainVerificationError.VerificationExpired,
        message: "Verification code has expired. Please create a new domain verification request."
      });
    }

    // Check if the verification code has expired
    if (new Date(emailDomainRecord.codeExpiresAt) < new Date()) {
      await emailDomainDAL.updateById(emailDomainId, { status: EmailDomainStatus.Expired });
      throw new BadRequestError({
        name: EmailDomainVerificationError.VerificationExpired,
        message: "Verification code has expired. Please create a new domain verification request."
      });
    }

    // Perform DNS TXT record lookup
    let dnsRecords: string[][];
    try {
      dnsRecords = await dns.resolveTxt(emailDomainRecord.verificationRecordName);
    } catch (err) {
      logger.error(err, "Failed to resolve DNS records for the domain");
      throw new BadRequestError({
        name: EmailDomainVerificationError.DnsLookupFailed,
        message:
          "Failed to resolve DNS records for the domain. Please verify the DNS TXT record exists and try again. DNS changes may take time to propagate."
      });
    }

    const flatRecords = dnsRecords.map((record) => record.join(""));
    const expectedValue = getEmailDomainVerificationRecordValue(emailDomainRecord.verificationCode);
    const isVerified = flatRecords.some((record) => record === expectedValue);

    if (!isVerified) {
      throw new BadRequestError({
        name: EmailDomainVerificationError.DnsRecordMismatch,
        message: `DNS TXT record not found or value does not match. Expected a TXT record at ${emailDomainRecord.verificationRecordName} with value: ${expectedValue}`
      });
    }

    const updatedEmailDomain = await emailDomainDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.EmailDomainCreationLock()]);
      // Check if any org (including this one) already has this domain verified
      const platformExisting = await emailDomainDAL.findOne(
        { domain: emailDomainRecord.domain, status: EmailDomainStatus.Verified },
        tx
      );
      if (platformExisting) {
        return { error: "This domain is already verified by an organization.", data: null } as const;
      }

      const data = await emailDomainDAL.updateById(
        emailDomainId,
        {
          status: EmailDomainStatus.Verified,
          verifiedAt: new Date()
        },
        tx
      );

      return { error: null, data } as const;
    });

    if (updatedEmailDomain.error) {
      throw new BadRequestError({
        name: EmailDomainVerificationError.AlreadyVerified,
        message: updatedEmailDomain.error
      });
    }

    return { emailDomain: toEmailDomainResponse(updatedEmailDomain.data) };
  };

  const listEmailDomains = async ({ actor, orgId }: TListEmailDomainsDTO) => {
    const permission = await orgPermissionService.getOrgPermission({ actor, orgId });
    permission.assert({ action: OrgPermissionEmailDomainActions.Read, subject: OrgPermissionSubjects.EmailDomains });

    const emailDomains = await emailDomainDAL.find({ orgId });
    return emailDomains.map(toEmailDomainResponse);
  };

  const deleteEmailDomain = async ({ emailDomainId, actor, orgId }: TDeleteEmailDomainDTO) => {
    const permission = await orgPermissionService.getOrgPermission({ actor, orgId });
    permission.assert({ action: OrgPermissionEmailDomainActions.Delete, subject: OrgPermissionSubjects.EmailDomains });

    const emailDomainRecord = await emailDomainDAL.findOne({ id: emailDomainId, orgId });
    if (!emailDomainRecord) {
      throw new NotFoundError({
        message: "Email domain not found."
      });
    }

    if (emailDomainRecord.status === EmailDomainStatus.Verified) {
      const org = await orgDAL.findById(orgId);
      if (org?.authEnforced) {
        const verifiedDomains = await emailDomainDAL.find({ orgId, status: EmailDomainStatus.Verified });
        // With SSO enforced, members can only sign in with an email on a verified domain
        if (verifiedDomains.length <= 1) {
          throw new BadRequestError({
            message: `Email domain '${emailDomainRecord.domain}' is the organization's only verified domain and SSO enforcement is on. Turn off SSO enforcement before deleting it.`
          });
        }
      }
    }

    await emailDomainDAL.deleteById(emailDomainId);
    return toEmailDomainResponse(emailDomainRecord);
  };

  return {
    createEmailDomain,
    verifyEmailDomain,
    listEmailDomains,
    deleteEmailDomain
  };
};
