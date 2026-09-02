import * as x509 from "@peculiar/x509";
import * as asn1js from "asn1js";
import { describe, expect, it } from "vitest";

import {
  CertExtensionCriticality,
  CertExtensionRuleKind,
  certificateExtensionOidSchema
} from "./certificate-constants";
import {
  appendCustomExtensions,
  CUSTOM_EXTENSION_PRESETS_BY_OID,
  describeCustomExtensionValue,
  encodeCustomExtensionValue,
  findCsrCustomExtensionMismatch,
  findUnsatisfiedCustomExtensionOids,
  isReservedExtensionOid,
  parseCustomExtensionsFromCertificate,
  resolveCustomExtensions,
  TCustomExtensionRule,
  toRequestCustomExtensions,
  TProfileCustomExtension,
  validateCustomExtensionValue
} from "./certificate-extension-fns";

const SID_OID = "1.3.6.1.4.1.311.25.2";
const TEMPLATE_NAME_OID = "1.3.6.1.4.1.311.20.2";
const TEMPLATE_INFO_OID = "1.3.6.1.4.1.311.21.7";
const CUSTOM_OID = "1.3.6.1.4.1.99999.7.1";
const OPAQUE_OID = "1.3.6.1.4.1.311.21.20";

const SID = "S-1-5-21-1004336348-1177238915-682003330-1103";

describe("certificateExtensionOidSchema", () => {
  it.each(["1.3.6.1.4.1.311.25.2", "2.999.1", "0.9.2342"])("accepts %s", (oid) => {
    expect(certificateExtensionOidSchema.safeParse(oid).success).toBe(true);
  });

  it.each([
    ["3.1.1", "first arc above 2"],
    ["1.", "trailing dot"],
    ["1.02.3", "leading zero"],
    ["1.40.2", "second arc above 39 under a first arc of 1"],
    ["", "empty"],
    [`1.3.${"9".repeat(70)}`, "over 64 characters"]
  ])("rejects %s (%s)", (oid) => {
    expect(certificateExtensionOidSchema.safeParse(oid).success).toBe(false);
  });
});

describe("isReservedExtensionOid", () => {
  it.each(["2.5.29.17", "2.5.29.15", "2.5.29.30", "1.3.6.1.5.5.7.1.1", "1.3.6.1.4.1.311.20.2.3"])(
    "reserves %s",
    (oid) => {
      expect(isReservedExtensionOid(oid)).toBe(true);
    }
  );

  it.each([SID_OID, TEMPLATE_NAME_OID, TEMPLATE_INFO_OID, CUSTOM_OID])("does not reserve %s", (oid) => {
    expect(isReservedExtensionOid(oid)).toBe(false);
  });
});

describe("preset encoders", () => {
  it("encodes the AD SID extension to the [MS-WCCE] byte layout", () => {
    const der = Buffer.from(encodeCustomExtensionValue(SID_OID, SID), "base64");

    expect(der.toString("hex")).toBe(
      "303fa03d060a2b060104018237190201a02f042d532d312d352d32312d313030343333363334382d313137373233383931352d3638323030333333302d31313033"
    );
  });

  it("encodes a certificate template name as a BMPString", () => {
    const der = Buffer.from(encodeCustomExtensionValue(TEMPLATE_NAME_OID, "Machine"), "base64");

    expect(der.toString("hex")).toBe("1e0e004d0061006300680069006e0065");
  });

  it("encodes certificate template information as a sequence", () => {
    const der = Buffer.from(encodeCustomExtensionValue(TEMPLATE_INFO_OID, "1.3.6.1.4.1.311.21.8.1.2:100.3"), "base64");

    expect(der.toString("hex")).toBe("3013060b2b06010401823715080102020164020103");
  });

  it.each([
    [SID_OID, SID],
    [TEMPLATE_NAME_OID, "Machine"],
    [TEMPLATE_INFO_OID, "1.3.6.1.4.1.311.21.8.1.2:100.3"],
    [TEMPLATE_INFO_OID, "1.3.6.1.4.1.311.21.8.1.2:100"]
  ])("round-trips %s", (oid, value) => {
    expect(describeCustomExtensionValue(oid, encodeCustomExtensionValue(oid, value))).toBe(value);
  });

  it("every preset declares a spec-correct criticality", () => {
    expect(Object.values(CUSTOM_EXTENSION_PRESETS_BY_OID).map((preset) => preset.critical)).toEqual([
      false,
      false,
      false
    ]);
  });
});

describe("describeCustomExtensionValue", () => {
  it("returns null rather than throwing on undecodable bytes", () => {
    expect(describeCustomExtensionValue(SID_OID, Buffer.from("not der at all").toString("base64"))).toBeNull();
  });

  it("returns null when the bytes decode but do not re-encode identically", () => {
    expect(describeCustomExtensionValue(SID_OID, Buffer.from("30030201ff", "hex").toString("base64"))).toBeNull();
  });

  it("round-trips the text an unknown OID was given", () => {
    expect(describeCustomExtensionValue(CUSTOM_OID, encodeCustomExtensionValue(CUSTOM_OID, "ops-prod"))).toBe(
      "ops-prod"
    );
  });
});

describe("resolveCustomExtensions", () => {
  const declareSid = { oid: SID_OID, value: SID };

  it("emits a declared value when the policy is unconstrained", () => {
    const { extensions, errors } = resolveCustomExtensions({ declarations: [declareSid], rules: undefined });

    expect(errors).toEqual([]);
    expect(extensions).toHaveLength(1);
    expect(extensions[0]).toMatchObject({
      oid: SID_OID,
      critical: false
    });
  });

  it("refuses a request extension whose value could not be decoded when the policy restricts OIDs", () => {
    const { errors } = resolveCustomExtensions({
      declarations: [],
      rules: [{ oid: SID_OID, rule: CertExtensionRuleKind.ALLOW, value: "*" }],
      requestExtensions: [{ oid: OPAQUE_OID, critical: false }]
    });

    expect(errors).toEqual([`Custom extension '${OPAQUE_OID}' is not allowed by this policy.`]);
  });

  it("lets an undecodable request extension through when the policy restricts nothing", () => {
    const { extensions, errors } = resolveCustomExtensions({
      declarations: [],
      rules: null,
      requestExtensions: [{ oid: OPAQUE_OID, critical: false }]
    });

    expect(errors).toEqual([]);
    expect(extensions).toEqual([]);
  });

  it("treats a null rule list as unconstrained, matching an unset jsonb column", () => {
    const { errors } = resolveCustomExtensions({ declarations: [declareSid], rules: null });

    expect(errors).toEqual([]);
  });

  it.each([
    ["a profile default", { declarations: [declareSid] }],
    ["a request", { declarations: [], requestExtensions: [{ oid: SID_OID, value: SID }] }]
  ])("denies %s when the rule list is empty", (_label, input) => {
    const { extensions, errors } = resolveCustomExtensions({ ...input, rules: [] });

    expect(extensions).toEqual([]);
    expect(errors).toEqual([`Custom extension '${SID_OID}' is not allowed by this policy.`]);
  });

  it("denies an OID that no rule mentions", () => {
    const { errors } = resolveCustomExtensions({
      declarations: [declareSid],
      rules: [{ oid: TEMPLATE_NAME_OID, rule: CertExtensionRuleKind.ALLOW, value: "*" }]
    });

    expect(errors).toEqual([`Custom extension '${SID_OID}' is not allowed by this policy.`]);
  });

  it("lets a request value override the declared default", () => {
    const override = "S-1-5-21-1004336348-1177238915-682003330-9999";
    const { extensions, errors } = resolveCustomExtensions({
      declarations: [declareSid],
      rules: [{ oid: SID_OID, rule: CertExtensionRuleKind.ALLOW, value: "*" }],
      requestExtensions: [{ oid: SID_OID, value: override }]
    });

    expect(errors).toEqual([]);
    expect(describeCustomExtensionValue(SID_OID, extensions[0].value)).toBe(override);
  });

  it("emits nothing when neither the profile nor the request supplies a value", () => {
    const { extensions, errors } = resolveCustomExtensions({
      declarations: [{ oid: SID_OID }],
      rules: [{ oid: SID_OID, rule: CertExtensionRuleKind.ALLOW, value: "*" }]
    });

    expect(extensions).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("rejects a request SID from a different AD domain, which is the case this model exists for", () => {
    const { errors } = resolveCustomExtensions({
      declarations: [{ oid: SID_OID }],
      rules: [
        { oid: SID_OID, rule: CertExtensionRuleKind.REQUIRE, value: "S-1-5-21-1004336348-1177238915-682003330-*" }
      ],
      requestExtensions: [{ oid: SID_OID, value: "S-1-5-21-999-888-777-1103" }]
    });

    expect(errors[0]).toContain("does not match the value required by this policy");
  });

  it("accepts a request SID inside the allowed AD domain", () => {
    const { extensions, errors } = resolveCustomExtensions({
      declarations: [{ oid: SID_OID }],
      rules: [
        { oid: SID_OID, rule: CertExtensionRuleKind.REQUIRE, value: "S-1-5-21-1004336348-1177238915-682003330-*" }
      ],
      requestExtensions: [{ oid: SID_OID, value: SID }]
    });

    expect(errors).toEqual([]);
    expect(extensions).toHaveLength(1);
  });

  it("honours denied patterns", () => {
    const { errors } = resolveCustomExtensions({
      declarations: [{ oid: SID_OID }],
      rules: [{ oid: SID_OID, rule: CertExtensionRuleKind.DENY, value: "S-1-5-21-*-500" }],
      requestExtensions: [{ oid: SID_OID, value: "S-1-5-21-1004336348-1177238915-682003330-500" }]
    });

    expect(errors[0]).toContain("is denied by this policy");
  });

  it("reports a required rule that nothing satisfies, and respects skipRequired", () => {
    const rules = [{ oid: SID_OID, rule: CertExtensionRuleKind.REQUIRE, value: "S-1-5-21-*" }];

    expect(resolveCustomExtensions({ declarations: [], rules }).errors).toHaveLength(1);
    expect(resolveCustomExtensions({ declarations: [], rules, skipRequired: true }).errors).toEqual([]);
  });

  it("emits a request extension the profile never declared when the policy is unrestricted", () => {
    const { extensions, errors } = resolveCustomExtensions({
      declarations: [],
      rules: undefined,
      requestExtensions: [{ oid: CUSTOM_OID, value: "ops-prod" }]
    });

    expect(errors).toEqual([]);
    expect(extensions).toEqual([
      {
        oid: CUSTOM_OID,
        critical: false,
        value: encodeCustomExtensionValue(CUSTOM_OID, "ops-prod"),
        displayValue: "ops-prod"
      }
    ]);
  });

  it("refuses a request extension the policy does not list, declared or not", () => {
    const { extensions, errors } = resolveCustomExtensions({
      declarations: [],
      rules: [{ oid: SID_OID, rule: CertExtensionRuleKind.ALLOW, value: "*" }],
      requestExtensions: [{ oid: CUSTOM_OID, value: "BQA=" }]
    });

    expect(extensions).toEqual([]);
    expect(errors[0]).toContain("is not allowed by this policy");
  });

  it("refuses a reserved OID a request tries to smuggle past an unrestricted policy", () => {
    const { errors } = resolveCustomExtensions({
      declarations: [],
      rules: undefined,
      requestExtensions: [{ oid: "2.5.29.17", value: "BQA=" }]
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("2.5.29.17");
  });

  it("lets the request set criticality when the policy leaves it undefined", () => {
    const value = Buffer.from("0500", "hex").toString("base64");
    const { extensions } = resolveCustomExtensions({
      declarations: [{ oid: CUSTOM_OID, value, critical: false }],
      rules: [{ oid: CUSTOM_OID, rule: CertExtensionRuleKind.ALLOW, value: "*" }],
      requestExtensions: [{ oid: CUSTOM_OID, critical: true }]
    });

    expect(extensions[0]).toMatchObject({ critical: true });
  });

  it("rejects a request criticality that contradicts a pinned policy", () => {
    const value = Buffer.from("0500", "hex").toString("base64");
    const { errors } = resolveCustomExtensions({
      declarations: [{ oid: CUSTOM_OID, value }],
      rules: [
        { oid: CUSTOM_OID, rule: CertExtensionRuleKind.ALLOW, value: "*", critical: CertExtensionCriticality.CRITICAL }
      ],
      requestExtensions: [{ oid: CUSTOM_OID, critical: false }]
    });

    expect(errors).toEqual([
      `Custom extension '${CUSTOM_OID}' must be emitted as critical by this policy, so its criticality cannot be set.`
    ]);
  });

  it("keeps a preset's criticality when the request does not contest it", () => {
    const { extensions } = resolveCustomExtensions({
      declarations: [declareSid],
      rules: [{ oid: SID_OID, rule: CertExtensionRuleKind.ALLOW, value: "*" }],
      requestExtensions: [{ oid: SID_OID }]
    });

    expect(extensions[0]).toMatchObject({ critical: false });
  });

  it("rejects a request that contests a preset's criticality", () => {
    const { extensions, errors } = resolveCustomExtensions({
      declarations: [declareSid],
      rules: [{ oid: SID_OID, rule: CertExtensionRuleKind.ALLOW, value: "*" }],
      requestExtensions: [{ oid: SID_OID, critical: true }]
    });

    expect(extensions).toHaveLength(0);
    expect(errors[0]).toContain("always emitted as non-critical");
  });

  it("denies a value the policy denies", () => {
    const { extensions, errors } = resolveCustomExtensions({
      declarations: [{ oid: CUSTOM_OID, value: "ops-prod" }],
      rules: [{ oid: CUSTOM_OID, rule: CertExtensionRuleKind.DENY, value: "ops-prod" }]
    });

    expect(extensions).toHaveLength(0);
    expect(errors[0]).toContain("is denied by this policy");
  });

  it.each([
    ["Machine", 1, 0],
    ["MACHINE", 0, 1]
  ])("matching %s against an allowed pattern of Machine", (requested, emitted, failures) => {
    const { extensions, errors } = resolveCustomExtensions({
      declarations: [{ oid: TEMPLATE_NAME_OID }],
      rules: [{ oid: TEMPLATE_NAME_OID, rule: CertExtensionRuleKind.ALLOW, value: "Machine" }],
      requestExtensions: [{ oid: TEMPLATE_NAME_OID, value: requested }]
    });

    expect(extensions).toHaveLength(emitted);
    expect(errors).toHaveLength(failures);
  });

  it("rejects a template name that is empty or outside the basic multilingual plane", () => {
    expect(resolveCustomExtensions({ declarations: [{ oid: TEMPLATE_NAME_OID, value: "" }] }).errors[0]).toContain(
      "Enter a certificate template name"
    );
    expect(
      resolveCustomExtensions({ declarations: [{ oid: TEMPLATE_NAME_OID, value: "Ma\u{1F600}ne" }] }).errors[0]
    ).toContain("basic multilingual plane");
  });

  it("carries every stored extension forward for a renewal, as the subject alternative names are", () => {
    const stored = [
      { oid: CUSTOM_OID, critical: false, value: encodeCustomExtensionValue(CUSTOM_OID, "ops-prod") },
      { oid: SID_OID, critical: false, value: encodeCustomExtensionValue(SID_OID, SID) }
    ];

    expect(toRequestCustomExtensions(stored).map((entry) => entry.oid)).toEqual([CUSTOM_OID, SID_OID]);
  });

  it("refuses to reissue an extension whose stored value cannot be read back", () => {
    const stored = [{ oid: SID_OID, critical: false, value: Buffer.from([0x05, 0x00]).toString("base64") }];

    expect(() => toRequestCustomExtensions(stored)).toThrow(/cannot be read back into a value/);
  });

  it("keeps the profile default and the request's own OID side by side", () => {
    const { extensions, errors } = resolveCustomExtensions({
      declarations: [declareSid],
      rules: null,
      requestExtensions: [{ oid: CUSTOM_OID, value: "BQA=" }]
    });

    expect(errors).toEqual([]);
    expect(extensions.map((entry) => entry.oid)).toEqual([SID_OID, CUSTOM_OID]);
  });

  it("orders output by OID so identical requests produce identical certificates", () => {
    const value = Buffer.from("0500", "hex").toString("base64");
    const { extensions } = resolveCustomExtensions({
      declarations: [
        { oid: TEMPLATE_NAME_OID, value: "Machine" },
        { oid: CUSTOM_OID, value },
        { oid: SID_OID, value: SID }
      ],
      rules: undefined
    });

    expect(extensions.map((extension) => extension.oid)).toEqual([TEMPLATE_NAME_OID, SID_OID, CUSTOM_OID]);
  });
});

describe("resolveCustomExtensions on the profile-save path", () => {
  const save = (declarations: TProfileCustomExtension[], rules?: TCustomExtensionRule[]) =>
    resolveCustomExtensions({ declarations, rules, skipRequired: true }).errors;

  it("rejects a declared value the policy forbids", () => {
    const errors = save(
      [{ oid: TEMPLATE_NAME_OID, value: "User" }],
      [{ oid: TEMPLATE_NAME_OID, rule: CertExtensionRuleKind.ALLOW, value: "Machine" }]
    );

    expect(errors[0]).toContain("is not allowed by this policy");
  });

  it("rejects a criticality that disagrees with a preset", () => {
    expect(save([{ oid: SID_OID, value: SID, critical: true }])[0]).toContain("always emitted as non-critical");
  });

  it("rejects a criticality that disagrees with the policy even with no value", () => {
    const errors = save(
      [{ oid: CUSTOM_OID, critical: false }],
      [{ oid: CUSTOM_OID, rule: CertExtensionRuleKind.ALLOW, value: "*", critical: CertExtensionCriticality.CRITICAL }]
    );

    expect(errors[0]).toContain("must be emitted as critical");
  });

  it("does not ask the profile to satisfy a required rule", () => {
    expect(save([], [{ oid: CUSTOM_OID, rule: CertExtensionRuleKind.REQUIRE, value: "BQA=" }])).toHaveLength(0);
  });
});

describe("appendCustomExtensions", () => {
  it("appends resolved extensions", () => {
    const extensions: x509.Extension[] = [];
    appendCustomExtensions(extensions, [
      { oid: SID_OID, critical: false, value: encodeCustomExtensionValue(SID_OID, SID) }
    ]);

    expect(extensions).toHaveLength(1);
    expect(extensions[0].type).toBe(SID_OID);
  });

  it("throws when the OID collides with an extension already on the certificate", () => {
    const extensions: x509.Extension[] = [new x509.BasicConstraintsExtension(false)];

    expect(() => appendCustomExtensions(extensions, [{ oid: "2.5.29.19", critical: false, value: "MAA=" }])).toThrow(
      /collides with an extension this certificate authority manages/
    );
  });
});

describe("parseCustomExtensionsFromCertificate", () => {
  it("returns an empty list for bytes that are not a certificate", () => {
    expect(parseCustomExtensionsFromCertificate(Buffer.from("not a certificate"))).toEqual([]);
  });
});

describe("findCsrCustomExtensionMismatch", () => {
  const CSR_OID = "1.3.6.1.4.1.77777.99";
  const der = Buffer.from(new asn1js.Utf8String({ value: "v1" }).toBER(false));
  const value = der.toString("base64");

  const csrWith = async (extensions: x509.Extension[]) => {
    const keys = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    return x509.Pkcs10CertificateRequestGenerator.create({
      name: "CN=mismatch-test",
      keys,
      signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      extensions
    });
  };

  it("accepts a request carrying the resolved value and criticality", async () => {
    const csr = await csrWith([new x509.Extension(CSR_OID, false, der)]);

    expect(findCsrCustomExtensionMismatch(csr, [{ oid: CSR_OID, value, critical: false }])).toBeNull();
  });

  it("reports an extension the request omits", async () => {
    const csr = await csrWith([]);

    expect(findCsrCustomExtensionMismatch(csr, [{ oid: CSR_OID, value, critical: false }])).toEqual({
      oid: CSR_OID,
      reason: "missing"
    });
  });

  it("reports a request whose value differs from the resolved one", async () => {
    const other = Buffer.from(new asn1js.Utf8String({ value: "v2" }).toBER(false));
    const csr = await csrWith([new x509.Extension(CSR_OID, false, other)]);

    expect(findCsrCustomExtensionMismatch(csr, [{ oid: CSR_OID, value, critical: false }])).toEqual({
      oid: CSR_OID,
      reason: "value"
    });
  });

  it("reports a request whose criticality contradicts the resolved one, since the CA gets it unchanged", async () => {
    const csr = await csrWith([new x509.Extension(CSR_OID, false, der)]);

    expect(findCsrCustomExtensionMismatch(csr, [{ oid: CSR_OID, value, critical: true }])).toEqual({
      oid: CSR_OID,
      reason: "criticality"
    });
  });

  it("accepts anything when the policy resolved no extensions", async () => {
    const csr = await csrWith([new x509.Extension(CSR_OID, true, der)]);

    expect(findCsrCustomExtensionMismatch(csr, [])).toBeNull();
    expect(findCsrCustomExtensionMismatch(csr, undefined)).toBeNull();
  });
});

describe("findUnsatisfiedCustomExtensionOids", () => {
  const certificateWith = async (oids: string[]) => {
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "01",
      name: "CN=drop-test",
      notBefore: new Date("2026-01-01"),
      notAfter: new Date("2027-01-01"),
      keys,
      signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
      extensions: oids.map((oid) => new x509.Extension(oid, false, Buffer.from("BQA=", "base64")))
    });
    return Buffer.from(cert.rawData);
  };

  const resolved = (oids: string[]) =>
    oids.map((oid) => ({
      oid,
      value: "BQA=",
      critical: false
    }));

  it("names the declared OIDs the issuer left off the certificate", async () => {
    const der = await certificateWith([CUSTOM_OID]);
    expect(findUnsatisfiedCustomExtensionOids(der, resolved([CUSTOM_OID, SID_OID]))).toEqual([SID_OID]);
  });

  it("returns nothing when every declared OID is present", async () => {
    const der = await certificateWith([CUSTOM_OID, SID_OID]);
    expect(findUnsatisfiedCustomExtensionOids(der, resolved([CUSTOM_OID, SID_OID]))).toEqual([]);
  });

  it("returns nothing when the profile declared none, even for an unreadable certificate", () => {
    expect(findUnsatisfiedCustomExtensionOids(Buffer.from("not a certificate"), [])).toEqual([]);
    expect(findUnsatisfiedCustomExtensionOids(Buffer.from("not a certificate"), undefined)).toEqual([]);
  });

  it("names an OID the issuer replaced the value of", async () => {
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "01",
      name: "CN=drop-test",
      notBefore: new Date("2026-01-01"),
      notAfter: new Date("2027-01-01"),
      keys,
      signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
      extensions: [new x509.Extension(CUSTOM_OID, false, Buffer.from("BQE=", "base64"))]
    });
    expect(findUnsatisfiedCustomExtensionOids(Buffer.from(cert.rawData), resolved([CUSTOM_OID]))).toEqual([CUSTOM_OID]);
  });

  it("names an OID the issuer emitted with the wrong criticality", async () => {
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "01",
      name: "CN=drop-test",
      notBefore: new Date("2026-01-01"),
      notAfter: new Date("2027-01-01"),
      keys,
      signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
      extensions: [new x509.Extension(CUSTOM_OID, true, Buffer.from("BQA=", "base64"))]
    });
    expect(findUnsatisfiedCustomExtensionOids(Buffer.from(cert.rawData), resolved([CUSTOM_OID]))).toEqual([CUSTOM_OID]);
  });

  it("reports every declared OID when the certificate cannot be parsed at all", async () => {
    expect(findUnsatisfiedCustomExtensionOids(Buffer.from("not a certificate"), resolved([CUSTOM_OID]))).toEqual([
      CUSTOM_OID
    ]);
  });
});

describe("preset registry", () => {
  it("round-trips every preset through encode and describe", () => {
    const samples: Record<string, string> = {
      [SID_OID]: SID,
      [TEMPLATE_NAME_OID]: "Machine",
      [TEMPLATE_INFO_OID]: "1.3.6.1.4.1.311.21.8.1.2:100.3"
    };

    Object.keys(CUSTOM_EXTENSION_PRESETS_BY_OID).forEach((oid) => {
      const sample = samples[oid];
      expect(sample, `add a sample value for ${oid}`).toBeDefined();
      expect(validateCustomExtensionValue(oid, sample)).toBeNull();
      expect(describeCustomExtensionValue(oid, encodeCustomExtensionValue(oid, sample))).toBe(sample);
    });
  });
});
