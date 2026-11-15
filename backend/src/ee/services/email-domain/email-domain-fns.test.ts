import { BadRequestError } from "@app/lib/errors";

import { isIdpAuthoritativeForDomain, verifyEmailDomainOwnership } from "./email-domain-fns";
import { EmailDomainStatus } from "./email-domain-types";

const ownedDomain = { id: "domain-1", orgId: "org-1", domain: "acme.com", status: EmailDomainStatus.Verified };

const makeEmailDomainDAL = (records: { orgId: string; domain: string }[]) => ({
  findOne: vi
    .fn()
    .mockImplementation(({ domain, orgId }: { domain: string; orgId: string }) =>
      records.find((record) => record.domain === domain && record.orgId === orgId)
    )
});

describe("verifyEmailDomainOwnership", () => {
  test("returns the verified domain record when the org owns the domain", async () => {
    const emailDomainDAL = makeEmailDomainDAL([ownedDomain]);

    await expect(
      verifyEmailDomainOwnership({ email: "Jane@ACME.com", orgId: "org-1", emailDomainDAL })
    ).resolves.toEqual(ownedDomain);
    expect(emailDomainDAL.findOne).toHaveBeenCalledWith({
      domain: "acme.com",
      status: EmailDomainStatus.Verified,
      orgId: "org-1"
    });
  });

  test("refuses an address on a domain the org has not verified", async () => {
    const emailDomainDAL = makeEmailDomainDAL([ownedDomain]);

    await expect(
      verifyEmailDomainOwnership({ email: "sam@gmail.com", orgId: "org-1", emailDomainDAL })
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  test("refuses an address on a domain another org verified", async () => {
    const emailDomainDAL = makeEmailDomainDAL([ownedDomain]);

    await expect(
      verifyEmailDomainOwnership({ email: "jane@acme.com", orgId: "org-2", emailDomainDAL })
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  test("refuses an address with no domain part", async () => {
    const emailDomainDAL = makeEmailDomainDAL([ownedDomain]);

    await expect(verifyEmailDomainOwnership({ email: "jane", orgId: "org-1", emailDomainDAL })).rejects.toBeInstanceOf(
      BadRequestError
    );
    expect(emailDomainDAL.findOne).not.toHaveBeenCalled();
  });
});

describe("isIdpAuthoritativeForDomain", () => {
  test("is authoritative only when the org enforces SSO and owns the domain", () => {
    expect(isIdpAuthoritativeForDomain({ isAuthEnforced: true, ownedDomain })).toBe(true);
  });

  test.each([
    ["enforcement without the domain", { isAuthEnforced: true, ownedDomain: undefined }],
    ["enforcement with a null domain", { isAuthEnforced: true, ownedDomain: null }],
    ["the domain without enforcement", { isAuthEnforced: false, ownedDomain }],
    ["the domain with enforcement unset", { isAuthEnforced: null, ownedDomain }],
    ["neither", { isAuthEnforced: false, ownedDomain: undefined }]
  ] as const)("is not authoritative with %s", (_label, input) => {
    expect(isIdpAuthoritativeForDomain(input)).toBe(false);
  });
});
