import { ReactNode } from "react";

import { Detail, DetailGroupHeader, DetailLabel, DetailValue } from "@app/components/v3";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { PkiSync, TPkiSync } from "@app/hooks/api/pkiSyncs";

import {
  AwsCertificateManagerPkiSyncDestinationSection,
  AwsElasticLoadBalancerPkiSyncDestinationSection,
  AwsSecretsManagerPkiSyncDestinationSection,
  AzureKeyVaultPkiSyncDestinationSection,
  ChefPkiSyncDestinationSection,
  F5BigIpPkiSyncDestinationSection,
  KempLoadMasterPkiSyncDestinationSection,
  LinuxServerPkiSyncDestinationSection,
  NetScalerPkiSyncDestinationSection,
  NutanixPrismCentralPkiSyncDestinationSection,
  WindowsServerPkiSyncDestinationSection
} from "./PkiSyncDestinationSection/index";

type Props = {
  pkiSync: TPkiSync;
};

export const PkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const { destination } = pkiSync;

  const destinationDetails = PKI_SYNC_MAP[destination];

  let DestinationComponents: ReactNode;
  switch (destination) {
    case PkiSync.AwsCertificateManager:
      DestinationComponents = <AwsCertificateManagerPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.AwsElasticLoadBalancer:
      DestinationComponents = <AwsElasticLoadBalancerPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.AwsSecretsManager:
      DestinationComponents = <AwsSecretsManagerPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.AzureKeyVault:
      DestinationComponents = <AzureKeyVaultPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.Chef:
      DestinationComponents = <ChefPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.NetScaler:
      DestinationComponents = <NetScalerPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.F5BigIp:
      DestinationComponents = <F5BigIpPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.KempLoadMaster:
      DestinationComponents = <KempLoadMasterPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.LinuxServer:
      DestinationComponents = <LinuxServerPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.WindowsServer:
      DestinationComponents = <WindowsServerPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    case PkiSync.NutanixPrismCentral:
      DestinationComponents = <NutanixPrismCentralPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    default:
      DestinationComponents = null;
  }

  return (
    <>
      <DetailGroupHeader>Destination Configuration</DetailGroupHeader>
      <Detail>
        <DetailLabel>{`${destinationDetails.name} Connection`}</DetailLabel>
        <DetailValue>{pkiSync.appConnectionName || "Default Connection"}</DetailValue>
      </Detail>
      {DestinationComponents}
    </>
  );
};
