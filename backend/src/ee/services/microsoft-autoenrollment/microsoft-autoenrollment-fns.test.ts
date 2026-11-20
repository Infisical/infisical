import dns from "node:dns/promises";
import { afterEach, describe, expect, test, vi } from "vitest";

import { buildTestKeytab, buildTestKeytabEntry } from "@app/lib/kerberos/kerberos.test-helpers";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import {
  getMicrosoftAutoenrollmentUnsupportedReason,
  isComputerInAllowedGroups,
  mergeAllowedGroups,
  readUploadedKeytab,
  resolveCanonicalHostname
} from "./microsoft-autoenrollment-fns";

const DOMAIN_COMPUTERS_SID = "S-1-5-21-1111111111-2222222222-3333333333-515";
const SERVERS_SID = "S-1-5-21-1111111111-2222222222-3333333333-1200";

describe("isComputerInAllowedGroups", () => {
  test.each([
    ["an empty allowed group list", [], true],
    ["a group the computer is in", [SERVERS_SID, DOMAIN_COMPUTERS_SID], true],
    ["only groups the computer is not in", [SERVERS_SID], false]
  ])("%s", (_name, allowedGroupSids, expected) => {
    const allowedGroups = allowedGroupSids.map((sid) => ({ sid, name: sid }));
    expect(isComputerInAllowedGroups(allowedGroups, [DOMAIN_COMPUTERS_SID])).toBe(expected);
  });
});

describe("readUploadedKeytab", () => {
  test("refuses a key version too large to store", () => {
    expect(() => readUploadedKeytab(buildTestKeytab([buildTestKeytabEntry({ keyVersion: 2 ** 31 })]))).toThrow(
      /not a valid keytab/
    );
  });
});

describe("mergeAllowedGroups", () => {
  test("names each group from the directory, then from the stored list, in the order sent", () => {
    expect(
      mergeAllowedGroups([SERVERS_SID, DOMAIN_COMPUTERS_SID], { [DOMAIN_COMPUTERS_SID]: "Domain Computers" }, [
        { sid: SERVERS_SID, name: "Servers" }
      ])
    ).toEqual([
      { sid: SERVERS_SID, name: "Servers" },
      { sid: DOMAIN_COMPUTERS_SID, name: "Domain Computers" }
    ]);
  });
});

describe("getMicrosoftAutoenrollmentUnsupportedReason", () => {
  const withCa = (ca: unknown) => ({ findByIdWithAssociatedCa: vi.fn().mockResolvedValue(ca) });
  const internalCa = (keyAlgorithm: string) => ({ id: "ca-id", externalCa: null, internalCa: { keyAlgorithm } });

  test.each([
    ["an RSA profile on an RSA certificate authority", undefined, internalCa("RSA_2048")],
    [
      "an elliptic curve profile on an elliptic curve certificate authority",
      CertKeyAlgorithm.ECDSA_P384,
      internalCa("EC_prime256v1")
    ]
  ])("is null for %s", async (_name, keyAlgorithm, ca) => {
    await expect(
      getMicrosoftAutoenrollmentUnsupportedReason({ profileSlug: "web", caId: "ca-id", keyAlgorithm }, withCa(ca))
    ).resolves.toBeNull();
  });

  test("names an external certificate authority", async () => {
    await expect(
      getMicrosoftAutoenrollmentUnsupportedReason(
        { profileSlug: "web", caId: "ca-id" },
        withCa({ id: "ca-id", externalCa: { type: CaType.ACME } })
      )
    ).resolves.toMatch(/internal certificate authority/);
  });

  test("names a profile with no default key on an elliptic curve certificate authority, since it asks for RSA", async () => {
    await expect(
      getMicrosoftAutoenrollmentUnsupportedReason(
        { profileSlug: "web", caId: "ca-id" },
        withCa(internalCa("EC_prime256v1"))
      )
    ).resolves.toBe(
      "Profile 'web' has no default key algorithm, so Windows requests RSA 2048 keys, but its certificate authority's ECDSA P256 key cannot sign that request. Use a certificate authority with an RSA key, or set the profile's default key algorithm."
    );
  });

  test("names the profile's key and the certificate authority's key by their display names", async () => {
    await expect(
      getMicrosoftAutoenrollmentUnsupportedReason(
        { profileSlug: "web", caId: "ca-id", keyAlgorithm: CertKeyAlgorithm.ECDSA_P384 },
        withCa(internalCa("RSA_4096"))
      )
    ).resolves.toBe(
      "Profile 'web' asks Windows for ECDSA P384 keys, but its certificate authority's RSA 4096 key cannot sign that request. Use a certificate authority with an elliptic curve key, or change the profile's default key algorithm."
    );
  });

  test.each([CertKeyAlgorithm.ML_DSA_65, CertKeyAlgorithm.SLH_DSA_SHA2_128F])(
    "refuses a %s default key, since Windows autoenrollment only makes RSA and ECDSA keys",
    async (keyAlgorithm) => {
      await expect(
        getMicrosoftAutoenrollmentUnsupportedReason(
          { profileSlug: "web", caId: "ca-id", keyAlgorithm },
          withCa(internalCa("RSA_2048"))
        )
      ).resolves.toContain(
        `${keyAlgorithm} as its default key algorithm, but Windows autoenrollment supports only RSA and ECDSA keys`
      );
    }
  );
});

describe("resolveCanonicalHostname", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("follows CNAMEs to the canonical name, lowercased", async () => {
    const cnames: Record<string, string> = {
      "app.example.com": "Edge.Example.NET",
      "edge.example.net": "origin.example.net"
    };
    vi.spyOn(dns, "resolveCname").mockImplementation(async (hostname: string) =>
      cnames[hostname.toLowerCase()]
        ? [cnames[hostname.toLowerCase()]]
        : Promise.reject(Object.assign(new Error("no data"), { code: "ENODATA" }))
    );

    await expect(resolveCanonicalHostname("App.Example.com")).resolves.toBe("origin.example.net");
  });

  test("refuses a hostname DNS could not answer for", async () => {
    vi.spyOn(dns, "resolveCname").mockRejectedValue(Object.assign(new Error("server failure"), { code: "ESERVFAIL" }));

    await expect(resolveCanonicalHostname("app.example.com")).rejects.toThrow(
      "Could not resolve the hostname 'app.example.com' in DNS (ESERVFAIL)"
    );
  });

  test("stops after ten hops on a CNAME loop", async () => {
    const resolveCname = vi
      .spyOn(dns, "resolveCname")
      .mockImplementation(async (hostname: string) => [
        hostname === "a.example.com" ? "b.example.com" : "a.example.com"
      ]);

    await expect(resolveCanonicalHostname("a.example.com")).resolves.toBe("a.example.com");
    expect(resolveCname).toHaveBeenCalledTimes(10);
  });
});
