import { PkiSync, TPkiSync, TPkiSyncRemovalOptions } from "@app/hooks/api/pkiSyncs";

import { PaloAltoNetworksRemovalOptionsFields } from "./PaloAltoNetworksRemovalOptionsFields";

type Props = {
  pkiSync: TPkiSync;
  value: TPkiSyncRemovalOptions;
  onChange: (value: TPkiSyncRemovalOptions) => void;
};

export const hasPkiSyncRemovalOptions = (destination: PkiSync) =>
  destination === PkiSync.PaloAltoNetworksSslTlsProfile;

export const arePkiSyncRemovalOptionsComplete = (
  destination: PkiSync,
  { remainingCertificateCount }: { remainingCertificateCount: number },
  value: TPkiSyncRemovalOptions
) => {
  switch (destination) {
    case PkiSync.PaloAltoNetworksSslTlsProfile:
      return remainingCertificateCount > 0 || Boolean(value.replacementCertificateName);
    default:
      return true;
  }
};

export const PkiSyncRemovalOptionsFields = ({ pkiSync, value, onChange }: Props) => {
  switch (pkiSync.destination) {
    case PkiSync.PaloAltoNetworksSslTlsProfile:
      return (
        <PaloAltoNetworksRemovalOptionsFields
          syncId={pkiSync.id}
          connectionId={pkiSync.connection.id}
          destinationConfig={pkiSync.destinationConfig}
          value={value}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
};
