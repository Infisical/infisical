import { generatePkcs12FromCertificate } from "@app/services/certificate/certificate-fns";

export enum PkiSyncExportFormat {
  Pem = "pem",
  Pkcs12 = "pkcs12"
}

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
  // Required for PKCS#12.
  password?: string;
  // Friendly name / alias used inside a PKCS#12 keystore.
  alias: string;
  // PEM only: the extension for the certificate and chain files. Defaults to ".pem".
  pemCertificateExtension?: PemCertificateExtension;
  // PEM only: when true, the certificate file holds the leaf certificate followed by the chain (a
  // "full chain" file, as nginx expects) and no separate chain file is written. Defaults to false.
  combineCertificateChain?: boolean;
};

/**
 * Packages a certificate for delivery to a server. The extension is decided here from the format,
 * never from the caller's name schema (the schema only provides the base name):
 * - PEM      -> "<base>.<pem|crt>" (cert), "<base>.chain.<pem|crt>" (chain), "<base>.key" (key, when included)
 * - PEM (combined chain) -> "<base>.<pem|crt>" (leaf + chain), "<base>.key" (key, when included)
 * - PKCS#12  -> "<base>.pfx" (cert + chain + key, password-protected)
 *
 * The caller is responsible for deciding whether the private key is available and whether it is
 * required (see the destination factories, which fail the certificate when includePrivateKey is set
 * but the key cannot be exported). This helper assumes inputs are valid and only guards PKCS#12.
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
  combineCertificateChain
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
