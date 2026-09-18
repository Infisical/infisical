import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TBitbucketSync } from "@app/hooks/api/secretSyncs/types/bitbucket-sync";

type Props = {
  secretSync: TBitbucketSync;
};

export const BitbucketSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { workspaceSlug, repositorySlug, environmentId }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Workspace</DetailLabel>
        <DetailValue>{workspaceSlug}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Repository</DetailLabel>
        <DetailValue>{repositorySlug}</DetailValue>
      </Detail>
      {environmentId && (
        <Detail>
          <DetailLabel>Deployment Environment</DetailLabel>
          <DetailValue>{environmentId}</DetailValue>
        </Detail>
      )}
    </>
  );
};
