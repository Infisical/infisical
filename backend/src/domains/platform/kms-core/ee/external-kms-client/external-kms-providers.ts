import { AwsKmsProviderFactory } from "./aws-kms-client";
import { GcpKmsProviderFactory } from "./gcp-kms-client";

// The provider clients, replaceable so tests can stand in a fake provider.
export type TExternalKmsProviders = {
  aws: typeof AwsKmsProviderFactory;
  gcp: typeof GcpKmsProviderFactory;
};

export const defaultExternalKmsProviders = (): TExternalKmsProviders => ({
  aws: AwsKmsProviderFactory,
  gcp: GcpKmsProviderFactory
});
