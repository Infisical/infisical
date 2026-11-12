import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import {
  AwsSecretsManagerSyncMappingBehavior,
  TAwsSecretsManagerSync
} from "@app/hooks/api/secretSyncs/types/aws-secrets-manager-sync";

type Props = {
  secretSync: TAwsSecretsManagerSync;
};

export const AwsSecretsManagerSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig,
    includeAllSubFolders,
    syncOptions: { preserveFolderStructure }
  } = secretSync;

  const awsRegion = AWS_REGIONS.find((r) => r.slug === destinationConfig.region);

  return (
    <>
      <Detail>
        <DetailLabel>Region</DetailLabel>
        <DetailValue>
          {awsRegion?.name}
          <Badge className="ml-1" variant="neutral">
            {awsRegion?.slug}
          </Badge>
        </DetailValue>
      </Detail>
      <Detail className="capitalize">
        <DetailLabel>Mapping Behavior</DetailLabel>
        <DetailValue>{destinationConfig.mappingBehavior}</DetailValue>
      </Detail>
      {destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.ManyToOne && (
        <Detail>
          <DetailLabel>Secret Name</DetailLabel>
          <DetailValue>{destinationConfig.secretName}</DetailValue>
        </Detail>
      )}
      {includeAllSubFolders &&
        destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne && (
          <Detail>
            <DetailLabel>Mirror Folder Structure</DetailLabel>
            <DetailValue>
              <Badge variant={preserveFolderStructure ? "success" : "neutral"}>
                {preserveFolderStructure ? "Enabled" : "Disabled"}
              </Badge>
            </DetailValue>
          </Detail>
        )}
    </>
  );
};
