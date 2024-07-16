export type Kms = {
  id: string;
  description: string;
  orgId: string;
  slug: string;
  external: {
    id: string;
    status: string;
    statusDetails: string;
    provider: string;
    providerInput: Record<string, any>;
  };
};

export type KmsListEntry = {
  id: string;
  description: string;
  isDisabled: boolean;
  createdAt: string;
  updatedAt: string;
  slug: string;
  externalKms: {
    provider: string;
    status: string;
    statusDetails: string;
  };
};

export enum ExternalKmsProvider {
  AWS = "aws"
}
