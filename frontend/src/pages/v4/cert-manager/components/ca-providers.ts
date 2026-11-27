import { EXTERNAL_CA_TYPE_NAME_MAP } from "@app/hooks/api/ca/constants";
import { CaType } from "@app/hooks/api/ca/enums";
import { CertKeySource, certKeySourceLabels } from "@app/hooks/api/signers/types";

import type { Provider } from "../../components/provider-label";

const EXTERNAL_CA_IMAGES: Partial<Record<string, string>> = {
  [CaType.ADCS]: "Windows.png",
  [CaType.AZURE_AD_CS]: "Microsoft Azure.png",
  [CaType.AWS_PCA]: "Amazon Web Services.png",
  [CaType.AWS_ACM_PUBLIC_CA]: "Amazon Web Services.png",
  [CaType.DIGICERT]: "DigiCert.png",
  [CaType.VENAFI_TPP]: "Venafi.png",
  [CaType.GODADDY]: "GoDaddy.png"
};

export const externalCaProvider = (type: string): Provider => ({
  name: EXTERNAL_CA_TYPE_NAME_MAP[type] ?? type,
  image: EXTERNAL_CA_IMAGES[type]
});

const KEY_SOURCE_IMAGES: Partial<Record<CertKeySource, string>> = {
  [CertKeySource.Infisical]: "Infisical.png",
  [CertKeySource.AwsKms]: "Amazon Web Services.png"
};

export const keySourceProvider = (source: CertKeySource): Provider => ({
  name: certKeySourceLabels[source] ?? source,
  image: KEY_SOURCE_IMAGES[source]
});
