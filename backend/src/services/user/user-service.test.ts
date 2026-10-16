import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { EmailDomainStatus } from "@app/ee/services/email-domain/email-domain-types";
import { BadRequestError } from "@app/lib/errors";

import { MfaMethod } from "../auth/auth-type";
import { userServiceFactory } from "./user-service";

let isSmtpConfigured = true;

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com", isSmtpConfigured })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ENFORCED_ORG_ID = "22222222-2222-2222-2222-222222222222";

const user = {
  id: USER_ID,
  username: "alice@corp.com",
  email: "alice@corp.com",
  authMethods: ["email"]
};

type Overrides = {
  organizations?: { id: string; scimEnabled?: boolean; authEnforced?: boolean }[];
  verifiedDomains?: { orgId: string; domain: string; status: string }[];
};

const buildService = ({ organizations = [], verifiedDomains = [] }: Overrides) => {
  const emailDomainDAL = {
    find: vi.fn(async (filter: Record<string, unknown>) => {
      const orgIds = (filter.$in as { orgId: string[] })?.orgId ?? [];
      return verifiedDomains.filter(
        (row) => row.domain === filter.domain && row.status === filter.status && orgIds.includes(row.orgId)
      );
    })
  };

  const tokenService = { createTokenForUser: vi.fn().mockResolvedValue("123456") };
  const smtpService = { sendMail: vi.fn().mockResolvedValue(undefined) };

  const service = userServiceFactory({
    userDAL: {
      findById: vi.fn().mockResolvedValue(user),
      // The service threads `tx` through every call; the stubs ignore it.
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({}))
    },
    membershipUserDAL: {
      find: vi.fn().mockResolvedValue(organizations.map((org) => ({ scopeOrgId: org.id })))
    },
    orgDAL: { find: vi.fn().mockResolvedValue(organizations) },
    emailDomainDAL,
    tokenService,
    smtpService
  } as unknown as Parameters<typeof userServiceFactory>[0]);

  return { service, emailDomainDAL, tokenService };
};

// Settle the call before advancing the clock, so a refusal that rejects while the timers run still
// has a handler attached. The success path pads its response to a fixed duration to defeat timing
// enumeration, which is what needs the clock advanced at all.
const requestChange = async (service: ReturnType<typeof buildService>["service"]) => {
  const settled = service
    .requestEmailChangeOTP({ userId: USER_ID, newEmail: "alice@newcorp.com" })
    .then((value) => ({ value, error: undefined }))
    .catch((error: Error) => ({ value: undefined, error }));

  await vi.runAllTimersAsync();

  const { value, error } = await settled;
  if (error) throw error;
  return value;
};

describe("requestEmailChangeOTP managed-email gate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("allows the change when the user belongs to no organization", async () => {
    const { service, tokenService } = buildService({});

    await expect(requestChange(service)).resolves.toMatchObject({ success: true });
    expect(tokenService.createTokenForUser).toHaveBeenCalledOnce();
  });

  test("refuses the change when any organization has SCIM enabled", async () => {
    const { service, emailDomainDAL } = buildService({
      organizations: [{ id: ENFORCED_ORG_ID, scimEnabled: true }]
    });

    await expect(requestChange(service)).rejects.toThrow(/SCIM is enabled/);
    expect(emailDomainDAL.find).not.toHaveBeenCalled();
  });

  test("refuses the change when the address is on a verified domain of an SSO-enforced org", async () => {
    const { service } = buildService({
      organizations: [{ id: ENFORCED_ORG_ID, authEnforced: true }],
      verifiedDomains: [{ orgId: ENFORCED_ORG_ID, domain: "corp.com", status: EmailDomainStatus.Verified }]
    });

    await expect(requestChange(service)).rejects.toThrow(/enforces SSO/);
  });

  test("allows the change when the enforced org has not verified the address's domain", async () => {
    const { service, tokenService } = buildService({
      organizations: [{ id: ENFORCED_ORG_ID, authEnforced: true }],
      verifiedDomains: [{ orgId: ENFORCED_ORG_ID, domain: "other.com", status: EmailDomainStatus.Verified }]
    });

    await expect(requestChange(service)).resolves.toMatchObject({ success: true });
    expect(tokenService.createTokenForUser).toHaveBeenCalledOnce();
  });

  test("allows the change when the domain is verified only by an org that does not enforce SSO", async () => {
    const { service, tokenService } = buildService({
      organizations: [{ id: ENFORCED_ORG_ID, authEnforced: true }, { id: "33333333-3333-3333-3333-333333333333" }],
      verifiedDomains: [
        { orgId: "33333333-3333-3333-3333-333333333333", domain: "corp.com", status: EmailDomainStatus.Verified }
      ]
    });

    await expect(requestChange(service)).resolves.toMatchObject({ success: true });
    expect(tokenService.createTokenForUser).toHaveBeenCalledOnce();
  });

  test("allows the change when the domain is only pending verification", async () => {
    const { service, tokenService } = buildService({
      organizations: [{ id: ENFORCED_ORG_ID, authEnforced: true }],
      verifiedDomains: [{ orgId: ENFORCED_ORG_ID, domain: "corp.com", status: EmailDomainStatus.Pending }]
    });

    await expect(requestChange(service)).resolves.toMatchObject({ success: true });
    expect(tokenService.createTokenForUser).toHaveBeenCalledOnce();
  });
});

type TMfaOverrides = {
  userRow?: { email?: string | null; isMfaEnabled?: boolean; selectedMfaMethod?: MfaMethod | null };
  orgs?: { id: string; rootOrgId?: string | null; enforceMfa?: boolean; selectedMfaMethod?: MfaMethod | null }[];
  memberOrgIds?: string[];
  hasTotp?: boolean;
  passkeyCount?: number;
  smtp?: boolean;
};

const buildMfaService = ({
  userRow,
  orgs = [],
  memberOrgIds = [],
  hasTotp = false,
  passkeyCount = 0,
  smtp = true
}: TMfaOverrides = {}) => {
  isSmtpConfigured = smtp;

  const orgDAL = {
    findById: vi.fn(async (id: string) => orgs.find((org) => org.id === id) ?? null),
    find: vi.fn(async ({ $in }: { $in: { id: string[] } }) => orgs.filter((org) => $in.id.includes(org.id))),
    findActiveEffectiveOrgMembershipsByUserId: vi.fn(async () => memberOrgIds.map((id) => ({ scopeOrgId: id })))
  };

  return userServiceFactory({
    userDAL: {
      findById: vi.fn().mockResolvedValue({ ...user, isMfaEnabled: false, selectedMfaMethod: null, ...userRow })
    },
    orgDAL,
    totpConfigDAL: { findOne: vi.fn(async () => (hasTotp ? { id: "totp-1" } : undefined)) },
    webAuthnCredentialDAL: {
      find: vi.fn(async () => Array.from({ length: passkeyCount }, (_, index) => ({ id: `cred-${index}` })))
    }
  } as unknown as Parameters<typeof userServiceFactory>[0]);
};

describe("isStepUpMfaRequired", () => {
  test("holds for a user with MFA enabled, whatever their orgs say", async () => {
    const service = buildMfaService({ userRow: { isMfaEnabled: true } });

    await expect(service.isStepUpMfaRequired(USER_ID)).resolves.toBe(true);
  });

  test("resolves a membership org to its root before reading enforcement", async () => {
    const service = buildMfaService({
      memberOrgIds: ["sub-org"],
      orgs: [
        { id: "sub-org", rootOrgId: ENFORCED_ORG_ID, enforceMfa: false },
        { id: ENFORCED_ORG_ID, enforceMfa: true }
      ]
    });

    await expect(service.isStepUpMfaRequired(USER_ID)).resolves.toBe(true);
  });

  test("does not hold when no org the user belongs to enforces MFA", async () => {
    const service = buildMfaService({
      memberOrgIds: ["sub-org"],
      orgs: [
        { id: "sub-org", rootOrgId: "root-org" },
        { id: "root-org", enforceMfa: false },
        { id: ENFORCED_ORG_ID, enforceMfa: true }
      ]
    });

    await expect(service.isStepUpMfaRequired(USER_ID)).resolves.toBe(false);
  });
});

describe("resolveMfaMethodAfterRemoval", () => {
  test("leaves the preference alone when the removed factor is not the selected one", async () => {
    const service = buildMfaService({ userRow: { selectedMfaMethod: MfaMethod.WEBAUTHN }, passkeyCount: 1 });

    await expect(service.resolveMfaMethodAfterRemoval(USER_ID, MfaMethod.TOTP)).resolves.toBeNull();
  });

  test("hands the selection to a configured passkey rather than email", async () => {
    const service = buildMfaService({
      userRow: { isMfaEnabled: true, selectedMfaMethod: MfaMethod.TOTP },
      hasTotp: true,
      passkeyCount: 1
    });

    await expect(service.resolveMfaMethodAfterRemoval(USER_ID, MfaMethod.TOTP)).resolves.toBe(MfaMethod.WEBAUTHN);
  });

  test("hands the selection to a configured authenticator when the last passkey goes", async () => {
    const service = buildMfaService({
      userRow: { isMfaEnabled: true, selectedMfaMethod: MfaMethod.WEBAUTHN },
      hasTotp: true
    });

    await expect(service.resolveMfaMethodAfterRemoval(USER_ID, MfaMethod.WEBAUTHN)).resolves.toBe(MfaMethod.TOTP);
  });

  test("refuses the removal when MFA is enabled and nothing usable is left", async () => {
    const service = buildMfaService({
      userRow: { isMfaEnabled: true, selectedMfaMethod: MfaMethod.TOTP },
      hasTotp: true,
      smtp: false
    });

    await expect(service.resolveMfaMethodAfterRemoval(USER_ID, MfaMethod.TOTP)).rejects.toBeInstanceOf(BadRequestError);
  });

  test("does not treat email as usable without SMTP", async () => {
    const service = buildMfaService({
      userRow: { isMfaEnabled: true, selectedMfaMethod: MfaMethod.WEBAUTHN },
      passkeyCount: 1,
      smtp: false
    });

    await expect(service.resolveMfaMethodAfterRemoval(USER_ID, MfaMethod.WEBAUTHN)).rejects.toBeInstanceOf(
      BadRequestError
    );
  });

  test("resets to email when MFA is off and nothing else is configured", async () => {
    const service = buildMfaService({ userRow: { selectedMfaMethod: MfaMethod.TOTP }, hasTotp: true, smtp: false });

    await expect(service.resolveMfaMethodAfterRemoval(USER_ID, MfaMethod.TOTP)).resolves.toBe(MfaMethod.EMAIL);
  });
});

describe("getStepUpMfaMethod", () => {
  test("challenges the org-enforced method and accepts nothing else", async () => {
    const service = buildMfaService({
      userRow: { isMfaEnabled: true, selectedMfaMethod: MfaMethod.EMAIL },
      orgs: [{ id: ENFORCED_ORG_ID, enforceMfa: true, selectedMfaMethod: MfaMethod.WEBAUTHN }]
    });

    await expect(service.getStepUpMfaMethod(USER_ID, ENFORCED_ORG_ID)).resolves.toEqual({
      challenge: MfaMethod.WEBAUTHN,
      accepted: [MfaMethod.WEBAUTHN]
    });
  });

  test("reads enforcement off the root org when the session is scoped to a sub-org", async () => {
    const service = buildMfaService({
      userRow: { isMfaEnabled: true, selectedMfaMethod: MfaMethod.EMAIL },
      orgs: [
        { id: "sub-org", rootOrgId: ENFORCED_ORG_ID },
        { id: ENFORCED_ORG_ID, enforceMfa: true, selectedMfaMethod: MfaMethod.WEBAUTHN }
      ]
    });

    await expect(service.getStepUpMfaMethod(USER_ID, "sub-org")).resolves.toEqual({
      challenge: MfaMethod.WEBAUTHN,
      accepted: [MfaMethod.WEBAUTHN]
    });
  });

  test("substitutes another configured factor for the one being removed", async () => {
    const service = buildMfaService({
      userRow: { isMfaEnabled: true, selectedMfaMethod: MfaMethod.TOTP },
      orgs: [{ id: ENFORCED_ORG_ID }],
      hasTotp: true,
      passkeyCount: 1
    });

    await expect(service.getStepUpMfaMethod(USER_ID, ENFORCED_ORG_ID, MfaMethod.TOTP)).resolves.toEqual({
      challenge: MfaMethod.WEBAUTHN,
      accepted: [MfaMethod.TOTP, MfaMethod.WEBAUTHN]
    });
  });

  test("still challenges a factor one of the user's orgs enforces, even while removing it", async () => {
    const service = buildMfaService({
      userRow: { isMfaEnabled: true, selectedMfaMethod: MfaMethod.TOTP },
      memberOrgIds: [ENFORCED_ORG_ID],
      orgs: [{ id: ENFORCED_ORG_ID, enforceMfa: true, selectedMfaMethod: MfaMethod.TOTP }],
      hasTotp: true,
      passkeyCount: 1
    });

    await expect(service.getStepUpMfaMethod(USER_ID, ENFORCED_ORG_ID, MfaMethod.TOTP)).resolves.toEqual({
      challenge: MfaMethod.TOTP,
      accepted: [MfaMethod.TOTP]
    });
  });

  test("challenges a factor another org enforces even when the current org asks for less", async () => {
    const service = buildMfaService({
      userRow: { isMfaEnabled: true, selectedMfaMethod: MfaMethod.EMAIL },
      memberOrgIds: ["loose-org", ENFORCED_ORG_ID],
      orgs: [
        { id: "loose-org", enforceMfa: false },
        { id: ENFORCED_ORG_ID, enforceMfa: true, selectedMfaMethod: MfaMethod.TOTP }
      ],
      hasTotp: true
    });

    await expect(service.getStepUpMfaMethod(USER_ID, "loose-org", MfaMethod.TOTP)).resolves.toEqual({
      challenge: MfaMethod.TOTP,
      accepted: [MfaMethod.TOTP]
    });
  });

  test("keeps the required method when no substitute is configured", async () => {
    const service = buildMfaService({
      userRow: { isMfaEnabled: true, selectedMfaMethod: MfaMethod.TOTP },
      orgs: [{ id: ENFORCED_ORG_ID }],
      hasTotp: true,
      smtp: false
    });

    await expect(service.getStepUpMfaMethod(USER_ID, ENFORCED_ORG_ID, MfaMethod.TOTP)).resolves.toEqual({
      challenge: MfaMethod.TOTP,
      accepted: [MfaMethod.TOTP]
    });
  });
});
