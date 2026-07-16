import { BadRequestError } from "@app/lib/errors";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { CertSubjectAlternativeNameType } from "@app/services/certificate-common/certificate-constants";

const GODADDY_ALLOWED_KEY_ALGORITHMS = new Set<string>([
  CertKeyAlgorithm.RSA_2048,
  CertKeyAlgorithm.RSA_3072,
  CertKeyAlgorithm.RSA_4096
]);

// GoDaddy DV products cover the common name plus its `www.` host — GoDaddy adds the www SAN to the
// issued certificate automatically — so both are permitted. Any other domain is out of scope.
export const isGoDaddyCoveredSan = (value: string, commonName?: string | null): boolean => {
  const san = value.trim().toLowerCase();
  const cn = (commonName ?? "").trim().toLowerCase();
  if (!cn || !san) return false;
  if (san === cn) return true;
  // GoDaddy pairs a bare CN with its `www.` host and a `www.` CN with its bare host. Gate each
  // direction so a `www.` CN can't also match `www.www.<cn>`.
  return cn.startsWith("www.") ? cn === `www.${san}` : san === `www.${cn}`;
};

export const validateGoDaddyIssuanceInputs = ({
  keyAlgorithm,
  altNames,
  commonName
}: {
  keyAlgorithm?: string | null;
  altNames?: { type: CertSubjectAlternativeNameType; value: string }[];
  commonName?: string | null;
}) => {
  // GoDaddy's Certificates API only accepts RSA CSRs — ECDSA/PQC keys are rejected upstream
  // with a cryptic "This CSR was created with an invalid algorithm." Surface a clear error first.
  if (keyAlgorithm && !GODADDY_ALLOWED_KEY_ALGORITHMS.has(keyAlgorithm)) {
    throw new BadRequestError({
      message: `GoDaddy only supports RSA key algorithms (RSA_2048, RSA_3072, RSA_4096). Received "${keyAlgorithm}" — update the certificate policy to allow an RSA key.`
    });
  }

  // The GoDaddy DV SSL product we support is single-domain: it accepts only DNS-name identities and
  // covers the common name plus its `www.` host. Reject non-DNS SAN types and any other domain.
  if (altNames && altNames.length > 0) {
    const nonDnsSan = altNames.find((san) => san.type !== CertSubjectAlternativeNameType.DNS_NAME);
    if (nonDnsSan) {
      throw new BadRequestError({
        message: `GoDaddy only supports DNS-name SANs; received a ${nonDnsSan.type} SAN ("${nonDnsSan.value}"). Use a private CA for email/IP/URI identities.`
      });
    }
    const extraSan = altNames.find((san) => !isGoDaddyCoveredSan(san.value, commonName));
    if (extraSan) {
      throw new BadRequestError({
        message: `GoDaddy DV certificates cover only the common name and its www subdomain; additional domain "${extraSan.value}" is not supported. Use a multi-domain CA.`
      });
    }
  }
};
