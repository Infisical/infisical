import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

import { registerAcmeCertificateAuthorityRouter } from "./acme-certificate-authority-router";
import { registerAzureAdCsCertificateAuthorityRouter } from "./azure-ad-cs-certificate-authority-router";
import { registerInternalCertificateAuthorityRouter } from "./internal-certificate-authority-router";

export * from "./internal-certificate-authority-router";

export const CERTIFICATE_AUTHORITY_REGISTER_ROUTER_MAP: Record<CaType, (server: FastifyZodProvider) => Promise<void>> =
  {
    [CaType.INTERNAL]: registerInternalCertificateAuthorityRouter,
    [CaType.ACME]: registerAcmeCertificateAuthorityRouter,
    [CaType.AZURE_AD_CS]: registerAzureAdCsCertificateAuthorityRouter
  };
