import { TExternalKmsProviders } from "../../services/dependencies";
import { AwsKmsProviderFactory } from "./aws-kms-client";
import { GcpKmsProviderFactory } from "./gcp-kms-client";

export const defaultExternalKmsProviders = (): TExternalKmsProviders => ({
  aws: AwsKmsProviderFactory,
  gcp: GcpKmsProviderFactory
});
