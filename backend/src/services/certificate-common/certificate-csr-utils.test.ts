import { describe, expect, it } from "vitest";

import { extractCertificateRequestFromCSR } from "./certificate-csr-utils";

// the extraction every CSR-based enrollment shares; fixtures produced with openssl
const WINDOWS_ORDER_CSR = `-----BEGIN CERTIFICATE REQUEST-----
MIICmDCCAYACAQAwUzETMBEGCgmSJomT8ixkARkWA2NvbTEXMBUGCgmSJomT8ixk
ARkWB2V4YW1wbGUxFDASBgoJkiaJk/IsZAEZFgRjb3JwMQ0wCwYDVQQDDARob3N0
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA27qIeF4mNPLlFMpuJAMt
z2+MZHGo+w4NgYXnXcTVhJix+2s7qLZxVbBJfp/694VNJNQzfASRT0AnQQ1HpRev
0Ldr7XCTPnzbuiINTCWlq1RUfASpxd6gcAmss0EkkRy7hMlCa3dDaRDCtPuRFZ8n
wNl9f5iaXIDZcY9L6T1o59J5eWLL3dj2kfWfAFigOMRdPJmdAYQTJEP4bj8xPb6E
bZ1NWkh7wXRjVexF52IUPEHSyA1yMHFwSegrK+lOZiacNMtpe8AYptJssCsw8xan
nr95anhyTJLoZc8h8Pbw/Fzk1bN5JHww3T5uG62r+CtUlZiklE/Lru5GCuQyIu2Q
uwIDAQABoAAwDQYJKoZIhvcNAQELBQADggEBAAQxdSyqjq6xr53vy819C11+grDv
q2W66rzdbMm3rQSAKNW0M7S4ZncpSFOISc2P2SZnAjJVFFHHLJoV49/+Uzz01t7/
b86Ikjbp7jcfvMMvKT8aYyXH8CSbZP+tEJJ8o4W/bIzFT/4S32ynYNReXgYoGkVZ
4uQeAy6Z/ak6yPnas11I8w7F4pI3rxaJJ1DCKcMRhv4x35GCkQX7ub/mjV1ONYWa
bg47JC07W+V9iqHjq+38lmK4coo/ZM9DnorwfrvVPk/JrilL73LWuHn5lHg58OJy
Z3RtwGPNCCMhVa30GZ/UHa36gBQYbQCw9yBvegnkR/J/jlfPb9PswCIGTMw=
-----END CERTIFICATE REQUEST-----`;

const FORWARD_ORDER_CSR = `-----BEGIN CERTIFICATE REQUEST-----
MIICmDCCAYACAQAwUzENMAsGA1UEAwwEaG9zdDEUMBIGCgmSJomT8ixkARkWBGNv
cnAxFzAVBgoJkiaJk/IsZAEZFgdleGFtcGxlMRMwEQYKCZImiZPyLGQBGRYDY29t
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuqOmBclhKgEdXp0hP+CG
v5gm4ue/LiBV1E9y+0wiKjnJb9jDw82AtDJY/WB8RF6B5dbYgaWFgM7Num5bPAnd
LdDgDs9clkxGZItmQou0YhWBeT2/QXnyMMXGFvx1VJh4Ratdf1PgxWuMaLSEa3yG
OYBlUXRY2vPXSEf3N7+DOr5T8hr0vI3x4JCn/JFRyQ1o4XR88ZTsuGprH/b+N3R6
QnGmsrYFmIy6kOALTFgJm21YDJm3XdoZmuj9sWG3CakPAwzb7IwkoxVL4H3zLOAG
n7Vr038N8fME7sVscHJUAxDhOiEmUA8+nvrLWLj+9c0ArAAT/4DfzsT/Yf6hqoyu
ywIDAQABoAAwDQYJKoZIhvcNAQELBQADggEBAHL89trQCy2vIaqYEZ30v2SUfRD9
r/Z7MVcf3AKfHmi4/LBIk6aOlfYQRKDIBaxqyUPfY/AC1HAjYF5whB9FEt/EJUsX
+GDEVw4EuJYqASR7Sdc2MQqTzCRoXn9vh1wyH16U6iO5Q6KZohynoedz+ynW9XR/
NXPr3XM2OUVOuVsa9s/hJEETMmfiI6TQ7vSeOy7ta+EOxSiOJL/NI+nHnycdBM38
FqRNLb9xTs/WFPr5y4Rgmfap+kEGQCGZPwsBqFPvPG1oaT86D17IyfmcfaZc9Buc
5S9pX4iGtS2KOsLImPU34nrHl4b6/l5rFWPiyq231xTDxCoH927Ix0OgR9k=
-----END CERTIFICATE REQUEST-----`;

const DOMAIN_COMPONENTS_ONLY_CSR = `-----BEGIN CERTIFICATE REQUEST-----
MIICiTCCAXECAQAwRDETMBEGCgmSJomT8ixkARkWA2NvbTEXMBUGCgmSJomT8ixk
ARkWB2V4YW1wbGUxFDASBgoJkiaJk/IsZAEZFgRjb3JwMIIBIjANBgkqhkiG9w0B
AQEFAAOCAQ8AMIIBCgKCAQEApJ2kp0kx4XB8+/5HJC1SYbldCqAe5M47Z2GHLKid
YPBxoPMYGCTmL7mTFEZ5b+dRfgNcJd336yyGzCB0EYRNunukXfJvNY8/s1as0DYf
TnZGfsbr5XkpovtN/EWTHsTc/Um8JNeMkJeymDJDW/uFviDZMne7YRPx/bj3EzxF
WMrA8QVeK3NrPYMjAtapJM6IXbBB5tIyP7liYtgMxMe9rM/uNQFzH1cvS8sqdhXD
wcmZe6jYadmQY+aMRVCuyaM8jItCkT8GpTuM+bvgh/E3NWOfyEXgbtD9VTXLuYiX
M86ZgeZ80ZHmht2sGjDy221fpmiK2e0hPfmmHS0PUaSUWQIDAQABoAAwDQYJKoZI
hvcNAQELBQADggEBAFrNHDBiTqAmZeTfWtF6gN0Yy6kpsIQIA++pLv3fBsxbECQJ
KAz605vQEKeqP7/f6wYiwFnbYnAlZS/E0r1rb+1s/5N3Lqs/WVOMBA9JTyEJT6xA
370d04fmGnpScG+Ro5MmEUa2TNE3BVv+1hmNCz574W1Ok9dMvZO9fn1uHiJFTrMC
d76KC3CN3UaoReeBMLNYaoe5CafeycPS3Z72FIQ8HxExAe+M08DV6HF4maCvZYvy
OvXfnX8nBFHhxGb0qJemsAa/3jYEJG1IVmOiciYpW7ar5KtmudG1UFO8c46htmNC
zxS2IdrWzTRnCoHr1BpBqkyCXx15lSj4Fx2tRdo=
-----END CERTIFICATE REQUEST-----`;

const NO_DOMAIN_COMPONENT_CSR = `-----BEGIN CERTIFICATE REQUEST-----
MIICYzCCAUsCAQAwHjENMAsGA1UEAwwEaG9zdDENMAsGA1UECgwEQWNtZTCCASIw
DQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMI4drvs4ayH0WG78HIjZRu5J6dz
GEY7yp3yh90WqwQl3Nnfd9JEwh6tVjwqp4N2YR6VDlJbV4kMjzWXwgV3bBNEAP9X
GXdsZTMNz0ZwKd7i520VJAn1KMLj4m2jamVjQLz9hF/aQguhU+82dgQrpM++iAhd
j+/mjhZBwI9o8bcvxE7CKsYzwhGg8JVWLiNVtkFou2W/9aOL0eRW+riVFMUnYnwE
oda7x8kpnQtGr7d+zn0g+nQAUYrifFh1KoQMAbgfV3oktGuFPBS0u2iIvTDl0yi9
GertlttGZPVUKdcFOEHg1t+qqkhrFbl70x9MaCZbbjFkhOQMIM2RH4nx5DkCAwEA
AaAAMA0GCSqGSIb3DQEBCwUAA4IBAQAmMcVEk8nvN0m0eNB6RLLblednP44LYepA
/12bWYc7ydZEVD2WQNK7qy6iShrNA1O6SboGHooEV0F/0Zb+TXz8b0gsgRfP/xcp
J2rjExj38J9pd5nc10yvT8wGSHH/BAaOQ2AmHWF01dnUjCi/pmH5+VFaFZsapkrq
FKEYZ2X5isQ9x/hPWTivdEVzFHiUI0l/tzBpsQb2qE9CyRtCTB5Ir2FB+4dICwkr
dLRLy13y1JZ6RE0wCnUzoq/dJC/Rf8UgkiDFv9zHFD3RrH3GqaU0h53BKnjmqEqZ
T2d+vMwyzQKefaUBuj1xOtO2ffhc22BMmuuiqumz8hSojw5WU7Xn
-----END CERTIFICATE REQUEST-----`;

describe("extractCertificateRequestFromCSR domain components", () => {
  it("should read a chain encoded root first, as Windows, Active Directory and Intune send it", () => {
    expect(extractCertificateRequestFromCSR(WINDOWS_ORDER_CSR).domainComponents).toEqual(["corp", "example", "com"]);
  });

  it("should read a chain encoded after the common name, as older Infisical releases wrote it", () => {
    expect(extractCertificateRequestFromCSR(FORWARD_ORDER_CSR).domainComponents).toEqual(["corp", "example", "com"]);
  });

  it("should read a chain with no other subject attribute as encoded root first", () => {
    expect(extractCertificateRequestFromCSR(DOMAIN_COMPONENTS_ONLY_CSR).domainComponents).toEqual([
      "corp",
      "example",
      "com"
    ]);
  });

  it("should leave domain components unset when the CSR carries none", () => {
    const request = extractCertificateRequestFromCSR(NO_DOMAIN_COMPONENT_CSR);
    expect(request.domainComponents).toBeUndefined();
    expect(request.commonName).toBe("host");
    expect(request.organization).toBe("Acme");
  });
});
