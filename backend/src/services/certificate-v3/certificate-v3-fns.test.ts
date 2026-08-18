import { describe, expect, it } from "vitest";

import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType
} from "../certificate-common/certificate-constants";
import { extractCertificateRequestFromCSR } from "../certificate-common/certificate-csr-utils";
import { TCertificateProfileDefaults } from "../certificate-profile/certificate-profile-types";
import { applyProfileDefaults } from "./certificate-v3-fns";

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
