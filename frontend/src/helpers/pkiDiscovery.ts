import { PkiDiscoveryType, WindowsCertificateStore } from "@app/hooks/api/pkiDiscovery/types";

export const PKI_DISCOVERY_TYPE_MAP: Record<
  PkiDiscoveryType,
  { name: string; category: string; description: string; image?: string }
> = {
  [PkiDiscoveryType.Network]: {
    name: "Network",
    category: "Network",
    description: "Scan domains and IP ranges for certificates served on TLS ports."
  },
  [PkiDiscoveryType.LinuxServer]: {
    name: "Linux Server",
    category: "Infrastructure",
    description: "Log in over SSH and read the certificate files on a Linux server.",
    image: "SSH.png"
  },
  [PkiDiscoveryType.WindowsServer]: {
    name: "Windows Server",
    category: "Infrastructure",
    description: "Connect over WinRM and read the certificates in the Windows certificate store.",
    image: "Windows.png"
  }
};

export const DEFAULT_WINDOWS_CERTIFICATE_STORES = [
  WindowsCertificateStore.Personal,
  WindowsCertificateStore.WebHosting
];

export const DEFAULT_LINUX_SEARCH_FOLDERS = [
  "/etc/ssl",
  "/etc/pki",
  "/etc/nginx",
  "/etc/httpd",
  "/etc/letsencrypt",
  "/opt"
];

export const DEFAULT_MAX_FOLDER_DEPTH = 8;
export const MAX_FOLDER_DEPTH = 20;
export const DEFAULT_MAX_FILE_SIZE_KB = 512;
export const MAX_FILE_SIZE_KB = 10240;

export const getDiscoveryDocsUrl = (type: PkiDiscoveryType) =>
  `https://infisical.com/docs/documentation/platform/pki/discovery/${type}`;
