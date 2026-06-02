import { BadRequestError } from "@app/lib/errors";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { CertSubjectAlternativeNameType } from "@app/services/certificate-common/certificate-constants";

const GODADDY_ALLOWED_KEY_ALGORITHMS = new Set<string>([
  CertKeyAlgorithm.RSA_2048,
  CertKeyAlgorithm.RSA_3072,
  CertKeyAlgorithm.RSA_4096
]);

export const validateGoDaddyIssuanceInputs = ({
  keyAlgorithm,
  altNames
}: {
  keyAlgorithm?: string | null;
  altNames?: { type: CertSubjectAlternativeNameType; value: string }[];
}) => {
  // GoDaddy's Certificates API only accepts RSA CSRs — ECDSA/PQC keys are rejected upstream
  // with a cryptic "This CSR was created with an invalid algorithm." Surface a clear error first.
  if (keyAlgorithm && !GODADDY_ALLOWED_KEY_ALGORITHMS.has(keyAlgorithm)) {
    throw new BadRequestError({
      message: `GoDaddy only supports RSA key algorithms (RSA_2048, RSA_3072, RSA_4096). Received "${keyAlgorithm}" — update the certificate policy to allow an RSA key.`
    });
  }

  // The GoDaddy DV products we support (single-domain, wildcard) cover a single DNS identity — they
  // accept neither additional SANs nor non-DNS SAN types (email/IP/URI), which GoDaddy would reject.
  if (altNames && altNames.length > 0) {
    const nonDnsSan = altNames.find((san) => san.type !== CertSubjectAlternativeNameType.DNS_NAME);
    if (nonDnsSan) {
      throw new BadRequestError({
        message: `GoDaddy only supports DNS-name SANs; received a ${nonDnsSan.type} SAN ("${nonDnsSan.value}"). Use a private CA for email/IP/URI identities.`
      });
    }
    throw new BadRequestError({
      message:
        "GoDaddy DV certificates are single-domain and don't support additional SANs. Put the domain in the Common Name, or use a multi-domain CA."
    });
  }
};
