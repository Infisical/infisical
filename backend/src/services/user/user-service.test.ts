import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { EmailDomainStatus } from "@app/ee/services/email-domain/email-domain-types";

import { userServiceFactory } from "./user-service";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.infisical.com", isSmtpConfigured: true })
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
