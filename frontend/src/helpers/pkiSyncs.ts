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
  },
  [PkiSync.CloudflareCustomCertificate]: {
    name: "Cloudflare Custom SSL",
    image: "Cloudflare.png"
  },
  [PkiSync.NetScaler]: {
    name: "NetScaler",
    image: "NetScaler.png"
  },
  [PkiSync.F5BigIp]: {
    name: "F5 BIG-IP",
    image: "F5 BIG-IP.png"
  },
  [PkiSync.LinuxServer]: {
    name: "Linux Server",
    image: "SSH.png"
  },
  [PkiSync.WindowsServer]: {
    name: "Windows Server",
    image: "Windows.png"
  },
  [PkiSync.NutanixPrismCentral]: {
    name: "Nutanix Prism Central",
    image: "Nutanix.png"
  }
};

export const PKI_SYNC_CONNECTION_MAP: Record<PkiSync, AppConnection> = {
  [PkiSync.AzureKeyVault]: AppConnection.AzureKeyVault,
  [PkiSync.AwsCertificateManager]: AppConnection.AWS,
  [PkiSync.AwsSecretsManager]: AppConnection.AWS,
  [PkiSync.AwsElasticLoadBalancer]: AppConnection.AWS,
  [PkiSync.Chef]: AppConnection.Chef,
  [PkiSync.CloudflareCustomCertificate]: AppConnection.Cloudflare,
  [PkiSync.NetScaler]: AppConnection.NetScaler,
  [PkiSync.F5BigIp]: AppConnection.F5BigIp,
  [PkiSync.LinuxServer]: AppConnection.SSH,
  [PkiSync.WindowsServer]: AppConnection.WinRM,
  [PkiSync.NutanixPrismCentral]: AppConnection.NutanixPrismCentral
};
