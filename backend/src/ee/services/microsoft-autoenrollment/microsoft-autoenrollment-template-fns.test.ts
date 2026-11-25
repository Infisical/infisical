import * as x509 from "@peculiar/x509";
import * as asn1js from "asn1js";
import { describe, expect, test } from "vitest";

import { CertExtendedKeyUsageType, CertKeyUsageType } from "@app/services/certificate-common/certificate-constants";
import { CertKeyAlgorithm, CertSignatureAlgorithm } from "@app/services/certificate/certificate-types";

import {
  buildPolicyId,
  buildProfileUsageExtensions,
  buildSidSecurityExtension,
  buildTemplateInfoExtension,
  buildTemplateOid,
  findTemplatePolicyProblem,
  readSidSecurityExtension,
  resolveRenewalPeriodSeconds,
  resolveTemplatePrivateKey,
  resolveTemplateSignatureAlgorithm
} from "./microsoft-autoenrollment-template-fns";

const APPLICATION_PROFILE_ID = "0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0";
const MAX_OID_ARC = 0xffff;

describe("buildTemplateOid", () => {
  test("encodes the application profile id as eight 16-bit arcs that Windows accepts", () => {
    const oid = buildTemplateOid(APPLICATION_PROFILE_ID);
    const arcs = oid.split(".").slice(8).map(Number);

    expect(oid.startsWith("1.3.6.1.4.1.")).toBe(true);
    expect(arcs).toHaveLength(8);
    expect(arcs.every((arc) => Number.isInteger(arc) && arc >= 0 && arc <= MAX_OID_ARC)).toBe(true);
    expect(arcs[0]).toBe(0x0f1e);
  });

  test("is stable for one application profile and differs between profiles", () => {
    expect(buildTemplateOid(APPLICATION_PROFILE_ID)).toBe(buildTemplateOid(APPLICATION_PROFILE_ID));
    expect(buildTemplateOid(APPLICATION_PROFILE_ID)).not.toBe(buildTemplateOid("1f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0"));
  });
});

describe("buildPolicyId", () => {
  test("is an uppercase GUID in braces, stable per application profile", () => {
    const policyId = buildPolicyId(APPLICATION_PROFILE_ID);

    expect(policyId).toMatch(/^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/);
    expect(buildPolicyId(APPLICATION_PROFILE_ID)).toBe(policyId);
    expect(buildPolicyId("1f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0")).not.toBe(policyId);
  });
});

describe("buildSidSecurityExtension", () => {
  test("encodes the SID as the NTDS CA security extension Windows uses for strong certificate mapping", () => {
    const sid = "S-1-5-21-1111111111-2222222222-3333333333-1104";
    const extension = buildSidSecurityExtension(sid);

    expect(extension.oid).toBe("1.3.6.1.4.1.311.25.2");
    expect(extension.critical).toBe(false);
    expect(extension.value).toEqual(
      Buffer.concat([Buffer.from("3040a03e060a2b060104018237190201a030042e", "hex"), Buffer.from(sid, "ascii")])
    );
  });
});

describe("buildTemplateInfoExtension", () => {
  test("encodes the template OID and revision as a non-critical template information extension", () => {
    const templateOid = buildTemplateOid(APPLICATION_PROFILE_ID);
    const extension = buildTemplateInfoExtension(templateOid, 101, 4);
    const [oid, majorRevision, minorRevision] = (asn1js.fromBER(extension.value).result as asn1js.Sequence).valueBlock
      .value;

    expect(extension.oid).toBe("1.3.6.1.4.1.311.21.7");
    expect(extension.critical).toBe(false);
    expect((oid as asn1js.ObjectIdentifier).getValue()).toBe(templateOid);
    expect((majorRevision as asn1js.Integer).valueBlock.valueDec).toBe(101);
    expect((minorRevision as asn1js.Integer).valueBlock.valueDec).toBe(4);
    expect(extension.value).toEqual(
      Buffer.from(
        new asn1js.Sequence({
          value: [
            new asn1js.ObjectIdentifier({ value: templateOid }),
            new asn1js.Integer({ value: 101 }),
            new asn1js.Integer({ value: 4 })
          ]
        }).toBER(false)
      )
    );
  });
});

describe("resolveTemplatePrivateKey", () => {
  test.each([
    [CertKeyAlgorithm.RSA_4096, 4096],
    [CertKeyAlgorithm.RSA_3072, 3072],
    [undefined, 2048]
  ])("%s asks Windows for a %d-bit RSA key", (keyAlgorithm, expected) => {
    expect(resolveTemplatePrivateKey(keyAlgorithm)).toEqual({ minimalKeyLength: expected, ellipticCurve: null });
  });

  test.each([
    [CertKeyAlgorithm.ECDSA_P256, 256, "1.2.840.10045.3.1.7", "ECDSA_P256"],
    [CertKeyAlgorithm.ECDSA_P384, 384, "1.3.132.0.34", "ECDSA_P384"],
    [CertKeyAlgorithm.ECDSA_P521, 521, "1.3.132.0.35", "ECDSA_P521"]
  ])("%s asks Windows for a %d-bit key on the curve Windows names %s", (keyAlgorithm, keyLength, oid, name) => {
    expect(resolveTemplatePrivateKey(keyAlgorithm)).toEqual({
      minimalKeyLength: keyLength,
      ellipticCurve: { oid, name }
    });
  });
});

describe("buildProfileUsageExtensions", () => {
  test("encodes the profile's key usages and extended key usages", () => {
    const extensions = buildProfileUsageExtensions({
      keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
      extendedKeyUsages: [CertExtendedKeyUsageType.CLIENT_AUTH, CertExtendedKeyUsageType.SERVER_AUTH]
    });
    const toX509Extension = (oid: string) => {
      const extension = extensions.find((candidate) => candidate.oid === oid);
      if (!extension) throw new Error(`Missing extension ${oid}`);
      return new x509.Extension(extension.oid, extension.critical, new Uint8Array(extension.value)).rawData;
    };
    const extendedKeyUsage = new x509.ExtendedKeyUsageExtension(toX509Extension("2.5.29.37"));
    const keyUsage = new x509.KeyUsagesExtension(toX509Extension("2.5.29.15"));

    expect(extendedKeyUsage.usages).toEqual(expect.arrayContaining(["1.3.6.1.5.5.7.3.1", "1.3.6.1.5.5.7.3.2"]));
    expect(keyUsage.critical).toBe(true);
    expect(keyUsage.usages).toBe(x509.KeyUsageFlags.digitalSignature + x509.KeyUsageFlags.keyEncipherment);
  });

  test("adds nothing for a profile with no usages", () => {
    expect(buildProfileUsageExtensions({})).toEqual([]);
  });
});

describe("readSidSecurityExtension", () => {
  const SID = "S-1-5-21-1004336348-1177238915-682003330-1105";

  const certificateWith = async (extensions: x509.Extension[]) => {
    const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
    const keys = await crypto.subtle.generateKey(algorithm, false, ["sign", "verify"]);
    return x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "01",
      name: "CN=laptop01.corp.example.com",
      notBefore: new Date(),
      notAfter: new Date(Date.now() + 60_000),
      signingAlgorithm: algorithm,
      keys,
      extensions
    });
  };

  test("reads back the SID the issuer wrote", async () => {
    const extension = buildSidSecurityExtension(SID);
    const certificate = await certificateWith([
      new x509.Extension(extension.oid, extension.critical, new Uint8Array(extension.value))
    ]);

    expect(readSidSecurityExtension(certificate)).toBe(SID);
  });

  test.each([
    ["has no SID extension", []],
    [
      "has a malformed SID extension",
      [new x509.Extension("1.3.6.1.4.1.311.25.2", false, new asn1js.Utf8String({ value: SID }).toBER())]
    ]
  ])("returns undefined when the certificate %s", async (_name, extensions) => {
    expect(readSidSecurityExtension(await certificateWith(extensions))).toBeUndefined();
  });
});

describe("resolveRenewalPeriodSeconds", () => {
  const DAY = 86400;

  test.each([
    ["keeps a period within the range Windows supports", 42, 365 * DAY, 42 * DAY],
    ["keeps the period under 20% of the lifetime", 42, 30 * DAY, 6 * DAY - 1],
    ["keeps the period under 20% when the lifetime does not divide evenly", 42, 10 * DAY + 3, 2 * DAY],
    ["raises a period shorter than eight hours", 0, 365 * DAY, 8 * 60 * 60 + 1],
    ["prefers staying under 20% when the lifetime is too short for both bounds", 1, DAY, DAY * 0.2 - 1]
  ])("%s", (_name, renewBeforeDays, validitySeconds, expected) => {
    expect(resolveRenewalPeriodSeconds(renewBeforeDays, validitySeconds)).toBe(expected);
  });
});

describe("resolveTemplateSignatureAlgorithm", () => {
  test.each([
    [undefined, undefined, "sha256", CertSignatureAlgorithm.RSA_SHA256],
    [CertKeyAlgorithm.RSA_3072, CertSignatureAlgorithm.RSA_SHA384, "sha384", CertSignatureAlgorithm.RSA_SHA384],
    [CertKeyAlgorithm.ECDSA_P384, CertSignatureAlgorithm.ECDSA_SHA512, "sha512", CertSignatureAlgorithm.ECDSA_SHA512],
    [CertKeyAlgorithm.ECDSA_P256, undefined, "sha256", CertSignatureAlgorithm.ECDSA_SHA256]
  ])("asks Windows for the profile's hash (%s, %s)", (keyAlgorithm, signatureAlgorithm, hashName, expected) => {
    const result = resolveTemplateSignatureAlgorithm({ keyAlgorithm, signatureAlgorithm });

    expect(result.hash.name).toBe(hashName);
    expect(result.signatureAlgorithm).toBe(expected);
  });
});

describe("findTemplatePolicyProblem", () => {
  test("names the signature algorithm when the policy allows the key but not how Windows signs", () => {
    const problem = findTemplatePolicyProblem(
      { slug: "web-servers", defaults: { keyAlgorithm: CertKeyAlgorithm.RSA_2048 } },
      null,
      (request) => request.signatureAlgorithm !== CertSignatureAlgorithm.RSA_SHA256
    );

    expect(problem).toMatch(/no default signature algorithm, so Windows signs its requests with RSA-SHA256/);
  });

  test("checks the algorithm an AWS KMS elliptic curve CA signs with, not the one Windows uses", () => {
    const onlySha384 = (request: { signatureAlgorithm?: CertSignatureAlgorithm }) =>
      !request.signatureAlgorithm || request.signatureAlgorithm === CertSignatureAlgorithm.ECDSA_SHA384;
    const ecProfile = { slug: "web-servers", defaults: { keyAlgorithm: CertKeyAlgorithm.ECDSA_P256 } };

    expect(
      findTemplatePolicyProblem(
        ecProfile,
        { keyAlgorithm: CertKeyAlgorithm.ECDSA_P384, keySource: "aws-kms" },
        onlySha384
      )
    ).toBeNull();
    expect(
      findTemplatePolicyProblem(
        {
          slug: "web-servers",
          defaults: {
            keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
            signatureAlgorithm: CertSignatureAlgorithm.ECDSA_SHA384
          }
        },
        { keyAlgorithm: CertKeyAlgorithm.ECDSA_P256, keySource: "aws-kms" },
        onlySha384
      )
    ).toMatch(/are signed with ECDSA-SHA256, the only algorithm its certificate authority's AWS KMS key can sign with/);
    expect(
      findTemplatePolicyProblem(
        ecProfile,
        { keyAlgorithm: CertKeyAlgorithm.ECDSA_P384, keySource: "infisical" },
        onlySha384
      )
    ).toMatch(/no default signature algorithm, so Windows signs its requests with ECDSA-SHA256/);
    expect(
      findTemplatePolicyProblem(
        ecProfile,
        { keyAlgorithm: CertKeyAlgorithm.ECDSA_P256, keySource: "aws-kms" },
        onlySha384
      )
    ).toMatch(/the only algorithm its certificate authority's AWS KMS key can sign with/);
  });

  test("passes when the policy allows both", () => {
    expect(findTemplatePolicyProblem({ slug: "web-servers", defaults: null }, null, () => true)).toBeNull();
  });
});
