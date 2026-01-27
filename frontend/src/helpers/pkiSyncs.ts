import { AppConnection } from "@app/hooks/api/appConnections";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

export const PKI_SYNC_MAP: Record<
  PkiSync,
  {
    name: string;
    image: string;
  }
> = {
  [PkiSync.AzureKeyVault]: {
    name: "Azure Key Vault",
    image: "Microsoft Azure.png"
  },
  [PkiSync.AwsCertificateManager]: {
    name: "AWS Certificate Manager",
    image: "Amazon Web Services.png"
  },
  [PkiSync.AwsSecretsManager]: {
    name: "AWS Secrets Manager",
    image: "Amazon Web Services.png"
  },
  [PkiSync.AwsElasticLoadBalancer]: {
    name: "AWS Elastic Load Balancer",
    image: "Amazon Web Services.png"
  },
  [PkiSync.Chef]: {
    name: "Chef",
    image: "Chef.png"
  }
};

export const PKI_SYNC_CONNECTION_MAP: Record<PkiSync, AppConnection> = {
  [PkiSync.AzureKeyVault]: AppConnection.AzureKeyVault,
  [PkiSync.AwsCertificateManager]: AppConnection.AWS,
  [PkiSync.AwsSecretsManager]: AppConnection.AWS,
  [PkiSync.AwsElasticLoadBalancer]: AppConnection.AWS,
  [PkiSync.Chef]: AppConnection.Chef
};
