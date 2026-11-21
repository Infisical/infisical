import type { ReactNode } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Inline } from "@infisical/cipher/ui/layout";
import type { DataListItem } from "@infisical/cipher/ui/list";

import { getPaloAltoNetworksProfileLabel } from "@app/helpers/pkiSyncs";
import {
  PKI_SYNC_EXPORT_FORMAT_LABELS,
  PkiSync,
  PkiSyncExportFormat
} from "@app/hooks/api/pkiSyncs/enums";
import type { TPkiSync } from "@app/hooks/api/pkiSyncs/types";
import { F5BigIpProfileType } from "@app/hooks/api/pkiSyncs/types/f5-big-ip-sync";
import {
  GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION,
  GCP_CERTIFICATE_MANAGER_SCOPES
} from "@app/hooks/api/pkiSyncs/types/gcp-certificate-manager-sync";

import { Dash } from "../../access/org/detail-parts";
import { destinationNameOf } from "../components/pki-syncs/shared";

const F5_PROFILE_TYPE_LABELS: Record<F5BigIpProfileType, string> = {
  [F5BigIpProfileType.None]: "None",
  [F5BigIpProfileType.ClientSsl]: "Client SSL profile",
  [F5BigIpProfileType.ServerSsl]: "Server SSL profile"
};

const orDash = (value: ReactNode) =>
  value === undefined || value === null || value === "" ? <Dash /> : value;

const loadBalancerNameOf = (loadBalancerArn: string) => {
  const parts = loadBalancerArn.split("/");
  return parts.length >= 3 ? parts[2] : loadBalancerArn;
};

const hostOf = (config: { host?: string; port?: number | string }) =>
  config.host ? `${config.host}${config.port ? `:${config.port}` : ""}` : undefined;

const exportFormatOf = (format: PkiSyncExportFormat) =>
  PKI_SYNC_EXPORT_FORMAT_LABELS[format] ?? format;

const destinationRows = (pkiSync: TPkiSync): DataListItem[] => {
  switch (pkiSync.destination) {
    case PkiSync.AwsCertificateManager:
      return [["AWS region", orDash(pkiSync.destinationConfig?.region)]];
    case PkiSync.AwsElasticLoadBalancer: {
      const { region, loadBalancerArn, listeners = [] } = pkiSync.destinationConfig ?? {};
      return [
        ["AWS region", orDash(region)],
        ["Load balancer", loadBalancerArn ? loadBalancerNameOf(loadBalancerArn) : <Dash />],
        [
          "Listeners",
          listeners.length ? (
            <Inline gap={4} wrap>
              {listeners.map((listener) => (
                <Badge key={listener.listenerArn} tone="soft" mono>
                  {listener.protocol}:{listener.port}
                </Badge>
              ))}
            </Inline>
          ) : (
            <Dash />
          )
        ]
      ];
    }
    case PkiSync.AwsSecretsManager: {
      const { region, keyId } = pkiSync.destinationConfig;
      return [
        ["AWS region", region || "us-east-1"],
        ...(keyId ? [["KMS key", keyId] as DataListItem] : [])
      ];
    }
    case PkiSync.AzureKeyVault:
      return [["Key Vault URL", orDash(pkiSync.destinationConfig.vaultBaseUrl)]];
    case PkiSync.Chef:
      return [["Chef data bag name", orDash(pkiSync.destinationConfig?.dataBagName)]];
    case PkiSync.GcpCertificateManager: {
      const { gcpProjectId, location, scope, certificateMapBinding } = pkiSync.destinationConfig;
      const { labels } = pkiSync.syncOptions;
      return [
        ["GCP project", orDash(gcpProjectId)],
        [
          "Location",
          <Badge key="location" tone="soft">
            {location === GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION ? "Global" : location}
          </Badge>
        ],
        [
          "Scope",
          <Badge key="scope" tone="soft">
            {GCP_CERTIFICATE_MANAGER_SCOPES[scope]?.label ?? scope}
          </Badge>
        ],
        ...(certificateMapBinding
          ? [
              ["Certificate map", certificateMapBinding.certificateMap] as DataListItem,
              ...(certificateMapBinding.hostname
                ? [["Hostname", certificateMapBinding.hostname] as DataListItem]
                : [])
            ]
          : []),
        ...(labels?.length
          ? [
              [
                "Labels",
                <Inline key="labels" gap={4} wrap>
                  {labels.map(({ key, value }) => (
                    <Badge key={key} tone="outline" title={value ? `${key}: ${value}` : key}>
                      {value ? `${key}: ${value}` : key}
                    </Badge>
                  ))}
                </Inline>
              ] as DataListItem
            ]
          : [])
      ];
    }
    case PkiSync.NetScaler:
      return pkiSync.destinationConfig.vserverName
        ? [["SSL vServer name", pkiSync.destinationConfig.vserverName]]
        : [];
    case PkiSync.PaloAltoNetworks:
    case PkiSync.PaloAltoNetworksSslTlsProfile: {
      const { template, pushToDevices } = pkiSync.destinationConfig;
      const { sslTlsServiceProfileName, sslTlsServiceProfileVsys } =
        pkiSync.destination === PkiSync.PaloAltoNetworksSslTlsProfile
          ? pkiSync.destinationConfig
          : {};
      return [
        ["Device type", template ? "Panorama" : "Firewall"],
        ...(template
          ? [
              ["Template", template] as DataListItem,
              ["Push to devices", pushToDevices ? "Enabled" : "Disabled"] as DataListItem
            ]
          : []),
        ...(sslTlsServiceProfileName
          ? [
              [
                "SSL/TLS service profile",
                getPaloAltoNetworksProfileLabel({
                  name: sslTlsServiceProfileName,
                  vsys: sslTlsServiceProfileVsys
                })
              ] as DataListItem
            ]
          : [])
      ];
    }
    case PkiSync.F5BigIp: {
      const { partition, profileType, profileName, createProfileIfMissing, parentProfile } =
        pkiSync.destinationConfig;
      const resolvedProfileType = profileType ?? F5BigIpProfileType.None;
      const hasProfileBinding = resolvedProfileType !== F5BigIpProfileType.None;
      return [
        ["Partition", partition || "Common"],
        ["Profile binding", F5_PROFILE_TYPE_LABELS[resolvedProfileType]],
        ...(hasProfileBinding && profileName
          ? [
              [
                resolvedProfileType === F5BigIpProfileType.ServerSsl
                  ? "Server SSL profile name"
                  : "Client SSL profile name",
                profileName
              ] as DataListItem
            ]
          : []),
        ...(hasProfileBinding && createProfileIfMissing
          ? [["Create profile if missing", "Yes"] as DataListItem]
          : []),
        ...(hasProfileBinding && createProfileIfMissing && parentProfile
          ? [["Parent profile", parentProfile] as DataListItem]
          : [])
      ];
    }
    case PkiSync.KempLoadMaster:
      return pkiSync.destinationConfig.virtualServiceId
        ? [["Virtual service", pkiSync.destinationConfig.virtualServiceId]]
        : [];
    case PkiSync.Imperva: {
      const { siteId, siteName } = pkiSync.destinationConfig;
      return [["Website", siteName ? `${siteName} (${siteId})` : orDash(siteId)]];
    }
    case PkiSync.LinuxServer: {
      const host = hostOf(pkiSync.destinationConfig);
      return [
        ...(host ? [["Target host", host] as DataListItem] : []),
        ["Destination directory", orDash(pkiSync.destinationConfig.destinationPath)],
        [
          "Export format",
          exportFormatOf(pkiSync.syncOptions.exportFormat ?? PkiSyncExportFormat.Pem)
        ]
      ];
    }
    case PkiSync.WindowsServer: {
      const host = hostOf(pkiSync.destinationConfig);
      return [
        ...(host ? [["Target host", host] as DataListItem] : []),
        ...(pkiSync.destinationConfig.sslEnabled
          ? [["WinRM transport", "HTTPS"] as DataListItem]
          : []),
        ["Destination directory", orDash(pkiSync.destinationConfig.destinationPath)],
        [
          "Export format",
          exportFormatOf(pkiSync.syncOptions.exportFormat ?? PkiSyncExportFormat.Pkcs12)
        ]
      ];
    }
    case PkiSync.NutanixPrismCentral: {
      const { clusterName, clusterId } = pkiSync.destinationConfig;
      return [
        ["Cluster name", orDash(clusterName)],
        ["Cluster ID", orDash(clusterId)]
      ];
    }
    default:
      return [];
  }
};

export const usePkiSyncDestinationItems = (pkiSync: TPkiSync): DataListItem[] => [
  [
    `${destinationNameOf(pkiSync.destination)} connection`,
    pkiSync.appConnectionName || "Default connection"
  ],
  ...destinationRows(pkiSync)
];
