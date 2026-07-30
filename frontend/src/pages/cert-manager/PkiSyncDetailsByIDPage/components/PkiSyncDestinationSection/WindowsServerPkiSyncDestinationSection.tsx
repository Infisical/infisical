import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";
import { TWindowsServerPkiSync } from "@app/hooks/api/pkiSyncs/types/windows-server-sync";

type Props = {
  pkiSync: TWindowsServerPkiSync;
};

export const WindowsServerPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  const exportFormat = pkiSync.syncOptions.exportFormat ?? PkiSyncExportFormat.Pkcs12;

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
