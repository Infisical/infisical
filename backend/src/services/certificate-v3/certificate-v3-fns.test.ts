import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, it } from "vitest";

import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType
} from "../certificate-common/certificate-constants";
import { extractCertificateRequestFromCSR } from "../certificate-common/certificate-csr-utils";
import { RequestReference } from "../certificate-policy/certificate-policy-fns";
import { EnrollmentType, TCertificateProfileDefaults } from "../certificate-profile/certificate-profile-types";
import {
  applyCommonNameDefaultSan,
  applyIssuerNameOverride,
  applyProfileDefaults,
  getCommonNameCopySubjectAltNames
} from "./certificate-v3-fns";

const BARE_CSR = `-----BEGIN CERTIFICATE REQUEST-----
MIICjjCCAXYCAQAwGzEZMBcGA1UEAwwQc2hvcC5leGFtcGxlLmNvbTCCASIwDQYJ
KoZIhvcNAQEBBQADggEPADCCAQoCggEBAOVJz54yKwVJUNUxxj3zYEO+KO86+DCB
0oUgIZE57FBAhadTkXjmorF2VMtdAhMo2whNBY1JxSwJsaXTkYKAV0wkryFoG0x3
9qElqH7+5ckPjltZqLKeQoE8v6ziTmi/wzYZJJ3hAlzP2UNWo5SzdjSUYTNDln+Z
NJh6GIpQfebYL5YF9errqmr6eRNQcQJVKq5awKSlnb0AzXkDXKsXgpLkDa83obSW
mPPQlYMbwq/kDY2373rVDFsIqt+K0yYbxsxZuNttibF3MS4GlVvcwL7uLqxrMeiy
9dqKypXFXF+R0LLo6BpGeyLqhVQDQ9BdP2LFmTSBoIw80gCi2VN4U30CAwEAAaAu
MCwGCSqGSIb3DQEJDjEfMB0wGwYDVR0RBBQwEoIQc2hvcC5leGFtcGxlLmNvbTAN
BgkqhkiG9w0BAQsFAAOCAQEAj/NR+XynMXEl6/Hmm8KLh1K1mtQXzLdNT5Xb6DKF
HR0HlkT+nNfrXbECGuu0ZieEla/b9DUzavm0MMSizEdyKfqfIZ6CrBl3JI5EVmSr
1ipzQ0eEZpOZm9W8NqCr1dizjL+kx7LfvF//ginhPi8Z0DR0SEmcHQLHAOjEAicB
K7ZGYcMkNXRQQNAUvxCmPAWKc/hU0FBEZCn+mriYXMwGDisnYPMUf57dRD60aZ/l
teiHSBQxLjT2dAkV6JFsed1JZXWLHN4FoBAEPljijBDl0ROJM7Lfr6NcNBcpI5I0
ER5rq/0lkFde5xjkJFX9i6sVEksCRgegDVjbCZfQ+XL+Mw==
-----END CERTIFICATE REQUEST-----`;

const EXPLICIT_USAGES_CSR = `-----BEGIN CERTIFICATE REQUEST-----
MIICsDCCAZgCAQAwGzEZMBcGA1UEAwwQc2hvcC5leGFtcGxlLmNvbTCCASIwDQYJ
KoZIhvcNAQEBBQADggEPADCCAQoCggEBAOVJz54yKwVJUNUxxj3zYEO+KO86+DCB
0oUgIZE57FBAhadTkXjmorF2VMtdAhMo2whNBY1JxSwJsaXTkYKAV0wkryFoG0x3
9qElqH7+5ckPjltZqLKeQoE8v6ziTmi/wzYZJJ3hAlzP2UNWo5SzdjSUYTNDln+Z
NJh6GIpQfebYL5YF9errqmr6eRNQcQJVKq5awKSlnb0AzXkDXKsXgpLkDa83obSW
mPPQlYMbwq/kDY2373rVDFsIqt+K0yYbxsxZuNttibF3MS4GlVvcwL7uLqxrMeiy
9dqKypXFXF+R0LLo6BpGeyLqhVQDQ9BdP2LFmTSBoIw80gCi2VN4U30CAwEAAaBQ
ME4GCSqGSIb3DQEJDjFBMD8wGwYDVR0RBBQwEoIQc2hvcC5leGFtcGxlLmNvbTAL
BgNVHQ8EBAMCB4AwEwYDVR0lBAwwCgYIKwYBBQUHAwIwDQYJKoZIhvcNAQELBQAD
ggEBAENb4tSn3V7wrKUE03GqsA7q+fuo/D5tILWH2XlIe/DTrGsfuOqVekaZqrEP
MSDV9YtoChFpSLmMTpRC4JqQZLS4NdIKslnnTuC+lXQar9XhdBHTheeVtmebWkdM
Uwhhv3feUvOVxwLAl3ZcLZM4AZDUg5BoimToQ4kgLKQziHFKwpml/Cm79Q28GEA7
gUEpLkSpljXWRTi2ymCyinvvMi2X2wHddispmWjD2kmWNGGua3LofP29jA6RwvxJ
MtQJELQt8DQ2kkn5GbsqOEB38/kZP90zBFPVbNvIUyXF6QT7OXwlCTfvO8sDUik8
hTUY65lDcE3m2QwdUxzdT4OBtyA=
-----END CERTIFICATE REQUEST-----`;

const EMPTY_SUBJECT_CSR = `-----BEGIN CERTIFICATE REQUEST-----
MIICczCCAVsCAQAwADCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAOVJ
z54yKwVJUNUxxj3zYEO+KO86+DCB0oUgIZE57FBAhadTkXjmorF2VMtdAhMo2whN
BY1JxSwJsaXTkYKAV0wkryFoG0x39qElqH7+5ckPjltZqLKeQoE8v6ziTmi/wzYZ
JJ3hAlzP2UNWo5SzdjSUYTNDln+ZNJh6GIpQfebYL5YF9errqmr6eRNQcQJVKq5a
wKSlnb0AzXkDXKsXgpLkDa83obSWmPPQlYMbwq/kDY2373rVDFsIqt+K0yYbxsxZ
uNttibF3MS4GlVvcwL7uLqxrMeiy9dqKypXFXF+R0LLo6BpGeyLqhVQDQ9BdP2LF
mTSBoIw80gCi2VN4U30CAwEAAaAuMCwGCSqGSIb3DQEJDjEfMB0wGwYDVR0RBBQw
EoIQc2hvcC5leGFtcGxlLmNvbTANBgkqhkiG9w0BAQsFAAOCAQEAC9fMGiUKYDQz
AVfFcmhoS8OoHdvVRhncnUN30vG3kRpvMm5+4Ey8WUIhZI39Mqnf6eN0SdRZ+12x
i8vqE5VvmCKWiVmsfOVL8N4MsJf1xEEFv7+lBvJCtd/mT3pRARC5nTls8itkxZyQ
M6exBqS30veJ+1alEVRLvy0Cyc3pOMXsFP2RekPOKx0ZfohmaAFdtGfBW0OqqXq2
fljz2ay2efgR+aI5ynisMlCfrev/sZgJwPFyhjyookDTVTaI2L16OL7uUKYCANn0
CP3TUvonGhGkLZsMUGaQaWu9N0oaLbdhttDycyaG3lfba3xdfL/vouoC0CTwlMAZ
8Gn5fDcpjA==
-----END CERTIFICATE REQUEST-----`;

const FULL_SUBJECT_CSR = `-----BEGIN CERTIFICATE REQUEST-----
MIICwTCCAakCAQAwfDEZMBcGA1UEAwwQZnVsbC5leGFtcGxlLmNvbTESMBAGA1UE
CgwJRnVsbCBDb3JwMREwDwYDVQQLDAhQbGF0Zm9ybTELMAkGA1UEBhMCVVMxEzAR
BgNVBAgMCkNhbGlmb3JuaWExFjAUBgNVBAcMDVNhbiBGcmFuY2lzY28wggEiMA0G
CSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC9BgEbpkoYkvBmRy+xyW19HtTWrbST
5Ol2LC4HF35nBr3pFhwr9+Xd7UeGJQpRr4b3hc/VpLfPq5V4gciz9lvP+O02Fljn
oAQgAyZaqoygADP/qwyGRzNsPW/sG2Mf1GWsRs4dGW8Yl7LTJ9Hs20RnCx/LWrLE
SzuOfi3UiIg+HbgASi+7T8DBp7y0Qy8cPqQbBHi4qTbQpwLonPHOA3OK+O7l/vp6
mFNvFLqVjSRKZY6E5A1laRLIhRMwFeJEjvmWmTgObJj++1pBoE8VJSQCUu5ujcme
wO68a1ljm0Wvw0zGPKsXB9a8oU2kVvaCeCVSJf7DlCZorl8NKJN674aPAgMBAAGg
ADANBgkqhkiG9w0BAQsFAAOCAQEAKhdZAPm5CwpCy3Jh7ASOcTKc+ukvtvR5/VIr
xG9VFGUMIq8PdWgfFAo/K8sONfzOcVFZnal26yE3im+wXuymMwCChgUkSXcx25ns
bzZxTO/O/4XbVNSQSagv+NOc8qYlTv0jbUtCCdbYTMCYoELYnTpInFW29eTkrR1i
cjSLzQcD1OyZ4yowgnnQYx0KZm8CKxmDCsu/+vY6AmfuLJluuXBvXzZuax/RNe6/
Pzl7ofVUGbGcn5nvIBcCtbf/0ZGXsPKxDsuBlzs76gZBc4VYc3l7qhDmz3k74T07
oNhXP6h9e3jYLWU+USpa+j8DgWDbwI7OK9CNYYHB4XLuoR2rNg==
-----END CERTIFICATE REQUEST-----`;

const TLS_DEFAULTS: TCertificateProfileDefaults = {
  keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
  extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH]
};

const forCsr = (csr: string, defaults: TCertificateProfileDefaults | null) =>
  applyProfileDefaults(extractCertificateRequestFromCSR(csr), defaults);

describe("applyProfileDefaults", () => {
  it("fills in key usages the CSR omits, so a required-usage policy is satisfied", () => {
    const request = forCsr(BARE_CSR, TLS_DEFAULTS);

    expect(request.keyUsages).toEqual([CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT]);
    expect(request.extendedKeyUsages).toEqual([CertExtendedKeyUsageType.SERVER_AUTH]);
  });

  it("leaves usages unset when the profile has no defaults", () => {
    const request = forCsr(BARE_CSR, null);

    expect(request.keyUsages).toBeUndefined();
    expect(request.extendedKeyUsages).toBeUndefined();
  });

  it("keeps what the CSR asked for instead of the defaults, so a denied usage still reaches the policy", () => {
    const request = forCsr(EXPLICIT_USAGES_CSR, TLS_DEFAULTS);

    expect(request.keyUsages).toEqual([CertKeyUsageType.DIGITAL_SIGNATURE]);
    expect(request.extendedKeyUsages).toEqual([CertExtendedKeyUsageType.CLIENT_AUTH]);
  });

  it("does not touch the subject alternative names the CSR carries", () => {
    const request = forCsr(BARE_CSR, {
      ...TLS_DEFAULTS,
      subjectAltNames: [{ type: CertSubjectAlternativeNameType.DNS_NAME, value: "other.example.com" }]
    });

    expect(request.subjectAlternativeNames).toEqual([
      { type: CertSubjectAlternativeNameType.DNS_NAME, value: "shop.example.com" }
    ]);
  });

  it("keeps the CSR's own common name over the profile default", () => {
    const request = forCsr(BARE_CSR, { ...TLS_DEFAULTS, commonName: "fallback.local" });

    expect(request.commonName).toBe("shop.example.com");
  });

  it("falls back to the profile common name when the CSR subject is empty", () => {
    const request = forCsr(EMPTY_SUBJECT_CSR, {
      ...TLS_DEFAULTS,
      commonName: "fallback.local"
    });

    expect(request.commonName).toBe("fallback.local");
  });

  it("carries every subject attribute the CSR names through to the persisted request", () => {
    expect(forCsr(FULL_SUBJECT_CSR, null)).toMatchObject({
      commonName: "full.example.com",
      organization: "Full Corp",
      organizationalUnit: "Platform",
      country: "US",
      state: "California",
      locality: "San Francisco"
    });
  });

  it("lets a profile default fill a subject attribute the CSR leaves out", () => {
    const request = forCsr(EMPTY_SUBJECT_CSR, {
      ...TLS_DEFAULTS,
      organization: "Default Org",
      country: "US"
    });

    expect(request.organization).toBe("Default Org");
    expect(request.country).toBe("US");
  });

  it("never lets a profile default overwrite a subject attribute the CSR carries", () => {
    const fromCsr = forCsr(FULL_SUBJECT_CSR, null);
    const withDefaults = forCsr(FULL_SUBJECT_CSR, {
      ...TLS_DEFAULTS,
      commonName: "default.example.com",
      organization: "Default Org",
      organizationalUnit: "Default OU",
      country: "ZZ",
      state: "Default State",
      locality: "Default City"
    });

    for (const field of ["commonName", "organization", "organizationalUnit", "country", "state", "locality"] as const) {
      if (fromCsr[field] !== undefined) expect(withDefaults[field]).toBe(fromCsr[field]);
    }
  });

  it("fills usages while leaving CSR-derived algorithms untouched", () => {
    const request = applyProfileDefaults(
      {
        ...extractCertificateRequestFromCSR(BARE_CSR),
        keyAlgorithm: "RSA_2048",
        signatureAlgorithm: "RSA-SHA256",
        validity: { ttl: "47d" }
      },
      {
        ...TLS_DEFAULTS,
        keyAlgorithm: "ECDSA_P256" as TCertificateProfileDefaults["keyAlgorithm"],
        signatureAlgorithm: "ECDSA-SHA256" as TCertificateProfileDefaults["signatureAlgorithm"]
      }
    );

    expect(request.keyUsages).toEqual([CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT]);
    expect(request.extendedKeyUsages).toEqual([CertExtendedKeyUsageType.SERVER_AUTH]);
    expect(request.keyAlgorithm).toBe("RSA_2048");
    expect(request.signatureAlgorithm).toBe("RSA-SHA256");
    expect(request.validity).toEqual({ ttl: "47d" });
  });

  it("never copies the common name reference itself into the request as a SAN", () => {
    const request = applyProfileDefaults(
      { commonName: "app.example.com", altNames: [] as { type: string; value: string }[] },
      { subjectAltNames: [{ type: CertSubjectAlternativeNameType.DNS_NAME, value: RequestReference.CommonName }] }
    );

    expect(request.altNames).toEqual([]);
  });

  it("keeps the resolved validity and SANs when no defaults exist", () => {
    const request = applyProfileDefaults(
      { ...extractCertificateRequestFromCSR(BARE_CSR), validity: { ttl: "47d" } },
      null
    );

    expect(request.validity).toEqual({ ttl: "47d" });
    expect(request.subjectAlternativeNames).toEqual([
      { type: CertSubjectAlternativeNameType.DNS_NAME, value: "shop.example.com" }
    ]);
  });
});

describe("applyIssuerNameOverride", () => {
  const issuerNameOverride = {
    commonName: "laptop01.corp.example.com",
    altNames: [{ type: CertSubjectAlternativeNameType.DNS_NAME, value: "laptop01.corp.example.com" }]
  };
  const csrRequest = {
    commonName: "anything",
    keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
    extendedKeyUsages: [CertExtendedKeyUsageType.CODE_SIGNING]
  };

  it("takes key usages from the profile when it sets them, so the computer cannot pick its own", () => {
    const profileDefaults = {
      keyUsages: [CertKeyUsageType.KEY_ENCIPHERMENT],
      extendedKeyUsages: [CertExtendedKeyUsageType.CLIENT_AUTH]
    };

    const result = applyProfileDefaults(
      applyIssuerNameOverride(csrRequest, issuerNameOverride, profileDefaults),
      profileDefaults
    );

    expect(result.keyUsages).toEqual([CertKeyUsageType.KEY_ENCIPHERMENT]);
    expect(result.extendedKeyUsages).toEqual([CertExtendedKeyUsageType.CLIENT_AUTH]);
    expect(result.commonName).toBe("laptop01.corp.example.com");
  });

  it("never takes the subject from the request, so a domain computer cannot pick its own organization or unit", () => {
    const result = applyProfileDefaults(
      applyIssuerNameOverride(
        { ...csrRequest, organization: "Attacker Inc", organizationalUnit: "Domain Admins", country: "XX" },
        issuerNameOverride,
        {}
      ),
      { organization: "Example Corp" }
    );

    expect(result.commonName).toBe("laptop01.corp.example.com");
    expect(result.organization).toBe("Example Corp");
    expect(result.organizationalUnit).toBeUndefined();
    expect(result.country).toBeUndefined();
  });

  it("keeps the request's key usages when the profile sets none", () => {
    const result = applyProfileDefaults(applyIssuerNameOverride(csrRequest, issuerNameOverride, {}), {});

    expect(result.keyUsages).toEqual([CertKeyUsageType.DIGITAL_SIGNATURE]);
    expect(result.extendedKeyUsages).toEqual([CertExtendedKeyUsageType.CODE_SIGNING]);
  });
});

describe("applyCommonNameDefaultSan", () => {
  const dns = (value: string) => ({ type: CertSubjectAlternativeNameType.DNS_NAME, value });
  const commonNameDefault = (...types: CertSubjectAlternativeNameType[]): TCertificateProfileDefaults => ({
    subjectAltNames: types.map((type) => ({ type, value: RequestReference.CommonName }))
  });
  const apply = (overrides: Partial<Parameters<typeof applyCommonNameDefaultSan>[0]>) =>
    applyCommonNameDefaultSan({
      defaults: commonNameDefault(CertSubjectAlternativeNameType.DNS_NAME),
      enrollmentType: EnrollmentType.API,
      commonName: "app.example.com",
      ...overrides
    }).subjectAlternativeNames;

  it("adds nothing when the request lists its own SANs, like every other default SAN", () => {
    expect(apply({ subjectAlternativeNames: [dns("other.example.com")] })).toEqual([dns("other.example.com")]);
  });

  it("adds the common name after the profile's other default SANs when the request listed none", () => {
    expect(
      apply({ subjectAlternativeNames: [dns("static.example.com")], requestedSubjectAlternativeNames: [] })
    ).toEqual([dns("static.example.com"), dns("app.example.com")]);
  });

  it("does not add the common name again when a default SAN already equals it in another case", () => {
    expect(apply({ subjectAlternativeNames: [dns("APP.example.com")], requestedSubjectAlternativeNames: [] })).toEqual([
      dns("APP.example.com")
    ]);
  });

  it("adds nothing when the common name is not a valid value for the default's SAN type", () => {
    expect(apply({ commonName: "John Smith" })).toBeUndefined();
    expect(apply({ commonName: "café.example.com" })).toBeUndefined();
  });

  it("accepts the DNS names a hand-typed DNS SAN accepts: underscores and a trailing dot", () => {
    expect(apply({ commonName: "host_a.corp.local" })).toEqual([dns("host_a.corp.local")]);
    expect(apply({ commonName: "app.example.com." })).toEqual([dns("app.example.com.")]);
    expect(apply({ commonName: "host.123" })).toEqual([dns("host.123")]);
  });

  it("treats a trailing dot as the same DNS name, so the common name is not added twice", () => {
    expect(
      apply({
        commonName: "app.example.com.",
        subjectAlternativeNames: [dns("app.example.com")],
        requestedSubjectAlternativeNames: []
      })
    ).toEqual([dns("app.example.com")]);
  });

  it("adds nothing when the CA signs the CSR as sent", () => {
    expect(apply({ isCsrSignedAsSent: true })).toBeUndefined();
  });

  it("on ACME copies only the CSR's own common name and only into DNS or IP SANs", () => {
    const acme = { enrollmentType: EnrollmentType.ACME, commonName: "profile-default.example.com" };

    expect(apply({ ...acme, csrCommonName: "app.example.com" })).toEqual([dns("app.example.com")]);
    expect(apply(acme)).toBeUndefined();
    expect(
      apply({
        ...acme,
        defaults: commonNameDefault(CertSubjectAlternativeNameType.EMAIL),
        csrCommonName: "user@example.com"
      })
    ).toBeUndefined();
  });
});

describe("getCommonNameCopySubjectAltNames", () => {
  beforeAll(() => {
    x509.cryptoProvider.set(globalThis.crypto);
  });

  const csrPem = async (name: string, sans: x509.JsonGeneralName[] = []) => {
    const keys = await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify"
    ]);
    const csr = await x509.Pkcs10CertificateRequestGenerator.create({
      name,
      keys,
      signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
      extensions: sans.length ? [new x509.SubjectAlternativeNameExtension(sans)] : []
    });
    return csr.toString("pem");
  };
  const sanNames = (extension: x509.Extension | null) =>
    extension ? new x509.SubjectAlternativeNameExtension(extension.rawData).names.toJSON() : null;

  it("rebuilds the common name copies on the issued certificate, whatever the profile defaults are now", async () => {
    const issued = new x509.SubjectAlternativeNameExtension([{ type: "dns", value: "device.example.com" }]);

    const copies = getCommonNameCopySubjectAltNames({
      issuedSubjectAltNames: issued,
      enrollmentType: EnrollmentType.EST,
      csr: await csrPem("CN=device.example.com")
    });

    expect(sanNames(copies)).toEqual([{ type: "dns", value: "device.example.com" }]);
  });

  it("returns nothing when the CSR lists its own SANs", async () => {
    const issued = new x509.SubjectAlternativeNameExtension([{ type: "dns", value: "device.example.com" }]);

    const copies = getCommonNameCopySubjectAltNames({
      issuedSubjectAltNames: issued,
      enrollmentType: EnrollmentType.EST,
      csr: await csrPem("CN=device.example.com", [{ type: "dns", value: "other.example.com" }])
    });

    expect(copies).toBeNull();
  });
});
