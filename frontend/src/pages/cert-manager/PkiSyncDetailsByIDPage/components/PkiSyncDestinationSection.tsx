/* eslint-disable jsx-a11y/label-has-associated-control */
import { ReactNode } from "react";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton } from "@app/components/v2";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { PkiSync, TPkiSync, usePkiSyncPermissions } from "@app/hooks/api/pkiSyncs";

import {
  AwsCertificateManagerPkiSyncDestinationSection,
  AwsElasticLoadBalancerPkiSyncDestinationSection,
  AwsSecretsManagerPkiSyncDestinationSection,
  AzureKeyVaultPkiSyncDestinationSection,
  ChefPkiSyncDestinationSection,
  F5BigIpPkiSyncDestinationSection,
  NetScalerPkiSyncDestinationSection,
  NutanixPrismCentralPkiSyncDestinationSection
} from "./PkiSyncDestinationSection/index";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-sm font-medium text-mineshaft-300">{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

type Props = {
  pkiSync: TPkiSync;
  onEditDestination: VoidFunction;
};

export const PkiSyncDestinationSection = ({ pkiSync, onEditDestination }: Props) => {
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
    case PkiSync.NutanixPrismCentral:
      DestinationComponents = <NutanixPrismCentralPkiSyncDestinationSection pkiSync={pkiSync} />;
      break;
    default:
      // For future destinations, return null (no additional fields to show)
      DestinationComponents = null;
  }

  const { canEdit } = usePkiSyncPermissions(pkiSync);

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Destination Configuration</h3>
        <IconButton
          variant="plain"
          colorSchema="secondary"
          isDisabled={!canEdit}
          ariaLabel="Edit destination"
          onClick={onEditDestination}
        >
          <FontAwesomeIcon icon={faEdit} />
        </IconButton>
      </div>
      <div className="flex w-full flex-wrap gap-8 pt-2">
        <GenericFieldLabel label={`${destinationDetails.name} Connection`}>
          {pkiSync.appConnectionName || "Default Connection"}
        </GenericFieldLabel>
        {DestinationComponents}
      </div>
    </div>
  );
};
