import { AppConnection } from "@app/hooks/api/appConnections";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

export const PKI_SYNC_MAP: Record<
  PkiSync,
  {
    name: string;
    image: string;
    category: string;
    description: string;
  }
> = {
  [PkiSync.AzureKeyVault]: {
    name: "Azure Key Vault",
    image: "Microsoft Azure.png",
    category: "Azure",
    description: "Sync certificates to Azure Key Vault."
  },
  [PkiSync.AwsCertificateManager]: {
    name: "AWS Certificate Manager",
    image: "Amazon Web Services.png",
    category: "AWS",
    description: "Sync certificates to AWS Certificate Manager (ACM)."
  },
  [PkiSync.AwsSecretsManager]: {
    name: "AWS Secrets Manager",
    image: "Amazon Web Services.png",
    category: "AWS",
    description: "Sync certificates to AWS Secrets Manager."
  },
  [PkiSync.AwsElasticLoadBalancer]: {
    name: "AWS Elastic Load Balancer",
    image: "Amazon Web Services.png",
    category: "AWS",
    description: "Bind certificates to AWS Elastic Load Balancer listeners."
  },
  [PkiSync.Chef]: {
    name: "Chef",
    image: "Chef.png",
    category: "Infrastructure",
    description: "Sync certificates to a Chef data bag."
  },
  [PkiSync.CloudflareCustomCertificate]: {
    name: "Cloudflare Custom SSL",
    image: "Cloudflare.png",
    category: "Networking",
    description: "Upload custom SSL certificates to Cloudflare."
  },
  [PkiSync.NetScaler]: {
    name: "NetScaler",
    image: "NetScaler.png",
    category: "Networking",
    description: "Sync certificates to Citrix NetScaler / ADC."
  },
  [PkiSync.F5BigIp]: {
    name: "F5 BIG-IP",
    image: "F5 BIG-IP.png",
    category: "Networking",
    description: "Sync certificates to F5 BIG-IP."
  },
  [PkiSync.KempLoadMaster]: {
    name: "Kemp LoadMaster",
    image: "Kemp LoadMaster.png",
    category: "Networking",
    description: "Sync certificates to Kemp LoadMaster."
  },
  [PkiSync.LinuxServer]: {
    name: "Linux Server",
    image: "SSH.png",
    category: "Infrastructure",
    description: "Push certificate files to a Linux server over SSH."
  },
  [PkiSync.WindowsServer]: {
    name: "Windows Server",
    image: "Windows.png",
    category: "Infrastructure",
    description: "Push certificate files to a Windows server over WinRM."
  },
  [PkiSync.NutanixPrismCentral]: {
    name: "Nutanix Prism Central",
    image: "Nutanix.png",
    category: "Infrastructure",
    description: "Sync certificates to Nutanix Prism Central."
  }
};

const CERTIFICATE_DISPLAY_NAME_MAX_LENGTH = 34;
const CERTIFICATE_DISPLAY_NAME_FALLBACK = "-";

export const getCertificateDisplayName = (cert: {
  altNames?: string | null;
  commonName?: string | null;
}) => {
  let originalDisplayName = CERTIFICATE_DISPLAY_NAME_FALLBACK;
  if (cert.altNames && cert.altNames.trim()) {
    originalDisplayName = cert.altNames.trim();
  } else if (cert.commonName && cert.commonName.trim()) {
    originalDisplayName = cert.commonName.trim();
  }

  const isTruncated = originalDisplayName.length > CERTIFICATE_DISPLAY_NAME_MAX_LENGTH;
  const displayName = isTruncated
    ? `${originalDisplayName.substring(0, CERTIFICATE_DISPLAY_NAME_MAX_LENGTH)}...`
    : originalDisplayName;

  return { originalDisplayName, displayName, isTruncated };
};

export const truncateCertificateSerialNumber = (serialNumber: string) =>
  serialNumber.length > 8
    ? `${serialNumber.slice(0, 4)}...${serialNumber.slice(-4)}`
    : serialNumber;

export const PKI_SYNC_CONNECTION_MAP: Record<PkiSync, AppConnection> = {
  [PkiSync.AzureKeyVault]: AppConnection.AzureKeyVault,
  [PkiSync.AwsCertificateManager]: AppConnection.AWS,
  [PkiSync.AwsSecretsManager]: AppConnection.AWS,
  [PkiSync.AwsElasticLoadBalancer]: AppConnection.AWS,
  [PkiSync.Chef]: AppConnection.Chef,
  [PkiSync.CloudflareCustomCertificate]: AppConnection.Cloudflare,
  [PkiSync.NetScaler]: AppConnection.NetScaler,
  [PkiSync.F5BigIp]: AppConnection.F5BigIp,
  [PkiSync.KempLoadMaster]: AppConnection.KempLoadMaster,
  [PkiSync.LinuxServer]: AppConnection.SSH,
  [PkiSync.WindowsServer]: AppConnection.WinRM,
  [PkiSync.NutanixPrismCentral]: AppConnection.NutanixPrismCentral
};
