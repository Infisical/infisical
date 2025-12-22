import { KmsProviders } from "@app/ee/services/external-kms/providers/model";

import { registerAwsKmsRouter } from "./aws-kms-router";
import { registerGcpKmsRouter } from "./gcp-kms-router";

export const EXTERNAL_KMS_REGISTER_ROUTER_MAP: Record<KmsProviders, (server: FastifyZodProvider) => Promise<void>> = {
  [KmsProviders.Aws]: registerAwsKmsRouter,
  [KmsProviders.Gcp]: registerGcpKmsRouter
};
