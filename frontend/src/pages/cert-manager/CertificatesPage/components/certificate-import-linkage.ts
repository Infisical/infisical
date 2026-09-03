import { CaType } from "@app/hooks/api/ca/enums";
import { TCertificateExternalMetadata } from "@app/hooks/api/certificates/types";

export type CertificateImportReference = {
  label: string;
  placeholder: string;
  description: string;
  invalidMessage: string;
  hasLiveOptions?: boolean;
  optionsPlaceholder?: string;
  parse: (reference: string) => TCertificateExternalMetadata | null;
};

export const CERTIFICATE_IMPORT_LINKAGE: Partial<
  Record<CaType, { reference: CertificateImportReference | null }>
> = {
  [CaType.INTERNAL]: { reference: null },
  [CaType.DIGICERT]: {
    reference: {
      label: "Order ID",
      placeholder: "e.g. 2081714",
      description: "Found under Orders in DigiCert CertCentral.",
      invalidMessage: "Enter the DigiCert order ID for this certificate, for example 2081714",
      hasLiveOptions: true,
      optionsPlaceholder: "Select an order...",
      parse: (reference) => {
        const orderId = Number(reference);
        return Number.isInteger(orderId) && orderId > 0 ? { type: CaType.DIGICERT, orderId } : null;
      }
    }
  }
};

export const isCaTypeLinkable = (caType?: CaType | null) =>
  Boolean(caType && CERTIFICATE_IMPORT_LINKAGE[caType]);

export const getCertificateImportReference = (caType?: CaType | null) =>
  (caType && CERTIFICATE_IMPORT_LINKAGE[caType]?.reference) || null;
