import { Badge, Detail, DetailGroupHeader, DetailLabel, DetailValue } from "@app/components/v3";
import { PkiSync, TPkiSync } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
};

export const PkiSyncFieldMappingsSection = ({ pkiSync }: Props) => {
  const fieldMappings = pkiSync.syncOptions?.fieldMappings;

  if (pkiSync.destination !== PkiSync.Chef && pkiSync.destination !== PkiSync.AwsSecretsManager) {
    return null;
  }

  return (
    <>
      <DetailGroupHeader>Field Mappings</DetailGroupHeader>
      <Detail>
        <DetailLabel>Certificate Field</DetailLabel>
        <DetailValue>
          <Badge variant="neutral" className="max-w-full truncate">
            {fieldMappings?.certificate || "certificate"}
          </Badge>
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Private Key Field</DetailLabel>
        <DetailValue>
          <Badge variant="neutral" className="max-w-full truncate">
            {fieldMappings?.privateKey || "private_key"}
          </Badge>
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Certificate Chain Field</DetailLabel>
        <DetailValue>
          <Badge variant="neutral" className="max-w-full truncate">
            {fieldMappings?.certificateChain || "certificate_chain"}
          </Badge>
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>CA Certificate Field</DetailLabel>
        <DetailValue>
          <Badge variant="neutral" className="max-w-full truncate">
            {fieldMappings?.caCertificate || "ca_certificate"}
          </Badge>
        </DetailValue>
      </Detail>
    </>
  );
};
