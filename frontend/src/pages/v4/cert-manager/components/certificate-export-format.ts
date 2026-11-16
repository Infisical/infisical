import type { TCertificate } from "@app/hooks/api/certificates/types";

import type { TCertificateExportFormat } from "../../data/certificates/contract";

export const exportFormatLabel: Record<TCertificateExportFormat, string> = {
  pem: "Certificate (PEM)",
  chain: "Certificate and chain (PEM)",
  pkcs12: "PKCS#12 bundle"
};

export const pkcs12Block = (cert: TCertificate) =>
  cert.hasPrivateKey === false ? "No private key is stored for this certificate" : undefined;
