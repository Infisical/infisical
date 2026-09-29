import { generatePkcs12FromCertificate } from "@app/services/certificate/certificate-fns";
import {
  generateJksFromCertificate,
  generateJksTruststore,
  getJksTruststoreCertificates
} from "@app/services/certificate/certificate-jks-fns";

export enum PkiSyncExportFormat {
  Pem = "pem",
  Pkcs12 = "pkcs12",
  Jks = "jks"
}

export const isKeystoreExportFormat = (format: unknown): boolean =>
  format === PkiSyncExportFormat.Pkcs12 || format === PkiSyncExportFormat.Jks;

export const KEYSTORE_PASSWORD_REQUIRED_MESSAGE = "A password is required when the export format is PKCS#12 or JKS";

export const JKS_KEYSTORE_SUFFIX = ".jks";
export const JKS_TRUSTSTORE_SUFFIX = ".truststore.jks";

export enum PemCertificateExtension {
  Pem = "pem",
  Crt = "crt"
}

export type TExportedCertificateFile = {
  suffix: string;
  content: Buffer;
  isPrivateKey?: boolean;
};

export type TExportCertificateForSyncParams = {
  format: PkiSyncExportFormat;
  certificate: string;
  certificateChain?: string;
  privateKey?: string;
  includePrivateKey: boolean;
  // Required for PKCS#12 and JKS.
  password?: string;
  // Friendly name / alias used inside a PKCS#12 or JKS keystore.
  alias: string;
  includeTruststore?: boolean;
  fullCertificateChain?: string;
  caCertificate?: string;
  // PEM only: the extension for the certificate and chain files. Defaults to ".pem".
  pemCertificateExtension?: PemCertificateExtension;
  // PEM only: when true, the certificate file holds the leaf certificate followed by the chain (a
  // "full chain" file, as nginx expects) and no separate chain file is written. Defaults to false.
  combineCertificateChain?: boolean;
};

export type TExportedCertificateFileShape = {
  format: PkiSyncExportFormat;
  includePrivateKey: boolean;
  hasCertificateChain: boolean;
  hasPrivateKey: boolean;
  pemCertificateExtension?: PemCertificateExtension;
  combineCertificateChain?: boolean;
  includeTruststore?: boolean;
  hasTruststoreCertificates?: boolean;
};

export const getExportedCertificateFileSuffixes = ({
  format,
  includePrivateKey,
  hasCertificateChain,
  hasPrivateKey,
  pemCertificateExtension,
  combineCertificateChain,
  includeTruststore,
  hasTruststoreCertificates
}: TExportedCertificateFileShape): string[] => {
  if (format === PkiSyncExportFormat.Pkcs12) return [".pfx"];
  if (format === PkiSyncExportFormat.Jks) {
    return includeTruststore && hasTruststoreCertificates
      ? [JKS_KEYSTORE_SUFFIX, JKS_TRUSTSTORE_SUFFIX]
      : [JKS_KEYSTORE_SUFFIX];
  }

  const certExtension = pemCertificateExtension ?? PemCertificateExtension.Pem;
  const suffixes = [`.${certExtension}`];

  if (hasCertificateChain && !combineCertificateChain) {
    suffixes.push(`.chain.${certExtension}`);
  }
  if (includePrivateKey && hasPrivateKey) suffixes.push(".key");

  return suffixes;
};

/**
 * Packages a certificate for delivery to a server. The extension is decided here from the format,
 * never from the caller's name schema (the schema only provides the base name):
 * - PEM      -> "<base>.<pem|crt>" (cert), "<base>.chain.<pem|crt>" (chain), "<base>.key" (key, when included)
 * - PEM (combined chain) -> "<base>.<pem|crt>" (leaf + chain), "<base>.key" (key, when included)
 * - PKCS#12  -> "<base>.pfx" (cert + chain + key, password-protected)
 * - JKS      -> "<base>.jks" (key + cert + chain), plus "<base>.truststore.jks" when requested
 *
 * The caller is responsible for deciding whether the private key is available and whether it is
 * required (see the destination factories, which fail the certificate when includePrivateKey is set
 * but the key cannot be exported). This helper assumes inputs are valid and only guards the keystores.
 */
export const exportCertificateForSync = ({
  format,
  certificate,
  certificateChain,
  privateKey,
  includePrivateKey,
  password,
  alias,
  pemCertificateExtension,
  combineCertificateChain,
  includeTruststore,
  fullCertificateChain,
  caCertificate
}: TExportCertificateForSyncParams): Promise<TExportedCertificateFile[]> | TExportedCertificateFile[] => {
  if (format === PkiSyncExportFormat.Pkcs12) {
    return generatePkcs12FromCertificate({
      certificate,
      certificateChain: certificateChain ?? "",
      privateKey: privateKey ?? "",
      password: password ?? "",
      alias
    }).then((pfx) => [{ suffix: ".pfx", content: pfx, isPrivateKey: true }]);
  }

  if (format === PkiSyncExportFormat.Jks) {
    const files: TExportedCertificateFile[] = [
      {
        suffix: JKS_KEYSTORE_SUFFIX,
        content: generateJksFromCertificate({
          certificate,
          certificateChain,
          privateKey: privateKey ?? "",
          password: password ?? "",
          alias
        }),
        isPrivateKey: true
      }
    ];
    const trustedCertificates = includeTruststore
      ? getJksTruststoreCertificates({
          certificate,
          fullCertificateChain: fullCertificateChain ?? certificateChain,
          caCertificate
        })
      : [];
    if (trustedCertificates.length > 0) {
      files.push({
        suffix: JKS_TRUSTSTORE_SUFFIX,
        content: generateJksTruststore({ trustedCertificates, password: password ?? "", alias })
      });
    }
    return files;
  }

  const certExtension = pemCertificateExtension ?? PemCertificateExtension.Pem;
  const files: TExportedCertificateFile[] = [];

  if (combineCertificateChain && certificateChain) {
    // Full chain: leaf certificate followed by the chain, in one file, no separate chain file.
    const fullChain = `${certificate.trim()}\n${certificateChain.trim()}\n`;
    files.push({ suffix: `.${certExtension}`, content: Buffer.from(fullChain, "utf8") });
  } else {
    files.push({ suffix: `.${certExtension}`, content: Buffer.from(certificate, "utf8") });
    if (certificateChain) {
      files.push({ suffix: `.chain.${certExtension}`, content: Buffer.from(certificateChain, "utf8") });
    }
  }

  if (includePrivateKey && privateKey) {
    files.push({ suffix: ".key", content: Buffer.from(privateKey, "utf8"), isPrivateKey: true });
  }
  return files;
};
