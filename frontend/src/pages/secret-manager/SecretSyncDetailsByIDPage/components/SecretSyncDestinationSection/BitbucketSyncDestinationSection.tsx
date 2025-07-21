import { GenericFieldLabel } from "@app/components/secret-syncs";
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
      <GenericFieldLabel label="Workspace">{workspaceSlug}</GenericFieldLabel>
      <GenericFieldLabel label="Repository">{repositorySlug}</GenericFieldLabel>
      {environmentId && (
        <GenericFieldLabel label="Deployment Environment">{environmentId}</GenericFieldLabel>
      )}
    </>
  );
};
