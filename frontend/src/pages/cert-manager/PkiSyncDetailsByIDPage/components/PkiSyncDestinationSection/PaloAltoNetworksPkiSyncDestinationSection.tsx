import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { getPaloAltoNetworksProfileLabel } from "@app/helpers/pkiSyncs";
import { PkiSync } from "@app/hooks/api/pkiSyncs";
import {
  TPaloAltoNetworksPkiSync,
  TPaloAltoNetworksSslTlsProfilePkiSync
} from "@app/hooks/api/pkiSyncs/types/palo-alto-networks-sync";

type Props = {
  pkiSync: TPaloAltoNetworksPkiSync | TPaloAltoNetworksSslTlsProfilePkiSync;
};

export const PaloAltoNetworksPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const { template, pushToDevices } = pkiSync.destinationConfig;
  const { sslTlsServiceProfileName, sslTlsServiceProfileVsys } =
    pkiSync.destination === PkiSync.PaloAltoNetworksSslTlsProfile ? pkiSync.destinationConfig : {};

  return (
    <>
      {template && (
        <>
          <Detail>
            <DetailLabel>Template</DetailLabel>
            <DetailValue>{template}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Push to Devices</DetailLabel>
            <DetailValue>{pushToDevices ? "Enabled" : "Disabled"}</DetailValue>
          </Detail>
        </>
      )}
      {sslTlsServiceProfileName && (
        <Detail>
          <DetailLabel>SSL/TLS Service Profile</DetailLabel>
          <DetailValue>
            {getPaloAltoNetworksProfileLabel({
              name: sslTlsServiceProfileName,
              vsys: sslTlsServiceProfileVsys
            })}
          </DetailValue>
        </Detail>
      )}
    </>
  );
};
