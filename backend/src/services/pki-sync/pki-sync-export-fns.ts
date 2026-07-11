import { generatePkcs12FromCertificate } from "@app/services/certificate/certificate-fns";

export enum PkiSyncExportFormat {
  Pem = "pem",
  Pkcs12 = "pkcs12"
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
};

/**
 * Packages a certificate for delivery to a server. The extension is decided here from the format,
 * never from the caller's name schema (the schema only provides the base name):
 * - PEM      -> "<base>.pem" (cert), "<base>.chain.pem" (chain), "<base>.key" (key, when included)
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
  alias
}: TExportCertificateForSyncParams): Promise<TExportedCertificateFile[]> | TExportedCertificateFile[] => {
  if (format === PkiSyncExportFormat.Pkcs12) {
    return generatePkcs12FromCertificate({
      certificate,
      certificateChain: certificateChain ?? "",
      privateKey: privateKey ?? "",
      password: password ?? "",
      alias
    }).then((pfx) => [{ suffix: ".pfx", content: pfx }]);
  }

  const files: TExportedCertificateFile[] = [{ suffix: ".pem", content: Buffer.from(certificate, "utf8") }];
  if (certificateChain) {
    files.push({ suffix: ".chain.pem", content: Buffer.from(certificateChain, "utf8") });
  }
  if (includePrivateKey && privateKey) {
    files.push({ suffix: ".key", content: Buffer.from(privateKey, "utf8"), isPrivateKey: true });
  }
  return files;
};
