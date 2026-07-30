import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";
import { TLinuxServerPkiSync } from "@app/hooks/api/pkiSyncs/types/linux-server-sync";

type Props = {
  pkiSync: TLinuxServerPkiSync;
};

export const LinuxServerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const exportFormat = pkiSync.syncOptions.exportFormat ?? PkiSyncExportFormat.Pem;

  return (
    <>
      <Detail>
        <DetailLabel>Destination Directory</DetailLabel>
        <DetailValue>{pkiSync.destinationConfig.destinationPath}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Export Format</DetailLabel>
        <DetailValue>
          {exportFormat === PkiSyncExportFormat.Pkcs12 ? "PKCS#12 (.pfx)" : "PEM"}
        </DetailValue>
      </Detail>
    </>
  );
};
