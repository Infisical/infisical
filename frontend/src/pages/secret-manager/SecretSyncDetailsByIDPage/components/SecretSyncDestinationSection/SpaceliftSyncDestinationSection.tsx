import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import {
  SpaceliftConfigType,
  SpaceliftFileMountFormat,
  TSpaceliftSync
} from "@app/hooks/api/secretSyncs/types/spacelift-sync";

type Props = {
  secretSync: TSpaceliftSync;
};

export const SpaceliftSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { contextId, contextName, configType, mountPath, fileMountFormat }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Context</DetailLabel>
        <DetailValue>{contextName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Context ID</DetailLabel>
        <DetailValue>{contextId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Config Type</DetailLabel>
        <DetailValue>
          {configType === SpaceliftConfigType.FileMount ? "File Mount" : "Environment Variables"}
        </DetailValue>
      </Detail>
      {configType === SpaceliftConfigType.FileMount && (
        <Detail>
          <DetailLabel>File Format</DetailLabel>
          <DetailValue>
            {fileMountFormat === SpaceliftFileMountFormat.SecretPerFile
              ? "One Secret Per File"
              : ".env File"}
          </DetailValue>
        </Detail>
      )}
      {configType === SpaceliftConfigType.FileMount && mountPath && (
        <Detail>
          <DetailLabel>
            {fileMountFormat === SpaceliftFileMountFormat.SecretPerFile
              ? "Directory Path"
              : "File Path"}
          </DetailLabel>
          <DetailValue>{mountPath}</DetailValue>
        </Detail>
      )}
    </>
  );
};
