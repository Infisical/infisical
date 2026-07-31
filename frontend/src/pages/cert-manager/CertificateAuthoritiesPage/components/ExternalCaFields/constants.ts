export const REQUIRED_EAB_DIRECTORIES = [
  "https://acme.digicert.com/v2/acme/directory",
  "https://acme.zerossl.com/v2/DV90",
  "https://acme.ssl.com/sslcom-dv-rsa",
  "https://acme.ssl.com/sslcom-dv-ecc",
  "https://dv.acme-v02.api.pki.goog/directory",
  "https://acme.sectigo.com/v2/OV",
  "https://acme.sectigo.com/v2/EV",
  "https://acme.cisco.com/ACMEv2/directory"
];

// DigiCert product discriminators returned by the CertCentral products endpoint.
export const DigiCertProductType = {
  CodeSigning: "code_signing_certificate",
  Ssl: "ssl_certificate"
} as const;
