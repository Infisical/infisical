import { CertKeySource } from "@app/services/signer/signer-enums";

import { TExternalCaKeySource } from "./ca-key-source-types";

export const isExternalCaKeySource = (keySource: string | null | undefined): keySource is TExternalCaKeySource =>
  Boolean(keySource) && keySource !== CertKeySource.Infisical;
