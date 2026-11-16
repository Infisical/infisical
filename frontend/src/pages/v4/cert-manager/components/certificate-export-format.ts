import type { TCertificateExportFormat } from "../../data/certificates/contract";

export const exportFormatLabel: Record<TCertificateExportFormat, string> = {
  pem: "Certificate (PEM)",
  chain: "Certificate and chain (PEM)",
  pkcs12: "PKCS#12 bundle"
};
